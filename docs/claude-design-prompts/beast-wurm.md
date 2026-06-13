# Claude Design Prompt: Dune Wurm (v2 DOM Sprite)

## Developer Instructions (do not copy into Claude Design)

**Output files:**
- `src/renderer/sprites/v2/beast_wurm.svg.ts` — the HTML+SVG string
- `src/assets/wurm-animations.css` — companion CSS

**After getting output:** say "here is the dune wurm sprite" and paste both outputs. Claude Code will save them and add `import '@/assets/wurm-animations.css';` to `src/main.ts`.

**Reference files** (Claude Design will fetch these directly):

---

<role>
You are a senior SVG sprite artist producing hand-crafted game graphics for a medieval strategy game. You write clean, geometric SVG — no photorealism, no gradient meshes, no blur filters. Your work integrates directly into a production codebase as a raw HTML+SVG string.
</role>

<context>
**Project**: Conquestoria — an HTML5 Canvas + DOM strategy game. Medieval/ancient theme, Eras 1–4. Mobile-first, played by families including young children. Sprites appear on a hex tile map at 40–120 px.

**Format**: You are producing a **v2 DOM sprite** — a single HTML+SVG string stored in a TypeScript module. The format is:

```typescript
// Dune Wurm — legendary beast (v2 DOM sprite).
// Animations driven by wurm-animations.css via data-state / data-kind / data-damage.
export const svg: Record<string, string> = {
  beast: `<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="beast-serpent" data-damage="0" style="--phase:0"><svg viewBox="0 0 128 128" width="100%" height="100%" data-state="idle" data-kind="beast-serpent">…</svg></div>`,
};
```

`data-state` and `data-damage` are updated at runtime by `SpriteOverlay.sync()`. CSS animations are driven by attributes, NOT by JavaScript.

**Reference files**: Fetch and read all four URLs before writing anything:
1. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/v2/beast_wolf.svg.ts — canonical v2 format reference; internalize group structure and wound groups
2. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/wolf-animations.css — companion CSS pattern; produce a matching CSS for this beast
3. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/sprite-animations-v2.css — shared animation library; `[data-kind="beast-serpent"]` rules control segment undulation automatically
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
From `sprite-animations-v2.css`, these rules fire automatically when `data-kind="beast-serpent"`:
- `.cq-segment-1` — undulates, phase offset 0
- `.cq-segment-2` — undulates, phase offset −0.3s
- `.cq-segment-3` — undulates, phase offset −0.6s
- `.cq-segment-4` — undulates, phase offset −0.9s (optional — use only if you have a 4th element)

The keyframe is a lateral sway (X translate ±6px, slight rotate).

## Wound Visibility
Wound groups start hidden (`opacity: 0`) and are revealed by `data-damage` value:
- `.cq-wound-1` — visible at damage 1, 2, and 3
- `.cq-wound-2` — visible at damage 2 and 3
- `.cq-wound-3` — visible at damage 3 only

Follow the exact CSS pattern in `wolf-animations.css`.
</design_system>

<sprite>
## SPRITE — Dune Wurm (`beast_wurm`, `data-kind="beast-serpent"`)

**Unit key**: `beast_wurm`
**TypeScript file**: `src/renderer/sprites/v2/beast_wurm.svg.ts`
**CSS file**: `src/assets/wurm-animations.css`

### Concept
The Dune Wurm is a blind subterranean predator that erupts from desert sands to strike. It has no eyes (it senses vibration), no legs, an armored ringed body, and a terrifying tri-split maw — three jaw-plates that fan apart to reveal a blood-red interior and ivory teeth. It hunts by ambush and is indifferent to pain.

