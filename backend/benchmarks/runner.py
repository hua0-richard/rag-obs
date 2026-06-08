"""Run dataset cases through the real flashcard pipeline and dump raw results.

Calls ``generate_flashcards`` directly (with persist=False) so it exercises the
real hybrid retrieval + generation path while writing nothing to the DB. Raw
results are written before scoring so the (paid) LLM output can be re-scored
without re-running generation.

Usage (from backend/):  python -m benchmarks.runner --profile dev
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from benchmarks import langfuse_export
from benchmarks.config import EVAL_SESSION_ID, apply_model, apply_profile, effective_model

DATASET = Path(__file__).parent / "dataset.jsonl"
RESULTS_DIR = Path(__file__).parent / "results"


def load_cases() -> list[dict]:
    if not DATASET.exists():
        raise SystemExit(f"Dataset not found: {DATASET}")
    cases = []
    for line in DATASET.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            cases.append(json.loads(line))
    if not cases:
        raise SystemExit("Dataset is empty.")
    return cases


async def run_case(case: dict, *, lf=None, profile: str | None = None, sha: str | None = None) -> dict:
    # Imported lazily so apply_profile() has already set the backends.
    from db.session import SessionLocal
    from services.flashcards_service import generate_flashcards

    db = SessionLocal()
    t0 = time.perf_counter()
    error = None
    result = None
    # Wrap the real call in a trace span (when --langfuse) so latency is accurate;
    # otherwise a nullcontext keeps the path identical.
    root_cm = (
        langfuse_export.trace_case(lf, case=case, profile=profile or "unknown", sha=sha or "unknown")
        if lf is not None
        else contextlib.nullcontext()
    )
    with root_cm:
        try:
            result = await generate_flashcards(
                prompt=case["prompt"],
                k=case.get("k"),
                session_id=EVAL_SESSION_ID,
                file_ids=case.get("file_ids"),
                replace=False,
                flashcard_amount=case.get("flashcard_amount"),
                db=db,
                persist=False,
                include_context=True,  # surface chunk text for LLM-judge scorers (RAGAS)
            )
        except Exception as exc:  # noqa: BLE001 - record any failure as a result
            error = f"{type(exc).__name__}: {exc}"
        finally:
            db.close()
        latency_s = time.perf_counter() - t0

        record = {
            "case": case,
            "latency_s": latency_s,
            "error": error,
            # Keep only what the scorers need from the (large) result.
            "flashcards": (result or {}).get("flashcards"),
            "sources": (result or {}).get("sources"),
            "raw": (result or {}).get("raw"),
            "model_used": (result or {}).get("model_used"),
        }

        if lf is not None:
            record["langfuse_trace_id"] = langfuse_export.annotate_case(
                lf, case=case, record=record
            )

    return record


async def main_async(profile: str, *, lf=None, model: str | None = None) -> Path:
    cases = load_cases()
    sha = langfuse_export.git_sha() if lf is not None else None
    run_dir = RESULTS_DIR / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir.mkdir(parents=True, exist_ok=True)
    raw_path = run_dir / "raw.jsonl"

    with raw_path.open("w") as fh:
        for i, case in enumerate(cases, 1):
            print(f"[{i}/{len(cases)}] {case.get('id', case['prompt'][:40])}")
            record = await run_case(case, lf=lf, profile=profile, sha=sha)
            fh.write(json.dumps(record) + "\n")
            fh.flush()
            if record["error"]:
                print(f"    ! {record['error']}")

    (run_dir / "meta.json").write_text(
        json.dumps(
            {
                "profile": profile,
                "n_cases": len(cases),
                **({"model": model} if model else {}),
                **({"git_sha": sha} if sha else {}),
            },
            indent=2,
        )
    )
    if lf is not None:
        lf.flush()  # block until queued traces are sent before the process exits
        print("Langfuse traces flushed.")
    print(f"\nRaw results: {raw_path}")
    return run_dir


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default="dev")
    parser.add_argument(
        "--model",
        default=None,
        help=(
            "override the generation model for this profile's backend "
            "(OpenRouter slug for dev-prodllm/prod, e.g. qwen/qwen3-32b; "
            "Ollama tag for dev). Recorded in meta.json so scorecards are comparable."
        ),
    )
    parser.add_argument(
        "--langfuse",
        action="store_true",
        help="export one trace per case to Langfuse Cloud (opt-in); needs LANGFUSE_* env",
    )
    args = parser.parse_args()
    apply_profile(args.profile)
    if args.model:
        apply_model(args.model, args.profile)
    model = effective_model(args.profile)
    lf = langfuse_export.get_client() if args.langfuse else None
    asyncio.run(main_async(args.profile, lf=lf, model=model))


if __name__ == "__main__":
    main()
