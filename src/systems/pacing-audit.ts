import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { getTargetTurnWindow, estimateTurnsToComplete } from '@/systems/pacing-model';
import { TECH_TREE } from '@/systems/tech-definitions';

export interface PacingAuditRow {
  id: string;
  label: string;
  contentType: 'building' | 'unit' | 'tech';
  era: number;
  band: string;
  currentCost: number;
  estimatedTurns: number;
  recommendedCost: number;
  target: { min: number; max: number };
  outlier: boolean;
  outlierReason: string;
}

function getUnlockEra(techId?: string | null): number {
  if (!techId) {
    return 1;
  }

  return TECH_TREE.find(tech => tech.id === techId)?.era ?? 1;
}

function buildAuditSignals(
  currentCost: number,
  outputPerTurn: number,
  target: { min: number; max: number },
): Pick<PacingAuditRow, 'estimatedTurns' | 'recommendedCost' | 'outlier' | 'outlierReason'> {
  const estimatedTurns = estimateTurnsToComplete({ cost: currentCost, outputPerTurn });
  const recommendedTurns = Math.round((target.min + target.max) / 2);
  const recommendedCost = recommendedTurns * outputPerTurn;
  const outlier = estimatedTurns < target.min || estimatedTurns > target.max;
  const outlierReason = estimatedTurns > target.max
    ? 'Slower than target window'
    : estimatedTurns < target.min
      ? 'Faster than target window'
      : 'Within target window';

  return {
    estimatedTurns,
    recommendedCost,
    outlier,
    outlierReason,
  };
}

export function buildPacingAudit(): PacingAuditRow[] {
  return [
    ...Object.values(BUILDINGS).map(building => {
      const era = getUnlockEra(building.techRequired);
      const band = building.pacing?.band ?? 'core';
      const target = getTargetTurnWindow({
        era,
        band,
        contentType: 'building',
      });
      return {
        id: building.id,
        label: building.name,
        contentType: 'building' as const,
        era,
        band,
        currentCost: building.productionCost,
        target,
        ...buildAuditSignals(building.productionCost, 4, target),
      };
    }),
    ...TRAINABLE_UNITS.map(unit => {
      const era = getUnlockEra(unit.techRequired);
      const band = unit.pacing?.band ?? 'core';
      const target = getTargetTurnWindow({
        era,
        band,
        contentType: 'unit',
      });
      return {
        id: unit.type,
        label: unit.name,
        contentType: 'unit' as const,
        era,
        band,
        currentCost: unit.cost,
        target,
        ...buildAuditSignals(unit.cost, 4, target),
      };
    }),
    ...TECH_TREE.map(tech => {
      const band = tech.pacing?.band ?? 'core';
      const outputPerTurn = tech.era === 1 ? 3 : 8;
      const target = getTargetTurnWindow({
        era: tech.era,
        band,
        contentType: 'tech',
      });
      return {
        id: tech.id,
        label: tech.name,
        contentType: 'tech' as const,
        era: tech.era,
        band,
        currentCost: tech.cost,
        target,
        ...buildAuditSignals(tech.cost, outputPerTurn, target),
      };
    }),
  ];
}
