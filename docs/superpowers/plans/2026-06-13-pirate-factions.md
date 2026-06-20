# Pirate Factions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` inline to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **DO NOT USE SUBAGENTS.**

**Goal:** Implement issue #353 as a complete era-aware pirate faction system with deterministic ecology, raids, blockades, tribute, final-era proxy contracts, coastal enclaves, mobile flotillas, save migration, AI parity, authoritative UI, production v2 sprites/animations/damage art, and production SFX.

**Architecture:** Pirate state is a versioned serializable domain object in `GameState`, coordinated once per completed round by a thin `pirate-system.ts`. Pure ecology, behavior, action, and presentation helpers own rules; `turn-manager.ts` only supplies the completed-round facts and applies returned events. A shared `owner-kind.ts` prevents `pirate-*` IDs from leaking into civilization-only systems. Generic notifications move into core state instead of creating a pirate-only log. Map art uses production pirate assets in both the Canvas sprite catalog and the DOM v2 overlay, with headquarters represented by a first-class landmark layer.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, DOM/CSS v2 sprite overlay, seeded game randomness, Web Audio, OGG assets, ffmpeg for reproducible audio preparation, Browser plugin for visual QA.

**Approved design:** `docs/superpowers/specs/2026-06-13-pirate-factions-design.md`

**Drift baseline:** `origin/main` was fetched on 2026-06-13 and remained at `4b9693d` before this plan was written. Design-hardening commit: `9aa7130`.

**Execution constraints:**

- The first implementation action is posting the committed plan to GitHub issue #353.
- Use TDD for every gameplay, save, UI, renderer, and audio behavior change.
- Do not add pirate owners to `civilizations`, `minorCivs`, diplomacy rosters, or turn order.
- Do not use `Math.random()`.
- Do not expose a player-visible action before its canonical mutation, immediate rerender, and regression test exist.
- Do not leave temporary sprites, generated stand-ins, provisional sounds, compatibility branches, or feature flags open at completion.
- Codex can author the production vector sprites and inspect them visually in the Browser plugin. Image generation may be used for private concept exploration, but final map assets remain code-native SVG so they integrate with state, animation, damage, and scaling. Claude Design is not required.
- Automated audio checks cannot judge subjective fit. Final SFX acceptance includes a human listening checklist.

---

## File Map

### Core And Gameplay

| File | Action | Responsibility |
|---|---|---|
| `src/core/owner-kind.ts` | Create | Authoritative owner classification and hostility predicates |
| `src/core/pirate-state.ts` | Create | Serializable pirate state, intel, headquarters, contract, and history types |
| `src/core/notification-log.ts` | Create | Generic persisted notification types and mutation helpers |
| `src/core/types.ts` | Modify | Pirate unit types, game state fields, counters, and typed events |
| `src/core/id-counters.ts` | Modify | Pirate faction and notification ID allocation/repair |
| `src/core/game-state.ts` | Modify | New-game pirate and notification initialization |
| `src/core/turn-manager.ts` | Modify | One completed-round pirate coordinator call and economy integration |
| `src/systems/pirate-definitions.ts` | Create | Exact stage, fleet, pressure, spawn, tribute, bounty, and presentation constants |
| `src/systems/pirate-ecology.ts` | Create | Activation, pressure, habitat scoring, spawn, suppression |
| `src/systems/pirate-behavior.ts` | Create | Escort detection, targets, movement, relocation, raids, blockades |
| `src/systems/pirate-actions.ts` | Create | Tribute, contracts, enclave assault, idempotent destruction |
| `src/systems/pirate-system.ts` | Create | Deterministic completed-round orchestration |
| `src/systems/pirate-presentation.ts` | Create | Viewer-scoped dossier, map, action availability, disabled reasons |
| `src/systems/pirate-notifications.ts` | Create | Typed pirate transition to persisted notification projection |
| `src/systems/unit-system.ts` | Modify | Six pirate unit definitions |
| `src/systems/city-system.ts` | Verify only | Pirates remain absent from `TRAINABLE_UNITS` |
| `src/systems/attack-targeting.ts` | Modify | Always-hostile pirate targets without war or city capture |
| `src/systems/movement-safety.ts` | Modify | Pirate danger classification |
| `src/systems/combat-reward-system.ts` | Modify | Exclude pirate victors from civilization rewards; reward pirate defeats correctly |
| `src/systems/economy-system.ts` | Modify | Pirate raid/blockade modifiers in projections and settlement |
| `src/storage/save-manager.ts` | Modify | Central pirate, notification, and ID normalization for every load path |
| `src/ai/basic-ai.ts` | Modify | Escort, blockade, tribute, hunt, and Stage 5 contract decisions |

### UI, Input, Renderer, And Audio

| File | Action | Responsibility |
|---|---|---|
| `src/ui/pirate-waters-panel.ts` | Create | Authoritative desktop/mobile pirate list and dossier |
| `src/ui/pirate-notification-listeners.ts` | Create | Viewer-scoped persistent notification and hot-seat routing |
| `src/ui/notification-log-panel.ts` | Modify | Semantic close/review controls and read state |
| `src/ui/notification-log.ts` | Delete | Replace in-memory UI-owned log with core persisted log |
| `src/ui/advisor-system.ts` | Modify | Warchief/Treasurer pirate guidance with cooldowns |
| `src/ui/game-shell.ts` | Modify | Durable `Pirate Waters` launcher |
| `src/ui/selected-unit-info.ts` | Modify | Pirate owner labels and enclave assault affordance |
| `src/input/pirate-headquarters-assault.ts` | Create | Canonical preview/confirm input flow for enclave assault |
| `src/input/mouse-handler.ts` | Modify | Visible headquarters selection/focus |
| `src/input/touch-handler.ts` | Modify | Touch parity for headquarters selection/focus |
| `src/main.ts` | Modify | Live panel, event, focus, save, and audio wiring only |
| `src/renderer/pirate-headquarters-presentation.ts` | Create | Viewer-scoped landmark entities and map markers |
| `src/renderer/unit-visual-resolver.ts` | Modify | Pirate owner role, labels, fallback glyphs |
| `src/renderer/unit-map-presentation.ts` | Modify | Pirate hostility and palette family |
| `src/renderer/render-loop.ts` | Modify | Pirate unit/headquarters entities and moving-unit v2 positions |
| `src/renderer/sprite-overlay.ts` | Modify | Landmark layer plus independent state/mode/damage/tier/stage attributes |
| `src/renderer/unit-movement-animation.ts` | Modify | Interpolated DOM-overlay coordinates remain visible while moving |
| `src/renderer/sprites/pirates.tsx` | Create | Production neutral pirate Canvas/raster sprites |
| `src/renderer/sprites/sprite-catalog.ts` | Modify | Six unit entries and headquarters landmark catalog |
| `src/renderer/sprites/v2/index.ts` | Modify | Neutral pirate v2 unit and headquarters lookup |
| `src/assets/sprite-animations-v2.css` | Modify | Pirate class motion, damage, blockade, relocation, reduced motion |
| `design/conquestoria-sprites/lib/pirates-v2.jsx` | Create | Canonical high-detail pirate v2 source art |
| `scripts/serialize-sprites.mjs` | Modify | Serialize neutral pirate unit and landmark families |
| `src/audio/pirate-audio-sources.ts` | Create | Typed source/license/output manifest |
| `src/audio/pirate-audio-director.ts` | Create | Viewer-filtered strategic cues and focused ambience lifecycle |
| `src/audio/sfx-catalog.ts` | Modify | Pirate unit and headquarters production SFX |
| `src/audio/sfx-director.ts` | Modify | Visibility filtering, movement sequence rate limit, fire/impact timing |
| `src/audio/audio-system.ts` | Modify | Start/update/dispose pirate audio director |
| `scripts/generate-pirate-sfx.sh` | Create | Reproducible in-project OGG generation/derivation |
| `AUDIO-CREDITS.md` | Modify | Exact source and derivative credits |

### Tests

Create mirrored coverage in:

- `tests/core/owner-kind.test.ts`
- `tests/core/pirate-state.test.ts`
- `tests/core/migrate-id-counters.test.ts`
- `tests/systems/pirate-definitions.test.ts`
- `tests/systems/pirate-ecology.test.ts`
- `tests/systems/pirate-behavior.test.ts`
- `tests/systems/pirate-actions.test.ts`
- `tests/systems/pirate-system.test.ts`
- `tests/systems/pirate-presentation.test.ts`
- `tests/systems/pirate-balance.test.ts`
- `tests/storage/save-manager.test.ts`
- `tests/ai/basic-ai-pirates.test.ts`
- `tests/ui/pirate-waters-panel.test.ts`
- `tests/ui/pirate-notification-listeners.test.ts`
- `tests/ui/notification-log-panel.test.ts`
- `tests/input/pirate-headquarters-assault.test.ts`
- `tests/input/pirate-headquarters-selection.test.ts`
- `tests/renderer/pirate-headquarters-presentation.test.ts`
- `tests/renderer/sprite-overlay.test.ts`
- `tests/renderer/unit-movement-animation.test.ts`
- `tests/renderer/sprites/sprite-catalog.test.ts`
- `tests/renderer/sprites/v2/index.test.ts`
- `tests/audio/pirate-audio-director.test.ts`
- `tests/audio/sfx-catalog.test.ts`
- `tests/audio/sfx-director.test.ts`
- `tests/main.integration.test.ts`

---

## Player Truth Table

