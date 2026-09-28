/**
 * #993: the "big moment" coordinator for major campaign events. Owns
 * `wonderDiscoveryQueue`, `legendaryCompletionQueue`, `eventChainQueue`,
 * `victoryQueue`, and the move-settle defer flag that used to live in
 * `main.ts` module scope (#787 phase 6).
 *
 * Exists because of a `setBlockingOverlay` side effect: unblocking the UI is
 * what pumps every queue (`main.ts:407-413` pre-phase-6). Porting `PanelHost`
 * verbatim without this coordinator would mean any moment queued while a
 * panel was open never plays. `PanelHost.onInteractionUnblocked` (#787 phase
 * 5) is the hook this coordinator subscribes to instead, so `PanelHost` stays
 * ignorant of what a ceremony is.
 *
 * All four queues share one generic engine (`big-moment-queue.ts`, #993) --
 * this file is the domain-specific sequencing policy layered on top of it
 * (which moments defer to a move animation, which are terminal, what a
 * game-over does to the backlog), mirroring how `event-chain-lifecycle.ts`
 * layers chain-specific policy over the shared `staged-lifecycle-engine.ts`
 * (#990).
 *
 * **Victory preempts, but never interrupts.** Enqueuing victory immediately
 * drops every other queue's backlog (a wonder or chain conclusion still
 * queued but not yet shown no longer matters -- the game is over), and once
 * victory has been shown, every other `enqueue*` call becomes a no-op until
 * `clearForNewGame()` runs. It does NOT push its own overlay ahead of a
 * ceremony that is already presenting: it enqueues into the same
 * `isInteractionBlocked()`-gated engine every other queue uses, so it waits
 * for that ceremony's own overlay to pop first. Before #993 the caller
 * (`handleVictoryIfNeeded`) called `showVictoryPanel` directly and
 * unconditionally, which could stack the victory overlay on top of a
 * currently-presenting wonder/legendary ceremony's own overlay (both
 * `z-index:100`/`80` full-screen elements) -- reachable in hot seat whenever
 * a legendary wonder completes on the same round the game ends, since that
 * ceremony's `enqueueLegendaryCompletion` call already begins presenting
 * synchronously during round processing, before `handleVictoryIfNeeded` runs.
 * Routing victory through the shared engine fixes that inherited race rather
 * than freezing it in place, per `.claude/rules/end-to-end-wiring.md`'s rule
 * against preserving a bug found while extracting a flow.
 *
 * **A fresh game must never inherit the previous game's backlog.**
 * `clearForNewGame()` is the general fix for a related, separately-confirmed
 * bug: neither the victory panel's own `onNewGame` handler nor the pause
 * menu's "New Game" ever cleared the ceremony backlog before this, so a
 * ceremony (or the move-settle defer flag) left mid-flight by the *previous*
 * game could resurface once the next game's UI unblocks. `startGame()`
 * (`game-session-controller.ts`) is the single choke point every "begin
 * actively presenting this `GameState`" path funnels through -- new game,
 * loaded save, and hot-seat re-entry alike -- so it calls this on every entry,
 * not just a literal "New Game" click; a stale ceremony from a save that
 * predates it is exactly as wrong to show as one from a finished campaign.
 */
