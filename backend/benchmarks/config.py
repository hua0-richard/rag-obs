"""Environment profiles for benchmark runs.

A "profile" is just a set of env vars selecting the embedding + LLM backends and
pinning temperature to 0 for reproducibility. ``apply_profile`` MUST be called
before importing ``services.*`` because the embedding/LLM backend constants are
read at import time.

What a profile does NOT set: ``DATABASE_URL`` and ``OPENROUTER_API_KEY`` — those
come from the real environment (e.g. the Neon branch URL exported by
``run_with_neon_branch.sh``, or your local compose DB). Keeping secrets out of
the profile is deliberate.
"""

from __future__ import annotations

import os
from uuid import UUID

# Fixed session the corpus is seeded into, so runs are comparable over time.
EVAL_SESSION_ID = UUID("00000000-0000-0000-0000-0000000000be")

# Each profile pins backends explicitly so behaviour never depends on ENV.
PROFILES: dict[str, dict[str, str]] = {
    # Local pgvector + Ollama, end to end. Free, deterministic, good for CI gating.
    "dev": {
        "EMBEDDING_BACKEND": "ollama",
        "FLASHCARD_LLM_BACKEND": "ollama",
        "FLASHCARD_LLM_TEMPERATURE": "0",
    },
    # Dev embeddings/DB but generation routed to the prod LLM (OpenRouter).
    # Measures generation quality on dev retrieval — see README caveats.
    "dev-prodllm": {
        "EMBEDDING_BACKEND": "ollama",
        "FLASHCARD_LLM_BACKEND": "openrouter",
        "FLASHCARD_LLM_TEMPERATURE": "0",
    },
    # Full prod stack. Point DATABASE_URL at a Neon BRANCH (not prod itself).
    "prod": {
        "EMBEDDING_BACKEND": "openrouter",
        "FLASHCARD_LLM_BACKEND": "openrouter",
        "FLASHCARD_LLM_TEMPERATURE": "0",
    },
}


def apply_profile(name: str) -> dict[str, str]:
    """Set the profile's env vars. Call before importing services."""
    if name not in PROFILES:
        raise SystemExit(
            f"Unknown profile {name!r}. Choices: {', '.join(PROFILES)}"
        )
    applied = PROFILES[name]
    for key, value in applied.items():
        os.environ[key] = value
    if not os.getenv("DATABASE_URL"):
        raise SystemExit(
            "DATABASE_URL is not set. Point it at your local compose DB (dev) or "
            "a Neon branch URL (prod). run_with_neon_branch.sh exports it for you."
        )
    return applied


# Env var the generation model is read from, per backend. The LLM backends use
# different vars (OpenRouter takes a hosted slug like "qwen/qwen3-32b", Ollama a
# local tag like "llama3.1"), so a single --model flag has to target whichever
# var the profile's backend actually reads.
_MODEL_ENV_BY_BACKEND = {
    "openrouter": "OPENROUTER_MODEL",
    "ollama": "FLASHCARD_LLM_MODEL",
}


def apply_model(model: str, profile: str) -> str:
    """Point the active profile's backend at ``model``. Call after apply_profile.

    Returns the env var that was set. Raises if the profile's backend isn't one
    we know how to override.
    """
    backend = PROFILES[profile]["FLASHCARD_LLM_BACKEND"]
    env_var = _MODEL_ENV_BY_BACKEND.get(backend)
    if env_var is None:
        raise SystemExit(
            f"Can't set a model for backend {backend!r} (profile {profile!r})."
        )
    os.environ[env_var] = model
    return env_var


def effective_model(profile: str) -> str | None:
    """The generation model the active profile will use, as set in the env.

    Returns None when the model is left to the service's own default (the
    backend's env var is unset) — the per-case ``model_used`` in the run still
    records what was actually called.
    """
    backend = PROFILES[profile]["FLASHCARD_LLM_BACKEND"]
    env_var = _MODEL_ENV_BY_BACKEND.get(backend)
    return os.getenv(env_var) if env_var else None
