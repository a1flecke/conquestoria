# Issue 710 Native Sprite Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild five rejected native-v2 candidates into readable animated unit sprites and supply #709-quality evidence before their live registration.

**Architecture:** Each unit has one palette-driven catalog fallback and one native-v2 source component. The serializer emits six-faction native payloads for a file-safe review page, while a TypeScript review-data writer embeds the actual static SAM Site and Radar Station catalog output. Native lookup imports stay absent until visual evidence is explicitly accepted.

**Tech Stack:** TypeScript, custom JSX runtime, React-compatible design JSX, Vitest, CSS animation, `tsx`, Playwright, local HTML review artifacts.

---

## File map

| File | Responsibility |
| --- | --- |
| `design/conquestoria-sprites/lib/units-v2.jsx` | Five canonical 128×128 native-v2 illustrations and semantic hooks. |
| `src/renderer/sprites/units.tsx` | Five palette-driven fallback silhouettes for minor-civ and unexpected faction paths. |
| `src/renderer/sprites/sprite-catalog.ts` | Preserve the five `withMotion` registrations; point only to rebuilt fallback functions. |
| `src/assets/sprite-animations-v2.css` | Variant-only aircraft, parachute, carrier, and command motion that suppresses inappropriate generic action movement. |
| `scripts/serialize-sprites.mjs` | Serialize the five review-only native components and replace only Issue-710 native-data markers. |
| `scripts/write-issue-710-review-data.ts` | Render `SamSiteSprite` and `RadarStationSprite` with `svgOnly: true` and replace only static catalog-data markers. |
| `docs/reviews/assets/issue-710/sprite-preview.html` | File-safe all-faction/state/phase/reduced-motion review page. |
| `scripts/capture-issue-710-sprite-review.mjs` | Capture browser-driven identity, contact, and SAM/Radar comparison sheets. |
| `docs/reviews/issue-710-native-sprite-visual-review.md` | Links evidence and records each human review criterion. |
| `src/renderer/sprites/v2/{paratrooper,naval_strike_aircraft,maritime_patrol_aircraft,supercarrier,great_general}.svg.ts` | Generated native payloads; never hand-edit. |
| `src/renderer/sprites/v2/index.ts` | Imports and live registrations only after the visual gate passes. |
| `tests/renderer/sprites/{sprite-catalog,sprite-animations-v2-css,issue-710-sprite-preview}.test.ts` | Fallback identity, animation, and evidence contracts. |
| `tests/renderer/sprites/v2/index.test.ts` | Native lookup, kind/variant, semantic-hook, and forbidden-effect contract. |

### Task 1: Establish the corrective red contract

**Files:**
- Modify: `tests/renderer/sprites/sprite-catalog.test.ts`
- Modify: `tests/renderer/sprites/v2/index.test.ts`
- Modify: `tests/renderer/sprites/sprite-animations-v2-css.test.ts`
- Create: `tests/renderer/sprites/issue-710-sprite-preview.test.ts`

- [ ] **Step 1: Add native identity and semantic-hook failures.**

  Add this contract beside the #709 block in `v2/index.test.ts`:

  ```ts
  const ISSUE_710_NATIVE = {
    paratrooper: ['ranged', 'paratrooper', ['cq-parachute-canopy', 'cq-parachute-lines', 'cq-paratrooper-harness', 'cq-paratrooper-pack', 'cq-paratrooper-rifle', 'cq-arm-l', 'cq-arm-r', 'cq-leg-l', 'cq-leg-r']],
    naval_strike_aircraft: ['civilian', 'naval-strike-aircraft', ['cq-strike-fuselage', 'cq-strike-cockpit', 'cq-strike-wing', 'cq-strike-tail', 'cq-strike-tailhook', 'cq-naval-strike-torpedo']],
    maritime_patrol_aircraft: ['civilian', 'maritime-patrol-aircraft', ['cq-patrol-fuselage', 'cq-patrol-wing', 'cq-patrol-nacelle-l', 'cq-patrol-nacelle-r', 'cq-patrol-prop-l', 'cq-patrol-prop-r', 'cq-patrol-radar-dome']],
    supercarrier: ['naval', 'supercarrier', ['cq-supercarrier-hull', 'cq-supercarrier-bow', 'cq-supercarrier-deck', 'cq-supercarrier-island', 'cq-supercarrier-mast', 'cq-supercarrier-aircraft', 'cq-supercarrier-wake']],
    great_general: ['civilian', 'great-general', ['cq-general-body', 'cq-general-arm-l', 'cq-general-arm-r', 'cq-general-leg-l', 'cq-general-leg-r', 'cq-general-map', 'cq-general-standard']],
  } as const;
  ```

  For every target and six supported factions, require `isV2NativeUnit(type)`, matching
  `data-kind`, matching `data-kind-variant`, and every marker. Assert Maritime Patrol and Great
  General contain none of `cq-weapon`, `cq-muzzle-flash`, or `cq-hit-spark`.

