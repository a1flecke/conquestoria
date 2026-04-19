# Solo Setup UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the solo new-game flow, including the solo launcher entry screen, so it feels visually consistent with the rest of Conquestoria while preserving the current setup behavior and custom-civilization workflow.

**Architecture:** Keep the existing DOM-driven overlay approach, but stop hand-styling each solo step independently. Add a small shared setup-shell helper for the pre-game flow, extract the mode-selection launcher into a testable UI module, then rebuild the solo launcher, `campaign-setup`, `civ-select`, and `custom-civ-panel` around that shell so the player experiences one cohesive journey from choosing solo mode through civilization confirmation.

**Tech Stack:** TypeScript, DOM-based UI panels, Vitest with `jsdom`

---

## File Structure

- Create: `src/ui/setup-shell.ts`
  Purpose: shared DOM helpers and style tokens for solo setup overlays, cards, sections, and action rows.
- Create: `src/ui/game-mode-select.ts`
  Purpose: own the new-game launcher UI so the solo entry screen can be refreshed and tested outside `main.ts`.
- Modify: `src/ui/campaign-setup.ts`
  Purpose: redesign the solo setup screen using the shared shell, card-based choices, clearer selected-civ presentation, and visible validation/CTA states.
- Modify: `src/ui/civ-select.ts`
  Purpose: restyle the civilization picker so it reads as a continuation of solo setup instead of a separate utility overlay, and add an explicit back/cancel affordance.
- Modify: `src/ui/custom-civ-panel.ts`
  Purpose: restyle the custom civilization editor to match the refreshed flow while keeping the current validation behavior intact.
- Modify: `src/main.ts`
  Purpose: delegate launcher presentation to `game-mode-select.ts` while preserving current game-start behavior and saved-settings propagation.
- Modify: `tests/ui/game-mode-select.test.ts`
  Purpose: pin the launcher UI contract and prove the solo entry screen now uses the same visual language as the rest of the refreshed flow.
- Modify: `tests/ui/campaign-setup.test.ts`
  Purpose: pin the new solo-setup DOM contract and visible state transitions.
- Modify: `tests/ui/civ-select.test.ts`
  Purpose: assert the refreshed picker still exposes all civs, create-custom affordance, selected-state behavior, and the new explicit back action.
- Modify: `tests/ui/custom-civ-panel.test.ts`
  Purpose: assert the refreshed editor shows the intended hierarchy and keeps save-state behavior.

## Scope Notes

- Do not redesign hot-seat setup in this change.
- Do not add a CSS framework or global stylesheet.
- Do not change game-state creation, persistence semantics, or custom-civ validation rules.
- Keep all dynamic text on safe DOM APIs (`textContent`, properties, explicit nodes).
- Preserve the current `persistedSettings?.councilTalkLevel` handoff after `createNewGame()` in the solo start path.

### Task 1: Lock In The Refreshed Solo Setup Contract

**Files:**
- Modify: `tests/ui/game-mode-select.test.ts`
- Modify: `tests/ui/campaign-setup.test.ts`
- Modify: `tests/ui/civ-select.test.ts`
- Modify: `tests/ui/custom-civ-panel.test.ts`

**Player Truth Table**

Before action: the player opens solo setup and sees a clearly structured campaign screen with a visible title area, current civilization summary, setup sections, and a prominent but disabled primary action until required choices are made.

Click: the player chooses solo mode from the new-game launcher, opens the civ picker, changes map size/opponents, and opens the custom civ editor.

Immediately visible result: the launcher and every follow-up screen share the same shell language, the selected civilization summary updates in-place, choice cards show an active state, and the civ picker has an explicit path back to the campaign screen.

**Misleading UI Risks**

- A “selected civilization” summary that still reads like placeholder text after a choice would make the redesign look incomplete.
- Styling-only assertions are brittle; tests should assert visible text, data attributes, aria-ish semantics where available, and button disabled/enabled state rather than exact colors.
- If the civ picker only tests presence and not selection-state feedback, the new UI could regress into visually ambiguous cards.
- If the launcher is not covered, the original issue can still reproduce before `campaign-setup` opens.

**Interaction Replay Checklist**

