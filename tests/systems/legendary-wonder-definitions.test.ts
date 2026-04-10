import { describe, expect, it } from 'vitest';
import { getApprovedM4LegendaryWonderRoster } from '@/systems/approved-legendary-wonder-roster';
import {
  getLateEraWonderTechRequirements,
  getLegendaryWonderDefinitions,
} from '@/systems/legendary-wonder-definitions';

describe('legendary-wonder-definitions', () => {
  it('matches the full approved M4 legendary wonder roster exactly', () => {
    const approved = getApprovedM4LegendaryWonderRoster().map(w => w.id);
    const shipped = getLegendaryWonderDefinitions().map(w => w.id);

    expect(shipped).toEqual(approved);
    expect(approved).toHaveLength(15);
    expect(approved).toEqual(expect.arrayContaining(['manhattan-project', 'internet']));
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
      requiredTechs: ['nuclear-theory'],
    });
    expect(requirements.find(entry => entry.wonderId === 'internet')).toEqual({
      wonderId: 'internet',
      requiredTechs: ['mass-media', 'global-logistics'],
    });
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
});
