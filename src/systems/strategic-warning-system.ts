import type {
  AIStrategicPlan,
  GameEvents,
  GameState,
  HexCoord,
  CivPressureLedger,
  ResourceType,
} from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { createEmptyOpponentAIState } from '@/core/opponent-ai-state';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey } from '@/systems/hex-utils';
import { isTrustedObservedLastSeenTile } from '@/systems/last-seen-presentation';
import {
  getCivAvailableResources,
  isResourceTileDeniedByHostileOccupation,
} from '@/systems/resource-acquisition-system';

type StrategicWarning = GameEvents['ai:strategic-warning'];

function emptyLedger(): CivPressureLedger {
  return {
    activeIndependentThreatIds: [],
    recoveryUntilTurn: 0,
    lastResolvedThreatTurn: null,
    lastWarningTurnByKey: {},
    lastStrategicAudioTurn: null,
  };
}

function isVisible(state: GameState, viewerId: string, coord: HexCoord): boolean {
  const visibility = state.civilizations[viewerId]?.visibility;
  return Boolean(visibility && getVisibility(visibility, coord) === 'visible');
}

function trustedLastSeenAt(state: GameState, viewerId: string, coord: HexCoord) {
  const presentation = state.civilizations[viewerId]?.visibility.lastSeen?.[hexKey(coord)];
  return isTrustedObservedLastSeenTile(presentation) ? presentation : null;
}

function regionLabel(state: GameState, coord: HexCoord): string {
  const horizontal = coord.q < state.map.width / 3
    ? 'western'
    : coord.q > state.map.width * 2 / 3 ? 'eastern' : '';
  const vertical = coord.r < state.map.height / 3
    ? 'northern'
    : coord.r > state.map.height * 2 / 3 ? 'southern' : '';
  return `${vertical || horizontal || 'outer'}${vertical && horizontal ? `-${horizontal}` : ''} marches`;
}

function planEvidence(
  state: GameState,
  viewerId: string,
  plan: AIStrategicPlan,
): { evidence: 'visible' | 'remembered'; coord: HexCoord } | null {
  const assigned = plan.assignedUnitIds
    .map(unitId => state.units[unitId])
    .filter(unit => Boolean(unit));
  const visible = assigned
    .filter(unit => isVisible(state, viewerId, unit.position))
    .sort((left, right) => left!.id.localeCompare(right!.id))[0];
  if (visible) return { evidence: 'visible', coord: { ...visible.position } };

  const remembered = Object.values(
    state.civilizations[viewerId]?.visibility.lastSeen ?? {},
  )
    .filter(isTrustedObservedLastSeenTile)
    .filter(tile => tile.units?.some(unit =>
      unit.owner === plan.actorId && plan.assignedUnitIds.includes(unit.id)))
    .sort((left, right) =>
      right.observedTurn - left.observedTurn
      || hexKey(left.coord).localeCompare(hexKey(right.coord)))[0];
  return remembered
    ? { evidence: 'remembered', coord: { ...remembered.coord } }
    : null;
}

function safePlanTarget(
  state: GameState,
  viewerId: string,
  plan: AIStrategicPlan,
): Pick<StrategicWarning, 'targetLabel' | 'target'> {
  if (plan.target.kind !== 'city') return {};
  const city = state.cities[plan.target.id];
  if (
    city
    && (
      city.owner === viewerId
      || isVisible(state, viewerId, city.position)
    )
  ) {
    return {
      targetLabel: city.name,
      target: { kind: 'map', coord: { ...city.position }, label: city.name },
    };
  }
  const remembered = trustedLastSeenAt(state, viewerId, plan.target.lastKnownPosition);
  if (remembered?.city?.id === plan.target.id) {
    return {
      targetLabel: remembered.city.name,
      target: {
        kind: 'map',
        coord: { ...remembered.coord },
        label: remembered.city.name,
      },
    };
  }
  return {};
}

function targetIdentity(warning: Omit<StrategicWarning, 'warningKey' | 'playAudio'>): string {
  if (warning.target) return hexKey(warning.target.coord);
  if (warning.resource) return warning.resource;
  return warning.regionLabel ?? 'regional';
}

function withKey(
  warning: Omit<StrategicWarning, 'warningKey' | 'playAudio'>,
): StrategicWarning {
  return {
    ...warning,
    warningKey: [
      warning.viewerId,
      warning.actorId,
      warning.kind,
      targetIdentity(warning),
    ].join(':'),
    playAudio: false,
  };
}

function samePlanTransition(
  before: AIStrategicPlan | null | undefined,
  after: AIStrategicPlan,
  phase: AIStrategicPlan['phase'],
): boolean {
  return before?.id === after.id && before.phase === phase;
}

