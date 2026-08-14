# FAILURE GRAPH — ARTCOVR

```
┌───────────────────────────────┐
│     Observed Failure Mode     │
└───────────────┬───────────────┘
                │
                ├───────────────────────────────────────────────────────┐
                ▼                                                       ▼
┌───────────────────────────────┐                       ┌───────────────────────────────┐
│  Theme Token Drop Regression  │                       │   Intro Diversity Failure     │
│  - Globals.css missed red     │                       │  - Sorting algorithm bunched  │
│    variant & --color-red      │                       │    same category artworks     │
│  - useTheme omitted 'red'     │                       │  - Failed category spread     │
│  - ThemeSwitcher missing 'red'│                       │    contract test              │
└───────────────┬───────────────┘                       └───────────────┬───────────────┘
                │                                                       │
                ▼                                                       ▼
┌───────────────────────────────┐                       ┌───────────────────────────────┐
│       Root Cause Solved       │                       │       Root Cause Solved       │
│  - Restored @custom-variant   │                       │  - Implemented category       │
│    red, CSS tokens, and       │                       │    round-robin selection      │
│    useTheme state management  │                       │    in pickIntroArtworks       │
└───────────────────────────────┘                       └───────────────────────────────┘
```

## Potential Systemic Failure Paths & Mitigations
1. **Double Sell on Exclusive Artworks**:
   - *Risk*: Concurrent checkout completions could fulfill the same exclusive artwork twice.
   - *Mitigation*: DB migration `202608130008_backend_integrity.sql` enforces `FOR UPDATE` lock on `artworks` table prior to purchase update, and validates `sale_mode` and availability in an atomic transaction.
2. **Chargeback / Refund Exploit**:
   - *Risk*: Customer downloads high-res asset after requesting chargeback.
   - *Mitigation*: Stripe webhook for `charge.dispute.created` immediately revokes access via `revoke_purchase_access` RPC, nullifying all future clean download signatures.
3. **Infinite AI Generation Abuse**:
   - *Risk*: Bot or malicious user exhausts GPU generation quota.
   - *Mitigation*: Dual-tier rate limiting enforced directly at the Edge Function / DB level: 4/min globally, 6/10min per user, 24/24hr per user.
4. **Stale Lock / Multi-Process Conflicts in Dev**:
   - *Risk*: Lingering `next dev` processes lock `.next/dev/lock` causing E2E tests to fail startup.
   - *Mitigation*: Graceful lock clean-up and process cleanup before launching background dev test server.
