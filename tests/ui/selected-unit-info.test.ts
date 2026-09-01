import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderSelectedUnitInfo } from '@/ui/selected-unit-info';
import { createEspionageCivState, createSpyFromUnit, setDisguise } from '@/systems/espionage-system';
import type { GameState, HexCoord, UnitType } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { createNewGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-system';
import { registerCrisisForce } from '@/systems/crisis-force-system';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';

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
  scrollHeight = 0;
  clientHeight = 0;
  scrollTop = 0;
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

function findDetails(node: unknown): MockElement | undefined {
  const el = node as MockElement;
  if (el.tagName === 'DETAILS') return el;
  for (const child of el.children ?? []) {
    const found = findDetails(child);
    if (found) return found;
  }
  return undefined;
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

function findZoneOfControlWarning(node: unknown): MockElement | undefined {
  const el = node as MockElement;
  if (el.dataset?.zoneOfControlWarning) return el;
  for (const child of el.children ?? []) {
    const found = findZoneOfControlWarning(child);
    if (found) return found;
  }
  return undefined;
}

function findScrollCue(node: unknown): MockElement | undefined {
  const el = node as MockElement;
  if (el.dataset?.scrollCue) return el;
  for (const child of el.children ?? []) {
    const found = findScrollCue(child);
    if (found) return found;
  }
  return undefined;
}

describe('land-supply status line (#544)', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  function makeUnitState(seed: string, unitType: UnitType, landSupply?: GameState['units'][string]['landSupply']) {
    const state = createNewGame(undefined, seed, 'small');
    const unit = {
      ...createUnit(unitType, 'player', { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }),
      id: 'u1',
      landSupply,
    };
    state.currentPlayer = 'player';
    state.units = { u1: unit };
    state.civilizations.player.units = ['u1'];
    return state;
  }

  it('shows Full Supply with a territory fallback label when no source is in range', () => {
    const state = makeUnitState('supply-status-full', 'warrior');
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    expect(collectAllText(container).join(' ')).toContain('Full Supply — territory');
  });

  it('shows Stable but Unsupported — no healing', () => {
    const state = makeUnitState('supply-status-stable', 'warrior', { state: 'stable-unsupported', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    expect(collectAllText(container).join(' ')).toContain('Stable but Unsupported — no healing');
  });

  it('shows the active combat penalty text when degraded', () => {
    const state = makeUnitState('supply-status-degraded', 'warrior', { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    expect(collectAllText(container).join(' ')).toContain('Overextended — Stage 2 of 3 · -10% Combat');
  });

  it('shows the movement penalty text when severe', () => {
    const state = makeUnitState('supply-status-severe', 'warrior', { state: 'severe', hostileUnsupportedTurns: 6, suppliedTurnsSinceRecovery: 0 });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    expect(collectAllText(container).join(' ')).toContain('Overextended — Stage 3 of 3 · -10% Combat, -1 Movement');
  });

  it('shows no supply line at all for a unit that does not participate in land supply', () => {
    const state = makeUnitState('supply-status-naval', 'trireme');
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    const text = collectAllText(container).join(' ');
    expect(text).not.toContain('Full Supply');
    expect(text).not.toContain('Overextended');
    expect(text).not.toContain('Stable but Unsupported');
  });

  it('shows turns-until-next-stage naming the correct upcoming penalty in the grace stage', () => {
    const state = makeUnitState('supply-status-grace-countdown', 'warrior', { state: 'grace', hostileUnsupportedTurns: 2, suppliedTurnsSinceRecovery: 0 });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    expect(collectAllText(container).join(' ')).toContain('-10% Combat in 1 turn');
  });

  it('shows turns-until-next-stage naming the correct upcoming penalty in the degraded stage', () => {
    const state = makeUnitState('supply-status-degraded-countdown', 'warrior', { state: 'degraded', hostileUnsupportedTurns: 4, suppliedTurnsSinceRecovery: 0 });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    expect(collectAllText(container).join(' ')).toContain('-1 Movement in 1 turn');
  });

  it('shows recovery guidance naming the nearest source when stable-unsupported and one is in range', () => {
    const state = makeUnitState('supply-status-recovery-guidance', 'warrior', { state: 'stable-unsupported', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
    state.cities = {
      c1: { id: 'c1', owner: 'player', name: 'Memphis', position: { q: 16, r: 15 } } as GameState['cities'][string],
    };
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    expect(collectAllText(container).join(' ')).toContain('Move toward Memphis to recover');
  });

  it('shows "no supply source in range" recovery guidance when nothing covers the unit', () => {
    const state = makeUnitState('supply-status-no-source', 'warrior', { state: 'severe', hostileUnsupportedTurns: 6, suppliedTurnsSinceRecovery: 0 });
    state.cities = {};
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    expect(collectAllText(container).join(' ')).toContain('No supply source in range');
  });

  it('shows a "How supply works" link that calls onReopenSupplyTutorial when supply status is shown', () => {
    const state = makeUnitState('supply-status-help-link', 'warrior', { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    const container = new MockElement('div');
    const onReopenSupplyTutorial = vi.fn();
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', { onReopenSupplyTutorial });
    const helpButton = findButtons(container).find(b => b.textContent.includes('How supply works'));
    expect(helpButton).toBeTruthy();
    helpButton!.listeners.click?.[0]?.();
    expect(onReopenSupplyTutorial).toHaveBeenCalledTimes(1);
  });

  it('shows no supply line at all for a foreign (enemy) unit — never leaks their supply source or status to the viewer', () => {
    const state = createNewGame(undefined, 'supply-status-foreign-unit', 'small');
    const enemyUnit = {
      ...createUnit('warrior', 'ai-1', { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }),
      id: 'enemy1',
      landSupply: { state: 'degraded' as const, hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    };
    state.currentPlayer = 'player';
    state.units = { enemy1: enemyUnit };
    state.civilizations['ai-1'].units = ['enemy1'];
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'enemy1', {});
    const text = collectAllText(container).join(' ');
    expect(text).not.toContain('Full Supply');
    expect(text).not.toContain('Overextended');
    expect(text).not.toContain('Stable but Unsupported');
  });
});

describe('Great General identity display (#544 MR3)', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('shows the specific commander\'s name, era, and descriptor when a great_general with a resolvable generalDefinitionId is selected', () => {
    const state = createNewGame(undefined, 'general-identity-1', 'small');
    const romeGeneral = GENERAL_DEFINITIONS.find(g => g.civTypeEligibility.includes('rome'))!;
    const unit = {
      ...createUnit('great_general', 'player', { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }),
      id: 'u1',
      generalDefinitionId: romeGeneral.id,
    };
    state.currentPlayer = 'player';
    state.units = { u1: unit };
    state.civilizations.player.units = ['u1'];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});

    const text = collectAllText(container).join(' ');
    expect(text).toContain(romeGeneral.name);
    expect(text).toContain(`Era ${romeGeneral.era}`);
    expect(text).toContain(romeGeneral.descriptor);
  });

  it('#888 — shows a generated officer\'s name, era and descriptor from the generatedGenerals registry', () => {
    const state = createNewGame(undefined, 'general-identity-generated', 'small');
    const id = 'generated:rome:3:deadbeef';
    (state as any).generatedGenerals = {
      [id]: {
        id, name: 'Marcus Valerius, the Steadfast', civTypeEligibility: ['rome'], era: 3,
        descriptor: 'Legatus. A Roman field commander, risen through the ranks of the host.',
        portraitIcon: '🦅', origin: 'generated', commandRange: 2, commandCapacity: 3,
        abilityIds: ['rally', 'seize_the_moment', 'last_stand'], maxCommandCharges: 3, cooldownTurns: 10,
      },
    };
    const unit = {
      ...createUnit('great_general', 'player', { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }),
      id: 'u1',
      generalDefinitionId: id,
    };
    state.currentPlayer = 'player';
    state.units = { u1: unit };
    state.civilizations.player.units = ['u1'];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});

    const text = collectAllText(container).join(' ');
    expect(text).toContain('Marcus Valerius, the Steadfast');
    expect(text).toContain('Era 3');
    expect(text).toContain('Legatus. A Roman field commander');
  });

  it('falls back gracefully (no crash, no extra text) when generalDefinitionId does not resolve', () => {
    const state = createNewGame(undefined, 'general-identity-2', 'small');
    const unit = {
      ...createUnit('great_general', 'player', { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }),
      id: 'u1',
      generalDefinitionId: 'not-a-real-id',
    };
    state.currentPlayer = 'player';
    state.units = { u1: unit };
    state.civilizations.player.units = ['u1'];
    const container = new MockElement('div');

    expect(() => renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {})).not.toThrow();
  });

  it('#886 — renders an authored historical General\'s biography in a collapsed <details>', () => {
    const state = createNewGame(undefined, 'general-profile-hist', 'small');
    const unit = {
      ...createUnit('great_general', 'player', { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }),
      id: 'u1',
      generalDefinitionId: 'gen_caesar',
    };
    state.currentPlayer = 'player';
    state.units = { u1: unit };
    state.civilizations.player.units = ['u1'];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});

    const details = findDetails(container);
    expect(details).toBeDefined();
    expect(details!.tagName).toBe('DETAILS');
    const text = collectAllText(details).join(' ');
    expect(text).toContain('Who was Julius Caesar?');
    expect(text).toContain('conquest of Gaul');       // from the summary
    expect(text).toContain('across the Rubicon river'); // from a fact
    // provenance URLs are never rendered to the player
    expect(text).not.toContain('http');
  });

  it('#886 — renders an authored lore General with a "From:" work line and no fake citation', () => {
    const state = createNewGame(undefined, 'general-profile-lore', 'small');
    const unit = {
      ...createUnit('great_general', 'player', { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }),
      id: 'u1',
      generalDefinitionId: 'gen_boromir',
    };
    state.currentPlayer = 'player';
    state.units = { u1: unit };
    state.civilizations.player.units = ['u1'];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});

    const text = collectAllText(container).join(' ');
    expect(text).toContain('About Boromir, Captain of the White Tower');
    expect(text).toContain('From: J.R.R. Tolkien');
    expect(text).not.toContain('http');
  });

  it('#886/#888 — a generated officer shows name + descriptor but no biography <details>', () => {
    const state = createNewGame(undefined, 'general-profile-generated', 'small');
    const id = 'generated:rome:3:deadbeef';
    (state as unknown as { generatedGenerals: Record<string, unknown> }).generatedGenerals = {
      [id]: {
        id, name: 'Marcus Valerius, the Steadfast', civTypeEligibility: ['rome'], era: 3,
        descriptor: 'Legatus. A Roman field commander, risen through the ranks of the host.',
        portraitIcon: '🦅', origin: 'generated', commandRange: 2, commandCapacity: 3,
        abilityIds: ['rally', 'seize_the_moment', 'last_stand'], maxCommandCharges: 3, cooldownTurns: 10,
      },
    };
    const unit = {
      ...createUnit('great_general', 'player', { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }),
      id: 'u1',
      generalDefinitionId: id,
    };
    state.currentPlayer = 'player';
    state.units = { u1: unit };
    state.civilizations.player.units = ['u1'];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});

    const text = collectAllText(container).join(' ');
    expect(text).toContain('Marcus Valerius, the Steadfast');
    expect(text).toContain('Legatus. A Roman field commander');
    expect(text).not.toContain('Who was');
    expect(text).not.toContain('About Marcus Valerius');
    expect(findDetails(container)).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // #885 — specialty line + resolved stats
  // -------------------------------------------------------------------------

  function selectGeneral(seed: string, generalId: string, gen?: Record<string, unknown>) {
    const state = createNewGame(undefined, seed, 'small');
    if (gen) (state as unknown as { generatedGenerals: unknown }).generatedGenerals = gen;
    const unit = {
      ...createUnit('great_general', 'player', { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }),
      id: 'u1', generalDefinitionId: generalId,
    };
    state.currentPlayer = 'player';
    state.units = { u1: unit } as never;
    state.civilizations.player.units = ['u1'];
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    return collectAllText(container).join(' ');
  }

  it('#885 — a Defensive Commander shows a truthful specialty line and resolved command range 1', () => {
    const text = selectGeneral('s885-ui-def', 'gen_wellington');
    expect(text).toContain('Specialty: Defensive Commander');
    expect(text).toContain('Last Stand');
    expect(text).toContain('+25%');
    expect(text).toContain('Command range 1');
    expect(text).not.toContain('http');
  });

  it('#885 — a Swift Commander shows resolved command range 3', () => {
    expect(selectGeneral('s885-ui-mob', 'gen_genghis')).toContain('Command range 3');
  });

  it('#885 — a Field Commander (generalist) shows NO specialty line', () => {
    expect(selectGeneral('s885-ui-gen', 'gen_hannibal')).not.toContain('Specialty:');
  });

  it('#885 — a generated officer shows NO specialty line', () => {
    const id = 'generated:rome:3:deadbeef';
    const text = selectGeneral('s885-ui-generated', id, {
      [id]: {
        id, name: 'Marcus Valerius', civTypeEligibility: ['rome'], era: 3,
        descriptor: 'Legatus. A Roman field commander.', portraitIcon: '🦅', origin: 'generated',
        commandRange: 2, commandCapacity: 3, abilityIds: ['rally', 'seize_the_moment', 'last_stand'],
        maxCommandCharges: 3, cooldownTurns: 10,
      },
    });
    expect(text).not.toContain('Specialty:');
  });

  it('#885 hot-seat — player 2 selecting their own Swift Commander sees its specialty, not any rival state', () => {
    const state = createNewGame(undefined, 's885-ui-hotseat', 'small');
    const p2 = Object.keys(state.civilizations).find(id => id !== 'player')!;
    const unit = {
      ...createUnit('great_general', p2, { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }),
      id: 'u1', generalDefinitionId: 'gen_genghis',
    };
    state.currentPlayer = p2;
    state.units = { u1: unit } as never;
    state.civilizations[p2]!.units = ['u1'];
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    const text = collectAllText(container).join(' ');
    expect(text).toContain('Specialty: Swift Commander');
    expect(text).toContain('Command range 3');
    // the specialty line is derived only from the selected unit's own
    // generalDefinitionId — no other General's name appears
    expect(text).not.toContain('Field Commander');
    expect(text).not.toContain('Defensive Commander');
  });
});

