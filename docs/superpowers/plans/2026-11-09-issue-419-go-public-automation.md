# Go Public Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically resolve Go public for confirmed human-victim incidents, remove the button/window chore, and keep a read-only reveal record.

**Architecture:** Add one canonical helper that calls the existing `goPublicAboutIncident` executor for newly traced incidents. `processEspionageTurn` invokes it for human victims and emits the existing `espionage:went-public` events. The Espionage panel becomes read-only history; the route copy and notification path change, but the penalty, executor, and AI timing do not.

**Tech Stack:** TypeScript, Vitest, Canvas-free DOM panels, EventBus.

**Spec:** `docs/superpowers/specs/2026-11-09-issue-419-go-public-automation-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/systems/espionage-counterintel.ts` | Add `autoExposeTracedIncidents`; later remove the unused preview API. |
| `src/systems/espionage-turn.ts` | Call the helper after tracing; emit `went-public`. |
| `src/ui/notification-routes/espionage-routes.ts` | Log-only trace copy; automatic reveal copy. |
| `src/presentation/register-espionage-presentation.ts` | Route `incident-traced` through `notifier.log`. |
| `src/ui/espionage-panel.ts` | Read-only incident history; remove action/preview/window. |
| `src/app/controllers/espionage-panel-actions-controller.ts` | Remove `onGoPublic` and denial wiring. |
| `src/systems/espionage-presentation.ts` | Stop re-exporting the retired preview/expiry reads. |
| `tests/systems/espionage-system.test.ts` | Helper, turn integration, panel data. |
| `tests/ui/espionage-panel.test.ts` | Read-only DOM behavior. |
| `tests/presentation/register-espionage-presentation.test.ts` | Log-only trace routing. |
| `tests/app/architecture-boundaries.test.ts` | Pinned presentation export list. |

---

## Task 1: Auto-exposure helper

**Files:**
- Modify: `src/systems/espionage-counterintel.ts`
- Test: `tests/systems/espionage-system.test.ts`

- [ ] **Step 1: Write the failing helper tests**

In `tests/systems/espionage-system.test.ts`, add `autoExposeConfirmedIncidents` to the existing import from `@/systems/espionage-counterintel`:

```ts
import {
  autoExposeConfirmedIncidents,
  getGoPublicDenial,
  getOperationAttribution,
  goPublicAboutIncident,
  recordOperationIncident,
  traceOperationIncidents,
} from '@/systems/espionage-counterintel';
```

Inside `describe('Caught in the Act: reveal and Go public (#419 PR 2)', ...)`, add:

```ts
  it('auto-exposes a traced incident through the canonical executor', () => {
    const w = landedWorld('go-public-auto-helper');
    const traced = traceOperationIncidents(capturedSpyEvidence(w), w.targetId);
    const result = autoExposeConfirmedIncidents(traced.state, w.targetId);

    expect(result.exposures).toEqual([{
      civId: w.targetId,
      culpritCivId: w.attackerId,
      partnerCivIds: w.partnerIds,
      missionType: 'cyber_attack',
    }]);
    const incident = Object.values(result.state.espionage![w.targetId].attributedIncidents!)[0];
    expect(incident.usedTurn).toBe(traced.state.turn);
    const rel = (s: GameState, a: string, b: string) => s.civilizations[a].diplomacy.relationships[b] ?? 0;
    expect(rel(result.state, w.attackerId, w.partnerIds[0]!))
      .toBe(rel(traced.state, w.attackerId, w.partnerIds[0]!) + EXPOSE_SCANDAL_PENALTY);
  });

  it('auto-exposes every traced incident and skips any the executor refuses', () => {
    const w = landedWorld('go-public-auto-multi', 1);
    const secondEvent: OperationLandedEvent = {
      civId: w.attackerId,
      targetCivId: w.targetId,
      cityId: w.cityId,
      missionType: 'misinformation_campaign',
      effect: { kind: 'research-penalty', turns: 10, percent: 20 },
    };
    const seeded = recordOperationIncident({ ...w.state, turn: w.state.turn + 1 }, secondEvent);
    const traced = traceOperationIncidents(capturedSpyEvidence({ ...w, state: seeded }), w.targetId);
    expect(traced.traced).toHaveLength(2);

    const result = autoExposeConfirmedIncidents(traced.state, w.targetId);

    expect(result.exposures).toHaveLength(2);
    expect(result.exposures.map(e => e.missionType).sort())
      .toEqual(['cyber_attack', 'misinformation_campaign']);
  });

  it('leaves a no-partner incident unresolved', () => {
    const w = landedWorld('go-public-auto-no-partners', 0);
    const traced = traceOperationIncidents(capturedSpyEvidence(w), w.targetId);

    const result = autoExposeConfirmedIncidents(traced.state, w.targetId);

    expect(result.exposures).toEqual([]);
    expect(result.state).toBe(traced.state);
    const incident = Object.values(result.state.espionage![w.targetId].attributedIncidents!)[0];
    expect(incident.usedTurn).toBeUndefined();
    expect(getGoPublicDenial(result.state, w.targetId, incident.id)).toBe('no-partners');
  });
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
./scripts/dev.sh test tests/systems/espionage-system.test.ts
```

