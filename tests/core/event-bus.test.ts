import { EventBus } from '@/core/event-bus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('calls listener when event is emitted', () => {
    const listener = vi.fn();
    bus.on('turn:start', listener);
    bus.emit('turn:start', { turn: 1, playerId: 'p1' });
    expect(listener).toHaveBeenCalledWith({ turn: 1, playerId: 'p1' });
  });

  it('supports multiple listeners for same event', () => {
    const a = vi.fn();
    const b = vi.fn();
    bus.on('turn:end', a);
    bus.on('turn:end', b);
    bus.emit('turn:end', { turn: 1, playerId: 'p1' });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('unsubscribes via returned function', () => {
    const listener = vi.fn();
    const unsub = bus.on('turn:start', listener);
    unsub();
    bus.emit('turn:start', { turn: 2, playerId: 'p1' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not throw when emitting event with no listeners', () => {
    expect(() => bus.emit('turn:start', { turn: 1, playerId: 'p1' })).not.toThrow();
  });

  it('once listener fires only once', () => {
    const listener = vi.fn();
    bus.once('tech:completed', listener);
    bus.emit('tech:completed', { civId: 'c1', techId: 't1' });
    bus.emit('tech:completed', { civId: 'c1', techId: 't2' });
    expect(listener).toHaveBeenCalledOnce();
  });
});
