import type { GameEvents } from './types';

type Listener<T> = (data: T) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener<any>>>();

  on<K extends keyof GameEvents>(
    event: K,
    listener: Listener<GameEvents[K]>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  once<K extends keyof GameEvents>(
    event: K,
    listener: Listener<GameEvents[K]>,
  ): () => void {
    const wrapped: Listener<GameEvents[K]> = (data) => {
      unsub();
      listener(data);
    };
    const unsub = this.on(event, wrapped);
    return unsub;
  }

  emit<K extends keyof GameEvents>(event: K, data: GameEvents[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        listener(data);
      }
    }
  }
}
