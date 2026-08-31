# Owner Follow-Ups

Outstanding operational items requiring owner action. Not engineering defects —
tracked here so they survive across sessions.

## [2026-08-31] Public preview ceiling — RESOLVED (ADR-026)
Root-caused and closed. Public displays were emitted at two resolutions with no rule
deciding which; the split correlated **100% with source format** (27 `image/jpeg` sources
downscaled to 1024; 43 `image/png` sources left at full master resolution, zero exceptions).
`PUBLIC_ASSET_PASSTHROUGH` compares bytes, and a PNG→JPEG conversion always changes bytes,
so it could only ever catch JPEG-mastered works — those were remediated to 1024 by
`Fix-PassthroughDisplays.ps1`; the PNG-mastered ones were invisible to it.

Owner decision: ceiling raised to **1280**, protection remains the lossy re-encode. No asset
re-encoded (all are already ≤ 1280). `PUBLIC_DISPLAY_MAX_DIMENSION` in
`scripts/catalog/display-contract.ts` is now the single source of truth across
`validate.ts`, `finalize-owner-approved-batch.ts` and `swap-launch-works.ts`;
`validatePublication` bounds dimensions directly and runs in `verify`/`verify:ci`. See ADR-026.

Remaining, if the owner wants it: the 2026-08-28 no-watermark decision lives only in the header
of `Remove-DisplayWatermarkBands.ps1` and has no ADR. ADR-026 restates it, but a dedicated ADR
would properly pin the protection model.

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