| Before | Action | State change | Immediate visible result | Must remain reachable |
|---|---|---|---|---|
| Pirate rumor appears | Open `Pirate Waters` | None | Approximate region only; no exact tile, health, behavior, or hidden fleet | Notification history and faction list |
| Visible pirate ship | Select ship or `Review` notification | None | Correct pirate owner label and earned faction dossier open | Map, all discovered factions, notification log |
| Faction demands tribute | Confirm `Pay tribute` | Gold decreases; 15-round protection starts; pending raid/blockade cancels | Cost, remaining rounds, map blockade marker, and action availability refresh in the open dossier | Faction history and all other factions |
| Tribute action became stale | Click `Pay tribute` | None | Inline reason explains current price/invalidity; panel rerenders from current state | Other dossier actions |
| Valid Stage 5 flotilla | Confirm `Hire flotilla` and choose known rival | Gold decreases; eight-round contract begins | Employer, target, duration, 25% exposure risk, and unavailable tribute state refresh | Contract history and full rival picker |
| No known valid rival | Inspect `Hire flotilla` | None | Action is disabled with exact reason and leaks no hidden civilization/coast | Other dossier actions |
| Blockaded city | Open city or pirate dossier | None | Responsible faction, conjunction, route loss, and 25% city-gold penalty are explicit | City panel and Pirate Waters |
| Enclave defenders cleared | Open assault preview and confirm | Naval action spent; integrity and possible counterfire resolve | Preview closes; integrity, damage art, combat feedback, and action availability update immediately | Dossier and map selection |
| Tracked flotilla plans relocation | Open dossier | None | Direction and countdown appear, never exact hidden destination | Map focus and other factions |
| Headquarters destroyed | Open old notification | None | Historical summary opens instead of a dead action | Pirate history and map at last known location |

## Misleading UI Risks

- `Blockading` appears only when Tier 3, two same-faction ships are within two hexes, one is adjacent, and tribute/contract rules permit it. Tests remove each condition independently.
- `Tracked` appears only from stored earned relocation/target intel, never by reading live hidden faction state.
- `Protected` never changes unit hostility, movement safety, or passage labels.
- `Hire flotilla` is hidden for enclaves and Stages 1-4, and disabled rather than omitted when a Stage 5 flotilla has no known valid rival.
- `Focus headquarters` distinguishes visible, last-seen, and suspected-region focus in both copy and camera precision.
- Fleet composition contains only units observed by the current viewer.
- A coastal city is based on center adjacency to navigable water, not arbitrary `ownedTiles`.
- Economic city targeting never enables city combat or capture.
- A pirate owner never renders as a major civilization or appears in diplomacy.

## Interaction Replay Checklist

- Open Pirate Waters from launcher, map entity, and notification.
- Switch between at least two factions without losing the list.
- Pay tribute, repeat-click the stale button, close, and reopen.
- Hire a flotilla, repeat-click the stale button, close, and reopen.
- Focus visible headquarters, last-seen headquarters, suspected region, and known raid target.
- Assault an enclave twice, proving the second preview uses updated integrity/action state.
- Mark a notification read, change hot-seat player, and prove viewer isolation after reopening.
- Destroy a faction while its dossier is open and prove the panel transitions to history without stale DOM callbacks.

---

## Production Asset Inventory

The executor maintains this table in the plan while working. No row may remain `open` in Task 18.

| ID | Production deliverable | Replacement/verification task | Status |
|---|---|---|---|
| ART-U1..U6 | Six pirate unit Canvas and v2 sprites | Tasks 13-14; catalog and browser artboard tests | open |
| ART-E1..E5 | Five coastal enclave stage foundations | Task 14; landmark catalog and map-scale visual QA | open |
| ART-F2..F5 | Four mobile flotilla stage compositions | Task 14; landmark catalog and map-scale visual QA | open |
| ART-O1..O3 | Hidden/fortified/stronghold overlays | Task 14; tier-state screenshot matrix | open |
| ANIM-1 | Unit idle/walk/attack/hurt/death states | Task 15; state-controller and browser QA | open |
| ANIM-2 | HQ ambience/counterfire/collapse/relocation | Task 15; state-controller and browser QA | open |
| DAMAGE-1 | Damage groups 1/2/3 for every unit/HQ | Tasks 13-15; structural selector tests | open |
| SFX-U1..U6 | Six unit movement/fire/impact/death families | Task 16; catalog, waveform, and listening checklist | open |
| SFX-HQ | Enclave ambience/defense/collapse and flotilla movement | Task 16; focus lifecycle and listening checklist | open |
| SFX-STRAT | Sighting/raid/blockade/tribute/contract/exposure cues | Task 16; viewer routing tests and listening checklist | open |
| COPY-1 | Pirate Waters labels, disabled reasons, advice | Tasks 10-12; DOM assertions and copy review | open |
| BALANCE-1 | Fleet stats and encounter exchange counts | Task 17; deterministic sampling tests | open |
| COMPAT-1 | Legacy save and ID repair | Task 3; migration/round-trip tests | complete |
| GATE-1 | Temporary internal runtime-readiness gate preventing partial feature exposure | Tasks 5 and 8 create/use it; Task 17 removes it and proves live activation | open |

---

## Task 1: Post The Committed Plan To Issue #353

**Files:** None.

- [x] **Step 1: Confirm the plan commit is the branch HEAD before code changes**

```bash
git status --short --branch
git log -1 --oneline
```

Expected: clean worktree, current branch `codex/issue-353-pirates`, and HEAD is the committed plan.

- [x] **Step 2: Comment on GitHub issue #353 with the GitHub connector**

Post a comment that includes:

```markdown
Implementation plan committed on `codex/issue-353-pirates`.

Plan: `docs/superpowers/plans/2026-06-13-pirate-factions.md`
Design: `docs/superpowers/specs/2026-06-13-pirate-factions-design.md`

Scope:
- versioned pirate factions with distinct `pirate-*` owners
- 4-round pressure-based spawning, 3/4/5 caps, coastal enclaves, Stage 2+ mobile flotillas
- era progression with six dedicated non-trainable unit types and mixed old/new fleets
- patrol, raid, blockade, tribute, and Stage 5 mercenary contracts
- legacy-save migration, hot-seat privacy, AI parity, and canonical destruction
- Pirate Waters UI, generic persisted notifications, advisor guidance
- production Canvas + v2 sprites, independent animation/damage states, and production SFX
- deterministic balance, full regressions, browser QA, and zero-open placeholder closure

Execution will follow the committed plan task-by-task with TDD. The first code change will begin only after this comment is visible.
```

- [x] **Step 3: Fetch issue comments and verify the comment is present**

Use the GitHub connector to read issue #353 comments. Record the returned comment ID in the execution notes.

Execution note: verified issue comment `4699301862` at https://github.com/a1flecke/conquestoria/issues/353#issuecomment-4699301862 before implementation code changes.

---

## Task 2: Add Owner-Kind Boundaries

**Files:**

- Create: `src/core/owner-kind.ts`
- Modify: `src/systems/attack-targeting.ts`
- Modify: `src/systems/movement-safety.ts`
- Modify: `src/systems/combat-reward-system.ts`
- Modify: `src/renderer/unit-visual-resolver.ts`
- Modify: `src/renderer/unit-map-presentation.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `src/main.ts`
- Create: `tests/core/owner-kind.test.ts`
- Modify: `tests/systems/attack-targeting.test.ts`
- Modify: `tests/systems/movement-safety.test.ts`
- Modify: `tests/systems/combat-reward-system.test.ts`
- Modify: `tests/renderer/unit-map-presentation.test.ts`

- [x] **Step 1: Write failing owner-boundary tests**

Cover every owner kind and the pirate-specific negative boundaries:

```ts
expect(classifyOwner('player')).toBe('major');
expect(classifyOwner('mc-2')).toBe('minor');
expect(classifyOwner('barbarian')).toBe('barbarian');
expect(classifyOwner('rebels')).toBe('rebel');
expect(classifyOwner('beasts')).toBe('beast');
expect(classifyOwner('pirate-7')).toBe('pirate');
expect(isMajorCivOwner('pirate-7')).toBe(false);
expect(isAlwaysHostilePair('player', 'pirate-7')).toBe(true);
expect(isAlwaysHostilePair('pirate-7', 'player')).toBe(true);
expect(isAlwaysHostilePair('pirate-7', 'pirate-7')).toBe(false);
expect(isAlwaysHostilePair('pirate-7', 'pirate-8')).toBe(false);
expect(canReceiveCivilizationCombatRewards('pirate-7')).toBe(false);
```

Add attack tests proving a major unit can attack a pirate without war, a pirate unit cannot target a city, and pirate owners do not enter diplomacy declaration code.

- [x] **Step 2: Run the red tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/owner-kind.test.ts tests/systems/attack-targeting.test.ts tests/systems/movement-safety.test.ts tests/systems/combat-reward-system.test.ts tests/renderer/unit-map-presentation.test.ts
```

Expected: failures for missing helpers, missing pirate owner role, and unknown unit types.

- [x] **Step 3: Implement the authoritative owner helpers**

```ts
export type OwnerKind = 'major' | 'minor' | 'barbarian' | 'rebel' | 'beast' | 'pirate';

export function classifyOwner(ownerId: string): OwnerKind {
  if (ownerId.startsWith('pirate-')) return 'pirate';
  if (ownerId.startsWith('mc-')) return 'minor';
  if (ownerId === 'barbarian') return 'barbarian';
  if (ownerId === 'rebels') return 'rebel';
  if (ownerId === 'beasts') return 'beast';
  return 'major';
}

export const isMajorCivOwner = (ownerId: string): boolean => classifyOwner(ownerId) === 'major';
export const isPirateOwner = (ownerId: string): boolean => classifyOwner(ownerId) === 'pirate';

export function isAlwaysHostilePair(a: string, b: string): boolean {
  if (a === b) return false;
  const ak = classifyOwner(a);
  const bk = classifyOwner(b);
  if (ak === 'pirate' || bk === 'pirate') return ak !== bk;
  return ak === 'barbarian' || bk === 'barbarian'
    || ak === 'rebel' || bk === 'rebel'
    || ak === 'beast' || bk === 'beast';
}
```

Use these helpers in every touched hardcoded owner check. Do not perform a repository-wide cosmetic refactor; replace the checks that can misclassify pirates and add tests around them. `isAlwaysHostilePair` does not bypass existing beast concealment or beast-attack eligibility; attack targeting applies those gates before generic hostility.

- [x] **Step 4: Run focused checks and commit**