describe('#544 MR4 — General command panel', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  function makeGeneralState(overrides: Partial<{ generalCommandChargesUsed: number; generalNoCommandThisTurn: boolean }> = {}) {
    const state = createNewGame(undefined, 'general-command-panel-1', 'small');
    const romeGeneral = GENERAL_DEFINITIONS.find(g => g.civTypeEligibility.includes('rome'))!;
    const unit = {
      ...createUnit('great_general', 'player', { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }),
      id: 'u1',
      generalDefinitionId: romeGeneral.id,
      ...overrides,
    };
    state.currentPlayer = 'player';
    state.units = { u1: unit };
    state.civilizations.player.units = ['u1'];
    return state;
  }

  it('shows exact command range, capacity, charges, and cooldown', () => {
    const state = makeGeneralState({ generalCommandChargesUsed: 1 });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});

    const text = collectAllText(container).join(' ');
    expect(text).toMatch(/2\s*\/\s*3/); // 2 charges remaining of 3
    expect(text).toMatch(/command range/i);
    expect(text).toMatch(/command capacity/i);
  });

  it('renders three ability buttons: Rally, Seize the Moment, Last Stand', () => {
    const state = makeGeneralState();
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});

    const text = collectAllText(container).join(' ');
    expect(text).toMatch(/Rally/);
    expect(text).toMatch(/Seize the Moment/);
    expect(text).toMatch(/Last Stand/);
  });

  it('disables ability buttons when the General is ineligible (e.g. spawn-turn restriction)', () => {
    const state = makeGeneralState({ generalNoCommandThisTurn: true });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});

    const buttons = findButtons(container).filter(b => /Rally|Seize the Moment|Last Stand/.test(b.textContent ?? ''));
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button.disabled).toBe(true);
  });

  it('clicking Rally invokes onOpenRally with the General\'s unit id', () => {
    const state = makeGeneralState();
    const container = new MockElement('div');
    const onOpenRally = vi.fn();

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', { onOpenRally });

    const rallyButton = findButtons(container).find(b => /^Rally/.test(b.textContent ?? ''))!;
    rallyButton.click();
    expect(onOpenRally).toHaveBeenCalledWith('u1');
  });
});

