# Claude Design Prompt: Sea Serpent (v2 DOM Sprite)

## Developer Instructions (do not copy into Claude Design)

**Output files:**
- `src/renderer/sprites/v2/beast_sea_serpent.svg.ts` — the HTML+SVG string
- `src/assets/sea-serpent-animations.css` — companion CSS

**After getting output:** say "here is the sea serpent sprite" and paste both outputs. Claude Code will save them and add `import '@/assets/sea-serpent-animations.css';` to `src/main.ts`.

**Reference files** (Claude Design will fetch these directly):

---

<role>
You are a senior SVG sprite artist producing hand-crafted game graphics for a medieval strategy game. You write clean, geometric SVG — no photorealism, no gradient meshes, no blur filters. Your work integrates directly into a production codebase as a raw HTML+SVG string.
</role>

<context>
**Project**: Conquestoria — an HTML5 Canvas + DOM strategy game. Medieval/ancient theme, Eras 1–4. Mobile-first, played by families including young children. Sprites appear on a hex tile map at 40–120 px.

**Format**: You are producing a **v2 DOM sprite** — a single HTML+SVG string stored in a TypeScript module. The format is:

```typescript
// sea-serpent — legendary beast (v2 DOM sprite).
// Animations driven by sea-serpent-animations.css via data-state / data-kind / data-damage.
export const svg: Record<string, string> = {
  beast: `<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="beast-serpent" data-damage="0" style="--phase:0"><svg viewBox="0 0 128 128" width="100%" height="100%" data-state="idle" data-kind="beast-serpent">…</svg></div>`,
};
```

`data-state` and `data-damage` are updated at runtime by `SpriteOverlay.sync()`. The CSS animations are driven by attributes, NOT by JavaScript — you add CSS class names to SVG groups and the stylesheet does the rest.

**Reference files**: Fetch and read all four URLs before writing anything:
1. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/v2/beast_wolf.svg.ts — canonical v2 format reference; internalize the group structure, wound groups, and HTML wrapper
2. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/wolf-animations.css — companion CSS pattern; you will produce a matching CSS for this beast
3. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/sprite-animations-v2.css — shared animation library; the `[data-kind="beast-serpent"]` rules at the bottom control segment undulation automatically
4. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/basilisk-animations.css — second companion CSS example
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
From `sprite-animations-v2.css`, the following rules fire automatically when `data-kind="beast-serpent"`:
- `.cq-segment-1` — undulates, phase offset 0
- `.cq-segment-2` — undulates, phase offset −0.3s
- `.cq-segment-3` — undulates, phase offset −0.6s
- `.cq-segment-4` — undulates, phase offset −0.9s

Apply these class names to your coil / body-section groups. The keyframe is a lateral sway (X translate ±6px, slight rotate). A segment can be a coil, a neck, or the head cluster — you choose what makes biological sense.

## Wound Visibility
Wound groups start hidden (`opacity: 0`) and are revealed by `data-damage` value:
- `.cq-wound-1` — visible at damage 1, 2, and 3
- `.cq-wound-2` — visible at damage 2 and 3
- `.cq-wound-3` — visible at damage 3 only

Follow the exact CSS pattern in `wolf-animations.css`.
</design_system>

<sprite>
## SPRITE — Sea Serpent (`beast_sea_serpent`, `data-kind="beast-serpent"`)

**Unit key**: `beast_sea_serpent`
**TypeScript file**: `src/renderer/sprites/v2/beast_sea_serpent.svg.ts`
**CSS file**: `src/assets/sea-serpent-animations.css`

### Concept
The Sea Serpent is a colossal ocean predator — three massive coils rising above a dark waterline, topped by a single rearing head with a tall crest fin and burning amber slit eyes. It has no legs, no arms — pure serpentine menace. It haunts deep ocean tiles and cannot be attacked by land units.

