import type { LegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import {
  createLegendaryWonderCompletionCeremony,
  type LegendaryWonderCompletionCeremonyAction,
} from '@/ui/legendary-wonder-completion-ceremony';

export interface LegendaryWonderCompletionQueueOptions {
  container: HTMLElement;
  isInteractionBlocked: () => boolean;
  reducedMotion: () => boolean;
  openCity: (cityId: string) => void;
  openJournal: (cityId: string, wonderId: string) => void;
  present?: (item: LegendaryWonderCompletionCeremonyItem) => Promise<LegendaryWonderCompletionCeremonyAction>;
  setBlockingOverlay?: (id: string | null) => void;
}

export interface LegendaryWonderCompletionQueue {
  enqueue(item: LegendaryWonderCompletionCeremonyItem | null): void;
  notifyActionSettled(): void;
  pump(): void;
  pendingCount(): number;
}

function keyFor(item: LegendaryWonderCompletionCeremonyItem): string {
  return `${item.civId}:${item.wonderId}:${item.turnCompleted}`;
}

export function createLegendaryWonderCompletionQueue(
  options: LegendaryWonderCompletionQueueOptions,
): LegendaryWonderCompletionQueue {
  const pending: LegendaryWonderCompletionCeremonyItem[] = [];
  const seen = new Set<string>();
  let presenting = false;
  let actionSettled = false;

  const present = options.present ?? ((item: LegendaryWonderCompletionCeremonyItem) => new Promise<LegendaryWonderCompletionCeremonyAction>(resolve => {
    createLegendaryWonderCompletionCeremony(
      options.container,
      item,
      { onResolve: resolve },
      { reducedMotion: options.reducedMotion() },
    );
  }));

  async function play(item: LegendaryWonderCompletionCeremonyItem): Promise<void> {
    presenting = true;
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

    presenting = false;
    pump();
  }

  function pump(): void {
    if (!actionSettled || presenting || options.isInteractionBlocked()) return;
    const next = pending.shift();
    if (!next) return;
    void play(next);
  }

  return {
    enqueue(item) {
      if (!item) return;
      const key = keyFor(item);
      if (seen.has(key)) return;
      seen.add(key);
      if (!presenting && pending.length === 0) {
        actionSettled = false;
      }
      pending.push(item);
      pump();
    },
    notifyActionSettled() {
      actionSettled = true;
      pump();
    },
    pump,
    pendingCount() {
      return pending.length;
    },
  };
}