- [ ] **Step 2: Strengthen catalog fallback parity failures.**

  Replace the current one-marker #710 assertions with every required marker that can occur in the
  fallback anatomy: canopy/harness/rifle; strike fuselage/cockpit/tailhook/torpedo; patrol
  fuselage/nacelles/radar; carrier hull/bow/deck/island/wake; and General arms/legs/map/standard.
  Keep each former-donor inequality. Preserve the existing SAM-vs-Radar inequality and add the
  opposite markers: SAM has `cq-sam-launcher` and no `cq-radar-tower`; Radar has its dish/tower
  markers and no `cq-sam-launcher`.

- [ ] **Step 3: Add exact motion-selector failures.**

  Require state-scoped selectors for canopy, paratrooper rifle, strike torpedo, patrol radar,
  Supercarrier launch aircraft, General map/standard, and the relevant civilian/ranged/naval
  variant override. Assert the two aircraft selectors cancel generic action movement before their
  own glide/release/scan animation. Add every new animated class to the reduced-motion pause list.

- [ ] **Step 4: Add the file-safe evidence failure.**

  Create `issue-710-sprite-preview.test.ts` modelled on #709. It must require native and catalog
  marker pairs, local CSS only, `globalThis.__ISSUE_710_SPRITES__`,
  `globalThis.__ISSUE_710_BUILDINGS__`, all five states, `0%`, `25%`, `50%`, `75%`, six factions,
  reduced motion, no module/import/network/sidecar script, five identity sheets, five contact
  sheets, and a SAM/Radar comparison sheet linked by the review Markdown.