describe('Prepare Strategic Launch action (#545 MR4 §14 stage 1)', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  function makeSubmarineState(strategicArsenal: number) {
    const state = createNewGame(undefined, 'strategic-launch-sub-action', 'small');
    const unit = { ...createUnit('missile_submarine', 'player', { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }), id: 'u1' };
    state.currentPlayer = 'player';
    state.units = { u1: unit };
    state.civilizations.player.units = ['u1'];
    state.civilizations.player.strategicArsenal = strategicArsenal;
    return state;
  }

  it('shows the action for a missile_submarine with arsenal available', () => {
    const onPrepareStrategicLaunch = vi.fn();
    const state = makeSubmarineState(1);
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', { onPrepareStrategicLaunch });

    const launchButton = findButtons(container).find(b => /^Prepare Strategic Launch/.test(b.textContent ?? ''))!;
    expect(launchButton).toBeTruthy();
    expect(launchButton.disabled).toBe(false);
    launchButton.click();
    expect(onPrepareStrategicLaunch).toHaveBeenCalledWith('u1');
  });

  it('is disabled with a visible reason when arsenal is 0', () => {
    const state = makeSubmarineState(0);
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    const launchButton = findButtons(container).find(b => /^Prepare Strategic Launch/.test(b.textContent ?? ''))!;
    expect(launchButton.disabled).toBe(true);
    expect(collectAllText(container).join(' ')).toContain('No warheads in arsenal.');
  });

  it('is absent for a non-launch-platform unit (e.g. a plain warrior)', () => {
    const state = createNewGame(undefined, 'strategic-launch-warrior', 'small');
    const unit = { ...createUnit('warrior', 'player', { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }), id: 'u1' };
    state.currentPlayer = 'player';
    state.units = { u1: unit };
    state.civilizations.player.units = ['u1'];
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    expect(findButtons(container).find(b => /^Prepare Strategic Launch/.test(b.textContent ?? ''))).toBeUndefined();
  });

  it('is absent on an enemy-owned missile_submarine, even in range with arsenal available (hot-seat/ownership regression)', () => {
    const state = makeSubmarineState(1);
    state.units.u1 = { ...state.units.u1, owner: 'rival' };
    state.currentPlayer = 'player'; // the viewing player does NOT own this submarine
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    expect(findButtons(container).find(b => /^Prepare Strategic Launch/.test(b.textContent ?? ''))).toBeUndefined();
  });

  it('is absent when superweapons is off, even with real banked arsenal (#545 MR7)', () => {
    const state = makeSubmarineState(1);
    state.settings.superweapons = 'off';
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    expect(findButtons(container).find(b => /^Prepare Strategic Launch/.test(b.textContent ?? ''))).toBeUndefined();
  });

  it('description drops the launch claim when superweapons is off, but keeps the coastal-city requirement (#545 MR7)', () => {
    const state = makeSubmarineState(0);
    state.settings.superweapons = 'off';
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    const text = collectAllText(container).join(' ');
    expect(text).not.toMatch(/launch|warhead|4 hexes/i);
    expect(text).toContain('coastal city');
  });
});

describe('selected-unit scroll affordance', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('shows a clear cue before details and actions that overflow the capped card', () => {
    const state = createNewGame(undefined, 'selected-unit-scroll-cue', 'small');
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
    container.clientHeight = 100;
    container.scrollHeight = 220;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior', {});

    const cue = findScrollCue(container);
    expect(cue?.textContent).toBe('↓ More details and actions below — scroll');
    expect(cue?.style.display).toBe('block');
  });
});

