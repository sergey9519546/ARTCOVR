# AGENTS.md — ARTCOVR Engineering Contract

## Product Truth

ARTCOVR is a production, rights-gated storefront for licensing curated AI-generated cover art. The public UI is a statically exported Next.js app. Supabase owns authentication, catalog state, private storage, purchases, entitlements, and image-generation workflows; Stripe's verified webhook path is payment truth. Clean source/master images remain private. Never replace production behavior with mocks, fabricated data, or silent fallbacks.

## Scope and Sources of Truth

This file applies repository-wide. A nearer AGENTS.md may add or override rules for its subtree. The active user request overrides repository instructions.

AGENTS.md is the single vendor-neutral contract. CLAUDE.md must import it with @AGENTS.md and contain only genuine Claude-specific deltas; never duplicate project facts.

Read only the task-relevant sources:

- package.json — executable commands and package-manager truth.
- catalog/README.md — approval, projection, storage, and removal workflow.
- supabase/README.md — backend, security, commerce, entitlement, and generation contracts.
- .agent-state/PRODUCT_CONTRACT.md — durable product/business invariants.
- .agent-state/DECISIONS.md — accepted ADRs and explicit exceptions.
- .agent-state/RELEASE_GATES.md — production-readiness criteria.
- .agent-state/FAILURE_GRAPH.md — known systemic failure paths.
- .agent-state/ULTRAPLAN.md — current-work snapshot only; verify every status before relying on it.

Do not put volatile counts, pass totals, branch state, deployment state, or dated operational status in this file.

When documentation, code, migrations, tests, or live state disagree, do not guess. Inspect executable behavior and the newest relevant ADR, preserve the safer fail-closed path, and report or repair the contradiction.

## Operating Rules

Inspect git status --short, the current diff, and relevant history. Preserve existing work. Never reset, clean, force-push, rewrite history, or discard changes without explicit instruction.

Before editing, locate the nearest instructions, canonical contract, implementation, callers, generated artifacts, and tests for the affected behavior.

For publication, money, access, storage, migration, or multi-subsystem work, define acceptance criteria and failure cases before implementation. Keep task-specific plans outside this file.

Make the smallest coherent root-cause fix. Reuse established abstractions. Do not add a parallel system, dependency, compatibility shim, broad rewrite, or unrelated cleanup without evidence that it is required.

Add or update tests that would fail without the change when practicable. Never weaken, skip, delete, or special-case a guard merely to make a check pass.

Run targeted checks first, then the risk-appropriate gates below. Review the final diff for scope, invariants, secrets, private paths, generated-file drift, and user-visible regressions.

Make reversible technical decisions autonomously from repository evidence. Owner approval is reserved for commercial rights, pricing/sale mode, new legal commitments, production credentials, destructive live-data operations, payment-dashboard settings, and live deployment.

When credentials or live access are unavailable, complete every safe local step and state the exact remaining action. Never fabricate approval, credentials, live verification, or success.

Bun is canonical. Use bun install and bun run <script>. Do not introduce or regenerate npm, Yarn, or pnpm lockfiles. Treat package.json as command truth.

Production uses Next.js static export. Do not introduce runtime dependence on a Next server, middleware, dynamic route handler, filesystem write, or server-only secret. Privileged dynamic behavior belongs in Supabase Edge Functions and database RPCs.

Never expose secrets in source, logs, fixtures, screenshots, generated artifacts, client responses, or NEXT_PUBLIC_* variables.

Do not add a production dependency until the existing stack and platform capabilities have been checked and the need and tradeoff are documented.

## Critical Invariants

### Catalog and Assets

Public display and purchase eligibility require explicit owner rights approval, publication approval, a valid price, and the required published/listed state. Technical validity is never proof of commercial rights.

There is no production fallback to staging/review data. An empty approval set must publish zero unapproved slugs, metadata, or bytes and render an honest empty state.

Clean source/master assets never enter public/, out/, browser bundles, public analytics, or logs. Local source paths, raw private object keys, and service-role data never enter client responses. Clean bytes or short-lived clean URLs require server-authorized, entitlement-bound access.

Never invent or pad artwork rows, rights, pricing, sale mode, metadata, prompts, provenance, hashes, source paths, or confidence. Preserve explicit unknowns.

Use the canonical workbook and scripts/catalog/ pipeline. Do not hand-edit generated projections, indexes, revocation outputs, upload plans, or seeds; never bypass pruning or export-isolation gates.

Removal/revocation is explicit, SHA-bound, and audit-preserving. Do not delete artwork, purchase, entitlement, or event history to simulate removal.

### Commerce, Database, and Access

Client input, success redirects, query parameters, and UI state never establish authoritative price, payment, ownership, fulfillment, or access. Snapshot server-authoritative identity, price/currency, source digest/object, license version, and selection state at reservation/checkout.

Preserve Stripe raw-body signature verification, event identity/idempotency, amount/currency/metadata verification, terminal convergence, retry visibility, atomic SQL settlement, and the lock order: artwork before purchase.

