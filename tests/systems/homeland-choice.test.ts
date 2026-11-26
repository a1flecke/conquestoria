/**
 * Turn-1 homeland choice executor (design 2026-11-25, Phase C, C3): the choice is live only while the civ has no city,
 * it is still turn 1 and its settler and warrior stand on the selected option. Confirming moves both, recomputes what the
 * civ sees, and never touches another seat.
 */
import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { hexKey } from '@/systems/hex-utils';
import { confirmHomeland, getActiveHomelandChoice } from '@/systems/start-placement-system';
import { parseSaveFile, serializeSaveFile } from '@/storage/save-file-transfer';
import { normalizeLoadedState } from '@/storage/save-manager';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';

function solo(seed = 'choice-1'): GameState {
  return createNewGame({
    civType: 'rome', seed, mapSize: 'large', opponentCount: 3, gameTitle: 't',
    settingsOverrides: { homelandPicker: 'on' },
  });
}

function startersOf(state: GameState, civId: string) {
  const units = state.civilizations[civId].units.map(id => state.units[id]);
  return { settler: units.find(u => u.type === 'settler')!, warrior: units.find(u => u.type === 'warrior')! };
}

describe('getActiveHomelandChoice', () => {
  it('is live on turn 1 for a human with options, and absent without them', () => {
    const state = solo();
    expect(getActiveHomelandChoice(state, 'player')?.options.length).toBeGreaterThanOrEqual(2);
    expect(getActiveHomelandChoice(state, 'ai-1')).toBeNull();
    expect(getActiveHomelandChoice(state, 'nobody')).toBeNull();
  });

  it('goes inert after turn 1 or when the settler has walked off the option', () => {
    const state = solo();
    expect(getActiveHomelandChoice({ ...state, turn: 2 }, 'player')).toBeNull();
    const { settler } = startersOf(state, 'player');
    const walked = {
      ...state,
      units: { ...state.units, [settler.id]: { ...settler, position: { q: settler.position.q + 1, r: settler.position.r } } },
    };
    expect(getActiveHomelandChoice(walked, 'player')).toBeNull();
  });
});

describe('confirmHomeland', () => {
  it('moves settler and warrior to the chosen option, records it, and leaves a valid world', () => {
    const state = solo();
    const choice = state.civilizations.player.homelandChoice!;
    const result = confirmHomeland(state, 'player', 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { settler, warrior } = startersOf(result.state, 'player');
    expect(settler.position).toEqual(choice.options[1].coord);
    expect(warrior.position).toEqual(choice.options[1].coord);
    expect(result.state.civilizations.player.homelandChoice?.selected).toBe(1);
    expect(result.state.civilizations.player.visibility.tiles[hexKey(choice.options[1].coord)]).toBe('visible');
    assertSaveStateInvariants(result.state, 'after confirming a homeland');
    // the input is never modified
    expect(startersOf(state, 'player').settler.position).toEqual(choice.options[0].coord);
    expect(state.civilizations.player.homelandChoice?.selected).toBe(0);
  });

  it('can change its mind back, and the choice survives a save and reload', () => {
    const first = confirmHomeland(solo(), 'player', 2);
    if (!first.ok) throw new Error('first confirm failed');
    const parsed = parseSaveFile(serializeSaveFile(first.state));
    if (parsed.status !== 'success') throw new Error('save did not round-trip');
    const reloaded = normalizeLoadedState(parsed.state);
    expect(getActiveHomelandChoice(reloaded, 'player')?.selected).toBe(2);
    expect(confirmHomeland(reloaded, 'player', 0).ok).toBe(true);
  });

  it('refuses with a typed reason and a message, and changes nothing', () => {
    const state = solo();
    expect(confirmHomeland(state, 'player', 9)).toMatchObject({ ok: false, reason: 'bad-index' });
    expect(confirmHomeland(state, 'player', -1)).toMatchObject({ ok: false, reason: 'bad-index' });
    expect(confirmHomeland(state, 'ai-1', 0)).toMatchObject({ ok: false, reason: 'not-active' });
    expect(confirmHomeland({ ...state, turn: 2 }, 'player', 1)).toMatchObject({ ok: false, reason: 'not-active' });
    const denied = confirmHomeland(state, 'player', 9);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.message.length).toBeGreaterThan(0);
  });

  it('refuses an option another civilization\'s unit stands on', () => {
    const state = solo();
    const choice = state.civilizations.player.homelandChoice!;
    const rival = Object.values(state.units).find(u => u.owner === 'ai-1')!;
    const blocked = { ...state, units: { ...state.units, [rival.id]: { ...rival, position: choice.options[1].coord } } };
    expect(confirmHomeland(blocked, 'player', 1)).toMatchObject({ ok: false, reason: 'occupied' });
  });

  it('in hot seat, seat 2 confirming does not touch seat 1', () => {
    const state = createHotSeatGame({
      playerCount: 4, mapSize: 'large', settingsOverrides: { homelandPicker: 'on' },
      players: [
        { name: 'A', slotId: 'player-1', civType: 'rome', isHuman: true },
        { name: 'B', slotId: 'player-2', civType: 'egypt', isHuman: true },
        { name: 'C', slotId: 'ai-1', civType: 'greece', isHuman: false },
        { name: 'D', slotId: 'ai-2', civType: 'china', isHuman: false },
      ],
    }, 'choice-hot', 'hot');
    const before = startersOf(state, 'player-1').settler.position;
    const result = confirmHomeland(state, 'player-2', 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(startersOf(result.state, 'player-1').settler.position).toEqual(before);
    expect(result.state.civilizations['player-1'].homelandChoice?.selected).toBe(0);
    assertSaveStateInvariants(result.state, 'hot seat after seat 2 confirm');
  });
});
