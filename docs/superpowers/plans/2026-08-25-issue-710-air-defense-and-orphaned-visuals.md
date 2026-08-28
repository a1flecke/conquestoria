# Issue 710 Air Defense and Orphaned Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Status (2026-08-27):** Superseded by the corrective plan after human visual review found readability and attachment defects in the first candidate set. The accepted scope, evidence, and delivery status are tracked in `2026-08-25-issue-710-native-sprite-correction.md` and [MR #904](https://github.com/a1flecke/conquestoria/pull/904); retain this document as the historical original contract.

**Goal:** Replace #710's SAM Site fallback and five orphaned unit aliases with distinct, reviewed, native-v2-backed visual identities.

**Architecture:** `SamSiteSprite` stays in the standard palette-driven building catalog because buildings have no unit native-v2 path. The five units use one authored native source, generated six-faction payloads, catalog fallbacks, a file-safe preview, and #709's hard evidence gate: candidates serialize and are reviewed before live native registration.

**Tech Stack:** TypeScript, JSX SVG runtime, native-v2 SVG serialization, CSS animation, Vitest, Node capture scripts, Markdown review evidence.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/renderer/sprites/buildings.tsx` | Dedicated palette-aware `SamSiteSprite`. |
| `src/renderer/sprites/units.tsx` | Five role-readable fallback sprites for live unexpected-faction rendering. |
| `src/renderer/sprites/sprite-catalog.ts` | Replace exactly six donor mappings. |
| `design/conquestoria-sprites/lib/units-v2.jsx` | Canonical five native unit illustrations and semantic hooks. |
| `scripts/serialize-sprites.mjs` | Serialize five units and embed the #710 preview payload. |
| `src/renderer/sprites/v2/{paratrooper,naval_strike_aircraft,maritime_patrol_aircraft,supercarrier,great_general}.svg.ts` | Generated, never hand-edited faction payloads. |
| `src/renderer/sprites/v2/index.ts` | Native imports and registrations after visual review approval. |
| `src/assets/sprite-animations-v2.css` | Variant-local state motion and reduced-motion coverage. |
| `docs/reviews/assets/issue-710/sprite-preview.html` | File-safe all-faction/state review surface. |
| `scripts/capture-issue-710-sprite-review.mjs` | Identity and phase-sheet capture from committed preview payloads. |
| `docs/reviews/issue-710-air-defense-and-orphaned-visual-review.md` | Human-review checklist and generated evidence links. |
| `tests/renderer/sprites/{sprite-catalog,issue-710-sprite-preview,sprite-animations-v2-css}.test.ts` | Non-alias, preview, and motion contracts. |
| `tests/renderer/sprites/v2/index.test.ts` | Native lookup, faction, hook, and fallback parity contracts. |

## Fixed body-plan contract

Do not infer a body plan from the unit's domain. Use these exact values so generic
motion never gives an aircraft a humanoid gait or gives a non-combat General a weapon
swing: Paratrooper is `ranged`, Naval Strike Aircraft and Maritime Patrol Aircraft
are `civilian` with only their variant-local motion, Supercarrier is `naval`, and
Great General is `civilian`. Every native component and native test asserts this
mapping; the fallback path deliberately carries no `data-kind`, as required by the
existing live-fallback architecture.

### Task 1: Commit the red catalog and native-v2 contract

**Files:**
- Modify: `tests/renderer/sprites/sprite-catalog.test.ts`
- Modify: `tests/renderer/sprites/v2/index.test.ts`
- Modify: `tests/renderer/sprites/sprite-animations-v2-css.test.ts`
- Create: `tests/renderer/sprites/issue-710-sprite-preview.test.ts`

- [ ] **Step 1: State every exact donor replacement and role marker in tests.**

  Add this contract beside the #709 coverage; compare actual `svgOnly` catalog output to its donor with `derivePalette('#4a90d9')` and require the marker on both fallback and native output:

  ```ts
  const ISSUE_710_UNITS = {
    paratrooper: { donor: 'infantry', marker: 'cq-paratrooper-pack', variant: 'paratrooper' },
    naval_strike_aircraft: { donor: 'jet_fighter', marker: 'cq-naval-strike-torpedo', variant: 'naval-strike-aircraft' },
    maritime_patrol_aircraft: { donor: 'recon_aircraft', marker: 'cq-patrol-radar', variant: 'maritime-patrol-aircraft' },
    supercarrier: { donor: 'carrier', marker: 'cq-supercarrier-island', variant: 'supercarrier' },
    great_general: { donor: 'warrior', marker: 'cq-general-map', variant: 'great-general' },
  } as const;

  const ISSUE_710_BUILDING = { target: 'sam_site', donor: 'radar_station', marker: 'cq-sam-launcher' } as const;
  ```

  Assert every target differs from its stated donor, contains its marker, and that `sam_site` has no `cq-radar-tower` marker. Add nearest-family negative comparisons: Paratrooper/Infantry, Naval Strike Aircraft/Jet Fighter, Maritime Patrol Aircraft/Recon Aircraft, Supercarrier/Carrier, Great General/Warrior, and SAM Site/Radar Station.

- [ ] **Step 2: Add the failing native lookup and motion-hook contract.**

  For every faction in `['imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate']`, assert each new native unit returns `cq-v2`, its exact `data-kind`/`data-kind-variant`, and these hooks:

  ```ts
  const ISSUE_710_HOOKS = {
    paratrooper: ['cq-paratrooper-body', 'cq-paratrooper-pack', 'cq-arm-l', 'cq-arm-r', 'cq-leg-l', 'cq-leg-r', 'cq-weapon'],
    naval_strike_aircraft: ['cq-naval-strike-body', 'cq-naval-strike-prop', 'cq-naval-strike-torpedo'],
    maritime_patrol_aircraft: ['cq-patrol-body', 'cq-patrol-prop-l', 'cq-patrol-prop-r', 'cq-patrol-radar'],
    supercarrier: ['cq-supercarrier-hull', 'cq-supercarrier-deck', 'cq-supercarrier-island', 'cq-supercarrier-parked-aircraft'],
    great_general: ['cq-general-body', 'cq-general-map', 'cq-general-flag', 'cq-general-glasses'],
  } as const;

  const ISSUE_710_KINDS = {
    paratrooper: 'ranged', naval_strike_aircraft: 'civilian',
    maritime_patrol_aircraft: 'civilian', supercarrier: 'naval',
    great_general: 'civilian',
  } as const;
  ```

  Assert unknown-faction resolution still uses the live catalog fallback, while `isV2NativeUnit(type)` remains false until Task 5 registers reviewed output.

- [ ] **Step 3: Add failing motion safety assertions.**

  Require state-scoped selectors for every hook that moves. Require the propellers' transform origins to use their hubs, the General flag to use a mast origin, and reject selector bodies that animate `.cq-supercarrier-parked-aircraft`, `cq-sam-launcher`, or a `translate(` placement wrapper. Require each new animated hook in the existing reduced-motion pause block.

- [ ] **Step 4: Add the failing file-safe preview contract.**

  Require a `docs/reviews/assets/issue-710/sprite-preview.html` document with all five IDs, the six factions, `idle/walk/attack/hurt/death`, reduced motion, `globalThis.__ISSUE_710_SPRITES__`, `0%/25%/50%/75%` paused controls, an explicit SAM-vs-Radar comparison, no `import`, no module script, and no remote URL.

- [ ] **Step 5: Run the red tests and commit them.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/issue-710-sprite-preview.test.ts
  ```

  Expected: the #710 marker/native/preview assertions fail while unrelated suites remain green.

  ```bash
  git add tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/issue-710-sprite-preview.test.ts
  git commit -m "test(710): specify air-defense and orphaned sprite contract"
  ```

### Task 2: Create the SAM Site and five fallback silhouettes

**Files:**
- Modify: `src/renderer/sprites/buildings.tsx`
- Modify: `src/renderer/sprites/units.tsx`
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Test: `tests/renderer/sprites/sprite-catalog.test.ts`

- [ ] **Step 1: Add the dedicated static SAM Site.**

  Export `SamSiteSprite({ palette, svgOnly = false }: BuildingSpriteProps)` after `RadarStationSprite`. Use `BuildingFrame`, `BuildingPlinth`, the semantic classes `cq-sam-bunker`, `cq-sam-launcher`, `cq-sam-missiles`, and `cq-sam-dish`; draw a low bunker, nested angled launcher/missiles, and short tracking dish. Do not add animation classes, a coverage arc, or a radar sweep.

- [ ] **Step 2: Add the five palette-driven fallbacks.**

  Export `ParatrooperSprite`, `NavalStrikeAircraftSprite`, `MaritimePatrolAircraftSprite`, `SupercarrierSprite`, and `GreatGeneralSprite` using `UnitSpriteProps`, `SpriteFrame`, `Shadow`, existing material tokens, palette-only faction surfaces, and a `Banner` where a standard/pennant is visible. Preserve the Task-1 marker hooks exactly. Keep the torpedo nested inside naval aircraft body, parked planes inside the Supercarrier deck but outside every animated group, and General map/flag/glasses inside their owning hand/mast groups.

- [ ] **Step 3: Replace only the six mappings.**

  ```ts
  paratrooper: withMotion('paratrooper', ParatrooperSprite),
  naval_strike_aircraft: withMotion('naval_strike_aircraft', NavalStrikeAircraftSprite),
  maritime_patrol_aircraft: withMotion('maritime_patrol_aircraft', MaritimePatrolAircraftSprite),
  supercarrier: withMotion('supercarrier', SupercarrierSprite),
  great_general: withMotion('great_general', GreatGeneralSprite),
  sam_site: SamSiteSprite,
  ```

- [ ] **Step 4: Run the catalog tests and commit the fallback work.**

  Run the Task-1 command. Expected: catalog assertions pass; native, CSS, and preview tests remain red.

  ```bash
  git add src/renderer/sprites/buildings.tsx src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts tests/renderer/sprites/sprite-catalog.test.ts
  git commit -m "art(710): author air-defense and orphaned fallbacks"
  ```

### Task 3: Author candidates and serialize review-only native output

**Files:**
- Modify: `design/conquestoria-sprites/lib/units-v2.jsx`
- Modify: `scripts/serialize-sprites.mjs`
- Create: `docs/reviews/assets/issue-710/sprite-preview.html`
- Create: `src/renderer/sprites/v2/paratrooper.svg.ts`
- Create: `src/renderer/sprites/v2/naval_strike_aircraft.svg.ts`
- Create: `src/renderer/sprites/v2/maritime_patrol_aircraft.svg.ts`
- Create: `src/renderer/sprites/v2/supercarrier.svg.ts`
- Create: `src/renderer/sprites/v2/great_general.svg.ts`

- [ ] **Step 1: Add canonical native components and containment.**

  Add `ParatrooperV2Sprite`, `NavalStrikeAircraftV2Sprite`, `MaritimePatrolAircraftV2Sprite`, `SupercarrierV2Sprite`, and `GreatGeneralV2Sprite` using `SpriteFrameV2`, the fixed body-plan contract, the Task-1 variants and hooks, and one stable root/body group per asset. A movable nested group owns each propeller, limb, flag, or rifle. Place Supercarrier parked aircraft inside `cq-supercarrier-deck`, but do not give them a moving class. Use no weapon hook, projectile, muzzle flash, or impact spark on the patrol plane or General.

- [ ] **Step 2: Add the serializer pairs and preview writer.**

  Add `ISSUE_710_PREVIEW_HTML`, start/end marker constants, `writeIssue710PreviewData(byUnit)`, and these `UNIT_SPRITES` pairs:

  ```js
  ['paratrooper', 'ParatrooperV2Sprite'],
  ['naval_strike_aircraft', 'NavalStrikeAircraftV2Sprite'],
  ['maritime_patrol_aircraft', 'MaritimePatrolAircraftV2Sprite'],
  ['supercarrier', 'SupercarrierV2Sprite'],
  ['great_general', 'GreatGeneralV2Sprite'],
  ```

  `writeIssue710PreviewData` must replace only the marker-delimited block and JSON-escape `<` before assigning `globalThis.__ISSUE_710_SPRITES__`.

- [ ] **Step 3: Create the preview shell and serialize without native registration.**

  Make the preview follow #709's local-CSS, no-network structure, add the SAM/Radar static comparison card generated directly from `BUILDING_SPRITE_CATALOG` with the same deterministic palette used by the catalog test, then run:

  ```bash
  bash scripts/run-with-mise.sh yarn node scripts/serialize-sprites.mjs
  ```

  Inspect only generated files; never hand-edit their payloads. Do not change `v2/index.ts` yet.

- [ ] **Step 4: Run the focused suite and commit review candidates.**

  Expected: catalog and generated-preview contracts pass; native lookup remains deliberately red.

  ```bash
  git add design/conquestoria-sprites/lib/units-v2.jsx scripts/serialize-sprites.mjs docs/reviews/assets/issue-710/sprite-preview.html src/renderer/sprites/v2/paratrooper.svg.ts src/renderer/sprites/v2/naval_strike_aircraft.svg.ts src/renderer/sprites/v2/maritime_patrol_aircraft.svg.ts src/renderer/sprites/v2/supercarrier.svg.ts src/renderer/sprites/v2/great_general.svg.ts
  git commit -m "art(710): serialize native visual review candidates"
  ```

### Task 4: Add physically attached, reduced-motion-safe motion

**Files:**
- Modify: `src/assets/sprite-animations-v2.css`
- Modify: `tests/renderer/sprites/sprite-animations-v2-css.test.ts`

- [ ] **Step 1: Add variant-local motion.**

  Add selectors only under each target's `data-kind-variant`. Paratrooper alternates nested leg joints and gives the held rifle slight recoil. Naval Strike and Patrol aircraft rotate nested propellers about their hubs; only Naval Strike gets a short body/torpedo-mounted attack response. Supercarrier gets small hull/deck response but no transform on parked-aircraft. Great General moves nested arm and mast-rooted flag, never a sword swing. No SAM selector is added.

- [ ] **Step 2: Add reduced-motion coverage.**

  Include each moving hook in the existing `prefers-reduced-motion` pause selector and verify the classes still have ordinary state-scoped rules. The static composition, labels, fog, selection, and health paths remain untouched.

- [ ] **Step 3: Run CSS/native tests and commit motion.**

  Run the Task-1 command. Expected: CSS tests pass; native registration test is the sole intentional remaining failure.

  ```bash
  git add src/assets/sprite-animations-v2.css tests/renderer/sprites/sprite-animations-v2-css.test.ts
  git commit -m "feat(710): animate reviewed air and command silhouettes"
  ```

### Task 5: Capture visual evidence, review it, and register native units

**Files:**
- Create: `scripts/capture-issue-710-sprite-review.mjs`
- Create: `docs/reviews/assets/issue-710/{paratrooper,naval-strike-aircraft,maritime-patrol-aircraft,supercarrier,great-general}-{identity,contact}-sheet.png`
- Create: `docs/reviews/assets/issue-710/sam-site-comparison-sheet.png`
- Create: `docs/reviews/issue-710-air-defense-and-orphaned-visual-review.md`
- Modify: `src/renderer/sprites/v2/index.ts`
- Modify: `tests/renderer/sprites/v2/index.test.ts`
- Modify: `tests/renderer/sprites/issue-710-sprite-preview.test.ts`

- [ ] **Step 1: Capture source-derived evidence.**

  Model the capture script on #709. It opens only the local #710 preview, captures 40px/64px/128px identity sheets and paused `walk`/`attack` sheets at `0%`, `25%`, `50%`, and `75%`, then writes the catalog-derived SAM-vs-Radar comparison. It must fail if a required preview card, phase label, or image write is missing.

- [ ] **Step 2: Write and complete the review record.**

  The Markdown review links every generated image and records verification of each role cue, former-donor difference, attachment/pivot safety, material/faction readability, reduced motion, nonmoving parked aircraft, noncombat General/Patrol reads, and static non-disclosing SAM Site.

- [ ] **Step 3: Conduct the hard visual gate.**

  Inspect all generated sheets and the interactive preview. If any attachment, occlusion, material, or readability criterion fails, revise only `units-v2.jsx`/CSS, regenerate, and recapture before proceeding. Do not register candidate units until the review record is affirmative.

- [ ] **Step 4: Register only approved payloads.**

  Import the five generated modules in `v2/index.ts` and add their IDs to `UNIT_SPRITES`. Update Task-1 tests so `isV2NativeUnit` is true for every #710 unit and all six faction payloads contain exact hooks.

- [ ] **Step 5: Run focused tests and commit the reviewed integration.**

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/issue-710-sprite-preview.test.ts
  ```

  Expected: all #710 source, catalog, native, CSS, and direct-file review tests pass.

  ```bash
  git add scripts/capture-issue-710-sprite-review.mjs docs/reviews/assets/issue-710 docs/reviews/issue-710-air-defense-and-orphaned-visual-review.md src/renderer/sprites/v2/index.ts tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/issue-710-sprite-preview.test.ts
  git commit -m "art(710): register reviewed air-defense visual batch"
  ```

### Task 6: Verify delivery and synchronize the tracking issue

**Files:**
- Modify: `docs/superpowers/plans/2026-08-25-issue-710-air-defense-and-orphaned-visuals.md`

- [ ] **Step 1: Run source checks and relevant renderer tests.**

  ```bash
  scripts/check-src-rule-violations.sh src/renderer/sprites/buildings.tsx src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/sprites/v2/index.ts
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/issue-710-sprite-preview.test.ts
  bash scripts/run-with-mise.sh yarn node scripts/serialize-sprites.mjs
  git diff --check
  ```

- [ ] **Step 2: Inspect the complete delta and run final verification.**

  ```bash
  git diff --stat origin/main...HEAD
  git diff --stat
  git diff origin/main...HEAD
  git diff
  bash scripts/run-with-mise.sh yarn build
  bash scripts/run-with-mise.sh yarn test:durable
  bash scripts/run-with-mise.sh yarn test:durable:status
  ```

- [ ] **Step 3: Synchronize documentation and GitHub.**

  Mark this plan's completed tasks and add its PR number/status annotation before opening the PR. Keep the already-posted #710 scope-update comment accurate by linking the final PR and review record; if the issue body is edited, preserve its original acceptance criteria while adding the five adopted targets, their donors, and the exclusions owned by #711/#713. The PR body links this design, the review record, and the focused/full verification results.
