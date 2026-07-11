import { describe, expect, it } from 'vitest';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import {
  PIRATE_BOUNTY_BASE,
  PIRATE_FACTION_CAP_BY_MAP_SIZE,
  PIRATE_FLEET_SIZE_BY_BEHAVIOR,
  PIRATE_HULL_TYPES,
  PIRATE_HULL_DEFINITIONS,
  PIRATE_MAX_FLOTILLA_FACTIONS,
  PIRATE_NOTORIETY,
  PIRATE_PLUNDER_CAP,
  PIRATE_PRESSURE,
  PIRATE_STAGE_DEFINITIONS,
  PIRATE_STAGE_SURCHARGE,
  PIRATE_TRIBUTE_BASE,
  composePirateFleet,
  getPirateBounty,
  getPirateTributeCost,
} from '@/systems/pirate-definitions';

describe('pirate definitions', () => {
  it('locks activation, escalation, economy, faction caps, and fleet sizes', () => {
    expect(PIRATE_PRESSURE).toEqual({
      activationSeed: 4,
      checkInterval: 4,
      threshold: 6,
      cap: 18,
      baseGain: 2,
      tradeRouteGainCap: 2,
      wealthyCityGainCap: 2,
      wealthyGrossGold: 8,
    });
    expect(PIRATE_NOTORIETY).toEqual({ raiding: 2, blockading: 5, besieging: 9, survivalInterval: 8 });
    expect(PIRATE_FACTION_CAP_BY_MAP_SIZE).toEqual({ small: 3, medium: 4, large: 5 });
    expect(PIRATE_MAX_FLOTILLA_FACTIONS).toBe(2);
    expect(PIRATE_FLEET_SIZE_BY_BEHAVIOR).toEqual({
      patrolling: { min: 1, max: 2 },
      raiding: { min: 2, max: 3 },
      blockading: { min: 3, max: 4 },
      besieging: { min: 3, max: 4 },
    });
    expect(PIRATE_TRIBUTE_BASE).toEqual({ patrolling: 15, raiding: 30, blockading: 50, besieging: 60 });
    expect(PIRATE_STAGE_SURCHARGE).toEqual([0, 0, 5, 10, 15, 20]);
    expect(PIRATE_PLUNDER_CAP).toEqual([0, 5, 8, 12, 16, 20]);
    expect(PIRATE_BOUNTY_BASE).toEqual({ patrolling: 10, raiding: 25, blockading: 45, besieging: 55 });
  });

  it('defines five stages and six dedicated hulls without unlocking them for cities', () => {
    expect(PIRATE_HULL_TYPES).toEqual([
      'pirate_galley',
      'pirate_corsair',
      'pirate_frigate',
      'pirate_ironclad',
      'pirate_fast_attack_craft',
      'pirate_mothership',
    ]);
    expect(PIRATE_STAGE_DEFINITIONS.map(stage => ({
      stage: stage.stage,
      triggerTechId: stage.triggerTechId,
      anchorHull: stage.anchorHull,
      allowedHulls: stage.allowedHulls,
    }))).toEqual([
      { stage: 1, triggerTechId: 'galleys', anchorHull: 'pirate_galley', allowedHulls: ['pirate_galley'] },
      { stage: 2, triggerTechId: 'navigation', anchorHull: 'pirate_corsair', allowedHulls: ['pirate_corsair', 'pirate_galley'] },
      { stage: 3, triggerTechId: 'triremes', anchorHull: 'pirate_frigate', allowedHulls: ['pirate_frigate', 'pirate_corsair', 'pirate_galley'] },
      { stage: 4, triggerTechId: 'caravels', anchorHull: 'pirate_ironclad', allowedHulls: ['pirate_ironclad', 'pirate_frigate', 'pirate_corsair'] },
      { stage: 5, triggerTechId: 'amphibious-warfare', anchorHull: 'pirate_mothership', allowedHulls: ['pirate_mothership', 'pirate_fast_attack_craft', 'pirate_ironclad', 'pirate_frigate'] },
    ]);

    const trainable = new Set(TRAINABLE_UNITS.map(unit => unit.type));
    const techUnlocks = new Set(TECH_TREE.flatMap(tech => tech.unlocksUnits ?? []));
    for (const hull of PIRATE_HULL_TYPES) {
      expect(trainable.has(hull), `${hull} must not be city-trainable`).toBe(false);
      expect(techUnlocks.has(hull), `${hull} must not be tech-unlocked`).toBe(false);
    }
  });

  it('keeps stage metadata and unit definitions in lockstep', () => {
    for (const stage of PIRATE_STAGE_DEFINITIONS) {
      const definition = UNIT_DEFINITIONS[stage.anchorHull];
      expect(definition.strength, stage.anchorHull).toBe(stage.stats.strength);
      expect(definition.movementPoints, stage.anchorHull).toBe(stage.stats.movementPoints);
      expect(definition.visionRange, stage.anchorHull).toBe(stage.stats.visionRange);
      expect(stage.spriteId).toBe(stage.anchorHull);
      expect(stage.mapIcon.length).toBeGreaterThan(0);
      expect(stage.sfxFamily.length).toBeGreaterThan(0);
    }

    for (const hull of PIRATE_HULL_TYPES) {
      const canonical = PIRATE_HULL_DEFINITIONS[hull];
      expect(UNIT_DEFINITIONS[hull]).toMatchObject({
        type: hull,
        name: canonical.name,
        strength: canonical.strength,
        movementPoints: canonical.movementPoints,
        visionRange: canonical.visionRange,
        domain: 'naval',
        productionCost: 0,
        attackProfile: { targets: ['unit'] },
      });
    }
  });

  it('quotes tribute and destruction bounties from behavior and stage', () => {
    expect(getPirateTributeCost('patrolling', 1)).toBe(15);
    expect(getPirateTributeCost('raiding', 3)).toBe(40);
    expect(getPirateTributeCost('blockading', 5)).toBe(70);
    expect(getPirateBounty('patrolling', 1)).toBe(15);
    expect(getPirateBounty('raiding', 3)).toBe(40);
    expect(getPirateBounty('blockading', 5)).toBe(70);
  });

  it('composes deterministic mixed fleets with one guaranteed anchor hull', () => {
    for (const stage of PIRATE_STAGE_DEFINITIONS) {
      for (const behavior of ['patrolling', 'raiding', 'blockading'] as const) {
        const first = composePirateFleet(stage.stage, behavior, 'fleet-seed');
        const second = composePirateFleet(stage.stage, behavior, 'fleet-seed');
        expect(first).toEqual(second);
        expect(first[0]).toBe(stage.anchorHull);
        expect(first.length).toBeGreaterThanOrEqual(PIRATE_FLEET_SIZE_BY_BEHAVIOR[behavior].min);
        expect(first.length).toBeLessThanOrEqual(PIRATE_FLEET_SIZE_BY_BEHAVIOR[behavior].max);
        expect(first.every(hull => stage.allowedHulls.includes(hull))).toBe(true);
      }
    }
  });

  it('retires early hulls in Stage 5 while retaining aging frigates and ironclads', () => {
    const sampled = new Set(
      Array.from({ length: 100 }, (_, seed) => composePirateFleet(5, 'blockading', `stage-5-${seed}`)).flat(),
    );
    expect(sampled.has('pirate_galley')).toBe(false);
    expect(sampled.has('pirate_corsair')).toBe(false);
    expect(sampled.has('pirate_frigate')).toBe(true);
    expect(sampled.has('pirate_ironclad')).toBe(true);
    expect(sampled.has('pirate_fast_attack_craft')).toBe(true);
    expect(sampled.has('pirate_mothership')).toBe(true);
  });
});
