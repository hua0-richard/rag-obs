import json
import os
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

import numpy as np
from starlette.concurrency import run_in_threadpool

# Single embedding space for the whole app. 768 is the native output of
# nomic-embed-text (the Ollama dev model); OpenRouter is asked for the same
# width via the `dimensions` parameter, so dev and prod vectors stay
# interchangeable and one table serves both.
EMBEDDING_DIM = 768
EMBEDDING_TABLE = "embeddings"

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


def _ollama_embed_sync(texts: list[str]) -> np.ndarray:
    import ollama as _ollama

    client = _ollama.Client(host=OLLAMA_HOST)
    response = client.embed(model=OLLAMA_EMBED_MODEL, input=texts)
    return np.array(response.embeddings, dtype=np.float32)


def _openrouter_embed_sync(texts: list[str]) -> np.ndarray:
    if not OPENROUTER_API_KEY:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set. Cannot use openrouter embedding backend."
        )

    url = OPENROUTER_BASE_URL.rstrip("/") + "/embeddings"
    payload: dict = {
        "model": OPENROUTER_EMBED_MODEL,
        "input": texts,
        "dimensions": EMBEDDING_DIM,
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


def _embed_sync(texts: list[str]) -> np.ndarray:
    backend = EMBEDDING_BACKEND.lower()
    if backend == "ollama":
        return _ollama_embed_sync(texts)
    if backend == "openrouter":
        return _openrouter_embed_sync(texts)
    raise ValueError(
        f"Unknown EMBEDDING_BACKEND={EMBEDDING_BACKEND!r}. Expected one of: ollama, openrouter."
    )


async def embed_chunks(chunks: list[str]) -> np.ndarray:
    return await run_in_threadpool(_embed_sync, chunks)


async def embed_query(prompt: str) -> np.ndarray:
    return (await run_in_threadpool(_embed_sync, [prompt]))[0]


def embed_query_sync(prompt: str) -> np.ndarray:
    return _embed_sync([prompt])[0]