describe('selected-unit role presentation', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('renders canonical counterplay as expandable icon-and-text details', () => {
    const state = createNewGame(undefined, 'selected-unit-role-presentation', 'small');
    const unit = {
      ...createUnit('pikeman', 'player', { q: 1, r: 1 }, {
        nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1,
      }),
      id: 'pikeman',
    };
    state.currentPlayer = 'player';
    state.units = { pikeman: unit };
    state.civilizations.player.units = ['pikeman'];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'pikeman', {});

    const text = collectAllText(container).join(' ');
    expect(text).toContain('Polearm defender that stops charging mounted attackers.');
    expect(text).toContain('Strong against shock units');
    expect(text).toContain('Vulnerable to ranged units');
    expect(findDetails(container)?.children[0]?.textContent).toBe('Role details');
  });

  it('renders Artillery’s real Rocket Artillery successor', () => {
    const state = createNewGame(undefined, 'selected-unit-terminal-role', 'small');
    const unit = {
      ...createUnit('artillery', 'player', { q: 1, r: 1 }, {
        nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1,
      }),
      id: 'artillery',
    };
    state.currentPlayer = 'player';
    state.units = { artillery: unit };
    state.civilizations.player.units = ['artillery'];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'artillery', {});

    const text = collectAllText(container).join(' ');
    expect(text).toContain('Upgrades to Rocket Artillery');
  });

  it('renders War Elephant public tactical facts for its owner', () => {
    const state = createNewGame(undefined, 'war-elephant-role-presentation', 'small');
    state.civilizations.player.techState.completed = ['tactics'];
    const unit = { ...createUnit('war_elephant' as any, 'player', { q: 1, r: 1 }, state.idCounters), id: 'war-elephant' };
    state.currentPlayer = 'player';
    state.units = { [unit.id]: unit };
    state.civilizations.player.units = [unit.id];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, unit.id, {});

    const text = collectAllText(container).join(' ');
    expect(text).toContain('Reduces non-polearm return damage by 15%');
    expect(text).toContain('Spearman and Pikeman gain +35% against this unit');
  });

  it('renders the World War II fighter interception bonus in its expandable role details', () => {
    const state = createNewGame(undefined, 'wwii-fighter-role-presentation', 'small');
    const unit = { ...createUnit('wwii_fighter' as any, 'player', { q: 1, r: 1 }, state.idCounters), id: 'wwii-fighter' };
    state.currentPlayer = 'player';
    state.units = { [unit.id]: unit };
    state.civilizations.player.units = [unit.id];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, unit.id, {});

    expect(collectAllText(container).join(' ')).toContain('Interception +20% strength');
  });

  it('shows the "tracked" badge for a submarine detected by an adjacent viewer unit', () => {
    const state = createNewGame(undefined, 'submarine-tracked-badge', 'small');
    state.currentPlayer = 'player';
    const sub = { ...createUnit('submarine' as any, 'ai-1', { q: 0, r: 0 }, state.idCounters), id: 'sub' };
    const galley = { ...createUnit('galley' as any, 'player', { q: 1, r: 0 }, state.idCounters), id: 'galley' };
    state.map.tiles[hexKey({ q: 0, r: 0 })].terrain = 'ocean';
    state.map.tiles[hexKey({ q: 1, r: 0 })].terrain = 'ocean';
    state.units = { sub, galley };
    state.civilizations['ai-1'].units = ['sub'];
    state.civilizations.player.units = ['galley'];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, sub.id, {});

    expect(collectAllText(container).join(' ')).toContain('Tracked by your detector');
  });

  it('shows the "spotted momentarily" badge for a fire-revealed submarine with no active detector', () => {
    const state = createNewGame(undefined, 'submarine-spotted-badge', 'small');
    state.currentPlayer = 'player';
    const sub = {
      ...createUnit('submarine' as any, 'ai-1', { q: 0, r: 0 }, state.idCounters),
      id: 'sub',
      revealedThisTurn: true,
    };
    state.map.tiles[hexKey({ q: 0, r: 0 })].terrain = 'ocean';
    state.units = { sub };
    state.civilizations['ai-1'].units = ['sub'];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, sub.id, {});

    expect(collectAllText(container).join(' ')).toContain('Spotted momentarily');
  });

  it('does not show a reveal badge for the viewer\'s own submarine', () => {
    const state = createNewGame(undefined, 'submarine-own-no-badge', 'small');
    state.currentPlayer = 'player';
    const sub = { ...createUnit('submarine' as any, 'player', { q: 0, r: 0 }, state.idCounters), id: 'sub' };
    state.map.tiles[hexKey({ q: 0, r: 0 })].terrain = 'ocean';
    state.units = { sub };
    state.civilizations.player.units = ['sub'];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, sub.id, {});

    const text = collectAllText(container).join(' ');
    expect(text).not.toContain('Tracked by your detector');
    expect(text).not.toContain('Spotted momentarily');
  });

  it('keeps War Elephant tactical facts public without leaking its owner-only Tactics state in hot seat', () => {
    const state = createNewGame(undefined, 'war-elephant-hot-seat-role', 'small');
    state.civilizations['player-2'] = { ...structuredClone(state.civilizations.player), id: 'player-2', isHuman: true };
    state.civilizations.player.techState.completed = ['tactics'];
    const unit = { ...createUnit('war_elephant' as any, 'player', { q: 1, r: 1 }, state.idCounters), id: 'war-elephant' };
    state.currentPlayer = 'player-2';
    state.units = { [unit.id]: unit };
    state.civilizations.player.units = [unit.id];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, unit.id, {});

    const text = collectAllText(container).join(' ');
    expect(text).toContain('Reduces non-polearm return damage by 15%');
    expect(text).not.toContain('Tactics ·');
  });
});

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

  it('renders the zone-of-control warning only when the selected player has a terminal move', () => {
    const state = createNewGame(undefined, 'zoc-panel-warning', 'small');
    const unit = {
      ...createUnit('warrior', 'player', { q: 1, r: 1 }, {
        nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1,
      }),
      id: 'warrior',
    };
    state.currentPlayer = 'player';
    state.units = { warrior: unit };
    state.civilizations.player.units = ['warrior'];
    const warning = new MockElement('div');
    const normal = new MockElement('div');

    renderSelectedUnitInfo(warning as unknown as HTMLElement, state, 'warrior', {}, {
      hasZoneOfControlWarning: true,
    });
    renderSelectedUnitInfo(normal as unknown as HTMLElement, state, 'warrior', {}, {
      hasZoneOfControlWarning: false,
    });

    expect(collectAllText(warning).join(' ')).toContain('Enemy nearby — entering ends movement.');
    expect(findZoneOfControlWarning(warning)?.getAttribute('role')).toBe('status');
    expect(findZoneOfControlWarning(normal)).toBeUndefined();
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

function makeMissionaryState(overrides: {
  chargesRemaining?: number;
  missionaryCooldownUntilTurn?: number;
  cityDiscovered?: boolean;
} = {}): GameState {
  const targetPos: HexCoord = { q: 1, r: 0 };
  return {
    turn: 10,
    era: 3,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {
      'missionary-1': {
        id: 'missionary-1', type: 'missionary', owner: 'player',
        position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100,
        experience: 0, hasMoved: false, hasActed: false, isResting: false,
        chargesRemaining: overrides.chargesRemaining ?? 2,
        missionaryCooldownUntilTurn: overrides.missionaryCooldownUntilTurn,
      },
    },
    cities: {
      'target-city': {
        id: 'target-city', name: 'Target City', owner: 'other', position: targetPos,
        population: 4, food: 0, foodNeeded: 20, buildings: [], productionQueue: [],
        productionProgress: 0, ownedTiles: [targetPos], workedTiles: [], focus: 'balanced',
        maturity: 'outpost', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      },
    },
    civilizations: {
      player: {
        color: '#fff',
        techState: { completed: [] },
        diplomacy: { atWarWith: [] },
        visibility: { tiles: overrides.cityDiscovered !== false ? { [hexKey(targetPos)]: 'visible' } : {} },
      },
    },
    religions: { 'religion-player': { id: 'religion-player', name: 'Test Faith', ownerCivId: 'player', foundedTurn: 1 } },
    cityFaith: {},
  } as unknown as GameState;
}

describe('renderSelectedUnitInfo — missionary Preach button (#592)', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('shows a Preach button with help text for a missionary adjacent to an eligible city, and calls onPreach on click', () => {
    const state = makeMissionaryState();
    const onPreach = vi.fn();
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'missionary-1', { onPreach });

    const button = findButtons(container).find(b => b.textContent === 'Preach');
    expect(button).toBeDefined();
    expect(button!.title).toBeTruthy();
    button!.click();
    expect(onPreach).toHaveBeenCalledWith('missionary-1', 'target-city');
  });

  it('does not show an enabled Preach button when the missionary has 0 charges', () => {
    const state = makeMissionaryState({ chargesRemaining: 0 });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'missionary-1', { onPreach: vi.fn() });

    const button = findButtons(container).find(b => b.textContent === 'Preach');
    expect(button).toBeUndefined();
  });

  it('shows a disabled Preach button on cooldown', () => {
    const state = makeMissionaryState({ missionaryCooldownUntilTurn: 999 });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'missionary-1', { onPreach: vi.fn() });

    const button = findButtons(container).find(b => b.textContent === 'Preach');
    expect(button).toBeDefined();
    expect(button!.disabled).toBe(true);
  });

  it('shows a disabled Preach button when no eligible city is nearby (undiscovered)', () => {
    const state = makeMissionaryState({ cityDiscovered: false });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'missionary-1', { onPreach: vi.fn() });

    const button = findButtons(container).find(b => b.textContent === 'Preach');
    expect(button).toBeDefined();
    expect(button!.disabled).toBe(true);
  });

  it('shows the missionary charge count', () => {
    const state = makeMissionaryState({ chargesRemaining: 1 });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'missionary-1', { onPreach: vi.fn() });
    expect(collectAllText(container)).toContain('Missionary Charges: 1');
  });
});

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

