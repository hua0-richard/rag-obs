from functools import lru_cache
from typing import Literal

import numpy as np

from sentence_transformers import SentenceTransformer
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

EMBEDDING_MODEL_NAMES: dict[EmbeddingProfile, str] = {
    DEFAULT_EMBEDDING_PROFILE: "all-MiniLM-L6-v2",
    CODE_EMBEDDING_PROFILE: "jina-embeddings-v2-base-code",
    VERBOSE_EMBEDDING_PROFILE: "bge-large-en-v1.5",
}

MODEL_ID_ALIASES: dict[str, str] = {
    "all-minilm-l6-v2": "sentence-transformers/all-MiniLM-L6-v2",
    "all_minilm_l6_v2": "sentence-transformers/all-MiniLM-L6-v2",
    "sentence-transformers/all-minilm-l6-v2": "sentence-transformers/all-MiniLM-L6-v2",
    "jina-embeddings-v2-base-code": "jinaai/jina-embeddings-v2-base-code",
    "bge-large-en-v1.5": "BAAI/bge-large-en-v1.5",
    "bge-large-en-v1_5": "BAAI/bge-large-en-v1.5",
    "baai/bge-large-en-v1.5": "BAAI/bge-large-en-v1.5",
}

TRUST_REMOTE_CODE_MODELS = {
    "jinaai/jina-embeddings-v2-base-code",
}

EMBEDDING_TABLES: dict[EmbeddingProfile, str] = {
    DEFAULT_EMBEDDING_PROFILE: "embeddings",
    CODE_EMBEDDING_PROFILE: "embeddings_code",
    VERBOSE_EMBEDDING_PROFILE: "embeddings_verbose",
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


def _resolve_model_id(model_name: str) -> str:
    key = model_name.strip().lower()
    return MODEL_ID_ALIASES.get(key, model_name)


@lru_cache(maxsize=None)
def _load_model(model_name: str) -> SentenceTransformer:
    resolved = _resolve_model_id(model_name)
    needs_trust = resolved in TRUST_REMOTE_CODE_MODELS
    if needs_trust:
        try:
            return SentenceTransformer(resolved, trust_remote_code=True)
        except TypeError:
            return SentenceTransformer(resolved)
    return SentenceTransformer(resolved)


def _get_model(profile: EmbeddingProfile) -> SentenceTransformer:
    model_name = EMBEDDING_MODEL_NAMES[profile]
    return _load_model(model_name)

def _encode_texts(model: SentenceTransformer, texts: list[str]) -> np.ndarray:
    try:
        return model.encode(texts, convert_to_numpy=True)
    except TypeError:
        vectors = model.encode(texts)
        if hasattr(vectors, "detach"):
            return vectors.detach().cpu().numpy()
        if hasattr(vectors, "numpy"):
            return vectors.numpy()
        return np.asarray(vectors)


async def embed_chunks(chunks: list[str], profile: EmbeddingProfile = DEFAULT_EMBEDDING_PROFILE):
    model = _get_model(profile)
    return await run_in_threadpool(_encode_texts, model, chunks)


async def embed_query(prompt: str, profile: EmbeddingProfile = DEFAULT_EMBEDDING_PROFILE):
    model = _get_model(profile)
    return (await run_in_threadpool(_encode_texts, model, [prompt]))[0]


def embed_query_sync(prompt: str, profile: EmbeddingProfile = DEFAULT_EMBEDDING_PROFILE):
    model = _get_model(profile)
    return _encode_texts(model, [prompt])[0]