Expected: FAIL — `autoExposeTracedIncidents` is not exported.

- [ ] **Step 3: Implement the helper**

In `src/systems/espionage-counterintel.ts`, immediately after `goPublicAboutIncident` (after its closing `}` at the end of the function), add:

```ts
export interface AutoExposureResult {
  state: GameState;
  exposures: Array<{
    civId: string;
    culpritCivId: string;
    partnerCivIds: string[];
    missionType: OperationIncident['missionType'];
  }>;
}

/**
 * Automatic Go public for a human victim (#419). Runs the same canonical
 * executor for every traced, unused incident on the victim's ledger, so
 * legality and effects cannot drift; the caller owns event emission.
 */
export function autoExposeConfirmedIncidents(
  state: GameState,
  victimId: string,
): AutoExposureResult {
  let next = state;
  const exposures: AutoExposureResult['exposures'] = [];
  const incidents = Object.values(state.espionage?.[victimId]?.attributedIncidents ?? {})
    .filter(incident => incident.tracedTurn !== undefined && incident.usedTurn === undefined)
    .sort((a, b) => a.landedTurn - b.landedTurn || a.id.localeCompare(b.id));
  for (const incident of incidents) {
    const result = goPublicAboutIncident(next, victimId, incident.id);
    if (!result.ok) continue;
    next = result.state;
    exposures.push({
      civId: victimId,
      culpritCivId: result.culpritCivId,
      partnerCivIds: result.partnerCivIds,
      missionType: result.missionType,
    });
  }
  return { state: next, exposures };
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
./scripts/dev.sh test tests/systems/espionage-system.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/espionage-counterintel.ts tests/systems/espionage-system.test.ts
git commit -m "feat(espionage): add automatic go-public resolution helper"
```

---

## Task 2: Run automation during the espionage turn

**Files:**
- Modify: `src/systems/espionage-turn.ts`
- Test: `tests/systems/espionage-system.test.ts`

- [ ] **Step 1: Write the failing turn-integration tests**

Add these tests inside the same `Caught in the Act` describe:

```ts
  it('automatically exposes a human victim during the espionage turn', () => {
    const w = landedWorld('go-public-auto-turn');
    const state: GameState = {
      ...capturedSpyEvidence(w),
      currentPlayer: w.targetId,
      civilizations: {
        ...w.state.civilizations,
        [w.targetId]: { ...w.state.civilizations[w.targetId], isHuman: true },
      },
    };
    const bus = new EventBus();
    const events: Array<{ civId: string; culpritCivId: string }> = [];
    bus.on('espionage:went-public', event => events.push(event));

    const after = processEspionageTurn(state, bus);
    const incident = Object.values(after.espionage![w.targetId].attributedIncidents!)[0];

    expect(incident.tracedTurn).toBe(after.turn);
    expect(incident.usedTurn).toBe(after.turn);
    expect(events).toEqual([{
      civId: w.targetId,
      culpritCivId: w.attackerId,
      partnerCivIds: w.partnerIds,
      missionType: 'cyber_attack',
    }]);
  });

  it('does not auto-expose an AI victim', () => {
    const w = landedWorld('go-public-auto-ai');
    const state: GameState = { ...capturedSpyEvidence(w), currentPlayer: w.targetId };
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('espionage:went-public', event => events.push(event));

    const after = processEspionageTurn(state, bus);
    const incident = Object.values(after.espionage![w.targetId].attributedIncidents!)[0];

    expect(incident.tracedTurn).toBe(after.turn);
    expect(incident.usedTurn).toBeUndefined();
    expect(events).toEqual([]);
  });

  it('does not auto-expose an eliminated human victim', () => {
    const w = landedWorld('go-public-auto-eliminated');
    const state: GameState = {
      ...capturedSpyEvidence(w),
      currentPlayer: w.targetId,
      civilizations: {
        ...w.state.civilizations,
        [w.targetId]: { ...w.state.civilizations[w.targetId], isHuman: true, isEliminated: true },
      },
    };
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('espionage:went-public', event => events.push(event));

    const after = processEspionageTurn(state, bus);
    const incident = Object.values(after.espionage![w.targetId].attributedIncidents!)[0];

    expect(incident.tracedTurn).toBe(after.turn);
    expect(incident.usedTurn).toBeUndefined();
    expect(events).toEqual([]);
  });

  it('auto-exposes an incident that was already confirmed when it landed', () => {
    const w = landedWorld('go-public-auto-landed-confirmed', 1);
    const evidence = capturedSpyEvidence(w);
    const seeded = recordOperationIncident(
      { ...evidence, currentPlayer: w.targetId, civilizations: {
        ...evidence.civilizations,
        [w.targetId]: { ...evidence.civilizations[w.targetId], isHuman: true },
      } },
      {
        civId: w.attackerId,
        targetCivId: w.targetId,
        cityId: w.cityId,
        missionType: 'misinformation_campaign',
        effect: { kind: 'research-penalty', turns: 10, percent: 20 },
      },
    );
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('espionage:went-public', event => events.push(event));

    const after = processEspionageTurn({ ...seeded, turn: seeded.turn + 1 }, bus);
    const incident = Object.values(after.espionage![w.targetId].attributedIncidents!)
      .find(i => i.missionType === 'misinformation_campaign');

    expect(incident?.tracedTurn).toBeDefined();
    expect(incident?.usedTurn).toBeDefined();
    expect(events).toHaveLength(1);
  });
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
./scripts/dev.sh test tests/systems/espionage-system.test.ts
```

Expected: FAIL — the human incident has no `usedTurn` and no `went-public` event.

- [ ] **Step 3: Wire the helper into `processEspionageTurn`**

In `src/systems/espionage-turn.ts`, update the counterintel import:

```ts
import {
  autoExposeConfirmedIncidents,
  handleSpyCaptured,
  handleSpyExpelled,
  recordOperationIncident,
  traceOperationIncidents,
  turnCapturedSpy,
} from './espionage-counterintel';
```

Replace the final trace loop with:

```ts
  // #419 PR 2: evidence that arrived this turn reveals the actor of an earlier
  // operation exactly once. A human victim's forced Go-public response is
  // resolved immediately (#419 automation); the reveal stays viewer-scoped.
  for (const victimId of Object.keys(state.espionage ?? {})) {
    const outcome = traceOperationIncidents(state, victimId);
    state = outcome.state;
    for (const traced of outcome.traced) bus.emit('espionage:incident-traced', traced);
    const victim = state.civilizations[victimId];
    if (victim?.isHuman && !victim.isEliminated) {
      const auto = autoExposeConfirmedIncidents(state, victimId);
      state = auto.state;
      for (const exposure of auto.exposures) bus.emit('espionage:went-public', exposure);
    }
  }
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
./scripts/dev.sh test tests/systems/espionage-system.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/espionage-turn.ts tests/systems/espionage-system.test.ts
git commit -m "feat(espionage): auto-resolve go public for human victims"
```

