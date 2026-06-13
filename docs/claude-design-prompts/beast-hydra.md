# Claude Design Prompt: Swamp Hydra (v2 DOM Sprite)

## Developer Instructions (do not copy into Claude Design)

**Output files:**
- `src/renderer/sprites/v2/beast_hydra.svg.ts` — the HTML+SVG string
- `src/assets/hydra-animations.css` — companion CSS

**After getting output:** say "here is the swamp hydra sprite" and paste both outputs. Claude Code will save them and add `import '@/assets/hydra-animations.css';` to `src/main.ts`.

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
// Swamp Hydra — legendary beast (v2 DOM sprite).
// Animations driven by hydra-animations.css via data-state / data-kind / data-damage.
export const svg: Record<string, string> = {
  beast: `<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="beast-serpent" data-damage="0" style="--phase:0"><svg viewBox="0 0 128 128" width="100%" height="100%" data-state="idle" data-kind="beast-serpent">…</svg></div>`,
};
```

`data-state` and `data-damage` are updated at runtime by `SpriteOverlay.sync()`. CSS animations are driven by attributes, NOT by JavaScript.

**Reference files**: Read all four uploaded files before writing anything:
1. `beast_wolf.svg.ts` — canonical v2 format reference; internalize the wrapper, group structure, and wound groups
2. `wolf-animations.css` — companion CSS pattern; produce a matching CSS for this beast
3. `sprite-animations-v2.css` — shared animation library; `[data-kind="beast-serpent"]` rules control segment undulation automatically
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

## Beast-Serpent Animation Hooks
From `sprite-animations-v2.css`, these rules fire automatically when `data-kind="beast-serpent"`:
- `.cq-segment-1` — undulates, phase offset 0
- `.cq-segment-2` — undulates, phase offset −0.3s
- `.cq-segment-3` — undulates, phase offset −0.6s

The keyframe is a lateral sway (X translate ±6px, slight rotate). Three phase-offset necks will appear to weave independently — this is the hydra's defining visual motion.

## Wound Visibility
Wound groups start hidden (`opacity: 0`) and are revealed by `data-damage` value:
- `.cq-wound-1` — visible at damage 1, 2, and 3
- `.cq-wound-2` — visible at damage 2 and 3
- `.cq-wound-3` — visible at damage 3 only

Follow the exact CSS pattern in `wolf-animations.css`.
</design_system>

<sprite>
## SPRITE — Swamp Hydra (`beast_hydra`, `data-kind="beast-serpent"`)

**Unit key**: `beast_hydra`
**TypeScript file**: `src/renderer/sprites/v2/beast_hydra.svg.ts`
**CSS file**: `src/assets/hydra-animations.css`

### Concept
The Swamp Hydra is a regenerating bog-horror — a squat, barrel-bodied beast half-submerged in murky water, with three serpentine necks rising from a shared body. Each neck bears a flat reptilian head with cold yellow-green slit eyes. It cannot be killed by chip damage; the wound-2 tier literally shows a severed neck stump, selling the fantasy that it *regenerates* those heads.

### Visual brief
- **Silhouette**: A broad, low, rounded barrel body in the center-bottom of the canvas, partially submerged (waterline at about y=80). Three necks rise from the body at different angles — the left neck leans left, the center neck rises straight up, the right neck leans right and slightly forward. Each neck ends in a flat reptilian head (wider than tall, like a snake's flattened skull). The body should feel heavy and immovable; the necks feel like independent animals.
- **Body palette**: Dark swamp-green scales `#4a6b4a`, deeper green underside `#2f4a2f`, pale lime belly highlight on the barrel body `#7e9a6a`, yellow-green slit eyes `#e0d34d` with `#1f1a14` pupil, ink outlines `#1f1a14`
- **Scale texture**: Overlapping scale arcs on the barrel body and necks, `stroke="#2f4a2f"` `strokeWidth="0.5"`, tightly packed. The belly of the barrel body is smooth (no scale lines).
- **Bog water**: A dark waterline strip `fill="#2f4a2f"` at y≈80, with a few `fill="#4a6b4a"` marsh-bubble circles (r 2–4) along the waterline. The body below the waterline is barely visible (lower opacity duplicate shapes `opacity="0.3"`).
- **Bog bubbles**: 3–4 small circles at the waterline, rising upward (static decoration, no class).
- **Segment assignment** (each neck+head is one segment group):
  - `cq-segment-1` — left neck + head
  - `cq-segment-2` — center neck + head (tallest)
  - `cq-segment-3` — right neck + head
  - The barrel body stays in the main `cq-sprite-figure` group without a segment class (static)

