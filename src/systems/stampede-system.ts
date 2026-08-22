import type { GameState, OpponentChallenge, StampedeState, UnitType } from '@/core/types';
import { countActiveCrisesForCiv } from '@/systems/crisis-system';
import { CRISIS_FORCE_OWNER } from '@/core/owner-kind';
import { normalizeCrisisForces, registerCrisisForce } from '@/systems/crisis-force-system';
import { createUnit } from '@/systems/unit-system';
import { hexKey, mapNeighbors } from '@/systems/hex-utils';
import { commitHerdRouteForTurn } from '@/systems/stampede-route-system';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { resolvePressureSeverityForCiv } from '@/core/opponent-challenge';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { getTrainableUnitsForCiv } from '@/systems/city-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { deterministicCombatSeed, resolveCombat } from '@/systems/combat-system';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';
import { isHostileOwnerTo } from '@/systems/owner-hostility';

export interface StampedeProfile {
  cooldownTurns: number;
  initialChancePercent: number;
  growthPercent: number;
  capPercent: number;
  herdCount: number;
}

export interface StampedeStatusPresentation { text: string; }

const STAMPEDE_PROFILES: Record<OpponentChallenge, StampedeProfile> = {
  explorer: { cooldownTurns: 12, initialChancePercent: 3, growthPercent: 1, capPercent: 12, herdCount: 2 },
  standard: { cooldownTurns: 8, initialChancePercent: 4, growthPercent: 2, capPercent: 18, herdCount: 3 },
  veteran: { cooldownTurns: 5, initialChancePercent: 5, growthPercent: 3, capPercent: 25, herdCount: 4 },
};

export function getStampedeProfile(challenge: OpponentChallenge): StampedeProfile {
  return STAMPEDE_PROFILES[challenge];
}

function normalizeStampede(targetCivId: string, value: unknown, state: GameState): StampedeState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !state.civilizations[targetCivId]) return undefined;
  const candidate = value as Partial<StampedeState>;
  if (candidate.targetCivId !== targetCivId) return undefined;
  if (!Number.isInteger(candidate.eligibleTurns) || !Number.isInteger(candidate.activeTurns)
    || !Number.isInteger(candidate.cityDamage) || !Number.isInteger(candidate.civilianDeaths)
    || !Array.isArray(candidate.pillagedTileKeys)) return undefined;
  const eligibleTurns = Number(candidate.eligibleTurns);
  const activeTurns = Number(candidate.activeTurns);
  const cityDamage = Number(candidate.cityDamage);
  const civilianDeaths = Number(candidate.civilianDeaths);
  return {
    targetCivId,
    eligibleTurns: Math.max(0, eligibleTurns),
    activeTurns: Math.max(0, activeTurns),
    cityDamage: Math.max(0, cityDamage),
    civilianDeaths: Math.max(0, civilianDeaths),
    pillagedTileKeys: [...new Set(candidate.pillagedTileKeys.filter((key): key is string => typeof key === 'string'))].sort(),
    ...(Number.isInteger(candidate.pillagesThisTurn) ? { pillagesThisTurn: Math.max(0, Number(candidate.pillagesThisTurn)) } : {}),
    ...(candidate.forceId && state.crisisForces?.[candidate.forceId]?.targetCivId === targetCivId ? { forceId: candidate.forceId } : {}),
    ...(candidate.phase === 'warning' || candidate.phase === 'active' || candidate.phase === 'resolved' ? { phase: candidate.phase } : {}),
    ...(candidate.outcome === 'defeated' || candidate.outcome === 'contained' || candidate.outcome === 'survived' ? { outcome: candidate.outcome } : {}),
    ...(Number.isInteger(candidate.createdTurn) ? { createdTurn: candidate.createdTurn } : {}),
    ...(Number.isInteger(candidate.resolvedTurn) ? { resolvedTurn: candidate.resolvedTurn } : {}),
    ...(Number.isInteger(candidate.lastResolvedTurn) ? { lastResolvedTurn: candidate.lastResolvedTurn } : {}),
    ...(typeof candidate.rewardGranted === 'boolean' ? { rewardGranted: candidate.rewardGranted } : {}),
    ...(candidate.herdingInsight && Number.isInteger(candidate.herdingInsight.expiresTurn)
      ? { herdingInsight: { expiresTurn: candidate.herdingInsight.expiresTurn, ...(typeof candidate.herdingInsight.consumed === 'boolean' ? { consumed: candidate.herdingInsight.consumed } : {}) } }
      : {}),
    ...(typeof candidate.herdingInsightEligibleUnitSeen === 'boolean' ? { herdingInsightEligibleUnitSeen: candidate.herdingInsightEligibleUnitSeen } : {}),
  };
}

