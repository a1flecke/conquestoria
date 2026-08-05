import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerGeneralPresentation } from '@/presentation/register-general-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

describe('general presentation', () => {
  it('resets the treasurer advisor message and re-checks advisors on a gold village outcome', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerGeneralPresentation(bus, ctx);
    bus.emit('village:visited', { civId: 'p1', position: { q: 0, r: 0 }, outcome: 'gold', message: 'Found gold!' });

    expect(ctx.resetAdvisorMessage).toHaveBeenCalledWith('treasurer_village_gold');
    expect(ctx.checkAdvisors).toHaveBeenCalledTimes(1);
    expect(ctx.deliver).toHaveBeenCalledWith('p1', 'Found gold!', 'success');
  });

  it('delivers an ambush outcome as a warning', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerGeneralPresentation(bus, ctx);
    bus.emit('village:visited', { civId: 'p1', position: { q: 0, r: 0 }, outcome: 'ambush', message: 'Ambushed!' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', 'Ambushed!', 'warning');
  });

  it('shows an advisor message as an immediate toast for the active viewer', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerGeneralPresentation(bus, ctx);
    bus.emit('advisor:message', { advisor: 'builder', message: 'Build a Granary', icon: '🏗️' });

    expect(ctx.showNotification).toHaveBeenCalledWith('🏗️ Build a Granary', 'info');
  });

  it('routes a strategic warning to its viewer', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerGeneralPresentation(bus, ctx);
    bus.emit('ai:strategic-warning', {
      viewerId: 'p1', actorId: 'ai-1', actorName: 'Carthage', warningKey: 'w1',
      kind: 'recovery', evidence: 'visible', playAudio: false,
    });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.any(String), 'success', undefined);
  });

  it('disposing removes every subscription this registrar added', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();
    const dispose = registerGeneralPresentation(bus, ctx);

    dispose();
    bus.emit('village:visited', { civId: 'p1', position: { q: 0, r: 0 }, outcome: 'gold', message: 'Found gold!' });
    bus.emit('advisor:message', { advisor: 'builder', message: 'Build a Granary', icon: '🏗️' });
    bus.emit('ai:strategic-warning', {
      viewerId: 'p1', actorId: 'ai-1', actorName: 'Carthage', warningKey: 'w1',
      kind: 'recovery', evidence: 'visible', playAudio: false,
    });

    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(ctx.showNotification).not.toHaveBeenCalled();
    expect(ctx.checkAdvisors).not.toHaveBeenCalled();
  });
});
