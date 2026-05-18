# Pike Thrust + Quadruped Gait — Design

## Context

The v2 sprite animation system in `src/assets/sprite-animations-v2.css` provides a single attack animation (`cq2-attack-swing`) for all melee units: an overhead slash that rotates the weapon ~98° around the shoulder pivot. This reads correctly for a swordsman but is wrong for a pikeman, whose weapon should thrust forward along its shaft axis, not arc.

Separately, the v2 system has no quadruped gait. The two hound units (ScoutHound, WarHound) currently rely on `cq2-walk-body` and have no `cq-leg-*` class hooks defined in CSS, so their legs are static while the body bobs. Their inner `<g>` leg groups are already structurally in place (outer translate + inner `<g>`) — only class names and keyframes are missing.

This spec covers two coordinated animation additions:

1. A pike-specific weapon thrust that overrides the default slash for `[data-kind-variant="pike"]`.
2. A new `data-kind="quadruped"` body plan with diagonal-pair leg articulation and two variants (`scout`, `war`) that distinguish the two hound units by mass and tempo.

## Design taxonomy: `data-kind` vs `data-kind-variant`

Before either feature, codify the existing-but-unwritten rule:

- **`data-kind`** is the **body-plan axis**. Values determine which fundamental walk/idle/attack animations apply. Current values: `melee`, `ranged`, `naval`. New value: `quadruped`. Rule of thumb: if it changes how the body itself moves, it's a new kind.
- **`data-kind-variant`** is the **specialization axis**. Same body plan, different sub-element animation (weapon, gait tempo, etc.). New values: `pike` (melee variant), `scout` and `war` (quadruped variants). Rule of thumb: if it only changes one sub-element animation while the body stays the same, it's a variant.

This convention is documented as a CSS comment block in `sprite-animations-v2.css` so future contributors don't reinvent the rule.

## Feature 1: Pike thrust

### Selector

```css
.cq-v2[data-state="attack"][data-kind-variant="pike"] .cq-weapon
```

This selector has higher specificity than the default `.cq-v2[data-state="attack"] .cq-weapon` rule, so it overrides the slash without needing to suppress the default.

### Wrapper change

The pikeman SVG wrapper currently has:

```html
<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="melee" style="--phase:0">
```

It must add `data-kind-variant="pike"`:

```html
<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="melee" data-kind-variant="pike" style="--phase:0">
```

The inner `<svg>` element also carries `data-state` and `data-kind`; for consistency it should also carry `data-kind-variant="pike"`.

### Translation axis

The pike inner group sits at `transform="translate(54 22) rotate(-8)"`. The shaft is a `<rect x="-1" y="0" width="2" height="100">` running along the local +Y axis; the spear tip is a triangle around `y=-18` (local -Y). So the shaft's "extend forward" direction is local -Y (toward the tip).

The thrust translates **on the inner group** along that local -Y axis. We do NOT rotate. We do NOT translate `.cq-weapon` in viewBox coords (which would be world-frame, not shaft-frame). The translation lives on the inner group so that if the rest-pose rotation is later tuned, the thrust direction follows automatically.

### Implementation: target the inner group, not `.cq-weapon`

The pike's rest pose `transform="translate(54 22) rotate(-8)"` lives on the inner `<g>`, NOT on `.cq-weapon` itself. Animating `.cq-weapon` directly would either ignore the rest pose (animation runs in viewBox coords, not shaft-local) or require pre-baking the rest transform into every keyframe stop (six stops to update if the rest pose ever changes).

**Solution:** add `class="cq-weapon-inner"` to the inner `<g>` in the pikeman SVG, and animate that class. The outer `.cq-weapon` still owns the `--pivot-x`/`--pivot-y` for any future hybrid moves; the inner group owns the rest pose + thrust translation. The CSS keyframe stays simple (only `translate(0, Ypx)`) because the rest transform composes in from the SVG attribute.

### Keyframes

```css
.cq-v2[data-state="attack"][data-kind-variant="pike"] .cq-weapon-inner {
  animation: cq2-attack-pike-thrust 1.4s cubic-bezier(.3,.7,.4,1) infinite;
  animation-delay: calc(var(--phase, 0) * -1.4s);
  transform-box: fill-box;
}

@keyframes cq2-attack-pike-thrust {
  0%   { transform: translate(0, 0); }
  18%  { transform: translate(0, 2px); }
  32%  { transform: translate(0, -10px); }
  48%  { transform: translate(0, -10px); }
  72%  { transform: translate(0, -2px); }
  100% { transform: translate(0, 0); }
}
```

