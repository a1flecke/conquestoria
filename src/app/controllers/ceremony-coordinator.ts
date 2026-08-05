/**
 * Owns `wonderDiscoveryQueue`, `legendaryCompletionQueue`, and the
 * move-settle defer flag that used to live in `main.ts` module scope
 * (#787 phase 6).
 *
 * Exists because of a `setBlockingOverlay` side effect: unblocking the UI is
 * what pumps both ceremony queues (`main.ts:407-413` pre-phase-6). Porting
 * `PanelHost` verbatim without this coordinator would mean any ceremony
 * queued while a panel was open never plays. `PanelHost.onInteractionUnblocked`
 * (#787 phase 5) is the hook this coordinator subscribes to instead, so
 * `PanelHost` stays ignorant of what a wonder ceremony is.
 */
import type { PanelHost } from '@/app/panel-host';
import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import type { LegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import { createWonderDiscoveryRevealQueue, type WonderDiscoveryRevealQueueOptions } from '@/ui/wonder-discovery-queue';
import {
  createLegendaryWonderCompletionQueue,
  type LegendaryWonderCompletionQueueOptions,
} from '@/ui/legendary-wonder-completion-queue';

export interface CeremonyCoordinator {
  /** Queue a natural-wonder reveal. Plays when nothing is blocking and no move is settling. */
  enqueueWonderDiscovery(item: WonderDiscoveryRevealItem): void;
  /** Queue a legendary-wonder completion ceremony. Never deferred by an animated move. */
  enqueueLegendaryCompletion(item: LegendaryWonderCompletionCeremonyItem): void;
  /** Call around an animated move: reveals queued before `endAction` wait for it. */
  beginDeferredAction(): void;
  endAction(): void;
  /**
   * Drops every ceremony queued but not yet presenting, and cancels any
   * in-progress move-settle defer. Call before a hot-seat handoff -- without
   * this, a discovery deferred (or blocked by another overlay) at the moment
   * a player ends their turn survives the handoff and plays after
   * `releaseHandoffToViewer` unblocks the UI, on the *next* player's screen.
   * A ceremony already presenting is left alone; this only clears backlog.
   */
  clearForHandoff(): void;
}

export interface CeremonyCoordinatorDeps {
  readonly host: PanelHost;
  readonly reducedMotion: () => boolean;
  readonly requestMapHighlight: (item: WonderDiscoveryRevealItem, reducedMotion: boolean) => void;
  readonly playDiscoveryAudio: (wonderId: string) => void;
  readonly openAtlas: (wonderId: string) => void;
  readonly openCity: (cityId: string) => void;
  readonly openJournal: (cityId: string, wonderId: string) => void;
  /** Test-only ceremony-presentation overrides; production omits both and gets the real DOM ceremony. */
  readonly presentWonderDiscovery?: WonderDiscoveryRevealQueueOptions['present'];
  readonly presentLegendaryCompletion?: LegendaryWonderCompletionQueueOptions['present'];
}

export function createCeremonyCoordinator(deps: CeremonyCoordinatorDeps): CeremonyCoordinator {
  let deferUntilMoveSettles = false;

  const wonderDiscoveryQueue = createWonderDiscoveryRevealQueue({
    container: deps.host.layer,
    isInteractionBlocked: () => deps.host.isInteractionBlocked(),
    requestMapHighlight: deps.requestMapHighlight,
    openAtlas: deps.openAtlas,
    onRevealStarted: item => deps.playDiscoveryAudio(item.wonderId),
    reducedMotion: deps.reducedMotion,
    present: deps.presentWonderDiscovery,
    setBlockingOverlay: id => deps.host.setBlockingOverlay(id),
  });

  const legendaryCompletionQueue = createLegendaryWonderCompletionQueue({
    container: deps.host.layer,
    isInteractionBlocked: () => deps.host.isInteractionBlocked(),
    reducedMotion: deps.reducedMotion,
    openCity: deps.openCity,
    openJournal: deps.openJournal,
    present: deps.presentLegendaryCompletion,
    setBlockingOverlay: id => deps.host.setBlockingOverlay(id),
  });

  deps.host.onInteractionUnblocked(() => {
    wonderDiscoveryQueue.pump();
    legendaryCompletionQueue.pump();
  });

  return {
    enqueueWonderDiscovery(item) {
      wonderDiscoveryQueue.enqueue(item);
      if (!deferUntilMoveSettles) {
        wonderDiscoveryQueue.notifyActionSettled();
      }
    },
    enqueueLegendaryCompletion(item) {
      legendaryCompletionQueue.enqueue(item);
      legendaryCompletionQueue.notifyActionSettled();
    },
    beginDeferredAction() {
      deferUntilMoveSettles = true;
    },
    endAction() {
      deferUntilMoveSettles = false;
      wonderDiscoveryQueue.notifyActionSettled();
    },
    clearForHandoff() {
      deferUntilMoveSettles = false;
      wonderDiscoveryQueue.clear();
      legendaryCompletionQueue.clear();
    },
  };
}
