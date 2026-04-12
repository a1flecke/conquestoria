# M4e Slice 5 Review Follow-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the review findings in slice 5 by making custom-civ setup flows use one authoritative registry from setup through runtime, repairing picker/editor lifecycle bugs, preventing saved-data overwrite, and closing the missing end-to-end tests.

**Architecture:** Treat `customCivilizations` as the authoritative setup-time registry instead of keeping a split between rendered `civDefinitions`, session-local additions, and persisted settings. Both setup screens should initialize from the persisted registry passed in from `main.ts`, derive the civ picker roster from that registry, and forward the same registry into `createNewGame(...)` / `createHotSeatGame(...)` unchanged. UI overlays should be explicitly replaced rather than stacked so the civ picker and custom-civ editor always have one live instance.

**Tech Stack:** TypeScript, Vitest, jsdom-backed UI tests, DOM panels, serializable `GameState`, IndexedDB/localStorage settings persistence

---

## Root Cause Summary

1. **Split source of truth for custom civs**
   The setup UIs currently accept a rendered `civDefinitions` list, keep a separate local `customCivilizations` array, and also read/write persisted settings. That means the UI can show saved custom civs without actually forwarding the same registry into game creation.

2. **Imperative overlay stacking without lifecycle ownership**
   `campaign-setup.ts` appends new picker/editor panels without first removing the previous picker, so the solo setup can end up with two active `#civ-select` overlays and stale callbacks.

3. **Uniqueness checks run against the wrong dataset**
   The custom-civ editor only sees session-local additions when building IDs, so it can collide with already-saved custom civs and overwrite them on save.

4. **Tests stop at visibility instead of completing the flow**
   Current UI tests prove that custom civs can be rendered, but not that the selected civ survives into `onStartSolo(...)` / `onComplete(...)`, nor that creating a civ from within setup leaves only one picker and a working callback chain.

The tasks below address those causes directly instead of patching individual symptoms.

---

### Task 1: Unify Setup-Time Custom Civ State

**Files:**
- Modify: `src/main.ts`
- Modify: `src/ui/campaign-setup.ts`
- Modify: `src/ui/hotseat-setup.ts`
- Modify: `tests/ui/campaign-setup.test.ts`
- Modify: `tests/ui/hotseat-setup.test.ts`

- [ ] **Step 1: Write failing solo and hot-seat callback tests for preexisting saved custom civs**

Add one test to `tests/ui/campaign-setup.test.ts` that:
- passes `civDefinitions: getPlayableCivDefinitions({ customCivilizations: [customCiv] })`
- opens the civ picker
- selects `Sunfolk`
- starts the campaign
- asserts `onStartSolo` was called with `civType: 'custom-sunfolk'`
- asserts `onStartSolo.mock.calls[0][0].customCivilizations` contains the original saved `customCiv`

Add one test to `tests/ui/hotseat-setup.test.ts` that:
- passes the same preexisting registry into `showHotSeatSetup(...)`
- completes the first-player civ selection with `Sunfolk`
- completes enough of the flow to call `onComplete`
- asserts the resulting config includes `customCivilizations: [customCiv]`

- [ ] **Step 2: Run the focused setup tests to verify the current bug**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts
```

Expected: FAIL because the setup callbacks currently receive only session-created custom civs, not the preexisting saved registry shown in the picker.

- [ ] **Step 3: Add one authoritative registry input to both setup screens**

Update `src/ui/campaign-setup.ts` and `src/ui/hotseat-setup.ts` so their options include:

```ts
export interface CampaignSetupOptions {
  civDefinitions?: CivDefinition[];
  initialCustomCivilizations?: CustomCivDefinition[];
}

export interface HotSeatSetupOptions {
  civDefinitions?: CivDefinition[];
  initialCustomCivilizations?: CustomCivDefinition[];
}
```

Then initialize setup state from that registry instead of `[]`:

```ts
let customCivilizations = [...(options?.initialCustomCivilizations ?? [])];
let civDefinitions = getPlayableCivDefinitions({ customCivilizations });
```

Do not treat `options.civDefinitions` as the long-lived source of truth after initialization; it is just the initial rendered roster.

- [ ] **Step 4: Forward the authoritative registry into game creation**

In `src/main.ts`, when opening setup, pass both the rendered roster and the raw registry from persisted settings:

```ts
const savedCustomCivilizations = persistedSettings?.customCivilizations ?? [];

showCampaignSetup(uiLayer, callbacks, {
  civDefinitions: getPlayableCivDefinitions({ customCivilizations: savedCustomCivilizations }),
  initialCustomCivilizations: savedCustomCivilizations,
});

