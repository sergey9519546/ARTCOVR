---
name: Clerk theme tokens
description: How embedded Clerk surfaces should stay legible across the storefront's light and dark themes.
---

Use the storefront's semantic CSS variables for Clerk foreground, background, input, border, and primary colors rather than hardcoded colors from either theme.

**Why:** The storefront can open in a light or dark theme, while Clerk's appearance object is shared. Hardcoded dark-theme text rendered nearly invisible when the sign-in route opened on the light paper background.

**How to apply:** Any Clerk appearance change should use the same semantic theme tokens as the surrounding page and be visually checked in both storefront themes.