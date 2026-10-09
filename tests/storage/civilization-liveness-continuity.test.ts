import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';
import { normalizeLoadedState } from '@/storage/save-manager';
import { foundCityInState } from '@/systems/city-founding-system';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { resolveMajorCityCapture, transferCapturedCityOwnership, emitMajorCityCaptureEvents } from '@/systems/city-capture-system';
import { removeUnits } from '@/systems/unit-removal-system';
import { createUnit } from '@/systems/unit-lifecycle';
import { canFoundCityAt } from '@/systems/city-territory-system';
import { reconcileCivilizationLiveness } from '@/systems/civilization-elimination-system';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';
import type { GameState } from '@/core/types';
import { makeSovereigntyFixture, SOVEREIGN_IDS } from '../helpers/sovereignty-fixture';
import { declareMajorWar } from '@/systems/diplomacy-war';
import { commitVassalageAgreement } from '@/systems/diplomacy-vassalage';
import { commitTreatyAgreement, breakTreaty } from '@/systems/diplomacy-treaties';
import { enqueueSettlementOffer, acceptSettlementOffer } from '@/systems/settlement-system';
import { declareWarGoal, getWarGoalStatus } from '@/systems/war-goal-system';
import { getWarsForViewer, findActiveWarBetween } from '@/systems/war-history-system';
import { executeUnitMove, resolveUnitMoveIntent } from '@/systems/unit-movement-system';
import { emitAccessLossNotices } from '@/systems/territorial-access';
import { getCapitalCityId } from '@/systems/capital-system';
import { getActiveHumanPlayers } from '@/core/turn-cycling';
import { serializeSaveFile, parseSaveFile } from '@/storage/save-file-transfer';
import { getWrappedHexNeighbors, hexKey } from '@/systems/hex-utils';
import { TECH_TREE } from '@/systems/tech-definitions';
import { expectViewerSafety, expectHotSeatDifferential } from '../helpers/viewer-safety';
import { loadUnitOntoTransport, unloadUnitFromTransport } from '@/systems/transport-system';

function reloadCampaign(state: GameState): GameState {
  const parsed = parseSaveFile(serializeSaveFile(state));
  if (parsed.status !== 'success') throw new Error(parsed.message);
  return normalizeLoadedState(parsed.state);
}

function checked(state: GameState, label: string): GameState {
  assertSaveStateInvariants(state, label);
  return state;
}

function addResettler(state: GameState, owner: string) {
  const tile = Object.values(state.map.tiles).find(t => canFoundCityAt(state, t.coord)
    && !Object.values(state.units).some(u => hexKey(u.position) === hexKey(t.coord)));
  if (!tile) throw new Error('requires a legal free founding tile');
  const unit = createUnit('settler', owner, tile.coord, state.idCounters);
  state.units[unit.id] = unit;
  state.civilizations[owner].units.push(unit.id);
  return unit.id;
}

/** A small reference model records expected relationships, never computes the
 * production transitions. Ownership/roster/cargo details remain shared invariants. */
function assertModel(state: GameState, living: readonly string[], wars: readonly (readonly string[])[]) {
  const pair = (a: string, b: string) => [a, b].sort().join(':');
  expect(SOVEREIGN_IDS.filter(id => getCivilizationLiveness(state, id).living)).toEqual(living);
  expect(getActiveHumanPlayers(state).map(p => p.slotId)).toEqual(living);
  const actual = new Set<string>();
  for (const id of SOVEREIGN_IDS) for (const enemy of state.civilizations[id].diplomacy.atWarWith) {
    if (state.civilizations[enemy]) actual.add(pair(id, enemy));
  }
  expect([...actual].sort()).toEqual(wars.map(([a, b]) => pair(a, b)).sort());
  checked(state, 'reference relationships');
}

