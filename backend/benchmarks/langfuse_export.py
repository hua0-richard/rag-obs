"""Optional Langfuse Cloud export for benchmark runs (opt-in).

Mirrors the ``--faithfulness`` tier: ``langfuse`` is a benchmark-only dependency
(``requirements-bench.txt``), never in the prod image, and nothing here runs
unless ``--langfuse`` is passed to ``runner.py`` / ``report.py``.

The work is split to preserve the harness's raw-then-score separation:

  runner.py --langfuse   emits one trace per case (a ``retrieval`` span + a
                         ``flashcards`` generation) and records its trace id in
                         ``raw.jsonl`` as ``langfuse_trace_id``.
  report.py --langfuse   attaches the computed scores to those traces *by id*,
                         so paid LLM output can be re-scored without re-tracing.

Config (Langfuse Cloud): set ``LANGFUSE_PUBLIC_KEY`` and ``LANGFUSE_SECRET_KEY``
(from your project settings); ``LANGFUSE_HOST`` is optional and defaults to
https://cloud.langfuse.com.
"""

from __future__ import annotations

import contextlib
import os
import subprocess
from typing import Any


def git_sha() -> str:
    """Short HEAD sha, tagged onto traces so they line up with commits."""
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:  # noqa: BLE001 - sha is best-effort metadata
        return "unknown"


def get_client():
    """Return a configured Langfuse client, or exit with a clear message."""
    try:
        from langfuse import Langfuse
    except ImportError as exc:
        raise SystemExit(
            "langfuse not installed. Run: "
            "pip install -r benchmarks/requirements-bench.txt"
        ) from exc
    if not (os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY")):
        raise SystemExit(
            "Langfuse keys missing. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY "
            "(from your Langfuse Cloud project settings)."
        )
    host = (
        os.getenv("LANGFUSE_HOST")
        or os.getenv("LANGFUSE_BASE_URL")
        or "https://cloud.langfuse.com"
    )
    client = Langfuse(host=host)
    # Verify the keys actually work *now*, so a wrong host/region or stale key
    # fails fast here instead of as a cryptic 401 batch-export error after the
    # whole (paid) run. The usual culprit is a region mismatch: US-region keys
    # against the EU default host (or vice-versa).
    if not client.auth_check():
        raise SystemExit(
            f"Langfuse auth failed for host {host}. Check that LANGFUSE_PUBLIC_KEY "
            f"/ LANGFUSE_SECRET_KEY match this host's region (EU: cloud.langfuse.com, "
            f"US: us.cloud.langfuse.com) and aren't swapped or stale."
        )
    return client


@contextlib.contextmanager
def trace_case(client, *, case: dict[str, Any], profile: str, sha: str):
    """Wrap one case in trace-level attributes + a root span.

    Trace name/tags/metadata are set via ``propagate_attributes`` (its metadata
    values must be strings); the root ``case:`` span wraps the real
    ``generate_flashcards`` call so the trace gets an accurate end-to-end
    latency. ``annotate_case`` then fills in IO + child observations.
    """
    from langfuse import propagate_attributes

    case_id = case.get("id", case["prompt"][:30])
    meta = {
        k: str(v)
        for k, v in {
            "profile": profile,
            "git_sha": sha,
            "case_id": case.get("id"),
            "k": case.get("k"),
        }.items()
        if v is not None
    }
    with propagate_attributes(
        trace_name=f"bench:{case_id}",
        tags=["benchmark", f"profile:{profile}", f"sha:{sha}"],
        metadata=meta,
    ):
        with client.start_as_current_observation(as_type="span", name=f"case:{case_id}"):
            yield


def annotate_case(client, *, case: dict[str, Any], record: dict[str, Any]) -> str | None:
    """Add retrieval/generation observations + IO; return the trace id.

    Must be called inside ``trace_case`` while the root span is active. The
    child observations carry IO for UI drill-down (their durations aren't
    meaningful — they're built from the finished result, not timed); the root
    span already holds the real latency.
    """
    prompt = case["prompt"]
    sources = record.get("sources") or []
    flashcards = record.get("flashcards")
    model = record.get("model_used")

    with client.start_as_current_observation(
        as_type="span", name="retrieval", input=prompt, output=sources
    ):
        pass
    with client.start_as_current_observation(
        as_type="generation", name="flashcards", model=model, input=prompt, output=flashcards
    ):
        pass

    # Trace-level IO (for the run overview) + root-span detail (latency/error).
    client.set_current_trace_io(input=prompt, output=flashcards)
    client.update_current_span(
        metadata={
            "latency_s": record.get("latency_s"),
            "error": record.get("error"),
            "model_used": model,
        }
    )
    return client.get_current_trace_id()


def push_scores(
    client, trace_id: str, scores: dict[str, float], comment: str | None = None
) -> None:
    """Attach numeric scores to an existing trace by id (skips None values)."""
    for name, value in scores.items():
        if value is None:
            continue
        client.create_score(
            name=name,
            value=float(value),
            trace_id=trace_id,
            data_type="NUMERIC",
            comment=comment,
        )
