import type { Civilization, GameState, GeneralProgressState, PendingGeneralCandidateChoice, Unit } from '@/core/types';
import { GENERAL_DEFINITIONS, type GeneralDefinition } from '@/systems/great-general-definitions';
import { seededLcg, weightedPick } from '@/systems/seeded-lcg';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { createUnit } from '@/systems/unit-system';
import { mapDistance } from '@/systems/hex-utils';
import type { EventBus } from '@/core/event-bus';

/**
 * Threshold formula (contract §13 — "data-driven and not yet locked", this
 * is the initial tuning): base cost 100, +40 per General already earned,
 * with the per-General increment itself shrinking by 5% each time (floored
 * at +15) so escalation visibly softens in the late game without ever fully
 * flattening or resetting. Same formula regardless of difficulty or era —
 * satisfies contract's explicit "same thresholds across difficulty" and "no
 * full reset at era transition."
 */
const BASE_THRESHOLD = 100;
const BASE_INCREMENT = 40;
const INCREMENT_DECAY = 0.95;
const MIN_INCREMENT = 15;

export function getGeneralThreshold(generalsEarned: number): number {
  let threshold = BASE_THRESHOLD;
  let increment = BASE_INCREMENT;
  for (let i = 0; i < generalsEarned; i++) {
    threshold += increment;
    increment = Math.max(MIN_INCREMENT, increment * INCREMENT_DECAY);
  }
  return threshold;
}

export function addGeneralProgress(
  current: GeneralProgressState | undefined,
  points: number,
): GeneralProgressState {
  const base = current ?? { points: 0, generalsEarned: 0 };
  return { ...base, points: base.points + points };
}

export function hasCrossedGeneralThreshold(progress: GeneralProgressState): boolean {
  return progress.points >= getGeneralThreshold(progress.generalsEarned);
}

/**
 * Bounded bonus awards (contract §13). Ordinary combat-XP progress is
 * handled separately in combat-reward-system.ts, scaled off the unit's own
 * veterancy XP gain rather than a flat award here — see
 * GENERAL_PROGRESS_XP_RATIO. Every value here is well under
 * getGeneralThreshold(0), so no single bonus insta-earns a General.
 */
export const GENERAL_PROGRESS_AWARDS = {
  cityCapture: 30,
  successfulDefense: 25,
  strongerForceVictory: 20,
} as const;

/** Fraction of a kill's own veterancy XP award that also becomes General
 * progress — small on purpose so trivial kills barely move the needle. */
export const GENERAL_PROGRESS_XP_RATIO = 0.5;

/** A defeated force counts as "materially stronger" once it exceeds the
 * victor's strength by at least this factor (contract §13). */
export const STRONGER_FORCE_MARGIN = 1.25;

export function awardGeneralProgress(
  civ: Pick<Civilization, 'generalProgress'>,
  points: number,
): NonNullable<Civilization['generalProgress']> {
  return addGeneralProgress(civ.generalProgress, points);
}

const CANDIDATE_COUNT = 3;

function eraWeight(candidateEra: number, currentEra: number): number {
  const distance = Math.abs(candidateEra - currentEra);
  if (distance === 0) return 100;
  if (distance === 1) return 40; // adjacent-era, lower weight
  return 5; // farther era: fallback-only weight, still possible, rarely picked
}

/**
 * 2-3 weighted candidates for `civId` (contract §13). Deterministic for a
 * given `seed` — callers pass a per-round, per-civ-derived seed; this
 * function only draws from the shared seeded RNG (never the browser's
 * unseeded random source). Excludes every General already in this civ's
 * `generalHistory` forever (contract: "a used General never appears
 * again... never resurrect").
 */