function continuity(checkpoint: GameState, resume: (state: GameState, bus: EventBus) => GameState) {
  checked(checkpoint, 'legal checkpoint');
  const original = structuredClone(checkpoint);
  const reloaded = reloadCampaign(checkpoint);
  // Do not conceal a writer defect by normalizing both branches.
  assertSimulationEquivalent(reloaded, checkpoint, 'checkpoint writer');
  const run = (state: GameState) => {
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('civ:resettled', e => events.push(['resettled', e]));
    bus.on('civ:eliminated', e => events.push(['eliminated', e]));
    bus.on('civ:recovered-from-near-defeat', e => events.push(['recovered', e]));
    bus.on('diplomacy:treaty-accepted', e => events.push(['treaty', e]));
    bus.on('diplomacy:access-lost', e => events.push(['access-lost', e]));
    bus.on('diplomacy:settlement-signed', e => events.push(['settlement', e]));
    bus.on('city:captured', e => events.push(['capture', e]));
    let next = checked(resume(state, bus), 'resumed commands');
    for (let round = 0; round < 2; round++) next = checked(processTurn(next, bus), `continued round ${round}`);
    expect(reconcileCivilizationLiveness(next, next).transitions).toEqual([]);
    return { state: next, events };
  };
  const direct = run(structuredClone(checkpoint));
  const loaded = run(reloaded);
  const repeated = run(structuredClone(checkpoint));
  assertSimulationEquivalent(loaded.state, direct.state, 'campaign continuation');
  assertSimulationEquivalent(repeated.state, direct.state, 'repeated campaign');
  expect(loaded.events).toEqual(direct.events);
  expect(repeated.events).toEqual(direct.events);
  expect(serializeSaveFile(repeated.state)).toBe(serializeSaveFile(direct.state));
  expect(checkpoint).toEqual(original);
  expect(loaded.state.currentPlayer).toBe(direct.state.currentPlayer);
  for (const viewer of SOVEREIGN_IDS) expect(getWarsForViewer(loaded.state, viewer)).toEqual(getWarsForViewer(direct.state, viewer));
  return direct;
}

