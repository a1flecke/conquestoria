# Claude Design Prompt: Ancient Dragon (v2 DOM Sprite)

## Developer Instructions (do not copy into Claude Design)

**Output files:**
- `src/renderer/sprites/v2/beast_dragon.svg.ts` — the HTML+SVG string
- `src/assets/dragon-animations.css` — companion CSS

**After getting output:** paste both outputs here. Claude Code will save them, wire `beast_dragon` into `src/renderer/sprites/v2/index.ts`, and add `import '@/assets/dragon-animations.css';` to `src/main.ts`.

**Reference files** (Claude Design will fetch these directly):

---

<role>
You are a senior SVG sprite artist producing hand-crafted game graphics for a medieval strategy game. You write clean, geometric SVG — no photorealism, no gradient meshes, no blur filters. Your work integrates directly into a production codebase as a raw HTML+SVG string.
</role>

<context>
**Project**: Conquestoria — an HTML5 Canvas + DOM strategy game. Medieval/ancient theme, Eras 1–4. Mobile-first, played by families including young children. Sprites appear on a hex tile map at 40–120 px.

**Format**: You are producing a **v2 DOM sprite** — a single HTML+SVG string stored in a TypeScript module:

```typescript
// Ancient Dragon — legendary beast (v2 DOM sprite).
// Animations driven by dragon-animations.css via data-state / data-kind / data-damage.
export const svg: Record<string, string> = {
  beast: `<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="beast-winged" data-unit-type="beast_dragon" data-damage="0" style="--phase:0"><svg viewBox="0 0 128 128" width="100%" height="100%" data-state="idle" data-kind="beast-winged">…</svg></div>`,
};
```

`data-state` and `data-damage` are updated at runtime by `SpriteOverlay.sync()`. CSS animations are driven by attributes, NOT by JavaScript.

**Reference files**: Fetch and read all four URLs before writing anything:
1. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/v2/beast_roc.svg.ts — canonical beast-winged rig reference; internalize the wrapper structure, wing groups, and wound groups
2. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/roc-animations.css — companion CSS pattern for beast-winged; produce a matching CSS for the dragon
3. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/sprite-animations-v2.css — shared animation library; the `[data-kind="beast-winged"]` rules control wing-flap and hover-bob automatically
4. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/v2/beast_wolf.svg.ts — additional v2 format reference for wound groups
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

## Dragon-Specific Palette
```
scale-body:    #1c1c2e   (obsidian-black main scales)
scale-dark:    #0d0d1a   (shadow/crevice between scales)
scale-accent:  #7a1a1a   (deep crimson scale highlights along spine and wings)
underbelly:    #c8860a   (molten-gold underbelly plates)
wing-membrane: #d45a0a   (ember-orange inner wing membrane)
horn:          #e8e0cc   (pale ivory horns and spines)
eye-glow:      #fff4c8   (white-hot eye with ember core)
fire-ember:    #ff7c2a   (fire breath/ember glow at jaw)
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

Follow the exact CSS pattern in `roc-animations.css`.
</design_system>

<sprite>
## SPRITE — Ancient Dragon (`beast_dragon`, `data-kind="beast-winged"`)

**Unit key**: `beast_dragon`
**TypeScript file**: `src/renderer/sprites/v2/beast_dragon.svg.ts`
**CSS file**: `src/assets/dragon-animations.css`

### Concept
The Ancient Dragon is the apex boss of Conquestoria — a colossal serpentine beast that erupts from a volcanic lair in Era 4. It dwarfs all other creatures: twice the visual mass of the Storm Roc. Four muscular legs, massive swept wings, a long horned neck, and a heavy spiked tail. It is airborne, its shadow falling on the world below as a portent of doom. Its jaw glows with contained fire, ready to breathe at 2-hex range.

### Visual brief
- **Silhouette**: A colossal serpentine dragon seen from a ¾ angle, slightly above and to the right. The wings dominate — each should span roughly half the canvas width, wider and more bat-like than the roc's bird wings. The body is massive: thick serpentine neck, broad chest, four visible muscular legs, heavy spiked tail curving down and to one side. A detached elliptical shadow on the ground below. The dragon should feel **twice as heavy** as the roc — use thicker strokes and larger body mass.
- **Body scales**: Obsidian-black body `#1c1c2e` with shadow crevices `#0d0d1a` along scale edges. Add deep crimson accent lines `#7a1a1a` along the spine ridge and leading wing edge (not fill — thin stroke lines suggesting scale iridescence).
- **Underbelly**: The chest/belly area visible in the ¾ view should show molten-gold underbelly plates `#c8860a` — a series of overlapping rectangular/oval plate shapes lighter than the body.
- **Wings**: Bat-like, leathery. The outer frame of each wing is `#1c1c2e` (same dark scale). The inner membrane between the wing-finger bones should be `#d45a0a` (ember-orange), giving the wings a glowing-from-within appearance when viewed from below. Add 3–4 dark wing-finger bones `#0d0d1a` as radial lines dividing the membrane.
- **Head and horns**: Broad, angular head with a prominent lower jaw. Two swept-back horns `#e8e0cc` rising from the skull, and a row of smaller neck spines continuing down the back. Eyes: a white-hot core `#fff4c8` ringed with `#ff7c2a` ember orange — they glow.
- **Fire breath jaw**: At the lower jaw/mouth area, add a compact ember-glow cluster — small overlapping ellipses in `#ff7c2a` and `#fff4c8` with low opacity (0.4–0.6), suggesting fire held in the throat. This is most visible on the attack state.
- **Four legs**: Suggest all four legs even partially — the two front legs angled forward and slightly down (as if mid-hover), the two hind legs folded up and back. Each leg ends in 3 dark talons `#1c1c2e` with a hint of claw tip in `#c8860a`.
- **Tail**: A heavy spiked tail trailing behind and below, ending in a cluster of `#e8e0cc` spines.
- **Detached shadow**: A filled dark ellipse `fill="#1f1a14" opacity="0.3"` near the bottom of the canvas, larger than the roc's shadow to match the dragon's apex scale. Assign class `cq-shadow-detached`.
- **Group structure**:
  - `cq-wing-l` — the entire left wing group (large bat-wing shape)
  - `cq-wing-r` — the entire right wing group
  - `cq-hover-body` — torso + head + neck + legs + tail group (bobs up/down)
  - `cq-shadow-detached` — the ground shadow ellipse (stays on ground, does NOT bob)

