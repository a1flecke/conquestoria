export interface UiInteractionState {
  setBlockingOverlay(id: string | null): void;
  isInteractionBlocked(): boolean;
}

export function createUiInteractionState(): UiInteractionState {
  let blockingOverlayId: string | null = null;

  return {
    setBlockingOverlay(id: string | null) {
      blockingOverlayId = id;
    },
    isInteractionBlocked() {
      return blockingOverlayId !== null;
    },
  };
}
