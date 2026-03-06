# Obsidian Knowledge Base RAG

> Local-first Retrieval-Augmented Generation (RAG) system for querying Obsidian Markdown vaults with **source-level citations**.

---

![Demo](demo.png)


## Build
```
pnpm run dev:full
```

### Ollama Networking (macOS + Linux)

This project runs Ollama in Docker and connects API to it over the Compose network.

- API uses `OLLAMA_HOST=http://ollama:11434`
- Ollama runs as the `ollama` service in `docker-compose.yml`
- Pull the model once after startup: `pnpm run ollama:pull`

Quick verification:

```bash
docker compose exec api python - <<'PY'
import urllib.request
print(urllib.request.urlopen("http://ollama:11434/api/tags", timeout=8).status)
PY
```

## Database Migrations

Run database migrations manually with Alembic. The API does not auto-run migrations on startup.

On first start with a fresh database, run migrations before using upload/flashcard features.

```bash
# If containers are already running
docker compose exec api alembic upgrade head
```

```bash
# One-off migration container
docker compose run --rm api alembic upgrade head
```

```bash
# Local (non-docker) from backend/
cd backend
export DATABASE_URL='postgresql+psycopg2://raguser:ragpass@localhost:5432/ragobs'
alembic upgrade head
```

## Overview

This project ingests an Obsidian vault (Markdown files), builds a structured knowledge index, and enables **question-answering with citations** to exact notes and sections.  
Designed to be **local-first, reproducible, and self-hostable**.

Primary use cases:
- Ask questions over personal notes
- Retrieve answers with precise citations
- Generate study aids (summaries, flashcards)

---

## Core Features

- **Markdown ingestion** with Obsidian-aware parsing
- **Heading-aware chunking** for higher retrieval precision
- **Vector search** over note embeddings
- **Cited answers** linking back to source files + headings
- **Incremental re-indexing** on vault updates
- **Local LLM support** (optional) with cloud fallback

---

## Architecture


GitHub Models LLM on Prod
Ollama models on Local

`all-MiniLM-L6-v2` Embeddings
