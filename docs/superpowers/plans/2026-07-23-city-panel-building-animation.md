# City Panel Building Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do NOT use subagent-driven-development or spawn any subagents — this project's CLAUDE.md forbids subagents/parallel agents; execute every task inline in the current session.

**Goal:** Give every row in the city panel's Buildings list a small, genuinely animated sprite icon, using the 116 sprites that already exist in `BUILDING_SPRITE_CATALOG` but have never had a persistent-building consumer.

**Architecture:** A new small pure-function module (`src/ui/city-panel-building-icon.ts`) turns a building id + faction palette into safe-to-inline HTML: it looks up the catalog sprite (falling back to the existing production-icon emoji for the ~69 legendary-wonder ids the catalog doesn't cover), namespaces every SVG `id` in the returned markup so multiple different buildings can sit as DOM siblings without id collisions, and wraps the result in the same `cq-sprite-wrap cq-v2` convention the map's DOM overlay already uses so it picks up `sprite-animations-v2.css` idle animation for free. `city-panel.ts`'s existing `buildingPlaceholders` loop calls this once per built building and prepends the icon to each row's HTML.

**Tech Stack:** TypeScript, vitest + jsdom (existing test setup), no new dependencies.

## Global Constraints

- Never use `Math.random()` — this feature has no randomness need, but if any is ever added it must be seeded (project-wide rule).
- `BUILDING_SPRITE_CATALOG[bid]` must never be called unconditionally — legendary wonder ids (69 of 74) have no catalog entry and calling `undefined` throws. Always guard with `?.()` or an explicit existence check.
- SVG markup returned by catalog sprite functions must have every `id`/`url(#…)`/`href="#…"` namespaced with a per-instance suffix before being inlined alongside any other building's markup in the same DOM document — `BuildingFrame`'s shared `<defs>` ids are safe to duplicate (byte-identical across every sprite), but individual sprites' bespoke ids (confirmed example: Stock Exchange's `tickerClip`) are not.
- Reduced-motion needs no new code — `sprite-animations-v2.css`'s existing `@media (prefers-reduced-motion: reduce)` block already covers any `.cq-v2` element regardless of where in the DOM it lives.
- Palette must be derived from the city's **current** `owner` field, not any cached/founder value — a captured city's buildings must reflect the new owner's color immediately.
- Do not modify `BuildingSpriteProps`, `BuildingFrame`, or any of the 116 individual sprite functions in `buildings.tsx` — this feature is a new consumer of the existing public contract, not a change to it.
- **Correction to the design spec:** the spec's "crop the HexBase/category ring out via `overflow:hidden` positioning" approach does not work — `BuildingFrame`'s `CATEGORY_TINTS` ring (`circle cx="96" cy="166" r="80"`) spans roughly y:86–246 of the 192×192 viewBox, which overlaps most buildings' own silhouette (typically y:40–160). It cannot be cropped without also clipping the building. Task 4 fixes the spec doc to match: ship the sprite as-is (both background rings included, at their existing low opacity — 0.18–0.25 — which may simply disappear at 36px), and treat any further ring-suppression as a follow-up gated on the manual QA step actually finding it necessary, not something to build speculatively now.

---

## File Structure

- **Create:** `src/ui/city-panel-building-icon.ts` — pure functions: `namespaceSvgIds()` and `getAnimatedBuildingIconHtml()`. No DOM access, no state mutation, fully unit-testable in isolation.
- **Create:** `tests/ui/city-panel-building-icon.test.ts` — unit tests for the above.
- **Modify:** `src/ui/city-panel.ts` — `buildingPlaceholders` loop (currently lines 513–545) gains one call to `getAnimatedBuildingIconHtml()` per row; new imports for the catalog, palette helpers, and the new module.
- **Modify:** `tests/ui/city-panel.test.ts` — new `describe('city-panel building icons — #<issue>')` block with the integration-level regression tests.
- **Modify:** `docs/sprite-design-system.md` — note the new consumer, matching how #659 documented the production-badge consumer.
- **Modify:** `docs/superpowers/specs/2026-07-23-city-panel-building-animation-design.md` — correct the crop-approach paragraph per the Global Constraints note above.

