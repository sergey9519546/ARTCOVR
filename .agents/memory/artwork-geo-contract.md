---
name: Artwork GEO contract
description: Public artwork discovery and licensing signals that catalog changes must preserve.
---

Every public ARTCOVR cover must remain a first-class `ImageObject` tied to its canonical product page, with a descriptive caption, stable full-size and thumbnail URLs, intrinsic dimensions, attribution, license URL, and acquisition URL. The public sitemap must keep one image record per approved cover, while decorative animation duplicates stay silent to assistive technology.

**Why:** AI answer engines and image search need explicit entity, subject, attribution, and licensing relationships; repeating keyword-like alt text across decorative copies adds noise instead of authority.

**How to apply:** When adding or changing approved catalog media, update the shared image metadata builders and generated discovery files rather than hand-authoring route-specific schema. Keep archive and homepage collection graphs linked to the same canonical image IDs.