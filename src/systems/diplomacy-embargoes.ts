/**
 * Embargoes: pure `Embargo[]` / trade-route transitions and gating. Leaf --
 * depends on no other diplomacy module.
 */
import type { Embargo, TradeRoute, Treaty } from '@/core/types';
import type { CivilizationEra } from '@/systems/era-types';

// IDs must exist in TECH_TREE — see tests/systems/diplomacy-tech-gates.test.ts
export const EMBARGO_TECHS = ['currency', 'banking'];

export function canProposeEmbargo(
  completedTechs: string[],
  /** The acting civilization's own technology-derived era. Never World Age. */
  civilizationEra: CivilizationEra,
  treaties: Treaty[],
  targetCivId: string,
  isVassal: boolean = false,
): boolean {
  if (isVassal) return false;
  if (civilizationEra < 2 && !completedTechs.some(t => EMBARGO_TECHS.includes(t))) return false;
  const isAllied = treaties.some(t =>
    t.type === 'alliance' && (t.civA === targetCivId || t.civB === targetCivId),
  );
  return !isAllied;
}

export function enforceEmbargoes(
  embargoes: Embargo[],
  tradeRoutes: TradeRoute[],
  cityOwners: Record<string, string>,
): TradeRoute[] {
  return tradeRoutes.filter(route => {
    if (!route.foreignCivId) return true; // domestic routes unaffected
    const routeOwner = cityOwners[route.fromCityId];
    if (!routeOwner) return true;
    for (const embargo of embargoes) {
      const isParticipant = embargo.participants.includes(routeOwner);
      const targetsEmbargoed = route.foreignCivId === embargo.targetCivId;
      const isEmbargoedCivRoute =
        routeOwner === embargo.targetCivId &&
        embargo.participants.includes(route.foreignCivId);
      if ((isParticipant && targetsEmbargoed) || isEmbargoedCivRoute) return false;
    }
    return true;
  });
}

export function proposeEmbargo(
  embargoes: Embargo[],
  proposerId: string,
  targetCivId: string,
  turn: number,
): Embargo[] {
  const existing = embargoes.find(e => e.targetCivId === targetCivId);
  if (existing) {
    if (existing.participants.includes(proposerId)) return embargoes;
    return embargoes.map(e =>
      e.id === existing.id
        ? { ...e, participants: [...e.participants, proposerId] }
        : e,
    );
  }
  const id = `embargo-${turn}-${embargoes.length}`;
  return [
    ...embargoes,
    { id, targetCivId, participants: [proposerId], proposedTurn: turn },
  ];
}

export function joinEmbargo(embargoes: Embargo[], embargoId: string, civId: string): Embargo[] {
  return embargoes.map(e =>
    e.id === embargoId && !e.participants.includes(civId)
      ? { ...e, participants: [...e.participants, civId] }
      : e,
  );
}

export function leaveEmbargo(embargoes: Embargo[], embargoId: string, civId: string): Embargo[] {
  return embargoes.map(e =>
    e.id === embargoId
      ? { ...e, participants: e.participants.filter(p => p !== civId) }
      : e,
  );
}

export function cleanupEmbargoes(embargoes: Embargo[]): Embargo[] {
  return embargoes.filter(e => e.participants.length > 0);
}

export function shouldApplyLeaveEmbargoTreachery(
  embargo: Embargo,
  leavingCivId: string,
  warPairs: Array<{ civA: string; civB: string }>,
): boolean {
  const remaining = embargo.participants.filter(p => p !== leavingCivId);
  return remaining.some(p =>
    warPairs.some(w =>
      (w.civA === embargo.targetCivId && w.civB === p) ||
      (w.civB === embargo.targetCivId && w.civA === p),
    ),
  );
}
