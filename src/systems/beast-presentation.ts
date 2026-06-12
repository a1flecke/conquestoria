import type { BeastId, GameState, UnitType } from '@/core/types';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { BEAST_OWNER } from '@/systems/beast-system';
import { hexKey } from '@/systems/hex-utils';

export type BestiaryStatus = 'unknown' | 'sighted' | 'slain';

/** Viewer-safe bestiary entry. Unknown entries carry ONLY the hint — masking every other field is a privacy contract. */
export interface BestiaryEntry {
  lairId: string;
  status: BestiaryStatus;
  hint: string;
  name?: string;
  unitType?: UnitType;
  tier?: number;
  sightingFlavor?: string;
  slainBy?: string;
  slainTurn?: number;
}

export function getBestiaryEntriesForPlayer(state: GameState, civId: string): BestiaryEntry[] {
  if (!state.beasts) return [];
  const sighted = new Set(state.beasts.sightingsByCiv[civId] ?? []);
  return Object.values(state.beasts.lairs).map(lair => {
    const def = BEAST_DEFINITIONS[lair.beastId];
    const isSlain = lair.status === 'slain' || lair.status === 'claimed';
    if (isSlain) {
      return {
        lairId: lair.id, status: 'slain' as const, hint: def.dangerHint,
        name: def.name, unitType: def.unitType, tier: def.tier,
        slainBy: lair.slainBy, slainTurn: lair.slainTurn,
      };
    }
    if (sighted.has(lair.beastId)) {
      return {
        lairId: lair.id, status: 'sighted' as const, hint: def.dangerHint,
        name: def.name, unitType: def.unitType, tier: def.tier,
        sightingFlavor: def.sightingFlavor,
      };
    }
    return { lairId: lair.id, status: 'unknown' as const, hint: def.dangerHint };
  });
}

/**
 * Transition-owned sighting scan: returns the beasts that became sighted in THIS call.
 * visibleTileKeys: hexKey set of tiles currently visible to civId.
 */
export function recordBeastSightings(
  state: GameState,
  civId: string,
  visibleTileKeys: ReadonlySet<string>,
): { state: GameState; newSightings: BeastId[] } {
  if (!state.beasts) return { state, newSightings: [] };
  const already = new Set(state.beasts.sightingsByCiv[civId] ?? []);
  const newSightings: BeastId[] = [];

  for (const unit of Object.values(state.units)) {
    if (unit.owner !== BEAST_OWNER) continue;
    if (!visibleTileKeys.has(hexKey(unit.position))) continue;
    const lair = Object.values(state.beasts.lairs).find(l => l.unitIds.includes(unit.id));
    if (!lair || already.has(lair.beastId)) continue;
    already.add(lair.beastId);
    newSightings.push(lair.beastId);
  }

  if (newSightings.length === 0) return { state, newSightings };
  return {
    state: {
      ...state,
      beasts: {
        ...state.beasts,
        sightingsByCiv: {
          ...state.beasts.sightingsByCiv,
          [civId]: [...(state.beasts.sightingsByCiv[civId] ?? []), ...newSightings],
        },
      },
    },
    newSightings,
  };
}
