/**
 * Sequences the three module-scope statements that used to run
 * unconditionally as an import side effect at the bottom of `main.ts`
 * (#787 phase 10): register the 72-registration presentation layer,
 * register minor-civ notification listeners, then initialize the game
 * session.
 *
 * **Deviation from this arc's plan doc, documented per
 * `.claude/rules/spec-fidelity.md`:** the plan's Phase 10 sketch describes
 * `bootstrap()` as the full composition root -- constructing `session`,
 * `selection`, `host`, `ceremonies`, `router`, `panelRegistry`, and every
 * sibling controller itself, reducing `main.ts` to about 15 lines. That is
 * not what this file does. `panelRegistry`'s ~15 entries (and therefore
 * `router`, and therefore everything that depends on `router`) reference
 * roughly 35 panel-opener and handler functions that Phase 10's own "Moves"
 * list never assigned anywhere -- see the newly-added Phase 10b in the plan
 * doc, filed when that gap was discovered during this phase's planning.
 * Moving `panelRegistry`/`router`/`host`/`ceremonies`/etc. construction into
 * this file before those ~35 functions have a real home would require
 * threading all of them through as deps unchanged, which is churn without
 * payoff. `main.ts` keeps constructing all of that today, exactly as it did
 * before this phase, and hands `bootstrap()` only the pieces this phase's
 * three new controllers (`GameSessionController`, `HudController`,
 * `CampaignEntryController`) actually need. Phase 10b is the phase that
 * finishes the composition-root move this file's name promises.
 */
import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import type { NotificationSink } from '@/ui/notification-routing';
import type { GameSessionController } from '@/app/controllers/game-session-controller';
import { registerAllPresentation, type PresentationContext } from '@/presentation/register-all';
import { registerMinorCivNotificationListeners } from '@/ui/minor-civ-notification-listeners';

export interface AppServices {
  readonly bus: EventBus;
  readonly presentationContext: PresentationContext;
  readonly getState: () => GameState;
  readonly appendToCivLog: NotificationSink;
  readonly gameSession: Pick<GameSessionController, 'init'>;
}

export async function bootstrap(services: AppServices): Promise<void> {
  registerAllPresentation(services.bus, services.presentationContext);
  registerMinorCivNotificationListeners(services.bus, services.getState, {
    appendToCivLog: services.appendToCivLog,
  });
  await services.gameSession.init();
}
