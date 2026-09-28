import { describe, expect, it, vi } from 'vitest';
import { createBigMomentQueue } from '@/systems/big-moment-queue';

interface Moment {
  id: string;
}

describe('big-moment-queue (#993)', () => {
  it('waits for action-settled before presenting the first moment', () => {
    const present = vi.fn(() => Promise.resolve());
    const queue = createBigMomentQueue<Moment>({
      isInteractionBlocked: () => false,
      keyFor: item => item.id,
      present,
    });

    queue.enqueue({ id: 'a' });
    queue.pump();
    expect(present).not.toHaveBeenCalled();

    queue.notifyActionSettled();
    expect(present).toHaveBeenCalledTimes(1);
  });

  it('plays multiple items one at a time in enqueue order', async () => {
    const resolvers: Array<() => void> = [];
    const presented: string[] = [];
    const queue = createBigMomentQueue<Moment>({
      isInteractionBlocked: () => false,
      keyFor: item => item.id,
      present: item => new Promise(resolve => {
        presented.push(item.id);
        resolvers.push(resolve);
      }),
    });

    queue.enqueue({ id: 'a' });
    queue.enqueue({ id: 'b' });
    queue.notifyActionSettled();

    expect(presented).toEqual(['a']);
    resolvers[0]!();
    await Promise.resolve();
    expect(presented).toEqual(['a', 'b']);
  });

  it('waits while isInteractionBlocked is true and resumes once pumped after it clears', () => {
    let blocked = true;
    const present = vi.fn(() => Promise.resolve());
    const queue = createBigMomentQueue<Moment>({
      isInteractionBlocked: () => blocked,
      keyFor: item => item.id,
      present,
    });

    queue.enqueue({ id: 'a' });
    queue.notifyActionSettled();
    expect(present).not.toHaveBeenCalled();

    blocked = false;
    queue.pump();
    expect(present).toHaveBeenCalledTimes(1);
  });

  it('dedupes a repeat key already queued or presenting', () => {
    const present = vi.fn(() => new Promise<void>(() => {}));
    const queue = createBigMomentQueue<Moment>({
      isInteractionBlocked: () => false,
      keyFor: item => item.id,
      present,
    });

    queue.enqueue({ id: 'a' });
    queue.notifyActionSettled();
    queue.enqueue({ id: 'a' });

    expect(present).toHaveBeenCalledTimes(1);
    expect(queue.pendingCount()).toBe(0);
  });

  it('requires a fresh action-settled signal for a later item after the queue drains', async () => {
    const present = vi.fn(() => Promise.resolve());
    const queue = createBigMomentQueue<Moment>({
      isInteractionBlocked: () => false,
      keyFor: item => item.id,
      present,
    });

    queue.enqueue({ id: 'a' });
    queue.notifyActionSettled();
    await Promise.resolve();
    expect(present).toHaveBeenCalledTimes(1);

    queue.enqueue({ id: 'b' });
    queue.pump();
    expect(present).toHaveBeenCalledTimes(1);

    queue.notifyActionSettled();
    expect(present).toHaveBeenCalledTimes(2);
  });

  it('a null item is a no-op', () => {
    const present = vi.fn(() => Promise.resolve());
    const queue = createBigMomentQueue<Moment>({
      isInteractionBlocked: () => false,
      keyFor: item => item.id,
      present,
    });

    queue.enqueue(null);
    queue.notifyActionSettled();

    expect(present).not.toHaveBeenCalled();
  });

  it('clear() drops pending items so they never surface after a later unblock', () => {
    let blocked = true;
    const present = vi.fn(() => Promise.resolve());
    const queue = createBigMomentQueue<Moment>({
      isInteractionBlocked: () => blocked,
      keyFor: item => item.id,
      present,
    });

    queue.enqueue({ id: 'a' });
    queue.notifyActionSettled();
    expect(present).not.toHaveBeenCalled();

    queue.clear();
    blocked = false;
    queue.pump();

    expect(present).not.toHaveBeenCalled();
    expect(queue.pendingCount()).toBe(0);
  });

  it('clear() frees the dedupe key only for dropped items, never one already presenting', async () => {
    const present = vi.fn(() => Promise.resolve());
    const queue = createBigMomentQueue<Moment>({
      isInteractionBlocked: () => false,
      keyFor: item => item.id,
      present,
    });

    queue.enqueue({ id: 'a' });
    queue.notifyActionSettled();
    await Promise.resolve();
    expect(present).toHaveBeenCalledTimes(1);

    queue.clear();
    queue.enqueue({ id: 'a' });
    queue.notifyActionSettled();

    expect(present).toHaveBeenCalledTimes(1);
  });

  it('clear() lets a same-key item re-queue instead of treating it as a dedupe of the dropped item', () => {
    const present = vi.fn(() => Promise.resolve());
    const queue = createBigMomentQueue<Moment>({
      isInteractionBlocked: () => false,
      keyFor: item => item.id,
      present,
    });

    queue.enqueue({ id: 'a' });
    queue.clear();
    queue.enqueue({ id: 'a' });
    queue.notifyActionSettled();

    expect(present).toHaveBeenCalledTimes(1);
  });

  it('reset() frees the dedupe key of an item that already finished playing, unlike clear()', async () => {
    const present = vi.fn(() => Promise.resolve());
    const queue = createBigMomentQueue<Moment>({
      isInteractionBlocked: () => false,
      keyFor: item => item.id,
      present,
    });

    queue.enqueue({ id: 'a' });
    queue.notifyActionSettled();
    await Promise.resolve();
    expect(present).toHaveBeenCalledTimes(1);

    // clear() alone would NOT free 'a' -- it only frees keys still pending.
    queue.reset();
    queue.enqueue({ id: 'a' });
    queue.notifyActionSettled();

    expect(present).toHaveBeenCalledTimes(2);
  });

  it('reset() clears a stuck presenting flag left by a promise that never resolved', () => {
    const present = vi.fn(() => new Promise<void>(() => {}));
    const queue = createBigMomentQueue<Moment>({
      isInteractionBlocked: () => false,
      keyFor: item => item.id,
      present,
    });

    queue.enqueue({ id: 'a' });
    queue.notifyActionSettled();
    expect(present).toHaveBeenCalledTimes(1);

    queue.reset();
    queue.enqueue({ id: 'a' });
    queue.notifyActionSettled();

    expect(present).toHaveBeenCalledTimes(2);
  });
});
