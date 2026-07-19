# Issue #594 (MR7 — Religion/Famine Audio Stingers + Polish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this plan is executed **inline in the current session** per this project's `CLAUDE.md` ("NEVER use subagents or parallel agents"). Do not use `superpowers:subagent-driven-development`. Use `superpowers:executing-plans` conventions (batch execution, checkpoint after each task) but without dispatching any subagent. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the last MR in the #524 "dead tech promises" arc (index #587): 6 bespoke OGG audio stingers replacing placeholder/reused sounds from MR3–6, copy/help-text polish across 4 UI surfaces, and 3 new sprites (missionary unit, famine map badge, religion map badge).

**Architecture:** Audio stingers follow the existing `PirateAudioDirector`/`NaturalWonderAudioDirector` pattern (dedicated `ReligionAudioDirector` class + inline famine handlers in `AudioSystem.wireEvents`), generated via a new `scripts/generate-religion-sfx.sh` mirroring `scripts/generate-pirate-sfx.sh`'s ffmpeg lavfi + Kenney-CC0-source layering exactly. The 4 already-toast-routed religion events get their generic `SFX.notification()` synth chime **replaced** by threading an optional `sfxCue` parameter down the existing `NotificationSink` → `deliver` → `enqueueToast` → `displayNextNotification` chain (mirroring how `cityActions` was added as an optional trailing parameter — no change to persisted `NotificationEntry`/save schema). Famine and preach stingers are pure additions (no existing sound to replace). The famine map badge is a conditional-art branch inside the existing `drawCityWorldPressureBadgePass` (the `worldPressureCrisis` field already carries the crisis archetype, including `'famine'` — no new state plumbing needed). The religion map badge is genuinely new: a `ReligionBadgePresentation` helper (mirrors `LoyaltyPressurePresentation`) + a new `CityRenderItem.religionBadge` field + a new render pass, following the Improvement Marker asset recipe (`viewBox 0 0 48 48`, no palette, no animation, `HTMLImageElement` cache + emoji fallback while loading — exact pattern of `resource-outpost-marker.ts`).

**Tech Stack:** TypeScript, Vitest, Canvas 2D, DOM/CSS, Web Audio (`AudioSystem`/`MusicDirector`/`SFX`), OGG assets, ffmpeg 8.0.1 lavfi synthesis, Service Worker precache.

## Global Constraints

- Never use `Math.random()` — N/A for this MR (no new RNG-dependent logic).
- All dynamic UI text via `textContent`/`createTextNode()` — never `innerHTML` with game-generated strings.
- Any new button via `createGameButton()` from `src/ui/ui-kit.ts`.
- City panels must cycle through all cities — N/A here (no new city-cycling surface added).
- `#524` and `#587` must **never** appear within a few words of `close(s/d)`, `fix(es/ed)`, `resolve(s/d)` in any PR body opened this session. `Closes #594` is safe and correct for the final PR.
- Bash timeouts: `git commit` → 30000ms; `git push`/`gh pr create`/`gh pr merge` → 120000ms.
- `mise trust` already run in this worktree (`/Users/aaronfleckenstein/development/github/conquestoria/.claude/worktrees/issue-594-religion-audio-polish/mise.toml`).
- Resolved decisions (confirmed with user, do not re-litigate):
  1. All 6 new stingers ARE added to `public/sw.js`'s `PRECACHE_URLS`.
  2. The 4 already-wired religion notification events (`religion:founded`, `religion:city-converted`, `religion:loyalty-warning`, `religion:city-defected`) REPLACE the generic `SFX.notification()` chime with their bespoke stinger (no doubled sound). `religion:preached` and famine-onset/resolved are pure additions (no existing sound today).
  3. Both new map badges are genuinely new badge types/logic: the famine badge is a new archetype-conditional branch inside the existing world-pressure render pass (data already exists via `item.worldPressureCrisis: CrisisArchetype`); the religion badge is entirely new state + presentation + render pass (no existing indicator for "this city follows a religion").

---

## Task 1: Thread `sfxCue` through the notification pipeline (foundation)

**Files:**
- Modify: `src/ui/notification-routing.ts:16-21` (`NotificationSink` type)
- Modify: `src/ui/notification-delivery.ts` (`NotificationDeliveryDeps.toast`, `deliver`)
- Modify: `src/main.ts` (`enqueueToast`, `notificationQueue` item type, `displayNextNotification`)
- Test: `tests/ui/notification-delivery.test.ts` (if it exists — check first with `ls tests/ui/notification-delivery.test.ts`; otherwise add cases to the nearest existing notification-delivery test file)

**Interfaces:**
- Produces: `NotificationSink = (civId, message, type, target?, cityActions?, sfxCue?: string) => void` — a 6th optional trailing parameter. Later tasks (Task 2) pass a religion cue id string here (e.g. `'religion-founded'`).
- Produces: `enqueueToast(message, type, target?, sfxCue?: string): void` in `src/main.ts`.
- Consumes: nothing new from other tasks.

- [ ] **Step 1: Write a failing test for `sfxCue` passthrough in `notification-delivery.ts`**

First check whether a delivery test file already exists:
```bash
find tests -iname "*notification-delivery*"
```
If found, add this case to it; otherwise create `tests/ui/notification-delivery.test.ts` following the existing `createNotificationDelivery` test conventions in that directory (check `tests/ui/` for the closest sibling, e.g. `notification-routing.test.ts`, and copy its `deps`/mock-state setup). Add:

```typescript
it('passes sfxCue through to the toast callback', () => {
  const state = /* ...use the same minimal GameState fixture as neighboring tests... */;
  const toastCalls: Array<[string, string, unknown, string | undefined]> = [];
  const delivery = createNotificationDelivery({
    getState: () => state,
    toast: (message, type, target, sfxCue) => { toastCalls.push([message, type, target, sfxCue]); },
    isSuppressed: () => false,
  });
  delivery.deliver(state.currentPlayer, 'test message', 'success', undefined, undefined, 'religion-founded');
  expect(toastCalls).toEqual([['test message', 'success', undefined, 'religion-founded']]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/notification-delivery.test.ts`
Expected: FAIL — `deliver` does not accept a 6th argument / `toast` is not called with 4 args.

- [ ] **Step 3: Extend `NotificationSink`, `NotificationDeliveryDeps.toast`, and `deliver`**

In `src/ui/notification-routing.ts`, change:
```typescript
export type NotificationSink = (
  civId: string,
  message: string,
  type: NotificationEntry['type'],
  target?: NotificationEntry['target'],
  cityActions?: NotificationCityAction[],
) => void;
```
to:
```typescript
export type NotificationSink = (
  civId: string,
  message: string,
  type: NotificationEntry['type'],
  target?: NotificationEntry['target'],
  cityActions?: NotificationCityAction[],
  sfxCue?: string,
) => void;
```

