import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTreasuryDrawer } from '@/ui/treasury-drawer';
import type { EconomyProjection } from '@/systems/economy-system';

function makeEconomy(overrides: Partial<EconomyProjection> = {}): EconomyProjection {
  return {
    civId: 'player',
    startingGold: 50,
    endingGold: 57,
    grossGoldPerTurn: 10,
    grossGoldIncome: 10,
    maintenanceGoldPerTurn: 3,
    buildingMaintenance: 2,
    unitMaintenance: 1,
    totalMaintenance: 3,
    netGoldPerTurn: 7,
    projectedGold: 57,
    unpaidMaintenance: 0,
    strainLevel: 'none',
    rushBuyDisabled: false,
    breakdown: {} as EconomyProjection['breakdown'],
    ...overrides,
  } as EconomyProjection;
}

// Minimal mock document for node environment
class MockEl {
  tagName: string;
  children: MockEl[] = [];
  style: Record<string, string> = {};
  textContent = '';
  dataset: Record<string, string> = {};
  private _attrs: Record<string, string> = {};
  private _listeners: Map<string, Array<() => void>> = new Map();

  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  appendChild(c: MockEl): MockEl { this.children.push(c); return c; }
  addEventListener(e: string, fn: () => void): void {
    if (!this._listeners.has(e)) this._listeners.set(e, []);
    this._listeners.get(e)!.push(fn);
  }
  setAttribute(k: string, v: string): void { this._attrs[k] = v; }
  getAttribute(k: string): string | null { return this._attrs[k] ?? null; }
  click(): void { for (const fn of this._listeners.get('click') ?? []) fn(); }
  querySelector(sel: string): MockEl | null {
    const dataMatch = sel.match(/^\[data-row="(.+)"\]$/);
    if (dataMatch) {
      const key = dataMatch[1];
      const found = this.children.find(c => c.getAttribute('data-row') === key);
      if (found) return found;
      for (const child of this.children) {
        const inner = child.querySelector(sel);
        if (inner) return inner;
      }
    }
    return null;
  }
}

class MockDoc {
  createElement(tag: string): MockEl { return new MockEl(tag); }
}

function installDoc(): void { (globalThis as any).document = new MockDoc(); }
function removeDoc(): void { (globalThis as any).document = undefined; }

describe('createTreasuryDrawer', () => {
  beforeEach(installDoc);
  afterEach(removeDoc);

  it('starts closed', () => {
    const drawer = createTreasuryDrawer();
    expect(drawer.isOpen()).toBe(false);
    expect(drawer.element.style['display']).toBe('none');
  });

  it('toggle opens the drawer', () => {
    const drawer = createTreasuryDrawer();
    drawer.toggle();
    expect(drawer.isOpen()).toBe(true);
    expect(drawer.element.style['display']).not.toBe('none');
  });

  it('toggle twice closes the drawer', () => {
    const drawer = createTreasuryDrawer();
    drawer.toggle();
    drawer.toggle();
    expect(drawer.isOpen()).toBe(false);
    expect(drawer.element.style['display']).toBe('none');
  });

  it('close() hides the drawer', () => {
    const drawer = createTreasuryDrawer();
    drawer.toggle();
    drawer.close();
    expect(drawer.isOpen()).toBe(false);
    expect(drawer.element.style['display']).toBe('none');
  });

  it('update() renders revenue and net in child elements', () => {
    const drawer = createTreasuryDrawer();
    drawer.update(makeEconomy({ grossGoldIncome: 15, netGoldPerTurn: 8 }), 50);
    const allText = collectText(drawer.element as unknown as MockEl);
    expect(allText).toContain('15');
    expect(allText).toContain('8');
    expect(allText).toContain('50');
  });

  it('net row is green when strain is none', () => {
    const drawer = createTreasuryDrawer();
    drawer.update(makeEconomy({ strainLevel: 'none', netGoldPerTurn: 5 }), 100);
    const netEl = (drawer.element as unknown as MockEl).querySelector('[data-row="net"]');
    expect(netEl?.style['color']).toBe('#4ade80');
  });

  it('net row is yellow when strain is low', () => {
    const drawer = createTreasuryDrawer();
    drawer.update(makeEconomy({ strainLevel: 'low' as any, netGoldPerTurn: 1 }), 5);
    const netEl = (drawer.element as unknown as MockEl).querySelector('[data-row="net"]');
    expect(netEl?.style['color']).toBe('#facc15');
  });

  it('net row is red when strain is critical', () => {
    const drawer = createTreasuryDrawer();
    drawer.update(makeEconomy({ strainLevel: 'critical' as any, netGoldPerTurn: -3 }), 1);
    const netEl = (drawer.element as unknown as MockEl).querySelector('[data-row="net"]');
    expect(netEl?.style['color']).toBe('#f87171');
  });
});

function collectText(node: MockEl): string {
  const parts: string[] = [];
  if (node.textContent) parts.push(node.textContent);
  for (const child of node.children) parts.push(collectText(child));
  return parts.join(' ');
}
