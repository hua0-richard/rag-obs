# Flashcard pipeline benchmarks

Measures the quality of generated flashcards across two stages of the RAG
pipeline: **retrieval** (did the right chunks make it into context?) and
**generation** (are the cards well-formed and faithful?). Runs the *real*
`generate_flashcards` path with `persist=False`, so it exercises hybrid
BM25 + pgvector retrieval without writing decks to the DB.

## Layout

| Path | Purpose |
|------|---------|
| `config.py` | Env profiles (`dev`, `dev-prodllm`, `prod`) + the fixed eval session id |
| `corpus/` | Fixed `.md` notes seeded into the eval session (replace with your own) |
| `dataset.jsonl` | Golden cases: prompt + retrieval labels + assertions |
| `seed.py` | Idempotently loads `corpus/` into the eval session |
| `runner.py` | Runs each case → `results/<ts>/raw.jsonl` |
| `scorers/retrieval.py` | Recall@k, MRR, precision (deterministic, no LLM) |
| `scorers/format.py` | Prompt-contract checks (deterministic, no LLM) |
| `report.py` | Aggregates → scorecard + `summary.json`, CI gate |
| `run_with_neon_branch.sh` | Branch prod → run → drop branch (for the `prod` profile) |

## Quick start (dev)

Run from `backend/` with the compose DB up (`docker compose up db ollama`):

```bash
export DATABASE_URL="postgresql+psycopg2://raguser:ragpass@localhost:5432/ragobs"
python -m benchmarks.seed   --profile dev
python -m benchmarks.runner --profile dev
python -m benchmarks.report
```

## Profiles

| Profile | Embeddings | LLM | DB | Measures |
|---------|-----------|-----|-----|----------|
| `dev` | Ollama | Ollama | local pgvector | end-to-end dev, free & deterministic |
| `dev-prodllm` | Ollama | OpenRouter | local pgvector | **generation** quality on dev retrieval |
| `prod` | OpenRouter | OpenRouter | **Neon branch** | full prod stack |

Profiles pin `FLASHCARD_LLM_TEMPERATURE=0` and set the backends explicitly, so
behaviour never depends on `ENV`. `DATABASE_URL` and `OPENROUTER_API_KEY` come
from the real environment, never from a profile.

### `dev-prodllm` caveat

Dev embeds with `nomic-embed-text`; prod embeds with `text-embedding-3-small`.
So `dev-prodllm` retrieves *dev* chunks and only the **generation** half matches
prod. Read its numbers as "is the LLM writing good, faithful cards from the
context it's given" — not as a prod-fidelity score.

## Prod runs (Neon branch)

The `prod` profile must point `DATABASE_URL` at a **branch** of prod, never prod
itself. `run_with_neon_branch.sh` handles the whole lifecycle (create → run →
delete, with cleanup on failure):

```bash
export NEON_API_KEY=...        # neonctl auth
export NEON_PROJECT_ID=...     # prod Neon project
export OPENROUTER_API_KEY=...
./benchmarks/run_with_neon_branch.sh prod
```

Branching is copy-on-write: instant, ~zero storage, dropped after the run, so
prod data is never touched.

## CI gating

Gate only on the **free, deterministic** metrics (`hit_rate`, `format_pass_rate`
in `report.py`'s `THRESHOLDS`). Run the `dev` profile on every PR. Run `prod`
(paid, non-deterministic) on a schedule or manual dispatch — don't gate PRs on
hosted-model output.

## Not built yet (intentionally)

An LLM-judge **faithfulness** scorer (does each card's answer follow from its
retrieved context?). It's the only tier that costs money and has variance, so
it's left as a separate opt-in step — add `scorers/faithfulness.py` and wire it
into `report.py` as a non-gating metric, or plug in RAGAS.
