import { describe, expect, it } from 'vitest';
import {
  getShoreSupplyCapability,
  getUnitLandSupplyCost,
  unitParticipatesInLandSupply,
} from '@/systems/supply-participation';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';
import { BEAST_OWNER } from '@/systems/beast-system';

describe('unitParticipatesInLandSupply', () => {
  it('a normal major-civ land military unit participates', () => {
    expect(unitParticipatesInLandSupply({ type: 'warrior', owner: 'rome' })).toBe(true);
  });

  it('a naval unit does not participate', () => {
    expect(unitParticipatesInLandSupply({ type: 'trireme', owner: 'rome' })).toBe(false);
  });

  it('a settler (civilian land unit) does not participate', () => {
    expect(unitParticipatesInLandSupply({ type: 'settler', owner: 'rome' })).toBe(false);
  });

  it('a barbarian-owned unit does not participate even though the type is a normal land type', () => {
    expect(unitParticipatesInLandSupply({ type: 'warrior', owner: 'barbarian' })).toBe(false);
  });

  it('a beast-owned unit does not participate', () => {
    expect(unitParticipatesInLandSupply({ type: 'warrior', owner: BEAST_OWNER })).toBe(false);
  });

  it('a land-domain spy unit does not participate (matches isMilitaryUnitType, which excludes spy as well as civilian)', () => {
    expect(UNIT_DEFINITIONS.spy_agent.domain ?? 'land').toBe('land');
    expect(UNIT_CLASS_BY_TYPE.spy_agent).toEqual(['spy']);
    expect(unitParticipatesInLandSupply({ type: 'spy_agent', owner: 'rome' })).toBe(false);
  });

  it('an explicit participatesInLandSupply: true override wins even for a civilian-classed type', () => {
    expect(UNIT_CLASS_BY_TYPE.worker).toContain('civilian');
    const explicit = { ...UNIT_DEFINITIONS.worker, participatesInLandSupply: true };
    expect(unitParticipatesInLandSupply({ type: 'worker', owner: 'rome' }, explicit)).toBe(true);
  });

  it('an explicit participatesInLandSupply: false override wins even for a land-military type', () => {
    const explicit = { ...UNIT_DEFINITIONS.warrior, participatesInLandSupply: false };
    expect(unitParticipatesInLandSupply({ type: 'warrior', owner: 'rome' }, explicit)).toBe(false);
  });
});

describe('getUnitLandSupplyCost', () => {
  it('defaults a participating land unit to 1, matching its (unset) cargoSize default', () => {
    expect(getUnitLandSupplyCost('warrior')).toBe(1);
  });

  it('does not silently track cargoSize if cargoSize is set on a unit with no landSupplyCost', () => {
    expect(UNIT_DEFINITIONS.settler.landSupplyCost).toBeUndefined();
    expect(getUnitLandSupplyCost('settler')).toBe(1);
  });
});

describe('getShoreSupplyCapability', () => {
  it('the Transport line has independent landSupplyCapacity matching its cargoCapacity numerically, not derived', () => {
    const cap = getShoreSupplyCapability('transport');
    expect(cap).toEqual({ landSupplyCapacity: 2, projectsLandSupplyRange: 1 });
    expect(UNIT_DEFINITIONS.transport.landSupplyCapacity).toBe(UNIT_DEFINITIONS.transport.cargoCapacity);
  });

  it('a non-shore-capable naval unit (Trireme, pure combat hull) returns null', () => {
    expect(getShoreSupplyCapability('trireme')).toBeNull();
  });

  it('a land unit returns null', () => {
    expect(getShoreSupplyCapability('warrior')).toBeNull();
  });
});

describe('great_general supply participation (#544 MR3)', () => {
  it('a great_general unit participates in land supply via its own definition override, not the civilian default', () => {
    expect(UNIT_DEFINITIONS.great_general.participatesInLandSupply).toBe(true);
    expect(UNIT_CLASS_BY_TYPE.great_general).toEqual(['civilian']);
    expect(unitParticipatesInLandSupply({ type: 'great_general', owner: 'rome' })).toBe(true);
  });
});
