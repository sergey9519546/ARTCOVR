# DECISION LOG — ARTCOVR

## Confirmed Decisions (From Plan Refinement)
1. Priority: Full-system readiness (user selected over narrower focus).
2. Pre-execution gate: Add Phase 0 adversarial inspection + failure-graph construction before execution sequence.
3. Durable memory: Create remaining files (`product-contract.md`, `issue-failure-graph.md`, `decision-log.md`, `quality-release-status.md`).
4. Theme authority: `light` authoritative; `red` deprecated but falls back to `light` safely.
5. Commerce verification: Sandbox/test-mode only for Stripe/webhook changes; no live transactions.
6. Catalog isolation: Clean originals never published to `public/`; approval/revocation contracts protected.

## Pending (To Resolve During Phase 0 / Execution)
- Which failure-graph findings become P0 vs P1 vs deferred?
- Specific dead routes/components to remove (negative-code pass evidence needed).
- Migration/state changes requiring rollback plan.
- Independent verifier selection method.
