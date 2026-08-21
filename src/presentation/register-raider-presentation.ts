/**
 * Barbarian and pirate raider notifications (#787 phase 7). Moved verbatim
 * from `main.ts`. Owns `notifiedBarbarianCampsPerCiv` -- per-civ dedup so a
 * civ sees a "raiders spotted!" entry only the first time its visibility
 * covers any raider from a given camp.
 */
import { SFX } from '@/audio/sfx';
import { isVisible } from '@/systems/fog-of-war';
import { routeBarbarianSpawned } from '@/ui/notification-routing';
import type { PresentationRegistrar } from '@/presentation/register-all';

export const registerRaiderPresentation: PresentationRegistrar = (bus, ctx) => {
  const notifiedBarbarianCampsPerCiv = new Map<string, Set<string>>();

  const unsubscribers = [
    bus.on('barbarian:spawned', ({ campId, unitId }) => {
      const unit = ctx.session.getState().units[unitId];
      if (!unit) return;
      routeBarbarianSpawned(
        ctx.session.getState(),
        unit.position,
        campId,
        unit.type,
        notifiedBarbarianCampsPerCiv,
        ctx.notifier.deliver,
        (vis, pos) => isVisible(vis as Parameters<typeof isVisible>[0], pos),
      );
    }),
    bus.on('threat:barbarian-resurgence', ({ civId, isBanditLord, banditLordName }) => {
      const message = isBanditLord
        ? `${banditLordName ?? 'A bandit lord'} has united the raiders and threatens your lands!`
        : 'Barbarian forces are resurgent on your lands!';
      ctx.notifier.deliver(civId, message, 'warning');
      SFX.barbarianResurgence?.();
    }),
    bus.on('barbarian:city-attacked', ({ cityId, hpLost }) => {
      const state = ctx.session.getState();
      const city = state.cities[cityId];
      if (!city) return;
      if (!state.civilizations[city.owner]?.isHuman) return;
      ctx.notifier.deliver(city.owner, `Barbarians attack ${city.name}! (−${hpLost} HP)`, 'warning');
    }),
    bus.on('barbarian:city-destroyed', ({ cityId, ownerId }) => {
      const state = ctx.session.getState();
      if (!state.civilizations[ownerId]?.isHuman) return;
      const cityName = state.cities[cityId]?.name ?? 'A city';
      ctx.notifier.deliver(ownerId, `${cityName} was destroyed by barbarian raiders!`, 'warning');
    }),
    // A walled, ungarrisoned city fighting back against a besieger (#522) -- covers BOTH
    // the barbarian (turn-manager.ts) and pirate (pirate-system.ts) counter-fire call
    // sites, since both emit this same shared event with their respective 'source' value.
    bus.on('city:counter-fire', ({ cityId, source, damage, attackerDied }) => {
      const state = ctx.session.getState();
      const city = state.cities[cityId];
      if (!city) return;
      if (!state.civilizations[city.owner]?.isHuman) return;
      const raiderLabel = source === 'barbarian' ? 'raider' : 'ship';
      const message = attackerDied
        ? `${city.name}'s defenses destroyed a ${source === 'barbarian' ? 'barbarian raider' : 'pirate ship'}!`
        : `${city.name}'s walls fought back, damaging a ${raiderLabel} (−${damage} HP)!`;
      ctx.notifier.deliver(city.owner, message, attackerDied ? 'success' : 'info');
    }),
    bus.on('city:coastal-battery-fired', ({ cityId, recipientCivId, source, damage, attackerDied }) => {
      const state = ctx.session.getState();
      if (!state.civilizations[recipientCivId]?.isHuman) return;
      const cityName = state.cities[cityId]?.name ?? 'A coastal city';
      const attackerLabel = source === 'pirate' ? 'pirate ship' : 'naval attacker';
      const message = attackerDied
        ? `${cityName}'s Coastal Battery destroyed a ${attackerLabel}!`
        : `${cityName}'s Coastal Battery returned fire on a ${attackerLabel} (−${damage} HP; first naval hit this turn).`;
      ctx.notifier.deliver(recipientCivId, message, attackerDied ? 'success' : 'info');
    }),
    bus.on('city:naval-bombarded', ({ cityId, recipientCivId, source, hpLost }) => {
      const state = ctx.session.getState();
      if (!state.civilizations[recipientCivId]?.isHuman) return;
      const cityName = state.cities[cityId]?.name ?? 'A coastal city';
      const attacker = source === 'ai' ? 'an enemy fleet' : 'a naval bombardment';
      ctx.notifier.deliver(recipientCivId, `${cityName} took ${hpLost} damage from ${attacker}.`, 'warning');
    }),
    // Pirate-faction naval siege (#522) mirror of the barbarian handler above.
    bus.on('pirate:city-destroyed', ({ cityId, ownerId }) => {
      const state = ctx.session.getState();
      if (!state.civilizations[ownerId]?.isHuman) return;
      const cityName = state.cities[cityId]?.name ?? 'A coastal city';
      ctx.notifier.deliver(ownerId, `${cityName} was razed by pirates!`, 'warning');
    }),
    // A sacked city survives the raid at 1 HP — phrased distinctly from outright
    // destruction so a recoverable loss is never mistaken for a permanent one. Both
    // barbarians (turn-manager.ts) and pirates (pirate-system.ts, #522) route through
    // this shared event with their respective 'source' value.
    bus.on('city:sacked', ({ cityId, source, goldLost }) => {
      const state = ctx.session.getState();
      const city = state.cities[cityId];
      if (!city) return;
      if (!state.civilizations[city.owner]?.isHuman) return;
      const raiders = source === 'barbarian' ? 'Barbarian raiders' : 'Pirates';
      ctx.notifier.deliver(
        city.owner,
        `${raiders} have sacked ${city.name}! The city survives at 1 HP, but ${goldLost} gold was looted.`,
        'warning',
      );
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
