import type { LegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import {
  createLegendaryWonderCompletionCeremony,
  type LegendaryWonderCompletionCeremonyAction,
} from '@/ui/legendary-wonder-completion-ceremony';
import { createBigMomentQueue, type BigMomentQueue } from '@/systems/big-moment-queue';

export interface LegendaryWonderCompletionQueueOptions {
  container: HTMLElement;
  isInteractionBlocked: () => boolean;
  reducedMotion: () => boolean;
  openCity: (cityId: string) => void;
  openJournal: (cityId: string, wonderId: string) => void;
  present?: (item: LegendaryWonderCompletionCeremonyItem) => Promise<LegendaryWonderCompletionCeremonyAction>;
  setBlockingOverlay?: (id: string | null) => void;
}

/** #993: a thin domain adapter over the generic `BigMomentQueue` engine. */
export type LegendaryWonderCompletionQueue = BigMomentQueue<LegendaryWonderCompletionCeremonyItem>;

function keyFor(item: LegendaryWonderCompletionCeremonyItem): string {
  return `${item.civId}:${item.wonderId}:${item.turnCompleted}`;
}

export function createLegendaryWonderCompletionQueue(
  options: LegendaryWonderCompletionQueueOptions,
): LegendaryWonderCompletionQueue {
  const present = options.present ?? ((item: LegendaryWonderCompletionCeremonyItem) => new Promise<LegendaryWonderCompletionCeremonyAction>(resolve => {
    createLegendaryWonderCompletionCeremony(
      options.container,
      item,
      { onResolve: resolve },
      { reducedMotion: options.reducedMotion() },
    );
  }));

  return createBigMomentQueue<LegendaryWonderCompletionCeremonyItem>({
    isInteractionBlocked: options.isInteractionBlocked,
    keyFor,
    present: async item => {
      options.setBlockingOverlay?.('legendary-wonder-completion-ceremony');
      let action: LegendaryWonderCompletionCeremonyAction = 'continue';

      try {
        action = await present(item);
      } catch {
        action = 'continue';
      } finally {
        options.setBlockingOverlay?.(null);
      }

      if (action === 'open-city') {
        options.openCity(item.cityId);
      } else if (action === 'open-journal') {
        options.openJournal(item.cityId, item.wonderId);
      }
    },
  });
}
