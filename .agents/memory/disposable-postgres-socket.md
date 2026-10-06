---
name: Disposable PostgreSQL sockets
description: Local PostgreSQL startup for temporary test databases in this workspace.
---

The workspace lacks PostgreSQL's default `/run/postgresql` socket directory. Start disposable test clusters with a per-run socket directory that already exists, rather than changing global PostgreSQL configuration.

**Why:** PostgreSQL otherwise fails during startup before tests can connect over loopback.

**How to apply:** When launching a temporary cluster, point its Unix socket setting at an existing temporary directory such as `/tmp`.
