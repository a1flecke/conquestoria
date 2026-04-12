import type {
  AdvisorType,
  CouncilCallbackTone,
  CouncilMemoryEntry,
  CouncilMemoryKind,
  CouncilMemoryLedger,
  CouncilMemoryOutcome,
  CouncilMemoryState,
  CouncilMemorySubjects,
  GameState,
} from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { formatCityReference } from '@/systems/player-facing-labels';

const CALLBACK_SPACING_TURNS = 10;
const IGNORED_AFTER_TURNS = 15;
const CALLBACKS_PER_ERA = 2;

const ADVISOR_LABELS: Record<AdvisorType, string> = {
  builder: 'Builder',
  explorer: 'Explorer',
  chancellor: 'Chancellor',
  warchief: 'Warchief',
  treasurer: 'Treasurer',
  scholar: 'Scholar',
  spymaster: 'Spymaster',
  artisan: 'Artisan',
};

function ensureCouncilMemoryState(state: GameState): CouncilMemoryState {
  if (!state.councilMemory) {
    state.councilMemory = {};
  }
  return state.councilMemory;
}

function ensureLedger(state: GameState, civId: string): CouncilMemoryLedger {
  const memory = ensureCouncilMemoryState(state);
  if (!memory[civId]) {
    memory[civId] = {
      entries: [],
      eraCallbackCount: 0,
      callbackEra: state.era,
    };
  }
  if (memory[civId].callbackEra !== state.era) {
    memory[civId].callbackEra = state.era;
    memory[civId].eraCallbackCount = 0;
  }
  return memory[civId];
}

function getViewerVisibility(state: GameState, viewerId: string, cityId: string): 'visible' | 'fog' | 'unexplored' {
  const city = state.cities[cityId];
  if (!city) return 'unexplored';
  if (city.owner === viewerId) return 'visible';
  return state.civilizations[viewerId]?.visibility.tiles[`${city.position.q},${city.position.r}`] ?? 'unexplored';
}

function knowsCivilization(state: GameState, viewerId: string, civId: string | undefined): boolean {
  if (!civId) return false;
  if (civId === viewerId) return true;
  return state.civilizations[viewerId]?.knownCivilizations?.includes(civId) ?? false;
}

function getOwnerName(state: GameState, viewerId: string, cityId: string): string | undefined {
  const city = state.cities[cityId];
  if (!city) return undefined;
  if (!knowsCivilization(state, viewerId, city.owner)) return undefined;
  return state.civilizations[city.owner]?.name;
}

function getDuplicateCount(state: GameState, cityId: string): number {
  const city = state.cities[cityId];
  if (!city) return 0;
  return Object.values(state.cities).filter(candidate => candidate.name === city.name).length;
}

function formatCityLabel(state: GameState, viewerId: string, cityId: string | undefined): string {
  if (!cityId) return 'an unknown city';
  const city = state.cities[cityId];
  if (!city) return 'a lost city';
  if (getViewerVisibility(state, viewerId, cityId) === 'unexplored' && city.owner !== viewerId) {
    return 'an undiscovered foreign city';
  }
  return formatCityReference(city.name, {
    ownerName: getOwnerName(state, viewerId, cityId),
    duplicateCount: getDuplicateCount(state, cityId),
  });
}

function formatCivLabel(state: GameState, viewerId: string, civId: string | undefined): string {
  if (!civId) return 'a foreign civilization';
  if (!knowsCivilization(state, viewerId, civId)) return 'a foreign civilization';
  return state.civilizations[civId]?.name ?? 'a foreign civilization';
}

function formatRegionLabel(regionKey: string | undefined): string {
  if (!regionKey) return 'the frontier';
  return regionKey.replace(/-/g, ' ');
}

function getCallbackTone(entry: CouncilMemoryEntry): CouncilCallbackTone {
  if (entry.outcome === 'succeeded' && entry.previousOutcome === 'followed') {
    return 'smug';
  }
  if (entry.outcome === 'failed' && entry.previousOutcome === 'ignored') {
    return 'resentful';
  }
  return 'reflective';
}

function isCallbackEligible(state: GameState, civId: string, entry: CouncilMemoryEntry): boolean {
  if (entry.outcome === 'obsolete') return false;
  if (entry.lastCallbackTurn !== undefined && state.turn - entry.lastCallbackTurn < CALLBACK_SPACING_TURNS) {
    return false;
  }
  if (entry.subjects.cityId) {
    const city = state.cities[entry.subjects.cityId];
    if (city && city.owner !== civId) {
      return false;
    }
  }
  return true;
}

function getEntryPriority(entry: CouncilMemoryEntry): number {
  switch (entry.outcome) {
    case 'succeeded':
    case 'failed':
      return 3;
    case 'followed':
    case 'ignored':
      return 2;
    case 'pending':
    case undefined:
      return 1;
    default:
      return 0;
  }
}

export function rememberCouncilDecision(
  state: GameState,
  civId: string,
  entry: {
    key: string;
    advisor: AdvisorType;
    kind: CouncilMemoryKind;
    turn: number;
    subjects: CouncilMemorySubjects;
  },
): CouncilMemoryState {
  const ledger = ensureLedger(state, civId);
  const nextEntry: CouncilMemoryEntry = {
    ...entry,
    outcome: 'pending',
  };
  const existingIndex = ledger.entries.findIndex(candidate => candidate.key === entry.key);
  if (existingIndex >= 0) {
    ledger.entries[existingIndex] = {
      ...ledger.entries[existingIndex],
      ...nextEntry,
    };
  } else {
    ledger.entries.unshift(nextEntry);
  }
  return state.councilMemory!;
}

