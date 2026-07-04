import { describe, it, expect } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { declareWar, makePeace } from '@/systems/diplomacy-system';
import { isMinorCivHostileToOwner } from '@/systems/minor-civ-diplomacy';

describe('minor civ war/peace bilateral updates', () => {
  it('uses bilateral war and active ally wars for minor-civ combat legality', () => {
    const state = createNewGame(undefined, 'mc-hostility-test', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;

    expect(isMinorCivHostileToOwner(state, mcId, 'player')).toBe(false);
    state.minorCivs[mcId].diplomacy = declareWar(
      state.minorCivs[mcId].diplomacy,
      'player',
      state.turn,
    );
    expect(isMinorCivHostileToOwner(state, mcId, 'player')).toBe(true);

    state.minorCivs[mcId].diplomacy = makePeace(
      state.minorCivs[mcId].diplomacy,
      'player',
      state.turn,
    );
    state.minorCivs[mcId].chainStatusByCiv.player = {
      chainId: 'ally-chain',
      status: 'allied',
      statusTurn: state.turn,
      earnedTurn: state.turn,
    };
    state.civilizations.player.diplomacy.atWarWith.push(aiId);
    expect(isMinorCivHostileToOwner(state, mcId, aiId)).toBe(true);
  });

  it('declaring war on MC updates both MC and player diplomacy', () => {
    const state = createNewGame(undefined, 'mc-war-test', 'small');
    const mcEntries = Object.entries(state.minorCivs);
    expect(mcEntries.length).toBeGreaterThan(0);

    const [mcId, mc] = mcEntries[0];
    const playerCiv = state.civilizations.player;

    // Declare war: update both sides
    mc.diplomacy = declareWar(mc.diplomacy, 'player', state.turn);
    playerCiv.diplomacy = declareWar(playerCiv.diplomacy, mcId, state.turn);

    expect(mc.diplomacy.atWarWith).toContain('player');
    expect(playerCiv.diplomacy.atWarWith).toContain(mcId);
  });

  it('making peace with MC updates both MC and player diplomacy', () => {
    const state = createNewGame(undefined, 'mc-peace-test', 'small');
    const mcEntries = Object.entries(state.minorCivs);
    const [mcId, mc] = mcEntries[0];
    const playerCiv = state.civilizations.player;

    // Start at war
    mc.diplomacy = declareWar(mc.diplomacy, 'player', state.turn);
    playerCiv.diplomacy = declareWar(playerCiv.diplomacy, mcId, state.turn);

    // Make peace: update both sides
    mc.diplomacy = makePeace(mc.diplomacy, 'player', state.turn);
    playerCiv.diplomacy = makePeace(playerCiv.diplomacy, mcId, state.turn);

    expect(mc.diplomacy.atWarWith).not.toContain('player');
    expect(playerCiv.diplomacy.atWarWith).not.toContain(mcId);
  });
});
