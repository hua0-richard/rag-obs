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
| `report.py` | Aggregates → scorecard + `summary.json`, CI gate; `--faithfulness` adds the RAGAS tier + `faithfulness.json` |
| `sweep_distance.py` | Tune `FLASHCARD_MAX_RETRIEVAL_DISTANCE` (relevance floor) from query↔chunk distances — retrieval only, no LLM |
| `sweep_models.sh` | Benchmark several generation models back-to-back on identical retrieval (`runner.py --model`) |
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

## Trying different models

The generation model is selectable per run with `runner.py --model`, which sets
the right backend var for the profile (the OpenRouter slug for `dev-prodllm` /
`prod`, the Ollama tag for `dev`) and stamps it into `meta.json`, so each
scorecard says which model produced it (`report.py` prints a `model=…` header
and writes `model` into `summary.json`).

```bash
python -m benchmarks.runner --profile dev-prodllm --model qwen/qwen3-32b
python -m benchmarks.report --no-gate
```

To benchmark several models back-to-back on identical retrieval, set `MODELS=`:

```bash
# Cheap path (dev-prodllm): seed once, then sweep against the local DB.
python -m benchmarks.seed --profile dev-prodllm
MODELS="qwen/qwen3-32b deepseek/deepseek-chat-v3.1" ./benchmarks/sweep_models.sh

# Prod path (Neon branch + faithfulness): branches + seeds once, then sweeps.
MODELS="qwen/qwen3-32b deepseek/deepseek-chat-v3.1" \
  ./benchmarks/run_with_neon_branch.sh prod
```

`sweep_models.sh` runs against whatever `DATABASE_URL` points at and does **not**
seed or branch — seed first. For prod use `run_with_neon_branch.sh` (below): it
creates the branch, seeds it once, and runs every model against that one branch,
so embeddings are computed once and retrieval is identical across the sweep.

Two caveats for a fair comparison: temperature is already pinned to 0 by every
profile (leave it), and **faithfulness only runs on the `prod` profile** (see
below) — on `dev-prodllm` you compare on `format_pass_rate` plus the
deterministic metrics. The RAGAS judge (`RAGAS_JUDGE_MODEL`) is independent of
`--model`; keep it fixed across the sweep or the faithfulness numbers won't be
comparable.

## Prod runs (Neon branch)

The `prod` profile must point `DATABASE_URL` at a **branch** of prod, never prod
itself. `run_with_neon_branch.sh` handles the whole lifecycle (create → run →
delete, with cleanup on failure):

```bash
export NEON_API_KEY=...        # neonctl auth
export NEON_PROJECT_ID=...     # prod Neon project
export OPENROUTER_API_KEY=...
pip install -r benchmarks/requirements-bench.txt   # for the faithfulness judge

./benchmarks/run_with_neon_branch.sh prod          # single run, default model
MODELS="qwen/qwen3-32b deepseek/deepseek-chat-v3.1" \
  ./benchmarks/run_with_neon_branch.sh prod        # sweep several models
```

Set `MODELS="a b c"` to sweep several generation models on one branch — it seeds
once and runs each model with `--faithfulness`. Branching is copy-on-write:
instant, ~zero storage, dropped after the run, so prod data is never touched.

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
