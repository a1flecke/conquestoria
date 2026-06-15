# Issue #377: Badge Clarity Fix

**Date:** 2026-06-15  
**Issue:** https://github.com/a1flecke/conquestoria/issues/377  
**Problem:** Unit badges "F" (fortified) and "2" (stack count) are cryptic to players.

## Goal

Replace opaque letter/number badges on map units with self-explanatory icons so players immediately understand unit state without tapping.

## Scope

Two badges, two renderers each:

| Badge | Before | After | Renderer paths |
|-------|--------|-------|---------------|
| Fortified | `F` in gold circle | `🛡️` in gold circle | Canvas (`unit-renderer.ts`) + DOM (`sprite-overlay.ts`) |
| Stack count | `2` in dark circle | `🪖️ ×2` in dark pill | DOM only at high zoom; `🪖×2` in wider circle on Canvas |

No logic changes. No tooltip infrastructure. No panel changes.

**Emoji presentation rule:** Always append `️` (Unicode variation selector 16) to `🛡` and `🪖` in both canvas `fillText` calls and DOM `textContent` assignments. Without it, some platforms render these as black-and-white text glyphs rather than coloured emoji. The literal string in source should be `'🛡️'` and `'🪖️'`.

**Stack emoji rationale:** `🪖` (military helmet) is used rather than `⚔` (crossed swords) because crossed swords conventionally signals "in combat" — using it for a stack count would confuse the intent.

## Fortified Badge

### Canvas path (`src/renderer/unit-renderer.ts`)

`ctx.fillText('F', badgeX, badgeY)` → `ctx.fillText('🛡️', badgeX, badgeY)`

Badge circle geometry (position, radius, color) stays identical. The font size (`size * 0.18`) may be tuned ±20% during implementation if the shield emoji renders too large or too small inside the circle — emoji visual extent differs from ASCII glyphs.

### DOM/sprite path (`src/renderer/sprite-overlay.ts`)

`fortified.textContent = 'F'` → `fortified.textContent = '🛡️'`

All CSS (position, background, border, size) stays identical. Same ±20% font-size tuning latitude applies.

## Stack Count Badge

### DOM/sprite path (`src/renderer/sprite-overlay.ts`)

Change from a circle to a pill layout. Because `getOrCreateDecoration` reuses the existing div on every re-render, the implementation must manage child spans explicitly — **do not use `innerHTML`** (XSS risk per project rules). Use `replaceChildren()` to rebuild child spans on each update:

```ts
const pill = getOrCreateDecoration(wrapper, 'cq-unit-stack-count');
pill.style.cssText =
  'position:absolute;right:2%;top:2%;min-width:42%;height:28%;border-radius:999px;' +
  'background:rgba(0,0,0,.82);border:1px solid rgba(255,255,255,.85);color:#fff;' +
  'font:700 0.65em system-ui;display:flex;align-items:center;justify-content:center;' +
  'gap:2px;padding:0 3%;pointer-events:none';
const icon = document.createElement('span');
icon.textContent = '🪖️';
icon.style.cssText = 'font-size:0.9em;line-height:1';
const label = document.createElement('span');
label.textContent = `×${entity.stackCount}`;  // ×N
label.style.cssText = 'font-weight:700';
pill.replaceChildren(icon, label);
```

Layout: pill (`border-radius: 999px`), `display: flex`, icon on left, `×N` on right.  
Colors: same dark badge (`rgba(0,0,0,.82)`, white border, white text).  
Position stays top-right corner.

**Coexistence note:** When a unit is both fortified (🛡 top-left) and stacked (🪖×N pill top-right), the two badges do not collide — fortified is anchored at `left:3%;top:3%` and the pill at `right:2%;top:2%`. At very high stack counts (≥10) the pill may grow wide; this is acceptable since counts that high are rare and the unit remains legible.

### Canvas path (`src/renderer/unit-renderer.ts`)

At low zoom the sprite is ~30–40px; a flex layout is not feasible on canvas. Use a single `fillText` string instead:

- Keep badge as a circle; widen radius by ×1.2 relative to `metrics.countBadge.radius` to accommodate two glyphs
- Draw: `ctx.fillText('🪖️×' + stackCount, badgeX, badgeY)` — e.g. `🪖×2`, `🪖×4`
- Font size stays the same (`size * 0.18`)

**Canvas/DOM format difference:** The canvas renders `🪖×2` (no space, tighter) while the DOM renders `🪖 ×2` (flex gap provides visual spacing). This is intentional — canvas cannot do two-child flex layout at this size, and the tighter format reads clearly at low zoom. Both convey the same meaning.

## What Does Not Change

- Fortify logic, stack logic, selection logic
- Selected-unit panel (already shows "Fortify/Unfortify" button and "Stack: N units here" text)
- Badge positions, colors, or z-order
- Any other badge type (health bar, role marker, selected ring)

## Testing

No automated tests cover badge rendering directly. Verify manually at two zoom levels:

1. **Low zoom** (Canvas renderer active): fortified unit shows 🛡 badge; stacked unit shows 🪖×2 badge
2. **High zoom** (DOM sprite overlay active): fortified unit shows 🛡 badge; stacked units show 🪖 ×2 pill
3. **Both badges together**: a fortified unit in a 2-unit stack shows both badges without overlap

## Files Changed

- `src/renderer/unit-renderer.ts` — Canvas fortified glyph + canvas stack badge
- `src/renderer/sprite-overlay.ts` — DOM fortified glyph + DOM stack badge pill
