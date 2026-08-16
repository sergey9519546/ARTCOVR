# Owner Follow-Ups

Outstanding operational items requiring owner action. Not engineering defects —
tracked here so they survive across sessions.

## [2026-08-15] Rotate the Supabase access token — SECURITY
The access token `sbp_ca91…dfc8` (full value redacted from the session log)
was passed per-shell-call during the 2026-08-15 Supabase rollout and is now
captured in the session log. Rotate it before any further remote work.

- URL: https://supabase.com/dashboard/account/tokens
- Action: revoke the exposed token + create a new one.
- After rotation: update anywhere the token is stored (none on disk in this repo).
- Done when: the old token returns 403 on any `supabase` CLI call.

## [2026-08-15] Merge PR #2
PR #2 (`fix/audit-remediation-2026-08-15` -> `artcovr-storefront`) is OPEN and
ready for squash-merge. The branch now carries the full post-audit remediation:

- ADR-018 rights reconciliation + ADR-017/019 pricing (deferred -> owner-confirmed four-tier).
- Catalog expansion 100 -> 169 rows with proportional four-tier pricing
  ($200x17 / $80x34 / $35x51 / $10x67) and display `tier` (featured/archive/delete).
- Live Supabase rollout (11 migrations applied), watchdog crons + edge functions
  deployed and verified returning HTTP 200.
- Vercel-target cutover: `public/_headers` + `public/_redirects` removed, `vercel.json`
  headers/private-route redirects live.

URL: https://github.com/sergey9519546/ARTCOVR/pull/2
Verification: `npm run verify` green (144 pass / 0 fail), typecheck, lint, build clean.
Base is `artcovr-storefront`; no conflicts expected.
