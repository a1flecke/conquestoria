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

  it('lists every completed owned legendary wonder in an overflow city', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    const city = state.cities['city-river'];
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'player', cityId: city.id, turnCompleted: 1 },
      'grand-canal': { ownerId: 'player', cityId: city.id, turnCompleted: 2 },
      'sun-spire': { ownerId: 'player', cityId: city.id, turnCompleted: 3 },
      'world-archive': { ownerId: 'player', cityId: city.id, turnCompleted: 4 },
      'moonwell-gardens': { ownerId: 'player', cityId: city.id, turnCompleted: 5 },
      'ironroot-foundry': { ownerId: 'player', cityId: city.id, turnCompleted: 6 },
      'tidecaller-bastion': { ownerId: 'player', cityId: city.id, turnCompleted: 7 },
    };

    const panel = createTerritoryInspectionPanel(state, city.position, 'player');

    expect(panel.textContent).toContain('Oracle of Delphi');
    expect(panel.textContent).toContain('Grand Canal');
    expect(panel.textContent).toContain('Tidecaller Bastion');
  });

  it('mentions known-rival legendary landmarks only on the matching completed known coordinate', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    const rivalCoord = state.cities['city-rival'].position;
    state.civilizations.player.visibility.tiles[hexKey(rivalCoord)] = 'visible';
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:rival:city-rival:62',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          coord: rivalCoord,
          learnedTurn: 62,
          source: 'spy-location',
        },
        {
          kind: 'completed',
          eventId: 'completed:oracle-of-delphi:rival:70',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          completionTurn: 70,
          learnedTurn: 70,
        },
      ],
    };

    const matching = createTerritoryInspectionPanel(state, rivalCoord, 'player');
    const nearby = createTerritoryInspectionPanel(state, { q: rivalCoord.q + 1, r: rivalCoord.r }, 'player');

    expect(matching.textContent).toContain('Known rival legendary landmark');
    expect(matching.textContent).toContain('Oracle of Delphi');
    expect(matching.textContent).toContain('Rival Harbor');
    expect(nearby.textContent).not.toContain('Known rival legendary landmark');
  });

  it('mentions remembered known-rival legendary landmarks on fogged matching coordinates', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    const rivalCoord = state.cities['city-rival'].position;
    state.civilizations.player.visibility.tiles[hexKey(rivalCoord)] = 'fog';
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:rival:city-rival:62',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          coord: rivalCoord,
          learnedTurn: 62,
          source: 'spy-location',
        },
        {
          kind: 'completed',
          eventId: 'completed:oracle-of-delphi:rival:70',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          completionTurn: 70,
          learnedTurn: 70,
        },
      ],
    };

    const panel = createTerritoryInspectionPanel(state, rivalCoord, 'player');

    expect(panel.textContent).toContain('Known rival legendary landmark');
    expect(panel.textContent).toContain('Oracle of Delphi');
    expect(panel.textContent).toContain('Rival Harbor');
    expect(panel.textContent).toContain('Last seen information only');
  });

  it('does not mention known-rival landmarks from started, completed, or host-location intel alone', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    const rivalCoord = state.cities['city-rival'].position;
    state.civilizations.player.visibility.tiles[hexKey(rivalCoord)] = 'visible';
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'started',
          eventId: 'started:oracle-of-delphi:rival:city-rival:41',
          projectKey: 'oracle-of-delphi:rival:city-rival',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          revealedTurn: 41,
        },
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:rival:city-rival:62',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          coord: rivalCoord,
          learnedTurn: 62,
          source: 'spy-location',
        },
        {
          kind: 'completed',
          eventId: 'completed:grand-canal:rival:58',
          wonderId: 'grand-canal',
          civId: 'rival',
          civName: 'Rival',
          completionTurn: 58,
          learnedTurn: 58,
        },
      ],
    };

    const panel = createTerritoryInspectionPanel(state, rivalCoord, 'player');

    expect(panel.textContent).not.toContain('Known rival legendary landmark');
  });
});

