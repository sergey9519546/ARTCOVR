---
name: Catalog intelligence joins
description: How ARTCOVR should organize visual metadata, search keywords, vectors, and related-work links.
---

Treat the image slug/filename as the stable join key across the catalog intelligence layers. Keep editorial metadata, visual descriptor labels, keyword aliases, vector identity, and related-work links connected to that key rather than flattening them into one opaque field.

**Why:** The attached explorer viewers separate these concerns into independently loadable assets, which makes filtering, ranked search, similarity, and analytics composable. ARTCOVR also needs its approval and commerce state isolated from discovery metadata.

**How to apply:** Use approved catalog records as the source of truth; derive searchable keyword aliases from editorial fields and audited visual labels; use vector-derived rank/related data for ordering and “similar” links; keep raw high-dimensional vectors out of the browser unless a user-visible feature truly needs them. An HTML viewer alone is only a wiring contract—actual metadata/vector payload files must be supplied separately before importing them, and missing payloads must report as incomplete rather than silently empty.

Treat external viewer payload scripts as untrusted data even when their hashes match a supplied manifest.

**Why:** A hash manifest proves that bytes match the manifest, not that either the manifest or payload came from a trusted signer. Executing matching JavaScript can still compromise the owner machine.

**How to apply:** Decode only a constrained declarative assignment/literal grammar and reject calls, functions, property access, operators, and additional statements. Do not use an in-process JavaScript VM as a security boundary.