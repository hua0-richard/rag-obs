"""Deterministic retrieval metrics (no LLM).

Scores ``result.sources`` (the chunks fed to the LLM) against the case's
``relevant_files`` labels. File-level by default — coarse but cheap to author and
enough to compare retrieval knobs (hybrid weights, k, embedding profile).
"""

from __future__ import annotations


def _retrieved_filenames(record: dict) -> list[str]:
    """Filenames in retrieval order, de-duplicated (first occurrence wins)."""
    seen: set[str] = set()
    ordered: list[str] = []
    for src in record.get("sources") or []:
        name = src.get("filename")
        if isinstance(name, str) and name not in seen:
            seen.add(name)
            ordered.append(name)
    return ordered


def score(record: dict) -> dict | None:
    """Return per-case retrieval metrics, or None if the case has no labels."""
    relevant = set(record["case"].get("relevant_files") or [])
    if not relevant:
        return None  # unlabeled case — skip retrieval scoring

    retrieved = _retrieved_filenames(record)
    retrieved_set = set(retrieved)
    hits = relevant & retrieved_set

    # Reciprocal rank of the first relevant filename.
    mrr = 0.0
    for rank, name in enumerate(retrieved, 1):
        if name in relevant:
            mrr = 1.0 / rank
            break

    return {
        "hit": bool(hits),
        "recall": len(hits) / len(relevant),
        "precision": len(hits) / len(retrieved) if retrieved else 0.0,
        "mrr": mrr,
    }
