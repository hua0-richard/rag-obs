#!/usr/bin/env bash
# Benchmark several generation models back-to-back on the same retrieval + dataset.
#
# Each model gets its own results/<ts>/ run (meta.json records the model, so the
# scorecards stay comparable) and its own report. Retrieval is identical across
# models, so differences are purely generation quality.
#
# Runs against whatever DATABASE_URL points at — it does NOT seed or branch, so
# the DB must already be seeded for the profile (`python -m benchmarks.seed
# --profile <profile>`). This is the cheap dev-prodllm path; for a PROD sweep
# (Neon branch + faithfulness) use run_with_neon_branch.sh, which branches and
# seeds once, then sweeps:  MODELS="a b c" ./benchmarks/run_with_neon_branch.sh prod
#
# Usage (from backend/):
#   python -m benchmarks.seed --profile dev-prodllm   # once
#   ./benchmarks/sweep_models.sh                       # default models, dev-prodllm
#   MODELS="qwen/qwen3-32b deepseek/deepseek-chat-v3.1" ./benchmarks/sweep_models.sh
#
# Profile note: these are OpenRouter slugs, so the profile must route the LLM to
# OpenRouter — use dev-prodllm (cheap: local DB, free retrieval) or prod. The
# RAGAS faithfulness judge only runs on the prod profile (see benchmarks/README.md);
# on dev-prodllm you still get format_pass_rate + the deterministic metrics.
set -euo pipefail

PROFILE="${1:-dev-prodllm}"

# Override with MODELS="a b c" to benchmark a different set.
read -r -a MODELS <<< "${MODELS:-\
deepseek/deepseek-v4-flash \
qwen/qwen3-coder \
minimax/minimax-m2.5 \
qwen/qwen3-32b \
deepseek/deepseek-chat-v3.1}"

for model in "${MODELS[@]}"; do
  echo "=============================================================="
  echo "  $model  (profile=$PROFILE)"
  echo "=============================================================="
  python -m benchmarks.runner --profile "$PROFILE" --model "$model"
  # --no-gate so one weak model can't abort the rest of the sweep.
  python -m benchmarks.report --no-gate --faithfulness
  echo
done