---

## Task 3: Log-only trace and automatic reveal copy

**Files:**
- Modify: `src/ui/notification-routes/espionage-routes.ts`
- Modify: `src/presentation/register-espionage-presentation.ts`
- Test: `tests/presentation/register-espionage-presentation.test.ts`

- [ ] **Step 1: Write the failing presentation test**

In `tests/presentation/register-espionage-presentation.test.ts`, inside the espionage presentation describe, add:

```ts
  it('logs a traced incident without interrupting and never instructs a Go public click (#419)', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { civilizations: { rome: { name: 'Rome' } } as never, cities: {} as never },
    });

    registerEspionagePresentation(bus, ctx);
    bus.emit('espionage:incident-traced', {
      civId: 'rome',
      incidentId: 'i-1',
      actorCivId: 'carthage',
      missionType: 'cyber_attack',
      cityId: 'city-a',
    });

    expect(ctx.log).toHaveBeenCalledWith('rome', expect.not.stringContaining('Go public'), 'warning');
    expect(ctx.deliver).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
./scripts/dev.sh test tests/presentation/register-espionage-presentation.test.ts
```

Expected: FAIL — the handler still uses `ctx.deliver`, and the message says “Go public while the story is fresh.”

- [ ] **Step 3: Change the route copy and the handler**

In `src/ui/notification-routes/espionage-routes.ts`, replace the `routeIncidentTraced` sink line with:

```ts
    sink(civId, `Your agents traced the attack on ${cityName} to ${actorName}.`, 'warning');
```

Replace the `routeWentPublic` actor line with:

```ts
    if (role === 'actor') sink(civId, `The world now knows ${culpritName} was behind the attack. ${event.partnerCivIds.length} of their partners trust them less.`, 'success');
```

In `src/presentation/register-espionage-presentation.ts`, change the trace handler to:

```ts
    bus.on('espionage:incident-traced', event => {
      // The trace is a persistent record; the automatic went-public event is the
      // interruptive reveal (#419 automation).
      routeIncidentTraced(ctx.session.getState(), event, ctx.notifier.log);
    }),
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
./scripts/dev.sh test tests/presentation/register-espionage-presentation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/notification-routes/espionage-routes.ts src/presentation/register-espionage-presentation.ts tests/presentation/register-espionage-presentation.test.ts
git commit -m "feat(espionage): log traced incidents and reveal automatic exposure"
```

---

## Task 4: Read-only Espionage history

### Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| No confirmed incident | — | No “Caught in the Act” section. |
| Confirmed incident, eligible partners | — (automatic) | Row shows actor/mission/city/turn and “Exposed automatically on turn N.” No button. The went-public toast/log also fires. |
| Confirmed incident, no eligible partners | — | Row shows “No treaty partners could be swayed.” No button. |
| Legacy traced incident whose window passed | — | Row shows “The moment has passed; the story is old news.” No button. |

### Misleading UI Risks

- “Exposed automatically” must appear only when `usedTurn` is set; a no-partner or legacy-expired row must use its own line.
- No `go-public` action may remain in the DOM, including after reopening the panel.
- Do not list partners by name or reveal unmet civilizations.
- Do not show “last chance” or response-window copy anywhere.

### Interaction Replay Checklist

- Open the panel before confirmation: no section.
- Confirm an incident automatically, then open the panel: exposed row, no button.
- Reopen the panel: the same read-only row, still no button.
- Confirm a second incident: both rows appear, each with its own resolution.
- No-partner incident: note only, no button.
- Clicking anywhere in the row does nothing.

