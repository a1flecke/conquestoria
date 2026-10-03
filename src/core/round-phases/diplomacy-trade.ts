import type { GameState } from '@/core/types';
import { joinEmbargo, cleanupEmbargoes } from '@/systems/diplomacy-embargoes';
import { processVassalageTurn } from '@/systems/diplomacy-vassalage';
import { scrubStaleForeignRoutes, scrubEmbargoedRoutes } from '@/systems/trade-system';
import { advanceRouteRunners } from '@/systems/unit-movement-system';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Standing obligations and trade routes: vassalage advances (human decisions stay recipient-owned, #910); vassals
 * join their overlord's embargoes; routes made stale by war or hostile relations, and routes to embargoed civs,
 * are terminated (spent embargoes are cleaned up); caravan route-runners advance.
 */
function runDiplomacyTrade(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus } = context;
  // #910: human decisions remain recipient-owned; this only advances obligations.
  newState = processVassalageTurn(newState, bus);

  // --- Vassal auto-joins overlord's embargoes ---
  if (newState.embargoes) {
    for (const [civId, civ] of Object.entries(newState.civilizations)) {
      const overlordId = civ.diplomacy?.vassalage.overlord;
      if (!overlordId) continue;
      for (const embargo of newState.embargoes) {
        if (embargo.participants.includes(overlordId) && !embargo.participants.includes(civId)) {
          newState.embargoes = joinEmbargo(newState.embargoes, embargo.id, civId);
        }
      }
    }
  }

  // --- S6a: terminate stale foreign routes (war / hostile relations) ---
  if (newState.marketplace) {
    newState = scrubStaleForeignRoutes(newState, bus);
  }

  // --- S6a: terminate routes to embargoed civs ---
  if (newState.embargoes && newState.marketplace) {
    newState = scrubEmbargoedRoutes(newState, bus);
    newState = { ...newState, embargoes: cleanupEmbargoes(newState.embargoes) };
  }

  // --- S6b: advance caravan route-runners ---
  if (newState.marketplace) {
    newState = advanceRouteRunners(newState, bus);
  }
  return newState;
}

export const diplomacyTradePhase: RoundPhase = { id: 'diplomacy-trade', run: runDiplomacyTrade };
