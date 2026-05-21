# Wonder Discovery Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stage 2B natural wonder discovery ceremonies: a skippable full-screen medallion reveal for eligible human discoveries, followed by a map pulse and optional Wonder Atlas deep link.

**Architecture:** Keep gameplay mutation in the existing wonder discovery path and add presentation-only layers around the emitted `wonder:discovered` event. A pure system helper builds viewer-safe reveal items, DOM UI renders and resolves the ceremony once, a queue coordinator controls ordering and blocking, and the render loop owns the non-mutating map pulse.

**Tech Stack:** TypeScript, Vitest, jsdom UI tests, Canvas 2D render loop, existing EventBus, existing Wonder Atlas and vignette modules. Designed for GPT-5.4 on medium effort.

---

## File Structure

- Create `src/systems/wonder-presentation-formatting.ts`
  - Shared formatting for natural wonder yield/effect and discovery reward summaries.
  - Prevents duplicating effect summary logic between Atlas and discovery reveal.
- Modify `src/systems/wonder-atlas-presentation.ts`
  - Use `formatNaturalWonderEffectSummary` from the shared formatting helper.
- Modify `src/core/types.ts`
  - Add optional `revealLine?: string` to `WonderDefinition`.
- Create `src/systems/wonder-discovery-reveal.ts`
  - Pure helper that converts an eligible `wonder:discovered` event into a viewer-safe reveal item.
  - Returns `null` for AI, wrong viewer, unknown wonder, or unusable coordinates.
- Create `tests/systems/wonder-discovery-reveal.test.ts`
  - Covers eligibility, privacy, summaries, event coordinates, and the future motion hook.
- Modify `src/ui/wonder-vignette.ts`
  - Export a small `createWonderVisualVignette` helper so the ceremony can reuse Stage 2A medallion identity without constructing a fake Atlas entry.
- Create `src/ui/wonder-discovery-ceremony.ts`
  - Full-screen DOM overlay with `Continue`, `Open Atlas`, `Skip`, reduced-motion static mode, and exactly-once resolution.
- Create `tests/ui/wonder-discovery-ceremony.test.ts`
  - Covers rendered text/actions, repeat clicks, reduced motion, safe text insertion, and selected actions.
- Create `src/ui/wonder-discovery-queue.ts`
  - Session-only queue for reveal items. Waits for action-settled and blocking-UI clearance, presents one ceremony at a time, requests map highlight, and opens Atlas after highlight request when selected.
- Create `tests/ui/wonder-discovery-queue.test.ts`
  - Covers queue order, blocking, dedupe, action-settled gating, pulse requests, Atlas callback, and no state mutation.
- Modify `src/renderer/animation-system.ts`
  - Add `wonder-discovery-pulse` and `wonder-discovery-static-highlight` render cases.
- Modify `src/renderer/render-loop.ts`
  - Add `requestWonderDiscoveryHighlight(coord, visual, options)` that centers the camera, converts the event coordinate to pixels, and schedules the render-only highlight.
- Create `tests/renderer/wonder-discovery-highlight.test.ts`
  - Covers animated and reduced-motion highlight requests and verifies selected highlights/state are not mutated.
- Modify `src/main.ts`
  - Instantiate the queue, build reveal items inside the existing `wonder:discovered` listener after current log behavior, notify queue when movement animation settles, and wire `Open Atlas` to `openWonderAtlas(wonderId)`.

## Player Truth Table

| Before | Action | Internal State | Immediate Visible Result | Must Remain Reachable |
|---|---|---|---|---|
| Scout movement reveals a natural wonder for the active human civ | Movement finishes | Existing discovery state and rewards are already applied by `processWonderDiscovery`; reveal item is queued | Ceremony appears after the movement animation settles | Map, notification log, Atlas button |
| Ceremony is visible and animation is still playing | Click `Skip` | No gameplay state changes; ceremony resolves with action `skip` | Overlay disappears, camera centers on event coordinate, map highlight appears | Existing selection/movement state is not changed |
| Ceremony is visible | Click `Continue` | No gameplay state changes; ceremony resolves with action `continue` | Overlay disappears, camera centers on event coordinate, map highlight appears | Wonder Atlas remains available from shell |
| Ceremony is visible | Click `Open Atlas` | No gameplay state changes; ceremony resolves with action `open-atlas` | Overlay disappears, map highlight request fires, Atlas opens to the discovered entry | Atlas close and View on map still work |
| Two wonders are discovered in one action | Resolve first ceremony | Queue shifts first item only | Second ceremony appears only after first resolution and highlight request | No second overlay overlaps the first |
| Another blocking overlay is active | Discovery event arrives | Reveal item remains queued | No wonder ceremony stacks on top | Existing blocking overlay remains in control |
| Reduced motion is enabled | Discovery event resolves | No gameplay state changes | Static ceremony card appears; static map highlight is requested | Continue, Open Atlas, Skip all remain present |
| AI discovers a natural wonder | Event is emitted | Existing discovery/log behavior remains | No ceremony appears for the human viewer | Human player receives no hidden location or identity leak |

## Misleading UI Risks

- `Natural Wonder Discovered` must mean the active human-controlled civilization just discovered that natural wonder from a live `wonder:discovered` event. AI events, wrong-viewer events, Atlas browsing, last-seen data, and save reconstruction stay out.
- The map pulse must represent the event payload coordinate. It must not search hidden map state for an alternate coordinate.
- `Open Atlas` must open only a wonder that is already visible to `state.currentPlayer` through `wonderDiscoverers`; the queue does not add Atlas visibility.
- The ceremony text must use static wonder definition fields and visual catalog metadata, not live tile terrain, owner, units, city data, or rival activity.
- Negative tests must prove wrong-viewer and AI events return `null` and do not enqueue.

## Interaction Replay Checklist

