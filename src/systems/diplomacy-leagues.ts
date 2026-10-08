/**
 * Defensive leagues: pure `DefensiveLeague[]` transitions. No GameState, no
 * dependency on any other diplomacy module (leaf) -- vassalage consumes it,
 * never the reverse.
 */
import type { DefensiveLeague } from '@/core/types/diplomacy';

// IDs must exist in TECH_TREE — see tests/systems/diplomacy-tech-gates.test.ts
export const WRITING_TECHS = ['writing'];

export function canProposeLeague(
  completedTechs: string[],
  _leagues: DefensiveLeague[],
  currentLeague: DefensiveLeague | null,
  isVassal: boolean = false,
  relationships?: Record<string, number>,
  targetCivId?: string,
): boolean {
  if (isVassal) return false;
  if (currentLeague) return false;
  if (!completedTechs.some(t => WRITING_TECHS.includes(t))) return false;
  if (targetCivId && relationships && (relationships[targetCivId] ?? 0) <= 0) return false;
  return true;
}

export function proposeLeague(
  leagues: DefensiveLeague[],
  civA: string,
  civB: string,
  turn: number,
): DefensiveLeague[] {
  return [
    ...leagues,
    { id: `league-${turn}-${leagues.length}`, members: [civA, civB], formedTurn: turn },
  ];
}

export function inviteToLeague(
  leagues: DefensiveLeague[],
  leagueId: string,
  civId: string,
): DefensiveLeague[] {
  return leagues.map(l =>
    l.id === leagueId && !l.members.includes(civId)
      ? { ...l, members: [...l.members, civId] }
      : l,
  );
}

export function votePetition(
  memberRelationships: Record<string, number>,
): boolean {
  const votes = Object.values(memberRelationships);
  const yesVotes = votes.filter(r => r > 10).length;
  return yesVotes > votes.length / 2;
}

export function petitionLeague(
  leagues: DefensiveLeague[],
  leagueId: string,
  civId: string,
  accepted: boolean,
): DefensiveLeague[] {
  if (!accepted) return leagues;
  return inviteToLeague(leagues, leagueId, civId);
}

export function leaveLeague(
  leagues: DefensiveLeague[],
  leagueId: string,
  civId: string,
): { leagues: DefensiveLeague[]; dissolvedLeagueIds: string[] } {
  const updated = leagues.map(l =>
    l.id === leagueId
      ? { ...l, members: l.members.filter(m => m !== civId) }
      : l,
  );
  const dissolvedLeagueIds = updated.filter(l => l.members.length < 2).map(l => l.id);
  return { leagues: updated.filter(l => l.members.length >= 2), dissolvedLeagueIds };
}

export function shouldApplyLeaveLeagueTreachery(
  league: DefensiveLeague,
  leavingCivId: string,
  warPairs: Array<{ civA: string; civB: string }>,
): boolean {
  const remaining = league.members.filter(m => m !== leavingCivId);
  return remaining.some(member =>
    warPairs.some(w => w.civA === member || w.civB === member),
  );
}

export function checkLeagueDissolution(
  leagues: DefensiveLeague[],
  atWarPairs: Array<{ civA: string; civB: string }>,
): DefensiveLeague[] {
  return leagues.filter(league => {
    for (const pair of atWarPairs) {
      if (league.members.includes(pair.civA) && league.members.includes(pair.civB)) {
        return false;
      }
    }
    return true;
  });
}

export function getLeagueForCiv(
  leagues: DefensiveLeague[],
  civId: string,
): DefensiveLeague | null {
  return leagues.find(l => l.members.includes(civId)) ?? null;
}

export function triggerLeagueDefense(
  leagues: DefensiveLeague[],
  defenderId: string,
  attackerId: string,
): string[] {
  const league = leagues.find(l => l.members.includes(defenderId));
  if (!league) return [];
  return league.members.filter(m => m !== defenderId && m !== attackerId);
}
