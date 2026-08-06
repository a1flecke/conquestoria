/**
 * Cyber-drain and network-exploit notifications, plus the shared
 * `network:audio-cue` handler both exploit events emit into (#787 phase 7).
 * Moved verbatim from `main.ts`. `city:cyber-drained` groups here by theme
 * (network/cyber attacks) despite its `city:` namespace prefix.
 */
import type { PresentationRegistrar } from '@/presentation/register-all';
import { getNetworkWarningForViewer } from '@/systems/network-viewer-intel';

export const registerNetworkPresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('city:cyber-drained', ({ cityName, drainerOwner, goldLost, blocked, victimCivId }) => {
      const state = ctx.session.getState();
      const drainerName = state.civilizations[drainerOwner]?.name ?? drainerOwner;
      const victimName = state.civilizations[victimCivId]?.name ?? victimCivId;
      if (blocked) {
        ctx.notifier.deliver(victimCivId, `Cyber Defense Center blocked an intrusion in ${cityName}.`, 'success');
        ctx.notifier.deliver(drainerOwner, `Cyber attack on ${cityName} was blocked by ${victimName}'s Cyber Defense Center.`, 'warning');
        return;
      }
      ctx.notifier.deliver(victimCivId, `Cyber attack: ${cityName} lost ${goldLost} gold (${drainerName} cyber unit).`, 'warning');
      ctx.notifier.deliver(drainerOwner, `Cyber unit stole ${goldLost} gold from ${victimName}'s ${cityName}.`, 'success');
    }),
    bus.on('network:exploit-warning', ({ planId, victimCivId, cityId }) => {
      const state = ctx.session.getState();
      const warning = getNetworkWarningForViewer(state, victimCivId, planId);
      const city = state.cities[cityId];
      if (!warning || !city) return;
      const disclosure = warning.source?.unitId
        ? ' The source has been identified.'
        : warning.source?.position
          ? ' The source position has been detected.'
          : '';
      ctx.notifier.deliver(
        victimCivId,
        `Network exploit warning: ${city.name} will be targeted at the end of this turn. A Cyber Defense Center or Harden reduces the effect.${disclosure}`,
        'warning',
        { kind: 'map', coord: city.position, label: city.name },
      );
      bus.emit('network:audio-cue', { cue: 'hostile-warning', viewerIds: [victimCivId] });
    }),
    bus.on('network:exploit-resolved', ({ cityId, ownerCivId, goldTransferred, delayed }) => {
      const state = ctx.session.getState();
      const city = state.cities[cityId];
      if (!city) return;
      if (delayed) {
        ctx.notifier.deliver(city.owner, `${city.name}'s Cyber Defense Center delayed a network exploit.`, 'success');
        ctx.notifier.deliver(ownerCivId, `Your network exploit against ${city.name} was delayed by its Cyber Defense Center.`, 'warning');
        return;
      }
      ctx.notifier.deliver(city.owner, `Network exploit: ${city.name} lost ${goldTransferred} gold.`, 'warning');
      ctx.notifier.deliver(ownerCivId, `Network exploit transferred ${goldTransferred} gold from ${city.name}.`, 'success');
      bus.emit('network:audio-cue', { cue: 'hostile-consequence', viewerIds: [city.owner, ownerCivId] });
    }),
    bus.on('network:audio-cue', ({ cue, viewerIds }) => {
      if (cue === 'constructive-resolution') {
        ctx.notifier.deliver(viewerIds[0]!, 'Stable network plan milestone reached: three resolutions recorded.', 'success');
      } else if (cue === 'recovery') {
        ctx.notifier.deliver(viewerIds[0]!, 'Network recovery complete.', 'success');
      }
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
