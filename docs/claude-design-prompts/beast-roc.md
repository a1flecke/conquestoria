# Claude Design Prompt: Storm Roc (v2 DOM Sprite)

## Developer Instructions (do not copy into Claude Design)

**Output files:**
- `src/renderer/sprites/v2/beast_roc.svg.ts` — the HTML+SVG string
- `src/assets/roc-animations.css` — companion CSS

**After getting output:** say "here is the storm roc sprite" and paste both outputs. Claude Code will save them and add `import '@/assets/roc-animations.css';` to `src/main.ts`.

**Files to upload to Claude Design** (repo is private):
1. `src/renderer/sprites/v2/beast_wolf.svg.ts`
2. `src/assets/wolf-animations.css`
3. `src/assets/sprite-animations-v2.css`
4. `src/assets/basilisk-animations.css`

---

<role>
You are a senior SVG sprite artist producing hand-crafted game graphics for a medieval strategy game. You write clean, geometric SVG — no photorealism, no gradient meshes, no blur filters. Your work integrates directly into a production codebase as a raw HTML+SVG string.
</role>

<context>
**Project**: Conquestoria — an HTML5 Canvas + DOM strategy game. Medieval/ancient theme, Eras 1–4. Mobile-first, played by families including young children. Sprites appear on a hex tile map at 40–120 px.

**Format**: You are producing a **v2 DOM sprite** — a single HTML+SVG string stored in a TypeScript module:

```typescript
// Storm Roc — legendary beast (v2 DOM sprite).
// Animations driven by roc-animations.css via data-state / data-kind / data-damage.
export const svg: Record<string, string> = {
  beast: `<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="beast-winged" data-damage="0" style="--phase:0"><svg viewBox="0 0 128 128" width="100%" height="100%" data-state="idle" data-kind="beast-winged">…</svg></div>`,
};
```

`data-state` and `data-damage` are updated at runtime by `SpriteOverlay.sync()`. CSS animations are driven by attributes, NOT by JavaScript.

**Reference files**: Read all four uploaded files before writing anything:
1. `beast_wolf.svg.ts` — canonical v2 format reference; internalize the wrapper structure and wound groups
2. `wolf-animations.css` — companion CSS pattern; produce a matching CSS for this beast
3. `sprite-animations-v2.css` — shared animation library; the `[data-kind="beast-winged"]` rules at the bottom control wing-flap and hover-bob automatically
4. `basilisk-animations.css` — second companion CSS example
</context>

<design_system>
## Visual Language
- Flat geometric SVG. Medieval earthy tones. 2.5D perspective — not top-down, not full side-on.
- Ink line `#1f1a14` holds everything together. `strokeWidth="1"` on major outlines, `0.5–0.8` on detail.
- No gradients, no blur filters. Single highlight at `opacity="0.3–0.5"`.
- ViewBox: `0 0 128 128`

## Material Palette
```
skin:   warm=#d4a373  cool=#b08968  deep=#8a5a3c
metal:  iron=#5a6068  steel=#8a929b  bronze=#b8895a  gold=#d4a13c  shine=#e8edf2
wood:   light=#c19a6b  mid=#8a6a3a  dark=#5e3f24
stone:  light=#c4b8a4  mid=#9a8e78  dark=#6a5e4a
ground: grass=#7ea860  dirt=#a08260  sand=#d8c896  water=#3a6e94
ink:    line=#1f1a14   soft=#3a3228
blood:  #c43b2e
```

## Beast-Winged Animation Hooks
From `sprite-animations-v2.css`, these rules fire automatically when `data-kind="beast-winged"`:
- `.cq-wing-l` — left wing flaps on a 1.1s cycle; `transform-origin: 64px 60px`
- `.cq-wing-r` — right wing flaps on a 1.1s cycle (mirrored); `transform-origin: 64px 60px`
- `.cq-hover-body` — the body group bobs up/down on a 2.2s cycle
- `.cq-shadow-detached` — ground shadow is `scale(0.7) opacity(0.5)` to suggest altitude

Apply these class names to the correct groups. The wings animate automatically; you only need to place the groups correctly.

## Wound Visibility
Wound groups start hidden (`opacity: 0`) and are revealed by `data-damage` value:
- `.cq-wound-1` — visible at damage 1, 2, and 3
- `.cq-wound-2` — visible at damage 2 and 3
- `.cq-wound-3` — visible at damage 3 only

Follow the exact CSS pattern in `wolf-animations.css`.
</design_system>

<sprite>
## SPRITE — Storm Roc (`beast_roc`, `data-kind="beast-winged"`)

**Unit key**: `beast_roc`
**TypeScript file**: `src/renderer/sprites/v2/beast_roc.svg.ts`
**CSS file**: `src/assets/roc-animations.css`

