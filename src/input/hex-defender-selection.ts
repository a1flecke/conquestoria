import type { GameState, Unit } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { getObservedUnitForViewer } from '@/systems/viewer-intel';
import { selectDefenderForAttack } from '@/systems/combat-defense-strength';

/**
 * Mirrors `main.ts`'s `visibleUnitEntriesAtKey`/`visibleHostileUnitEntriesAtKey`/
 * `selectDefenderEntryAtKey` (#787 phase 8a) so `resolveMapTapIntent` can reuse
 * the exact same visibility/concealment/stacked-defender rules instead of a
 * naive reimplementation. `main.ts` still owns its own copies until phase 8b
 * switches it over to these -- phase 8a is scoped to zero `main.ts` changes.
 */
export function visibleUnitEntriesAtKey(state: GameState, key: string): Array<[string, Unit]> {
  const entries: Array<[string, Unit]> = [];
  for (const unit of Object.values(state.units)) {
    if (hexKey(unit.position) !== key) continue;
    const observed = getObservedUnitForViewer(state, state.currentPlayer, unit);
    if (observed) entries.push([unit.id, observed]);
  }
  return entries;
}

export function visibleHostileUnitEntriesAtKey(state: GameState, key: string): Array<[string, Unit]> {
  return visibleUnitEntriesAtKey(state, key).filter(([, unit]) => unit.owner !== state.currentPlayer);
}

export function selectDefenderEntryAtKey(state: GameState, key: string): [string, Unit] | undefined {
  // Cargo aboard a ship never defends its tile; the hull does (the same rule `canUnitAttackTarget` applies).
  const hostileEntries = visibleHostileUnitEntriesAtKey(state, key);
  const defender = selectDefenderForAttack(hostileEntries.map(([, unit]) => unit), state.map);
  if (!defender) return undefined;
  return hostileEntries.find(([id]) => id === defender.id);
}
