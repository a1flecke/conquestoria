import { describe, expect, it } from 'vitest';
import { getApprovedM4LegendaryWonderRoster } from '@/systems/approved-legendary-wonder-roster';
import {
  cloneLegendaryWonderDefinition,
  getLateEraWonderTechRequirements,
  getLegendaryWonderDefinitions,
} from '@/systems/legendary-wonder-definitions';
import type { LegendaryWonderDefinition } from '@/core/types';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
import { TECH_TREE } from '@/systems/tech-definitions';

describe('legendary-wonder-definitions', () => {
  it('clones tactical effect arrays and their nested role lists', () => {
    const definition: LegendaryWonderDefinition = {
      id: 'tactical-clone-test',
      name: 'Tactical Clone Test',
      era: 3,
      productionCost: 1,
      requiredTechs: [],
      requiredResources: [],
      cityRequirement: 'any',
      questSteps: [],
      reward: {
        summary: 'Test only.',
        tacticalEffects: [{
          kind: 'per-era-role-training-xp',
          roles: ['frontline'],
          experience: 10,
          maxGrantsPerEra: 4,
          aiValue: 10,
        }],
      },
    };

    const clone = cloneLegendaryWonderDefinition(definition);
    const effect = clone.reward.tacticalEffects?.[0];
    if (!effect || effect.kind !== 'per-era-role-training-xp') {
      throw new Error('Expected role-training tactical effect.');
    }
    effect.roles.push('ranged');

    expect(definition.reward.tacticalEffects?.[0]).toMatchObject({
      kind: 'per-era-role-training-xp',
      roles: ['frontline'],
    });
  });

  it('matches the full approved M4 legendary wonder roster exactly', () => {
    const approved = getApprovedM4LegendaryWonderRoster().map(w => w.id);
    const shipped = getLegendaryWonderDefinitions().map(w => w.id);

    expect(shipped).toEqual(approved);
    expect(approved).toHaveLength(40);
    expect(approved).toEqual(expect.arrayContaining(['standing-stones', 'great-pyramid', 'tidemother-colossus', 'manhattan-project', 'internet', 'sistine-vault', 'codex-eternal', 'navigators-compass', 'palace-of-the-sun', 'iron-arsenal', 'merchant-admiralty', 'crystal-palace', 'suez-canal', 'continental-congress', 'eiffel-tower', 'brooklyn-bridge', 'trans-siberian-railway', 'panama-canal', 'empire-state-building', 'hoover-dam', 'wright-flyer', 'united-nations', 'apollo-program', 'open-intelligence-commons', 'lunar-gateway']));
  });

  it('defines the Terracotta Army military quest and typed training reward', () => {
    const terracotta = getLegendaryWonderDefinitions().find(wonder => wonder.id === 'terracotta-army');

    expect(terracotta).toMatchObject({
      id: 'terracotta-army',
      name: 'Terracotta Army',
      era: 3,
      productionCost: 125,
      requiredTechs: ['iron-forging', 'masonry'],
      requiredResources: ['stone'],
      questSteps: [
        { type: 'field-combat-roles', targetUnitCount: 4, targetRoleCount: 3 },
        { type: 'surviving-combat-wins', targetCount: 3 },
      ],
      reward: {
        tacticalEffects: [{
          kind: 'per-era-role-training-xp',
          roles: ['frontline', 'ranged', 'shock', 'siege'],
          experience: 10,
          maxGrantsPerEra: 4,
          aiValue: 24,
        }],
      },
    });
  });

  it('defines Crac des Chevaliers with Fort and Citadel tactical rewards', () => {
    const crac = getLegendaryWonderDefinitions().find(wonder => wonder.id === 'crac-des-chevaliers');

    expect(crac).toMatchObject({
      id: 'crac-des-chevaliers',
      name: 'Crac des Chevaliers',
      era: 5,
      productionCost: 220,
      requiredTechs: ['fortresses', 'professional-army'],
      requiredResources: ['stone'],
      questSteps: [
        { type: 'fort-completions', targetCount: 3, distinctCityTerritories: true },
        { type: 'fortification-repels', targetCount: 2, tiers: ['fort', 'citadel'] },
      ],
      reward: {
        tacticalEffects: [
          { kind: 'fort-occupant-healing', amount: 5, aiValue: 18 },
          {
            kind: 'adjacent-citadel-defense', multiplier: 1.05, stackingGroup: 'legendary-citadel-defense',
            excludedRoles: ['siege'], aiValue: 18,
          },
        ],
      },
    });
  });

  it('defines the two Era 13 autonomous-systems wonder contracts', () => {
    const definitions = getLegendaryWonderDefinitions();

    expect(definitions.find(wonder => wonder.id === 'open-intelligence-commons')).toMatchObject({
      era: 13,
      requiredTechs: ['algorithmic-accountability', 'machine-ethics'],
      reward: { civYieldBonus: { science: 4 } },
    });
    expect(definitions.find(wonder => wonder.id === 'open-intelligence-commons')?.questSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'specific-buildings', buildingIds: ['ai_safety_institute'], cityScope: 'distinct-cities', targetCount: 2 }),
      expect.objectContaining({ type: 'network-plan-resolutions', definitionIds: ['fabrication-sprint', 'research-mesh', 'logistics-routing'], targetCount: 3, stableOnly: true }),
    ]));
    expect(definitions.find(wonder => wonder.id === 'lunar-gateway')).toMatchObject({
      era: 13,
      requiredTechs: ['mars-mission-architecture', 'quantum-networking'],
      reward: { civYieldBonus: { science: 3, gold: 3 } },
    });
    expect(definitions.find(wonder => wonder.id === 'lunar-gateway')?.questSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'specific-buildings', buildingIds: ['space_center', 'network_operations_center'], cityScope: 'host-city' }),
      expect.objectContaining({ type: 'network-plan-resolutions', definitionIds: ['survey-grid'], targetCount: 3, stableOnly: true, hostCityOnly: true }),
    ]));
  });

  it('supports the new Slice 4 quest-step patterns in the expanded catalog', () => {
    const definitions = getLegendaryWonderDefinitions();
    const grandCanal = definitions.find(w => w.id === 'grand-canal');
    const internet = definitions.find(w => w.id === 'internet');
    const stormSignalSpire = definitions.find(w => w.id === 'storm-signal-spire');
    const tidecaller = definitions.find(w => w.id === 'tidecaller-bastion');
    const gate = definitions.find(w => w.id === 'gate-of-the-world');
    const drydock = definitions.find(w => w.id === 'leviathan-drydock');

    expect(grandCanal?.questSteps.find(step => step.id === 'grow-river-city')).toMatchObject({
      type: 'buildings-in-multiple-cities',
      targetCount: 1,
    });
    expect(internet?.questSteps.some(step => step.type === 'buildings-in-multiple-cities')).toBe(true);
    expect(internet?.questSteps.some(step => step.type === 'trade-routes-established')).toBe(true);
    expect(stormSignalSpire?.questSteps.some(step => step.type === 'map-discoveries')).toBe(true);
    expect(tidecaller?.questSteps.find(step => step.id === 'secure-coastal-trade')).toMatchObject({
      routeRequirement: 'coastal',
    });
    expect(gate?.questSteps.find(step => step.id === 'link-the-seas')).toMatchObject({
      routeRequirement: 'long-range',
      minimumRouteDistance: 8,
    });
    expect(drydock?.questSteps.find(step => step.id === 'prove-open-sea-command')).toMatchObject({
      routeRequirement: 'overseas',
    });
  });

  it('maps the remaining late-era wonder scaffolding to real Slice 3 techs', () => {
    const requirements = getLateEraWonderTechRequirements();

    expect(requirements.find(entry => entry.wonderId === 'manhattan-project')).toEqual({
      wonderId: 'manhattan-project',
      requiredTechs: ['nuclear-weapons', 'nuclear-physics'],
    });
    expect(requirements.find(entry => entry.wonderId === 'internet')).toEqual({
      wonderId: 'internet',
      requiredTechs: ['arpanet', 'satellite-television'],
    });
  });

  it('derives late-era wonder prerequisite summaries from the shipped definitions', () => {
    const requirements = getLateEraWonderTechRequirements();
    const definitions = Object.fromEntries(
      getLegendaryWonderDefinitions().map(definition => [definition.id, definition]),
    );

    expect(requirements).toEqual([
      {
        wonderId: 'storm-signal-spire',
        requiredTechs: definitions['storm-signal-spire'].requiredTechs,
      },
      {
        wonderId: 'manhattan-project',
        requiredTechs: definitions['manhattan-project'].requiredTechs,
      },
      {
        wonderId: 'internet',
        requiredTechs: definitions.internet.requiredTechs,
      },
    ]);
  });

  it('uses explicit metadata for route and stronghold flavored wonder steps', () => {
    for (const definition of getLegendaryWonderDefinitions()) {
      for (const step of definition.questSteps) {
        if (step.type === 'trade_route' || step.type === 'trade-routes-established') {
          expect(step.routeRequirement ?? 'any').toBeDefined();
        }
        if (step.type === 'defeat_stronghold') {
          expect(step.scope ?? 'any').toBeDefined();
        }
      }
    }
  });

  it('declares explicit city-development scope metadata for every buildings-in-multiple-cities step', () => {
    for (const definition of getLegendaryWonderDefinitions()) {
      for (const step of definition.questSteps) {
        if (step.type === 'buildings-in-multiple-cities') {
          expect(step.cityScope).toMatch(/^(host-city|empire)$/);
          expect(step.minimumBuildingsPerCity ?? 3).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('marks grand canal growth as a host-city requirement', () => {
    const grandCanal = getLegendaryWonderDefinitions().find(w => w.id === 'grand-canal');

    expect(grandCanal?.questSteps.find(step => step.id === 'grow-river-city')).toMatchObject({
      type: 'buildings-in-multiple-cities',
      cityScope: 'host-city',
      targetCount: 1,
      minimumBuildingsPerCity: 3,
    });
  });

  it('requires discovery-type metadata on every map-discoveries step', () => {
    for (const definition of getLegendaryWonderDefinitions()) {
      for (const step of definition.questSteps) {
        if (step.type === 'map-discoveries') {
          expect(step.discoveryTypes?.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('quest step descriptions do not imply a special route mechanic that does not exist (#432)', () => {
    // Both complete-pilgrimage-route and complete-sacred-route evaluate identically to
    // any other generic trade_route step (legendary-wonder-system.ts:204-206) — the
    // flavor text must not claim otherwise.
    for (const definition of getLegendaryWonderDefinitions()) {
      for (const step of definition.questSteps) {
        const description = (step.description ?? '').toLowerCase();
        expect(description).not.toContain('pilgrimage');
        expect(description).not.toContain('sacred');
      }
    }
  });

  it('every requiredResources id exists in RESOURCE_DEFINITIONS (#432 — catches the gold_resource-style typo class)', () => {
    const validIds = new Set<string>(RESOURCE_DEFINITIONS.map(def => def.id));
    for (const definition of getLegendaryWonderDefinitions()) {
      for (const resourceId of definition.requiredResources) {
        expect(validIds.has(resourceId), `${definition.id} requires unknown resource id "${resourceId}"`).toBe(true);
      }
    }
  });

  // MR10 guardrail: oracle-of-delphi (era 3) required pilgrimages (era 4) — literally
  // unbuildable in its own display era. Availability is tech-gated only (no era check
  // anywhere else), so this must hold for every wonder, present and future.
  it('no wonder requires a tech from a later era than the wonder itself', () => {
    const techEraById = new Map(TECH_TREE.map(tech => [tech.id, tech.era]));
    for (const definition of getLegendaryWonderDefinitions()) {
      for (const techId of definition.requiredTechs) {
        const techEra = techEraById.get(techId);
        expect(techEra, `${definition.id} requires unknown tech id "${techId}"`).toBeDefined();
        expect(
          techEra!,
          `${definition.id} (era ${definition.era}) requires "${techId}" (era ${techEra}) — a wonder can't be built before its own gate exists`,
        ).toBeLessThanOrEqual(definition.era);
      }
    }
  });
});
