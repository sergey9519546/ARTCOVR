# Owner Follow-Ups

Outstanding launch blockers and operational items that require deployment,
credentials, or owner-controlled production changes. Tracked here so they survive
across sessions.

## [2026-09-04] LAUNCH BLOCKER — deployed storefront is a hydrated 404 shell

The live domain is no longer serving the hardened Next.js static export described
by this repository. Read-only HTTP and browser checks against `https://artcovr.com`
proved the following:

- raw HTML for `/`, `/archive/`, and a sitemap product URL declares `Page Not
  Found | ARTCOVR`, `noindex,nofollow,noarchive`, and the canonical `/404`;
- JavaScript repairs the homepage visually, but trailing-slash archive and product
  routes retain the 404 title/description/robots metadata after hydration;
- `sitemap.xml` advertises 196 URLs even though the server response tells crawlers
  not to index those pages;
- the production responses are missing the CSP and other security headers pinned
  by `vercel.json`; `/my-images` lacks `no-store` and `X-Robots-Tag: noindex`;
- `/favicon.ico` returns the HTML application shell as `text/html`, not image bytes.

The remote default branch `artcovr-storefront` is a separate Replit/Vite rewrite,
445 commits ahead of and incompatible with `main`. Its copied Bun CI and Supabase
deploy workflows no longer have the commands or active function tree they invoke.
The latest GitHub CI run for that branch (`33706490980`, commit `4014634`) failed
all three jobs before receiving a runner: GitHub annotated every job with “The
job was not started because your account is locked due to a billing issue.” This
is an account-level blocker, not a code-test result. By contrast, canonical
`main` at `b149ae6` passed its `verify`, PostgreSQL `database`, and `e2e` jobs in
run `33385854738`. Do not treat either the billing failure or a hydrated gallery
as deployment health.

An executable, read-only production check now captures this failure:

```powershell
bun run check:live
```

Done when the deployed target comes from the rights-gated `main` architecture,
`bun run check:live` exits 0, `bun run check:deployment` reports 9/9 functions,
and a Stripe test-mode purchase/refund/dispute journey proves settlement and
revocation end to end. Do not deploy the incompatible Replit backend as a shortcut.

## [2026-09-04] LAUNCH POSITIONING BLOCKER — native masters do not prove music-channel readiness

`bun run catalog:storage:plan` now hashes and decodes the exact private source
bytes before reporting dimension eligibility. It verified all 187 publishable
masters, but only 5 meet Apple's 1400px dimensional minimum, only 3 fall within
TuneCore's 1600–3000px dimension range, and none meet Apple's recommended
3000px size. The native range is 1024–2362px. The check does not establish RGB,
DPI/file-size, or content-dependent rules; public display derivatives are smaller
by design and are not the delivery source.

Current requirements: [Apple Music Album Cover Art Profile](https://help.apple.com/itc/videoaudioassetguide/en.lproj/static.html)
and [TuneCore cover-art requirements](https://support.tunecore.com/hc/en-au/articles/115006685728-What-are-TuneCore-s-cover-art-formatting-requirements).
Apple explicitly warns not to enlarge a smaller file just to meet its minimum.

Product pages now disclose the verified native dimensions before checkout, and
the storage plan computes dimension-qualified candidates from exact source bytes. Until
higher-resolution native replacements pass the full approval pipeline, do not
market the whole catalog as Apple Music-, TuneCore-, or distributor-ready. The
remaining blocker closes only when the sellable scope is limited to a proven
native-ready subset or reapproved masters satisfy the claimed channels.

## [2026-08-31] LAUNCH BLOCKER — 6 of 9 Edge Functions are not deployed
Probed against the live project `gcnamdbwekikkuqvzuko` using the public anon key
and HTTP OPTIONS (a CORS preflight — invokes no business logic, writes nothing).
Re-probed on 2026-09-04 with `SUPABASE_PROJECT_REF=gcnamdbwekikkuqvzuko bun run
check:deployment`; the result is unchanged: 3 deployed and the same 6 missing.

| Function | Live | Consequence if absent |
| :--- | :--- | :--- |
| `create-checkout` | **404** | **Nobody can start a purchase.** The buy button 404s. |
| `stripe-webhook` | **404** | **No payment could ever be fulfilled.** Stripe has nowhere to deliver. |
| `my-images` | **404** | A buyer cannot reach what they paid for. |
| `generation-status` | **404** | Preview/status polling fails. |
| `submit-inquiry` | **404** | Contact form dead. |
| `upload-reference` | **404** | User style references cannot be uploaded. |
| `generate-image` | 200 | deployed |
| `generation-watchdog` | 405 | deployed (rejects OPTIONS, as designed) |
| `commerce-watchdog` | 405 | deployed |

The storefront renders perfectly and all nine release gates were green when this
was found, because **every gate tests the repository and none looks at what is
actually running.** A static export in front of a 404 backend fails silently.

Note this contradicts the PR #2 note below, which records edge functions as
deployed and verified on 2026-08-15. Either the deployment was later removed or
partially rolled back. Worth understanding before redeploying.

- **Fix (one-click):** a `Deploy Edge Functions` workflow now exists
  (`.github/workflows/deploy-functions.yml`). One-time setup: create a Supabase
  access token (dashboard -> Account -> Access Tokens), save it as the repository
  secret `SUPABASE_ACCESS_TOKEN`, then run the workflow from the Actions tab. It
  defaults to a dry run; untick `dry_run` to apply. GitHub hands the token to the
  runner — nobody has to read or paste it anywhere else.
- Then point the Stripe webhook endpoint at the deployed `stripe-webhook` URL.
- Verify: `bun run check:deployment` (needs NEXT_PUBLIC_SUPABASE_URL and
  NEXT_PUBLIC_SUPABASE_ANON_KEY — both public browser values). Exit 0 = all deployed.
- Done when: that command reports 9 of 9 and a test purchase completes end to end.

**Until this is fixed, the site cannot take money.** It outranks every other item
in this file, including the rate-lane migration question — free traffic starving
paying customers is moot while there are no paying customers.

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

The 2026-08-28 no-watermark decision, previously recorded only in the header of
`Remove-DisplayWatermarkBands.ps1`, now has its own entry — **ADR-027**, which also pins the scope:
it governs catalog storefront displays only, and the image-generation watermark
(`rasterizePreview()` / `502 watermark_passthrough`) remains fully enforced. Nothing outstanding.

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
