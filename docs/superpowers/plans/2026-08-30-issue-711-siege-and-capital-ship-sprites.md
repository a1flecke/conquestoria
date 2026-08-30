# Issue 711 Siege and Capital Ship Sprites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four #711 donor sprites with readable faction-aware fallbacks and native-V2 map sprites whose locomotion and attacks match their machinery and naval roles.

**Architecture:** Keep a deliberately matched static `UNIT_SPRITE_CATALOG` fallback for Canvas and unknown-faction use, while moving the normal six-faction DOM-overlay path to serialized `SpriteFrameV2` components. Variant-scoped CSS owns all moving local parts; it suppresses only inappropriate inherited movement and leaves the generic naval hull rock intact.

**Tech Stack:** TypeScript, JSX-to-string sprite catalog, native V2 JSX serialization, CSS animation, Vitest, Playwright review captures.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `src/renderer/sprites/units.tsx` | Four static, palette-aware catalog fallback silhouettes. |
| `src/renderer/sprites/sprite-catalog.ts` | Import and register each fallback without altering the existing `humanoid`/`naval` fallback motion taxonomy. |
| `design/conquestoria-sprites/lib/units-v2.jsx` | Four editable native-V2 sprites with stateful physical hooks. |
| `scripts/serialize-sprites.mjs` | Serialize the four V2 components and embed them in the file-safe #711 review page. |
| `src/renderer/sprites/v2/{trebuchet,rocket_artillery,battleship,missile_cruiser}.svg.ts` | Generated six-faction native payloads; never hand-edit. |
| `src/renderer/sprites/v2/index.ts` | Import generated payloads and select native art before the fallback. |
| `src/assets/sprite-animations-v2.css` | Local wheel, siege, turret, radar, and VLS animations; reduced motion remains globally authoritative. |
| `docs/reviews/assets/issue-711/sprite-preview.html` | File-safe review surface for every faction, state, paused phase, and reduced-motion mode. |
| `scripts/capture-issue-711-sprite-review.mjs` | Captures map-scale identity and state contact sheets from the real serialized payloads and CSS. |
| `docs/reviews/issue-711-native-sprite-visual-review.md` | Links the captured evidence and records the visual acceptance checklist. |
| `tests/renderer/sprites/*.test.ts`, `tests/renderer/sprite-overlay.test.ts`, `tests/renderer/unit-renderer-overlay.test.ts` | Regression coverage for role markers, native routing, state propagation, fog, animation selectors, and review-page integrity. |

No player panel, queue, game rule, or renderer-control interaction changes. The review page is documentation tooling, not player-facing UI.

### Task 1: Lock the #711 visual and runtime contract with failing tests — ✅ implemented locally; targeted and build verification recorded

**Files:**
- Modify: `tests/renderer/sprites/sprite-catalog.test.ts:348-403`
- Modify: `tests/renderer/sprites/v2/index.test.ts:300-370`
- Modify: `tests/renderer/sprites/sprite-animations-v2-css.test.ts:99-129`
- Modify: `tests/renderer/sprite-overlay.test.ts:128-150, 196-205`
- Modify: `tests/renderer/unit-renderer-overlay.test.ts:34-112`
- Create: `tests/renderer/sprites/issue-711-sprite-preview.test.ts`

