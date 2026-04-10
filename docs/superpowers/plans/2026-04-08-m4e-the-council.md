# M4e The Council Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship M4e as five independently mergeable vertical slices that make Conquestoria easier to start, easier to understand, lower-friction to play, richer in late-game ambition, and more expressive through the Council, better turn flow, the remaining M4 late-era scaffold, the rest of the legendary wonder catalog, and identity/personality systems.

**Architecture:** Preserve the current event-driven, serializable `GameState`, but avoid piling all M4e logic into `main.ts` or `advisor-system.ts`. Slice 1 introduces a dedicated Council recommendation engine and panel, plus setup/progress presentation helpers. Slice 2 adds deterministic auto-explore and desktop affordances without breaking mobile-first input. Slice 3 extends the tech tree and wonder prerequisite graph. Slice 4 expands the wonder catalog on the proven M4d framework. Slice 5 layers memory/personality, custom civ creation, naming integrity, and a final consolidation pass on top of the earlier slices.

**Tech Stack:** TypeScript, Vitest, jsdom-backed UI tests where real DOM semantics matter, Canvas 2D, DOM panels, EventBus, IndexedDB/localStorage save serialization

---

## Background And Conventions

Before starting implementation:

- Read `AGENTS.md`
- Read `docs/superpowers/specs/2026-04-08-m4e-the-council-design.md`
- Re-read `docs/superpowers/specs/2026-03-21-conquestoria-game-design.md`
- Re-read `docs/superpowers/specs/2026-03-29-milestone4-deep-strategy-design.md`
- Review the April 8 hotfix constraints around privacy, contact, city discovery, and autosave integrity

Critical rules to preserve:

1. **The Council is not omniscient.** Any recommendation, label, or interruption must be formatted from `state.currentPlayer` knowledge.
2. **Never use `Math.random()`.** Auto-explore, advisor surprise lines, and custom-civ defaults must use deterministic seeds.
3. **No user text through `innerHTML`.** Campaign titles, custom civ names, city names, and council copy must use DOM nodes and `textContent`.
4. **No hidden slice dependencies.** Every slice must be fully playable and mergeable on its own.
5. **Hot-seat safety is mandatory.** Every new UI surface must use `state.currentPlayer`, not a hardcoded player slot.
6. **Save/load safety is mandatory.** New settings, council state, auto-explore flags, naming pools, and custom civ definitions must round-trip through save persistence.
7. **Use the repo wrapper for commands.** All test/build commands below assume `./scripts/run-with-mise.sh yarn ...`.
8. **Worktree cleanup happens only after merge.** After each slice MR merges, confirm the merged commit is reachable from `origin/main`, then remove that slice worktree/branch.
9. **Replacing a live UI surface means deleting the old construction path.** Do not append a second bottom bar, civ picker, or setup flow alongside the existing one. Add a regression that proves the legacy path is gone or delegated.
10. **User-authored gameplay data must normalize into existing runtime types before live use.** Custom civs, campaign titles, and other authored content must be converted into the same runtime contracts the rest of the engine already expects before AI, diplomacy, rendering, or save/load code touches them.

Standard commands:

- Focused tests: `./scripts/run-with-mise.sh yarn test --run tests/path/to/file.test.ts`
- Full suite: `./scripts/run-with-mise.sh yarn test --run`
- Build: `./scripts/run-with-mise.sh yarn build`

Implementation branch / worktree cadence:

- Planning docs stay on `feature/m4e-the-council`
- Slice 1 branch: `feature/m4e-slice1-welcoming-council`
- Slice 2 branch: `feature/m4e-slice2-smoother-turns`
- Slice 3 branch: `feature/m4e-slice3-late-era-foundations`
- Slice 4 branch: `feature/m4e-slice4-more-ambition`
- Slice 5 branch: `feature/m4e-slice5-identity-and-personality`

---

## File Structure

### Shared / Cross-Slice Files

| File | Responsibility |
|------|----------------|
| `src/core/types.ts` | Add M4e settings, Council state, custom civ metadata, and any new events |
| `src/core/game-state.ts` | Initialize new state/settings defaults and new-game setup flow inputs |
| `src/main.ts` | Wire new panels, Council events, input systems, and per-slice feature entry points |
| `src/core/hotseat-events.ts` | Queue Council and M4e notifications for the correct hot-seat viewer |
| `src/storage/save-manager.ts` | Persist M4e state and campaign/custom-civ metadata safely |
| `src/ui/game-shell.ts` | NEW - own the HUD, primary action bar, and shell-level utility buttons so `main.ts` stops hand-building duplicate UI |
| `tests/storage/save-persistence.test.ts` | Round-trip new slice state |
| `tests/ui/game-shell.test.ts` | NEW - prove the live shell exposes one action bar and the expected entry points |

### Slice 1 Files

| File | Responsibility |
|------|----------------|
| `src/systems/council-system.ts` | NEW - compute actionable, privacy-safe Council agenda items and interruptions |
| `src/systems/player-facing-labels.ts` | NEW - format safe city/civ/quest labels and duplicate-name disambiguation |
| `src/systems/victory-progress.ts` | NEW - compute domination/win framing for Council and HUD |
| `src/systems/quest-presentation.ts` | NEW - explain quest origin and hide invalid/misattributed quests |
| `src/ui/council-panel.ts` | NEW - render the Council view and talk-level controls |
| `src/ui/primary-action-bar.ts` | NEW - render the always-available mobile/desktop action bar, including Council access |
| `src/ui/campaign-setup.ts` | NEW - solo campaign setup flow |
| `src/ui/tech-panel.ts` | Redesign the tech tree for readability and “what unlocks what” |
| `src/ui/advisor-system.ts` | Integrate proactive Council interruption flow without leaking secrets |
| `src/ui/city-grid.ts` | Improve grid-view explanation and contextual help |
| `tests/core/hotseat-events.test.ts` | Extend with Council interrupt queuing coverage |
| `tests/systems/council-system.test.ts` | NEW - Council ranking, privacy, naming-trust, and actionability |
| `tests/systems/victory-progress.test.ts` | NEW - domination framing and progress summaries |
| `tests/systems/quest-system.test.ts` | Extend with quest-origin correctness regressions |
| `tests/ui/council-panel.test.ts` | NEW - bucket layout, talk levels, and current-player safety |
| `tests/ui/primary-action-bar.test.ts` | NEW - Council launch affordance stays available on touch/mobile and desktop |
| `tests/ui/campaign-setup.test.ts` | NEW - solo setup flow and campaign-title validation |
| `tests/ui/tech-panel.test.ts` | NEW - redesigned tree readability and track emphasis |
| `tests/ui/helpers/council-fixture.ts` | NEW - deterministic Council UI/system fixtures |

### Slice 2 Files

| File | Responsibility |
|------|----------------|
| `src/systems/auto-explore-system.ts` | NEW - deterministic auto-explore routing and unit state |
| `src/systems/movement-safety.ts` | NEW - evaluate hostile risk and safe exploration candidates |
| `src/input/keyboard-shortcuts.ts` | NEW - desktop shortcut registry |
| `src/ui/context-menu.ts` | NEW - right-click action menu |
| `src/ui/tooltip-layer.ts` | NEW - hover tooltips for yields, controls, and affordances |
| `src/input/mouse-handler.ts` | Add right-click support and hover hooks |
| `src/core/turn-manager.ts` | Tick auto-explore and integrate unit cancellation rules |
| `src/renderer/render-loop.ts` | Preserve privacy during turn transitions and integrate hover hints |
| `src/ui/turn-handoff.ts` | Keep handoff/turn transitions from leaking hidden information |
| `src/main.ts` | Show auto-explore state in selected-unit info and route cancel actions |
| `tests/systems/helpers/auto-explore-fixture.ts` | NEW - deterministic pathing/risk states for auto-explore tests |
| `tests/ui/helpers/desktop-controls-fixture.ts` | NEW - jsdom fixtures for shortcuts, context menus, and tooltips |
| `tests/systems/auto-explore-system.test.ts` | NEW - pathing, cancellation, wrap, and safety coverage |
| `tests/ui/desktop-controls.test.ts` | NEW - shortcuts, context menu, and tooltip flow |
| `tests/ui/fog-leak.test.ts` | Extend with turn-transition flashing regressions |
| `tests/core/turn-manager.test.ts` | Add auto-explore turn processing coverage |

### Slice 3 Files

| File | Responsibility |
|------|----------------|
| `src/systems/tech-definitions.ts` | Add the remaining late-era tech nodes and prerequisite graph |
| `src/systems/tech-system.ts` | Keep available-tech logic coherent with the expanded graph |
| `src/systems/legendary-wonder-definitions.ts` | Add missing prerequisite references for the remaining catalog |
| `src/ui/tech-panel.ts` | Render late-era readability in the redesigned tree |
| `tests/systems/tech-definitions.test.ts` | Add late-era graph validation and unlock coverage |
| `tests/systems/tech-system.test.ts` | Add progression coverage for late-era prerequisites |
| `tests/ui/tech-panel.test.ts` | Extend with readable late-era grouping tests |

### Slice 4 Files

| File | Responsibility |
|------|----------------|
| `src/systems/approved-legendary-wonder-roster.ts` | NEW - mirror the spec appendix into one code-owned roster module for exact catalog tests |
| `src/systems/legendary-wonder-definitions.ts` | Add the remaining M4 legendary wonders |
| `src/systems/legendary-wonder-system.ts` | Support any additional quest-step patterns and panel metadata |
| `src/ui/wonder-panel.ts` | Keep the expanded catalog understandable and non-overwhelming |
| `src/ui/council-panel.ts` | Surface wonder opportunities without flooding the player |
| `src/ai/basic-ai.ts` | Handle the expanded wonder catalog sanely |
| `tests/systems/legendary-wonder-system.test.ts` | Add new wonder-pattern regressions |
| `tests/ui/wonder-panel.test.ts` | Extend with discoverability/race-clarity coverage |
| `tests/ui/council-panel.test.ts` | Extend with “More Ambition” recommendation coverage |

### Slice 5 Files

| File | Responsibility |
|------|----------------|
| `src/systems/council-memory.ts` | NEW - store major recommendations, outcomes, and advisor recall |
| `src/ui/council-panel.ts` | Render lobbying, disagreements, and memory-backed callbacks |
| `src/ui/advisor-system.ts` | Emit memory-based reactive lines at bounded cadence |
| `src/systems/civ-registry.ts` | NEW - resolve built-in and custom civ definitions from settings/state at runtime |
| `src/systems/custom-civ-system.ts` | NEW - validate and normalize medium-depth custom civ definitions |
| `src/ui/custom-civ-panel.ts` | NEW - create/edit custom civilizations |
| `src/systems/city-name-system.ts` | NEW - enforce naming policy and uniqueness rules |
| `src/core/game-state.ts` | Load custom civ definitions into new solo/hot-seat campaigns |
| `src/storage/save-manager.ts` | Persist custom civ registries in app settings and save slots |
| `src/systems/civ-definitions.ts` | Add Wakanda, Avalon, and plug in custom-civ support |
| `src/ui/civ-select.ts` | Surface Wakanda/Avalon and custom civs in setup/selection |
| `src/ui/campaign-setup.ts` | Pass saved custom civ registries into solo setup selection flow |
| `src/ui/hotseat-setup.ts` | Pass saved custom civ registries into hot-seat setup selection flow |
| `tests/systems/council-memory.test.ts` | NEW - memory recall, privacy, and disagreement cadence |
| `tests/systems/civ-registry.test.ts` | NEW - runtime custom-civ resolution after save/load |
| `tests/ui/custom-civ-panel.test.ts` | NEW - creator UX, validation, and trait-budget coverage |
| `tests/ui/civ-select.test.ts` | NEW - real civ picker shows custom civs safely and allows selection |
| `tests/ui/hotseat-setup.test.ts` | NEW - hot-seat setup can surface the saved custom civ registry without leaks or missing cards |
| `tests/systems/city-name-system.test.ts` | NEW - fantasy naming correctness and uniqueness |
| `tests/systems/civ-definitions.test.ts` | Extend with Wakanda/Avalon/custom-civ coverage |
| `tests/storage/save-manager.test.ts` | Add custom civ settings persistence and migration coverage |
| `tests/integration/m4e-acceptance.test.ts` | NEW - final milestone-wide acceptance coverage |

---

## Slice 1: The Welcoming Council

### Task 1: Add Council State, Types, Fixtures, And Failing Tests

**Files:**
- Create: `src/systems/council-system.ts`
- Create: `src/systems/player-facing-labels.ts`
- Create: `src/systems/victory-progress.ts`
- Create: `tests/ui/helpers/council-fixture.ts`
- Create: `tests/systems/council-system.test.ts`
- Create: `tests/systems/victory-progress.test.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/game-state.ts`

- [ ] **Step 1: Add failing Council and victory-progress tests**

Create `tests/systems/council-system.test.ts` and `tests/systems/victory-progress.test.ts` with coverage for:

```typescript
it('returns actionable do-now, soon, and to-win cards without leaking hidden facts', () => {
  const { state } = makeCouncilFixture({ metForeignCiv: true, discoveredForeignCity: false });
  const agenda = buildCouncilAgenda(state, 'player');

  expect(agenda.doNow[0].why.length).toBeGreaterThan(0);
  expect(JSON.stringify(agenda)).not.toContain('Rome');
  expect(JSON.stringify(agenda)).not.toContain('Atlantis');
});

it('disambiguates duplicate city names in council copy', () => {
  const label = formatCityReference('Rome', { ownerName: 'Narnia', duplicateCount: 2 });
  expect(label).toContain('Rome');
  expect(label).toContain('Narnia');
});

it('computes domination framing from current visible empire state', () => {
  const progress = getVictoryProgressSummary(state, 'player');
  expect(progress.toWin.summary).toContain('cities');
  expect(progress.domination.visibleRivals).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 2: Run focused tests to confirm they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/council-system.test.ts tests/systems/victory-progress.test.ts
```

Expected: FAIL with missing modules / exports.

- [ ] **Step 3: Add concrete types and defaults**

In `src/core/types.ts` and `src/core/game-state.ts`, add:

```typescript
export type CouncilTalkLevel = 'quiet' | 'normal' | 'chatty' | 'chaos';

export interface CouncilCard {
  id: string;
  advisor: AdvisorType;
  bucket: 'do-now' | 'soon' | 'to-win' | 'drama';
  title: string;
  summary: string;
  why: string;
  priority: number;
  actionLabel?: string;
}

export interface CouncilAgenda {
  doNow: CouncilCard[];
  soon: CouncilCard[];
  toWin: CouncilCard[];
  drama: CouncilCard[];
}

export interface CouncilInterrupt {
  civId: string;
  advisor: AdvisorType;
  summary: string;
  sourceCardId: string;
}

export interface CouncilState {
  talkLevel: CouncilTalkLevel;
  lastShownTurn: number;
}

export interface GameSettings {
  mapSize: 'small' | 'medium' | 'large';
  soundEnabled: boolean;
  musicEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  tutorialEnabled: boolean;
  advisorsEnabled: Record<AdvisorType, boolean>;
  councilTalkLevel: CouncilTalkLevel;
}
```

Do not duplicate settings defaults in multiple constructors. Add one shared helper in `src/core/game-state.ts` and route both `createNewGame(...)` and `createHotSeatGame(...)` through it:

```typescript
export function createDefaultSettings(
  actualSize: 'small' | 'medium' | 'large',
  overrides: Partial<GameSettings> = {},
): GameSettings {
  return {
    mapSize: actualSize,
    soundEnabled: true,
    musicEnabled: true,
    musicVolume: 0.5,
    sfxVolume: 0.7,
    tutorialEnabled: true,
    advisorsEnabled: {
      builder: true,
      explorer: true,
      chancellor: true,
      warchief: true,
      treasurer: true,
      scholar: true,
      spymaster: true,
      artisan: true,
    },
    councilTalkLevel: 'normal',
    ...overrides,
  };
}
```

Every later slice that loads saved settings or app-level preferences must call `createDefaultSettings(...)` instead of re-listing defaults by hand. This is the single source of truth for `councilTalkLevel`, future custom-civ registries, and any later M4e settings.

- [ ] **Step 4: Add minimal agenda and label helpers**

In `src/systems/council-system.ts`, `src/systems/player-facing-labels.ts`, and `src/systems/victory-progress.ts`, add the first pass:

```typescript
export function buildCouncilAgenda(state: GameState, civId: string): CouncilAgenda {
  return {
    doNow: [],
    soon: [],
    toWin: [],
    drama: [],
  };
}

export function getCouncilInterrupt(state: GameState, civId: string, talkLevel: CouncilTalkLevel): CouncilInterrupt | null {
  return null;
}

export function getVictoryProgressSummary(state: GameState, civId: string): {
  toWin: { summary: string };
  domination: { visibleRivals: number };
} {
  return {
    toWin: { summary: '' },
    domination: { visibleRivals: 0 },
  };
}

export function formatCityReference(rawName: string, opts: { ownerName?: string; duplicateCount?: number }): string {
  if ((opts.duplicateCount ?? 0) > 1 && opts.ownerName) {
    return `${rawName} (${opts.ownerName})`;
  }
  return rawName;
}
```

- [ ] **Step 5: Re-run focused tests until they pass**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/council-system.test.ts tests/systems/victory-progress.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the slice-1 foundation**

```bash
git add src/core/types.ts src/core/game-state.ts src/systems/council-system.ts src/systems/player-facing-labels.ts src/systems/victory-progress.ts tests/ui/helpers/council-fixture.ts tests/systems/council-system.test.ts tests/systems/victory-progress.test.ts
git commit -m "feat(m4e): add council agenda foundations"
```