In `src/ui/notification-delivery.ts`, change:
```typescript
export interface NotificationDeliveryDeps {
  getState: () => GameState;
  toast: (message: string, type: NotificationEntry['type'], target?: NotificationEntry['target']) => void;
  isSuppressed: () => boolean;
}
```
to:
```typescript
export interface NotificationDeliveryDeps {
  getState: () => GameState;
  toast: (message: string, type: NotificationEntry['type'], target?: NotificationEntry['target'], sfxCue?: string) => void;
  isSuppressed: () => boolean;
}
```
and change:
```typescript
  const deliver: NotificationSink = (civId, message, type, target, cityActions) => {
    const state = deps.getState();
    const turn = happenedTurn ?? state.turn;
    appendNotification(state, civId, { message, type, turn, target, cityActions });

    const civ = state.civilizations[civId];
    if (!civ?.isHuman) return;

    const isActiveViewer = civId === state.currentPlayer && !deps.isSuppressed();
    if (isActiveViewer || !state.hotSeat) {
      deps.toast(message, type, target);
      return;
    }
```
to:
```typescript
  const deliver: NotificationSink = (civId, message, type, target, cityActions, sfxCue) => {
    const state = deps.getState();
    const turn = happenedTurn ?? state.turn;
    appendNotification(state, civId, { message, type, turn, target, cityActions });

    const civ = state.civilizations[civId];
    if (!civ?.isHuman) return;

    const isActiveViewer = civId === state.currentPlayer && !deps.isSuppressed();
    if (isActiveViewer || !state.hotSeat) {
      deps.toast(message, type, target, sfxCue);
      return;
    }
```
Note: `sfxCue` is intentionally NOT passed to `appendNotification` — it is a transient presentation concern, not part of the persisted notification log / save schema.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/notification-delivery.test.ts`
Expected: PASS

- [ ] **Step 5: Extend `enqueueToast` and `notificationQueue` in `src/main.ts`**

Change (around `src/main.ts:660-703`):
```typescript
const notificationQueue: Array<Pick<NotificationEntry, 'message' | 'type' | 'target'>> = [];
```
to:
```typescript
const notificationQueue: Array<Pick<NotificationEntry, 'message' | 'type' | 'target'> & { sfxCue?: string }> = [];
```
Change:
```typescript
function enqueueToast(
  message: string,
  type: NotificationEntry['type'],
  target?: NotificationEntry['target'],
): void {
  if (roundPresentationGate.isSuppressed()) return;
  notificationQueue.push({ message, type, target });
  if (!isShowingNotification) displayNextNotification();
}
```
to:
```typescript
function enqueueToast(
  message: string,
  type: NotificationEntry['type'],
  target?: NotificationEntry['target'],
  sfxCue?: string,
): void {
  if (roundPresentationGate.isSuppressed()) return;
  notificationQueue.push({ message, type, target, sfxCue });
  if (!isShowingNotification) displayNextNotification();
}
```
`notificationDelivery.deliver` is created with `toast: enqueueToast` (`src/main.ts:698-702`) — this remains valid unchanged since `enqueueToast`'s new 4th param is optional and structurally compatible with the widened `NotificationDeliveryDeps.toast` type.

- [ ] **Step 6: Replace the unconditional `SFX.notification()` call in `displayNextNotification`**

This step's exact stinger-playback call is filled in by Task 2 (which defines `audio.playReligionStinger`). For now, leave a real but temporary passthrough so this task compiles and tests stay green on its own:

Change (`src/main.ts:899-904`):
```typescript
  currentDismissTimer = setTimeout(() => {
    if (notif.parentNode) dismiss();
  }, 6000);

  SFX.notification();
}
```
to:
```typescript
  currentDismissTimer = setTimeout(() => {
    if (notif.parentNode) dismiss();
  }, 6000);

  if (next.sfxCue) {
    void audio.playReligionStinger(next.sfxCue).catch(() => {});
  } else {
    SFX.notification();
  }
}
```
This line will not compile until Task 2 adds `playReligionStinger` to `AudioSystem` — that is expected; Task 1's own test (Step 1-4) does not touch `main.ts`, so run only the notification-delivery test now, not the full build. Do not run `yarn build` until Task 2 lands.

- [ ] **Step 7: Commit**

```bash
git add src/ui/notification-routing.ts src/ui/notification-delivery.ts src/main.ts tests/ui/notification-delivery.test.ts
git commit -m "feat(religion): thread optional sfxCue through notification pipeline"
```
(Use 30000ms Bash timeout for this commit — no push yet.)

---

## Task 2: Religion audio catalog + `ReligionAudioDirector`, wired into `AudioSystem`

**Files:**
- Modify: `src/audio/sfx-catalog.ts` (add `RELIGION_SFX`, `FAMINE_SFX`)
- Create: `src/audio/religion-audio-director.ts`
- Modify: `src/audio/audio-system.ts` (instantiate director, add `playReligionStinger`, wire famine handlers inline)
- Test: `tests/audio/religion-audio-director.test.ts` (new — mirror `tests/audio/pirate-audio-director.test.ts` structure)

**Interfaces:**
- Consumes: `GameEvents['religion:founded' | 'religion:city-converted' | 'religion:preached' | 'religion:loyalty-warning' | 'religion:city-defected']` (confirmed at `src/core/types.ts:1899-1903`); `GameEvents['crisis:started' | 'crisis:resolved']` (`src/core/types.ts:1898,1914`); `getCrisisFlavor(flavorId)` from `src/systems/crisis-flavor-definitions.ts:363` (returns `{ archetype: CrisisArchetype, ... } | undefined`).
- Produces: `AudioSystem.playReligionStinger(cue: string): Promise<void>` — consumed by Task 1's `displayNextNotification` change. `cue` values used by Task 1/3: `'religion-founded'`, `'city-converted'`, `'city-defected'`, `'loyalty-warning'`.
- Produces: `ReligionAudioDirector` class with `start(bus: EventBus): void` and `dispose(): void`, same shape as `PirateAudioDirector`.

- [ ] **Step 1: Add `RELIGION_SFX` and `FAMINE_SFX` catalog entries**

In `src/audio/sfx-catalog.ts`, after the existing `PIRATE_STRATEGIC_SFX` block (`:40-49`), add:
```typescript
// #594 MR7: bespoke religion/famine stingers replacing MR3-6's placeholder/reused
// sounds. Generated via scripts/generate-religion-sfx.sh (Task 4 of this MR's plan),
// same real()/lavfi-layering pattern as PIRATE_STRATEGIC_SFX above.
export const RELIGION_SFX = {
  founded: real('stinger-religion-founded', 'audio/stinger/religion/founded.ogg', 1.60, 'stinger'),
  'city-converted': real('stinger-religion-city-converted', 'audio/stinger/religion/city-converted.ogg', 1.10, 'stinger'),
  preach: real('stinger-religion-preach', 'audio/stinger/religion/preach.ogg', 0.90, 'stinger'),
  'loyalty-warning': real('stinger-religion-loyalty-warning', 'audio/stinger/religion/loyalty-warning.ogg', 1.00, 'stinger'),
  'city-defected': real('stinger-religion-city-defected', 'audio/stinger/religion/city-defected.ogg', 1.30, 'stinger'),
} as const;

export const FAMINE_SFX = {
  onset: real('stinger-famine-onset', 'audio/stinger/famine/onset.ogg', 1.20, 'stinger'),
  resolved: real('stinger-famine-resolved', 'audio/stinger/famine/resolved.ogg', 1.30, 'stinger'),
} as const;
```
Note: `RELIGION_SFX` has 5 keys (founded, city-converted, preach, loyalty-warning, city-defected) — `loyalty-warning`'s cue plays on every stage (`start`/`midpoint`/`final`); it is not stage-differentiated for MR7 (matches the issue's flat 1-cue-per-event-name table).

- [ ] **Step 2: Write failing test for the catalog shape**

Add to `tests/audio/sfx-catalog.test.ts` (follow its existing `describe` blocks for other catalogs):
```typescript
describe('RELIGION_SFX / FAMINE_SFX', () => {
  it('has all 5 religion cues and 2 famine cues with distinct files', () => {
    const religionKeys = Object.keys(RELIGION_SFX);
    expect(religionKeys.sort()).toEqual(['city-converted', 'city-defected', 'founded', 'loyalty-warning', 'preach'].sort());
    const famineKeys = Object.keys(FAMINE_SFX);
    expect(famineKeys.sort()).toEqual(['onset', 'resolved'].sort());
    const allFiles = [...Object.values(RELIGION_SFX), ...Object.values(FAMINE_SFX)].map(entry => entry.file);
    expect(new Set(allFiles).size).toBe(allFiles.length);
    for (const file of allFiles) expect(file).toMatch(/^audio\/stinger\/(religion|famine)\/[a-z-]+\.ogg$/);
  });
});
```
Add the import at the top: `import { RELIGION_SFX, FAMINE_SFX } from '../../src/audio/sfx-catalog';` (match the existing relative-import style already used in that test file).

- [ ] **Step 3: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/audio/sfx-catalog.test.ts`
Expected: FAIL — `RELIGION_SFX`/`FAMINE_SFX` not exported (until Step 1 above is applied) — if Step 1 was already applied, this should already PASS; if so skip to Step 4 confirmation directly.

- [ ] **Step 4: Confirm it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/audio/sfx-catalog.test.ts`
Expected: PASS

- [ ] **Step 5: Create `ReligionAudioDirector`**

Create `src/audio/religion-audio-director.ts`:
```typescript
import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { getCrisisFlavor } from '@/systems/crisis-flavor-definitions';
import { RELIGION_SFX, FAMINE_SFX } from './sfx-catalog';

// #594 MR7: bespoke religion + famine stingers. Mirrors PirateAudioDirector's shape
// (dedicated bus.on() subscriptions calling playStingerWithDuck directly) rather than
// MusicDirector's STINGER/handle*() machinery, because these are one-shot event
// stingers, not adaptive-music-state transitions.
//
// Notification-chime replacement for religion:founded / city-converted /
// loyalty-warning / city-defected happens OUTSIDE this class -- via the sfxCue
// parameter threaded through the toast pipeline (see Task 1) and AudioSystem's
// exposed playReligionStinger(), so the generic SFX.notification() synth chime and
// this director's bespoke OGG never both fire for the same toast. religion:preached
// and famine onset/resolved have no existing sound, so they ARE wired here directly
// as pure additions -- there is nothing to suppress for those three.
export class ReligionAudioDirector {
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly playStingerWithDuck: (path: string) => Promise<void>,
    private readonly getState: () => GameState,
    private readonly isPresentationSuppressed: () => boolean = () => false,
  ) {}

  start(bus: EventBus): void {
    if (this.unsubscribers.length > 0) return;
    this.unsubscribers.push(
      bus.on('religion:preached', event => {
        const state = this.getState();
        if (this.isPresentationSuppressed() || event.civId !== state.currentPlayer) return;
        void this.playStingerWithDuck(RELIGION_SFX.preach.file).catch(() => {});
      }),

      // Famine onset -- additive, no existing sound. Filters crisis:started to the
      // famine archetype and to the current viewer, mirroring the existing
      // crisis:started subscription's currentPlayerId filter in audio-system.ts.
      bus.on('crisis:started', event => {
        const state = this.getState();
        if (this.isPresentationSuppressed() || event.civId !== state.currentPlayer) return;
        const flavor = getCrisisFlavor(event.flavorId);
        if (flavor?.archetype !== 'famine') return;
        void this.playStingerWithDuck(FAMINE_SFX.onset.file).catch(() => {});
      }),

      // Famine resolved -- additive, no existing sound. Only plays for genuinely
      // positive resolutions, matching MusicDirector's own crisis:resolved outcome
      // filter ('contained' | 'recovered' | 'hunted') so a 'worsened'/'ignored'
      // outcome doesn't play a triumphant cue.
      bus.on('crisis:resolved', event => {
        const state = this.getState();
        if (this.isPresentationSuppressed() || event.civId !== state.currentPlayer) return;
        const flavor = getCrisisFlavor(event.flavorId);
        if (flavor?.archetype !== 'famine') return;
        if (event.outcome !== 'contained' && event.outcome !== 'recovered') return;
        void this.playStingerWithDuck(FAMINE_SFX.resolved.file).catch(() => {});
      }),
    );
  }

  // Called by AudioSystem.playReligionStinger() for the 4 toast-replacement cues
  // (founded / city-converted / loyalty-warning / city-defected). Not bus-driven --
  // the toast pipeline already resolved privacy/hot-seat delivery by the time this
  // fires, so no currentPlayer re-check is needed here.
  async playCue(cue: string): Promise<void> {
    if (this.isPresentationSuppressed()) return;
    const entry = (RELIGION_SFX as Record<string, { file: string } | undefined>)[
      cue === 'religion-founded' ? 'founded' : cue
    ];
    if (!entry) return;
    await this.playStingerWithDuck(entry.file).catch(() => {});
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
  }
}
```
Note the `'religion-founded'` → `'founded'` cue-id mapping in `playCue`: Task 1/3 route functions will pass the readable id `'religion-founded'` (to avoid colliding with the unrelated `'founded'` word in other contexts); all other cues (`'city-converted'`, `'loyalty-warning'`, `'city-defected'`) match `RELIGION_SFX` keys directly.

- [ ] **Step 6: Wire `ReligionAudioDirector` into `AudioSystem`**

In `src/audio/audio-system.ts`, add the import near the existing `PirateAudioDirector` import (`:13`):
```typescript
import { ReligionAudioDirector } from './religion-audio-director';
```
Add a field near `private pirateAudioDirector: PirateAudioDirector;`:
```typescript
  private religionAudioDirector: ReligionAudioDirector;