- [x] **Step 1: Add catalog identity regressions before replacing any alias.**

  Add a `describe('#711 siege and capital-ship sprites are not aliases of their former donors', ...)` block using this complete table. It proves every fallback has its role-defining, inspectable geometry instead of merely a different SVG string.

  ```ts
  const cases = [
    ['trebuchet', 'catapult', ['cq-trebuchet-a-frame', 'cq-trebuchet-counterweight', 'cq-trebuchet-beam', 'cq-trebuchet-sling', 'cq-trebuchet-carriage']],
    ['rocket_artillery', 'artillery', ['cq-rocket-artillery-chassis', 'cq-rocket-artillery-rack', 'cq-rocket-artillery-tubes', 'cq-rocket-artillery-stabilizer', 'cq-rocket-artillery-crate']],
    ['battleship', 'pre_dreadnought', ['cq-battleship-hull', 'cq-battleship-turret-fore', 'cq-battleship-turret-mid', 'cq-battleship-turret-aft', 'cq-battleship-bridge', 'cq-battleship-rangefinder']],
    ['missile_cruiser', 'pre_dreadnought', ['cq-missile-cruiser-hull', 'cq-missile-cruiser-vls', 'cq-missile-cruiser-bridge', 'cq-missile-cruiser-radar-forward', 'cq-missile-cruiser-radar-aft']],
  ] as const;

  it.each(cases)('%s is bespoke and carries its approved role markers', (type, donor, markers) => {
    const actual = UNIT_SPRITE_CATALOG[type]({ palette, svgOnly: true });
    const former = UNIT_SPRITE_CATALOG[donor]({ palette, svgOnly: true });
    expect(actual).not.toBe(former);
    for (const marker of markers) expect(actual, `${type} missing ${marker}`).toContain(marker);
  });
  ```

- [x] **Step 2: Add native-route and faction regressions.**

  Add the following #711 table to `v2/index.test.ts`. Iterate all six factions, assert `isV2NativeUnit(type)`, exact outer `data-kind` and `data-kind-variant`, and every listed hook. Assert the `Set` of six serialized strings has size six so the faction pennant/identifier remains palette-derived.

  ```ts
  const ISSUE_711_NATIVE = {
    trebuchet: ['ranged', 'trebuchet', ['cq-trebuchet-a-frame', 'cq-trebuchet-counterweight', 'cq-trebuchet-beam', 'cq-trebuchet-sling', 'cq-trebuchet-carriage', 'cq-trebuchet-wheel']],
    rocket_artillery: ['ranged', 'rocket-artillery', ['cq-rocket-artillery-chassis', 'cq-rocket-artillery-rack', 'cq-rocket-artillery-tubes', 'cq-rocket-artillery-stabilizer', 'cq-rocket-artillery-crate', 'cq-rocket-artillery-wheel']],
    battleship: ['naval', 'battleship', ['cq-battleship-hull', 'cq-battleship-turret-fore', 'cq-battleship-turret-mid', 'cq-battleship-turret-aft', 'cq-battleship-bridge', 'cq-battleship-rangefinder', 'cq-battleship-wake', 'cq-muzzle-flash']],
    missile_cruiser: ['naval', 'missile-cruiser', ['cq-missile-cruiser-hull', 'cq-missile-cruiser-vls', 'cq-missile-cruiser-bridge', 'cq-missile-cruiser-radar-forward', 'cq-missile-cruiser-radar-aft', 'cq-missile-cruiser-wake', 'cq-missile-cruiser-vls-lid', 'cq-missile-cruiser-launch']],
  } as const;
  ```

- [x] **Step 3: Add CSS selector regressions for actual locomotion and attacks.**

  Require every selector below to exist and declare an `animation:` rule. Also assert that the two siege variants explicitly set both `walk` and `attack` `.cq-sprite-figure` animations to `none`; that both naval variants set only their `attack` figure to `none`; and that the generic `data-kind="naval"` walk selector still exists.

  ```ts
  const localSelectors = [
    '.cq-v2[data-kind="ranged"][data-kind-variant="trebuchet"][data-state="walk"] .cq-trebuchet-wheel',
    '.cq-v2[data-kind="ranged"][data-kind-variant="trebuchet"][data-state="attack"] .cq-trebuchet-beam',
    '.cq-v2[data-kind="ranged"][data-kind-variant="trebuchet"][data-state="attack"] .cq-trebuchet-counterweight',
    '.cq-v2[data-kind="ranged"][data-kind-variant="rocket-artillery"][data-state="walk"] .cq-rocket-artillery-wheel',
    '.cq-v2[data-kind="ranged"][data-kind-variant="rocket-artillery"][data-state="attack"] .cq-rocket-artillery-rack',
    '.cq-v2[data-kind="ranged"][data-kind-variant="rocket-artillery"][data-state="attack"] .cq-rocket-artillery-tubes',
    '.cq-v2[data-kind="naval"][data-kind-variant="battleship"][data-state="attack"] .cq-battleship-turret-fore',
    '.cq-v2[data-kind="naval"][data-kind-variant="battleship"][data-state="attack"] .cq-battleship-turret-mid',
    '.cq-v2[data-kind="naval"][data-kind-variant="battleship"][data-state="attack"] .cq-battleship-turret-aft',
    '.cq-v2[data-kind="naval"][data-kind-variant="missile-cruiser"][data-state="idle"] .cq-missile-cruiser-radar-forward',
    '.cq-v2[data-kind="naval"][data-kind-variant="missile-cruiser"][data-state="attack"] .cq-missile-cruiser-vls-lid',
    '.cq-v2[data-kind="naval"][data-kind-variant="missile-cruiser"][data-state="attack"] .cq-missile-cruiser-launch',
  ];
  ```

