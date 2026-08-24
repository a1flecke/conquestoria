import { describe, expect, it } from 'vitest';
import { getStampedeProfile, resolveStampedeOutcome } from '@/systems/stampede-system';
import { getRogueElephantHostProfile, getRogueElephantStrength, getRogueHandlerStrength, resolveRogueElephantHostOutcome } from '@/systems/rogue-elephant-host-system';
import { createNewGame } from '@/core/game-state';

const AUDIT_SEEDS = ['elephant-audit-1', 'elephant-audit-2', 'elephant-audit-3'] as const;

describe('elephant crisis audit matrix', () => {
  it.each(AUDIT_SEEDS)('%s keeps difficulty to typed pressure and force-size differences', seed => {
    const state = createNewGame('rome', seed, 'small');

    expect(getStampedeProfile('explorer').herdCount).toBe(2);
    expect(getStampedeProfile('standard').herdCount).toBe(3);
    expect(getStampedeProfile('veteran').herdCount).toBe(4);
    expect(getRogueElephantHostProfile('explorer', true).elephantCount).toBe(1);
    expect(getRogueElephantHostProfile('standard', true).elephantCount).toBe(2);
    expect(getRogueElephantHostProfile('veteran', true).elephantCount).toBe(3);
    expect(getRogueElephantHostProfile('veteran', false).elephantCount).toBe(2);
    expect(getRogueHandlerStrength(4)).toBe(22);
    expect(getRogueElephantStrength(9)).toBe(60);
    expect(state.settings.soundEnabled).toBe(true);
  });

  it('requires every containment condition and grants each terminal reward once', () => {
    const state = createNewGame('rome', 'elephant-audit-containment', 'small');
    const contained = {
      ...state,
      stampedes: { player: { targetCivId: 'player', eligibleTurns: 0, activeTurns: 6, cityDamage: 0, civilianDeaths: 0, pillagedTileKeys: [] } },
    };
    const defeated = resolveStampedeOutcome(contained, 'player', 'defeated');

    expect(defeated.stampedes?.player).toMatchObject({ outcome: 'defeated', rewardGranted: true });
    expect(resolveStampedeOutcome(defeated, 'player', 'defeated')).toEqual(defeated);
  });

  it('keeps Host rewards terminal and never converts them into Stampede rewards', () => {
    const state = createNewGame('rome', 'elephant-audit-host-reward', 'small');
    state.rogueElephantHosts = { player: { targetCivId: 'player', phase: 'dispersing', forceId: 'host' } };
    const resolved = resolveRogueElephantHostOutcome(state, 'player', 'dispersed');

    expect(resolved.rogueElephantHosts?.player).toMatchObject({ phase: 'resolved', outcome: 'dispersed', rewardGranted: true });
    expect(resolved.stampedes?.player).toBeUndefined();
    expect(resolveRogueElephantHostOutcome(resolved, 'player', 'dispersed')).toEqual(resolved);
  });
});