**Files:**
- Modify: `src/ui/espionage-panel.ts`
- Modify: `src/app/controllers/espionage-panel-actions-controller.ts`
- Test: `tests/ui/espionage-panel.test.ts`
- Test: `tests/systems/espionage-system.test.ts`

- [ ] **Step 1: Rewrite the panel tests for read-only history**

Replace the `espionage-panel: Caught in the Act (#419 PR 2)` describe block in `tests/ui/espionage-panel.test.ts` with:

```ts
describe('espionage-panel: Caught in the Act (#419 automation)', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  function tracedState(withPartner: boolean, usedTurn?: number): GameState {
    const state = makeEspUiState();
    state.civilizations['ai-third'] = { ...state.civilizations['ai-egypt'], id: 'ai-third', name: 'Third' };
    if (withPartner) {
      state.civilizations['ai-egypt'].diplomacy.treaties = [{ type: 'trade_agreement', civA: 'ai-egypt', civB: 'ai-third', turnsRemaining: -1 }];
    }
    state.espionage!.player.attributedIncidents = {
      'i-1': {
        id: 'i-1', actorCivId: 'ai-egypt', targetCivId: 'player', cityId: 'city-player-1',
        missionType: 'cyber_attack', landedTurn: 9, tracedTurn: 10,
        ...(usedTurn !== undefined ? { usedTurn } : {}),
      },
      'i-2': { id: 'i-2', actorCivId: 'ai-third', targetCivId: 'player', cityId: null, missionType: 'misinformation_campaign', landedTurn: 9 },
    };
    return state;
  }

  it('lists only traced incidents and renders the automatic exposure without an action', () => {
    const panel = createEspionagePanel(tracedState(true, 10), { onClose: () => {} });
    const text = collectText(panel);

    expect(text).toContain('Egypt');
    expect(text).not.toContain('Third');
    expect(text).toContain('Exposed automatically on turn 10.');
    expect(text).not.toContain('last chance');
    expect(findAll(panel, el => el.dataset?.action === 'go-public')).toHaveLength(0);
  });

  it('explains when no treaty partners could be swayed and offers no button', () => {
    const panel = createEspionagePanel(tracedState(false), { onClose: () => {} });
    const text = collectText(panel);

    expect(text).toContain('No treaty partners could be swayed.');
    expect(text).not.toContain('Exposed automatically');
    expect(findAll(panel, el => el.dataset?.action === 'go-public')).toHaveLength(0);
  });

  it('shows no section at all when nothing has been traced', () => {
    const panel = createEspionagePanel(makeEspUiState(), { onClose: () => {} });
    expect(findAll(panel, el => el.dataset?.section === 'traced-incidents')).toHaveLength(0);
  });
});
```

Update the panel-data test in `tests/systems/espionage-system.test.ts`:

```ts
  it('the panel data never names the actor until evidence exists, then reports the automatic exposure', () => {
    const w = landedWorld('go-public-panel');
    const asVictim = (s: GameState): GameState => ({ ...s, currentPlayer: w.targetId });
    expect(getEspionagePanelData(asVictim(w.state)).tracedIncidents).toEqual([]);
    const traced = traceOperationIncidents(capturedSpyEvidence(w), w.targetId);
    const auto = autoExposeConfirmedIncidents(traced.state, w.targetId);
    const rows = getEspionagePanelData(asVictim(auto.state)).tracedIncidents;
    expect(rows).toHaveLength(1);
    expect(rows[0].actorName).toBe(w.state.civilizations[w.attackerId].name);
    expect(rows[0].resolution).toBe('exposed');
    expect(rows[0].exposedTurn).toBe(auto.state.turn);
  });
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
./scripts/dev.sh test tests/ui/espionage-panel.test.ts tests/systems/espionage-system.test.ts
```

Expected: FAIL — the panel still has `onGoPublic`, buttons, and the old data fields.

