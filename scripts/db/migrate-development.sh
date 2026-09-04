#!/usr/bin/env bash
# Development-only migration entry point used by post-merge setup.
#
# The baseline detector handles legacy push-created schemas. Fresh databases
# are left untouched by it and are initialized by the normal migrator below.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

NODE_ENV=development pnpm run db:baseline
pnpm --filter @workspace/db run migrate