### Visual brief
- **Silhouette**: Three coils of decreasing height from left to right, culminating in a rearing head at the right. The leftmost coil is the thickest (tail-end), the rightmost is the neck arching into the head. A dark waterline strip at the base with light foam flecks.
- **Body palette**: Deep teal-blue main scales `#2e6e8c`, darker underbelly `#1c4a61`, cyan highlight fin accent `#5ec0d8`, amber slit eye `#ffd34d` with `#1f1a14` pupil slit
- **Scale texture**: Thin overlapping arc lines `strokeWidth="0.5"` in `#1c4a61` covering the body (follow basilisk's scale texture pattern)
- **Crest fin**: On the head, a tall dorsal fin in `#5ec0d8` with thin membrane lines. Assign class `cq-segment-4` to the head+fin group so it gets the most-delayed undulation phase — it sways as if sniffing the air.
- **Waterline**: A horizontal strip at y≈90 in `#1c4a61` with small `#5ec0d8` foam arcs. This is static (no class).
- **Segment assignment**:
  - `cq-segment-1` — leftmost / lowest coil (tail)
  - `cq-segment-2` — middle coil
  - `cq-segment-3` — rightmost coil (highest above water)
  - `cq-segment-4` — neck + head + crest fin

### Damage tiers
- **cq-wound-1** (damage 1–3): Three parallel slash marks `#c43b2e` on the mid-coil (segment-2 area), `strokeWidth="2.6"`, diagonal
- **cq-wound-2** (damage 2–3): A torn section of the crest fin — a ragged gap in the fin outline + 3 blood bead circles `r="1.3"` in `#c43b2e`
- **cq-wound-3** (damage 3 only): A cracked scale patch on the neck (segment-3/4 junction) — a jagged polygon in `#8a3a3a` (exposed flesh), outlined in `#1f1a14`

### State behaviors (CSS only — do not add JavaScript)
- **idle**: Segments undulate gently (handled by shared `beast-serpent` CSS)
- **hurt at damage ≥ 2**: Slightly faster undulation — add `[data-state="hurt"][data-damage="2"] .cq-sprite-figure` and `[data-state="hurt"][data-damage="3"]` rules in the companion CSS to reduce animation-duration, mirroring the wolf pattern
- **hurt at damage 3**: Head group tilts slightly (add `transform: rotate(5deg)` to `.cq-segment-4` via `[data-damage="3"][data-kind="beast-serpent"]`)
</sprite>

<output_format>
Produce two outputs:

**Output 1 — TypeScript module** (`beast_sea_serpent.svg.ts`):
```typescript
// Sea Serpent — legendary beast (v2 DOM sprite).
// Animations driven by sea-serpent-animations.css via data-state / data-kind / data-damage.
export const svg: Record<string, string> = {
  beast: `FULL_HTML_STRING_HERE`,
};
```

The HTML string must be a single line (no literal newlines inside the template literal — use `\n` if needed, or just make it one long string like the wolf file).

**Output 2 — Companion CSS** (`sea-serpent-animations.css`):
Follow the exact structure of `wolf-animations.css`:
1. Header comment block documenting the data-kind, states, and CSS class contract
2. State-specific rules for idle / walk / attack / hurt under `[data-kind="beast-serpent"]`
3. Damage-severity rules (`[data-state="hurt"][data-damage="3"]` etc.)
4. The wound-visibility block (`cq-wound-1/2/3` hidden by default, revealed by `data-damage`)

Output one at a time — TypeScript module first, then CSS.
</output_format>

<style_checklist>
Before finalizing, verify:
- [ ] `data-kind="beast-serpent"` on both the outer `<div>` and the `<svg>` element
- [ ] `data-state="idle"` and `data-damage="0"` set as initial values
- [ ] `style="--phase:0"` on the outer `<div>`
- [ ] All four `cq-segment-*` classes assigned to groups (exactly four, not three or five)
- [ ] Three `cq-wound-*` groups present, each wrapped in `<g class="cq-wound cq-wound-N">`
- [ ] Wound groups are `opacity: 0` by default in the companion CSS (NOT inline on the SVG — let CSS control it)
- [ ] No gradients, no filters, no `<image>` elements
- [ ] `stroke="#1f1a14"` on all major outlines
- [ ] HTML string is a single line (or properly escaped) so it can be stored as a JS string literal
- [ ] Companion CSS uses `[data-kind="beast-serpent"]` as the scope selector (not a class name)
</style_checklist>
