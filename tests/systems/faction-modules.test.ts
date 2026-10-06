import { describe, expect, it } from 'vitest';
import * as commands from '@/systems/faction-commands';
import * as federalism from '@/systems/faction-federalism';
import * as pressure from '@/systems/faction-pressure';
import * as relief from '@/systems/faction-relief';
import * as system from '@/systems/faction-system';
import * as model from '@/systems/faction-unrest-model';

const MODULES: Record<string, object> = {
  'faction-unrest-model': model,
  'faction-federalism': federalism,
  'faction-relief': relief,
  'faction-pressure': pressure,
  'faction-commands': commands,
  'faction-system': system,
};

/**
 * #1246: faction-system.ts (918 lines, 49 exports, five responsibilities) was split by responsibility.
 * These pins make the split's public surface explicit: each module's exact runtime export list, so a new
 * export is a deliberate edit here, and nothing quietly grows back into the orchestration module.
 * Dependency direction is pinned separately by the `faction-*` rules in tests/app/architecture/rules.ts.
 */
const SURFACE: Record<string, string[]> = {
  'faction-unrest-model': [
    'BREAKAWAY_REVOLT_TURNS', 'CONQUEST_UNREST_DURATION', 'MAX_PRESSURE_DISTANCE', 'MAX_PRESSURE_EMPIRE',
    'OVEREXTENSION_FREE_CITIES', 'REVOLT_UNREST_TURNS', 'UNREST_TRIGGER_PRESSURE', 'canGarrisonCity',
    'createUnrestEvaluationContext', 'getUnrestYieldMultiplier', 'isCityProductionLocked',
  ],
  'faction-federalism': [
    'FEDERALISM_LOCK_TURNS', 'FEDERALISM_REMITTANCE_LOSS_FRACTION', 'FEDERALISM_TECH_ID', 'canToggleFederalism',
    'getFederalismLockedUntilTurn', 'getFederalismRemittanceLoss', 'setFederalismStance',
  ],
  'faction-relief': [
    'BUREAUCRACY_FREE_CITY_BONUS', 'BUREAUCRACY_MAX_RELIEF', 'BUREAUCRACY_TECH_ID', 'COURTHOUSE_DISTANCE_RELIEF_FRACTION',
    'COURTHOUSE_OVEREXTENSION_RELIEF', 'COURTHOUSE_SPRAWL_FLOOR', 'RAILWAY_ADMINISTRATION_DISTANCE_RELIEF_FRACTION',
    'RAILWAY_ADMINISTRATION_MAX_RELIEF', 'RAILWAY_ADMINISTRATION_TECH_ID', 'UNREST_RELIEF_SOURCES',
    'getBureaucracyReliefAmount', 'getCourthouseReliefAmount', 'getFederalismReliefAmount',
    'getRailwayAdministrationReliefAmount', 'getRegionalCapitalReliefAmount', 'getUnrestReliefRows',
  ],
  'faction-pressure': [
    'CONTAGION_GROUP_RANGE', 'computeUnrestPressure', 'getCityHappinessFromBuildings', 'getContagionSpread',
    'getTopUnrestPressureCauses',
    'getUnrestPressureBreakdown',
  ],
  'faction-commands': [
    'CONCESSION_COST_MULTIPLIER', 'CONCESSION_COST_MULTIPLIER_CIVICS', 'CONCESSION_IMMUNITY_TURNS',
    'appeaseFaction', 'concedeToMovement', 'getCityAppeaseCost', 'getConcessionCost',
  ],
  'faction-system': ['processFactionTurn'],
};

/** Helpers that were private before the split and must stay private to their own module. */
const PRIVATE: Array<[module: string, name: string]> = [
  ['faction-relief', 'getOwnedRoadConnectedCities'],
  ['faction-relief', 'getRoadPostNetworkReliefAmount'],
  ['faction-relief', 'getRegionalCapitalCity'],
  ['faction-system', 'spawnRebelUnits'],
  ['faction-system', 'clearEraOneUnrestForCity'],
  ['faction-commands', 'hasCurrentEraCivicsTech'],
];

describe('#1246 — the faction modules keep their audited public surface', () => {
  for (const [module, names] of Object.entries(SURFACE)) {
    it(`${module} exports exactly its responsibility`, () => {
      expect(Object.keys(MODULES[module]!).sort()).toEqual([...names].sort());
    });
  }

  it('every pre-split value export is accounted for: 45 originals (49 minus 4 types) + the 2 shared pressure caps + the #1356 cause helper', () => {
    const values = Object.values(SURFACE).flat();
    expect(new Set(values).size, 'no export is owned by two modules').toBe(values.length);
    expect(values).toHaveLength(48);
  });

  it('helpers that were private before the split stay private', () => {
    for (const [module, name] of PRIVATE) {
      expect(MODULES[module], `${name} must stay private to ${module}`).not.toHaveProperty(name);
    }
  });
});