The existing rest `transform="translate(54 22) rotate(-8)"` SVG attribute combines with the CSS transform on the inner group via standard SVG transform composition.

### Default slash suppression

Because the `[data-kind-variant="pike"]` selector targets `.cq-weapon-inner` (a different element than `.cq-weapon`), the default `cq2-attack-swing` rule on `.cq-weapon` will still try to rotate the outer group. We need to suppress it for pikes:

```css
.cq-v2[data-state="attack"][data-kind-variant="pike"] .cq-weapon {
  animation: none;
}
```

This mirrors the existing pattern at line 211 (`.cq-v2[data-state="walk"] .cq-weapon { animation: none; }`).

### Easing and timing

- Duration: `1.4s` — matches `cq2-attack-body`, `cq2-attack-offhand`, `cq2-plume-attack`, `cq2-hit-spark`. Pike timing must sync with the body lunge so the thrust apex coincides with the body's strike frame (32%).
- Easing: `cubic-bezier(.3,.7,.4,1)` — same as `cq2-attack-body`. The thrust accelerates fast then settles into the hold, which is how a real polearm strike feels.

### What stays unchanged

- `cq2-attack-body` (body wind-back, lunge, hold, recover) — still applies.
- `cq2-attack-offhand` (off-hand brace) — still applies. Off-hand is on the haft; bracing inward is correct for a two-handed pike.
- `cq2-plume-attack`, `cq2-hit-spark`, `cq2-cape-attack` — still apply. The hit spark fires at 32–48%, matching the thrust apex.

## Feature 2: Quadruped gait

### Wrapper change

Both hound SVG files (`src/renderer/sprites/v2/scout_hound.svg.ts`, `src/renderer/sprites/v2/war_hound.svg.ts`) update the wrapper:

```html
<!-- scout_hound -->
<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="quadruped" data-kind-variant="scout" style="--phase:0">

<!-- war_hound -->
<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="quadruped" data-kind-variant="war" style="--phase:0">
```

Same change mirrored on the inner `<svg>` element.

### Class hooks on leg groups

Each hound sprite has four leg groups already structured as `<g transform="translate(<x> <y>)"><g>...</g></g>`. The inner `<g>` of each gets a leg class:

- `cq-leg-fl` — front-left (visible-side front leg)
- `cq-leg-fr` — front-right (far-side front leg)
- `cq-leg-bl` — back-left (visible-side back leg)
- `cq-leg-br` — back-right (far-side back leg)

