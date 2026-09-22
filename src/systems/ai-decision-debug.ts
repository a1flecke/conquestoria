/**
 * #1090: dev-only correlation from a player-facing `StrategicWarning` back to the canonical
 * AI trace it came from. Never imported by `src/ui/` or `src/presentation/` -- enforced by
 * `tests/systems/ai-decision-debug.test.ts`'s structural grep. This module reads live
 * `opponentAI` state directly (the omniscient view), so any caller must be a developer
 * console/overlay, never a player-facing surface.
 *
 * This is a read-only lookup, not a new persisted trace log: `warningKey` already uniquely
 * identifies which decision produced a given warning, and the canonical state it names
 * (a barbarian camp's plan, a major civ's primary plan, its national intent) is already
 * inspectable in `GameState` -- this just does the lookup and formats it as a plain object.
 */
import type { GameEvents, GameState } from '@/core/types';
import { resolveBarbarianArchetype } from '@/systems/barbarian-archetype';

export interface WarningTrace {
  warningKey: string;
  kind: GameEvents['ai:strategic-warning']['kind'];
  actorId: string;
  source: 'barbarian-camp' | 'major-civ-plan' | 'major-civ-posture' | 'pirate-faction' | 'unresolved';
  detail: Record<string, unknown>;
}

/**
 * Looks up the canonical AI state a given `StrategicWarning` was derived from. Returns a
 * plain, JSON-shaped object suitable for a console/overlay to print; never throws on a
 * warning whose source has since changed or been cleared -- reports `source: 'unresolved'`
 * with an explanatory `reason` instead, since a warning and the live state it names are
 * observed at different points in time by design (the warning is a transition snapshot).
 */
export function describeWarningTrace(
  state: GameState,
  warning: GameEvents['ai:strategic-warning'],
): WarningTrace {
  const base = { warningKey: warning.warningKey, kind: warning.kind, actorId: warning.actorId };

  if (warning.actorId.startsWith('barbarian:')) {
    const campId = warning.actorId.slice('barbarian:'.length);
    const plan = state.opponentAI?.barbarianCamps[campId];
    if (!plan) return { ...base, source: 'unresolved', detail: { reason: 'camp plan no longer present' } };
    return {
      ...base,
      source: 'barbarian-camp',
      detail: {
        archetype: resolveBarbarianArchetype(state, campId),
        objective: plan.objective,
        phase: plan.phase,
        reasonCodes: plan.reasonCodes,
        commitment: plan.commitment,
      },
    };
  }

  // Matches presentStrategicWarning's own pirate discriminator (actorId prefix), not kind
  // alone -- 'raid'/'blockade' kinds are also produced by non-pirate actors.
  if (warning.actorId.startsWith('pirate')) {
    const intel = state.pirates?.intelByCiv[warning.viewerId]?.[warning.actorId];
    if (!intel) return { ...base, source: 'unresolved', detail: { reason: 'pirate intel no longer present' } };
    return {
      ...base,
      source: 'pirate-faction',
      detail: { knownBehavior: intel.knownBehavior, level: intel.level },
    };
  }

  if (warning.kind === 'posture-shift') {
    const intent = state.opponentAI?.nationalIntentByCiv[warning.actorId];
    if (!intent) return { ...base, source: 'unresolved', detail: { reason: 'national intent no longer present' } };
    return {
      ...base,
      source: 'major-civ-posture',
      detail: {
        current: intent.current,
        previous: intent.previous,
        selectedTurn: intent.selectedTurn,
        shockActive: intent.shockActive,
        reasonCodes: intent.reasonCodes,
      },
    };
  }

  const plan = state.opponentAI?.majorCivs[warning.actorId]?.primaryPlan;
  if (!plan) return { ...base, source: 'unresolved', detail: { reason: 'primary plan no longer present' } };
  return {
    ...base,
    source: 'major-civ-plan',
    detail: {
      objective: plan.objective,
      phase: plan.phase,
      reasonCodes: plan.reasonCodes,
      commitment: plan.commitment,
    },
  };
}
