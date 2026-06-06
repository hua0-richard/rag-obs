"""Aggregate the latest run's raw results into a scorecard.

Runs the deterministic scorers, prints a per-case + summary table, writes
summary.json next to raw.jsonl, and exits non-zero if a gated metric falls below
its threshold (so CI can fail the build on regressions).

Usage (from backend/):
  python -m benchmarks.report                 # latest run
  python -m benchmarks.report --run <dir>     # a specific run dir
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

from benchmarks.scorers import format as format_scorer
from benchmarks.scorers import retrieval as retrieval_scorer

RESULTS_DIR = Path(__file__).parent / "results"

# CI gate thresholds for the free, deterministic metrics. Tune to your baseline.
THRESHOLDS = {
    "hit_rate": 0.80,
    "format_pass_rate": 0.90,
}


def _latest_run() -> Path:
    runs = sorted(p for p in RESULTS_DIR.glob("*") if (p / "raw.jsonl").exists())
    if not runs:
        raise SystemExit("No runs found. Run the runner first.")
    return runs[-1]


def _mean(values: list[float]) -> float:
    return statistics.fmean(values) if values else 0.0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, default=None)
    parser.add_argument("--no-gate", action="store_true", help="don't exit non-zero")
    args = parser.parse_args()

    run_dir = args.run or _latest_run()
    records = [
        json.loads(line)
        for line in (run_dir / "raw.jsonl").read_text().splitlines()
        if line.strip()
    ]

    rows = []
    recalls, mrrs, hits, format_pass, latencies = [], [], [], [], []
    for rec in records:
        ret = retrieval_scorer.score(rec)
        fmt = format_scorer.score(rec)
        case_id = rec["case"].get("id", rec["case"]["prompt"][:30])

        if ret is not None:
            recalls.append(ret["recall"])
            mrrs.append(ret["mrr"])
            hits.append(1.0 if ret["hit"] else 0.0)
        format_pass.append(1.0 if fmt["passed"] else 0.0)
        if rec.get("error") is None:
            latencies.append(rec["latency_s"])

        rows.append(
            {
                "id": case_id,
                "hit": "—" if ret is None else ("Y" if ret["hit"] else "n"),
                "recall": "—" if ret is None else f"{ret['recall']:.2f}",
                "mrr": "—" if ret is None else f"{ret['mrr']:.2f}",
                "format": "PASS" if fmt["passed"] else "FAIL",
                "lat_s": f"{rec['latency_s']:.1f}",
                "err": "ERR" if rec.get("error") else "",
            }
        )

    # Per-case table.
    cols = ["id", "hit", "recall", "mrr", "format", "lat_s", "err"]
    widths = {c: max(len(c), *(len(str(r[c])) for r in rows)) for c in cols}
    header = "  ".join(c.ljust(widths[c]) for c in cols)
    print(header)
    print("-" * len(header))
    for r in rows:
        print("  ".join(str(r[c]).ljust(widths[c]) for c in cols))

    summary = {
        "n_cases": len(records),
        "hit_rate": _mean(hits),
        "recall_at_k": _mean(recalls),
        "mrr": _mean(mrrs),
        "format_pass_rate": _mean(format_pass),
        "errors": sum(1 for r in records if r.get("error")),
        "latency_p50": statistics.median(latencies) if latencies else 0.0,
        "latency_p95": (
            sorted(latencies)[max(0, int(len(latencies) * 0.95) - 1)]
            if latencies else 0.0
        ),
    }
    print("\nSummary:")
    for key, value in summary.items():
        print(f"  {key:18} {value:.3f}" if isinstance(value, float) else f"  {key:18} {value}")

    (run_dir / "summary.json").write_text(json.dumps(summary, indent=2))

    # CI gate.
    failures = [
        f"{metric}={summary[metric]:.3f} < {threshold}"
        for metric, threshold in THRESHOLDS.items()
        if summary[metric] < threshold
    ]
    if failures and not args.no_gate:
        print("\nGATE FAILED:")
        for f in failures:
            print(f"  - {f}")
        raise SystemExit(1)
    print("\nGate passed." if not failures else "\n(gate failures ignored)")


if __name__ == "__main__":
    main()
