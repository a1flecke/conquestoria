import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderSelectedUnitInfo } from '@/ui/selected-unit-info';
import { createEspionageCivState, createSpyFromUnit, setDisguise } from '@/systems/espionage-system';
import type { GameState, HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { createNewGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-system';

class MockElement {
  tagName: string;
  children: MockElement[] = [];
  style = { cssText: '', display: '', opacity: '', cursor: '' };
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  textContent = '';
  type = '';
  disabled = false;
  title = '';
  listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  get childElementCount(): number {
    return this.children.length;
  }

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  addEventListener(event: string, listener: (...args: unknown[]) => void): void {
    this.listeners[event] ??= [];
    this.listeners[event].push(listener);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  replaceChildren(...newChildren: MockElement[]): void {
    this.children = newChildren;
  }

  createTextNode(text: string): MockElement {
    const node = new MockElement('#text');
    node.textContent = text;
    return node;
  }

  click(): void {
    for (const fn of this.listeners.click ?? []) fn();
  }
}

class MockDocument {
  createElement(tag: string): MockElement {
    return new MockElement(tag);
  }
  createTextNode(text: string): MockElement {
    const node = new MockElement('#text');
    node.textContent = text;
    return node;
  }
}

function installMockDocument(): void {
  (globalThis as any).document = new MockDocument();
}

function restoreMockDocument(): void {
  (globalThis as any).document = undefined;
}

function collectAllText(node: unknown): string[] {
  const el = node as { textContent?: string; children?: unknown[] };
  const texts: string[] = [];
  if (el.textContent) texts.push(el.textContent);
  for (const child of el.children ?? []) texts.push(...collectAllText(child));
  return texts;
}

function findButtons(node: unknown): MockElement[] {
  const el = node as { tagName?: string; children?: unknown[] };
  const result: MockElement[] = [];
  if (el.tagName === 'BUTTON') result.push(el as MockElement);
  for (const child of el.children ?? []) result.push(...findButtons(child));
  return result;
}

function findWaterRecoveryGuidance(node: unknown): MockElement | undefined {
  const el = node as MockElement;
  if (el.dataset?.waterRecoveryKind) return el;
  for (const child of el.children ?? []) {
    const found = findWaterRecoveryGuidance(child);
    if (found) return found;
  }
  return undefined;
}

describe('land-unit water recovery guidance', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('renders recoverable guidance supplied by the live selection presentation', () => {
    const state = createNewGame(undefined, 'water-panel-recoverable', 'small');
    const unit = {
      ...createUnit('warrior', 'player', { q: 1, r: 1 }, {
        nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1,
      }),
      id: 'warrior',
    };
    state.currentPlayer = 'player';
    state.units = { warrior: unit };
    state.civilizations.player.units = ['warrior'];
    const container = new MockElement('div');

    renderSelectedUnitInfo(
      container as unknown as HTMLElement,
      state,
      'warrior',
      {},
      {
        waterRecovery: {
          kind: 'recoverable',
          destinations: [{ q: 2, r: 1 }],
        },
      },
    );

    expect(collectAllText(container).join(' ')).toContain(
      'This land unit is on water. Move to an amber land tile to return ashore.',
    );
    const guidance = findWaterRecoveryGuidance(container);
    expect(guidance?.dataset.waterRecoveryKind).toBe('recoverable');
    expect(guidance?.getAttribute('role')).toBe('status');
    expect(guidance?.getAttribute('aria-live')).toBe('polite');
    expect(guidance?.style.cssText).toContain('font-size:12px');
    expect(guidance?.style.cssText).toContain('border:1px solid');
  });

  it('renders blocked guidance and omits guidance for none', () => {
    const state = createNewGame(undefined, 'water-panel-blocked', 'small');
    const unit = {
      ...createUnit('warrior', 'player', { q: 1, r: 1 }, {
        nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1,
      }),
      id: 'warrior',
    };
    state.currentPlayer = 'player';
    state.units = { warrior: unit };
    state.civilizations.player.units = ['warrior'];
    const blocked = new MockElement('div');
    const normal = new MockElement('div');

    renderSelectedUnitInfo(
      blocked as unknown as HTMLElement,
      state,
      'warrior',
      {},
      { waterRecovery: { kind: 'blocked', destinations: [] } },
    );
    renderSelectedUnitInfo(
      normal as unknown as HTMLElement,
      state,
      'warrior',
      {},
      { waterRecovery: { kind: 'none', destinations: [] } },
    );

    expect(collectAllText(blocked).join(' ')).toContain(
      'This land unit is stranded on water. No land escape is currently reachable this turn.',
    );
    expect(collectAllText(normal).join(' ')).not.toContain('return ashore');
    expect(collectAllText(normal).join(' ')).not.toContain('stranded on water');
  });
});


function makeSpyState(
  techs: string[],
  spyStatus: string = 'idle',
  spyType: 'spy_scout' | 'spy_informant' | 'spy_agent' | 'spy_operative' | 'spy_hacker' = 'spy_scout',
): GameState {
  let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
  const { state: esp } = createSpyFromUnit(civEsp, 'unit-1', 'player', spyType, 'seed');
  civEsp = { ...esp, spies: { ...esp.spies, 'unit-1': { ...esp.spies['unit-1'], status: spyStatus as any } } };
  return {
    turn: 1, era: 1, currentPlayer: 'player', gameOver: false, winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {
      'unit-1': {
        id: 'unit-1', type: spyType, owner: 'player',
        position: { q: 0, r: 0 }, health: 100, maxHealth: 100,
        movementPointsLeft: 2, movement: 2, hasActed: false, status: 'idle',
      } as any,
    },
    cities: {},
    civilizations: {
      player: { color: '#fff', techState: { completed: techs } },
    },
    espionage: { player: civEsp },
  } as unknown as GameState;
}

function makeWorkerState(tileOverrides: Record<string, unknown>, unitOverrides: Record<string, unknown> = {}): GameState {
  return {
    turn: 1,
    era: 1,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: {
      width: 10,
      height: 10,
      tiles: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'forest',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: 'player',
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
          ...tileOverrides,
        },
      },
      wrapsHorizontally: false,
      rivers: [],
    },
    units: {
      'worker-1': {
        id: 'worker-1',
        type: 'worker',
        owner: 'player',
        position: { q: 0, r: 0 },
        movementPointsLeft: 2,
        health: 100,
        experience: 0,
        hasMoved: false,
        hasActed: false,
        isResting: false,
        chargesRemaining: 2,
        ...unitOverrides,
      },
    },
    cities: {},
    civilizations: {
      player: { color: '#fff', techState: { completed: [] } },
    },
  } as unknown as GameState;
}

