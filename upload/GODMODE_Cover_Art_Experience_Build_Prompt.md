# GODMODE build prompt — immersive cover-art commerce homepage

Copy everything inside the prompt block into the AI website-building agent.

```text
You are an elite 2026 digital creative director, motion designer, interaction designer, and senior frontend engineer. Build a genuinely high-end, responsive cover-art commerce homepage for SERGEY / EDITIONS. It must feel like one authored digital experience—not a normal ecommerce template with three animation demos pasted together.

BEGIN NOW. First give me a concise implementation plan, then immediately build. Do not stop at research, a wireframe, or a plan. Do not ask aesthetic questions unless a missing fact makes implementation impossible. Make strong, coherent creative decisions and verify the rendered result.

PRIMARY OUTCOME

Build Phase 1 only: one production-quality homepage that uses Sergey’s real local artwork and integrates three reference interaction systems into one continuous narrative:

1. a scroll-controlled tilted cover rail inspired by https://codepen.io/vii120/pen/VYmmdMK
2. an ORBIT → INDEX spatial archive inspired by https://pacomepertant.com/
3. a full-screen auto-panning finale inspired by https://cenitz.studio/

Use https://outfit.hellohello.is/ as the structural and art-direction reference for the ecommerce foundation: oversized typography, strict grid, irregular product composition, sharp rules, restrained motion, real negative space, and artwork treated as the product.

Study the live references before coding. Reproduce the interaction principles and pacing, not their proprietary branding, copy, assets, or source code. The result must be original to Sergey’s cover-art business.

If the attached “GODMODE BUILD — OUTFIT (all 3 acts chained)” prototype is available, treat it only as motion pseudocode. Do not ship it unchanged. Replace its clothing content, Unsplash images, fake 000–100 loader, mouse trail, CDN-only architecture, and input-trapping finale with the production system below.

THE GOVERNING IDEA

One artwork is the baton passed through the entire page.

The same selected square cover must remain visually continuous through:

THRESHOLD → TILTED RAIL → ORBIT ARCHIVE → INDEX → AUTO-CUT FINALE → COMMERCE RESOLVE

Do not reset to unrelated imagery between scenes. The surroundings transform; the selected artwork persists. This shared-object continuity is the signature interaction.

The emotional sequence is:

INTRIGUE → DISCOVERY → FOCUS → DIRECTION → RELEASE ENERGY → PURCHASE CONFIDENCE

SCOPE DISCIPLINE

Build the homepage experience completely. Do not build authentication, Stripe, credits infrastructure, AI generation, a canvas editor, admin, marketplace, or legal-document backend in this milestone. The homepage may link to future Archive, Licensing, Studio, and Bag routes, but it must not fake those systems.

The final homepage must still communicate a real product:

- artist-led, rights-reviewed cover foundations
- limited release licenses rather than vague “leases”
- controlled future AI direction, not unlimited prompt generation
- edition availability, starting price, and exact CTA
- no claim that buyers own the underlying copyright

LOCAL ARTWORK RULES

Before using any placeholder, search the available workspace/project for Sergey’s local .png, .jpg, .jpeg, .webp, .avif, and .tif artwork. Inspect the images visually and select 8–12 that form the strongest coherent drop.

- Real local artwork always outranks stock or generated replacement art.
- Never use Unsplash when suitable local artwork exists.
- Preserve every Source Master unchanged.
- Create optimized display derivatives non-destructively.
- Show cover art as a sharp-edged 1:1 square. If a source is not square, create a deliberate square crop derivative while retaining the untouched original.
- Never tint, blur, distort, recolor, place UI over, or bake labels into the artwork.
- A tiny 2–3% spatial bow may be used only while a cover is peripheral in ORBIT; the focused cover must become perfectly flat.
- Every generated or edited artwork result is one standalone image file. Never ask an image model for a collage, contact sheet, four-up grid, or multiple versions inside one file.
- If no local art is available, use neutral numbered square placeholders and clearly report the limitation. Do not invent fake inventory.

VISIBLE COPY LOCK

Use this copy above the fold. Do not invent an eyebrow, badge, fake metric, review count, or scarcity claim.

Brand:
SERGEY / EDITIONS

Navigation:
ARCHIVE
LICENSING
STUDIO
BAG 0

Hero headline:
START WITH ART.
DIRECT WHAT COMES NEXT.

Hero support:
License an original work from Sergey’s archive, shape an approved descendant for your release, and lock one documented final.

Primary action:
ENTER THE LATEST DROP

Secondary action:
HOW LICENSING WORKS

Scroll cue:
SCROLL TO AUDITION

Use these scene labels:

01 — THE DROP
02 — THE ARCHIVE
03 — RELEASE CUT

Use ORBIT / INDEX as the archive mode switch.

Use this representative active artwork metadata, adapting the title only if a better real local work has a clear title:

DEPARTURES
LIMITED RELEASE LICENSE
2 OF 3 AVAILABLE
INCLUDES 12 DIRECTION CREDITS
$225

Final actions:
AUDITION THIS COVER
VIEW RIGHTS

Do not use “buy ownership,” “one of one,” “exclusive,” or “unique AI output” unless the actual rights and inventory support it.

VISUAL DIRECTION

The page is a collision of a contemporary art archive, a high-fashion editorial catalogue, and a professional record-release tool.

Palette:

- Archive paper: #F3EEE6
- Carbon: #0B0B0B
- Signal red: #FF1E1E
- Quiet graphite: #74746F
- Clean transaction white: #FAFAF8

Typography:

- One heavy grotesk/display face for large statements, similar in authority to Archivo Black or a properly licensed equivalent
- One precise grotesk for interface and reading, similar to Space Grotesk / Neue Haas character
- One mono face with tabular numerals for editions, rights, price, progress, and artwork indices
- Hero display may use clamp(64px, 13vw, 220px), but preserve legible line breaks on small laptops
- Interface text is deliberately 11–14px; never fall back to browser-default control typography
- Uppercase is reserved for navigation, scene titles, and registry metadata

Geometry and layout:

- 12- or 16-column editorial grid
- Desktop gutters approximately 28–40px
- Thin 1px or 2px rules instead of card chrome
- Artwork has sharp corners
- Interface radius 0–4px except functional round carousel dots
- No bento grid
- No generic product cards
- No giant rounded wrappers
- No glassmorphism
- No neon gradients, purple AI glow, floating orb, chatbot mascot, sparkle icon, or fake sci-fi HUD
- No decorative pills or badges
- Use open planes, full-bleed scenes, rails, indices, and one precise commerce folio
- Let large negative space create tempo

Header:

- Fixed, minimal, approximately 72–92px high
- Brand left; four essential links right
- May use mix-blend-mode: difference only if a robust solid-color contrast fallback is also implemented
- Bag and license facts may never rely on hover

SCENE 0 — THRESHOLD

Purpose: establish that this is a serious art product before the spectacle begins.

- Full-height cream opening scene
- Oversized two-line hero statement
- One dominant real artwork occupying roughly 45–60% of the composition without covering the copy
- Minimal nav and two actions
- Masked letter-rise intro and a rule drawing into place; total entrance approximately 0.9–1.4 seconds
- No mandatory preloader
- No fake percentage counter
- No auto-playing sound
- The next scene must be visibly teased below the fold

SCENE 1 — TILTED COVER RAIL

Translate the CodePen behavior into a scroll-controlled rail of square record covers.

- Pin the scene for a finite distance; approximately 350–500vh depending on artwork count
- Vertical scroll advances a horizontal 3D sleeve rail
- Active sleeve is centered, full-scale, perfectly face-on
- Adjacent sleeves rotate approximately ±52° to ±60° around the Y axis and scale to approximately 0.85–0.88
- Use a perspective around 1200–1500px
- Only the active cover’s title, edition, license, and price resolve at full opacity
- Peripheral metadata fades and may blur by no more than 2–3px; artwork itself never blurs
- Use a spring-like but controlled settle, not bouncy toy motion
- Provide visible previous/next controls and stretching progress dots; clicking them must drive the same scroll position rather than create a separate state system
- Arrow Left/Right changes the active cover; Enter selects; focus remains visible
- Scroll snapping may be gentle after input stops, never aggressive while the user is moving
- Selecting or completing the rail passes the same active artwork into the next scene

Recommended transform model:

p = normalizedProgress * (artworkCount - 1)
d = artworkIndex - p
rotateY = clamp(d, -1.3, 1.3) * -56deg
scale = 1 - min(abs(d), 1) * 0.14

Keep these calculations in one motion controller rather than setting up conflicting scroll systems.

SCENE 2 — ORBIT ARCHIVE → INDEX

Translate Pacôme Pertant’s persistent spatial archive into a cover-art archive with two projections of the same dataset.

ORBIT state:

- Carbon-black full-screen field
- 8–12 square covers arranged on a restrained vertical helix/cylinder
- Scroll rotates and vertically advances the world around a mostly fixed camera
- One focused cover moves forward, becomes flat, and reveals commercial metadata outside the image
- Peripheral covers may use depth, occlusion, and scale but must remain recognizable
- Fixed switch at top: ORBIT / INDEX
- The selected artwork from the tilted rail remains the initial focused artwork

INDEX state:

- The exact same artwork records morph/recompose into a semantic DOM title index; do not remount unrelated data
- Large centered rows with title, license type, edition availability, and price
- Active row is full opacity; other rows approximately 0.35–0.45
- A square preview appears beside or behind the active row without compromising text contrast
- Hover can preview on pointer devices, but keyboard focus and tap must provide the same function
- Browser back/forward and direct navigation must remain usable

Suggested helix math:

theta_i = i * deltaTheta - progress * turnRate
y_i = i * pitch - progress * travel
x_i = radius * cos(theta_i)
z_i = radius * sin(theta_i)

Use one modeMix value from 0 to 1 to interpolate ORBIT transforms into INDEX transforms. Keep the semantic INDEX mounted as the accessibility and WebGL-failure fallback.

The final focused cover must expand/rectify into the finale using a shared-element or FLIP transition. Do not fade to a completely unrelated scene.

SCENE 3 — FULL-SCREEN AUTO-CUT FINALE

Translate Cenitz Studio’s full-screen auto-panning energy into a moving campaign wall for the current drop.

- The finale fills the viewport and changes the world to signal red
- A wide spatial canvas contains 12–16 elements: real square covers, large code-native words, edition numerals, short rights fragments, and thin rules
- No stock fashion photography
- Elements move horizontally at several restrained depth rates
- The active cover appears more than once only when each appearance has a clear proofing purpose: full sleeve, tiny streaming thumbnail, poster crop, or social crop
- Large code-native words may include SOURCE, TAKE, FINAL CUT, EDITION, RELEASE
- A thin top ticker may move at a different speed
- Apply subtle scale “breathing” only to large typographic objects, not the artwork
- Cull or park far-offscreen objects to protect performance

Auto-pan behavior:

- Auto-pan may begin when the scene is fully entered only after the user has already interacted with the page and only when reduced motion is off
- It must be pauseable and skippable
- Show PLAY / PAUSE and SKIP controls
- Escape exits immediately
- Wheel, trackpad, touch drag, and arrow keys may accelerate or scrub the world
- Never permanently prevent normal page navigation
- Never create a dead end or hidden exit
- If the user scrolls upward near the beginning, return to the Archive
- At the end, stop cleanly and reveal the commerce resolve; do not auto-redirect
- Pause animation on document visibility change
- Default silent; do not add sound unless explicitly requested later

Do not reproduce the attached prototype’s unconditional wheel/touch hijack. The experience must feel cinematic without trapping the visitor.

SCENE 4 — COMMERCE RESOLVE

Spectacle must end where purchase confidence begins.

- Resolve to clean Archive Paper or transaction white
- Keep the selected artwork large and unchanged on the left
- Place title, Limited Release License, edition availability, included direction credits, price, plain-language rights summary, and actions in one exact right-side folio
- Primary CTA: AUDITION THIS COVER
- Secondary action: VIEW RIGHTS
- No motion over legal or price comprehension beyond a short entrance under 300ms
- Below it, show a compact statement:

ARTIST-LED, RIGHTS-REVIEWED FOUNDATIONS.
VERIFIED HUMAN-AUTHORED WHERE DOCUMENTED.

- End with a severe typographic footer, not a generic multi-column SaaS footer

ONE MOTION SYSTEM

All three animation acts must share one scroll owner and one normalized motion bus.

- Use the existing project stack. If starting fresh, use React + TypeScript in the host’s standard production starter
- GSAP + ScrollTrigger is acceptable when installed locally
- Use at most one Lenis instance; native scroll is also acceptable
- Never create separate smooth-scroll engines for each act
- Route scroll updates through one requestAnimationFrame/GSAP ticker
- Store one activeArtworkId across the whole experience
- Use transform and opacity for continuous animation whenever possible
- Use IntersectionObserver/ScrollTrigger to boot and pause scenes
- Use ResizeObserver for measurements
- Clean up every listener, observer, timeline, RAF, texture, and animation on unmount
- Restore body overflow and scrolling after every exit path
- Do not use setInterval for animation
- Avoid layout reads and writes in the same frame loop
- CSS scroll timelines may be progressive enhancement only; they are not the sole implementation because support remains uneven

Recommended component architecture:

- HomeExperience
- FixedHeader
- Threshold
- TiltedCoverRail
- ArchiveScene
- OrbitArchive
- ReleaseIndex
- AutoCutFinale
- CommerceResolve
- MotionDirector hook/provider
- ArtworkImage
- ArtworkRegistry
- ReducedMotionExperience

Use one artworks data source containing:

- id
- title
- slug
- sourcePath/displayPath
- alt text
- editionTotal
- editionAvailable
- licenseLabel
- startingPrice
- accentColor
- cropPosition

Do not put the whole experience into one monolithic component.

RESPONSIVE COMPOSITION

Desktop ≥ 1024px:

- Full 3D rail and ORBIT depth
- 12/16-column grid
- Full auto-cut spatial wall

Tablet 768–1023px:

- Reduce visible rail neighbors and depth
- Use mutually exclusive ORBIT/INDEX layers
- Keep controls outside artwork

Mobile < 768px:

- Do not squeeze the desktop composition
- INDEX is the default archive view
- Tilted rail becomes a short horizontal/touch scrub with 3–5 visible covers and native page escape
- ORBIT becomes optional and shallow, or is replaced with the semantic Index if performance is weak
- Finale becomes a shorter horizontal campaign strip with Play/Pause/Skip; never lock vertical touch scrolling
- 44px minimum practical touch targets
- No hover-only information
- Preserve the selected cover and commerce resolve

REDUCED MOTION AND ACCESSIBILITY

Respect prefers-reduced-motion and also provide a visible Motion On/Off control.

Reduced-motion mode:

- No mandatory intro animation
- No pinned 3D rail
- No helix travel
- No auto-pan
- No parallax or pointer trail
- Use a native horizontal cover rail, semantic artwork index, direct scene cuts, and fades under 200ms
- Preserve all content, prices, rights, and actions

Accessibility:

- Semantic header, nav, main, sections, lists, figures, buttons, and headings
- Accurate alt text that describes artwork composition and mood
- Visible keyboard focus
- Arrow keys for rails/index, Enter to select, Space to play/pause, Escape to exit finale
- Roving tabindex or accessible listbox mirror for spatial navigation
- Announce the selected artwork and finale state without noisy continuous live-region updates
- Sufficient contrast in every theme
- No critical information in color alone
- Do not place UI text inside concept screenshots or raster assets in production; keep controls and content code-native

PERFORMANCE BAR

- LCP artwork ≤ 2.5 seconds on a realistic connection
- INP < 200ms target
- CLS < 0.1
- Aim for 55–60fps desktop; preserve usability on mobile even if 3D is simplified
- Use AVIF/WebP display derivatives and responsive sizes
- Eager-load only the first hero artwork; lazy-load the rest
- Preload only the next likely active cover
- Cap devicePixelRatio around 1.5 if WebGL is used
- Suspend offscreen animation and pause on visibilitychange
- DOM/CSS 3D is preferred if it achieves the required look; if WebGL is used, include an intentional DOM fallback and handle context failure
- Never load the editor, AI SDKs, or ecommerce backend on this homepage milestone

INTERACTION AND COMMERCE TRUTH

- Every visible button must work
- Carousel arrows/dots must change the real active artwork
- ORBIT / INDEX must switch the same data, not a fake overlay
- Play/Pause/Skip/Escape must work in the finale
- Selecting artwork must update the final Commerce Resolve
- Navigation anchors must move to real sections
- Future-route links may show a clearly designed “coming next” state, but never pretend checkout or AI generation is implemented
- Never hide price, edition availability, or license label behind hover
- Never use fake viewers, fake countdowns, fake testimonials, or fake social proof

BUILD ORDER

1. Inspect the four references and the attached motion prototype.
2. Inventory local artwork and choose the real drop.
3. Write the final five-scene choreography and one shared artwork data model.
4. Establish design tokens, typography, exact visible copy, and responsive rules.
5. Build the Threshold and Tilted Rail as the first coherent visible slice.
6. Verify that slice in a real browser before continuing.
7. Build ORBIT/INDEX and the shared-artwork handoff.
8. Build the safe, controllable Auto-Cut finale.
9. Build the Commerce Resolve and footer.
10. Verify desktop, tablet, mobile, keyboard, touch, reduced motion, WebGL failure if applicable, and route/scroll cleanup.
11. Repair every visible mismatch, clipped element, unreadable label, broken control, or scroll trap.
12. Deploy/checkpoint only after the complete homepage passes the acceptance gates.

Do not stop after step 3 or deliver only a plan.

ACCEPTANCE GATES

The build is not done until all are true:

- It looks like one original brand experience, not four cloned websites or three CodePens stacked vertically.
- The same selected square artwork visibly persists through every act.
- Real local artwork is used, or the absence of local artwork is explicitly reported.
- The first viewport clearly communicates premium cover-art licensing.
- The tilted rail has correct depth, active-state clarity, working controls, keyboard navigation, and no artwork blur.
- ORBIT and INDEX are two projections of the same records and switch smoothly.
- The finale auto-pans only under safe conditions and has visible Play/Pause/Skip plus Escape.
- The page never traps scrolling or leaves body overflow/listeners in a broken state.
- Mobile is deliberately recomposed rather than a compressed desktop.
- Reduced-motion mode is complete, useful, and contains every commercial fact.
- No generic cards, AI gradients, glows, pills, fake stats, fake scarcity, stock-fashion imagery, or placeholder product copy remain.
- Artwork is square, sharp, untinted, and free of overlaid interface chrome.
- Price, edition, license, and CTA remain understandable after the spectacle.
- All visible controls work.
- There are no console errors, missing assets, horizontal body overflow, accidental text wrapping, clipped primary content, or inaccessible focus states.
- Browser verification covers desktop and mobile plus the entire core path:

ENTER DROP → SCRUB RAIL → SELECT COVER → ORBIT/INDEX → PLAY/PAUSE/SKIP FINALE → AUDITION THIS COVER

FINAL HANDOFF

Return:

1. the live or preview URL
2. a concise statement of what was built
3. which local artworks were used
4. the tested desktop and mobile viewports
5. confirmation that reduced motion, keyboard navigation, Play/Pause/Skip/Escape, and scroll cleanup were verified
6. any intentional deviation from the references and why it improved usability or originality

Do not hand back a plan, pseudocode, an image-only mockup, or an unverified prototype. Build and verify the actual homepage experience.
```

