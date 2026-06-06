"""Deterministic format / prompt-contract checks (no LLM).

Asserts the promises FLASHCARD_PROMPT makes. Each check returns True/False; the
case "passes" only if every applicable check passes. These are free and stable,
so they're safe to gate CI on.
"""

from __future__ import annotations

import re

WORD_LIMIT = 50  # prompt: "Keep non-code answers under 50 words."
_LATEX_BAD = re.compile(r"\\\(|\\\)|\\\[|\\\]")


def _has_code(answer: str) -> bool:
    return "```" in answer


def _is_parse_fallback(cards: list[dict] | None) -> bool:
    """True when generation fell back to the single 'Generated Output' card."""
    return bool(
        cards
        and len(cards) == 1
        and cards[0].get("question") == "Generated Output"
    )


def _expects_no_cards(case: dict) -> bool:
    """Negative case: the right behaviour is to refuse (produce no cards)."""
    relevant = case.get("relevant_files")
    return bool(case.get("expect_no_cards")) or (
        isinstance(relevant, list) and len(relevant) == 0
    )


def score(record: dict) -> dict:
    case = record["case"]
    cards = record.get("flashcards")
    sources = record.get("sources") or []
    valid_tags = {s.get("tag") for s in sources}

    checks: dict[str, bool] = {}

    # Out-of-corpus query: passing means refusing (no cards), not hallucinating
    # off-topic ones. This requires the retrieval relevance floor to be enabled
    # (FLASHCARD_MAX_RETRIEVAL_DISTANCE); with it off, the model invents cards and
    # this correctly fails.
    if _expects_no_cards(case):
        checks["refused"] = not cards and record.get("error") is None
        return {"checks": checks, "passed": all(checks.values())}

    # Generation produced parseable cards (didn't error, didn't hit the fallback).
    checks["produced_cards"] = bool(cards) and record.get("error") is None
    checks["not_parse_fallback"] = not _is_parse_fallback(cards)

    if cards:
        # Every source_tag (when present) points at a real context entry.
        checks["valid_source_tags"] = all(
            card.get("source_tag") is None or card.get("source_tag") in valid_tags
            for card in cards
        )
        # Non-code answers stay under the word limit.
        checks["word_limit"] = all(
            _has_code(card.get("answer", ""))
            or len(card.get("answer", "").split()) <= WORD_LIMIT
            for card in cards
        )
        # No raw LaTeX delimiters leaked (prompt requires $...$ / $$...$$).
        checks["latex_format"] = not any(
            _LATEX_BAD.search(card.get("question", "") + card.get("answer", ""))
            for card in cards
        )
        # At least one code card when the case expects one.
        if case.get("expect_code_card"):
            checks["has_code_card"] = any(_has_code(c.get("answer", "")) for c in cards)

    return {
        "checks": checks,
        "passed": all(checks.values()),
    }