- Add first reveal item, mark action settled, verify one ceremony appears.
- Add second reveal item before the first resolves, verify the second waits.
- Resolve first with `Continue`, verify first highlight and then second ceremony.
- Resolve second with `Open Atlas`, verify second highlight and Atlas callback.
- Repeat-click `Continue`, `Skip`, and `Open Atlas` after first resolution, verify callbacks fire once.
- Block the UI, enqueue, mark settled, verify no ceremony until block clears and `pump()` runs.
- Reopen unrelated panels after a ceremony resolves, verify the resolved ceremony does not replay.

## Queue And ETA Checklist

- Stage 2B does not display a player-visible queue or ETA. It intentionally shows one active ceremony at a time.
- Queue order still matters internally and must be tested with two reveal items.
- No reorder/remove controls are introduced in Stage 2B.
- If a queued item becomes unpresentable because the Atlas callback or render highlight callback is unavailable, the queue resolves it like `Continue` and advances.

---

### Task 1: Shared Wonder Reveal Presentation Helper

**Files:**
- Create: `src/systems/wonder-presentation-formatting.ts`
- Create: `src/systems/wonder-discovery-reveal.ts`
- Modify: `src/systems/wonder-atlas-presentation.ts`
- Modify: `src/core/types.ts`
- Test: `tests/systems/wonder-discovery-reveal.test.ts`

- [ ] **Step 1: Write the failing reveal-helper tests**

Create `tests/systems/wonder-discovery-reveal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameEvents, GameState } from '@/core/types';
import { buildWonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { hexKey } from '@/systems/hex-utils';

function makeState(): GameState {
  const state = createNewGame(undefined, 'wonder-discovery-reveal-test');
  for (const tile of Object.values(state.map.tiles)) {
    tile.wonder = null;
    tile.owner = null;
  }
  state.map.tiles[hexKey({ q: 2, r: 3 })].wonder = 'great_volcano';
  state.discoveredWonders = { great_volcano: 'ai-1' };
  state.wonderDiscoverers = { great_volcano: ['ai-1', 'player'] };
  return state;
}

function event(overrides: Partial<GameEvents['wonder:discovered']> = {}): GameEvents['wonder:discovered'] {
  return {
    civId: 'player',
    wonderId: 'great_volcano',
    position: { q: 2, r: 3 },
    isFirstDiscoverer: false,
    ...overrides,
  };
}

describe('wonder-discovery-reveal', () => {
  it('builds a reveal item for the active human viewer using the event coordinate', () => {
    const state = makeState();

    const item = buildWonderDiscoveryRevealItem(state, 'player', event());

    expect(item).toMatchObject({
      title: 'Natural Wonder Discovered',
      wonderId: 'great_volcano',
      civId: 'player',
      coord: { q: 2, r: 3 },
      name: 'Great Volcano',
      motionAssetId: null,
    });
    expect(item?.effectSummary).toContain('Yields');
    expect(item?.rewardSummary).toBe('+30 Science discovery reward');
    expect(item?.visual.mapLandmark).toBe('volcano');
  });

  it('does not require first-ever world discovery for a human civ reveal', () => {
    const state = makeState();

    const item = buildWonderDiscoveryRevealItem(state, 'player', event({ isFirstDiscoverer: false }));

    expect(item?.wonderId).toBe('great_volcano');
  });

  it('returns null for AI discoveries and wrong active viewers', () => {
    const state = makeState();

    expect(buildWonderDiscoveryRevealItem(state, 'ai-1', event({ civId: 'ai-1' }))).toBeNull();
    expect(buildWonderDiscoveryRevealItem(state, 'player-2', event({ civId: 'player' }))).toBeNull();
  });

  it('allows separate human civs to receive their own reveal on their own turn', () => {
    const state = makeState();
    state.civilizations['player-2'] = { ...state.civilizations.player, id: 'player-2', name: 'Second Human', isHuman: true };
    state.currentPlayer = 'player-2';
    state.wonderDiscoverers.great_volcano.push('player-2');

    const item = buildWonderDiscoveryRevealItem(state, 'player-2', event({ civId: 'player-2' }));

    expect(item?.civId).toBe('player-2');
  });

  it('does not expose hidden live tile details', () => {
    const state = makeState();
    state.map.tiles[hexKey({ q: 2, r: 3 })].terrain = 'volcanic';
    state.map.tiles[hexKey({ q: 2, r: 3 })].owner = 'ai-1';

    const item = buildWonderDiscoveryRevealItem(state, 'player', event());

    expect(item).toBeTruthy();
    expect('terrain' in (item as object)).toBe(false);
    expect('owner' in (item as object)).toBe(false);
  });

  it('uses description fallback when revealLine metadata is absent', () => {
    const item = buildWonderDiscoveryRevealItem(makeState(), 'player', event());

    expect(item?.revealLine).toBe('A massive volcano that occasionally erupts, destroying nearby improvements.');
  });

  it('returns null for unknown wonders or unusable event coordinates', () => {
    const state = makeState();

    expect(buildWonderDiscoveryRevealItem(state, 'player', event({ wonderId: 'missing_wonder' }))).toBeNull();
    expect(buildWonderDiscoveryRevealItem(state, 'player', event({ position: { q: Number.NaN, r: 0 } }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the failing helper tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-discovery-reveal.test.ts
```

Expected: fail because `src/systems/wonder-discovery-reveal.ts` does not exist.

- [ ] **Step 3: Add shared formatting and reveal item implementation**

Add `revealLine?: string;` to `WonderDefinition` in `src/core/types.ts`.

Create `src/systems/wonder-presentation-formatting.ts`:

```ts
import type { ResourceYield } from '@/core/types';
import { getWonderDefinition } from '@/systems/wonder-definitions';

export function formatWonderYieldSummary(yields: ResourceYield): string {
  const parts = [
    ['Food', yields.food],
    ['Production', yields.production],
    ['Gold', yields.gold],
    ['Science', yields.science],
  ]
    .filter(([, value]) => typeof value === 'number' && value > 0)
    .map(([label, value]) => `+${value} ${label}`);

  return parts.length > 0 ? `Yields ${parts.join(', ')}` : 'No direct tile yields';
}

export function formatNaturalWonderEffectSummary(wonderId: string): string {
  const definition = getWonderDefinition(wonderId);
  if (!definition) return 'Unknown wonder effect';

  const yieldSummary = formatWonderYieldSummary(definition.yields);
  switch (definition.effect.type) {
    case 'adjacent_yield_bonus':
      return `${yieldSummary}. Improves adjacent tile yields.`;
    case 'combat_bonus':
      return `${yieldSummary}. Grants a defensive combat bonus.`;
    case 'eruption':
      return `${yieldSummary}. May erupt and damage nearby improvements.`;
    case 'healing':
      return `${yieldSummary}. Heals units on the wonder tile.`;
    case 'vision':
      return `${yieldSummary}. Extends vision nearby.`;
    case 'none':
    default:
      return yieldSummary;
  }
}

export function formatWonderDiscoveryRewardSummary(wonderId: string): string {
  const definition = getWonderDefinition(wonderId);
  if (!definition) return 'No discovery reward';
  const rewardType = definition.discoveryBonus.type;
  const rewardLabel = rewardType.charAt(0).toUpperCase() + rewardType.slice(1);
  return `+${definition.discoveryBonus.amount} ${rewardLabel} discovery reward`;
}
```

Modify `src/systems/wonder-atlas-presentation.ts` to import `formatNaturalWonderEffectSummary` and replace its local `formatYieldSummary`/`formatEffectSummary` helpers with that shared function.

Create `src/systems/wonder-discovery-reveal.ts`:

```ts
import type { GameEvents, GameState, HexCoord } from '@/core/types';
import { getWonderDefinition } from '@/systems/wonder-definitions';
import { formatNaturalWonderEffectSummary, formatWonderDiscoveryRewardSummary } from '@/systems/wonder-presentation-formatting';
import { getWonderVisualDefinition, type WonderVisualDefinition } from '@/systems/wonder-visual-catalog';

export interface WonderDiscoveryRevealItem {
  wonderId: string;
  civId: string;
  coord: HexCoord;
  name: string;
  title: 'Natural Wonder Discovered';
  revealLine: string;
  effectSummary: string;
  rewardSummary: string;
  visual: WonderVisualDefinition;
  motionAssetId: string | null;
}

function validCoord(coord: HexCoord): boolean {
  return Number.isFinite(coord.q) && Number.isFinite(coord.r);
}

export function buildWonderDiscoveryRevealItem(
  state: GameState,
  activeViewerId: string,
  event: GameEvents['wonder:discovered'],
): WonderDiscoveryRevealItem | null {
  if (event.civId !== activeViewerId) return null;
  const civ = state.civilizations[event.civId];
  if (!civ?.isHuman) return null;
  if (!validCoord(event.position)) return null;

  const definition = getWonderDefinition(event.wonderId);
  if (!definition) return null;

  return {
    wonderId: event.wonderId,
    civId: event.civId,
    coord: { ...event.position },
    name: definition.name,
    title: 'Natural Wonder Discovered',
    revealLine: definition.revealLine ?? definition.description,
    effectSummary: formatNaturalWonderEffectSummary(event.wonderId),
    rewardSummary: formatWonderDiscoveryRewardSummary(event.wonderId),
    visual: getWonderVisualDefinition(event.wonderId),
    motionAssetId: null,
  };
}
```

- [ ] **Step 4: Run helper and Atlas presentation tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-discovery-reveal.test.ts tests/systems/wonder-atlas-presentation.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/core/types.ts src/systems/wonder-presentation-formatting.ts src/systems/wonder-atlas-presentation.ts src/systems/wonder-discovery-reveal.ts tests/systems/wonder-discovery-reveal.test.ts
git commit -m "feat: add wonder discovery reveal presentation"
```

### Task 2: Ceremony Overlay UI

**Files:**
- Modify: `src/ui/wonder-vignette.ts`
- Create: `src/ui/wonder-discovery-ceremony.ts`
- Test: `tests/ui/wonder-discovery-ceremony.test.ts`

- [ ] **Step 1: Write failing ceremony tests**

Create `tests/ui/wonder-discovery-ceremony.test.ts`:

```ts
// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import { createWonderDiscoveryCeremony } from '@/ui/wonder-discovery-ceremony';

function item(overrides: Partial<WonderDiscoveryRevealItem> = {}): WonderDiscoveryRevealItem {
  return {
    title: 'Natural Wonder Discovered',
    wonderId: 'great_volcano',
    civId: 'player',
    coord: { q: 2, r: 3 },
    name: 'Great Volcano',
    revealLine: 'The earth opens and the sky remembers.',
    effectSummary: 'Yields +3 Production, +1 Science. May erupt and damage nearby improvements.',
    rewardSummary: '+30 Science discovery reward',
    visual: getWonderVisualDefinition('great_volcano'),
    motionAssetId: null,
    ...overrides,
  };
}