describe('renderSelectedUnitInfo — crisis-force label', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('shows the neutral crisis-force label and dedicated color', () => {
    const state = createNewGame(undefined, 'crisis-force-label', 'small');
    const unit = { ...createUnit('warrior', 'crisis-force', { q: 3, r: 0 }, state.idCounters), id: 'crisis-1' };
    state.units = { 'crisis-1': unit };
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'crisis-1', {});

    expect(collectAllText(container).join(' ')).toContain('Crisis Force');
    expect(container.children[0]?.style.cssText).toContain('#b84a3a');
  });

  it('shows a committed herd path only to its visible target', () => {
    let state = createNewGame(undefined, 'crisis-force-route-label', 'small');
    const unit = { ...createUnit('warrior', 'crisis-force', { q: 3, r: 0 }, state.idCounters), id: 'crisis-1' };
    state.units = { 'crisis-1': unit };
    state.civilizations.player.visibility.tiles['3,0'] = 'visible';
    state.civilizations.player.visibility.tiles['4,0'] = 'visible';
    state = registerCrisisForce(state, {
      id: 'stampede', targetCivId: 'player', severity: 'standard', createdTurn: state.turn, unitIds: ['crisis-1'],
      herdRoutes: { 'crisis-1': { unitId: 'crisis-1', committedTurn: state.turn, steps: [{ q: 4, r: 0 }] } },
    });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'crisis-1', {});

    expect(collectAllText(container).join(' ')).toContain('Herd path: next 1 step.');
  });

  it('shows the Handler command only for a visible active Rogue Elephant', () => {
    let state = createNewGame(undefined, 'rogue-command-label', 'small');
    const handler = { ...createUnit('rogue_handler', 'crisis-force', { q: 3, r: 0 }, state.idCounters), id: 'handler-1' };
    const elephant = { ...createUnit('rogue_elephant', 'crisis-force', { q: 4, r: 0 }, state.idCounters), id: 'elephant-1' };
    state.units = { [handler.id]: handler, [elephant.id]: elephant };
    state.civilizations.player.visibility.tiles['4,0'] = 'visible';
    state = registerCrisisForce(state, {
      id: 'rogue-host', targetCivId: 'player', severity: 'standard', createdTurn: state.turn, unitIds: [handler.id, elephant.id],
    });
    state.rogueElephantHosts = { player: { targetCivId: 'player', forceId: 'rogue-host', phase: 'active' } };
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, elephant.id, {});

    expect(collectAllText(container).join(' ')).toContain('Handler command: +20% attack and defense within 2 hexes.');
  });

  it('does not leak a Host command after a hot-seat handoff to an unseen viewer', () => {
    let state = createNewGame(undefined, 'rogue-command-handoff', 'small');
    state.civilizations['player-2'] = { ...state.civilizations.player, id: 'player-2', visibility: { tiles: {} } };
    const handler = { ...createUnit('rogue_handler', 'crisis-force', { q: 3, r: 0 }, state.idCounters), id: 'handler-1' };
    const elephant = { ...createUnit('rogue_elephant', 'crisis-force', { q: 4, r: 0 }, state.idCounters), id: 'elephant-1' };
    state.units = { [handler.id]: handler, [elephant.id]: elephant };
    state.civilizations.player.visibility.tiles['4,0'] = 'visible';
    state = registerCrisisForce(state, { id: 'rogue-host', targetCivId: 'player', severity: 'standard', createdTurn: state.turn, unitIds: [handler.id, elephant.id] });
    state.rogueElephantHosts = { player: { targetCivId: 'player', forceId: 'rogue-host', phase: 'active' } };
    state.currentPlayer = 'player-2';
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, elephant.id, {});

    expect(collectAllText(container).join(' ')).not.toContain('Handler command');
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

  it('surfaces the plain-language Fort action once Fortresses is researched', () => {
    const state = makeWorkerState({ terrain: 'plains' });
    state.civilizations.player.techState.completed = ['fortresses'];
    state.cities = {
      capital: { id: 'capital', owner: 'player', position: { q: 0, r: 1 } },
    } as unknown as GameState['cities'];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    expect(findButtons(container).map(button => button.textContent))
      .toContain('Build Fort — protect a friendly land unit (5 turns, +10%; Citadel +20%)');
  });

  it('explains why a researched Fort is unavailable beside another Fort', () => {
    const state = makeWorkerState({ terrain: 'plains' });
    state.civilizations.player.techState.completed = ['fortresses'];
    state.cities = {
      capital: { id: 'capital', owner: 'player', position: { q: 0, r: 1 } },
    } as unknown as GameState['cities'];
    state.map.tiles['1,0'] = {
      ...state.map.tiles['0,0'], coord: { q: 1, r: 0 }, improvement: 'fort', improvementOwner: 'player',
    };
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const blockedFort = findButtons(container).find(button => button.textContent === 'Build Fort — adjacent Fort');
    expect(blockedFort?.disabled).toBe(true);
  });

  it('shows the exact empire Fort cap when a Worker cannot build another Fort', () => {
    const state = makeWorkerState({ terrain: 'plains' });
    state.civilizations.player.techState.completed = ['fortresses'];
    state.cities = {
      capital: { id: 'capital', owner: 'player', position: { q: 0, r: 1 } },
    } as unknown as GameState['cities'];
    state.map.tiles['3,0'] = {
      ...state.map.tiles['0,0'], coord: { q: 3, r: 0 }, improvement: 'fort', improvementOwner: 'player',
    };
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const blockedFort = findButtons(container).find(button => button.textContent === 'Build Fort — Fort limit reached');
    expect(blockedFort?.title).toBe('Forts: 1/1. Build another city to raise the Fort limit.');
  });

  it('does not recommend frontier placement after the absolute Fort cap is full', () => {
    const state = makeWorkerState({ terrain: 'plains' });
    state.civilizations.player.techState.completed = ['fortresses'];
    state.cities = Object.fromEntries([0, 1, 2].map(index => [`city-${index}`, {
      id: `city-${index}`, owner: 'player', position: { q: index * 10, r: 1 },
    }])) as unknown as GameState['cities'];
    for (let index = 0; index < 4; index++) {
      state.map.tiles[`${10 + index},0`] = {
        ...state.map.tiles['0,0'], coord: { q: 10 + index, r: 0 }, improvement: 'fort', improvementOwner: 'player',
      };
    }
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    const blockedFort = findButtons(container).find(button => button.textContent === 'Build Fort — Fort limit reached');
    expect(blockedFort?.title).toBe('Forts: 4/4. Build another city to raise the Fort limit.');
  });

  it('shows a Fort build progress status after the Worker has spent its action', () => {
    const state = makeWorkerState({ terrain: 'plains', improvement: 'fort', improvementTurnsLeft: 3, improvementOwner: 'player' }, { hasActed: true, movementPointsLeft: 0 });
    state.civilizations.player.techState.completed = ['fortresses'];
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'worker-1', {
      onWorkerAction: () => {},
    });

    expect(collectAllText(container).join(' ')).toContain('Building Fort — 3 turns remaining.');
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

  it('hides worker actions after the worker has spent all movement', () => {
    const state = makeWorkerState({ terrain: 'forest' }, { movementPointsLeft: 0, hasMoved: true });
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

describe('renderSelectedUnitInfo - based aircraft', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('shows the current base and lets an eligible fighter enter intercept stance', () => {
    const state = createNewGame(undefined, 'aircraft-panel', 'small');
    const city = {
      id: 'airfield', name: 'Avalon', owner: 'player', position: { q: 3, r: 3 }, population: 2,
      food: 0, foodNeeded: 10, buildings: ['airfield'], productionQueue: [], productionProgress: 0,
      ownedTiles: [], workedTiles: [], focus: 'balanced' as const, maturity: 'village' as const,
      unrestLevel: 0 as const, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
    };
    const fighter = { ...createUnit('biplane', 'player', city.position, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }), id: 'fighter', airBase: { kind: 'city' as const, cityId: city.id } };
    state.units = { fighter };
    state.cities = { [city.id]: city };
    state.civilizations.player.units = ['fighter'];
    state.civilizations.player.cities = [city.id];
    const container = new MockElement('div');
    const onIntercept = vi.fn();

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'fighter', { onStartIntercept: onIntercept });

    expect(collectAllText(container).join(' ')).toContain('Base: Avalon Airfield · Slots: 1/3 · Range: 3/6');
    const button = findButtons(container).find(candidate => candidate.textContent === 'Intercept');
    expect(button).toBeDefined();
    button!.click();
    expect(onIntercept).toHaveBeenCalledWith('fighter');
  });

  it('renders each legal rebase destination as a direct action', () => {
    const state = createNewGame(undefined, 'aircraft-rebase-panel', 'small');
    const fighter = { ...createUnit('biplane', 'player', { q: 3, r: 3 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }), id: 'fighter', airBase: { kind: 'city' as const, cityId: 'origin' } };
    state.units = { fighter };
    const container = new MockElement('div');
    const onRebase = vi.fn();

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'fighter', {
      getAirRebaseDestinations: () => [{ base: { kind: 'city', cityId: 'reserve' }, label: 'Reserve (0/3)' }],
      onRebaseAircraft: onRebase,
    });

    const button = findButtons(container).find(candidate => candidate.textContent === 'Rebase: Reserve (0/3)');
    expect(button).toBeDefined();
    button!.click();
    expect(onRebase).toHaveBeenCalledWith('fighter', { kind: 'city', cityId: 'reserve' });
  });

  it('renders the catalog mission action and reports its requested mission', () => {
    const state = createNewGame(undefined, 'aircraft-strike-panel', 'small');
    const bomber = { ...createUnit('bomber', 'player', { q: 3, r: 3 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }), id: 'bomber', airBase: { kind: 'city' as const, cityId: 'origin' } };
    state.units = { bomber };
    const container = new MockElement('div');
    const onMission = vi.fn();

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'bomber', { onStartAirMission: onMission });

    const button = findButtons(container).find(candidate => candidate.textContent === 'Air Strike');
    expect(button).toBeDefined();
    button!.click();
    expect(onMission).toHaveBeenCalledWith('bomber', 'strike');
  });

  it('replaces mission actions with a visible cancel action while a mission is pending', () => {
    const state = createNewGame(undefined, 'aircraft-cancel-panel', 'small');
    const bomber = { ...createUnit('bomber', 'player', { q: 3, r: 3 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }), id: 'bomber', airBase: { kind: 'city' as const, cityId: 'origin' } };
    state.units = { bomber };
    const container = new MockElement('div');
    const onCancel = vi.fn();

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'bomber', { onStartAirMission: vi.fn(), onCancelAirMission: onCancel }, { airMissionPending: 'strike' });

    expect(findButtons(container).map(button => button.textContent)).toContain('Cancel Air Strike');
    expect(findButtons(container).map(button => button.textContent)).not.toContain('Air Strike');
    findButtons(container).find(button => button.textContent === 'Cancel Air Strike')!.click();
    expect(onCancel).toHaveBeenCalledWith('bomber');
  });
});