- [x] **Step 4: Add renderer state and fog regressions.**

  Add an overlay `it.each` for `['trebuchet', 'ranged', 'trebuchet']`, `['rocket_artillery', 'ranged', 'rocket-artillery']`, `['battleship', 'naval', 'battleship']`, and `['missile_cruiser', 'naval', 'missile-cruiser']`. Sync each entity as `idle`, then `walk`, then `attack`; assert the same DOM node survives both updates, the outer wrapper has the exact kind/variant, and its final `data-state` is `attack`.

  In `unit-renderer-overlay.test.ts`, loop the same four `UnitType` values through `visible`, `fog`, and `unexplored` visibility. Assert the unit entity is present only in the visible case. This is coverage for the issue requirement, not a change to `buildUnitEntities`.

- [x] **Step 5: Add a failing file-safe visual-review test.**

  Create `issue-711-sprite-preview.test.ts` following the #710 test's file-safe assertions. Require `docs/reviews/assets/issue-711/sprite-preview.html`, a stylesheet link to `../../../../src/assets/sprite-animations-v2.css`, an embedded `globalThis.__ISSUE_711_SPRITES__` payload, no module/import/network/sidecar script, controls for `idle`, `walk`, `attack`, `hurt`, `death`, four paused phases, six faction options, `id="reduced-motion"`, and the four unit IDs.