export function normalizeStampedes(state: GameState): GameState {
  const stampedes = Object.fromEntries(Object.entries(state.stampedes ?? {}).flatMap(([targetCivId, value]) => {
    const normalized = normalizeStampede(targetCivId, value, state);
    return normalized ? [[targetCivId, normalized]] : [];
  }));
  return { ...state, stampedes };
}

/** Advances only the persisted uncertainty clock; spawning remains a later lifecycle step. */
export function advanceStampedePressure(state: GameState, targetCivId: string): GameState {
  if (!state.civilizations[targetCivId]) return state;
  const hasForcePressure = Object.values(state.crisisForces ?? {}).some(force => force.targetCivId === targetCivId);
  if (countActiveCrisesForCiv(state, targetCivId) > 0 || hasForcePressure) return state;
  const previous = state.stampedes?.[targetCivId];
  const next: StampedeState = previous
    ? { ...previous, eligibleTurns: previous.eligibleTurns + 1 }
    : { targetCivId, eligibleTurns: 1, activeTurns: 0, cityDamage: 0, civilianDeaths: 0, pillagedTileKeys: [] };
  return { ...state, stampedes: { ...(state.stampedes ?? {}), [targetCivId]: next } };
}

function deterministicPercent(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return (hash >>> 0) % 100;
}

/** Schedules independent, target-scoped warnings after the pressure cooldown. */
export function processStampedeScheduling(state: GameState): GameState {
  let next = state;
  for (const civId of Object.keys(state.civilizations).sort()) {
    const civ = next.civilizations[civId];
    if (!civ || civ.isEliminated) continue;
    const era = resolveCivilizationEra(civ.techState.completed);
    const existing = next.stampedes?.[civId];
    if (era < 3 || era > 8 || existing?.phase === 'warning' || existing?.phase === 'active') continue;
    const severity = resolvePressureSeverityForCiv(next, civId);
    const profile = getStampedeProfile(severity);
    if (existing?.lastResolvedTurn !== undefined && next.turn - existing.lastResolvedTurn < profile.cooldownTurns) continue;
    next = advanceStampedePressure(next, civId);
    const eligibleTurns = next.stampedes?.[civId]?.eligibleTurns ?? 0;
    const chance = Math.min(profile.capPercent, profile.initialChancePercent + Math.max(0, eligibleTurns - 1) * profile.growthPercent);
    if (deterministicPercent(`${next.gameId}:${civId}:${next.turn}`) < chance) next = startStampedeWarning(next, civId, severity);
  }
  return next;
}

export function startStampedeWarning(state: GameState, targetCivId: string, severity: OpponentChallenge): GameState {
  const city = Object.values(state.cities).filter(candidate => candidate.owner === targetCivId).sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!city || state.stampedes?.[targetCivId]?.phase === 'warning' || state.stampedes?.[targetCivId]?.phase === 'active') return state;
  const occupied = new Set(Object.values(state.units).filter(unit => !unit.transportId).map(unit => hexKey(unit.position)));
  const positions = mapNeighbors(state.map, city.position)
    .filter(position => state.map.tiles[hexKey(position)]?.terrain === 'plains' || state.map.tiles[hexKey(position)]?.terrain === 'grassland')
    .filter(position => !occupied.has(hexKey(position)))
    .sort((a, b) => hexKey(a).localeCompare(hexKey(b)));
  const profile = getStampedeProfile(severity);
  if (positions.length < profile.herdCount) return state;
  let next = { ...state, units: { ...state.units } };
  const forceId = `stampede-${targetCivId}-${state.turn}`;
  const unitIds = positions.slice(0, profile.herdCount).map(position => {
    const herd = createUnit('beast_stampede_herd', CRISIS_FORCE_OWNER, position, next.idCounters);
    herd.combatStrengthOverride = 28 + 4 * (Math.max(3, resolveCivilizationEra(state.civilizations[targetCivId]!.techState.completed)) - 3);
    next.units[herd.id] = herd;
    return herd.id;
  });
  next = registerCrisisForce(next, { id: forceId, targetCivId, severity, createdTurn: state.turn, unitIds });
  return {
    ...next,
    stampedes: {
      ...(next.stampedes ?? {}),
      [targetCivId]: {
        targetCivId, forceId, phase: 'warning', createdTurn: state.turn,
        eligibleTurns: 0, activeTurns: 0, cityDamage: 0, civilianDeaths: 0, pillagedTileKeys: [],
      },
    },
  };
}

