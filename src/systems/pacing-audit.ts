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
  target: { min: number; max: number };
}

export function buildPacingAudit(): PacingAuditRow[] {
  return [
    ...Object.values(BUILDINGS).map(building => ({
      id: building.id,
      label: building.name,
      contentType: 'building' as const,
      era: building.techRequired ? 2 : 1,
      band: building.pacing?.band ?? 'core',
      currentCost: building.productionCost,
      estimatedTurns: estimateTurnsToComplete({ cost: building.productionCost, outputPerTurn: 4 }),
      target: getTargetTurnWindow({
        era: building.techRequired ? 2 : 1,
        band: building.pacing?.band ?? 'core',
        contentType: 'building',
      }),
    })),
    ...TRAINABLE_UNITS.map(unit => ({
      id: unit.type,
      label: unit.name,
      contentType: 'unit' as const,
      era: unit.techRequired ? 2 : 1,
      band: unit.pacing?.band ?? 'core',
      currentCost: unit.cost,
      estimatedTurns: estimateTurnsToComplete({ cost: unit.cost, outputPerTurn: 4 }),
      target: getTargetTurnWindow({
        era: unit.techRequired ? 2 : 1,
        band: unit.pacing?.band ?? 'core',
        contentType: 'unit',
      }),
    })),
    ...TECH_TREE.map(tech => ({
      id: tech.id,
      label: tech.name,
      contentType: 'tech' as const,
      era: tech.era,
      band: tech.pacing?.band ?? 'core',
      currentCost: tech.cost,
      estimatedTurns: estimateTurnsToComplete({ cost: tech.cost, outputPerTurn: tech.era === 1 ? 3 : 8 }),
      target: getTargetTurnWindow({
        era: tech.era,
        band: tech.pacing?.band ?? 'core',
        contentType: 'tech',
      }),
    })),
  ];
}