function click(selector: string): void {
  const element = document.querySelector(selector);
  expect(element).toBeTruthy();
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('wonder-discovery-ceremony', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  it('renders the reveal copy, actions, and animated medallion mode', () => {
    createWonderDiscoveryCeremony(document.body, item(), { onResolve: () => {} }, { reducedMotion: false });

    expect(document.body.textContent).toContain('Natural Wonder Discovered');
    expect(document.body.textContent).toContain('Great Volcano');
    expect(document.body.textContent).toContain('The earth opens');
    expect(document.body.textContent).toContain('Yields +3 Production');
    expect(document.body.textContent).toContain('+30 Science discovery reward');
    expect(document.querySelector('[data-wonder-discovery-action="continue"]')).toBeTruthy();
    expect(document.querySelector('[data-wonder-discovery-action="open-atlas"]')).toBeTruthy();
    expect(document.querySelector('[data-wonder-discovery-action="skip"]')).toBeTruthy();
    expect(document.querySelector('[data-vignette-motion="ambient"]')).toBeTruthy();
  });

  it('resolves exactly once for repeated action clicks', () => {
    const onResolve = vi.fn();
    createWonderDiscoveryCeremony(document.body, item(), { onResolve }, { reducedMotion: false });

    click('[data-wonder-discovery-action="continue"]');
    click('[data-wonder-discovery-action="skip"]');
    click('[data-wonder-discovery-action="open-atlas"]');

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith('continue');
    expect(document.querySelector('#wonder-discovery-ceremony')).toBeNull();
  });

  it('returns open-atlas when the Atlas action is selected', () => {
    const onResolve = vi.fn();
    createWonderDiscoveryCeremony(document.body, item(), { onResolve }, { reducedMotion: false });

    click('[data-wonder-discovery-action="open-atlas"]');

    expect(onResolve).toHaveBeenCalledWith('open-atlas');
  });

  it('uses static mode for reduced motion and keeps actions available before timers run', () => {
    const onResolve = vi.fn();
    createWonderDiscoveryCeremony(document.body, item(), { onResolve }, { reducedMotion: true });

    expect(document.querySelector('[data-wonder-discovery-motion="static"]')).toBeTruthy();
    expect(document.querySelector('[data-vignette-motion="static"]')).toBeTruthy();
    click('[data-wonder-discovery-action="skip"]');
    expect(onResolve).toHaveBeenCalledWith('skip');
  });

  it('inserts dynamic text safely', () => {
    createWonderDiscoveryCeremony(
      document.body,
      item({ name: '<img src=x onerror=alert(1)>', revealLine: '<script>alert(1)</script>' }),
      { onResolve: () => {} },
      { reducedMotion: false },
    );

    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(document.body.innerHTML).not.toContain('<script>alert(1)</script>');
  });
});
```

- [ ] **Step 2: Run failing ceremony tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-discovery-ceremony.test.ts
```

Expected: fail because `src/ui/wonder-discovery-ceremony.ts` does not exist.

- [ ] **Step 3: Export reusable vignette helper**

Modify `src/ui/wonder-vignette.ts` by extracting the existing SVG creation into:

```ts
export function createWonderVisualVignette(
  name: string,
  visual: WonderVisualDefinition,
  options: WonderVignetteOptions & { kind?: 'natural' | 'legendary' } = {},
): HTMLElement {
  const reducedMotion = options.reducedMotion ?? prefersReducedMotion();
  const wrapper = document.createElement('div');
  wrapper.dataset.vignetteMotion = reducedMotion ? 'static' : 'ambient';
  wrapper.style.cssText = 'position:relative;width:118px;height:118px;flex:0 0 118px;display:grid;place-items:center;';

  const svg = createSvgElement('svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('role', 'img');
  svg.style.cssText = `width:112px;height:112px;filter:drop-shadow(0 0 12px ${visual.palette.glow});`;
  svg.setAttribute('aria-label', `${name} vignette`);
  appendShape(svg, visual, reducedMotion || options.kind === 'legendary');
  wrapper.appendChild(svg);

  const glyph = document.createElement('div');
  glyph.textContent = visual.medallionGlyph;
  glyph.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;font-size:30px;font-weight:700;color:white;text-shadow:0 2px 8px rgba(0,0,0,0.65);';
  wrapper.appendChild(glyph);

  return wrapper;
}
```

Then make `createWonderVignette(entry, options)` return:

```ts
return createWonderVisualVignette(entry.name, entry.visual, { ...options, kind: entry.kind });
```

- [ ] **Step 4: Implement ceremony overlay**

Create `src/ui/wonder-discovery-ceremony.ts`:

```ts
import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { createGameButton } from '@/ui/ui-kit';
import { createWonderVisualVignette } from '@/ui/wonder-vignette';

export type WonderDiscoveryCeremonyAction = 'continue' | 'skip' | 'open-atlas';

export interface WonderDiscoveryCeremonyCallbacks {
  onResolve: (action: WonderDiscoveryCeremonyAction) => void;
}

export interface WonderDiscoveryCeremonyOptions {
  reducedMotion?: boolean;
  revealDurationMs?: number;
}

function appendText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string, style: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  element.style.cssText = style;
  parent.appendChild(element);
  return element;
}

export function createWonderDiscoveryCeremony(
  container: HTMLElement,
  item: WonderDiscoveryRevealItem,
  callbacks: WonderDiscoveryCeremonyCallbacks,
  options: WonderDiscoveryCeremonyOptions = {},
): HTMLElement {
  container.querySelector('#wonder-discovery-ceremony')?.remove();
  const reducedMotion = options.reducedMotion ?? false;
  let resolved = false;

  const overlay = document.createElement('section');
  overlay.id = 'wonder-discovery-ceremony';
  overlay.tabIndex = -1;
  overlay.dataset.wonderDiscoveryMotion = reducedMotion ? 'static' : 'animated';
  overlay.style.cssText = [
    'position:absolute',
    'inset:0',
    'z-index:80',
    'background:rgba(4,7,13,0.78)',
    'color:#f8f1df',
    'display:grid',
    'place-items:center',
    'padding:18px',
    'pointer-events:auto',
  ].join(';');

  const panel = document.createElement('div');
  panel.style.cssText = [
    'width:min(560px,calc(100vw - 28px))',
    'border:1px solid rgba(232,193,112,0.42)',
    'border-radius:8px',
    `background:linear-gradient(180deg,rgba(20,24,32,0.98),${item.visual.palette.base})`,
    'box-shadow:0 22px 70px rgba(0,0,0,0.62)',
    'padding:22px',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:14px',
    'text-align:center',
  ].join(';');

  const skip = createGameButton('Skip', 'ghost');
  skip.dataset.wonderDiscoveryAction = 'skip';
  skip.style.alignSelf = 'flex-end';

  const vignette = createWonderVisualVignette(item.name, item.visual, { reducedMotion, kind: 'natural' });
  vignette.style.width = '148px';
  vignette.style.height = '148px';
  vignette.style.flexBasis = '148px';

  appendText(panel, 'p', item.title, 'margin:0;color:#e8c170;font-size:12px;letter-spacing:0;text-transform:uppercase;font-weight:700;');
  appendText(panel, 'h2', item.name, 'margin:0;font-size:clamp(24px,4vw,38px);line-height:1.05;letter-spacing:0;');
  appendText(panel, 'p', item.revealLine, 'margin:0;font-size:15px;line-height:1.45;max-width:46ch;');

  const facts = document.createElement('div');
  facts.style.cssText = 'display:grid;grid-template-columns:1fr;gap:8px;width:100%;text-align:left;';
  appendText(facts, 'p', item.effectSummary, 'margin:0;padding:10px;border-radius:8px;background:rgba(255,255,255,0.07);font-size:13px;line-height:1.35;');
  appendText(facts, 'p', item.rewardSummary, 'margin:0;padding:10px;border-radius:8px;background:rgba(232,193,112,0.12);font-size:13px;line-height:1.35;color:#ffe2a1;');

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;width:100%;';
  const continueButton = createGameButton('Continue', 'primary');
  continueButton.dataset.wonderDiscoveryAction = 'continue';
  const atlasButton = createGameButton('Open Atlas', 'secondary');
  atlasButton.dataset.wonderDiscoveryAction = 'open-atlas';
  actions.append(continueButton, atlasButton);

  function resolve(action: WonderDiscoveryCeremonyAction): void {
    if (resolved) return;
    resolved = true;
    overlay.remove();
    callbacks.onResolve(action);
  }

  skip.addEventListener('click', () => resolve('skip'));
  continueButton.addEventListener('click', () => resolve('continue'));
  atlasButton.addEventListener('click', () => resolve('open-atlas'));
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') resolve('skip');
  });

  panel.prepend(skip);
  panel.append(vignette, facts, actions);
  overlay.appendChild(panel);
  container.appendChild(overlay);
  overlay.focus();

  window.setTimeout(() => {
    overlay.dataset.wonderDiscoveryPhase = 'settled';
  }, reducedMotion ? 0 : options.revealDurationMs ?? 3600);

  return overlay;
}
```

