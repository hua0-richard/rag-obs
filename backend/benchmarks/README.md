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

## Faithfulness (opt-in LLM judge, RAGAS)

`scorers/faithfulness.py` adds the one quality tier the deterministic scorers
can't cover: **is each card's answer grounded in its retrieved context?** It uses
RAGAS, which decomposes each answer into atomic claims and checks each against the
contexts (score = supported / total, 0–1). Each flashcard is judged as its own
sample, then averaged per case.

Because it calls a hosted LLM, it **costs money and has run-to-run variance**, so:

- it only runs for the **`prod`** profile (dev retrieval isn't prod-faithful),
- it's **never CI-gated** — `report.py` writes `faithfulness_mean` to
  `summary.json` but never adds it to `THRESHOLDS`,
- it's guarded behind `--faithfulness`, so normal runs stay free.

The judge runs through OpenRouter, reusing `OPENROUTER_API_KEY`. Choose the model
with `RAGAS_JUDGE_MODEL` (default `openai/gpt-4o`).

```bash
pip install -r benchmarks/requirements-bench.txt   # optional deps, not in the prod image

# inside run_with_neon_branch.sh prod, or with a Neon-branch DATABASE_URL set:
python -m benchmarks.runner --profile prod
python -m benchmarks.report --faithfulness          # adds faithfulness_mean, non-gating
```

It depends on the run being produced with `include_context=True` (the runner sets
this) so the chunk text is present in `raw.jsonl` for the judge to read; older
runs without it are silently skipped.

### Still not built (intentionally)

Context precision/recall (RAGAS judges retrieval relevance) and `answer_relevancy`
— the deterministic `retrieval.py` already covers retrieval against labeled files,
so these LLM-judge retrieval metrics aren't worth the extra cost yet.