describe('renderSelectedUnitInfo — hunt crisis foe label (MR3)', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('shows the named foe when the selected unit is a hunt crisis\'s spawned beast', () => {
    const state = createNewGame(undefined, 'hunt-foe-label-beast', 'small');
    const beast = {
      ...createUnit('beast_boar', 'beasts', { q: 3, r: 0 }, {
        nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1,
      }),
      id: 'beast-1',
    };
    state.units = { 'beast-1': beast };
    state.activeCrises = {
      'crisis-1': {
        id: 'crisis-1', flavorId: 'beast-awakening', archetype: 'hunt', targetCivId: 'player',
        cityIds: [], tileKeys: [], startedTurn: 1, stage: 'menacing', turnsInStage: 1,
        huntEntityId: 'beast-1', foeName: 'Giant Boar',
      },
    };
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'beast-1', {});

    const text = collectAllText(container).join(' ');
    expect(text).toContain('Giant Boar');
    expect(text).toContain('Any civilization may claim the hunt');
  });

  it('shows no hunt foe label for a beast unrelated to any active hunt', () => {
    const state = createNewGame(undefined, 'hunt-foe-label-none', 'small');
    const beast = {
      ...createUnit('beast_boar', 'beasts', { q: 3, r: 0 }, {
        nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1,
      }),
      id: 'beast-1',
    };
    state.units = { 'beast-1': beast };
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'beast-1', {});

    expect(collectAllText(container).join(' ')).not.toContain('claim the hunt');
  });

  it('shows the named foe when the selected unit is a hunt crisis\'s spawned pirate ship', () => {
    const state = createNewGame(undefined, 'hunt-foe-label-pirate', 'small');
    const ship = {
      ...createUnit('galley', 'pirate', { q: 3, r: 0 }, {
        nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1,
      }),
      id: 'ship-1',
    };
    state.units = { 'ship-1': ship };
    state.pirateFleets = {
      'fleet-1': { id: 'fleet-1', unitId: 'ship-1', targetCivId: 'player', targetCityId: 'c1', landmassId: 'l1', era: 1, plunderCooldown: 0 },
    };
    state.activeCrises = {
      'crisis-1': {
        id: 'crisis-1', flavorId: 'corsair-armada', archetype: 'hunt', targetCivId: 'player',
        cityIds: [], tileKeys: [], startedTurn: 1, stage: 'menacing', turnsInStage: 1,
        huntEntityId: 'fleet-1', foeName: 'The Reaver',
      },
    };
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'ship-1', {});

    expect(collectAllText(container).join(' ')).toContain('The Reaver');
  });
});

describe('renderSelectedUnitInfo — spy disguise buttons', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('spy_scout (tier 0) does not render any disguise options', () => {
    const state = makeSpyState([], 'idle', 'spy_scout');
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onSetDisguise: () => {},
    });
    const btns = findButtons(container).map(b => b.textContent);
    expect(btns.some(t => t.includes('As Scout'))).toBe(false);
    expect(btns.some(t => t.includes('As Archer'))).toBe(false);
    expect(btns.some(t => t.includes('As Barbarian'))).toBe(false);
  });

  it('spy_agent (tier 2) renders "As Scout" and "As Archer" buttons', () => {
    const state = makeSpyState([], 'idle', 'spy_agent');
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onSetDisguise: () => {},
    });
    const btns = findButtons(container).map(b => b.textContent);
    expect(btns.some(t => t.includes('As Scout'))).toBe(true);
    expect(btns.some(t => t.includes('As Archer'))).toBe(true);
    // tier 2 does NOT yet have As Worker
    expect(btns.some(t => t.includes('As Worker'))).toBe(false);
  });

  it('does not render disguise section when spy is not idle', () => {
    const state = makeSpyState([], 'on_mission', 'spy_agent');
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onSetDisguise: () => {},
    });
    const btns = findButtons(container).map(b => b.textContent);
    expect(btns.some(t => t.includes('As Barbarian'))).toBe(false);
  });

  it('marks the active disguise with a checkmark', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    const { state: esp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_informant', 'seed');
    civEsp = setDisguise(esp, 'unit-1', 'barbarian');
    const gameState = makeSpyState([], 'idle', 'spy_informant');
    (gameState.espionage as any).player = civEsp;

    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, gameState, 'unit-1', {
      onSetDisguise: () => {},
    });
    const buttons = findButtons(container);
    const barbarianBtn = buttons.find(b => b.textContent?.includes('Barbarian'));
    expect(barbarianBtn?.textContent).toMatch(/✓/);
  });

  it('fires onSetDisguise with the correct value when a button is clicked', () => {
    const state = makeSpyState([], 'idle', 'spy_agent');
    const container = new MockElement('div');
    let called: [string, unknown] | null = null;
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onSetDisguise: (uid, disguise) => { called = [uid, disguise]; },
    });
    const buttons = findButtons(container);
    const archerBtn = buttons.find(b => b.textContent?.includes('Archer'));
    archerBtn?.click();
    expect(called).toEqual(['unit-1', 'archer']);
  });

  it('renders Skip Turn for a unit with movement remaining and calls onSkipTurn with the unit id', () => {
    const state = makeSpyState([]);
    const container = new MockElement('div');
    let skippedUnitId: string | null = null;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onSkipTurn: unitId => { skippedUnitId = unitId; },
    });

    const skipButton = findButtons(container).find(button => button.textContent === 'Skip Turn');
    expect(skipButton).toBeDefined();

    skipButton?.click();

    expect(skippedUnitId).toBe('unit-1');
  });

  it('hides Skip Turn once the unit has already acted', () => {
    const state = makeSpyState([]);
    state.units['unit-1'] = { ...state.units['unit-1'], hasActed: true, movementPointsLeft: 0 } as any;
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onSkipTurn: () => {},
    });

    const buttons = findButtons(container).map(button => button.textContent);
    expect(buttons).not.toContain('Skip Turn');
  });

  it('renders Delete Unit and calls onDeleteUnit with the unit id without deleting immediately', () => {
    const state = makeSpyState([]);
    const container = new MockElement('div');
    let deleteUnitId: string | null = null;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onDeleteUnit: unitId => { deleteUnitId = unitId; },
    });

    const deleteButton = findButtons(container).find(button => button.textContent === 'Delete Unit');
    expect(deleteButton).toBeDefined();

    deleteButton?.click();

    expect(deleteUnitId).toBe('unit-1');
    expect(state.units['unit-1']).toBeDefined();
  });
});

