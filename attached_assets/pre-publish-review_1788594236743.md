---
name: Review before shipping
description: Use this skill before committing, opening a pull request, merging, deploying, or publishing, or when the user says the app is "done", "ready to ship", or "ready to go live".
---
**Activation:** On-demand — fires before merge/publish or when you say it's "ready." Agent-actionable: it runs the gate checks; the final ship decision is yours.

# Instructions

"It runs" is not "it's ready." Before telling the user an app is ready to merge or publish, work through this gate and resolve anything that fails. Do not declare it ready until each item holds.

- Secrets: no hardcoded credentials anywhere; every secret is read from an environment variable / Secret, and nothing secret is sent to the browser.
- Authorization: every per-user resource is scoped to its owner on the server, and a cross-user isolation test passes (one user cannot read or modify another's data; anonymous requests are rejected).
- Sensitive data: no PII or secrets written to logs; regulated data is minimized and protected; errors don't leak internal details to users.
- Dependencies: every dependency was verified to exist and is not a typosquat; the vulnerability audit is clean of unresolved high/critical advisories; licenses are acceptable for this product.
- Core flows verified: the main user journeys actually work when exercised in a real browser, not just compiled. On Replit, use App Testing where available.
- Production data: the app publishes against a production database, not the development database.
- Revertibility: destructive or hard-to-reverse changes (schema drops, irreversible migrations, breaking API changes) are isolated and considered; prefer additive, reversible changes.
- Deployment fit (Replit): pick the deployment type for the workload — Static for a pure frontend, Autoscale for most web apps and APIs, Reserved VM for always-on or websocket/worker apps, Scheduled for cron jobs — and turn on monitoring after publishing.

When done, give a short go / no-go summary listing each item as pass or fail. If anything fails, it is no-go — say so plainly instead of shipping.