- [x] **Step 6: Run the focused tests and confirm they fail for the intended missing behavior.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprite-overlay.test.ts tests/renderer/unit-renderer-overlay.test.ts tests/renderer/sprites/issue-711-sprite-preview.test.ts
  ```

  Expected: failures report the four donor aliases, absent native V2 registrations/variant selectors, and absent #711 preview. Existing unrelated sprite coverage remains green.

- [x] **Step 7: Commit the regression contract.**

  ```bash
  git add tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprite-overlay.test.ts tests/renderer/unit-renderer-overlay.test.ts tests/renderer/sprites/issue-711-sprite-preview.test.ts
  git commit -m "test(711): define siege and capital ship sprite contract"
  ```

### Task 2: Replace the catalog fallback aliases with four distinct static silhouettes — ✅ implemented locally; targeted and build verification recorded

**Files:**
- Modify: `src/renderer/sprites/units.tsx:1507-1710, 2258-2305`
- Modify: `src/renderer/sprites/sprite-catalog.ts:1-80, 299-325`
- Test: `tests/renderer/sprites/sprite-catalog.test.ts`

- [x] **Step 1: Add the four named exports and preserve the exact static fallback contract.**

  Import `TrebuchetSprite`, `RocketArtillerySprite`, `BattleshipSprite`, and `MissileCruiserSprite` in `sprite-catalog.ts`. Each export has exactly this signature and uses only `P`, `palette`, `Shadow`, `Banner`, and `SpriteFrame` already defined in `units.tsx`:

  ```tsx
  export function TrebuchetSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
    return <SpriteFrame svgOnly={svgOnly}>
      <g data-kind="ranged">
        <Shadow cx={64} cy={101} rx={45} ry={6} />
        <g className="cq-trebuchet-carriage"><path d="M20,86 H103 L98,96 H25 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />{[31, 47, 78, 94].map(x => <g key={x} className="cq-trebuchet-wheel" transform={`translate(${x} 98)`}><circle r="7" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" /><path d="M-6,0H6M0,-6V6" stroke={P.metal.iron} strokeWidth=".8" /></g>).join('')}</g>
        <g className="cq-trebuchet-a-frame"><path d="M42,86 L57,43 L71,86 M50,70 H65" fill="none" stroke={P.wood.dark} strokeWidth="4" strokeLinecap="round" /><path d="M45,86 L59,47 L69,86" fill="none" stroke={P.wood.mid} strokeWidth="1" /></g>
        <g className="cq-trebuchet-counterweight"><path d="M37,55 H53 L50,70 H40 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" /><line x1="45" y1="55" x2="57" y2="48" stroke={P.metal.iron} strokeWidth="1" /></g>
        <g className="cq-trebuchet-beam" transform="translate(58 48) rotate(-17)"><rect x="-29" y="-2.5" width="64" height="5" rx="2" fill={P.wood.mid} stroke={P.ink.line} strokeWidth=".8" /><circle r="4" fill={P.metal.iron} stroke={P.ink.line} strokeWidth=".7" /><g className="cq-trebuchet-sling"><line x1="34" y1="0" x2="43" y2="15" stroke={P.cloth.linen} strokeWidth="1.2" /><path d="M41,15 q5,3 9,0" fill="none" stroke={P.cloth.linen} strokeWidth="1.2" /></g></g>
        <Banner x={35} y={48} palette={palette} scale={0.54} />
      </g>
    </SpriteFrame>;
  }
  ```

  Implement the same non-animated static detail in the other three exports with these exact group boundaries: `cq-rocket-artillery-chassis` / `rack` / `tubes` / `stabilizer` / `crate`; `cq-battleship-hull` / three `turret-*` groups / `bridge` / `rangefinder` / `wake`; and `cq-missile-cruiser-hull` / `vls` / `bridge` / two `radar-*` groups / `wake`. The Trebuchet gets a tall A-frame and empty sling; Rocket Artillery gets at least six short visible tube mouths and no cannon barrel; Battleship gets three paired-gun turrets; Missile Cruiser gets closed VLS cells and no standing missile.

- [x] **Step 2: Use shared material and faction constraints in each fallback.**

  Use `P.wood.*` and `P.stone.*` for Trebuchet; `P.metal.iron`/`P.metal.steel` with a narrow `palette.mid` identifier band for Rocket Artillery; and steel, iron, shine, and `P.ground.water` for both ships. Use only the existing `Banner` for faction identity. Do not add gradients, text, logos, real flags, runes, or projectile art.

- [x] **Step 3: Replace only the four alias registrations.**

  Make these exact registrations while retaining `withMotion` and the established fallback motion map:

  ```ts
  trebuchet:        withMotion('trebuchet', TrebuchetSprite),
  rocket_artillery: withMotion('rocket_artillery', RocketArtillerySprite),
  battleship:       withMotion('battleship', BattleshipSprite),
  missile_cruiser:  withMotion('missile_cruiser', MissileCruiserSprite),
  ```

  Do not alter `buildLiveFallbackUnitSprite`, `UNIT_MOTION_STYLES`, fog gating, combat logic, or other catalog entries. Task 4's native path supplies state-specific locomotion; this fallback keeps its existing static move transforms for Canvas and unknown factions.

- [x] **Step 4: Run the fallback regression and source-rule check.**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts
  ```

  Expected: the #711 catalog table passes and the audit no longer reports the four former donor pairs.

- [x] **Step 5: Commit the static fallback slice.**

  ```bash
  git add src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts tests/renderer/sprites/sprite-catalog.test.ts
  git commit -m "feat(711): replace siege and capital ship fallback sprites"
  ```

### Task 3: Add the file-safe Issue #711 review surface and serializer payload plumbing — ✅ implemented locally; targeted and build verification recorded

