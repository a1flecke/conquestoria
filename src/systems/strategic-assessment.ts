// #1236: the viewer-safe "state of the nation" projection the Council (#1237) and its
// change history (#1238) consume. Pure and deterministic: no RNG, no mutation, no events,
// no session/DOM, no save field. It summarizes facts the game already owns -- it never
// re-implements economy, war, victory, rivalry, supply or unrest.
//
// Viewer safety: the viewer's own empire is read directly (no privacy concern for your own
// state); everything about a rival comes from an existing `*ForViewer` projection or from a
// discovery gate (`hasMetCivilization`). It never reads `opponentAI` / `NationalIntent`, and
// it is not an AI input -- the AI keeps its own private reasoning.
//
// Severity (0-100, integer) has one meaning across kinds, so constraints can be ranked
// against each other:
//   1-39  worth a look   -- a plan is stalled but nothing is being lost
//   40-69 serious        -- growth, output or stability is measurably hurt
//   70+   urgent         -- the empire is losing ground every turn
// Each kind's formula below is a base for "the condition exists" plus a term that grows with
// how bad the worst case is. Ties break by kind order, then city id.
//
// Not modelled, on purpose: `administration` (governance load only gates which policies can
// be enabled -- nothing is penalised when load is high, so there is no constraint to report)
// and `military` (no aggregate readiness fact exists). A healthy empire returns no
// constraints; filler would teach the player to ignore the list.
import type {
  AssessmentDigest,
  AssessmentSeverityBucket,
  CouncilCardAction,
  GameState,
  StrategicConstraintKind,
  VictoryStage,
  WorldRaceKind,
} from '@/core/types';
import { majorCivWarOpponentIds } from '@/core/owner-kind';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { getBlockadedCityIds } from '@/systems/blockade-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { hasMetCivilization } from '@/systems/discovery-system';
import { projectDominationProgressForViewer } from '@/systems/domination-presentation';
import { getEconomyStatusForCiv } from '@/systems/economy-system';
import { getTopUnrestPressureCauses, getUnrestPressureBreakdown } from '@/systems/faction-pressure';
import { isCityProductionLocked } from '@/systems/faction-unrest-model';
import { needsResearchChoice } from '@/systems/planning-system';
import { getRivalriesForViewer } from '@/systems/rivalry-system';
import { unitParticipatesInLandSupply } from '@/systems/supply-participation';
import { getAllWorldRaceKinds } from '@/systems/world-race-definitions';
import { getWorldRacePresentationForViewer } from '@/systems/world-race-presentation';

// The unions live in `core/types` so the persisted digest can name them; re-exported for callers.
export type { StrategicConstraintKind, VictoryStage };

/** Tie-break order, most pressing kind first. */
const CONSTRAINT_KIND_ORDER: readonly StrategicConstraintKind[] = [
  'unrest', 'blockade', 'gold', 'supply', 'food', 'production', 'science',
];

export const MAX_STRATEGIC_CONSTRAINTS = 5;

/** The share of a blockaded city's gold the economy removes (`economy-system.ts`: cityGold x 0.75). Used only to rank, never to charge. */
const BLOCKADE_GOLD_LOSS_FRACTION = 0.25;

export interface StrategicConstraint {
  kind: StrategicConstraintKind;
  severity: number;
  title: string;
  /** Plain language; the first sentence is at most 18 words. */
  why: string;
  /** The WORST city for this constraint (never "the first"); absent for empire-wide ones. */
  focusCityId?: string;
  /** Absent when no real destination exists yet -- #1237 adds an action kind together with its wiring. */
  destination?: CouncilCardAction;
}

export interface VictoryTrajectory {
  id: string;
  lane: 'domination' | 'world-race';
  raceKind?: WorldRaceKind;
  title: string;
  stage: VictoryStage;
  summary: string;
}

export interface StrategicThreat {
  kind: 'domination-contender' | 'war' | 'rival';
  civId: string;
  civName: string;
  why: string;
}

export interface StrategicAssessment {
  viewerCivId: string;
  turn: number;
  constraints: StrategicConstraint[];
  victory: VictoryTrajectory[];
  threats: StrategicThreat[];
}

