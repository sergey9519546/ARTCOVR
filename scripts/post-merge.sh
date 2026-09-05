#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
# Live database changes are applied explicitly through the deployment process.