### Task 2: Build The Council Panel, Talk Levels, And Proactive Interruptions

**Files:**
- Create: `src/ui/council-panel.ts`
- Create: `src/ui/primary-action-bar.ts`
- Create: `src/ui/game-shell.ts`
- Modify: `src/ui/advisor-system.ts`
- Modify: `src/main.ts`
- Modify: `src/core/hotseat-events.ts`
- Create: `tests/ui/council-panel.test.ts`
- Create: `tests/ui/primary-action-bar.test.ts`
- Create: `tests/ui/game-shell.test.ts`
- Modify: `tests/ui/helpers/council-fixture.ts`
- Modify: `tests/ui/advisor-system.test.ts`
- Modify: `tests/storage/save-manager.test.ts`
- Modify: `tests/core/hotseat-events.test.ts`
- Modify: `tests/systems/council-system.test.ts`
- Modify: `src/systems/council-system.ts`

- [ ] **Step 1: Add failing real-DOM panel, shell, and persistence tests**

Create `tests/ui/council-panel.test.ts`:

```typescript
/** @vitest-environment jsdom */
it('renders do-now, soon, to-win, and drama buckets with talk-level controls', () => {
  const { state, container } = makeCouncilFixture();
  const panel = createCouncilPanel(container, state, {
    onClose: () => {},
    onTalkLevelChange: () => {},
  });

  expect(panel.textContent).toContain('Do Now');
  expect(panel.textContent).toContain('Soon');
  expect(panel.textContent).toContain('To Win');
  expect(panel.textContent).toContain('Council Drama');
  expect(panel.textContent).toContain('quiet');
  expect(panel.textContent).toContain('chaos');
});

it('does not reveal undiscovered city names in the panel or interruptions', () => {
  const { state, container } = makeCouncilFixture({ discoveredForeignCity: false });
  const panel = createCouncilPanel(container, state, { onClose: () => {}, onTalkLevelChange: () => {} });
  expect(panel.textContent).not.toContain('Rome');
});

it('invokes the talk-level callback when the player changes the council mode', () => {
  const onTalkLevelChange = vi.fn();
  const { state, container } = makeCouncilFixture();
  const panel = createCouncilPanel(container, state, { onClose: () => {}, onTalkLevelChange });
  (panel.querySelector('[data-talk-level=\"chaos\"]') as HTMLButtonElement).click();
  expect(onTalkLevelChange).toHaveBeenCalledWith('chaos');
});

it('queues council interruptions for the right hot-seat viewer instead of broadcasting them immediately', () => {
  const { state } = makeCouncilFixture({ hotSeat: true, currentPlayer: 'player-2' });
  const interrupt = getCouncilInterrupt(state, 'player-2', 'normal');
  expect(interrupt?.civId).toBe('player-2');
});
```

Create `tests/ui/primary-action-bar.test.ts`:

```typescript
/** @vitest-environment jsdom */
it('renders a Council button in the primary action bar and wires it for touch-safe opening', () => {
  const onOpenCouncil = vi.fn();
  const bar = createPrimaryActionBar({
    onOpenCouncil,
    onOpenTech: () => {},
    onOpenCity: () => {},
    onOpenEspionage: () => {},
    onOpenDiplomacy: () => {},
    onOpenMarketplace: () => {},
    onEndTurn: () => {},
  });

  const councilButton = Array.from(bar.querySelectorAll('button')).find(button => button.textContent?.includes('Council'));
  expect(councilButton).toBeTruthy();
  councilButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onOpenCouncil).toHaveBeenCalledTimes(1);
});
```

Create `tests/ui/game-shell.test.ts`:

```typescript
/** @vitest-environment jsdom */
it('creates exactly one bottom action bar and exposes Council in the live shell', () => {
  createGameShell(document.body, {
    onOpenCouncil: () => {},
    onOpenTech: () => {},
    onOpenCity: () => {},
    onOpenEspionage: () => {},
    onOpenDiplomacy: () => {},
    onOpenMarketplace: () => {},
    onEndTurn: () => {},
    onNextUnit: () => {},
    onOpenNotificationLog: () => {},
    onToggleIconLegend: () => {},
  });
  const shell = createGameShell(document.body, {
    onOpenCouncil: () => {},
    onOpenTech: () => {},
    onOpenCity: () => {},
    onOpenEspionage: () => {},
    onOpenDiplomacy: () => {},
    onOpenMarketplace: () => {},
    onEndTurn: () => {},
    onNextUnit: () => {},
    onOpenNotificationLog: () => {},
    onToggleIconLegend: () => {},
  });

  expect(document.querySelectorAll('#bottom-bar')).toHaveLength(1);
  expect(document.querySelectorAll('#hud')).toHaveLength(1);
  expect(shell.textContent).toContain('Council');
  expect(shell.textContent).toContain('End Turn');
  expect(shell.querySelector('#btn-next-unit')).toBeTruthy();
});
```

Extend `tests/systems/council-system.test.ts` with talk-level behavior:

```typescript
it('suppresses low-priority interruptions on quiet but emits them on chaos', () => {
  const { state } = makeCouncilFixture({ lowPriorityFoodWarning: true });
  expect(getCouncilInterrupt(state, 'player', 'quiet')).toBeNull();
  expect(getCouncilInterrupt(state, 'player', 'chaos')?.sourceCardId).toBe('food-warning');
});
```

Extend `tests/storage/save-manager.test.ts`:

```typescript
it('persists council talk level through settings save/load', async () => {
  const settings = createDefaultSettings('small', { councilTalkLevel: 'chaos' });
  await saveSettings(settings);
  const loaded = await loadSettings();
  expect(loaded?.councilTalkLevel).toBe('chaos');
});
```

- [ ] **Step 2: Run focused tests to confirm red state**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/council-panel.test.ts tests/ui/primary-action-bar.test.ts tests/ui/game-shell.test.ts tests/ui/advisor-system.test.ts tests/storage/save-manager.test.ts tests/core/hotseat-events.test.ts tests/systems/council-system.test.ts
```

Expected: FAIL with missing panel / action bar / missing game shell / missing Council interrupt flow / missing talk-level persistence wiring.

- [ ] **Step 3: Implement the Council panel, shell extraction, and action bar with DOM-safe rendering**

Create `src/ui/council-panel.ts`, `src/ui/primary-action-bar.ts`, and `src/ui/game-shell.ts`:

```typescript
export function createCouncilPanel(container: HTMLElement, state: GameState, callbacks: CouncilPanelCallbacks): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'council-panel';

  const agenda = buildCouncilAgenda(state, state.currentPlayer);
  const talkLevelBar = document.createElement('div');
  for (const level of ['quiet', 'normal', 'chatty', 'chaos'] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.talkLevel = level;
    button.textContent = level;
    button.addEventListener('click', () => callbacks.onTalkLevelChange(level));
    talkLevelBar.appendChild(button);
  }
  panel.appendChild(talkLevelBar);

  for (const section of ['doNow', 'soon', 'toWin', 'drama'] as const) {
    const block = document.createElement('section');
    block.dataset.section = section;
    const heading = document.createElement('h2');
    heading.textContent = section === 'doNow' ? 'Do Now' : section === 'toWin' ? 'To Win' : section === 'drama' ? 'Council Drama' : 'Soon';
    block.appendChild(heading);
    for (const card of agenda[section]) {
      const article = document.createElement('article');
      const title = document.createElement('strong');
      title.textContent = card.title;
      const summary = document.createElement('p');
      summary.textContent = card.summary;
      const why = document.createElement('p');
      why.textContent = `Why: ${card.why}`;
      article.append(title, summary, why);
      block.appendChild(article);
    }
    panel.appendChild(block);
  }

  container.appendChild(panel);
  return panel;
}

export interface PrimaryActionCallbacks {
  onOpenCouncil: () => void;
  onOpenTech: () => void;
  onOpenCity: () => void;
  onOpenEspionage: () => void;
  onOpenDiplomacy: () => void;
  onOpenMarketplace: () => void;
  onEndTurn: () => void;
}

export function createPrimaryActionBar(callbacks: PrimaryActionCallbacks): HTMLElement {
  const bar = document.createElement('div');
  bar.id = 'bottom-bar';
  bar.append(
    makePrimaryActionButton('Council', '👑', callbacks.onOpenCouncil),
    makePrimaryActionButton('Tech', '🔬', callbacks.onOpenTech),
    makePrimaryActionButton('City', '🏛️', callbacks.onOpenCity),
    makePrimaryActionButton('Intel', '🕵️', callbacks.onOpenEspionage),
    makePrimaryActionButton('Diplo', '🤝', callbacks.onOpenDiplomacy),
    makePrimaryActionButton('Trade', '💰', callbacks.onOpenMarketplace),
    makePrimaryActionButton('End Turn', '⏭️', callbacks.onEndTurn),
  );
  return bar;
}

function makePrimaryActionButton(label: string, icon: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `${icon} ${label}`;
  button.addEventListener('click', onClick);
  return button;
}

export interface GameShellCallbacks extends PrimaryActionCallbacks {
  onNextUnit: () => void;
  onOpenNotificationLog: () => void;
  onToggleIconLegend: () => void;
}

export function createGameShell(container: HTMLElement, callbacks: GameShellCallbacks): HTMLElement {
  container.querySelector('#game-shell')?.remove();
  const shell = document.createElement('div');
  shell.id = 'game-shell';

  const hud = document.createElement('div');
  hud.id = 'hud';
  shell.appendChild(hud);

  shell.appendChild(createPrimaryActionBar(callbacks));
  shell.appendChild(makeShellIconButton('btn-next-unit', '⏩', 'Select next unmoved unit', callbacks.onNextUnit));
  shell.appendChild(makeShellIconButton('btn-notif-log', '📜', 'View message log', callbacks.onOpenNotificationLog));
  shell.appendChild(makeShellIconButton('btn-icon-legend', '🗺️', 'Toggle icon legend', callbacks.onToggleIconLegend));

  container.appendChild(shell);
  return shell;
}

function makeShellIconButton(id: string, label: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = label;
  button.title = title;
  button.addEventListener('click', onClick);
  return button;
}
```

- [ ] **Step 4: Integrate talk-level state and proactive interruption routing**

Modify `src/ui/advisor-system.ts` and `src/main.ts`:

```typescript
const INTERRUPT_PRIORITY_BY_TALK_LEVEL: Record<CouncilTalkLevel, number> = {
  quiet: 90,
  normal: 70,
  chatty: 50,
  chaos: 35,
};

const talkLevel = state.settings.councilTalkLevel ?? 'normal';
const interrupt = getCouncilInterrupt(state, state.currentPlayer, talkLevel);
if (interrupt) {
  this.bus.emit('council:interrupt', interrupt);
}
```

In `main.ts`, remove the inline HUD block and the inline `const bottomBar = document.createElement('div')` construction from `createUI()` entirely. Do not leave the legacy `#hud` or `#bottom-bar` paths in place. Replace them with:

```typescript
createGameShell(uiLayer, {
  onOpenCouncil: () => togglePanel('council'),
  onOpenTech: () => togglePanel('tech'),
  onOpenCity: () => togglePanel('city'),
  onOpenEspionage: () => togglePanel('espionage'),
  onOpenDiplomacy: () => togglePanel('diplomacy'),
  onOpenMarketplace: () => togglePanel('marketplace'),
  onEndTurn: () => endTurn(),
  onNextUnit: () => selectNextUnit(),
  onOpenNotificationLog: () => toggleNotificationLog(),
  onToggleIconLegend: () => toggleIconLegend(),
});

bus.on('council:interrupt', data => {
  if (gameState.hotSeat && gameState.pendingEvents) {
    collectEvent(gameState.pendingEvents, data.civId, { type: 'council:interrupt', message: data.summary, turn: gameState.turn });
  }
  if (data.civId !== gameState.currentPlayer) return;
  showNotification(data.summary, 'info');
});
```

Extend `togglePanel(panel)` so it removes `#council-panel` with the other panels and creates `createCouncilPanel(...)` when `panel === 'council'`.

When the player changes talk level in the Council panel, update both the live state and app-level settings:

```typescript
async function updateCouncilTalkLevel(nextLevel: CouncilTalkLevel): Promise<void> {
  gameState.settings = createDefaultSettings(gameState.settings.mapSize, {
    ...gameState.settings,
    councilTalkLevel: nextLevel,
  });
  await saveSettings(gameState.settings);
}
```

Add a hot-seat regression in `tests/core/hotseat-events.test.ts` that proves a `player-2` Council interruption is queued for `player-2` and not shown during `player-1`’s live view.

- [ ] **Step 5: Re-run focused tests until green**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/council-panel.test.ts tests/ui/primary-action-bar.test.ts tests/ui/game-shell.test.ts tests/ui/advisor-system.test.ts tests/storage/save-manager.test.ts tests/core/hotseat-events.test.ts tests/systems/council-system.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the Council UI**

```bash
git add src/systems/council-system.ts src/ui/council-panel.ts src/ui/primary-action-bar.ts src/ui/game-shell.ts src/ui/advisor-system.ts src/main.ts src/core/hotseat-events.ts tests/ui/helpers/council-fixture.ts tests/ui/council-panel.test.ts tests/ui/primary-action-bar.test.ts tests/ui/game-shell.test.ts tests/ui/advisor-system.test.ts tests/storage/save-manager.test.ts tests/core/hotseat-events.test.ts tests/systems/council-system.test.ts
git commit -m "feat(m4e): add council panel and interruptions"
```

### Task 3: Replace Solo New-Game Setup With An Intentional Campaign Setup Flow

**Files:**
- Create: `src/ui/campaign-setup.ts`
- Modify: `src/main.ts`
- Modify: `src/core/game-state.ts`
- Modify: `src/core/types.ts`
- Create: `tests/ui/campaign-setup.test.ts`
- Modify: `tests/core/game-state.test.ts`
- Modify: `tests/storage/save-manager.test.ts`

- [ ] **Step 1: Add failing setup-flow tests**

Create `tests/ui/campaign-setup.test.ts`:

```typescript
/** @vitest-environment jsdom */
it('requires map size, civ selection, opponent count, and campaign title before starting a solo game', () => {
  const container = document.createElement('div');
  const onStart = vi.fn();
  showCampaignSetup(container, { onStartSolo: onStart, onCancel: () => {} });

  expect(container.textContent).toContain('Campaign title');
  expect(container.textContent).toContain('Map size');
  expect(container.textContent).toContain('Opponents');
});

it('passes the chosen title into createNewGame', () => {
  const state = createNewGame({
    civType: 'rome',
    seed: 'seed-1',
    mapSize: 'medium',
    opponentCount: 3,
    gameTitle: 'Wife Test Campaign',
  });
  expect(state.gameTitle).toBe('Wife Test Campaign');
  expect(state.settings.mapSize).toBe('medium');
  expect(Object.keys(state.civilizations)).toHaveLength(4);
});

it('can seed a new campaign from persisted app settings without re-listing defaults', () => {
  const state = createNewGame({
    civType: 'rome',
    mapSize: 'small',
    opponentCount: 1,
    gameTitle: 'Quiet Council',
    settingsOverrides: {
      councilTalkLevel: 'quiet',
    },
  });
  expect(state.settings.councilTalkLevel).toBe('quiet');
});
```

- [ ] **Step 2: Run focused tests to verify they fail**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/campaign-setup.test.ts tests/core/game-state.test.ts tests/storage/save-manager.test.ts
```

Expected: FAIL because solo setup still uses `showGameModeSelection()`.

- [ ] **Step 3: Implement a dedicated campaign setup panel**

Add the shared setup contract to `src/core/types.ts` and import it into `src/ui/campaign-setup.ts`:

```typescript
export interface SoloSetupConfig {
  civId: string;
  mapSize: 'small' | 'medium' | 'large';
  opponentCount: number;
  gameTitle: string;
  settingsOverrides?: Partial<GameSettings>;
  seed?: string;
}
```

Then implement `src/ui/campaign-setup.ts` around that shared type. Render map-size cards, opponent count, a civ-picker launch button with `data-action="choose-civ"`, and a required title field using DOM nodes instead of a raw `innerHTML` form.

- [ ] **Step 4: Wire `main.ts` and `createNewGame` to the new flow**

Replace the current solo branch in `showGameModeSelection()` and refactor `createNewGame` to accept a real config object instead of four positional optionals:

```typescript
const storedSettings = await loadSettings();
const settingsOverrides = storedSettings
  ? {
      soundEnabled: storedSettings.soundEnabled,
      musicEnabled: storedSettings.musicEnabled,
      musicVolume: storedSettings.musicVolume,
      sfxVolume: storedSettings.sfxVolume,
      tutorialEnabled: storedSettings.tutorialEnabled,
      advisorsEnabled: storedSettings.advisorsEnabled,
      councilTalkLevel: storedSettings.councilTalkLevel,
    }
  : {};

showCampaignSetup(uiLayer, {
  onStartSolo: (config) => {
    gameState = createNewGame({
      civType: config.civId,
      mapSize: config.mapSize,
      opponentCount: config.opponentCount,
      gameTitle: config.gameTitle,
      settingsOverrides,
    });
    startGame();
  },
  onCancel: () => showGameModeSelection(),
});
```

In `src/core/game-state.ts`, replace the current fixed-2-civ solo setup with:

```typescript
export function createNewGame(config: SoloSetupConfig): GameState