import type { PanelHost } from '@/app/panel-host';
import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import type { LegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import type { EventChainConclusionMomentItem } from '@/systems/event-chain-presentation';
import type { WorldRaceConclusionMomentItem } from '@/systems/world-race-presentation';
import type { VictoryPanelOptions } from '@/ui/victory-panel';
import { createWonderDiscoveryRevealQueue, type WonderDiscoveryRevealQueueOptions } from '@/ui/wonder-discovery-queue';
import {
  createLegendaryWonderCompletionQueue,
  type LegendaryWonderCompletionQueueOptions,
} from '@/ui/legendary-wonder-completion-queue';
import { createBigMomentQueue } from '@/systems/big-moment-queue';
import { createEventChainConclusionCeremony } from '@/ui/event-chain-conclusion-ceremony';
import { createWorldRaceConclusionCeremony } from '@/ui/world-race-conclusion-ceremony';
import { showVictoryPanel } from '@/ui/victory-panel';

export interface CeremonyCoordinator {
  /** Queue a natural-wonder reveal. Plays when nothing is blocking and no move is settling. */
  enqueueWonderDiscovery(item: WonderDiscoveryRevealItem): void;
  /** Queue a legendary-wonder completion ceremony. Never deferred by an animated move. */
  enqueueLegendaryCompletion(item: LegendaryWonderCompletionCeremonyItem): void;
  /** Queue a resolved event chain's conclusion moment. Never deferred by an animated move. */
  enqueueEventChainConclusion(item: EventChainConclusionMomentItem | null): void;
  /** Queue a world race's conclusion moment (#992). Never deferred by an animated move. */
  enqueueWorldRaceConclusion(item: WorldRaceConclusionMomentItem): void;
  /**
   * Queue the game's terminal victory/defeat moment. Clears every other
   * queue's backlog immediately and blocks every further `enqueue*` call
   * until `clearForNewGame()` runs -- see file docblock.
   */
  enqueueVictory(options: VictoryPanelOptions): void;
  /** Call around an animated move: reveals queued before `endAction` wait for it. */
  beginDeferredAction(): void;
  endAction(): void;
  /**
   * Drops every moment queued but not yet presenting, and cancels any
   * in-progress move-settle defer. Call before a hot-seat handoff -- without
   * this, a discovery deferred (or blocked by another overlay) at the moment
   * a player ends their turn survives the handoff and plays after
   * `releaseHandoffToViewer` unblocks the UI, on the *next* player's screen.
   * A ceremony already presenting is left alone; this only clears backlog.
   * Never touches victory/terminal state -- a hot-seat handoff cannot happen
   * once the game is over.
   */
  clearForHandoff(): void;
  /**
   * Drops every moment queued but not yet presenting (including a queued
   * victory) and resets the terminal-after-victory guard. Call before
   * actively presenting any `GameState` -- new game, loaded save, or
   * hot-seat re-entry alike (`startGame()`'s own docblock names the choke
   * point) -- so a previous game's leftover backlog never resurfaces in a
   * new one.
   */
  clearForNewGame(): void;
}

export interface CeremonyCoordinatorDeps {
  readonly host: PanelHost;
  readonly reducedMotion: () => boolean;
  readonly requestMapHighlight: (item: WonderDiscoveryRevealItem, reducedMotion: boolean) => void;
  readonly playDiscoveryAudio: (wonderId: string) => void;
  readonly openAtlas: (wonderId: string) => void;
  readonly openCity: (cityId: string) => void;
  readonly openJournal: (cityId: string, wonderId: string) => void;
  /** Test-only ceremony-presentation overrides; production omits all and gets the real DOM ceremony/panel. */
  readonly presentWonderDiscovery?: WonderDiscoveryRevealQueueOptions['present'];
  readonly presentLegendaryCompletion?: LegendaryWonderCompletionQueueOptions['present'];
  readonly presentEventChainConclusion?: (item: EventChainConclusionMomentItem) => Promise<void>;
  readonly presentWorldRaceConclusion?: (item: WorldRaceConclusionMomentItem) => Promise<void>;
  readonly presentVictory?: (options: VictoryPanelOptions) => Promise<void>;
}

export function createCeremonyCoordinator(deps: CeremonyCoordinatorDeps): CeremonyCoordinator {
  let deferUntilMoveSettles = false;
  let terminal = false;

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

  const presentEventChainConclusion = deps.presentEventChainConclusion
    ?? ((item: EventChainConclusionMomentItem) => new Promise<void>(resolve => {
      deps.host.setBlockingOverlay('event-chain-conclusion-ceremony');
      createEventChainConclusionCeremony(deps.host.layer, item, {
        onResolve: () => {
          deps.host.setBlockingOverlay(null);
          resolve();
        },
      });
    }));

  const eventChainQueue = createBigMomentQueue<EventChainConclusionMomentItem>({
    isInteractionBlocked: () => deps.host.isInteractionBlocked(),
    keyFor: item => `${item.civId}:${item.chainId}`,
    present: presentEventChainConclusion,
  });

  const presentWorldRaceConclusion = deps.presentWorldRaceConclusion
    ?? ((item: WorldRaceConclusionMomentItem) => new Promise<void>(resolve => {
      deps.host.setBlockingOverlay('world-race-conclusion-ceremony');
      createWorldRaceConclusionCeremony(deps.host.layer, item, {
        onResolve: () => {
          deps.host.setBlockingOverlay(null);
          resolve();
        },
      });
    }));

  const worldRaceConclusionQueue = createBigMomentQueue<WorldRaceConclusionMomentItem>({
    isInteractionBlocked: () => deps.host.isInteractionBlocked(),
    // Keyed by kind+turn, not civId: this moment is world-scoped (every viewer's
    // currentPlayer sees the SAME conclusion for a given race), unlike the event-chain
    // queue above which is genuinely per-civ.
    keyFor: item => `${item.kind}:${item.turn}`,
    present: presentWorldRaceConclusion,
  });

  const presentVictory = deps.presentVictory
    ?? ((options: VictoryPanelOptions) => new Promise<void>(resolve => {
      deps.host.setBlockingOverlay('victory-panel');
      showVictoryPanel(deps.host.layer, {
        ...options,
        onNewGame: () => {
          deps.host.setBlockingOverlay(null);
          options.onNewGame();
          resolve();
        },
      });
    }));

  const victoryQueue = createBigMomentQueue<VictoryPanelOptions>({
    isInteractionBlocked: () => deps.host.isInteractionBlocked(),
    // One game has exactly one terminal moment -- a fixed key is enough, and
    // means a second `enqueueVictory` call (defensive; game-over is a
    // one-time transition in practice) is naturally deduped rather than
    // needing its own guard.
    keyFor: () => 'victory',
    present: presentVictory,
  });

  deps.host.onInteractionUnblocked(() => {
    wonderDiscoveryQueue.pump();
    legendaryCompletionQueue.pump();
    eventChainQueue.pump();
    worldRaceConclusionQueue.pump();
    victoryQueue.pump();
  });

  return {
    enqueueWonderDiscovery(item) {
      if (terminal) return;
      wonderDiscoveryQueue.enqueue(item);
      if (!deferUntilMoveSettles) {
        wonderDiscoveryQueue.notifyActionSettled();
      }
    },
    enqueueLegendaryCompletion(item) {
      if (terminal) return;
      legendaryCompletionQueue.enqueue(item);
      legendaryCompletionQueue.notifyActionSettled();
    },
    enqueueEventChainConclusion(item) {
      if (terminal) return;
      eventChainQueue.enqueue(item);
      eventChainQueue.notifyActionSettled();
    },
    enqueueWorldRaceConclusion(item) {
      if (terminal) return;
      worldRaceConclusionQueue.enqueue(item);
      worldRaceConclusionQueue.notifyActionSettled();
    },
    enqueueVictory(options) {
      terminal = true;
      wonderDiscoveryQueue.clear();
      legendaryCompletionQueue.clear();
      eventChainQueue.clear();
      worldRaceConclusionQueue.clear();
      victoryQueue.enqueue(options);
      victoryQueue.notifyActionSettled();
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
      eventChainQueue.clear();
      worldRaceConclusionQueue.clear();
    },
    clearForNewGame() {
      deferUntilMoveSettles = false;
      terminal = false;
      // reset(), not clear(): a fresh game's own wonder/chain/victory moments
      // must never be silently blocked by dedupe keys the previous game's
      // history left behind (a real hazard for `victory`'s fixed key
      // specifically -- two game-over saves loaded in the same tab reuse the
      // exact same key), and a moment whose presentation promise never
      // resolved across the boundary must not wedge the next game's queue.
      wonderDiscoveryQueue.reset();
      legendaryCompletionQueue.reset();
      eventChainQueue.reset();
      worldRaceConclusionQueue.reset();
      victoryQueue.reset();
    },
  };
}
