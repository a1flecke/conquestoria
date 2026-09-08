/**
 * Generic array-backed binary min-heap (#1042 / #1010 MR5). Ordered by an injected
 * comparator: `compare(a, b) < 0` means `a` pops before `b`.
 *
 * Deterministic: `siftUp` / `siftDown` consult only the comparator, never insertion
 * order or object identity, so the same push/pop sequence always yields the same pop
 * order. It is ephemeral algorithm scratch — constructed inside a function, dropped when
 * that function returns, never placed on `GameState`, never serialized — so the repo's
 * "game state is a plain object, no class instances" rule does not apply here.
 *
 * Surface is deliberately minimal (one consumer today: `findPath`'s open set). Add
 * `peek` / `decreaseKey` / bulk `heapify` only when a second consumer needs them.
 */
export class BinaryHeap<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.items.length;
  }

  push(value: T): void {
    this.items.push(value);
    this.siftUp(this.items.length - 1);
  }

  /** Remove and return the current minimum, or `undefined` when empty. */
  pop(): T | undefined {
    const { items } = this;
    if (items.length === 0) return undefined;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(index: number): void {
    const { items, compare } = this;
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (compare(items[i]!, items[parent]!) >= 0) break;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }

  private siftDown(index: number): void {
    const { items, compare } = this;
    const n = items.length;
    let i = index;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && compare(items[left]!, items[smallest]!) < 0) smallest = left;
      if (right < n && compare(items[right]!, items[smallest]!) < 0) smallest = right;
      if (smallest === i) break;
      [items[i], items[smallest]] = [items[smallest]!, items[i]!];
      i = smallest;
    }
  }
}
