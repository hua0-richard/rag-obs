import json
import os
from functools import lru_cache
from typing import Literal
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

import numpy as np
from starlette.concurrency import run_in_threadpool

from utils.obsidian import (
    extract_block_math,
    extract_code_fence_blocks,
    extract_inline_code_spans,
    extract_inline_math_expressions,
)

EmbeddingProfile = Literal["default", "code", "verbose"]

DEFAULT_EMBEDDING_PROFILE: EmbeddingProfile = "default"
CODE_EMBEDDING_PROFILE: EmbeddingProfile = "code"
VERBOSE_EMBEDDING_PROFILE: EmbeddingProfile = "verbose"

# --- Backend selection ---
ENV = os.getenv("ENV", "DEV").upper()
EMBEDDING_BACKEND = os.getenv(
    "EMBEDDING_BACKEND",
    "ollama" if ENV in {"DEV", "DEVELOPMENT"} else "openrouter",
)

# --- Ollama config (local dev) ---
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")

# --- OpenRouter config (prod) ---
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
OPENROUTER_EMBED_MODEL = os.getenv("OPENROUTER_EMBED_MODEL", "openai/text-embedding-3-small")

# --- SentenceTransformers config (legacy local, kept for backwards compat) ---
ST_EMBEDDING_MODEL_NAMES: dict[EmbeddingProfile, str] = {
    DEFAULT_EMBEDDING_PROFILE: "all-MiniLM-L6-v2",
    CODE_EMBEDDING_PROFILE: "jina-embeddings-v2-base-code",
    VERBOSE_EMBEDDING_PROFILE: "bge-large-en-v1.5",
}
ST_MODEL_ID_ALIASES: dict[str, str] = {
    "all-minilm-l6-v2": "sentence-transformers/all-MiniLM-L6-v2",
    "all_minilm_l6_v2": "sentence-transformers/all-MiniLM-L6-v2",
    "sentence-transformers/all-minilm-l6-v2": "sentence-transformers/all-MiniLM-L6-v2",
    "jina-embeddings-v2-base-code": "jinaai/jina-embeddings-v2-base-code",
    "bge-large-en-v1.5": "BAAI/bge-large-en-v1.5",
    "bge-large-en-v1_5": "BAAI/bge-large-en-v1.5",
    "baai/bge-large-en-v1.5": "BAAI/bge-large-en-v1.5",
}
ST_TRUST_REMOTE_CODE_MODELS = {"jinaai/jina-embeddings-v2-base-code"}

# --- Shared constants ---
EMBEDDING_TABLES: dict[EmbeddingProfile, str] = {
    DEFAULT_EMBEDDING_PROFILE: "embeddings",
    CODE_EMBEDDING_PROFILE: "embeddings_code",
    VERBOSE_EMBEDDING_PROFILE: "embeddings_verbose",
}

# DB vector dimensions per profile — OpenRouter passes these as `dimensions` to the model.
# For Ollama, the model's native output dimension must match these values.
EMBEDDING_DIMS: dict[EmbeddingProfile, int] = {
    DEFAULT_EMBEDDING_PROFILE: 384,
    CODE_EMBEDDING_PROFILE: 768,
    VERBOSE_EMBEDDING_PROFILE: 1024,
}

PROFILE_ALIASES: dict[str, EmbeddingProfile] = {
    "default": DEFAULT_EMBEDDING_PROFILE,
    "current": DEFAULT_EMBEDDING_PROFILE,
    "all-minilm-l6-v2": DEFAULT_EMBEDDING_PROFILE,
    "all_minilm_l6_v2": DEFAULT_EMBEDDING_PROFILE,
    "sentence-transformers/all-minilm-l6-v2": DEFAULT_EMBEDDING_PROFILE,
    "code": CODE_EMBEDDING_PROFILE,
    "jina-embeddings-v2-base-code": CODE_EMBEDDING_PROFILE,
    "jinaai/jina-embeddings-v2-base-code": CODE_EMBEDDING_PROFILE,
    "verbose": VERBOSE_EMBEDDING_PROFILE,
    "bge-large-en-v1.5": VERBOSE_EMBEDDING_PROFILE,
    "bge-large-en-v1_5": VERBOSE_EMBEDDING_PROFILE,
    "baai/bge-large-en-v1.5": VERBOSE_EMBEDDING_PROFILE,
}


def parse_embedding_profile(value: str | None) -> EmbeddingProfile | None:
    if not value:
        return None
    key = value.strip().lower()
    return PROFILE_ALIASES.get(key)


def normalize_embedding_profile(value: str | None) -> EmbeddingProfile:
    parsed = parse_embedding_profile(value)
    if parsed is not None:
        return parsed
    return DEFAULT_EMBEDDING_PROFILE


def get_embedding_table(profile: EmbeddingProfile) -> str:
    return EMBEDDING_TABLES[profile]


def classify_note_profile(text: str) -> EmbeddingProfile:
    if not text or not text.strip():
        return DEFAULT_EMBEDDING_PROFILE

    code_blocks = extract_code_fence_blocks(text)
    inline_code = extract_inline_code_spans(text)
    math_blocks = extract_block_math(text)
    inline_math = extract_inline_math_expressions(text)

    code_score = (len(code_blocks) * 3) + len(inline_code)
    math_score = (len(math_blocks) * 2) + len(inline_math)

    if code_score + math_score >= 3 or code_blocks or math_blocks:
        return CODE_EMBEDDING_PROFILE

    if len(text) >= 2000 and (code_score + math_score) <= 1:
        return VERBOSE_EMBEDDING_PROFILE

    return DEFAULT_EMBEDDING_PROFILE


