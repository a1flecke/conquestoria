import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { GameEventBuffer } from '@/core/game-event-buffer';

describe('GameEventBuffer', () => {
  it('retains events until one idempotent commit', () => {
    const target = new EventBus();
    const listener = vi.fn();
    target.on('turn:start', listener);
    const buffer = new GameEventBuffer();
    buffer.emit('turn:start', { turn: 4, playerId: 'player' });

    expect(listener).not.toHaveBeenCalled();
    expect(buffer.commitTo(target)).toEqual([]);
    expect(listener).toHaveBeenCalledOnce();
    expect(buffer.commitTo(target)).toEqual([]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('discard prevents forwarding and commit continues after one event dispatch fails', () => {
    const target = new EventBus();
    const later = vi.fn();
    target.on('turn:start', () => {
      throw new Error('broken presentation');
    });
    target.on('turn:end', later);
    const buffer = new GameEventBuffer();
    buffer.emit('turn:start', { turn: 4, playerId: 'player' });
    buffer.emit('turn:end', { turn: 4, playerId: 'player' });

    expect(buffer.commitTo(target)).toHaveLength(1);
    expect(later).toHaveBeenCalledOnce();

    const discarded = new GameEventBuffer();
    discarded.emit('turn:end', { turn: 5, playerId: 'player' });
    discarded.discard();
    expect(discarded.commitTo(target)).toEqual([]);
    expect(later).toHaveBeenCalledOnce();
  });
});
