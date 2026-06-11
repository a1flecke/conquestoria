# Legendary Beasts MR2 — Bestiary Panel + Sighting Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor model:** Sonnet 4.5. Code blocks are grounded in the codebase as it exists **after MR1 merged**. If a `beast-*` symbol is missing, MR1 has not merged — stop.

**Goal:** Give players a per-civ Bestiary (Unknown / Sighted / Slain collection book), first-sighting banners, and per-civ sighting tracking — the 10-year-old's collection layer.

**Architecture:** A viewer-safe presentation module (`beast-presentation.ts`) follows the `*ForPlayer` privacy pattern: unknown beasts expose ONLY the riddle hint — never name, sprite, or habitat. Sightings are recorded by a transition-owned helper that returns explicit payloads (no re-derivation from steady state). UI is DOM/CSS like every other panel; the Bestiary opens from the pause menu.

**Tech Stack:** TypeScript, vitest (jsdom for DOM tests — mirror existing `tests/ui/` setup), DOM/CSS panels, `createGameButton` from `src/ui/ui-kit.ts`.

**Dependencies:** MR1 merged. Branches from `main`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/core/types.ts` | Modify | `'beast:sighted'` event |
| `src/systems/beast-presentation.ts` | Create | `getBestiaryEntriesForPlayer` (privacy-masked), `recordBeastSightings` (transition-owned) |
| `src/ui/bestiary-panel.ts` | Create | The collection-book panel |
| `src/ui/beast-sighting-banner.ts` | Create | First-sighting modal banner |
| `src/ui/pause-menu-panel.ts` | Modify | "Bestiary" button |
| `src/main.ts` | Modify | Wire sighting scan + banner + panel opening |
| `tests/systems/beast-presentation.test.ts` | Create | Masking + transition tests |
| `tests/ui/bestiary-panel.test.ts` | Create | Rendered-DOM tests |

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Pause menu open | Tap "Bestiary" | Bestiary panel opens listing every beast on this map as Unknown/Sighted/Slain |
| A beast unit enters my vision for the first time | (passive) | Sighting banner appears: sprite, name, "Sighted!" + Continue / Open Bestiary buttons |
| Sighting banner shown | Tap "Open Bestiary" | Banner closes, Bestiary opens, that beast now renders as Sighted with full art |
| Bestiary open, beast was slain by my civ last turn | Reopen Bestiary | Entry shows "Slain — by <my civ>, turn N" |
| Hot-seat: player 2 sighted the boar, player 1 did not | Player 1 opens Bestiary | Player 1 still sees Unknown (riddle only) — sightings are per-civ |

## Misleading-UI risks

- **"Unknown" must leak nothing**: not the name, not the habitat terrain, not the sprite, not the map location. Only `dangerHint`. A negative test proves the rendered Unknown entry contains neither the beast name nor a habitat word.
- **"Sighted" ≠ "Slain"**: sighted shows art + name + danger tier; slain-by info appears ONLY when `lair.status === 'slain'`.
- **Slain is global, sightings are per-civ**: any player sees who slew a beast (public glory), but an unsighted *living* beast stays Unknown even if another civ has seen it.
- The panel lists only beasts whose lairs exist **on this map** — never the full roster (small maps place 3 lairs; listing 8 entries would promise beasts that don't exist).

## Interaction replay checklist (tests must cover)

1. Open Bestiary with zero sightings → all entries Unknown
2. Record a sighting → reopen → entry Sighted
3. Mark lair slain → reopen → entry Slain with slayer
4. Open → close → reopen (no duplicate panels; `container.querySelector('#bestiary-panel')` count is 1)
5. Sighting banner Continue closes it; second sighting of the SAME beast never re-banners (transition-owned)

---

### Task 1: `beast:sighted` event

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Add to `GameEvents`** (next to the MR1 beast events):

```typescript
  'beast:sighted': { beastId: BeastId; civId: string };
```

- [ ] **Step 2: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(beasts): beast:sighted event"
```

---