### Visual brief
- **Silhouette**: A thick armored body erupting from the ground at a forward arc — the base (bottom-left) disappears into a sand-spray burst, the body curves up and right, the maw opens at the top-right. No head per se — just the jaw apparatus at the tip. Should feel massive and powerful, like a freight train of chitin.
- **Body palette**: Sandy brown armored hide `#b08a52`, dark-brown underplates between rings `#84653a`, deep red maw interior `#5e2f2a`, ivory teeth/plates `#e8e0cc`. Ink outlines `#1f1a14`.
- **Ring texture**: The body is segmented by horizontal ring lines every ~10px along the arc — `stroke="#84653a"` `strokeWidth="1.5"` arcs perpendicular to the body axis. This is the defining visual feature.
- **Tri-split maw**: At the tip, three jaw-plates (left, center, right) that are **closed on idle** (pointing forward) and **fanned open on attack**. Model the closed state in the SVG. The jaw plates should be wedge-shaped polygons in `#b08a52` with `#e8e0cc` tooth-edges. The open state is CSS-driven (add `transform: rotate()` on each plate via the hurt/attack state in the companion CSS).
- **Sand eruption**: At the base where the body enters the ground, a scatter of small sand-colored triangles/blobs `#d8c896` and dust puffs. Static — no class.
- **Segment assignment** (for lateral sway):
  - `cq-segment-1` — lower body arc (from sand up to mid-body)
  - `cq-segment-2` — upper body arc (mid-body to the jaw)
  - The maw jaw-plates should NOT be in a segment group — they should be static (or in a named group for CSS attack state only)

### Damage tiers
- **cq-wound-1** (damage 1–3): A sand-caked slash across the lower body arc (segment-1) — two diagonal lines `#c43b2e` `strokeWidth="2.6"` with a sandy smear overlay `fill="#d8c896" opacity="0.4"`
- **cq-wound-2** (damage 2–3): A cracked ring segment — break the ring-line at mid-body, add a dark ooze drip `fill="#4a2a1a"` from the crack, plus 2 blood beads `r="1.3"` in `#c43b2e`
- **cq-wound-3** (damage 3 only): A partially crushed jaw plate — one of the three plates is broken and askew (use a rotated/deformed polygon in `#84653a` over the tip), plus a blood pool at the break

### State behaviors (CSS only)
- **attack state**: Fan the three jaw-plates open — add `[data-state="attack"][data-kind="beast-serpent"] .cq-wurm-jaw-left { transform: rotate(-25deg); transform-origin: …; }` etc. in the companion CSS. Name the jaw groups `cq-wurm-jaw-left`, `cq-wurm-jaw-center`, `cq-wurm-jaw-right` on the SVG.
- **hurt at damage 3**: Whole-body shudder — `animation-duration` reduction on the segment classes, mirroring the wolf pattern
</sprite>

<output_format>
Produce two outputs:

**Output 1 — TypeScript module** (`beast_wurm.svg.ts`):
```typescript
// Dune Wurm — legendary beast (v2 DOM sprite).
// Animations driven by wurm-animations.css via data-state / data-kind / data-damage.
export const svg: Record<string, string> = {
  beast: `FULL_HTML_STRING_HERE`,
};
```

The HTML string must be a single line (no literal newlines — make it one continuous string like the wolf file).

**Output 2 — Companion CSS** (`wurm-animations.css`):
Follow the exact structure of `wolf-animations.css`:
1. Header comment block documenting data-kind, states, and CSS class contract
2. State-specific rules (idle, walk, attack jaw-fan, hurt) under `[data-kind="beast-serpent"]` — use descendant selectors that won't conflict with sea serpent or hydra (use `[data-kind="beast-serpent"] .cq-wurm-*` for wurm-specific classes)
3. Damage-severity rules
4. Wound-visibility block

Output TypeScript module first, then CSS.
</output_format>

<style_checklist>
Before finalizing, verify:
- [ ] `data-kind="beast-serpent"` on both the outer `<div>` and the `<svg>` element
- [ ] `data-state="idle"` and `data-damage="0"` set as initial values
- [ ] `style="--phase:0"` on the outer `<div>`
- [ ] `cq-segment-1` and `cq-segment-2` assigned to the two body-arc groups
- [ ] Jaw-plate groups named `cq-wurm-jaw-left`, `cq-wurm-jaw-center`, `cq-wurm-jaw-right`
- [ ] Three `cq-wound-*` groups present, each `<g class="cq-wound cq-wound-N">`
- [ ] Wound groups controlled by CSS (not inline opacity)
- [ ] Attack jaw-fan transform-origins set precisely so plates pivot from their base, not their center
- [ ] No gradients, no blur filters
- [ ] HTML string is a single continuous line
</style_checklist>