const playerCount = 1 + config.opponentCount;
const startPositions = findStartPositions(map, playerCount);
const civSelectRng = createRng((config.seed ?? gameSeed) + '-civ-select');
const aiCivPool = [...CIV_DEFINITIONS.filter(c => c.id !== config.civId)];
for (let i = aiCivPool.length - 1; i > 0; i--) {
  const j = Math.floor(civSelectRng() * (i + 1));
  [aiCivPool[i], aiCivPool[j]] = [aiCivPool[j], aiCivPool[i]];
}
const aiCivDefs = aiCivPool.slice(0, config.opponentCount);
```

Then create `ai-1`, `ai-2`, and so on for the requested count, bounded by `MAP_DIMENSIONS[config.mapSize].maxPlayers - 1`.

When building the returned state, do not hand-build the settings object. Call:

```typescript
settings: createDefaultSettings(config.mapSize, config.settingsOverrides),
```

Do not pass a previously saved `mapSize` override into `createDefaultSettings(...)`. The player’s new campaign choice must win over old app settings.

Extract title validation into one concrete helper in `main.ts`:

```typescript
function requireCampaignTitle(input: HTMLInputElement): string | null {
  const title = input.value.trim();
  if (!title) {
    showNotification('Campaign title is required', 'warning');
    return null;
  }
  return title;
}
```

- [ ] **Step 5: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/campaign-setup.test.ts tests/core/game-state.test.ts tests/storage/save-manager.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the setup flow**

```bash
git add src/ui/campaign-setup.ts src/main.ts src/core/types.ts src/core/game-state.ts tests/ui/campaign-setup.test.ts tests/core/game-state.test.ts tests/storage/save-manager.test.ts
git commit -m "feat(m4e): add solo campaign setup flow"
```

### Task 4: Redesign The Tech Tree For Readability And Late-Era Readiness

**Files:**
- Modify: `src/ui/tech-panel.ts`
- Create: `tests/ui/tech-panel.test.ts`
- Modify: `tests/systems/tech-system.test.ts`

- [ ] **Step 1: Add failing tech-panel tests**

Create `tests/ui/tech-panel.test.ts`:

```typescript
/** @vitest-environment jsdom */
it('groups techs by readable tracks and emphasizes current / next relevant research', () => {
  const panel = createTechPanel(document.body, state, { onStartResearch: () => {}, onClose: () => {} });
  expect(panel.textContent).toContain('Research');
  expect(panel.querySelectorAll('.tech-track').length).toBeGreaterThan(3);
  expect(panel.querySelector('[data-state="current"]')).toBeTruthy();
  expect(panel.querySelector('[data-state="available"]')).toBeTruthy();
});