describe('renderSelectedUnitInfo — Patrol button (#582)', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('shows a Patrol button for a based maritime patrol aircraft and calls onStartAirMission with "patrol"', () => {
    const state = createNewGame(undefined, 'patrol-button-panel', 'small');
    const patrol = { ...createUnit('maritime_patrol_aircraft', 'player', { q: 3, r: 3 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }), id: 'patrol', airBase: { kind: 'city' as const, cityId: 'origin' } };
    state.units = { patrol };
    const container = new MockElement('div');
    const onMission = vi.fn();

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'patrol', { onStartAirMission: onMission });

    const button = findButtons(container).find(candidate => candidate.textContent === 'Patrol');
    expect(button).toBeDefined();
    button!.click();
    expect(onMission).toHaveBeenCalledWith('patrol', 'patrol');
  });

  it('does not show a Patrol button for a unit with no patrol capability', () => {
    const state = createNewGame(undefined, 'no-patrol-button-panel', 'small');
    const bomber = { ...createUnit('bomber', 'player', { q: 3, r: 3 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }), id: 'bomber', airBase: { kind: 'city' as const, cityId: 'origin' } };
    state.units = { bomber };
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'bomber', { onStartAirMission: vi.fn() });

    expect(findButtons(container).some(candidate => candidate.textContent === 'Patrol')).toBe(false);
  });

  it('shows a Cancel Patrol button instead of Patrol while a patrol is pending, and calls onCancelAirMission on click', () => {
    const state = createNewGame(undefined, 'cancel-patrol-panel', 'small');
    const patrol = { ...createUnit('maritime_patrol_aircraft', 'player', { q: 3, r: 3 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }), id: 'patrol', airBase: { kind: 'city' as const, cityId: 'origin' } };
    state.units = { patrol };
    const container = new MockElement('div');
    const onCancel = vi.fn();

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'patrol', { onStartAirMission: vi.fn(), onCancelAirMission: onCancel }, { airMissionPending: 'patrol' });

    expect(findButtons(container).map(button => button.textContent)).toContain('Cancel Patrol');
    expect(findButtons(container).map(button => button.textContent)).not.toContain('Patrol');
    findButtons(container).find(button => button.textContent === 'Cancel Patrol')!.click();
    expect(onCancel).toHaveBeenCalledWith('patrol');
  });
});

