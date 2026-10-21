// src/storage/migrations/steps/material-reserves.ts
// #1506 MR09 — the one-time 35 → 36 transition (plan §3.7).
//
// This is the *only* writer allowed to create migration assistance. It:
//  1. seeds each living major's native ledger from its bounded sources (deduplicated, quantitative
//     goods only, `min(capacity, sources × perSource)`);
//  2. visits each city's **active** occurrence in stable owner/city order — never the queue tail —
//     and reserves its hard recipe from that seed;
//  3. fills only the missing amounts of legacy-entitled or demonstrably invested active work with a
//     finite imported grant, tagged `migration-grant` and reserved to that occurrence.
//
// It never touches production progress, never bills finished items, never invents incoming cargo,
// and never grants work that is no longer legal. A second normalization/reload is a no-op because the
// schema guard stops this step from running again; the migration is a pure state → state pass.
import type { Building, City, GameState, ResourceType } from '@/core/types';
import type {
  MaterialCostRow,
  ProductionMaterialRef,
  ReserveLedger,
  TradeGoodId,
} from '@/core/types/commerce';
import { BUILDINGS } from '@/systems/city-building-catalog';
import { TRAINABLE_UNITS } from '@/systems/city-unit-catalog';
import { isCityCoastal } from '@/systems/city-lifecycle';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { getMaterialRecipe, type MaterialRecipe } from '@/systems/resource-material-costs';
import {
  buildStartingMaterialLedger,
  createNeutralCityMaterials,
} from '@/systems/resource-material-state';
import { getFreeQuantity, getReserveBalance, reserveStock } from '@/systems/resource-reserve-system';
import { findTradeGood } from '@/systems/trade-good-definitions';

/** The created occurrence is the first one; later head transitions advance it in normal play. */
export function migrationReservationId(
  ref: ProductionMaterialRef,
  goodId: TradeGoodId,
  portion: 'seed' | 'grant',
): string {
  return `migration:${ref.cityId}:${ref.occurrence}:${goodId}:${portion}`;
}

function resourceOfGood(goodId: TradeGoodId): ResourceType | null {
  const nativeSource = findTradeGood(goodId)?.nativeSource;
  return nativeSource?.kind === 'resource' ? nativeSource.resource : null;
}

/**
 * Was this active item legal under the rules that wrote the save? Mirror the queue's nonmaterial
 * gates, conservatively: a false negative leaves a valid item waiting (safe), while a grant to an
 * invalid foreign/coastal/expired item would be stock the player never earned.
 */
function isStillLegal(state: GameState, city: City, itemId: string): boolean {
  if (itemId.startsWith('legendary:')) return true; // no hard recipe; handled by the recipe check
  const civ = state.civilizations[city.owner];
  if (!civ) return false;

  const completed = new Set(civ.techState.completed ?? []);
  const techGrace = new Set(city.legacyTechGrace ?? []);
  const techMet = (tech: string | null | undefined): boolean =>
    !tech || completed.has(tech) || techGrace.has(itemId);

  const building: Building | undefined = BUILDINGS[itemId];
  if (building) {
    if (!techMet(building.techRequired)) return false;
    if (building.requiredTechs?.some(tech => !techMet(tech))) return false;
    if (building.requiresBuildings?.some(required => !city.buildings.includes(required))) return false;
    if (building.coastalRequired && !isCityCoastal(city, state.map)) return false;
    if (building.obsoletedByTech && completed.has(building.obsoletedByTech)) return false;
    if (building.uniquePerEmpire || building.nationalProject) {
      for (const otherCityId of civ.cities ?? []) {
        if (otherCityId === city.id) continue;
        if (state.cities[otherCityId]?.buildings.includes(itemId)) return false;
      }
    }
    if (building.nationalProject) {
      const era = resolveCivilizationEra([...completed]);
      const homeEra = building.nationalProject.homeEra;
      if (era < homeEra || era > homeEra + 1) return false;
    }
    return true;
  }

  const unit = TRAINABLE_UNITS.find(candidate => candidate.type === itemId);
  if (!unit) return false;
  if (unit.civTypeRequired && unit.civTypeRequired !== civ.civType) return false;
  if (!techMet(unit.techRequired)) return false;
  if (unit.requiredTechs?.some(tech => !techMet(tech))) return false;
  if (unit.obsoletedByTech && completed.has(unit.obsoletedByTech)) return false;
  if (unit.coastalRequired && !isCityCoastal(city, state.map)) return false;
  if (unit.trainedFromBuilding && !city.buildings.includes(unit.trainedFromBuilding)) return false;
  return true;
}

/**
 * The old eligibility rule was *access*, not owned stock: a city-center deposit, a completed
 * improvement, an outpost, or an unexpired purchase. `legacyResourceGrace` is the explicit
 * per-occurrence grandfather the late-resources migration wrote.
 */
