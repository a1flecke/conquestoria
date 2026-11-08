/**
 * #419 PR 3 -- an AI that remembers who hit it.
 *
 * Both functions read only the AI's OWN espionage record (`attributedIncidents`), which holds an actor only once the
 * AI has proof of it (`tracedTurn`). Nothing here reads another civ's hidden state, so a grudge can never leak
 * information the AI does not have. Pure and deterministic: no randomness, ids sorted.
 */
import type { EventBus } from '@/core/event-bus';
import { goPublicAboutIncident } from '@/systems/espionage-system';

// Derived from the executor's own signature so this module does not add another importer to the shrink-only
// `@/core/types` compatibility barrel (#1361). Structurally identical to GameState.
type GameState = Parameters<typeof goPublicAboutIncident>[0];

/** How long after the evidence arrived an AI still holds a grudge. */
export const AI_GRUDGE_MEMORY_TURNS = 30;
/** Target-score bonus for the civ that most recently hit the AI (war is +100, a bad relationship up to +100). */
export const AI_GRUDGE_RECENT_BONUS = 60;
/** Target-score bonus for any other civ that hit the AI within memory. */
export const AI_GRUDGE_OLDER_BONUS = 30;

/**
 * Per-civ target-score bonus from the AI's own proven incidents. Only traced incidents count (the AI knows who did
 * it), only those within memory, and only the most recent attacker gets the larger bonus.
 */
export function getAiGrudgeBonuses(state: GameState, aiCivId: string): Record<string, number> {
  const incidents = Object.values(state.espionage?.[aiCivId]?.attributedIncidents ?? {})
    .filter(incident =>
      incident.targetCivId === aiCivId
      && incident.actorCivId !== aiCivId
      && incident.tracedTurn !== undefined
      && state.turn - incident.tracedTurn <= AI_GRUDGE_MEMORY_TURNS)
    .sort((a, b) =>
      (b.tracedTurn ?? 0) - (a.tracedTurn ?? 0)
      || b.landedTurn - a.landedTurn
      || a.id.localeCompare(b.id));
  const bonuses: Record<string, number> = {};
  incidents.forEach((incident, index) => {
    if (bonuses[incident.actorCivId] !== undefined) return;
    bonuses[incident.actorCivId] = index === 0 ? AI_GRUDGE_RECENT_BONUS : AI_GRUDGE_OLDER_BONUS;
  });
  return bonuses;
}

/**
 * The AI uses Go public whenever it holds a usable confirmed incident, through the same paired query/executor the
 * human panel uses (`goPublicAboutIncident` re-runs the denial before its first write). A refused incident is simply
 * skipped. Announces each success exactly as the human path does.
 */
export function applyAiGoPublic(state: GameState, aiCivId: string, bus: EventBus): GameState {
  const incidentIds = Object.keys(state.espionage?.[aiCivId]?.attributedIncidents ?? {}).sort();
  let next = state;
  for (const incidentId of incidentIds) {
    const result = goPublicAboutIncident(next, aiCivId, incidentId);
    if (!result.ok) continue;
    next = result.state;
    bus.emit('espionage:went-public', {
      civId: aiCivId,
      culpritCivId: result.culpritCivId,
      partnerCivIds: result.partnerCivIds,
      missionType: result.missionType,
    });
  }
  return next;
}
