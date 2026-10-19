// src/systems/trade-route-modes.ts
// #1504 MR07: the definition-driven set of things a trade route can be *for*.
//
// A route mode names who receives the route's per-round service and what they receive. The catalog is
// data plus one requirement predicate per mode, so the chooser, the executor and the settlement all
// read the same rule and a new mode is one entry here — never a branch in the runner, the quote or the
// UI. Mode shape is the approved contract (parent #1497 §3.5–3.6): foreign commerce pays the owner in
// gold; domestic provisioning delivers food or production to the destination city; research exchange
// pays the owner research and is gated behind an explicit commercial right and technology.
//
// Amounts are calibration candidates, not measured balance results (parent §3.3): they live together
// here so they can be tuned in one place.
import type { GameState, TradeRoute, TradeRouteModeId } from '@/core/types';
import { getCommercialPassagePermission, type CommercePassageDenialReason } from './commerce-permissions';

/** The technology that makes an exchange of knowledge possible. */
export const RESEARCH_EXCHANGE_REQUIRED_TECH = 'scientific-method';

/** Where a mode's per-round yield goes. */
export type TradeRouteModeRecipient =
  | 'owner-treasury'
  | 'destination-city-food'
  | 'destination-city-production'
  | 'owner-research';

/** Why a mode cannot be selected for this route. Copy names no civilization. */
export type TradeRouteModeDenialReason =
  | 'domestic-destination-required'
  | 'foreign-destination-required'
  | 'requires-technology'
  | CommercePassageDenialReason;

export const TRADE_ROUTE_MODE_DENIAL_MESSAGES: Record<TradeRouteModeDenialReason, string> = {
  'domestic-destination-required': 'Requires one of your own cities as the destination.',
  'foreign-destination-required': 'Requires a foreign destination.',
  'requires-technology': 'Requires a technology you have not researched.',
  'no-commercial-agreement': 'Requires a trade agreement with that civilization.',
  'at-war': 'Cannot trade with a civilization you are at war with.',
  'embargoed': 'An embargo blocks trade with that civilization.',
  'partner-eliminated': 'That civilization no longer holds territory.',
  'minor-civ-unavailable': 'That city-state is not open to trade right now.',
};

export interface TradeRouteModeContext {
  state: GameState;
  /** The civilization that owns the route (and its trader). */
  ownerCivId: string;
  destinationCityId: string;
}

export type TradeRouteModeEligibility =
  | { ok: true }
  | { ok: false; reason: TradeRouteModeDenialReason };

export interface TradeRouteModeDefinition {
  id: TradeRouteModeId;
  label: string;
  /** One line for the chooser, naming the recipient in words. */
  description: string;
  recipient: TradeRouteModeRecipient;
  /**
   * What the recipient receives per completed service round. `null` means the amount comes from the
   * route's own quote (commerce prices gold from distance, diversity and infrastructure).
   */
  amountPerRound: number | null;
  /** The technology this mode requires, when it has one. */
  requiredTech?: string;
  check: (context: TradeRouteModeContext) => TradeRouteModeEligibility;
}

function isDomestic(context: TradeRouteModeContext): boolean {
  const destination = context.state.cities[context.destinationCityId];
  return destination?.owner === context.ownerCivId;
}

/** Commercial passage is the one existing authority for a foreign route's right to exist. */
function commercialRight(context: TradeRouteModeContext): TradeRouteModeEligibility {
  const destination = context.state.cities[context.destinationCityId];
  if (!destination) return { ok: false, reason: 'partner-eliminated' };
  const permission = getCommercialPassagePermission(context.state, context.ownerCivId, destination.owner);
  return permission.allowed ? { ok: true } : { ok: false, reason: permission.reason };
}

function hasTech(context: TradeRouteModeContext, techId: string): boolean {
  return (context.state.civilizations[context.ownerCivId]?.techState.completed ?? []).includes(techId);
}

/**
 * The one definition-driven catalog, in the order the chooser lists it. Adding a mode is this list
 * plus its settlement recipient — never an ID branch elsewhere.
 */
export const TRADE_ROUTE_MODES: readonly TradeRouteModeDefinition[] = [
  {
    id: 'commerce',
    label: 'Commerce',
    description: 'Sell on the route: gold to your treasury every completed round.',
    recipient: 'owner-treasury',
    amountPerRound: null,
    check: () => ({ ok: true }),
  },
  {
    id: 'domestic-food',
    label: 'Provisioning — food',
    description: 'Deliver food to the destination city each completed round.',
    recipient: 'destination-city-food',
    amountPerRound: 2,
    check: context => isDomestic(context)
      ? { ok: true }
      : { ok: false, reason: 'domestic-destination-required' },
  },
  {
    id: 'domestic-production',
    label: 'Provisioning — production',
    description: 'Deliver production to the destination city’s current build each completed round.',
    recipient: 'destination-city-production',
    amountPerRound: 2,
    check: context => isDomestic(context)
      ? { ok: true }
      : { ok: false, reason: 'domestic-destination-required' },
  },
  {
    id: 'research-exchange',
    label: 'Research exchange',
    description: 'Exchange knowledge with a permitted partner: research to your treasury of ideas.',
    recipient: 'owner-research',
    amountPerRound: 2,
    requiredTech: RESEARCH_EXCHANGE_REQUIRED_TECH,
    check: context => {
      if (isDomestic(context)) return { ok: false, reason: 'foreign-destination-required' };
      const right = commercialRight(context);
      if (!right.ok) return right;
      if (!hasTech(context, RESEARCH_EXCHANGE_REQUIRED_TECH)) {
        return { ok: false, reason: 'requires-technology' };
      }
      return { ok: true };
    },
  },
];

/** The mode a route is running. A route from before modes shipped is ordinary commerce. */
export function getRouteModeId(route: Pick<TradeRoute, 'mode'>): TradeRouteModeId {
  return route.mode ?? 'commerce';
}

export function getTradeRouteMode(modeId: TradeRouteModeId): TradeRouteModeDefinition | null {
  return TRADE_ROUTE_MODES.find(mode => mode.id === modeId) ?? null;
}

/** Whether this mode may be chosen for this (owner, destination) pair right now. */
export function getTradeRouteModeEligibility(
  context: TradeRouteModeContext,
  modeId: TradeRouteModeId,
): TradeRouteModeEligibility {
  const mode = getTradeRouteMode(modeId);
  if (!mode) return { ok: false, reason: 'domestic-destination-required' };
  return mode.check(context);
}

/**
 * What the mode is worth per completed service round, for an entitled preview. Commerce returns
 * `null` because its value is priced by the route's own quote, not by a flat amount.
 */
export function getTradeRouteModeAmount(modeId: TradeRouteModeId): number | null {
  return getTradeRouteMode(modeId)?.amountPerRound ?? null;
}