Exclusive works must not double-sell or remain reserved indefinitely. Full refunds and disputes revoke clean access/generation durably; only the verified won-dispute path may restore exactly what was revoked.

RLS, grants, and service-role boundaries fail closed. Browser clients never directly write settlement, revocation, entitlement, or generation-finalization state.

Treat applied migrations as immutable. Add a forward migration; change an older one only when an ADR proves it was never deployable/applied and records the exception.

For money, access, publication, rate admission, or cleanup paths, validate migrated behavior on a disposable current PostgreSQL instance when possible. A file's presence never proves a migration, cron job, webhook, secret, bucket policy, or dashboard setting is live.

### Image Generation and Editing

Provider adapters may differ only at transport. All providers must converge on the same auth, ownership, entitlement, server-side reference resolution, rate admission, timeout/size bounds, raster decode, exact-dimension WebP, digest, watermark, storage, cleanup, and finalization contracts.

Never accept an arbitrary client object key, signed URL, filesystem path, or third-party URL as an authoritative reference source.

A preview never exposes clean bytes. Watermark failure or passthrough is a hard failure. Failed, blocked, rejected, or timed-out jobs release allowance state and remove intermediate/orphaned objects.

Preserve database-enforced free, purchased, per-user, per-artwork, and entitlement limits. Keep operational counts in authoritative migrations/tests, not this root file.

Clean generated access requires an active, paid, unexpired, non-revoked entitlement at request time.

### Frontend, Motion, Accessibility, and Security

Preserve the light, dark, and red theme contract and the shared static-motion eligibility contract. Update every producer, consumer, and contract test together when changing either.

Reduced-motion, coarse-pointer, keyboard-only, and small-viewport users must bypass blocking motion immediately and navigate without traps, hidden controls, or forced traversal of long pinned sequences.

Visual/motion work is incomplete until exercised in a real browser at representative desktop/mobile widths with keyboard navigation and reduced motion.

Maintain semantic HTML, unique IDs, visible focus, meaningful loading/error/empty states, and WCAG AA contrast across every theme.

Treat GSAP/Lenis/ScrollTrigger selectors, DOM IDs, custom events, storage keys, and media-query gates as cross-component APIs; search all producers/consumers before changing them.

Preserve CSP, security headers, private-route cache/noindex behavior, and production export isolation. Prefer honest failure/empty states over fake success.

## Verification

Run the smallest relevant check during iteration, then the required gate set before completion:

- **Unit/contract behavior**: bun run test
- **Type safety**: bun run typecheck
- **Lint**: bun run lint
- **Production export, catalog pruning, and isolation**: bun run build
- **Browser journeys**: bun run test:e2e
- **Standard non-E2E pipeline**: bun run verify — this does not include Playwright.

### Catalog changes
Also run bun run catalog:validate:metadata, bun run catalog:project:check, bun run catalog:launch:check, the relevant dry run, and the production build.

### Supabase changes
Run the relevant tests/verifiers named in supabase/README.md and migrated behavioral checks when the environment permits.

### Minimum by change class

- **Documentation only**: validate referenced paths/commands; broader gates only when an executable contract changes.
- **Normal application logic**: tests, typecheck, and lint.
- **UI/routes/themes/accessibility/motion**: application checks, production build, and relevant Playwright/browser inspection.
- **Catalog/deployable assets**: catalog gates, tests, and production build/export isolation.
- **Commerce/auth/RLS/storage/generation/webhooks/schedulers/migrations**: all applicable checks, full verification, targeted database/Edge validation, and affected E2E journeys.

**Production-ready claim**: satisfy every applicable item in .agent-state/RELEASE_GATES.md; never infer readiness from bun run verify alone.

## Stop-Ship Conditions

Treat as critical: any path that publishes unapproved/staging art or private bytes/metadata; lets the client control money or entitlement; weakens webhook identity, idempotency, locking, RLS, or durable revocation; edits applied migrations/generated catalog artifacts outside their sanctioned pipeline; bypasses generation validation/watermark/cleanup/rate limits; makes static export depend on a server or secret; or disables/dilutes a test, security assertion, pruning step, or isolation scan instead of fixing the defect.

## Definition of Done

- The requested behavior works end-to-end; no mock, placeholder, dead control, or fabricated success remains.
- Failure, retry, cleanup, concurrency, rights, security, and accessibility paths remain correct for the affected surface.
- Relevant tests were added/updated and every required gate passes with zero warnings or unexplained skips.
- Generated files came only from canonical tooling. The diff contains no secrets, private paths, accidental binary churn, unrelated rewrites, or stale duplicated documentation.
- Durable product/architecture changes update the owning README, contract, ADR, failure graph, or release gate. Ephemeral task state does not enter AGENTS.md.
- The final report lists exact files, commands/results, and every unrun check or live-service limitation.

## Maintenance

Add a root rule only when it is repository-wide, non-obvious, durable, and supported by a repeated failure or accepted decision. Prefer an executable guardrail—type, test, linter, schema constraint, migration, or script—over prose, then reference it here. Move subsystem procedures into the nearest scoped AGENTS.md or canonical README, and delete stale or duplicated rules immediately.