- [ ] **Step 5: Run ceremony and Atlas UI tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-discovery-ceremony.test.ts tests/ui/wonder-atlas-panel.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/ui/wonder-vignette.ts src/ui/wonder-discovery-ceremony.ts tests/ui/wonder-discovery-ceremony.test.ts
git commit -m "feat: add wonder discovery ceremony ui"
```

### Task 3: Reveal Queue Coordinator

**Files:**
- Create: `src/ui/wonder-discovery-queue.ts`
- Test: `tests/ui/wonder-discovery-queue.test.ts`

- [ ] **Step 1: Write failing queue tests**

Create `tests/ui/wonder-discovery-queue.test.ts`:

```ts
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import { createWonderDiscoveryRevealQueue } from '@/ui/wonder-discovery-queue';
import type { WonderDiscoveryCeremonyAction } from '@/ui/wonder-discovery-ceremony';

function item(wonderId: string, q: number): WonderDiscoveryRevealItem {
  return {
    title: 'Natural Wonder Discovered',
    wonderId,
    civId: 'player',
    coord: { q, r: 0 },
    name: wonderId === 'great_volcano' ? 'Great Volcano' : 'Crystal Caverns',
    revealLine: 'A discovery line.',
    effectSummary: 'Yields +1 Science',
    rewardSummary: '+30 Science discovery reward',
    visual: getWonderVisualDefinition(wonderId),
    motionAssetId: null,
  };
}

describe('wonder-discovery-queue', () => {
  it('waits for action-settled before presenting the first ceremony', () => {
    const presented: WonderDiscoveryRevealItem[] = [];
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      present: reveal => { presented.push(reveal); return Promise.resolve('continue'); },
      requestMapHighlight: vi.fn(),
      openAtlas: vi.fn(),
      reducedMotion: () => false,
    });

    queue.enqueue(item('great_volcano', 2));
    queue.pump();
    expect(presented).toHaveLength(0);

    queue.notifyActionSettled();
    expect(presented).toHaveLength(1);
  });

  it('plays multiple items one at a time in event order', async () => {
    const resolvers: Array<(action: WonderDiscoveryCeremonyAction) => void> = [];
    const requestMapHighlight = vi.fn();
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      present: reveal => new Promise(resolve => { resolvers.push(resolve); document.body.dataset.activeWonder = reveal.wonderId; }),
      requestMapHighlight,
      openAtlas: vi.fn(),
      reducedMotion: () => false,
    });

    queue.enqueue(item('great_volcano', 2));
    queue.enqueue(item('crystal_caverns', 4));
    queue.notifyActionSettled();

    expect(document.body.dataset.activeWonder).toBe('great_volcano');
    resolvers[0]('continue');
    await Promise.resolve();
    expect(requestMapHighlight).toHaveBeenCalledWith(expect.objectContaining({ wonderId: 'great_volcano' }), false);
    expect(document.body.dataset.activeWonder).toBe('crystal_caverns');
  });

  it('waits while another blocking UI is active and resumes when pumped', () => {
    let blocked = true;
    const present = vi.fn(() => Promise.resolve('continue' as const));
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => blocked,
      present,
      requestMapHighlight: vi.fn(),
      openAtlas: vi.fn(),
      reducedMotion: () => false,
    });

    queue.enqueue(item('great_volcano', 2));
    queue.notifyActionSettled();
    expect(present).not.toHaveBeenCalled();

    blocked = false;
    queue.pump();
    expect(present).toHaveBeenCalledTimes(1);
  });

  it('opens Atlas after requesting the map highlight for open-atlas resolution', async () => {
    const calls: string[] = [];
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      present: () => Promise.resolve('open-atlas'),
      requestMapHighlight: reveal => { calls.push(`highlight:${reveal.wonderId}`); },
      openAtlas: wonderId => { calls.push(`atlas:${wonderId}`); },
      reducedMotion: () => true,
    });

    queue.enqueue(item('great_volcano', 2));
    queue.notifyActionSettled();
    await Promise.resolve();

    expect(calls).toEqual(['highlight:great_volcano', 'atlas:great_volcano']);
  });

  it('dedupes a same-session civ and wonder reveal after one is queued', () => {
    const present = vi.fn(() => Promise.resolve('continue' as const));
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      present,
      requestMapHighlight: vi.fn(),
      openAtlas: vi.fn(),
      reducedMotion: () => false,
    });

    queue.enqueue(item('great_volcano', 2));
    queue.enqueue(item('great_volcano', 2));
    queue.notifyActionSettled();

    expect(queue.pendingCount()).toBe(0);
    expect(present).toHaveBeenCalledTimes(1);
  });

  it('requires a fresh action-settled signal for a later discovery after the queue drains', async () => {
    const present = vi.fn(() => Promise.resolve('continue' as const));
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      present,
      requestMapHighlight: vi.fn(),
      openAtlas: vi.fn(),
      reducedMotion: () => false,
    });

    queue.enqueue(item('great_volcano', 2));
    queue.notifyActionSettled();
    await Promise.resolve();
    expect(present).toHaveBeenCalledTimes(1);

    queue.enqueue(item('crystal_caverns', 4));
    queue.pump();
    expect(present).toHaveBeenCalledTimes(1);

    queue.notifyActionSettled();
    expect(present).toHaveBeenCalledTimes(2);
  });

  it('marks the ceremony as blocking only while the reveal is active', async () => {
    const overlays: Array<string | null> = [];
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      present: () => Promise.resolve('continue'),
      requestMapHighlight: vi.fn(),
      openAtlas: vi.fn(),
      reducedMotion: () => false,
      setBlockingOverlay: id => overlays.push(id),
    });

    queue.enqueue(item('great_volcano', 2));
    queue.notifyActionSettled();
    await Promise.resolve();

    expect(overlays).toEqual(['wonder-discovery-ceremony', null]);
  });
});
```

- [ ] **Step 2: Run failing queue tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-discovery-queue.test.ts
```