describe('renderSelectedUnitInfo - unit stack switch', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('renders a switch action when another friendly unit shares the selected unit tile', () => {
    const state = makeSpyState([]);
    state.units['unit-1'] = {
      ...state.units['unit-1'],
      type: 'warrior',
      position: { q: 4, r: 2 },
    } as any;
    state.units['unit-2'] = {
      ...state.units['unit-1'],
      id: 'unit-2',
      type: 'worker',
      owner: 'player',
      position: { q: 4, r: 2 },
    } as any;

    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onOpenStack: () => {},
    });

    expect(collectAllText(container).join(' ')).toContain('Stack: 2 units here');
    expect(findButtons(container).some(button => button.textContent === 'Switch unit')).toBe(true);
  });

  it('does not render switch action for a single selected unit', () => {
    const state = makeSpyState([]);
    state.units['unit-1'] = {
      ...state.units['unit-1'],
      type: 'warrior',
      position: { q: 4, r: 2 },
    } as any;

    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onOpenStack: () => {},
    });

    expect(collectAllText(container).join(' ')).not.toContain('Stack:');
  });

  it('fires onOpenStack with the selected unit coordinate', () => {
    const state = makeSpyState([]);
    state.units['unit-1'] = {
      ...state.units['unit-1'],
      type: 'warrior',
      position: { q: 4, r: 2 },
    } as any;
    state.units['unit-2'] = {
      ...state.units['unit-1'],
      id: 'unit-2',
      type: 'worker',
      owner: 'player',
      position: { q: 4, r: 2 },
    } as any;
    let opened: { q: number; r: number } | null = null;

    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onOpenStack: coord => { opened = coord; },
    });

    findButtons(container).find(button => button.textContent === 'Switch unit')?.click();

    expect(opened).toEqual({ q: 4, r: 2 });
  });
});

