# Unit Sprite v2 Live-Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do NOT use subagent-driven-development or spawn any subagents — this project's CLAUDE.md forbids subagents/parallel agents; execute every task inline in the current session.

**Goal:** Close the unit-sprite DOM-overlay animation gap (issue #755) by making `getUnitSpriteV2`
fall back to calling the live `UNIT_SPRITE_CATALOG` sprite function directly (instead of returning
`null`) whenever a unit isn't covered by the hand-authored v2 pre-serialization pipeline — covering
both the 24 uncovered unit types and, as a real side effect found during design review, all
minor-civ-owned units of any type (which hit the same `null` path via an unrecognized `faction`
string today).

**Architecture:** `getUnitSpriteV2(unitType, faction, civColor?)` gains a fallback branch that calls
the live sprite function with `{palette: derivePalette(civColor), svgOnly: true}`, rewrites its
baked pixel width/height to responsive `100%` (in place, not duplicated — the same fix shape as the
city-panel building-icon work), and wraps it in the same `.cq-sprite-wrap.cq-v2` shell every
pre-serialized sprite already produces. A new exported `isV2NativeUnit()` helper gives tests and
follow-up tooling a way to tell native from fallback sprites without reaching into the module's
private `UNIT_SPRITES` table.

**Tech Stack:** TypeScript, vitest + jsdom, no new dependencies.

**Design doc:** `docs/superpowers/specs/2026-07-28-unit-sprite-v2-live-fallback-design.md` — read
this first if anything below is unclear; it has the full rationale and a documented second-pass
review of the exact mechanism this plan implements.

## Global Constraints

- Never use `Math.random()` — no randomness in this feature, N/A.
- `civColor` must default gracefully — `derivePalette('')` produces `NaN`-poisoned hex strings
  (verified against `hexToHsl`/`hslToHex` in `sprite-system.tsx`); always guard with
  `civColor ? derivePalette(civColor) : NEUTRAL_FACTION_PALETTE`.
- The DOM-overlay wrapper's inner `<svg>` must never carry a hardcoded pixel `width`/`height` —
  it must be `width="100%" height="100%"` so the outer wrapper (sized by `sprite-overlay.ts` from
  `camera.hexSize`) controls actual display size. This is enforced by a hook this plan adds in
  Task 3 — do not bypass it.
- `civColor` is being added as an **optional** third parameter to `getUnitSpriteV2`, not required —
  the existing test suite has ~15 call sites using the current 2-arg signature across
  `tests/renderer/sprites/v2/index.test.ts` and `tests/renderer/sprites/unit-identity.test.ts`, and
  none of them need to change just for this signature addition.
- Do not touch anything building-related (`getBuildingSpriteV2`, `kind: 'building'` `SpriteEntity`s)
  — that's tracked separately in #658/#659 and explicitly out of scope for this plan.

---

## Task 1: `isV2NativeUnit()` + live-fallback rendering in `getUnitSpriteV2`

**Files:**
- Modify: `src/renderer/sprites/v2/index.ts:161-167` (`getUnitSpriteV2`), plus new code appended
  after it
- Modify: `tests/renderer/sprites/v2/index.test.ts` (imports, one existing test rewritten, several
  new tests, one existing describe block's iteration source replaced)

**Interfaces:**
- Produces: `export function getUnitSpriteV2(unitType: string, faction: string, civColor?: string): string | null` (existing export, new optional third param).
- Produces: `export function isV2NativeUnit(unitType: string): boolean` (new export).
- Consumes: `UNIT_SPRITE_CATALOG: Record<UnitType, (props: {palette: FactionPalette; svgOnly?: boolean; motion?: UnitSpriteMotion}) => string>` from `@/renderer/sprites/sprite-catalog`. `derivePalette(civColor: string): FactionPalette` and `NEUTRAL_FACTION_PALETTE: FactionPalette` from `../sprite-system` (relative from `v2/index.ts`). `UnitType` type from `@/core/types`.

### Step 1: Update test file imports and remove the now-redundant hardcoded type list

The existing `ALL_SPRITE_UNIT_TYPES` array (lines 10-23) is a manually maintained duplicate of what
`UNIT_SPRITE_CATALOG`'s keys already track — after this task, the "full unit coverage" test (line
182) is rewritten to iterate the real catalog instead, so this array becomes dead. Remove it and
add the new imports needed for the rest of this task.

In `tests/renderer/sprites/v2/index.test.ts`, replace lines 1-23:

```typescript
import { describe, it, expect } from 'vitest';
import {
  getUnitSpriteV2,
  getBuildingSpriteV2,
  getPirateHeadquartersSpriteV2,
  getImprovementSpriteV2,
} from '@/renderer/sprites/v2/index';

// All unit types that must have a v2 serialization (MR 1 + MR 2 + MR 4 + MR 6).
const ALL_SPRITE_UNIT_TYPES = [
  // MR 1 — already serialized
  'archer', 'galley', 'musketeer', 'pikeman', 'scout', 'scout_hound', 'settler',
  'shadow_warden', 'spy_agent', 'spy_hacker', 'spy_informant', 'spy_operative',
  'spy_scout', 'swordsman', 'trireme', 'war_hound', 'warrior', 'worker',
  // MR 2 — new
  'axeman', 'spearman', 'horseman', 'cavalry', 'knight',
  'crossbowman', 'catapult', 'ballista',
  'caravan', 'expedition', 'transport',
  // MR 4 — late-era naval
  'carrack', 'galleon', 'steamship', 'troop_transport',
  // MR 6 — legendary beasts
  'beast_boar',
];
```

with:

```typescript
import { describe, it, expect } from 'vitest';
import {
  getUnitSpriteV2,
  isV2NativeUnit,
  getBuildingSpriteV2,
  getPirateHeadquartersSpriteV2,
  getImprovementSpriteV2,
} from '@/renderer/sprites/v2/index';
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
```

- [ ] Do this replacement now.

### Step 2: Rewrite the now-incorrect "unknown faction" test

The existing test at (originally) lines 42-44 asserts `getUnitSpriteV2('warrior', 'unknownfaction')`
returns `null`. This assertion is about to become **wrong on purpose** — this is exactly the
minor-civ-owned-unit bug the design doc found: a real unit type with an unrecognized faction string
should render via the live fallback, not silently stay static. Replace it to assert the new,
correct behavior.

Find (inside `describe('getUnitSpriteV2', ...)`):

```typescript
  it('returns null for unknown faction', () => {
    expect(getUnitSpriteV2('warrior', 'unknownfaction')).toBeNull();
  });
```

Replace with:

```typescript
  it('falls back to a live-rendered sprite for a known unit type with an unrecognized faction (e.g. a minor civ)', () => {
    // Before #755's fix this silently returned null (static Canvas fallback forever) — 'warrior'
    // is a v2-native type, but 'unknownfaction' isn't one of the 6 baked archetype-family keys,
    // which is exactly what happens for any minor-civ-owned unit today (getFaction() returns the
    // raw owner id for any owner not in state.civilizations).
    const result = getUnitSpriteV2('warrior', 'unknownfaction', '#7a5a16');
    expect(result).not.toBeNull();
    expect(result).toContain('cq-sprite-wrap');
    expect(result).toContain('cq-v2');
  });
```

- [ ] Do this replacement now.

### Step 3: Write the remaining failing tests

Add these new `describe` blocks at the end of the file (after the last existing block, before
nothing — i.e. append):

```typescript
describe('isV2NativeUnit', () => {
  it('is true for a v2-native unit', () => {
    expect(isV2NativeUnit('archer')).toBe(true);
  });

  it('is false for a unit type that only has the live-fallback path', () => {
    expect(isV2NativeUnit('tank')).toBe(false);
  });

  it('is false for a genuinely unknown type', () => {
    expect(isV2NativeUnit('not-a-real-unit')).toBe(false);
  });
});

describe('getUnitSpriteV2 — live fallback for uncovered unit types', () => {
  // Representative sample of the 24 units with no UNIT_SPRITES entry (confirmed via diff against
  // UNIT_SPRITE_CATALOG, 2026-07-28) — not exhaustive here; the full-catalog loop later in this
  // file covers all of them for the "never null" guarantee.
  const FALLBACK_TIER_SAMPLE = ['tank', 'rifleman', 'submarine', 'combat_drone', 'grenadier'];

  it.each(FALLBACK_TIER_SAMPLE)('%s renders via the live fallback, not v2-native', (type) => {
    expect(isV2NativeUnit(type)).toBe(false);
    const result = getUnitSpriteV2(type, 'imperials', '#4a90d9');
    expect(result, `${type} should not be null`).not.toBeNull();
  });

  it.each(FALLBACK_TIER_SAMPLE)('%s output has the animation hook point (cq-sprite-figure)', (type) => {
    const result = getUnitSpriteV2(type, 'imperials', '#4a90d9')!;
    expect(result).toContain('cq-sprite-wrap');
    expect(result).toContain('cq-v2');
    expect(result).toContain('cq-sprite-figure');
  });

  it.each(FALLBACK_TIER_SAMPLE)('%s output has exactly one width="100%" and one height="100%", never a hardcoded pixel size', (type) => {
    const result = getUnitSpriteV2(type, 'imperials', '#4a90d9')!;
    expect(result.match(/width="100%"/g)?.length).toBe(1);
    expect(result.match(/height="100%"/g)?.length).toBe(1);
    expect(result).not.toMatch(/width="\d+"/);
    expect(result).not.toMatch(/height="\d+"/);
  });

  it.each(FALLBACK_TIER_SAMPLE)('%s output does not contain data-kind (deliberately omitted for fallback-tier units)', (type) => {
    const result = getUnitSpriteV2(type, 'imperials', '#4a90d9')!;
    expect(result).not.toContain('data-kind');
  });

  it('does not throw and returns non-null for a missing civColor (falls back to NEUTRAL_FACTION_PALETTE)', () => {
    expect(() => getUnitSpriteV2('tank', 'imperials', '')).not.toThrow();
    const result = getUnitSpriteV2('tank', 'imperials', '');
    expect(result).not.toBeNull();
    expect(result).not.toMatch(/NaN/);
  });

  it('does not throw and returns non-null when civColor is omitted entirely', () => {
    expect(() => getUnitSpriteV2('tank', 'imperials')).not.toThrow();
    expect(getUnitSpriteV2('tank', 'imperials')).not.toBeNull();
  });
});

describe('getUnitSpriteV2 — structural guarantee (would have caught #755)', () => {
  it('never returns null for any type in UNIT_SPRITE_CATALOG, the canonical live unit roster', () => {
    for (const type of Object.keys(UNIT_SPRITE_CATALOG)) {
      const result = getUnitSpriteV2(type, 'imperials', '#4a90d9');
      expect(result, `${type} returned null — silently stuck on static Canvas rendering`).not.toBeNull();
    }
  });
});
```

- [ ] Write these now.

### Step 4: Rewrite the "full unit coverage" test to iterate the canonical catalog

The existing block hardcodes 33 native-only types via `ALL_SPRITE_UNIT_TYPES` (now removed in Step
1) — this both duplicates a list that will drift and only proves native coverage, not the full
57-type guarantee this design adds. Find:

```typescript
describe('full unit coverage — every type returns a cq-sprite-wrap for imperials', () => {
  it.each(ALL_SPRITE_UNIT_TYPES)('%s', (type) => {
    const r = getUnitSpriteV2(type, 'imperials');
    expect(r).not.toBeNull();
    expect(r!).toContain('cq-sprite-wrap');
    expect(r!).toContain('cq-v2');
  });
});
```

Replace with:

```typescript
describe('full unit coverage — every catalog entry returns a cq-sprite-wrap for imperials (native or live-fallback)', () => {
  it.each(Object.keys(UNIT_SPRITE_CATALOG))('%s', (type) => {
    const r = getUnitSpriteV2(type, 'imperials', '#4a90d9');
    expect(r).not.toBeNull();
    expect(r!).toContain('cq-sprite-wrap');
    expect(r!).toContain('cq-v2');
  });
});
```

- [ ] Do this replacement now.

### Step 5: Run tests to verify they fail

Run: `bash scripts/run-with-mise.sh yarn vitest run -t "v2"`

Expected: multiple failures — `isV2NativeUnit is not exported`, the rewritten "unknown faction"
test failing (current code still returns `null`), the new fallback-tier tests failing the same way,
and TypeScript errors on `isV2NativeUnit` import (this will actually fail at the transform step,
not just at runtime — that's fine, it confirms the target doesn't exist yet).

### Step 6: Implement `isV2NativeUnit` and the live-fallback mechanism

In `src/renderer/sprites/v2/index.ts`, add these imports after the existing import block (after
line 104, before the `// ── Unit sprites ──` comment on line 106):

```typescript
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { derivePalette, NEUTRAL_FACTION_PALETTE } from '../sprite-system';
import type { UnitType } from '@/core/types';
```

Replace the existing `getUnitSpriteV2` function (lines 161-167):

```typescript
export function getUnitSpriteV2(unitType: string, faction: string): string | null {
  // Faction-neutral sprites (e.g. beasts) are stored under 'beast' and shared across all factions
  const sprites = UNIT_SPRITES[unitType];
  if (!sprites) return null;
  if (sprites.pirates) return faction === 'pirates' ? sprites.pirates : null;
  return sprites[faction] ?? sprites.beast ?? null;
}
```

with:

```typescript
export function isV2NativeUnit(unitType: string): boolean {
  return unitType in UNIT_SPRITES;
}

/**
 * #755: closes the DOM-overlay animation gap for any unit type not hand-authored in
 * UNIT_SPRITES — both the 24 unit types with no v2 entry at all, and (found during design
 * review) any unit owned by a faction with no per-family key here, which is what happens for
 * every minor-civ-owned unit today (getFaction() returns the raw owner id, not one of the 6
 * archetype names, whenever the owner isn't in state.civilizations). Renders the live
 * units.tsx/UNIT_SPRITE_CATALOG function directly instead of a second, hand-authored copy.
 */
function buildLiveFallbackUnitSprite(unitType: string, civColor: string): string | null {
  const spriteFn = UNIT_SPRITE_CATALOG[unitType as UnitType];
  if (!spriteFn) return null; // genuinely unknown type — Canvas handles it, unchanged today
  const palette = civColor ? derivePalette(civColor) : NEUTRAL_FACTION_PALETTE;
  const rawSvg = spriteFn({ palette, svgOnly: true });
  // SpriteFrame's svgOnly output bakes in a fixed pixel width/height (unit sprites: 128x128).
  // The DOM overlay's outer wrapper (sized in sprite-overlay.ts from camera.hexSize) controls
  // actual display size; the inner <svg> must fill it responsively instead of carrying its own
  // fixed size. Replace the baked attribute pair in place — never prepend a duplicate (same fix
  // shape as the city-panel building-icon feature, #665).
  const svg = rawSvg.replace(
    /(<svg\b[^>]*?)\swidth="\d+"\s+height="\d+"/,
    '$1 width="100%" height="100%"',
  );
  // data-kind deliberately omitted: no ambient-effect CSS class (.cq-glow, .cq-fire, etc.) is
  // data-kind-scoped, and guessing wrong (e.g. tagging a land unit "naval") risks triggering an
  // unrelated body-plan animation rule. Revisit per-unit once real v2-native art exists (see the
  // migration-backlog follow-up issue).
  return `<div class="cq-sprite-wrap cq-v2" data-state="idle" style="--phase:0">${svg}</div>`;
}

export function getUnitSpriteV2(unitType: string, faction: string, civColor: string = ''): string | null {
  // Faction-neutral sprites (e.g. beasts) are stored under 'beast' and shared across all factions
  const sprites = UNIT_SPRITES[unitType];
  if (sprites) {
    if (sprites.pirates) return faction === 'pirates' ? sprites.pirates : null;
    return sprites[faction] ?? sprites.beast ?? buildLiveFallbackUnitSprite(unitType, civColor);
  }
  return buildLiveFallbackUnitSprite(unitType, civColor);
}
```

Note `civColor: string = ''` (a default value, not `civColor?: string`) — either spelling makes the
parameter optional for callers, but a concrete default reads more clearly at the call site inside
this file than an `undefined` that then needs its own `?? ''` a few lines later.

- [ ] Write this now.

### Step 7: Run tests to verify they pass

Run: `bash scripts/run-with-mise.sh yarn vitest run -t "v2"`

Expected: all pass, including every pre-existing test in the file (confirms no regression to
native-unit behavior, pirate/beast handling, or building/improvement/landmark lookups untouched by
this task).

### Step 8: Commit

```bash
git add src/renderer/sprites/v2/index.ts tests/renderer/sprites/v2/index.test.ts
git commit -m "feat(sprites): add live-fallback rendering to getUnitSpriteV2 (#755)"
```

---

## Task 2: Wire `civColor` through `sprite-overlay.ts`

**Files:**
- Modify: `src/renderer/sprite-overlay.ts:197` (call site inside the pool-miss branch),
  `src/renderer/sprite-overlay.ts:261-271` (`lookupSprite` method signature and its `'unit'` case)
- Modify: `tests/renderer/sprite-overlay.test.ts` (one new integration test)

**Interfaces:**
- Consumes: `getUnitSpriteV2(unitType: string, faction: string, civColor?: string): string | null` (Task 1).
- Produces: `lookupSprite(entity: SpriteEntity, civColor: string): string | null` (private method, new second param — not exported, but the call site change is externally observable via `sync()`'s behavior, which the new test verifies).

### Step 1: Write the failing test

In `tests/renderer/sprite-overlay.test.ts`, add this test in a new `describe` block, appended after
the existing `describe('SpriteOverlay.sync() — pool invalidation on civColor change', ...)` block
(after line ~420, the closing `});` of that block):

```typescript
// ── civColor reaches the live-fallback sprite path ──────────────────────────

describe('SpriteOverlay.sync() — civColor reaches live-fallback unit sprites', () => {
  it('bakes the real civ color into a fallback-tier unit sprite (e.g. tank), not just native ones', () => {
    const { overlay, mount } = mountOverlay();
    const ent = entity({ subtype: 'tank', faction: 'imperials', civId: 'civ-1' });

    overlay.sync(cam(), [ent], MAP, OPTS, { 'civ-1': '#2d6a4f' });

    const el = mount.querySelector('[data-entity-id="u1"]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.innerHTML).toContain('#2d6a4f');
  });

  it('still resolves a native unit sprite unchanged when civColor is provided', () => {
    const { overlay, mount } = mountOverlay();
    const ent = entity({ subtype: 'warrior', faction: 'imperials', civId: 'civ-1' });

    overlay.sync(cam(), [ent], MAP, OPTS, { 'civ-1': '#2d6a4f' });

    const el = mount.querySelector('[data-entity-id="u1"]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.innerHTML).toContain('cq-sprite-wrap');
  });
});
```

- [ ] Write this now.

### Step 2: Run tests to verify they fail

Run: `bash scripts/run-with-mise.sh yarn vitest run -t "civColor reaches live-fallback"`

Expected: FAIL on the first test — `el.innerHTML` won't contain `#2d6a4f` yet, because
`lookupSprite` doesn't pass `civColor` to `getUnitSpriteV2` yet, so the fallback path (if reached
at all) would use the default `''` → `NEUTRAL_FACTION_PALETTE`, not the real civ color. (The second
test may already pass by coincidence since it only checks for `cq-sprite-wrap` presence, not color
— that's fine, TDD doesn't require every new test to fail, only that the feature-defining one does.)

### Step 3: Implement the wiring

In `src/renderer/sprite-overlay.ts`, change the `lookupSprite` call site (line 197):

```typescript
          const rawSvgHtml = this.lookupSprite(entity);
```

to:

```typescript
          const rawSvgHtml = this.lookupSprite(entity, newCivColor);
```

Then change the `lookupSprite` method itself (lines 261-271):

```typescript
  private lookupSprite(entity: SpriteEntity): string | null {
    switch (entity.kind) {
      case 'unit':        return getUnitSpriteV2(entity.subtype, entity.faction);
      case 'building':    return getBuildingSpriteV2(entity.subtype, entity.faction);
      case 'improvement': return getImprovementSpriteV2(entity.subtype); // always null
      case 'landmark':    return getPirateHeadquartersSpriteV2(entity.subtype)
        ?? PIRATE_HEADQUARTERS_SPRITE_CATALOG[entity.subtype as PirateHeadquartersSpriteId]?.({ svgOnly: false })
        ?? null;
      default:            return null;
    }
  }
```

to:

```typescript
  private lookupSprite(entity: SpriteEntity, civColor: string): string | null {
    switch (entity.kind) {
      case 'unit':        return getUnitSpriteV2(entity.subtype, entity.faction, civColor);
      case 'building':    return getBuildingSpriteV2(entity.subtype, entity.faction);
      case 'improvement': return getImprovementSpriteV2(entity.subtype); // always null
      case 'landmark':    return getPirateHeadquartersSpriteV2(entity.subtype)
        ?? PIRATE_HEADQUARTERS_SPRITE_CATALOG[entity.subtype as PirateHeadquartersSpriteId]?.({ svgOnly: false })
        ?? null;
      default:            return null;
    }
  }
```

Only the `'unit'` case changes — `civColor` is accepted by the method for that one case;
`getBuildingSpriteV2`'s signature is untouched (buildings are out of scope, see Global Constraints).

- [ ] Write this now.

### Step 4: Run tests to verify they pass

Run: `bash scripts/run-with-mise.sh yarn vitest run -t "civColor reaches live-fallback"`

Expected: PASS (both tests).

### Step 5: Run the full sprite-overlay suite and v2 suite together

Run: `bash scripts/run-with-mise.sh yarn vitest run -t "SpriteOverlay|getUnitSpriteV2|v2"`

Expected: all pass — confirms Task 1 and Task 2 compose correctly and nothing in the broader
`sprite-overlay.test.ts` file (selection rings, stack pills, pool invalidation, landmark rendering,
etc.) regressed from the `lookupSprite` signature change.

### Step 6: Commit

```bash
git add src/renderer/sprite-overlay.ts tests/renderer/sprite-overlay.test.ts
git commit -m "feat(sprites): thread civColor into the DOM overlay's unit sprite lookup"
```

---

## Task 3: Guardrail hook for hardcoded pixel sizes in `v2/index.ts`

**Files:**
- Modify: `.claude/hooks/check-src-edit.sh` (new `case` block, added after the existing
  `sprite-overlay.ts` hardcoded-pixel-size block, currently ending around line 112)
- Modify: `tests/hooks/check-src-edit.test.sh` (new block/allow smoke-test cases, added before the
  final `exit "$fail"` line)

**Interfaces:** none (shell script + shell smoke test, no TypeScript interfaces).

### Step 1: Write the failing smoke test

In `tests/hooks/check-src-edit.test.sh`, insert these cases right before the final `exit "$fail"`
line:

```bash
# --- v2/index.ts: block hardcoded numeric SVG width/height attribute ---
mkdir -p "$tmp/src/renderer/sprites/v2"
cat > "$tmp/src/renderer/sprites/v2/index.ts" <<'EOF'
const svg = rawSvg.replace(/width="\d+"/, 'width="128" height="128"');
EOF
expect_block "$tmp/src/renderer/sprites/v2/index.ts" "hardcoded width=\"128\" in v2/index.ts"

# --- v2/index.ts: allow the correct responsive-percentage replacement ---
cat > "$tmp/src/renderer/sprites/v2/index.ts" <<'EOF'
const svg = rawSvg.replace(
  /(<svg\b[^>]*?)\swidth="\d+"\s+height="\d+"/,
  '$1 width="100%" height="100%"',
);
EOF
expect_allow "$tmp/src/renderer/sprites/v2/index.ts" "width=\"100%\" replacement in v2/index.ts"
```

- [ ] Write this now.

### Step 2: Run the smoke test to verify the first new case fails

Run: `bash tests/hooks/check-src-edit.test.sh`

Expected: FAIL on `"hardcoded width=\"128\" in v2/index.ts"` — the hook doesn't check this file
path yet, so it currently exits 0 (allow) for everything under `v2/`, including the deliberately
bad fixture. The second case (`width="100%"`) should already pass by coincidence, same reasoning as
Task 2 Step 2 — that's fine.

### Step 3: Implement the new hook check

In `.claude/hooks/check-src-edit.sh`, find the existing block (ends around line 112, right before
the `# --- Object.assign(window or React import in sprite files ---` comment):

```bash
# --- hardcoded pixel size in sprite-overlay.ts (must derive from hexSize × SPRITE_OVERLAY_WORLD_SIZE_FACTOR) ---
case "$file_path" in
  */src/renderer/sprite-overlay.ts)
    if grep -nE 'width:[0-9]+px|height:[0-9]+px' "$file_path" | grep -v '//\|SPRITE_OVERLAY_WORLD_SIZE_FACTOR' >/dev/null; then
      lines="$(grep -nE 'width:[0-9]+px|height:[0-9]+px' "$file_path" | grep -v '//\|SPRITE_OVERLAY_WORLD_SIZE_FACTOR' | head -5)"
      append "Hardcoded px size in sprite-overlay.ts — wrapper size must derive from camera.hexSize × SPRITE_OVERLAY_WORLD_SIZE_FACTOR (see .claude/rules/sprites.md#sprite-overlay-sizing):
$lines"
    fi
    ;;
esac
```

Add this new block immediately after it (same file, do not modify the block above — this is a
**separate** `case` statement, not an added arm on the existing one, because the grep pattern is
different: `sprite-overlay.ts` writes CSS `style.cssText` syntax (`width:128px`), while
`v2/index.ts` produces SVG *attribute* syntax (`width="128"`) — reusing the CSS-syntax pattern on
the new file would never match the mistake it needs to catch):

```bash
# --- hardcoded numeric width/height SVG attribute in v2/index.ts's unit-sprite live fallback ---
# (different syntax from the sprite-overlay.ts check above: this is an SVG attribute, width="128",
# not a CSS style property, width:128px — the DOM overlay wrapper controls actual display size,
# so the inner <svg> must always be responsive: width="100%" height="100%".)
case "$file_path" in
  */src/renderer/sprites/v2/index.ts)
    if grep -nE 'width="[0-9]+"|height="[0-9]+"' "$file_path" | grep -v '//' >/dev/null; then
      lines="$(grep -nE 'width="[0-9]+"|height="[0-9]+"' "$file_path" | grep -v '//' | head -5)"
      append "Hardcoded numeric width/height SVG attribute in v2/index.ts — the DOM overlay wrapper controls display size; the inner <svg> must use width=\"100%\" height=\"100%\" (see .claude/rules/sprites.md#dom-overlay-live-fallback-for-uncovered-unit-sprites):
$lines"
    fi
    ;;
esac
```

- [ ] Write this now.

### Step 4: Run the smoke test to verify it passes

Run: `bash tests/hooks/check-src-edit.test.sh`

Expected: all cases pass, including confirming the hook does **not** false-positive on the actual
regex-replace code from Task 1 (`width="\d+"` in source text — `\d` isn't a digit character, so
`[0-9]+` never matches it) or on the correct `width="100%"` output (`%` before the closing quote
breaks the `[0-9]+"` match).

### Step 5: Confirm the hook fires correctly against the real file from Task 1

Run: `echo '{"tool_name":"Edit","tool_input":{"file_path":"'"$(pwd)"'/src/renderer/sprites/v2/index.ts"}}' | bash .claude/hooks/check-src-edit.sh; echo "exit: $?"`

Expected: `exit: 0` — the real file (after Task 1's implementation) contains only the correct
`width="\d+"` regex source and `width="100%"` replacement output, neither of which the new check
flags.

### Step 6: Commit

```bash
git add .claude/hooks/check-src-edit.sh tests/hooks/check-src-edit.test.sh
git commit -m "chore(hooks): guard against hardcoded pixel sizes in v2/index.ts's unit fallback"
```

---

## Task 4: Documentation — guardrail rules and sprite design system

**Files:**
- Modify: `.claude/rules/sprites.md` (new section + one addition to the existing "Extension Recipe"
  list)
- Modify: `docs/sprite-design-system.md:9-11` (Units section header area)

**Interfaces:** none (docs only).

### Step 1: Add the new section to `.claude/rules/sprites.md`

Find the existing "Extension Recipe — Rail Segment" section's end (the section ends right before
the `---` horizontal rule that precedes `## Hard Rules`). Insert this new section immediately
before that `---`:

```markdown
## DOM-Overlay Live Fallback For Uncovered Unit Sprites

`getUnitSpriteV2` (`src/renderer/sprites/v2/index.ts`) no longer returns `null` for a unit type
with no hand-authored `UNIT_SPRITES` entry, or for a known unit type queried with a `faction`
string that doesn't match one of the 6 archetype-family keys (which happens for every minor-civ-
owned unit — `getFaction()` returns the raw owner id for any owner not in `state.civilizations`).
Instead it calls the live `UNIT_SPRITE_CATALOG` function directly (`{palette, svgOnly: true}`) and
wraps the result in the same `.cq-sprite-wrap.cq-v2` shell every pre-serialized sprite uses — see
`isV2NativeUnit(unitType)` to check which path a given unit takes.

**This is intentional and permanent — do not "fix" it by reverting to `null`.** It's what makes
"every unit animates via the DOM overlay" a structural guarantee (enforced by a test in
`tests/renderer/sprites/v2/index.test.ts` that loops over `UNIT_SPRITE_CATALOG` and asserts
`getUnitSpriteV2` is never `null`) instead of something that silently regresses whenever a new unit
ships without matching hand-authored v2 art — which is exactly what happened before issue #755.

- The inner `<svg>` this path produces is always `width="100%" height="100%"`, never a fixed pixel
  value — the DOM overlay's outer wrapper (sized from `camera.hexSize`) controls actual display
  size. A hook (`check-src-edit.sh`) blocks a hardcoded numeric width/height here.
- `data-kind` is deliberately omitted on fallback-tier sprites — no ambient-effect CSS class is
  `data-kind`-scoped, and guessing wrong risks triggering an unrelated body-plan animation rule.
- Fallback-tier units get ambient-effect animation (`.cq-glow`, `.cq-fire`, etc.) and idle motion,
  but not the 6-way archetype body/armor variation native v2-native units have, nor full
  limb-level walk-cycle art. Upgrading a specific unit to native v2 art is optional, incremental
  work — see the migration-backlog issue referenced in `docs/sprite-design-system.md`'s Units
  section for the recipe.
- Step 5 of the "Extension Recipe — Unit or Building Sprite" above (adding the catalog entry) is
  now sufficient by itself for a new unit to animate via the DOM overlay — writing v2-native
  archetype art is optional richness, not a required step.

---
```

- [ ] Write this now.

### Step 2: Add a "Live render surfaces" note to the Units section of `docs/sprite-design-system.md`

Find (lines 9-11):

```markdown
### Units — `src/renderer/sprites/units.tsx`
Registered in `UNIT_SPRITE_CATALOG` in `src/renderer/sprites/sprite-catalog.ts`.

```

Replace with:

```markdown
### Units — `src/renderer/sprites/units.tsx`
Registered in `UNIT_SPRITE_CATALOG` in `src/renderer/sprites/sprite-catalog.ts`.

Live render surfaces: the map's DOM overlay (`sprite-overlay.ts`) shows an animated unit sprite
whenever `getUnitSpriteV2()` (`src/renderer/sprites/v2/index.ts`) resolves one — either a
hand-authored v2-native sprite (33 unit types, each with distinct body/armor art per one of 6
civilization visual families) or, as of #755, a live-fallback sprite rendered directly from
`UNIT_SPRITE_CATALOG` for everything else (the remaining unit types, plus any minor-civ-owned unit
regardless of type). Every unit type is guaranteed to animate via one of these two paths — none
silently render as a static Canvas bitmap anymore. `isV2NativeUnit(unitType)` tells you which path
a given type takes. See `.claude/rules/sprites.md`'s "DOM-Overlay Live Fallback" section for the
mechanism, and the `art: migrate live-fallback unit sprites to native v2 archetype art` GitHub
issue for the incremental-richness backlog (upgrading fallback-tier units to full archetype art) —
run `Object.keys(UNIT_SPRITE_CATALOG).filter(t => !isV2NativeUnit(t))` for the current, always-up-
to-date list rather than trusting a pasted snapshot.

```

- [ ] Write this now.

### Step 3: Commit

```bash
git add .claude/rules/sprites.md docs/sprite-design-system.md
git commit -m "docs: document the DOM-overlay live-fallback mechanism for unit sprites (#755)"
```

---

## Task 5: Full verification, manual live-render check, and follow-up issue

**Files:** none modified — verification and process only.

### Step 1: Run the full test suite and build

```bash
bash scripts/run-with-mise.sh yarn test
```
Expected: all files pass.

```bash
bash scripts/run-with-mise.sh yarn build
```
Expected: clean, no TypeScript errors.

- [ ] Run both now and confirm green.

### Step 2: Manual live-render verification

jsdom tests prove markup shape, not that a CSS animation actually runs in a real browser. Verify at
least one fallback-tier unit that uses an ambient-effect class genuinely animates, using the same
pattern already established this session (extract real rendered markup via a small script, convert
to PNG with `rsvg-convert` for a static visual check, and/or publish an Artifact page checking
`getComputedStyle(...).animationName` for a live check). Confirm:
- The unit renders recognizably (not a blank/broken SVG).
- `getComputedStyle(el, null).animationName` is not `"none"` for at least one ambient-effect
  element inside it (e.g. a `.cq-glow` element on `combat_drone`, which was the unit that
  originally motivated #755).

- [ ] Do this now and report the result before proceeding.

### Step 3: File the follow-up migration-backlog issue

```bash
gh issue create \
  --title "art: migrate live-fallback unit sprites to native v2 archetype art" \
  --body "$(cat <<'EOF'
## Context

#755 closed the DOM-overlay animation gap for all unit types (and minor-civ-owned units of any
type) by adding a live-fallback path to `getUnitSpriteV2` — see
`docs/superpowers/specs/2026-07-28-unit-sprite-v2-live-fallback-design.md` for the full design.
Fallback-tier units get ambient-effect animation (glow/fire/smoke/etc.) and idle motion, but not
the 6-way archetype body/armor variation (Imperial vs. Viking vs. Pharaoh, etc.) or full
limb-level walk-cycle art that the 33 v2-native units have.

This issue tracks the **optional, incremental** work of upgrading specific fallback-tier units to
real v2-native archetype art. Not blocking anything — the live-fallback path is a complete,
permanent fix on its own terms.

## Detection (always up to date — don't trust a pasted snapshot)

```ts
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { isV2NativeUnit } from '@/renderer/sprites/v2';

Object.keys(UNIT_SPRITE_CATALOG).filter(t => !isV2NativeUnit(t));
```

As of 2026-07-28, that's 24 units: attack_helicopter, autonomous_frigate, biplane, cannon,
cargo_freighter, carrier, combat_drone, container_ship, drone_controller, exosuit_infantry,
grenadier, ironclad, jet_fighter, machine_gunner, missile_submarine, missionary, naval_trader,
observation_balloon, pre_dreadnought, propagandist, rifleman, steamship_trader, submarine, tank —
re-run the snippet above before picking this up, since the roster shifts as new units ship.

## Recipe for upgrading a unit to v2-native art

1. Use the `.claude/skills/generate-sprite-prompt.md` skill to produce a Claude Design prompt —
   note this is **not** a standard sprite prompt: v2-native art uses a different prop convention
   (`{faction, state, phase}` instead of the live `{palette, svgOnly}`) and needs **6 archetype
   body/armor variants** (imperials, vikings, pharaohs, hellenes, khanate, shogunate) per unit,
   not one recolorable shape.
2. Author the result in `design/conquestoria-sprites/lib/units-v2.jsx`, following the existing
   walk-cycle/attack/wound-tier CSS class contract already used by other v2-native units
   (`cq-leg-l`/`cq-leg-r`, `cq-weapon`, `cq-wound-1..3`, etc. — grep existing entries in
   `src/renderer/sprites/v2/*.svg.ts` for the pattern to match).
3. Run `node scripts/serialize-sprites.mjs` to regenerate the `.svg.ts` file.
4. Verify: `isV2NativeUnit('<type>')` should now be `true`, and the unit should keep animating via
   the DOM overlay exactly as it did on the live-fallback tier (no regression), now with full
   archetype variation.

## Non-goals

- Not blocking #755 or any other shipped work.
- Not required for every unit — this is a "nice to have more" backlog, not a completeness bar.
EOF
)"
```

- [ ] Run this now and report the issue URL.

### Step 4: Done

All 5 tasks complete. Proceed to `superpowers:finishing-a-development-branch` per the
executing-plans skill.

---

## Self-Review Notes (completed during plan authoring)

- **Spec coverage:** Architecture (fallback mechanism, `civColor` threading, `isV2NativeUnit`) →
  Tasks 1-2. Guardrail hook → Task 3. Docs → Task 4. Manual verification + follow-up issue → Task 5.
  Every section of the design spec maps to a task; nothing was dropped.
- **Placeholder scan:** no TBD/TODO; every step has real, complete code or an exact command with
  expected output.
- **Existing-test-breakage audit (not called out explicitly in the spec, found while planning):**
  `tests/renderer/sprites/v2/index.test.ts`'s "returns null for unknown faction" test would have
  silently started failing without an explicit fix — Task 1 Step 2 handles this deliberately,
  with an explanatory comment distinguishing "test updated because behavior intentionally changed"
  from "test weakened for convenience." Confirmed no other existing call site (`unit-identity.test.ts`,
  the mocked `SpriteIndex.getUnitSpriteV2` spy in `sprite-overlay.test.ts`) breaks, since `civColor`
  is optional and the spy doesn't assert on call arguments.
- **Type consistency:** `getUnitSpriteV2(unitType: string, faction: string, civColor: string = '')`
  is the exact signature used consistently in Task 1's implementation, Task 2's call site, and every
  test across both tasks. `isV2NativeUnit(unitType: string): boolean` likewise consistent between
  Task 1's definition and Task 4's documentation references. `lookupSprite(entity: SpriteEntity,
  civColor: string): string | null` consistent between Task 2's signature change and its call site.