```bash
scripts/check-src-rule-violations.sh src/core/owner-kind.ts src/systems/attack-targeting.ts src/systems/movement-safety.ts src/systems/combat-reward-system.ts src/renderer/unit-visual-resolver.ts src/renderer/unit-map-presentation.ts src/core/turn-manager.ts src/ai/basic-ai.ts src/main.ts
./scripts/run-with-mise.sh yarn test --run tests/core/owner-kind.test.ts tests/systems/attack-targeting.test.ts tests/systems/movement-safety.test.ts tests/systems/combat-reward-system.test.ts tests/renderer/unit-map-presentation.test.ts
./scripts/run-with-mise.sh yarn build
git add src/core/owner-kind.ts src/systems/attack-targeting.ts src/systems/movement-safety.ts src/systems/combat-reward-system.ts src/renderer/unit-visual-resolver.ts src/renderer/unit-map-presentation.ts src/core/turn-manager.ts src/ai/basic-ai.ts src/main.ts tests/core/owner-kind.test.ts tests/systems/attack-targeting.test.ts tests/systems/movement-safety.test.ts tests/systems/combat-reward-system.test.ts tests/renderer/unit-map-presentation.test.ts
git commit -m "feat(pirates): add hostile owner boundaries"
```

---

## Task 3: Add Versioned State, Generic Notifications, IDs, And Save Migration

**Files:**

- Create: `src/core/pirate-state.ts`
- Create: `src/core/notification-log.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/id-counters.ts`
- Modify: `src/core/game-state.ts`
- Modify: `src/storage/save-manager.ts`
- Modify imports in: `src/main.ts`, `src/ui/notification-log-panel.ts`, `src/ui/notification-targets.ts`, `src/ui/legendary-wonder-notifications.ts`, `src/ui/minor-civ-notifications.ts`, `src/ui/notification-routing.ts`
- Delete: `src/ui/notification-log.ts`
- Create: `tests/core/pirate-state.test.ts`
- Modify: `tests/core/migrate-id-counters.test.ts`
- Modify: `tests/storage/save-manager.test.ts`
- Move/modify: `tests/ui/notification-log.test.ts`
- Modify: `tests/main.integration.test.ts`, `tests/systems/playtest-fixes.test.ts`

- [x] **Step 1: Write red tests for new games, legacy saves, malformed saves, and generic notifications**

Required assertions:

```ts
expect(createNewGame(...).pirates).toEqual(createEmptyPirateState());
expect(createNewGame(...).notificationLog).toEqual({});
expect(normalizeLoadedStateForTest(legacy).pirates.version).toBe(PIRATE_STATE_VERSION);
expect(normalizeLoadedStateForTest(legacy).notificationLog).toEqual({});
expect(repaired.idCounters.nextPirateFactionId).toBe(8);
expect(repaired.idCounters.nextNotificationId).toBe(13);
expect(getNotificationsForPlayer(roundTripped.notificationLog, 'player')).toHaveLength(1);
```

Add repair tests for malformed intel, missing flagship, invalid contract target, expired protection, and duplicate warning markers. Missing flagships must produce one historical destruction record across repeated normalization.

- [x] **Step 2: Run red tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/pirate-state.test.ts tests/core/migrate-id-counters.test.ts tests/storage/save-manager.test.ts tests/ui/notification-log.test.ts
```

- [x] **Step 3: Define serializable state factories and invariants**

`src/core/pirate-state.ts` exports the complete plain-object types plus:

```ts
export const PIRATE_STATE_VERSION = 1;

export function createEmptyPirateState(): PirateState {
  return {
    version: PIRATE_STATE_VERSION,
    factions: {},
    history: [],
    pressure: { value: 0, suppression: [] },
    intelByCiv: {},
    nextSpawnCheckTurn: 0,
    activatedTurn: null,
    activationWarningDeliveredByCiv: {},
  };
}
```

Include explicit faction transition guards, demand reminder rounds, tribute records, optional contract, planned relocation, and historical snapshots. Store only earned intel; do not store a richer faction reference inside viewer intel.

- [x] **Step 4: Move notifications into core state**

The new core entry shape is:

```ts
export interface NotificationEntry {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  turn: number;
  read: boolean;
  target?: NotificationMapTarget;
  linkedCityId?: string;
  review?:
    | { kind: 'pirate-faction'; factionId: string }
    | { kind: 'pirate-history'; historyId: string };
}
```

`appendNotification(state, civId, draft)` allocates `notification-{n}`, caps each viewer at 50, and returns/mutates the canonical `GameState.notificationLog`. Update all imports and delete the UI-owned module in the same commit; do not leave a compatibility re-export.

- [x] **Step 5: Centralize normalization in `save-manager.ts`**

Add `normalizePirateState`, `normalizeNotificationLog`, and `normalizeIdCounters` to `normalizeLoadedState`. Remove the corresponding ID migration responsibility from `main.ts` so load, autosave, import/export, and test normalization use one path. Do not move unrelated beast migration in this task.

- [x] **Step 6: Run focused checks and commit**

```bash
scripts/check-src-rule-violations.sh src/core/pirate-state.ts src/core/notification-log.ts src/core/types.ts src/core/id-counters.ts src/core/game-state.ts src/storage/save-manager.ts src/main.ts src/ui/notification-log-panel.ts src/ui/notification-targets.ts src/ui/legendary-wonder-notifications.ts src/ui/minor-civ-notifications.ts src/ui/notification-routing.ts
./scripts/run-with-mise.sh yarn test --run tests/core/pirate-state.test.ts tests/core/migrate-id-counters.test.ts tests/storage/save-manager.test.ts tests/ui/notification-log.test.ts tests/main.integration.test.ts
./scripts/run-with-mise.sh yarn build
git add src/core/pirate-state.ts src/core/notification-log.ts src/core/types.ts src/core/id-counters.ts src/core/game-state.ts src/storage/save-manager.ts src/main.ts src/ui/notification-log-panel.ts src/ui/notification-targets.ts src/ui/legendary-wonder-notifications.ts src/ui/minor-civ-notifications.ts src/ui/notification-routing.ts tests/core/pirate-state.test.ts tests/core/migrate-id-counters.test.ts tests/storage/save-manager.test.ts tests/ui/notification-log.test.ts tests/main.integration.test.ts tests/systems/playtest-fixes.test.ts
git rm src/ui/notification-log.ts
git commit -m "feat(pirates): persist pirate and notification state"
```

---

## Task 4: Lock Definitions, Maritime Stages, Fleet Rosters, And Balance Inputs

**Files:**

- Create: `src/systems/pirate-definitions.ts`
- Create: `src/renderer/sprites/pirates.tsx`
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/renderer/unit-visual-resolver.ts`
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Modify: `src/audio/sfx-catalog.ts`
- Create: `tests/systems/pirate-definitions.test.ts`
- Create: `tests/systems/pirate-balance.test.ts`
- Modify: `tests/systems/unit-system.test.ts`
- Modify: `tests/systems/tech-unlocks-consistency.test.ts`
- Modify: `tests/renderer/sprites/sprite-catalog.test.ts`
- Modify: `tests/renderer/unit-visual-resolver.test.ts`

- [x] **Step 1: Write failing exhaustiveness and deterministic roster tests**

Tests cover all five stages, six hulls, behavior thresholds `2/5`, caps `3/4/5`, two-flotilla limit, pressure constants, tribute costs, plunder caps, bounties, and deterministic mixed fleets. Prove Stage 5 draws never include galleys/corsairs but may include frigates and ironclads.

- [x] **Step 2: Add the exact definition tables**

Use one typed source of truth:

```ts
export const PIRATE_PRESSURE = {
  activationSeed: 4,
  checkInterval: 4,
  threshold: 6,
  cap: 18,
  baseGain: 2,
  tradeRouteGainCap: 2,
  wealthyCityGainCap: 2,
  wealthyGrossGold: 8,
} as const;

// Temporary branch-development gate. Task 17 deletes this constant and its
// turn/UI condition once all gameplay, UI, renderer, and audio tasks pass.
export const PIRATE_IMPLEMENTATION_READY = false;

export const PIRATE_NOTORIETY = {
  raiding: 2,
  blockading: 5,
  survivalInterval: 8,
} as const;

export const PIRATE_TRIBUTE_BASE = { patrolling: 15, raiding: 30, blockading: 50 } as const;
export const PIRATE_STAGE_SURCHARGE = [0, 0, 5, 10, 15, 20] as const;
export const PIRATE_PLUNDER_CAP = [0, 5, 8, 12, 16, 20] as const;
```

Add a typed stage table with trigger tech, current hull, allowed old hulls, stats, map icon, sprite ID, and SFX family. The unit definitions added in this task must read or match these values; tests reject drift.

Add all six pirate values to `UnitType` and `UNIT_DEFINITIONS` in this same step. Every definition has `domain: 'naval'`, `productionCost: 0`, and `attackProfile.targets: ['unit']`. Keep every pirate type absent from `TRAINABLE_UNITS` and technology unlock arrays.

Update the trainability coverage assertion so only `beast_*` and `pirate_*` zero-cost hostile units may be absent from `TRAINABLE_UNITS`. Add a negative test proving an ordinary new unit type would still fail the coverage contract.

- [x] **Step 3: Add final low-zoom pirate art and exhaustive mappings in the same change**

Author the six production neutral Canvas/raster components in `src/renderer/sprites/pirates.tsx` and add all six `UNIT_SPRITE_CATALOG` entries. These are the final low-zoom assets, not placeholders for the v2 work. Add all six unit types to `UNIT_MOTION_STYLES`, `LOCOMOTION_CLASS`, unit descriptions, and fallback-icon records so TypeScript exhaustiveness remains intact. `UNIT_SFX` may remain absent because it is intentionally partial; Task 16 closes the explicit SFX inventory.

- [x] **Step 4: Add deterministic combat sampling**

For each stage, sample fixed seeds for equivalent contemporary naval encounters and assert expected exchange-count bands rather than a single lucky result. Include older pirate hulls in Stage 4/5 mixed fleets and verify the guaranteed current hull remains the strongest strategic anchor without making the whole fleet homogeneous.

- [x] **Step 5: Run and commit**

```bash
scripts/check-src-rule-violations.sh src/systems/pirate-definitions.ts src/renderer/sprites/pirates.tsx src/core/types.ts src/systems/unit-system.ts src/renderer/unit-visual-resolver.ts src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/pirate-definitions.test.ts tests/systems/pirate-balance.test.ts tests/systems/unit-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/unit-visual-resolver.test.ts tests/audio/sfx-catalog.test.ts
./scripts/run-with-mise.sh yarn build
git add src/systems/pirate-definitions.ts src/renderer/sprites/pirates.tsx src/core/types.ts src/systems/unit-system.ts src/renderer/unit-visual-resolver.ts src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts tests/systems/pirate-definitions.test.ts tests/systems/pirate-balance.test.ts tests/systems/unit-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/unit-visual-resolver.test.ts
git commit -m "feat(pirates): define progression fleets and balance"
```