function deriveMajorWarnings(
  before: GameState,
  after: GameState,
  viewerId: string,
): StrategicWarning[] {
  const warnings: StrategicWarning[] = [];
  for (const actorId of Object.keys(after.opponentAI?.majorCivs ?? {}).sort()) {
    const actor = after.civilizations[actorId];
    if (!actor || actor.isHuman || actor.isEliminated) continue;
    const plan = after.opponentAI!.majorCivs[actorId].primaryPlan;
    if (!plan) continue;
    const beforePlan = before.opponentAI?.majorCivs[actorId]?.primaryPlan;
    const kind = plan.phase === 'mobilizing'
      ? 'mobilizing'
      : plan.phase === 'withdrawing' ? 'withdrawing' : null;
    if (!kind || samePlanTransition(beforePlan, plan, plan.phase)) continue;
    const evidence = planEvidence(after, viewerId, plan);
    if (!evidence) continue;
    const target = evidence.evidence === 'visible'
      ? safePlanTarget(after, viewerId, plan)
      : {};
    warnings.push(withKey({
      viewerId,
      actorId,
      actorName: actor.name,
      kind,
      evidence: evidence.evidence,
      regionLabel: regionLabel(after, evidence.coord),
      ...target,
    }));
  }
  return warnings;
}

function derivePirateWarnings(
  before: GameState,
  after: GameState,
  viewerId: string,
): StrategicWarning[] {
  const warnings: StrategicWarning[] = [];
  const beforeIntel = before.pirates?.intelByCiv[viewerId] ?? {};
  const afterIntel = after.pirates?.intelByCiv[viewerId] ?? {};
  for (const factionId of Object.keys(afterIntel).sort()) {
    const intel = afterIntel[factionId];
    const previous = beforeIntel[factionId];
    // besieging (#522) reuses the 'blockade' warning kind rather than a new one -- a
    // siege requires an active blockade, and the existing "review known pirate waters"
    // message stays accurate. Escalating blockading -> besieging still fires (the
    // knownBehavior values differ, so the duplicate-suppression check below doesn't
    // swallow it), giving the player a second heads-up as the threat worsens; the
    // dedicated 'siege' pirate notification (pirate-notifications.ts) remains the
    // primary, precise alert once HP damage actually starts.
    const kind = intel.knownBehavior === 'blockading' || intel.knownBehavior === 'besieging'
      ? 'blockade'
      : intel.knownBehavior === 'raiding' ? 'raid' : null;
    if (!kind || previous?.knownBehavior === intel.knownBehavior) continue;
    const target = intel.lastKnownHeadquarters && intel.level !== 'rumor'
      ? {
          target: {
            kind: 'map' as const,
            coord: { ...intel.lastKnownHeadquarters.position },
            label: 'Last known pirate waters',
          },
        }
      : {};
    warnings.push(withKey({
      viewerId,
      actorId: factionId,
      actorName: 'Pirates',
      kind,
      evidence: 'earned-intel',
      ...target,
    }));
  }
  return warnings;
}

function deriveBarbarianWarnings(
  before: GameState,
  after: GameState,
  viewerId: string,
): StrategicWarning[] {
  const warnings: StrategicWarning[] = [];
  for (const campId of Object.keys(after.opponentAI?.barbarianCamps ?? {}).sort()) {
    const plan = after.opponentAI!.barbarianCamps[campId];
    const previous = before.opponentAI?.barbarianCamps[campId];
    if (
      plan.objective !== 'raid'
      || previous?.id === plan.id && previous.phase === plan.phase
    ) continue;
    const coord = plan.target.kind === 'resource'
      ? plan.target.position
      : plan.target.kind === 'city' || plan.target.kind === 'unit'
        ? plan.target.lastKnownPosition
        : null;
    if (!coord) continue;
    const camp = after.barbarianCamps[campId];
    const assignedUnits = plan.assignedUnitIds
      .map(unitId => after.units[unitId])
      .filter(unit => unit?.owner === 'barbarian');
    const visibleThreat = [
      ...(camp ? [camp.position] : []),
      ...assignedUnits.map(unit => unit!.position),
    ].some(position => isVisible(after, viewerId, position));
    const rememberedThreat = Object.values(
      after.civilizations[viewerId]?.visibility.lastSeen ?? {},
    )
      .filter(isTrustedObservedLastSeenTile)
      .some(tile => tile.units?.some(unit =>
        unit.owner === 'barbarian'
        && plan.assignedUnitIds.includes(unit.id)));
    if (!visibleThreat && !rememberedThreat) continue;
    const targetIsSafe = after.map.tiles[hexKey(coord)]?.owner === viewerId
      || isVisible(after, viewerId, coord)
      || Boolean(trustedLastSeenAt(after, viewerId, coord));
    if (!targetIsSafe) continue;
    const resource = plan.target.kind === 'resource'
      ? plan.target.resource
      : undefined;
    const label = resource ? `${resource} outpost` : 'raider target';
    warnings.push(withKey({
      viewerId,
      actorId: `barbarian:${campId}`,
      actorName: 'Raiders',
      kind: 'raid',
      evidence: visibleThreat ? 'visible' : 'remembered',
      ...(resource ? { resource } : {}),
      targetLabel: label,
      target: { kind: 'map', coord: { ...coord }, label },
    }));
  }
  return warnings;
}

