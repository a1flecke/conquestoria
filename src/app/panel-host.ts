/**
 * Owns the DOM layer panels render into, plus the interaction-blocking
 * overlay flag that used to live in `main.ts`'s module-scope
 * `createUiInteractionState()` instance (#787 phase 5).
 *
 * `PanelHost` extends `UiInteractionState` so it is a drop-in for every
 * remaining consumer of that interface -- `context-menu.ts` (type-only) and
 * two UI test suites (`keyboard-shortcuts.test.ts`, `desktop-controls.test.ts`,
 * also type-only as of #787 phase 11) -- the LSP claim from the arc's
 * Architecture section. `createUiInteractionState` the *factory* is retired
 * as of #787 phase 11 -- its ~10-line `blockingOverlayId: string | null`
 * closure is inlined directly below instead of composed via an `inner`
 * instance, since `PanelHost` was its only remaining production constructor.
 * The two test suites named above used to call the factory directly to
 * build their own fixture; they now build a plain object literal shaped
 * like `UiInteractionState` instead -- see those files.
 *
 * `onInteractionUnblocked` replaced a `setBlockingOverlay` side effect that
 * used to directly pump the wonder-discovery and legendary-completion
 * ceremony queues whenever the overlay cleared. `CeremonyCoordinator`
 * (`src/app/controllers/ceremony-coordinator.ts`, #787 phase 6) is now the
 * sole subscriber.
 *
 * `setBlockingOverlay` is a reference count, not a single slot, as of #787
 * phase 12 (#794): a single `blockingOverlayId: string | null` let two
 * independent blockers overlap (e.g. a ceremony presenting while a hot-seat
 * handoff begins) silently clobber each other's id, and whichever cleared
 * to `null` first would incorrectly unblock the *other* caller's operation
 * too. `setBlockingOverlay(id)` with a non-null `id` now pushes; `null`
 * pops one level (a pop on an already-unblocked host is a no-op, not a
 * negative count). `isInteractionBlocked()` stays `true` until every push
 * has a matching pop. The `id` string itself was never read back by any
 * consumer (`isInteractionBlocked()` only reports blocked/unblocked), so
 * this is purely a depth counter -- no need to track which id is "on top."
 * The public shape is unchanged: every existing call site (`id: string |
 * null) => void`) keeps working without modification, per this phase's own
 * LSP constraint on `UiInteractionState`.
 */
import type { UiInteractionState } from '@/ui/ui-interaction-state';

export interface PanelHost extends UiInteractionState {
  readonly layer: HTMLElement;
  /** Fires exactly once per transition from blocked to unblocked -- never on overlay-to-overlay swaps or partial pops while another blocker remains. */
  onInteractionUnblocked(listener: () => void): void;
}

export function createPanelHost(layer: HTMLElement): PanelHost {
  let blockDepth = 0;
  const listeners = new Set<() => void>();

  return {
    layer,
    setBlockingOverlay(id: string | null): void {
      const wasBlocked = blockDepth > 0;
      if (id !== null) {
        blockDepth += 1;
      } else if (blockDepth > 0) {
        blockDepth -= 1;
      }
      const isBlocked = blockDepth > 0;
      if (wasBlocked && !isBlocked) {
        for (const listener of listeners) listener();
      }
    },
    isInteractionBlocked(): boolean {
      return blockDepth > 0;
    },
    onInteractionUnblocked(listener: () => void): void {
      listeners.add(listener);
    },
  };
}