describe('renderSelectedUnitInfo - worker actions', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('shows worker charges and valid forest actions', () => {
    const state = makeWorkerState({ terrain: 'forest' });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const text = collectAllText(container).join(' ');
    const buttons = findButtons(container).map(button => button.textContent);
    expect(text).toContain('Worker Charges: 2/2');
    expect(buttons).toContain('Build Farm (+2 Food)');
    expect(buttons).toContain('Build Lumber Camp (+2 Prod)');
    expect(buttons).not.toContain('Build Watermill (+1 Food, +1 Prod)');
    expect(buttons).not.toContain('Drain Swamp (20% worker risk)');
  });

  it('shows watermill only on valid river land', () => {
    const state = makeWorkerState({ terrain: 'plains', resource: 'iron', hasRiver: true });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const buttons = findButtons(container).map(button => button.textContent);
    expect(buttons).toContain('Build Farm (+2 Food)');
    expect(buttons).toContain('Build Mine (+2 Prod, +1 Gold)');
    expect(buttons).toContain('Build Watermill (+1 Food, +1 Prod)');
  });

  it('shows Drain Swamp only on unimproved swamp', () => {
    const state = makeWorkerState({ terrain: 'swamp' });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const buttons = findButtons(container).map(button => button.textContent);
    expect(buttons.some(l => l.includes('Drain Swamp') && l.includes('Grassland'))).toBe(true);
    expect(buttons).not.toContain('Build Farm (+2 Food)');
  });

  it('communicates swamp danger before the player clicks', () => {
    const state = makeWorkerState({ terrain: 'swamp' });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const text = collectAllText(container).join(' ');
    expect(text).toContain('Drain Swamp');
    expect(text).toContain('Grassland');
  });

  it('shows no worker actions on unowned or enemy-owned terrain', () => {
    for (const [terrain, owner] of [['forest', null], ['forest', 'enemy'], ['swamp', null], ['swamp', 'enemy']] as const) {
      const state = makeWorkerState({ terrain, owner });
      const container = new MockElement('div');

      renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
        onWorkerAction: () => {},
      });

      const buttons = findButtons(container).map(button => button.textContent);
      expect(collectAllText(container).join(' ')).toContain('Worker Charges: 2/2');
      expect(buttons).not.toContain('Build Farm (+2 Food)');
      expect(buttons).not.toContain('Build Lumber Camp (+2 Prod)');
      expect(buttons.every(l => !l.includes('→ Grassland'))).toBe(true);
    }
  });

  it('explains outside-territory worker blockers on the current tile', () => {
    const state = makeWorkerState({ terrain: 'forest', owner: 'enemy' });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const text = collectAllText(container).join(' ');
    const buttons = findButtons(container).map(button => button.textContent);
    expect(text).toContain('Outside your territory');
    expect(buttons).not.toContain('Build Farm (+2 Food)');
  });

  it('updates worker current-tile reason after territory ownership changes', () => {
    const state = makeWorkerState({ terrain: 'plains', owner: 'player', improvement: 'none' });
    const first = new MockElement('div');
    renderSelectedUnitInfo(first as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    expect(collectAllText(first).join(' ')).not.toContain('Outside your territory');
    expect(findButtons(first).map(button => button.textContent)).toContain('Build Farm (+2 Food)');

    const changed: GameState = {
      ...state,
      map: {
        ...state.map,
        tiles: {
          ...state.map.tiles,
          '0,0': { ...state.map.tiles['0,0'], owner: 'ai-1' },
        },
      },
    };
    const second = new MockElement('div');
    renderSelectedUnitInfo(second as unknown as HTMLElement, changed, 'worker-1', {
      onWorkerAction: () => {},
    });

    expect(collectAllText(second).join(' ')).toContain('Outside your territory');
    expect(findButtons(second).map(button => button.textContent)).not.toContain('Build Farm (+2 Food)');
  });

  it('explains local worker blockers on owned current tiles', () => {
    const state = makeWorkerState({ terrain: 'plains', owner: 'player', improvement: 'mine' });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const text = collectAllText(container).join(' ');
    expect(text).toContain('Already improved');
  });

  it('hides worker actions after the worker has already acted', () => {
    const state = makeWorkerState({ terrain: 'forest' }, { hasActed: true });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const buttons = findButtons(container).map(button => button.textContent);
    expect(buttons).not.toContain('Build Farm (+2 Food)');
    expect(buttons).not.toContain('Build Lumber Camp (+2 Prod)');
  });

  it('hides worker actions when the worker has no charges left', () => {
    const state = makeWorkerState({ terrain: 'forest' }, { chargesRemaining: 0 });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const text = collectAllText(container).join(' ');
    const buttons = findButtons(container).map(button => button.textContent);
    expect(text).toContain('Worker Charges: 0/2');
    expect(buttons).not.toContain('Build Farm (+2 Food)');
    expect(buttons).not.toContain('Build Lumber Camp (+2 Prod)');
  });

  it('hides worker actions on already improved tiles', () => {
    const state = makeWorkerState({ terrain: 'swamp', improvement: 'farm' });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const buttons = findButtons(container).map(button => button.textContent);
    expect(buttons).not.toContain('Drain Swamp (20% worker risk)');
    expect(buttons).not.toContain('Build Farm (+2 Food)');
  });

  it('hides worker action buttons on city-center tiles', () => {
    const state = makeWorkerState({ terrain: 'forest' });
    state.cities = {
      'city-1': {
        id: 'city-1',
        name: 'Capital',
        owner: 'player',
        position: { q: 0, r: 0 },
      } as any,
    };
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const text = collectAllText(container).join(' ');
    const buttons = findButtons(container).map(button => button.textContent);
    expect(text).toContain('Worker Charges: 2/2');
    expect(buttons).not.toContain('Build Farm (+2 Food)');
    expect(buttons).not.toContain('Build Lumber Camp (+2 Prod)');
  });

  it('keeps worker action buttons on adjacent owned non-city tiles', () => {
    const state = makeWorkerState({ terrain: 'forest' });
    state.cities = {
      'city-1': {
        id: 'city-1',
        name: 'Capital',
        owner: 'player',
        position: { q: 0, r: 1 },
      } as any,
    };
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const buttons = findButtons(container).map(button => button.textContent);
    expect(buttons).toContain('Build Farm (+2 Food)');
    expect(buttons).toContain('Build Lumber Camp (+2 Prod)');
  });

  it('fires onWorkerAction with the clicked action id', () => {
    const state = makeWorkerState({ terrain: 'forest' });
    const container = new MockElement('div');
    let clicked: unknown = null;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: action => { clicked = action; },
    });

    findButtons(container).find(button => button.textContent === 'Build Lumber Camp (+2 Prod)')?.click();

    expect(clicked).toBe('lumber_camp');
  });

  // --- MR-B #262: drain_swamp label and plantation gating ---

  it('drain_swamp button label describes result (→ Grassland)', () => {
    const state = makeWorkerState({ terrain: 'swamp' });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: vi.fn(),
    });
    const buttons = findButtons(container).map(b => b.textContent ?? '');
    expect(buttons.some(l => l.includes('→ Grassland'))).toBe(true);
  });

  it('drain_swamp button does not show raw action key as label', () => {
    const state = makeWorkerState({ terrain: 'swamp' });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: vi.fn(),
    });
    const buttons = findButtons(container).map(b => b.textContent ?? '');
    expect(buttons).not.toContain('drain_swamp');
  });

  it('grassland tile with known silk shows plantation button', () => {
    const state = makeWorkerState({ terrain: 'grassland', resource: 'silk' });
    (state.civilizations.player.techState.completed as string[]) = ['irrigation'];
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: vi.fn(),
    });
    const buttons = findButtons(container).map(b => b.textContent ?? '');
    expect(buttons.some(l => l.toLowerCase().includes('plantation'))).toBe(true);
  });

  it('grassland tile with hidden silk does not show plantation button', () => {
    const state = makeWorkerState({ terrain: 'grassland', resource: 'silk' });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: vi.fn(),
    });
    const buttons = findButtons(container).map(b => b.textContent ?? '');
    expect(buttons.every(l => !l.toLowerCase().includes('plantation'))).toBe(true);
  });

  it('grassland tile without resource does not show plantation button', () => {
    const state = makeWorkerState({ terrain: 'grassland', resource: null });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: vi.fn(),
    });
    const buttons = findButtons(container).map(b => b.textContent ?? '');
    expect(buttons.every(l => !l.toLowerCase().includes('plantation'))).toBe(true);
  });

  it('hills tile with iron shows mine button', () => {
    const state = makeWorkerState({ terrain: 'hills', resource: 'iron' });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: vi.fn(),
    });
    const buttons = findButtons(container).map(b => b.textContent ?? '');
    expect(buttons.some(l => l.toLowerCase().includes('mine'))).toBe(true);
  });

  it('shows resource info div when knownResource is present (tech researched)', () => {
    const state = makeWorkerState({ terrain: 'grassland', resource: 'silk' });
    (state.civilizations.player.techState.completed as string[]) = ['irrigation'];
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: vi.fn(),
    });
    const text = collectAllText(container).join(' ');
    expect(text).toContain('Silk');
    expect(text).toContain('luxury');
    expect(text).toContain('Plantation');
  });

  it('does not show resource info div when tech is not yet researched', () => {
    const state = makeWorkerState({ terrain: 'grassland', resource: 'silk' });
    // No tech completed — silk is hidden
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: vi.fn(),
    });
    const text = collectAllText(container).join(' ');
    expect(text).not.toContain('Silk');
    expect(text).not.toContain('luxury');
  });

  it('plantation button label includes resource name when silk is known', () => {
    const state = makeWorkerState({ terrain: 'grassland', resource: 'silk' });
    (state.civilizations.player.techState.completed as string[]) = ['irrigation'];
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: vi.fn(),
    });
    const buttons = findButtons(container).map(b => b.textContent ?? '');
    const plantationBtn = buttons.find(l => l.includes('Plantation'));
    expect(plantationBtn).toBeDefined();
    expect(plantationBtn).toContain('Silk');
    expect(plantationBtn).toContain('→');
  });

  it('replacement button labels include yield information for the new improvement', () => {
    // grassland tile with farm already built; worker on it with onReplaceImprovement
    const state = makeWorkerState({ terrain: 'grassland', improvement: 'farm', hasRiver: true });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: vi.fn(),
      onReplaceImprovement: vi.fn(),
    });

    const buttons = findButtons(container).map(b => b.textContent ?? '');
    // Watermill is valid on grassland+river; its yield is (+1 Food, +1 Prod)
    const watermillReplace = buttons.find(l => l.includes('Replace') && l.includes('Watermill'));
    expect(watermillReplace).toBeDefined();
    expect(watermillReplace).toContain('+1 Food');
    expect(watermillReplace).toContain('+1 Prod');
  });

  it('does not show a Replace-with-same-type button', () => {
    // grassland tile with farm already built; farm must NOT appear as a replace-with option
    const state = makeWorkerState({ terrain: 'grassland', improvement: 'farm', hasRiver: false });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: vi.fn(),
      onReplaceImprovement: vi.fn(),
    });

    const buttons = findButtons(container).map(b => b.textContent ?? '');
    expect(buttons.every(l => !l.includes('Farm with Farm'))).toBe(true);
  });
});