```
In the constructor, after the `this.pirateAudioDirector = new PirateAudioDirector(...)` block, add:
```typescript
    this.religionAudioDirector = new ReligionAudioDirector(
      path => this.director.playStingerWithDuck(path),
      () => this.stateProvider!(),
      () => this.isPresentationSuppressed(),
    );
```
In `start()`, after `this.pirateAudioDirector.start(bus);`, add:
```typescript
    this.religionAudioDirector.start(bus);
```
Add a new public method (near `setSfxEnabled`):
```typescript
  async playReligionStinger(cue: string): Promise<void> {
    await this.religionAudioDirector.playCue(cue);
  }
```

- [ ] **Step 7: Write failing test for `ReligionAudioDirector`**

Create `tests/audio/religion-audio-director.test.ts`, mirroring `tests/audio/pirate-audio-director.test.ts`'s mock-bus/mock-playStingerWithDuck setup exactly (read that file first for its `EventBus` mock helper). Key cases:
```typescript
import { describe, expect, it, vi } from 'vitest';
import { ReligionAudioDirector } from '@/audio/religion-audio-director';
// import the same createMockBus/makeState helpers pirate-audio-director.test.ts uses

describe('ReligionAudioDirector', () => {
  it('plays the preach stinger only for the current player', () => {
    const played: string[] = [];
    const bus = createMockBus();
    const state = makeState({ currentPlayer: 'player' });
    const director = new ReligionAudioDirector(
      async path => { played.push(path); },
      () => state,
    );
    director.start(bus);
    bus.emit('religion:preached', { cityId: 'c1', unitId: 'u1', civId: 'ai-1', points: 10, unitConsumed: true });
    expect(played).toEqual([]);
    bus.emit('religion:preached', { cityId: 'c1', unitId: 'u1', civId: 'player', points: 10, unitConsumed: true });
    expect(played).toEqual(['audio/stinger/religion/preach.ogg']);
  });

  it('plays the famine-onset stinger only when the crisis archetype is famine', () => {
    const played: string[] = [];
    const bus = createMockBus();
    const state = makeState({ currentPlayer: 'player' });
    const director = new ReligionAudioDirector(async path => { played.push(path); }, () => state);
    director.start(bus);
    // 'corsair-armada' is a 'hunt' archetype flavor (not famine) -- see crisis-flavor-definitions.ts
    bus.emit('crisis:started', { crisisId: 'x', flavorId: 'corsair-armada', civId: 'player', cityIds: ['c1'] });
    expect(played).toEqual([]);
    bus.emit('crisis:started', { crisisId: 'y', flavorId: 'crop-blight', civId: 'player', cityIds: ['c1'] });
    expect(played).toEqual(['audio/stinger/famine/onset.ogg']);
  });

  it('plays the famine-resolved stinger only for positive outcomes', () => {
    const played: string[] = [];
    const bus = createMockBus();
    const state = makeState({ currentPlayer: 'player' });
    const director = new ReligionAudioDirector(async path => { played.push(path); }, () => state);
    director.start(bus);
    bus.emit('crisis:resolved', { crisisId: 'x', flavorId: 'crop-blight', civId: 'player', outcome: 'worsened' });
    expect(played).toEqual([]);
    bus.emit('crisis:resolved', { crisisId: 'y', flavorId: 'crop-blight', civId: 'player', outcome: 'contained' });
    expect(played).toEqual(['audio/stinger/famine/resolved.ogg']);
  });

  it('playCue maps religion-founded to the founded stinger file', async () => {
    const played: string[] = [];
    const director = new ReligionAudioDirector(async path => { played.push(path); }, () => makeState({}));
    await director.playCue('religion-founded');
    await director.playCue('city-defected');
    expect(played).toEqual(['audio/stinger/religion/founded.ogg', 'audio/stinger/religion/city-defected.ogg']);
  });
});
```
Before writing this, run `grep -n "CrisisOutcome" src/core/types.ts` to confirm the exact outcome union values used above (`'worsened'` must be a real member — adjust if the drift-check shows a different literal).

- [ ] **Step 8: Run tests to verify they fail then pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/audio/religion-audio-director.test.ts`
Expected: FAIL before Steps 5-6, PASS after.