function clampSeverity(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function pickWorst<T>(items: readonly T[], score: (item: T) => number, id: (item: T) => string): T | undefined {
  let worst: T | undefined;
  for (const item of items) {
    if (worst === undefined) { worst = item; continue; }
    const diff = score(item) - score(worst);
    if (diff > 0 || (diff === 0 && id(item) < id(worst))) worst = item;
  }
  return worst;
}

function buildConstraints(state: GameState, viewerCivId: string): StrategicConstraint[] {
  const civ = state.civilizations[viewerCivId];
  if (!civ) return [];
  const bonusEffect = resolveCivDefinition(state, civ.civType)?.bonusEffect;
  const cities = Object.values(state.cities)
    .filter(city => city.owner === viewerCivId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // One projection per city, reused by every per-city kind: this is the expensive read.
  const projected = cities.map(city => ({ city, yields: calculateProjectedCityYields(state, city.id, bonusEffect) }));
  const constraints: StrategicConstraint[] = [];

  const starving = projected.filter(entry => entry.yields.food - entry.city.population < 0);
  const food = pickWorst(starving, e => (e.city.population - e.yields.food) / Math.max(1, e.city.population), e => e.city.id);
  if (food) {
    const deficit = food.city.population - food.yields.food;
    constraints.push({
      kind: 'food',
      severity: clampSeverity(35 + 35 * Math.min(1, deficit / Math.max(1, food.city.population))),
      title: `Feed ${food.city.name}`,
      why: `${food.city.name} makes ${food.yields.food} food for ${food.city.population} citizens, so it cannot grow.`,
      focusCityId: food.city.id,
      destination: { kind: 'open-city', cityId: food.city.id },
    });
  }

  // Production: a queued city whose production is paused (`productionDisabledTurns`, e.g. sabotage).
  // A city in revolt is also locked, but that is already the `unrest` constraint's story, so it is not
  // reported twice. (A city's projected production is never <= 0: every city center yields 1.)
  const paused = projected.filter(entry =>
    entry.city.productionQueue.length > 0
    && entry.city.unrestLevel !== 2
    && isCityProductionLocked(entry.city));
  const production = pickWorst(
    paused,
    e => (e.city.productionDisabledTurns ?? 0) * 10 + e.city.productionQueue.length,
    e => e.city.id,
  );
  if (production) {
    const turns = production.city.productionDisabledTurns ?? 0;
    constraints.push({
      kind: 'production',
      severity: clampSeverity(30 + 5 * Math.min(4, production.city.productionQueue.length) + Math.min(10, turns)),
      title: `${production.city.name} cannot build`,
      why: `${production.city.name} has ${production.city.productionQueue.length} item${production.city.productionQueue.length === 1 ? '' : 's'} queued, but its production is paused for ${turns} more turn${turns === 1 ? '' : 's'}.`,
      focusCityId: production.city.id,
      destination: { kind: 'open-city', cityId: production.city.id },
    });
  }

  // Science: with no research chosen `processResearch` discards the turn's science, so every
  // point is wasted. (A city's science is never <= 0 -- every city center yields 1 -- so "no
  // science at all" is not a reachable constraint; "science that counts for nothing" is.)
  const totalScience = projected.reduce((sum, entry) => sum + entry.yields.science, 0);
  if (cities.length > 0 && needsResearchChoice(state, viewerCivId)) {
    constraints.push({
      kind: 'science',
      severity: clampSeverity(40 + Math.min(30, 2 * totalScience)),
      title: 'Choose your research',
      why: `Your cities make ${totalScience} science a turn, and none of it counts until you pick research.`,
      destination: { kind: 'open-tech' },
    });
  }

  // Blockade (#1333): the canonical authoritative fact, read once and filtered to the viewer's own cities. The owner
  // knows their city is blockaded because the effect lands on them; who or what is blockading is never read here.
  const blockadedIds = new Set(getBlockadedCityIds(state));
  const blockaded = projected.filter(entry => blockadedIds.has(entry.city.id));
  if (blockaded.length > 0) {
    // Impact from facts already at hand: the city's own trade routes that the blockade suspends, and the gold it loses.
    const tradeRoutes = state.marketplace?.tradeRoutes ?? [];
    const routesAt = (cityId: string) => tradeRoutes.filter(route =>
      state.cities[route.fromCityId]?.owner === viewerCivId && (route.fromCityId === cityId || route.toCityId === cityId)).length;
    const impact = (entry: typeof blockaded[number]) => routesAt(entry.city.id) * 10 + entry.yields.gold * BLOCKADE_GOLD_LOSS_FRACTION;
    const worst = pickWorst(blockaded, impact, entry => entry.city.id)!;
    const routes = routesAt(worst.city.id);
    constraints.push({
      kind: 'blockade',
      severity: clampSeverity(60 + Math.min(15, routes * 5) + Math.min(10, Math.round(worst.yields.gold * BLOCKADE_GOLD_LOSS_FRACTION)) + Math.min(5, (blockaded.length - 1) * 2)),
      title: `${worst.city.name} is blockaded`,
      why: `${worst.city.name} loses 25% of its gold and its sea trade is suspended while the blockade holds.`,
      focusCityId: worst.city.id,
      destination: { kind: 'open-city', cityId: worst.city.id },
    });
  }

  const economy = getEconomyStatusForCiv(state, viewerCivId);
  const strainSeverity = { none: 0, low: 45, high: 70, critical: 90 }[economy.strainLevel];
  if (strainSeverity > 0) {
    constraints.push({
      kind: 'gold',
      severity: clampSeverity(strainSeverity + Math.min(9, economy.unpaidMaintenance)),
      title: 'The treasury is strained',
      why: `Upkeep outpaces income, leaving ${economy.unpaidMaintenance} gold of upkeep unpaid.`,
    });
  }

  const unrest = pickWorst(
    cities.filter(city => city.unrestLevel > 0),
    city => city.unrestLevel * 1000 + city.unrestTurns,
    city => city.id,
  );
  if (unrest) {
    const revolt = unrest.unrestLevel === 2;
    // #1356: why, from the canonical pressure rows -- computed once for this one city, never re-derived here.
    const causes = getTopUnrestPressureCauses(getUnrestPressureBreakdown(unrest.id, state));
    const causeText = causes.length === 0
      ? ''
      : causes.length === 1
        ? ` Its biggest pressure is ${causes[0].label} (+${causes[0].amount}).`
        : ` Its biggest pressures are ${causes[0].label} (+${causes[0].amount}) and ${causes[1].label} (+${causes[1].amount}).`;
    constraints.push({
      kind: 'unrest',
      severity: clampSeverity(revolt ? 85 + Math.min(10, unrest.unrestTurns) : 55 + Math.min(15, unrest.unrestTurns * 3)),
      title: revolt ? `${unrest.name} is in revolt` : `${unrest.name} is restless`,
      why: revolt
        ? `${unrest.name} has been in revolt for ${unrest.unrestTurns} turn${unrest.unrestTurns === 1 ? '' : 's'}, and it loses output until calm returns.${causeText}`
        : `${unrest.name} has been restless for ${unrest.unrestTurns} turn${unrest.unrestTurns === 1 ? '' : 's'}, and it loses output until calm returns.${causeText}`,
      focusCityId: unrest.id,
      destination: { kind: 'open-city', cityId: unrest.id },
    });
  }

  let degraded = 0;
  let severe = 0;
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== viewerCivId || !unitParticipatesInLandSupply(unit)) continue;
    const supply = unit.landSupply?.state;
    if (supply === 'severe') severe++;
    else if (supply === 'degraded') degraded++;
  }
  if (degraded + severe > 0) {
    const units = degraded + severe;
    constraints.push({
      kind: 'supply',
      severity: clampSeverity(40 + Math.min(30, severe * 10 + degraded * 5)),
      title: 'Armies are cut off from supply',
      why: `${units} of your unit${units === 1 ? ' is' : 's are'} fighting far from supply and growing weaker.`,
    });
  }

  return constraints;
}