---

## Task 5: Implement Deterministic Ecology, Habitat Selection, And Spawning

**Files:**

- Create: `src/systems/pirate-ecology.ts`
- Modify: `src/core/types.ts` for pirate lifecycle events if not already added
- Modify: `src/core/pirate-state.ts` and `src/storage/save-manager.ts` for faction spawn-round persistence
- Create: `tests/systems/pirate-ecology.test.ts`
- Modify: `tests/core/pirate-state.test.ts`

- [x] **Step 1: Write red activation, pressure, and site tests**

Cover:

- no activation before any major completes `galleys`;
- activation seeds pressure `4` and warning state separately;
- exact scheduled gain arithmetic and one spawn per four-round check;
- pressure remains capped and unspent when no site exists;
- `3/4/5` active caps and two-flotilla cap;
- Stage 1 enclave-only behavior;
- Stage 2+ `3:2` habitat weights with stable seeded results;
- land shoreline enclave anchors and ocean-only flotilla anchors;
- each covert claimed-coast conjunction separately missing;
- eight-round, eight-hex regional suppression;
- wrap-aware distance at east/west map edges.

- [x] **Step 2: Run the red test**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pirate-ecology.test.ts
```

- [x] **Step 3: Implement pure candidate and pressure helpers**

Required public surface:

```ts
export function getPirateMaritimeStage(state: GameState): PirateMaritimeStage;
export function calculatePiratePressureGain(state: GameState, stage: PirateMaritimeStage): number;
export function getCoastalEnclaveCandidates(state: GameState): PirateHabitatCandidate[];
export function getFlotillaCandidates(state: GameState): PirateHabitatCandidate[];
export function choosePirateSpawn(state: GameState, seed: string): PirateSpawnPlan | null;
export function applyRegionalSuppression(state: GameState, center: HexCoord, destroyedTurn: number): GameState;
```

Candidate sorting is stable by score, then `q`, then `r`; seeded selection occurs only after sorting. Use existing wrap-aware hex helpers. Enclave anchor is legal land adjacent to navigable water and no city within four. Claimed coast additionally requires not visible to owner and no major combat unit within three. Flotilla anchor is unoccupied ocean, five from cities, eight from headquarters, with no major combat unit within four.

Keep ecology callable directly in tests, but do not activate it from the live turn loop while `PIRATE_IMPLEMENTATION_READY` is false. This is the only planned temporary feature gate and is tracked as `GATE-1`.

- [x] **Step 4: Create factions and units through canonical allocators**

Allocate `pirate-{n}` from `IdCounters`, generate a deterministic name, create the guaranteed current-stage hull plus roster draws, assign a coastal enclave or flagship headquarters, insert units only into `state.units`, and emit `unit:created` plus one typed pirate faction-spawned event per faction. Do not add pirate units to any civilization roster.

- [x] **Step 5: Run checks and commit**

```bash
scripts/check-src-rule-violations.sh src/systems/pirate-ecology.ts src/core/types.ts src/core/pirate-state.ts src/storage/save-manager.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/pirate-ecology.test.ts tests/core/pirate-state.test.ts tests/systems/id-counters.test.ts tests/systems/unit-system.test.ts
git add src/systems/pirate-ecology.ts src/core/types.ts src/core/pirate-state.ts src/storage/save-manager.ts tests/systems/pirate-ecology.test.ts tests/core/pirate-state.test.ts
git commit -m "feat(pirates): add deterministic ecology and spawning"
```

---

## Task 6: Implement Behavior, Escort Logic, Relocation, Raids, And Blockades

**Files:**

- Create: `src/systems/pirate-behavior.ts`
- Modify: `src/systems/economy-system.ts`
- Modify: `src/core/pirate-state.ts` and `src/storage/save-manager.ts` for relocation attack guards and save-safe direction data
- Create: `tests/systems/pirate-behavior.test.ts`
- Modify: `tests/systems/economy-system.test.ts`
- Modify: `tests/core/pirate-state.test.ts`

- [x] **Step 1: Write red behavior tests**

Include positive and negative cases for:

- escort requires same/adjacent friendly combat-capable naval unit;
- nearby transport, civilian naval unit, or land combat unit is not an escort;
- target priority is unescorted transport, eligible coastal city, hostile naval, then escorted transport only at Tier 3;
- pirates never select a city as a combat target;
- protected civilizations are skipped for pathing, attacks, raids, blockades, and reinforcements;
- one economic raid per faction per completed round;
- plunder caps `5/8/12/16/20` and available-treasury cap;
- blockade needs every conjunction and ends immediately when one fails;
- blockades affect route income plus city gold only, never food/production;
- relocation plans one round early, follows `2-4` contiguous ocean hexes, preserves formation, consumes moved ships' phase, and cancels on attack/adjacent hostile/placement failure;
- hidden viewers receive no relocation direction.

- [x] **Step 2: Run the red tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pirate-behavior.test.ts tests/systems/economy-system.test.ts
```

- [x] **Step 3: Implement pure decision and derivation helpers**

Required surface:

```ts
export function isTransportEscorted(state: GameState, transport: Unit): boolean;
export function choosePirateIntent(state: GameState, factionId: string): PirateIntent | null;
export function planFlotillaRelocation(state: GameState, factionId: string): PirateRelocationPlan | null;
export function applyPlannedRelocation(state: GameState, factionId: string): PirateMutationResult;
export function derivePirateRaids(state: GameState, facts: PirateRoundFacts): PirateRaid[];
export function derivePirateBlockades(state: GameState): PirateBlockade[];
```

Use canonical movement and combat helpers for actual orders. Return explicit facts for every movement, attack, transport kill, raid, and blockade transition; do not rediscover one-time events by scanning final state.

- [x] **Step 4: Integrate economy modifiers without a parallel economy**

Extend economy projection with typed pirate modifiers:

```ts
export interface PirateEconomyModifiers {
  plunderByCiv: Record<string, number>;
  blockadedCityIds: string[];
}
```

Route income involving any blockaded city is zero. A blockaded city's final gold yield is multiplied by `0.75` once, regardless of pirate count. Settlement and projection must use the same helper so HUD, dossier, and actual treasury agree.

- [x] **Step 5: Run checks and commit**

```bash
scripts/check-src-rule-violations.sh src/systems/pirate-behavior.ts src/systems/economy-system.ts src/core/pirate-state.ts src/storage/save-manager.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/pirate-behavior.test.ts tests/systems/economy-system.test.ts tests/systems/attack-targeting.test.ts tests/core/pirate-state.test.ts
git add src/systems/pirate-behavior.ts src/systems/economy-system.ts src/core/pirate-state.ts src/storage/save-manager.ts tests/systems/pirate-behavior.test.ts tests/systems/economy-system.test.ts tests/core/pirate-state.test.ts
git commit -m "feat(pirates): add raids blockades and relocation"
```

---

## Task 7: Implement Tribute, Contracts, Headquarters Assault, And Canonical Destruction

**Files:**

- Create: `src/systems/pirate-actions.ts`
- Create: `src/input/pirate-headquarters-assault.ts`
- Create: `tests/systems/pirate-actions.test.ts`
- Create: `tests/input/pirate-headquarters-assault.test.ts`
- Modify: `tests/systems/combat-system.test.ts`
- Modify: `tests/core/turn-manager.test.ts`

- [x] **Step 1: Write red action and actor-parity tests**

Status: action, combat-wrapper, enclave, idempotence, bounty, AI flagship, and AI enclave parity regressions are complete. The full turn-loop scenario remains in Task 17.

Cover:

- tribute quote by behavior plus stage surcharge;
- no debt, 15 completed rounds, immediate pending raid/blockade cancellation;
- attacking the faction ends protection;
- one active demand and eight-round reminder cooldown;
- Stage 5 deep-sea flotilla only contracts;
- target must be a living known rival with a known coastal city or naval unit;
- contract cost is twice tribute, duration is eight rounds, and tribute/contract are mutually exclusive;
- one deterministic 25% exposure roll per successful contract raid and `-30` target relationship event against employer;
- exposed contract records history for target and employer but creates no war;
- enclave assault requires exposed enclave, adjacent major combat naval unit, and available action;
- preview matches applied damage and Tier 2/3 counterfire;
- coastal destruction, flagship combat destruction, AI destruction, and turn-loop destruction all call one idempotent helper;
- repeated destruction calls do not duplicate bounty, suppression, history, notification, or events;
- bounty is `10/25/45 + stage*5` for a major destroyer and zero for autonomous non-major destroyers.