- [ ] **Step 3: Implement the read-only panel**

In `src/ui/espionage-panel.ts`:

1. Replace the `tracedIncidents` type with:

```ts
  tracedIncidents: Array<{
    incidentId: string;
    actorName: string;
    missionLabel: string;
    cityName: string;
    landedTurn: number;
    resolution: 'exposed' | 'no-partners' | 'expired';
    exposedTurn: number | null;
  }>;
```

2. Remove `onGoPublic?: (incidentId: string) => void;` from `EspionagePanelCallbacks`.

3. Replace `appendTracedIncidents` with:

```ts
function appendTracedIncidents(
  parent: HTMLElement,
  incidents: EspionagePanelData['tracedIncidents'],
): void {
  if (incidents.length === 0) return;
  const block = createEl('section');
  block.dataset.section = 'traced-incidents';
  appendSectionHeader(block, 'Caught in the Act', 'Attacks your agents traced to a named civilization. Confirmed evidence is handled automatically.');
  for (const incident of incidents) {
    const row = createEl('div');
    row.dataset.incident = incident.incidentId;
    row.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:6px 0;font-size:11px;';
    row.appendChild(createEl('div', `${incident.actorName} · ${incident.missionLabel} · ${incident.cityName} · turn ${incident.landedTurn}`));
    const noteText = incident.resolution === 'exposed'
      ? `Exposed automatically on turn ${incident.exposedTurn}.`
      : incident.resolution === 'no-partners'
        ? 'No treaty partners could be swayed.'
        : 'The moment has passed; the story is old news.';
    const note = createEl('div', noteText);
    note.style.cssText = 'opacity:0.72;';
    row.appendChild(note);
    block.appendChild(row);
  }
  parent.appendChild(block);
}
```

4. Update its caller from `appendTracedIncidents(panel, data.tracedIncidents, callbacks);` to `appendTracedIncidents(panel, data.tracedIncidents);`.

5. Replace the data mapping with:

```ts
    tracedIncidents: Object.values(civEsp.attributedIncidents ?? {})
      .filter(incident => incident.tracedTurn !== undefined)
      .sort((a, b) => b.landedTurn - a.landedTurn || a.id.localeCompare(b.id))
      .map(incident => {
        const used = incident.usedTurn !== undefined;
        const denial = used ? null : getGoPublicDenial(state, state.currentPlayer, incident.id);
        return {
          incidentId: incident.id,
          actorName: state.civilizations[incident.actorCivId]?.name ?? incident.actorCivId,
          missionLabel: MISSION_LABELS[incident.missionType] ?? incident.missionType,
          cityName: (incident.cityId ? state.cities[incident.cityId]?.name : undefined) ?? 'your empire',
          landedTurn: incident.landedTurn,
          resolution: used ? 'exposed' as const : denial === 'no-partners' ? 'no-partners' as const : 'expired' as const,
          exposedTurn: incident.usedTurn ?? null,
        };
      }),
```

6. Remove `getGoPublicExpiryTurn`, `getGoPublicPreview`, and `GO_PUBLIC_DENIAL_MESSAGES` from the `espionage-presentation` import; keep `getGoPublicDenial`.

In `src/app/controllers/espionage-panel-actions-controller.ts`:

1. Remove `goPublicAboutIncident` from the `@/systems/espionage-system` import.
2. Remove the `GO_PUBLIC_DENIAL_MESSAGES` import.
3. Delete the entire `onGoPublic` callback block (the `// #419 PR 2` comment through its closing `},`).

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```bash
./scripts/dev.sh test tests/ui/espionage-panel.test.ts tests/systems/espionage-system.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/espionage-panel.ts src/app/controllers/espionage-panel-actions-controller.ts tests/ui/espionage-panel.test.ts tests/systems/espionage-system.test.ts
git commit -m "feat(espionage): show go-public history without an action"
```

---

## Task 5: Retire the preview/expiry read surface

