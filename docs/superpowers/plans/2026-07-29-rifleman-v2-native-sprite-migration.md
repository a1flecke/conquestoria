# Rifleman v2-Native Sprite Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not use subagent-driven-development or any parallel-agent dispatch for this repo** — `CLAUDE.md`'s Agent Policy bans subagents/parallel agents outright; execute every task inline in the current session.

**Goal:** Migrate the `rifleman` unit sprite from the DOM-overlay live-fallback path to hand-authored v2-native archetype art, as the first single-unit increment of issue [#759](https://github.com/aaronfleckenstein-glitch/conquestoria/issues/759)'s incremental-richness backlog.

**Architecture:** Author a `RiflemanV2Sprite` JSX component in `design/conquestoria-sprites/lib/units-v2.jsx`, following the exact pattern already used by every other v2-native unit (a single `HumanoidV2` shape whose colors are driven by `factionAccent(faction)` — see Deviation From Issue Text below). Register it in `scripts/serialize-sprites.mjs`'s `UNIT_SPRITES` table, run the script to generate `src/renderer/sprites/v2/rifleman.svg.ts`, then wire that generated module into `src/renderer/sprites/v2/index.ts`'s `UNIT_SPRITES` map so `isV2NativeUnit('rifleman')` flips from `false` to `true`.

**Tech Stack:** TypeScript, custom JSX runtime (`jsx-runtime.ts` for game code; Babel + `react-dom/server` inside `serialize-sprites.mjs` for the design-lib JSX), Vitest.

## Global Constraints

- Never hardcode a pixel width/height on the sprite's outer `<svg>` — must stay `width="100%" height="100%"` (enforced by `check-src-edit.sh` and by existing tests).
- Civ/faction color must flow only through `factionAccent(faction)` (`f.dark`/`f.mid`/`f.bright`/`f.trim`) — no hardcoded hex colors standing in for faction identity.
- `data-kind` on a v2-native unit's outer `<svg>`/wrapper must be a real value (`"ranged"` here) — this is what a migrated unit gains that fallback-tier units deliberately omit.
- Every step's code must be complete and runnable as shown — no placeholders.
- Run `bash scripts/run-with-mise.sh yarn test` and `bash scripts/run-with-mise.sh yarn build` before considering the migration done (per `CLAUDE.md`'s pre-push requirement) — this plan's last task does that explicitly.

## Deviation From Issue Text (read before starting)

Issue #759's recipe step 1 says v2-native art "needs 6 archetype body/armor variants (imperials, vikings, pharaohs, hellenes, khanate, shogunate) per unit, not one recolorable shape," and directs the implementer to the `generate-sprite-prompt` skill to produce a Claude-Design prompt for that purpose.

**This is not how the current codebase actually works.** Verified directly against `design/conquestoria-sprites/lib/units-v2.jsx` and `design/conquestoria-sprites/lib/sprite-system.jsx`:
- `factionAccent(faction)` (`sprite-system.jsx:120`) is a **color palette lookup** — `PALETTE.factions.{imperials,vikings,pharaohs,hellenes,khanate,shogunate}`, each `{dark, mid, bright, trim}` hex strings.
- `grep -c "faction ===" design/conquestoria-sprites/lib/units-v2.jsx` returns **0** — no v2-native unit (all ~40 of them, including the closest analog `MusketeerV2Sprite`) branches on the faction value to draw different geometry. Every one is a single `HumanoidV2` shape recolored via `factionAccent`.

So "6 archetype body/armor variants" is a true fact about `PALETTE.factions` having 6 named entries, conflated with a false claim about per-faction geometry that doesn't exist anywhere in the current v2-native roster. This plan follows the pattern that actually exists in the codebase (one shape, `factionAccent`-recolored, matching `MusketeerV2Sprite` — rifleman's direct predecessor unit) rather than the issue's inaccurate description. No Claude Design prompt step is needed for this increment; per `.claude/rules/spec-fidelity.md`'s "Specs Can Be Stale About Current Code," this deviation is intentional and is being called out explicitly rather than silently "fixed." If a future increment genuinely wants per-faction geometry (not just recolor), that would be new scope for `PALETTE.factions`/`HumanoidV2`, not something this plan invents unilaterally.

## File Structure

- Modify `design/conquestoria-sprites/lib/units-v2.jsx` — add `RiflemanV2Sprite` component (source of truth for the art).
- Modify `scripts/serialize-sprites.mjs` — register `['rifleman', 'RiflemanV2Sprite']` so the generator picks it up.
- Create `src/renderer/sprites/v2/rifleman.svg.ts` — generated output (six-faction `Record<string, string>`), produced by running the script, not hand-written.
- Modify `src/renderer/sprites/v2/index.ts` — import the generated module and add it to the `UNIT_SPRITES` lookup map.
- Modify `tests/renderer/sprites/v2/index.test.ts` — move `'rifleman'` out of the fallback-tier sample list, add explicit native-migration assertions.

---

### Task 1: Author the RiflemanV2Sprite component and generate its SVG output

**Files:**
- Modify: `design/conquestoria-sprites/lib/units-v2.jsx`
- Modify: `scripts/serialize-sprites.mjs:96` (insert after the `musketeer` entry)
- Create (generated, not hand-written): `src/renderer/sprites/v2/rifleman.svg.ts`

**Interfaces:**
- Produces: a component `RiflemanV2Sprite({ faction = 'imperials', state = 'idle', phase })` returning a JSX tree, matching the exact call signature every other function in `units-v2.jsx` uses (see `MusketeerV2Sprite`, line 490).
- Produces: `src/renderer/sprites/v2/rifleman.svg.ts` exporting `export const svg: Record<string, string> = { imperials: '...', vikings: '...', pharaohs: '...', hellenes: '...', khanate: '...', shogunate: '...' };` — this is what Task 2 imports.

- [ ] **Step 1: Add `RiflemanV2Sprite` to `design/conquestoria-sprites/lib/units-v2.jsx`**

Insert immediately after the closing `}` of `MusketeerV2Sprite` (currently ends at line 539, right before the `Warrior` section comment at line 541):

```jsx
/* ─────────────────────────── Rifleman (ranged, locked arms, rifled musket + bayonet; upgrades from musketeer) ─────────────────────────── */
function RiflemanV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="ranged" phase={phase}>
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />

      <HumanoidV2
        cx={64} cy={70}
        cloth={f.dark} pants={_P2.cloth.wool}
        accent={f.mid} hair="#2a1a10"
        arms="locked"
        hat={(
          <g>
            {/* shako — tall cylindrical cap, distinct silhouette from musketeer's tricorn */}
            <rect x="-11" y="-48" width="22" height="14" rx="1.5" fill="#1a1410" stroke={_P2.ink.line} strokeWidth="0.8" />
            <rect x="-13" y="-35" width="26" height="3" rx="1" fill={f.trim} stroke={_P2.ink.line} strokeWidth="0.6" />
            <circle cx="0" cy="-48" r="2.4" fill={f.bright} />
          </g>
        )}
      />

      {/* RIFLED MUSKET + FIXED BAYONET — .cq-weapon pivot at right shoulder (82, 55) */}
      <g className="cq-weapon" style={{ '--pivot-x': '82px', '--pivot-y': '55px' }}>
        <g transform="translate(82 55) rotate(18)">
          <rect x="-1" y="0" width="2" height="56" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.5" />
          <rect x="-2" y="0" width="4" height="6" fill={_P2.metal.iron} />
          <path d="M-4,52 L4,52 L3,62 L-3,62 Z" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.6" />
          <rect x="-0.5" y="0" width="1" height="2" fill={_P2.metal.shine} />
          {/* bayonet — fixed to the muzzle, the visual delta from musketeer */}
          <line x1="0" y1="0" x2="0" y2="-16" stroke={_P2.metal.shine} strokeWidth="1.6" strokeLinecap="round" />
        </g>
      </g>

      {/* MUZZLE FLASH — same v1 .cq-muzzle-flash hook as musketeer, moved forward for the bayonet's added length */}
      <g transform="translate(88 17)">
        <g className="cq-muzzle-flash">
          <circle r="6" fill="#ffd966" />
          <circle r="3" fill="#fff" />
          <path d="M0,-9 L2,-3 L8,-2 L3,1 L4,7 L0,4 L-4,7 L-3,1 L-8,-2 L-2,-3 Z" fill="#ffd966" opacity="0.9" />
        </g>
      </g>

      {/* cartridge box */}
      <rect x="44" y="70" width="9" height="8" rx="1" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.5" />
    </SpriteFrameV2>
  );
}
```

- [ ] **Step 2: Register it in the serializer**

In `scripts/serialize-sprites.mjs`, change:

```js
  ['musketeer',     'MusketeerV2Sprite'],
  ['galley',        'GalleyV2Sprite'],
```

to:

```js
  ['musketeer',     'MusketeerV2Sprite'],
  ['rifleman',      'RiflemanV2Sprite'],
  ['galley',        'GalleyV2Sprite'],
```

- [ ] **Step 3: Run the serializer**

```bash
bash scripts/run-with-mise.sh yarn node scripts/serialize-sprites.mjs
```

Expected: console output includes a line for `rifleman`, and `src/renderer/sprites/v2/rifleman.svg.ts` now exists.

- [ ] **Step 4: Sanity-check the generated file**

```bash
node -e "const {svg} = require('./src/renderer/sprites/v2/rifleman.svg.ts'); " 2>/dev/null; \
grep -c "imperials:\|vikings:\|pharaohs:\|hellenes:\|khanate:\|shogunate:" src/renderer/sprites/v2/rifleman.svg.ts
```

Expected: `6` (one key per faction). Also open the file and confirm each value contains `cq-weapon`, `cq-muzzle-flash`, and `cq-leg-l`/`cq-leg-r` (proves the CSS animation hooks made it through the Babel/JSDOM render).

- [ ] **Step 5: Commit**

```bash
git add design/conquestoria-sprites/lib/units-v2.jsx scripts/serialize-sprites.mjs src/renderer/sprites/v2/rifleman.svg.ts
git commit -m "feat(sprites): author v2-native RiflemanV2Sprite and generate its SVG output"
```

---

### Task 2: Wire rifleman into the v2-native lookup and update tests (TDD)

**Files:**
- Modify: `src/renderer/sprites/v2/index.ts`
- Modify: `tests/renderer/sprites/v2/index.test.ts`

**Interfaces:**
- Consumes: `svg as riflemanSvg` from `src/renderer/sprites/v2/rifleman.svg.ts` (produced by Task 1) — same shape as every other import in `index.ts`, e.g. `import { svg as musketeerSvg } from './musketeer.svg';` at line 7.
- Produces: `isV2NativeUnit('rifleman')` now returns `true`; `getUnitSpriteV2('rifleman', <faction>, <civColor>)` now returns native art (contains `data-kind="ranged"`) instead of the live-fallback path.

- [ ] **Step 1: Write the failing tests**

In `tests/renderer/sprites/v2/index.test.ts`, first fix the sample list at line 204-208 (this also fixes a comment that was already stale — the "24 units... 2026-07-28" count is inaccurate; re-running issue #759's own detection snippet against current `main` returns 38, not 24 — so drop the specific stale count from the comment instead of re-baking a new one that will drift again):

```ts
describe('getUnitSpriteV2 — live fallback for uncovered unit types', () => {
  // Representative sample of fallback-tier units (those with no UNIT_SPRITES entry) — not
  // exhaustive here; the full-catalog loop above covers all of them for the "never null"
  // guarantee. Re-run issue #759's detection snippet for the current full list; don't trust a
  // pasted count here, it goes stale (see #759 discussion).
  const FALLBACK_TIER_SAMPLE = ['tank', 'cannon', 'submarine', 'combat_drone', 'grenadier'];
```

(This replaces `'rifleman'` with `'cannon'`, which stays fallback-tier after this migration, so the sample size and coverage intent are unchanged.)

Then add a new `describe` block directly after the existing `isV2NativeUnit` block (after line 202):

```ts
describe('isV2NativeUnit — rifleman migration (#759)', () => {
  it('is true for rifleman now that it has a v2-native entry', () => {
    expect(isV2NativeUnit('rifleman')).toBe(true);
  });

  it('getUnitSpriteV2 returns native art for rifleman, not the live fallback', () => {
    const result = getUnitSpriteV2('rifleman', 'imperials', '#4a90d9')!;
    expect(result).not.toBeNull();
    expect(result).toContain('cq-sprite-wrap');
    expect(result).toContain('cq-v2');
    // Native units carry data-kind; the live-fallback path deliberately omits it (see
    // sprites.md's "DOM-Overlay Live Fallback" rule) — this is the concrete signal that
    // rifleman took the native path, not the fallback path.
    expect(result).toContain('data-kind="ranged"');
    expect(result).toContain('cq-weapon');
    expect(result).toContain('cq-muzzle-flash');
  });

  it('renders for all 6 archetype factions without throwing', () => {
    const factions = ['imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate'];
    for (const faction of factions) {
      const result = getUnitSpriteV2('rifleman', faction, '#4a90d9');
      expect(result, `${faction} should not be null`).not.toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/renderer/sprites/v2/index.test.ts
```

Expected: FAIL — `isV2NativeUnit('rifleman')` still returns `false` (index.ts not wired yet), and the `data-kind="ranged"` assertion fails because `getUnitSpriteV2('rifleman', ...)` is still taking the live-fallback path.

- [ ] **Step 3: Wire the generated module into `src/renderer/sprites/v2/index.ts`**

Add the import next to the existing musketeer import (line 7):

```ts
import { svg as musketeerSvg }     from './musketeer.svg';
import { svg as riflemanSvg }      from './rifleman.svg';
```

Add the map entry next to the existing musketeer entry (line 115):

```ts
  musketeer:     musketeerSvg,
  rifleman:      riflemanSvg,
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/renderer/sprites/v2/index.test.ts
```

Expected: PASS — all tests in the file, including the new `rifleman migration` block and the updated `FALLBACK_TIER_SAMPLE` block.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/sprites/v2/index.ts tests/renderer/sprites/v2/index.test.ts
git commit -m "feat(sprites): wire rifleman into v2-native lookup, update fallback-tier test sample"
```

---

### Task 3: Full-suite verification and catalog-drift re-check

**Files:** none modified — verification only.

**Interfaces:** none — this task only runs commands and confirms output.

- [ ] **Step 1: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: exit 0. In particular, confirm `tests/renderer/sprites/sprite-catalog.test.ts` and `tests/renderer/sprites/v2/index.test.ts` both pass — the former proves `rifleman` still has its (unchanged) `UNIT_SPRITE_CATALOG`/live-render entry, the latter proves the migration and fallback-list update.

- [ ] **Step 2: Run the production build (type-check)**

```bash
bash scripts/run-with-mise.sh yarn build
```

Expected: exit 0 — confirms `rifleman.svg.ts`'s generated types and the new `index.ts` import satisfy `tsc`.

- [ ] **Step 3: Re-run issue #759's own drift-detection snippet to confirm the count dropped by exactly one**

```bash
bash scripts/run-with-mise.sh npx tsx -e "
import { UNIT_SPRITE_CATALOG } from './src/renderer/sprites/sprite-catalog';
import { isV2NativeUnit } from './src/renderer/sprites/v2';
const fallback = Object.keys(UNIT_SPRITE_CATALOG).filter(t => !isV2NativeUnit(t));
console.log('rifleman still fallback?', fallback.includes('rifleman'));
console.log('count:', fallback.length);
"
```

Expected: `rifleman still fallback? false` and `count: 37` (38 minus the one unit this plan migrated).

- [ ] **Step 4: Manually verify no visual/animation regression**

Start the dev server (`bash scripts/run-with-mise.sh yarn dev`), start or load a save where an `imperials`-or-other-faction civ has trained a `rifleman`, and confirm in the browser that the unit still animates on the map (idle bob, walk cycle when moved) with no console errors — this is the "keep animating via the DOM overlay exactly as it did on the live-fallback tier, no regression" check from issue #759's recipe step 4.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(sprites): migrate rifleman to v2-native archetype art (#759)" --body "$(cat <<'EOF'
## Summary
- First single-unit increment of issue #759's incremental sprite-richness backlog: migrates `rifleman` from the DOM-overlay live-fallback path to hand-authored v2-native art (shako hat + fixed bayonet, distinct from musketeer's tricorn).
- Deviates from the issue's stated recipe: does not author 6 distinct per-faction body/armor geometries, because no existing v2-native unit actually does that (verified — `factionAccent` is a color-only palette lookup; `grep -c "faction ===" units-v2.jsx` is 0 across the whole file). Follows the single-recolorable-shape pattern every other v2-native unit already uses.
- Also fixes a stale hardcoded count in `tests/renderer/sprites/v2/index.test.ts`'s comment (claimed 24 fallback-tier units as of 2026-07-28; re-running #759's own detection snippet against current main returns 38 before this change, 37 after).

## Test plan
- [x] `yarn test` passes, including new rifleman-migration assertions in `tests/renderer/sprites/v2/index.test.ts`
- [x] `yarn build` passes (tsc)
- [x] Re-ran #759's detection snippet: rifleman no longer appears in the fallback list; count is 37
- [x] Manually verified in dev server: rifleman still animates (idle + walk) via the DOM overlay, no console errors

Closes #759's rifleman entry (partial — 37 units remain in the backlog; this MR intentionally covers one unit as an incremental delivery).
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** Issue #759's 4-step recipe is covered — (1) skipped intentionally with a documented reason (see Deviation section) rather than silently dropped; (2) done in Task 1 Step 1 following the existing CSS class contract (`cq-leg-l/r`, `cq-weapon`, `cq-muzzle-flash`); (3) done in Task 1 Step 3; (4) done in Task 2 (automated `isV2NativeUnit`/`data-kind` checks) and Task 3 Step 4 (manual no-regression check).
- **Out of scope, not silently fixed:** `docs/sprite-design-system.md`'s "33 unit types" native-art count (line 14) was already stale before this plan (actual native count is 47, independent of this migration) — not touched here to keep this MR's diff focused on rifleman; worth a separate docs-accuracy pass.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code or an exact command with expected output.
- **Type/name consistency:** `RiflemanV2Sprite` (component) → `'RiflemanV2Sprite'` (serializer string) → `rifleman.svg.ts` (generated file, matches the `['rifleman', ...]` first tuple element) → `riflemanSvg` (import alias in `index.ts`, matching the `musketeerSvg` naming convention) — verified consistent across all three tasks.