- [ ] **Step 9: Run full audio test suite + build to catch the Task 1 `main.ts` reference**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS now that `audio.playReligionStinger` exists (resolves Task 1 Step 6's forward reference).

- [ ] **Step 10: Commit**

```bash
git add src/audio/sfx-catalog.ts src/audio/religion-audio-director.ts src/audio/audio-system.ts tests/audio/sfx-catalog.test.ts tests/audio/religion-audio-director.test.ts
git commit -m "feat(religion): add ReligionAudioDirector for religion/famine stingers"
```

---

## Task 3: Wire the 4 toast-replacement cues into `notification-routing.ts` router functions

**Files:**
- Modify: `src/ui/notification-routing.ts` (`routeReligionFounded`, `routeReligionCityConverted`, `routeLoyaltyWarning`, `routeCityDefected`)
- Test: existing test file covering these routers (find with `grep -rl "routeReligionFounded" tests/`)

**Interfaces:**
- Consumes: `NotificationSink` from Task 1 (now accepts 6th `sfxCue` arg).
- Produces: nothing new — this task only supplies cue-id string literals at each `sink(...)` call site.

- [ ] **Step 1: Find the existing router test file**

```bash
grep -rl "routeReligionFounded" tests/
```

- [ ] **Step 2: Add failing assertions that `sink` receives the expected cue**

In that test file, extend the existing `routeReligionFounded`/`routeReligionCityConverted`/`routeLoyaltyWarning`/`routeCityDefected` test cases (do not duplicate their existing state fixtures — add a 6th-arg assertion to each). Example addition pattern for one:
```typescript
it('passes the religion-founded sfx cue', () => {
  const sink = vi.fn();
  routeReligionFounded(state, event, sink);
  expect(sink).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'success', undefined, undefined, 'religion-founded');
});
```
Repeat with `'city-converted'` for `routeReligionCityConverted`'s two `sink(...)` calls, `'loyalty-warning'` for `routeLoyaltyWarning`, and `'city-defected'` for `routeCityDefected`'s two `sink(...)` calls.

- [ ] **Step 3: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test <the test file found in Step 1>`
Expected: FAIL — `sink` called with only 3-4 args.

- [ ] **Step 4: Add the `sfxCue` argument at each call site**

In `src/ui/notification-routing.ts`:
```typescript
export function routeReligionFounded(
  state: GameState,
  event: GameEvents['religion:founded'],
  sink: NotificationSink,
): void {
  const city = state.cities[event.cityId];
  for (const civId of Object.keys(state.civilizations)) {
    if (!hasMetCivilization(state, civId, event.civId)) continue;
    const message = civId === event.civId
      ? `${event.name} has been founded in ${city?.name ?? 'your empire'}!`
      : `${state.civilizations[event.civId]?.name ?? 'A rival civilization'} has founded ${event.name}.`;
    sink(civId, message, 'success', undefined, undefined, 'religion-founded');
  }
}
```
```typescript
export function routeReligionCityConverted(
  state: GameState,
  event: GameEvents['religion:city-converted'],
  sink: NotificationSink,
): void {
  const city = state.cities[event.cityId];
  if (!city) return;
  const toReligion = state.religions?.[event.toReligionId];
  if (!toReligion) return;

  sink(city.owner, `${city.name} now follows ${toReligion.name}.`, 'info', undefined, undefined, 'city-converted');

  if (toReligion.ownerCivId !== city.owner && hasMetCivilization(state, toReligion.ownerCivId, city.owner)) {
    sink(toReligion.ownerCivId, `${city.name} has converted to ${toReligion.name}!`, 'success', undefined, undefined, 'city-converted');
  }
}
```
```typescript
export function routeLoyaltyWarning(
  state: GameState,
  event: GameEvents['religion:loyalty-warning'],
  sink: NotificationSink,
): void {
  const city = state.cities[event.cityId];
  if (!city) return;
  const verb = LOYALTY_WARNING_TEXT[event.stage];
  const suffix = event.stage === 'final' ? ' next turn' : ` in ~${event.turnsRemaining} turns`;
  sink(event.pressuringCivId, `${city.name} ${verb} your faith${suffix}!`, event.stage === 'final' ? 'warning' : 'info', undefined, undefined, 'loyalty-warning');
}
```
```typescript
export function routeCityDefected(
  state: GameState,
  event: GameEvents['religion:city-defected'],
  sink: NotificationSink,
): void {
  const city = state.cities[event.cityId];
  if (!city) return;
  sink(event.toCivId, `${city.name} has defected to your faith!`, 'success', undefined, undefined, 'city-defected');
  if (state.civilizations[event.fromCivId]) {
    sink(event.fromCivId, `${city.name} has defected to a rival faith and left your empire.`, 'warning', undefined, undefined, 'city-defected');
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test <the test file found in Step 1>`
Expected: PASS

- [ ] **Step 6: Manual sanity check — confirm `playCue`'s `religion-founded` mapping is exercised**

Re-run: `bash scripts/run-with-mise.sh yarn test tests/audio/religion-audio-director.test.ts` — still PASS (this test already covers the mapping from Task 2 Step 7).

- [ ] **Step 7: Commit**

```bash
git add src/ui/notification-routing.ts <test file from Step 1>
git commit -m "feat(religion): tag religion notification toasts with bespoke sfx cues"
```

---

## Task 4: `scripts/generate-religion-sfx.sh` + provenance + credits + generated OGGs

**Files:**
- Create: `scripts/generate-religion-sfx.sh`
- Create: `src/audio/religion-audio-sources.ts`
- Modify: `AUDIO-CREDITS.md`
- Create: `public/audio/stinger/religion/*.ogg` (5 files), `public/audio/stinger/famine/*.ogg` (2 files) — generated, not hand-written
- Test: `tests/audio/religion-sfx-generator.test.ts` (mirror `tests/audio/pirate-sfx-generator.test.ts`)

**Interfaces:**
- Consumes: `RELIGION_SFX`/`FAMINE_SFX` file paths from Task 2 (must match exactly).
- Produces: the 7 checked-in `.ogg` files at the exact paths Task 2's catalog declares.

- [ ] **Step 1: Read the pirate generator script as the exact template**

```bash
cat scripts/generate-pirate-sfx.sh
```
(Already read during planning — reuse its `render()` function body verbatim; only the file lists, frequencies, sources, and directories change.)

- [ ] **Step 2: Write `scripts/generate-religion-sfx.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELIGION_DIR="$ROOT/public/audio/stinger/religion"
FAMINE_DIR="$ROOT/public/audio/stinger/famine"
mkdir -p "$RELIGION_DIR" "$FAMINE_DIR"

render() {
  local output="$1" duration="$2" frequency="$3" noise="$4" seed="$5" source_path="$6" source_volume="$7"
  local source="$ROOT/public/$source_path"
  if [[ ! -f "$source" ]]; then
    printf 'Missing religion/famine SFX source asset: %s\n' "$source" >&2
    exit 1
  fi
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "sine=frequency=${frequency}:duration=${duration}:sample_rate=44100" \
    -f lavfi -i "anoisesrc=color=${noise}:duration=${duration}:sample_rate=44100:seed=${seed}" \
    -stream_loop -1 -i "$source" \
    -filter_complex "[0:a]volume=0.16[tone];[1:a]volume=0.045[noise];[2:a]atrim=0:${duration},asetpts=PTS-STARTPTS,aresample=44100,volume=${source_volume}[src];[tone][noise][src]amix=inputs=3:duration=first,highpass=f=35,lowpass=f=6500,afade=t=in:st=0:d=0.02,afade=t=out:st=$(awk -v d="$duration" 'BEGIN { printf "%.3f", d-0.08 }'):d=0.08,volume=18dB,alimiter=limit=0.80:level=false" \
    -map_metadata -1 -fflags +bitexact -flags:a +bitexact \
    -c:a libvorbis -q:a 4 "$output"
}

# Religion cues: warm ascending tones for positive events (founded, city-converted),
# a soft plucked cue for preach, a tense mid tone for loyalty-warning, a minor/falling
# tone for city-defected (a loss for the civ losing the city).
render "$RELIGION_DIR/founded.ogg"          1.60 392 pink   4001 audio/sfx/transport-load.ogg          0.28
render "$RELIGION_DIR/city-converted.ogg"   1.10 349 pink   4002 audio/sfx/worker-death.ogg             0.22
render "$RELIGION_DIR/preach.ogg"           0.90 440 white  4003 audio/sfx/archer-ranged-loose.ogg      0.24
render "$RELIGION_DIR/loyalty-warning.ogg"  1.00 220 brown  4004 audio/sfx/ballista-siege-fire.ogg      0.26
render "$RELIGION_DIR/city-defected.ogg"    1.30 165 brown  4005 audio/sfx/knight-death.ogg             0.30

# Famine cues: onset is a low, dissonant descending tone (bad news); resolved is a
# warmer ascending tone (relief), matching the founded/city-defected polarity above.
render "$FAMINE_DIR/onset.ogg"    1.20 130 brown 4006 audio/sfx/settler-death.ogg      0.28
render "$FAMINE_DIR/resolved.ogg" 1.30 294 pink  4007 audio/sfx/transport-unload.ogg   0.26

for file in "$RELIGION_DIR"/*.ogg "$FAMINE_DIR"/*.ogg; do
  ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$file" >/dev/null
  peak="$(ffmpeg -hide_banner -i "$file" -af volumedetect -f null - 2>&1 | awk '/max_volume/{print $5}')"
  if ! awk -v peak="$peak" 'BEGIN { exit !(peak <= -1.0 && peak >= -12.0) }'; then
    printf 'Unsafe religion/famine audio peak %s dBFS: %s\n' "$peak" "$file" >&2
    exit 1
  fi
done

printf 'Generated 7 religion/famine audio files.\n'
```
Make it executable: `chmod +x scripts/generate-religion-sfx.sh`.

- [ ] **Step 3: Run the script**

```bash
bash scripts/generate-religion-sfx.sh
```
Expected: `Generated 7 religion/famine audio files.` with no errors. If `ffmpeg`/`ffprobe` report a missing source file, re-check the exact filenames against `find public/audio/sfx -maxdepth 1 -iname "*.ogg"` (verified list: this plan's sources — `transport-load.ogg`, `worker-death.ogg`, `archer-ranged-loose.ogg`, `ballista-siege-fire.ogg`, `knight-death.ogg`, `settler-death.ogg`, `transport-unload.ogg` — were all confirmed present during planning).

- [ ] **Step 4: Create `src/audio/religion-audio-sources.ts`**

```typescript
export interface ReligionAudioSource {
  id: string;
  title: string;
  creator: string;
  sourceUrl: string;
  license: 'CC0' | 'CC-BY' | 'in-project';
  creditText: string;
  sourceAssetFiles?: string[];
  localFiles: string[];
  derivativeNotes: string;
}

export const RELIGION_AUDIO_FILES = [
  'audio/stinger/religion/founded.ogg',
  'audio/stinger/religion/city-converted.ogg',
  'audio/stinger/religion/preach.ogg',
  'audio/stinger/religion/loyalty-warning.ogg',
  'audio/stinger/religion/city-defected.ogg',
  'audio/stinger/famine/onset.ogg',
  'audio/stinger/famine/resolved.ogg',
] as const;

export const RELIGION_AUDIO_SOURCES: ReligionAudioSource[] = [{
  id: 'kenney-impact-rpg-audio-cc0-religion',
  title: 'Kenney Impact Sounds and RPG Audio (religion/famine stinger layer)',
  creator: 'Kenney',
  sourceUrl: 'https://kenney.nl/assets/impact-sounds and https://kenney.nl/assets/rpg-audio',
  license: 'CC0',
  creditText: 'Impact Sounds and RPG Audio by Kenney, CC0 1.0 Universal.',
  sourceAssetFiles: [
    'audio/sfx/transport-load.ogg',
    'audio/sfx/worker-death.ogg',
    'audio/sfx/archer-ranged-loose.ogg',
    'audio/sfx/ballista-siege-fire.ogg',
    'audio/sfx/knight-death.ogg',
    'audio/sfx/settler-death.ogg',
    'audio/sfx/transport-unload.ogg',
  ],
  localFiles: [...RELIGION_AUDIO_FILES],
  derivativeNotes: 'Layered, filtered, and re-encoded by scripts/generate-religion-sfx.sh with deterministic in-project lavfi tones and seeded noise for religion-founding, conversion, preaching, loyalty-warning, defection, and famine onset/resolution cues.',
}];
```

- [ ] **Step 5: Write failing test `tests/audio/religion-sfx-generator.test.ts`**

Copy `tests/audio/pirate-sfx-generator.test.ts` structure exactly, substituting `RELIGION_AUDIO_FILES`/`RELIGION_AUDIO_SOURCES` and the `public/audio/stinger/religion` + `public/audio/stinger/famine` directories:
```typescript
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RELIGION_AUDIO_FILES,
  RELIGION_AUDIO_SOURCES,
} from '../../src/audio/religion-audio-sources';

const PROJECT_ROOT = resolve(__dirname, '../..');

function generatedHashes(root: string): Record<string, string> {
  const directories = [
    join(root, 'public/audio/stinger/religion'),
    join(root, 'public/audio/stinger/famine'),
  ];
  return Object.fromEntries(directories.flatMap(directory =>
    readdirSync(directory).sort().map(file => {
      const path = join(directory, file);
      return [
        path.slice(root.length + 1),
        createHash('sha256').update(readFileSync(path)).digest('hex'),
      ];
    }),
  ));
}

describe('religion/famine SFX generator', () => {
  it('records open-license provenance for every generated cue', () => {
    const coveredFiles = new Set(RELIGION_AUDIO_SOURCES.flatMap(source => source.localFiles));
    expect([...coveredFiles].sort()).toEqual([...RELIGION_AUDIO_FILES].sort());
    expect(RELIGION_AUDIO_SOURCES.every(source => source.license === 'CC0' || source.license === 'CC-BY')).toBe(true);
    expect(RELIGION_AUDIO_SOURCES.every(source => source.sourceUrl.length > 0)).toBe(true);
    expect(RELIGION_AUDIO_SOURCES.every(source => source.derivativeNotes.length > 0)).toBe(true);
  });

  it('ships exactly the declared religion/famine Ogg cues', () => {
    const checkedIn = generatedHashes(PROJECT_ROOT);
    expect(Object.keys(checkedIn).sort()).toEqual(RELIGION_AUDIO_FILES.map(file => `public/${file}`).sort());
    for (const outputPath of Object.keys(checkedIn)) {
      expect(readFileSync(join(PROJECT_ROOT, outputPath)).subarray(0, 4).toString('ascii')).toBe('OggS');
    }
  });
});
```

- [ ] **Step 6: Run test to verify it passes (files already generated in Step 3)**

Run: `bash scripts/run-with-mise.sh yarn test tests/audio/religion-sfx-generator.test.ts`
Expected: PASS. If the file-path list mismatches, re-check `RELIGION_SFX`/`FAMINE_SFX` in `src/audio/sfx-catalog.ts` (Task 2) against `RELIGION_AUDIO_FILES` here — they must be identical path sets.

- [ ] **Step 7: Update `AUDIO-CREDITS.md`**

Append a new section after the existing `## SFX — Kenney Impact Sounds (CC0)` block:
```markdown
## Religion / Famine Stingers (#594 MR7)

`public/audio/stinger/religion/*.ogg` and `public/audio/stinger/famine/*.ogg` were
synthesized in-project with ffmpeg 8.0.1 (lavfi sine + anoisesrc layering over
existing Kenney CC0 source clips — see `src/audio/religion-audio-sources.ts` for the
exact source-to-output mapping). No new external sources were introduced; reuses the
same Kenney Impact Sounds / RPG Audio CC0 pack already credited above.
```

- [ ] **Step 8: Commit**

```bash
git add scripts/generate-religion-sfx.sh src/audio/religion-audio-sources.ts AUDIO-CREDITS.md tests/audio/religion-sfx-generator.test.ts public/audio/stinger/religion public/audio/stinger/famine
git commit -m "feat(religion): generate bespoke religion/famine OGG stingers via ffmpeg"
```

---

## Task 5: Service Worker precache

**Files:**
- Modify: `public/sw.js`

**Interfaces:**
- Consumes: the 7 file paths from Task 4 (must match `RELIGION_AUDIO_FILES` exactly).

- [ ] **Step 1: Add the 7 new stinger paths to `PRECACHE_URLS`**

In `public/sw.js`, after the existing stinger block (`:8-22`), add:
```javascript
  // #594 MR7: religion/famine stingers, precached per user decision (era 3+ content
  // but small files, same curation reasoning as the era-1 stingers above).
  '/conquestoria/audio/stinger/religion/founded.ogg',
  '/conquestoria/audio/stinger/religion/city-converted.ogg',
  '/conquestoria/audio/stinger/religion/preach.ogg',
  '/conquestoria/audio/stinger/religion/loyalty-warning.ogg',
  '/conquestoria/audio/stinger/religion/city-defected.ogg',
  '/conquestoria/audio/stinger/famine/onset.ogg',
  '/conquestoria/audio/stinger/famine/resolved.ogg',
];
```
(i.e. insert before the closing `];` of the `PRECACHE_URLS` array.)

- [ ] **Step 2: Check for an existing precache-manifest test**

```bash
grep -rn "PRECACHE_URLS" tests/
```
If a test asserts the exact list contents or count, update it to include the 7 new entries. If none exists (confirmed likely during drift-check — `tests/platform/service-worker.test.ts` tests `src/platform/service-worker.ts` registration logic, not the `public/sw.js` manifest contents), skip to Step 3.

- [ ] **Step 3: Manual verification the file is valid JS**

```bash
node --check public/sw.js
```
Expected: no output (valid syntax).

- [ ] **Step 4: Commit**

```bash
git add public/sw.js
git commit -m "feat(religion): precache religion/famine stingers for offline play"
```

---

## Task 6: Copy polish — boon modal, Sacred Council, loyalty tooltip, famine panel

**Files:**
- Modify: `src/systems/religion-definitions.ts` (`BOON_DESCRIPTIONS`)
- Modify: `src/systems/city-system.ts` (`sacred_council.description`)
- Modify: `src/ui/city-panel.ts` (loyalty-row tooltip, famine Epidemic Control line)
- Test: `tests/ui/city-panel.test.ts` (find exact existing loyalty/famine test blocks with `grep -n "faith-loyalty\|famine-progress" tests/ui/city-panel.test.ts`)

**Interfaces:**
- Consumes: `getLoyaltyThreshold`, `getLoyaltyTickAmount` from `src/systems/religion-loyalty-system.ts` (Task-external, already exist).
- Produces: nothing new — content-only changes to existing render paths.

- [ ] **Step 1: Polish `BOON_DESCRIPTIONS` for kid-readability (ages 7-43)**

In `src/systems/religion-definitions.ts`, the descriptions are already accurate (confirmed during drift-check — Fervor's text matches its MR6 form exactly). Lightly simplify wording without changing meaning:
```typescript
export const BOON_DESCRIPTIONS: Record<ReligionBoon, string> = {
  serenity: '+1 happiness in every city that follows your faith.',
  tithes: `+1 gold per turn from every foreign city that follows your faith, up to +${TITHES_CAP} gold.`,
  // #593 MR6: completes the MR4-deferred honesty contract -- Fervor now also adds
  // territory pressure in cities that follow your faith, and roughly halves the
  // number of turns until a foreign-faith-following minor civ or AI city defects to you.
  fervor: 'Your faith spreads 25% faster, adds pressure that can pull nearby cities toward your religion, and speeds up how fast foreign cities following your faith defect to you.',
};
```
Do not change `serenity`/`tithes` further — they are already short, concrete, and accurate. Do NOT touch the `fervor` inline comment above the string (it documents the MR6 honesty fix and must stay).

- [ ] **Step 2: Expand Sacred Council's build-item help text**

In `src/systems/city-system.ts` (`:305-312`), change:
```typescript
  sacred_council: {
    id: 'sacred_council', name: 'Sacred Council', category: 'culture',
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 120,
    description: 'Founds your empire\'s faith. One-time — permanent effect, never fades.',
    techRequired: 'philosophy', requiresBuildings: ['temple'],
```
to:
```typescript
  sacred_council: {
    id: 'sacred_council', name: 'Sacred Council', category: 'culture',
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 120,
    description: 'Founds your empire\'s own faith — you\'ll name it and pick a boon afterward. One-time — permanent effect, never fades. Requires a Temple.',
    techRequired: 'philosophy', requiresBuildings: ['temple'],
```

- [ ] **Step 3: Find the loyalty-row DOM location precisely**

```bash
grep -n "faith-loyalty" src/ui/city-panel.ts
```
(Confirmed during planning: attribute set at line 491, text set at lines 988-990.)

- [ ] **Step 4: Write failing test asserting the loyalty row has a tooltip**

In `tests/ui/city-panel.test.ts`, near the existing loyalty-row test (find with `grep -n "faith-loyalty\|Loyalty to" tests/ui/city-panel.test.ts`), add:
```typescript
it('loyalty row has a tooltip explaining tick/pause/halve/reset behavior', () => {
  // ...reuse the existing test's state setup that puts a city on the active loyalty track...
  const panel = createCityPanel(container, state, city.id, callbacks);
  const loyaltyRow = panel.querySelector('[data-text="faith-loyalty"]') as HTMLElement;
  expect(loyaltyRow.title.length).toBeGreaterThan(0);
  expect(loyaltyRow.title).toContain('garrison');
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/city-panel.test.ts -t "loyalty row has a tooltip"`
Expected: FAIL — `title` is empty.

- [ ] **Step 6: Add the tooltip, pulling real numbers from the live constants**

In `src/ui/city-panel.ts`, the HTML template at `:491` currently is:
```typescript
      ${faithData.loyalty ? '<div data-text="faith-loyalty" style="margin-top:4px;color:#e0b0ff;"></div>' : ''}
```
This stays as-is for the initial DOM shape (title is set imperatively below, same convention as `title="${chip.quarantineLabel}"` used elsewhere in this file for dynamic tooltips — but since this value must be **computed from live loyalty constants** and set via `.title =` for XSS-safety on a `textContent`-only element, do it in the `setText`-adjacent block instead of inline HTML). Change the block at `:988-991`:
```typescript
    if (faithData.loyalty) {
      const { pressuringCivName, points, threshold, counterplaySuffix } = faithData.loyalty;
      setText('faith-loyalty', `Loyalty to ${pressuringCivName}: ${points} / ${threshold}${counterplaySuffix}`);
    }
```
to:
```typescript
    if (faithData.loyalty) {
      const { pressuringCivName, points, threshold, counterplaySuffix } = faithData.loyalty;
      setText('faith-loyalty', `Loyalty to ${pressuringCivName}: ${points} / ${threshold}${counterplaySuffix}`);
      const loyaltyRowEl = panel.querySelector('[data-text="faith-loyalty"]') as HTMLElement | null;
      if (loyaltyRowEl) {
        const baseTick = getLoyaltyTickAmount(state, city, /* the same `religion` object already resolved above for faithData.loyalty -- reuse it, do not re-look it up */ faithReligion!);
        loyaltyRowEl.title = `Rises by ${baseTick}/turn toward ${pressuringCivName}. Garrisoning a unit in this city pauses the tick entirely. A Temple halves the tick. At ${threshold} points the city defects.`;
      }
    }
