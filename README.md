# Obsidian Markdown Flashcards

> RAG system for querying Obsidian Markdown vaults with **source-level citations** and AI-generated flashcards.

[![Azure Deploy](https://custom-icon-badges.demolab.com/github/actions/workflow/status/hua0-richard/rag-obs/deploy-api.yml?style=flat&label=Azure+Deploy&logo=msazure&logoColor=white&labelColor=09090b&cacheSeconds=60)](https://github.com/hua0-richard/rag-obs/actions/workflows/deploy-api.yml)
[![Neon DB](https://img.shields.io/badge/Neon-pgvector-brightgreen?style=flat&logo=postgresql&logoColor=white&labelColor=09090b)](https://neon.tech)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-LLM-a855f7?style=flat&logoColor=white&labelColor=09090b)](https://openrouter.ai)
[![FastAPI](https://img.shields.io/badge/FastAPI-3.12-009688?style=flat&logo=fastapi&logoColor=white&labelColor=09090b)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-v19-61dafb?style=flat&logo=react&logoColor=white&labelColor=09090b)](https://react.dev)

**LLM Fallback Chain** · tried in order when a model is unavailable or rate-limited:

[![Llama 3.3 70B](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/hua0-richard/rag-obs/status/model-status/llama-3.3-70b.json&style=flat&labelColor=09090b)](https://openrouter.ai/meta-llama/llama-3.3-70b-instruct:free)
[![Gemma 3 27B](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/hua0-richard/rag-obs/status/model-status/gemma-3-27b.json&style=flat&labelColor=09090b)](https://openrouter.ai/google/gemma-3-27b-it:free)
[![DeepSeek R1](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/hua0-richard/rag-obs/status/model-status/deepseek-r1.json&style=flat&labelColor=09090b)](https://openrouter.ai/deepseek/deepseek-r1:free)
[![Qwen 2.5 72B](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/hua0-richard/rag-obs/status/model-status/qwen-2.5-72b.json&style=flat&labelColor=09090b)](https://openrouter.ai/qwen/qwen-2.5-72b-instruct:free)

---

![Demo](demo.png)

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
    User(["User Browser<br/>(Client)"])

    subgraph Frontend["▲ Netlify — Frontend"]
        direction TB
        Web["React 19<br/>(SPA / CDN)"]
    end

    subgraph Backend["☁ Azure Container Apps — Backend"]
        direction TB
        API["FastAPI<br/>(Python 3.12)"]
        Embed["Embedding Router<br/>(default · code · verbose)"]
        RAG["RAG + Flashcard<br/>Pipeline"]
    end

    subgraph Data["Data (State)"]
        direction TB
        DB[("Neon<br/>(PostgreSQL + pgvector)")]
    end

    subgraph AI["AI Inference"]
        direction TB
        OR["OpenRouter<br/>(LLM + Embeddings)"]
        Ollama["Ollama<br/>(Local Dev)"]
    end

    L_User_Web["HTTPS / Upload .md Files"]
    L_Web_API["REST API / JSON"]
    L_API_Embed["Text Chunks + Profile"]
    L_API_RAG["Query + Retrieved Context"]
    L_API_DB["SQLAlchemy ORM<br/>(sessions · notes · flashcards)"]
    L_Embed_OR["Embed API — prod"]
    L_RAG_OR["LLM Completion"]
    L_RAG_DB["pgvector Similarity Search"]

    User --> L_User_Web --> Web
    Web --> L_Web_API --> API
    API --> L_API_Embed --> Embed
    API --> L_API_RAG --> RAG
    API --> L_API_DB --> DB
    Embed --> L_Embed_OR --> OR
    Embed -.->|"Embed API — local dev"| Ollama
    RAG --> L_RAG_OR --> OR
    RAG --> L_RAG_DB --> DB

    classDef neutral    fill:#111827,stroke:#334155,color:#ffffff;
    classDef netlify    fill:#00302c,stroke:#00c7b7,color:#00c7b7;
    classDef fastapi    fill:#00213d,stroke:#0078d4,color:#4da6ff;
    classDef violet     fill:#1e1040,stroke:#a855f7,color:#c084fc;
    classDef neon       fill:#002b1f,stroke:#00e599,color:#00e599;
    classDef openrouter fill:#1a0a35,stroke:#a855f7,color:#c084fc;
    classDef ollama     fill:#1c1c1c,stroke:#555555,color:#888888;
    classDef edgeText   fill:transparent,stroke:transparent,color:#94a3b8;

    class User neutral;
    class Web netlify;
    class API fastapi;
    class Embed,RAG violet;
    class DB neon;
    class OR openrouter;
    class Ollama ollama;
    class L_User_Web,L_Web_API,L_API_Embed,L_API_RAG,L_API_DB,L_Embed_OR,L_RAG_OR,L_RAG_DB edgeText;

    style Frontend fill:#001f1c,stroke:#00c7b7,color:#00c7b7,stroke-width:1.5px
    style Backend  fill:#001229,stroke:#0078d4,color:#4da6ff,stroke-width:1.5px
    style Data     fill:#001508,stroke:#00e599,color:#00e599,stroke-width:1.5px
    style AI       fill:#130828,stroke:#a855f7,color:#c084fc,stroke-width:1.5px

    linkStyle default stroke:#94a3b8,stroke-width:1.5px
```

## Key Components

The architecture integrates a React frontend on Netlify with a FastAPI backend on Azure Container Apps, PostgreSQL + pgvector (Neon) for vector search, and OpenRouter for LLM inference.

## Technology Stack

React 19 + Vite + Tailwind CSS on the frontend. FastAPI + Python 3.12 on the backend. PostgreSQL with pgvector via Neon for embeddings. OpenRouter for cloud LLM and embedding inference. Ollama for local LLM and embedding inference. GitHub Actions for CI/CD.

## Notable Engineering Approaches

**Embedding Routing**: Embedding backend is swappable via `EMBEDDING_BACKEND` env var. In development, Ollama serves embeddings locally. In production, OpenRouter's API is used — keeping the API container lightweight with no local model weights.

**Multi-Profile Embeddings**: Notes are classified at upload time into `default`, `code`, or `verbose` profiles based on content structure (code blocks, math, length). Each profile routes to a different embedding model and pgvector table optimized for that content type.

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

Pull the embedding model:

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
| `EMBEDDING_BACKEND` | `ollama` | `ollama` \| `openrouter` \| `sentence_transformers` |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Ollama embedding model |
| `OPENROUTER_EMBED_MODEL` | `openai/text-embedding-3-small` | OpenRouter embedding model |
| `OPENROUTER_MODEL` | `meta-llama/llama-3.3-70b-instruct:free` | OpenRouter LLM model |
| `OPENROUTER_API_KEY` | — | Required when `EMBEDDING_BACKEND=openrouter` |
| `DATABASE_URL` | local postgres | PostgreSQL connection string |
| `FRONTEND_URL` | — | Added to CORS allowed origins |
