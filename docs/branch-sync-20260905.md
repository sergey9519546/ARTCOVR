# Branch consolidation — 2026-09-05

## Scope and acceptance

Preserve every existing branch commit and local user file, carry the migrated
storefront forward to main, repair reproducible integration failures, and synchronize
remote branches without force pushes. Existing branch history proves origin/main
was already an ancestor of origin/artcovr-storefront (445 additional commits).
GitHub had no open issues or pull requests at inspection.

## Repairs

- Replace retired Bun/Next CI commands with the pinned pnpm workspace pipeline.
- Restore missing generation, reference-upload, inquiry, and order-entitlement schema.
  Include an additive transactional SQL migration for the existing commerce database.
- Restore the migrated catalog projection CLI and pricing-source path. Regenerate
  graphic-surreal-pop from its approved 3500-cent price instead of the stale 1000 cents.
- Restore platform-native dependencies, Windows-safe CLI execution and Drizzle paths.
- Declare the storefront's direct tsx dependency; retain a frozen pnpm lockfile.
- Route local browser API calls to the API server and pass Playwright environment
  variables portably. Sort generated mockup imports for stable builds.
- Keep package-manager enforcement non-destructive and remove automatic live schema
  push from the Replit post-merge hook.
- Replace obsolete root project documentation with the current architecture and commands.

## Verification

- Frozen pnpm installation: passed.
- pnpm run verify:ci: passed, including 41 storefront tests, 18 API/commerce tests,
  all workspace type checks, catalog projection/launch checks, and all production builds.
- PostgreSQL 16.14: additive repair applied to the original commerce schema,
  reapplied idempotently, then all 18 API tests passed against that migrated database.
- Retained Supabase sources: 12 migrations, 36 contract assertion rows, and behavioral
  SQL checks passed against a separate disposable PostgreSQL database.
- PLAYWRIGHT_BASE_URL=https://artcovr.com pnpm run test:e2e: all 13 read-only browser
  journeys passed against the existing Replit deployment.

## Deployment boundary and remaining validation

Replit owns deployment and keys. The deployed client exposes a live Clerk public key;
GitHub has no configured test-tenant variable or secret. Hosted browser results do not
validate the candidate commit or prove that the schema repair is live. Validate this
commit in a Replit preview and apply the additive migration through the approved
Replit deployment process before claiming the new customer API is production-ready.
No production database or Replit secret was changed during consolidation.

CI labels hosted browser coverage separately from candidate code/database/build checks.
The retained Vercel integration reports failed historical deployments; Replit is the
owner-confirmed deployment platform, and Vercel settings were not changed.

Builds retain non-fatal Vite sourcemap and large-bundle warnings. Installation reports
an ignored Clerk dependency build script and a deprecated transitive uuid package.
These checks are not an exhaustive security or production-readiness certification.

A separate codex/project-audit-20260904 worktree contains uncommitted edits. Its
committed tip is included in this merge; its unfinished working files were preserved
in place and were not published or overwritten.