export function generateGeneralCandidates(
  state: GameState,
  civId: string,
  seed: number,
): GeneralDefinition[] {
  const civ = state.civilizations[civId];
  const civType = civ?.civType ?? '';
  const usedIds = new Set((civ?.generalHistory ?? []).map(entry => entry.generalDefinitionId));
  const currentEra = resolveCivilizationEra(civ?.techState.completed ?? []);

  const eligible = GENERAL_DEFINITIONS.filter(g =>
    !usedIds.has(g.id) && (g.civTypeEligibility.length === 0 || g.civTypeEligibility.includes(civType)),
  );

  const rng = seededLcg(seed);
  const picked: GeneralDefinition[] = [];
  const pool = [...eligible];
  while (picked.length < CANDIDATE_COUNT && pool.length > 0) {
    const weights = pool.map(g => eraWeight(g.era, currentEra));
    const choice = weightedPick(pool, weights, rng);
    picked.push(choice);
    pool.splice(pool.indexOf(choice), 1);
  }
  return picked;
}

/**
 * Queues a candidate-choice prompt once `civId` crosses its next threshold
 * (contract §13: "Queue candidate choice to a natural break; do not
 * interrupt action resolution or allow indefinite deferral"). A no-op if
 * the civ has no progress, hasn't crossed the threshold, or already has a
 * pending choice queued — the queue is cleared only by spawnGeneralForCiv
 * actually resolving it, which structurally prevents indefinite deferral
 * (the entry stays queued, visible, and blocking until chosen).
 */
export function checkAndQueueGeneralCandidateChoice(
  state: GameState,
  civId: string,
  triggerEventLabel: string,
  seed: number,
): GameState {
  const civ = state.civilizations[civId];
  if (!civ?.generalProgress || !hasCrossedGeneralThreshold(civ.generalProgress)) return state;
  if ((state.pendingGeneralCandidateChoices ?? []).some(choice => choice.civId === civId)) return state;

  const candidates = generateGeneralCandidates(state, civId, seed);
  if (candidates.length === 0) return state; // roster fully exhausted, nothing to offer

  return {
    ...state,
    pendingGeneralCandidateChoices: [
      ...(state.pendingGeneralCandidateChoices ?? []),
      { civId, candidateDefinitionIds: candidates.map(c => c.id), triggerEventLabel },
    ],
  };
}

/**
 * #544 MR6: the read-side counterpart to checkAndQueueGeneralCandidateChoice
 * above -- extracted from bootstrap.ts's maybeShowPendingGeneralChoice so the
 * viewer-safety filter (an AI civ's or an inactive hot-seat player's pending
 * choice must never surface) has a direct unit-test seam, matching this
 * codebase's established *ForViewer presentation-helper convention. No
 * behavior change from the inline version it replaces.
 */
export function getPendingGeneralChoiceForViewer(
  state: GameState,
  viewerId: string,
): PendingGeneralCandidateChoice | undefined {
  return (state.pendingGeneralCandidateChoices ?? []).find(choice => choice.civId === viewerId);
}

/**
 * Spawns the chosen General at `civId`'s capital (contract §13: "safe
 * capital fallback" -- `cities[0]` by convention, matching this codebase's
 * established capital-shorthand exception, see .claude/rules/ui-panels.md).
 * Sets `generalNoCommandThisTurn: true` (contract: "no heroic command on
 * spawn turn... operational next owner turn") and always resolves the
 * pending choice entry, if any, for this civ.
 *
 * If the civ has no capital (e.g. its last city was captured between the
 * choice being queued and being resolved -- reachable in hot-seat, where
 * several other civs' turns can pass in between), the choice still clears
 * rather than silently no-opping: leaving a pending entry an impossible
 * spawn can never resolve would make maybeShowPendingGeneralChoice's panel
 * (deliberately dismiss-less, matching the hoard-choice precedent) reopen
 * forever every time it's checked -- an unrecoverable soft-lock. No General
 * is created in that case; the candidate is simply forfeited.
 */