function buildVictory(state: GameState, viewerCivId: string): VictoryTrajectory[] {
  const victory: VictoryTrajectory[] = [];

  const domination = projectDominationProgressForViewer(state, viewerCivId);
  const dominationStage: VictoryStage = domination.rows.some(row => row.warning)
    ? 'at-risk'
    : domination.ownVassalCount + domination.ownEarnedDefeatCount > 0 ? 'building' : 'not-started';
  victory.push({
    id: 'domination',
    lane: 'domination',
    title: 'Domination',
    stage: dominationStage,
    summary: dominationStage === 'at-risk'
      ? 'Reports say a rival is close to winning by Domination.'
      : dominationStage === 'building'
        ? `You have ${domination.ownVassalCount} vassal${domination.ownVassalCount === 1 ? '' : 's'} and ${domination.ownEarnedDefeatCount} confirmed defeat${domination.ownEarnedDefeatCount === 1 ? '' : 's'}.`
        : 'No rival has yet been subdued.',
  });

  for (const kind of getAllWorldRaceKinds()) {
    const race = getWorldRacePresentationForViewer(state, viewerCivId, kind);
    // Same visibility the Council already honoured: a locked or resolved race has nothing to track.
    if (!race.unlocked || race.completion) continue;
    const ownFraction = race.own.launchCost > 0 ? race.own.launchProgress / race.own.launchCost : 0;
    const rivalFractions = race.knownRivals.map(rival => (rival.launchCost > 0 ? rival.launchProgress / rival.launchCost : 0));
    const bestRival = rivalFractions.length > 0 ? Math.max(...rivalFractions) : 0;
    const rivalLaunchingFirst = !race.own.launchQueued && race.knownRivals.some(rival => rival.launchQueued);
    const rivalAhead = rivalLaunchingFirst || (race.knownRivals.length > 0 && bestRival > ownFraction);
    let stage: VictoryStage;
    if (rivalAhead) stage = 'at-risk';
    else if (race.knownRivals.length > 0) stage = race.own.launchQueued ? 'leading' : 'competitive';
    else if (race.own.launchQueued || race.own.componentBuilt) stage = 'building';
    else stage = 'not-started';
    victory.push({
      id: `world-race-${kind}`,
      lane: 'world-race',
      raceKind: kind,
      title: race.displayName,
      stage,
      summary: !race.own.componentBuilt
        ? 'The groundwork is not built yet.'
        : !race.own.launchQueued
          ? 'The groundwork is built; the launch is not queued.'
          : `${race.own.hostCityName ?? 'A city'} is ${Math.round(ownFraction * 100)}% toward the launch.`,
    });
  }

  return victory;
}

