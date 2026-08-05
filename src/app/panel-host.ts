/**
 * Owns the DOM layer panels render into, plus the interaction-blocking
 * overlay flag that used to live in `main.ts`'s module-scope
 * `createUiInteractionState()` instance (#787 phase 5).
 *
 * `PanelHost` extends `UiInteractionState` so it is a drop-in for every
 * existing consumer of that interface (`context-menu.ts`,
 * `keyboard-shortcuts.test.ts`, `desktop-controls.test.ts`) -- the LSP claim
 * from the arc's Architecture section. `createUiInteractionState`'s factory
 * itself is retired in Phase 11, once nothing constructs it directly.
 *
 * `onInteractionUnblocked` is new: `setBlockingOverlay` in `main.ts` today
 * directly pumps the wonder-discovery and legendary-completion ceremony
 * queues whenever the overlay clears. Phase 6's `CeremonyCoordinator` is the
 * intended consumer of this hook; Phase 5 only builds and tests the
 * capability, it does not rewire the ceremony queues to it yet.
 */
import { createUiInteractionState, type UiInteractionState } from '@/ui/ui-interaction-state';

export interface PanelHost extends UiInteractionState {
  readonly layer: HTMLElement;
  /** Fires exactly once per transition from blocked to unblocked -- never on overlay-to-overlay swaps. */
  onInteractionUnblocked(listener: () => void): void;
}

export function createPanelHost(layer: HTMLElement): PanelHost {
  const inner = createUiInteractionState();
  const listeners = new Set<() => void>();
  let wasBlocked = false;

  return {
    layer,
    setBlockingOverlay(id: string | null): void {
      inner.setBlockingOverlay(id);
      const isBlocked = inner.isInteractionBlocked();
      if (wasBlocked && !isBlocked) {
        for (const listener of listeners) listener();
      }
      wasBlocked = isBlocked;
    },
    isInteractionBlocked(): boolean {
      return inner.isInteractionBlocked();
    },
    onInteractionUnblocked(listener: () => void): void {
      listeners.add(listener);
    },
  };
}
