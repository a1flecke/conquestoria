import type { City, CivBonusEffect, ResourceType, UnitType } from '@/core/types';
import { BUILDINGS } from './city-building-catalog';
import { ERA_1_2_MELEE_UNIT_TYPES, MELEE_RANGED_UNIT_TYPES, TRAINABLE_UNITS } from './city-unit-catalog';
import { LOCAL_INFRASTRUCTURE_BUILDINGS } from './city-local-infrastructure';
import { getUnitRoleDefinition } from './combat-role-definitions';
import { getLegendaryWonderProductionCost } from './legendary-wonder-production';
import { getResourceAdvantageMultiplier } from './resource-advantages';
import { isSpyUnitType } from './spy-unit-types';
import { TECH_COST_DISCOUNTS } from './tech-yield-definitions';
import { UNIT_CLASS_BY_TYPE, isMilitaryUnitType, type UnitClass } from './unit-modifier-definitions';
import { civilizationEraFromNumber } from './era-types';
import type { CivilizationEra } from './era-types';

/**
 * Production-cost types and the pure pricing rules (#1008).
 *
 * This is the pricing core that `production-cost-context.ts` derives its
 * inputs for: that adapter builds a `ProductionCostContext` from `GameState`,
 * this module turns one item id + context into a number. Keeping the model and
 * the state-derived context in separate modules preserves #984's single
 * canonical input path without making the cost model part of a kitchen sink.
 */
export const SETTLER_COST_BY_ERA: Record<number, number> = {
  1: 24,
  2: 24,
  3: 40,
  4: 48,
  5: 56,
  6: 64,
  7: 72,
  8: 80,
  9: 88,
  10: 96,
  11: 104,
  12: 112,
  13: 120,
};

function normalizeProductionEra(era: number | undefined): number {
  const numericEra = typeof era === 'number' && Number.isFinite(era) ? era : 1;
  return Math.max(1, Math.floor(numericEra));
}

export function getSettlerProductionCost(era: number = 1): number {
  const normalized = normalizeProductionEra(era);
  return SETTLER_COST_BY_ERA[normalized] ?? SETTLER_COST_BY_ERA[Math.max(...Object.keys(SETTLER_COST_BY_ERA).map(Number))];
}

export function getCatalogProductionCost(itemId: string, era: number = 1): number {
  const legendaryCost = getLegendaryWonderProductionCost(itemId);
  if (legendaryCost !== null) return legendaryCost;

  const building = BUILDINGS[itemId];
  if (building) return building.productionCost;

  const unit = TRAINABLE_UNITS.find(candidate => candidate.type === itemId);
  if (!unit) return 0;
  if (unit.type === 'settler') return getSettlerProductionCost(era);
  return unit.cost;
}

function requiresResource(itemId: string, resource: ResourceType): boolean {
  const unit = TRAINABLE_UNITS.find(candidate => candidate.type === itemId);
  return unit?.resourceRequired?.includes(resource) ?? false;
}

function getBuildingDiscountMultiplier(itemId: string, cityBuildings: string[]): number {
  let best = 1;
  if (MELEE_RANGED_UNIT_TYPES.includes(itemId)) {
    if (cityBuildings.includes('armory'))      best = Math.min(best, 0.85);
    if (cityBuildings.includes('war-academy')) best = Math.min(best, 0.85);
  }
  const unit = TRAINABLE_UNITS.find(candidate => candidate.type === itemId);
  const localInfrastructureFamilies = unit
    ? getUnitRoleDefinition(unit.type)?.localInfrastructureFamilies ?? []
    : [];
  for (const infrastructure of LOCAL_INFRASTRUCTURE_BUILDINGS) {
    if (infrastructure.productionMultiplier
      && localInfrastructureFamilies.includes(infrastructure.family)
      && cityBuildings.includes(infrastructure.buildingId)) {
      best = Math.min(best, infrastructure.productionMultiplier);
    }
  }
  // Masonry Works: Walls building 20% cheaper
  if (itemId === 'walls') {
    if (cityBuildings.includes('masonry-works')) best = Math.min(best, 0.80);
  }
  // Steel Foundry: iron-requiring units 10% cheaper in this city
  if (requiresResource(itemId, 'iron')) {
    if (cityBuildings.includes('steel_foundry')) best = Math.min(best, 0.90);
  }
  return best;
}

