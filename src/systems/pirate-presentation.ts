import type {
  PirateBehavior,
  PirateFactionIntel,
  PirateHeadquarters,
  PirateIntelLevel,
  PirateMaritimeStage,
  PirateRelocationDirection,
} from '@/core/pirate-state';
import type { GameState, HexCoord } from '@/core/types';
import { hexKey } from './hex-utils';
import { getPirateContractQuote, getPirateTributeQuote, type PirateActionQuote } from './pirate-actions';

export type PirateFocusTarget =
  | { kind: 'headquarters'; coord: HexCoord; current: boolean; label: string }
  | { kind: 'region'; center: HexCoord; radius: number; label: string };

export interface PirateContractTargetPresentation {
  civId: string;
  name: string;
  cost: number;
  durationRounds: number;
}

export interface PirateHeadquartersPresentation {
  kind: PirateHeadquarters['kind'];
  position: HexCoord;
  observedRound: number;
  current: boolean;
  integrityBand?: 'healthy' | 'worn' | 'damaged' | 'critical';
}

export interface PirateFactionPresentation {
  factionId: string;
  name: string;
  level: PirateIntelLevel;
  discoveredRound: number;
  lastUpdatedRound: number;
  approximateRegion?: { center: HexCoord; radius: number };
  headquarters?: PirateHeadquartersPresentation;
  behavior?: PirateBehavior;
  maritimeStage?: PirateMaritimeStage;
  observedUnitIds: string[];
  plannedRelocationDirection?: PirateRelocationDirection;
  focusTarget?: PirateFocusTarget;
  tributeQuote: PirateActionQuote;
  contractTargets: PirateContractTargetPresentation[];
  contractUnavailableReason?: string;
}

export interface PirateHistoryPresentation {
  id: string;
  factionId: string;
  factionName: string;
  round: number;
  summary: string;
}

export interface PirateWatersPresentation {
  viewerId: string;
  available: boolean;
  factions: PirateFactionPresentation[];
  history: PirateHistoryPresentation[];
  selectedFactionId?: string;
  selectedHistoryId?: string;
}

function integrityBand(integrity: number, maximum: number): 'healthy' | 'worn' | 'damaged' | 'critical' {
  const ratio = maximum > 0 ? integrity / maximum : 0;
  if (ratio > 0.75) return 'healthy';
  if (ratio > 0.5) return 'worn';
  if (ratio > 0.25) return 'damaged';
  return 'critical';
}

function headquartersPosition(state: GameState, factionId: string): HexCoord | null {
  const faction = state.pirates?.factions[factionId];
  if (!faction) return null;
  if (faction.headquarters.kind === 'coastal-enclave') return faction.headquarters.position;
  return state.units[faction.headquarters.flagshipUnitId]?.position ?? null;
}

function currentlyVisible(state: GameState, viewerId: string, position: HexCoord): boolean {
  return state.civilizations[viewerId]?.visibility.tiles[hexKey(position)] === 'visible';
}

function activeRelocationDirection(state: GameState, factionId: string): PirateRelocationDirection | undefined {
  const headquarters = state.pirates?.factions[factionId]?.headquarters;
  return headquarters?.kind === 'deep-sea-flotilla'
    ? headquarters.relocation.planned?.direction
    : undefined;
}

export function refreshPirateIntel(state: GameState, viewerId: string): GameState {
  const pirates = state.pirates;
  const viewer = state.civilizations[viewerId];
  if (!pirates || !viewer) return state;
  const previous = pirates.intelByCiv[viewerId] ?? {};
  const nextIntel: Record<string, PirateFactionIntel> = { ...previous };

  for (const faction of Object.values(pirates.factions)) {
    const existing = previous[faction.id];
    const position = headquartersPosition(state, faction.id);
    const headquartersObserved = Boolean(position && currentlyVisible(state, viewerId, position));
    const visibleShipIds = faction.shipIds
      .filter(unitId => {
        const unit = state.units[unitId];
        return Boolean(unit && currentlyVisible(state, viewerId, unit.position));
      })
      .sort();
    const hasCurrentObservation = headquartersObserved || visibleShipIds.length > 0;
    if (!existing && !hasCurrentObservation) continue;

    const discoveredRound = existing?.discoveredRound ?? state.turn;
    const direction = existing?.level === 'tracked'
      ? activeRelocationDirection(state, faction.id)
      : undefined;
    const lastKnownHeadquarters = headquartersObserved && position
      ? {
          kind: faction.headquarters.kind,
          position: { ...position },
          observedRound: state.turn,
          ...(faction.headquarters.kind === 'coastal-enclave'
            ? { integrityBand: integrityBand(faction.headquarters.integrity, faction.headquarters.maxIntegrity) }
            : {}),
        }
      : existing?.lastKnownHeadquarters
        ? {
            ...existing.lastKnownHeadquarters,
            position: { ...existing.lastKnownHeadquarters.position },
          }
        : undefined;

    nextIntel[faction.id] = {
      factionId: faction.id,
      level: existing?.level === 'tracked' ? 'tracked' : 'sighted',
      discoveredRound,
      lastUpdatedRound: hasCurrentObservation ? state.turn : (existing?.lastUpdatedRound ?? state.turn),
      ...(existing?.approximateRegion
        ? { approximateRegion: { center: { ...existing.approximateRegion.center }, radius: existing.approximateRegion.radius } }
        : {}),
      ...(lastKnownHeadquarters ? { lastKnownHeadquarters } : {}),
      knownBehavior: headquartersObserved ? faction.behavior : existing?.knownBehavior,
      knownMaritimeStage: headquartersObserved ? faction.maritimeStage : existing?.knownMaritimeStage,
      observedUnitIds: hasCurrentObservation ? visibleShipIds : [...(existing?.observedUnitIds ?? [])],
      ...(direction ? { plannedRelocationDirection: direction } : {}),
    };
  }

  return {
    ...state,
    pirates: {
      ...pirates,
      intelByCiv: { ...pirates.intelByCiv, [viewerId]: nextIntel },
    },
  };
}