describe('renderSelectedUnitInfo - veterancy', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('renders unit XP, veterancy tier, next tier progress, and combat bonus', () => {
    const state = makeWorkerState({}, {
      type: 'warrior',
      experience: 25,
      health: 88,
    });
    state.units['worker-1'].type = 'warrior';
    state.units['worker-1'].experience = 25;
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {});

    const text = collectAllText(container).join(' ');
    expect(text).toContain('XP: 25');
    expect(text).toContain('Veteran');
    expect(text).toContain('+10% combat');
    expect(text).toContain('25 XP to Elite');
  });
});

describe('renderSelectedUnitInfo - found city button', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  function makeSettlerState(cityOverrides: Record<string, unknown> = {}): GameState {
    return {
      turn: 1, era: 1, currentPlayer: 'player', gameOver: false, winner: null,
      map: {
        width: 20, height: 20, wrapsHorizontally: false, rivers: [],
        tiles: {
          '5,5': { coord: { q: 5, r: 5 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        },
      },
      units: {
        'settler-1': { id: 'settler-1', type: 'settler', owner: 'player', position: { q: 5, r: 5 }, movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false },
      },
      cities: { ...cityOverrides },
      civilizations: { player: { color: '#fff', techState: { completed: [] } } },
      espionage: undefined,
    } as unknown as GameState;
  }

  it('enables Found City button and fires callback when location is valid', () => {
    const state = makeSettlerState();
    const container = new MockElement('div');
    let called = false;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'settler-1', {
      onFoundCity: () => { called = true; },
    });

    const btn = findButtons(container).find(b => b.textContent === 'Found City');
    expect(btn).toBeDefined();
    btn!.click();
    expect(called).toBe(true);
  });

  it('renders Found City as disabled and does not fire callback when too close to another city', () => {
    // City at (5,6) is distance 1 from settler at (5,5) — less than MIN_CITY_CENTER_DISTANCE (4)
    const state = makeSettlerState({
      'city-1': { id: 'city-1', name: 'Rome', owner: 'player', position: { q: 5, r: 6 } },
    });
    const container = new MockElement('div');
    let called = false;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'settler-1', {
      onFoundCity: () => { called = true; },
    });

    const btn = findButtons(container).find(b => b.textContent === 'Found City');
    expect(btn).toBeDefined(); // button still renders — visible but unavailable
    btn!.click();
    expect(called).toBe(false); // no click handler on disabled button
  });

  it('renders Found City as disabled and does not fire callback on invalid terrain (no tile)', () => {
    // No tile at settler position → invalid terrain
    const state = makeSettlerState();
    state.map.tiles = {}; // remove all tiles
    const container = new MockElement('div');
    let called = false;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'settler-1', {
      onFoundCity: () => { called = true; },
    });

    const btn = findButtons(container).find(b => b.textContent === 'Found City');
    expect(btn).toBeDefined();
    btn!.click();
    expect(called).toBe(false);
  });

  it('renders Found City as disabled when settler has no movement points remaining', () => {
    const state = makeSettlerState();
    state.units['settler-1'] = { ...state.units['settler-1'], movementPointsLeft: 0 };
    const container = new MockElement('div');
    let called = false;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'settler-1', {
      onFoundCity: () => { called = true; },
    });

    const btn = findButtons(container).find(b => b.textContent === 'Found City');
    expect(btn).toBeDefined();
    expect(btn!.disabled).toBe(true);
    btn!.click();
    expect(called).toBe(false);
  });

  it('renders Found City as enabled when settler has movement points on a valid tile', () => {
    const state = makeSettlerState(); // movementPointsLeft: 2 by default
    const container = new MockElement('div');
    let called = false;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'settler-1', {
      onFoundCity: () => { called = true; },
    });

    const btn = findButtons(container).find(b => b.textContent === 'Found City');
    expect(btn).toBeDefined();
    expect(btn!.disabled).toBeFalsy();
    btn!.click();
    expect(called).toBe(true);
  });
});

