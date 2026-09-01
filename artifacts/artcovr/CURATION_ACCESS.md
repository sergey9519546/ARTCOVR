# Protected curation access

The `/catalog-intelligence` workspace is protected in two layers:

1. The web app requires a signed-in Clerk session before rendering the page.
2. The API route `/api/owner/catalog-intelligence` requires that Clerk subject
   to appear in the server-only `ARTCOVR_CURATION_USER_IDS` comma-separated
   allowlist.

An empty or missing allowlist denies every user. This is intentional: a normal
customer account must not become an owner/admin account by visiting a route or
editing browser state. The allowlist should be configured separately for the
development and production API environments.

The workspace uses only the approved public catalog plus aggregate intelligence
records. It exposes no raw vectors, private prompts, local source paths, or
unapproved staging works. Duplicate review remains unavailable until the
validated `duplicates.js` payload is supplied; the UI never infers or mutates
duplicate records as a fallback.