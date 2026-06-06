"""LLM-judge faithfulness scorer (RAGAS) — opt-in, paid, non-deterministic.

Unlike the deterministic scorers (retrieval/format), this calls a hosted LLM to
judge whether each flashcard's answer is *grounded* in the retrieved context, so
it costs money and has run-to-run variance. It is therefore:

  - never CI-gated (report.py adds it to summary.json but not to THRESHOLDS),
  - only run for the ``prod`` profile (real prod retrieval + generation),
  - guarded behind ``report.py --faithfulness`` so normal runs stay free.

RAGAS faithfulness decomposes an answer into atomic claims and checks each claim
against the contexts; score = supported_claims / total_claims in [0, 1]. Each
flashcard is scored as its own sample (so we can see *which* card hallucinated),
then averaged per case.

Requires the optional benchmark deps (``ragas``, ``langchain-openai``):
    pip install -r benchmarks/requirements-bench.txt

The judge runs through OpenRouter, reusing ``OPENROUTER_API_KEY``. Pick the model
with ``RAGAS_JUDGE_MODEL`` (default ``openai/gpt-4o``).
"""

from __future__ import annotations

import os

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_JUDGE_MODEL = "openai/gpt-4o"


def _judge_llm():
    """Build a RAGAS LLM wrapper pointed at OpenRouter. Imports are lazy so the
    base harness doesn't need the optional deps installed."""
    try:
        from langchain_openai import ChatOpenAI
        from ragas.llms import LangchainLLMWrapper
    except ImportError as exc:  # pragma: no cover - surfaced to the operator
        raise SystemExit(
            "Faithfulness scoring needs the optional benchmark deps. Install them:\n"
            "  pip install -r benchmarks/requirements-bench.txt"
        ) from exc

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise SystemExit("OPENROUTER_API_KEY is not set; required for the RAGAS judge.")

    chat = ChatOpenAI(
        model=os.getenv("RAGAS_JUDGE_MODEL", DEFAULT_JUDGE_MODEL),
        base_url=OPENROUTER_BASE_URL,
        api_key=api_key,
        temperature=0,
    )
    return LangchainLLMWrapper(chat)


def score(record: dict, llm=None) -> dict | None:
    """Mean faithfulness over a case's flashcards, or None if not scorable.

    Pass a shared ``llm`` (from :func:`_judge_llm`) when scoring many records to
    avoid rebuilding the client each call.
    """
    from ragas.dataset_schema import EvaluationDataset, SingleTurnSample
    from ragas.metrics import Faithfulness

    case = record.get("case") or {}
    relevant = case.get("relevant_files")
    if case.get("expect_no_cards") or (
        isinstance(relevant, list) and len(relevant) == 0
    ):
        # Out-of-corpus case: there's no correct grounded answer, so faithfulness
        # is meaningless here — refusal is scored by format.py instead.
        return None

    cards = record.get("flashcards")
    contexts = [
        s["content"]
        for s in (record.get("sources") or [])
        if isinstance(s.get("content"), str) and s["content"].strip()
    ]
    if record.get("error") or not cards or not contexts:
        # No context text means the run wasn't produced with include_context=True
        # (or retrieval returned nothing) — nothing to judge against.
        return None

    # Skip fenced-code answers: RAGAS faithfulness decomposes an answer into
    # natural-language claims and checks each against the context. A code block
    # has no NL claims to extract, so it scores ~0 regardless of grounding and
    # just drags the mean down. Code cards are validated by format.py instead.
    answers = [
        c.get("answer", "")
        for c in cards
        if c.get("answer", "").strip() and "```" not in c.get("answer", "")
    ]
    if not answers:
        return None

    if llm is None:
        llm = _judge_llm()
    metric = Faithfulness(llm=llm)

    dataset = EvaluationDataset(
        samples=[
            SingleTurnSample(
                user_input=record["case"].get("prompt", ""),
                response=answer,
                retrieved_contexts=contexts,
            )
            for answer in answers
        ]
    )

    from ragas import evaluate

    result = evaluate(dataset=dataset, metrics=[metric], llm=llm, show_progress=False)
    per_card = [float(v) for v in result.to_pandas()["faithfulness"].tolist()]
    # RAGAS emits NaN when it can't extract claims; drop those from the mean.
    valid = [v for v in per_card if v == v]
    return {
        "faithfulness_mean": (sum(valid) / len(valid)) if valid else 0.0,
        "per_card": per_card,
        "judge_model": os.getenv("RAGAS_JUDGE_MODEL", DEFAULT_JUDGE_MODEL),
    }