- [ ] **Step 5: Run the red contract and inspect the expected failures.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/issue-710-sprite-preview.test.ts
  ```

  Expected: the five units are not native, new anatomy hooks and CSS selectors are missing, and
  the Issue-710 preview/evidence files do not exist. A test error unrelated to those assertions is
  corrected before changing production code.

- [ ] **Step 6: Commit the red contract.**

  ```bash
  git add tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/issue-710-sprite-preview.test.ts
  git commit -m "test(710): specify corrective sprite contract"
  ```

### Task 2: Rebuild readable fallbacks and review-only native anatomy

**Files:**
- Modify: `src/renderer/sprites/units.tsx`
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Modify: `design/conquestoria-sprites/lib/units-v2.jsx`

- [ ] **Step 1: Rebuild the five catalog fallbacks from the source prompt.**

  Use `SpriteFrame`, `Shadow`, material tokens, and `Banner` for all five. Implement the exact
  silhouette hierarchy below; role markers are literal `className` values from Task 1.

  ```text
  Paratrooper: shadow → canopy group → line group → harness/pack → whole Humanoid → rifle → Banner
  Strike jet: shadow → fuselage → cockpit → wing pair → tail/tailhook → belly-mounted torpedo → Banner
  Patrol plane: shadow → fuselage/cockpit → straight wing → nacelle/propeller pair → tailplane → radar dome → Banner
  Supercarrier: shadow → wake → dark hull/bow/stern → tapered deck/runway → three body+wing aircraft → island/mast → Banner
  General: shadow → complete Humanoid → two arm/map assembly → standard → Banner
  ```

  Keep `withMotion('type', FunctionName)` catalog registrations. Do not reuse a donor SVG, hardcode
  faction color, or treat a map, torpedo, canopy, or aircraft as a detached overlay.

- [ ] **Step 2: Author matching native-v2 source components.**

  Implement the same hierarchy in `units-v2.jsx`, using `SpriteFrameV2`, `_P2`, `_fa2(faction)`,
  the exact kind/variant from Task 1, and `phase={phase}`. Use an unclassified outer transform
  wrapper followed by an untransformed animated hook whenever an element has both placement and
  CSS motion. Put the map inside both General hand/arm groups, the torpedo inside a belly-mount
  group, the canopy lines in a static canopy/harness assembly, and the launch aircraft inside the
  deck. Export all five in the existing `Object.assign(window, ...)` list.

- [ ] **Step 3: Verify fallbacks and source shape before serialization.**

  Run the Task-1 command. Expected: fallback catalog assertions pass; native lookup, CSS, and
  preview evidence still fail because no payload is registered or generated.

- [ ] **Step 4: Commit the anatomy-only change.**

  ```bash
  git add src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts design/conquestoria-sprites/lib/units-v2.jsx
  git commit -m "art(710): rebuild readable unit anatomy"
  ```

### Task 3: Serialize a file-safe review surface and physically credible motion

**Files:**
- Modify: `scripts/serialize-sprites.mjs`
- Create: `scripts/write-issue-710-review-data.ts`
- Modify: `src/assets/sprite-animations-v2.css`
- Create: `docs/reviews/assets/issue-710/sprite-preview.html`
- Create: `src/renderer/sprites/v2/{paratrooper,naval_strike_aircraft,maritime_patrol_aircraft,supercarrier,great_general}.svg.ts`

- [ ] **Step 1: Add the five serializer pairs and native marker writer.**

  Add `[id, ComponentName]` entries for the five native functions. Add
  `writeIssue710PreviewData(byUnit)` that replaces only
  `<!-- ISSUE_710_SPRITES_START -->` through `<!-- ISSUE_710_SPRITES_END -->`, JSON-escapes `<`,
  and writes `globalThis.__ISSUE_710_SPRITES__`. Populate `byUnit` only for the five #710 IDs.

- [ ] **Step 2: Add actual catalog building preview data.**

  Implement `scripts/write-issue-710-review-data.ts` with direct imports of
  `BUILDING_SPRITE_CATALOG`, `RadarStationSprite`, and `derivePalette`. Render the Imperial
  `sam_site` catalog function and Radar Station function with `{ palette, svgOnly: true }`, then
  replace only `<!-- ISSUE_710_BUILDINGS_START -->` through
  `<!-- ISSUE_710_BUILDINGS_END -->` with `globalThis.__ISSUE_710_BUILDINGS__ = { sam_site, radar_station }`.
  Run it through `bash scripts/run-with-mise.sh yarn tsx scripts/write-issue-710-review-data.ts`.

- [ ] **Step 3: Create the review page before generating data.**

  The HTML has no import, module script, remote URL, or sidecar script. It loads only
  `../../../../src/assets/sprite-animations-v2.css`, preserves both marker pairs, and mounts five
  native unit cards plus static SAM/Radar cards. Controls select faction, lifecycle state, paused
  phase, and reduced motion. Unit cards use the serialized native payload; static cards use only
  `__ISSUE_710_BUILDINGS__` and expose 40px/64px/128px scale buttons.

- [ ] **Step 4: Add variant-only CSS motion.**

  Give the Paratrooper canopy a restrained sway and rifle a local recoil; cancel generic ranged
  weapon motion first. Give the strike jet a light glide and a short torpedo-release transform;
  give the patrol plane prop rotation and radar pulse with no body thrust; let the Supercarrier
  use the naval hull motion and a deck-child launch transform; give the General only map/standard
  gesture. Use `transform-box: fill-box`, local origins, and phase-adjusted delays. Add matching
  reduced-motion coverage without hiding any identity layer.

- [ ] **Step 5: Generate review-only data and verify green except native registration.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn node scripts/serialize-sprites.mjs
  bash scripts/run-with-mise.sh yarn tsx scripts/write-issue-710-review-data.ts
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/issue-710-sprite-preview.test.ts
  ```

  Expected: fallback, CSS, and preview tests pass. Native lookup tests still fail because the
  review gate deliberately withholds `v2/index.ts` imports.

- [ ] **Step 6: Commit review-only artwork and motion.**

  ```bash
  git add design/conquestoria-sprites/lib/units-v2.jsx src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts src/assets/sprite-animations-v2.css scripts/serialize-sprites.mjs scripts/write-issue-710-review-data.ts docs/reviews/assets/issue-710/sprite-preview.html src/renderer/sprites/v2/paratrooper.svg.ts src/renderer/sprites/v2/naval_strike_aircraft.svg.ts src/renderer/sprites/v2/maritime_patrol_aircraft.svg.ts src/renderer/sprites/v2/supercarrier.svg.ts src/renderer/sprites/v2/great_general.svg.ts
  git commit -m "art(710): stage corrected sprite review"
  ```