describe('renderSelectedUnitInfo - journey automation', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  function makeScoutState(unitOverrides: Record<string, unknown> = {}): GameState {
    return {
      turn: 1, era: 1, currentPlayer: 'player', gameOver: false, winner: null,
      map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
      units: {
        'scout-1': { id: 'scout-1', type: 'scout', owner: 'player', position: { q: 0, r: 0 }, health: 100, experience: 0, movementPointsLeft: 3, hasMoved: false, hasActed: false, isResting: false, ...unitOverrides },
      },
      cities: {},
      civilizations: { player: { color: '#fff', techState: { completed: [] } } },
    } as unknown as GameState;
  }

  it('shows journey destination text when unit has journey automation', () => {
    const state = makeScoutState({ automation: { mode: 'journey', destination: { q: 5, r: 3 } } });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'scout-1', {});
    const texts = collectAllText(container);
    expect(texts.some(t => t.includes('5') && t.includes('3'))).toBe(true);
    expect(texts.some(t => t.toLowerCase().includes('journey'))).toBe(true);
  });

  it('does not show journey status for a unit without automation', () => {
    const state = makeScoutState();
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'scout-1', {});
    const texts = collectAllText(container);
    expect(texts.some(t => t.toLowerCase().includes('journey'))).toBe(false);
  });

  it('renders Cancel journey button when onCancelJourney is provided', () => {
    const state = makeScoutState({ automation: { mode: 'journey', destination: { q: 5, r: 3 } } });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'scout-1', {
      onCancelJourney: () => {},
    });
    const btns = findButtons(container).map(b => b.textContent);
    expect(btns.some(t => t?.toLowerCase().includes('cancel') && t?.toLowerCase().includes('journey'))).toBe(true);
  });

  it('fires onCancelJourney when cancel button is clicked', () => {
    const state = makeScoutState({ automation: { mode: 'journey', destination: { q: 5, r: 3 } } });
    const container = new MockElement('div');
    let cancelled = false;
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'scout-1', {
      onCancelJourney: () => { cancelled = true; },
    });
    findButtons(container).find(b => b.textContent?.toLowerCase().includes('cancel') && b.textContent?.toLowerCase().includes('journey'))?.click();
    expect(cancelled).toBe(true);
  });
});

describe('renderSelectedUnitInfo - fortify button', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  function makeWarriorState(unitOverrides: Record<string, unknown> = {}): GameState {
    return {
      turn: 1, era: 1, currentPlayer: 'player', gameOver: false, winner: null,
      map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
      units: {
        'warrior-1': { id: 'warrior-1', type: 'warrior', owner: 'player', position: { q: 0, r: 0 }, health: 100, experience: 0, movementPointsLeft: 2, hasMoved: false, hasActed: false, isResting: false, ...unitOverrides },
      },
      cities: {},
      civilizations: { player: { color: '#fff', techState: { completed: [] } } },
    } as unknown as GameState;
  }

  it('renders Fortify button for a military unit that has not yet acted', () => {
    const state = makeWarriorState();
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onFortify: () => {},
    });

    const btns = findButtons(container).map(b => b.textContent);
    expect(btns).toContain('Fortify');
    expect(btns).not.toContain('Unfortify');
  });

  it('renders Unfortify button when unit is already fortified', () => {
    const state = makeWarriorState({ isFortified: true });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onFortify: () => {},
    });

    const btns = findButtons(container).map(b => b.textContent);
    expect(btns).toContain('Unfortify');
    expect(btns).not.toContain('Fortify');
  });

  it('does not render Fortify button for a non-combat unit (settler)', () => {
    const state = makeWarriorState({ type: 'settler' });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onFortify: () => {},
    });

    const btns = findButtons(container).map(b => b.textContent);
    expect(btns).not.toContain('Fortify');
    expect(btns).not.toContain('Unfortify');
  });

  it('hides Fortify button when unit has already acted this turn', () => {
    const state = makeWarriorState({ hasActed: true });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onFortify: () => {},
    });

    const btns = findButtons(container).map(b => b.textContent);
    expect(btns).not.toContain('Fortify');
  });

  it('hides Fortify button when unit has already moved this turn', () => {
    const state = makeWarriorState({ hasMoved: true, movementPointsLeft: 0 });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onFortify: () => {},
    });

    const btns = findButtons(container).map(b => b.textContent);
    expect(btns).not.toContain('Fortify');
  });

  it('hides Rest button when injured unit has already moved this turn', () => {
    const state = makeWarriorState({ health: 60, hasMoved: true, movementPointsLeft: 0 });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onRest: () => {},
    });

    const btns = findButtons(container).map(b => b.textContent);
    expect(btns).not.toContain('Rest (+15 HP)');
  });

  it('fires onFortify with the unit id when Fortify is clicked', () => {
    const state = makeWarriorState();
    const container = new MockElement('div');
    let fortifiedId: string | null = null;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onFortify: (uid) => { fortifiedId = uid; },
    });

    findButtons(container).find(b => b.textContent === 'Fortify')?.click();
    expect(fortifiedId).toBe('warrior-1');
  });

  it('fires onFortify with the unit id when Unfortify is clicked', () => {
    const state = makeWarriorState({ isFortified: true });
    const container = new MockElement('div');
    let fortifiedId: string | null = null;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onFortify: (uid) => { fortifiedId = uid; },
    });

    findButtons(container).find(b => b.textContent === 'Unfortify')?.click();
    expect(fortifiedId).toBe('warrior-1');
  });
});

