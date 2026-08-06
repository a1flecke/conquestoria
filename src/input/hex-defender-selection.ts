import type { GameState, Unit } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { canInspectUnitForViewer } from '@/systems/viewer-intel';
import { isForestConcealedUnit } from '@/systems/fog-of-war';
import { isBeastConcealedFrom } from '@/systems/beast-system';
import { selectDefenderForAttack } from '@/systems/combat-system';

/**
 * Mirrors `main.ts`'s `visibleUnitEntriesAtKey`/`visibleHostileUnitEntriesAtKey`/
 * `selectDefenderEntryAtKey` (#787 phase 8a) so `resolveMapTapIntent` can reuse
 * the exact same visibility/concealment/stacked-defender rules instead of a
 * naive reimplementation. `main.ts` still owns its own copies until phase 8b
 * switches it over to these -- phase 8a is scoped to zero `main.ts` changes.
 */
export function visibleUnitEntriesAtKey(state: GameState, key: string): Array<[string, Unit]> {
  const viewerUnits = Object.values(state.units).filter(u => u.owner === state.currentPlayer && !u.transportId);
  return Object.entries(state.units).filter(([, unit]) =>
    hexKey(unit.position) === key
    && canInspectUnitForViewer(state, state.currentPlayer, unit.id)
    && (unit.owner === state.currentPlayer || !isForestConcealedUnit(state, state.currentPlayer, unit))
    && !isBeastConcealedFrom(unit, state.map, viewerUnits),
  );
}

export function visibleHostileUnitEntriesAtKey(state: GameState, key: string): Array<[string, Unit]> {
  return visibleUnitEntriesAtKey(state, key).filter(([, unit]) => unit.owner !== state.currentPlayer);
}

export function selectDefenderEntryAtKey(state: GameState, key: string): [string, Unit] | undefined {
  const hostileEntries = visibleHostileUnitEntriesAtKey(state, key);
  const defender = selectDefenderForAttack(hostileEntries.map(([, unit]) => unit), state.map);
  if (!defender) return undefined;
  return hostileEntries.find(([id]) => id === defender.id);
}