**Files:**
- Modify: `scripts/serialize-sprites.mjs:36-50, 260-341`
- Create: `docs/reviews/assets/issue-711/sprite-preview.html`
- Create: `scripts/capture-issue-711-sprite-review.mjs`
- Create: `docs/reviews/issue-711-native-sprite-visual-review.md`
- Test: `tests/renderer/sprites/issue-711-sprite-preview.test.ts`

- [x] **Step 1: Create the review page before adding the serializer writer.**

  Create a standalone HTML page modeled on the existing #710 review UI but limited to the four #711 identifiers. Its `render()` function must select `globalThis.__ISSUE_711_SPRITES__[unitId][faction]`, parse it into a `.cq-sprite-wrap.cq-v2` card, set both wrapper and nested SVG `data-state`, and set `--phase` on each. Include the production stylesheet by relative file path and controls for every state, phase, faction, and reduced-motion mode. Embed empty markers exactly once:

  ```html
  <!-- ISSUE_711_SPRITES_START -->
  <!-- ISSUE_711_SPRITES_END -->
  ```

  Do not use `type="module"`, `import`, a `<script src>`, or an HTTP(S) URL; the generated payload must make `file://` rendering complete.

- [x] **Step 2: Add serializer hooks for the #711 page.**

  Define `ISSUE_711_PREVIEW_HTML`, start/end marker constants, `writeIssue711PreviewData(byUnit)`, and `const issue711PreviewSprites = {};` beside the existing #708–#710 equivalents. For the four exact IDs, assign `byFaction` to the new payload object during the unit serialization loop, then call `writeIssue711PreviewData(issue711PreviewSprites)` after the existing preview writers. Escape `<` with `\\u003c` exactly as the existing writers do.

- [x] **Step 3: Add the capture script and visual-review record.**

  Capture four identity sheets at 40px, 64px, and 128px plus four contact sheets covering `idle`, `walk`, `attack`, `hurt`, `death` at phases `0`, `.25`, `.5`, and `.75`. The script must verify via computed style that Trebuchet beam, Rocket Artillery rack, Battleship fore turret, and Missile Cruiser VLS lid each receive a non-`none` local animation in their required state. The review markdown links the eight PNGs and marks these exact visual checks: role readable at 40px, limited faction accent, connected moving joints, appropriate attack mechanism, no persistent projectile, and reduced motion preserves the complete static silhouette.

