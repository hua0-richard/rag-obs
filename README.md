# Obsidian Markdown Flashcards

> RAG system for querying Obsidian Markdown vaults with **source-level citations** and AI-generated flashcards.

[![Azure Deploy](https://custom-icon-badges.demolab.com/github/actions/workflow/status/hua0-richard/rag-obs/deploy-api.yml?style=flat&label=Azure+Deploy&logo=msazure&logoColor=white&labelColor=09090b&cacheSeconds=300)](https://github.com/hua0-richard/rag-obs/actions/workflows/deploy-api.yml)
[![API Status](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/hua0-richard/rag-obs/status/server-status/api.json&style=flat&labelColor=09090b&cacheSeconds=300)](https://github.com/hua0-richard/rag-obs/actions/workflows/api-status.yml)
[![Neon DB](https://img.shields.io/badge/Neon-pgvector-brightgreen?style=flat&logo=postgresql&logoColor=white&labelColor=09090b)](https://neon.tech)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-LLM-a855f7?style=flat&logoColor=white&labelColor=09090b)](https://openrouter.ai)
[![FastAPI](https://img.shields.io/badge/FastAPI-3.12-009688?style=flat&logo=fastapi&logoColor=white&labelColor=09090b)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-v19-61dafb?style=flat&logo=react&logoColor=white&labelColor=09090b)](https://react.dev)

**LLM** · DeepSeek V3 via OpenRouter:

[![DeepSeek V3](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/hua0-richard/rag-obs/status/model-status/deepseek-v3.json&style=flat&labelColor=09090b&logo=deepseek&logoColor=white)](https://openrouter.ai/deepseek/deepseek-chat-v3-0324)

---

![Demo](demo.gif)

---

## Architecture

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "background": "#09090b",
    "mainBkg": "#09090b",
    "primaryTextColor": "#ffffff",
    "textColor": "#ffffff",
    "labelBackground": "rgba(0,0,0,0)",
    "edgeLabelBackground": "rgba(0,0,0,0)",
    "edgeLabelBorder": "rgba(0,0,0,0)",
    "edgeLabelBorderWidth": "0",
    "edgeLabelColor": "#ffffff",
    "lineColor": "#94a3b8",
    "clusterBkg": "#09090b",
    "clusterBorder": "#334155",
    "clusterLabelColor": "#ffffff"
  }
} }%%

flowchart LR
    User(["User Browser"])

    subgraph Frontend["▲ Netlify — Frontend"]
        direction TB
        Web["React 19 SPA<br/>(Vite)"]
    end

    subgraph Backend["☁ Azure Container Apps — Backend"]
        direction TB
        API["FastAPI API<br/>(Python 3.12)"]
        Embed["Embedding Router<br/>(profile-based)"]
        Retrieve["Hybrid Retriever<br/>(BM25 + pgvector)"]
        RAG["Flashcard Generator"]
    end

    subgraph Data["Data (State)"]
        direction TB
        DB[("Neon<br/>(PostgreSQL + pgvector)")]
    end

    subgraph AI["AI Inference"]
        direction TB
        OR["OpenRouter<br/>(DeepSeek V3 + Embeddings)"]
        Ollama["Ollama<br/>(Local Dev)"]
    end

    User -->|"Upload notes + optional study focus"| Web
    Web -->|"REST / JSON"| API
    API -->|"Chunk + classify"| Embed
    API -->|"Selected files + focus query"| Retrieve
    API -->|"Sessions + files"| DB
    Embed -->|"Prod embeddings"| OR
    Embed -.->|"Local embeddings"| Ollama
    Retrieve -->|"Chunk fetch + vector search"| DB
    Retrieve -->|"Ranked context"| RAG
    RAG -->|"LLM completion"| OR
    RAG -->|"Decks + flashcards"| DB

    classDef neutral    fill:#111827,stroke:#334155,color:#ffffff;
    classDef netlify    fill:#00302c,stroke:#00c7b7,color:#00c7b7;
    classDef fastapi    fill:#00213d,stroke:#0078d4,color:#4da6ff;
    classDef violet     fill:#1e1040,stroke:#a855f7,color:#c084fc;
    classDef neon       fill:#002b1f,stroke:#00e599,color:#00e599;
    classDef openrouter fill:#1a0a35,stroke:#a855f7,color:#c084fc;
    classDef ollama     fill:#1c1c1c,stroke:#555555,color:#888888;

    class User neutral;
    class Web netlify;
    class API fastapi;
    class Embed,Retrieve,RAG violet;
    class DB neon;
    class OR openrouter;
    class Ollama ollama;

    style Frontend fill:#001f1c,stroke:#00c7b7,color:#00c7b7,stroke-width:1.5px
    style Backend  fill:#001229,stroke:#0078d4,color:#4da6ff,stroke-width:1.5px
    style Data     fill:#001508,stroke:#00e599,color:#00e599,stroke-width:1.5px
    style AI       fill:#130828,stroke:#a855f7,color:#c084fc,stroke-width:1.5px

    linkStyle default stroke:#94a3b8,stroke-width:1.5px
```

## Key Components

The app uses a React frontend on Netlify, a FastAPI backend on Azure Container Apps, PostgreSQL + pgvector (Neon) for retrieval, and OpenRouter for production LLM inference (DeepSeek V3) and embeddings. Flashcard generation can optionally bias retrieval with a study-focus query.

## Technology Stack

React 19 + Vite + Tailwind CSS on the frontend. FastAPI + Python 3.12 on the backend. PostgreSQL with pgvector via Neon for retrieval. OpenRouter (DeepSeek V3) for production LLM inference and embeddings. Ollama for local development. GitHub Actions for CI/CD.

## Notable Engineering Approaches

**Client-Side Session ID**: Session UUIDs are generated in the browser via `crypto.randomUUID()` and written to `localStorage` immediately on page load — no server round-trip required. The session row is created lazily in the database on the first upload.

**Embedding Routing**: Embedding backend is swappable via `EMBEDDING_BACKEND`. In development, Ollama serves embeddings locally. In production, OpenRouter is used to keep the API container lightweight and avoid shipping local model weights into Azure Container Apps.

**Multi-Profile Embeddings**: Notes are classified at upload time into `default`, `code`, or `verbose` profiles based on content structure (code blocks, math, length). These profiles control retrieval/storage behavior and pgvector table selection for the active embedding backend.

**Optional Hybrid Retrieval**: The flashcards UI accepts an optional study-focus query. When present, the backend combines BM25 keyword retrieval with pgvector semantic retrieval to pull more relevant chunks from the selected notes before generation.

**Removed Manual Model Switching**: The old UI controls for manually switching embedding models were removed. In production, the extra model-loading and runtime overhead was not worth the added compute and memory pressure on Azure Container Apps, so the app now uses a single production embedding model with internal profile-based routing instead of user-facing model selection.

**Heading-Aware Chunking**: Markdown is split with heading context preserved, so retrieved chunks carry section provenance for precise citations.

## Development Setup

```bash
pnpm run infra        # CPU (default)
pnpm run infra:gpu    # GPU passthrough for Ollama
```

Pull the LLM model after first startup:

```bash
pnpm run ollama:pull  # pulls qwen2.5:14b-instruct
```

Pull the local embedding model:

```bash
docker compose exec ollama ollama pull nomic-embed-text
```

### Optional: Host Ollama

If you already run Ollama on your machine:

```bash
pnpm run infra:host-ollama
```

Points the API to `http://host.docker.internal:11434`.

## Database Migrations

The API does not auto-run migrations on startup. Run manually with Alembic:

```bash
# Inside running containers
docker compose exec api alembic upgrade head

# One-off
docker compose run --rm api alembic upgrade head

# Local (from backend/)
export DATABASE_URL='postgresql+psycopg2://raguser:ragpass@localhost:5432/ragobs'
alembic upgrade head
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_BACKEND` | `ollama` in dev / `openrouter` in prod | `ollama` \| `openrouter` \| `sentence_transformers` |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Local Ollama embedding model |
| `OPENROUTER_EMBED_MODEL` | `openai/text-embedding-3-small` | Production OpenRouter embedding model |
| `OPENROUTER_MODEL` | `deepseek/deepseek-chat-v3-0324` | OpenRouter LLM model |
| `OPENROUTER_API_KEY` | — | Required in production (LLM + embeddings) |
| `DATABASE_URL` | local postgres | PostgreSQL connection string |
| `FRONTEND_URL` | — | Added to CORS allowed origins |
