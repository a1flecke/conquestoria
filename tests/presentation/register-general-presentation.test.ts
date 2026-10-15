import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerGeneralPresentation } from '@/presentation/register-general-presentation';
import { makePresentationContext } from '../helpers/presentation-context';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { getGeneralPresentation } from '@/systems/great-general-presentation';

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

  it('#544 MR4: delivers a retirement notification to the owning civ', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerGeneralPresentation(bus, ctx);
    bus.emit('general:retired', { civId: 'p1', generalName: 'Julius Caesar', message: 'Julius Caesar retired after a distinguished career.' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('Julius Caesar'), 'info');
  });

  describe('#889 retirement moment', () => {
    const caesar = GENERAL_DEFINITIONS.find(g => g.id === 'gen_caesar')!;

    it("queues the retirement moment for the viewing owner, with their General's crest and career line", () => {
      const bus = new EventBus();
      const ctx = makePresentationContext({ state: { currentPlayer: 'p1' } });
      registerGeneralPresentation(bus, ctx);
      bus.emit('general:retired', { civId: 'p1', generalName: 'Julius Caesar', message: 'Retired after 3 commands.', generalDefinitionId: 'gen_caesar' });
      expect(ctx.ceremonies.enqueueGeneralRetirement).toHaveBeenCalledTimes(1);
      expect(ctx.ceremonies.enqueueGeneralRetirement).toHaveBeenCalledWith({
        civId: 'p1', generalDefinitionId: 'gen_caesar', name: 'Julius Caesar',
        presentation: getGeneralPresentation(caesar), careerLine: 'Retired after 3 commands.',
      });
      expect(ctx.deliver).toHaveBeenCalledTimes(1); // the existing toast is unchanged, not duplicated
    });

    it("does not show another civ's retirement to the viewing player (hot-seat privacy), but still delivers their toast", () => {
      const bus = new EventBus();
      const ctx = makePresentationContext({ state: { currentPlayer: 'p2' } });
      registerGeneralPresentation(bus, ctx);
      bus.emit('general:retired', { civId: 'p1', generalName: 'Julius Caesar', message: 'Retired.', generalDefinitionId: 'gen_caesar' });
      expect(ctx.ceremonies.enqueueGeneralRetirement).not.toHaveBeenCalled();
      expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('Julius Caesar'), 'info');
    });

    it('an event with no resolvable definition still gets a crest-less moment instead of failing', () => {
      const bus = new EventBus();
      const ctx = makePresentationContext({ state: { currentPlayer: 'p1' } });
      registerGeneralPresentation(bus, ctx);
      bus.emit('general:retired', { civId: 'p1', generalName: 'A forgotten commander', message: 'Retired.' });
      bus.emit('general:retired', { civId: 'p1', generalName: 'Gone', message: 'Retired.', generalDefinitionId: 'gen_deleted_later' });
      const calls = (ctx.ceremonies.enqueueGeneralRetirement as unknown as { mock: { calls: Array<[{ presentation?: unknown }]> } }).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls.every(([item]) => item.presentation === undefined)).toBe(true);
    });
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
    bus.emit('general:retired', { civId: 'p1', generalName: 'Julius Caesar', message: 'Retired.' });

    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(ctx.showNotification).not.toHaveBeenCalled();
    expect(ctx.checkAdvisors).not.toHaveBeenCalled();
    expect(ctx.ceremonies.enqueueGeneralRetirement).not.toHaveBeenCalled();
  });
});