describe('createTerritoryInspectionPanel — S2b acquisition status', () => {
  // Shares MockDocument / MockElement defined at module scope above.
  const originalDocument2 = globalThis.document;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: new MockDocument() as unknown as Document,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument2,
      configurable: true,
    });
  });

  function makeCoord(q: number, r: number) { return { q, r }; }

  function makeTile(overrides: Partial<import('@/core/types').HexTile>): import('@/core/types').HexTile {
    return {
      coord: { q: 1, r: 0 },
      terrain: 'hills',
      elevation: 'highland',
      resource: null,
      improvement: 'none',
      improvementTurnsLeft: 0,
      owner: 'p1',
      hasRiver: false,
      wonder: null,
      ...overrides,
    };
  }

  function buildState(params: {
    viewerId: string;
    techs: string[];
    tile: import('@/core/types').HexTile;
    cityPosition?: import('@/core/types').HexCoord;
  }): import('@/core/types').GameState {
    const cityId = 'city1';
    const cityPos = params.cityPosition ?? makeCoord(99, 99); // default: tile is NOT the city center
    const tileKey = `${params.tile.coord.q},${params.tile.coord.r}`;
    return {
      civilizations: {
        [params.viewerId]: {
          id: params.viewerId,
          cities: [cityId],
          techState: {
            completed: params.techs,
            currentResearch: null,
            researchQueue: [],
            researchProgress: 0,
            trackPriorities: {},
          },
          visibility: { tiles: { [tileKey]: 'visible' } },
        },
      },
      cities: {
        [cityId]: {
          id: cityId,
          owner: params.viewerId,
          position: cityPos,
          ownedTiles: [params.tile.coord, cityPos],
          workedTiles: [],
        },
      },
      map: {
        tiles: { [tileKey]: params.tile },
        width: 20,
        height: 20,
        wrapsHorizontally: false,
        rivers: [],
      },
      territoryFrontiers: {},
    } as unknown as import('@/core/types').GameState;
  }

  it('shows ✓ Available — city tile when tile is viewer city center with tech', () => {
    const cityPos = makeCoord(1, 0);
    const tile = makeTile({ coord: cityPos, resource: 'gems', improvement: 'none', owner: 'p1' });
    const state = buildState({ viewerId: 'p1', techs: ['mining-tech'], tile, cityPosition: cityPos });
    const panel = createTerritoryInspectionPanel(state, cityPos, 'p1');
    expect(panel.textContent).toContain('✓ Available');
    expect(panel.textContent).toContain('city tile');
  });

  it('shows ✓ Available — [ImprovementName] built when improvement is complete', () => {
    const tile = makeTile({ resource: 'gems', improvement: 'mine', improvementTurnsLeft: 0 });
    const state = buildState({ viewerId: 'p1', techs: ['mining-tech'], tile });
    const panel = createTerritoryInspectionPanel(state, tile.coord, 'p1');
    expect(panel.textContent).toContain('✓ Available');
    expect(panel.textContent).toContain('Mine');
  });

  it('shows ⏳ in progress when improvement is under construction', () => {
    const tile = makeTile({ resource: 'gems', improvement: 'mine', improvementTurnsLeft: 3 });
    const state = buildState({ viewerId: 'p1', techs: ['mining-tech'], tile });
    const panel = createTerritoryInspectionPanel(state, tile.coord, 'p1');
    expect(panel.textContent).toContain('⏳');
    expect(panel.textContent).toContain('Mine');
    expect(panel.textContent).toContain('3');
  });

  it('shows ✗ Needs [ImprovementName] to harvest when no improvement exists', () => {
    const tile = makeTile({ resource: 'gems', improvement: 'none', improvementTurnsLeft: 0 });
    const state = buildState({ viewerId: 'p1', techs: ['mining-tech'], tile });
    const panel = createTerritoryInspectionPanel(state, tile.coord, 'p1');
    expect(panel.textContent).toContain('✗ Needs');
    expect(panel.textContent).toContain('Mine');
    expect(panel.textContent).toContain('harvest');
  });

  it('shows ✗ Needs [ImprovementName] when wrong improvement is built', () => {
    // plantation instead of mine on a gems tile
    const tile = makeTile({ resource: 'gems', improvement: 'plantation', improvementTurnsLeft: 0 });
    const state = buildState({ viewerId: 'p1', techs: ['mining-tech'], tile });
    const panel = createTerritoryInspectionPanel(state, tile.coord, 'p1');
    expect(panel.textContent).toContain('✗ Needs');
    expect(panel.textContent).toContain('Mine');
  });

  it('omits acquisition status for tiles owned by another civ (foreign territory)', () => {
    const tile = makeTile({ resource: 'gems', improvement: 'none', owner: 'enemy' });
    const state = buildState({ viewerId: 'p1', techs: ['mining-tech'], tile });
    const panel = createTerritoryInspectionPanel(state, tile.coord, 'p1');
    const text = panel.textContent ?? '';
    // Resource name is visible (p1 has the tech)
    expect(text).toContain('Gems');
    // Acquisition status must be absent — would be misleading since p1 can't build there
    expect(text).not.toContain('✓ Available');
    expect(text).not.toContain('✗ Needs');
    expect(text).not.toContain('⏳');
  });
});