showHotSeatSetup(uiLayer, callbacks, {
  civDefinitions: getPlayableCivDefinitions({ customCivilizations: savedCustomCivilizations }),
  initialCustomCivilizations: savedCustomCivilizations,
});
```

Also update the solo start path so `createNewGame(...)` receives the registry:

```ts
gameState = createNewGame({
  civType: config.civType,
  mapSize: config.mapSize,
  opponentCount: config.opponentCount,
  gameTitle: config.gameTitle,
  settingsOverrides: getPersistedSettingsOverrides(),
  customCivilizations: config.customCivilizations,
});
```

- [ ] **Step 5: Re-run the focused setup tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts tests/core/game-state.test.ts tests/core/turn-manager.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the source-of-truth fix**

```bash
git add src/main.ts src/ui/campaign-setup.ts src/ui/hotseat-setup.ts tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts tests/core/game-state.test.ts tests/core/turn-manager.test.ts
git commit -m "fix(m4e): unify custom civ setup state"
```

---

### Task 2: Repair Civ Picker And Custom-Civ Editor Lifecycle

**Files:**
- Modify: `src/ui/campaign-setup.ts`
- Modify: `src/ui/hotseat-setup.ts`
- Modify: `src/ui/civ-select.ts`
- Modify: `tests/ui/campaign-setup.test.ts`
- Modify: `tests/ui/hotseat-setup.test.ts`

- [ ] **Step 1: Write failing lifecycle regressions**

Add a solo setup test that:
- opens the civ picker
- triggers `Create Custom Civilization`
- simulates a successful save via the custom-civ panel callbacks
- asserts `document.querySelectorAll('#civ-select')` has length `1`
- asserts the reopened picker still contains a working `[data-action="create-custom-civ"]` button

Add a hot-seat test that:
- opens the civ picker
- triggers custom-civ creation and save
- asserts only one `#civ-select` remains
- selects the newly created civ and verifies the flow continues normally

- [ ] **Step 2: Run the lifecycle-focused tests and confirm they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts tests/ui/civ-select.test.ts
```

Expected: FAIL because the solo flow currently stacks a second picker and reopens it with a dead `onCreateCustomCiv` callback.

- [ ] **Step 3: Introduce replace-in-place helpers for setup overlays**

In both setup files, add local helpers:

```ts
function removeSetupOverlay(id: string): void {
  panel.querySelector(`#${id}`)?.remove();
}

function openCivPicker(callbacks: CivSelectCallbacks): void {
  removeSetupOverlay('civ-select');
  createCivSelectPanel(panel, callbacks, {
    disabledCivs: chosenCivs,
    headerText: ...,
    civDefinitions,
  });
}

function openCustomCivEditor(onSaved: (definition: CustomCivDefinition) => Promise<void>): void {
  removeSetupOverlay('custom-civ-panel');
  createCustomCivPanel(panel, { ... }, { existingDefinitions: customCivilizations });
}
```

Use those helpers everywhere instead of directly appending nested pickers.

- [ ] **Step 4: Ensure the reopened solo picker preserves full callbacks**

In `campaign-setup.ts`, when reopening the civ picker after save, pass the same real `onCreateCustomCiv` handler instead of `() => {}` so the button is live after the first save too.

- [ ] **Step 5: Re-run the lifecycle tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts tests/ui/civ-select.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the overlay lifecycle fix**

```bash
git add src/ui/campaign-setup.ts src/ui/hotseat-setup.ts src/ui/civ-select.ts tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts tests/ui/civ-select.test.ts
git commit -m "fix(m4e): stabilize civ picker lifecycle"
```

---

### Task 3: Prevent Saved Custom Civ ID Collisions And Overwrites

**Files:**
- Modify: `src/ui/campaign-setup.ts`
- Modify: `src/ui/hotseat-setup.ts`
- Modify: `src/ui/custom-civ-panel.ts` only if callback signatures need a stronger contract
- Modify: `tests/ui/campaign-setup.test.ts`
- Modify: `tests/ui/hotseat-setup.test.ts`
- Modify: `tests/storage/save-manager.test.ts`

- [ ] **Step 1: Write failing duplicate-name tests**

Add one UI test that:
- starts setup with `initialCustomCivilizations: [customCiv]`
- opens the custom-civ editor
- enters a new civ with the same display name as the saved `customCiv`
- saves it
- verifies the saved definition did not overwrite the original id

Add one save-manager test that:
- saves an initial settings object with one custom civ
- simulates adding another same-name civ through the setup flow
- asserts both survive in settings after save, with distinct ids

- [ ] **Step 2: Run the duplicate-name tests to confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts tests/storage/save-manager.test.ts
```

