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
 */
import type { UiInteractionState } from '@/ui/ui-interaction-state';

export interface PanelHost extends UiInteractionState {
  readonly layer: HTMLElement;
  /** Fires exactly once per transition from blocked to unblocked -- never on overlay-to-overlay swaps. */
  onInteractionUnblocked(listener: () => void): void;
}

export function createPanelHost(layer: HTMLElement): PanelHost {
  let blockingOverlayId: string | null = null;
  const listeners = new Set<() => void>();
  let wasBlocked = false;

  return {
    layer,
    setBlockingOverlay(id: string | null): void {
      blockingOverlayId = id;
      const isBlocked = blockingOverlayId !== null;
      if (wasBlocked && !isBlocked) {
        for (const listener of listeners) listener();
      }
      wasBlocked = isBlocked;
    },
    isInteractionBlocked(): boolean {
      return blockingOverlayId !== null;
    },
    onInteractionUnblocked(listener: () => void): void {
      listeners.add(listener);
    },
  };
}