function buildThreats(state: GameState, viewerCivId: string): StrategicThreat[] {
  const byCiv = new Map<string, StrategicThreat>();
  const add = (threat: StrategicThreat) => { if (!byCiv.has(threat.civId)) byCiv.set(threat.civId, threat); };

  for (const row of projectDominationProgressForViewer(state, viewerCivId).rows) {
    if (row.warning) {
      add({
        kind: 'domination-contender',
        civId: row.civId,
        civName: row.civName,
        why: `Reports say ${row.civName} is close to winning by Domination.`,
      });
    }
  }

  const viewer = state.civilizations[viewerCivId];
  for (const opponentId of majorCivWarOpponentIds(viewer?.diplomacy.atWarWith ?? [])) {
    if (!hasMetCivilization(state, viewerCivId, opponentId)) continue;
    const name = state.civilizations[opponentId]?.name;
    if (!name) continue;
    add({ kind: 'war', civId: opponentId, civName: name, why: `You are at war with ${name}.` });
  }

  for (const rivalry of getRivalriesForViewer(state, viewerCivId)) {
    if (rivalry.status !== 'rival') continue;
    add({
      kind: 'rival',
      civId: rivalry.opponentCivId,
      civName: rivalry.opponentName,
      why: `${rivalry.opponentName} is a standing rival after your history together.`,
    });
  }

  const order = { 'domination-contender': 0, war: 1, rival: 2 } as const;
  return [...byCiv.values()].sort((a, b) => order[a.kind] - order[b.kind] || (a.civId < b.civId ? -1 : a.civId > b.civId ? 1 : 0));
}

export function buildStrategicAssessment(state: GameState, viewerCivId: string): StrategicAssessment {
  const constraints = buildConstraints(state, viewerCivId)
    .sort((a, b) =>
      b.severity - a.severity
      || CONSTRAINT_KIND_ORDER.indexOf(a.kind) - CONSTRAINT_KIND_ORDER.indexOf(b.kind)
      || (a.focusCityId ?? '').localeCompare(b.focusCityId ?? ''))
    .slice(0, MAX_STRATEGIC_CONSTRAINTS);
  return {
    viewerCivId,
    turn: state.turn,
    constraints,
    victory: buildVictory(state, viewerCivId),
    threats: buildThreats(state, viewerCivId),
  };
}

// --- #1238: the digest a viewer leaves behind, and the "since your last turn" diff ---------------

/** Severity bands, matching the header: 1-39 low, 40-69 mid, 70+ high. */
export function getSeverityBucket(severity: number): AssessmentSeverityBucket {
  if (severity >= 70) return 'high';
  return severity >= 40 ? 'mid' : 'low';
}

const BUCKET_RANK: Record<AssessmentSeverityBucket, number> = { low: 0, mid: 1, high: 2 };

/**
 * What is worth remembering of an assessment: constraint kinds with their bucket (and focus city),
 * and each lane's stage. Copy and exact severities are dropped on purpose, so a value that moves
 * inside its band can never read as a change.
 */