- Add: choose solo mode from the launcher, open civ picker, select a civ, return to setup, verify the summary updates.
- Reorder: change map size after picking a civ, verify opponent options still update and the civ summary persists.
- Remove: cancel out of picker/editor overlays and verify only one live overlay remains.
- Repeat-click: reopen the civ picker after saving a custom civ and verify the create action is still live.
- Reopen: open the custom civ editor from the refreshed picker, save, confirm the new civ is selectable in the same session, and confirm the picker can be dismissed back to the campaign screen without forcing a selection.

- [ ] **Step 1: Add a failing launcher test for shell continuity between the entry screen and solo setup**

```typescript
it('renders the new-game launcher inside the shared setup shell and exposes a solo entry card', () => {
  const panel = showGameModeSelect(document.body, {
    initialTitle: 'New Campaign',
    onChooseSolo: () => {},
    onChooseHotSeat: () => {},
  });

  expect(panel.dataset.role).toBe('setup-surface');
  expect(panel.textContent).toContain('New Game');
  expect(panel.querySelector('[data-action="choose-solo-mode"]')).toBeTruthy();
});
```

- [ ] **Step 2: Add a failing campaign-setup test for visible solo-setup hierarchy and selected-state feedback**

```typescript
it('shows a setup header, selected civ summary, and enables start only after a civ is confirmed', () => {
  const onStartSolo = vi.fn();

  showCampaignSetup(document.body, {
    onStartSolo,
    onCancel: () => {},
  });

  expect(document.body.textContent).toContain('Build Your Campaign');
  expect(document.querySelector('[data-role="setup-hero"]')).toBeTruthy();
  expect(document.querySelector('[data-role="selected-civ-summary"]')?.textContent).toContain('No civilization selected');

  const startButton = Array.from(document.querySelectorAll('button'))
    .find(button => button.textContent === 'Start Campaign') as HTMLButtonElement;
  expect(startButton.disabled).toBe(true);

  clickButtonWithText('Choose civilization');
  const firstCard = document.querySelector('.civ-card') as HTMLElement;
  firstCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  (document.querySelector('#civ-start') as HTMLButtonElement).click();

  expect(document.querySelector('[data-role="selected-civ-summary"]')?.textContent).not.toContain('No civilization selected');
  expect(startButton.disabled).toBe(false);
});
```

- [ ] **Step 3: Add a failing civ-select test for card selection feedback and an explicit back action**

```typescript
it('marks the chosen civ card as selected and exposes a back action', () => {
  const onCancel = vi.fn();
  const panel = createCivSelectPanel(document.body, {
    onSelect: () => {},
    onCancel,
  }, {
    civDefinitions: getPlayableCivDefinitions({ customCivilizations: [customCiv] }),
    headerText: 'Choose your civilization',
    primaryActionText: 'Confirm Civilization',
  });

  const card = Array.from(panel.querySelectorAll('.civ-card'))
    .find(node => node.textContent?.includes('Sunfolk')) as HTMLElement;
  card.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  expect(card.dataset.selected).toBe('true');
  expect((panel.querySelector('#civ-start') as HTMLButtonElement).textContent).toBe('Confirm Civilization');
  (panel.querySelector('[data-action="cancel-civ-select"]') as HTMLButtonElement).click();
  expect(onCancel).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 4: Add a failing custom-civ-panel test for refreshed section hierarchy**

```typescript
it('renders a setup-style header and grouped editor sections', () => {
  const panel = createCustomCivPanel(document.body, { onSave: () => {}, onCancel: () => {} });

  expect(panel.querySelector('[data-role="setup-panel-header"]')).toBeTruthy();
  expect(panel.querySelector('[data-role="custom-civ-basics"]')).toBeTruthy();
  expect(panel.querySelector('[data-role="custom-civ-traits"]')).toBeTruthy();
  expect(panel.querySelector('[data-role="custom-civ-city-names"]')).toBeTruthy();
});
```

- [ ] **Step 5: Run the focused UI tests to verify they fail for the right reasons**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/game-mode-select.test.ts tests/ui/campaign-setup.test.ts tests/ui/civ-select.test.ts tests/ui/custom-civ-panel.test.ts
```

Expected: FAIL with missing `data-role` markers and/or disabled-state assertions because the current UI has not been refreshed yet.

- [ ] **Step 6: Commit the failing tests**

