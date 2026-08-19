#!/usr/bin/env bash
# Idempotent Cloud Agent install: workspace dependencies + API bundle.
set -euo pipefail
cd /workspace
export CI=true
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
