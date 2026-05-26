import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderSelectedUnitInfo } from '@/ui/selected-unit-info';
import { createEspionageCivState, createSpyFromUnit, setDisguise } from '@/systems/espionage-system';
import type { GameState } from '@/core/types';

class MockElement {
  tagName: string;
  children: MockElement[] = [];
  style = { cssText: '', display: '' };
  textContent = '';
  type = '';
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

function makeSpyState(techs: string[], spyStatus: string = 'idle'): GameState {
  let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
  const { state: esp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed');
  civEsp = { ...esp, spies: { ...esp.spies, 'unit-1': { ...esp.spies['unit-1'], status: spyStatus as any } } };
  return {
    turn: 1, era: 1, currentPlayer: 'player', gameOver: false, winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {
      'unit-1': {
        id: 'unit-1', type: 'spy_scout', owner: 'player',
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

describe('renderSelectedUnitInfo — spy disguise buttons', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('does not render "As Scout" button without spy-networks tech', () => {
    const state = makeSpyState(['espionage-informants']); // spy-networks NOT researched
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onSetDisguise: () => {},
    });
    const btns = findButtons(container).map(b => b.textContent);
    expect(btns.some(t => t.includes('As Scout'))).toBe(false);
    expect(btns.some(t => t.includes('As Archer'))).toBe(false);
  });

  it('renders "As Scout" and "As Archer" buttons when spy-networks is researched', () => {
    const state = makeSpyState(['espionage-informants', 'spy-networks']);
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onSetDisguise: () => {},
    });
    const btns = findButtons(container).map(b => b.textContent);
    expect(btns.some(t => t.includes('As Scout'))).toBe(true);
    expect(btns.some(t => t.includes('As Archer'))).toBe(true);
  });

  it('does not render disguise section when spy is not idle', () => {
    const state = makeSpyState(['espionage-informants', 'spy-networks'], 'on_mission');
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onSetDisguise: () => {},
    });
    const btns = findButtons(container).map(b => b.textContent);
    expect(btns.some(t => t.includes('As Barbarian'))).toBe(false);
  });

  it('marks the active disguise with a checkmark', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    const { state: esp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed');
    civEsp = setDisguise(esp, 'unit-1', 'barbarian');
    const gameState = makeSpyState(['espionage-informants']);
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
    const state = makeSpyState(['espionage-informants', 'spy-networks']);
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
    expect(buttons).toContain('Build Farm');
    expect(buttons).toContain('Build Lumber Camp');
    expect(buttons).not.toContain('Build Watermill');
    expect(buttons).not.toContain('Drain Swamp (20% worker risk)');
  });

  it('shows watermill only on valid river land', () => {
    const state = makeWorkerState({ terrain: 'plains', resource: 'iron', hasRiver: true });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const buttons = findButtons(container).map(button => button.textContent);
    expect(buttons).toContain('Build Farm');
    expect(buttons).toContain('Build Mine');
    expect(buttons).toContain('Build Watermill');
  });

  it('shows Drain Swamp only on unimproved swamp', () => {
    const state = makeWorkerState({ terrain: 'swamp' });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const buttons = findButtons(container).map(button => button.textContent);
    expect(buttons.some(l => l.includes('Drain Swamp') && l.includes('Grassland'))).toBe(true);
    expect(buttons).not.toContain('Build Farm');
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
      expect(buttons).not.toContain('Build Farm');
      expect(buttons).not.toContain('Build Lumber Camp');
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
    expect(buttons).not.toContain('Build Farm');
  });

  it('updates worker current-tile reason after territory ownership changes', () => {
    const state = makeWorkerState({ terrain: 'plains', owner: 'player', improvement: 'none' });
    const first = new MockElement('div');
    renderSelectedUnitInfo(first as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    expect(collectAllText(first).join(' ')).not.toContain('Outside your territory');
    expect(findButtons(first).map(button => button.textContent)).toContain('Build Farm');

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
    expect(findButtons(second).map(button => button.textContent)).not.toContain('Build Farm');
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
    expect(buttons).not.toContain('Build Farm');
    expect(buttons).not.toContain('Build Lumber Camp');
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
    expect(buttons).not.toContain('Build Farm');
    expect(buttons).not.toContain('Build Lumber Camp');
  });

  it('hides worker actions on already improved tiles', () => {
    const state = makeWorkerState({ terrain: 'swamp', improvement: 'farm' });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const buttons = findButtons(container).map(button => button.textContent);
    expect(buttons).not.toContain('Drain Swamp (20% worker risk)');
    expect(buttons).not.toContain('Build Farm');
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
    expect(buttons).not.toContain('Build Farm');
    expect(buttons).not.toContain('Build Lumber Camp');
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
    expect(buttons).toContain('Build Farm');
    expect(buttons).toContain('Build Lumber Camp');
  });

  it('fires onWorkerAction with the clicked action id', () => {
    const state = makeWorkerState({ terrain: 'forest' });
    const container = new MockElement('div');
    let clicked: unknown = null;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: action => { clicked = action; },
    });

    findButtons(container).find(button => button.textContent === 'Build Lumber Camp')?.click();

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

  it('grassland tile with silk shows plantation button', () => {
    const state = makeWorkerState({ terrain: 'grassland', resource: 'silk' });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: vi.fn(),
    });
    const buttons = findButtons(container).map(b => b.textContent ?? '');
    expect(buttons.some(l => l.toLowerCase().includes('plantation'))).toBe(true);
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