export function buildAssessmentDigest(assessment: StrategicAssessment): AssessmentDigest {
  return {
    turn: assessment.turn,
    constraints: assessment.constraints.map(constraint => ({
      kind: constraint.kind,
      bucket: getSeverityBucket(constraint.severity),
      ...(constraint.focusCityId ? { focusCityId: constraint.focusCityId } : {}),
    })),
    victory: assessment.victory.map(lane => ({ id: lane.id, stage: lane.stage })),
  };
}

export const MAX_ASSESSMENT_CHANGES = 3;

export interface AssessmentChange {
  kind: 'new' | 'worsened' | 'resolved' | 'victory-moved';
  title: string;
  /** One plain sentence saying why this is on the list. */
  changedBecause: string;
}

const CONSTRAINT_KIND_LABEL: Record<StrategicConstraintKind, string> = {
  food: 'Food',
  production: 'Production',
  science: 'Research',
  gold: 'The treasury',
  unrest: 'Unrest',
  supply: 'Army supply',
  blockade: 'The blockade',
};

const STAGE_PHRASE: Record<VictoryStage, string> = {
  'not-started': 'not started',
  building: 'under way',
  competitive: 'contested',
  leading: 'in the lead',
  'at-risk': 'at risk',
};

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Pure and deterministic: what changed between the digest a viewer left behind and the assessment
 * they see now, at most `MAX_ASSESSMENT_CHANGES` items. Order: constraints that are new or worse
 * (highest current severity first, then kind order), then victory-lane moves (by lane id), then
 * resolved constraints (kind order). No previous digest means no history, so nothing is invented.
 *
 * Only what the viewer's own assessment contains can appear here. A threat that stops being listed
 * is never reported as destroyed or retreating, because the viewer may simply no longer see it, so
 * threats are deliberately not diffed. A constraint is "resolved" only when it is absent from the
 * full set: once the cap is reached a missing kind may merely have been displaced.
 */
export function diffAssessment(
  previous: AssessmentDigest | undefined,
  current: StrategicAssessment,
): AssessmentChange[] {
  if (!previous) return [];

  const previousByKind = new Map(previous.constraints.map(constraint => [constraint.kind, constraint]));
  const raised: Array<{ severity: number; kindOrder: number; change: AssessmentChange }> = [];
  for (const constraint of current.constraints) {
    const before = previousByKind.get(constraint.kind);
    const kindOrder = CONSTRAINT_KIND_ORDER.indexOf(constraint.kind);
    if (!before) {
      raised.push({ severity: constraint.severity, kindOrder, change: { kind: 'new', title: constraint.title, changedBecause: constraint.why } });
    } else if (BUCKET_RANK[getSeverityBucket(constraint.severity)] > BUCKET_RANK[before.bucket]) {
      raised.push({ severity: constraint.severity, kindOrder, change: { kind: 'worsened', title: constraint.title, changedBecause: constraint.why } });
    }
  }
  raised.sort((a, b) => b.severity - a.severity || a.kindOrder - b.kindOrder);

  const previousStage = new Map(previous.victory.map(lane => [lane.id, lane.stage]));
  const moved: AssessmentChange[] = [];
  for (const lane of [...current.victory].sort((a, b) => compareIds(a.id, b.id))) {
    const before = previousStage.get(lane.id);
    // A lane that was not there before is news only once something has actually started on it.
    const changed = before === undefined ? lane.stage !== 'not-started' : before !== lane.stage;
    if (changed) {
      moved.push({ kind: 'victory-moved', title: `${lane.title} is ${STAGE_PHRASE[lane.stage]}`, changedBecause: lane.summary });
    }
  }

  const currentKinds = new Set(current.constraints.map(constraint => constraint.kind));
  const resolved: AssessmentChange[] = current.constraints.length >= MAX_STRATEGIC_CONSTRAINTS
    ? []
    : previous.constraints
      .filter(constraint => !currentKinds.has(constraint.kind))
      .sort((a, b) => CONSTRAINT_KIND_ORDER.indexOf(a.kind) - CONSTRAINT_KIND_ORDER.indexOf(b.kind))
      .map(constraint => ({
        kind: 'resolved' as const,
        title: `${CONSTRAINT_KIND_LABEL[constraint.kind]} is no longer a concern`,
        changedBecause: 'The Council no longer sees it holding your empire back.',
      }));

  return [...raised.map(entry => entry.change), ...moved, ...resolved].slice(0, MAX_ASSESSMENT_CHANGES);
}