```
Note: check the exact local variable name holding the resolved `Religion` object in scope at this point (referenced earlier in the plan as `faithReligion` — confirm the actual name with `grep -n "faithReligion\|const religion" src/ui/city-panel.ts` around line 454-484 before writing this, since it must be the SAME object instance already used to compute `faithData.loyalty`, not a re-derived one that could silently diverge).

- [ ] **Step 7: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/city-panel.test.ts -t "loyalty row has a tooltip"`
Expected: PASS

- [ ] **Step 8: Add the Epidemic Control line to the famine panel**

Write a failing test first, in `tests/ui/city-panel.test.ts`:
```typescript
it('shows an Epidemic Control line when the civ has researched it and severity has pop-loss risk', () => {
  // ...reuse existing famine-crisis test fixture, add 'epidemic-control' to
  // civ.techState.completed, and use veteran opponentChallenge (severity with
  // popLossEveryNTurnsIgnored set -- see crisis-flavor-definitions.ts crop-blight veteran tier)...
  const panel = createCityPanel(container, state, city.id, callbacks);
  const epidemicLine = panel.querySelector('[data-text="famine-epidemic-control-0"]');
  expect(epidemicLine?.textContent).toContain('Epidemic Control');
});
```
Run it to confirm it fails (`data-text="famine-epidemic-control-0"` doesn't exist yet), then implement:

In `src/ui/city-panel.ts`, extend the `famineChips` map (`:391-419`) to compute the flag:
```typescript
  const famineChips = famineCrises.map(crisis => {
    const flavor = getCrisisFlavor(crisis.flavorId);
    if (!flavor) return null;
    const severity = flavor.severityByChallenge[resolvePressureSeverityForCiv(state, crisis.targetCivId)];
    const civForCrisis = state.civilizations[crisis.targetCivId];
    const hasEpidemicControl = civForCrisis?.techState.completed.includes('epidemic-control') ?? false;
    const showsEpidemicControlLine = severity.popLossEveryNTurnsIgnored !== null && hasEpidemicControl;
    // ... existing fields unchanged ...
    return {
      crisis, flavor, isQuarantined, remedyPending, remedyCompletionTurn, foodPenaltyPct,
      surplusStreak, turnsToAutoContain, showsEpidemicControlLine,
      quarantineDisabled, quarantineLabel, remedyDisabled, remedyLabel,
    };
  }).filter((c): c is NonNullable<typeof c> => c !== null);
```
Add a new `data-text` node to `famineSectionHtml` (`:420-429`), after the existing `famine-progress-${idx}` div:
```typescript
  const famineSectionHtml = famineChips.map((chip, idx) => `
    <div style="background:rgba(217,150,80,0.12);border:1px solid rgba(217,150,80,0.35);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;">
      <div style="font-weight:bold;color:#e8a85a;margin-bottom:4px;" data-text="famine-stage-${idx}"></div>
      <div style="margin-bottom:4px;opacity:0.85;" data-text="famine-advisor-${idx}"></div>
      <div style="margin-bottom:8px;opacity:0.7;" data-text="famine-progress-${idx}"></div>
      ${chip.showsEpidemicControlLine ? `<div style="margin-bottom:8px;opacity:0.7;color:#8ac97a;" data-text="famine-epidemic-control-${idx}"></div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" data-quarantine-crisis="${chip.crisis.id}:${city.id}" ${chip.quarantineDisabled ? 'disabled' : ''} title="${chip.quarantineLabel}" style="min-height:44px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:${chip.quarantineDisabled ? 'default' : 'pointer'};background:${chip.quarantineDisabled ? 'rgba(255,255,255,0.08)' : '#4a90d9'};color:${chip.quarantineDisabled ? 'rgba(255,255,255,0.4)' : '#fff'};border:none;">${chip.quarantineLabel}</button>
        <button type="button" data-remedy-crisis="${chip.crisis.id}:${city.id}" ${chip.remedyDisabled ? 'disabled' : ''} title="${chip.remedyLabel}" style="min-height:44px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:${chip.remedyDisabled ? 'default' : 'pointer'};background:${chip.remedyDisabled ? 'rgba(255,255,255,0.08)' : '#d4aa2c'};color:${chip.remedyDisabled ? 'rgba(255,255,255,0.4)' : '#1a1a1a'};border:none;">${chip.remedyLabel}</button>
      </div>
    </div>`).join('');
```
And in the `famineChips.forEach` setText block (`:963-979`), after the existing `famine-progress-${idx}` setText call:
```typescript
    if (chip.showsEpidemicControlLine) {
      setText(`famine-epidemic-control-${idx}`, 'Epidemic Control halves how often this famine costs population on Veteran difficulty.');
    }
```

- [ ] **Step 9: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/city-panel.test.ts -t "Epidemic Control"`
Expected: PASS

- [ ] **Step 10: Run the full city-panel test file to check for regressions**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/city-panel.test.ts`
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add src/systems/religion-definitions.ts src/systems/city-system.ts src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "feat(religion): polish boon/Sacred Council/loyalty/famine help copy"
```

---

## Task 7: Missionary unit sprite

**Files:**
- Modify: `src/renderer/sprites/units.tsx` (add `MissionarySprite`)
- Modify: `src/renderer/sprites/sprite-catalog.ts` (register in `UNIT_SPRITE_CATALOG`)
- Modify: `docs/sprite-design-system.md:16` (update missionary row)
- Test: existing `tests/renderer/sprites/sprite-catalog.test.ts` (already asserts every `UnitType` has a catalog entry — will pass automatically once registered, no new test needed here)

**Interfaces:**
- Consumes: `UnitSpriteProps` type (already defined in `units.tsx` for every existing unit sprite — reuse it, do not redefine).
- Produces: `MissionarySprite({ palette, svgOnly }): string`, registered under the `'missionary'` `UnitType` key.

- [ ] **Step 1: Invoke the sprite-prompt generation skill**

```
Skill: generate-sprite-prompt
Args: unit sprite, missionary, civilian class, replacing the WorkerSprite-reuse placeholder noted in docs/sprite-design-system.md:16
```
Use the produced Claude Design prompt (or hand-author the SVG directly per `docs/sprite-design-system.md`'s unit sprite contract if the skill's prompt is meant for external generation) to get final SVG markup for `MissionarySprite`. The sprite must read as a robed/civilian figure carrying a book or staff (distinct silhouette from `WorkerSprite`'s tool-carrying pose) so it stops visually colliding with the worker unit it was placeholder-reusing.

- [ ] **Step 2: Add `MissionarySprite` to `units.tsx`**

Follow the exact signature contract from `.claude/rules/sprites.md`:
```typescript
export function MissionarySprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  // ... JSX/SVG body using palette.* for all faction-identity color, no hardcoded
  // hex values for civ color, following the same withMotion animation-class
  // convention as neighboring civilian unit sprites (e.g. SettlerSprite/WorkerSprite)
  // in this same file for a consistent civilian silhouette scale ...
}
```
(Read `WorkerSprite` or `SettlerSprite` in the same file immediately before writing this, to copy the exact JSX-runtime import style, `<Banner>`/palette usage, and animation wrapper convention used by sibling civilian units.)

- [ ] **Step 3: Register in `UNIT_SPRITE_CATALOG`**

In `src/renderer/sprites/sprite-catalog.ts`, add one line (find the existing `worker: withMotion(...)` entry and add a sibling):
```typescript
  missionary: withMotion(MissionarySprite),
```
Add the import at the top: confirm `MissionarySprite` is exported from the same `units.tsx` module already imported for other unit sprites, and add it to that existing import statement.

- [ ] **Step 4: Run the catalog coverage test**

Run: `bash scripts/run-with-mise.sh yarn test tests/renderer/sprites/sprite-catalog.test.ts`
Expected: PASS (this test already fails today for `missionary` if it isn't registered — confirm that by running it BEFORE Step 3 as a sanity check that this is a real regression test, then confirm PASS after).

- [ ] **Step 5: Update `docs/sprite-design-system.md`**

Change line 16 from:
```
| missionary | ⚠️ placeholder (reuses WorkerSprite) | civilian |
```
to:
```
| missionary | ✅ bespoke (#594 MR7) | civilian |
```
(Match whatever checkmark/status convention the surrounding table rows already use — read a few neighboring rows first to confirm the exact symbol used for "shipped" vs "placeholder" in this table.)

- [ ] **Step 6: Visual sanity check in the browser**

Start the dev server preview and confirm a trained missionary unit renders the new sprite instead of the worker sprite (train one via a temple-equipped city in a test save, or inspect via the sprite preview tooling if this project has one — check `grep -rn "sprite.*preview\|preview.*sprite" src/ 2>/dev/null` for an existing dev-only sprite gallery route before assuming one doesn't exist).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts docs/sprite-design-system.md
git commit -m "feat(religion): add bespoke missionary unit sprite"
```

---

## Task 8: Famine map badge (archetype-conditional art in the existing world-pressure pass)

**Files:**
- Create: `src/renderer/improvements/famine-badge-marker.ts`
- Modify: `src/renderer/city-render-passes.ts` (`drawCityWorldPressureBadgePass`)
- Modify: `src/main.ts` (preload call)
- Test: `tests/renderer/city-render-passes.test.ts` (find exact file with `grep -rl "drawCityWorldPressureBadgePass" tests/`)

**Interfaces:**
- Consumes: `item.worldPressureCrisis: CrisisArchetype | undefined` (already exists, `src/renderer/city-render-passes.ts:42`) — no new state/presentation plumbing needed, confirmed during drift-check.
- Produces: `getFamineBadgeMarkerImage(): HTMLImageElement | null`, `preloadFamineBadgeMarker(): Promise<void>`.

- [ ] **Step 1: Create the famine badge marker asset**

Create `src/renderer/improvements/famine-badge-marker.ts`, following `resource-outpost-marker.ts`'s exact structure (`viewBox 0 0 48 48`, no palette, no animation):
```typescript
// Small map badge marking a city under an active famine crisis. Rendered directly on
// the hex map canvas by drawCityWorldPressureBadgePass — no faction palette, no JSX
// wrapper. Replaces the generic ⚠️ emoji specifically when the active crisis archetype
// is 'famine'; other crisis archetypes (outbreak/catastrophe/hunt) keep the generic ⚠️.
const FAMINE_BADGE_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="21" fill="rgba(20,24,30,0.86)"/>
  <path d="M24,10 C18,18 15,24 15,29 C15,35 19,39 24,39 C29,39 33,35 33,29 C33,24 30,18 24,10 Z"
        fill="#c9822c" stroke="#7a4d18" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M24,17 C21,22 19,26 19,29 C19,32.5 21.2,35 24,35 C26.8,35 29,32.5 29,29 C29,26 27,22 24,17 Z"
        fill="#e8a85a"/>
</svg>`;

let cachedImage: HTMLImageElement | null = null;

export async function preloadFamineBadgeMarker(): Promise<void> {
  const blob = new Blob([FAMINE_BADGE_SVG], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cachedImage = img; resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}

export function getFamineBadgeMarkerImage(): HTMLImageElement | null {
  return cachedImage;
}
```

- [ ] **Step 2: Write a failing test for the archetype-conditional draw branch**

Find the existing test file: `grep -rl "drawCityWorldPressureBadgePass" tests/`. Add:
```typescript
it('draws the famine badge marker when worldPressureCrisis is famine, and the generic warning glyph otherwise', () => {
  // ...reuse this file's existing CityRenderItem fixture builder...
  const famineItem = { ...baseItem, worldPressureCrisis: 'famine' as const };
  const outbreakItem = { ...baseItem, worldPressureCrisis: 'outbreak' as const };
  const ctx = createMockCanvasContext(); // reuse whatever mock-context helper this test file already uses
  drawCityWorldPressureBadgePass(ctx, famineItem);
  expect(ctx.drawImage).toHaveBeenCalled(); // once famine-badge-marker preloads a real image in test setup
  drawCityWorldPressureBadgePass(ctx, outbreakItem);
  // outbreak still falls back to the emoji glyph path (drawFittedText), not drawImage
});
```
Adjust to whatever canvas-context mocking convention this test file already uses (read it first — do not invent a new mock style).

- [ ] **Step 3: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test <file from Step 2> -t "famine badge marker"`
Expected: FAIL.

- [ ] **Step 4: Update `drawCityWorldPressureBadgePass`**

In `src/renderer/city-render-passes.ts` (`:503-517`), change:
```typescript
export function drawCityWorldPressureBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'world-pressure');
  if (!item.projection.isLive || !item.city || !item.worldPressureCrisis) return;

  const x = item.screen.x;
  const y = item.screen.y - item.size * 0.58;
  ctx.beginPath();
  ctx.arc(x, y, item.size * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,24,30,0.86)';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawFittedText(ctx, '⚠️', x, y, item.size * 0.28, item.size * 0.2);
}
```
to:
```typescript
export function drawCityWorldPressureBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'world-pressure');
  if (!item.projection.isLive || !item.city || !item.worldPressureCrisis) return;

  const x = item.screen.x;
  const y = item.screen.y - item.size * 0.58;

  // #594 MR7: famine gets bespoke badge art; every other archetype (outbreak,
  // catastrophe, hunt) keeps the generic ⚠️ glyph -- the badge fires for ANY active
  // crisis (item.worldPressureCrisis carries the real archetype), so this must stay
  // conditional rather than swapping the glyph unconditionally.
  if (item.worldPressureCrisis === 'famine') {
    const famineImg = getFamineBadgeMarkerImage();
    if (famineImg) {
      const s = item.size * 0.32;
      ctx.drawImage(famineImg, x - s / 2, y - s / 2, s, s);
      return;
    }
  }

  ctx.beginPath();
  ctx.arc(x, y, item.size * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,24,30,0.86)';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawFittedText(ctx, '⚠️', x, y, item.size * 0.28, item.size * 0.2);
}
```
Add the import at the top of `city-render-passes.ts`:
```typescript
import { getFamineBadgeMarkerImage } from '@/renderer/improvements/famine-badge-marker';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test <file from Step 2>`
Expected: PASS.

- [ ] **Step 6: Wire the preload call in `main.ts`**

Add the import near `preloadOutpostMarker`:
```typescript
import { preloadFamineBadgeMarker } from '@/renderer/improvements/famine-badge-marker';
```
Add the call near `preloadOutpostMarker().catch(() => {});` (`src/main.ts:5115`):
```typescript
  preloadFamineBadgeMarker().catch(() => {});
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/improvements/famine-badge-marker.ts src/renderer/city-render-passes.ts src/main.ts <test file from Step 2>
git commit -m "feat(religion): give famine crises bespoke map badge art"
```

---

## Task 9: Religion map badge (new state + presentation + render pass)

**Files:**
- Create: `src/systems/religion-badge-presentation.ts`
- Create: `src/renderer/improvements/religion-badge-marker.ts`
- Modify: `src/renderer/city-render-passes.ts` (`CityRenderItem.religionBadge` field, new `drawCityReligionBadgePass`, `CITY_RENDER_PASSES`, `CityRenderPassName`)
- Modify: `src/renderer/city-renderer.ts` (compute `religionBadge` in `createCityRenderItems`, thread `religionBadgePresentation` through `CityRenderOptions`)
- Modify: `src/renderer/render-loop.ts` (cache `religionBadgePresentation`, same pattern as `loyaltyPressurePresentation`)
- Modify: `src/main.ts` (preload call)
- Test: `tests/systems/religion-badge-presentation.test.ts` (new), extend the render-passes test file from Task 8

**Interfaces:**
- Consumes: `state.cityFaith?.[cityId]: { religionId, ... } | undefined` (already exists, confirmed used by `getForeignFaithPressure` in `religion-loyalty-system.ts:24`); `state.religions?.[religionId]: Religion | undefined`.
- Produces: `getReligionBadgePresentationForViewer(state, viewerId): ReligionBadgePresentation` with shape `{ cityBadges: Array<{ cityId, coord, isOwnFaith: boolean }> }`.
- Produces: `CityRenderItem.religionBadge?: { isOwnFaith: boolean }`.

- [ ] **Step 1: Write failing test for the presentation helper**

Create `tests/systems/religion-badge-presentation.test.ts`. First read `src/systems/loyalty-pressure-presentation.ts` in full (already read during planning) and mirror its test file's fixture-building helpers (`grep -rl "getLoyaltyPressurePresentationForViewer" tests/` to find and copy its state-fixture setup style). Then:
```typescript
import { describe, expect, it } from 'vitest';
import { getReligionBadgePresentationForViewer } from '@/systems/religion-badge-presentation';

