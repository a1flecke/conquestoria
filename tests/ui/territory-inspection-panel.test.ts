import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { createTerritoryInspectionPanel } from '@/ui/territory-inspection-panel';
import { makeLegendaryWonderFixture } from '../systems/helpers/legendary-wonder-fixture';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

class MockElement {
  children: MockElement[] = [];
  style: Record<string, string> = { cssText: '' };
  dataset: Record<string, string> = {};
  id = '';
  type = '';
  private ownText = '';
  private listeners = new Map<string, Array<() => void>>();

  get textContent(): string {
    return `${this.ownText}${this.children.map(child => child.textContent).join('')}`;
  }

  set textContent(value: string) {
    this.ownText = value;
  }

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  addEventListener(event: string, handler: () => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), handler]);
  }

  click(): void {
    for (const handler of this.listeners.get('click') ?? []) {
      handler();
    }
  }
}

class MockDocument {
  createElement(): MockElement {
    return new MockElement();
  }
}

describe('createTerritoryInspectionPanel', () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: new MockDocument() as unknown as Document,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument,
      configurable: true,
    });
  });

  function makeInspectionState(): GameState {
    const state = createNewGame(undefined, 'territory-inspection-panel', 'small');
    state.cities = {};
    state.civilizations.player.cities = [];
    state.civilizations['ai-1'].cities = [];

    const holder = foundCity('player', { q: 5, r: 5 }, state.map, mkC());
    holder.id = 'holder-city';
    holder.name = 'Rome';
    const challenger = foundCity('ai-1', { q: 8, r: 5 }, state.map, mkC());
    challenger.id = 'challenger-city';
    challenger.name = 'Athens';
    state.cities[holder.id] = holder;
    state.cities[challenger.id] = challenger;
    state.civilizations.player.cities = [holder.id];
    state.civilizations['ai-1'].cities = [challenger.id];

    const coord = { q: 6, r: 5 };
    state.map.tiles[hexKey(coord)] = {
      ...state.map.tiles[hexKey(coord)],
      coord,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: 'player',
      improvement: 'farm',
      improvementTurnsLeft: 0,
      resource: 'wheat',
    };
    state.civilizations.player.visibility.tiles[hexKey(coord)] = 'visible';
    state.territoryFrontiers = {
      [hexKey(coord)]: {
        coord,
        holderCivId: 'player',
        challengerCivId: 'ai-1',
        holderCityId: holder.id,
        challengerCityId: challenger.id,
        progress: 8,
        trend: 'likely-to-flip',
        reason: 'ai-1 cultural pressure is challenging player.',
      },
    };
    return state;
  }

  it('renders visible frontier holder, challenger, progress, trend, and reason', () => {
    const state = makeInspectionState();
    const panel = createTerritoryInspectionPanel(state, { q: 6, r: 5 }, 'player');

    expect(panel.dataset.territoryInspection).toBe('visible');
    expect(panel.textContent).toContain('Terrain: Grassland');
    expect(panel.textContent).toContain('Owner: Player');
    expect(panel.textContent).toContain('Held by: Rome');
    expect(panel.textContent).toContain('Challenger: Athens');
    expect(panel.textContent).toContain('Progress: 8/10');
    expect(panel.textContent).toContain('Border likely to shift');
    expect(panel.textContent).toContain('cultural pressure');
  });

  it('redacts frontier details for fog-known tiles', () => {
    const state = makeInspectionState();
    state.civilizations.player.visibility.tiles['6,5'] = 'fog';

    const panel = createTerritoryInspectionPanel(state, { q: 6, r: 5 }, 'player');

    expect(panel.dataset.territoryInspection).toBe('fog');
    expect(panel.textContent).toContain('Terrain: Grassland');
    expect(panel.textContent).toContain('Last seen');
    expect(panel.textContent).not.toContain('Challenger: Athens');
    expect(panel.textContent).not.toContain('Progress: 8/10');
  });

  it('shows resource name and type when viewer has the enabling tech', () => {
    const state = makeInspectionState();
    // Replace resource with a valid ResourceType
    state.map.tiles['6,5'] = { ...state.map.tiles['6,5'], resource: 'gems' };
    // Grant the enabling tech (gems → mining-tech)
    state.civilizations.player.techState.completed = ['mining-tech'];

    const panel = createTerritoryInspectionPanel(state, { q: 6, r: 5 }, 'player');

    expect(panel.textContent).toContain('Gems (luxury)');
  });

  it('hides resource row when viewer lacks the enabling tech', () => {
    const state = makeInspectionState();
    state.map.tiles['6,5'] = { ...state.map.tiles['6,5'], resource: 'gems' };
    // techState.completed defaults to [] from createNewGame — no tech granted

    const panel = createTerritoryInspectionPanel(state, { q: 6, r: 5 }, 'player');

    expect(panel.textContent).not.toContain('Gems');
    expect(panel.textContent).not.toContain('luxury');
  });

  it('wires the close action when provided', () => {
    const state = makeInspectionState();
    const onClose = vi.fn();

    const panel = createTerritoryInspectionPanel(state, { q: 6, r: 5 }, 'player', onClose);
    const close = (panel as unknown as MockElement).children
      .flatMap(child => child.children)
      .find(child => child.dataset.action === 'close-territory-inspection');

    close?.click();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mentions completed legendary wonders for safely visible owned host cities', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'player', cityId: 'city-river', turnCompleted: 20 },
    };
    state.civilizations.player.visibility.tiles[hexKey(state.cities['city-river'].position)] = 'visible';
    const panel = createTerritoryInspectionPanel(state, state.cities['city-river'].position, 'player', () => {});

    expect(panel.textContent).toContain('Completed legendary wonders');
    expect(panel.textContent).toContain('Oracle of Delphi');
  });
});
