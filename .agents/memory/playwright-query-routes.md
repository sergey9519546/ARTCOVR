---
name: Playwright query interception
description: Browser test route matching for API requests that include query parameters
---

Playwright route patterns that mock API requests with query parameters must include a trailing wildcard after the path, such as `**/resource**`; an exact path pattern can let the query request reach the real service.

**Why:** A cursor-based request can silently bypass the mock, producing misleading authentication failures instead of exercising the browser behavior under test.

**How to apply:** Use the trailing wildcard for paginated, filtered, or otherwise query-bearing API mocks, and keep exact-path patterns only for endpoints that never add a query string.