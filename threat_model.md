# Threat Model

## Project Overview

ARTCOVR is a publicly deployed art storefront. The React/Vite browser app in `artifacts/artcovr` uses Clerk for sign-in and calls the Express 5 API in `artifacts/api-server`. The API uses Drizzle ORM with PostgreSQL for checkout orders and credit ledger records, and calls Stripe through the Replit connector for catalog, Checkout Sessions, and webhook-event retrieval. The deployment is public at `https://artcovr.com` and `https://artcovr.replit.app`.

## Assets

- **Clerk identities and sessions** -- compromise permits access to a customer's purchase history and account-scoped entitlements.
- **Orders, payment references, and credit ledger entries** -- order state, paid status, Stripe IDs, customer email, and included credits represent purchased value and personal data.
- **Stripe integration credentials and operations** -- the server-side connector permits creating Checkout Sessions and managing the configured Stripe catalog and webhook endpoint.
- **Curated artwork catalog and licensing state** -- publication, rights approval, price, and sale mode determine what may be sold and under what terms.
- **Curation access** -- the explicit server-side allowlist protects internal catalog-intelligence access.

## Trust Boundaries

- **Browser to API** -- all request bodies, headers, cookies, URLs, and client-side state are attacker-controlled; protected operations must rely on verified Clerk identity, not client-supplied user IDs or UI guards.
- **API to PostgreSQL** -- order and ledger queries cross into persistent business state and must be parameterized and scoped to the authenticated subject.
- **API to Stripe** -- server requests carry privileged connector credentials; checkout amounts and fulfillment must be bound to server-side catalog data and verified Stripe events.
- **Public to authenticated** -- health, catalog browsing, and checkout initiation have different exposure; account and curation routes require server-side authentication, with curation additionally bound to an allowlist.
- **Production edge to Clerk proxy** -- forwarded host/protocol headers and proxy responses cross the deployment boundary; the proxy must not become an attacker-controlled redirect or secret-disclosure mechanism.
- **Production to dev/legacy content** -- `.migration-backup` and mockup tooling are not production surfaces unless deployment configuration proves otherwise.

## Scan Anchors

- Production API: `artifacts/api-server/src/app.ts`, `src/index.ts`, `src/routes/{account,commerce,intelligence,health}.ts`, `src/middlewares/{auth,clerkProxyMiddleware}.ts`.
- Highest-risk flows: `src/routes/commerce.ts`, `src/commerceService.ts`, `src/stripeClient.ts`, `src/webhookHandlers.ts`, and `lib/db/src/schema/artcovr.ts`.
- Public routes include health and checkout initiation's public catalog lookup; account and curation APIs are authenticated, with curation additionally restricted by `ARTCOVR_CURATION_USER_IDS`; Stripe webhook is public but must be verified through Stripe retrieval.
- Browser surfaces are in `artifacts/artcovr/src`; `.migration-backup` and `artifacts/mockup-sandbox` are dev/legacy and should normally be ignored.

## Threat Categories

### Spoofing

Clerk must validate the session on every protected API request, and account data must be selected using the verified Clerk subject. Stripe webhook events must be retrieved and authenticated by the server-side Stripe integration rather than trusting an attacker-supplied event body or signature alone. Sessions and proxy configuration must not allow host/header confusion to impersonate another origin.

### Tampering

Checkout prices, sale mode, license terms, and included credits must be derived from the server catalog and persisted order, not from client-supplied values. Fulfillment must update only the order bound to the verified Stripe Checkout Session and grant credits idempotently for a paid event. SQL queries must remain parameterized and sensitive state changes must be authorization-scoped.

### Information Disclosure

Customer order responses must be filtered to the authenticated Clerk subject and use private, non-cacheable responses. Stripe credentials, database connection details, and internal curation data must never reach browser bundles, logs, or unauthenticated responses. Error messages must not disclose secrets or unnecessary internal state.

### Denial of Service

Public webhook, checkout, and proxy paths can be reached without application authentication, so request body handling, external Stripe calls, and pagination should have bounded resource use and sensible failure behavior. This scan prioritizes vulnerabilities with material production impact over generic rate-limit advice.

### Elevation of Privilege

The curation allowlist is a server-side authorization boundary and must not be replaceable by a client role or query parameter. No account, order, credit, catalog, or Stripe-management action may be reachable by a lower-privileged or wrong-user subject through raw identifiers, alternate routes, or mass assignment. All sensitive operations require an authenticated subject and exact object/scope checks.
