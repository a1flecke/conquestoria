import type { PresentationRegistrar } from '@/presentation/register-all';
import { SFX } from '@/audio/sfx';
import { hasMetCivilization } from '@/systems/discovery-system';

/**
 * #545 MR4 defender-notification, consolidated in MR5 into the single
 * SFX + notification trigger for EVERY strategic strike, human- or
 * AI-initiated. MR4 called SFX.strategicStrike() directly from the two UI
 * controllers; MR5 is the first MR where a strike can happen with no UI
 * controller in the loop at all (an AI striking the human, or another AI),
 * so this registrar is now the only place that plays the SFX -- see
 * docs/superpowers/plans/2026-08-26-issue-545-mr5-ai-doctrine.md Task 9 for
 * the design-review finding this fixes.
 *
 * Notification: the struck civ (recipientCivId) is always told, regardless
 * of visibility -- you always know when it happens to you (unchanged MR4
 * behavior). Additionally, every OTHER human-controlled civ that has met
 * both the actor and the recipient gets a witness-flavor notification
 * (hot-seat's second human, or any future third+ human slot) -- scoped to
 * human civs only, since a flavor notification has no gameplay purpose for
 * an AI civ that isn't a party to the strike.
 *
 * SFX: plays at most once, gated on state.currentPlayer (the active
 * viewer) being a direct party (their own launch, or they were struck) or a
 * visibility-gated witness to an AI-vs-AI strike -- matching the existing
 * register-beast-presentation.ts `slayerCivId === state.currentPlayer`
 * precedent for viewer-specific effects.
 */
export const registerStrategicStrikePresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('city:strategic-strike', ({ cityId, recipientCivId, actorCivId, goldLost }) => {
      const state = ctx.session.getState();
      const cityName = state.cities[cityId]?.name ?? 'A city';
      const goldLine = goldLost > 0 ? ` and lost ${goldLost} gold` : '';
      ctx.notifier.deliver(recipientCivId, `${cityName} was struck by a strategic weapon${goldLine}.`, 'warning');

      const actorName = state.civilizations[actorCivId]?.name ?? 'A civilization';
      for (const [witnessCivId, witnessCiv] of Object.entries(state.civilizations)) {
        if (!witnessCiv.isHuman) continue;
        if (witnessCivId === actorCivId || witnessCivId === recipientCivId) continue;
        if (!hasMetCivilization(state, witnessCivId, actorCivId)) continue;
        if (!hasMetCivilization(state, witnessCivId, recipientCivId)) continue;
        ctx.notifier.deliver(witnessCivId, `${actorName} struck ${cityName} with a strategic weapon!`, 'warning');
      }

      const viewer = state.currentPlayer;
      const isParty = viewer === actorCivId || viewer === recipientCivId;
      const isWitness = !isParty
        && hasMetCivilization(state, viewer, actorCivId)
        && hasMetCivilization(state, viewer, recipientCivId);
      if (isParty || isWitness) SFX.strategicStrike();
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
