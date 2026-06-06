"""Scorers turn raw pipeline results into metrics.

- retrieval.py and format.py are deterministic and free (no LLM) -> safe to gate CI.
- faithfulness (LLM judge) is intentionally left as a separate, opt-in tier.
"""
