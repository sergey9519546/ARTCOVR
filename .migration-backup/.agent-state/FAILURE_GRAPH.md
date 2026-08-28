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
   - *Mitigation*: Dual-lane rate limiting at DB level (migration `202608140010`): 4/min free lane + 4/min purchased lane (independent advisory keys, up to 8/min combined), 6/10min per user, 24/24hr per user. Both lanes count only `('queued','running','succeeded')` rows.
4. **Stale Lock / Multi-Process Conflicts in Dev**:
   - *Risk*: Lingering `next dev` processes lock the configured dev build directory, and Playwright's managed Next server can hang during Windows teardown after tests have passed.
   - *Mitigation*: Browser behavior is verified against an explicitly managed server while the harness lifecycle is repaired. Process cleanup is limited to exact PIDs started by the current test run; never broadly terminate Node processes or delete an unverified lock.
5. **Delete-Tier Database Relisting**:
   - *Risk*: Audit-preserved removal rows retain historical approval booleans and could be inserted as `is_listed=true` by a metadata seed even though storefront/storage projections exclude them.
   - *Mitigation*: The canonical Supabase importer filters `tier: "delete"`; regression tests and the generated manifest require the database identity set to equal the 187-row public projection exactly.
6. **Clean Source Bytes in Public Derivative Paths**:
   - *Risk*: A public JPEG can be byte-identical to its recorded clean source SHA, bypassing the protected-preview boundary.
   - *Mitigation*: `bun run catalog:validate` compares every public display digest with its source digest and blocks publication on passthrough. Regeneration requires owner-reviewed protected derivatives; the validator must not be weakened and existing art must not be overwritten automatically.