Expected: fail because `src/ui/wonder-discovery-queue.ts` does not exist.

- [ ] **Step 3: Implement the queue coordinator**

Create `src/ui/wonder-discovery-queue.ts`:

```ts
import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { createWonderDiscoveryCeremony, type WonderDiscoveryCeremonyAction } from '@/ui/wonder-discovery-ceremony';

export interface WonderDiscoveryRevealQueueOptions {
  container: HTMLElement;
  isInteractionBlocked: () => boolean;
  requestMapHighlight: (item: WonderDiscoveryRevealItem, reducedMotion: boolean) => void;
  openAtlas: (wonderId: string) => void;
  reducedMotion: () => boolean;
  present?: (item: WonderDiscoveryRevealItem) => Promise<WonderDiscoveryCeremonyAction>;
  onRevealStarted?: (item: WonderDiscoveryRevealItem) => void;
  setBlockingOverlay?: (id: string | null) => void;
}

export interface WonderDiscoveryRevealQueue {
  enqueue(item: WonderDiscoveryRevealItem): void;
  notifyActionSettled(): void;
  pump(): void;
  pendingCount(): number;
}

function keyFor(item: WonderDiscoveryRevealItem): string {
  return `${item.civId}:${item.wonderId}`;
}

export function createWonderDiscoveryRevealQueue(options: WonderDiscoveryRevealQueueOptions): WonderDiscoveryRevealQueue {
  const pending: WonderDiscoveryRevealItem[] = [];
  const seen = new Set<string>();
  let presenting = false;
  let actionSettled = false;

  const present = options.present ?? ((item: WonderDiscoveryRevealItem) => new Promise<WonderDiscoveryCeremonyAction>(resolve => {
    createWonderDiscoveryCeremony(
      options.container,
      item,
      { onResolve: resolve },
      { reducedMotion: options.reducedMotion() },
    );
  }));

  async function play(item: WonderDiscoveryRevealItem): Promise<void> {
    presenting = true;
    options.setBlockingOverlay?.('wonder-discovery-ceremony');
    options.onRevealStarted?.(item);
    const reducedMotion = options.reducedMotion();
    let action: WonderDiscoveryCeremonyAction = 'continue';
    try {
      action = await present(item);
    } finally {
      options.setBlockingOverlay?.(null);
    }
    options.requestMapHighlight(item, reducedMotion);
    if (action === 'open-atlas') {
      options.openAtlas(item.wonderId);
    }
    presenting = false;
    pump();
  }

  function pump(): void {
    if (!actionSettled || presenting || options.isInteractionBlocked()) return;
    const next = pending.shift();
    if (!next) return;
    void play(next);
  }

  return {
    enqueue(item) {
      const key = keyFor(item);
      if (seen.has(key)) return;
      seen.add(key);
      if (!presenting && pending.length === 0) {
        actionSettled = false;
      }
      pending.push(item);
      pump();
    },
    notifyActionSettled() {
      actionSettled = true;
      pump();
    },
    pump,
    pendingCount() {
      return pending.length;
    },
  };
}
```

- [ ] **Step 4: Run queue and ceremony tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-discovery-queue.test.ts tests/ui/wonder-discovery-ceremony.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/ui/wonder-discovery-queue.ts tests/ui/wonder-discovery-queue.test.ts
git commit -m "feat: queue wonder discovery reveals"
```

### Task 4: Map Pulse And Highlight Rendering

**Files:**
- Modify: `src/renderer/animation-system.ts`
- Modify: `src/renderer/render-loop.ts`
- Test: `tests/renderer/wonder-discovery-highlight.test.ts`

- [ ] **Step 1: Write failing renderer tests**

Create `tests/renderer/wonder-discovery-highlight.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { RenderLoop } from '@/renderer/render-loop';
import type { GameState } from '@/core/types';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';

function canvas(): HTMLCanvasElement {
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;

  return {
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 320, height: 240 }),
  } as unknown as HTMLCanvasElement;
}

function state(): GameState {
  return {
    turn: 1,
    currentPlayer: 'player',
    map: { width: 5, height: 3, wrapsHorizontally: false, tiles: {}, rivers: [] },
    tribalVillages: {},
    minorCivs: {},
    cities: {},
    units: {},
    civilizations: {
      player: {
        color: '#4a90d9',
        visibility: { tiles: { '2,0': 'visible' } },
      },
    },
  } as unknown as GameState;
}

