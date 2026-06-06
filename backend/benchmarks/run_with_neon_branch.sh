#!/usr/bin/env bash
#
# Run the benchmark against a prod-profile database. Two modes:
#
#   (a) Bring your own URL  — export DATABASE_URL yourself (e.g. a branch
#       connection string copied from the Neon console). The script uses it
#       as-is; no neonctl, NEON_API_KEY or NEON_PROJECT_ID needed.
#
#   (b) Auto-branch prod    — leave DATABASE_URL unset and set NEON_API_KEY +
#       NEON_PROJECT_ID. The script creates a throwaway copy-on-write branch of
#       prod via neonctl and drops it on exit (even on crash).
#
# In BOTH modes the target MUST be a branch/throwaway, never prod itself:
# seed.py wipes + reseeds the eval session in whatever database it connects to.
#
# Requires (mode b only) the neonctl CLI (`npm i -g neonctl`) and:
#   NEON_API_KEY      - neonctl auth
#   NEON_PROJECT_ID   - the prod Neon project
# Both modes need:
#   OPENROUTER_API_KEY- for the prod profile's LLM + embeddings
#
# Run from backend/:   ./benchmarks/run_with_neon_branch.sh [profile]
# Or from the repo root: pnpm bench:prod [profile]
set -euo pipefail

PROFILE="${1:-prod}"

warm_compute() {
  # Warm the compute so its cold start doesn't skew the first latency sample.
  python -c "import os; from sqlalchemy import create_engine, text; \
create_engine(os.environ['DATABASE_URL'], pool_pre_ping=True).connect().execute(text('select 1'))"
}

run_benchmark() {
  python -m benchmarks.seed   --profile "${PROFILE}"
  python -m benchmarks.runner --profile "${PROFILE}"
  python -m benchmarks.report
}

# Mode (a): caller supplied DATABASE_URL — use it directly, no Neon involvement.
if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is set — running against it directly (no Neon branch created)."
  echo "  Ensure this is a BRANCH/throwaway, not prod: seed wipes + reseeds the eval session."
  warm_compute
  run_benchmark
  exit 0
fi

# Mode (b): no DATABASE_URL — create a throwaway Neon branch of prod.
: "${NEON_API_KEY:?set NEON_API_KEY (or export DATABASE_URL to skip Neon)}"
: "${NEON_PROJECT_ID:?set NEON_PROJECT_ID (or export DATABASE_URL to skip Neon)}"

BRANCH_NAME="bench-$(date +%Y%m%d-%H%M%S)-$$"

cleanup() {
  echo "Deleting branch ${BRANCH_NAME}..."
  neonctl branches delete "${BRANCH_NAME}" --project-id "${NEON_PROJECT_ID}" 2>/dev/null || true
}
trap cleanup EXIT

echo "Creating Neon branch ${BRANCH_NAME} (copy-on-write of prod)..."
neonctl branches create \
  --name "${BRANCH_NAME}" \
  --project-id "${NEON_PROJECT_ID}"

# Pooled connection string for the new branch's default endpoint.
DATABASE_URL="$(neonctl connection-string "${BRANCH_NAME}" \
  --project-id "${NEON_PROJECT_ID}" --pooled)"
export DATABASE_URL
echo "Branch ready."

warm_compute
run_benchmark