### Damage tiers
This beast has the most narrative damage states — the severed neck sells the regeneration mechanic:

- **cq-wound-1** (damage 1–3): Claw marks on the central neck (segment-2) — three diagonal scratch lines `#c43b2e` `strokeWidth="2.6"`, plus 1–2 blood bead circles `r="1.2"` 
- **cq-wound-2** (damage 2–3): **A severed neck stump** — replace the visual of the left neck's head with a bloody stump. In practice: add a flat oval/circle at the top of where cq-segment-1's neck ends, filled `#8a3a3a` (raw flesh), ringed with `#c43b2e` blood drips (`r="1"–"1.5"` circles), and a jagged torn-scale edge. The actual neck+head geometry stays in the SVG (it's inside cq-segment-1), but this cq-wound-2 group overlays a stump cap and blood at the neck tip position.
- **cq-wound-3** (damage 3 only): A second severed stump — the right neck (cq-segment-3) gets the same treatment as cq-wound-2. Only the center neck (cq-segment-2) still has its head. This is the near-death state: "almost there, it's regenerating."

### State behaviors (CSS only)
- **attack**: The center head (cq-segment-2) lunges — add `[data-state="attack"][data-kind="beast-serpent"] .cq-segment-2 { transform: translateX(12px) rotate(-8deg); }` in the companion CSS. Use `[data-kind="beast-serpent"]` scoped to avoid affecting sea serpent (or use a hydra-specific class on the body wrapper and scope that way — see below).
- **Scoping note**: The attack lunge and hurt severity rules must not conflict with sea-serpent or wurm states. Safest approach: add a `data-unit-type="beast_hydra"` attribute to the outer `<div>` in the HTML string, and scope CSS rules as `[data-unit-type="beast_hydra"][data-state="attack"] .cq-segment-2 { … }`. Add the same attribute to the sea-serpent and wurm sprites' outer `<div>` for future use.
- **hurt at damage 3**: All three necks snap back simultaneously — reduce segment animation-duration to suggest a full-body recoil
</sprite>

<output_format>
Produce two outputs:

**Output 1 — TypeScript module** (`beast_hydra.svg.ts`):
```typescript
// Swamp Hydra — legendary beast (v2 DOM sprite).
// Animations driven by hydra-animations.css via data-state / data-kind / data-damage.
export const svg: Record<string, string> = {
  beast: `FULL_HTML_STRING_HERE`,
};
```

The HTML string must be a single continuous line (no literal newlines).

**Output 2 — Companion CSS** (`hydra-animations.css`):
Follow the exact structure of `wolf-animations.css`:
1. Header comment block documenting data-kind, data-unit-type scoping strategy, states, and class contract
2. Attack lunge rule scoped to `[data-unit-type="beast_hydra"]`
3. Hurt state rules
4. Damage-severity rules
5. Wound-visibility block

Output TypeScript module first, then CSS.
</output_format>

<style_checklist>
Before finalizing, verify:
- [ ] `data-kind="beast-serpent"` on both the outer `<div>` and the `<svg>` element
- [ ] `data-unit-type="beast_hydra"` on the outer `<div>` (for CSS scoping)
- [ ] `data-state="idle"` and `data-damage="0"` set as initial values
- [ ] `style="--phase:0"` on the outer `<div>`
- [ ] Exactly three `cq-segment-*` groups (one per neck+head), classes 1, 2, 3
- [ ] The barrel body is NOT in a segment group
- [ ] Three `cq-wound-*` groups present, each `<g class="cq-wound cq-wound-N">`
- [ ] cq-wound-2 contains the severed-stump visual for the left neck position
- [ ] cq-wound-3 contains the severed-stump visual for the right neck position
- [ ] Wound groups controlled by CSS (not inline opacity)
- [ ] Attack lunge CSS scoped to `[data-unit-type="beast_hydra"]` to avoid conflicts
- [ ] No gradients, no blur filters
- [ ] HTML string is a single continuous line
</style_checklist>
