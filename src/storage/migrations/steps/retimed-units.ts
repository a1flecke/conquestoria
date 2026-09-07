import type { GameState } from '@/core/types';

/**
 * Schemas 10 and 11 — one-time grandfathering for units whose era gate moved
 * (Cavalry, then Knight), plus the Biplane queue retime (#678), which took no
 * numbered slot. Each grandfathers an already-queued item exactly once without
 * making a newly-illegal item legal again.
 */

export function migrateRetimedCavalry(state: GameState): GameState {
  const cities = Object.fromEntries(Object.entries(state.cities ?? {}).map(([cityId, city]) => {
    const existingGrace = Array.isArray(city.legacyTechGrace)
      ? city.legacyTechGrace.filter(item => item === 'cavalry')
      : [];
    const queuedCavalry = city.productionQueue.filter(item => item === 'cavalry');
    const legacyTechGrace = [...existingGrace, ...queuedCavalry];
    if (legacyTechGrace.length === 0) return [cityId, city];
    return [cityId, {
      ...city,
      legacyTechGrace,
    }];
  }));
  return { ...state, cities };
}

export function migrateRetimedKnight(state: GameState): GameState {
  const cities = Object.fromEntries(Object.entries(state.cities ?? {}).map(([cityId, city]) => {
    const existingGrace = Array.isArray(city.legacyTechGrace)
      ? city.legacyTechGrace.filter(item => item === 'cavalry' || item === 'knight')
      : [];
    const queuedKnights = city.productionQueue.filter(item => item === 'knight');
    const legacyTechGrace = [...existingGrace, ...queuedKnights];
    if (legacyTechGrace.length === 0) return [cityId, city];
    return [cityId, { ...city, legacyTechGrace }];
  }));
  return { ...state, cities };
}


// #678: Biplane moved from Air Superiority to Aviation. Existing queued Biplanes were
// legal under the old roster, so retain the player's queue position by replacing only
// entries that the new obsolescence rule makes illegal. This is deliberately
// unconditional and idempotent: current-schema saves also need the repair.
export function normalizeRetimedBiplaneQueues(state: GameState): GameState {
  let changed = false;
  const cities = Object.fromEntries(Object.entries(state.cities).map(([cityId, city]) => {
    const completed = state.civilizations[city.owner]?.techState.completed ?? [];
    if (!completed.includes('air-superiority') || !city.productionQueue.includes('biplane')) return [cityId, city];
    changed = true;
    const replacement = completed.includes('jet-aviation') ? 'jet_fighter' : 'wwii_fighter';
    return [cityId, { ...city, productionQueue: city.productionQueue.map(item => item === 'biplane' ? replacement : item) }];
  }));
  return changed ? { ...state, cities } : state;
}