Front-vs-back is determined by which end of the body has the head. Left-vs-right is the standard convention (viewer's perspective; "left" = closer to the foreground in a side-on sprite). The exact mapping per sprite is established by inspecting the existing translate offsets in the JSX/SVG and applying the four classes; this is a sprite-by-sprite assignment, not a global rule.

### Diagonal-pair gait keyframes

A natural dog trot pairs FL+BR (phase A) and FR+BL (phase B), offset by half the cycle. Pivot at the top of each leg (`transform-origin: 50% 0%`).

```css
.cq-v2[data-kind="quadruped"] .cq-leg-fl,
.cq-v2[data-kind="quadruped"] .cq-leg-fr,
.cq-v2[data-kind="quadruped"] .cq-leg-bl,
.cq-v2[data-kind="quadruped"] .cq-leg-br {
  transform-box: fill-box;
  transform-origin: 50% 0%;
}

@keyframes cq2-quad-leg-a {
  0%, 100% { transform: rotate(-10deg); }
  50%      { transform: rotate(14deg); }
}
@keyframes cq2-quad-leg-b {
  0%, 100% { transform: rotate(14deg); }
  50%      { transform: rotate(-10deg); }
}
```

Range `-10° back / +14° fwd` is the **ScoutHound default**. WarHound overrides this to `-8° / +12°` (see variants section).

Diagonal pairs share the same animation; the offset is achieved by giving phase-B legs an animation-delay of half the cycle:

```css
.cq-v2[data-kind="quadruped"][data-state="walk"] .cq-leg-fl,
.cq-v2[data-kind="quadruped"][data-state="walk"] .cq-leg-br {
  animation: cq2-quad-leg-a var(--quad-walk-cycle, 0.6s) cubic-bezier(.4,0,.6,1) infinite;
  animation-delay: calc(var(--phase, 0) * var(--quad-walk-cycle, 0.6s) * -1);
}
.cq-v2[data-kind="quadruped"][data-state="walk"] .cq-leg-fr,
.cq-v2[data-kind="quadruped"][data-state="walk"] .cq-leg-bl {
  animation: cq2-quad-leg-b var(--quad-walk-cycle, 0.6s) cubic-bezier(.4,0,.6,1) infinite;
  animation-delay: calc(var(--phase, 0) * var(--quad-walk-cycle, 0.6s) * -1);
}
```

The phase-offset between pairs is handled by using two different keyframes (A starts back-extended, B starts forward-extended), which is equivalent to a 50% animation-delay but composes correctly with the `--phase` desync offset.

### Quadruped body bob (overrides humanoid walk)

The humanoid `cq2-walk-body` (rotate ±2°, scaleY 0.96↔1.04, translateY -3.2px) is wrong for a dog: too much vertical, too much torso roll. Quadrupeds need a flatter bob, no torso rotation, no squash.

```css
@keyframes cq2-quad-walk-body {
  0%, 100% { transform: translateY(0); }
  25%      { transform: translateY(var(--quad-bob, -1.5px)); }
  50%      { transform: translateY(0); }
  75%      { transform: translateY(var(--quad-bob, -1.5px)); }
}

.cq-v2[data-kind="quadruped"][data-state="walk"] .cq-sprite-figure {
  animation: cq2-quad-walk-body var(--quad-walk-cycle, 0.6s) ease-in-out infinite;
  animation-delay: calc(var(--phase, 0) * var(--quad-walk-cycle, 0.6s) * -1);
}
```

Two bob peaks per cycle because the body lifts each time a diagonal pair lands — quadrupeds have twice the landing frequency of bipeds at the same cycle length.

### Quadruped attack: lunge

Override `cq2-attack-body` for quadrupeds with a forward lunge (no torso rotation, no scaleX twist). Head leads the body — no separate head animation needed since it moves with the figure.

```css
@keyframes cq2-quad-attack-body {
  0%   { transform: translate(0, 0); }
  18%  { transform: translate(-3px, 2px); }                                /* crouch back */
  32%  { transform: translate(var(--quad-lunge, 8px), 0); }                /* strike lunge */
  48%  { transform: translate(var(--quad-lunge, 8px), 0); }                /* hold */
  72%  { transform: translate(1px, 1px); }                                 /* recover */
  100% { transform: translate(0, 0); }
}

.cq-v2[data-kind="quadruped"][data-state="attack"] .cq-sprite-figure {
  animation: cq2-quad-attack-body var(--quad-attack-cycle, 1.4s) cubic-bezier(.3,.7,.4,1) infinite;
  animation-delay: calc(var(--phase, 0) * var(--quad-attack-cycle, 1.4s) * -1);
}
```

During attack, leg swing is suppressed so the body lunge reads clearly (otherwise swinging legs visually fight the forward thrust):

```css
.cq-v2[data-kind="quadruped"][data-state="attack"] .cq-leg-fl,
.cq-v2[data-kind="quadruped"][data-state="attack"] .cq-leg-fr,
.cq-v2[data-kind="quadruped"][data-state="attack"] .cq-leg-bl,
.cq-v2[data-kind="quadruped"][data-state="attack"] .cq-leg-br {
  animation: none;
}
```

The existing `cq2-hit-spark` still fires at 32–48% if a hit spark element is present in the hound SVGs (no change needed — selector is `[data-state="attack"]`, kind-agnostic).

### Quadruped idle

Bipedal `cq2-breathe` is approximately fine for a quadruped (slow rise/fall reads as breathing whether you have 2 or 4 legs). But the scaleY component looks wrong on a horizontal body. Override:

```css
@keyframes cq2-quad-breathe {
  0%, 100% { transform: translateY(0); }
  45%      { transform: translateY(-0.8px); }
  70%      { transform: translateY(-0.3px); }
}

.cq-v2[data-kind="quadruped"][data-state="idle"] .cq-sprite-figure {
  animation: cq2-quad-breathe 3.2s cubic-bezier(.4,0,.2,1) infinite;
  animation-delay: calc(var(--phase, 0) * -3.2s);
}
```

Shadow breathing (`cq2-shadow-breathe`) and shadow walk pulse (`cq2-walk-shadow`) still apply unchanged — they're kind-agnostic.

### Variants: scout vs war

The differentiation lives in CSS variables on the variant-scoped selectors, not in parallel keyframe sets. Keeps the keyframes singular and the differences explicit.

```css
/* ScoutHound: light, fast, snappy */
.cq-v2[data-kind="quadruped"][data-kind-variant="scout"] {
  --quad-walk-cycle: 0.5s;
  --quad-bob: -1px;
  --quad-attack-cycle: 1.2s;
  --quad-lunge: 9px;
}

/* WarHound: heavy, slow, committed */
.cq-v2[data-kind="quadruped"][data-kind-variant="war"] {
  --quad-walk-cycle: 0.75s;
  --quad-bob: -2px;
  --quad-attack-cycle: 1.6s;
  --quad-lunge: 6px;
}
```

For the WarHound's tighter leg rotation range (`-8° / +12°` vs ScoutHound's `-10° / +14°`), override the keyframes via a variant-scoped duplicate keyframe is overkill. Instead, scale the rotation via a CSS variable inside the keyframes:

