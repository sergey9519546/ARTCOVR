# Guide source availability check

The normal storefront build and SEO validation do not make network requests to
external citation hosts. This keeps local development and ordinary releases
from failing because a government or document host is temporarily unavailable.

Run the opt-in check when reviewing guide citations or from a scheduled CI job:

```sh
pnpm --filter @workspace/artcovr run guides:sources:check
```

The command:

- validates first-party guide sources against the local public route metadata;
- checks external sources only when their declared URL uses HTTPS;
- accepts successful HTTP responses and redirects;
- retries hosts that reject `HEAD` with a bounded `GET` request;
- reports the guide path and source title for every failure; and
- exits nonzero when a citation is malformed, unavailable, or redirects to HTTP.

Use `ARTCOVR_GUIDE_SOURCE_TIMEOUT_MS` to adjust the per-source timeout in CI.
The default is 10 seconds.