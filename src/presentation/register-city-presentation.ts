/**
 * Tech completion, city growth/maturity/building/national-project, dropped
 * production, and territory-flip notifications (#787 phase 7). Moved
 * verbatim from `main.ts`. `tech:completed` and `territory:tile-flipped`
 * group here by theme (city/civ progress) despite their own namespaces.
 */
import { SFX } from '@/audio/sfx';
import { BUILDINGS } from '@/systems/city-system';
import { getTechById } from '@/systems/tech-system';
import { routeDroppedProductionItem, routeTerritoryTileFlipped } from '@/ui/notification-routing';
import type { PresentationRegistrar } from '@/presentation/register-all';

export const registerCityPresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('tech:completed', ({ civId, techId, carriedProgress, carriedIntoTechId }) => {
      const techName = getTechById(techId)?.name ?? techId;
      const successorName = carriedIntoTechId
        ? getTechById(carriedIntoTechId)?.name ?? carriedIntoTechId
        : null;
      // MR4 (#917): surface the recovered overflow inline so the player sees the
      // leftover science was not wasted. No extra notification, no new sound.
      const carryNote = carriedProgress && carriedProgress > 0 && successorName
        ? ` +${carriedProgress} science carried into ${successorName}.`
        : '';
      ctx.notifier.deliver(civId, `Research complete: ${techName}!${carryNote}`, 'success');
      if (techId === 'fishing') {
        ctx.notifier.deliver(civId, 'Fishing unlocked — build a Dock in your coastal cities to boost food and trade.', 'info');
      }
      if (civId === ctx.session.getState().currentPlayer) SFX.research();
    }),
    bus.on('city:grew', ({ cityId, newPopulation }) => {
      const city = ctx.session.getState().cities[cityId];
      if (!city) return;
      ctx.notifier.deliver(city.owner, `${city.name} grew to ${newPopulation} population!`, 'success');
    }),
    bus.on('city:maturity-upgraded', ({ cityId, current }) => {
      const city = ctx.session.getState().cities[cityId];
      if (!city) return;
      const label = `${current[0].toUpperCase()}${current.slice(1)}`;
      ctx.notifier.deliver(city.owner, `${city.name} became a ${label}. New city slots unlocked.`, 'success');
    }),
    bus.on('city:building-complete', ({ cityId, buildingId }) => {
      const city = ctx.session.getState().cities[cityId];
      if (!city) return;
      const bldg = BUILDINGS[buildingId];
      const buildingName = bldg?.name ?? buildingId;
      ctx.notifier.deliver(city.owner, `${city.name}: ${buildingName} completed!`, 'success');
      if (bldg?.nationalProject) {
        SFX.nationalProjectBuilt();
      }
    }),
    bus.on('city:national-project-expired', ({ civId, cityId, buildingId }) => {
      const city = ctx.session.getState().cities[cityId];
      const bldg = BUILDINGS[buildingId];
      if (!bldg || !city) return;
      const msg = document.createTextNode(
        `${city.name}: ${bldg.name} has expired — your civilization has grown beyond this era's institutions.`,
      );
      ctx.notifier.deliver(civId, msg.textContent ?? '', 'warning');
      SFX.nationalProjectExpired();
    }),
    bus.on('city:production-item-dropped', event => routeDroppedProductionItem(ctx.session.getState(), event, ctx.notifier.deliver)),
    bus.on('territory:tile-flipped', event => {
      routeTerritoryTileFlipped(ctx.session.getState(), { type: 'territory:tile-flipped', ...event }, ctx.notifier.deliver);
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