function presentFaction(state: GameState, viewerId: string, intel: PirateFactionIntel): PirateFactionPresentation {
  const faction = state.pirates?.factions[intel.factionId];
  const isRumor = intel.level === 'rumor';
  const actualHeadquartersPosition = headquartersPosition(state, intel.factionId);
  const lastKnown = !isRumor && intel.lastKnownHeadquarters
    ? {
        kind: intel.lastKnownHeadquarters.kind,
        position: { ...intel.lastKnownHeadquarters.position },
        observedRound: intel.lastKnownHeadquarters.observedRound,
        current: Boolean(
          faction?.headquarters.kind === intel.lastKnownHeadquarters.kind
          && actualHeadquartersPosition
          && hexKey(actualHeadquartersPosition) === hexKey(intel.lastKnownHeadquarters.position)
          && currentlyVisible(state, viewerId, intel.lastKnownHeadquarters.position)
        ),
        ...(intel.lastKnownHeadquarters.integrityBand
          ? { integrityBand: intel.lastKnownHeadquarters.integrityBand }
          : {}),
      }
    : undefined;
  const direction = intel.level === 'tracked' && activeRelocationDirection(state, intel.factionId)
    ? intel.plannedRelocationDirection
    : undefined;
  const tributeQuote = getPirateTributeQuote(state, intel.factionId, viewerId);
  const contractTargets = Object.entries(state.civilizations)
    .filter(([targetId]) => targetId !== viewerId)
    .map(([targetId, civilization]) => ({ targetId, civilization, quote: getPirateContractQuote(state, intel.factionId, viewerId, targetId) }))
    .filter(candidate => candidate.quote.available)
    .map(candidate => ({
      civId: candidate.targetId,
      name: candidate.civilization.name,
      cost: candidate.quote.cost,
      durationRounds: candidate.quote.durationRounds ?? 0,
    }));
  const sampleTargetId = Object.keys(state.civilizations).find(id => id !== viewerId) ?? viewerId;
  const sampleContractQuote = getPirateContractQuote(state, intel.factionId, viewerId, sampleTargetId);
  const focusTarget: PirateFocusTarget | undefined = lastKnown
    ? { kind: 'headquarters', coord: { ...lastKnown.position }, current: lastKnown.current, label: lastKnown.current ? 'Pirate headquarters' : 'Last known pirate headquarters' }
    : isRumor && intel.approximateRegion
      ? { kind: 'region', center: { ...intel.approximateRegion.center }, radius: intel.approximateRegion.radius, label: 'Suspected pirate waters' }
      : undefined;
  return {
    factionId: intel.factionId,
    name: isRumor ? 'Unknown pirate faction' : (faction?.name ?? 'Pirate faction'),
    level: intel.level,
    discoveredRound: intel.discoveredRound,
    lastUpdatedRound: intel.lastUpdatedRound,
    ...(isRumor && intel.approximateRegion
      ? { approximateRegion: { center: { ...intel.approximateRegion.center }, radius: intel.approximateRegion.radius } }
      : {}),
    ...(lastKnown ? { headquarters: lastKnown } : {}),
    ...(!isRumor && intel.knownBehavior ? { behavior: intel.knownBehavior } : {}),
    ...(!isRumor && intel.knownMaritimeStage ? { maritimeStage: intel.knownMaritimeStage } : {}),
    observedUnitIds: isRumor ? [] : [...(intel.observedUnitIds ?? [])],
    ...(direction ? { plannedRelocationDirection: direction } : {}),
    ...(focusTarget ? { focusTarget } : {}),
    tributeQuote,
    contractTargets,
    ...(contractTargets.length === 0 && sampleContractQuote.reason
      ? { contractUnavailableReason: sampleContractQuote.reason }
      : {}),
  };
}

export function getPirateWatersPresentation(state: GameState, viewerId: string): PirateWatersPresentation {
  const intel = state.pirates?.intelByCiv[viewerId] ?? {};
  const reviewHistoryIds = new Set((state.notificationLog?.[viewerId] ?? [])
    .flatMap(entry => entry.review?.kind === 'pirate-history' ? [entry.review.historyId] : []));
  const history = (state.pirates?.history ?? [])
    .filter(entry => reviewHistoryIds.has(entry.id)
      || (entry.kind === 'destroyed'
        ? entry.destroyedByOwnerId === viewerId
        : entry.employerId === viewerId || entry.targetId === viewerId))
    .map(entry => ({
      id: entry.id,
      factionId: entry.factionId,
      factionName: entry.factionName,
      round: entry.round,
      summary: entry.kind === 'destroyed'
        ? `${entry.factionName} was destroyed${entry.bountyAwarded > 0 ? ` for ${entry.bountyAwarded} gold` : ''}.`
        : `${entry.factionName}'s contract ended.`,
    }));
  return {
    viewerId,
    available: Object.keys(intel).length > 0 || history.length > 0,
    factions: Object.values(intel)
      .map(entry => presentFaction(state, viewerId, entry))
      .sort((a, b) => a.factionId.localeCompare(b.factionId)),
    history,
  };
}