```css
@keyframes cq2-quad-leg-a {
  0%, 100% { transform: rotate(calc(-10deg * var(--quad-leg-scale, 1))); }
  50%      { transform: rotate(calc(14deg * var(--quad-leg-scale, 1))); }
}
@keyframes cq2-quad-leg-b {
  0%, 100% { transform: rotate(calc(14deg * var(--quad-leg-scale, 1))); }
  50%      { transform: rotate(calc(-10deg * var(--quad-leg-scale, 1))); }
}
```

Then WarHound sets `--quad-leg-scale: 0.85` (approximately scales `±10–14°` to `±8.5–12°`, close enough to the target range). ScoutHound uses the default `1`.

The attack hold duration delta (ScoutHound 8 frames, WarHound 16 frames) is implicit in the `--quad-attack-cycle` ratio: keyframe 48% is always "hold ends," so a 1.2s cycle gives a shorter absolute hold than a 1.6s cycle for the same percentage span.

## Files touched

1. **`src/assets/sprite-animations-v2.css`** — add the pike thrust selector + keyframes; add the entire quadruped section (idle, walk-body, leg-a, leg-b, attack-body, attack-suppress-legs, variant variable definitions). Document the `data-kind` vs `data-kind-variant` convention as a comment block.

2. **`src/renderer/sprites/v2/pikeman.svg.ts`** — add `data-kind-variant="pike"` to the wrapper `<div>` and inner `<svg>` for all six faction variants; add `class="cq-weapon-inner"` to the inner `<g>` of the `.cq-weapon` group.

3. **`src/renderer/sprites/v2/scout_hound.svg.ts`** — add `data-kind="quadruped" data-kind-variant="scout"` to wrapper + inner SVG; assign `cq-leg-fl`, `cq-leg-fr`, `cq-leg-bl`, `cq-leg-br` classes to the four existing inner leg `<g>` elements.

4. **`src/renderer/sprites/v2/war_hound.svg.ts`** — same as scout_hound but with `data-kind-variant="war"`.

5. **Source JSX (if pikeman/hound sprites are also defined as JSX in `units.tsx`)** — apply equivalent changes so re-serialization via `scripts/serialize-sprites.mjs` reproduces the manual SVG edits. The SVG `.ts` files are auto-generated; the JSX source is the system of record.

## Verification

This is a CSS/SVG visual change with no logic or test coverage required at the unit-test level. Verification is browser-based:

1. Run `bash scripts/run-with-mise.sh yarn dev` and open the dev server.
2. Spawn a pikeman, a ScoutHound, and a WarHound in a test game.
3. Trigger combat for the pikeman against an enemy unit. Confirm: the pike thrusts forward along its shaft axis (tip moves up-and-out, then back), no overhead slash.
4. Move both hounds. Confirm: ScoutHound legs swing in diagonal pairs at a faster, snappier tempo; WarHound legs swing in diagonal pairs at a slower, heavier tempo with shorter rotation arcs.
5. Trigger combat for both hounds. Confirm: each lunges forward (no leg swing during attack), with ScoutHound lunging farther and faster, WarHound lunging shorter but holding the strike longer.
6. Confirm reduced-motion media query still kills all animations (the existing `prefers-reduced-motion: reduce` block at line 417 should handle the new keyframes via the universal `.cq-v2 *` selector).

Sprite-catalog tests (`tests/renderer/sprites/sprite-catalog.test.ts`) should continue to pass since no catalog entries change. Run `yarn build` and `yarn test` to confirm zero regressions before any PR.

## Out of scope

- Other polearm units beyond Pikeman (Halberdier, Spearman if added later) — they can opt into `data-kind-variant="pike"` once they exist, but no other current unit needs this animation.
- Quadruped animations for non-hound units (cavalry mounts, wildlife) — same pattern can be reused, but no current unit requires it.
- Hit-spark elements in hound SVGs — if the existing hound JSX lacks a `.cq-hit-spark` group, adding one is a separate visual-polish task. The attack animation works without it.
- A `data-kind="quadruped"` ranged variant (e.g., a war-dog that shoots) — not anticipated.
