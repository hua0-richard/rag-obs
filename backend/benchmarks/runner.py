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
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from benchmarks.config import EVAL_SESSION_ID, apply_profile

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


async def run_case(case: dict) -> dict:
    # Imported lazily so apply_profile() has already set the backends.
    from db.session import SessionLocal
    from services.flashcards_service import generate_flashcards

    db = SessionLocal()
    t0 = time.perf_counter()
    error = None
    result = None
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
        )
    except Exception as exc:  # noqa: BLE001 - record any failure as a result
        error = f"{type(exc).__name__}: {exc}"
    finally:
        db.close()
    latency_s = time.perf_counter() - t0

    return {
        "case": case,
        "latency_s": latency_s,
        "error": error,
        # Keep only what the scorers need from the (large) result.
        "flashcards": (result or {}).get("flashcards"),
        "sources": (result or {}).get("sources"),
        "raw": (result or {}).get("raw"),
        "model_used": (result or {}).get("model_used"),
    }


async def main_async(profile: str) -> Path:
    cases = load_cases()
    run_dir = RESULTS_DIR / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir.mkdir(parents=True, exist_ok=True)
    raw_path = run_dir / "raw.jsonl"

    with raw_path.open("w") as fh:
        for i, case in enumerate(cases, 1):
            print(f"[{i}/{len(cases)}] {case.get('id', case['prompt'][:40])}")
            record = await run_case(case)
            fh.write(json.dumps(record) + "\n")
            fh.flush()
            if record["error"]:
                print(f"    ! {record['error']}")

    (run_dir / "meta.json").write_text(
        json.dumps({"profile": profile, "n_cases": len(cases)}, indent=2)
    )
    print(f"\nRaw results: {raw_path}")
    return run_dir


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default="dev")
    args = parser.parse_args()
    apply_profile(args.profile)
    asyncio.run(main_async(args.profile))


if __name__ == "__main__":
    main()
