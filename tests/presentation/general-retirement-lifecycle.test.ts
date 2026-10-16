// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { createCeremonyCoordinator } from '@/app/controllers/ceremony-coordinator';
import { createPanelHost } from '@/app/panel-host';
import { registerGeneralPresentation } from '@/presentation/register-general-presentation';
import { getHallOfFameForViewer } from '@/systems/great-general-hall-of-fame';
import { retireGeneralsAtTurnEnd } from '@/systems/great-general-system';
import type { Unit } from '@/core/types';
import { createGeneralPortrait } from '@/ui/general-portrait';
import { makePresentationContext } from '../helpers/presentation-context';

describe('#889 General retirement lifecycle', () => {
  function retireCaesar() {
    const layer = document.createElement('div');
    document.body.appendChild(layer);
    const host = createPanelHost(layer);
    const coordinator = createCeremonyCoordinator({
      host, reducedMotion: () => false, requestMapHighlight: () => {}, playDiscoveryAudio: () => {},
      openAtlas: () => {}, openCity: () => {}, openJournal: () => {},
    });

    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'lifecycle-889' });
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar', generalCommandChargesUsed: 99,
    } as Unit;
    state.civilizations.player.units = ['gen-1'];
    state.civilizations.player.generalHistory = [{ unitId: 'gen-1', generalDefinitionId: 'gen_caesar', spawnedTurn: 1 }];

    const bus = new EventBus();
    const ctx = makePresentationContext({ state });
    registerGeneralPresentation(bus, { ...ctx, ceremonies: coordinator, session: { ...ctx.session, getState: () => state } });
    const after = retireGeneralsAtTurnEnd(state, state.currentPlayer, bus);
    return { layer, host, ctx, after };
  }

  it('a real retirement through the real bus, registrar and coordinator shows one ceremony and a Hall of Fame entry with the same crest', () => {
    const { layer, ctx, after } = retireCaesar();

    const overlays = layer.querySelectorAll('#general-retirement-ceremony');
    expect(overlays).toHaveLength(1);
    expect(overlays[0]!.querySelector('h2')!.textContent).toBe('Julius Caesar retires');

    const [entry] = getHallOfFameForViewer(after, after.currentPlayer);
    expect(entry!.status).toBe('retired');
    const normalise = (html: string) => html.replace(/general-portrait-clip-\d+/g, 'clip');
    const ceremonyCrest = normalise(overlays[0]!.querySelector('[data-general-portrait]')!.innerHTML);
    expect(normalise(createGeneralPortrait(entry!.presentation!, { size: 88, name: entry!.name }).innerHTML)).toBe(ceremonyCrest);
    expect(ctx.deliver).toHaveBeenCalledTimes(1); // the existing toast, once
  });

  it('dismissing it frees the UI, and the retired General stays in the record across a reload-shaped round trip', () => {
    const { layer, host, after } = retireCaesar();
    expect(host.isInteractionBlocked()).toBe(true);
    (layer.querySelector('button[data-modal-cancel]') as HTMLButtonElement).click();
    expect(host.isInteractionBlocked()).toBe(false);
    expect(layer.querySelector('#general-retirement-ceremony')).toBeNull();

    // Presentation is derived, never stored: a JSON round trip (a save/load) yields the identical Hall of Fame view.
    const reloaded = JSON.parse(JSON.stringify(after)) as typeof after;
    expect(getHallOfFameForViewer(reloaded, reloaded.currentPlayer)).toEqual(getHallOfFameForViewer(after, after.currentPlayer));
  });
});