### Task 2: Presentation module — masking + sighting transitions

**Files:**
- Create: `src/systems/beast-presentation.ts`
- Test: `tests/systems/beast-presentation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/systems/beast-presentation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getBestiaryEntriesForPlayer, recordBeastSightings } from '@/systems/beast-presentation';
import { createNewGame } from '@/core/game-state';
import type { GameState, Unit } from '@/core/types';

function stateWithLair(): GameState {
  const state = createNewGame('rome', 'bestiary-seed', 'small', 'Bestiary Test');
  state.beasts = {
    mode: 'wild',
    lairs: {
      'lair-giant_boar': {
        id: 'lair-giant_boar', beastId: 'giant_boar', position: { q: 10, r: 10 },
        status: 'awake', strength: 0, unitIds: ['beast-1'],
      },
    },
    sightingsByCiv: {},
  };
  state.units['beast-1'] = {
    id: 'beast-1', type: 'beast_boar', owner: 'beasts', position: { q: 10, r: 10 },
    movementPointsLeft: 2, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false,
  } as Unit;
  return state;
}

describe('getBestiaryEntriesForPlayer', () => {
  it('masks EVERYTHING except the hint for unsighted beasts', () => {
    const entries = getBestiaryEntriesForPlayer(stateWithLair(), 'player');
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.status).toBe('unknown');
    expect(entry.hint.length).toBeGreaterThan(10);
    expect(entry.name).toBeUndefined();
    expect(entry.unitType).toBeUndefined();
    expect(entry.tier).toBeUndefined();
    expect(entry.slainBy).toBeUndefined();
  });

  it('reveals name/tier/unitType after sighting, per civ', () => {
    const state = stateWithLair();
    state.beasts!.sightingsByCiv['player'] = ['giant_boar'];
    const mine = getBestiaryEntriesForPlayer(state, 'player');
    expect(mine[0].status).toBe('sighted');
    expect(mine[0].name).toBe('Giant Boar');
    expect(mine[0].unitType).toBe('beast_boar');
    const theirs = getBestiaryEntriesForPlayer(state, 'ai-1');
    expect(theirs[0].status).toBe('unknown');
    expect(theirs[0].name).toBeUndefined();
  });

  it('shows slain status with slayer to everyone', () => {
    const state = stateWithLair();
    state.beasts!.lairs['lair-giant_boar'].status = 'slain';
    state.beasts!.lairs['lair-giant_boar'].slainBy = 'ai-1';
    state.beasts!.lairs['lair-giant_boar'].slainTurn = 12;
    const entries = getBestiaryEntriesForPlayer(state, 'player');
    expect(entries[0].status).toBe('slain');
    expect(entries[0].name).toBe('Giant Boar');
    expect(entries[0].slainBy).toBe('ai-1');
    expect(entries[0].slainTurn).toBe(12);
  });

  it('lists only beasts whose lairs exist on this map', () => {
    const state = stateWithLair();
    const entries = getBestiaryEntriesForPlayer(state, 'player');
    expect(entries.map(e => e.lairId)).toEqual(['lair-giant_boar']);
  });
});

describe('recordBeastSightings', () => {
  it('returns new sightings exactly once (transition-owned)', () => {
    const state = stateWithLair();
    const visible = new Set(['10,10']);   // beast position is visible
    const first = recordBeastSightings(state, 'player', visible);
    expect(first.newSightings).toEqual(['giant_boar']);
    expect(first.state.beasts!.sightingsByCiv['player']).toEqual(['giant_boar']);
    const second = recordBeastSightings(first.state, 'player', visible);
    expect(second.newSightings).toEqual([]);
    // input state not mutated
    expect(state.beasts!.sightingsByCiv['player']).toBeUndefined();
  });

  it('does not sight beasts outside visible tiles', () => {
    const result = recordBeastSightings(stateWithLair(), 'player', new Set(['0,0']));
    expect(result.newSightings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-presentation.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/systems/beast-presentation.ts`**