- [x] **Step 2: Run red tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pirate-actions.test.ts tests/input/pirate-headquarters-assault.test.ts tests/systems/combat-system.test.ts tests/core/turn-manager.test.ts
```

- [x] **Step 3: Implement quote-first action APIs**

Every UI/AI action calls the same quote and mutation functions:

```ts
export function getPirateTributeQuote(state: GameState, factionId: string, civId: string): PirateActionQuote;
export function payPirateTribute(state: GameState, factionId: string, civId: string): PirateActionResult;
export function getPirateContractQuote(state: GameState, factionId: string, employerId: string, targetId: string): PirateActionQuote;
export function hirePirateFlotilla(state: GameState, factionId: string, employerId: string, targetId: string): PirateActionResult;
export function getEnclaveAssaultPreview(state: GameState, factionId: string, unitId: string): PirateAssaultPreview;
export function assaultPirateEnclave(state: GameState, factionId: string, unitId: string): PirateActionResult;
export function destroyPirateFaction(state: GameState, input: DestroyPirateFactionInput): PirateDestructionResult;
```

Quotes include `available`, `reason`, `cost`, and duration where relevant. Mutations revalidate from current state and return unchanged state plus exact reason when stale.

- [x] **Step 4: Preserve diplomacy and combat boundaries**

Pirate attacks and assaults never emit `diplomacy:war-declared`. Contract exposure uses the canonical diplomacy event/history helper, scoped to the target's opinion of the employer. Pirate victors do not receive ordinary civilization combat rewards.

- [x] **Step 5: Run checks and commit**

```bash
scripts/check-src-rule-violations.sh src/systems/pirate-actions.ts src/input/pirate-headquarters-assault.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/pirate-actions.test.ts tests/input/pirate-headquarters-assault.test.ts tests/systems/combat-system.test.ts tests/core/turn-manager.test.ts
git add src/systems/pirate-actions.ts src/input/pirate-headquarters-assault.ts tests/systems/pirate-actions.test.ts tests/input/pirate-headquarters-assault.test.ts tests/systems/combat-system.test.ts tests/core/turn-manager.test.ts
git commit -m "feat(pirates): add tribute contracts and headquarters combat"
```

---

## Task 8: Add The Completed-Round Coordinator And Live Turn Wiring

**Files:**

- Create: `src/systems/pirate-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/core/types.ts`
- Create: `tests/systems/pirate-system.test.ts`
- Modify: `tests/core/turn-manager.test.ts`
- Modify: `tests/core/turn-manager-beasts.test.ts`

- [x] **Step 1: Write red ordering and idempotence tests**

Status: exact trace, final-position raid/blockade, relocation action consumption, expiry normalization, replay coverage, and the legacy-save one-time viewer warning are complete.

Build a fixture where a pirate starts two hexes from a coastal city, moves adjacent, raids, and forms a blockade. Assert that the same completed round uses the final position. Add a relocation fixture proving relocated ships do not also attack. Add reload/replay tests proving transition events fire once.

Add a legacy-save fixture already past `Galleys`: the next completed round emits one viewer-scoped piracy warning and starts pressure accumulation, while repeated load/process cycles do not duplicate the warning or consume a spawn check early. Warning delivery and spawn eligibility must use separate markers.

Assert this exact trace:

```ts
expect(trace).toEqual([
  'normalize',
  'relocate',
  'reset-move-attack',
  'record-facts',
  'derive-raids-blockades',
  'apply-economy-modifiers',
  'advance-tier-reinforce',
  'pressure-spawn',
  'refresh-intel-events',
]);
```

- [x] **Step 2: Implement the coordinator result**

```ts
export interface ProcessPiratesResult {
  state: GameState;
  economyModifiers: PirateEconomyModifiers;
  events: PirateTransitionEvent[];
  facts: PirateRoundFacts;
}

export function processPiratesForCompletedRound(
  state: GameState,
  bus: EventBus,
): ProcessPiratesResult;
```

`pirate-system.ts` calls the pure helpers in the approved order. `turn-manager.ts` makes one coordinator call after trade-route advancement and before final economy settlement. It may apply returned economy modifiers and emit typed events, but it must not duplicate pirate decisions.

Until Task 17, the live coordinator call and Pirate Waters launcher are guarded by `PIRATE_IMPLEMENTATION_READY`. Tests invoke systems and panels directly. No partially implemented pirate entity or action appears in ordinary gameplay.

- [x] **Step 3: Ensure existing autonomous systems still work**

Regression-test barbarian and beast reset/movement/attack behavior. Use `owner-kind.ts` for intruder filters so pirates are classified intentionally rather than falling through accidentally.

- [x] **Step 4: Run checks and commit**

```bash
scripts/check-src-rule-violations.sh src/systems/pirate-system.ts src/core/turn-manager.ts src/core/types.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/pirate-system.test.ts tests/core/turn-manager.test.ts tests/core/turn-manager-beasts.test.ts tests/systems/economy-system.test.ts
git add src/systems/pirate-system.ts src/core/turn-manager.ts src/core/types.ts tests/systems/pirate-system.test.ts tests/core/turn-manager.test.ts tests/core/turn-manager-beasts.test.ts
git commit -m "feat(pirates): wire completed-round processing"
```

---

## Task 9: Add AI Parity Without Hidden Information

**Files:**

- Modify: `src/ai/basic-ai.ts`
- Create: `tests/ai/basic-ai-pirates.test.ts`

- [x] **Step 1: Write red AI decision tests**

Test that AI:

- escorts a valuable transport with an available combat naval unit;
- attacks a known blockade ship when local strength is favorable;
- does not path to a hidden headquarters;
- pays affordable tribute only under severe projected loss;
- refuses tribute that would create debt;
- hunts a known exposed enclave;
- hires only an eligible Stage 5 flotilla, against a known rival, when cost/exposure is strategically useful;
- uses canonical quote/action helpers and receives the same stale-state reasons as the player;
- can destroy a flagship/enclave through the canonical destruction path.

- [x] **Step 2: Run red tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ai/basic-ai-pirates.test.ts
```

- [x] **Step 3: Implement conservative pirate priorities**

Add a small pirate decision phase that consumes `PiratePresentation`/earned intel and action quotes. Do not grant AI direct access to hidden faction coordinates. Reuse ordinary naval movement/combat execution. Keep pirate response below immediate city defense and winning military actions, but above optional exploration when a blockade or exposed headquarters is materially harming the AI.

- [x] **Step 4: Run checks and commit**

```bash
scripts/check-src-rule-violations.sh src/ai/basic-ai.ts
./scripts/run-with-mise.sh yarn test --run tests/ai/basic-ai-pirates.test.ts tests/ai/basic-ai.test.ts tests/systems/pirate-actions.test.ts
git add src/ai/basic-ai.ts tests/ai/basic-ai-pirates.test.ts
git commit -m "feat(pirates): add AI response and contracts"
```

---

## Task 10: Implement Viewer-Scoped Intel, Notifications, And Advisor Guidance

**Files:**

- Create: `src/systems/pirate-presentation.ts`
- Create: `src/systems/pirate-notifications.ts`
- Create: `src/ui/pirate-notification-listeners.ts`
- Modify: `src/ui/notification-log-panel.ts`
- Modify: `src/ui/advisor-system.ts`
- Create: `tests/systems/pirate-presentation.test.ts`
- Create: `tests/ui/pirate-notification-listeners.test.ts`
- Modify: `tests/ui/notification-log-panel.test.ts`
- Modify: `tests/ui/advisor-system.test.ts`

- [x] **Step 1: Write red privacy and semantic-notification tests**

Prove:

- rumored intel exposes region only;
- sighted intel stores only observed entity/last-seen position/round;
- observed HQ intel exposes type, behavior, health, and currently visible ships only;
- tracked direction/target exists only when earned and expires with the plan;
- another hot-seat viewer cannot read fleet, health, exact location, target, or audio cue;
- grouped routine events create one entry per faction/round;
- demand, blockade, destruction, and exposure remain individually visible;
- `Review` resolves active faction or immutable history after destruction;
- notification close and review controls are semantic buttons with accessible labels;
- advisor messages obey viewer cooldowns and never include hidden coordinates.

- [x] **Step 2: Run red tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pirate-presentation.test.ts tests/ui/pirate-notification-listeners.test.ts tests/ui/notification-log-panel.test.ts tests/ui/advisor-system.test.ts
```

- [x] **Step 3: Implement projection, not live-object reuse**

`getPirateWatersPresentation(state, viewerId)` returns only copied, earned data. It must never pass `PirateFactionState` objects to UI code. Add focused selectors for map entity visibility, action quotes, city blockade explanations, and historical entries.

- [x] **Step 4: Persist notification read state**

The panel receives callbacks such as:

```ts
interface NotificationLogPanelOptions {
  onClose(): void;
  onFocusMap(target: NotificationMapTarget): void;
  onOpenCity(cityId: string): void;
  onReviewPirate(review: PirateNotificationReview): void;
  onMarkRead(notificationId: string): void;
}
```

Marking read mutates `gameState.notificationLog` and immediately rerenders. No callback is serialized.

- [x] **Step 5: Run checks and commit**

```bash
scripts/check-src-rule-violations.sh src/systems/pirate-presentation.ts src/systems/pirate-notifications.ts src/ui/pirate-notification-listeners.ts src/ui/notification-log-panel.ts src/ui/advisor-system.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/pirate-presentation.test.ts tests/ui/pirate-notification-listeners.test.ts tests/ui/notification-log-panel.test.ts tests/ui/advisor-system.test.ts tests/ui/notification-routing.test.ts
git add src/systems/pirate-presentation.ts src/systems/pirate-notifications.ts src/ui/pirate-notification-listeners.ts src/ui/notification-log-panel.ts src/ui/advisor-system.ts tests/systems/pirate-presentation.test.ts tests/ui/pirate-notification-listeners.test.ts tests/ui/notification-log-panel.test.ts tests/ui/advisor-system.test.ts
git commit -m "feat(pirates): add private intel and notifications"
```

---

## Task 11: Build Pirate Waters And Wire Every Live Entry Point

**Files:**

- Create: `src/ui/pirate-waters-panel.ts`
- Modify: `src/ui/game-shell.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `src/main.ts`
- Create: `tests/ui/pirate-waters-panel.test.ts`
- Modify: `tests/ui/selected-unit-info.test.ts`
- Modify: `tests/main.integration.test.ts`

- [x] **Step 1: Write rendered interaction tests before panel code**

Tests must perform real clicks and inspect current DOM after:

- launcher open and close;
- selecting each discovered faction while preserving the list;
- `Focus headquarters` for visible, last-seen, and rumored states;
- paying tribute then repeat-clicking a stale button;
- hiring a flotilla, selecting from the full valid-rival list, then repeat-clicking;
- disabled actions with exact reasons;
- opening from a notification and map selection;
- faction destruction while dossier is open;
- mobile-width layout using the same content and actions;
- all actionable factions remain reachable even if a recommended faction is highlighted.

- [x] **Step 2: Run red UI tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/pirate-waters-panel.test.ts tests/ui/selected-unit-info.test.ts tests/main.integration.test.ts
```

- [x] **Step 3: Build a projection-driven panel**

```ts
export interface PirateWatersCallbacks {
  onClose(): void;
  onSelectFaction(factionId: string): void;
  onFocus(target: PirateFocusTarget): void;
  onPayTribute(factionId: string): PirateActionResult;
  onHireFlotilla(factionId: string, targetId: string): PirateActionResult;
  onOpenAssault(factionId: string): void;
}

