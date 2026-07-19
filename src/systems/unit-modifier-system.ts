import type { GameState, HexCoord, UnitType } from '@/core/types';
import { hexDistance } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';
import {
  CLASS_COUNTERS,
  UNIT_CLASS_BY_TYPE,
  UNIT_MODIFIERS,
  type ModifierMode,
} from './unit-modifier-definitions';

export interface ActiveNationalProject {
  id: string;
  fadeMultiplier: number;
}

export interface ModifierPart {
  label: string;
  kind: 'mult' | 'flat';
}

export interface CombatModifierContext {
  completedTechs: readonly string[];
  activeNationalProjects: ActiveNationalProject[];
  fullHP: boolean;
  inFriendlyCity: boolean;
  targetIsCoastalCity?: boolean;
  amphibiousAssault?: boolean;
  opponentType: UnitType;
  opponentInFriendlyCity?: boolean;
}

export interface CombatModifierResult {
  mult: number;
  flat: number;
  parts: ModifierPart[];
}

function formatPart(label: string, mode: ModifierMode, value: number): string {
  return mode === 'multiplier' ? `${label} ×${value}` : `${label} +${value}`;
}

function sourceIsActive(
  source: { kind: 'tech'; id: string } | { kind: 'nationalProject'; id: string } | { kind: 'unit'; id: UnitType },
  completedTechs: readonly string[],
  activeNationalProjects: ActiveNationalProject[],
  unitType?: UnitType,
): number | undefined {
  if (source.kind === 'tech') {
    return completedTechs.includes(source.id) ? 1 : undefined;
  }
  if (source.kind === 'unit') return source.id === unitType ? 1 : undefined;
  const np = activeNationalProjects.find(p => p.id === source.id);
  if (!np || np.fadeMultiplier <= 0) return undefined;
  return np.fadeMultiplier;
}

export function getClassCounterMultiplier(
  attackerType: UnitType,
  defenderType: UnitType,
  defenderInFriendlyCity: boolean,
): { multiplier: number; label: string } | undefined {
  const defenderClasses = UNIT_CLASS_BY_TYPE[defenderType];
  const defenderDomain = UNIT_DEFINITIONS[defenderType]?.domain ?? 'land';
  for (const counter of CLASS_COUNTERS) {
    if (counter.requiresDefenderInFriendlyCity && !defenderInFriendlyCity) continue;
    if (counter.requiresDefenderDomain && counter.requiresDefenderDomain !== defenderDomain) continue;
    if (counter.defenderTypes && !counter.defenderTypes.includes(defenderType)) continue;
    if (!defenderClasses.includes(counter.defenderClass)) continue;
    if (counter.attackerTypes) {
      if (!counter.attackerTypes.includes(attackerType)) continue;
    } else if (counter.attackerClass) {
      if (!UNIT_CLASS_BY_TYPE[attackerType].includes(counter.attackerClass)) continue;
    } else {
      continue;
    }
    return { multiplier: counter.multiplier, label: `${counter.label} ×${counter.multiplier}` };
  }
  return undefined;
}

// Order documented for the composition lock test (tests/systems/unit-modifier-system.test.ts):
// modifiers apply after terrain/fortify/civ-bonus multipliers, before MR3 city-defense.
export function getCombatModifier(
  unitType: UnitType,
  role: 'attacker' | 'defender',
  ctx: CombatModifierContext,
): CombatModifierResult {
  let mult = 1;
  let flat = 0;
  const parts: ModifierPart[] = [];
  const classes = UNIT_CLASS_BY_TYPE[unitType];
  const domain = UNIT_DEFINITIONS[unitType]?.domain ?? 'land';

  for (const modifier of UNIT_MODIFIERS) {
    if (modifier.effect !== 'combatStrength') continue;

    const scale = sourceIsActive(modifier.source, ctx.completedTechs, ctx.activeNationalProjects, unitType);
    if (scale === undefined) continue;

    if (modifier.unitTypes) {
      if (!modifier.unitTypes.includes(unitType)) continue;
    } else if (modifier.appliesTo) {
      if (!modifier.appliesTo.some(c => classes.includes(c))) continue;
    }

    if (modifier.domain && modifier.domain !== domain) continue;

    const when = modifier.when ?? 'always';
    if (when === 'attacking' && role !== 'attacker') continue;
    if (when === 'defending' && role !== 'defender') continue;

    if (modifier.condition === 'fullHP' && !ctx.fullHP) continue;
    if (modifier.condition === 'inFriendlyCity' && !ctx.inFriendlyCity) continue;
    if (modifier.condition === 'vsCoastalCity' && !ctx.targetIsCoastalCity) continue;
    if (modifier.condition === 'amphibiousAssault' && !ctx.amphibiousAssault) continue;

    if (modifier.mode === 'multiplier') {
      mult *= modifier.value;
      parts.push({ label: formatPart(modifier.label, 'multiplier', modifier.value), kind: 'mult' });
    } else {
      const value = Math.floor(modifier.value * scale);
      if (value === 0) continue;
      flat += value;
      parts.push({ label: formatPart(modifier.label, 'flat', value), kind: 'flat' });
    }
  }

  if (role === 'attacker') {
    const counter = getClassCounterMultiplier(unitType, ctx.opponentType, ctx.opponentInFriendlyCity ?? false);
    if (counter) {
      mult *= counter.multiplier;
      parts.push({ label: counter.label, kind: 'mult' });
    }
  }

  return { mult, flat, parts };
}

