# FRONTEND QUALITY STANDARDS

1. **Accessibility**: Full keyboard navigability, trapped focus on modals/drawers, no invisible keyboard traps, screen reader aria attributes.
2. **Contrast & Theming**: Support dark, light, and red themes. Ensure high contrast ratio on all buttons, headers, and interactive labels.
3. **Motion Hygiene**: Immediately bypass complex intro motion and scroll smoothing when `prefers-reduced-motion: reduce` or coarse pointers are detected.
4. **Responsive Layouts**: No horizontal page scrolling, fluid typography clamp, full image aspect ratios without layout shift.
5. **No Scripting Resilience**: All server-rendered content and links must render usefully when JavaScript is unavailable.