```bash
git add tests/ui/game-mode-select.test.ts tests/ui/campaign-setup.test.ts tests/ui/civ-select.test.ts tests/ui/custom-civ-panel.test.ts
git commit -m "test(ui): define solo setup refresh contract"
```

### Task 2: Add A Shared Pre-Game Shell And Refresh The Launcher

**Files:**
- Create: `src/ui/setup-shell.ts`
- Create: `src/ui/game-mode-select.ts`
- Modify: `src/main.ts`
- Modify: `tests/ui/game-mode-select.test.ts`

**Player Truth Table**

Before action: the player opens New Game and sees a clear visual shell with heading, supporting text, a campaign-title input, and mode cards that feel like part of the strategy game rather than a temporary overlay.

Click: the player enters a campaign title and chooses either solo or hot seat from the launcher.

Immediately visible result: the launcher itself now uses the shared shell and becomes the first step in the cohesive flow rather than a mismatched pre-screen.

**Misleading UI Risks**

- Over-generalizing the shell into a site-wide UI abstraction would grow scope unnecessarily.
- If the shell encodes copy that varies by screen, later steps will fight the abstraction.
- If the shell only centralizes colors but not layout affordances, the UX will still feel fragmented.
- If the launcher remains in `main.ts` as raw `innerHTML`, the issue is only partially fixed.

**Interaction Replay Checklist**

- Add: render the launcher using the shell and verify header/body/action areas all mount.
- Reorder: swap section order in a caller without changing shell internals.
- Remove: omit an optional eyebrow/subtitle and verify the shell still renders cleanly.
- Repeat-click: render multiple solo overlays in succession and confirm each uses the same shell markers.
- Reopen: close and reopen new-game mode selection from `main.ts` and verify the same shell returns consistently.

- [ ] **Step 1: Create `src/ui/setup-shell.ts` with a complete rendered shell API**

```typescript
export interface SetupShellOptions {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  panelId?: string;
}

export interface SetupSectionOptions {
  title: string;
  description?: string;
  role?: string;
}

export function createSetupShell(options: SetupShellOptions): {
  surface: HTMLDivElement;
  card: HTMLDivElement;
  header: HTMLDivElement;
  eyebrow?: HTMLParagraphElement;
  title: HTMLHeadingElement;
  subtitle?: HTMLParagraphElement;
  body: HTMLDivElement;
  actions: HTMLDivElement;
} {
  const surface = document.createElement('div');
  if (options.panelId) surface.id = options.panelId;
  surface.dataset.role = 'setup-surface';
  surface.style.cssText = [
    'position:absolute',
    'inset:0',
    'background:linear-gradient(180deg, rgba(9,11,28,0.98), rgba(24,18,12,0.96))',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:24px',
  ].join(';');

  const card = document.createElement('div');
  card.dataset.role = 'setup-card';
  card.style.cssText = [
    'width:min(100%, 920px)',
    'max-height:100%',
    'overflow:auto',
    'border:1px solid rgba(232,193,112,0.22)',
    'border-radius:24px',
    'background:rgba(17,20,38,0.92)',
    'box-shadow:0 24px 80px rgba(0,0,0,0.45)',
    'padding:24px',
    'display:flex',
    'flex-direction:column',
    'gap:18px',
  ].join(';');
  surface.appendChild(card);

  const header = document.createElement('div');
  header.dataset.role = 'setup-panel-header';
  header.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  let eyebrow: HTMLParagraphElement | undefined;
  if (options.eyebrow) {
    eyebrow = document.createElement('p');
    eyebrow.dataset.role = 'setup-eyebrow';
    eyebrow.textContent = options.eyebrow;
    header.appendChild(eyebrow);
  }

  const title = document.createElement('h1');
  title.dataset.role = 'setup-title';
  title.textContent = options.title;
  header.appendChild(title);

  let subtitle: HTMLParagraphElement | undefined;
  if (options.subtitle) {
    subtitle = document.createElement('p');
    subtitle.dataset.role = 'setup-subtitle';
    subtitle.textContent = options.subtitle;
    header.appendChild(subtitle);
  }

  card.appendChild(header);

  const body = document.createElement('div');
  body.dataset.role = 'setup-body';
  body.style.cssText = 'display:flex;flex-direction:column;gap:16px;';
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.dataset.role = 'setup-actions';
  actions.style.cssText = 'display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;';
  card.appendChild(actions);

  return { surface, card, header, eyebrow, title, subtitle, body, actions };
}
```