### Damage tiers
- **cq-wound-1** (damage 1–3): Cracked scale plates on one shoulder — a jagged break pattern `stroke="#c43b2e"` on the upper left body, exposing a reddish underlayer
- **cq-wound-2** (damage 2–3): A deep gash across the neck exposing ember-glow beneath — a diagonal slash `#c43b2e` `strokeWidth="3.2"` with a thin inner line `#ff7c2a` (the ember showing through), plus 2–3 blood beads `r="1.3"` in `#c43b2e`
- **cq-wound-3** (damage 3 only): A broken horn (`#e8e0cc` horn stub with a jagged break) + torn wing membrane (a triangular tear `#d45a0a` `opacity="0.6"` missing from the right wing membrane, with scorch marks `#1f1a14` at the tear edge)

### State behaviors (CSS only)
- **hurt**: Stagger — add a `[data-state="hurt"] .cq-hover-body` rule with a recoil animation (head snaps back, then recovers)
- **hurt at damage 3**: Wing beats slow significantly — at `data-damage="3"]` increase `cq-wing-l` and `cq-wing-r` animation duration by ~50% (struggling to stay airborne)
- **attack (jaw ember glow)**: Add `[data-state="attack"] .cq-jaw-ember { opacity: 0.9; }` to make the fire-breath jaw glow brighten on attack. Assign class `cq-jaw-ember` to the ember-glow group at the jaw.
</sprite>

<output_format>
Produce two outputs:

**Output 1 — TypeScript module** (`beast_dragon.svg.ts`):
```typescript
// Ancient Dragon — legendary beast (v2 DOM sprite).
// Animations driven by dragon-animations.css via data-state / data-kind / data-damage.
export const svg: Record<string, string> = {
  beast: `FULL_HTML_STRING_HERE`,
};
```

The HTML string must be a single continuous line (no literal newlines).

**Output 2 — Companion CSS** (`dragon-animations.css`):
Follow the exact structure of `roc-animations.css`:
1. Header comment block documenting the data-kind contract, group names, and wound class meanings
2. Note that the shared `[data-kind="beast-winged"]` rules in `sprite-animations-v2.css` handle wing-flap and hover-bob — this file only needs dragon-specific overrides
3. Hurt state: stagger recoil on `cq-hover-body`
4. Attack state: `cq-jaw-ember` brightens
5. Damage-3 wing slowdown
6. Wound-visibility block

Output TypeScript module first, then CSS.
</output_format>

<style_checklist>
Before finalizing, verify:
- [ ] `data-kind="beast-winged"` on both the outer `<div>` and the `<svg>` element
- [ ] `data-unit-type="beast_dragon"` on the outer `<div>`
- [ ] `data-state="idle"` and `data-damage="0"` set as initial values
- [ ] `style="--phase:0"` on the outer `<div>`
- [ ] Exactly four named groups: `cq-wing-l`, `cq-wing-r`, `cq-hover-body`, `cq-shadow-detached`
- [ ] `cq-shadow-detached` is a direct sibling of `cq-hover-body`, NOT nested inside it
- [ ] `cq-wing-l` and `cq-wing-r` transform-origins approximately `64px 60px` (to match shared CSS keyframe)
- [ ] Three `cq-wound-*` groups present, each `<g class="cq-wound cq-wound-N">`
- [ ] Wound groups controlled by CSS (not inline opacity)
- [ ] `cq-jaw-ember` group present inside `cq-hover-body` at the jaw area
- [ ] No gradients, no blur filters
- [ ] HTML string is a single continuous line
- [ ] Dragon visually heavier/larger than the roc — thicker strokes, wider wing span, larger body mass
</style_checklist>
