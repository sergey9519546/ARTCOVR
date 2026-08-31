# Owner Follow-Ups

Outstanding operational items requiring owner action. Not engineering defects —
tracked here so they survive across sessions.

## [2026-08-31] Public previews match master resolution — RIGHTS/PRICING
Measured, not inferred. Of the 70 published works whose source dimensions are
recorded in `catalog/curated-artworks.json`:

- **43 have a public preview at the exact pixel dimensions of their private master**
  (ratio 1.00 — e.g. `cart-of-hours`, `cyan-passage`, `camera-tears` at 1280x1280).
- 27 fall between 80% and 99% of source. **None** is below 80%.
- Across all 187 published derivatives: 108 are 1280x1280, 4 are 1254x1254, 75 are
  1024x1024 — so 112 exceed the "protected 1024px JPEG derivative" contract recorded
  in `.agent-state/DECISIONS.md:36`.

The only thing separating the free preview from the licensed master for those works is
JPEG re-encoding. `PUBLIC_ASSET_PASSTHROUGH` in `scripts/catalog/validate.ts:135` cannot
catch this: it compares SHA-256 only, so a same-resolution re-encode passes.

Deliberately not auto-fixed — choosing the derivative ceiling is a commercial decision,
and re-rendering 187 public assets must go through the canonical catalog pipeline.

- Decide the public derivative ceiling (the 1024px contract, or a new documented value).
- Re-render the affected derivatives via the catalog pipeline; refresh projection SHAs.
- Then extend `validatePublication` to fail when a public derivative's dimensions are
  >= the recorded source dimensions, so byte-inequality is no longer the only guard.
- Done when: `bun run catalog:validate` enforces the dimension bound and passes.

## [2026-08-31] Clean masters were tracked in git — untracked, still in history
21 of the 84 files in `outputs/catalog/regen-picks-2026-08-14/` (194 MB) are
byte-identical to the `sourceSha256` values in
`supabase/seed/artworks.approved.manifest.json` — i.e. the clean masters of 21 live,
priced works (*The Verdigris Skull*, *City of Copper Facades*, *Last Light Market*, …),
the same bytes served from the private paywalled `artworks/art_*/base` objects.

They are now untracked and gitignored, so they leave the working tip. **They remain in
git history**, reachable from any clone. The repository is private with 0 forks, which
bounds the exposure today.

- Owner decision required: purge from history (git-filter-repo / BFG) — a destructive
  history rewrite that invalidates every existing clone — or accept the risk while the
  repository stays private.
- Done when: either the purge is complete, or an ADR records the accepted exception.

## [2026-08-15] Rotate the Supabase access token — SECURITY
The access token `sbp_ca91…dfc8` (full value redacted from the session log)
was passed per-shell-call during the 2026-08-15 Supabase rollout and is now
captured in the session log. Rotate it before any further remote work.

- URL: https://supabase.com/dashboard/account/tokens
- Action: revoke the exposed token + create a new one.
- After rotation: update anywhere the token is stored (none on disk in this repo).
- Done when: the old token returns 403 on any `supabase` CLI call.

## [2026-08-15] PR #2 Merged (was OPEN)
PR #2 (`fix/audit-remediation-2026-08-15` -> `artcovr-storefront`) was **MERGED as `04184c7`** on 2026-08-15.
The squash-merge carried the full post-audit remediation:

- ADR-018 rights reconciliation + ADR-017/019 pricing (deferred → owner-confirmed four-tier).
- Catalog expansion 100 → 169 rows with proportional four-tier pricing
  ($200×17 / $80×34 / $35×51 / $10×67) and display `tier` (featured/archive/delete).
- Live Supabase rollout (11 migrations applied), watchdog crons + edge functions
  deployed and verified returning HTTP 200.
- Vercel-target cutover: `public/_headers` + `public/_redirects` removed, `vercel.json`
  headers/private-route redirects live.

URL: https://github.com/sergey9519546/ARTCOVR/pull/2
Verification: `npm run verify` green (144 pass / 0 fail), typecheck, lint, build clean.