---

## Task 1: `namespaceSvgIds()` — prevent cross-sprite SVG id collisions

**Files:**
- Create: `src/ui/city-panel-building-icon.ts`
- Test: `tests/ui/city-panel-building-icon.test.ts`

**Interfaces:**
- Produces: `export function namespaceSvgIds(svg: string, suffix: string): string` — later tasks in this plan call it with `suffix` derived from `${buildingId}-${index}`.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/ui/city-panel-building-icon.test.ts
import { describe, it, expect } from 'vitest';
import { namespaceSvgIds } from '@/ui/city-panel-building-icon';

describe('namespaceSvgIds', () => {
  it('suffixes a plain id attribute', () => {
    const svg = '<svg><defs><clipPath id="tickerClip"><rect/></clipPath></defs></svg>';
    const result = namespaceSvgIds(svg, 'bank-0');
    expect(result).toContain('id="tickerClip-bank-0"');
    expect(result).not.toContain('id="tickerClip"');
  });

  it('rewrites a matching url(#id) reference to the same suffixed id', () => {
    const svg = '<svg><defs><clipPath id="tickerClip"><rect/></clipPath></defs><g clip-path="url(#tickerClip)"></g></svg>';
    const result = namespaceSvgIds(svg, 'bank-0');
    expect(result).toContain('clip-path="url(#tickerClip-bank-0)"');
  });

  it('rewrites a matching href="#id" reference to the same suffixed id', () => {
    const svg = '<svg><defs><circle id="dot"/></defs><use href="#dot"></use></svg>';
    const result = namespaceSvgIds(svg, 'granary-2');
    expect(result).toContain('href="#dot-granary-2"');
  });

  it('namespaces multiple distinct ids independently, without cross-contamination', () => {
    const svg = '<svg><defs><clipPath id="a"/><circle id="b"/></defs><g clip-path="url(#a)"></g><use href="#b"></use></svg>';
    const result = namespaceSvgIds(svg, 'x');
    expect(result).toContain('id="a-x"');
    expect(result).toContain('id="b-x"');
    expect(result).toContain('url(#a-x)');
    expect(result).toContain('href="#b-x"');
  });

  it('leaves markup with no ids unchanged', () => {
    const svg = '<svg><rect fill="#fff"/></svg>';
    expect(namespaceSvgIds(svg, 'anything')).toBe(svg);
  });

  it('two different suffixes on the same raw markup produce non-colliding output', () => {
    const svg = '<svg><defs><clipPath id="tickerClip"><rect/></clipPath></defs><g clip-path="url(#tickerClip)"></g></svg>';
    const first = namespaceSvgIds(svg, 'stock_exchange-0');
    const second = namespaceSvgIds(svg, 'stock_exchange-1');
    expect(first).not.toBe(second);
    const firstId = /id="([^"]+)"/.exec(first)?.[1];
    const secondId = /id="([^"]+)"/.exec(second)?.[1];
    expect(firstId).not.toBe(secondId);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel-building-icon.test.ts`
Expected: FAIL — `Cannot find module '@/ui/city-panel-building-icon'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
// src/ui/city-panel-building-icon.ts

/**
 * Rewrites every `id="X"` in `svg` to `id="X-{suffix}"`, and every matching
 * `url(#X)` / `href="#X"` reference to point at the same suffixed id. This
 * lets multiple different building sprites — each independently authored,
 * each free to define its own bespoke SVG defs (e.g. StockExchangeSprite's
 * `tickerClip`) — sit as DOM siblings in the same document without one
 * sprite's `url(#foo)` silently resolving to a different sprite's `id="foo"`.
 */