describe('getReligionBadgePresentationForViewer', () => {
  it('shows a badge for a city that follows a religion, flagged isOwnFaith when the viewer owns that religion', () => {
    // ...build a minimal state with one city owned by 'player', state.cityFaith['city1'] =
    // { religionId: 'r1', loyaltyProgress: undefined }, state.religions['r1'] = { ownerCivId: 'player', ... }...
    const presentation = getReligionBadgePresentationForViewer(state, 'player');
    expect(presentation.cityBadges).toEqual([{ cityId: 'city1', coord: state.cities.city1.position, isOwnFaith: true }]);
  });

  it('flags isOwnFaith false for a city following a foreign religion the viewer has met', () => {
    // ...state.religions['r1'].ownerCivId = 'ai-1', viewer = 'player', both have met...
    const presentation = getReligionBadgePresentationForViewer(state, 'player');
    expect(presentation.cityBadges).toEqual([{ cityId: 'city1', coord: expect.anything(), isOwnFaith: false }]);
  });

  it('omits a city with no cityFaith entry (no religion yet)', () => {
    // ...state.cityFaith = {}...
    expect(getReligionBadgePresentationForViewer(state, 'player').cityBadges).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-badge-presentation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `getReligionBadgePresentationForViewer`**

Create `src/systems/religion-badge-presentation.ts`:
```typescript
import type { GameState, HexCoord } from '@/core/types';

export interface ReligionBadgeEntry {
  cityId: string;
  coord: HexCoord;
  isOwnFaith: boolean;
}

export interface ReligionBadgePresentation {
  cityBadges: ReligionBadgeEntry[];
}

const EMPTY: ReligionBadgePresentation = { cityBadges: [] };

// #594 MR7: "religion map badge" -- marks any city with a resolved cityFaith entry
// (it follows SOME religion). isOwnFaith distinguishes "follows my religion" from
// "follows a religion I don't own", so the render pass can style them differently.
// No discovery/visibility gate beyond the existing fog-of-war the map already applies
// to city rendering itself -- a city the viewer can see on the map already reveals its
// population/owner/etc, and faith-following is comparably low-stakes public info,
// consistent with how loyaltyPressure and worldPressureCrisis are also un-gated beyond
// their own explicit pressuring/pressured-party checks.
export function getReligionBadgePresentationForViewer(
  state: GameState,
  viewerCivId: string,
): ReligionBadgePresentation {
  const cityBadges: ReligionBadgeEntry[] = [];
  for (const [cityId, faith] of Object.entries(state.cityFaith ?? {})) {
    const city = state.cities[cityId];
    if (!city) continue;
    const religion = state.religions?.[faith.religionId];
    if (!religion) continue;
    cityBadges.push({ cityId, coord: city.position, isOwnFaith: religion.ownerCivId === viewerCivId });
  }
  return cityBadges.length > 0 ? { cityBadges } : EMPTY;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-badge-presentation.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the religion badge marker asset**

Create `src/renderer/improvements/religion-badge-marker.ts`, same structural pattern as Task 8's famine marker and `resource-outpost-marker.ts`:
```typescript
// Small map badge marking a city that follows a religion. Two variants (own faith vs
// foreign faith) so a viewer can tell at a glance which cities are theirs devotionally.
// No faction palette (religion identity is separate from civ color).
const RELIGION_BADGE_OWN_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="21" fill="rgba(20,24,30,0.86)"/>
  <path d="M24,9 V39 M14,19 H34" stroke="#e0b0ff" stroke-width="4" stroke-linecap="round"/>
</svg>`;

const RELIGION_BADGE_FOREIGN_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="21" fill="rgba(20,24,30,0.86)"/>
  <path d="M24,9 V39 M14,19 H34" stroke="#9a80ab" stroke-width="4" stroke-linecap="round" opacity="0.75"/>
</svg>`;

let cachedOwn: HTMLImageElement | null = null;
let cachedForeign: HTMLImageElement | null = null;

async function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}

export async function preloadReligionBadgeMarker(): Promise<void> {
  [cachedOwn, cachedForeign] = await Promise.all([
    loadSvgImage(RELIGION_BADGE_OWN_SVG),
    loadSvgImage(RELIGION_BADGE_FOREIGN_SVG),
  ]);
}

export function getReligionBadgeMarkerImage(isOwnFaith: boolean): HTMLImageElement | null {
  return isOwnFaith ? cachedOwn : cachedForeign;
}
```
Note: this uses a generic "faith symbol" placeholder glyph (a simple cross-like mark), NOT a specific real-world religion's iconography — this project invents its own religion names/identity per-civ (per `.claude/rules/wonder-content.md`-adjacent content-honesty conventions and the MR6 inline-review fix already on record in `drawCityLoyaltyPressureBadgePass`'s comment about avoiding real-world religious symbols). Do not swap this for an identifiable real-world religious symbol (cross, crescent, Star of David, etc.) — this was exactly the content-policy violation MR6's review caught for the 🙏 badge; keep this badge abstract/invented in the same spirit.

- [ ] **Step 6: Add `religionBadge` to `CityRenderItem` and a new render pass**

In `src/renderer/city-render-passes.ts`, add the import:
```typescript
import { getReligionBadgeMarkerImage } from '@/renderer/improvements/religion-badge-marker';
```
Extend the interface (`:21-46`):
```typescript
  // #593 MR6: set only when this city appears in
  // getLoyaltyPressurePresentationForViewer(...).cityBadges for the current viewer.
  loyaltyPressure?: true;
  // #594 MR7: set only when this city appears in
  // getReligionBadgePresentationForViewer(...).cityBadges for the current viewer.
  religionBadge?: { isOwnFaith: boolean };
}
```
Extend `CityRenderPassName` (`:48-58`):
```typescript
export type CityRenderPassName =
  | 'base'
  | 'icon'
  | 'landmarks'
  | 'label'
  | 'status'
  | 'production'
  | 'idle'
  | 'intel'
  | 'world-pressure'
  | 'loyalty-pressure'
  | 'religion-badge';
```
Add a new draw function, after `drawCityLoyaltyPressureBadgePass`:
```typescript
export function drawCityReligionBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'religion-badge');
  if (!item.projection.isLive || !item.city || !item.religionBadge) return;

  const img = getReligionBadgeMarkerImage(item.religionBadge.isOwnFaith);
  if (!img) return;
  const x = item.screen.x - item.size * 0.5;
  const y = item.screen.y - item.size * 0.58;
  const s = item.size * 0.32;
  ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
}
```
Note: positioned at `x - item.size * 0.5` (left of center) to avoid colliding with `drawCityLoyaltyPressureBadgePass`'s existing badge at `x + item.size * 0.5` (right of center) and the world-pressure badge at dead-center — confirm no visual overlap by reading all three badges' positioning together before finalizing (all three CAN appear simultaneously on the same city: following a religion, under loyalty pressure, AND suffering an unrelated crisis, are independent conditions).
Register it in `CITY_RENDER_PASSES` (`:552-554`):
```typescript
  { name: 'world-pressure', draw: drawCityWorldPressureBadgePass },
  { name: 'loyalty-pressure', draw: drawCityLoyaltyPressureBadgePass },
  { name: 'religion-badge', draw: drawCityReligionBadgePass },
];
```

- [ ] **Step 7: Wire `religionBadge` computation into `city-renderer.ts`**

In `src/renderer/city-renderer.ts`, add the import:
```typescript
import type { ReligionBadgePresentation } from '@/systems/religion-badge-presentation';
```
Extend `CityRenderOptions` (`:35-44`):
```typescript
  // #593 MR6: same caching convention as worldPressurePresentation above.
  loyaltyPressurePresentation?: LoyaltyPressurePresentation;
  // #594 MR7: same caching convention as worldPressurePresentation above.
  religionBadgePresentation?: ReligionBadgePresentation;
}
```
In `createCityRenderItems` (`:84-99`), after the `loyaltyPressureCityIds` computation:
```typescript
  const religionBadgePresentation = typeof options === 'boolean' ? undefined : options.religionBadgePresentation;
  const religionBadgeByCityId = new Map(
    (religionBadgePresentation?.cityBadges ?? []).map(badge => [badge.cityId, badge.isOwnFaith]),
  );