export function recordCouncilDisagreement(
  state: GameState,
  civId: string,
  disagreement: {
    key: string;
    turn: number;
    subjects: CouncilMemorySubjects;
    advisorFor: AdvisorType;
    advisorAgainst: AdvisorType;
    forAction: string;
    againstAction: string;
  },
): CouncilMemoryState {
  return rememberCouncilDecision(state, civId, {
    key: disagreement.key,
    advisor: disagreement.advisorFor,
    kind: 'advisor-disagreement',
    turn: disagreement.turn,
    subjects: {
      ...disagreement.subjects,
      advisorFor: disagreement.advisorFor,
      advisorAgainst: disagreement.advisorAgainst,
      forAction: disagreement.forAction,
      againstAction: disagreement.againstAction,
    },
  });
}

export function recordCouncilOutcome(
  state: GameState,
  civId: string,
  key: string,
  outcome: CouncilMemoryOutcome,
): CouncilMemoryState {
  const ledger = ensureLedger(state, civId);
  const entry = ledger.entries.find(candidate => candidate.key === key);
  if (entry) {
    entry.previousOutcome = entry.outcome ?? 'pending';
    entry.outcome = outcome;
  }
  return state.councilMemory!;
}

export function ageCouncilMemoryOutcomes(state: GameState, civId: string): CouncilMemoryState {
  const ledger = ensureLedger(state, civId);
  for (const entry of ledger.entries) {
    if ((entry.outcome ?? 'pending') === 'pending' && state.turn - entry.turn >= IGNORED_AFTER_TURNS) {
      entry.previousOutcome = entry.outcome ?? 'pending';
      entry.outcome = 'ignored';
    }
  }
  return state.councilMemory!;
}

export function evictObsoleteCouncilMemory(state: GameState, civId: string): CouncilMemoryState {
  const ledger = ensureLedger(state, civId);
  for (const entry of ledger.entries) {
    const cityId = entry.subjects.cityId;
    if (!cityId) continue;
    const city = state.cities[cityId];
    if (city && city.owner !== civId) {
      entry.previousOutcome = entry.outcome ?? 'pending';
      entry.outcome = 'obsolete';
    }
  }
  return state.councilMemory!;
}

export function formatCouncilMemoryEntry(entry: CouncilMemoryEntry, state: GameState, viewerId: string): string {
  const cityLabel = formatCityLabel(state, viewerId, entry.subjects.cityId);
  const civLabel = formatCivLabel(state, viewerId, entry.subjects.civId);
  switch (entry.kind) {
    case 'watch-rival-city':
      return `${ADVISOR_LABELS[entry.advisor]} marked ${cityLabel} in ${civLabel} for closer scrutiny.`;
    case 'wonder-plan': {
      const wonderName = getLegendaryWonderDefinition(entry.subjects.wonderId ?? '')?.name ?? 'that wonder';
      return `${ADVISOR_LABELS[entry.advisor]} urged the council to pursue ${wonderName}${entry.subjects.cityId ? ` through ${cityLabel}` : ''}.`;
    }
    case 'city-development':
      return `${ADVISOR_LABELS[entry.advisor]} pressed for investment in ${cityLabel}.`;
    case 'advisor-disagreement':
      return `${ADVISOR_LABELS[entry.subjects.advisorFor ?? entry.advisor]} wanted ${entry.subjects.forAction ?? 'one course'}, but ${ADVISOR_LABELS[entry.subjects.advisorAgainst ?? entry.advisor]} argued for ${entry.subjects.againstAction ?? 'another'}${entry.subjects.civId ? ` regarding ${civLabel}` : ''}.`;
    case 'frontier-expansion':
    default:
      return `${ADVISOR_LABELS[entry.advisor]} urged expansion toward ${formatRegionLabel(entry.subjects.regionKey)}${entry.subjects.cityId ? ` from ${cityLabel}` : ''}.`;
  }
}

export function getNextCouncilCallback(
  state: GameState,
  civId: string,
): { key: string; advisor: AdvisorType; message: string; tone: CouncilCallbackTone } | null {
  ageCouncilMemoryOutcomes(state, civId);
  evictObsoleteCouncilMemory(state, civId);
  const ledger = ensureLedger(state, civId);
  if (ledger.eraCallbackCount >= CALLBACKS_PER_ERA) {
    return null;
  }
  const entry = [...ledger.entries]
    .filter(candidate => isCallbackEligible(state, civId, candidate))
    .sort((left, right) => getEntryPriority(right) - getEntryPriority(left) || right.turn - left.turn)[0];
  if (!entry) {
    return null;
  }
  const tone = getCallbackTone(entry);
  const summary = formatCouncilMemoryEntry(entry, state, civId);
  const message = tone === 'smug'
    ? `${summary} The ${entry.advisor} clearly thinks the council was right.`
    : tone === 'resentful'
      ? `${summary} The ${entry.advisor} has not stopped brooding about being ignored.`
      : `${summary} The council has not forgotten that thread.`;
  return {
    key: entry.key,
    advisor: entry.advisor,
    message,
    tone,
  };
}

export function shouldEmitCouncilCallback(state: GameState, civId: string): boolean {
  return getNextCouncilCallback(state, civId) !== null;
}

export function markCouncilCallbackDelivered(state: GameState, civId: string, key: string): CouncilMemoryState {
  const ledger = ensureLedger(state, civId);
  const entry = ledger.entries.find(candidate => candidate.key === key);
  if (entry) {
    entry.lastCallbackTurn = state.turn;
    ledger.eraCallbackCount += 1;
  }
  return state.councilMemory!;
}

export function getCouncilMemoryEntries(state: GameState, civId: string): CouncilMemoryEntry[] {
  return ensureLedger(state, civId).entries;
}
