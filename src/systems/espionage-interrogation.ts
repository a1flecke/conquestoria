import type {
  EspionageCivState,
  GameState,
  InterrogationIntel,
  InterrogationIntelType,
  InterrogationRecord,
} from '@/core/types';
import { createRng } from './map-generator';

/**
 * Interrogation (#1009): starting an interrogation, ticking its reveal rolls
 * and resolving the intel it extracts. RNG seeds and draw order are unchanged
 * from the pre-split `espionage-system.ts`.
 */
export function startInterrogation(
  captorEsp: EspionageCivState,
  spyId: string,
  spyOwner: string,
): EspionageCivState {
  const interrogationId = `interro-${spyId}`;
  const record: InterrogationRecord = {
    id: interrogationId,
    spyId,
    spyOwner,
    turnsRemaining: 4,
    extractedIntel: [],
  };
  return {
    ...captorEsp,
    activeInterrogations: {
      ...(captorEsp.activeInterrogations ?? {}),
      [interrogationId]: record,
    },
  };
}

const INTERROGATION_REVEAL_CHANCES: Record<InterrogationIntelType, number> = {
  spy_identity: 0.60,
  city_location: 0.50,
  production_queue: 0.45,
  wonder_in_progress: 0.35,
  map_area: 0.30,
  tech_hint: 0.08,
};

export function processInterrogation(
  captorEsp: EspionageCivState,
  seed: string,
  gameState: GameState,
): { state: EspionageCivState; complete: boolean; newIntel: InterrogationIntel[] } {
  const rng = createRng(seed);
  const records = { ...(captorEsp.activeInterrogations ?? {}) };
  const allNewIntel: InterrogationIntel[] = [];
  let complete = false;

  for (const [id, record] of Object.entries(records)) {
    const newIntel: InterrogationIntel[] = [];

    for (const [intelType, chance] of Object.entries(INTERROGATION_REVEAL_CHANCES) as [InterrogationIntelType, number][]) {
      if (rng() > chance) continue;
      const intel = resolveInterrogationIntel(intelType, record.spyOwner, gameState, rng);
      if (intel) newIntel.push(intel);
    }

    const updatedRecord: InterrogationRecord = {
      ...record,
      turnsRemaining: record.turnsRemaining - 1,
      extractedIntel: [...record.extractedIntel, ...newIntel],
    };
    allNewIntel.push(...newIntel);

    if (updatedRecord.turnsRemaining <= 0) {
      delete records[id];
      complete = true;
    } else {
      records[id] = updatedRecord;
    }
  }

  return {
    state: { ...captorEsp, activeInterrogations: records },
    complete,
    newIntel: allNewIntel,
  };
}

function resolveInterrogationIntel(
  type: InterrogationIntelType,
  spyOwner: string,
  state: GameState,
  rng: () => number,
): InterrogationIntel | null {
  const spyCiv = state.civilizations?.[spyOwner];
  if (!spyCiv) return null;

  switch (type) {
    case 'spy_identity': {
      const otherSpies = Object.values(state.espionage?.[spyOwner]?.spies ?? {})
        .filter(s => s.status !== 'captured' && s.status !== 'interrogated');
      if (otherSpies.length === 0) return null;
      const spy = otherSpies[Math.floor(rng() * otherSpies.length)];
      return { type, data: { spyId: spy.id, spyName: spy.name, status: spy.status, location: spy.infiltrationCityId ?? null } };
    }
    case 'city_location': {
      const cities = spyCiv.cities.map(id => state.cities?.[id]).filter(Boolean);
      if (cities.length === 0) return null;
      const city = cities[Math.floor(rng() * cities.length)];
      return { type, data: { cityId: city.id, cityName: city.name, position: city.position } };
    }
    case 'production_queue': {
      const cities = spyCiv.cities.map(id => state.cities?.[id]).filter(c => c?.productionQueue.length > 0);
      if (cities.length === 0) return null;
      const city = cities[Math.floor(rng() * cities.length)];
      return { type, data: { cityId: city.id, cityName: city.name, queue: [...city.productionQueue] } };
    }
    case 'wonder_in_progress': {
      const wonderCities = spyCiv.cities.map(id => state.cities?.[id])
        .filter(c => c?.productionQueue[0]?.startsWith('legendary:'));
      if (wonderCities.length === 0) return null;
      const city = wonderCities[Math.floor(rng() * wonderCities.length)];
      return { type, data: { cityId: city.id, wonderId: city.productionQueue[0].replace('legendary:', '') } };
    }
    case 'map_area': {
      const tiles = Object.keys(spyCiv.visibility?.tiles ?? {}).filter(k => spyCiv.visibility.tiles[k] === 'visible');
      if (tiles.length === 0) return null;
      // Fisher-Yates shuffle using seeded rng, then take first 8
      const shuffled = [...tiles];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const sample = shuffled.slice(0, 8).map(k => {
        const [q, r] = k.split(',').map(Number);
        return { q, r };
      });
      return { type, data: { tiles: sample, note: 'Information may be outdated' } };
    }
    case 'tech_hint': {
      const theirTechs = spyCiv.techState.completed;
      if (theirTechs.length === 0) return null;
      const tech = theirTechs[Math.floor(rng() * theirTechs.length)];
      return { type, data: { techId: tech, researchBonus: 0.05 } };
    }
    default: return null;
  }
}
