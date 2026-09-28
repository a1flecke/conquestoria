import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { createWonderDiscoveryCeremony, type WonderDiscoveryCeremonyAction } from '@/ui/wonder-discovery-ceremony';
import { createBigMomentQueue, type BigMomentQueue } from '@/systems/big-moment-queue';

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

/** #993: a thin domain adapter over the generic `BigMomentQueue` engine. */
export type WonderDiscoveryRevealQueue = BigMomentQueue<WonderDiscoveryRevealItem>;

function keyFor(item: WonderDiscoveryRevealItem): string {
  return `${item.civId}:${item.wonderId}`;
}

export function createWonderDiscoveryRevealQueue(options: WonderDiscoveryRevealQueueOptions): WonderDiscoveryRevealQueue {
  const present = options.present ?? ((item: WonderDiscoveryRevealItem) => new Promise<WonderDiscoveryCeremonyAction>(resolve => {
    createWonderDiscoveryCeremony(
      options.container,
      item,
      { onResolve: resolve },
      { reducedMotion: options.reducedMotion() },
    );
  }));

  return createBigMomentQueue<WonderDiscoveryRevealItem>({
    isInteractionBlocked: options.isInteractionBlocked,
    keyFor,
    present: async item => {
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
    },
  });
}