- [ ] **Step 2: Add a helper for labeled sections/cards that renders section copy and content**

```typescript
export function createSetupSection(options: SetupSectionOptions): {
  section: HTMLElement;
  title: HTMLHeadingElement;
  description?: HTMLParagraphElement;
  content: HTMLDivElement;
} {
  const section = document.createElement('section');
  if (options.role) section.dataset.role = options.role;
  section.style.cssText = [
    'border:1px solid rgba(255,255,255,0.08)',
    'border-radius:18px',
    'background:rgba(255,255,255,0.04)',
    'padding:16px',
    'display:flex',
    'flex-direction:column',
    'gap:10px',
  ].join(';');

  const title = document.createElement('h2');
  title.dataset.role = 'setup-section-title';
  title.textContent = options.title;
  section.appendChild(title);

  let description: HTMLParagraphElement | undefined;
  if (options.description) {
    description = document.createElement('p');
    description.dataset.role = 'setup-section-description';
    description.textContent = options.description;
    section.appendChild(description);
  }

  const content = document.createElement('div');
  content.dataset.role = 'setup-section-content';
  content.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  section.appendChild(content);

  return { section, title, description, content };
}
```

- [ ] **Step 3: Create `src/ui/game-mode-select.ts` so the launcher uses the shared shell immediately**

```typescript
export interface GameModeSelectCallbacks {
  initialTitle?: string;
  onChooseSolo: (title: string) => void;
  onChooseHotSeat: (title: string) => void;
}

export function showGameModeSelect(container: HTMLElement, callbacks: GameModeSelectCallbacks): HTMLElement {
  container.querySelector('#mode-select')?.remove();

  const shell = createSetupShell({
    panelId: 'mode-select',
    eyebrow: 'Campaign Setup',
    title: 'New Game',
    subtitle: 'Choose how this campaign begins, then continue into the matching setup flow.',
  });

  const intro = createSetupSection({
    title: 'Campaign Title',
    description: 'Name this run before choosing solo or hot seat.',
    role: 'mode-select-title-section',
  });
  shell.body.appendChild(intro.section);

  const modeGrid = document.createElement('div');
  modeGrid.dataset.role = 'mode-select-grid';
  intro.content.appendChild(modeGrid);

  container.appendChild(shell.surface);
  return shell.surface;
}
```

- [ ] **Step 4: Update `main.ts` to call `showGameModeSelect()` instead of rendering inline launcher HTML**

```typescript
showGameModeSelect(uiLayer, {
  initialTitle: 'New Campaign',
  onChooseSolo: async (title) => { /* existing solo branch */ },
  onChooseHotSeat: async (title) => { /* existing hot-seat branch */ },
});
```

- [ ] **Step 5: Run the launcher-focused tests and the rule checker**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/game-mode-select.test.ts
scripts/check-src-rule-violations.sh src/ui/setup-shell.ts src/ui/game-mode-select.ts src/main.ts
```

Expected: PASS. The launcher should now use the shared shell, while `campaign-setup`, `civ-select`, and `custom-civ-panel` tests may still fail until their tasks are complete.

- [ ] **Step 6: Commit the shell and launcher extraction**

```bash
git add src/ui/setup-shell.ts src/ui/game-mode-select.ts src/main.ts tests/ui/game-mode-select.test.ts
git commit -m "feat(ui): refresh new-game launcher shell"
```

### Task 3: Rebuild `campaign-setup` Around The New Shell

**Files:**
- Modify: `src/ui/campaign-setup.ts`
- Modify: `tests/ui/campaign-setup.test.ts`

**Player Truth Table**

Before action: the player enters solo setup and sees a polished campaign screen with a hero/header, a selected-civ card, a map-size section, an opponents section, and clear primary/secondary actions.

Click: the player chooses a civilization, changes map size, and clicks start.

Immediately visible result: selected-civ text updates immediately, the opponents control reflects the chosen map size, and the start button enables only when the campaign is actually ready to launch.

**Misleading UI Risks**

- If the primary action stays enabled with no civ selected, the new layout will still feel clunky because it hides missing prerequisites.
- If map size switches silently reduce the opponent count, the UI needs visible continuity by preserving valid values and snapping invalid ones predictably.
- If the selected-civ summary only shows the civ id, the screen still reads as a tool instead of a polished setup experience.

**Interaction Replay Checklist**

- Add: pick a civ and verify the summary card updates with its name.
- Reorder: change map size after selecting a higher opponent count and verify the opponents value stays valid.
- Remove: cancel out of setup and return to the game-mode chooser.
- Repeat-click: open the civ picker multiple times and confirm only one picker is present.
- Reopen: save a custom civ, return to setup, and verify the new civ remains in the summary/picker flow.

- [ ] **Step 1: Refactor the panel to use `createSetupShell()` and grouped setup sections**

```typescript
const shell = createSetupShell({
  panelId: 'campaign-setup',
  eyebrow: 'Solo Campaign',
  title: 'Build Your Campaign',
  subtitle: 'Choose your civilization, world size, and rival count before your people settle their first city.',
});

