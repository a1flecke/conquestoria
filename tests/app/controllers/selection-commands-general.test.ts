// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { GameState, Unit } from '@/core/types';
import { createGameSession } from '@/app/game-session';
import { createGeneralCommands } from '@/app/controllers/selection-commands-general';
import type { SelectionCommonDeps, SelectionCore } from '@/app/controllers/selection-shared';
import type { GeneralAbilityMoment } from '@/systems/great-general-ability-presentation';

// #889: a player-issued command is announced on the bus once, after the state is committed, and only when it did something.

function unit(id: string, overrides: Partial<Unit> = {}): Unit {
  return {
    id, type: 'warrior', owner: 'player', position: { q: 1, r: 0 }, movementPointsLeft: 1, health: 40,
    experience: 0, hasMoved: false, hasActed: false, isResting: false, ...overrides,
  } as Unit;
}

function makeWorld(withNeighbour: boolean, generalOverrides: Partial<Unit> = {}): GameState {
  const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'cmd-general-1' });
  state.units['gen-1'] = unit('gen-1', { type: 'great_general', position: { q: 0, r: 0 }, health: 100, generalDefinitionId: 'gen_hannibal', ...generalOverrides });
  state.civilizations.player.units = ['gen-1'];
  if (withNeighbour) {
    state.units['u1'] = unit('u1', { landSupply: { state: 'severe', hostileUnsupportedTurns: 6, suppliedTurnsSinceRecovery: 0 } } as Partial<Unit>);
    state.civilizations.player.units.push('u1');
  }
  return state;
}

function setup(state: GameState) {
  const session = createGameSession(state);
  const bus = new EventBus();
  const moments: GeneralAbilityMoment[] = [];
  const publishedBeforeEvent: boolean[] = [];
  let published = false;
  session.subscribe(() => { published = true; });
  bus.on('general:command-used', ({ moment }) => { publishedBeforeEvent.push(published); moments.push(moment); });
  const uiLayer = document.createElement('div');
  document.body.appendChild(uiLayer);
  const selectUnit = vi.fn();
  const deps = {
    session, bus, uiLayer,
    selection: { setPendingIntent: vi.fn() },
    showNotification: vi.fn(),
    advisorSystem: { resetMessage: vi.fn(), check: vi.fn() },
  } as unknown as SelectionCommonDeps;
  const core = { selectUnit, deselectUnit: vi.fn() } as unknown as SelectionCore;
  const commands = createGeneralCommands(deps, core, {} as never);
  return { session, commands, moments, publishedBeforeEvent, selectUnit };
}

const confirm = (panelId: string) => {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(`#${panelId} button`)).find(b => b.textContent === 'Confirm');
  expect(button, `${panelId} Confirm`).toBeTruthy();
  button!.click();
};

describe('general command controller (#889)', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('Rally: confirming commits the state, then announces exactly one moment', () => {
    const { session, commands, moments, publishedBeforeEvent, selectUnit } = setup(makeWorld(true));
    commands.onOpenRally!('gen-1');
    confirm('rally-panel');

    expect(session.getState().units.u1!.rallyProtectedThisRound).toBe(true);
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({ kind: 'rally', civId: 'player', generalUnitId: 'gen-1', affectedCount: 1 });
    expect(publishedBeforeEvent).toEqual([true]); // the effect never precedes the state it describes
    expect(selectUnit).toHaveBeenCalledWith('gen-1');
  });

  it('Rally: cancelling announces nothing and spends nothing', () => {
    const { session, commands, moments } = setup(makeWorld(true));
    commands.onOpenRally!('gen-1');
    Array.from(document.querySelectorAll<HTMLButtonElement>('#rally-panel button')).find(b => b.textContent === 'Cancel')!.click();
    expect(moments).toHaveLength(0);
    expect(session.getState().units['gen-1']!.generalCommandChargesUsed).toBeUndefined();
  });

  it('Rally: a command that has no target changes nothing and is not announced', () => {
    const { session, commands, moments } = setup(makeWorld(false));
    const before = session.getState();
    commands.onOpenRally!('gen-1');
    // Confirm is disabled with no targets; even a forced call to the issue path must not announce.
    document.querySelector<HTMLButtonElement>('#rally-panel button')!.click();
    expect(moments).toHaveLength(0);
    expect(session.getState().units['gen-1']).toEqual(before.units['gen-1']);
  });

  it('Seize the Moment: announces the units that can act again', () => {
    const world = makeWorld(true);
    world.units['u1'] = { ...world.units['u1']!, hasActed: true, landSupply: undefined };
    const { commands, moments } = setup(world);
    commands.onOpenSeize!('gen-1');
    document.querySelector<HTMLInputElement>('#seize-the-moment-panel input[type="checkbox"]')!.click();
    confirm('seize-the-moment-panel');

    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({ kind: 'seize', affectedCount: 1 });
    expect(moments[0]!.summary).toBe('Seize the Moment: 1 unit can act again.');
  });

  it('a final charge is announced as a Final Command', () => {
    const { commands, moments } = setup(makeWorld(true, { generalCommandChargesUsed: 2 }));
    commands.onOpenRally!('gen-1');
    confirm('rally-panel');
    expect(moments[0]!.isFinalCommand).toBe(true);
    expect(moments[0]!.summary).toContain('retires at the end of this turn');
  });
});
