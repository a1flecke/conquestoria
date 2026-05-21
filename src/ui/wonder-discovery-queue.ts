import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { createWonderDiscoveryCeremony, type WonderDiscoveryCeremonyAction } from '@/ui/wonder-discovery-ceremony';

export interface WonderDiscoveryRevealQueueOptions {
  container: HTMLElement;
  isInteractionBlocked: () => boolean;
  requestMapHighlight: (item: WonderDiscoveryRevealItem, reducedMotion: boolean) => void;
  openAtlas: (wonderId: string) => void;
  reducedMotion: () => boolean;
  present?: (item: WonderDiscoveryRevealItem) => Promise<WonderDiscoveryCeremonyAction>;
  onRevealStarted?: (item: WonderDiscoveryRevealItem) => void;
  setBlockingOverlay?: (id: string | null) => void;
}

export interface WonderDiscoveryRevealQueue {
  enqueue(item: WonderDiscoveryRevealItem): void;
  notifyActionSettled(): void;
  pump(): void;
  pendingCount(): number;
}

function keyFor(item: WonderDiscoveryRevealItem): string {
  return `${item.civId}:${item.wonderId}`;
}

export function createWonderDiscoveryRevealQueue(options: WonderDiscoveryRevealQueueOptions): WonderDiscoveryRevealQueue {
  const pending: WonderDiscoveryRevealItem[] = [];
  const seen = new Set<string>();
  let presenting = false;
  let actionSettled = false;

  const present = options.present ?? ((item: WonderDiscoveryRevealItem) => new Promise<WonderDiscoveryCeremonyAction>(resolve => {
    createWonderDiscoveryCeremony(
      options.container,
      item,
      { onResolve: resolve },
      { reducedMotion: options.reducedMotion() },
    );
  }));

  async function play(item: WonderDiscoveryRevealItem): Promise<void> {
    presenting = true;
    options.setBlockingOverlay?.('wonder-discovery-ceremony');
    options.onRevealStarted?.(item);
    const reducedMotion = options.reducedMotion();
    let action: WonderDiscoveryCeremonyAction = 'continue';

    try {
      action = await present(item);
    } catch {
      action = 'continue';
    } finally {
      options.setBlockingOverlay?.(null);
    }

    options.requestMapHighlight(item, reducedMotion);
    if (action === 'open-atlas') {
      options.openAtlas(item.wonderId);
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