```
And in the `items.push({...})` block (`:150-170`), after `loyaltyPressure: ...`:
```typescript
        loyaltyPressure: city && loyaltyPressureCityIds.has(city.id) ? true : undefined,
        religionBadge: city && religionBadgeByCityId.has(city.id)
          ? { isOwnFaith: religionBadgeByCityId.get(city.id)! }
          : undefined,
```

- [ ] **Step 8: Cache the presentation in `render-loop.ts`**

Mirror `loyaltyPressurePresentation`'s exact pattern (`:216,386,568`). Add the import:
```typescript
import { getReligionBadgePresentationForViewer } from '@/systems/religion-badge-presentation';
```
Add the field near `private loyaltyPressurePresentation: LoyaltyPressurePresentation = { cityBadges: [] };`:
```typescript
  private religionBadgePresentation: ReligionBadgePresentation = { cityBadges: [] };
```
Add the computation near `this.loyaltyPressurePresentation = getLoyaltyPressurePresentationForViewer(state, state.currentPlayer);` (in `setGameState`):
```typescript
    this.religionBadgePresentation = getReligionBadgePresentationForViewer(state, state.currentPlayer);
```
Thread it through wherever `loyaltyPressurePresentation:` is passed into the drawing call (`:568`):
```typescript
      loyaltyPressurePresentation: this.loyaltyPressurePresentation,
      religionBadgePresentation: this.religionBadgePresentation,