function getTechCostDiscountMultiplier(itemId: string, isUnit: boolean, completedTechs: string[]): number {
  let multiplier = 1;
  for (const discount of TECH_COST_DISCOUNTS) {
    if (!completedTechs.includes(discount.techId)) continue;
    const applies = discount.appliesTo === 'buildings'
      ? !isUnit
      : discount.appliesTo === 'units'
        ? isUnit
        : discount.appliesTo === 'military-units'
          ? isUnit && isMilitaryUnitType(itemId)
          : (discount.appliesTo as string[]).includes(itemId);
    if (applies) multiplier *= discount.multiplier;
  }
  return multiplier;
}

export interface ActiveNationalProjectRef {
  id: string;
  fadeMultiplier: number;
}

interface NationalProjectProductionDiscount {
  nationalProjectId: string;
  // A UnitClass checks UNIT_CLASS_BY_TYPE membership (generic); an explicit UnitType[]
  // is for discounts that don't map to a single UnitClass (e.g. "era-1/2 melee").
  appliesTo: UnitClass | UnitType[];
  discount: number; // e.g. 0.10 for 10% cheaper
}

// National-project production discounts — empire-wide, fade-scaled with the project's
// yield multiplier. See .claude/rules/game-balance.md for the national-project ceiling policy;
// these are cost discounts, not yields, so they are outside that yield ceiling.
// Adding a new discount is purely additive: append a row here — do not add another
// `if (project.id === '...')` branch (see .claude/rules/game-balance.md National Project
// Production Discounts section for why this table exists instead of per-id branching).
const NP_PRODUCTION_DISCOUNTS: NationalProjectProductionDiscount[] = [
  { nationalProjectId: 'tribal_muster_ground', appliesTo: ERA_1_2_MELEE_UNIT_TYPES, discount: 0.10 },
  { nationalProjectId: 'military_academy', appliesTo: 'gunpowder', discount: 0.10 },
  { nationalProjectId: 'artillery_corps_hq', appliesTo: 'siege', discount: 0.10 },
];

function getNationalProjectDiscountMultiplier(
  itemId: string,
  isUnit: boolean,
  activeNationalProjects: ActiveNationalProjectRef[],
): number {
  if (!isUnit || activeNationalProjects.length === 0) return 1;
  const classes = UNIT_CLASS_BY_TYPE[itemId as UnitType] ?? [];
  let multiplier = 1;
  for (const project of activeNationalProjects) {
    const row = NP_PRODUCTION_DISCOUNTS.find(r => r.nationalProjectId === project.id);
    if (!row) continue;
    const applies = Array.isArray(row.appliesTo)
      ? (row.appliesTo as string[]).includes(itemId)
      : classes.includes(row.appliesTo);
    if (applies) multiplier *= 1 - row.discount * project.fadeMultiplier;
  }
  return multiplier;
}

/**
 * The complete input set `getProductionCostForItem` prices an item from.
 *
 * Every key is required so a caller cannot silently omit one. #984 (and the
 * national-project note in `.claude/rules/game-balance.md` before it) came from
 * the opposite shape: an all-optional option bag that seven call sites
 * assembled by hand, three of which quietly dropped a field or filled `era`
 * with World Age instead of the owning civilization's era. Where a field is
 * legitimately absent the key still has to be written, as `undefined`/`null`.
 *
 * Build one with `buildProductionCostContext(state, civId, cityId)`
 * (`src/systems/production-cost-context.ts`) -- the canonical path for every
 * gameplay caller. `createProductionCostContext` is the escape hatch for
 * actors that have no `Civilization` record (minor civs) and for unit tests.
 */
export interface ProductionCostContext {
  /** `null` when the item is priced outside any city (an upgrade in the field). */
  city: Pick<City, 'buildings'> | null;
  bonusEffect: CivBonusEffect | undefined;
  /**
   * The owning civilization's own technology-derived era
   * (`resolveCivilizationEra`). Never `state.era`, which is World Age — the
   * `CivilizationEra` brand makes that a compile error (#1016/#1017).
   */
  era: CivilizationEra;
  completedTechs: string[];
  activeNationalProjects: ActiveNationalProjectRef[];
  /** `undefined` means "do not filter by resources at all", not "owns none". */
  availableResources: ReadonlySet<ResourceType> | undefined;
  /** One empire-selected soft material supplied by Circular Manufacturing Network. */
  materialSubstitution: ResourceType | undefined;
  /** One pending Stampede reward discounts the next Beast Handler or War Elephant. */
  herdingInsight: boolean;
  /** One Host reward discounts only the next War Elephant. */
  recoveredHarnesses: boolean;
}

