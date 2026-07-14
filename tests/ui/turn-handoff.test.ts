// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHotSeatGame } from '@/core/game-state';
import {
  acknowledgeTurnHandoffSummary,
  showTurnHandoff,
} from '@/ui/turn-handoff';
import { generateSummary } from '@/core/hotseat-events';
import { createEmptyOpponentAIState } from '@/core/opponent-ai-state';

function makeFixture() {
  const state = createHotSeatGame({
    playerCount: 2,
    mapSize: 'small',
    players: [
      { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
      { name: 'Bob the Very Patient Cartographer', slotId: 'player-2', civType: 'rome', isHuman: true },
    ],
  }, 'handoff-fixture');
  const shell = document.createElement('div');
  shell.id = 'game-shell';
  const layer = document.createElement('div');
  shell.appendChild(layer);
  document.body.appendChild(shell);
  return { state, shell, layer };
}

afterEach(() => document.body.replaceChildren());

describe('turn handoff', () => {
  it('keeps completed-round preparation anonymous until the authoritative recipient is bound', () => {
    const { state, layer } = makeFixture();
    const controller = showTurnHandoff(layer, state, null, null, {
      initiallyReady: false,
      onReady: vi.fn(),
    });

    expect(document.body.textContent).toContain('Preparing next turn…');
    expect(document.body.textContent).not.toContain('Alice');
    expect(document.body.textContent).not.toContain('Bob');

    controller.setRecipient(state, 'player-2', 'Bob');
    expect(document.body.textContent).toContain('Pass to');
    expect(document.body.textContent).toContain('Bob');
    expect(document.querySelector<HTMLButtonElement>('#handoff-confirm')?.disabled).toBe(false);
  });

  it('acknowledges multiple warning rows with one post-handoff cue and does not replay after reload', () => {
    const { state } = makeFixture();
    state.opponentAI = createEmptyOpponentAIState();
    state.opponentAI.pressureByCiv['player-2'] = {
      activeIndependentThreatIds: [],
      recoveryUntilTurn: 0,
      lastResolvedThreatTurn: null,
      lastWarningTurnByKey: {},
      lastStrategicAudioTurn: null,
    };
    state.pendingEvents = {
      'player-2': [
        { type: 'ai:strategic-warning', message: 'Warning one', turn: state.turn },
        { type: 'ai:strategic-warning', message: 'Warning two', turn: state.turn },
      ],
    };
    const summary = generateSummary(state, 'player-2');

    const first = acknowledgeTurnHandoffSummary(state, 'player-2', summary);
    const reloadedSummary = generateSummary(first.state, 'player-2');
    const replay = acknowledgeTurnHandoffSummary(first.state, 'player-2', {
      ...summary,
      events: summary.events,
    });

    expect(first.playStrategicWarningAudio).toBe(true);
    expect(first.state.pendingEvents?.['player-2']).toEqual([]);
    expect(first.state.opponentAI!.pressureByCiv['player-2'].lastStrategicAudioTurn)
      .toBe(summary.turn);
    expect(reloadedSummary.events).toEqual([]);
    expect(replay.playStrategicWarningAudio).toBe(false);
  });

  it('renders viewer warning rows after identity confirmation and passes that exact summary on Start Turn', async () => {
    const { state, layer } = makeFixture();
    const warning = {
      type: 'ai:strategic-warning',
      message: 'A Roman force is gathering near our border.',
      turn: state.turn,
      target: { kind: 'map' as const, coord: { q: 2, r: 3 }, label: 'Border' },
    };
    state.pendingEvents = { 'player-2': [warning] };
    const onReady = vi.fn();
    showTurnHandoff(layer, state, 'player-2', 'Bob', {
      initiallyReady: true,
      onReady,
    });

    expect(document.body.textContent).not.toContain(warning.message);
    document.querySelector<HTMLButtonElement>('#handoff-confirm')!.click();
    expect(document.querySelector('[data-handoff-summary-events]')?.textContent)
      .toContain(warning.message);
    document.querySelector<HTMLButtonElement>('#handoff-start')!.click();

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    const renderedSummary = onReady.mock.calls[0]![0];
    expect(renderedSummary.events).toEqual([warning]);
  });

  it('is opaque and blocked until setReady supplies the completed state', async () => {
    const { state, shell, layer } = makeFixture();
    const onReady = vi.fn();
    const controller = showTurnHandoff(layer, state, 'player-2', 'Bob', {
      initiallyReady: false,
      preparingLabel: 'Preparing next turn…',
      onReady,
    });
    const confirm = document.querySelector<HTMLButtonElement>('#handoff-confirm')!;

    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toBe('Preparing next turn…');
    expect(document.querySelector<HTMLElement>('#turn-handoff')?.style.backgroundColor).toBe('rgb(10, 10, 30)');
    expect(shell.inert).toBe(true);
    expect(shell.getAttribute('aria-hidden')).toBe('true');

    const updated = structuredClone(state);
    updated.turn = 9;
    updated.civilizations['player-2'].gold = 321;
    controller.setReady(updated);
    confirm.click();
    expect(document.body.textContent).toContain('Turn 9');
    expect(document.body.textContent).toContain('321');

    document.querySelector<HTMLButtonElement>('#handoff-start')!.click();
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ turn: 9 })));
    expect(shell.inert).toBe(false);
    expect(shell.hasAttribute('aria-hidden')).toBe(false);
  });

  it('keeps keyboard focus inside the opaque handoff while no action is enabled', () => {
    const { state, layer } = makeFixture();
    showTurnHandoff(layer, state, 'player-2', 'Bob', {
      initiallyReady: false,
      onReady: vi.fn(),
    });
    const title = document.querySelector<HTMLElement>('#turn-handoff-title')!;
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    document.querySelector<HTMLElement>('#turn-handoff')!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    }));

    expect(document.activeElement).toBe(title);
  });

  it('recovers when opening the turn rejects instead of leaving a dead-end button', async () => {
    const { state, layer } = makeFixture();
    const onReady = vi.fn().mockRejectedValueOnce(new Error('temporary failure'));
    showTurnHandoff(layer, state, 'player-2', 'Bob', {
      initiallyReady: true,
      onReady,
    });
    document.querySelector<HTMLButtonElement>('#handoff-confirm')!.click();
    expect(document.querySelector<HTMLElement>('[role="alert"]')?.hidden).toBe(true);
    document.querySelector<HTMLButtonElement>('#handoff-start')!.click();

    await vi.waitFor(() => {
      expect(document.querySelector('[role="alert"]')?.textContent)
        .toContain('Could not open the turn');
    });
    const retry = document.querySelector<HTMLButtonElement>('#handoff-start')!;
    expect(retry.disabled).toBe(false);
    expect(retry.textContent).toBe('Try Again');
    expect(document.querySelector('#turn-handoff')).not.toBeNull();
  });

  it('keeps errors opaque and exposes retry and return controls', () => {
    const { state, layer } = makeFixture();
    const onRetry = vi.fn();
    const onReturnToSaves = vi.fn();
    const controller = showTurnHandoff(layer, state, 'player-2', 'Bob', {
      initiallyReady: false,
      onReady: vi.fn(),
    });

    controller.setError('The round could not be completed.', { onRetry, onReturnToSaves });
    const retry = document.querySelector<HTMLButtonElement>('[data-action="retry-handoff"]')!;
    retry.click();
    retry.click();
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onReturnToSaves).not.toHaveBeenCalled();
    controller.setError('Still unavailable.', { onRetry, onReturnToSaves });
    document.querySelector<HTMLButtonElement>('[data-action="return-to-saves"]')!.click();
    expect(onReturnToSaves).toHaveBeenCalledOnce();
    expect(document.querySelector('#turn-handoff')).toBeNull();
  });

  it('reopening removes the prior controller and restores accessibility after the new handoff', () => {
    const { state, shell, layer } = makeFixture();
    showTurnHandoff(layer, state, 'player-2', 'Bob', {
      initiallyReady: true,
      onReady: vi.fn(),
    });
    const second = showTurnHandoff(layer, state, 'player-1', 'Alice', {
      initiallyReady: true,
      onReady: vi.fn(),
    });

    expect(document.querySelectorAll('#turn-handoff')).toHaveLength(1);
    second.remove();
    expect(shell.inert).toBe(false);
    expect(shell.hasAttribute('aria-hidden')).toBe(false);
  });

  it('uses bounded scrollable layout and touch-sized controls for phone and laptop viewports', () => {
    const { state, layer } = makeFixture();
    showTurnHandoff(layer, state, 'player-2', 'Bob the Very Patient Cartographer', {
      initiallyReady: true,
      onReady: vi.fn(),
    });
    const card = document.querySelector<HTMLElement>('[data-handoff-card]')!;
    const confirm = document.querySelector<HTMLButtonElement>('#handoff-confirm')!;

    expect(card.style.width).toBe('100%');
    expect(card.style.maxWidth).toBe('520px');
    expect(card.style.maxHeight).toBe('min(90dvh, 720px)');
    expect(card.style.overflowY).toBe('auto');
    expect(card.style.overflowX).toBe('hidden');
    expect(confirm.style.minHeight).toBe('44px');
    expect(document.querySelector('#turn-handoff style')?.textContent).toContain('safe-area-inset');
  });
});