it('remains usable without horizontal-strip scanning', () => {
  const panel = createTechPanel(document.body, state, { onStartResearch: () => {}, onClose: () => {} });
  expect(panel.querySelector('[data-layout="tech-tree-grid"]')).toBeTruthy();
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/tech-panel.test.ts tests/systems/tech-system.test.ts
```

Expected: FAIL because current panel is a long vertical strip without explicit state emphasis.

- [ ] **Step 3: Refactor the panel to use grouped track sections and explicit state attributes**

In `src/ui/tech-panel.ts`, add:

```typescript
trackBlock.className = 'tech-track';
trackBlock.dataset.track = track;
panel.dataset.layout = 'tech-tree-grid';
item.dataset.state = isCompleted ? 'completed' : isCurrent ? 'current' : isAvailable ? 'available' : 'locked';
```

Also add a compact “why research this next” summary using existing unlock metadata.

- [ ] **Step 4: Add readability regression assertions**

In `tests/systems/tech-system.test.ts`, assert that the panel-facing availability logic still returns deterministic current/available techs after the UI refactor:

```typescript
expect(getAvailableTechs(state.civilizations.player.techState).map(t => t.id)).toContain('pottery');
```

- [ ] **Step 5: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/tech-panel.test.ts tests/systems/tech-system.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the tech redesign**

```bash
git add src/ui/tech-panel.ts tests/ui/tech-panel.test.ts tests/systems/tech-system.test.ts
git commit -m "feat(m4e): redesign the tech tree panel"
```

### Task 5: Finish Slice 1 Guidance Clarity, Privacy, And Release Gate

**Files:**
- Create: `src/systems/quest-presentation.ts`
- Modify: `src/systems/quest-system.ts`
- Modify: `src/ui/city-grid.ts`
- Modify: `src/ui/council-panel.ts`
- Modify: `tests/systems/quest-system.test.ts`
- Modify: `tests/ui/council-panel.test.ts`
- Create: `tests/integration/m4e-council-guidance.test.ts`

- [ ] **Step 1: Add failing quest-origin, grid-help, and guidance-quality tests**

Create `tests/integration/m4e-council-guidance.test.ts`:

```typescript
it('answers what to do next and why without leaking hidden cities or civs', () => {
  const { state, container } = makeCouncilFixture({ discoveredForeignCity: false, duplicateCityNames: true });
  const panel = createCouncilPanel(container, state, { onClose: () => {}, onTalkLevelChange: () => {} });
  expect(panel.textContent).toContain('Do Now');
  expect(panel.textContent).toContain('Why');
  expect(panel.textContent).not.toContain('Rome');
});
```

Extend `tests/systems/quest-system.test.ts` to prove:

```typescript
expect(getQuestOriginLabel(state, quest, 'player')).toContain('city-state');
expect(isQuestVisibleToPlayer(state, quest, 'player')).toBe(false);

it('keeps city-issued quest origin generic until the issuing city is actually discovered', () => {
  expect(getQuestOriginLabel(state, undiscoveredCityQuest, 'player')).toBe('foreign city');
  expect(getQuestIssuedMessageForPlayer(state, 'player', 'Unknown city-state', undiscoveredCityQuest)).not.toContain('Rome');
});
```

- [ ] **Step 2: Run the Slice 1 focused suite**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/council-system.test.ts tests/systems/victory-progress.test.ts tests/systems/quest-system.test.ts tests/ui/council-panel.test.ts tests/ui/primary-action-bar.test.ts tests/ui/game-shell.test.ts tests/ui/campaign-setup.test.ts tests/ui/tech-panel.test.ts tests/core/hotseat-events.test.ts tests/storage/save-manager.test.ts tests/integration/m4e-council-guidance.test.ts tests/storage/save-persistence.test.ts
```

Expected: FAIL until quest-origin and grid-help wiring is complete.

- [ ] **Step 3: Implement quest-origin presentation and grid-view explanation**

Add `src/systems/quest-presentation.ts`:

```typescript
export function getQuestOriginLabel(state: GameState, quest: Quest, viewerId: string): string {
  if (quest.issuerType === 'minor-civ') {
    const minorCivId = quest.target.type === 'trade_route' ? quest.target.minorCivId : quest.minorCivId;
    if (!minorCivId) return 'city-state';
    return hasDiscoveredMinorCiv(state, viewerId, minorCivId) ? 'discovered city-state' : 'city-state';
  }
  if (quest.issuerType === 'city' && quest.cityId) {
    if (!hasDiscoveredCity(state, viewerId, quest.cityId)) return 'foreign city';
    const city = state.cities[quest.cityId];
    if (!city) return 'unknown source';
    const duplicateCount = Object.values(state.cities).filter(other => other.name === city.name).length;
    const ownerName = state.civilizations[city.owner]?.name;
    return formatCityReference(city.name, { ownerName, duplicateCount });
  }
  return 'unknown source';
}
```

Update `city-grid.ts`, `council-panel.ts`, and any Slice 1 quest rows/notifications so they render quest origin through `getQuestOriginLabel(...)` and render quest body through `getQuestDescriptionForPlayer(...)`. Do not read raw `quest.description` directly from any player-facing Slice 1 surface.

- [ ] **Step 4: Run full slice verification**

```bash
./scripts/run-with-mise.sh yarn test --run
./scripts/run-with-mise.sh yarn build
```

Expected: both PASS.

- [ ] **Step 5: Commit, push, open MR, merge, and clean up after merge**

```bash
git add src/systems/quest-presentation.ts src/systems/quest-system.ts src/ui/city-grid.ts src/ui/council-panel.ts tests/systems/quest-system.test.ts tests/ui/council-panel.test.ts tests/integration/m4e-council-guidance.test.ts
git commit -m "feat(m4e): finish slice 1 welcoming council"
git push origin feature/m4e-slice1-welcoming-council
```

After merge:

```bash
git fetch origin
git merge-base --is-ancestor <slice-1-head> origin/main
git worktree remove .worktrees/feature-m4e-slice1-welcoming-council
git branch -d feature/m4e-slice1-welcoming-council
```

---

## Slice 2: Smoother Turns

### Task 6: Add Deterministic Auto-Explore With Safety Guards

**Files:**
- Create: `src/systems/auto-explore-system.ts`
- Create: `src/systems/movement-safety.ts`
- Create: `tests/systems/helpers/auto-explore-fixture.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/turn-manager.ts`
- Create: `tests/systems/auto-explore-system.test.ts`
- Modify: `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Add failing auto-explore tests**

Create `tests/systems/helpers/auto-explore-fixture.ts` and `tests/systems/auto-explore-system.test.ts`:

```typescript
it('prefers unexplored safe tiles and avoids visible hostile attack range when alternatives exist', () => {
  const { state, unitId } = makeAutoExploreFixture({ visibleHostileNearEast: true, safeFogNorth: true });
  const order = chooseAutoExploreMove(state, unitId);
  expect(order?.to).toEqual({ q: 0, r: -1 });
});

it('supports wrapped maps without oscillating between seam columns', () => {
  const { state, unitId } = makeAutoExploreFixture({ onWrappedEdge: true });
  const order = chooseAutoExploreMove(state, unitId);
  expect(order).toBeDefined();
  expect(order?.reason).not.toContain('oscillation');
});

it('clears auto-explore when the player cancels or no safe path remains', () => {
  const { state, unitId } = makeAutoExploreFixture({ trappedByVisibleHostiles: true });
  applyAutoExploreOrder(state, unitId);
  expect(state.units[unitId].automation).toBeUndefined();
});
```

- [ ] **Step 2: Run focused tests to confirm failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/auto-explore-system.test.ts tests/core/turn-manager.test.ts
```

Expected: FAIL with missing auto-explore module / state.

- [ ] **Step 3: Add unit state and deterministic move selection**

In `src/core/types.ts`:

Extend the existing `Unit` interface with:

```typescript
automation?: {
  mode: 'auto-explore';
  lastTargets: string[];
  startedTurn: number;
}
```

In `src/systems/auto-explore-system.ts`:

```typescript
export interface AutoExploreOrder {
  unitId: string;
  to: HexCoord;
  reason: string;
}

export function chooseAutoExploreMove(state: GameState, unitId: string): AutoExploreOrder | null {
  // rank unexplored safe neighbors first, then safe frontier, then cancel if trapped
}

export function applyAutoExploreOrder(state: GameState, unitId: string): void {
  // execute the chosen order or clear automation if no safe move exists
}
```

- [ ] **Step 4: Tick automation inside turn processing**

In `src/core/turn-manager.ts`:

```typescript
for (const unit of currentUnits) {
  if (unit.automation?.mode === 'auto-explore') {
    applyAutoExploreOrder(nextState, unit.id);
  }
}
```

- [ ] **Step 5: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/auto-explore-system.test.ts tests/core/turn-manager.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the auto-explore core**

```bash
git add src/systems/auto-explore-system.ts src/systems/movement-safety.ts src/core/types.ts src/core/turn-manager.ts tests/systems/helpers/auto-explore-fixture.ts tests/systems/auto-explore-system.test.ts tests/core/turn-manager.test.ts
git commit -m "feat(m4e): add deterministic auto-explore"
```

### Task 7: Add Desktop Shortcuts, Context Menus, And Tooltips Without Breaking Mobile

**Files:**
- Create: `src/input/keyboard-shortcuts.ts`
- Create: `src/ui/context-menu.ts`
- Create: `src/ui/tooltip-layer.ts`
- Create: `tests/ui/helpers/desktop-controls-fixture.ts`
- Modify: `src/input/mouse-handler.ts`
- Modify: `src/main.ts`
- Create: `tests/ui/desktop-controls.test.ts`

- [ ] **Step 1: Add failing desktop-control tests**

Create `tests/ui/helpers/desktop-controls-fixture.ts` and `tests/ui/desktop-controls.test.ts`:

```typescript
/** @vitest-environment jsdom */
it('opens a right-click menu for a selected unit and exposes auto-explore', () => {
  const { state, container, unitId } = makeDesktopControlFixture();
  const menu = createContextMenu(container, state, { unitId });
  expect(menu.textContent).toContain('Auto-explore');
});

it('shows auto-explore status in selected-unit UI and offers a cancel action', () => {
  const { state, container, unitId } = makeDesktopControlFixture({ autoExploreActive: true });
  renderSelectedUnitInfo(container, state, unitId);
  expect(container.textContent).toContain('Auto-exploring');
  const menu = createContextMenu(container, state, { unitId });
  expect(menu.textContent).toContain('Cancel auto-explore');
});

it('shows hover tooltips for yields and grid view without using innerHTML injection', () => {
  const layer = createTooltipLayer(document.body);
  layer.show({ title: 'Forest', body: '+1 Food, +1 Production' }, { x: 10, y: 10 });
  expect(layer.root.textContent).toContain('Forest');
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/desktop-controls.test.ts
```

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement desktop input modules**

Create the three modules with explicit DOM-safe rendering and no branching away from mobile input:

```typescript
export interface KeyboardShortcutCallbacks {
  onOpenCouncil: () => void;
  onOpenTech: () => void;
  onEndTurn: () => void;
}

export interface ContextMenuTarget {
  unitId?: string;
  cityId?: string;
}

export interface TooltipLayer {
  root: HTMLElement;
  show(content: { title: string; body: string }, pos: { x: number; y: number }): void;
  hide(): void;
}

export function installKeyboardShortcuts(target: Document, callbacks: KeyboardShortcutCallbacks): void {}
export function createContextMenu(container: HTMLElement, state: GameState, target: ContextMenuTarget): HTMLElement {}
export function createTooltipLayer(container: HTMLElement): TooltipLayer {}
```

- [ ] **Step 4: Wire them through `main.ts` and `mouse-handler.ts`**

Add:

```typescript
installKeyboardShortcuts(document, {
  onOpenCouncil: () => toggleCouncilPanel(),
  onOpenTech: () => openTechPanel(),
  onEndTurn: () => endTurn(),
});
```

And right-click support in `MouseHandler` that is a no-op on touch-only devices.

Extract the existing selected-unit info-panel logic in `main.ts` into:

```typescript
function renderSelectedUnitInfo(container: HTMLElement, state: GameState, unitId: string): void
```

Also add a small selected-unit status row in `main.ts`:

```typescript
if (unit.automation?.mode === 'auto-explore') {
  statusRow.textContent = `Auto-exploring since turn ${unit.automation.startedTurn}`;
  cancelButton.textContent = 'Cancel auto-explore';
}
```

- [ ] **Step 5: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/desktop-controls.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the desktop affordances**

```bash
git add src/input/keyboard-shortcuts.ts src/ui/context-menu.ts src/ui/tooltip-layer.ts src/input/mouse-handler.ts src/main.ts tests/ui/helpers/desktop-controls-fixture.ts tests/ui/desktop-controls.test.ts
git commit -m "feat(m4e): add desktop controls and tooltips"
```

### Task 8: Finish Slice 2 With Visibility Polish And Initial Balance Smoothing

**Files:**
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/ui/turn-handoff.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/systems/resource-system.ts`
- Modify: `src/systems/tech-system.ts`
- Modify: `tests/ui/fog-leak.test.ts`
- Modify: `tests/systems/playtest-fixes.test.ts`
- Modify: `tests/systems/bugfix-playtest.test.ts`

- [ ] **Step 1: Add failing render-privacy and playfeel tests**

Extend `tests/ui/fog-leak.test.ts`:

```typescript
it('does not reveal hidden cities or units during AI turn transition animation', () => {
  expect(renderedText).not.toContain('Unknown City');
});
```

Extend `tests/systems/playtest-fixes.test.ts` with concrete friction goals:

```typescript
it('does not strand a starving city without an obvious food-improving recommendation or build path', () => {
  const council = buildCouncilAgenda(state, 'player');
  expect(JSON.stringify(council)).toContain('food');
});
```

- [ ] **Step 2: Run the Slice 2 focused suite**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/auto-explore-system.test.ts tests/ui/desktop-controls.test.ts tests/ui/fog-leak.test.ts tests/systems/playtest-fixes.test.ts tests/systems/bugfix-playtest.test.ts tests/core/turn-manager.test.ts
```

Expected: FAIL until render privacy and tuning are complete.

- [ ] **Step 3: Implement render privacy fixes and bounded tuning**

Keep tuning bounded to three concrete buckets only:

```typescript
// 1. turn-transition privacy: hidden cities/units never render during AI animation
// 2. city feedback: selected-city and Council surfaces expose turns-to-growth / starvation clearly
// 3. pacing: if the failing tests still show early deadlocks, change one targeted threshold at a time
```

Do not introduce a giant balance refactor. If a pacing constant changes, record the old value and new value in the implementation commit so the tuning remains auditable.

- [ ] **Step 4: Run full Slice 2 verification**

```bash
./scripts/run-with-mise.sh yarn test --run
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

### Task 8A: Unify Unit Movement Side Effects Across Manual And Automated Moves

**Root issue:**
- Manual movement in `src/main.ts` still owns village resolution, wonder discovery, visibility refresh, and contact sync.
- Auto-explore in `src/systems/auto-explore-system.ts` and `src/core/turn-manager.ts` only updates position.
- This is architectural duplication, not just a missing branch. Any future movement feature will drift again unless movement side effects live behind one shared gameplay path.

**Files:**
- Create: `src/systems/unit-movement-system.ts`
- Modify: `src/main.ts`
- Modify: `src/systems/auto-explore-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `tests/core/turn-manager.test.ts`
- Create: `tests/systems/unit-movement-system.test.ts`
- Modify: `tests/systems/auto-explore-system.test.ts`
- Modify: `tests/integration/m4e-council-guidance.test.ts`

- [ ] **Step 1: Add failing shared-movement tests**

Create `tests/systems/unit-movement-system.test.ts`:

```typescript
it('applies village rewards and removes the village when an automated move enters it', () => {
  const { state, unitId, villageId } = makeAutoExploreFixture({ villageNorth: true });
  const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, { actor: 'automation', civId: 'player' });
  expect(result.villageOutcome?.outcome).toBeDefined();
  expect(result.state.tribalVillages[villageId]).toBeUndefined();
});

it('refreshes visibility and civilization contacts after an automated move', () => {
  const { state, unitId, hiddenCivId } = makeAutoExploreFixture({ foreignBorderNorth: true });
  const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, { actor: 'automation', civId: 'player' });
  expect(result.revealedTiles.length).toBeGreaterThan(0);
  expect(result.state.civilizations.player.knownCivilizations).toContain(hiddenCivId);
});

it('emits wonder discovery metadata when automation reveals a wonder tile', () => {
  const { state, unitId } = makeAutoExploreFixture({ wonderNorth: 'crystal-caverns' });
  const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, { actor: 'automation', civId: 'player' });
  expect(result.discoveredWonderIds).toContain('crystal-caverns');
});
```

- [ ] **Step 2: Extend turn-manager and auto-explore regressions**

Add explicit regressions:

```typescript
it('auto-explore processes village and wonder side effects during turn processing', () => {
  const { state, unitId } = makeAutoExploreFixture({ villageNorth: true, wonderNorth: 'crystal-caverns' });
  const result = processTurn(state, bus);
  expect(result.units[unitId].position).toEqual({ q: 1, r: 0 });
  expect(Object.keys(result.discoveredWonders)).toContain('crystal-caverns');
  expect(Object.keys(result.tribalVillages)).toHaveLength(0);
});
```

- [ ] **Step 3: Run focused tests to confirm failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/unit-movement-system.test.ts tests/systems/auto-explore-system.test.ts tests/core/turn-manager.test.ts
```

Expected: FAIL because `executeUnitMove(...)` does not exist and automation still skips side effects.

- [ ] **Step 4: Introduce the shared movement executor**

Create `src/systems/unit-movement-system.ts` with one canonical movement path:

```typescript
export interface ExecuteUnitMoveOptions {
  actor: 'player' | 'automation' | 'ai';
  civId: string;
  bus?: EventBus;
}

export interface ExecuteUnitMoveResult {
  state: GameState;
  revealedTiles: HexCoord[];
  discoveredWonderIds: string[];
  villageOutcome?: { outcome: string; message: string };
}

export function executeUnitMove(
  state: GameState,
  unitId: string,
  to: HexCoord,
  options: ExecuteUnitMoveOptions,
): ExecuteUnitMoveResult {
  // move unit
  // resolve village
  // refresh visibility
  // sync contacts
  // process wonder discovery
  // return structured side effects for UI callers
}
```

Requirements:
- `main.ts` manual movement must call this instead of owning move side effects inline.
- `applyAutoExploreOrder(...)` must call this.
- `processTurn(...)` must keep auto-explore ticking through this shared executor.
- `executeUnitMove(...)` must stay gameplay-only: it returns data; it does not show notifications directly.

- [ ] **Step 5: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/unit-movement-system.test.ts tests/systems/auto-explore-system.test.ts tests/core/turn-manager.test.ts
```

Expected: PASS.

### Task 8B: Add Modal-Aware Input Gating For Keyboard And Context Actions

**Root issue:**
- `installKeyboardShortcuts(...)` currently listens globally and has no concept of blocking overlays.
- `main.ts` has multiple modal/overlay states (`turn-handoff`, panels, save/setup flows, context menus), but there is no shared UI activity policy.
- Without a central gate, new shortcuts and menus will keep bypassing modal UX.

**Files:**
- Create: `src/ui/ui-interaction-state.ts`
- Modify: `src/input/keyboard-shortcuts.ts`
- Modify: `src/input/mouse-handler.ts`
- Modify: `src/main.ts`
- Modify: `src/ui/context-menu.ts`
- Create: `tests/ui/keyboard-shortcuts.test.ts`
- Modify: `tests/ui/desktop-controls.test.ts`

- [ ] **Step 1: Add failing modal-gating tests**

Create `tests/ui/keyboard-shortcuts.test.ts`:

```typescript
/** @vitest-environment jsdom */
it('does not fire end-turn or panel shortcuts while turn handoff is present', () => {
  document.body.innerHTML = '<div id="turn-handoff"></div>';
  const interactions = createUiInteractionState();
  interactions.setBlockingOverlay('turn-handoff');
  const callbacks = { onOpenCouncil: vi.fn(), onOpenTech: vi.fn(), onEndTurn: vi.fn() };
  installKeyboardShortcuts(document, callbacks, { canHandle: () => !interactions.isInteractionBlocked() });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
  expect(callbacks.onEndTurn).not.toHaveBeenCalled();
});

it('does not open a second context menu when interaction is blocked by a modal overlay', () => {
  const { container, state, unitId } = makeDesktopControlFixture({ autoExploreActive: true });
  const blocked = createUiInteractionState();
  blocked.setBlockingOverlay('turn-handoff');
  const callbacks = { onStartAutoExplore: vi.fn(), onCancelAutoExplore: vi.fn() };
  const menu = createContextMenu(container, state, { unitId }, callbacks, blocked);
  expect(menu.textContent).toContain('No actions available');
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/keyboard-shortcuts.test.ts tests/ui/desktop-controls.test.ts
```

Expected: FAIL because the current shortcut installer and menu system are not modal-aware.

- [ ] **Step 3: Introduce one shared UI interaction gate**

Create `src/ui/ui-interaction-state.ts`:

```typescript
export interface UiInteractionState {
  setBlockingOverlay(id: string | null): void;
  isInteractionBlocked(): boolean;
}

export function createUiInteractionState(): UiInteractionState {
  let blockingOverlayId: string | null = null;
  return {
    setBlockingOverlay(id) { blockingOverlayId = id; },
    isInteractionBlocked() { return blockingOverlayId !== null; },
  };
}
```

Then:
- `installKeyboardShortcuts(...)` takes `options: { canHandle: () => boolean }`
- `MouseHandler` ignores right-click context actions when `canHandleContextMenu()` is false
- `main.ts` flips the shared state on turn handoff open/close and on other blocking panels
- `createContextMenu(...)` refuses actionable items when the gate is blocked

- [ ] **Step 4: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/keyboard-shortcuts.test.ts tests/ui/desktop-controls.test.ts
```

Expected: PASS.

### Task 8C: Make Auto-Explore Threat Detection Diplomacy-Aware

**Root issue:**
- `movement-safety.ts` treats every visible foreign unit as hostile.
- The plan/spec says “visible hostile attack range,” not “any non-owned unit.”
- This logic will otherwise grow a permanent false-positive surface as diplomacy and city-states become richer.

**Files:**
- Modify: `src/systems/movement-safety.ts`
- Modify: `src/systems/auto-explore-system.ts`
- Modify: `tests/systems/auto-explore-system.test.ts`
- Create: `tests/systems/movement-safety.test.ts`

- [ ] **Step 1: Add failing hostility-semantics tests**

Create `tests/systems/movement-safety.test.ts`:

```typescript
it('treats at-war major civ units as hostile threats', () => {
  const { state } = makeAutoExploreFixture({ majorWarNorth: true });
  expect(isThreatenedByVisibleHostiles(state, 'player', { q: 1, r: 0 })).toBe(true);
});

it('does not treat allied or neutral major civ units as hostile threats', () => {
  const { state } = makeAutoExploreFixture({ neutralScoutNorth: true });
  expect(isThreatenedByVisibleHostiles(state, 'player', { q: 1, r: 0 })).toBe(false);
});

it('does not treat friendly city-state units as hostile threats unless they are at war', () => {
  const { state } = makeAutoExploreFixture({ minorCivNorth: true, minorCivAtWar: false });
  expect(isThreatenedByVisibleHostiles(state, 'player', { q: 1, r: 0 })).toBe(false);
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/movement-safety.test.ts tests/systems/auto-explore-system.test.ts
```

Expected: FAIL because visible foreign units are currently treated as hostile unconditionally.

- [ ] **Step 3: Centralize hostility semantics**

Requirements for `movement-safety.ts`:
- `barbarian` is always hostile
- breakaway civs are hostile only if the viewer is their origin owner or at war
- major civs are hostile only if `viewer.diplomacy.atWarWith.includes(ownerId)`
- minor civs are hostile only if their `diplomacy.atWarWith` includes the viewer
- allied and neutral units do not block “safe” exploration paths

Use one helper:

```typescript
export function isUnitHostileToCiv(state: GameState, viewerId: string, unitOwnerId: string): boolean
```

Then filter `getVisibleHostileUnits(...)` through that helper.

- [ ] **Step 4: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/movement-safety.test.ts tests/systems/auto-explore-system.test.ts
```

Expected: PASS.

### Task 8D: Add Missing Integration And Persistence Coverage For Slice 2

**Root issue:**
- The new helper tests are useful, but the highest-risk paths live in `main.ts` wiring and serializable unit state.
- `automation` is now part of `Unit` but there is no save/load regression for it.
- The new UI path needs one integration test proving the right game behavior happens from the actual wiring, not only from helper calls.

**Files:**
- Modify: `tests/storage/save-persistence.test.ts`
- Create: `tests/integration/helpers/slice2-integration-fixture.ts`
- Create: `tests/integration/m4e-smoother-turns.test.ts`
- Modify: `tests/ui/desktop-controls.test.ts`

- [ ] **Step 1: Add failing integration and persistence tests**

Add to `tests/storage/save-persistence.test.ts`:

```typescript
it('persists unit auto-explore state through save/load', async () => {
  const { state, unitId } = makeAutoExploreFixture({ safeFogNorth: true });
  const saved = await saveGame(state, 'slice2-auto-explore');
  const loaded = await loadGame(saved.id);
  expect(loaded?.units[unitId].automation).toEqual(state.units[unitId].automation);
});
```

Create `tests/integration/m4e-smoother-turns.test.ts`:

```typescript
/** @vitest-environment jsdom */
it('starting auto-explore from the selected-unit UI moves through the shared movement path', () => {
  const { app, state, unitId } = makeSlice2IntegrationFixture({ villageNorth: true });
  app.selectUnit(unitId);
  app.openUnitContextMenu(unitId);
  clickByText(app.root, 'Auto-explore');
  expect(Object.keys(state.tribalVillages)).toHaveLength(0);
});

it('keyboard shortcuts are ignored while turn handoff is active', () => {
  const { app } = makeSlice2IntegrationFixture();
  app.showTurnHandoff();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
  expect(app.endTurnSpy).not.toHaveBeenCalled();
});
```

Create `tests/integration/helpers/slice2-integration-fixture.ts`:

```typescript
export function makeSlice2IntegrationFixture(options: { villageNorth?: boolean } = {}) {
  // mount a minimal jsdom app shell
  // seed game state with makeAutoExploreFixture(...)
  // expose selectUnit, openUnitContextMenu, showTurnHandoff, root, and endTurnSpy
}
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-persistence.test.ts tests/integration/m4e-smoother-turns.test.ts tests/ui/desktop-controls.test.ts
```

Expected: FAIL until the shared movement path, input gate, and serializable automation behavior are fully wired.

- [ ] **Step 3: Re-run full Slice 2 verification**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/unit-movement-system.test.ts tests/systems/movement-safety.test.ts tests/systems/auto-explore-system.test.ts tests/ui/keyboard-shortcuts.test.ts tests/ui/desktop-controls.test.ts tests/integration/m4e-smoother-turns.test.ts tests/core/turn-manager.test.ts tests/storage/save-persistence.test.ts tests/ui/fog-leak.test.ts tests/systems/playtest-fixes.test.ts tests/systems/bugfix-playtest.test.ts
./scripts/run-with-mise.sh yarn test --run
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 4: Commit, push, merge, and clean up after merge**

```bash
git add src/systems/unit-movement-system.ts src/systems/auto-explore-system.ts src/systems/movement-safety.ts src/ui/ui-interaction-state.ts src/input/keyboard-shortcuts.ts src/input/mouse-handler.ts src/ui/context-menu.ts src/ui/selected-unit-info.ts src/ui/tooltip-layer.ts src/core/turn-manager.ts src/core/types.ts src/main.ts src/systems/council-system.ts tests/systems/unit-movement-system.test.ts tests/systems/movement-safety.test.ts tests/systems/auto-explore-system.test.ts tests/systems/helpers/auto-explore-fixture.ts tests/ui/keyboard-shortcuts.test.ts tests/ui/desktop-controls.test.ts tests/ui/helpers/desktop-controls-fixture.ts tests/core/turn-manager.test.ts tests/storage/save-persistence.test.ts tests/integration/helpers/slice2-integration-fixture.ts tests/integration/m4e-smoother-turns.test.ts tests/ui/fog-leak.test.ts tests/systems/playtest-fixes.test.ts tests/systems/bugfix-playtest.test.ts tests/ui/helpers/council-fixture.ts
git commit -m "feat(m4e): finish slice 2 smoother turns"
git push origin feature/m4e-the-council
```

After merge, confirm on `origin/main`, then remove the worktree/branch.

### Task 8E: Make Auto-Explore Threat Evaluation Match Real Player Knowledge

**Root issue:**
- `movement-safety.ts` decides “visible hostile” using raw tile visibility and diplomacy state, but it does not apply the same concealment logic used by rendering and selection.
- That means player-owned automation can route around a forest-concealed enemy unit that the player is not actually allowed to know about.
- This is a privacy-model split, not just a one-line bug: movement safety, rendering, and interaction are answering “is this unit knowable?” in different places with different rules.

**Product direction:**
- Do **not** restrict auto-explore to only scouts or military units.
- Any unit may be placed into auto-explore when the player explicitly chooses it.
- Auto-explore must stop immediately when:
  - a hostile unit becomes visible under the real player-knowledge model, or
  - there is nowhere else reachable that advances exploration.

**Files:**
- Modify: `src/systems/movement-safety.ts`
- Modify: `src/systems/auto-explore-system.ts`
- Modify: `src/systems/fog-of-war.ts`
- Modify: `src/main.ts`
- Modify: `tests/systems/helpers/auto-explore-fixture.ts`
- Modify: `tests/systems/movement-safety.test.ts`
- Modify: `tests/systems/auto-explore-system.test.ts`
- Modify: `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Add failing concealment and stop-rule tests**

Extend `tests/systems/movement-safety.test.ts`:

```typescript
it('does not treat forest-concealed hostile units as visible threats', () => {
  const { state } = makeAutoExploreFixture({ concealedForestHostileEast: true });
  expect(getVisibleHostileUnits(state, 'player')).toEqual([]);
  expect(isThreatenedByVisibleHostiles(state, 'player', { q: 2, r: 1 })).toBe(false);
});
```

Extend `tests/systems/auto-explore-system.test.ts`:

```typescript
it('cancels auto-explore after a moved unit reveals a hostile threat', () => {
  const { state, unitId } = makeAutoExploreFixture({ safeFogNorth: true, hostileRevealedAfterNorthMove: true });
  applyAutoExploreOrder(state, unitId, { bus: new EventBus() });
  expect(state.units[unitId].automation).toBeUndefined();
});

it('allows the player to auto-explore with civilian units by explicit choice', () => {
  const { state, unitId } = makeAutoExploreFixture({ workerNorthStart: true, safeFogNorth: true });
  applyAutoExploreOrder(state, unitId, { bus: new EventBus() });
  expect(state.units[unitId].position).toEqual({ q: 1, r: 0 });
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/movement-safety.test.ts tests/systems/auto-explore-system.test.ts tests/core/turn-manager.test.ts
```

Expected: FAIL because concealment-aware visibility and post-move hostile cancellation are not yet wired.

- [ ] **Step 3: Centralize the “player can know about this unit” rule**

Add one shared helper in `src/systems/movement-safety.ts` or `src/systems/fog-of-war.ts`:

```typescript
export function isUnitVisibleToPlayerKnowledge(state: GameState, viewerId: string, unit: Unit): boolean
```

Requirements:
- tile visibility must be `visible`
- `isForestConcealedUnit(...)` must be false
- future player-owned automation safety checks must use this helper instead of raw visibility checks

- [ ] **Step 4: Stop automation with an explicit reason**

Requirements for `applyAutoExploreOrder(...)`:
- after moving through the shared movement path, evaluate visible hostile threats using the corrected knowledge model
- if a threat is now visible, clear `unit.automation`
- if no exploration-advancing destination exists, also clear `unit.automation`
- return a structured stop reason:

```typescript
type AutoExploreStopReason = 'hostile-encountered' | 'no-safe-path';
```

- `main.ts` must show current-player-only notifications such as:
  - `Auto-explore stopped: hostile unit sighted.`
  - `Auto-explore stopped: nothing new to explore.`

- [ ] **Step 5: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/movement-safety.test.ts tests/systems/auto-explore-system.test.ts tests/core/turn-manager.test.ts
```

Expected: PASS.

### Task 8F: Wire Hover Tooltips Into The Live Desktop Shell

**Root issue:**
- Slice 2 shipped `TooltipLayer` as an isolated helper and test, but the actual desktop shell never creates it or routes hover events into it.
- This is the same architectural problem as earlier Slice 2 issues: helper modules exist, but the real shell wiring path is incomplete.

**Scope:**
- Keep tooltips lightweight and desktop-only.
- Initial live wiring for Slice 2:
  - primary action bar buttons
  - the grid/help affordance
  - selected-unit auto-explore status / cancel affordance

**Files:**
- Modify: `src/ui/tooltip-layer.ts`
- Modify: `src/ui/game-shell.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `src/input/mouse-handler.ts`
- Modify: `src/main.ts`
- Modify: `tests/ui/desktop-controls.test.ts`
- Create: `tests/integration/m4e-desktop-tooltips.test.ts`

- [ ] **Step 1: Add failing live-tooltip integration tests**

Create `tests/integration/m4e-desktop-tooltips.test.ts`:

```typescript
/** @vitest-environment jsdom */
it('shows a tooltip when hovering a primary action bar control', () => {
  const { app } = makeDesktopControlIntegrationFixture();
  hover(app.root.querySelector('[data-tooltip-id="open-council"]')!);
  expect(app.tooltipRoot.textContent).toContain('Council');
});

it('shows a tooltip for selected-unit auto-explore controls', () => {
  const { app } = makeDesktopControlIntegrationFixture({ autoExploreActive: true });
  hover(app.root.querySelector('[data-tooltip-id="cancel-auto-explore"]')!);
  expect(app.tooltipRoot.textContent).toContain('Stop automatic exploration');
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/desktop-controls.test.ts tests/integration/m4e-desktop-tooltips.test.ts
```

Expected: FAIL because the live shell still does not create or drive the tooltip layer.

- [ ] **Step 3: Add declarative tooltip metadata and one live delegated hover path**

Requirements:
- `game-shell.ts` and `selected-unit-info.ts` must expose tooltip metadata using attributes:

```typescript
button.dataset.tooltipId = 'open-council';
button.dataset.tooltipTitle = 'Council';
button.dataset.tooltipBody = 'Open your advisors for guidance, goals, and drama.';
```

- `main.ts` must create one tooltip layer for the UI shell and install one delegated hover handler that:
  - reads tooltip attributes from hovered elements
  - shows/hides the layer
  - no-ops when interaction is blocked or on touch-only flows

- [ ] **Step 4: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/desktop-controls.test.ts tests/integration/m4e-desktop-tooltips.test.ts
```

Expected: PASS.

- [ ] **Step 5: Re-run full Slice 2 follow-up verification**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/movement-safety.test.ts tests/systems/auto-explore-system.test.ts tests/core/turn-manager.test.ts tests/ui/desktop-controls.test.ts tests/integration/m4e-desktop-tooltips.test.ts
./scripts/run-with-mise.sh yarn test --run
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

---

## Slice 3: Late Era Foundations

### Task 9: Add The Remaining Late-Era Tech Graph And Red Tests

**Files:**
- Modify: `src/systems/tech-definitions.ts`
- Modify: `src/systems/tech-system.ts`
- Modify: `tests/systems/tech-definitions.test.ts`
- Modify: `tests/systems/tech-system.test.ts`

- [ ] **Step 1: Add failing late-era graph tests**

Extend `tests/systems/tech-definitions.test.ts`:

```typescript
it('contains complete late-era prerequisites for the remaining M4 wonders', () => {
  expect(TECH_TREE.find(t => t.id === 'mass-media')).toBeDefined();
  expect(TECH_TREE.find(t => t.id === 'global-logistics')).toBeDefined();
  expect(TECH_TREE.find(t => t.id === 'nuclear-theory')).toBeDefined();
});

it('has no orphan late-era nodes', () => {
  const lateEra = TECH_TREE.filter(t => t.era >= 5);
  expect(lateEra.every(t => t.prerequisites.length > 0 || t.id === 'mass-media')).toBe(true);
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/tech-definitions.test.ts tests/systems/tech-system.test.ts
```

Expected: FAIL because those nodes do not exist yet.

- [ ] **Step 3: Add the late-era nodes and keep the graph readable**

In `src/systems/tech-definitions.ts`, add explicit techs rather than generic placeholder bridges:

```typescript
{ id: 'mass-media', track: 'communication', era: 5, prerequisites: ['radio'], unlocks: ['Global broadcasting'] }
{ id: 'global-logistics', track: 'economy', era: 5, prerequisites: ['containerization'], unlocks: ['Megaproject supply chains'] }
{ id: 'nuclear-theory', track: 'science', era: 5, prerequisites: ['advanced-physics'], unlocks: ['Manhattan Project'] }
```

- [ ] **Step 4: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/tech-definitions.test.ts tests/systems/tech-system.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the tech graph**

```bash
git add src/systems/tech-definitions.ts src/systems/tech-system.ts tests/systems/tech-definitions.test.ts tests/systems/tech-system.test.ts
git commit -m "feat(m4e): add late-era tech scaffolding"
```

### Task 10: Wire Late-Era Readability Into The Tech Panel And Wonder Dependencies

**Files:**
- Modify: `src/ui/tech-panel.ts`
- Modify: `src/systems/legendary-wonder-definitions.ts`
- Modify: `tests/ui/tech-panel.test.ts`
- Modify: `tests/systems/legendary-wonder-system.test.ts`
- Modify: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Add failing UI/dependency tests**

Extend `tests/ui/tech-panel.test.ts`:

```typescript
it('groups late-era nodes into readable sections instead of appending a confusing tail', () => {
  expect(panel.querySelector('[data-era="5"]')).toBeTruthy();
});
```

Extend `tests/systems/legendary-wonder-system.test.ts`:

```typescript
it('keeps remaining wonder prerequisites inside the new late-era tech envelope', () => {
  expect(canUnlockWonder(state, 'manhattan-project')).toBe(false);
  state.civilizations.player.techState.completed.push('nuclear-theory');
  expect(canUnlockWonder(state, 'manhattan-project')).toBe(true);
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/tech-panel.test.ts tests/systems/legendary-wonder-system.test.ts tests/storage/save-persistence.test.ts
```

- [ ] **Step 3: Implement panel grouping and dependency wiring**

Add era markers and “late-era payoff” copy in `tech-panel.ts`, and replace the temporary late-era prerequisite fallbacks for `manhattan-project`, `internet`, and any other remaining late-era wonder with real tech dependencies from Task 9.

- [ ] **Step 4: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/tech-panel.test.ts tests/systems/legendary-wonder-system.test.ts tests/storage/save-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the late-era UI/dependency wiring**

```bash
git add src/ui/tech-panel.ts src/systems/legendary-wonder-definitions.ts tests/ui/tech-panel.test.ts tests/systems/legendary-wonder-system.test.ts tests/storage/save-persistence.test.ts
git commit -m "feat(m4e): wire late-era techs into wonders"
```

### Task 11: Release Gate For Slice 3

**Files:**
- Modify: `docs/superpowers/specs/2026-04-08-m4e-the-council-design.md` only if implementation uncovers a real spec contradiction

- [ ] **Step 1: Run Slice 3 targeted verification**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/tech-definitions.test.ts tests/systems/tech-system.test.ts tests/ui/tech-panel.test.ts tests/systems/legendary-wonder-system.test.ts tests/storage/save-persistence.test.ts
```

- [ ] **Step 2: Run full suite and build**

```bash
./scripts/run-with-mise.sh yarn test --run
./scripts/run-with-mise.sh yarn build
```

- [ ] **Step 3: Push, merge, confirm on `origin/main`, and clean up**

```bash
git push origin feature/m4e-slice3-late-era-foundations
```

After merge, confirm ancestry and remove the worktree/branch.

---

## Slice 4: More Ambition

### Task 12: Add The Remaining Wonder Definitions And Quest Patterns

**Files:**
- Create: `src/systems/approved-legendary-wonder-roster.ts`
- Modify: `src/systems/legendary-wonder-definitions.ts`
- Modify: `src/systems/legendary-wonder-system.ts`
- Modify: `tests/systems/legendary-wonder-system.test.ts`
- Modify: `tests/systems/legendary-wonder-definitions.test.ts`
- Modify: `docs/superpowers/specs/2026-04-08-m4e-the-council-design.md`

- [ ] **Step 1: Lock the authoritative roster in docs before code**

Append a new `Appendix A - Approved M4 Legendary Wonder Roster` section to `docs/superpowers/specs/2026-04-08-m4e-the-council-design.md` before writing code or tests for Slice 4. The appendix must list the exact approved IDs and display names for the full M4 legendary-wonder set, including the four M4d wonders already shipped plus every M4e addition. Treat that appendix as the external source of truth for the implementation constant. If the appendix is not committed, Slice 4 is blocked.

- [ ] **Step 2: Add failing tests for the remaining catalog**

Extend `tests/systems/legendary-wonder-system.test.ts`:

```typescript
it('matches the full approved M4 legendary wonder roster exactly', () => {
  const ids = getLegendaryWonderDefinitions().map(w => w.id).sort();
  const approved = getApprovedM4LegendaryWonderRoster().map(w => w.id).sort();
  expect(ids).toEqual(approved);
  expect(approved.length).toBeGreaterThanOrEqual(15);
  expect(approved).toEqual(expect.arrayContaining(['manhattan-project', 'internet']));
});

it('supports at least one additional quest pattern beyond the original four', () => {
  const internet = getLegendaryWonderDefinitions().find(w => w.id === 'internet');
  expect(internet?.questSteps.some(step => step.type === 'buildings-in-multiple-cities')).toBe(true);
});
```

- [ ] **Step 3: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts tests/systems/legendary-wonder-definitions.test.ts
```

- [ ] **Step 4: Mirror the appendix into one code-owned roster module and implement every entry**

Create `src/systems/approved-legendary-wonder-roster.ts`:

```typescript
export function getApprovedM4LegendaryWonderRoster(): ReadonlyArray<{ id: string; name: string }> {
  return [
    // exact Appendix A entries from 2026-04-08-m4e-the-council-design.md, in the same order
  ] as const;
}
```

Keep a header comment in that file pointing back to `Appendix A` in the spec and requiring manual update when the appendix changes.

Then import that roster into `legendary-wonder-definitions.ts` and add a full definition for every entry in the approved roster. Do not treat “themed batches” as a stopping rule; the task is complete only when the exact-equality test above passes and no approved M4 legendary wonder is absent.

- [ ] **Step 5: Add any missing quest-step evaluators**

In `legendary-wonder-system.ts`, add concrete evaluators for the new step shapes:

```typescript
case 'buildings-in-multiple-cities':
case 'trade-routes-established':
case 'map-discoveries':
```

- [ ] **Step 6: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts tests/systems/legendary-wonder-definitions.test.ts
```

- [ ] **Step 7: Commit the expanded wonder catalog**

```bash
git add src/systems/approved-legendary-wonder-roster.ts src/systems/legendary-wonder-definitions.ts src/systems/legendary-wonder-system.ts tests/systems/legendary-wonder-system.test.ts tests/systems/legendary-wonder-definitions.test.ts
git commit -m "feat(m4e): expand the legendary wonder catalog"
```

### Task 13: Keep The Expanded Wonder Set Readable, Actionable, And Safe

**Root Cause Analysis**

Slice 4’s first UX pass made one correct decision and one incorrect one:

- correct: recommendations should be bounded so the player gets a readable “best next moves” view
- incorrect: the same bounded subset was also used as the player’s only access path to the full city wonder catalog

That is a category error. Recommendation is ranking. Accessibility is reachability. The wonder panel is the only player surface that can inspect and start a city’s legendary wonder projects, so it must never make lower-ranked projects unreachable. The correct design is:

- keep a small, scored “best fits right now” section
- keep a separate complete remainder section that still exposes every city-owned project
- test the panel against catalog completeness, not only readability

Council advice may stay bounded. The panel itself may not hide actionable projects.

**Files:**
- Modify: `src/ui/wonder-panel.ts`
- Modify: `src/ui/council-panel.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `tests/ui/wonder-panel.test.ts`
- Modify: `tests/ui/council-panel.test.ts`
- Modify: `tests/ai/basic-ai.test.ts`

- [ ] **Step 1: Add failing readability, reachability, and AI tests**

Extend `tests/ui/wonder-panel.test.ts`:

```typescript
it('does not overwhelm the player with an undifferentiated list of wonders', () => {
  expect(panel.querySelectorAll('[data-section="recommended-wonders"]').length).toBe(1);
  expect(panel.textContent).toContain('Best fits right now');
});

it('shows every city-owned legendary wonder project somewhere in the panel', () => {
  const { container, state } = makeWonderPanelFixture();
  const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');

  const panel = createWonderPanel(container, seededState, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });

  const cityProjectCount = Object.values(seededState.legendaryWonderProjects ?? {}).filter(project =>
    project.ownerId === 'player' && project.cityId === 'city-river',
  ).length;

  expect(panel.querySelectorAll('[data-project-card]').length).toBe(cityProjectCount);
});

it('keeps recommendation cards bounded without hiding the rest of the city catalog', () => {
  expect(panel.querySelectorAll('[data-recommended-project="true"]').length).toBeLessThanOrEqual(3);
  expect(panel.querySelectorAll('[data-section="all-city-wonders"]').length).toBe(1);
});
```

Extend `tests/ui/council-panel.test.ts`:

```typescript
it('recommends only a bounded number of wonder opportunities in the council', () => {
  const wonderCards = panel.querySelectorAll('[data-card-type="wonder"]');
  expect(wonderCards.length).toBeLessThanOrEqual(3);
});
```

Extend `tests/ai/basic-ai.test.ts`:

```typescript
it('does not chase every new legendary wonder at once', () => {
  expect(selectedWonders.length).toBeLessThanOrEqual(2);
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts tests/ui/council-panel.test.ts tests/ai/basic-ai.test.ts
```

- [ ] **Step 3: Implement curated surfacing without truncation**

Add explicit “best fits right now”, “all ambitions in this city”, and “in progress elsewhere” sections to `wonder-panel.ts`, and cap Council wonder recommendations to a small scored subset.

Rules for the panel implementation:
- The recommended section may stay capped.
- The city-owned remainder section must include every non-recommended city project exactly once.
- `Start Build` must stay reachable for any `ready_to_build` project even if it was not recommended.
- The rival/intel section may stay separately scoped by earned intel.
- Do not solve this with a hidden overflow and no affordance; the panel itself is already scrollable, so render the full city catalog.

- [ ] **Step 4: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts tests/ui/council-panel.test.ts tests/ai/basic-ai.test.ts
```

- [ ] **Step 5: Commit the Slice 4 UX**

```bash
git add src/ui/wonder-panel.ts src/ui/council-panel.ts src/ai/basic-ai.ts tests/ui/wonder-panel.test.ts tests/ui/council-panel.test.ts tests/ai/basic-ai.test.ts
git commit -m "feat(m4e): keep the wonder expansion readable"
```

### Task 13A: Restore The Global Wonder Availability Invariant

**Root Cause Analysis**

Slice 4’s per-city project seeding is not itself the wrong approach. The actual mistake is that the implementation treated `legendaryWonderProjects` as if it were the only source of truth. The design has three different domains:

1. `completedLegendaryWonders` is the global winner ledger.
2. `legendaryWonderProjects` is local per-city progress for only unresolved races.
3. UI/AI helpers derive from those two stores, not the other way around.

The current branch seeds every definition for every city without checking the global winner ledger, and `startLegendaryWonderBuild()` / `tickLegendaryWonderProjects()` do not defensively re-check global closure. That means a later-founded city can reopen a closed race. The fix is not to abandon per-city projects; it is to enforce a shared `wonder is still available` invariant everywhere the system seeds, filters, starts, or completes a project, and to sanitize already-invalid saved state instead of trusting it.

**Files:**
- Modify: `src/systems/legendary-wonder-system.ts`
- Modify: `tests/systems/legendary-wonder-system.test.ts`
- Modify: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Add failing global-uniqueness regressions**

Extend `tests/systems/legendary-wonder-system.test.ts`:

```typescript
it('does not seed a wonder that has already been completed globally', () => {
  const state = makeLegendaryWonderFixture();
  state.legendaryWonderProjects = undefined;
  state.completedLegendaryWonders = {
    'oracle-of-delphi': { ownerId: 'player', cityId: 'city-river', turnCompleted: 32 },
  };

  const result = initializeLegendaryWonderProjectsForCity(state, 'rival', 'city-rival');

  expect(Object.values(result.legendaryWonderProjects ?? {}).some(project =>
    project.cityId === 'city-rival' && project.wonderId === 'oracle-of-delphi',
  )).toBe(false);
});

it('does not allow a later city to restart a completed wonder race', () => {
  const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
  state.completedLegendaryWonders = {
    'oracle-of-delphi': { ownerId: 'player', cityId: 'city-river', turnCompleted: 32 },
  };
  state.legendaryWonderProjects = {
    'oracle-of-delphi:player:late-city': {
      wonderId: 'oracle-of-delphi',
      ownerId: 'player',
      cityId: 'late-city',
      phase: 'ready_to_build',
      investedProduction: 0,
      transferableProduction: 0,
      questSteps: [],
    },
  };
  state.cities['late-city'] = {
    ...state.cities['city-river'],
    id: 'late-city',
    owner: 'player',
    name: 'Late City',
  };
  state.civilizations.player.cities.push('late-city');

  const started = startLegendaryWonderBuild(state, 'player', 'late-city', 'oracle-of-delphi');
  const ticked = tickLegendaryWonderProjects(started, new EventBus());

  expect(Object.values(ticked.legendaryWonderProjects ?? {}).some(project =>
    project.cityId === 'late-city' && project.wonderId === 'oracle-of-delphi' && project.phase !== 'completed',
  )).toBe(false);
  expect(ticked.completedLegendaryWonders?.['oracle-of-delphi']).toEqual({
    ownerId: 'player',
    cityId: 'city-river',
    turnCompleted: 32,
  });
});
```

Extend `tests/storage/save-persistence.test.ts`:

```typescript
it('preserves the completed-wonder ledger so reopened races cannot appear after reload', () => {
  const state = makeLegendaryWonderFixture();
  state.completedLegendaryWonders = {
    'oracle-of-delphi': { ownerId: 'player', cityId: 'city-river', turnCompleted: 32 },
  };

  const roundTrip = JSON.parse(JSON.stringify(state));

  expect(roundTrip.completedLegendaryWonders?.['oracle-of-delphi']?.cityId).toBe('city-river');
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts tests/storage/save-persistence.test.ts
```

- [ ] **Step 3: Add one canonical availability/sanitization path**

In `src/systems/legendary-wonder-system.ts`, add shared helpers:

```typescript
function isLegendaryWonderStillAvailable(state: GameState, wonderId: string): boolean {
  return !state.completedLegendaryWonders?.[wonderId];
}

function sanitizeLegendaryWonderProjects(state: GameState): Record<string, LegendaryWonderProject> {
  return Object.fromEntries(
    Object.entries(state.legendaryWonderProjects ?? {}).filter(([, project]) =>
      isLegendaryWonderStillAvailable(state, project.wonderId)
      || project.phase === 'completed',
    ),
  );
}
```

Use them in four places:
- `initializeLegendaryWonderProjectsForCity()` must skip definitions that are no longer available.
- `getEligibleLegendaryWonders()` must exclude globally completed wonders even if a stale local project exists.
- `startLegendaryWonderBuild()` must refuse to start if the wonder has already been won.
- `tickLegendaryWonderProjects()` must sanitize stale pre-existing projects before any quest or completion logic runs.

Do not rely on seeding alone; the start and tick paths must be defensive so older/broken saves are self-healing.

- [ ] **Step 4: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts tests/storage/save-persistence.test.ts
```

- [ ] **Step 5: Commit the uniqueness fix**

```bash
git add src/systems/legendary-wonder-system.ts tests/systems/legendary-wonder-system.test.ts tests/storage/save-persistence.test.ts
git commit -m "fix(m4e): keep completed wonders globally unique"
```

### Task 13B: Make Stronghold Quest Progress Event-Backed Instead Of Snapshot-Based

**Root Cause Analysis**

The current `defeat_stronghold` implementation is fundamentally wrong for quest semantics. It infers “a stronghold was defeated” from the current absence of nearby barbarian camps. That confuses state with history:

- a late-founded city can auto-complete the step without any kill ever happening
- a map that never spawned a nearby camp can still satisfy the step
- the requirement drifts with map topology instead of player action

The fix is to track actual stronghold-destruction history in game state and make `defeat_stronghold` steps read that history. The existing `defeat_stronghold` type is also too coarse. Slice 4 currently uses the same type for “clear a nearby stronghold,” “threatening your frontier,” and “win a famous victory.” Those are not the same rule. We need explicit metadata on the step definition so the evaluator knows whether it needs a nearby kill or any kill.

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/barbarian-system.ts`
- Modify: `src/systems/legendary-wonder-definitions.ts`
- Modify: `src/systems/legendary-wonder-system.ts`
- Modify: `src/main.ts`
- Modify: `tests/systems/legendary-wonder-system.test.ts`
- Modify: `tests/systems/barbarian-system.test.ts`
- Modify: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Add failing stronghold-history regressions**

Extend `tests/systems/legendary-wonder-system.test.ts`:

```typescript
it('does not auto-complete stronghold quests just because no nearby camp exists', () => {
  const state = makeLegendaryWonderFixture({ completedTechs: ['architecture-arts', 'theology-tech'], resources: ['stone'] });
  state.legendaryWonderProjects = {
    'sun-spire:player:city-river': {
      wonderId: 'sun-spire',
      ownerId: 'player',
      cityId: 'city-river',
      phase: 'questing',
      investedProduction: 0,
      transferableProduction: 0,
      questSteps: [
        { id: 'complete-sacred-route', description: 'Establish a sacred trade route.', completed: true },
        { id: 'defeat-nearby-stronghold', description: 'Clear a nearby barbarian stronghold.', completed: false },
      ],
    },
  };
  state.barbarianCamps = {};
  state.legendaryWonderHistory = { destroyedStrongholds: [] };

  const result = tickLegendaryWonderProjects(state, new EventBus());

  expect(result.legendaryWonderProjects?.['sun-spire:player:city-river']?.phase).toBe('questing');
  expect(result.legendaryWonderProjects?.['sun-spire:player:city-river']?.questSteps[1]?.completed).toBe(false);
});

it('completes nearby stronghold quests only after the civ destroys a qualifying camp near the host city', () => {
  const state = makeLegendaryWonderFixture();
  state.legendaryWonderHistory = {
    destroyedStrongholds: [
      { civId: 'player', campId: 'camp-near', position: { q: 3, r: 2 }, turn: 40 },
    ],
  };

  const result = tickLegendaryWonderProjects(state, new EventBus());

  const project = Object.values(result.legendaryWonderProjects ?? {}).find(p => p.wonderId === 'sun-spire' && p.ownerId === 'player');
  expect(project?.questSteps.find(step => step.id === 'defeat-nearby-stronghold')?.completed).toBe(true);
});

it('does not treat a distant stronghold kill as satisfying a nearby-stronghold wonder step', () => {
  const state = makeLegendaryWonderFixture();
  state.legendaryWonderHistory = {
    destroyedStrongholds: [
      { civId: 'player', campId: 'camp-far', position: { q: 20, r: 20 }, turn: 40 },
    ],
  };

  const result = tickLegendaryWonderProjects(state, new EventBus());

  const project = Object.values(result.legendaryWonderProjects ?? {}).find(p => p.wonderId === 'sun-spire' && p.ownerId === 'player');
  expect(project?.questSteps.find(step => step.id === 'defeat-nearby-stronghold')?.completed).toBe(false);
});
```

Create a regression in `tests/systems/barbarian-system.test.ts`:

```typescript
it('records the destroying civ and camp position when a barbarian camp falls', () => {
  const state = createNewGame('egypt', 'wonder-history');
  state.legendaryWonderHistory = { destroyedStrongholds: [] };
  state.barbarianCamps = {
    'camp-1': { id: 'camp-1', position: { q: 4, r: 4 }, strength: 5, spawnCooldown: 0 },
  };

  const result = applyCampDestruction(state, 'player', 'camp-1', 25);

  expect(result.state.legendaryWonderHistory?.destroyedStrongholds).toContainEqual({
    civId: 'player',
    campId: 'camp-1',
    position: { q: 4, r: 4 },
    turn: 25,
  });
  expect(result.state.barbarianCamps['camp-1']).toBeUndefined();
  expect(result.reward).toBeGreaterThan(0);
});
```

Extend `tests/storage/save-persistence.test.ts`:

```typescript
it('round-trips legendary wonder stronghold history through JSON serialization', () => {
  const state = {
    legendaryWonderHistory: {
      destroyedStrongholds: [
        { civId: 'player', campId: 'camp-1', position: { q: 4, r: 4 }, turn: 25 },
      ],
    },
  };

  const roundTrip = JSON.parse(JSON.stringify(state));

  expect(roundTrip.legendaryWonderHistory.destroyedStrongholds[0]).toEqual({
    civId: 'player',
    campId: 'camp-1',
    position: { q: 4, r: 4 },
    turn: 25,
  });
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts tests/systems/barbarian-system.test.ts
```

- [ ] **Step 3: Add explicit stronghold history and step metadata**

In `src/core/types.ts`, add:

```typescript
export interface DestroyedStrongholdRecord {
  civId: string;
  campId: string;
  position: HexCoord;
  turn: number;
}

export interface LegendaryWonderHistory {
  destroyedStrongholds: DestroyedStrongholdRecord[];
}
```

Add to `GameState`:

```typescript
legendaryWonderHistory?: LegendaryWonderHistory;
```

In `src/core/types.ts`, extend the `LegendaryWonderDefinition.questSteps` shape for `defeat_stronghold` steps:

```typescript
scope?: 'near-city' | 'any';
radius?: number;
```

In `src/systems/legendary-wonder-definitions.ts`, make the three current uses explicit:
- `sun-spire`: `scope: 'near-city', radius: 4`
- `ironroot-foundry`: `scope: 'near-city', radius: 4`
- `hall-of-champions`: `scope: 'any'`

- [ ] **Step 4: Centralize camp destruction as a state change that records history**

In `src/systems/barbarian-system.ts`, add a helper:

```typescript
export function applyCampDestruction(
  state: GameState,
  civId: string,
  campId: string,
  turn: number,
): { state: GameState; reward: number } {
  const camp = state.barbarianCamps[campId];
  if (!camp) {
    return { state, reward: 0 };
  }

  const reward = destroyCamp(camp);
  const destroyedStrongholds = [
    ...(state.legendaryWonderHistory?.destroyedStrongholds ?? []),
    { civId, campId, position: camp.position, turn },
  ];

  const nextState = structuredClone(state);
  delete nextState.barbarianCamps[campId];
  nextState.legendaryWonderHistory = { destroyedStrongholds };
  nextState.civilizations[civId].gold += reward;
  return { state: nextState, reward };
}
```

Then in `src/main.ts`, replace the inline deletion path with that helper and keep the existing notification/event emission:

```typescript
const destroyed = applyCampDestruction(gameState, gameState.currentPlayer, campId, gameState.turn);
gameState = destroyed.state;
const reward = destroyed.reward;
bus.emit('barbarian:camp-destroyed', { campId, reward });
```

This keeps the history write, gold reward, and camp removal inseparable.

- [ ] **Step 5: Replace snapshot inference with history-backed evaluation**

In `src/systems/legendary-wonder-system.ts`, replace the current `defeat_stronghold` branch with history lookup:

```typescript
case 'defeat_stronghold': {
  const history = state.legendaryWonderHistory?.destroyedStrongholds ?? [];
  const matchingKills = history.filter(record => record.civId === project.ownerId);

  if (step.scope === 'near-city') {
    return matchingKills.some(record => hexDistance(record.position, city.position) <= (step.radius ?? 4));
  }

  return matchingKills.length >= (step.targetCount ?? 1);
}
```

This must read action history only. It must not consult `state.barbarianCamps` for completion.

- [ ] **Step 6: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts tests/systems/barbarian-system.test.ts tests/storage/save-persistence.test.ts
```

- [ ] **Step 7: Commit the stronghold-history fix**

```bash
git add src/core/types.ts src/systems/barbarian-system.ts src/systems/legendary-wonder-definitions.ts src/systems/legendary-wonder-system.ts src/main.ts tests/systems/legendary-wonder-system.test.ts tests/systems/barbarian-system.test.ts tests/storage/save-persistence.test.ts
git commit -m "fix(m4e): make stronghold wonder quests event-backed"
```

### Task 13C: Add Durable, Viewer-Scoped Wonder Race Intel

**Root Cause Analysis**

The current panel leak is not just a bad `filter()`. Slice 4 introduced a new rival-race surface, but the codebase still has only an ephemeral reveal path: `startLegendaryWonderBuild()` emits a spy-earned event, and notifications consume it immediately. There is no persistent state answering “which rival wonder races is this player actually entitled to know about?” Without that ledger, the panel can either:

- leak by reading all rival `building` projects directly, or
- forget by hiding everything after the toast is gone

The correct fix is a durable, viewer-scoped intel store keyed to the revealed project, and one shared helper that the panel and notifications use. The fundamental approach error was trying to build a persistent UI surface on top of a transient event.

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/legendary-wonder-system.ts`
- Modify: `src/ui/wonder-panel.ts`
- Modify: `src/ui/legendary-wonder-notifications.ts`
- Modify: `tests/systems/legendary-wonder-system.test.ts`
- Modify: `tests/ui/wonder-panel.test.ts`
- Modify: `tests/ui/legendary-wonder-notifications.test.ts`
- Modify: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Add failing privacy/intel regressions**

Extend `tests/ui/wonder-panel.test.ts`:

```typescript
it('does not reveal rival wonder races without earned intel', () => {
  const { container, state } = makeWonderPanelFixture();

  const panel = createWonderPanel(container, state, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });

  expect(panel.textContent).not.toContain('Rival is pursuing this');
  expect(panel.querySelectorAll('[data-section="rival-wonders"]').length).toBe(0);
});

it('shows only rival wonder races revealed to the current player', () => {
  const { container, state } = makeWonderPanelFixture();
  state.legendaryWonderIntel = {
    player: ['grand-canal-rival'],
  };

  const panel = createWonderPanel(container, state, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });

  expect(panel.querySelectorAll('[data-section="rival-wonders"]').length).toBe(1);
  expect(panel.textContent).toContain('Rival is pursuing this');
});

it('does not show rival wonder intel revealed only to another hot-seat player', () => {
  const { container, state } = makeWonderPanelFixture();
  state.cities['city-2'] = {
    ...state.cities['city-river'],
    id: 'city-2',
    owner: 'player-2',
    name: 'Second City',
  };
  state.civilizations['player-2'] = {
    ...state.civilizations.player,
    id: 'player-2',
    name: 'Second Player',
    isHuman: true,
    cities: ['city-2'],
  };
  state.currentPlayer = 'player-2';
  state.legendaryWonderIntel = {
    player: ['grand-canal-rival'],
  };

  const panel = createWonderPanel(container, state, 'city-2', {
    onStartBuild: () => {},
    onClose: () => {},
  });

  expect(panel.querySelectorAll('[data-section="rival-wonders"]').length).toBe(0);
});
```

Extend `tests/systems/legendary-wonder-system.test.ts`:

```typescript
it('stores durable rival-race intel when a stationed spy reveals a wonder start', () => {
  const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
  state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
  state.legendaryWonderIntel = {};
  // same stationed-spy setup as the existing reveal test

  const result = startLegendaryWonderBuild(state, 'player', 'city-river', 'oracle-of-delphi', new EventBus());

  expect(result.legendaryWonderIntel?.observer).toContain(
    expect.stringContaining('oracle-of-delphi'),
  );
});
```

Extend `tests/storage/save-persistence.test.ts`:

```typescript
it('persists viewer-scoped legendary wonder race intel across save/load', () => {
  const state = makeLegendaryWonderFixture();
  state.legendaryWonderIntel = { player: ['grand-canal-rival'] };

  const roundTrip = JSON.parse(JSON.stringify(state));

  expect(roundTrip.legendaryWonderIntel?.player).toEqual(['grand-canal-rival']);
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts tests/ui/wonder-panel.test.ts tests/ui/legendary-wonder-notifications.test.ts tests/storage/save-persistence.test.ts
```

- [ ] **Step 3: Add one durable intel ledger**

In `src/core/types.ts`, add:

```typescript
legendaryWonderIntel?: Record<string, string[]>;
```

The values are project keys already used in `legendaryWonderProjects`. Keep it simple and serializable. Do not invent a second project identifier system.

In `startLegendaryWonderBuild()`, when a stationed spy reveals a build, record the exact project key for `observerId` in `legendaryWonderIntel` in addition to queuing the notification event.

In `tickLegendaryWonderProjects()`, prune stale intel entries for projects that no longer exist or are no longer in `building` phase so the panel does not accumulate ghosts.

- [ ] **Step 4: Gate every rival-race surface through the intel ledger**

In `src/ui/wonder-panel.ts`, replace:

```typescript
const rivalProjects = Object.values(state.legendaryWonderProjects ?? {})
  .filter(project => project.ownerId !== state.currentPlayer && project.phase === 'building');
```

with a helper that resolves only project keys present in `state.legendaryWonderIntel?.[state.currentPlayer]`.

In `src/ui/legendary-wonder-notifications.ts`, keep the reveal toast current-player scoped as it is, but make the message derive from the same resolved project/city/wonder objects so the notification and panel cannot drift.

- [ ] **Step 5: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts tests/ui/wonder-panel.test.ts tests/ui/legendary-wonder-notifications.test.ts tests/storage/save-persistence.test.ts
```

- [ ] **Step 6: Commit the privacy-safe rival-intel fix**

```bash
git add src/core/types.ts src/systems/legendary-wonder-system.ts src/ui/wonder-panel.ts src/ui/legendary-wonder-notifications.ts tests/systems/legendary-wonder-system.test.ts tests/ui/wonder-panel.test.ts tests/ui/legendary-wonder-notifications.test.ts tests/storage/save-persistence.test.ts
git commit -m "fix(m4e): gate rival wonder races behind earned intel"
```

### Task 13D: Keep Wonder Recommendations Bounded Without Hiding The Full Catalog

**Root Cause Analysis**

The review found a deeper product mistake than “wrong `slice()` sizes.” The real failure is that the panel mixed up three different jobs:

1. recommendation: show a lovable short list of the best next options
2. browsing: let the player inspect every city wonder project
3. action: let the player start any eligible wonder from the only wonder UI

The current implementation lets recommendation logic decide what is browseable and startable. That is fundamentally wrong. Recommendation may be selective. Browsing and action reachability may not.

**Files:**
- Modify: `src/ui/wonder-panel.ts`
- Modify: `tests/ui/wonder-panel.test.ts`
- Modify: `tests/ui/council-panel.test.ts`

- [ ] **Step 1: Add failing full-catalog regressions**

Extend `tests/ui/wonder-panel.test.ts`:

```typescript
it('renders every project owned by the selected city exactly once', () => {
  const { container, state } = makeWonderPanelFixture();
  const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');

  const panel = createWonderPanel(container, seededState, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });

  const cityProjects = Object.values(seededState.legendaryWonderProjects ?? {}).filter(project =>
    project.ownerId === 'player' && project.cityId === 'city-river',
  );

  expect(panel.querySelectorAll('[data-project-card]').length).toBe(cityProjects.length);
});

it('keeps lower-priority ready-to-build wonders reachable from the panel', () => {
  const { container, state } = makeWonderPanelFixture();
  const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');
  const nonRecommendedReadyWonder = Object.values(seededState.legendaryWonderProjects ?? {})
    .find(project => project.ownerId === 'player' && project.cityId === 'city-river' && project.phase === 'ready_to_build' && project.wonderId !== 'oracle-of-delphi');

  expect(nonRecommendedReadyWonder).toBeDefined();

  const panel = createWonderPanel(container, seededState, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });

  expect(panel.textContent).toContain(getLegendaryWonderDefinition(nonRecommendedReadyWonder!.wonderId)?.name ?? nonRecommendedReadyWonder!.wonderId);
});
```

Extend `tests/ui/council-panel.test.ts`:

```typescript
it('keeps council wonder advice bounded without changing the full panel catalog', () => {
  const wonderCards = panel.querySelectorAll('[data-card-type="wonder"]');
  expect(wonderCards.length).toBeLessThanOrEqual(3);
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts tests/ui/council-panel.test.ts
```

- [ ] **Step 3: Refactor the panel around two different concepts**

In `src/ui/wonder-panel.ts`:
- keep the existing scored recommendation helper
- render a bounded `recommended-wonders` section for the top subset
- render a complete `all-city-wonders` section for every non-recommended project in the selected city
- keep the rival section separate and still gated by earned intel

Do not reintroduce a flat, overwhelming list. The fix is “bounded recommendations plus full browseable catalog,” not “dump everything in one bucket.”

- [ ] **Step 4: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts tests/ui/council-panel.test.ts
```

- [ ] **Step 5: Commit the catalog-access fix**

```bash
git add src/ui/wonder-panel.ts tests/ui/wonder-panel.test.ts tests/ui/council-panel.test.ts
git commit -m "fix(m4e): keep the full wonder catalog reachable"
```

### Task 13E: Share Camp-Destruction Consequences Across Human And AI Combat

**Root Cause Analysis**

Task 13B fixed the history model but not the execution model. The current branch still records stronghold history only from the human `executeAttack()` UI path in `main.ts`. AI combat in `src/ai/basic-ai.ts` resolves defender death separately, so AI civs never write the same history when they clear camps. The architectural bug is that post-combat defender-death consequences are still split by actor:

- human combat path in `main.ts`
- AI combat path in `basic-ai.ts`
- barbarian turn combat in `turn-manager.ts`

Any gameplay rule attached to “defender died on this tile” will keep drifting until those consequences are centralized behind one shared system helper.

**Files:**
- Modify: `src/systems/barbarian-system.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `src/main.ts`
- Modify: `tests/ai/basic-ai.test.ts`
- Modify: `tests/systems/barbarian-system.test.ts`
- Modify: `tests/systems/legendary-wonder-system.test.ts`

- [ ] **Step 1: Add failing AI-parity regressions**

Extend `tests/ai/basic-ai.test.ts`:

```typescript
it('records stronghold history when an ai civ clears a barbarian camp', () => {
  const state = makeAiBarbarianCampAttackState();

  const result = processAITurn(state, 'ai-1', new EventBus());

  expect(result.legendaryWonderHistory?.destroyedStrongholds).toContainEqual(
    expect.objectContaining({ civId: 'ai-1', campId: 'camp-1' }),
  );
  expect(result.barbarianCamps['camp-1']).toBeUndefined();
});

it('lets an ai civ satisfy stronghold-backed wonder quests after clearing a camp', () => {
  const state = makeAiStrongholdWonderState();

  const afterCombat = processAITurn(state, 'ai-1', new EventBus());
  const afterTick = tickLegendaryWonderProjects(afterCombat, new EventBus());

  const project = Object.values(afterTick.legendaryWonderProjects ?? {}).find(candidate =>
    candidate.ownerId === 'ai-1' && candidate.wonderId === 'sun-spire',
  );

  expect(project?.questSteps.find(step => step.id === 'defeat-nearby-stronghold')?.completed).toBe(true);
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ai/basic-ai.test.ts tests/systems/barbarian-system.test.ts tests/systems/legendary-wonder-system.test.ts
```

- [ ] **Step 3: Introduce one shared post-kill camp-resolution helper**

Keep `applyCampDestruction()` as the canonical camp-removal/history/reward mutation. Then add one shared helper that checks whether a dead defender stood on a barbarian camp tile and applies camp destruction for the attacker:

```typescript
export function applyCampDestructionAtTarget(
  state: GameState,
  attackerOwnerId: string,
  target: HexCoord,
  turn: number,
): { state: GameState; reward: number; campId: string | null } {
  const campEntry = Object.entries(state.barbarianCamps).find(([, camp]) =>
    hexKey(camp.position) === hexKey(target),
  );
  if (!campEntry) {
    return { state, reward: 0, campId: null };
  }

  const [campId] = campEntry;
  const destroyed = applyCampDestruction(state, attackerOwnerId, campId, turn);
  return { ...destroyed, campId };
}
```

- [ ] **Step 4: Route both human and AI combat through the same camp-resolution path**

Use that shared helper in:
- `src/main.ts` after defender death, preserving the current human notifications/advisor reactions
- `src/ai/basic-ai.ts` after defender death, without UI notifications but with the same state mutation

Do not duplicate the camp scan logic in both files again.

- [ ] **Step 5: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ai/basic-ai.test.ts tests/systems/barbarian-system.test.ts tests/systems/legendary-wonder-system.test.ts
```

- [ ] **Step 6: Commit the actor-parity fix**

```bash
git add src/systems/barbarian-system.ts src/main.ts src/ai/basic-ai.ts tests/ai/basic-ai.test.ts tests/systems/barbarian-system.test.ts tests/systems/legendary-wonder-system.test.ts
git commit -m "fix(m4e): share stronghold progress across human and ai combat"
```

### Task 14: Release Gate For Slice 4

**Files:**
- None beyond normal verification unless a review fix is required

- [ ] **Step 1: Run Slice 4 targeted verification**

```bash
./scripts/run-wonder-regressions.sh
```

- [ ] **Step 2: Run full suite and build**

```bash
./scripts/run-with-mise.sh yarn test --run
./scripts/run-with-mise.sh yarn build
```

- [ ] **Step 3: Push, merge, confirm on `origin/main`, and clean up**

```bash
git push origin feature/m4e-slice4-more-ambition
```

After merge, confirm ancestry and remove the worktree/branch.

---

## Slice 5: Identity And Personality

### Task 15: Add Council Memory, Lobbying, Disagreements, And Privacy-Safe Callbacks

**Files:**
- Create: `src/systems/council-memory.ts`
- Modify: `src/core/types.ts`
- Modify: `src/ui/advisor-system.ts`
- Modify: `src/ui/council-panel.ts`
- Create: `tests/systems/council-memory.test.ts`
- Modify: `tests/ui/council-panel.test.ts`
- Modify: `tests/ui/advisor-system.test.ts`

- [ ] **Step 1: Add failing memory/disagreement tests**

Create `tests/systems/council-memory.test.ts`:

```typescript
it('records major recommendations and can recall them later without leaking hidden facts', () => {
  const memory = rememberCouncilDecision(state, 'player', {
    key: 'expand-west',
    summary: 'Secure the western frontier',
    turn: 40,
  });
  expect(memory.entries[0].summary).toContain('western frontier');
});

it('caps callback frequency so the council does not become exhausting', () => {
  expect(shouldEmitCouncilCallback(state, 'player')).toBe(false);
});
```

Extend `tests/ui/council-panel.test.ts` with disagreement rendering:

```typescript
expect(panel.textContent).toContain('The treasurer disagrees');
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/council-memory.test.ts tests/ui/council-panel.test.ts tests/ui/advisor-system.test.ts
```

- [ ] **Step 3: Implement bounded memory**

Add:

```typescript
export interface CouncilMemoryEntry {
  key: string;
  advisor: AdvisorType;
  summary: string;
  turn: number;
  civId: string;
}
```

Store only major decisions, not every trivial move, and always format callbacks from current-player-visible information.

- [ ] **Step 4: Wire lobbying/disagreements into the panel and advisor interrupts**

Add a disagreement block in `council-panel.ts` and bounded callback emission in `advisor-system.ts`.

- [ ] **Step 5: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/council-memory.test.ts tests/ui/council-panel.test.ts tests/ui/advisor-system.test.ts
```

- [ ] **Step 6: Commit the memory/personality layer**

```bash
git add src/systems/council-memory.ts src/core/types.ts src/ui/advisor-system.ts src/ui/council-panel.ts tests/systems/council-memory.test.ts tests/ui/council-panel.test.ts tests/ui/advisor-system.test.ts
git commit -m "feat(m4e): add council memory and disagreements"
```

### Task 16: Add Wakanda, Avalon, And A Medium-Depth Custom Civ Creator

**Files:**
- Create: `src/systems/civ-registry.ts`
- Create: `src/systems/custom-civ-system.ts`
- Create: `src/ui/custom-civ-panel.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/game-state.ts`
- Modify: `src/main.ts`
- Modify: `src/storage/save-manager.ts`
- Modify: `src/systems/civ-definitions.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `src/systems/diplomacy-system.ts`
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/systems/fog-of-war.ts`
- Modify: `src/ui/campaign-setup.ts`
- Modify: `src/ui/hotseat-setup.ts`
- Modify: `src/ui/diplomacy-panel.ts`
- Modify: `src/ui/turn-handoff.ts`
- Modify: `src/ui/civ-select.ts`
- Create: `tests/systems/civ-registry.test.ts`
- Create: `tests/ui/custom-civ-panel.test.ts`
- Create: `tests/ui/civ-select.test.ts`
- Modify: `tests/ui/campaign-setup.test.ts`
- Create: `tests/ui/hotseat-setup.test.ts`
- Modify: `tests/systems/civ-definitions.test.ts`
- Modify: `tests/core/game-state.test.ts`
- Modify: `tests/core/turn-manager.test.ts`
- Modify: `tests/storage/save-manager.test.ts`
- Modify: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Add failing civ-creator and civ-definition tests**

Create `tests/ui/custom-civ-panel.test.ts`:

```typescript
/** @vitest-environment jsdom */
it('enforces a constrained trait budget and requires a city-name pool', () => {
  const panel = createCustomCivPanel(document.body, { onSave: () => {} });
  expect(panel.textContent).toContain('Trait budget');
});
```

Create `tests/ui/civ-select.test.ts`:

```typescript
/** @vitest-environment jsdom */
it('renders saved custom civs in the real civ picker and allows selecting them', () => {
  const customCiv: CustomCivDefinition = {
    id: 'custom-sunfolk',
    name: 'Sunfolk',
    color: '#d9a441',
    leaderName: 'Aurelia',
    cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
    primaryTrait: 'scholarly',
    temperamentTraits: ['diplomatic', 'trader'],
  };
  const onSelect = vi.fn();
  const panel = createCivSelectPanel(document.body, { onSelect }, {
    civDefinitions: getPlayableCivDefinitions({
      customCivilizations: [customCiv],
    }),
  });

  expect(panel.textContent).toContain('Sunfolk');
  const card = Array.from(panel.querySelectorAll('.civ-card')).find(node => node.textContent?.includes('Sunfolk'));
  expect(card).toBeTruthy();
  card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  (panel.querySelector('#civ-start') as HTMLButtonElement).click();
  expect(onSelect).toHaveBeenCalledWith('custom-sunfolk');
});

it('renders custom civ names with DOM nodes instead of trusting markup', () => {
  const customCiv: CustomCivDefinition = {
    id: 'custom-sunfolk',
    name: 'Sunfolk',
    color: '#d9a441',
    leaderName: 'Aurelia',
    cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
    primaryTrait: 'scholarly',
    temperamentTraits: ['diplomatic', 'trader'],
  };
  const panel = createCivSelectPanel(document.body, { onSelect: () => {} }, {
    civDefinitions: getPlayableCivDefinitions({
      customCivilizations: [{ ...customCiv, name: '<img src=x onerror=alert(1)>' }],
    }),
  });
  expect(panel.querySelector('img')).toBeNull();
  expect(panel.textContent).toContain('<img src=x onerror=alert(1)>');
});

it('offers a create-custom-civ action from the real civ picker', () => {
  const onCreateCustomCiv = vi.fn();
  const panel = createCivSelectPanel(document.body, {
    onSelect: () => {},
    onCreateCustomCiv,
  }, {
    civDefinitions: getPlayableCivDefinitions(undefined),
  });

  (panel.querySelector('[data-action=\"create-custom-civ\"]') as HTMLButtonElement).click();
  expect(onCreateCustomCiv).toHaveBeenCalledTimes(1);
});
```

Create `tests/ui/hotseat-setup.test.ts`:

```typescript
/** @vitest-environment jsdom */
it('passes custom civ definitions into hot-seat setup selection flow for later players', () => {
  const customCiv: CustomCivDefinition = {
    id: 'custom-sunfolk',
    name: 'Sunfolk',
    color: '#d9a441',
    leaderName: 'Aurelia',
    cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
    primaryTrait: 'scholarly',
    temperamentTraits: ['diplomatic', 'trader'],
  };

  showHotSeatSetup(
    document.body,
    {
      onComplete: () => {},
      onCancel: () => {},
    },
    {
      civDefinitions: getPlayableCivDefinitions({
        customCivilizations: [customCiv],
      }),
    },
  );

  (document.querySelector('[data-size="small"]') as HTMLElement).click();
  (document.querySelector('[data-count="2"]') as HTMLElement).click();
  (document.querySelector('#hs-names-next') as HTMLButtonElement).click();

  expect(document.body.textContent).toContain('Sunfolk');
});
```

Extend `tests/ui/campaign-setup.test.ts`:

```typescript
/** @vitest-environment jsdom */
it('passes custom civ definitions into solo campaign setup civ selection', () => {
  const customCiv: CustomCivDefinition = {
    id: 'custom-sunfolk',
    name: 'Sunfolk',
    color: '#d9a441',
    leaderName: 'Aurelia',
    cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
    primaryTrait: 'scholarly',
    temperamentTraits: ['diplomatic', 'trader'],
  };

  showCampaignSetup(
    document.body,
    {
      onStartSolo: () => {},
      onCancel: () => {},
    },
    {
      civDefinitions: getPlayableCivDefinitions({
        customCivilizations: [customCiv],
      }),
    },
  );

  (document.querySelector('[data-action="choose-civ"]') as HTMLButtonElement).click();
  expect(document.body.textContent).toContain('Sunfolk');
});
```

Extend `tests/systems/civ-definitions.test.ts`:

```typescript
it('includes Wakanda and Avalon with distinct themed bonuses', () => {
  expect(getCivDefinition('wakanda')).toBeDefined();
  expect(getCivDefinition('avalon')).toBeDefined();
});
```

Extend `tests/storage/save-manager.test.ts`:

```typescript
const customCiv: CustomCivDefinition = {
  id: 'custom-sunfolk',
  name: 'Sunfolk',
  color: '#d9a441',
  leaderName: 'Aurelia',
  cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
  primaryTrait: 'scholarly',
  temperamentTraits: ['diplomatic', 'trader'],
};

it('persists custom civilization definitions through settings save/load', async () => {
  const baseSettings = createDefaultSettings('small', (await loadSettings()) ?? {});
  await saveSettings({ ...baseSettings, customCivilizations: [customCiv] });
  const loaded = await loadSettings();
  expect(loaded?.customCivilizations?.[0].name).toBe(customCiv.name);
});
```

Create `tests/systems/civ-registry.test.ts`:

```typescript
it('resolves a custom civ from saved settings before falling back to built-in definitions', () => {
  const state = {
    settings: {
      customCivilizations: [customCiv],
    },
  } as Pick<GameState, 'settings'>;

  const resolved = resolveCivDefinition(state, 'custom-sunfolk');
  expect(resolved?.id).toBe('custom-sunfolk');
  expect(resolved?.name).toBe('Sunfolk');
  expect(resolved?.bonusName).toBe('Academies of State');
  expect(resolved?.bonusEffect).toEqual({ type: 'extra_tech_speed', speedMultiplier: 1.15 });
  expect(resolved?.personality.traits).toEqual(expect.arrayContaining(['diplomatic', 'trader']));
});
```

Extend `tests/core/game-state.test.ts`:

```typescript
it('createNewGame can start from a saved custom civ registry', () => {
  const state = createNewGame({
    civType: 'custom-sunfolk',
    mapSize: 'small',
    opponentCount: 1,
    gameTitle: 'Custom Civ Test',
    customCivilizations: [customCiv],
  });
  expect(state.civilizations.player.civType).toBe('custom-sunfolk');
  expect(state.civilizations.player.name).toBe('Sunfolk');
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/civ-registry.test.ts tests/ui/custom-civ-panel.test.ts tests/ui/civ-select.test.ts tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts tests/systems/civ-definitions.test.ts tests/core/game-state.test.ts tests/core/turn-manager.test.ts tests/storage/save-manager.test.ts tests/storage/save-persistence.test.ts
```

- [ ] **Step 3: Implement custom-civ validation, normalization, and runtime resolution**

Add:

```typescript
export type CustomCivPrimaryTraitId =
  | 'trade-dominance'
  | 'naval-supremacy'
  | 'scholarly'
  | 'expansionist'
  | 'stealth'
  | 'wonder-craft';

export type CustomCivTemperamentTrait = PersonalityTrait;

export interface CustomCivDefinition {
  id: string;
  name: string;
  color: string;
  leaderName: string;
  cityNames: string[];
  primaryTrait: CustomCivPrimaryTraitId;
  temperamentTraits: CustomCivTemperamentTrait[];
}

// Extend the existing GameSettings type with:
customCivilizations?: CustomCivDefinition[];

// Extend new-game config types as well:
export interface SoloSetupConfig {
  customCivilizations?: CustomCivDefinition[];
}

export interface HotSeatConfig {
  customCivilizations?: CustomCivDefinition[];
}
```

Do not invent `CivDefinition`s ad hoc at call sites. In `src/systems/custom-civ-system.ts`, define a single normalization pipeline that turns user-authored custom civs into full runtime `CivDefinition`s before any live system sees them:

```typescript
const CUSTOM_CIV_PRIMARY_TRAITS: Record<CustomCivPrimaryTraitId, {
  bonusName: string;
  bonusDescription: string;
  bonusEffect: CivBonusEffect;
  defaultPersonality: PersonalityTrait[];
}> = {
  'trade-dominance': {
    bonusName: 'Merchant Princes',
    bonusDescription: 'Trade routes yield +2 gold',
    bonusEffect: { type: 'trade_route_bonus', bonusGold: 2 },
    defaultPersonality: ['trader', 'diplomatic'],
  },
  'naval-supremacy': {
    bonusName: 'Sea Lords',
    bonusDescription: 'Naval units gain +1 vision',
    bonusEffect: { type: 'naval_bonus', visionBonus: 1 },
    defaultPersonality: ['trader', 'aggressive'],
  },
  scholarly: {
    bonusName: 'Academies of State',
    bonusDescription: 'Research progresses 15% faster',
    bonusEffect: { type: 'extra_tech_speed', speedMultiplier: 1.15 },
    defaultPersonality: ['diplomatic'],
  },
  expansionist: {
    bonusName: 'Frontier Legions',
    bonusDescription: 'Military units train 20% faster',
    bonusEffect: { type: 'faster_military', speedMultiplier: 1.2 },
    defaultPersonality: ['expansionist', 'aggressive'],
  },
  stealth: {
    bonusName: 'Shadow Ministries',
    bonusDescription: 'Spies gain experience faster',
    bonusEffect: { type: 'espionage_growth', experienceBonus: 1 },
    defaultPersonality: ['diplomatic', 'aggressive'],
  },
  'wonder-craft': {
    bonusName: 'Monuments of Glory',
    bonusDescription: 'Legendary wonder rewards are 25% stronger',
    bonusEffect: { type: 'wonder_rewards', rewardMultiplier: 1.25 },
    defaultPersonality: ['diplomatic', 'trader'],
  },
};

export function normalizeCustomCivDefinition(def: CustomCivDefinition): CivDefinition {
  const trait = CUSTOM_CIV_PRIMARY_TRAITS[def.primaryTrait];
  const traits = Array.from(new Set([...trait.defaultPersonality, ...def.temperamentTraits])).slice(0, 3);
  return {
    id: def.id,
    name: def.name,
    color: def.color,
    bonusName: trait.bonusName,
    bonusDescription: trait.bonusDescription,
    bonusEffect: trait.bonusEffect,
    personality: {
      traits,
      warLikelihood: traits.includes('aggressive') ? 0.7 : 0.35,
      diplomacyFocus: traits.includes('diplomatic') ? 0.7 : 0.4,
      expansionDrive: traits.includes('expansionist') ? 0.75 : 0.4,
    },
  };
}

export function normalizeCustomCivDefinitions(defs: CustomCivDefinition[]): CivDefinition[] {
  return defs.map(normalizeCustomCivDefinition);
}
```

Create `src/systems/civ-registry.ts`:

```typescript
export function resolveCivDefinition(
  state: Pick<GameState, 'settings'>,
  civType: string,
): CivDefinition | undefined {
  const custom = normalizeCustomCivDefinitions(state.settings.customCivilizations ?? [])
    .find(def => def.id === civType);
  if (custom) return custom;
  return getCivDefinition(civType);
}

export function getPlayableCivDefinitions(
  settings: Pick<GameSettings, 'customCivilizations'> | undefined,
): CivDefinition[] {
  return [
    ...CIV_DEFINITIONS,
    ...normalizeCustomCivDefinitions(settings?.customCivilizations ?? []),
  ];
}
```

Validate:

```typescript
if (temperamentTraits.length < 1 || temperamentTraits.length > 2) {
  throw new Error('Custom civs require one primary trait and 1-2 temperament traits');
}
if (cityNames.length < 6) throw new Error('Custom civs need a real city-name pool');
```

Persist custom civs in two places on purpose:

```typescript
const nextSettings = {
  ...state.settings,
  customCivilizations,
};

// app-level persistence for future new games
await saveSettings(nextSettings);

// in-save persistence so a running campaign keeps its custom civ definitions after load
state.settings = nextSettings;
```

In `src/core/game-state.ts`, extend solo and hot-seat creation paths so `createNewGame(...)` / `createHotSeatGame(...)` accept an optional `customCivilizations` array in their config and resolve civ definitions through `resolveCivDefinition(...)` before falling back to built-in civ definitions.

Also replace direct runtime `getCivDefinition(civ.civType)` lookups in these exact files with `resolveCivDefinition(state, civ.civType)` or `getPlayableCivDefinitions(state.settings)` as appropriate:

- `src/core/game-state.ts`
- `src/core/turn-manager.ts`
- `src/ai/basic-ai.ts`
- `src/main.ts`
- `src/systems/diplomacy-system.ts`
- `src/systems/espionage-system.ts`
- `src/systems/fog-of-war.ts`
- `src/ui/diplomacy-panel.ts`
- `src/ui/turn-handoff.ts`

The goal is that a loaded campaign with `state.settings.customCivilizations` still resolves the same civ names, colors, bonuses, and city-name pools everywhere in live gameplay.

- [ ] **Step 4: Add Wakanda/Avalon and selection wiring**

Update `main.ts`, `civ-definitions.ts`, `civ-select.ts`, `campaign-setup.ts`, and `hotseat-setup.ts` so:

- `loadSettings()` is called in `main.ts` before opening solo or hot-seat setup
- `main.ts` derives `const playableCivs = getPlayableCivDefinitions(storedSettings)` once and passes that into `showCampaignSetup(...)` / `showHotSeatSetup(...)`
- saved `customCivilizations` are passed into the civ picker and custom-civ editor through setup options, not by making UI modules read storage directly
- the chosen custom civ registry is passed into `createNewGame(...)` / `createHotSeatGame(...)`
- hot-seat AI fill and available-player civ pools are derived from `getPlayableCivDefinitions(...)`, not hardcoded `CIV_DEFINITIONS`

In `src/ui/civ-select.ts`, remove the current `panel.innerHTML = html` construction entirely and rebuild the picker with DOM nodes plus `textContent`. The saved custom-civ registry makes this a required standards fix, not optional polish. Also extend the panel API so callers can pass:

```typescript
export interface CivSelectCallbacks {
  onSelect: (civId: string) => void;
  onCreateCustomCiv?: () => void;
}

export interface CivSelectOptions {
  disabledCivs?: string[];
  headerText?: string;
  civDefinitions?: CivDefinition[];
}
```

Use `options.civDefinitions ?? CIV_DEFINITIONS` as the source list so the exact same panel can serve solo setup, hot-seat setup, and future custom-civ editing flows.

Add a `Create Custom Civilization` button with `data-action="create-custom-civ"` to the civ picker. When it saves a new civ, `main.ts` / the active setup flow must reload settings, recompute `getPlayableCivDefinitions(...)`, and reopen the picker so the newly created civ is immediately selectable without restarting setup.

Also extend both setup surfaces to accept those lists explicitly:

```typescript
showCampaignSetup(container, callbacks, { civDefinitions: playableCivs });
showHotSeatSetup(container, callbacks, { civDefinitions: playableCivs });
```

Also update `save-persistence.test.ts` so a loaded campaign can still resolve a selected custom civ by ID after round-trip.

Extend `tests/core/turn-manager.test.ts` with one runtime-regression case:

```typescript
it('processTurn can still resolve a saved custom civ definition after JSON round-trip', () => {
  const state = createNewGame({
    civType: 'custom-sunfolk',
    mapSize: 'small',
    opponentCount: 1,
    gameTitle: 'Runtime Custom Civ',
    customCivilizations: [customCiv],
  });
  const roundTrip = JSON.parse(JSON.stringify(state)) as GameState;
  expect(resolveCivDefinition(roundTrip, 'custom-sunfolk')?.name).toBe('Sunfolk');
  expect(() => processTurn(roundTrip, new EventBus())).not.toThrow();
});
```

- [ ] **Step 5: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/civ-registry.test.ts tests/ui/custom-civ-panel.test.ts tests/ui/civ-select.test.ts tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts tests/systems/civ-definitions.test.ts tests/core/game-state.test.ts tests/core/turn-manager.test.ts tests/storage/save-manager.test.ts tests/storage/save-persistence.test.ts
```

- [ ] **Step 6: Commit the identity systems**

```bash
git add src/systems/civ-registry.ts src/systems/custom-civ-system.ts src/ui/custom-civ-panel.ts src/core/types.ts src/core/game-state.ts src/core/turn-manager.ts src/ai/basic-ai.ts src/main.ts src/storage/save-manager.ts src/systems/civ-definitions.ts src/systems/diplomacy-system.ts src/systems/espionage-system.ts src/systems/fog-of-war.ts src/ui/civ-select.ts src/ui/campaign-setup.ts src/ui/hotseat-setup.ts src/ui/diplomacy-panel.ts src/ui/turn-handoff.ts tests/systems/civ-registry.test.ts tests/ui/custom-civ-panel.test.ts tests/ui/civ-select.test.ts tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts tests/systems/civ-definitions.test.ts tests/core/game-state.test.ts tests/core/turn-manager.test.ts tests/storage/save-manager.test.ts tests/storage/save-persistence.test.ts
git commit -m "feat(m4e): add custom civs and final civ roster"
```

### Task 17: Fix Naming Integrity And Run The Final Balance / UX Consolidation Pass

**Files:**
- Create: `src/systems/city-name-system.ts`
- Modify: `src/systems/civ-definitions.ts`
- Modify: `src/systems/minor-civ-definitions.ts`
- Modify: `src/systems/player-facing-labels.ts`
- Create: `tests/systems/city-name-system.test.ts`
- Create: `tests/integration/m4e-acceptance.test.ts`
- Modify: `tests/ui/council-panel.test.ts`

- [ ] **Step 1: Add failing naming-integrity and final acceptance tests**

Create `tests/systems/city-name-system.test.ts`:

```typescript
it('assigns fantasy civ city names from civ-appropriate pools', () => {
  expect(drawNextCityName('lothlorien', usedNames)).toMatch(/Caras|Lorien|Galadh/);
});

it('avoids duplicate global city names unless a deliberate lore exception exists', () => {
  const used = new Set(['Rome']);
  expect(drawNextCityName('rome', used)).not.toBe('Rome');
});
```

Create `tests/integration/m4e-acceptance.test.ts`:

```typescript
it('keeps council guidance trustworthy after all five slices land', () => {
  expect(panel.textContent).not.toContain('Unknown leak');
  expect(panel.textContent).toContain('Do Now');
});
```

- [ ] **Step 2: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-name-system.test.ts tests/integration/m4e-acceptance.test.ts tests/ui/council-panel.test.ts tests/ui/civ-select.test.ts
```

- [ ] **Step 3: Implement the naming policy as a real system**

Create `src/systems/city-name-system.ts`:

```typescript
export function drawNextCityName(civType: string, usedNames: Set<string>): string {
  const pool = getNamingPoolForCiv(civType);
  for (const name of pool) {
    if (!usedNames.has(name)) return name;
  }
  return `${getCivDefinition(civType)?.name ?? 'City'} ${usedNames.size + 1}`;
}
```

Use it in city founding / civ definitions, and keep `player-facing-labels.ts` aligned with the final naming policy rather than the Slice 1 interim rule.

- [ ] **Step 4: Run the milestone-wide consolidation checks**

Use `tests/integration/m4e-acceptance.test.ts` to lock:

```typescript
expect(councilPanel.textContent).toContain('Do Now');
expect(techPanel.querySelector('[data-era="5"]')).toBeTruthy();
expect(wonderPanel.textContent).toContain('Best fits right now');
expect(civSelect.textContent).toContain('Wakanda');
expect(civSelect.textContent).toContain('Avalon');
```

- [ ] **Step 5: Re-run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-name-system.test.ts tests/integration/m4e-acceptance.test.ts tests/ui/council-panel.test.ts tests/ui/civ-select.test.ts
```

- [ ] **Step 6: Commit the naming fix and final consolidation**

```bash
git add src/systems/city-name-system.ts src/systems/civ-definitions.ts src/systems/minor-civ-definitions.ts src/systems/player-facing-labels.ts tests/systems/city-name-system.test.ts tests/integration/m4e-acceptance.test.ts tests/ui/council-panel.test.ts
git commit -m "feat(m4e): finish naming integrity and final tuning"
```

### Task 18: Final Release Gate For M4e

**Files:**
- Modify: `docs/superpowers/specs/2026-04-08-m4e-the-council-design.md` only if implementation revealed a real spec contradiction
- Modify: `docs/superpowers/plans/2026-04-08-m4e-the-council.md` only if the execution record needs factual correction after implementation

- [ ] **Step 1: Run the final targeted suite**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/council-system.test.ts tests/systems/victory-progress.test.ts tests/ui/council-panel.test.ts tests/ui/primary-action-bar.test.ts tests/ui/game-shell.test.ts tests/ui/campaign-setup.test.ts tests/ui/tech-panel.test.ts tests/core/hotseat-events.test.ts tests/systems/auto-explore-system.test.ts tests/ui/desktop-controls.test.ts tests/ui/fog-leak.test.ts tests/systems/tech-definitions.test.ts tests/systems/tech-system.test.ts tests/systems/legendary-wonder-system.test.ts tests/systems/legendary-wonder-definitions.test.ts tests/ui/wonder-panel.test.ts tests/systems/council-memory.test.ts tests/systems/civ-registry.test.ts tests/ui/custom-civ-panel.test.ts tests/ui/civ-select.test.ts tests/ui/hotseat-setup.test.ts tests/systems/city-name-system.test.ts tests/integration/m4e-council-guidance.test.ts tests/integration/m4e-acceptance.test.ts tests/storage/save-manager.test.ts tests/storage/save-persistence.test.ts
```

- [ ] **Step 2: Run the full suite and build**

```bash
./scripts/run-with-mise.sh yarn test --run
./scripts/run-with-mise.sh yarn build
```

- [ ] **Step 3: Push, open MR, review, merge, and clean up**

```bash
git push origin feature/m4e-slice5-identity-and-personality
```

After merge:

```bash
git fetch origin
git merge-base --is-ancestor <slice-5-head> origin/main
git worktree remove .worktrees/feature-m4e-slice5-identity-and-personality
git branch -d feature/m4e-slice5-identity-and-personality
```

- [ ] **Step 4: Close the milestone only after merge is confirmed on `origin/main`**

Update milestone tracking, confirm the M4e-assigned issues are actually closed, and only then clean up any remaining implementation worktrees.

---

## Spec Coverage Checklist

- Slice 1 setup flow, Council guidance, win framing, grid-view explanation, quest-origin clarity, and interim naming trust are covered by Tasks 1-5.
- Slice 1 also locks mobile/desktop Council access and talk-level behavior differences in Tasks 2 and 5.
- Slice 2 auto-explore, desktop controls, visibility polish, and initial friction-focused balance smoothing are covered by Tasks 6-8.
- Slice 3 late-era tech expansion and wonder prerequisite wiring are covered by Tasks 9-11.
- Slice 4 remaining wonder catalog and overload-safe wonder UX are covered by Tasks 12-14, with the roster locked in docs before code.
- Slice 5 advisor memory/personality, Wakanda/Avalon, custom civs, runtime custom-civ resolution, naming integrity, and final consolidation are covered by Tasks 15-18.
- Privacy, hot-seat safety, DOM safety, and save/load regression coverage are explicitly threaded through every slice.

## Placeholder Scan

This plan intentionally avoids:

- `TODO` / `TBD`
- unnamed helper files
- “similar to prior task” shortcuts
- vague “add tests” instructions without specific target suites
- open-ended balance churn without bounded acceptance checks

## Type And Interface Consistency

These names must stay consistent across implementation:

- `CouncilTalkLevel`
- `CouncilCard`
- `CouncilAgenda`
- `CouncilInterrupt`
- `CouncilState`
- `buildCouncilAgenda(...)`
- `getCouncilInterrupt(...)`
- `formatCityReference(...)`
- `getVictoryProgressSummary(...)`
- `createPrimaryActionBar(...)`
- `SoloSetupConfig`
- `AutoExploreOrder`
- `chooseAutoExploreMove(...)`
- `getQuestOriginLabel(...)`
- `resolveCivDefinition(...)`
- `getPlayableCivDefinitions(...)`
- `CustomCivTraitId`
- `CustomCivDefinition`
- `drawNextCityName(...)`

If implementation needs different names, rename them consistently in every later task before coding.
