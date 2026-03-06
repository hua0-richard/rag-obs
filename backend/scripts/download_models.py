import os

from sentence_transformers import SentenceTransformer

MODELS = [
    ("sentence-transformers/all-MiniLM-L6-v2", False),
    ("jinaai/jina-embeddings-v2-base-code", True),
    ("BAAI/bge-large-en-v1.5", False),
]


def _cache_hint() -> str:
    for key in ("SENTENCE_TRANSFORMERS_HOME", "HF_HOME", "HUGGINGFACE_HUB_CACHE", "TRANSFORMERS_CACHE"):
        value = os.environ.get(key)
        if value:
            return f"{key}={value}"
    return "default cache"


def main() -> None:
    offline = os.environ.get("HF_HUB_OFFLINE") or os.environ.get("TRANSFORMERS_OFFLINE")
    if offline:
        print("Warning: offline mode is enabled; downloads will fail if the cache is empty.")
    print(f"Using {_cache_hint()}")
    for model_id, trust_remote_code in MODELS:
        print(f"Downloading {model_id}...")
        kwargs = {}
        if trust_remote_code:
            kwargs["trust_remote_code"] = True
        SentenceTransformer(model_id, **kwargs)
    print("All embedding models are cached locally.")


if __name__ == "__main__":
    main()