```typescript
import type { BeastId, GameState, HexCoord, UnitType } from '@/core/types';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { BEAST_OWNER } from '@/systems/beast-system';
import { hexKey } from '@/systems/hex-utils';

export type BestiaryStatus = 'unknown' | 'sighted' | 'slain';

/** Viewer-safe bestiary entry. Unknown entries carry ONLY the hint — masking every other field is a privacy contract. */
export interface BestiaryEntry {
  lairId: string;
  status: BestiaryStatus;
  hint: string;
  name?: string;
  unitType?: UnitType;
  tier?: number;
  sightingFlavor?: string;
  slainBy?: string;
  slainTurn?: number;
}

export function getBestiaryEntriesForPlayer(state: GameState, civId: string): BestiaryEntry[] {
  if (!state.beasts) return [];
  const sighted = new Set(state.beasts.sightingsByCiv[civId] ?? []);
  return Object.values(state.beasts.lairs).map(lair => {
    const def = BEAST_DEFINITIONS[lair.beastId];
    const isSlain = lair.status === 'slain' || lair.status === 'claimed';
    if (isSlain) {
      return {
        lairId: lair.id, status: 'slain' as const, hint: def.dangerHint,
        name: def.name, unitType: def.unitType, tier: def.tier,
        slainBy: lair.slainBy, slainTurn: lair.slainTurn,
      };
    }
    if (sighted.has(lair.beastId)) {
      return {
        lairId: lair.id, status: 'sighted' as const, hint: def.dangerHint,
        name: def.name, unitType: def.unitType, tier: def.tier,
        sightingFlavor: def.sightingFlavor,
      };
    }
    return { lairId: lair.id, status: 'unknown' as const, hint: def.dangerHint };
  });
}

/**
 * Transition-owned sighting scan: returns the beasts that became sighted in THIS call.
 * visibleTileKeys: hexKey set of tiles currently visible to civId
 * (callers pass the civ's VisibilityMap keys with state 'visible').
 */
export function recordBeastSightings(
  state: GameState,
  civId: string,
  visibleTileKeys: ReadonlySet<string>,
): { state: GameState; newSightings: BeastId[] } {
  if (!state.beasts) return { state, newSightings: [] };
  const already = new Set(state.beasts.sightingsByCiv[civId] ?? []);
  const newSightings: BeastId[] = [];

  for (const unit of Object.values(state.units)) {
    if (unit.owner !== BEAST_OWNER) continue;
    if (!visibleTileKeys.has(hexKey(unit.position))) continue;
    const lair = Object.values(state.beasts.lairs).find(l => l.unitIds.includes(unit.id));
    if (!lair || already.has(lair.beastId)) continue;
    already.add(lair.beastId);
    newSightings.push(lair.beastId);
  }

  if (newSightings.length === 0) return { state, newSightings };
  return {
    state: {
      ...state,
      beasts: {
        ...state.beasts,
        sightingsByCiv: {
          ...state.beasts.sightingsByCiv,
          [civId]: [...(state.beasts.sightingsByCiv[civId] ?? []), ...newSightings],
        },
      },
    },
    newSightings,
  };
}
```

Check `hexKey` output format (`grep -n "export function hexKey" -A 3 src/systems/hex-utils.ts`). If it isn't `"q,r"`, align the test's `visible` sets with the real format.

- [ ] **Step 4: Run to verify pass, then commit**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-presentation.test.ts`
Expected: PASS.

```bash
git add src/systems/beast-presentation.ts tests/systems/beast-presentation.test.ts
git commit -m "feat(beasts): viewer-safe bestiary presentation and sighting transitions"
```

---

### Task 3: Bestiary panel UI

**Files:**
- Create: `src/ui/bestiary-panel.ts`
- Test: `tests/ui/bestiary-panel.test.ts`

Before writing buttons, invoke the project skill `.claude/skills/button-styling.md` (Skill tool) — all buttons via `createGameButton`, 44px min-height.

- [ ] **Step 1: Write failing DOM tests**

Look at an existing UI test first (`ls tests/ui/`, open one) and copy its jsdom setup. Create `tests/ui/bestiary-panel.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createBestiaryPanel } from '@/ui/bestiary-panel';
import type { BestiaryEntry } from '@/systems/beast-presentation';

