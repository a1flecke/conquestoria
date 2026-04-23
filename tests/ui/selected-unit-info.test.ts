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
});
