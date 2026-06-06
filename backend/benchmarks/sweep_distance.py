"""Pick FLASHCARD_MAX_RETRIEVAL_DISTANCE without paying for generation.

The relevance floor (services.flashcards_service.FLASHCARD_MAX_RETRIEVAL_DISTANCE)
drops retrieved chunks whose cosine distance (pgvector `<=>`) to the query is too
large. This script measures those distances directly — for each labeled case it
embeds the prompt and computes the distance to every chunk in the eval session,
split by whether the chunk's file is in the case's ``relevant_files`` — so you can
choose a cutoff that keeps the relevant chunks and drops the rest. It does NOT
call the LLM, so it's cheap to run repeatedly.

What to look for:
  - ``rel_kept``  : relevant chunks surviving — want this to stay high.
  - ``off_kept``  : off-topic chunks surviving — want this low.
  - ``ooc_kept``  : chunks surviving for the out-of-corpus case — want 0 so it
                    returns no cards.
A good threshold is the smallest one that keeps rel_kept high while pushing
off_kept and ooc_kept down.

Usage (from backend/, with DATABASE_URL pointing at the seeded eval DB):
  python -m benchmarks.sweep_distance --profile prod
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from benchmarks.config import EVAL_SESSION_ID, apply_profile

DATASET = Path(__file__).parent / "dataset.jsonl"
THRESHOLDS = [0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.90, 1.00]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default="prod")
    args = parser.parse_args()
    apply_profile(args.profile)

    # Imported after apply_profile so backend constants pick up the profile env.
    from sqlalchemy import text as sql_text

    from db.models import Sessions
    from db.session import SessionLocal
    from services.embedding_service import embed_query_sync
    from services.flashcards_service import (
        DEFAULT_EMBEDDING_PROFILE,
        effective_profile,
        get_embedding_table,
        normalize_embedding_profile,
    )

    db = SessionLocal()
    session = db.get(Sessions, EVAL_SESSION_ID)
    if session is None:
        raise SystemExit("Eval session not found — run `benchmarks.seed` first.")
    profile = normalize_embedding_profile(session.embedding_profile)
    table = get_embedding_table(effective_profile(profile or DEFAULT_EMBEDDING_PROFILE))

    cases = [
        json.loads(line)
        for line in DATASET.read_text().splitlines()
        if line.strip() and not line.startswith("#")
    ]

    # Per-case distance lists: relevant-file chunks vs everything else.
    per_case: list[tuple[str, bool, list[float], list[float]]] = []
    for case in cases:
        prompt = case.get("prompt")
        if not prompt:
            continue
        relevant = set(case.get("relevant_files") or [])
        qvec = embed_query_sync(prompt, profile=profile)
        rows = db.execute(
            sql_text(
                "SELECT filename, (embedding <=> (:qvec)::vector) AS distance "
                f"FROM {table} WHERE session_id = :sid"
            ),
            {"qvec": qvec.tolist(), "sid": EVAL_SESSION_ID},
        ).fetchall()
        rel = sorted(float(r.distance) for r in rows if r.filename in relevant)
        off = sorted(float(r.distance) for r in rows if r.filename not in relevant)
        per_case.append((case.get("id", prompt[:20]), bool(relevant), rel, off))

    db.close()

    # Per-case nearest distances — shows the gap between relevant and off-topic.
    print("nearest distances per case (lower = more similar):")
    print(f"  {'case':28} {'rel_min':>7} {'rel_med':>7} {'off_min':>7}")
    for cid, has_rel, rel, off in per_case:
        rel_min = f"{rel[0]:.3f}" if rel else "—"
        rel_med = f"{rel[len(rel) // 2]:.3f}" if rel else "—"
        off_min = f"{off[0]:.3f}" if off else "—"
        tag = "" if has_rel else "  (out-of-corpus)"
        print(f"  {cid:28} {rel_min:>7} {rel_med:>7} {off_min:>7}{tag}")

    # Threshold sweep, aggregated across labeled cases.
    labeled = [c for c in per_case if c[1]]
    ooc = [c for c in per_case if not c[1]]
    print("\nthreshold sweep (summed over cases):")
    print(f"  {'thresh':>6} {'rel_kept':>9} {'off_kept':>9} {'ooc_kept':>9}")
    for t in THRESHOLDS:
        rel_kept = sum(sum(1 for d in rel if d <= t) for _, _, rel, _ in labeled)
        off_kept = sum(sum(1 for d in off if d <= t) for _, _, _, off in labeled)
        ooc_kept = sum(
            sum(1 for d in rel + off if d <= t) for _, _, rel, off in ooc
        )
        print(f"  {t:>6.2f} {rel_kept:>9} {off_kept:>9} {ooc_kept:>9}")

    print(
        "\nPick the smallest threshold that keeps rel_kept high while off_kept and "
        "ooc_kept drop, then set FLASHCARD_MAX_RETRIEVAL_DISTANCE and run the "
        "benchmark to confirm."
    )


if __name__ == "__main__":
    main()
