import type { PresentationRegistrar } from '@/presentation/register-all';

/** Delivers only the target civilization's Host result, including hot-seat handoff. */
export const registerRogueElephantHostPresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribe = bus.on('rogue-elephant-host:lifecycle', event => {
    if (event.kind === 'command-broken') {
      ctx.notifier.deliver(event.targetCivId, `Handler defeated: the remaining herds will disperse in ${event.dispersalTurnsRemaining} turns.`, 'success');
      return;
    }
    if (event.rewardGranted) {
      ctx.notifier.deliver(event.targetCivId, `Rogue Elephant Host ${event.outcome}. You receive Recovered Harnesses for your next War Elephant.`, 'success');
      return;
    }
    ctx.notifier.deliver(event.targetCivId, 'Rogue Elephant Host escaped; no reward was recovered.', 'info');
  });
  return unsubscribe;
};