describe.each(['player-1', 'player-3'] as const)('sovereignty campaign replay for human seat %s', actor => {
  const defender = 'player-2';

  it('A: final-city loss, cityless survival, reload, resettlement and second-city recovery', () => {
    let state = makeSovereigntyFixture();
    state.currentPlayer = actor;
    state = removeUnits(state, state.civilizations[defender].units, { reason: 'destroyed' }).state;
    const settlerId = addResettler(state, defender);
    state = checked(declareMajorWar(state, actor, defender), 'A declaration');
    const lostCapital = state.civilizations[defender].cities[0];
    const checkpoint = checked(resolveMajorCityCapture(state, lostCapital, actor, 'occupy', state.turn).state, 'A capture');
    expect(checkpoint.cities[lostCapital].owner).toBe(actor);
    expect(getCapitalCityId(checkpoint, defender)).toBeNull();
    assertModel(checkpoint, SOVEREIGN_IDS, [[actor, defender]]);
    const third = actor === 'player-1' ? 'player-3' : 'player-1';
    const result = continuity(checkpoint, (s, bus) => {
      let next = checked(foundCityInState(s, settlerId, bus).state, 'A resettle');
      const replacement = getCapitalCityId(next, defender);
      expect(replacement).not.toBeNull();
      expect(next.civilizations[defender].nearDefeat).toBe(true);
      assertModel(next, SOVEREIGN_IDS, [[actor, defender]]);
      next = checked(declareMajorWar(next, defender, third), 'A second war');
      const secondCity = next.civilizations[third].cities[0];
      const capture = resolveMajorCityCapture(next, secondCity, defender, 'occupy', next.turn);
      emitMajorCityCaptureEvents(next, capture, secondCity, defender, third, bus);
      next = checked(capture.state, 'A second city');
      expect(next.civilizations[defender].nearDefeat).toBe(false);
      expect(getCapitalCityId(next, defender)).toBe(replacement);
      assertModel(next, SOVEREIGN_IDS.filter(id => id !== third), [[actor, defender]]);
      return next;
    });
    expect(result.events.filter(e => (e as unknown[])[0] === 'resettled')).toHaveLength(1);
    expect(result.events.filter(e => (e as unknown[])[0] === 'recovered')).toHaveLength(1);
    expect(result.events.filter(e => (e as unknown[])[0] === 'eliminated')).toHaveLength(1);
    expect(findActiveWarBetween(result.state, actor, defender)).toBeDefined();
  });

  it('survives final-city loss aboard a reciprocal transport, then unloads and resettles after reload', () => {
    let state = makeSovereigntyFixture();
    state = removeUnits(state, state.civilizations[defender].units, { reason: 'destroyed' }).state;
    const occupied = new Set(Object.values(state.units).map(u => hexKey(u.position)));
    const shore = Object.values(state.map.tiles).find(t => canFoundCityAt(state, t.coord)
      && !occupied.has(hexKey(t.coord)) && getWrappedHexNeighbors(t.coord, state.map.width).some(c =>
        state.map.tiles[hexKey(c)]?.terrain === 'coast' && !occupied.has(hexKey(c))));
    if (!shore) throw new Error('requires a legal founding shore');
    const water = getWrappedHexNeighbors(shore.coord, state.map.width).find(c =>
      state.map.tiles[hexKey(c)]?.terrain === 'coast' && !occupied.has(hexKey(c)))!;
    const settler = createUnit('settler', defender, shore.coord, state.idCounters);
    const transport = createUnit('transport', defender, water, state.idCounters);
    for (const unit of [settler, transport]) { state.units[unit.id] = unit; state.civilizations[defender].units.push(unit.id); }
    const loaded = loadUnitOntoTransport(state, settler.id, transport.id);
    expect(loaded.ok).toBe(true);
    state = checked(loaded.state, 'transport loaded');
    state = checked(declareMajorWar(state, actor, defender), 'transport war');
    const checkpoint = checked(resolveMajorCityCapture(state, state.civilizations[defender].cities[0], actor, 'occupy', state.turn).state, 'transport final-city loss');
    expect(getCivilizationLiveness(checkpoint, defender)).toEqual({ living: true, reason: 'settler' });
    continuity(checkpoint, (s, bus) => {
      let next = checked(processTurn(s, bus), 'transport action reset');
      const unloaded = unloadUnitFromTransport(next, transport.id, settler.id, shore.coord);
      expect(unloaded.ok).toBe(true);
      next = checked(unloaded.state, 'transport unload');
      next = checked(processTurn(next, bus), 'founding action reset');
      next = checked(foundCityInState(next, settler.id, bus).state, 'transport resettle');
      assertModel(next, SOVEREIGN_IDS, [[actor, defender]]);
      return next;
    });
  });

  it.each(['vassal', 'overlord'] as const)('B: %s elimination clears obligations before reload and further rounds', role => {
    let state = makeSovereigntyFixture();
    state.currentPlayer = 'player-4';
    state.civilizations[defender].techState.completed = TECH_TREE.filter(t => t.era <= 2).map(t => t.id);
    state.civilizations[defender].diplomacy.vassalage.peakCities = 3;
    const bus = new EventBus();
    state = checked(declareMajorWar(state, actor, 'player-4'), 'B declaration');
    state = checked(commitVassalageAgreement(state, defender, actor, bus), 'B vassalage');
    expect(state.civilizations[defender].diplomacy.vassalage.overlord).toBe(actor);
    const dead = role === 'vassal' ? defender : actor;
    state = checked(enqueueSettlementOffer(state, 'player-4', dead, [], bus), 'B pending offer');
    const checkpoint = checked(resolveMajorCityCapture(state, state.civilizations[dead].cities[0], 'player-4', 'raze', state.turn).state, 'B raze');
    const survivor = role === 'vassal' ? actor : defender;
    const living = SOVEREIGN_IDS.filter(id => id !== dead);
    assertModel(checkpoint, living, [[survivor, 'player-4']]);
    expect(checkpoint.pendingDiplomacyRequests).toEqual([]);
    expect(checkpoint.civilizations[defender].diplomacy.vassalage.overlord).toBeNull();
    expect(checkpoint.civilizations[actor].diplomacy.vassalage.vassals).toEqual([]);
    continuity(checkpoint, s => {
      const reconciled = reconcileCivilizationLiveness(s, s);
      expect(reconciled.transitions).toEqual([]);
      assertModel(reconciled.state, living, [[survivor, 'player-4']]);
      return reconciled.state;
    });
  });

  it('C: Open Borders entry, access loss, persisted egress, renewed treaty and continued movement', () => {
    let state = makeSovereigntyFixture();
    state.currentPlayer = actor;
    const occupied = new Set(Object.values(state.units).map(u => hexKey(u.position)));
    const centers = new Set(Object.values(state.cities).map(c => hexKey(c.position)));
    const walkable = (terrain: string) => !['ocean', 'coast', 'mountain'].includes(terrain);
    const inside = Object.values(state.map.tiles).find(t => t.owner === defender && walkable(t.terrain)
      && !occupied.has(hexKey(t.coord)) && !centers.has(hexKey(t.coord))
      && getWrappedHexNeighbors(t.coord, state.map.width).some(c => {
        const n = state.map.tiles[hexKey(c)];
        return n && walkable(n.terrain) && (!n.owner || n.owner === actor)
          && !occupied.has(hexKey(c)) && !centers.has(hexKey(c));
      }));
    if (!inside) throw new Error('requires a free land border');
    const outside = getWrappedHexNeighbors(inside.coord, state.map.width).find(c => {
      const t = state.map.tiles[hexKey(c)];
      return t && walkable(t.terrain) && (!t.owner || t.owner === actor)
        && !occupied.has(hexKey(c)) && !centers.has(hexKey(c));
    })!;
    const army = createUnit('warrior', actor, outside, state.idCounters);
    state.units[army.id] = army;
    state.civilizations[actor].units.push(army.id);
    state.civilizations[actor].visibility.tiles[hexKey(inside.coord)] = 'visible';
    const bus = new EventBus();
    state = checked(commitTreatyAgreement(state, actor, defender, 'open_borders', bus), 'C treaty');
    const entered = executeUnitMove(state, army.id, inside.coord, { actor: 'player', civId: actor, bus });
    expect(entered.ok).toBe(true);
    if (!entered.ok) return;
    const beforeLoss = entered.state;
    state = { ...beforeLoss, civilizations: { ...beforeLoss.civilizations } };
    for (const id of [actor, defender]) state.civilizations[id] = { ...state.civilizations[id],
      diplomacy: breakTreaty(state.civilizations[id].diplomacy, id === actor ? defender : actor, 'open_borders', state.turn) };
    emitAccessLossNotices(beforeLoss, state, bus);
    const checkpoint = checked(state, 'C access loss');
    continuity(checkpoint, (s, events) => {
      const ready = checked(processTurn(s, events), 'C movement reset');
      const exited = executeUnitMove(ready, army.id, outside, { actor: 'player', civId: actor, bus: events });
      expect(exited.ok).toBe(true);
      if (!exited.ok) throw new Error(exited.message);
      let next = checked(exited.state, 'C egress');
      expect(resolveUnitMoveIntent(next, army.id, inside.coord, { actor: 'player', civId: actor }).ok).toBe(false);
      next = checked(commitTreatyAgreement(next, actor, defender, 'open_borders', events), 'C renewed treaty');
      next = checked(processTurn(next, events), 'C refresh movement');
      const returned = executeUnitMove(next, army.id, inside.coord, { actor: 'player', civId: actor, bus: events });
      expect(returned.ok).toBe(true);
      if (!returned.ok) throw new Error(returned.message);
      return checked(returned.state, 'C renewed movement');
    });
  });

  it('D: conquest goal, capital loss, pending settlement, recipient acceptance and stable historical outcome', () => {
    let state = makeSovereigntyFixture();
    state.currentPlayer = actor;
    state = removeUnits(state, state.civilizations[defender].units, { reason: 'destroyed' }).state;
    state = checked(foundCityInState(state, addResettler(state, defender), new EventBus()).state, 'D second city');
    state.civilizations[defender].gold = 100;
    state = checked(declareMajorWar(state, actor, defender), 'D war');
    const capital = state.civilizations[defender].cities[0];
    const remainingCapital = state.civilizations[defender].cities[1];
    state = checked(declareWarGoal(state, actor, defender, 'conquer_city', capital, state.turn), 'D goal');
    state = checked(resolveMajorCityCapture(state, capital, actor, 'occupy', state.turn).state, 'D capture');
    expect(getWarGoalStatus(state, actor, defender)).toBe('satisfied');
    expect(getCapitalCityId(state, defender)).toBe(remainingCapital);
    const warId = findActiveWarBetween(state, actor, defender)!.id;
    state = checked(enqueueSettlementOffer(state, actor, defender, [
      { kind: 'reparations', fromCivId: defender, toCivId: actor, goldAmount: 10 },
    ], new EventBus()), 'D offer');
    const requestId = state.pendingDiplomacyRequests![0].id;
    expect(state.pendingDiplomacyRequests![0].toCivId).toBe(defender);
    const totalGold = state.civilizations[actor].gold + state.civilizations[defender].gold;
    const result = continuity(state, (s, bus) => {
      expect(acceptSettlementOffer(s, actor, requestId, bus)).toBe(s);
      const next = checked(acceptSettlementOffer(s, defender, requestId, bus), 'D settlement');
      expect(next.civilizations[actor].gold + next.civilizations[defender].gold).toBe(totalGold);
      expect(acceptSettlementOffer(next, defender, requestId, bus)).toBe(next);
      expect(next.pendingDiplomacyRequests).toEqual([]);
      assertModel(next, SOVEREIGN_IDS, []);
      return next;
    });
    const record = result.state.wars![warId];
    expect(result.events.filter(e => (e as unknown[])[0] === 'settlement')).toHaveLength(1);
    expect(record.outcome).toBe('settled');
    expect(record.events.filter(e => e.type === 'city-captured')).toHaveLength(1);
    expect(record.events.filter(e => e.type === 'settlement-signed')).toHaveLength(1);
    expect(record.events.filter(e => e.type === 'concluded')).toHaveLength(1);
  });
});

