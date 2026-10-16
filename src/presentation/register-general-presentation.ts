/**
 * General-notification bucket for events that don't cleanly fit any of the
 * other domain registrars (#787 phase 7): village-visit outcomes, advisor
 * toasts, and AI strategic warnings. Moved verbatim from `main.ts`.
 */
import { routeStrategicWarning } from '@/ui/notification-routes/world-routes';
import { resolveGeneralDefinition } from '@/systems/great-general-definitions';
import { getGeneralPresentation } from '@/systems/great-general-presentation';
import { getVisibility } from '@/systems/fog-of-war';
import type { PresentationRegistrar } from '@/presentation/register-all';

export const registerGeneralPresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('village:visited', ({ civId, outcome, message }) => {
      if (outcome === 'gold') ctx.resetAdvisorMessage('treasurer_village_gold');
      if (outcome === 'science') ctx.resetAdvisorMessage('scholar_village_science');
      if (outcome === 'free_tech') ctx.resetAdvisorMessage('scholar_village_tech');
      ctx.checkAdvisors();
      ctx.notifier.deliver(civId, message, outcome === 'ambush' || outcome === 'illness' ? 'warning' : 'success');
    }),
    // viewer-scoped by design: advisors run for the active player only (#551).
    bus.on('advisor:message', ({ message, icon }) => {
      ctx.showNotification(`${icon} ${message}`, 'info');
    }),
    bus.on('ai:strategic-warning', event => {
      // #551: notifier.deliver (the delivery contract) already queues to
      // pendingEvents for a non-active hot-seat recipient -- no separate
      // queueStrategicWarningPendingEvent call needed here.
      routeStrategicWarning(event, ctx.notifier.deliver);
    }),
    // #544 MR4: first genuine Great-General event in this file -- the
    // "General-notification bucket" name is a naming coincidence with the
    // Great General game feature, not a dedicated home for it; this event
    // just happens to fit "doesn't cleanly belong to any other domain
    // registrar" as well as everything else already here.
    // #889: the player's own command gets a result toast and a map effect. Own-input feedback, so it is the acting
    // viewer's `showNotification`, and only for the viewing owner: another seat's command is never shown here.
    bus.on('general:command-used', ({ moment }) => {
      const state = ctx.session.getState();
      if (moment.civId !== state.currentPlayer) return;
      ctx.showNotification(moment.summary, moment.isFinalCommand ? 'warning' : 'success');
      if (!ctx.isPresentationSuppressed()) ctx.playGeneralAbility(moment);
    }),
    // #889: a Last Stand hold absorbed a lethal blow -- human or AI executor alike. The owner is told in words; a
    // rival's save is a map effect only, and only where the viewer can currently see the hex (no name, no text).
    bus.on('general:last-stand-held', ({ civId, generalDefinitionId, unitId, coord }) => {
      const state = ctx.session.getState();
      const definition = resolveGeneralDefinition(state, generalDefinitionId);
      if (!definition) return;
      // `deliver` queues the sentence for a human seat that is not the one looking (hot seat); an AI owner gets none.
      if (state.civilizations[civId]?.isHuman) {
        ctx.notifier.deliver(civId, `${definition.name}'s line held: a unit survived a blow that should have destroyed it.`, 'success');
      }
      const visibility = state.civilizations[state.currentPlayer]?.visibility;
      const viewerSeesIt = civId === state.currentPlayer
        || (visibility !== undefined && getVisibility(visibility, coord) === 'visible');
      if (!viewerSeesIt || ctx.isPresentationSuppressed()) return;
      const presentation = getGeneralPresentation(definition);
      ctx.playGeneralAbility({
        kind: 'last-stand',
        civId,
        generalUnitId: unitId,
        generalName: definition.name,
        isFinalCommand: false,
        generalCoord: coord,
        affectedCoords: [coord],
        affectedCount: 1,
        accent: presentation.primary,
        glow: presentation.secondary,
        summary: '',
      });
    }),
    bus.on('general:retired', ({ civId, generalName, message, generalDefinitionId }) => {
      ctx.notifier.deliver(civId, `${generalName} has retired. ${message}`, 'info');
      // #889: the owner also gets the retirement moment (crest + their own career line + a way into the Hall of Fame),
      // queued behind any other ceremony. Owner-scoped: only the viewing player's own General is ever shown, and the
      // coordinator drops a queued moment on a hot-seat handoff (the toast above is what a non-viewing owner receives).
      const state = ctx.session.getState();
      if (civId !== state.currentPlayer) return;
      const definition = resolveGeneralDefinition(state, generalDefinitionId);
      ctx.ceremonies.enqueueGeneralRetirement({
        civId,
        generalDefinitionId,
        name: generalName,
        presentation: definition ? getGeneralPresentation(definition) : undefined,
        careerLine: message,
      });
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
