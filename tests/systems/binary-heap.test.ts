import { describe, it, expect } from 'vitest';
import { BinaryHeap } from '@/systems/binary-heap';
import { seededLcg } from '@/systems/seeded-lcg';

const numAsc = (a: number, b: number) => a - b;

describe('BinaryHeap', () => {
  it('pop() on an empty heap is undefined and size is 0', () => {
    const h = new BinaryHeap<number>(numAsc);
    expect(h.size).toBe(0);
    expect(h.pop()).toBeUndefined();
  });

  it('pops values in ascending comparator order for a random push batch', () => {
    const h = new BinaryHeap<number>(numAsc);
    const rng = seededLcg(12345);
    const input = Array.from({ length: 500 }, () => Math.floor(rng() * 1000));
    for (const v of input) h.push(v);
    expect(h.size).toBe(input.length);
    const out: number[] = [];
    for (let v = h.pop(); v !== undefined; v = h.pop()) out.push(v);
    expect(out).toEqual([...input].sort((a, b) => a - b));
    expect(h.size).toBe(0);
  });

  it('each pop returns the current minimum under interleaved push/pop', () => {
    const h = new BinaryHeap<number>(numAsc);
    const ref: number[] = []; // sorted-ascending oracle of the heap's contents
    const rng = seededLcg(99);
    for (let i = 0; i < 3000; i++) {
      if (rng() < 0.6 || ref.length === 0) {
        const v = Math.floor(rng() * 10000);
        h.push(v);
        const at = ref.findIndex(x => x > v);
        ref.splice(at === -1 ? ref.length : at, 0, v);
      } else {
        expect(h.pop()).toBe(ref.shift());
      }
      expect(h.size).toBe(ref.length);
    }
  });

  it('resolves ties by the comparator, not insertion order', () => {
    type E = { k: number; tag: string };
    const cmp = (a: E, b: E) => (a.k - b.k) || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0);
    const h = new BinaryHeap<E>(cmp);
    for (const tag of ['d', 'a', 'c', 'b']) h.push({ k: 1, tag });
    const out: string[] = [];
    for (let e = h.pop(); e !== undefined; e = h.pop()) out.push(e.tag);
    expect(out).toEqual(['a', 'b', 'c', 'd']);
  });

  it('5000-element stress: push all then drain is fully sorted', () => {
    const h = new BinaryHeap<number>(numAsc);
    const rng = seededLcg(2026);
    const input = Array.from({ length: 5000 }, () => Math.floor(rng() * 1e6));
    for (const v of input) h.push(v);
    const out: number[] = [];
    for (let v = h.pop(); v !== undefined; v = h.pop()) out.push(v);
    expect(out).toEqual([...input].sort((a, b) => a - b));
  });
});