function resourceTiles(state: GameState, viewerId: string, resource: ResourceType) {
  return Object.values(state.map.tiles)
    .filter(tile =>
      tile.owner === viewerId
      && tile.resource === resource
      && tile.improvement !== 'none'
      && tile.improvementTurnsLeft === 0)
    .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)));
}

function deriveResourceWarnings(
  before: GameState,
  after: GameState,
  viewerId: string,
): StrategicWarning[] {
  const beforeResources = getCivAvailableResources(before, viewerId);
  const afterResources = getCivAvailableResources(after, viewerId);
  const allResources = [...new Set([...beforeResources, ...afterResources])].sort();
  const warnings: StrategicWarning[] = [];
  for (const resource of allResources) {
    const denied = beforeResources.has(resource) && !afterResources.has(resource);
    const restored = !beforeResources.has(resource) && afterResources.has(resource);
    if (!denied && !restored) continue;
    const tiles = resourceTiles(denied ? after : before, viewerId, resource);
    const tile = tiles.find(candidate => denied
      ? isResourceTileDeniedByHostileOccupation(after, viewerId, candidate.coord)
      : isResourceTileDeniedByHostileOccupation(before, viewerId, candidate.coord)
        && !isResourceTileDeniedByHostileOccupation(after, viewerId, candidate.coord));
    if (!tile) continue;
    const label = `${resource} outpost`;
    warnings.push(withKey({
      viewerId,
      actorId: 'hostile-occupation',
      actorName: 'Hostile raiders',
      kind: denied ? 'resource-denied' : 'resource-restored',
      evidence: 'visible',
      resource,
      regionLabel: `${regionLabel(after, tile.coord).replace(' marches', '')} outpost`,
      targetLabel: label,
      target: { kind: 'map', coord: { ...tile.coord }, label },
    }));
  }
  return warnings;
}

function deriveRecoveryWarning(
  before: GameState,
  after: GameState,
  viewerId: string,
): StrategicWarning[] {
  const previous = before.opponentAI?.pressureByCiv[viewerId];
  const current = after.opponentAI?.pressureByCiv[viewerId];
  if (
    !previous
    || !current
    || current.lastResolvedThreatTurn !== after.turn
    || previous.activeIndependentThreatIds.every(id =>
      current.activeIndependentThreatIds.includes(id))
  ) return [];
  return [withKey({
    viewerId,
    actorId: 'independent-threats',
    actorName: 'Raiders',
    kind: 'recovery',
    evidence: 'earned-intel',
  })];
}

export function deriveStrategicWarningTransitions(
  beforeRound: Readonly<GameState>,
  finalState: GameState,
  viewerId: string,
): StrategicWarning[] {
  const viewer = finalState.civilizations[viewerId];
  if (!viewer?.isHuman || viewer.isEliminated) return [];
  const ledger = finalState.opponentAI?.pressureByCiv[viewerId] ?? emptyLedger();
  const warnings = [
    ...deriveMajorWarnings(beforeRound as GameState, finalState, viewerId),
    ...derivePirateWarnings(beforeRound as GameState, finalState, viewerId),
    ...deriveBarbarianWarnings(beforeRound as GameState, finalState, viewerId),
    ...deriveResourceWarnings(beforeRound as GameState, finalState, viewerId),
    ...deriveRecoveryWarning(beforeRound as GameState, finalState, viewerId),
  ]
    .filter(warning => ledger.lastWarningTurnByKey[warning.warningKey] !== finalState.turn)
    .sort((left, right) =>
      left.actorId.localeCompare(right.actorId)
      || left.kind.localeCompare(right.kind)
      || left.warningKey.localeCompare(right.warningKey));
  let audioAssigned = ledger.lastStrategicAudioTurn === finalState.turn;
  return warnings.map(warning => {
    const playAudio = !audioAssigned;
    audioAssigned = true;
    return { ...warning, playAudio };
  });
}

export function applyStrategicWarningTransitions(
  beforeRound: Readonly<GameState>,
  finalState: GameState,
  bus: EventBus,
): GameState {
  const opponentAI = structuredClone(
    finalState.opponentAI ?? createEmptyOpponentAIState(),
  );
  const warnings: StrategicWarning[] = [];
  for (const viewerId of Object.values(finalState.civilizations)
    .filter(civ => civ.isHuman && !civ.isEliminated)
    .map(civ => civ.id)
    .sort()) {
    const viewerWarnings = deriveStrategicWarningTransitions(
      beforeRound,
      finalState,
      viewerId,
    );
    if (viewerWarnings.length === 0) continue;
    const ledger = opponentAI.pressureByCiv[viewerId] ?? emptyLedger();
    opponentAI.pressureByCiv[viewerId] = {
      ...ledger,
      lastWarningTurnByKey: {
        ...ledger.lastWarningTurnByKey,
        ...Object.fromEntries(viewerWarnings.map(warning => [
          warning.warningKey,
          finalState.turn,
        ])),
      },
    };
    warnings.push(...viewerWarnings);
  }
  const nextState = { ...finalState, opponentAI };
  for (const warning of warnings) bus.emit('ai:strategic-warning', warning);
  return nextState;
}
