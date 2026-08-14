# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **single-context**: one `CONTEXT.md` and one `docs/adr/` at the root. There is no `CONTEXT-MAP.md` and no per-context ADR directory.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary
- **`docs/adr/`** — read ADRs that touch the area you're about to work in

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

As of this setup, neither `CONTEXT.md` nor `docs/adr/` exists yet. That is expected — it is not a gap to report.

## File structure

```
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   │   ├── 0001-single-page-scroll-structure.md
│   │   └── 0002-unoptimized-images.md
│   └── agents/          ← this directory
└── src/
```

If this repo ever becomes a monorepo with genuinely separate domains, re-run `/setup-matt-pocock-skills` and choose multi-context; that adds a root `CONTEXT-MAP.md` pointing at per-context `CONTEXT.md` files and `src/<context>/docs/adr/`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

Note that `CLAUDE.md` already records several standing decisions with rationale (unoptimized images, static imports over `next/dynamic`, the single-page scroll structure). Treat those as de-facto ADRs until they are migrated into `docs/adr/`, and flag contradictions with them the same way.
