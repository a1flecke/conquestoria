/**
 * General-notification bucket for events that don't cleanly fit any of the
 * other domain registrars (#787 phase 7): village-visit outcomes, advisor
 * toasts, and AI strategic warnings. Moved verbatim from `main.ts`.
 */
import { routeStrategicWarning } from '@/ui/notification-routing';
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
    bus.on('advisor:message', ({ advisor, message, icon }) => {
      ctx.showNotification(`${icon} ${message}`, 'info');
    }),
    bus.on('ai:strategic-warning', event => {
      // #551: notifier.deliver (the delivery contract) already queues to
      // pendingEvents for a non-active hot-seat recipient -- no separate
      // queueStrategicWarningPendingEvent call needed here.
      routeStrategicWarning(event, ctx.notifier.deliver);
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