describe('renderSelectedUnitInfo — air wing roster (#582)', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('shows "Air Wing N/capacity" and each based aircraft\'s name and Ready/Used status for a selected Carrier', () => {
    const state = createNewGame(undefined, 'air-wing-roster-panel', 'small');
    const idCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const carrier = { ...createUnit('carrier', 'player', { q: 3, r: 3 }, idCounters), id: 'carrier' };
    const fighter = { ...createUnit('jet_fighter', 'player', { q: 3, r: 3 }, idCounters), id: 'fighter', airBase: { kind: 'carrier' as const, unitId: 'carrier' }, hasActed: false };
    const strike = { ...createUnit('naval_strike_aircraft', 'player', { q: 3, r: 3 }, idCounters), id: 'strike', airBase: { kind: 'carrier' as const, unitId: 'carrier' }, hasActed: true };
    state.units = { carrier, fighter, strike };
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'carrier', {});

    const text = collectAllText(container).join(' ');
    expect(text).toContain('Air Wing: 2/2 slots');
    expect(text).toContain('Jet Fighter — Ready');
    expect(text).toContain('Naval Strike Aircraft — Used');
  });

  it('shows an empty-slot line for each unused deck slot', () => {
    const state = createNewGame(undefined, 'air-wing-empty-panel', 'small');
    const idCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const carrier = { ...createUnit('carrier', 'player', { q: 3, r: 3 }, idCounters), id: 'carrier' };
    state.units = { carrier };
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'carrier', {});

    const text = collectAllText(container).join(' ');
    expect(text).toContain('Air Wing: 0/2 slots');
    expect((text.match(/Empty slot/g) ?? []).length).toBe(2);
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

  it('renders and invokes Auto-explore for an idle owned unit', () => {
    const state = makeScoutState();
    const container = new MockElement('div');
    let startedUnitId: string | null = null;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'scout-1', {
      onStartAutoExplore: unitId => { startedUnitId = unitId; },
    });

    const start = findButtons(container).find(button => button.textContent === 'Auto-explore');
    expect(start).toBeDefined();
    start!.click();
    expect(startedUnitId).toBe('scout-1');
  });

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

  it('renders separate Fort improvement and Fortify stance defense layers for its owner', () => {
    const state = makeWarriorState({ isFortified: true });
    state.map.tiles['0,0'] = {
      coord: { q: 0, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: null,
      improvement: 'fort', improvementOwner: 'player', improvementTurnsLeft: 0,
      owner: 'player', hasRiver: false, wonder: null,
    } as any;
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onFortify: () => {},
    });

    const text = collectAllText(container).join(' ');
    expect(text).toContain('Fort improvement: +10% defense');
    expect(text).toContain('Fortify stance: +25% defense');
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

describe('renderSelectedUnitInfo - pillage button', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  function makePillageableState(unitOverrides: Record<string, unknown> = {}, tileOverrides: Record<string, unknown> = {}): GameState {
    return {
      turn: 1, era: 1, currentPlayer: 'player', gameOver: false, winner: null,
      map: {
        width: 10, height: 10, wrapsHorizontally: false, rivers: [],
        tiles: {
          '0,0': {
            coord: { q: 0, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: null,
            improvement: 'farm', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null, hasRoad: false,
            ...tileOverrides,
          },
        },
      },
      units: {
        'warrior-1': { id: 'warrior-1', type: 'warrior', owner: 'player', position: { q: 0, r: 0 }, health: 100, experience: 0, movementPointsLeft: 2, hasMoved: false, hasActed: false, isResting: false, ...unitOverrides },
      },
      cities: {},
      civilizations: { player: { color: '#fff', techState: { completed: [] } }, 'ai-1': { color: '#d94a4a', techState: { completed: [] } } },
    } as unknown as GameState;
  }

  it('shows a Pillage button for a combat unit standing on a pillageable enemy tile', () => {
    const state = makePillageableState();
    const container = new MockElement('div');
    let pillagedId: string | null = null;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onPillage: (uid) => { pillagedId = uid; },
    });

    const btns = findButtons(container).map(b => b.textContent);
    expect(btns).toContain('Pillage');
    findButtons(container).find(b => b.textContent === 'Pillage')?.click();
    expect(pillagedId).toBe('warrior-1');
  });

  it("hides the Pillage button when the tile is the unit's own territory", () => {
    const state = makePillageableState({}, { owner: 'player' });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onPillage: () => {},
    });

    const btns = findButtons(container).map(b => b.textContent);
    expect(btns).not.toContain('Pillage');
  });

  it('hides the Pillage button when the tile has no finished improvement or road', () => {
    const state = makePillageableState({}, { improvement: 'none', improvementTurnsLeft: 0, hasRoad: false });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onPillage: () => {},
    });

    const btns = findButtons(container).map(b => b.textContent);
    expect(btns).not.toContain('Pillage');
  });

  it('hides the Pillage button when the unit has already acted this turn', () => {
    const state = makePillageableState({ hasActed: true });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onPillage: () => {},
    });

    const btns = findButtons(container).map(b => b.textContent);
    expect(btns).not.toContain('Pillage');
  });

  it('hides the Pillage button for a non-combat unit (settler)', () => {
    const state = makePillageableState({ type: 'settler' });
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'warrior-1', {
      onPillage: () => {},
    });

    const btns = findButtons(container).map(b => b.textContent);
    expect(btns).not.toContain('Pillage');
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

  it('requires confirmation before invoking a legal upgrade callback', () => {
    const state = makeJetFighterState(['stealth_airbase']);
    const container = new MockElement('div');
    let calls = 0;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'bomber-1', {
      onUpgradeUnit: () => { calls++; },
    });

    findButtons(container).find(button => button.textContent?.startsWith('Upgrade'))!.click();
    expect(calls).toBe(0);
    expect(collectAllText(container).join(' ')).toContain('Keeps 100 HP and 0 XP');
    findButtons(container).find(button => button.textContent === 'Confirm upgrade')!.click();
    expect(calls).toBe(1);
  });

  it('does not expose an upgrade action for another hot-seat player', () => {
    const state = makeJetFighterState(['stealth_airbase']);
    state.currentPlayer = 'other-player';
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'bomber-1', {
      onUpgradeUnit: () => { throw new Error('must not be callable'); },
    });

    expect(findButtons(container).some(button => button.textContent?.startsWith('Upgrade'))).toBe(false);
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

  it('gives an activated Drone Controller a formation-planning launcher', () => {
    const state = createNewGame(undefined, 'controller-intent-launcher', 'small');
    state.currentPlayer = 'player';
    state.units = {
      controller: { ...createUnit('drone_controller', 'player', { q: 1, r: 1 }, state.idCounters), id: 'controller' },
    };
    state.civilizations.player.units = ['controller'];
    state.civilizations.player.techState.completed = ['quantum-computing'];
    const onOpenNetworkIntent = vi.fn();
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'controller', { onOpenNetworkIntent });

    const launcher = findButtons(container).find(button => button.textContent === 'Coordinate Formation');
    expect(launcher).toBeDefined();
    launcher?.click();
    expect(onOpenNetworkIntent).toHaveBeenCalledWith('controller');
  });

  it('shows an actionable Rally button for a nearby friendly city under civic pressure', () => {
    const state = createNewGame(undefined, 'propagandist-rally-launcher', 'small');
    state.currentPlayer = 'player';
    state.units = {
      propagandist: { ...createUnit('propagandist', 'player', { q: 1, r: 1 }, state.idCounters), id: 'propagandist' },
    };
    state.cities = {
      own: {
        id: 'own', name: 'Own', owner: 'player', position: { q: 1, r: 1 }, population: 2, food: 0, foodNeeded: 10,
        buildings: [], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 10, idleProduction: null,
      },
    };
    state.civilizations.player.units = ['propagandist'];
    state.civilizations.player.cities = ['own'];
    const onUsePropagandistAction = vi.fn();
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'propagandist', { onUsePropagandistAction });

    const rally = findButtons(container).find(button => button.textContent === 'Rally Own');
    expect(rally).toBeDefined();
    rally?.click();
    expect(onUsePropagandistAction).toHaveBeenCalledWith('propagandist', 'rally', 'own');
  });
});