export function createPirateWatersPanel(
  container: HTMLElement,
  presentation: PirateWatersPresentation,
  callbacks: PirateWatersCallbacks,
): HTMLElement;
```

Use `createGameButton`, `textContent`, and `createTextNode`. Desktop is a side panel; narrow/mobile is a bottom sheet. After every action, remove and recreate from a fresh projection so visible status, cost, reason, duration, and list ordering cannot go stale.

- [x] **Step 4: Wire live callers in the same change**

`main.ts` owns the current panel selection ID and opens the same helper from launcher, unit/HQ selection, and notification review. Do not leave an inline alternate path. `Pirate Waters` becomes visible after the viewer's first rumor/sighting and remains durable thereafter.

- [x] **Step 5: Run checks and commit**

```bash
scripts/check-src-rule-violations.sh src/ui/pirate-waters-panel.ts src/ui/game-shell.ts src/ui/selected-unit-info.ts src/main.ts
./scripts/run-with-mise.sh yarn test --run tests/ui/pirate-waters-panel.test.ts tests/ui/selected-unit-info.test.ts tests/main.integration.test.ts tests/ui/notification-log-panel.test.ts
./scripts/run-with-mise.sh yarn build
git add src/ui/pirate-waters-panel.ts src/ui/game-shell.ts src/ui/selected-unit-info.ts src/main.ts tests/ui/pirate-waters-panel.test.ts tests/ui/selected-unit-info.test.ts tests/main.integration.test.ts
git commit -m "feat(pirates): add Pirate Waters interface"
```

---

## Task 12: Add Headquarters Map Presentation, Selection, And Assault UX

**Files:**

- Create: `src/renderer/pirate-headquarters-presentation.ts`
- Create: `src/input/pirate-headquarters-selection.ts`
- Create: `src/ui/pirate-headquarters-assault-panel.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/input/mouse-handler.ts`
- Modify: `src/input/touch-handler.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `src/main.ts`
- Create: `tests/renderer/pirate-headquarters-presentation.test.ts`
- Create: `tests/input/pirate-headquarters-selection.test.ts`
- Modify: `tests/input/pirate-headquarters-assault.test.ts`

- [x] **Step 1: Write red viewer-scope and interaction tests**

Assert:

- hidden headquarters creates no landmark entity;
- rumored headquarters creates an approximate region marker, not an exact entity;
- visible/last-seen headquarters uses correct location precision and label;
- clicking/tapping a visible HQ opens its faction dossier;
- clicking a suspected region focuses only the region;
- an exposed enclave shows assault guidance only for an adjacent available major naval combat unit;
- preview displays integrity damage, counterfire, action consumption, and destruction bounty;
- applying assault rerenders map, unit info, and dossier immediately.

- [x] **Step 2: Run red tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/pirate-headquarters-presentation.test.ts tests/input/pirate-headquarters-selection.test.ts tests/input/pirate-headquarters-assault.test.ts
```

- [x] **Step 3: Implement viewer-scoped landmark entities**

```ts
export interface PirateHeadquartersMapEntity {
  id: string;
  factionId: string;
  subtype: string;
  coord: HexCoord;
  stage: PirateMaritimeStage;
  tier: PirateBehaviorTierNumber;
  mode: PirateVisualMode;
  damage: 0 | 1 | 2 | 3;
  selected: boolean;
}
```

Only exact earned coordinates become entities. Approximate rumor regions remain Canvas/UI markers and never become clickable exact headquarters.

- [x] **Step 4: Reuse the canonical assault preview flow**

The selected-unit surface opens `pirate-headquarters-assault.ts`; it does not calculate damage or eligibility itself. Repeat-click after a first assault must use current integrity and unit action state.

- [x] **Step 5: Run checks and commit**

```bash
scripts/check-src-rule-violations.sh src/renderer/pirate-headquarters-presentation.ts src/renderer/render-loop.ts src/input/mouse-handler.ts src/input/touch-handler.ts src/ui/selected-unit-info.ts src/main.ts
./scripts/run-with-mise.sh yarn test --run tests/renderer/pirate-headquarters-presentation.test.ts tests/input/pirate-headquarters-selection.test.ts tests/input/pirate-headquarters-assault.test.ts tests/renderer/render-loop-wrap.test.ts
git add src/renderer/pirate-headquarters-presentation.ts src/renderer/render-loop.ts src/input/mouse-handler.ts src/input/touch-handler.ts src/ui/selected-unit-info.ts src/main.ts tests/renderer/pirate-headquarters-presentation.test.ts tests/input/pirate-headquarters-selection.test.ts tests/input/pirate-headquarters-assault.test.ts
git commit -m "feat(pirates): add headquarters map interactions"
```

---

## Task 13: Extend The Production Sprite Architecture For Pirates And Landmarks

**Files:**

- Modify: `src/renderer/sprites/pirates.tsx`
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Modify: `src/renderer/sprites/sprite-loader.ts`
- Modify: `src/renderer/sprites/sprite-system.tsx`
- Modify: `src/renderer/sprite-overlay.ts`
- Modify: `src/renderer/hex-renderer.ts`
- Modify: `scripts/serialize-sprites.mjs`
- Modify: `tests/renderer/sprites/sprite-catalog.test.ts`
- Modify: `tests/renderer/sprites/sprite-loader.test.ts`
- Modify: `tests/renderer/sprite-overlay.test.ts`
- Modify: `tests/renderer/hex-renderer.test.ts`

- [ ] **Step 1: Write red catalog and landmark-layer tests**

Assert:

- all six pirate unit types have Canvas/raster catalog entries;
- `PIRATE_HEADQUARTERS_SPRITE_CATALOG` covers enclave Stages 1-5 and flotilla Stages 2-5;
- `SpriteEntity.kind` accepts `landmark` and creates a dedicated landmark layer;
- low zoom renders production pirate unit/HQ images through Canvas rather than emoji/generic village art;
- missing assets still return `null` defensively without breaking the frame;
- existing unit/building/improvement layers and wrap ghosts remain unchanged.

- [ ] **Step 2: Run red tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/sprite-loader.test.ts tests/renderer/sprite-overlay.test.ts tests/renderer/hex-renderer.test.ts
```

- [ ] **Step 3: Add neutral production catalog contracts**

```ts
export type PirateHeadquartersSpriteId =
  | 'pirate_enclave_stage_1' | 'pirate_enclave_stage_2' | 'pirate_enclave_stage_3'
  | 'pirate_enclave_stage_4' | 'pirate_enclave_stage_5'
  | 'pirate_flotilla_stage_2' | 'pirate_flotilla_stage_3'
  | 'pirate_flotilla_stage_4' | 'pirate_flotilla_stage_5';

export const PIRATE_HEADQUARTERS_SPRITE_CATALOG: Record<
  PirateHeadquartersSpriteId,
  LandmarkSpriteComponent
> = { /* all nine explicit entries */ };
```

`src/renderer/sprites/pirates.tsx` contains production neutral low-zoom components for all six units and nine headquarters. They use the shared material/ink language but no civilization palette. Do not use emoji as the normal low-zoom source.

- [ ] **Step 4: Extend v2 serialization without making pirates a civilization faction**

Update `scripts/serialize-sprites.mjs` to load `pirates-v2.jsx` and add separate neutral lists:

```js
const PIRATE_UNIT_SPRITES = [
  ['pirate_galley', 'PirateGalleyV2Sprite'],
  ['pirate_corsair', 'PirateCorsairV2Sprite'],
  ['pirate_frigate', 'PirateFrigateV2Sprite'],
  ['pirate_ironclad', 'PirateIroncladV2Sprite'],
  ['pirate_fast_attack_craft', 'PirateFastAttackCraftV2Sprite'],
  ['pirate_mothership', 'PirateMothershipV2Sprite'],
];

const PIRATE_LANDMARK_SPRITES = [
  ['pirate_enclave_stage_1', 'PirateEnclaveStage1V2Sprite'],
  // explicit Stage 2-5 enclave and Stage 2-5 flotilla entries
];
```

Write neutral output as `export const svg = { pirates: "..." }`; do not append `pirates` to the six civilization `FACTIONS` list.

- [ ] **Step 5: Add first-class landmark rendering**

Extend `SpriteEntity`:

```ts
kind: 'unit' | 'building' | 'improvement' | 'landmark';
state: 'idle' | 'walk' | 'attack' | 'hurt' | 'death';
mode?: 'patrol' | 'raid' | 'blockade' | 'relocating';
tier?: 1 | 2 | 3;
stage?: 1 | 2 | 3 | 4 | 5;
```

Add the landmark DOM layer and a production static landmark lookup backed by `PIRATE_HEADQUARTERS_SPRITE_CATALOG`. Extend the Canvas sprite loader/hex renderer to rasterize and draw headquarters at low zoom. Task 15 replaces the high-zoom static landmark lookup with generated v2 assets before the readiness gate is removed. Size remains derived from `camera.hexSize`; do not hardcode wrapper pixels.

- [ ] **Step 6: Run checks and commit**

```bash
scripts/check-src-rule-violations.sh src/renderer/sprites/pirates.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/sprites/sprite-loader.ts src/renderer/sprites/sprite-system.tsx src/renderer/sprite-overlay.ts src/renderer/hex-renderer.ts
./scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/sprite-loader.test.ts tests/renderer/sprite-overlay.test.ts tests/renderer/hex-renderer.test.ts
./scripts/run-with-mise.sh yarn build
git add src/renderer/sprites/pirates.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/sprites/sprite-loader.ts src/renderer/sprites/sprite-system.tsx src/renderer/sprite-overlay.ts src/renderer/hex-renderer.ts scripts/serialize-sprites.mjs tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/sprite-loader.test.ts tests/renderer/sprite-overlay.test.ts tests/renderer/hex-renderer.test.ts
git commit -m "feat(pirates): add neutral sprite and landmark architecture"
```

---

## Task 14: Author All Six Production Pirate Unit Sprites And Damage States

**Files:**

- Create: `design/conquestoria-sprites/lib/pirates-v2.jsx`
- Modify: `src/renderer/sprites/pirates.tsx`
- Generate: `src/renderer/sprites/v2/pirate_galley.svg.ts`
- Generate: `src/renderer/sprites/v2/pirate_corsair.svg.ts`
- Generate: `src/renderer/sprites/v2/pirate_frigate.svg.ts`
- Generate: `src/renderer/sprites/v2/pirate_ironclad.svg.ts`
- Generate: `src/renderer/sprites/v2/pirate_fast_attack_craft.svg.ts`
- Generate: `src/renderer/sprites/v2/pirate_mothership.svg.ts`
- Modify: `src/renderer/sprites/v2/index.ts`
- Modify: `src/assets/sprite-animations-v2.css`
- Modify: `tests/renderer/sprites/v2/index.test.ts`
- Modify: `tests/renderer/sprites/sprite-v2.test.ts`

