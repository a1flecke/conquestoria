import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';
import { normalizeLoadedState } from '@/storage/save-manager';
import { foundCityInState } from '@/systems/city-founding-system';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';

describe('civilization liveness save continuity', () => {
  it('preserves a cityless settler survivor and its next-turn outcome across load', () => {
    let source = createNewGame(undefined, 'liveness-save-continuity', 'small');
    const playerSettler = Object.values(source.units).find(unit => unit.owner === 'player' && unit.type === 'settler');
    if (!playerSettler) throw new Error('fixture requires the initial player settler');
    source = foundCityInState(source, playerSettler.id, new EventBus()).state;
    const civId = 'ai-1';
    const settler = Object.values(source.units).find(unit => unit.owner === civId && unit.type === 'settler');
    if (!settler) throw new Error('fixture requires an AI settler');

    const before = normalizeLoadedState(structuredClone(source));
    const reloaded = normalizeLoadedState(JSON.parse(JSON.stringify(before)));

    expect(getCivilizationLiveness(reloaded, civId)).toEqual(getCivilizationLiveness(before, civId));
    expect(getCivilizationLiveness(before, civId)).toEqual({ living: true, reason: 'settler' });

    const uninterrupted = processTurn(structuredClone(before), new EventBus());
    const continued = processTurn(reloaded, new EventBus());

    assertSimulationEquivalent(continued, uninterrupted, 'cityless liveness continuation');
    assertSaveStateInvariants(continued, 'cityless liveness continuation');
    expect(getCivilizationLiveness(continued, civId)).toEqual(getCivilizationLiveness(uninterrupted, civId));
  });
});
