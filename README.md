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

## Benchmarking

Response quality is measured with an offline harness under `backend/benchmarks/` that runs the **real** retrieval + generation pipeline (`generate_flashcards` with `persist=False`, so runs never write to the DB) over a fixed corpus and a set of labeled cases. It scores two stages:

- **Retrieval** (deterministic, no LLM): Recall@k, MRR, precision of the retrieved chunks vs. labeled relevant files.
- **Generation** (deterministic, no LLM): prompt-contract checks — cards parse, `source_tag` is valid, non-code answers stay under the word limit, code cards appear when expected, LaTeX uses `$...$`.

Raw results are written before scoring, so the (paid) LLM output can be re-scored without re-running generation.

### Layout

| Path | Purpose |
|------|---------|
| `config.py` | Env profiles (`dev`, `dev-prodllm`, `prod`) + the fixed eval session id |
| `corpus/` | Fixed `.md` notes seeded into the eval session (replace with your own) |
| `dataset.jsonl` | Golden cases: prompt + retrieval labels + assertions |
| `seed.py` | Idempotently loads `corpus/` into the eval session |
| `runner.py` | Runs each case → `results/<ts>/raw.jsonl` |
| `scorers/retrieval.py` | Recall@k, MRR, precision (deterministic, no LLM) |
| `scorers/format.py` | Prompt-contract checks (deterministic, no LLM) |
| `scorers/faithfulness.py` | RAGAS LLM-judge (opt-in, paid; see below) |
| `report.py` | Aggregates → scorecard + `summary.json`, CI gate |
| `langfuse_export.py` | Optional Langfuse Cloud tracing + eval UI (opt-in) |
| `run_with_neon_branch.sh` | Branch prod → run → drop branch (for the `prod` profile) |

### Profiles

Runs are driven by env **profiles** that pin `FLASHCARD_LLM_TEMPERATURE=0` and select backends explicitly, so behavior never depends on `ENV`. `DATABASE_URL` and `OPENROUTER_API_KEY` come from the real environment, never from a profile:

| Profile | Embeddings | LLM | DB | Measures |
|---------|-----------|-----|-----|----------|
| `dev` | Ollama | Ollama | local pgvector | end-to-end dev — free, deterministic, CI-gateable |
| `dev-prodllm` | Ollama | OpenRouter | local pgvector | generation quality on dev retrieval |
| `prod` | OpenRouter | OpenRouter | **Neon branch** | full prod stack |

**`dev-prodllm` caveat:** dev embeds with `nomic-embed-text`; prod embeds with `text-embedding-3-small`. So `dev-prodllm` retrieves *dev* chunks and only the **generation** half matches prod. Read its numbers as "is the LLM writing good, faithful cards from the context it's given" — not as a prod-fidelity score.

### Quick start (dev)

```bash
# from backend/, with `docker compose up db ollama` running
export DATABASE_URL='postgresql+psycopg2://raguser:ragpass@localhost:5432/ragobs'
python -m benchmarks.seed --profile dev
python -m benchmarks.runner --profile dev
python -m benchmarks.report          # scorecard + summary.json, exits non-zero if a gate fails
```

### Prod runs (Neon branch)

The `prod` profile benchmarks against a throwaway **Neon branch** (copy-on-write of prod, instant and ~zero storage, dropped after the run) so prod data is never touched. `run_with_neon_branch.sh` handles the whole lifecycle (create → run → delete, with cleanup on failure):

```bash
export NEON_API_KEY=... NEON_PROJECT_ID=... OPENROUTER_API_KEY=...
pnpm bench:prod                             # from repo root; create branch -> seed/run/report -> delete branch
# equivalently, from backend/:
./benchmarks/run_with_neon_branch.sh prod
```

`pnpm bench:prod [profile]` forwards an optional profile (defaults to `prod`). It also supports a "bring your own URL" mode: export a Neon-branch `DATABASE_URL` and it skips `neonctl` entirely.

### CI gating