- [ ] **Step 1: Write structural tests for every unit before drawing**

For each generated sprite, parse the markup and require:

```ts
expect(root.matches('.cq-v2')).toBe(true);
expect(root.querySelector('.cq-damage-1')).not.toBeNull();
expect(root.querySelector('.cq-damage-2')).not.toBeNull();
expect(root.querySelector('.cq-damage-3')).not.toBeNull();
expect(root.querySelector('.cq-wake')).not.toBeNull();
expect(root.querySelector('.cq-attack-effect')).not.toBeNull();
expect(root.querySelector('.cq-death-effect')).not.toBeNull();
```

Also require a unique silhouette hook for each class and reject a generated file that contains an empty faction value. Add v2 index tests proving each pirate unit resolves under the neutral `pirates` key and never needs a civilization palette.

- [ ] **Step 2: Run red sprite tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-v2.test.ts
```

- [ ] **Step 3: Author the neutral outlaw family**

Use weathered timber, oxidized metal, patched canvas, soot, signal red, bone-white markings, and shared dark ink. Required silhouettes and structural damage are:

| Unit | Silhouette and animation hooks | Damage 1 | Damage 2 | Damage 3 |
|---|---|---|---|---|
| Pirate Galley | low hull, oar banks, ram, patched square sail; `.cq-oars`, `.cq-ram-surge` | torn sail | broken oars/hull scrape | snapped mast/listing/debris |
| Corsair/Xebec | raked lateen sails, narrow fast hull, boarding hooks; `.cq-lateen`, `.cq-board-surge` | sail slit | broken spar/rail | mast down/fire/listing |
| Pirate Frigate | tall masts, gun deck, broadside smoke; `.cq-broadside`, `.cq-roll` | sail tears | breached gun deck | collapsed mast/heavy fire |
| Ironclad Raider | plated low freeboard, stack, heavy gun; `.cq-engine-wake`, `.cq-stack-smoke`, `.cq-heavy-recoil` | dented plate | missing plate/stack damage | breached hull/fire/listing |
| Fast Attack Craft | planing bow, twin engines, compact weapon mount; `.cq-bow-lift`, `.cq-engine-wake`, `.cq-autocannon` | chipped hull | disabled engine wake | broken mount/fire/debris |
| Pirate Mothership | converted freighter, cranes, boats, radar, diesel stacks; `.cq-crane`, `.cq-boat`, `.cq-radar`, `.cq-diesel` | torn awning | disabled radar/crane | broken superstructure/heavy list |

Each component must render complete idle, walk, attack, hurt, and death hooks. Do not satisfy damage with smoke alone.

- [ ] **Step 4: Serialize and inspect every output**

```bash
./scripts/run-with-mise.sh yarn node scripts/serialize-sprites.mjs
./scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-v2.test.ts tests/renderer/sprites/sprite-catalog.test.ts
```

Use the Browser plugin to open the sprite artboard or a temporary in-game test route. Inspect each unit at `data-state=idle/walk/attack/hurt/death` and `data-damage=0/1/2/3` at actual map scale. Fix any unreadable silhouette, clipping, transform conflict, or synchronized loop before continuing.

- [ ] **Step 5: Mark inventory rows and commit**

Set `ART-U1..U6` and unit portions of `ANIM-1`/`DAMAGE-1` to complete only after tests and browser QA pass.

```bash
git add design/conquestoria-sprites/lib/pirates-v2.jsx src/renderer/sprites/pirates.tsx src/renderer/sprites/v2 src/assets/sprite-animations-v2.css tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-v2.test.ts docs/superpowers/plans/2026-06-13-pirate-factions.md
git commit -m "feat(pirates): add production pirate ship sprites"
```

---

## Task 15: Author Enclave/Flotilla Art And Complete Runtime Animation State

**Files:**

- Modify: `design/conquestoria-sprites/lib/pirates-v2.jsx`
- Modify: `src/renderer/sprites/pirates.tsx`
- Generate: nine `src/renderer/sprites/v2/pirate_{enclave|flotilla}_stage_*.svg.ts` files
- Modify: `src/renderer/sprites/v2/index.ts`
- Create: `src/renderer/pirate-sprite-state.ts`
- Modify: `src/renderer/sprite-overlay.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/renderer/unit-movement-animation.ts`
- Modify: `src/assets/sprite-animations-v2.css`
- Create: `tests/renderer/pirate-sprite-state.test.ts`
- Modify: `tests/renderer/sprite-overlay.test.ts`
- Modify: `tests/renderer/unit-movement-animation.test.ts`
- Modify: `tests/renderer/render-loop-wrap.test.ts`

- [ ] **Step 1: Write red landmark, independent-state, movement, and reduced-motion tests**

Require:

- five distinct enclave foundations and four distinct Stage 2-5 flotilla foundations;
- tier overlays hidden/fortified/stronghold compose independently of stage foundation;
- `data-state`, `data-mode`, `data-damage`, `data-tier`, and `data-stage` update without replacing pooled DOM nodes;
- combat event sets attack/hurt/death one-shot state and returns to persistent mode deterministically;
- relocation mode persists for the relocation sequence only;
- moving units remain in the DOM overlay at interpolated fractional coordinates;
- reduced-motion keeps static sprites, headquarters, damage, targeting, and blockade markers visible while disabling motion;
- wrapping movement produces the short visual path and no duplicate stale ghost.

- [ ] **Step 2: Run red tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/pirate-sprite-state.test.ts tests/renderer/sprite-overlay.test.ts tests/renderer/unit-movement-animation.test.ts tests/renderer/render-loop-wrap.test.ts
```

- [ ] **Step 3: Author all headquarters production art**

Enclave foundations progress from hidden cove and timber jetty to fortified gun cove, industrial raider yard, and modern mercenary cliff compound. They must read as pirate infrastructure, never a tribal village. Flotillas progress from xebec tender group to frigate depot, ironclad/steam raider group, and modern mothership/fast-craft formation. Stage foundation, behavior overlay, and damage layers remain separate.

Required hooks include `.cq-surf`, `.cq-flag`, `.cq-crane`, `.cq-defensive-fire`, `.cq-collapse`, `.cq-blockade-ring`, `.cq-relocation-heading`, and `.cq-damage-1/2/3`.

- [ ] **Step 4: Implement event-driven sprite state**

```ts
export interface PirateSpriteVisualState {
  state: 'idle' | 'walk' | 'attack' | 'hurt' | 'death';
  mode: 'patrol' | 'raid' | 'blockade' | 'relocating';
  damage: 0 | 1 | 2 | 3;
  tier: 1 | 2 | 3;
  stage: 1 | 2 | 3 | 4 | 5;
  expiresAtMs?: number;
}
```

The controller consumes typed movement/combat/raid/blockade/relocation/destruction events. One-shot state expiration is deterministic and tested with fake timers. Persistent mode derives from current pirate state.

- [ ] **Step 5: Keep v2 units visible while moving**

Build moving `SpriteEntity` records from `getMovementAnimationPosition()` using the animation unit and interpolated coordinate. Do not exclude moving IDs from the overlay. Canvas continues to omit IDs currently active in the overlay, preventing double rendering.

- [ ] **Step 6: Fix reduced motion globally**

Remove the current `opts.reducedMotion` display-none gate. Add `data-reduced-motion="true"` to the overlay root and CSS that sets animation/transition duration to zero while preserving the static frame and all information layers.

- [ ] **Step 7: Serialize, browser-QA the full matrix, mark inventory, and commit**

```bash
./scripts/run-with-mise.sh yarn node scripts/serialize-sprites.mjs
scripts/check-src-rule-violations.sh src/renderer/pirate-sprite-state.ts src/renderer/sprite-overlay.ts src/renderer/render-loop.ts src/renderer/unit-movement-animation.ts src/renderer/sprites/pirates.tsx
./scripts/run-with-mise.sh yarn test --run tests/renderer/pirate-sprite-state.test.ts tests/renderer/sprite-overlay.test.ts tests/renderer/unit-movement-animation.test.ts tests/renderer/render-loop-wrap.test.ts tests/renderer/sprites/v2/index.test.ts
```

Use the Browser plugin at `http://localhost:58676/` or the active Vite URL to inspect every headquarters stage, tier overlay, damage tier, moving state, wrap crossing, and reduced-motion setting at desktop and mobile widths. Complete `ART-E1..E5`, `ART-F2..F5`, `ART-O1..O3`, `ANIM-1`, `ANIM-2`, and `DAMAGE-1` only after visual QA.

```bash
git add design/conquestoria-sprites/lib/pirates-v2.jsx src/renderer/sprites/pirates.tsx src/renderer/sprites/v2 src/renderer/pirate-sprite-state.ts src/renderer/sprite-overlay.ts src/renderer/render-loop.ts src/renderer/unit-movement-animation.ts src/assets/sprite-animations-v2.css tests/renderer/pirate-sprite-state.test.ts tests/renderer/sprite-overlay.test.ts tests/renderer/unit-movement-animation.test.ts tests/renderer/render-loop-wrap.test.ts docs/superpowers/plans/2026-06-13-pirate-factions.md
git commit -m "feat(pirates): add headquarters art and v2 animation states"
```

---

## Task 16: Produce And Wire Pirate SFX With Viewer Privacy

**Files:**

- Create: `scripts/generate-pirate-sfx.sh`
- Create: `src/audio/pirate-audio-sources.ts`
- Create: `src/audio/pirate-audio-director.ts`
- Modify: `src/audio/sfx-catalog.ts`
- Modify: `src/audio/sfx-director.ts`
- Modify: `src/audio/audio-system.ts`
- Modify: `src/main.ts`
- Create: 33 OGG files under `public/audio/sfx/pirates/` and `public/audio/stinger/pirates/`
- Modify: `AUDIO-CREDITS.md`
- Create: `tests/audio/pirate-audio-director.test.ts`
- Modify: `tests/audio/sfx-catalog.test.ts`
- Modify: `tests/audio/sfx-director.test.ts`
- Modify: `tests/audio/audio-system.integration.test.ts`

