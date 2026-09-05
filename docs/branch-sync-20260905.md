# Branch consolidation — 2026-09-05

All GitHub branches and the additional Replit checkpoints are consolidated into main.
The separate project audit was committed as 11ff373 and merged into the retained
.migration-backup implementation. Replit's newer commerce, migrations, SEO,
analytics, and guide-source checks are included through checkpoint 3a6186f.
No branch history was force-pushed or discarded. Private local files remain ignored.

The active application is React/Vite and Express in the pnpm workspace. Main is
the GitHub default branch. The archived Next/Supabase application remains preserved.

## Integration repairs

- Retain the complete Replit customer schema and versioned Drizzle migration.
  The earlier standalone repair SQL is historical; use the versioned migration
  workflow, not both schema creation paths on a fresh database.
- Preserve pinned pnpm, native Windows dependencies, safe preinstall enforcement,
  portable Playwright environment settings, and deterministic generated imports.
- Fix Windows subprocess invocation in bundle and prospect validation.
- Give the checkout mode-mismatch regression its own explicit public origin.
- Keep approved catalog projection and correct approved pricing.
- Combine CI commerce, migration, baseline, build, SEO, and runtime checks.
- Update the runtime contract to match Replit's native 404 behavior; a catch-all
  rewrite would undermine the newer SEO implementation.
- Post-merge installs frozen dependencies. Database changes remain explicit.
- Exclude the temporary Git transfer bundle from the final source tree. Replit's
  automatic checkpoint captured it in history, but no runtime asset needs LFS.

## Verified

- Frozen dependency installation.
- pnpm run verify:ci: 66 storefront tests, 64 API/commerce tests, 3 release tests,
  catalog/launch parity, all workspace typechecks and production builds.
- Homepage entry below 500 kB and 130 kB gzip budgets.
- SEO output: 187 product routes, 12 informational routes, 404 behavior,
  metadata, internal links, robots, sitemap, llms files and catalog facts.
- Versioned Drizzle migration applied successfully to fresh local PostgreSQL 16.14.
- Replit deployment routing contract passed.
- Archived audit: 250 tests and typecheck passed. Earlier disposable Supabase
  verification passed 12 migrations, 36 contract rows and behavioral SQL checks.
- Earlier hosted browser smoke: 13 passing journeys on the existing deployment;
  this does not validate the newly merged candidate or authenticated transactions.

## External limitations

GitHub Actions cannot start because the GitHub account is billing-locked.
Replit's original Git credential failed authentication; its separate existing
GitHub connector successfully transferred code. That connector lacks workflow
scope, so transport retained GitHub's existing workflow while local authenticated
Git committed the combined workflow. GitHub also reports an exhausted LFS budget;
the only Replit LFS entry found was the temporary transfer bundle, excluded above.

Replit owns deployment and secrets. No production database migration, credential
replacement, or production republish was performed. Production sign-in testing
requires its real environment; local build validation used the existing public
publishable key. Hosted smoke and static checks are not proof of live commerce.