describe('wonder discovery highlight', () => {
  it('centers the camera and schedules an animated pulse at the event coordinate', () => {
    const loop = new RenderLoop(canvas());
    loop.setGameState(state());
    const add = vi.spyOn(loop.animations, 'add');
    const center = vi.spyOn(loop.camera, 'centerOn');

    loop.requestWonderDiscoveryHighlight({ q: 2, r: 0 }, getWonderVisualDefinition('great_volcano'), { reducedMotion: false });

    expect(center).toHaveBeenCalledWith({ q: 2, r: 0 });
    expect(add).toHaveBeenCalledWith(
      'wonder-discovery-pulse',
      900,
      expect.objectContaining({ accent: expect.any(String), glow: expect.any(String) }),
    );
  });

  it('uses a static highlight for reduced motion without replacing selection highlights', () => {
    const loop = new RenderLoop(canvas());
    loop.setGameState(state());
    loop.setHighlights([{ coord: { q: 1, r: 0 }, type: 'move' }]);
    const add = vi.spyOn(loop.animations, 'add');

    loop.requestWonderDiscoveryHighlight({ q: 2, r: 0 }, getWonderVisualDefinition('great_volcano'), { reducedMotion: true });

    expect(add).toHaveBeenCalledWith(
      'wonder-discovery-static-highlight',
      900,
      expect.objectContaining({ accent: expect.any(String) }),
    );
    expect((loop as unknown as { highlights: unknown[] }).highlights).toEqual([{ coord: { q: 1, r: 0 }, type: 'move' }]);
  });
});
```

- [ ] **Step 2: Run failing renderer tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/wonder-discovery-highlight.test.ts
```

Expected: fail because `requestWonderDiscoveryHighlight` is not defined.

- [ ] **Step 3: Add animation render cases**

Modify `src/renderer/animation-system.ts` inside `renderAnimation`:

```ts
      case 'wonder-discovery-pulse': {
        const { x, y, size, accent, glow } = anim.data;
        const alpha = 1 - progress;
        ctx.save();
        ctx.strokeStyle = glow;
        ctx.globalAlpha = Math.max(0.15, alpha);
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.beginPath();
        ctx.arc(x, y, size * (0.48 + progress * 0.72), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = Math.max(0.10, alpha * 0.35);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(x, y, size * (0.32 + progress * 0.18), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'wonder-discovery-static-highlight': {
        const { x, y, size, accent } = anim.data;
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = Math.max(2, size * 0.05);
        ctx.beginPath();
        ctx.arc(x, y, size * 0.62, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }
```

- [ ] **Step 4: Add render-loop highlight request method**

Modify `src/renderer/render-loop.ts`:

```ts
import type { WonderVisualDefinition } from '@/systems/wonder-visual-catalog';
```

Add this public method to `RenderLoop`:

```ts
  requestWonderDiscoveryHighlight(
    coord: HexCoord,
    visual: WonderVisualDefinition,
    options: { reducedMotion: boolean },
  ): void {
    this.camera.centerOn(coord);
    const pixel = hexToPixel(coord, this.camera.hexSize);
    const screen = this.camera.worldToScreen(pixel.x, pixel.y);
    const size = this.camera.hexSize * this.camera.zoom;
    this.animations.add(
      options.reducedMotion ? 'wonder-discovery-static-highlight' : 'wonder-discovery-pulse',
      900,
      {
        x: screen.x,
        y: screen.y,
        size,
        accent: visual.palette.accent,
        glow: visual.palette.glow,
      },
    );
  }
```

- [ ] **Step 5: Run renderer tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/wonder-discovery-highlight.test.ts tests/renderer/render-loop-wrap.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/renderer/animation-system.ts src/renderer/render-loop.ts tests/renderer/wonder-discovery-highlight.test.ts
git commit -m "feat: add wonder discovery map highlight"
```

### Task 5: Live Event Wiring In Main

**Files:**
- Modify: `src/main.ts`
- Test: `tests/ui/wonder-discovery-queue.test.ts`
- Test: `tests/systems/unit-movement-system.test.ts`

- [ ] **Step 1: Add an integration-oriented movement event assertion**

In `tests/systems/unit-movement-system.test.ts`, add or extend coverage around the existing movement discovery event so the payload remains sufficient for Stage 2B:

```ts
it('emits wonder discovery with the revealed event coordinate for presentation wiring', () => {
  const { state, unitId } = makeAutoExploreFixture({ wonderNorth: 'grand_canyon', safeFogNorth: true });
  const target = { q: 1, r: 0 };
  const bus = new EventBus();
  const events: Array<GameEvents['wonder:discovered']> = [];
  bus.on('wonder:discovered', event => events.push(event));

  executeUnitMove(state, unitId, target, { actor: 'player', civId: 'player', bus });

  expect(events).toContainEqual(expect.objectContaining({
    civId: 'player',
    wonderId: 'grand_canyon',
    position: target,
  }));
});
```

- [ ] **Step 2: Run the targeted movement test**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/unit-movement-system.test.ts
```

Expected: pass if existing payload is already correct; fail only if the fixture needs adjustment.

- [ ] **Step 3: Wire queue creation and event listener in `src/main.ts`**

Add imports:

```ts
import { buildWonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { createWonderDiscoveryRevealQueue } from '@/ui/wonder-discovery-queue';
```

Create the queue after `renderLoop`, `uiLayer`, and `openWonderAtlas` are available:

```ts
const wonderDiscoveryQueue = createWonderDiscoveryRevealQueue({
  container: uiLayer,
  isInteractionBlocked: () => uiInteractions.isInteractionBlocked(),
  requestMapHighlight: (item, reducedMotion) => {
    renderLoop.requestWonderDiscoveryHighlight(item.coord, item.visual, { reducedMotion });
  },
  openAtlas: wonderId => openWonderAtlas(wonderId),
  reducedMotion: () => typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  setBlockingOverlay: id => uiInteractions.setBlockingOverlay(id),
});
```