const hero = document.createElement('div');
hero.dataset.role = 'setup-hero';
shell.body.appendChild(hero);

const selectedCivSection = createSetupSection({
  title: 'Civilization',
  description: 'Pick the culture you want to lead into the first age.',
  role: 'selected-civ-summary',
});
shell.body.appendChild(selectedCivSection.section);
```

- [ ] **Step 2: Replace the plain `select`-first affordances with visible choice cards where it improves clarity**

```typescript
for (const size of ['small', 'medium', 'large'] as const) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.size = size;
  button.dataset.selected = size === mapSizeField.select.value ? 'true' : 'false';
  button.textContent = size[0].toUpperCase() + size.slice(1);
  button.addEventListener('click', () => {
    mapSizeField.select.value = size;
    refreshOpponentOptions();
    syncMapSizeCards();
  });
  mapSizeSection.content.appendChild(button);
}
```

- [ ] **Step 3: Add a `syncCampaignReadiness()` helper so visible state and start-button availability stay aligned**

```typescript
function syncCampaignReadiness(): void {
  const gameTitle = titleInput.value.trim();
  const selectedDefinition = civDefinitions.find(def => def.id === selectedCivId);

  civSummary.textContent = selectedDefinition
    ? `Leading civilization: ${selectedDefinition.name}`
    : 'No civilization selected yet';

  startButton.disabled = !selectedCivId || !gameTitle;
  startButton.dataset.ready = startButton.disabled ? 'false' : 'true';
}
```

- [ ] **Step 4: Add a regression assertion that the campaign setup stays reachable when the civ picker is dismissed**

```typescript
clickButtonWithText('Choose civilization');
(document.querySelector('[data-action="cancel-civ-select"]') as HTMLButtonElement).click();
expect(document.querySelector('#campaign-setup')).toBeTruthy();
expect(document.querySelector('#civ-select')).toBeNull();
```

- [ ] **Step 5: Run the campaign-setup tests and the rule checker**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/campaign-setup.test.ts
scripts/check-src-rule-violations.sh src/ui/campaign-setup.ts
```

Expected: PASS. The test suite should confirm the new DOM contract and the rule checker should report no `innerHTML` or other UI rule regressions.

- [ ] **Step 6: Commit the refreshed solo screen**

```bash
git add src/ui/campaign-setup.ts tests/ui/campaign-setup.test.ts
git commit -m "feat(ui): redesign solo campaign setup flow"
```

### Task 4: Refresh `civ-select` To Feel Like Part Of The Same Journey

**Files:**
- Modify: `src/ui/civ-select.ts`
- Modify: `tests/ui/civ-select.test.ts`

**Player Truth Table**

Before action: the player opens the civilization picker from solo setup and sees a polished continuation of the same shell, not a detached modal.

Click: the player clicks a civilization card, optionally uses random, opens custom civ creation, or backs out to the campaign screen.

Immediately visible result: the selected card becomes clearly active, the primary action reflects the chosen state, and all civilization entries remain browsable.

**Misleading UI Risks**

- Strong recommendations or styling cannot hide lower-ranked civs; the full roster must remain reachable.
- A random pick that changes internal state without visibly highlighting a card would still feel broken.
- If custom civ creation is visually buried, the redesign may make customization less discoverable.
- If there is no explicit back action, the current dead-end feel survives the redesign.

**Interaction Replay Checklist**

