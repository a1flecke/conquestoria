// @vitest-environment jsdom
/**
 * The homeland panel end to end through a real session and the real executor (#1837, phase C, PR B): opening it,
 * choosing, being told when a choice is refused, and the panel leaving once the choice is over.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '@/core/types';
import { createGameSession } from '@/app/game-session';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { createHomelandPanelController } from '@/app/controllers/homeland-panel-controller';
import { getActiveHomelandChoice } from '@/systems/start-placement-system';

function world(): GameState {
  return createNewGame({
    civType: 'rome', seed: 'panel-1', mapSize: 'large', opponentCount: 3, gameTitle: 't',
    settingsOverrides: { homelandPicker: 'on' },
  });
}

function setup(state: GameState = world()) {
  const session = createGameSession(state);
  const uiLayer = document.createElement('div');
  document.body.appendChild(uiLayer);
  const centerOn = vi.fn();
  const showNotification = vi.fn();
  const controller = createHomelandPanelController({
    session, uiLayer, getElementById: id => document.getElementById(id), renderLoop: { camera: { centerOn } }, showNotification,
  });
  return { session, uiLayer, centerOn, showNotification, controller };
}

const settler = (state: GameState) => Object.values(state.units).find(u => u.owner === state.currentPlayer && u.type === 'settler')!;

describe('homeland panel controller', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('opens for a viewer with a live choice and for nobody else', () => {
    const { controller } = setup();
    expect(controller.openHomelandChoiceIfActive()).toBe(true);
    expect(document.getElementById('homeland-panel')).not.toBeNull();
    document.body.innerHTML = '';
    const plain = setup(createNewGame({ civType: 'rome', seed: 'panel-1', mapSize: 'large', opponentCount: 3, gameTitle: 't' }));
    expect(plain.controller.openHomelandChoiceIfActive()).toBe(false);
    expect(document.getElementById('homeland-panel')).toBeNull();
  });

  it('choosing a homeland moves the settler through the session, recentres the camera and keeps the panel up to date', () => {
    const { controller, session, centerOn } = setup();
    controller.openHomelandChoiceIfActive();
    const target = session.getState().civilizations.player.homelandChoice!.options[1].coord;
    document.querySelector<HTMLButtonElement>('[data-homeland-option="1"] button')!.click();
    expect(settler(session.getState()).position).toEqual(target);
    expect(centerOn).toHaveBeenCalledWith(target);
    expect(getActiveHomelandChoice(session.getState(), 'player')?.selected).toBe(1);
    expect(document.querySelector('[data-homeland-option="1"] button')!.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-homeland-option="0"] button')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('can go back to the first homeland', () => {
    const { controller, session } = setup();
    const first = settler(session.getState()).position;
    controller.openHomelandChoiceIfActive();
    document.querySelector<HTMLButtonElement>('[data-homeland-option="2"] button')!.click();
    document.querySelector<HTMLButtonElement>('[data-homeland-option="0"] button')!.click();
    expect(settler(session.getState()).position).toEqual(first);
  });

  it('tells the player and changes nothing when the choice is refused', () => {
    const { controller, session, showNotification } = setup();
    controller.openHomelandChoiceIfActive();
    const choice = session.getState().civilizations.player.homelandChoice!;
    const rival = Object.values(session.getState().units).find(u => u.owner === 'ai-1')!;
    session.commit({ ...session.getState(), units: { ...session.getState().units, [rival.id]: { ...rival, position: choice.options[1].coord } } });
    const before = settler(session.getState()).position;
    document.querySelector<HTMLButtonElement>('[data-homeland-option="1"] button')!.click();
    expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('Another civilization stands there'), 'warning');
    expect(settler(session.getState()).position).toEqual(before);
  });

  it('offers itself once per seat, so closing it is respected, while an explicit open still works', () => {
    const { controller } = setup();
    expect(controller.offerHomelandChoiceOnce()).toBe(true);
    [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Done'))!.click();
    expect(controller.offerHomelandChoiceOnce()).toBe(false);
    expect(document.getElementById('homeland-panel')).toBeNull();
    expect(controller.openHomelandChoiceIfActive()).toBe(true);
  });

  describe('hot seat privacy', () => {
    function hotSeatWorld(): GameState {
      return createHotSeatGame({
        playerCount: 4, mapSize: 'large', settingsOverrides: { homelandPicker: 'on' },
        players: [
          { name: 'A', slotId: 'player-1', civType: 'rome', isHuman: true },
          { name: 'B', slotId: 'player-2', civType: 'egypt', isHuman: true },
          { name: 'C', slotId: 'ai-1', civType: 'greece', isHuman: false },
          { name: 'D', slotId: 'ai-2', civType: 'china', isHuman: false },
        ],
      }, 'panel-hot', 'hot');
    }
    const shownCoords = () => [...document.querySelectorAll('[data-homeland-option]')].map(card => card.textContent);

    it('shows each seat only its own homelands', () => {
      const { controller, session } = setup(hotSeatWorld());
      const state = session.getState();
      const a = state.civilizations['player-1'].homelandChoice!.options;
      const b = state.civilizations['player-2'].homelandChoice!.options;

      session.commit({ ...state, currentPlayer: 'player-1' });
      controller.openHomelandChoiceIfActive();
      expect(document.querySelectorAll('[data-homeland-option]')).toHaveLength(a.length);
      const seatA = shownCoords();

      // The handoff: seat A's panel goes with the seat, and seat B is offered B's options, never A's.
      session.commit({ ...session.getState(), currentPlayer: 'player-2' });
      expect(document.getElementById('homeland-panel')).toBeNull();
      controller.openHomelandChoiceIfActive();
      expect(document.querySelectorAll('[data-homeland-option]')).toHaveLength(b.length);
      expect(shownCoords()).not.toEqual(seatA);
    });

    it('one seat settling leaves what the other seat knows exactly as it was', () => {
      const { controller, session } = setup(hotSeatWorld());
      const before = structuredClone(session.getState().civilizations['player-2'].visibility);
      session.commit({ ...session.getState(), currentPlayer: 'player-1' });
      controller.openHomelandChoiceIfActive();
      document.querySelector<HTMLButtonElement>('[data-homeland-option="1"] button')!.click();
      expect(session.getState().civilizations['player-2'].visibility).toEqual(before);
    });

    it('never offers a seat that has no choice, such as an AI seat', () => {
      const { controller, session } = setup(hotSeatWorld());
      session.commit({ ...session.getState(), currentPlayer: 'ai-1' });
      expect(controller.openHomelandChoiceIfActive()).toBe(false);
      expect(document.getElementById('homeland-panel')).toBeNull();
    });
  });

  it('removes the panel as soon as the choice is over, and Done closes it for good', () => {
    const { controller, session } = setup();
    controller.openHomelandChoiceIfActive();
    session.commit({ ...session.getState(), turn: 2 });
    expect(document.getElementById('homeland-panel')).toBeNull();

    const again = setup();
    again.controller.openHomelandChoiceIfActive();
    [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Done'))!.click();
    expect(document.getElementById('homeland-panel')).toBeNull();
  });
});