const unknownEntry: BestiaryEntry = {
  lairId: 'lair-giant_boar', status: 'unknown',
  hint: 'Trees splinter and the ground is churned in the deep woods. Something heavy lives there.',
};
const sightedEntry: BestiaryEntry = {
  ...unknownEntry, status: 'sighted', name: 'Giant Boar', unitType: 'beast_boar', tier: 1,
  sightingFlavor: 'Your scouts lay eyes on the Giant Boar — a beast of legend!',
};
const slainEntry: BestiaryEntry = {
  ...sightedEntry, status: 'slain', slainBy: 'player', slainTurn: 22,
};

describe('bestiary panel', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders unknown entries with hint only — never the name (negative privacy test)', () => {
    createBestiaryPanel(container, [unknownEntry], { onClose: () => {}, slayerNameFor: () => '' });
    const panel = container.querySelector('#bestiary-panel')!;
    expect(panel.textContent).toContain('Something heavy lives there');
    expect(panel.textContent).not.toContain('Giant Boar');
    expect(panel.textContent).not.toContain('forest'); // habitat must not leak via labels
  });

  it('renders sighted entries with name and tier', () => {
    createBestiaryPanel(container, [sightedEntry], { onClose: () => {}, slayerNameFor: () => '' });
    const panel = container.querySelector('#bestiary-panel')!;
    expect(panel.textContent).toContain('Giant Boar');
    expect(panel.textContent).toContain('Sighted');
  });

  it('renders slain entries with slayer credit and turn', () => {
    createBestiaryPanel(container, [slainEntry], { onClose: () => {}, slayerNameFor: () => 'Rome' });
    const panel = container.querySelector('#bestiary-panel')!;
    expect(panel.textContent).toContain('Slain');
    expect(panel.textContent).toContain('Rome');
    expect(panel.textContent).toContain('22');
  });

  it('close button removes the panel; reopening never duplicates', () => {
    let closed = 0;
    createBestiaryPanel(container, [unknownEntry], { onClose: () => { closed++; }, slayerNameFor: () => '' });
    createBestiaryPanel(container, [unknownEntry], { onClose: () => { closed++; }, slayerNameFor: () => '' });
    expect(container.querySelectorAll('#bestiary-panel')).toHaveLength(1);
    (container.querySelector('#bestiary-panel button[data-action="close"]') as HTMLButtonElement).click();
    expect(container.querySelector('#bestiary-panel')).toBeNull();
    expect(closed).toBe(1);
  });

  it('lists every provided entry (catalog completeness)', () => {
    createBestiaryPanel(container, [unknownEntry, sightedEntry], { onClose: () => {}, slayerNameFor: () => '' });
    expect(container.querySelectorAll('#bestiary-panel [data-bestiary-entry]')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/bestiary-panel.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/ui/bestiary-panel.ts`**

```typescript
import type { BestiaryEntry } from '@/systems/beast-presentation';
import { createGameButton } from '@/ui/ui-kit';
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';

export interface BestiaryPanelCallbacks {
  onClose: () => void;
  slayerNameFor: (civId: string) => string;   // resolve civ display name; '' if unknown
}

const TIER_LABELS: Record<number, string> = {
  1: 'Dangerous', 2: 'Fearsome', 3: 'Terrifying', 4: 'Legendary',
};

export function createBestiaryPanel(
  container: HTMLElement,
  entries: BestiaryEntry[],
  callbacks: BestiaryPanelCallbacks,
): HTMLElement {
  container.querySelector('#bestiary-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'bestiary-panel';
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(12,12,24,0.96);z-index:40;padding:16px;overflow:auto;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';
  const title = document.createElement('h2');
  title.textContent = 'Bestiary';
  title.style.cssText = 'font-size:20px;color:#e8c170;margin:0;';
  header.appendChild(title);
  const closeButton = createGameButton('✕', 'close');
  closeButton.dataset.action = 'close';
  closeButton.addEventListener('click', () => { panel.remove(); callbacks.onClose(); });
  header.appendChild(closeButton);
  panel.appendChild(header);

  const intro = document.createElement('p');
  intro.textContent = 'Legendary beasts of this land. Sight them to learn their nature; slay them to claim their hoards.';
  intro.style.cssText = 'font-size:13px;opacity:0.8;margin:0 0 16px;';
  panel.appendChild(intro);

  for (const entry of entries) {
    const card = document.createElement('section');
    card.dataset.bestiaryEntry = entry.lairId;
    card.style.cssText = 'display:flex;gap:12px;align-items:center;margin-bottom:12px;background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;';

    const art = document.createElement('div');
    art.style.cssText = 'width:72px;height:72px;flex:none;display:flex;align-items:center;justify-content:center;';
    if (entry.status === 'unknown') {
      art.textContent = '❓';
      art.style.fontSize = '40px';
    } else if (entry.unitType) {
      const sprite = UNIT_SPRITE_CATALOG[entry.unitType];
      const svg = sprite({ palette: { mid: '#888', dark: '#555', bright: '#bbb', trim: '#999' } as never, svgOnly: true });
      const holder = document.createElement('div');
      holder.style.cssText = 'width:72px;height:72px;';
      // Sprite SVGs are module-authored strings, never game/user input — safe to parse.
      holder.innerHTML = svg;
      art.appendChild(holder);
    }
    card.appendChild(art);

    const body = document.createElement('div');
    if (entry.status === 'unknown') {
      const label = document.createElement('div');
      label.textContent = 'Unknown Beast';
      label.style.cssText = 'font-size:15px;color:#e8c170;';
      body.appendChild(label);
      const hint = document.createElement('div');
      hint.textContent = entry.hint;
      hint.style.cssText = 'font-size:12px;opacity:0.75;font-style:italic;';
      body.appendChild(hint);
    } else {
      const label = document.createElement('div');
      label.textContent = entry.name ?? '';
      label.style.cssText = 'font-size:15px;color:#e8c170;';
      body.appendChild(label);
      const statusLine = document.createElement('div');
      if (entry.status === 'slain') {
        const slayer = entry.slainBy ? callbacks.slayerNameFor(entry.slainBy) : '';
        statusLine.textContent = `Slain — by ${slayer || 'an unknown power'}, turn ${entry.slainTurn ?? '?'}`;
        statusLine.style.cssText = 'font-size:12px;color:#9ad17b;';
      } else {
        statusLine.textContent = `Sighted · ${TIER_LABELS[entry.tier ?? 1]}`;
        statusLine.style.cssText = 'font-size:12px;color:#d1a35a;';
      }
      body.appendChild(statusLine);
      const hint = document.createElement('div');
      hint.textContent = entry.hint;
      hint.style.cssText = 'font-size:12px;opacity:0.75;font-style:italic;';
      body.appendChild(hint);
    }
    card.appendChild(body);
    panel.appendChild(card);
  }

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No legendary beasts dwell in this land.';
    empty.style.cssText = 'font-size:13px;opacity:0.7;';
    panel.appendChild(empty);
  }

  container.appendChild(panel);
  return panel;
}
```

Check the `FactionPalette` field names (`grep -n "interface FactionPalette" -A 8 src/renderer/sprites/sprite-system.tsx`) and pass a real neutral palette object instead of the `as never` cast if the shape differs. The `innerHTML` use is acceptable ONLY because sprite SVG is module-authored; do not extend it to any game-state string.

- [ ] **Step 4: Run to verify pass, then commit**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/bestiary-panel.test.ts`
Expected: PASS.

```bash
git add src/ui/bestiary-panel.ts tests/ui/bestiary-panel.test.ts
git commit -m "feat(beasts): bestiary collection panel"
```

---

### Task 4: Sighting banner

**Files:**
- Create: `src/ui/beast-sighting-banner.ts`

- [ ] **Step 1: Implement (same modal pattern as the wonder discovery ceremony — read `src/ui/wonder-discovery-ceremony.ts:26` first)**

```typescript
import { createGameButton } from '@/ui/ui-kit';
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import type { UnitType } from '@/core/types';

export interface BeastSightingBannerOptions {
  name: string;
  flavor: string;
  unitType: UnitType;
  onContinue: () => void;
  onOpenBestiary: () => void;
}

export function showBeastSightingBanner(container: HTMLElement, options: BeastSightingBannerOptions): HTMLElement {
  container.querySelector('#beast-sighting-banner')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'beast-sighting-banner';
  overlay.style.cssText = 'position:absolute;inset:0;background:rgba(8,8,18,0.9);z-index:60;display:flex;align-items:center;justify-content:center;';

  const card = document.createElement('div');
  card.style.cssText = 'max-width:340px;background:#1a1a2e;border:2px solid #e8c170;border-radius:14px;padding:20px;text-align:center;';

  const kicker = document.createElement('div');
  kicker.textContent = 'BEAST SIGHTED';
  kicker.style.cssText = 'font-size:12px;letter-spacing:3px;color:#d1a35a;margin-bottom:8px;';
  card.appendChild(kicker);

  const art = document.createElement('div');
  art.style.cssText = 'width:120px;height:120px;margin:0 auto 8px;';
  const sprite = UNIT_SPRITE_CATALOG[options.unitType];
  art.innerHTML = sprite({ palette: { mid: '#888', dark: '#555', bright: '#bbb', trim: '#999' } as never, svgOnly: true });
  card.appendChild(art);

  const name = document.createElement('h2');
  name.textContent = options.name;
  name.style.cssText = 'font-size:22px;color:#e8c170;margin:0 0 8px;';
  card.appendChild(name);

  const flavor = document.createElement('p');
  flavor.textContent = options.flavor;
  flavor.style.cssText = 'font-size:13px;opacity:0.85;margin:0 0 16px;';
  card.appendChild(flavor);

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:8px;justify-content:center;';
  const continueButton = createGameButton('Continue', 'primary');
  continueButton.addEventListener('click', () => { overlay.remove(); options.onContinue(); });
  buttonRow.appendChild(continueButton);
  const bestiaryButton = createGameButton('Open Bestiary', 'secondary');
  bestiaryButton.addEventListener('click', () => { overlay.remove(); options.onOpenBestiary(); });
  buttonRow.appendChild(bestiaryButton);
  card.appendChild(buttonRow);

  overlay.appendChild(card);
  container.appendChild(overlay);
  return overlay;
}
```

Use the same neutral-palette fix as Task 3.

- [ ] **Step 2: Build, then commit**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS.

```bash
git add src/ui/beast-sighting-banner.ts
git commit -m "feat(beasts): first-sighting banner"
```

---

### Task 5: Wire it all in main.ts + pause menu

**Files:**
- Modify: `src/main.ts`
- Modify: `src/ui/pause-menu-panel.ts`

- [ ] **Step 1: Sighting scan after visibility updates**

Run: `grep -n "updateVisibility" src/main.ts` — every call site that refreshes the **current player's** visibility (after moves, turn start) is followed by:

```typescript
  const visibleKeys = new Set(
    Object.entries(/* the current player's VisibilityMap object */)
      .filter(([, v]) => v === 'visible')
      .map(([k]) => k),
  );
  const sightingResult = recordBeastSightings(gameState, gameState.currentPlayer, visibleKeys);
  gameState = sightingResult.state; // or copy .beasts slice, matching surrounding state-update style
  for (const beastId of sightingResult.newSightings) {
    bus.emit('beast:sighted', { beastId, civId: gameState.currentPlayer });
  }
```

If multiple call sites exist, extract this into one local function `scanBeastSightings()` in main.ts and call it from each. Check how the per-civ VisibilityMap is stored (`grep -n "visibility" src/core/types.ts | head`) to enumerate visible keys correctly.

- [ ] **Step 2: Banner + notification on `beast:sighted`**

Next to the MR1 beast listeners (~main.ts:3211):

```typescript
bus.on('beast:sighted', ({ beastId, civId }) => {
  const def = BEAST_DEFINITIONS[beastId];
  appendNotification(notificationLog, civId, {
    message: def.sightingFlavor, type: 'info', turn: gameState.turn,
  });
  if (civId === gameState.currentPlayer) {
    showBeastSightingBanner(uiContainer, {
      name: def.name, flavor: def.sightingFlavor, unitType: def.unitType,
      onContinue: () => {},
      onOpenBestiary: () => openBestiary(),
    });
  }
});
```

Find the container element other modals use (`grep -n "showPauseMenu(" src/main.ts` shows the container argument) and use the same one for `uiContainer`.

- [ ] **Step 3: `openBestiary` helper + pause menu button**

In main.ts:

```typescript
function openBestiary(): void {
  createBestiaryPanel(uiContainer, getBestiaryEntriesForPlayer(gameState, gameState.currentPlayer), {
    onClose: () => {},
    slayerNameFor: (civId) => gameState.civilizations[civId]?.name ?? civId,
  });
}
```

In `src/ui/pause-menu-panel.ts` (`showPauseMenu`, line 242): add an `onOpenBestiary: () => void` callback to `PauseMenuCallbacks` and a `createGameButton('Bestiary', 'secondary')` row alongside the existing menu buttons (mirror their layout exactly). Wire it in main.ts's `showPauseMenu` call: `onOpenBestiary: () => openBestiary()`. The pause menu should close itself when the bestiary opens (match how other pause-menu buttons dismiss the menu).

- [ ] **Step 4: Hot-seat turn handoff scan**

Sightings must also fire at the start of each hot-seat player's turn (their units may have gained vision during other players' turns). Find the turn-handoff completion path (`grep -n "turn-handoff\|handoff" src/main.ts | head`) and call the same `scanBeastSightings()` helper there.

- [ ] **Step 5: Full verification**

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test`
Expected: both exit 0.
Manual: `yarn dev` → new Wild game → march a scout to a 🐾 forest → when the boar awakens and enters vision, the banner appears once; Bestiary shows Sighted; pause menu button opens the Bestiary; restarting the panel never duplicates.

- [ ] **Step 6: Commit + PR**

```bash
git add src/main.ts src/ui/pause-menu-panel.ts
git commit -m "feat(beasts): wire sighting scan, banner, and bestiary into game shell"
git push -u origin HEAD
gh pr create --title "feat(beasts): MR2 — bestiary panel + sighting flow" --body "$(cat <<'EOF'
## Summary
- Per-civ Bestiary collection book (Unknown / Sighted / Slain) with privacy-masked unknown entries
- Transition-owned first-sighting flow: banner + notification, fires exactly once per civ per beast
- Pause-menu entry point

## Out of scope (see docs/superpowers/plans/2026-06-11-legendary-beasts-index.md)
- Remaining beasts (MR3, MR5–MR7), hoard choices/trophies (MR4), audio (MR8)

## Why this is safe to merge partial
All surfaces introduced (bestiary panel, sighting banner, pause-menu button) are fully wired and tested against rendered DOM. With only the Giant Boar in the roster the book simply has one entry per placed lair.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

- [ ] Unknown entries leak NOTHING (negative test asserts no name AND no habitat word in DOM)
- [ ] `recordBeastSightings` returns transition payloads; no steady-state re-derivation; second call returns `[]`
- [ ] Banner shows only for `state.currentPlayer` (hot-seat privacy)
- [ ] All buttons via `createGameButton`; no bare buttons (hook will flag)
- [ ] All dynamic text via `textContent`; the only `innerHTML` is module-authored sprite SVG
- [ ] Panel reopen never duplicates (`#bestiary-panel` singleton)