describe('viewer knowledge through the real save pathway', () => {
  it('keeps an unobserved war private to the seat that earned contact, with positive controls', () => {
    let state = makeSovereigntyFixture();
    state.civilizations['player-1'].knownCivilizations = [];
    state.civilizations['player-1'].visibility.tiles = {};
    for (const id of SOVEREIGN_IDS.filter(id => id !== 'player-1')) {
      state.civilizations[id].knownCivilizations = state.civilizations[id].knownCivilizations!.filter(id => id !== 'player-1');
    }
    const surface = { name: 'reloaded war history', project: (s: GameState, viewer: string) => getWarsForViewer(reloadCampaign(s), viewer) };
    const declaration = { label: 'war between two civilizations only seat three has met', apply: (s: GameState) => {
      Object.assign(s, declareMajorWar(s, 'player-2', 'player-4'));
    } };
    expectHotSeatDifferential(surface, { world: state, viewers: ['player-1', 'player-3'], knownOnlyTo: 'player-3', mutation: declaration });
    state = checked(declareMajorWar(state, 'player-2', 'player-4'), 'private war');
    expectViewerSafety(surface, { world: state, viewerId: 'player-1', hidden: [{
      label: 'unmet rival name changes', apply: s => { s.civilizations['player-2'].name = 'Unobserved name'; },
    }], earned: [{
      label: 'viewer establishes contact with a participant', apply: s => { s.civilizations['player-1'].knownCivilizations!.push('player-2'); },
    }] });
    const loaded = reloadCampaign(state);
    expect(loaded.currentPlayer).toBe(state.currentPlayer);
    expect(loaded.civilizations['player-1'].visibility).toEqual(state.civilizations['player-1'].visibility);
    expect(getWarsForViewer(loaded, 'player-1')).toEqual([]);
    expect(getWarsForViewer(loaded, 'player-3')).toHaveLength(1);
  });
});

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