describe('renderSelectedUnitInfo - upgrade button building gate', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  function makeJetFighterState(cityBuildings: string[]): GameState {
    return {
      turn: 1, era: 12, currentPlayer: 'player', gameOver: false, winner: null,
      map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
      units: {
        'bomber-1': { id: 'bomber-1', type: 'bomber', owner: 'player', position: { q: 0, r: 0 }, health: 100, experience: 0, movementPointsLeft: 2, hasMoved: false, hasActed: false, isResting: false },
      },
      cities: {
        'city-1': { id: 'city-1', owner: 'player', position: { q: 0, r: 0 }, buildings: cityBuildings, ownedTiles: [] },
      },
      civilizations: {
        player: { color: '#fff', gold: 1000, cities: ['city-1'], techState: { completed: ['nuclear-weapons', 'stealth-technology'] } },
      },
    } as unknown as GameState;
  }

  it('renders the Upgrade button when the city has stealth_airbase', () => {
    const state = makeJetFighterState(['stealth_airbase']);
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'bomber-1', {
      onUpgradeUnit: () => {},
    });

    const texts = findButtons(container).map(b => b.textContent);
    expect(texts.some(t => t.startsWith('Upgrade → Stealth Bomber'))).toBe(true);
  });

  it('hides the Upgrade button and shows a missing-building reason when stealth_airbase is absent', () => {
    const state = makeJetFighterState([]);
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'bomber-1', {
      onUpgradeUnit: () => {},
    });

    const texts = findButtons(container).map(b => b.textContent);
    expect(texts.some(t => t.startsWith('Upgrade'))).toBe(false);
    expect(collectAllText(container).join(' ')).toContain('Stealth Airbase');
  });
});

describe('renderSelectedUnitInfo - transport actions', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  function makeTransportState(options: { loaded?: boolean } = {}): GameState {
    const loaded = options.loaded ?? false;
    return {
      turn: 1,
      era: 1,
      currentPlayer: 'player',
      gameOver: false,
      winner: null,
      map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
      units: {
        'transport-1': {
          id: 'transport-1',
          type: 'transport',
          owner: 'player',
          position: { q: 1, r: 0 },
          health: 100,
          maxHealth: 100,
          movementPointsLeft: 3,
          hasMoved: false,
          hasActed: false,
          cargoUnitIds: loaded ? ['warrior-1'] : [],
        },
        'warrior-1': {
          id: 'warrior-1',
          type: 'warrior',
          owner: 'player',
          position: { q: loaded ? 1 : 0, r: 0 },
          health: 100,
          maxHealth: 100,
          movementPointsLeft: 2,
          hasMoved: false,
          hasActed: false,
          ...(loaded ? { transportId: 'transport-1' } : {}),
        },
      },
      cities: {},
      civilizations: { player: { color: '#fff', techState: { completed: ['galleys'] } } },
    } as unknown as GameState;
  }

  it('shows empty cargo status for an empty Transport', () => {
    const state = makeTransportState();
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'transport-1', {});

    expect(collectAllText(container).join(' ')).toContain('Cargo: Empty');
  });

  it('shows carried land units on a loaded Transport', () => {
    const state = makeTransportState({ loaded: true });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'transport-1', {});

    expect(collectAllText(container).join(' ')).toContain('Cargo: Carrying Warrior');
  });

  it('renders and fires Load onto Transport for an eligible land unit', () => {
    const state = makeTransportState();
    const container = new MockElement('div');
    let loaded: { unitId: string; transportId: string } | null = null;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      getTransportOptions: () => [{ transportId: 'transport-1', label: 'Load onto Transport' }],
      onLoadTransport: (unitId, transportId) => { loaded = { unitId, transportId }; },
    });

    const button = findButtons(container).find(b => b.textContent === 'Load onto Transport');
    expect(button?.style.cssText).toContain('min-height:44px');
    button?.click();
    expect(loaded).toEqual({ unitId: 'warrior-1', transportId: 'transport-1' });
  });

  it('renders Stage 1 cargo list and calls onSelectCargoToUnload when Unload clicked', () => {
    const state = makeTransportState({ loaded: true });
    // Give warrior a move left so it can unload
    state.units['warrior-1'] = { ...state.units['warrior-1'], hasActed: false, movementPointsLeft: 2 };
    const container = new MockElement('div');
    let selected: { transportId: string; cargoUnitId: string } | null = null;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'transport-1', {
      getCargoBoardInfo: () => [{
        cargoUnitId: 'warrior-1',
        label: 'Warrior',
        slotCost: 1,
        canUnload: true,
      }],
      onSelectCargoToUnload: (transportId, cargoUnitId) => {
        selected = { transportId, cargoUnitId };
      },
      onCancelUnload: () => {},
    });

    const unloadBtn = findButtons(container).find(b => b.textContent === 'Unload');
    expect(unloadBtn).toBeDefined();
    unloadBtn?.click();
    expect(selected).toEqual({ transportId: 'transport-1', cargoUnitId: 'warrior-1' });
  });

  it('renders Stage 2 instruction banner with Cancel when pendingUnloadUnitName is set', () => {
    const state = makeTransportState({ loaded: true });
    const container = new MockElement('div');
    let cancelled = false;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'transport-1', {
      getCargoBoardInfo: () => [],
      onSelectCargoToUnload: () => {},
      onCancelUnload: () => { cancelled = true; },
      pendingUnloadUnitName: 'Warrior',
    });

    const text = collectAllText(container).join(' ');
    expect(text).toContain('Warrior');
    expect(text).toContain('disembark');

    const cancelBtn = findButtons(container).find(b => b.textContent === 'Cancel Unload');
    expect(cancelBtn).toBeDefined();
    cancelBtn?.click();
    expect(cancelled).toBe(true);
  });

  it('does not render land-unit actions for cargo while aboard', () => {
    const state = makeTransportState({ loaded: true });
    state.units['warrior-1'].health = 60;
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onRest: () => {},
      onFortify: () => {},
      onSkipTurn: () => {},
      onLoadTransport: () => {},
      getTransportOptions: () => [{ transportId: 'transport-1', label: 'Load onto Transport' }],
    });

    const text = collectAllText(container).join(' ');
    const buttons = findButtons(container).map(button => button.textContent);
    expect(text).toContain('Aboard Transport');
    expect(buttons).not.toContain('Rest (+15 HP)');
    expect(buttons).not.toContain('Fortify');
    expect(buttons).not.toContain('Skip Turn');
    expect(buttons).not.toContain('Load onto Transport');
  });
});