- [x] **Step 4: Run the review-page test and confirm the new surface is file-safe.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/issue-711-sprite-preview.test.ts
  ```

  Expected: the page test now passes up to generated-payload content; the V2 component task supplies that content before visual capture.

- [x] **Step 5: Commit the review harness.**

  ```bash
  git add scripts/serialize-sprites.mjs docs/reviews/assets/issue-711/sprite-preview.html scripts/capture-issue-711-sprite-review.mjs docs/reviews/issue-711-native-sprite-visual-review.md tests/renderer/sprites/issue-711-sprite-preview.test.ts
  git commit -m "test(711): add native sprite review surface"
  ```

### Task 4: Author, serialize, and route the native V2 sprites — ✅ implemented locally; targeted and build verification recorded

**Files:**
- Modify: `design/conquestoria-sprites/lib/units-v2.jsx:after SupercarrierV2Sprite`
- Modify: `scripts/serialize-sprites.mjs:94-151`
- Create: `src/renderer/sprites/v2/trebuchet.svg.ts` (generated)
- Create: `src/renderer/sprites/v2/rocket_artillery.svg.ts` (generated)
- Create: `src/renderer/sprites/v2/battleship.svg.ts` (generated)
- Create: `src/renderer/sprites/v2/missile_cruiser.svg.ts` (generated)
- Modify: `src/renderer/sprites/v2/index.ts:1-85, 126-190`
- Test: `tests/renderer/sprites/v2/index.test.ts`

- [x] **Step 1: Add four `SpriteFrameV2` components with untransformed moving children.**

  Use `_P2` and `_fa2(faction)` in each. Each component receives `{ faction = 'imperials', state = 'idle', phase }`, passes `state`, `kind`, `variant`, and `phase` to `SpriteFrameV2`, contains a `cq-shadow`, and uses one small `f.mid`/`f.trim` pennant. Keep static placement on outer groups; place the class that CSS transforms on a nested child with no SVG transform attribute. Use warm wood, stone, steel, and water forms to express grounded historical/industrial realism; omit magic, runes, gradients, blur, text, logos, real flags, national marks, and persistent projectiles.

  | Component | Exact frame | Required physical composition |
  | --- | --- | --- |
  | `TrebuchetV2Sprite` | `kind="ranged" variant="trebuchet"` | Four `cq-trebuchet-wheel` groups under `cq-trebuchet-carriage`; tall `cq-trebuchet-a-frame`; nested counterweight, pivoted beam, and empty sling. |
  | `RocketArtilleryV2Sprite` | `kind="ranged" variant="rocket-artillery"` | Low six-wheel chassis; a separate elevated `cq-rocket-artillery-rack`; a tube-bank with six or more mouths; stabilizer and crate. |
  | `BattleshipV2Sprite` | `kind="naval" variant="battleship"` | Long lower hull/wake, compact bridge/rangefinder, and separated fore/mid/aft paired-gun turrets. Each turret contains its own local `cq-muzzle-flash`. |
  | `MissileCruiserV2Sprite` | `kind="naval" variant="missile-cruiser"` | Slim angular hull/wake, closed VLS grid with nested lids and a short local launch indicator, enclosed bridge, forward/aft radar panels. |

  Append these exact names to the existing `Object.assign(window, { ... })` argument without changing its current exports:

  ```jsx
  TrebuchetV2Sprite, RocketArtilleryV2Sprite,
  BattleshipV2Sprite, MissileCruiserV2Sprite,
  ```

- [x] **Step 2: Register the native source with the serializer and regenerate, never hand-editing generated payloads.**

  Add these entries after the existing siege/naval rows:

  ```js
  ['trebuchet',       'TrebuchetV2Sprite'],
  ['rocket_artillery','RocketArtilleryV2Sprite'],
  ['battleship',      'BattleshipV2Sprite'],
  ['missile_cruiser', 'MissileCruiserV2Sprite'],
  ```

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn node scripts/serialize-sprites.mjs
  ```

  Inspect `git status --short` before staging. The expected #711 generated changes are the four new `src/renderer/sprites/v2/*.svg.ts` files plus the #711 preview payload; stop if unrelated generated source changes appear.

- [x] **Step 3: Route the generated components through the live V2 map lookup.**

  Add imports for the four generated modules and these exact map entries, all before the legendary-beast block:

  ```ts
  trebuchet:        trebuchetSvg,
  rocket_artillery: rocketArtillerySvg,
  battleship:       battleshipSvg,
  missile_cruiser:  missileCruiserSvg,
  ```

  Do not change fallback wrapping: native registration is what supplies outer `data-kind` and `data-kind-variant` for real faction sprites, while minor/unknown factions still use the safe fallback.

- [x] **Step 4: Run native serialization and routing tests.**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/renderer/sprites/v2/index.ts
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts
  ```

  Expected: all four entries are native for every named faction, retain six faction-derived outputs, and expose the required structural hooks.

- [x] **Step 5: Commit the editable source, generated assets, and lookup registration together.**

  ```bash
  git add design/conquestoria-sprites/lib/units-v2.jsx scripts/serialize-sprites.mjs src/renderer/sprites/v2/trebuchet.svg.ts src/renderer/sprites/v2/rocket_artillery.svg.ts src/renderer/sprites/v2/battleship.svg.ts src/renderer/sprites/v2/missile_cruiser.svg.ts src/renderer/sprites/v2/index.ts docs/reviews/assets/issue-711/sprite-preview.html tests/renderer/sprites/v2/index.test.ts
  git commit -m "feat(711): add native siege and capital ship sprites"
  ```

### Task 5: Add variant-owned locomotion and attacks — ✅ implemented locally; targeted and build verification recorded

**Files:**
- Modify: `src/assets/sprite-animations-v2.css:after the #710 corrective section, before the final reduced-motion block`
- Test: `tests/renderer/sprites/sprite-animations-v2-css.test.ts`