- Add: render a custom civ alongside built-in civs and confirm it appears in the same card list.
- Reorder: pick one civ, then another, and verify only one card remains selected.
- Remove: disable some civs and verify they stay visible but clearly unavailable where appropriate.
- Repeat-click: click the already selected card again and verify selection remains stable.
- Reopen: close the picker through the back action and reopen it from solo setup with the same primary action language.

- [ ] **Step 1: Extend the picker callbacks/options with an optional cancel path and rebuild the panel on top of `createSetupShell()`**

```typescript
export interface CivSelectCallbacks {
  onSelect: (civId: string) => void;
  onCreateCustomCiv?: () => void;
  onCancel?: () => void;
}

const shell = createSetupShell({
  panelId: 'civ-select',
  eyebrow: 'Solo Campaign',
  title: headerText,
  subtitle: 'Each civilization offers a distinct starting rhythm, bonus, and diplomatic personality.',
});

card.dataset.selected = selectedCiv === civ.id ? 'true' : 'false';
card.setAttribute('aria-pressed', selectedCiv === civ.id ? 'true' : 'false');
```

- [ ] **Step 2: Give each civ card clearer structure without hiding any entries and add a secondary action**

```typescript
const summary = document.createElement('div');
summary.dataset.role = 'civ-card-summary';

const flavor = document.createElement('div');
flavor.textContent = civ.bonusDescription;
summary.append(name, bonusName, flavor, traits);
card.append(accent, summary);

const cancelButton = createButton('Back');
cancelButton.dataset.action = 'cancel-civ-select';
cancelButton.addEventListener('click', () => callbacks.onCancel?.());
```

- [ ] **Step 3: Keep all current actions but present them in a more intentional action row**

```typescript
randomButton.textContent = 'Surprise Me';
createCustomButton.textContent = 'Create Custom Civilization';
startButton.textContent = primaryActionText;
startButton.disabled = !selectedCiv;
```

- [ ] **Step 4: Add a regression test that counts the live civ cards so the redesign cannot silently hide part of the catalog**

```typescript
expect(panel.querySelectorAll('.civ-card').length).toBe(
  getPlayableCivDefinitions({ customCivilizations: [customCiv] }).length,
);
```

- [ ] **Step 5: Run civ-select tests and the rule checker**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/civ-select.test.ts tests/ui/campaign-setup.test.ts
scripts/check-src-rule-violations.sh src/ui/civ-select.ts src/ui/campaign-setup.ts
```

Expected: PASS. Tests should confirm the new selection-state markers and custom-civ affordance remain intact.

- [ ] **Step 6: Commit the picker refresh**

```bash
git add src/ui/civ-select.ts tests/ui/civ-select.test.ts src/ui/campaign-setup.ts tests/ui/campaign-setup.test.ts
git commit -m "feat(ui): refresh solo civilization picker"
```

### Task 5: Refresh The Custom Civilization Editor And Final Launcher Wiring

**Files:**
- Modify: `src/ui/custom-civ-panel.ts`
- Modify: `src/main.ts`
- Modify: `tests/ui/custom-civ-panel.test.ts`
- Modify: `tests/ui/campaign-setup.test.ts`

**Player Truth Table**

Before action: the player clicks `Create Custom Civilization` and sees an editor that still feels embedded in the solo setup flow.

Click: the player fills in civilization basics, trait choices, and city names, then saves or cancels.

Immediately visible result: validation messaging remains live, the action bar remains clear, and saving returns the player to the refreshed picker without a jarring presentation change while preserving the selected launcher/setup shell language.

**Misleading UI Risks**

- If the editor looks polished but the save-state messaging is buried, users may think the form is broken.
- If the editor restyle breaks test selectors used by the existing save-flow tests, the regression will hide behind visual work.
- If the save-state copy is visible but the disabled/enabled CTA state is not, the form can still feel broken.

**Interaction Replay Checklist**

- Add: fill the form to completion and verify save enables.
- Reorder: change traits repeatedly and confirm trait-budget feedback stays accurate.
- Remove: cancel out and verify the user returns to the civ picker cleanly.
- Repeat-click: save a custom civ, reopen the editor, and confirm there is still only one live editor.
- Reopen: go back to the game-mode chooser and re-enter solo setup with the refreshed visual flow intact.

- [ ] **Step 1: Rebuild `custom-civ-panel` section layout with shell-compatible groups and stable test hooks**

```typescript
const basicsSection = createSetupSection({
  title: 'Identity',
  description: 'Name your civilization, choose a leader, and set its banner color.',
  role: 'custom-civ-basics',
});