export function resolveStampedeOutcome(
  state: GameState,
  targetCivId: string,
  outcome: 'defeated' | 'contained' | 'survived',
): GameState {
  const stampede = state.stampedes?.[targetCivId];
  const civ = state.civilizations[targetCivId];
  if (!stampede || !civ || stampede.rewardGranted) return state;
  const rewardGranted = outcome !== 'survived';
  const rewardGold = rewardGranted ? Math.min(10 * resolveCivilizationEra(civ.techState.completed), 80) : 0;
  return {
    ...state,
    civilizations: rewardGold > 0 ? { ...state.civilizations, [targetCivId]: { ...civ, gold: civ.gold + rewardGold } } : state.civilizations,
    stampedes: {
      ...state.stampedes,
      [targetCivId]: {
        ...stampede,
        phase: 'resolved', outcome, resolvedTurn: state.turn, lastResolvedTurn: state.turn,
        rewardGranted,
        ...(rewardGranted ? { herdingInsight: { expiresTurn: state.turn + 10 } } : {}),
      },
    },
  };
}

/** A charge is usable before its expiry turn and exactly once. */
export function hasActiveHerdingInsight(state: GameState, targetCivId: string): boolean {
  const insight = state.stampedes?.[targetCivId]?.herdingInsight;
  return Boolean(insight && !insight.consumed && state.turn < insight.expiresTurn);
}

/** Viewer-scoped core facts; never exposes another civilization's Stampede. */
export function getStampedeStatusForViewer(state: GameState, viewerCivId: string): StampedeStatusPresentation | undefined {
  const stampede = state.stampedes?.[viewerCivId];
  if (!stampede) return undefined;
  const chargeTurns = stampede.herdingInsight && !stampede.herdingInsight.consumed
    ? Math.max(0, stampede.herdingInsight.expiresTurn - state.turn)
    : 0;
  const charge = chargeTurns > 0 ? ` Herding Insight: next eligible unit −20% (${chargeTurns} turns).` : '';
  if (stampede.phase === 'warning') return { text: `Stampede warning: Herds are approaching; use screens or defeat them before they damage the countryside.${charge}` };
  if (stampede.phase === 'active') {
    const remaining = Math.max(0, 6 - stampede.activeTurns);
    return { text: `Stampede active: ${remaining} turns remain. Containment: city damage ${stampede.cityDamage}/0, civilian losses ${stampede.civilianDeaths}/0, improvements ${stampede.pillagedTileKeys.length}/2.${charge}` };
  }
  if (stampede.phase === 'resolved') return { text: `Stampede ${stampede.outcome ?? 'resolved'}.${charge}` };
  return undefined;
}

/** Marks the single reward charge spent after its discounted completion. */
export function consumeHerdingInsight(state: GameState, targetCivId: string, unitType: UnitType): GameState {
  if ((unitType !== 'beast_handler' && unitType !== 'war_elephant') || !hasActiveHerdingInsight(state, targetCivId)) return state;
  const stampede = state.stampedes![targetCivId]!;
  return {
    ...state,
    stampedes: {
      ...state.stampedes,
      [targetCivId]: { ...stampede, herdingInsight: { ...stampede.herdingInsight!, consumed: true } },
    },
  };
}

/** Tracks whether the charge was ever actionable, then settles its expiry once. */
export function processHerdingInsight(state: GameState, targetCivId: string): GameState {
  const stampede = state.stampedes?.[targetCivId];
  const civ = state.civilizations[targetCivId];
  const insight = stampede?.herdingInsight;
  if (!stampede || !civ || !insight || insight.consumed) return state;
  if (state.turn < insight.expiresTurn) {
    const eligibleNow = getTrainableUnitsForCiv(civ.techState.completed, civ.civType, getCivAvailableResources(state, targetCivId))
      .some(unit => unit.type === 'beast_handler' || unit.type === 'war_elephant');
    if (!eligibleNow || stampede.herdingInsightEligibleUnitSeen) return state;
    return {
      ...state,
      stampedes: { ...state.stampedes, [targetCivId]: { ...stampede, herdingInsightEligibleUnitSeen: true } },
    };
  }
  const gold = stampede.herdingInsightEligibleUnitSeen ? 0 : 20;
  return {
    ...state,
    civilizations: gold > 0 ? { ...state.civilizations, [targetCivId]: { ...civ, gold: civ.gold + gold } } : state.civilizations,
    stampedes: {
      ...state.stampedes,
      [targetCivId]: { ...stampede, herdingInsight: { ...insight, consumed: true } },
    },
  };
}

