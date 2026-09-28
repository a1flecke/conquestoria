/**
 * #993: the generic "big moment" presentation queue — one sequential,
 * deduped, interaction-aware backlog engine, extracted from
 * `wonder-discovery-queue.ts` and `legendary-wonder-completion-queue.ts`
 * (both now thin domain adapters over this). Mirrors the precedent
 * `staged-lifecycle-engine.ts` (#990) set for turn-processing: one real
 * generic engine, never a second hand-rolled copy of the same loop.
 *
 * This module owns only sequencing (dedup, FIFO order, one-at-a-time,
 * gating on `isInteractionBlocked`/`notifyActionSettled`, and backlog
 * clearing). It knows nothing about DOM, ceremonies, overlays, or audio --
 * `present` is the caller's own async side effect, including any
 * blocking-overlay push/pop it needs around itself.
 */
export interface BigMomentQueueOptions<TItem> {
  /** A moment never starts presenting while true (an unrelated overlay, e.g. a panel). */
  isInteractionBlocked: () => boolean;
  /** Stable dedupe key. Enqueuing an item whose key is already queued or presenting is a no-op. */
  keyFor: (item: TItem) => string;
  /** The caller's own presentation side effect. Resolves when the player has dismissed/acted on it. */
  present: (item: TItem) => Promise<void>;
}

export interface BigMomentQueue<TItem> {
  enqueue(item: TItem | null): void;
  /** Signals "safe to present now" -- see each adapter for what gates this in its domain. */
  notifyActionSettled(): void;
  pump(): void;
  pendingCount(): number;
  /**
   * Drops every moment queued but not yet presenting, and frees their dedupe
   * keys. Does not interrupt one already presenting, and does not un-dedupe
   * anything that already played -- only the dropped items' own keys are
   * freed, so a moment shown before this call can never silently replay
   * after it.
   */
  clear(): void;
  /**
   * Full reset for a boundary where a previous game's presentation history
   * stops being relevant at all -- a brand-new game or a freshly loaded save
   * (never an ordinary hot-seat handoff within the SAME game, where `clear()`
   * is the correct call: a ceremony already shown this game must stay
   * deduped). Drops backlog like `clear()`, but additionally frees every
   * dedupe key including one already shown (a fresh game can legitimately
   * reuse the same civ/wonder ids and must not be silently blocked by the
   * previous game's history), and clears `presenting` so a moment whose own
   * presentation promise never resolved cannot permanently wedge the queue
   * across the boundary.
   */
  reset(): void;
}

export function createBigMomentQueue<TItem>(options: BigMomentQueueOptions<TItem>): BigMomentQueue<TItem> {
  const pending: TItem[] = [];
  const seen = new Set<string>();
  let presenting = false;
  let actionSettled = false;

  async function play(item: TItem): Promise<void> {
    presenting = true;
    try {
      await options.present(item);
    } finally {
      presenting = false;
    }
    pump();
  }

  function pump(): void {
    if (!actionSettled || presenting || options.isInteractionBlocked()) return;
    const next = pending.shift();
    if (!next) return;
    void play(next);
  }

  return {
    enqueue(item) {
      if (!item) return;
      const key = options.keyFor(item);
      if (seen.has(key)) return;
      seen.add(key);
      if (!presenting && pending.length === 0) {
        actionSettled = false;
      }
      pending.push(item);
      pump();
    },
    notifyActionSettled() {
      actionSettled = true;
      pump();
    },
    pump,
    pendingCount() {
      return pending.length;
    },
    clear() {
      for (const dropped of pending) {
        seen.delete(options.keyFor(dropped));
      }
      pending.length = 0;
      actionSettled = false;
    },
    reset() {
      pending.length = 0;
      seen.clear();
      presenting = false;
      actionSettled = false;
    },
  };
}
