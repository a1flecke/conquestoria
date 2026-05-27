import type { GameState, HexCoord } from '@/core/types';
import { createWonderCodexPanel } from '@/ui/wonder-codex-panel';

export interface WonderAtlasCallbacks {
  onViewOnMap: (coord: HexCoord, wonderId: string) => void;
  onClose: () => void;
  onOpenCity?: (cityId: string) => void;
  initialWonderId?: string;
  reducedMotion?: boolean;
  onNaturalWonderPageShown?: (wonderId: string) => void;
  onNaturalWonderPageHidden?: (wonderId: string) => void;
  onNaturalWonderReplay?: (wonderId: string) => void;
}

export function createWonderAtlasPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: WonderAtlasCallbacks,
): HTMLElement {
  return createWonderCodexPanel(container, state, {
    initialWonderId: callbacks.initialWonderId,
    reducedMotion: callbacks.reducedMotion,
    onViewOnMap: callbacks.onViewOnMap,
    onOpenCity: callbacks.onOpenCity ?? (() => {}),
    onClose: callbacks.onClose,
    onNaturalWonderPageShown: callbacks.onNaturalWonderPageShown,
    onNaturalWonderPageHidden: callbacks.onNaturalWonderPageHidden,
    onNaturalWonderReplay: callbacks.onNaturalWonderReplay,
  });
}