/** Crisis pillage is intentionally actor-neutral: it destroys an improvement only. */
export function applyStampedePillage(state: GameState, targetCivId: string, unitId: string): GameState {
  const stampede = state.stampedes?.[targetCivId];
  const unit = state.units[unitId];
  if (!stampede || stampede.phase === 'resolved' || !unit || unit.owner !== CRISIS_FORCE_OWNER || (stampede.pillagesThisTurn ?? 0) >= 2) return state;
  const key = hexKey(unit.position);
  const tile = state.map.tiles[key];
  if (!tile || tile.owner !== targetCivId || tile.improvement === 'none' || tile.improvementTurnsLeft !== 0 || stampede.pillagedTileKeys.includes(key)) return state;
  return {
    ...state,
    map: { ...state.map, tiles: { ...state.map.tiles, [key]: { ...tile, improvement: 'none', improvementTurnsLeft: 0 } } },
    stampedes: {
      ...state.stampedes,
      [targetCivId]: {
        ...stampede,
        pillagedTileKeys: [...stampede.pillagedTileKeys, key],
        pillagesThisTurn: (stampede.pillagesThisTurn ?? 0) + 1,
      },
    },
  };
}

function removeStampedeForce(state: GameState, forceId: string): GameState {
  const crisisForces = { ...state.crisisForces };
  delete crisisForces[forceId];
  return normalizeCrisisForces({ ...state, crisisForces });
}

/** The warning-to-active boundary intentionally consumes no herd movement. */
export function processStampedeTurn(state: GameState, targetCivId: string): GameState {
  const stateWithInsight = processHerdingInsight(state, targetCivId);
  const stampede = stateWithInsight.stampedes?.[targetCivId];
  if (!stampede) return stateWithInsight;
  if (stampede.phase === 'warning') {
    return {
      ...stateWithInsight,
      stampedes: { ...stateWithInsight.stampedes, [targetCivId]: { ...stampede, phase: 'active', activeTurns: 0 } },
    };
  }
  if (stampede.phase !== 'active' || !stampede.forceId) return stateWithInsight;
  let next = structuredClone(stateWithInsight);
  const force = next.crisisForces?.[stampede.forceId];
  if (!force) return next;
  if (!force.unitIds.some(unitId => next.units[unitId])) {
    return removeStampedeForce(resolveStampedeOutcome(next, targetCivId, 'defeated'), force.id);
  }
  next = {
    ...next,
    stampedes: { ...next.stampedes, [targetCivId]: { ...stampede, pillagesThisTurn: 0 } },
  };
  for (const unitId of [...force.unitIds].sort()) {
    next = commitHerdRouteForTurn(next, force.id, unitId);
    for (const step of next.crisisForces?.[force.id]?.herdRoutes?.[unitId]?.steps ?? []) {
      const herd = next.units[unitId];
      const blocker = herd && Object.values(next.units).find(candidate => candidate.id !== unitId
        && !candidate.transportId && hexKey(candidate.position) === hexKey(step));
      if (herd && blocker && isHostileOwnerTo(next, herd.owner, blocker.owner)) {
        const combat = resolveCombat(
          herd,
          blocker,
          next.map,
          deterministicCombatSeed(next.gameId, next.turn, herd.id, blocker.id),
          undefined,
          resolveCivilizationEra(next.civilizations[targetCivId]!.techState.completed),
          next,
        );
        const applied = applyCombatOutcomeToState(next, combat, deterministicCombatSeed(next.gameId, next.turn, herd.id, blocker.id));
        next = applied.state;
        if (applied.defenderDefeated && UNIT_CLASS_BY_TYPE[blocker.type].includes('civilian')) {
          const current = next.stampedes?.[targetCivId];
          if (current) next = {
            ...next,
            stampedes: { ...next.stampedes, [targetCivId]: { ...current, civilianDeaths: current.civilianDeaths + 1 } },
          };
        }
        if (!next.units[unitId] || next.units[blocker.id]) break;
      }
      const moved = executeUnitMove(next, unitId, step, { actor: 'world' });
      if (!moved.ok || moved.stopReason) break;
    }
    next = applyStampedePillage(next, targetCivId, unitId);
  }
  const currentStampede = next.stampedes?.[targetCivId] ?? stampede;
  const activeTurns = currentStampede.activeTurns + 1;
  if (activeTurns < 6) {
    return { ...next, stampedes: { ...next.stampedes, [targetCivId]: { ...currentStampede, activeTurns } } };
  }
  const outcome = currentStampede.cityDamage === 0 && currentStampede.civilianDeaths === 0 && currentStampede.pillagedTileKeys.length <= 2
    ? 'contained'
    : 'survived';
  const withoutHerds = {
    ...next,
    units: Object.fromEntries(Object.entries(next.units).filter(([unitId]) => !force.unitIds.includes(unitId))),
    stampedes: { ...next.stampedes, [targetCivId]: { ...currentStampede, activeTurns } },
  };
  return removeStampedeForce(resolveStampedeOutcome(withoutHerds, targetCivId, outcome), force.id);
}
