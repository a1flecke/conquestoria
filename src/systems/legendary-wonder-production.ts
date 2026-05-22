import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';

export const LEGENDARY_WONDER_PRODUCTION_PREFIX = 'legendary:';
export const LEGENDARY_WONDER_PRODUCTION_ICON = '*';

export interface LegendaryWonderQueueItemMetadata {
  icon: string;
  name: string;
  productionCost: number;
  wonderId: string;
}

export function isLegendaryQueueItem(itemId: string): boolean {
  return itemId.startsWith(LEGENDARY_WONDER_PRODUCTION_PREFIX);
}

export function getWonderIdFromQueueItem(itemId: string): string {
  return itemId.slice(LEGENDARY_WONDER_PRODUCTION_PREFIX.length);
}

export function getLegendaryWonderQueueItemId(wonderId: string): string {
  return `${LEGENDARY_WONDER_PRODUCTION_PREFIX}${wonderId}`;
}

export function getLegendaryWonderQueueItemMetadata(itemId: string): LegendaryWonderQueueItemMetadata | null {
  if (!isLegendaryQueueItem(itemId)) {
    return null;
  }

  const wonderId = getWonderIdFromQueueItem(itemId);
  const definition = getLegendaryWonderDefinition(wonderId);
  return {
    icon: LEGENDARY_WONDER_PRODUCTION_ICON,
    name: definition?.name ?? 'Unknown Legendary Wonder',
    productionCost: definition?.productionCost ?? 0,
    wonderId,
  };
}

export function getLegendaryWonderDisplayName(itemId: string): string | null {
  return getLegendaryWonderQueueItemMetadata(itemId)?.name ?? null;
}

export function getLegendaryWonderProductionCost(itemId: string): number | null {
  return getLegendaryWonderQueueItemMetadata(itemId)?.productionCost ?? null;
}
