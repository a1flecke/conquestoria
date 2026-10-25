// src/systems/trade-role-targeting.ts
// #1503 MR06: the one shared trade-role targeting query.
//
// Hostile pressure across trade roles is only honest if every hostile system recognizes the *same*
// set of traders. The barbarian camp, the pirate fleet and any future raider ask this module whether
// a unit is a trader and in which domain it travels, instead of each keeping its own hand-written
// roster (`unit.type === 'caravan'` and `cargoCapacity !== undefined` were exactly the two drifted
// rosters this replaces).
//
// The role comes from the canonical role catalog (`combat-role-definitions`), and the domain from
// the canonical unit catalog (`unit-definitions`) — the same metadata the chooser, the AI and the
// trade contract already derive trade eligibility from. Adding an ordinary compatible trader to the
// catalog therefore inherits targeting here without touching any hostile system.
//
// This is a *targeting* leaf: it answers "is this a trade unit (in this domain)?", never "what does
// this route earn" or "is this assignment legal". Those stay in their own owners.
import type { UnitType } from '@/core/types';
import { getUnitRoleDefinition } from '@/systems/combat-role-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';

/** The three transport domains a trade unit can travel in. */
export type TradeUnitDomain = 'land' | 'naval' | 'air';

/**
 * Does this unit type carry the canonical trade role? Derived from the shared role metadata the AI
 * and the trade contract consume, so there is no independent list of trader names anywhere.
 */
export function isTradeUnitType(type: UnitType): boolean {
  return (getUnitRoleDefinition(type)?.aiRoles ?? []).includes('trade');
}

/**
 * The domain this trade unit travels in, or `null` when it is not a trade unit. Land raiders and
 * pirates filter on this so a caravan is never targeted as a merchant hull (and vice versa).
 */
export function getTradeUnitDomain(type: UnitType): TradeUnitDomain | null {
  if (!isTradeUnitType(type)) return null;
  return (UNIT_DEFINITIONS[type]?.domain ?? 'land') as TradeUnitDomain;
}

/** Is this unit type a trade unit that travels in `domain`? */
export function isTradeUnitTypeInDomain(type: UnitType, domain: TradeUnitDomain): boolean {
  return getTradeUnitDomain(type) === domain;
}

/**
 * Dedicated goods capacity for a trader. This is deliberately separate from the troop-transport
 * `cargoCapacity`: a merchant hull is not a passenger transport, and an air freighter has no
 * implemented goods path yet (0).
 */
export function getTradeCargoCapacity(type: UnitType): number {
  return Math.max(0, UNIT_DEFINITIONS[type]?.tradeCapacity ?? 0);
}
