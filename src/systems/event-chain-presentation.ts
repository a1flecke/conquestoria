// #990: the viewer-scoped presentation layer for event chains — "how does a
// chain look to a player," never read directly by UI. Mirrors the codebase's
// `*ForPlayer`/presentation convention (see `.claude/rules/ui-panels.md`'s
// Privacy And Discovery section): a chain belongs to exactly one civ
// (`targetCivId`) and this module never surfaces one to any other. There is
// no cross-civ projection at all here (unlike e.g. rivalry/war presentation,
// which redacts an omniscient fact for a foreign viewer) because a chain has
// no public rule — it simply never renders for anyone but its own civ, which
// `buildCouncilAgenda`'s existing per-viewer call convention
// (`buildCouncilAgenda(state, civId)`, always called with `state.currentPlayer`)
// already guarantees hot-seat isolation for.
import type { CouncilCard, GameEvents, GameState } from '@/core/types';
import { getEventChainDefinition } from './event-chain-definitions';

export const EVENT_CHAIN_CARD_ID_PREFIX = 'event-chain-choice:';

export function buildEventChainCardId(chainId: string, optionId: string): string {
  return `${EVENT_CHAIN_CARD_ID_PREFIX}${chainId}:${optionId}`;
}

export function parseEventChainCardId(cardId: string): { chainId: string; optionId: string } | null {
  if (!cardId.startsWith(EVENT_CHAIN_CARD_ID_PREFIX)) return null;
  const rest = cardId.slice(EVENT_CHAIN_CARD_ID_PREFIX.length);
  const separatorIndex = rest.lastIndexOf(':');
  if (separatorIndex === -1) return null;
  return { chainId: rest.slice(0, separatorIndex), optionId: rest.slice(separatorIndex + 1) };
}

const CHAIN_TITLE_BY_KIND: Record<string, string> = {
  'financial-panic': 'Financial Panic',
};

const CHAIN_WHY_BY_KIND: Record<string, string> = {
  'financial-panic': 'The treasury is running dry and the Council is divided on how to respond.',
};

/** One card per pending option, for the viewing civ's OWN chain(s) only. A
 * chain with no `pendingChoice` (still waiting on its delayed consequence, or
 * already resolved) contributes nothing here — there is nothing for the
 * player to decide right now. */
export function getEventChainDramaCards(state: GameState, civId: string): CouncilCard[] {
  const cards: CouncilCard[] = [];
  for (const chain of Object.values(state.activeEventChains ?? {})) {
    if (chain.targetCivId !== civId) continue;
    if (!chain.pendingChoice) continue;
    const definition = getEventChainDefinition(chain.kind);
    const stage = definition.stages.find(s => s.id === chain.pendingChoice!.stageId);
    if (!stage?.options) continue;
    for (const option of stage.options) {
      cards.push({
        id: buildEventChainCardId(chain.id, option.id),
        advisor: 'treasurer',
        bucket: 'drama',
        title: CHAIN_TITLE_BY_KIND[chain.kind] ?? 'A Decision Point',
        summary: option.description,
        why: CHAIN_WHY_BY_KIND[chain.kind] ?? 'The Council awaits your decision.',
        priority: 70,
        actionLabel: option.label,
      });
    }
  }
  return cards;
}

/** #993: the "big moment" ceremony payload for a chain's genuine conclusion.
 * Viewer-scoped identically to `getEventChainDramaCards` -- a chain belongs to
 * exactly one civ, and this is never built for anyone else. Only the
 * currently-active human ever sees a full-screen moment: an AI civ's or a
 * different hot-seat player's chain still reaches them through the ordinary
 * `routeEventChainResolved` notification (their own log entry), never a
 * ceremony they can't be looking at. */
export interface EventChainConclusionMomentItem {
  civId: string;
  chainId: string;
  kind: GameEvents['eventchain:resolved']['kind'];
  title: string;
  optionLabel: string;
  optionDescription: string;
}

export function buildEventChainConclusionMomentItem(
  state: GameState,
  event: GameEvents['eventchain:resolved'],
): EventChainConclusionMomentItem | null {
  if (event.outcome !== 'resolved') return null;
  if (state.currentPlayer !== event.civId) return null;

  const definition = getEventChainDefinition(event.kind);
  const onsetChoice = event.priorChoices.find(choice => choice.stageId === 'onset');
  const onsetStage = definition.stages.find(stage => stage.id === 'onset');
  const option = onsetChoice && onsetStage?.options?.find(candidate => candidate.id === onsetChoice.optionId);
  if (!option) return null;

  return {
    civId: event.civId,
    chainId: event.chainId,
    kind: event.kind,
    title: CHAIN_TITLE_BY_KIND[event.kind] ?? 'A Decision Point',
    optionLabel: option.label,
    optionDescription: option.description,
  };
}
