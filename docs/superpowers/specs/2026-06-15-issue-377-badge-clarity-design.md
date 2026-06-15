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
| Fortified | `F` in gold circle | `🛡` in gold circle | Canvas (`unit-renderer.ts`) + DOM (`sprite-overlay.ts`) |
| Stack count | `2` in dark circle | `⚔ ×2` in dark pill | DOM only at high zoom; `⚔2` in wider circle on Canvas |

No logic changes. No tooltip infrastructure. No panel changes.

## Fortified Badge

### Canvas path (`src/renderer/unit-renderer.ts`)

`ctx.fillText('F', badgeX, badgeY)` → `ctx.fillText('🛡', badgeX, badgeY)`

Badge circle geometry (position, radius, color) stays identical. Only the glyph changes.

### DOM/sprite path (`src/renderer/sprite-overlay.ts`)

`fortified.textContent = 'F'` → `fortified.textContent = '🛡'`

All CSS (position, background, border, size) stays identical.

## Stack Count Badge

### DOM/sprite path (`src/renderer/sprite-overlay.ts`)

Change from a circle to a pill layout with two child elements:

```
[⚔  ×N]
```

- Outer wrapper: `border-radius: 999px` (pill), `display: flex`, `flex-direction: row`, `gap: 2px`, `padding: 1px 4px`
- Left child `<span>`: `⚔` emoji, `font-size: 0.6em`
- Right child `<span>`: `×N` text, `font-size: 0.65em`, `font-weight: 700`
- Same colors as current badge: `background: rgba(0,0,0,.82)`, `border: 1px solid rgba(255,255,255,.85)`, `color: #fff`
- Width: `auto` with `min-width: 42%` so it doesn't pinch at count=2
- Position stays top-right corner

### Canvas path (`src/renderer/unit-renderer.ts`)

At low zoom the sprite is ~30–40px; a two-child flex layout isn't feasible on canvas. Instead:

- Widen the badge radius by ~20% (multiply current radius by 1.2)
- `ctx.fillText('⚔' + stackCount, badgeX, badgeY)` — e.g. `⚔2`, `⚔4`
- Font size stays the same

## What Does Not Change

- Fortify logic, stack logic, selection logic
- Selected-unit panel (already shows "Fortify/Unfortify" button and "Stack: N units here" text)
- Badge positions, colors, or z-order
- Any other badge type (health bar, role marker, selected ring)

## Testing

Existing visual regression coverage (screenshot/render tests) if any should update automatically. Unit tests do not cover badge rendering directly. Verify manually at two zoom levels:

1. Low zoom (Canvas renderer active, LOD below sprite threshold): fortified unit shows 🛡 badge; stacked unit shows ⚔2 badge
2. High zoom (DOM sprite overlay active): fortified unit shows 🛡 badge; stacked units show ⚔ ×2 pill

## Files Changed

- `src/renderer/unit-renderer.ts` — Canvas fortified glyph + canvas stack badge
- `src/renderer/sprite-overlay.ts` — DOM fortified glyph + DOM stack badge pill