export function namespaceSvgIds(svg: string, suffix: string): string {
  const ids = new Set<string>();
  const idPattern = /\bid="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = idPattern.exec(svg)) !== null) {
    ids.add(match[1]);
  }

  let result = svg;
  for (const id of ids) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result
      .replace(new RegExp(`\\bid="${escaped}"`, 'g'), `id="${id}-${suffix}"`)
      .replace(new RegExp(`url\\(#${escaped}\\)`, 'g'), `url(#${id}-${suffix})`)
      .replace(new RegExp(`href="#${escaped}"`, 'g'), `href="#${id}-${suffix}"`);
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel-building-icon.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/city-panel-building-icon.ts tests/ui/city-panel-building-icon.test.ts
git commit -m "feat(ui): add namespaceSvgIds to prevent cross-sprite SVG id collisions"
```

---

## Task 2: `getAnimatedBuildingIconHtml()` — the building-id-to-HTML function

**Files:**
- Modify: `src/ui/city-panel-building-icon.ts`
- Test: `tests/ui/city-panel-building-icon.test.ts`

**Interfaces:**
- Consumes: `namespaceSvgIds(svg: string, suffix: string): string` (Task 1). `BUILDING_SPRITE_CATALOG: Record<string, (props: { palette: FactionPalette; svgOnly?: boolean }) => string>` from `@/renderer/sprites/sprite-catalog`. `PRODUCTION_ICON_FALLBACK: string` from `@/systems/city-system`. `hashCode(str: string): number` from `@/renderer/sprite-overlay`. `FactionPalette` type from `@/renderer/sprites/sprite-system`.
- Produces: `export function getAnimatedBuildingIconHtml(buildingId: string, palette: FactionPalette, phaseKey: string): string` — Task 3 calls this once per row.

- [ ] **Step 1: Write the failing tests**

```typescript
// append to tests/ui/city-panel-building-icon.test.ts
import { getAnimatedBuildingIconHtml } from '@/ui/city-panel-building-icon';
import { NEUTRAL_FACTION_PALETTE } from '@/renderer/sprites/sprite-system';

