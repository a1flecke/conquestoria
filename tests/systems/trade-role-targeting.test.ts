import { describe, expect, it } from 'vitest';
import type { UnitType } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { TRAINABLE_UNITS } from '@/systems/city-unit-catalog';
import { getUnitRoleDefinition } from '@/systems/combat-role-definitions';
import { hasAITradeRole } from '@/ai/ai-unit-roles';
import {
  getTradeUnitDomain,
  getTradeUnitTypes,
  isTradeUnitType,
  isTradeUnitTypeInDomain,
  type TradeUnitDomain,
} from '@/systems/trade-role-targeting';

/**
 * #1503 MR06: the one shared trade-role targeting query.
 *
 * Every assertion derives its roster from the catalogs rather than listing trader names, so a new
 * trade tier added to `UNIT_DEFINITIONS` + the role catalog is covered here automatically. This is
 * what lets the barbarian and pirate systems consume it without a second roster to maintain.
 */
describe('#1503 MR06 — the shared trade-role targeting query', () => {
  const allTypes = Object.keys(UNIT_DEFINITIONS) as UnitType[];

  it('agrees with the role catalog and the AI trade-role predicate for every unit type', () => {
    for (const type of allTypes) {
      const fromRole = (getUnitRoleDefinition(type)?.aiRoles ?? []).includes('trade');
      expect(isTradeUnitType(type), `${type} role-derived`).toBe(fromRole);
      expect(isTradeUnitType(type), `${type} agrees with hasAITradeRole`).toBe(hasAITradeRole(type));
    }
  });

  it('derives every trade tier from the catalogs — no trader name is listed here', () => {
    const fromCatalog = allTypes.filter(type => hasAITradeRole(type));
    expect(fromCatalog.length).toBeGreaterThan(0);
    expect(getTradeUnitTypes()).toEqual([...fromCatalog].sort());
  });

  it('covers every land, naval and air trade tier the catalog defines', () => {
    // The domain split is what barbarians (land) and pirates (naval) filter on, so derive each set
    // from the catalog and assert the predicate reproduces it exactly.
    const byDomain = (domain: TradeUnitDomain) => allTypes
      .filter(type => isTradeUnitType(type) && UNIT_DEFINITIONS[type].domain === domain)
      .sort();

    for (const domain of ['land', 'naval', 'air'] as const) {
      const expected = byDomain(domain);
      expect(getTradeUnitTypes().filter(type => getTradeUnitDomain(type) === domain)).toEqual(expected);
      for (const type of allTypes) {
        expect(isTradeUnitTypeInDomain(type, domain), `${type} in ${domain}`).toBe(expected.includes(type));
      }
    }

    // All three domains must be represented — a split that collapsed to one would hide the others.
    expect(byDomain('land').length).toBeGreaterThan(0);
    expect(byDomain('naval').length).toBeGreaterThan(0);
    expect(byDomain('air').length).toBeGreaterThan(0);
  });

  it('recognizes the upgraded land and naval tiers the old hardcoded rosters missed', () => {
    // The exact defect MR06 fixes: land raiders only knew `caravan`, and pirates derived victims
    // from `cargoCapacity` (troop transports), so the upgraded traders were invisible.
    for (const type of ['merchant_wagon', 'freight_convoy'] as UnitType[]) {
      expect(isTradeUnitTypeInDomain(type, 'land'), `${type} is a land trader`).toBe(true);
    }
    for (const type of ['naval_trader', 'steamship_trader', 'cargo_freighter', 'container_ship'] as UnitType[]) {
      expect(isTradeUnitTypeInDomain(type, 'naval'), `${type} is a merchant hull`).toBe(true);
    }
  });

  it('does not treat non-traders as trade units', () => {
    for (const type of ['worker', 'warrior', 'settler', 'transport', 'galley', 'scout'] as UnitType[]) {
      expect(isTradeUnitType(type), `${type} is not a trader`).toBe(false);
      expect(getTradeUnitDomain(type)).toBeNull();
    }
  });

  it('every trainable trade tier has a real, in-domain catalog definition', () => {
    const trainableTradeTypes = TRAINABLE_UNITS
      .map(entry => entry.type)
      .filter(type => isTradeUnitType(type));
    expect(trainableTradeTypes.length).toBe(getTradeUnitTypes().length);
    for (const type of trainableTradeTypes) {
      const domain = getTradeUnitDomain(type);
      expect(domain, `${type} domain`).not.toBeNull();
      expect(UNIT_DEFINITIONS[type].domain).toBe(domain);
    }
  });
});