function legacyEntitlement(state: GameState, city: City, itemId: string, recipe: MaterialRecipe): boolean {
  if ((city.legacyResourceGrace ?? []).includes(itemId)) return true;
  const access = getCivAvailableResources(state, city.owner);
  return recipe.rows.every(row => {
    const resource = resourceOfGood(row.goodId);
    return resource !== null && access.has(resource);
  });
}

interface FundedOccurrence {
  ledger: ReserveLedger;
  commitment: { ref: ProductionMaterialRef; recipe: readonly MaterialCostRow[]; reservationIds: readonly string[] } | null;
}

/**
 * Reserve the full recipe from the bounded seed, then fill the remaining deficit of each row with an
 * imported grant that exists only for this occurrence. Returns the original ledger untouched when
 * nothing could be reserved.
 */
function fundOccurrence(
  ledger: ReserveLedger,
  city: City,
  recipe: MaterialRecipe,
  occurrence: number,
): FundedOccurrence {
  const ref: ProductionMaterialRef = {
    ownerCivId: city.owner,
    cityId: city.id,
    occurrence,
    itemId: recipe.itemId,
  };
  let next = ledger;
  const reservationIds: string[] = [];

  for (const row of recipe.rows) {
    const free = getFreeQuantity(next, row.goodId);
    const ordinary = Math.min(Math.max(0, free), row.quantity);

    if (ordinary > 0) {
      const reservationId = migrationReservationId(ref, row.goodId, 'seed');
      const reserved = reserveStock(next, {
        id: reservationId,
        goodId: row.goodId,
        ownerCivId: city.owner,
        amount: ordinary,
        reason: 'active-production',
        consumer: ref,
      });
      if (reserved.ok) {
        next = reserved.ledger;
        reservationIds.push(reservationId);
      }
    }

    const deficit = row.quantity - ordinary;
    if (deficit > 0) {
      const beforeGrant = next;
      const balance = getReserveBalance(next, row.goodId);
      next = {
        ...next,
        balances: { ...next.balances, [row.goodId]: { ...balance, imported: balance.imported + deficit } },
      };
      const reservationId = migrationReservationId(ref, row.goodId, 'grant');
      const reserved = reserveStock(next, {
        id: reservationId,
        goodId: row.goodId,
        ownerCivId: city.owner,
        amount: deficit,
        reason: 'migration-grant',
        consumer: ref,
        migrationGrantImported: deficit,
      });
      if (reserved.ok) {
        next = reserved.ledger;
        reservationIds.push(reservationId);
      } else {
        // Never leave untagged imported stock behind: assistance exists only while reserved.
        next = beforeGrant;
      }
    }
  }

  return {
    ledger: next,
    commitment: reservationIds.length > 0
      ? { ref, recipe: recipe.rows, reservationIds }
      : null,
  };
}

export function migrateMaterialReserves(state: GameState): GameState {
  const ledgers: Record<string, ReserveLedger> = { ...(state.materialReservesByCiv ?? {}) };

  const livingCivIds = Object.keys(state.civilizations)
    .filter(civId => !state.civilizations[civId].isEliminated)
    .sort();
  for (const civId of livingCivIds) {
    // An existing ledger is authoritative — never reseed a save that already carries one.
    if (!ledgers[civId]) ledgers[civId] = buildStartingMaterialLedger(state, civId);
  }

  const cities: Record<string, City> = { ...state.cities };
  const orderedCityIds = Object.keys(state.cities).sort((left, right) => {
    const ownerOrder = state.cities[left].owner.localeCompare(state.cities[right].owner);
    return ownerOrder !== 0 ? ownerOrder : left.localeCompare(right);
  });

  for (const cityId of orderedCityIds) {
    const city = state.cities[cityId];
    if (!city || !ledgers[city.owner]) continue;

    const materials = city.productionMaterials ?? createNeutralCityMaterials();
    const itemId = city.productionQueue[0];
    let commitment = materials.commitment;

    if (itemId && !commitment) {
      const lookup = getMaterialRecipe(itemId);
      if (lookup.known && lookup.recipe.rows.length > 0 && isStillLegal(state, city, itemId)) {
        const entitled = legacyEntitlement(state, city, itemId, lookup.recipe);
        // Progress proves the item was genuinely under construction; honor it even after a source
        // loss, which is exactly the case the old access rule would have papered over.
        const invested = city.productionProgress > 0;
        if (entitled || invested) {
          const funded = fundOccurrence(ledgers[city.owner], city, lookup.recipe, materials.activeOccurrence);
          ledgers[city.owner] = funded.ledger;
          commitment = funded.commitment;
        }
      }
    }

    cities[cityId] = { ...city, productionMaterials: { ...materials, commitment } };
  }

  return { ...state, materialReservesByCiv: ledgers, cities };
}