export function spawnGeneralForCiv(
  state: GameState,
  civId: string,
  generalDefinitionId: string,
): GameState {
  const civ = state.civilizations[civId];
  const capitalId = civ?.cities.at(0); // capital = first city by convention
  const capital = capitalId ? state.cities[capitalId] : undefined;
  if (!civ) return state;
  if (!capital) {
    return {
      ...state,
      pendingGeneralCandidateChoices: (state.pendingGeneralCandidateChoices ?? [])
        .filter(choice => choice.civId !== civId),
    };
  }

  const idCounters = { ...state.idCounters };
  const newUnit = {
    ...createUnit('great_general', civId, capital.position, idCounters),
    generalDefinitionId,
    generalNoCommandThisTurn: true as const,
  };

  return {
    ...state,
    idCounters,
    units: { ...state.units, [newUnit.id]: newUnit },
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...civ,
        units: [...civ.units, newUnit.id],
        generalProgress: {
          points: civ.generalProgress?.points ?? 0,
          generalsEarned: (civ.generalProgress?.generalsEarned ?? 0) + 1,
        },
        generalHistory: [
          ...(civ.generalHistory ?? []),
          { unitId: newUnit.id, generalDefinitionId, spawnedTurn: state.turn },
        ],
      },
    },
    pendingGeneralCandidateChoices: (state.pendingGeneralCandidateChoices ?? [])
      .filter(choice => choice.civId !== civId),
  };
}

/**
 * #544 MR5: deterministic AI candidate pick among the 2-3 offered
 * `GeneralDefinition`s. No RNG (Global Constraints) -- a simple best-stat
 * sum, tie-broken by id for determinism. Difficulty-invariant: this never
 * reads `state.opponentChallenge` (contract item 83 -- candidate acquisition
 * is not a "judgment" call worth scaling, it's a one-time pick among
 * roughly-equal options).
 */
export function chooseBestGeneralCandidate(candidates: GeneralDefinition[]): GeneralDefinition {
  return [...candidates].sort((a, b) =>
    (b.commandRange + b.commandCapacity + b.maxCommandCharges)
    - (a.commandRange + a.commandCapacity + a.maxCommandCharges)
    || a.id.localeCompare(b.id))[0]!;
}

/**
 * Supply-based command-stat degradation (contract §15 "General supply"):
 * early stages leave command unchanged, `degraded` shrinks commandCapacity,
 * `severe` also shrinks commandRange. Nothing in MR3 consumes this yet (no
 * ability exists to read it) -- MR4's heroic-command machinery will be its
 * first real caller. This function and its test coverage exist now so MR4
 * only has to wire a caller, not design the degradation curve.
 */
export function getEffectiveCommandStats(
  unit: Pick<Unit, 'landSupply'>,
  definition: Pick<GeneralDefinition, 'commandRange' | 'commandCapacity'>,
): { commandRange: number; commandCapacity: number } {
  const state = unit.landSupply?.state ?? 'full';
  if (state === 'degraded') {
    return { commandRange: definition.commandRange, commandCapacity: Math.max(1, definition.commandCapacity - 1) };
  }
  if (state === 'severe') {
    return {
      commandRange: Math.max(1, definition.commandRange - 1),
      commandCapacity: Math.max(1, definition.commandCapacity - 1),
    };
  }
  return { commandRange: definition.commandRange, commandCapacity: definition.commandCapacity };
}

/**
 * #544 MR4 contract §16: "within commandRange, up to commandCapacity
 * eligible out-of-supply units can have degradation paused... automatic
 * every turn... priority: closest eligible, then stable tie-breaker."
 * "Eligible" here means the unit would otherwise advance its overextension
 * stage this round (owned by civId, out of supply, in hostile territory) --
 * pausing a unit with no active degradation clock (full/stable-unsupported)
 * is a no-op, so those are excluded rather than wastefully "stabilized."
 * Computed once per civ per round by resolveLandSupplyForCiv, mirroring
 * that function's existing per-civ precompute discipline (contract §35).
 * Each eligible General independently fills its own capacity from the full
 * eligible pool -- overlapping General ranges do not compete for the same
 * capacity budget, they simply produce a redundant (harmless) stabilization
 * of the same unit.
 */
