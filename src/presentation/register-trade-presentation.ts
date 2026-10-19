/**
 * Trade-route delivery visual, creation, and ending notifications
 * (#787 phase 7). Moved verbatim from `main.ts`.
 */
import type { PresentationRegistrar } from '@/presentation/register-all';
import { getEffectiveGoldPerTurn, getRouteTechGoldBonus } from '@/systems/trade-route-economy';

export const registerTradePresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('trade:route-delivered', ({ unitId }) => {
      ctx.requestDeliveryVisual(unitId);
    }),
    bus.on('trade:route-created', ({ route }) => {
      const state = ctx.session.getState();
      const ownerCity = state.cities[route.fromCityId];
      const toCity = state.cities[route.toCityId];
      if (!ownerCity) return;
      const goldPerTurn = getEffectiveGoldPerTurn(route, getRouteTechGoldBonus(state, route));
      ctx.notifier.deliver(
        ownerCity.owner,
        `Trade route to ${toCity?.name ?? route.toCityId} established (+${goldPerTurn} gold/turn)`,
        'success',
      );
    }),
    // #1503 MR06: the one interruption notice per route per uninterrupted stretch. The system
    // deduplicates the transition; this router turns it into recipient-scoped copy (the persistent
    // route row already shows the ongoing `blocked`/`blockaded` status).
    bus.on('trade:route-interrupted', ({ fromCityId, toCityId, reason }) => {
      const state = ctx.session.getState();
      const ownerCity = state.cities[fromCityId];
      const toCity = state.cities[toCityId];
      if (!ownerCity) return;
      const service = reason === 'blockaded' ? 'is blockaded' : 'is blocked';
      ctx.notifier.deliver(
        ownerCity.owner,
        `Trade route to ${toCity?.name ?? toCityId} ${service} — the trader is waiting. Service and income stop until the way is clear.`,
        'warning',
      );
    }),
    bus.on('trade:route-ended', ({ fromCityId, toCityId, reason }) => {
      const state = ctx.session.getState();
      const ownerCity = state.cities[fromCityId];
      const toCity = state.cities[toCityId];
      if (!ownerCity) return;
      const reasonText: Record<string, string> = {
        'unit-died': 'caravan destroyed',
        'unit-disbanded': 'caravan disbanded',
        'war-declared': 'war declared — caravan is free to redeploy',
        'hostile-relations': 'hostile relations — caravan is free to redeploy',
        embargo: 'embargo enforced — caravan is free to redeploy',
        'trips-exhausted': 'caravan retired after completing its service',
        'unit-captured': 'caravan captured',
        cancelled: 'cancelled by the owner — the trader returned home',
        'endpoint-lost': 'destination lost — the trader returned home',
      };
      ctx.notifier.deliver(
        ownerCity.owner,
        `Trade route to ${toCity?.name ?? toCityId} ended: ${reasonText[reason] ?? reason}`,
        'warning',
      );
      // Also tell the other end of the route, if it's a different human civ (#551).
      if (toCity && toCity.owner !== ownerCity.owner && state.civilizations[toCity.owner]?.isHuman) {
        ctx.notifier.deliver(
          toCity.owner,
          `Trade route from ${ownerCity.name} ended: ${reasonText[reason] ?? reason}`,
          'warning',
        );
      }
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