Gate CI only on the **free, deterministic** metrics (`hit_rate`, `format_pass_rate` in `report.py`'s `THRESHOLDS`). Run the `dev` profile on every PR. Run `prod` (paid, non-deterministic) on a schedule or manual dispatch — don't gate PRs on hosted-model output.

### Faithfulness (opt-in LLM judge, RAGAS)

`scorers/faithfulness.py` adds the one quality tier the deterministic scorers can't cover: **is each card's answer grounded in its retrieved context?** It uses RAGAS, which decomposes each answer into atomic claims and checks each against the contexts (score = supported / total, 0–1). Each flashcard is judged as its own sample, then averaged per case.

Because it calls a hosted LLM, it **costs money and has run-to-run variance**, so:

- it only runs for the **`prod`** profile (dev retrieval isn't prod-faithful),
- it's **never CI-gated** — `report.py` writes `faithfulness_mean` to `summary.json` but never adds it to `THRESHOLDS`,
- it's guarded behind `--faithfulness`, so normal runs stay free.

The judge runs through OpenRouter, reusing `OPENROUTER_API_KEY`. Choose the model with `RAGAS_JUDGE_MODEL` (default `openai/gpt-4o`).

```bash
pip install -r benchmarks/requirements-bench.txt   # optional deps, not in the prod image

# inside run_with_neon_branch.sh prod, or with a Neon-branch DATABASE_URL set:
python -m benchmarks.runner --profile prod
python -m benchmarks.report --faithfulness          # adds faithfulness_mean, non-gating
```

It depends on the run being produced with `include_context=True` (the runner sets this) so the chunk text is present in `raw.jsonl` for the judge to read; older runs without it are silently skipped.

### Langfuse export (opt-in tracing + eval UI)

The CLI scorecard is the source of truth; Langfuse adds a **UI** on top for per-case drill-down (prompt → retrieved context → generated cards → scores) and score/cost trends over runs. It's wired to **Langfuse Cloud** — no extra containers — and is fully opt-in: `langfuse` is a benchmark-only dep (not in the prod image) and nothing runs without the `--langfuse` flag.

Set up a free project at https://cloud.langfuse.com, then:

```bash
pip install -r benchmarks/requirements-bench.txt
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_SECRET_KEY=sk-lf-...
# Host defaults to the EU region (https://cloud.langfuse.com). For a US-region
# project set the matching host, or auth fails with a 401:
# export LANGFUSE_HOST=https://us.cloud.langfuse.com

python -m benchmarks.runner --profile dev --langfuse   # emits one trace per case
python -m benchmarks.report --langfuse                 # attaches scores to those traces
```

The split mirrors the `--faithfulness` tier: the **runner** emits traces (a `retrieval` span + a `flashcards` generation, tagged with profile + git sha) and writes each trace id into `raw.jsonl`; the **report** attaches the computed scores (`retrieval_recall`/`mrr`/`hit`, `format_pass`, and `faithfulness` when `--faithfulness` is also on) to those traces by id. So you can re-score a run in Langfuse without re-running generation. `report.py --langfuse` needs a run that was produced with `runner.py --langfuse`; otherwise it warns and skips.

Notes:

- **Privacy:** prompts, retrieved context, and outputs are sent to Langfuse's SaaS. The corpus is your own `.md` notes — fine for the bundled corpus, worth a thought before pointing it at private vaults. Self-host if that matters.
- **Not CI-gated:** like faithfulness, this is for inspection, never a build gate.
- Child observation durations aren't meaningful (they're built from the finished result, not timed); the root `case:` span carries the real end-to-end latency.

### Still not built (intentionally)

Context precision/recall (RAGAS judges retrieval relevance) and `answer_relevancy` — the deterministic `retrieval.py` already covers retrieval against labeled files, so these LLM-judge retrieval metrics aren't worth the extra cost yet.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_BACKEND` | `ollama` in dev / `openrouter` in prod | `ollama` \| `openrouter` \| `sentence_transformers` |
| `FLASHCARD_LLM_BACKEND` | follows `ENV` | Override LLM backend independently of `ENV`: `openrouter` \| `ollama` (used by benchmarks) |
| `FLASHCARD_LLM_TEMPERATURE` | `0.2` | Generation sampling temperature; benchmark profiles pin it to `0` |
| `FLASHCARD_MAX_RETRIEVAL_DISTANCE` | `0` (disabled) | Cosine-distance floor: drop retrieved chunks farther than this from the query, so focused queries stay on-topic and irrelevant queries return no cards. Tune with `benchmarks/sweep_distance.py` before enabling |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Local Ollama embedding model |
| `OPENROUTER_EMBED_MODEL` | `openai/text-embedding-3-small` | Production OpenRouter embedding model |
| `OPENROUTER_MODEL` | `deepseek/deepseek-chat-v3-0324` | OpenRouter LLM model |
| `OPENROUTER_API_KEY` | — | Required in production (LLM + embeddings) |
| `DATABASE_URL` | local postgres | PostgreSQL connection string |
| `FRONTEND_URL` | — | Added to CORS allowed origins |
