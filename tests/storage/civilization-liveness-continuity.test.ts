import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';
import { normalizeLoadedState } from '@/storage/save-manager';
import { foundCityInState } from '@/systems/city-founding-system';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { resolveMajorCityCapture, transferCapturedCityOwnership } from '@/systems/city-capture-system';
import { removeUnits } from '@/systems/unit-removal-system';
import { createUnit } from '@/systems/unit-lifecycle';
import { canFoundCityAt } from '@/systems/city-territory-system';
import { reconcileCivilizationLiveness } from '@/systems/civilization-elimination-system';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';

describe('civilization liveness save continuity', () => {
  it.each(['capture', 'transfer'] as const)('keeps breakaway %s elimination equivalent across reload', entry => {
    let source = createNewGame(undefined, 'breakaway-reconquest-continuity', 'small');
    for (const civId of ['player', 'ai-1']) {
      const settler = Object.values(source.units).find(unit => unit.owner === civId && unit.type === 'settler');
      if (!settler) throw new Error('fixture requires starting settler');
      source = foundCityInState(source, settler.id, new EventBus()).state;
    }
    const cityId = source.civilizations['ai-1'].cities[0];
    source.civilizations['ai-1'].breakaway = {
      originOwnerId: 'player', originCityId: cityId,
      startedTurn: source.turn, establishesOnTurn: source.turn + 50, status: 'secession',
    };
    const checkpoint = normalizeLoadedState(source);
    const resume = (state: typeof source) => {
      const next = entry === 'capture'
        ? resolveMajorCityCapture(state, cityId, 'player', 'occupy', state.turn).state
        : transferCapturedCityOwnership(state, cityId, 'player', state.turn);
      expect(next.civilizations['ai-1'].isEliminated).toBe(true);
      expect(reconcileCivilizationLiveness(next, next).transitions).toEqual([]);
      assertSaveStateInvariants(next, `breakaway ${entry} checkpoint`);
      // The writer's result itself must survive normalization, before any subsequent round.
      assertSimulationEquivalent(normalizeLoadedState(JSON.parse(JSON.stringify(next))), next, `breakaway ${entry} writer`);
      return processTurn(next, new EventBus());
    };
    const uninterrupted = resume(structuredClone(checkpoint));
    const reloaded = resume(normalizeLoadedState(JSON.parse(JSON.stringify(checkpoint))));
    assertSaveStateInvariants(reloaded, `breakaway ${entry} resumed round`);
    assertSimulationEquivalent(reloaded, uninterrupted, `breakaway ${entry} continuation`);
  });

  it('resettles a reconquered breakaway survivor identically after reload', () => {
    let source = createNewGame(undefined, 'breakaway-resettlement-continuity', 'small');
    for (const civId of ['player', 'ai-1']) {
      const settler = Object.values(source.units).find(unit => unit.owner === civId && unit.type === 'settler');
      if (!settler) throw new Error('fixture requires starting settler');
      source = foundCityInState(source, settler.id, new EventBus()).state;
    }
    const cityId = source.civilizations['ai-1'].cities[0];
    source = removeUnits(source, source.civilizations['ai-1'].units, { reason: 'destroyed' }).state;
    const tile = Object.values(source.map.tiles).find(candidate => canFoundCityAt(source, candidate.coord)
      && !Object.values(source.units).some(unit => unit.position.q === candidate.coord.q && unit.position.r === candidate.coord.r));
    if (!tile) throw new Error('fixture requires a resettlement tile');
    const survivor = createUnit('settler', 'ai-1', tile.coord, source.idCounters);
    source.units[survivor.id] = survivor;
    source.civilizations['ai-1'].units.push(survivor.id);
    source.civilizations['ai-1'].breakaway = {
      originOwnerId: 'player', originCityId: cityId,
      startedTurn: source.turn, establishesOnTurn: source.turn + 50, status: 'secession',
    };
    source = normalizeLoadedState(source);
    const checkpoint = resolveMajorCityCapture(source, cityId, 'player', 'occupy', source.turn).state;
    expect(getCivilizationLiveness(checkpoint, 'ai-1')).toEqual({ living: true, reason: 'settler' });
    assertSaveStateInvariants(checkpoint, 'cityless breakaway checkpoint');
    const resume = (state: typeof source) => {
      const bus = new EventBus();
      const events: string[] = [];
      bus.on('civ:resettled', ({ civId }) => events.push(civId));
      const next = foundCityInState(state, survivor.id, bus).state;
      expect(events).toEqual(['ai-1']);
      expect(getCivilizationLiveness(next, 'ai-1')).toEqual({ living: true, reason: 'city' });
      expect(reconcileCivilizationLiveness(next, next).transitions).toEqual([]);
      assertSaveStateInvariants(next, 'breakaway resettled');
      return next;
    };
    assertSimulationEquivalent(resume(normalizeLoadedState(JSON.parse(JSON.stringify(checkpoint)))), resume(structuredClone(checkpoint)), 'breakaway resettlement');
  });

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