function makeParatrooperState(overrides: { hasActed?: boolean } = {}): GameState {
  return {
    turn: 20,
    era: 9,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {
      'para-1': {
        id: 'para-1', type: 'paratrooper', owner: 'player',
        position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100,
        experience: 0, hasMoved: false, hasActed: overrides.hasActed ?? false, isResting: false,
      },
    },
    cities: {
      'city-1': { id: 'city-1', owner: 'player', position: { q: 0, r: 0 }, buildings: ['airfield'] },
    },
    civilizations: {
      player: {
        color: '#fff',
        techState: { completed: [] },
        diplomacy: { atWarWith: [] },
        visibility: { tiles: {} },
      },
    },
  } as unknown as GameState;
}

describe('renderSelectedUnitInfo — Paradrop button (#543)', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('shows a Paradrop button for an eligible paratrooper and calls onStartParadrop on click', () => {
    const state = makeParatrooperState();
    const onStartParadrop = vi.fn();
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'para-1', { onStartParadrop });

    const button = findButtons(container).find(b => b.textContent === 'Paradrop');
    expect(button).toBeDefined();
    button!.click();
    expect(onStartParadrop).toHaveBeenCalledWith('para-1');
  });

  it('does not show a Paradrop button for a unit with no paradrop capability', () => {
    const state = makeParatrooperState();
    state.units['para-1']!.type = 'infantry';
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'para-1', { onStartParadrop: vi.fn() });

    const button = findButtons(container).find(b => b.textContent === 'Paradrop');
    expect(button).toBeUndefined();
  });

  it('shows a disabled Paradrop button with a reason when the unit is not standing on a friendly airfield city', () => {
    const state = makeParatrooperState();
    state.units['para-1']!.position = { q: 9, r: 9 }; // no city there
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'para-1', { onStartParadrop: vi.fn() });

    const button = findButtons(container).find(b => b.textContent === 'Paradrop');
    expect(button).toBeDefined();
    expect(button!.disabled).toBe(true);
    expect(button!.title).toBeTruthy();
  });

  it('does not show a Paradrop button once the unit has already acted this turn', () => {
    const state = makeParatrooperState({ hasActed: true });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'para-1', { onStartParadrop: vi.fn() });

    const button = findButtons(container).find(b => b.textContent === 'Paradrop');
    expect(button).toBeUndefined();
  });

  it('shows a Cancel Paradrop button instead of Paradrop while a paradrop is pending, and calls onCancelParadrop on click', () => {
    const state = makeParatrooperState();
    const onCancelParadrop = vi.fn();
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'para-1', { onStartParadrop: vi.fn(), onCancelParadrop }, { paradropPending: true });

    expect(findButtons(container).find(b => b.textContent === 'Paradrop')).toBeUndefined();
    const cancel = findButtons(container).find(b => b.textContent === 'Cancel Paradrop');
    expect(cancel).toBeDefined();
    cancel!.click();
    expect(onCancelParadrop).toHaveBeenCalledWith('para-1');
  });
});

function makeAirAssaultInfantryState(overrides: { hasActed?: boolean; helicopterHasActed?: boolean } = {}): GameState {
  return {
    turn: 20,
    era: 11,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {
      'inf-1': {
        id: 'inf-1', type: 'infantry', owner: 'player',
        position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100,
        experience: 0, hasMoved: false, hasActed: overrides.hasActed ?? false, isResting: false,
      },
      'heli-1': {
        id: 'heli-1', type: 'attack_helicopter', owner: 'player',
        position: { q: 0, r: 0 }, movementPointsLeft: 5, health: 100,
        experience: 0, hasMoved: false, hasActed: overrides.helicopterHasActed ?? false, isResting: false,
        airBase: { kind: 'city', cityId: 'city-1' },
      },
    },
    cities: {
      'city-1': { id: 'city-1', owner: 'player', position: { q: 0, r: 0 }, buildings: ['helicopter_base'] },
    },
    civilizations: {
      player: {
        color: '#fff',
        techState: { completed: ['helicopter-warfare'] },
        diplomacy: { atWarWith: [] },
        visibility: { tiles: {} },
      },
    },
  } as unknown as GameState;
}

describe('renderSelectedUnitInfo — Air Assault button (#543 Phase 2)', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('shows an Air Assault button for an eligible infantry unit and calls onStartAirAssault on click', () => {
    const state = makeAirAssaultInfantryState();
    const onStartAirAssault = vi.fn();
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'inf-1', { onStartAirAssault });

    const button = findButtons(container).find(b => b.textContent === 'Air Assault');
    expect(button).toBeDefined();
    button!.click();
    expect(onStartAirAssault).toHaveBeenCalledWith('inf-1');
  });

  it('does not show an Air Assault button for a unit with no airAssaultPassengerEligible flag', () => {
    const state = makeAirAssaultInfantryState();
    state.units['inf-1']!.type = 'tank';
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'inf-1', { onStartAirAssault: vi.fn() });

    const button = findButtons(container).find(b => b.textContent === 'Air Assault');
    expect(button).toBeUndefined();
  });

  it('shows a disabled Air Assault button with a reason when no roster helicopter is available', () => {
    const state = makeAirAssaultInfantryState({ helicopterHasActed: true });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'inf-1', { onStartAirAssault: vi.fn() });

    const button = findButtons(container).find(b => b.textContent === 'Air Assault');
    expect(button).toBeDefined();
    expect(button!.disabled).toBe(true);
    expect(button!.title).toBeTruthy();
  });

  it('does not show an Air Assault button once the unit has already acted this turn', () => {
    const state = makeAirAssaultInfantryState({ hasActed: true });
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'inf-1', { onStartAirAssault: vi.fn() });

    const button = findButtons(container).find(b => b.textContent === 'Air Assault');
    expect(button).toBeUndefined();
  });

  it('shows a Cancel Air Assault button instead of Air Assault while an air assault is pending, and calls onCancelAirAssault on click', () => {
    const state = makeAirAssaultInfantryState();
    const onCancelAirAssault = vi.fn();
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'inf-1', { onStartAirAssault: vi.fn(), onCancelAirAssault }, { airAssaultPending: true });

    expect(findButtons(container).find(b => b.textContent === 'Air Assault')).toBeUndefined();
    const cancel = findButtons(container).find(b => b.textContent === 'Cancel Air Assault');
    expect(cancel).toBeDefined();
    cancel!.click();
    expect(onCancelAirAssault).toHaveBeenCalledWith('inf-1');
  });

  it('does not show an Air Assault button (enabled or disabled) before the owner has researched Helicopter Warfare, even for an otherwise-eligible unit', () => {
    const state = makeAirAssaultInfantryState();
    state.civilizations['player']!.techState.completed = [];
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'inf-1', { onStartAirAssault: vi.fn() });

    expect(findButtons(container).find(b => b.textContent === 'Air Assault')).toBeUndefined();
  });
});