describe('getAnimatedBuildingIconHtml', () => {
  it('renders the animated wrapper for a building present in BUILDING_SPRITE_CATALOG', () => {
    const html = getAnimatedBuildingIconHtml('granary', NEUTRAL_FACTION_PALETTE, 'city-a:granary');
    expect(html).toContain('cq-sprite-wrap');
    expect(html).toContain('cq-v2');
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('data-kind="building"');
  });

  it('does not throw and falls back to the production-icon emoji for a legendary-wonder id with no catalog entry', () => {
    expect(() => getAnimatedBuildingIconHtml('grand-canal', NEUTRAL_FACTION_PALETTE, 'city-a:grand-canal')).not.toThrow();
    const html = getAnimatedBuildingIconHtml('grand-canal', NEUTRAL_FACTION_PALETTE, 'city-a:grand-canal');
    expect(html).toContain('🏗️');
    expect(html).not.toContain('cq-sprite-wrap');
  });

  it('renders a covered wonder (pyramids) as an animated sprite, not the fallback', () => {
    const html = getAnimatedBuildingIconHtml('pyramids', NEUTRAL_FACTION_PALETTE, 'city-a:pyramids');
    expect(html).toContain('cq-sprite-wrap');
    expect(html).not.toContain('🏗️');
  });

  it('gives two different phaseKeys two different --phase values, so identical building types desync', () => {
    const a = getAnimatedBuildingIconHtml('granary', NEUTRAL_FACTION_PALETTE, 'city-a:granary');
    const b = getAnimatedBuildingIconHtml('granary', NEUTRAL_FACTION_PALETTE, 'city-b:granary');
    const phaseOf = (html: string) => /--phase:([\d.]+)/.exec(html)?.[1];
    expect(phaseOf(a)).not.toBe(phaseOf(b));
  });

  it('namespaces ids so two different buildings rendered together never collide', () => {
    const a = getAnimatedBuildingIconHtml('stock_exchange', NEUTRAL_FACTION_PALETTE, 'city-a:stock_exchange');
    const b = getAnimatedBuildingIconHtml('bank', NEUTRAL_FACTION_PALETTE, 'city-a:bank');
    const idsOf = (html: string) => [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    const combined = [...idsOf(a), ...idsOf(b)];
    expect(new Set(combined).size).toBe(combined.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel-building-icon.test.ts`
Expected: FAIL — `getAnimatedBuildingIconHtml is not exported`

- [ ] **Step 3: Write the implementation**

```typescript
// append to src/ui/city-panel-building-icon.ts
import { BUILDING_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { PRODUCTION_ICON_FALLBACK } from '@/systems/city-system';
import { hashCode } from '@/renderer/sprite-overlay';
import type { FactionPalette } from '@/renderer/sprites/sprite-system';

const ICON_SIZE_PX = 36;

/**
 * Turns a built building's id into safe-to-inline HTML for the city panel's
 * Buildings list: an animated `.cq-v2` sprite when the catalog has one, or
 * the same production-icon emoji fallback the rest of the game already uses
 * for uncatalogued items (currently ~69 of 74 legendary wonder ids — see
 * BUILDING_SPRITE_CATALOG's coverage, which is only guaranteed complete for
 * ordinary BUILDINGS keys, not wonder ids).
 *
 * `phaseKey` should be unique per (city, building) pair — callers pass
 * `${city.id}:${buildingId}` — so the same building type breathes out of
 * sync across different cities, not just within one city's list.
 */
export function getAnimatedBuildingIconHtml(
  buildingId: string,
  palette: FactionPalette,
  phaseKey: string,
): string {
  const spriteFn = BUILDING_SPRITE_CATALOG[buildingId];
  if (!spriteFn) {
    return `<div style="width:${ICON_SIZE_PX}px;height:${ICON_SIZE_PX}px;flex:none;` +
      `display:flex;align-items:center;justify-content:center;font-size:20px;">` +
      `${PRODUCTION_ICON_FALLBACK}</div>`;
  }

  const rawSvg = spriteFn({ palette, svgOnly: true });
  const suffix = `${buildingId}-${Math.abs(hashCode(phaseKey))}`;
  const svg = namespaceSvgIds(rawSvg, suffix)
    .replace('<svg ', `<svg width="${ICON_SIZE_PX}" height="${ICON_SIZE_PX}" `);
  const phase = (Math.abs(hashCode(phaseKey)) % 100) / 100;

  return `<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="building" ` +
    `style="--phase:${phase};width:${ICON_SIZE_PX}px;height:${ICON_SIZE_PX}px;flex:none;` +
    `overflow:hidden;border-radius:6px;">${svg}</div>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel-building-icon.test.ts`
Expected: PASS (11 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/ui/city-panel-building-icon.ts tests/ui/city-panel-building-icon.test.ts
git commit -m "feat(ui): add getAnimatedBuildingIconHtml with wonder-id fallback"
```

---

## Task 3: Wire the icon into the city panel's Buildings list

**Files:**
- Modify: `src/ui/city-panel.ts:1-20` (imports), `src/ui/city-panel.ts:513-545` (`buildingPlaceholders` loop)
- Test: `tests/ui/city-panel.test.ts`

**Interfaces:**
- Consumes: `getAnimatedBuildingIconHtml(buildingId: string, palette: FactionPalette, phaseKey: string): string` (Task 2). `derivePalette(civColor: string): FactionPalette` and `NEUTRAL_FACTION_PALETTE: FactionPalette` from `@/renderer/sprites/sprite-system`. `state.civilizations[ownerId]?.color: string | undefined` (existing `GameState` shape, same pattern already used in `src/renderer/city-renderer.ts:209`).

- [ ] **Step 1: Write the failing tests**

```typescript
// append to tests/ui/city-panel.test.ts
describe('city-panel building icons — #665', () => {
  it('renders an animated sprite wrapper for a built ordinary building', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings = ['granary'];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    const wrapper = panel.querySelector('.cq-sprite-wrap.cq-v2[data-kind="building"]');
    expect(wrapper).toBeTruthy();
    expect(wrapper!.getAttribute('data-state')).toBe('idle');
  });

  it('does not throw and still renders the rest of the row for a completed legendary wonder with no catalog sprite', () => {
    const { container, city, state } = makeWonderPanelFixture();
    // 'grand-canal' has no BUILDING_SPRITE_CATALOG entry (only 5 of 74 wonder ids do).
    // BUILDINGS has no entry for it either, so it's added directly to exercise the
    // fallback path in isolation from the wonder-completion system.
    city.buildings = ['granary', 'grand-canal'];

    expect(() => createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    })).not.toThrow();
  });

  it('derives the icon palette from the CURRENT city owner, not any cached founder color', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings = ['granary'];
    city.owner = 'rival'; // rival civ color is #9333ea, player civ color is #4a90d9
    state.civilizations.rival.cities.push(city.id);

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    const rendered = panel.innerHTML;
    expect(rendered).toContain('#9333ea');
    expect(rendered).not.toContain('#4a90d9');
  });

  it('renders no duplicate SVG id attributes when the city has multiple buildings with bespoke defs', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings = ['stock_exchange', 'bank'];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    const ids = [...panel.querySelectorAll('[id]')].map(el => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel.test.ts -t "building icons"`
Expected: FAIL — first test fails because no `.cq-sprite-wrap` exists in the rendered row yet.

- [ ] **Step 3: Add imports to `src/ui/city-panel.ts`**

At the top of the file, alongside the existing imports (after the `city-system` import block):

```typescript
import { getAnimatedBuildingIconHtml } from './city-panel-building-icon';
import { derivePalette, NEUTRAL_FACTION_PALETTE } from '@/renderer/sprites/sprite-system';
```

- [ ] **Step 4: Wire the icon into the `buildingPlaceholders` loop**

Find the existing loop (currently `src/ui/city-panel.ts:513-545`):

```typescript
  // Build placeholders for dynamic data; style attributes with pure numbers (progress%) are safe
  let buildingPlaceholders = '';
  for (let idx = 0; idx < city.buildings.length; idx++) {
    const bid = city.buildings[idx];
    const b = BUILDINGS[bid];
    if (b) {
```

Immediately before that loop, derive the palette once (the city's owner doesn't change mid-render):

```typescript
  const buildingIconPalette = state.civilizations[city.owner]?.color
    ? derivePalette(state.civilizations[city.owner]!.color)
    : NEUTRAL_FACTION_PALETTE;
```

Inside the loop, change the row template to prepend the icon. The row currently reads (existing code, `src/ui/city-panel.ts:540-543`):

```typescript
      buildingPlaceholders += `<div style="background:rgba(255,255,255,0.05);border-radius:6px;padding:8px;margin-bottom:4px;font-size:12px;">
        <strong data-text="bldg-name-${idx}"></strong>${fadingBadge}${obsoleteBadge} — <span data-text="bldg-desc-${idx}"></span>
        <div style="font-size:11px;opacity:0.72;margin-top:3px;" data-text="bldg-upkeep-${idx}">${upkeepText}</div>
      </div>`;
```

Change it to:

```typescript
      const icon = getAnimatedBuildingIconHtml(bid, buildingIconPalette, `${city.id}:${bid}`);
      buildingPlaceholders += `<div style="background:rgba(255,255,255,0.05);border-radius:6px;padding:8px;margin-bottom:4px;font-size:12px;display:flex;gap:8px;align-items:flex-start;">
        ${icon}
        <div style="flex:1;min-width:0;">
          <strong data-text="bldg-name-${idx}"></strong>${fadingBadge}${obsoleteBadge} — <span data-text="bldg-desc-${idx}"></span>
          <div style="font-size:11px;opacity:0.72;margin-top:3px;" data-text="bldg-upkeep-${idx}">${upkeepText}</div>
        </div>
      </div>`;
```

This is purely additive to the row's structure — the `data-text="bldg-*-${idx}"` elements that get populated with `textContent` elsewhere in the file are untouched, so that existing safe-text-rendering mechanism keeps working exactly as before.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel.test.ts`
Expected: PASS — all tests in the file, including the 4 new ones and every pre-existing city-panel test (confirms this change didn't break anything already covered).

- [ ] **Step 6: Run the full suite and build**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all files pass.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: clean, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "feat(ui): render animated building sprites in the city panel Buildings list"
```

---

## Task 4: Fix the spec's crop-approach claim, update sprite design docs

**Files:**
- Modify: `docs/superpowers/specs/2026-07-23-city-panel-building-animation-design.md`
- Modify: `docs/sprite-design-system.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Correct the spec doc's "Correction from the approved mockup" section**

In `docs/superpowers/specs/2026-07-23-city-panel-building-animation-design.md`, replace the paragraph starting "Rather than changing the shared sprite-prop contract... falls outside it." with:

```markdown
Rather than changing the shared sprite-prop contract (which would touch all 116 `FooSprite`
signatures for a purely cosmetic concern in one new caller), **v1 ships the sprite as-is, rings
included** — the `HexBase` dashed ring and `CATEGORY_TINTS` circle sit at low opacity (0.18–0.25)
and largely overlap the building's own silhouette rather than sitting in an isolated corner, so
there is no clean crop that removes them without also clipping the building. Whether they read as
a problem at 36px is a manual-QA question (see below), not something to pre-solve with unverified
geometry. If QA finds it necessary, the follow-up options are: reduce the ring opacity further at
the call site via a small CSS filter, or — only as a last resort — thread an optional `hex`/ring
flag through `BuildingFrame`. Do not build either speculatively.
```

- [ ] **Step 2: Add the new consumer to the sprite design system doc**

In `docs/sprite-design-system.md`, find the `### Buildings` section header and its table. Immediately after the table (before the next `###` heading), add:

```markdown
**Live consumers**, as of the city-panel building animation work: the city panel's Buildings list
(`src/ui/city-panel-building-icon.ts`) renders every built building as a small (36px) animated
`.cq-v2` sprite, alongside the existing static map production-badge from #659
(`drawCityProductionBadgePass` in `city-render-passes.ts`). Legendary wonder ids are not part of
this table — only 5 of 74 (`pyramids`, `colosseum`, `great_library`, `lighthouse`, `wright-flyer`)
have a `BUILDING_SPRITE_CATALOG` entry; the rest fall back to `PRODUCTION_ICON_FALLBACK` in both
consumers.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-23-city-panel-building-animation-design.md docs/sprite-design-system.md
git commit -m "docs: correct crop-approach claim, document the new building-icon consumer"
```

---

## Self-Review Notes (completed during plan authoring)

- **Spec coverage:** Visual (36px, current-owner palette) → Task 3. Technical approach (live catalog call, `svgOnly:true`, `cq-v2` wrapper, `data-kind="building"`, `--phase` via `hashCode`) → Tasks 2–3. Bug 1 (wonder-id fallback) → Task 2 + Task 3 test 2. Bug 2 (id namespacing) → Task 1 + Task 3 test 4. Reduced-motion → no task needed, confirmed already global. Manual QA items → left as manual QA, not converted into automated steps since they require human visual judgment (ring legibility, captured-city look, OS-level reduced-motion). Out-of-scope items (map diorama, damage tiers, serialization pipeline, build chooser) → no tasks, correctly excluded.
- **Placeholder scan:** no TBD/TODO; every step has real code or an exact command with expected output.
- **Type consistency:** `getAnimatedBuildingIconHtml(buildingId: string, palette: FactionPalette, phaseKey: string): string` is the exact signature used consistently in Task 2's implementation and every Task 3 call site. `namespaceSvgIds(svg: string, suffix: string): string` likewise consistent between Task 1 and its use inside Task 2.
- **New issue found and fixed during planning, not caught in the earlier design review:** the spec's proposed crop mechanism doesn't work geometrically. Fixed by descoping it from this plan's implementation (ship as-is) and correcting the spec doc in Task 4 instead of silently implementing something different from what the spec says.