Expected: FAIL because `existingDefinitions` currently excludes preexisting saved civs.

- [ ] **Step 3: Make the full registry available to the editor**

Pass the authoritative `customCivilizations` registry into `createCustomCivPanel(..., { existingDefinitions: customCivilizations })` after Task 1’s initialization change. Do not rebuild that list from `loadSettings()` inside the save callback; the setup screen should already own the current registry.

Save path should update from that one registry:

```ts
customCivilizations = [
  ...customCivilizations.filter(def => def.id !== definition.id),
  definition,
];
await saveSettings({ ...loaded, customCivilizations });
```

- [ ] **Step 4: Re-run the duplicate-name tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts tests/storage/save-manager.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the data-safety fix**

```bash
git add src/ui/campaign-setup.ts src/ui/hotseat-setup.ts src/ui/custom-civ-panel.ts tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts tests/storage/save-manager.test.ts
git commit -m "fix(m4e): preserve saved custom civ identities"
```

---

### Task 4: Add End-To-End Regression Coverage For The Full Setup Contract

**Files:**
- Modify: `tests/ui/campaign-setup.test.ts`
- Modify: `tests/ui/hotseat-setup.test.ts`
- Modify: `tests/core/game-state.test.ts`
- Modify: `tests/core/turn-manager.test.ts`
- Modify: `tests/integration/m4e-acceptance.test.ts`

- [ ] **Step 1: Add end-to-end callback assertions instead of render-only checks**

Strengthen the setup tests so they assert:
- `onStartSolo` is called exactly once
- the selected custom civ id is forwarded
- the full custom registry is forwarded
- only one civ picker exists after create/save/reopen
- hot-seat completion actually occurs and includes the selected custom civ in the final player list

- [ ] **Step 2: Add an acceptance regression for “saved custom civ -> setup -> runtime -> naming”**

Extend `tests/integration/m4e-acceptance.test.ts` with a flow that:
- seeds a saved custom-civ registry
- starts a game from that civ through the setup contract or a setup-shaped config
- asserts `resolveCivDefinition(state, 'custom-sunfolk')` still returns the custom civ
- asserts the first founded city uses the custom city-name pool

- [ ] **Step 3: Run the expanded regression suite**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts tests/core/game-state.test.ts tests/core/turn-manager.test.ts tests/integration/m4e-acceptance.test.ts tests/storage/save-manager.test.ts tests/storage/save-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run the release-gate target suite**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/council-system.test.ts tests/systems/victory-progress.test.ts tests/ui/council-panel.test.ts tests/ui/advisor-system.test.ts tests/ui/primary-action-bar.test.ts tests/ui/game-shell.test.ts tests/ui/campaign-setup.test.ts tests/ui/tech-panel.test.ts tests/core/hotseat-events.test.ts tests/systems/auto-explore-system.test.ts tests/ui/desktop-controls.test.ts tests/ui/fog-leak.test.ts tests/systems/tech-definitions.test.ts tests/systems/tech-system.test.ts tests/systems/legendary-wonder-system.test.ts tests/systems/legendary-wonder-definitions.test.ts tests/ui/wonder-panel.test.ts tests/systems/council-memory.test.ts tests/systems/civ-registry.test.ts tests/systems/city-system.test.ts tests/systems/minor-civ-system.test.ts tests/systems/city-name-system.test.ts tests/systems/espionage-system.test.ts tests/ui/custom-civ-panel.test.ts tests/ui/civ-select.test.ts tests/ui/hotseat-setup.test.ts tests/integration/m4e-council-guidance.test.ts tests/integration/m4e-acceptance.test.ts tests/storage/save-manager.test.ts tests/storage/save-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 6: Commit the regression coverage**

```bash
git add tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts tests/core/game-state.test.ts tests/core/turn-manager.test.ts tests/integration/m4e-acceptance.test.ts tests/storage/save-manager.test.ts tests/storage/save-persistence.test.ts
git commit -m "test(m4e): lock custom civ setup regressions"
```

---

## Self-Review

### Spec Coverage

- The review findings about lost runtime custom civs are covered by Task 1.
- The stale/doubled picker and dead button issues are covered by Task 2.
- The ID collision / saved-data overwrite issue is covered by Task 3.
- The missing flow-completion tests are covered by Task 4.

### Placeholder Scan

- No `TODO` / `TBD`
- Each task includes exact files and concrete test commands
- No “same as above” shorthand

### Type Consistency

- `customCivilizations` remains the authoritative registry name throughout the plan.
- `initialCustomCivilizations` is used consistently as the setup option name.
- `civDefinitions` remains the rendered roster derived from the registry, not a second registry.
