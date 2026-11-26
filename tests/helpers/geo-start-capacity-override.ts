/**
 * Every real-world map now holds its full player count, so nothing real exercises the "too small for separated
 * starts" path any more. That path stays as a safety net (a future map or size could need it); tests reach it by
 * shrinking a measured capacity. Pair with, at the top of the test file:
 *
 *   vi.mock('@/systems/geo-start-capacity-data', async importActual => ({
 *     GEO_START_CAPACITY: structuredClone((await importActual<typeof import('@/systems/geo-start-capacity-data')>()).GEO_START_CAPACITY),
 *   }));
 */
import { GEO_START_CAPACITY } from '@/systems/geo-start-capacity-data';

type Script = keyof typeof GEO_START_CAPACITY;
type Size = keyof (typeof GEO_START_CAPACITY)['earth'];
type Writable = Record<Script, Record<Size, number>>;

const original: Writable = structuredClone(GEO_START_CAPACITY) as Writable;

export function shrinkGeoStartCapacity(script: Script, size: Size, capacity: number): void {
  (GEO_START_CAPACITY as unknown as Writable)[script][size] = capacity;
}

export function restoreGeoStartCapacity(): void {
  const live = GEO_START_CAPACITY as unknown as Writable;
  for (const script of Object.keys(original) as Script[]) Object.assign(live[script], original[script]);
}