- [x] **Step 1: Add the siege CSS with fixed chassis and local wheels/mechanisms.**

  Add exact walk/attack figure suppression for both ranged variants, set `transform-box: fill-box` and physical `transform-origin` for every wheel/beam/counterweight/rack/tube group, then define `cq711-wheel-roll`, `cq711-trebuchet-fire`, `cq711-counterweight-drop`, and `cq711-rack-recoil` keyframes. Apply them only through the selectors named in Task 1. The trebuchet attack rotates only beam/sling and drops the counterweight; the rocket attack translates the rack backward briefly and flashes only its tube mouths.

  ```css
  .cq-v2[data-kind="ranged"][data-kind-variant="trebuchet"][data-state="walk"] .cq-sprite-figure { animation: none; }
  .cq-v2[data-kind="ranged"][data-kind-variant="trebuchet"][data-state="attack"] .cq-sprite-figure { animation: none; }
  .cq-v2[data-kind="ranged"][data-kind-variant="rocket-artillery"][data-state="walk"] .cq-sprite-figure { animation: none; }
  .cq-v2[data-kind="ranged"][data-kind-variant="rocket-artillery"][data-state="attack"] .cq-sprite-figure { animation: none; }
  ```

- [x] **Step 2: Add the naval attack CSS without cancelling naval travel.**

  Keep the existing generic naval idle/walk `.cq-sprite-figure` rock. Cancel only attack body animation for `battleship` and `missile-cruiser`, then apply local `cq711-turret-recoil`, `cq711-radar-scan`, `cq711-vls-open`, and `cq711-vls-launch` keyframes. The Missile Cruiser launch indicator must reset to its closed/deck position at 0% and 100%; no transform may leave a missile visible after the attack cycle.

  ```css
  .cq-v2[data-kind="naval"][data-kind-variant="battleship"][data-state="attack"] .cq-sprite-figure { animation: none; }
  .cq-v2[data-kind="naval"][data-kind-variant="missile-cruiser"][data-state="attack"] .cq-sprite-figure { animation: none; }
  ```

- [x] **Step 3: Preserve reduced motion without a duplicate override.**

  Place all #711 selectors before the existing `@media (prefers-reduced-motion: reduce)` blocks. The existing `.cq-v2 * { animation: none !important; }` is the source of truth; do not introduce a second reduced-motion policy. Add #711 hook class names to the final broad pause-list only if a hook is used outside the `.cq-v2 *` scope.

- [x] **Step 4: Run the CSS regression.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-animations-v2-css.test.ts
  ```

  Expected: the test proves each role has local animation, siege has no generic gait/lunge, ship travel retains naval rock, and ship attacks do not lunge.

- [x] **Step 5: Commit the animation slice.**

  ```bash
  git add src/assets/sprite-animations-v2.css tests/renderer/sprites/sprite-animations-v2-css.test.ts
  git commit -m "feat(711): animate siege and capital ship mechanisms"
  ```

### Task 6: Verify live state propagation, fog safety, and visual evidence — ✅ implemented locally; targeted and build verification recorded

**Files:**
- Modify: `docs/reviews/assets/issue-711/sprite-preview.html` (serializer-generated payload only)
- Create: `docs/reviews/assets/issue-711/{trebuchet,rocket-artillery,battleship,missile-cruiser}-{identity,contact}-sheet.png`
- Modify: `docs/reviews/issue-711-native-sprite-visual-review.md`
- Test: `tests/renderer/sprite-overlay.test.ts`, `tests/renderer/unit-renderer-overlay.test.ts`, `tests/renderer/sprites/issue-711-sprite-preview.test.ts`

- [x] **Step 1: Run the state and fog regressions after native routing is present.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprite-overlay.test.ts tests/renderer/unit-renderer-overlay.test.ts
  ```

  Expected: the actual native wrapper receives `walk` then `attack` without replacement, and all four types remain absent for fogged/unexplored tiles.