export interface HealingModifierContext {
  completedTechs: readonly string[];
  activeNationalProjects: ActiveNationalProject[];
  inFriendlyCity: boolean;
  inFriendlyTerritory: boolean;
  withinRangeOfFriendlyCity3: boolean;
  withinRangeOfNeuralRehabilitationCenter: boolean;
}

export interface HealingModifierResult {
  flat: number;
  mult: number;
  parts: ModifierPart[];
}

export function getHealingBonus(ctx: HealingModifierContext): HealingModifierResult {
  let flat = 0;
  let mult = 1;
  const parts: ModifierPart[] = [];

  for (const modifier of UNIT_MODIFIERS) {
    if (modifier.effect !== 'healing') continue;

    const scale = sourceIsActive(modifier.source, ctx.completedTechs, ctx.activeNationalProjects);
    if (scale === undefined) continue;

    if (modifier.condition === 'inFriendlyCity' && !ctx.inFriendlyCity) continue;
    if (modifier.condition === 'inFriendlyTerritory' && !ctx.inFriendlyTerritory) continue;
    if (modifier.condition === 'withinRangeOfFriendlyCity3' && !ctx.withinRangeOfFriendlyCity3) continue;
    if (modifier.condition === 'withinRangeOfNeuralRehabilitationCenter' && !ctx.withinRangeOfNeuralRehabilitationCenter) continue;

    if (modifier.mode === 'multiplier') {
      mult *= modifier.value;
      parts.push({ label: formatPart(modifier.label, 'multiplier', modifier.value), kind: 'mult' });
    } else {
      const value = Math.floor(modifier.value * scale);
      if (value === 0) continue;
      flat += value;
      parts.push({ label: formatPart(modifier.label, 'flat', value), kind: 'flat' });
    }
  }

  return { flat, mult, parts };
}

export function getVisionBonus(
  unitType: UnitType,
  completedTechs: readonly string[],
  activeNationalProjects: ActiveNationalProject[],
): number {
  let bonus = 0;
  const classes = UNIT_CLASS_BY_TYPE[unitType];

  for (const modifier of UNIT_MODIFIERS) {
    if (modifier.effect !== 'vision') continue;

    const scale = sourceIsActive(modifier.source, completedTechs, activeNationalProjects);
    if (scale === undefined) continue;

    if (modifier.unitTypes) {
      if (!modifier.unitTypes.includes(unitType)) continue;
    } else if (modifier.appliesTo) {
      if (!modifier.appliesTo.some(c => classes.includes(c))) continue;
    }

    bonus += Math.floor(modifier.value * scale);
  }

  return bonus;
}

export function isWithinRangeOfTelemedicineHub(
  state: GameState,
  civId: string,
  position: HexCoord,
  range: number,
): boolean {
  return Object.values(state.cities).some(city =>
    city.owner === civId
    && city.buildings.includes('telemedicine_hub')
    && hexDistance(position, city.position) <= range,
  );
}

export function isWithinRangeOfNeuralRehabilitationCenter(
  state: GameState,
  civId: string,
  position: HexCoord,
  range: number,
): boolean {
  return Object.values(state.cities).some(city =>
    city.owner === civId
    && city.buildings.includes('neural_rehabilitation_center')
    && hexDistance(position, city.position) <= range,
  );
}
