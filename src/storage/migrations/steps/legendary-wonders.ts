import type { CombatRole, GameState, LegendaryWonderMilitaryFact, LegendaryWonderTacticalEffectState } from '@/core/types';
import { UNIT_ROLE_DEFINITIONS } from '@/systems/combat-role-definitions';

/**
 * Schemas 21 and 22 — legendary-wonder military facts and owner-scoped tactical
 * effect state. Both validate-and-scrub: a malformed persisted fact or granted
 * role is dropped rather than trusted.
 */

const MILITARY_ROLES = new Set(Object.values(UNIT_ROLE_DEFINITIONS).map(definition => definition.primaryRole));

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isTurn(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isMilitaryQuestFact(value: unknown): value is LegendaryWonderMilitaryFact {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fact = value as Record<string, unknown>;
  if (!isNonEmptyString(fact.id) || !isNonEmptyString(fact.civId) || !isTurn(fact.turn)) return false;
  switch (fact.kind) {
    case 'surviving-combat-win':
      return isNonEmptyString(fact.unitId) && typeof fact.role === 'string' && MILITARY_ROLES.has(fact.role as never);
    case 'fort-completed':
      return isNonEmptyString(fact.cityId)
        && Boolean(fact.position && typeof fact.position === 'object'
          && Number.isInteger((fact.position as Record<string, unknown>).q)
          && Number.isInteger((fact.position as Record<string, unknown>).r));
    case 'fortification-repel':
      return isNonEmptyString(fact.unitId) && (fact.tier === 'fort' || fact.tier === 'citadel');
    case 'successful-interception':
      return isNonEmptyString(fact.interceptorId);
    default:
      return false;
  }
}

export function normalizeLegendaryWonderMilitaryFacts(state: GameState): GameState {
  const history = state.legendaryWonderHistory;
  const rawFacts: unknown[] = Array.isArray(history?.militaryFacts) ? history.militaryFacts : [];
  const seen = new Set<string>();
  const militaryFacts = rawFacts.filter(isMilitaryQuestFact).filter(fact => {
    if (seen.has(fact.id)) return false;
    seen.add(fact.id);
    return true;
  });
  const unchanged = Array.isArray(history?.militaryFacts)
    && history!.militaryFacts!.length === militaryFacts.length
    && history!.militaryFacts!.every((fact, index) => fact === militaryFacts[index]);
  if (unchanged) return state;
  return {
    ...state,
    legendaryWonderHistory: {
      destroyedStrongholds: history?.destroyedStrongholds ?? [],
      discoveredSites: history?.discoveredSites ?? [],
      ...(history?.networkPlanResolutions ? { networkPlanResolutions: history.networkPlanResolutions } : {}),
      militaryFacts,
    },
  };
}

function normalizeTacticalGrantedRoles(value: unknown): CombatRole[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<CombatRole>();
  return value.filter((role): role is CombatRole =>
    typeof role === 'string' && MILITARY_ROLES.has(role as never) && !seen.has(role as CombatRole) && Boolean(seen.add(role as CombatRole)),
  );
}

export function normalizeLegendaryWonderTacticalEffects(state: GameState): GameState {
  const raw = state.legendaryWonderTacticalEffects as unknown;
  const candidate = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const validCivIds = new Set(Object.keys(state.civilizations));
  const rawGrants = candidate.trainingGrantsByCiv && typeof candidate.trainingGrantsByCiv === 'object' && !Array.isArray(candidate.trainingGrantsByCiv)
    ? candidate.trainingGrantsByCiv as Record<string, unknown>
    : {};
  const trainingGrantsByCiv: LegendaryWonderTacticalEffectState['trainingGrantsByCiv'] = {};
  for (const [civId, value] of Object.entries(rawGrants)) {
    if (!validCivIds.has(civId) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    if (!Number.isInteger(record.era) || Number(record.era) < 1) continue;
    const grantedRoles = normalizeTacticalGrantedRoles(record.grantedRoles);
    if (grantedRoles.length === 0) continue;
    trainingGrantsByCiv[civId] = { era: Number(record.era), grantedRoles };
  }
  const rawClaims = candidate.interceptionClaimTurnByCiv && typeof candidate.interceptionClaimTurnByCiv === 'object' && !Array.isArray(candidate.interceptionClaimTurnByCiv)
    ? candidate.interceptionClaimTurnByCiv as Record<string, unknown>
    : {};
  const interceptionClaimTurnByCiv: Record<string, number> = {};
  for (const [civId, turn] of Object.entries(rawClaims)) {
    if (validCivIds.has(civId) && isTurn(turn)) interceptionClaimTurnByCiv[civId] = turn;
  }
  const legendaryWonderTacticalEffects = { trainingGrantsByCiv, interceptionClaimTurnByCiv };
  const previous = state.legendaryWonderTacticalEffects;
  if (JSON.stringify(previous) === JSON.stringify(legendaryWonderTacticalEffects)) return state;
  return { ...state, legendaryWonderTacticalEffects };
}