def choose_embedding_profile(texts: list[str]) -> EmbeddingProfile:
    profiles = [classify_note_profile(text) for text in texts if isinstance(text, str)]
    if CODE_EMBEDDING_PROFILE in profiles:
        return CODE_EMBEDDING_PROFILE
    if VERBOSE_EMBEDDING_PROFILE in profiles:
        return VERBOSE_EMBEDDING_PROFILE
    return DEFAULT_EMBEDDING_PROFILE


# ---------------------------------------------------------------------------
# Ollama backend
# ---------------------------------------------------------------------------

def _ollama_embed_sync(texts: list[str]) -> np.ndarray:
    import ollama as _ollama

    client = _ollama.Client(host=OLLAMA_HOST)
    response = client.embed(model=OLLAMA_EMBED_MODEL, input=texts)
    return np.array(response.embeddings, dtype=np.float32)


# ---------------------------------------------------------------------------
# OpenRouter backend
# ---------------------------------------------------------------------------

def _openrouter_embed_sync(texts: list[str], profile: EmbeddingProfile) -> np.ndarray:
    if not OPENROUTER_API_KEY:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set. Cannot use openrouter embedding backend."
        )

    url = OPENROUTER_BASE_URL.rstrip("/") + "/embeddings"
    payload: dict = {
        "model": OPENROUTER_EMBED_MODEL,
        "input": texts,
        "dimensions": EMBEDDING_DIMS[profile],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
        body = json.loads(raw)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenRouter embedding request failed: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"OpenRouter embedding connection error: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("OpenRouter embedding returned malformed JSON.") from exc

    embeddings = [item["embedding"] for item in body["data"]]
    return np.array(embeddings, dtype=np.float32)


# ---------------------------------------------------------------------------
# SentenceTransformers backend (legacy / backwards compat)
# ---------------------------------------------------------------------------

def _st_resolve_model_id(model_name: str) -> str:
    key = model_name.strip().lower()
    return ST_MODEL_ID_ALIASES.get(key, model_name)


@lru_cache(maxsize=None)
def _st_load_model(model_name: str):
    from sentence_transformers import SentenceTransformer

    resolved = _st_resolve_model_id(model_name)
    needs_trust = resolved in ST_TRUST_REMOTE_CODE_MODELS
    if needs_trust:
        try:
            return SentenceTransformer(resolved, trust_remote_code=True)
        except TypeError:
            return SentenceTransformer(resolved)
    return SentenceTransformer(resolved)


def _st_encode_sync(model, texts: list[str]) -> np.ndarray:
    try:
        return model.encode(texts, convert_to_numpy=True)
    except TypeError:
        vectors = model.encode(texts)
        if hasattr(vectors, "detach"):
            return vectors.detach().cpu().numpy()
        if hasattr(vectors, "numpy"):
            return vectors.numpy()
        return np.asarray(vectors)


def _st_embed_sync(texts: list[str], profile: EmbeddingProfile) -> np.ndarray:
    model_name = ST_EMBEDDING_MODEL_NAMES[profile]
    model = _st_load_model(model_name)
    return _st_encode_sync(model, texts)


# ---------------------------------------------------------------------------
# Unified embed interface
# ---------------------------------------------------------------------------

def _embed_sync(texts: list[str], profile: EmbeddingProfile) -> np.ndarray:
    backend = EMBEDDING_BACKEND.lower()
    if backend == "ollama":
        return _ollama_embed_sync(texts)
    if backend == "openrouter":
        return _openrouter_embed_sync(texts, profile)
    if backend in {"sentence_transformers", "local"}:
        return _st_embed_sync(texts, profile)
    raise ValueError(
        f"Unknown EMBEDDING_BACKEND={EMBEDDING_BACKEND!r}. "
        "Expected one of: ollama, openrouter, sentence_transformers."
    )


async def embed_chunks(chunks: list[str], profile: EmbeddingProfile = DEFAULT_EMBEDDING_PROFILE):
    return await run_in_threadpool(_embed_sync, chunks, profile)


async def embed_query(prompt: str, profile: EmbeddingProfile = DEFAULT_EMBEDDING_PROFILE):
    return (await run_in_threadpool(_embed_sync, [prompt], profile))[0]


def embed_query_sync(prompt: str, profile: EmbeddingProfile = DEFAULT_EMBEDDING_PROFILE):
    return _embed_sync([prompt], profile)[0]


def active_embed_model(profile: EmbeddingProfile) -> str:
    """Return the model name that will be used for the given profile under the active backend."""
    backend = EMBEDDING_BACKEND.lower()
    if backend == "ollama":
        return f"ollama/{OLLAMA_EMBED_MODEL}"
    if backend == "openrouter":
        return f"openrouter/{OPENROUTER_EMBED_MODEL}"
    return ST_EMBEDDING_MODEL_NAMES.get(profile, "unknown")