export function getPassiveStabilizationTargets(state: GameState, civId: string): Set<string> {
  const civ = state.civilizations[civId];
  if (!civ) return new Set();

  const civUnits = civ.units.map(id => state.units[id]).filter((u): u is Unit => Boolean(u));
  const generals = civUnits.filter(
    u => u.type === 'great_general' && u.generalDefinitionId && !u.generalNoCommandThisTurn,
  );
  const degradingUnits = civUnits.filter(
    u => u.landSupply !== undefined
      && (u.landSupply.state === 'grace' || u.landSupply.state === 'degraded' || u.landSupply.state === 'severe'),
  );

  const stabilized = new Set<string>();
  for (const general of generals) {
    const definition = GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId);
    if (!definition) continue;
    const { commandRange, commandCapacity } = getEffectiveCommandStats(general, definition);

    const inRange = degradingUnits
      .map(u => ({ unit: u, distance: mapDistance(state.map, general.position, u.position) }))
      .filter(entry => entry.distance <= commandRange)
      .sort((a, b) => a.distance - b.distance || a.unit.id.localeCompare(b.unit.id));

    for (const entry of inRange.slice(0, commandCapacity)) {
      stabilized.add(entry.unit.id);
    }
  }
  return stabilized;
}

/**
 * #544 MR4 contract §23: "one concise end-of-career line." V1 deliberately
 * uses a generic, definition-name-flavored line rather than reconstructing
 * battle/city context -- the contract's own examples ("Fell defending
 * Athens") imply richer narrative context this MR has no cheap access to at
 * either call site (mid-combat-resolution for death, end-of-round for
 * retirement). Documented scope reduction: contract §33's "rich Great
 * General biographies" (issue E) is the explicit deferred richer-narrative
 * follow-up this defers to.
 */
export function describeGeneralCareerEnd(definition: Pick<GeneralDefinition, 'name'>, outcome: 'retired' | 'died'): string {
  return outcome === 'died'
    ? `${definition.name} fell in battle.`
    : `${definition.name} retired after a distinguished career.`;
}

/**
 * #544 MR4 contract §21: the 3rd lifetime charge "resolves normally... no
 * mechanical bonus... General remains for rest of owner turn... retires at
 * end of turn." No transient flag is needed -- generalCommandChargesUsed
 * reaching maxCommandCharges IS the retirement condition, checked once per
 * civ per round in turn-manager.ts's existing end-of-round per-civ loop,
 * after the General has already acted normally for the whole turn.
 */
export function retireGeneralsAtTurnEnd(state: GameState, civId: string, bus?: EventBus): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;

  const retiring = civ.units
    .map(id => state.units[id])
    .filter((u): u is Unit => Boolean(u) && u.type === 'great_general')
    .filter(u => {
      const definition = GENERAL_DEFINITIONS.find(g => g.id === u.generalDefinitionId);
      return definition && (u.generalCommandChargesUsed ?? 0) >= definition.maxCommandCharges;
    });
  if (retiring.length === 0) return state;

  let units = { ...state.units };
  let civUnits = civ.units;
  let generalHistory = civ.generalHistory ?? [];
  for (const general of retiring) {
    const definition = GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId)!;
    const endOfCareerLine = describeGeneralCareerEnd(definition, 'retired');
    delete units[general.id];
    civUnits = civUnits.filter(id => id !== general.id);
    generalHistory = generalHistory.map(entry =>
      entry.unitId === general.id
        ? {
            ...entry,
            outcome: 'retired' as const,
            retiredTurn: state.turn,
            endOfCareerLine,
            heroicCommandsUsed: general.generalCommandChargesUsed ?? 0,
          }
        : entry,
    );
    // #544 MR4 review fix: unlike death (visible through the combat flow
    // that caused it), retirement happens silently during end-of-round
    // processing -- the player confirmed Final Command earlier in their own
    // turn, but the General doesn't actually vanish until this later,
    // asynchronous point. Without this, a player would open their unit list
    // next turn and find a General simply gone with no explanation. Mirrors
    // the optional-bus, emit-if-present convention already used by
    // beginConfirmedForeignCityEntry's diplomacy:war-declared emit.
    bus?.emit('general:retired', { civId, generalName: definition.name, message: endOfCareerLine });
  }

  return {
    ...state,
    units,
    civilizations: {
      ...state.civilizations,
      [civId]: { ...civ, units: civUnits, generalHistory },
    },
  };
}