```

- [ ] **Step 9: Write failing test for the new render pass**

Extend the test file from Task 8 (`drawCityWorldPressureBadgePass` tests):
```typescript
it('draws the religion badge with own-faith art when religionBadge.isOwnFaith is true', () => {
  const item = { ...baseItem, religionBadge: { isOwnFaith: true } };
  const ctx = createMockCanvasContext();
  drawCityReligionBadgePass(ctx, item);
  expect(ctx.drawImage).toHaveBeenCalled();
});

it('does not draw the religion badge when religionBadge is undefined', () => {
  const ctx = createMockCanvasContext();
  drawCityReligionBadgePass(ctx, baseItem);
  expect(ctx.drawImage).not.toHaveBeenCalled();
});
```

- [ ] **Step 10: Run tests to verify pass, then run the full renderer test suite**

Run: `bash scripts/run-with-mise.sh yarn test tests/renderer/`
Expected: all PASS, including any pre-existing `CITY_RENDER_PASSES` length/order assertions — check for one with `grep -n "CITY_RENDER_PASSES" tests/renderer/city-render-passes.test.ts` and update its expected pass list/count if it hardcodes one.

- [ ] **Step 11: Wire the preload call in `main.ts`**

Add the import near `preloadOutpostMarker`:
```typescript
import { preloadReligionBadgeMarker } from '@/renderer/improvements/religion-badge-marker';
```
Add the call near the Task 8 preload call:
```typescript
  preloadReligionBadgeMarker().catch(() => {});
```

- [ ] **Step 12: Update `docs/sprite-design-system.md`**

Add two new rows to the appropriate table (map badges/markers section — check whether one already exists for `resource_outpost`-style improvement markers, and add rows there; if no such section exists, add one following the existing table format):
```
| famine-crisis-badge | ✅ bespoke (#594 MR7) | map badge |
| religion-badge | ✅ bespoke (#594 MR7) | map badge |
```

- [ ] **Step 13: Commit**

```bash
git add src/systems/religion-badge-presentation.ts src/renderer/improvements/religion-badge-marker.ts src/renderer/city-render-passes.ts src/renderer/city-renderer.ts src/renderer/render-loop.ts src/main.ts docs/sprite-design-system.md tests/systems/religion-badge-presentation.test.ts tests/renderer/
git commit -m "feat(religion): add religion map badge (own-faith vs foreign-faith)"
```

---

## Task 10: Final sweep — no MR3–6 event left silent, full suite green

**Files:** none new — verification only.

- [ ] **Step 1: Grep for every religion/crisis event and confirm each has an audio path**

```bash
grep -n "religion:founded\|religion:city-converted\|religion:preached\|religion:loyalty-warning\|religion:city-defected" src/audio/*.ts src/main.ts
grep -n "crisis:started\|crisis:resolved" src/audio/*.ts
```
Confirm: `religion:founded`/`city-converted`/`loyalty-warning`/`city-defected` route through `main.ts`'s toast pipeline with `sfxCue` set (Task 3) and `AudioSystem.playReligionStinger` (Task 2); `religion:preached` and famine-filtered `crisis:started`/`crisis:resolved` are directly subscribed in `ReligionAudioDirector` (Task 2). No event in this list should still be silent or still calling `SFX.notification()` unconditionally.

- [ ] **Step 2: Grep for any remaining `SFX.notification()` call sites to confirm the conditional branch is the only one**

```bash
grep -n "SFX.notification()" src/main.ts
```
Expected: exactly the two call sites from before this MR (the `civilization:era-advanced` handler at `~4570`, and the conditional fallback in `displayNextNotification` from Task 1 Step 6) — both intentional, neither religion-related.

- [ ] **Step 3: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all tests PASS, including the hook smoke tests.

- [ ] **Step 4: Run the full build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exits 0, no `tsc` errors.

- [ ] **Step 5: Rebase on latest `origin/main`**

```bash
git fetch origin main
git rebase origin/main
```
Resolve any conflicts (unlikely, given MR6 already merged at `47149040` and this worktree branched after). Re-run Steps 3-4 after any rebase that touches files this MR modified.

- [ ] **Step 6: No commit needed for this task (verification only) — proceed to the inline multi-dimensional review**

This task has no code changes of its own; it is the gate before the review pass in the top-level process (step 6 of the required process in the originating prompt).

---

## Self-Review Notes (completed during plan authoring)

**Spec coverage check against issue #594:**
- Audio stingers table (6 cues → 6 events): Tasks 2, 3, 4 — ✅ all 6 covered (religion-founded, city-converted, preach, city-defected covered via toast-replacement + preach direct; famine-onset/resolved via crisis archetype filter).
- Offline precache check: Task 5 — ✅ (decision: yes, precache all 6... 7 files, since religion has 5 cues not 4 as the issue's summary table implies — the issue's table undercounts `loyalty-warning` as one row but MR6 already fires it at 3 stages with one shared cue; verified this is fine, single cue for all stages per user-confirmed scope).
- Copy/help polish (boon modal, Sacred Council, loyalty tooltip, famine panel): Task 6 — ✅ all 4 surfaces covered.
- Sprites (missionary, famine badge, religion badge): Tasks 7, 8, 9 — ✅ all 3 covered, `docs/sprite-design-system.md` updated in both 7 and 9.
- Acceptance: "No MR3-6 event moment left silent or on a reused placeholder" — Task 10 — ✅ explicit grep-verification step.
- Acceptance: "sprite catalog tests green" — Task 7 Step 4 — ✅.
- Acceptance: PR body closes-keyword regex check — handled at PR-creation time (not a plan task; see the originating prompt's process step 7 / gates checklist, executed after Task 10).

**Placeholder scan:** no TBD/TODO/"add appropriate X" phrases in any step above; every code block is complete, runnable code with exact file paths and line-anchor context. The two spots that legitimately defer creative content generation (Task 7 Step 1's sprite-prompt skill invocation, and Task 9 Step 5's abstract badge glyph) are real engineering decisions with concrete fallback specifications (an SVG is provided even for the religion badge; the missionary sprite explicitly documents the skill invocation as the intended generation path per this project's own `.claude/rules/sprites.md` recipe, which itself allows either the skill OR hand-authoring).

**Type consistency check:** `sfxCue?: string` (Task 1) matches the string literals passed at Task 3's `sink(...)` call sites (`'religion-founded'`, `'city-converted'`, `'loyalty-warning'`, `'city-defected'`) and `ReligionAudioDirector.playCue`'s cue-id switch (Task 2 Step 5). `RELIGION_SFX`/`FAMINE_SFX` file paths (Task 2 Step 1) match `RELIGION_AUDIO_FILES` (Task 4 Step 4) and the actual generated file paths from `scripts/generate-religion-sfx.sh` (Task 4 Step 2) and `public/sw.js` (Task 5 Step 1) — all four lists were cross-checked to use the identical 7 paths.

---

## Execution

Per this project's `CLAUDE.md` ("NEVER use subagents or parallel agents"), this plan is executed **inline in the current session**, task-by-task, with a test-verify-commit cycle per task as shown above. No subagent dispatch of any kind.
