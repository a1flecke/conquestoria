import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TECH_TREE } from '@/systems/tech-definitions';
import { TECH_COST_DISCOUNTS, TECH_YIELD_MODIFIERS, type YieldKind } from '@/systems/tech-yield-definitions';
import { UNIT_MODIFIERS, type UnitModifier } from '@/systems/unit-modifier-definitions';

/**
 * #420 child 1 — the factual half of the tech strategic-choice audit.
 *
 * Everything here is derived from current source: nothing is hand-classified. The judgment layer
 * (KEEP / TUNE / REPLACE / WIRE / FOLLOW-UP / OBSOLETE, replacement candidates, the historical
 * warfare reconciliation) lives in `tests/systems/tech-audit/tech-audit-data.ts` and is joined to
 * these rows by `tech-audit-report.ts`.
 *
 * Three effect channels exist today, and a tech can use any of them:
 *   1. the yield table (`TECH_YIELD_MODIFIERS`) and the cost table (`TECH_COST_DISCOUNTS`);
 *   2. the unit-modifier table (`UNIT_MODIFIERS`: combat strength, healing, vision);
 *   3. bespoke code that names the tech id (city maturity, espionage, unrest relief, movement, ...).
 */

export const AUDITED_ERA_MAX = 12;

export interface TechAuditRow {
  id: string;
  name: string;
  era: number;
  track: string;
  /** `Tech.unlocks` lines (effect text), verbatim. */
  unlockText: string[];
  unitUnlocks: number;
  buildingUnlocks: number;
  yieldEffects: Array<{ kind: YieldKind['kind']; label: string; signature: string }>;
  costDiscounts: string[];
  unitModifiers: Array<{ effect: string; summary: string; broad: boolean }>;
  /** Source modules (outside catalogs and migrations) that name this tech id. A pointer, not a proof of an effect. */
  codeOwners: string[];
  hasPacingMetadata: boolean;
}

/** Kinds that grant a number with no condition, scaling or choice attached. */
export const FLAT_YIELD_KINDS: ReadonlySet<YieldKind['kind']> = new Set(['cityFlat', 'empireFlat', 'empirePercent']);

/**
 * Files whose mention of a tech id is NOT an effect owner: the tech definitions themselves, the catalogs that
 * only gate content behind a tech, frozen migrations, test scenarios, and presentation code where an id
 * collides with an unrelated word ('fire', 'wheel', 'music').
 */
const OWNER_EXCLUDED_PREFIXES = [
  'src/storage/', 'src/testing/', 'src/audio/', 'src/renderer/', 'src/input/', 'src/presentation/',
];
const OWNER_EXCLUDED_FRAGMENTS = [
  'tech-definitions', 'tech-yield-definitions', 'tech-progression', 'city-building-catalog', 'city-unit-catalog',
  'legendary-wonder-definitions', 'resource-definitions', 'wonder-codex', 'wonder-spectacle', 'pacing-model',
  'unit-modifier-definitions', 'src/core/types.ts', 'era-pacing-profiles',
];

function walkTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkTs(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

function moduleName(path: string): string {
  return path.replace(/^src\//, '').replace(/\.ts$/, '');
}

function loadOwnerSources(root: string): Array<{ path: string; text: string }> {
  return walkTs(join(root, 'src'))
    .map(full => relative(root, full))
    .filter(path => !OWNER_EXCLUDED_PREFIXES.some(prefix => path.startsWith(prefix)))
    .filter(path => !OWNER_EXCLUDED_FRAGMENTS.some(fragment => path.includes(fragment)))
    .map(path => ({ path, text: readFileSync(join(root, path), 'utf8') }));
}

/** A stable description of what a yield effect does, used to find repeated niches across eras. */
export function yieldSignature(effect: YieldKind): string {
  const yields = (y: Partial<Record<string, number>>): string => Object.keys(y).filter(k => (y[k] ?? 0) !== 0).sort().join('+');
  switch (effect.kind) {
    case 'cityFlat': return `flat:${yields(effect.yields)}`;
    case 'empireFlat': return `empire-flat:${yields(effect.yields)}`;
    case 'empirePercent': return `empire-percent:${effect.resource}`;
    case 'cityFlatConditional': {
      const cond = [
        effect.requiresAnyBuilding && `any:${[...effect.requiresAnyBuilding].sort().join('|')}`,
        effect.requiresAllBuildings && `all:${[...effect.requiresAllBuildings].sort().join('|')}`,
        effect.requiresBuildingCategory && `cat:${effect.requiresBuildingCategory}`,
        effect.requiresRiver && 'river',
        effect.requiresCoastal && 'coastal',
        effect.minBuildings !== undefined && `min:${effect.minBuildings}`,
        effect.requiresMissingBuilding && `missing:${[...effect.requiresMissingBuilding].sort().join('|')}`,
        effect.requiresWonder && 'wonder',
      ].filter(Boolean).join(',');
      return `city-if[${cond}]:${yields(effect.yields)}`;
    }
    case 'perBuildingCategory': return `per-category:${effect.category}:${yields(effect.yields)}`;
    case 'perBuildingId': return `per-building:${[...effect.buildingIds].sort().join('|')}:${yields(effect.yields)}`;
    case 'perImprovement': return `per-improvement:${effect.improvement}:${yields(effect.yields)}`;
    case 'perPopulation': return `per-population:${effect.per}:${yields(effect.yields)}`;
    case 'perTradeRoute': return `per-route:${effect.foreignOnly ? 'foreign' : effect.domesticOnly ? 'domestic' : effect.coastalOnly ? 'coastal' : 'any'}`;
    case 'tradeRoutePercent': return 'route-percent';
    case 'perLuxuryResource': return 'per-luxury';
    case 'perOwnedNaturalWonder': return 'per-natural-wonder';
    case 'foundingBonus': return 'founding-food';
    case 'foundingProductionBonus': return 'founding-production';
    case 'terrainYield': return `terrain:${[...effect.terrains].sort().join('|')}:${yields(effect.yields)}`;
    case 'perCompletedLegendaryWonder': return 'per-legendary-wonder';
    case 'perRoutePartnerCiv': return 'per-route-partner';
    case 'perCityRoute': return `per-city-route:${effect.requiresBuilding}`;
    case 'lowestCityScience': return 'lowest-city-science';
    case 'foodFromScience': return 'food-from-science';
    case 'maintenanceDiscount': return `maintenance:${effect.minBuildings}`;
  }
}

function unitModifierRow(modifier: UnitModifier): TechAuditRow['unitModifiers'][number] {
  const scope = modifier.unitTypes?.length
    ? `units:${modifier.unitTypes.join('/')}`
    : modifier.appliesTo?.length
      ? `class:${modifier.appliesTo.join('/')}`
      : modifier.domain ? `domain:${modifier.domain}` : 'all units';
  const when = modifier.when ?? 'always';
  const condition = modifier.condition ?? (modifier.targetTerrains ? 'terrain' : 'none');
  const amount = modifier.mode === 'multiplier' ? `x${modifier.value}` : `+${modifier.value}`;
  return {
    effect: modifier.effect,
    summary: `${modifier.effect} ${amount} (${scope}; ${when}; ${condition})`,
    // Unconditional on an entire army / domain / class: the combat counterpart of "+N all cities".
    broad: modifier.effect === 'combatStrength' && when === 'always' && condition === 'none' && !modifier.unitTypes?.length,
  };
}

export function buildTechAuditInventory(root = process.cwd()): TechAuditRow[] {
  const sources = loadOwnerSources(root);
  return TECH_TREE
    .filter(tech => tech.era <= AUDITED_ERA_MAX)
    .map(tech => {
      const owners = sources
        .filter(source => source.text.includes(`'${tech.id}'`) || source.text.includes(`"${tech.id}"`))
        .map(source => moduleName(source.path));
      return {
        id: tech.id,
        name: tech.name,
        era: tech.era,
        track: tech.track,
        unlockText: [...tech.unlocks],
        unitUnlocks: tech.unlocksUnits?.length ?? 0,
        buildingUnlocks: tech.unlocksBuildings?.length ?? 0,
        yieldEffects: TECH_YIELD_MODIFIERS
          .filter(modifier => modifier.techId === tech.id)
          .map(modifier => ({ kind: modifier.effect.kind, label: modifier.label, signature: yieldSignature(modifier.effect) })),
        costDiscounts: TECH_COST_DISCOUNTS
          .filter(discount => discount.techId === tech.id)
          .map(discount => `${Array.isArray(discount.appliesTo) ? discount.appliesTo.join('/') : discount.appliesTo} x${discount.multiplier}`),
        unitModifiers: UNIT_MODIFIERS
          .filter(modifier => modifier.source.kind === 'tech' && modifier.source.id === tech.id)
          .map(unitModifierRow),
        codeOwners: owners,
        hasPacingMetadata: tech.pacing !== undefined,
      };
    });
}