/**
 * A neutral context, for actors with no `Civilization` record to derive one from
 * (minor-civ production, which supplies a synthetic tech band and pressure era)
 * and for tests exercising the formula directly. Gameplay code owned by a major
 * civilization must use `buildProductionCostContext` instead -- enforced by
 * `tests/systems/production-cost-context.test.ts`.
 */
export function createProductionCostContext(
  overrides: Partial<ProductionCostContext> = {},
): ProductionCostContext {
  return {
    city: null,
    bonusEffect: undefined,
    era: civilizationEraFromNumber(1),
    completedTechs: [],
    activeNationalProjects: [],
    availableResources: undefined,
    materialSubstitution: undefined,
    herdingInsight: false,
    recoveredHarnesses: false,
    ...overrides,
  };
}

export function getProductionCostForItem(
  itemId: string,
  options: Partial<ProductionCostContext> = {},
): number {
  const baseCost = getCatalogProductionCost(itemId, options.era);
  if (baseCost <= 0) return 0;

  const unit = TRAINABLE_UNITS.find(candidate => candidate.type === itemId);
  const civMultiplier = applyProductionBonus(itemId, options.bonusEffect);

  const discounts: number[] = [];
  if (unit && options.city?.buildings.includes('safehouse') && isSpyUnitType(unit.type)) {
    discounts.push(0.75);
  }
  if (options.city) {
    const d = getBuildingDiscountMultiplier(itemId, options.city.buildings);
    if (d < 1) discounts.push(d);
  }
  const buildingDiscountMultiplier = discounts.length > 0 ? Math.min(...discounts) : 1;
  const techDiscountMultiplier = getTechCostDiscountMultiplier(itemId, unit != null, options.completedTechs ?? []);
  const npDiscountMultiplier = getNationalProjectDiscountMultiplier(
    itemId,
    unit != null,
    options.activeNationalProjects ?? [],
  );
  // Circular Manufacturing Network is a soft substitution only. The selected material
  // remains distinct from live resources so catalog rows can opt out (for example Ivory).
  const resourceAdvantageMultiplier = getResourceAdvantageMultiplier(
    itemId,
    options.availableResources ?? new Set<ResourceType>(),
    options.materialSubstitution,
  );
  const herdingInsightMultiplier = options.herdingInsight && (itemId === 'beast_handler' || itemId === 'war_elephant') ? 0.8 : 1;
  const recoveredHarnessesMultiplier = options.recoveredHarnesses && itemId === 'war_elephant' ? 0.75 : 1;
  const discountMultiplier = buildingDiscountMultiplier * techDiscountMultiplier * npDiscountMultiplier * resourceAdvantageMultiplier * herdingInsightMultiplier * recoveredHarnessesMultiplier;
  const effective = baseCost * civMultiplier * discountMultiplier;
  return discountMultiplier < 1 ? Math.ceil(effective) : Math.round(effective);
}

const WONDER_BUILDINGS = ['monument', 'amphitheater'];

export function applyProductionBonus(
  itemId: string,
  bonusEffect: CivBonusEffect | undefined,
): number {
  if (!bonusEffect) return 1;

  if (bonusEffect.type === 'faster_wonders' && WONDER_BUILDINGS.includes(itemId)) {
    return bonusEffect.speedMultiplier;
  }

  if (bonusEffect.type === 'faster_military') {
    const isMilitary = ['warrior', 'scout'].includes(itemId) ||
      ['barracks', 'walls', 'stable'].includes(itemId);
    if (isMilitary) return bonusEffect.speedMultiplier;
  }

  if (bonusEffect.type === 'coastal_science') {
    const isNaval = (['galley', 'trireme', 'transport', 'carrack', 'galleon', 'steamship', 'troop_transport'] as string[]).includes(itemId);
    if (isNaval) return 1 - bonusEffect.navalProductionBonus;
  }

  // Shire: military units cost 25% more
  if (bonusEffect.type === 'peaceful_growth') {
    const militaryTypes = ['warrior', 'swordsman', 'pikeman', 'musketeer', 'scout', 'archer'];
    if (militaryTypes.includes(itemId)) {
      return 1 + bonusEffect.militaryPenalty; // e.g. 1.25
    }
  }

  return 1;
}