const traitsSection = createSetupSection({
  title: 'Traits',
  description: 'Pick one signature strength and up to two temperament traits.',
  role: 'custom-civ-traits',
});

const cityNamesSection = createSetupSection({
  title: 'City Names',
  description: 'Provide at least six settlement names, one per line.',
  role: 'custom-civ-city-names',
});
```

- [ ] **Step 2: Preserve the current validation model, but make the readiness message and CTA state more obvious**

```typescript
validationMessage.dataset.role = 'custom-civ-validation';
saveButton.disabled = !isDefinitionValid;
saveButton.dataset.ready = saveButton.disabled ? 'false' : 'true';
```

- [ ] **Step 3: Preserve the current solo start behavior when wiring the refreshed flow through `main.ts`**

```typescript
showGameModeSelect(uiLayer, {
  initialTitle: 'New Campaign',
  onChooseSolo: async (title) => {
    const currentSettings = await refreshPersistedSettings();
    const savedCustomCivilizations = currentSettings.customCivilizations ?? [];

    showCampaignSetup(uiLayer, {
      initialTitle: title,
      onStartSolo: (config) => {
        gameState = createNewGame({
          civType: config.civType,
          mapSize: config.mapSize,
          opponentCount: config.opponentCount,
          gameTitle: config.gameTitle,
          settingsOverrides: getPersistedSettingsOverrides(),
          customCivilizations: config.customCivilizations,
        });
        if (persistedSettings?.councilTalkLevel) {
          gameState.settings.councilTalkLevel = persistedSettings.councilTalkLevel;
        }
        startGame();
        showNotification('Your tribe has settled near a river...', 'info');
      },
      onCustomCivilizationsChanged: updatePersistedCustomCivilizations,
      onCancel: () => showGameModeSelection(),
    }, {
      initialCustomCivilizations: savedCustomCivilizations,
    });
  },
  onChooseHotSeat: async (title) => {
    /* preserve current hot-seat branch behavior */
  },
});
```

- [ ] **Step 4: Run the final focused verification set**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/game-mode-select.test.ts tests/ui/campaign-setup.test.ts tests/ui/civ-select.test.ts tests/ui/custom-civ-panel.test.ts
scripts/check-src-rule-violations.sh src/ui/setup-shell.ts src/ui/game-mode-select.ts src/ui/campaign-setup.ts src/ui/civ-select.ts src/ui/custom-civ-panel.ts src/main.ts
```

Expected: PASS. The refreshed solo flow should preserve current behavior while satisfying the new UI contract.

- [ ] **Step 5: Commit the final polish pass**

```bash
git add src/ui/setup-shell.ts src/ui/game-mode-select.ts src/ui/campaign-setup.ts src/ui/civ-select.ts src/ui/custom-civ-panel.ts src/main.ts tests/ui/game-mode-select.test.ts tests/ui/campaign-setup.test.ts tests/ui/civ-select.test.ts tests/ui/custom-civ-panel.test.ts
git commit -m "feat(ui): unify solo setup flow presentation"
```

## Self-Review

**Spec coverage**

- Issue `#93` complained that solo setup looked clunky and visually out of step with the rest of the game. Tasks 2-5 cover the full solo flow presentation, not just the opening screen.
- The current solo flow depends on civilization selection and custom-civ creation. Tasks 3-5 preserve and test those interactive branches.
- The repo requires mirrored UI tests and `check-src-rule-violations.sh` after editing `src/`. Every implementation task includes both.

**Placeholder scan**

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every task includes exact file paths, concrete commands, and code snippets for the intended changes.

**Type consistency**

- The plan keeps the current `SoloSetupConfig` contract and `onStartSolo` callback shape.
- New helpers use consistent `data-role` hooks across the tests and implementation snippets: `setup-surface`, `setup-panel-header`, `setup-actions`, `selected-civ-summary`, `custom-civ-basics`, `custom-civ-traits`, `custom-civ-city-names`, and `cancel-civ-select`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-solo-setup-ui-refresh.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
