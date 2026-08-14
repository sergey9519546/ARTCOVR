# RELEASE GATES — ARTCOVR

All release gates must pass before any version is marked production-ready.

| Gate | Requirement | Command / Check | Status |
| :--- | :--- | :--- | :--- |
| **G1: Unit & Contract Tests** | 100% test pass across 105 tests | `npm test` | **PASS** (105/105) |
| **G2: TypeScript Compilation** | Zero type errors | `npm run typecheck` | **PASS** (0 errors) |
| **G3: Code Quality & Lint** | Zero ESLint warnings / errors | `npm run lint` | **PASS** (0 warnings) |
| **G4: Production Build** | Zero SSG / dynamic route build errors | `npm run build` | **PASS** (0 errors) |
| **G5: Browser & E2E Tests** | All Playwright journeys pass | `npm run test:e2e` | **RUNNING / TARGET PASS** |
| **G6: Catalog Integrity** | Projection matches approved records | `npm run catalog:project:check` | **PASS** |
| **G7: Security Headers** | CSP, X-Frame-Options, noindex on staging | Automated contract test | **PASS** |
| **G8: Commerce Hardening** | Frozen checkout prices, dispute revocation | Backend integrity test | **PASS** |
