# Dev-server image for local `docker compose` only. Runs as root deliberately:
# compose bind-mounts the host source tree over /repo/frontend and a non-root
# uid cannot reliably write vite's cache into it.
# Production builds are done on CI by .github/workflows/deploy-frontend.yml.
#
# NOTE: the build context is the REPO ROOT, not ./frontend — the pnpm lockfile
# and workspace manifest live there and are needed for a frozen install.
FROM node:20-alpine

RUN corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
RUN pnpm install --filter frontend --frozen-lockfile

COPY frontend/ frontend/

WORKDIR /repo/frontend

EXPOSE 5173

CMD ["pnpm", "run", "dev", "--host", "0.0.0.0", "--port", "5173"]