Modify the existing `bus.on('wonder:discovered', ...)` listener without changing the current log message:

```ts
bus.on('wonder:discovered', event => {
  const wonderDef = getWonderDefinition(event.wonderId);
  if (!wonderDef) return;
  const message = event.isFirstDiscoverer
    ? `Discovered ${wonderDef.name}! +${wonderDef.discoveryBonus.amount} ${wonderDef.discoveryBonus.type}`
    : `Found ${wonderDef.name}!`;
  appendToCivLog(event.civId, message, event.isFirstDiscoverer ? 'success' : 'info');

  const revealItem = buildWonderDiscoveryRevealItem(gameState, gameState.currentPlayer, event);
  if (revealItem) {
    wonderDiscoveryQueue.enqueue(revealItem);
  }
});
```

Modify `animateMovedUnit` completion callback so discovery ceremonies wait until movement settles:

```ts
  renderLoop.animateUnitMove({ ...movedUnit, position: from }, from, to, () => {
    renderLoop.setGameState(gameState);
    updateHUD();
    wonderDiscoveryQueue.notifyActionSettled();
    const unit = gameState.units[unitId];
    if (!unit || unit.owner !== gameState.currentPlayer) return;
    if ((unit.movementPointsLeft ?? 0) <= 0) {
      selectNextUnit();
    } else if (selectedUnitId === unitId) {
      selectUnit(unitId);
    }
  });
```

For non-animated future event sources, call `wonderDiscoveryQueue.notifyActionSettled()` after their state update and visible feedback complete.

- [ ] **Step 4: Keep blocking overlay ownership in the queue**

The queue owns ceremony blocking through `setBlockingOverlay`. The main wiring passes the existing `uiInteractions.setBlockingOverlay` callback, and `tests/ui/wonder-discovery-queue.test.ts` proves the callback receives `'wonder-discovery-ceremony'` before presentation and `null` after resolution. Existing blocking overlays in `main.ts` remain unchanged.

- [ ] **Step 5: Run live wiring tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/unit-movement-system.test.ts tests/ui/wonder-discovery-queue.test.ts tests/systems/wonder-discovery-reveal.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/main.ts tests/systems/unit-movement-system.test.ts tests/ui/wonder-discovery-queue.test.ts
git commit -m "feat: wire wonder discovery ceremonies"
```

### Task 6: Regression Sweep And Spec Review

**Files:**
- Review: `docs/superpowers/specs/2026-05-21-wonder-discovery-reveal-design.md`
- Review: committed and uncommitted diffs

- [ ] **Step 1: Run source rule checks for changed source files**

Run with the exact changed `src/` files:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/wonder-presentation-formatting.ts src/systems/wonder-atlas-presentation.ts src/systems/wonder-discovery-reveal.ts src/ui/wonder-vignette.ts src/ui/wonder-discovery-ceremony.ts src/ui/wonder-discovery-queue.ts src/renderer/animation-system.ts src/renderer/render-loop.ts src/main.ts
```

Expected: pass with no rule violations.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-discovery-reveal.test.ts tests/systems/wonder-atlas-presentation.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/wonder-discovery-queue.test.ts tests/ui/wonder-atlas-panel.test.ts tests/renderer/wonder-discovery-highlight.test.ts tests/renderer/render-loop-wrap.test.ts tests/systems/unit-movement-system.test.ts
```

Expected: pass.

- [ ] **Step 3: Run wonder regression bundle**

Run:

```bash
./scripts/run-wonder-regressions.sh
```

Expected: pass.

- [ ] **Step 4: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: pass; this is the TypeScript check.

- [ ] **Step 5: Run full test suite before push or PR**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: pass.

- [ ] **Step 6: Review diffs against spec and base**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- docs/superpowers/specs/2026-05-21-wonder-discovery-reveal-design.md src tests
git diff -- src tests
```

Confirm:

- No gameplay reward, placement, AI, fog, save-format, or legendary construction rules changed.
- No ceremony can be built from Atlas browsing, save reconstruction, last-seen data, or hidden map scans.
- `Continue` is primary/default, `Open Atlas` is secondary, and `Skip` is immediate.
- AI and wrong-viewer discoveries do not enqueue or render.
- The event coordinate is the only map pulse target.
- Reduced-motion mode has no dependency on animation completion.
- No new sound or video loading is shipped.
- No player-visible queue or dead-end action was introduced.

- [ ] **Step 7: Commit regression-fix changes when verification changes files**

When verification changes files, commit them separately:

```bash
git add <changed-files>
git commit -m "fix: harden wonder discovery reveal"
```

## Self-Review

### Spec Coverage

- Full ceremony after human natural wonder discovery: Tasks 1, 2, 3, and 5.
- First discovery per human civ, not first-ever world discovery: Task 1 tests `isFirstDiscoverer: false` human event.
- No AI or wrong-viewer leak: Task 1 and Task 3 negative tests.
- Queue one at a time: Task 3.
- Wait until triggering action settles: Task 3 and Task 5.
- Continue, Skip, Open Atlas: Task 2 and Task 3.
- Map pulse/highlight at event coordinate: Task 4 and Task 5.
- Reduced motion static ceremony/highlight: Task 2, Task 3, and Task 4.
- Optional reveal line fallback: Task 1.
- Video-ready hook without real video: Task 1 `motionAssetId: null`.
- No sound with later hook preservation: Task 3 `onRevealStarted` hook; no audio call.
- No save-format or gameplay mutation changes: Task 6 diff review and targeted tests.

### Placeholder Scan

The plan contains concrete paths, commands, expected outcomes, and code snippets for each code-writing step. It intentionally does not use placeholder markers.

### Type Consistency

- `WonderDiscoveryRevealItem` is defined once in `src/systems/wonder-discovery-reveal.ts`.
- `WonderDiscoveryCeremonyAction` is defined once in `src/ui/wonder-discovery-ceremony.ts` and reused by the queue tests.
- Queue callbacks use `requestMapHighlight(item, reducedMotion)` and `openAtlas(wonderId)` consistently across tests and wiring.
