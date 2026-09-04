#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
bash scripts/db/migrate-development.sh
