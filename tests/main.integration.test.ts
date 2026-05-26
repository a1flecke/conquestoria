import { describe, it, expect } from 'vitest';
import type { NotificationEntry } from '@/ui/notification-log';
import { routeEraAdvanced, type NotificationSink } from '@/ui/notification-routing';

function makeSink() {
  const calls: Array<{ civId: string; message: string; type: string }> = [];
  const sink: NotificationSink = (civId, message, type) => calls.push({ civId, message, type });
  return { sink, calls };
}

function makeToastSink() {
  const calls: Array<{ message: string; type: NotificationEntry['type'] }> = [];
  const sink = (message: string, type: NotificationEntry['type']) => calls.push({ message, type });
  return { sink, calls };
}

describe('era:advanced notification', () => {
  it('era 2 calls toastSink with Era 2 and factionSink once with Era 2 and unrest', () => {
    const { sink: toastSink, calls: toastCalls } = makeToastSink();
    const { sink: factionSink, calls: factionCalls } = makeSink();

    routeEraAdvanced(2, 'p1', 'Alice', toastSink, factionSink);

    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]!.message).toContain('Era 2');
    expect(toastCalls[0]!.type).toBe('success');

    expect(factionCalls).toHaveLength(1);
    expect(factionCalls[0]!.civId).toBe('p1');
    expect(factionCalls[0]!.message).toContain('Era 2');
    expect(factionCalls[0]!.message).toContain('unrest');
    expect(factionCalls[0]!.type).toBe('info');
  });

  it('era 3 calls toastSink with Era 3 but does NOT call factionSink', () => {
    const { sink: toastSink, calls: toastCalls } = makeToastSink();
    const { sink: factionSink, calls: factionCalls } = makeSink();

    routeEraAdvanced(3, 'p1', 'Alice', toastSink, factionSink);

    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]!.message).toContain('Era 3');
    expect(factionCalls).toHaveLength(0);
  });
});
