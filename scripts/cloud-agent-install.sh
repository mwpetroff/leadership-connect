#!/usr/bin/env bash
# Idempotent Cloud Agent install: workspace dependencies + API bundle.
# Safe on default `main` before this file is merged: pnpm 11 requires an
# explicit allowBuilds map or `pnpm install --frozen-lockfile` fails.
set -euo pipefail
cd /workspace
export CI=true

if [ -f pnpm-workspace.yaml ] && ! grep -q '^allowBuilds:' pnpm-workspace.yaml; then
  printf '\nallowBuilds:\n  esbuild: true\n  "@swc/core": true\n  msw: true\n  unrs-resolver: true\n' >> pnpm-workspace.yaml
fi

pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
