# #82 — City UI: cycle in panel + tap-a-city-to-open

**See [README.md](README.md) for shared diagnosis context.**

**Direct causes:**
- (a) `src/ui/city-panel.ts` shows a single `City`; cycling lives in `src/main.ts:402-406` (close + reopen).
- (b) `src/main.ts:893 handleHexTap` has no city-detection branch.

**Fix:** Extract a tiny pure helper `getCityTapAction` so the tap routing is testable. Add `cities[]` + `currentIndex` + `onCycle` to the city panel API. Wire both via a shared `openCityPanelAtIndex` in `main.ts`.

---

## Task 1: `getCityTapAction` regression (RED)

**Files:**
- Create: `tests/systems/city-tap-action.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from 'vitest';
import { getCityTapAction } from '@/systems/city-tap-action';
import type { GameState } from '@/core/types';

function stateWithCities(cities: Array<{ id: string; owner: string; q: number; r: number }>): GameState {
  const map: Record<string, { id: string; owner: string; position: { q: number; r: number } }> = {};
  for (const c of cities) {
    map[c.id] = { id: c.id, owner: c.owner, position: { q: c.q, r: c.r } };
  }
  return { cities: map } as unknown as GameState;
}

describe('getCityTapAction', () => {
  it('returns open-own when the tapped hex contains a city owned by the viewer', () => {
    const state = stateWithCities([{ id: 'c1', owner: 'player', q: 3, r: 4 }]);
    expect(getCityTapAction(state, 'player', { q: 3, r: 4 })).toEqual({ kind: 'open-own', cityId: 'c1' });
  });

  it('returns show-foreign when the tapped hex contains a city owned by another civ', () => {
    const state = stateWithCities([{ id: 'c2', owner: 'ai-1', q: 5, r: 5 }]);
    expect(getCityTapAction(state, 'player', { q: 5, r: 5 })).toEqual({ kind: 'show-foreign', cityId: 'c2' });
  });

  it('returns null when no city is at the hex', () => {
    const state = stateWithCities([{ id: 'c1', owner: 'player', q: 0, r: 0 }]);
    expect(getCityTapAction(state, 'player', { q: 9, r: 9 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run and verify it fails**

```bash
yarn test tests/systems/city-tap-action.test.ts
```

Expected: FAIL — module does not exist.

---

## Task 2: Implement `getCityTapAction` (GREEN)

**Files:**
- Create: `src/systems/city-tap-action.ts`

- [ ] **Step 1: Write the helper**

```ts
import type { GameState, HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';

export type CityTapAction =
  | { kind: 'open-own'; cityId: string }
  | { kind: 'show-foreign'; cityId: string }
  | null;

export function getCityTapAction(
  state: GameState,
  viewerCivId: string,
  hex: HexCoord,
): CityTapAction {
  const key = hexKey(hex);
  for (const city of Object.values(state.cities)) {
    if (hexKey(city.position) !== key) continue;
    return city.owner === viewerCivId
      ? { kind: 'open-own', cityId: city.id }
      : { kind: 'show-foreign', cityId: city.id };
  }
  return null;
}
```

- [ ] **Step 2: Run regression**

```bash
yarn test tests/systems/city-tap-action.test.ts
```

Expected: PASS.

---

## Task 3: City-panel cycle regression (RED)

**Files:**
- Create: `tests/ui/city-panel-cycle.test.ts`

- [ ] **Step 1: Write the test**

This test uses the existing `wonder-panel-fixture` mock-DOM pattern (see `tests/ui/helpers/wonder-panel-fixture.ts`). Use jsdom for the click events:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { makeWonderPanelFixture } from './helpers/wonder-panel-fixture';

describe('city panel cycling', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders prev and next buttons when given multiple cities', () => {
    const { city, state } = makeWonderPanelFixture();
    const cityB = { ...city, id: 'city-b', name: 'Bravo' };
    const cityC = { ...city, id: 'city-c', name: 'Charlie' };
    state.cities = { [city.id]: city, [cityB.id]: cityB, [cityC.id]: cityC };

    createCityPanel(container, [city, cityB, cityC], 0, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onCycle: () => {},
    });

    expect(container.querySelector('#city-prev')).toBeTruthy();
    expect(container.querySelector('#city-next')).toBeTruthy();
  });

  it('invokes onCycle with the next index on next-click and wraps around', () => {
    const { city, state } = makeWonderPanelFixture();
    const cityB = { ...city, id: 'city-b', name: 'Bravo' };
    const cityC = { ...city, id: 'city-c', name: 'Charlie' };
    state.cities = { [city.id]: city, [cityB.id]: cityB, [cityC.id]: cityC };

    const onCycle = vi.fn();
    createCityPanel(container, [city, cityB, cityC], 2, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onCycle,
    });

    (container.querySelector('#city-next') as HTMLElement).click();
    expect(onCycle).toHaveBeenCalledWith(0); // wrap from 2 -> 0
  });

  it('invokes onCycle with the previous index on prev-click and wraps around', () => {
    const { city, state } = makeWonderPanelFixture();
    const cityB = { ...city, id: 'city-b', name: 'Bravo' };
    state.cities = { [city.id]: city, [cityB.id]: cityB };

    const onCycle = vi.fn();
    createCityPanel(container, [city, cityB], 0, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onCycle,
    });

    (container.querySelector('#city-prev') as HTMLElement).click();
    expect(onCycle).toHaveBeenCalledWith(1); // wrap from 0 -> 1
  });

  it('hides cycle buttons when only one city is provided', () => {
    const { city, state } = makeWonderPanelFixture();

    createCityPanel(container, [city], 0, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onCycle: () => {},
    });

    // Either the buttons are absent OR styled display:none — assert non-interactivity:
    const prev = container.querySelector('#city-prev') as HTMLElement | null;
    const next = container.querySelector('#city-next') as HTMLElement | null;
    expect(prev === null || prev.style.display === 'none').toBe(true);
    expect(next === null || next.style.display === 'none').toBe(true);
  });
});
```

- [ ] **Step 2: Update existing city-panel test for the new signature**

The existing `tests/ui/city-panel.test.ts` calls `createCityPanel(container, city, state, callbacks)`. After Task 4 changes the signature, that call will fail typing. Plan to also update it in Task 4 to pass `[city]` and `0`:

```ts
const panel = createCityPanel(container, [city], 0, state, {
  onBuild: () => {},
  onOpenWonderPanel: () => {},
  onClose: () => {},
  onCycle: () => {},
});
```

- [ ] **Step 3: Run and verify it fails**

```bash
yarn test tests/ui/city-panel-cycle.test.ts
```

Expected: FAIL — signature mismatch / `#city-prev` not found.

---

## Task 4: Add cycle controls to city panel (GREEN)

**Files:**
- Modify: `src/ui/city-panel.ts`
- Modify: `tests/ui/city-panel.test.ts` (signature update only — see Task 3 Step 2)

- [ ] **Step 1: Update interface and signature**

In `src/ui/city-panel.ts`, change:

```ts
export interface CityPanelCallbacks {
  onBuild: (cityId: string, itemId: string) => void;
  onOpenWonderPanel: (cityId: string) => void;
  onClose: () => void;
}

export function createCityPanel(
  container: HTMLElement,
  city: City,
  state: GameState,
  callbacks: CityPanelCallbacks,
): HTMLElement {
```

to:

```ts
export interface CityPanelCallbacks {
  onBuild: (cityId: string, itemId: string) => void;
  onOpenWonderPanel: (cityId: string) => void;
  onClose: () => void;
  onCycle: (newIndex: number) => void;
}

export function createCityPanel(
  container: HTMLElement,
  cities: City[],
  currentIndex: number,
  state: GameState,
  callbacks: CityPanelCallbacks,
): HTMLElement {
  const city = cities[currentIndex];
```

- [ ] **Step 2: Add prev/next buttons in the header**

In the header `<h2>` block (around line 88-95), replace:

```ts
<h2 style="font-size:18px;color:#e8c170;margin:0;"><span data-text="city-name"></span></h2>
```

with:

```ts
<h2 style="font-size:18px;color:#e8c170;margin:0;display:flex;align-items:center;gap:8px;">
  <button id="city-prev" type="button" aria-label="Previous city" style="background:rgba(255,255,255,0.1);border:none;color:#e8c170;font-size:18px;width:28px;height:28px;border-radius:6px;cursor:pointer;${cities.length <= 1 ? 'display:none;' : ''}">‹</button>
  <span data-text="city-name"></span>
  <button id="city-next" type="button" aria-label="Next city" style="background:rgba(255,255,255,0.1);border:none;color:#e8c170;font-size:18px;width:28px;height:28px;border-radius:6px;cursor:pointer;${cities.length <= 1 ? 'display:none;' : ''}">›</button>
</h2>
```

- [ ] **Step 3: Wire prev/next handlers**

After the close button handler (around line 168), add:

```ts
panel.querySelector('#city-prev')?.addEventListener('click', () => {
  const newIdx = (currentIndex - 1 + cities.length) % cities.length;
  panel.remove();
  callbacks.onCycle(newIdx);
});
panel.querySelector('#city-next')?.addEventListener('click', () => {
  const newIdx = (currentIndex + 1) % cities.length;
  panel.remove();
  callbacks.onCycle(newIdx);
});
```

- [ ] **Step 4: Update existing city-panel test signature**

In `tests/ui/city-panel.test.ts`, change the `createCityPanel(container, city, state, …)` call to `createCityPanel(container, [city], 0, state, { …, onCycle: () => {} })`.

- [ ] **Step 5: Run regressions**

```bash
yarn test tests/ui/city-panel-cycle.test.ts tests/ui/city-panel.test.ts
```

Both must pass.

---

## Task 5: Wire `openCityPanelAtIndex` and city-tap branch in main.ts (GREEN)

**Files:**
- Modify: `src/main.ts:396-432` (city action-bar branch)
- Modify: `src/main.ts:893+` (handleHexTap)

- [ ] **Step 1: Extract `openCityPanelAtIndex`**

Place this helper in `main.ts` near the existing `currentCityIndex` declaration (line 77):

```ts
function openCityPanelAtIndex(index: number): void {
  const playerCityIds = currentCiv().cities;
  if (playerCityIds.length === 0) {
    showNotification('No cities founded yet!', 'info');
    return;
  }
  const cities = playerCityIds.map(id => gameState.cities[id]).filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (cities.length === 0) return;
  currentCityIndex = ((index % cities.length) + cities.length) % cities.length;

  createCityPanel(uiLayer, cities, currentCityIndex, gameState, {
    onBuild: (cityId, itemId) => {
      const targetCity = gameState.cities[cityId];
      if (targetCity) {
        targetCity.productionQueue = [itemId];
        targetCity.productionProgress = 0;
        renderLoop.setGameState(gameState);
        showNotification(`${targetCity.name}: building ${itemId}`, 'info');
      }
    },
    onOpenWonderPanel: (selectedCityId) => {
      gameState = initializeLegendaryWonderProjectsForCity(gameState, gameState.currentPlayer, selectedCityId);
      createWonderPanel(uiLayer, gameState, selectedCityId, {
        onStartBuild: (buildCityId, wonderId) => {
          gameState = startLegendaryWonderBuild(gameState, gameState.currentPlayer, buildCityId, wonderId, bus);
          const targetCity = gameState.cities[buildCityId];
          if (targetCity) {
            renderLoop.setGameState(gameState);
            showNotification(`${targetCity.name}: preparing ${wonderId}`, 'info');
          }
        },
        onClose: () => {},
      });
    },
    onClose: () => {},
    onCycle: (newIdx) => openCityPanelAtIndex(newIdx),
  });
}
```

- [ ] **Step 2: Replace the existing city action-bar branch**

Find the `} else if (panel === 'city') { … }` block (around line 396-432) and replace its body with:

```ts
} else if (panel === 'city') {
  openCityPanelAtIndex(currentCityIndex);
}
```

(Note: previous behavior auto-advanced `currentCityIndex` on each press. With in-panel cycle, the action bar should reopen the *same* city the player last viewed; cycling happens inside the panel.)

- [ ] **Step 3: Add city-tap branch in `handleHexTap`**

In `src/main.ts:893` `handleHexTap`, after the unit-at-hex block (after the early `return` at the end of the enemy-unit-info `if (!selectedUnitId)` branch, around line 986) but **before** the movement-target check, add:

```ts
import { getCityTapAction } from '@/systems/city-tap-action';
// (Add this import at the top of the file with other @/systems imports.)

// City detection (only when no unit is selected for movement/attack)
if (!selectedUnitId) {
  const cityAction = getCityTapAction(gameState, gameState.currentPlayer, coord);
  if (cityAction?.kind === 'open-own') {
    const playerCityIds = currentCiv().cities;
    const idx = playerCityIds.indexOf(cityAction.cityId);
    if (idx >= 0) {
      currentCityIndex = idx;
      openCityPanelAtIndex(idx);
      return;
    }
  } else if (cityAction?.kind === 'show-foreign') {
    showForeignCityInfo(cityAction.cityId);
    return;
  }
}
```

- [ ] **Step 4: Implement `showForeignCityInfo`**

Add a helper analogous to the enemy-unit info block (around line 938-984). Place it near `handleHexTap`:

```ts
function showForeignCityInfo(cityId: string): void {
  const city = gameState.cities[cityId];
  if (!city) return;
  const isMinorCiv = city.owner.startsWith('mc-');
  const isBarbarian = city.owner === 'barbarian';

  let ownerName: string;
  let ownerColor: string;
  if (isBarbarian) {
    ownerName = 'Barbarian';
    ownerColor = '#8b4513';
  } else if (isMinorCiv) {
    const presentation = getMinorCivPresentationForPlayer(gameState, gameState.currentPlayer, city.owner, 'City-State');
    ownerName = presentation.name;
    ownerColor = presentation.color;
  } else {
    const civ = gameState.civilizations[city.owner];
    ownerName = civ?.name ?? city.owner;
    ownerColor = civ?.color ?? '#888';
  }

  const atWar = !isBarbarian && !isMinorCiv && (currentCiv()?.diplomacy?.atWarWith.includes(city.owner) ?? false);
  const relationshipTag = isBarbarian ? 'Hostile' : atWar ? 'At War' : 'Neutral';
  const relColor = isBarbarian || atWar ? '#d94a4a' : '#e8c170';

  const panel = document.getElementById('info-panel');
  if (!panel) return;
  panel.style.display = 'block';
  panel.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `background:rgba(40,20,20,0.92);border-radius:12px;padding:12px 16px;border-left:4px solid ${ownerColor};`;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

  const info = document.createElement('div');
  const ownerLine = document.createElement('div');
  ownerLine.style.cssText = `font-size:10px;color:${ownerColor};`;
  ownerLine.appendChild(document.createTextNode(ownerName + ' '));
  const relSpan = document.createElement('span');
  relSpan.style.cssText = `color:${relColor};font-size:9px;`;
  relSpan.textContent = `(${relationshipTag})`;
  ownerLine.appendChild(relSpan);

  const cityLine = document.createElement('div');
  const boldName = document.createElement('strong');
  boldName.textContent = city.name;
  cityLine.appendChild(boldName);
  cityLine.appendChild(document.createTextNode(` · Pop: ${city.population}`));

  info.appendChild(ownerLine);
  info.appendChild(cityLine);

  const closeBtn = document.createElement('span');
  closeBtn.id = 'btn-deselect';
  closeBtn.style.cssText = 'cursor:pointer;font-size:18px;opacity:0.6;';
  closeBtn.textContent = '✕';

  header.appendChild(info);
  header.appendChild(closeBtn);
  wrapper.appendChild(header);

  panel.appendChild(wrapper);
  closeBtn.addEventListener('click', () => { panel.style.display = 'none'; panel.innerHTML = ''; });
}
```

- [ ] **Step 5: Run full suite + build**

```bash
yarn test
yarn build
```

Both must pass.

- [ ] **Step 6: Manual smoke test**

```bash
yarn dev
```

1. Found 3 cities. Open the city panel from the action bar — verify `‹ Alpha ›` style header.
2. Click `›` repeatedly — cycles through all 3 cities, wraps to first.
3. Click `‹` — goes the other direction, wraps to last.
4. Tap your own city on the map — city panel opens for that city.
5. Tap an enemy or minor-civ city — read-only info panel appears, no build UI.
6. With one city only, prev/next buttons are hidden.

- [ ] **Step 7: Commit**

```bash
git add src/ui/city-panel.ts src/systems/city-tap-action.ts src/main.ts tests/ui/city-panel.test.ts tests/ui/city-panel-cycle.test.ts tests/systems/city-tap-action.test.ts
git commit -m "$(cat <<'EOF'
feat(city-ui): in-panel city cycle and tap-a-city-to-open (#82)

City panel now accepts a city list with current index and exposes
prev/next controls; cycling no longer requires close+reopen. Map
taps on any city route through getCityTapAction — own cities open
the panel, foreign cities show a read-only info card.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-check
- Does the cycle test verify wrap-around in *both* directions?
- Does the tap branch only fire when no unit is selected (so a selected unit can still attack a city tile via existing combat logic)?
- Does `showForeignCityInfo` use `textContent` for all dynamic text (XSS-safe per `ui-panels.md`)?
- Did you keep `currentCityIndex` in sync when a tap-open jumps to a city, so reopening from the action bar lands on the same city?