describe('Expedition — Establish Outpost action', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  function makeExpeditionState(tileInCityTerritory: boolean): GameState {
    const pos = { q: 3, r: 3 };
    const tileKey = hexKey(pos);
    const cityPos = { q: 0, r: 0 };
    const unitId = 'u-expedition';

    const ownedTiles = tileInCityTerritory ? [cityPos, pos] : [cityPos];

    return {
      turn: 1, era: 1, currentPlayer: 'player', gameOver: false, winner: null,
      map: {
        width: 20, height: 20, wrapsHorizontally: false, rivers: [],
        tiles: {
          [hexKey(cityPos)]: {
            coord: cityPos, terrain: 'grassland', elevation: 'lowland',
            resource: null, improvement: 'none', improvementTurnsLeft: 0,
            owner: 'player', hasRiver: false, wonder: null,
          },
          [tileKey]: {
            coord: pos, terrain: 'hills', elevation: 'flat',
            resource: 'iron', improvement: 'none', improvementTurnsLeft: 0,
            owner: tileInCityTerritory ? 'player' : null, hasRiver: false, wonder: null,
          },
        },
      },
      units: {
        [unitId]: {
          id: unitId, type: 'expedition', owner: 'player', position: { ...pos },
          movementPointsLeft: 3, health: 100, experience: 0,
          hasMoved: false, hasActed: false, isResting: false,
        },
      },
      cities: {
        'city-1': {
          id: 'city-1', name: 'TestCity', owner: 'player', position: cityPos,
          ownedTiles,
          population: 1, food: 0, production: 0, gold: 0,
          buildings: [], productionQueue: [], workedTiles: [], specialistSlots: [],
          garrisonUnitId: null, hp: 100, maxHp: 100,
        },
      },
      civilizations: {
        player: {
          id: 'player', color: '#fff', cities: ['city-1'],
          techState: { completed: ['bronze-working'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        },
      },
      espionage: {},
    } as unknown as GameState;
  }

  it('renders the Establish Outpost button when canEstablishOutpost is true', () => {
    const state = makeExpeditionState(false);
    const container = new MockElement('div');
    let outpostCalled = false;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u-expedition', {
      onEstablishOutpost: () => { outpostCalled = true; },
    });

    const btn = findButtons(container).find(b => b.textContent?.includes('Establish Outpost'));
    expect(btn).toBeTruthy();
    btn?.click();
    expect(outpostCalled).toBe(true);
  });

  it('does NOT render the button when the tile is in city territory', () => {
    const state = makeExpeditionState(true);
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u-expedition', {
      onEstablishOutpost: () => {},
    });

    const buttons = findButtons(container);
    expect(buttons.some(b => b.textContent?.includes('Establish Outpost'))).toBe(false);
  });
});

describe('renderSelectedUnitInfo — unit upkeep display', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('shows Free support for a warrior covered by free unit slots', () => {
    const state = createNewGame(undefined, 'upkeep-free-test', 'small');
    const unit = createUnit('warrior', 'player', { q: 0, r: 0 }, state.idCounters);
    state.units[unit.id] = unit;
    state.civilizations.player.units = [unit.id];

    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, unit.id, {});

    const allText = collectAllText(container).join(' ');
    expect(allText).toContain('Free support');
  });

  it('does not show upkeep line for enemy units', () => {
    const state = createNewGame(undefined, 'upkeep-enemy-test', 'small');
    const aiCivId = Object.keys(state.civilizations).find(id => id !== 'player');
    if (!aiCivId) return;
    const unit = createUnit('warrior', aiCivId, { q: 0, r: 0 }, state.idCounters);
    state.units[unit.id] = unit;
    state.civilizations[aiCivId].units = [unit.id];
    state.currentPlayer = 'player';

    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, unit.id, {});

    const allText = collectAllText(container).join(' ');
    expect(allText).not.toContain('Free support');
    expect(allText).not.toContain('💰/turn');
  });
});

describe('renderSelectedUnitInfo — pirate enclave assault', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('shows the canonical assault action supplied by the live controller', () => {
    const state = createNewGame(undefined, 'pirate-unit-action', 'small');
    const unit = createUnit('trireme', 'player', { q: 0, r: 0 }, state.idCounters);
    state.units[unit.id] = unit;
    state.civilizations.player.units = [unit.id];
    let opened = false;
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, unit.id, {
      getPirateAssaultAction: () => ({ factionId: 'pirate-1', label: 'Assault The Red Wake enclave' }),
      onOpenPirateAssault: () => { opened = true; },
    });

    const button = findButtons(container).find(candidate => candidate.textContent.includes('Assault The Red Wake enclave'));
    expect(button).toBeTruthy();
    button?.click();
    expect(opened).toBe(true);
  });
});

describe('renderSelectedUnitInfo — Cyber Unit intent launcher', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('shows the intent launcher only to an activated owning player and invokes it with the current unit', () => {
    const state = createNewGame(undefined, 'cyber-intent-launcher', 'small');
    state.currentPlayer = 'player';
    state.units = {
      cyber: {
        ...createUnit('cyber_unit', 'player', { q: 1, r: 1 }, {
          nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1,
        }),
        id: 'cyber',
      },
    };
    state.civilizations.player.units = ['cyber'];
    state.civilizations.player.techState.completed = ['quantum-computing'];
    const onOpenNetworkIntent = vi.fn();
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'cyber', { onOpenNetworkIntent });

    const launcher = findButtons(container).find(button => button.textContent === 'Set Network Intent');
    expect(launcher).toBeDefined();
    launcher?.click();
    expect(onOpenNetworkIntent).toHaveBeenCalledWith('cyber');

    state.civilizations.player.techState.completed = [];
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'cyber', { onOpenNetworkIntent });
    expect(collectAllText(container)).not.toContain('Set Network Intent');
  });
});
