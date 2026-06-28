import { EventBus } from '@/core/event-bus';
import type { GameEvents } from '@/core/types';

interface BufferedGameEvent<K extends keyof GameEvents = keyof GameEvents> {
  type: K;
  payload: GameEvents[K];
}

export class GameEventBuffer extends EventBus {
  private events: BufferedGameEvent[] = [];
  private consumed = false;

  override emit<K extends keyof GameEvents>(event: K, data: GameEvents[K]): void {
    if (this.consumed) return;
    this.events.push({ type: event, payload: structuredClone(data) } as BufferedGameEvent);
  }

  commitTo(target: EventBus): readonly unknown[] {
    if (this.consumed) return [];
    this.consumed = true;
    const errors: unknown[] = [];
    for (const event of this.events) {
      try {
        target.emit(event.type, event.payload);
      } catch (error) {
        errors.push(error);
      }
    }
    this.events = [];
    return errors;
  }

  discard(): void {
    if (this.consumed) return;
    this.consumed = true;
    this.events = [];
  }
}