### Task 4: Capture visual evidence and hold the human gate

**Files:**
- Create: `scripts/capture-issue-710-sprite-review.mjs`
- Create: `docs/reviews/issue-710-native-sprite-visual-review.md`
- Create: `docs/reviews/assets/issue-710/{paratrooper,naval-strike-aircraft,maritime-patrol-aircraft,supercarrier,great-general}-{identity-sheet,contact-sheet}.png`
- Create: `docs/reviews/assets/issue-710/sam-radar-comparison.png`

- [ ] **Step 1: Capture exact review artifacts.**

  Use the #709 Playwright pattern against the local file-safe page. For each native target, save
  one identity sheet at 40px, 64px, and 128px, then isolate one card and capture idle/walk/attack/
  hurt/death at paused 0%, 25%, 50%, and 75% phase columns. Capture SAM/Radar at all three sizes
  in the same browser page. Fail the script when a card, state control, phase control, required
  CSS animation, or static building payload is missing.

- [ ] **Step 2: Write the review record.**

  Link every generated PNG. For each unit record the role identity, 40px readability, exact
  connection checks, distinct faction treatment, and reduced-motion result. The SAM/Radar section
  records launcher/bunker versus dish/lattice-tower distinction. State that the assets remain
  review-only and native lookup is still intentionally absent.

- [ ] **Step 3: Run evidence and focused proof.**

  ```bash
  bash scripts/run-with-mise.sh yarn node scripts/capture-issue-710-sprite-review.mjs
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/issue-710-sprite-preview.test.ts
  ```

  Expected: evidence/preview/fallback/CSS tests pass; only native lookup remains red until a human
  accepts the images. Open the page both through Vite and directly as `file://`, then pause here
  for the user's visual approval.

- [ ] **Step 4: Commit review evidence.**

  ```bash
  git add scripts/capture-issue-710-sprite-review.mjs docs/reviews/issue-710-native-sprite-visual-review.md docs/reviews/assets/issue-710 tests/renderer/sprites/issue-710-sprite-preview.test.ts
  git commit -m "docs(710): record corrected sprite review"
  ```

### Task 5: Register accepted native payloads and verify the MR

**Files:**
- Modify: `src/renderer/sprites/v2/index.ts`
- Modify: `docs/superpowers/plans/2026-08-25-issue-710-native-sprite-correction.md`

- [ ] **Step 1: Add only the five approved generated imports and lookup entries.**

  Import each generated module under its camel-case `Svg` name and add only
  `paratrooper`, `naval_strike_aircraft`, `maritime_patrol_aircraft`, `supercarrier`, and
  `great_general` to `UNIT_SPRITES`. Preserve `buildLiveFallbackUnitSprite` so minor-civ and
  unknown-faction paths continue to use the rebuilt catalog fallbacks.

- [ ] **Step 2: Run the complete focused proof.**

  ```bash
  scripts/check-src-rule-violations.sh src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/sprites/v2/index.ts src/assets/sprite-animations-v2.css
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/issue-710-sprite-preview.test.ts tests/renderer/sprite-overlay.test.ts tests/renderer/render-loop-combat-sprite-state.test.ts
  ```

  Expected: all targeted suites pass; native faction output carries each approved hook while an
  unrecognized faction still receives a non-null live fallback.

- [ ] **Step 3: Run delivery verification separately.**

  ```bash
  git diff --check
  bash scripts/run-with-mise.sh yarn build
  bash scripts/run-with-mise.sh yarn test:durable
  bash scripts/run-with-mise.sh yarn test:durable:status
  git diff --stat origin/main...HEAD
  git diff --stat
  ```

- [ ] **Step 4: Commit registration and plan status.**

  After all evidence and verification pass, mark every completed task in this plan and add the
  PR number/status annotation in the same delivery commit:

  ```bash
  git add src/renderer/sprites/v2/index.ts docs/superpowers/plans/2026-08-25-issue-710-native-sprite-correction.md
  git commit -m "feat(710): register approved native sprites"
  ```
