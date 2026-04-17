import type { City } from '@/core/types';

const MAX_QUEUE_ITEMS = 3;

export function enqueueCityProduction(city: City, itemId: string): City {
  if (city.productionQueue.includes(itemId)) {
    return city;
  }

  if (city.productionQueue.length >= MAX_QUEUE_ITEMS) {
    throw new Error('Queue limit reached');
  }

  return {
    ...city,
    productionQueue: [...city.productionQueue, itemId],
  };
}

export function moveQueuedId<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0
    || toIndex < 0
    || fromIndex >= items.length
    || toIndex >= items.length
    || fromIndex === toIndex
  ) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) {
    return [...items];
  }
  next.splice(toIndex, 0, moved);
  return next;
}

export function removeQueuedId<T>(items: T[], index: number): T[] {
  return items.filter((_, currentIndex) => currentIndex !== index);
}
