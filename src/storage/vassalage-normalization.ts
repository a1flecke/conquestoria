import type { GameState, PendingDiplomaticRequest, VassalageState } from '@/core/types';
import { PENDING_DIPLOMATIC_REQUEST_TTL_TURNS, VASSALAGE_PROTECTION_TURNS } from '@/systems/diplomacy-system';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';

function count(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

/** Pure repair of serialized records. Loading never creates consent or gameplay effects. */
export function normalizeVassalage(state: GameState): GameState {
  const civs = state.civilizations ?? {};
  const living = (id: unknown): id is string => typeof id === 'string'
    && Object.hasOwn(civs, id) && getCivilizationLiveness(state, id).living;
  const records: Record<string, VassalageState> = Object.create(null);
  for (const [id, civ] of Object.entries(civs)) {
    const raw = civ.diplomacy?.vassalage;
    const vassals = Array.isArray(raw?.vassals) ? [...new Set(raw.vassals.filter(v => living(v) && v !== id))] : [];
    records[id] = {
      overlord: living(raw?.overlord) && raw.overlord !== id ? raw.overlord : null,
      vassals,
      peakCities: count(raw?.peakCities), peakMilitary: count(raw?.peakMilitary),
      protectionScore: Math.min(100, count(raw?.protectionScore, 100)),
      protectionTimers: [],
    };
  }
  const pairs = new Map<string, string>();
  for (const [id, record] of Object.entries(records)) {
    const lord = record.overlord;
    if (!living(id) || !lord || records[lord].overlord || record.vassals.length || !records[lord].vassals.includes(id)) continue;
    const treaty = (civId: string) => civs[civId].diplomacy?.treaties?.some(t => t?.type === 'vassalage'
      && ((t.civA === id && t.civB === lord) || (t.civB === id && t.civA === lord)));
    if (treaty(id) && treaty(lord)) pairs.set(id, lord);
  }
  for (const [id, record] of Object.entries(records)) {
    record.overlord = pairs.get(id) ?? null;
    record.vassals = record.vassals.filter(v => pairs.get(v) === id);
    if (!record.overlord) { record.protectionScore = 100; continue; }
    const rawTimers = civs[id].diplomacy.vassalage?.protectionTimers;
    const seen = new Set<string>();
    for (const timer of Array.isArray(rawTimers) ? rawTimers : []) {
      if (!timer || !Number.isInteger(timer.turnsRemaining) || timer.turnsRemaining <= 0) continue;
      const attacker = timer.attackerCivId;
      const validEnemy = living(attacker) || (typeof attacker === 'string' && Object.hasOwn(state.minorCivs ?? {}, attacker) && !state.minorCivs[attacker].isDestroyed);
      if (!validEnemy || attacker === id || attacker === record.overlord || seen.has(attacker)
        || !civs[id].diplomacy.atWarWith?.includes(attacker)
        || civs[record.overlord].diplomacy.atWarWith?.includes(attacker)) continue;
      seen.add(attacker);
      record.protectionTimers.push({ attackerCivId: attacker, turnsRemaining: Math.min(VASSALAGE_PROTECTION_TURNS, count(timer.turnsRemaining, VASSALAGE_PROTECTION_TURNS)) });
    }
  }
  const civilizations = Object.fromEntries(Object.entries(civs).map(([id, civ]) => [id, {
    ...civ, diplomacy: { ...civ.diplomacy, vassalage: records[id],
      treaties: (civ.diplomacy?.treaties ?? []).filter(t => t.type !== 'vassalage'
        || pairs.get(t.civA) === t.civB || pairs.get(t.civB) === t.civA),
    },
  }]));
  const seenIds = new Set<string>();
  const seenPairs = new Set<string>();
  const pendingDiplomacyRequests: PendingDiplomaticRequest[] = [];
  const rawRequests = Array.isArray(state.pendingDiplomacyRequests) ? state.pendingDiplomacyRequests : [];
  for (const r of rawRequests) {
    if (!r || typeof r.id !== 'string' || !r.id || seenIds.has(r.id)
      || !living(r.fromCivId) || !living(r.toCivId) || r.fromCivId === r.toCivId
      || !Number.isInteger(r.turnIssued) || r.turnIssued > state.turn || r.turnIssued < 0
      || state.turn - r.turnIssued >= PENDING_DIPLOMATIC_REQUEST_TTL_TURNS) continue;
    if (r.type !== 'peace' && r.type !== 'treaty' && r.type !== 'independence') continue;
    if (r.type === 'treaty' && !['non_aggression_pact', 'trade_agreement', 'open_borders', 'alliance', 'arms_control_pact', 'vassalage'].includes(r.treatyType ?? '')) continue;
    if (r.type === 'independence' && pairs.get(r.fromCivId) !== r.toCivId) continue;
    if (r.treatyType === 'vassalage' && (records[r.fromCivId].overlord || records[r.toCivId].overlord || records[r.fromCivId].vassals.length)) continue;
    const key = JSON.stringify([[r.fromCivId, r.toCivId].sort(), r.type, r.treatyType ?? null]);
    if (seenPairs.has(key)) continue;
    seenIds.add(r.id); seenPairs.add(key);
    pendingDiplomacyRequests.push({ ...r });
  }
  return { ...state, civilizations, pendingDiplomacyRequests };
}