- [x] **Step 2: Regenerate payload and capture the real review sheets.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn node scripts/serialize-sprites.mjs
  bash scripts/run-with-mise.sh yarn node scripts/capture-issue-711-sprite-review.mjs
  ```

  Open the file-safe preview and inspect the 40px identity sheets and attack contact sheets. Reject and correct any silhouette that reads as its former donor, any disconnected transformed part, any humanoid lunge/hop, any standing projectile, or any faction paint that overwhelms material readability.

- [x] **Step 3: Complete the visual review record with evidence-backed findings.**

  In `docs/reviews/issue-711-native-sprite-visual-review.md`, link all eight captured PNG names and record each of these pass conditions: A-frame/counterweight versus torsion catapult; tube-bank versus cannon; three turrets versus pre-dreadnought; VLS/radar versus gun ship; wheel/ship locomotion; connected local attack mechanics; static reduced-motion read; and no fog leak.

- [x] **Step 4: Run the complete targeted proof.**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/sprites/v2/index.ts
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprite-overlay.test.ts tests/renderer/unit-renderer-overlay.test.ts tests/renderer/sprites/issue-711-sprite-preview.test.ts
  bash scripts/run-with-mise.sh yarn build
  ```

  Expected: source-rule check, all focused regressions, and TypeScript/Vite build pass. Run each command separately; do not combine build and tests in one shell command.

- [x] **Step 5: Inspect all branch and local deltas, then commit the evidence and plan progress.**

  Run:

  ```bash
  git diff --check
  git diff --stat origin/main...HEAD
  git diff --stat
  git diff origin/main...HEAD -- src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/sprites/v2/index.ts src/assets/sprite-animations-v2.css
  git diff -- docs/superpowers/plans/2026-08-30-issue-711-siege-and-capital-ship-sprites.md
  ```

  Tick every completed checkbox and add `✅ merged` only after the relevant work has actually merged; while on this branch, annotate completed tasks as `✅ implemented locally` rather than claiming a merge. Commit the captured evidence, review record, final test updates, and plan status:

  ```bash
  git add docs/reviews/assets/issue-711 docs/reviews/issue-711-native-sprite-visual-review.md docs/superpowers/plans/2026-08-30-issue-711-siege-and-capital-ship-sprites.md tests/renderer/sprite-overlay.test.ts tests/renderer/unit-renderer-overlay.test.ts tests/renderer/sprites/issue-711-sprite-preview.test.ts
  git commit -m "docs(711): capture siege and capital ship sprite review"
  ```

### Task 7: Run the branch-level verification before delivery or publication — ✅ implemented locally; verification recorded

**Files:**
- Modify: `docs/superpowers/plans/2026-08-30-issue-711-siege-and-capital-ship-sprites.md` only to record completed verification status.

- [x] **Step 1: Run durable verification separately from the build.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn build
  bash scripts/run-with-mise.sh yarn test:durable
  bash scripts/run-with-mise.sh yarn test:durable:status
  ```

  Expected: the durable status accepts a passed result for the current `HEAD` and working tree. If streamed durable output is incomplete, use `test:durable:status` as the authoritative result before inspecting a process.

- [x] **Step 2: Reinspect the exact final diff and working tree.**

  Run:

  ```bash
  git status --short --branch
  git diff --check
  git diff --stat origin/main...HEAD
  git diff --stat
  git diff origin/main...HEAD
  ```

  Expected: no whitespace errors; only #711 sprite, serializer, review, test, and plan files are present; no unreviewed local delta remains.

- [x] **Step 3: Update the plan status and commit only the status update.**

  Replace each locally completed checkbox with `- [x]` and add `✅ implemented locally; verification recorded` to each completed task heading. Do not write `merged` until a PR is merged.

  ```bash
  git add docs/superpowers/plans/2026-08-30-issue-711-siege-and-capital-ship-sprites.md
  git commit -m "docs(711): record sprite verification"
  ```