### Concept
The Storm Roc is a living thunderstorm given feathers — a raptor the size of a warship that nests in mountain peaks and strikes with talons that crackle with static. It is airborne at all times; its shadow on the ground below is a warning. It is the second-highest-tier beast, visually massive and imposing while remaining a bird rather than a dragon.

### Visual brief
- **Silhouette**: A massive bird of prey seen from a ¾ angle, slightly above and to the right. The wings dominate — each should span roughly half the canvas width. The body is compact (raptor chest, short powerful neck), tilted slightly forward. The talons hang below, partially visible. A detached elliptical shadow is drawn on the ground below the body.
- **Body palette**: Steel-blue feathers `#5a6b8a`, dark wing coverts (top surface) `#3c4a63`, pale blue-grey belly `#8a9ab0`, golden hooked beak `#d9a23a`, amber eye `#d8b13a` with `#1f1a14` pupil, pale-blue lightning accent on wingtip edges `#9ed0ff`
- **Wing feathers**: Each wing should have 4–6 primary feather tips as distinct pointed shapes at the trailing edge, alternating between the main body color and slightly lighter. Add fine feather-shaft lines `strokeWidth="0.5"` fanning from the wing root.
- **Lightning accents**: A few short spark lines `#9ed0ff` `strokeWidth="1"` along the outer wingtip edge (2–3 per wing). These are static decoration, not animated.
- **Detached shadow**: A filled dark ellipse `fill="#1f1a14" opacity="0.3"` near the bottom of the canvas, narrower and offset to suggest the roc is flying 20m up. Assign class `cq-shadow-detached` — the CSS will scale and fade it.
- **Group structure**:
  - `cq-wing-l` — the entire left wing group (large swept wing)
  - `cq-wing-r` — the entire right wing group
  - `cq-hover-body` — the torso + head + talons group (this bobs up/down)
  - `cq-shadow-detached` — the ground shadow ellipse

### Damage tiers
- **cq-wound-1** (damage 1–3): A torn feather gap on the left wing — remove/break one of the primary feather tip shapes, add a ragged edge, `stroke="#c43b2e"` on the break
- **cq-wound-2** (damage 2–3): A slash across the breast — diagonal line `#c43b2e` `strokeWidth="3.2"` on the torso, plus 2–3 blood bead circles `r="1.3"` in `#c43b2e`
- **cq-wound-3** (damage 3 only): A broken primary feather hanging at the right wingtip — a dangling feather shape `#5a6b8a` `opacity="0.7"` disconnected from the wing edge, rotated as if drooping

### State behaviors (CSS only)
- **hurt**: Stagger — the `cq-hover-body` rotation snaps and recovers (add a `[data-state="hurt"] .cq-hover-body` rule with `animation: cq-recoil ... forwards` in the companion CSS)
- **hurt at damage 3**: Wings beat more slowly — reduce `animation-duration` on `cq-wing-l` and `cq-wing-r` by ~40%? No — **increase** duration (struggling to stay airborne)
</sprite>

<output_format>
Produce two outputs:

**Output 1 — TypeScript module** (`beast_roc.svg.ts`):
```typescript
// Storm Roc — legendary beast (v2 DOM sprite).
// Animations driven by roc-animations.css via data-state / data-kind / data-damage.
export const svg: Record<string, string> = {
  beast: `FULL_HTML_STRING_HERE`,
};
```

The HTML string must be a single continuous line (no literal newlines).

**Output 2 — Companion CSS** (`roc-animations.css`):
Follow the exact structure of `wolf-animations.css`:
1. Header comment block documenting the data-kind contract, group names, and wound class meanings
2. Note that the shared `[data-kind="beast-winged"]` rules in `sprite-animations-v2.css` handle the wing-flap and hover-bob — this file only needs roc-specific overrides
3. Hurt state modifiers (stagger, wing-speed changes at high damage)
4. Wound-visibility block

Output TypeScript module first, then CSS.
</output_format>

<style_checklist>
Before finalizing, verify:
- [ ] `data-kind="beast-winged"` on both the outer `<div>` and the `<svg>` element
- [ ] `data-state="idle"` and `data-damage="0"` set as initial values
- [ ] `style="--phase:0"` on the outer `<div>`
- [ ] Exactly four named groups: `cq-wing-l`, `cq-wing-r`, `cq-hover-body`, `cq-shadow-detached`
- [ ] `cq-wing-l` and `cq-wing-r` transform-origins must be set to approximately `64px 60px` (the shared wing root point) to match the CSS keyframe in `sprite-animations-v2.css`
- [ ] Three `cq-wound-*` groups present, each `<g class="cq-wound cq-wound-N">`
- [ ] Wound groups controlled by CSS (not inline opacity)
- [ ] Shadow ellipse assigned `cq-shadow-detached` — NOT inside `cq-hover-body` (the shadow stays on the ground while the body bobs)
- [ ] No gradients, no blur filters
- [ ] HTML string is a single continuous line
</style_checklist>