**Files:**
- Modify: `src/systems/espionage-counterintel.ts`
- Modify: `src/systems/espionage-presentation.ts`
- Test: `tests/app/architecture-boundaries.test.ts`

- [ ] **Step 1: Update the architecture test expectation**

In `tests/app/architecture-boundaries.test.ts`, replace the pinned string with:

```ts
      .toBe("export { getOperationAttribution, getGoPublicDenial, GO_PUBLIC_DENIAL_MESSAGES } from './espionage-counterintel' export type { OperationAttribution, GoPublicDenialReason } from './espionage-counterintel'");
```

Rename the test to:

```ts
  it('presentation re-exports only the read surface (catalog + probability + the attribution and remaining Go public read queries)', () => {
```

- [ ] **Step 2: Run the architecture test to verify it fails**

Run:

```bash
./scripts/dev.sh test tests/app/architecture-boundaries.test.ts
```

Expected: FAIL — the barrel still exports the retired reads.

- [ ] **Step 3: Remove the retired preview API**

In `src/systems/espionage-counterintel.ts`, delete the `GoPublicPreview` interface and `getGoPublicPreview` function. Keep `getGoPublicExpiryTurn` (used by `getGoPublicDenial`) and `GO_PUBLIC_DENIAL_MESSAGES`.

In `src/systems/espionage-presentation.ts`, replace the two counterintel export lines with:

```ts
export { getOperationAttribution, getGoPublicDenial, GO_PUBLIC_DENIAL_MESSAGES } from './espionage-counterintel';
export type { OperationAttribution, GoPublicDenialReason } from './espionage-counterintel';
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```bash
./scripts/dev.sh test tests/app/architecture-boundaries.test.ts tests/systems/espionage-system.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/espionage-counterintel.ts src/systems/espionage-presentation.ts tests/app/architecture-boundaries.test.ts
git commit -m "refactor(espionage): retire the go-public preview read"
```

---

## Task 6: Full verification and PR

**Files:** none

- [ ] **Step 1: Run the source-rule check**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/espionage-counterintel.ts src/systems/espionage-turn.ts src/ui/notification-routes/espionage-routes.ts src/presentation/register-espionage-presentation.ts src/ui/espionage-panel.ts src/app/controllers/espionage-panel-actions-controller.ts src/systems/espionage-presentation.ts
```

Expected: no output, exit 0.

- [ ] **Step 2: Run the mirrored focused suites**

Run:

```bash
./scripts/dev.sh test tests/systems/espionage-system.test.ts tests/ui/espionage-panel.test.ts tests/presentation/register-espionage-presentation.test.ts tests/app/architecture-boundaries.test.ts tests/ui/notification-routing.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the build and impact check**

Run:

```bash
./scripts/dev.sh build
./scripts/dev.sh verify-impact
```

Expected: build succeeds; `verify-impact` lists the changed files and requires `src-rules`, `mirrored-tests`, `build`, and `durable-full`. Run each required command it lists.

- [ ] **Step 4: Run durable full verification**

Run:

```bash
./scripts/run-with-mise.sh yarn verify:launch full --wait
./scripts/dev.sh durable-status
```

Expected: `STATUS: passed` for the current HEAD.

- [ ] **Step 5: Review the diff and commit any final fixes**

Run:

```bash
git status --short --branch
git diff --stat origin/main...HEAD
```

Expected: clean tree after the task commits; review the stat for scope.

- [ ] **Step 6: Push and open the PR**

Run:

```bash
./scripts/sync-main.sh
./scripts/push-branch.sh
./scripts/pr-body.sh new 419-go-public-automation --issue 419
```

Write the PR body with the gameplay impact, tests run, and the durability evidence, then:

```bash
./scripts/pr-body.sh check 419-go-public-automation
./scripts/pr-body.sh create 419-go-public-automation --title "feat(espionage): automate the go-public response" --base main --head opencode/issue-419-go-public-automation
```

Do not merge without explicit authorization.
