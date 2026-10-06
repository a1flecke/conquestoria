/**
 * The AI's tribute-demand candidate (#1334). It asks exactly the question a human is asked: the shared legality
 * resolver `getTributeDemandEligibility`, fed this civ's own already-built perception as its intel (so no visibility
 * is rebuilt per target). There is no AI-only strength shortcut, no difficulty input and no personality gate: a demand
 * is legal or it is not, and the pending/active/cooldown rules cap it at one demand per pair per ten rounds.
 *
 * At most one demand is chosen per civ per round: the target the civ believes it outmatches the most (ratio of its own
 * strength to the target's upper uncertainty bound), ties broken by civ id for determinism.
 */
import type { GameState } from '@/core/types';
import { getTributeDemandEligibility } from '@/systems/diplomacy-tribute';
import { estimatePerceivedCivStrength, type ViewerMilitaryIntel } from '@/systems/diplomatic-strength';
import { resolveCivilizationEra } from '@/systems/tech-definitions';

export function chooseTributeDemandTarget(
  state: GameState,
  civId: string,
  intel: ViewerMilitaryIntel & { knownCivIds: readonly string[] },
  excludedTargets: ReadonlySet<string> = new Set(),
): string | null {
  const civ = state.civilizations[civId];
  if (!civ) return null;
  const era = resolveCivilizationEra(civ.techState.completed);
  const own = estimatePerceivedCivStrength(intel, civId, era).midpoint;
  let best: { id: string; ratio: number } | null = null;
  for (const targetId of [...intel.knownCivIds].sort()) {
    if (excludedTargets.has(targetId)) continue;
    if (!getTributeDemandEligibility(state, civId, targetId, { intel }).ok) continue;
    const theirs = estimatePerceivedCivStrength(intel, targetId, era).uncertaintyUpper;
    const ratio = theirs > 0 ? own / theirs : Number.POSITIVE_INFINITY;
    if (!best || ratio > best.ratio) best = { id: targetId, ratio };
  }
  return best?.id ?? null;
}
