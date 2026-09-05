---
name: Artwork edit provider contract
description: The generation provider must receive the current artwork first and any uploaded identity photo as a supplemental image.
---

The image-edit request is artwork-led: the original artwork or latest generated result is always the first image input. An uploaded photo is a second, optional reference that can support likeness or person insertion when the prompt asks for it; it must never replace or indiscriminately blend over the artwork.

The image provider is direct OpenAI access using the workspace secret rather than the Replit-managed OpenAI proxy, because the managed model list does not include the requested GPT Image 2 model.

**Why:** ARTCOVR sells and edits specific cover artwork, so text-only generation or style-only treatment of a customer photo breaks the core product promise.

**How to apply:** Preserve artwork-first ordering through preview chaining, paid edits, reset-to-original, and multi-image provider calls. Keep exact title and artist instructions in the composed prompt, use GPT Image 2 for image edits, and retain existing entitlement, private-storage, allowance, watermark, and failure boundaries.