- [ ] **Step 1: Write red catalog, privacy, ordering, cooldown, and lifecycle tests**

Assert:

- every pirate unit has movement, attack/fire, impact, and death entries;
- enclave ambience/defense/collapse and six strategic stingers exist on disk and in the typed source manifest;
- off-screen movement/combat is silent for the current viewer;
- a visible multi-hex move produces one rate-limited movement cue, not one per hex;
- attack fire precedes impact by a deterministic short delay;
- faction destruction produces one strategic collapse/sinking cue and suppresses duplicate death cues;
- enclave ambience starts only while a visible enclave is focused or its dossier is open;
- ambience stops on focus change, panel close, hot-seat handoff, game end, mute, and disposal;
- strategic cues route only to intended viewers;
- every source is in-project synthesized, CC0, or CC-BY with exact credits; reject SA/NC/missing records.

- [ ] **Step 2: Run red tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/audio/pirate-audio-director.test.ts tests/audio/sfx-catalog.test.ts tests/audio/sfx-director.test.ts tests/audio/audio-system.integration.test.ts
```

- [ ] **Step 3: Build a reproducible asset script and manifest**

The script generates or derives these outputs:

```text
6 movement: galley, corsair, frigate, ironclad, fast-attack-craft, mothership
6 fire/attack: ram-board, light-cannon, broadside, heavy-gun, autocannon, mothership-defense
6 impacts: timber-light, timber-heavy, broadside-hit, metal-heavy, fast-craft-hit, mothership-hit
6 deaths: one per pirate unit
3 headquarters: enclave-ambience, enclave-defense, enclave-collapse
6 strategic: sighting, raid, blockade, tribute, contract-accepted, contract-exposed
```

Use ffmpeg lavfi synthesis for self-owned noise/tone layers and repository-owned clips only. If an external source is needed, use CC0 or CC-BY and add this exact manifest shape:

```ts
interface PirateAudioSource {
  id: string;
  title: string;
  creator: string;
  sourceUrl: string;
  license: 'CC0' | 'CC-BY' | 'in-project';
  creditText: string;
  localFiles: string[];
  derivativeNotes: string;
}
```

Run `ffprobe` in the script or verification step and record exact durations in catalog `loopEnd`; no estimated durations remain.

- [ ] **Step 4: Add live state providers to audio routing**

Change startup to pass a live provider:

```ts
audioSystem.start(gameState, bus, () => gameState);
```

`SfxDirector` checks current viewer visibility from the provider before movement/combat/death playback. `PirateAudioDirector` uses the same provider and typed pirate events. Do not snapshot visibility or viewer ID at game start.

- [ ] **Step 5: Run automated verification and human listening acceptance**

```bash
bash scripts/generate-pirate-sfx.sh
./scripts/run-with-mise.sh yarn test --run tests/audio/pirate-audio-director.test.ts tests/audio/sfx-catalog.test.ts tests/audio/sfx-director.test.ts tests/audio/audio-system.integration.test.ts
./scripts/run-with-mise.sh yarn build
```

Listen to every file and check it in context. Record pass/fail for identity, clipping, loudness, attack/impact timing, loop seams, fatigue, and era fit. Regenerate or replace every failed clip before marking `SFX-U1..U6`, `SFX-HQ`, and `SFX-STRAT` complete.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-pirate-sfx.sh src/audio/pirate-audio-sources.ts src/audio/pirate-audio-director.ts src/audio/sfx-catalog.ts src/audio/sfx-director.ts src/audio/audio-system.ts src/main.ts public/audio/sfx/pirates public/audio/stinger/pirates AUDIO-CREDITS.md tests/audio/pirate-audio-director.test.ts tests/audio/sfx-catalog.test.ts tests/audio/sfx-director.test.ts tests/audio/audio-system.integration.test.ts docs/superpowers/plans/2026-06-13-pirate-factions.md
git commit -m "feat(pirates): add production audio and private routing"
```

---

## Task 17: Run End-To-End Gameplay, UI, Balance, Performance, And Regression QA

**Files:**

- Create: `tests/systems/pirate-end-to-end.test.ts`
- Modify: `tests/main.integration.test.ts`
- Modify: `tests/systems/pirate-balance.test.ts`
- Modify implementation only when a failing regression demonstrates a real defect

- [ ] **Step 1: Add the complete deterministic scenario**

The test drives:

1. pre-Galleys no-activation;
2. activation and warning;
3. pressure check and faction spawn;
4. rumor then sighting without intel leak;
5. mixed fleet escalation through successful raid/survival;
6. one raid and a valid blockade with exact economy impact;
7. tribute cancellation and expiry;
8. Stage 5 flotilla contract, successful raid, exposure/no-exposure seeded branches;
9. relocation telegraph and move;
10. defender clearing, enclave assault or flagship sinking;
11. bounty, suppression, history, notification review, and zero duplicate events;
12. save/load between steps with identical continuation.

Before running the scenario, delete `PIRATE_IMPLEMENTATION_READY` and every conditional that references it. Piracy becomes unconditionally eligible through the approved `Galleys` activation rule. Add a source scan and integration assertion proving no readiness gate remains, then mark `GATE-1` complete.

- [ ] **Step 2: Run gameplay and architecture regressions**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pirate-end-to-end.test.ts tests/systems/pirate-system.test.ts tests/systems/pirate-actions.test.ts tests/systems/economy-system.test.ts tests/ai/basic-ai-pirates.test.ts tests/storage/save-manager.test.ts tests/main.integration.test.ts
```

- [ ] **Step 3: Run performance checks**

Instrument a large map with five factions and representative units. Assert scheduled habitat scoring only occurs on due checks/control invalidation, bounded behavior searches remain below documented candidate counts, and Pirate Waters projection does not scan all map tiles on ordinary rerender.

- [ ] **Step 4: Run browser gameplay QA**

Start the app and use the Browser plugin:

```bash
./scripts/run-with-mise.sh yarn dev
```

Verify desktop and mobile widths, mouse and touch selection, hot-seat handoff privacy, all launcher paths, stale-action replay, blockade city explanation, combat preview, every sprite/damage/animation state, reduced motion, wrap movement, SFX focus lifecycle, save/reload, and offline refresh. Capture screenshots for representative enclave, flotilla, Pirate Waters, blockade, damage, and modern mercenary states for the eventual PR.

- [ ] **Step 5: Re-run balance sampling and adjust definitions only**

If equivalent encounter exchange counts fall outside intended bands, adjust `pirate-definitions.ts` rather than scattering stat exceptions through behavior/combat code. Mark `BALANCE-1` and `COPY-1` complete after tests and visual copy review.

- [ ] **Step 6: Commit regression fixes and scenario**

```bash
git add tests/systems/pirate-end-to-end.test.ts tests/systems/pirate-balance.test.ts tests/main.integration.test.ts
# If regression failures required source fixes, add only those exact source paths here.
git commit -m "test(pirates): complete end-to-end and balance coverage"
```

---

## Task 18: Close Every Placeholder And Run The Final Completion Gate

**Files:** All changed files and this plan inventory.

- [ ] **Additional required closure item: repair and verify worktree-aware repository scripts**

Reproduce the worktree path failure that interrupted this effort, fix the owning scripts so commands resolve the active worktree rather than assuming the primary checkout, and add a regression that runs from an isolated worktree. This must be complete before the final PR.

- [ ] **Step 1: Prove the asset inventory has zero open rows**

Update every inventory row to `complete` with the verifying test/screenshot/listening record. Do not delete the inventory to make it appear empty.

- [ ] **Step 2: Scan for temporary work**

```bash
rg -n "TODO|TBD|placeholder|temporary|temp pirate|provisional|fallback pending|Claude Design|feature flag" src tests design scripts public docs/superpowers/plans/2026-06-13-pirate-factions.md
```

Review every match. Remove temporary branches/assets/comments. Keep only intentional documentation such as the closure instructions themselves and defensive runtime fallback language.

- [ ] **Step 3: Prove normal paths never use placeholders or generic assets**

Run catalog tests proving all six pirate units and nine headquarters resolve production Canvas and v2 assets. Run SFX catalog tests proving every required family resolves an existing approved file. Run UI tests proving no unavailable action is represented by dead copy.

- [ ] **Step 4: Run all required rule checks for changed source files**

```bash
scripts/check-src-rule-violations.sh $(git diff --name-only origin/main...HEAD -- 'src/**/*.ts' 'src/**/*.tsx')
```

If shell glob/path behavior makes this unreliable, pass the changed source files explicitly. Fix every violation; do not weaken rules.

- [ ] **Step 5: Run targeted suites, full suite, and build**

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/owner-kind.test.ts tests/core/pirate-state.test.ts tests/systems/pirate-definitions.test.ts tests/systems/pirate-ecology.test.ts tests/systems/pirate-behavior.test.ts tests/systems/pirate-actions.test.ts tests/systems/pirate-system.test.ts tests/systems/pirate-presentation.test.ts tests/systems/pirate-balance.test.ts tests/systems/pirate-end-to-end.test.ts tests/storage/save-manager.test.ts tests/ai/basic-ai-pirates.test.ts tests/ui/pirate-waters-panel.test.ts tests/ui/pirate-notification-listeners.test.ts tests/input/pirate-headquarters-assault.test.ts tests/renderer/pirate-headquarters-presentation.test.ts tests/renderer/pirate-sprite-state.test.ts tests/audio/pirate-audio-director.test.ts
./scripts/run-with-mise.sh yarn test
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn build:tauri
./scripts/run-with-mise.sh yarn test:web-smoke
```

- [ ] **Step 6: Inspect committed and uncommitted diffs**

```bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
git diff --stat
git diff
git status --short --branch
```

Confirm no unrelated changes, no generated churn outside the planned catalogs, no stale source/generated sprite mismatch, and no missing credits.

- [ ] **Step 7: Final commit**

```bash
git add docs/superpowers/plans/2026-06-13-pirate-factions.md
git commit -m "docs: close pirate implementation inventory"
```

The feature is complete only after the issue comment predates code changes, all inventory rows are complete, the human SFX checklist passes, browser QA is recorded, full tests/builds pass, and normal pirate paths never use placeholder or generic art/audio.
