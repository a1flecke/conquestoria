import { expect } from 'vitest';

/**
 * #1002 — the reusable viewer-safety harness.
 *
 * A viewer-sensitive surface is proved safe by **differential invariance**, not by walking its
 * output for "forbidden ids" (a walker cannot tell a civ id from a flavour string, and a
 * projection that simply drops the id but keeps the count/ordering/sound still leaks):
 *
 *   world A ──project(viewer)──▶ P(A)
 *   world B = A + a change the viewer has NOT earned ──project(viewer)──▶ P(B)   ⇒ P(A) deep-equals P(B)
 *
 * Every case must also carry at least one **earned** control — a change the viewer IS entitled
 * to see — that must change the projection. Without it, a surface that renders nothing (or a
 * fixture that accidentally hides everything) would pass vacuously.
 *
 * Mutations run on a deep clone, so one authoritative world can be reused across cases and
 * across viewers (hot seat).
 *
 * Usage for a new surface (#989 rival, #991 named wars, #992 world races, #993 big moments):
 *   const surface: ViewerSurface<GameState, MyProjection> = { name: 'rival panel', project: (s, v) => … };
 *   expectViewerSafety(surface, { world, viewerId, hidden: [...], earned: [...] });
 *   expectHotSeatDifferential(surface, { world, viewers: [a, b], knownOnlyTo: b, mutation });
 */

export interface ViewerSurface<W, P> {
  /** Human-readable name used in failure messages. */
  name: string;
  /**
   * Produce exactly what the viewer is shown (or the viewer-scoped DTO a UI renders).
   * Must be deterministic for a given world + viewer.
   */
  project(world: W, viewerId: string): P;
}

export interface WorldMutation<W> {
  /** Says what changed and why the viewer has (or has not) earned it. */
  label: string;
  apply(world: W): void;
}

export interface ViewerSafetyCase<W> {
  world: W;
  viewerId: string;
  /** Changes to facts the viewer has not earned — must not alter the projection. */
  hidden: ReadonlyArray<WorldMutation<W>>;
  /** Changes the viewer has earned — at least one is required and must alter the projection. */
  earned: ReadonlyArray<WorldMutation<W>>;
  clone?: (world: W) => W;
}

function defaultClone<W>(world: W): W {
  return structuredClone(world);
}

function mutated<W>(world: W, mutation: WorldMutation<W>, clone: (world: W) => W): W {
  const next = clone(world);
  mutation.apply(next);
  return next;
}

function assertNonVacuous<W>(surface: ViewerSurface<W, unknown>, base: W, next: W, label: string): void {
  // A mutation that changes nothing proves nothing; fail loudly rather than pass vacuously.
  expect(
    JSON.stringify(next) !== JSON.stringify(base),
    `[${surface.name}] mutation "${label}" did not change the world — the case would pass vacuously`,
  ).toBe(true);
}

/** Hidden change ⇒ identical projection for this viewer. */
export function expectHiddenFromViewer<W, P>(
  surface: ViewerSurface<W, P>,
  world: W,
  viewerId: string,
  mutation: WorldMutation<W>,
  clone: (world: W) => W = defaultClone,
): void {
  const baseline = surface.project(clone(world), viewerId);
  const next = mutated(world, mutation, clone);
  assertNonVacuous(surface, world, next, mutation.label);
  expect(
    surface.project(next, viewerId),
    `[${surface.name}] viewer "${viewerId}" saw a change it has not earned: ${mutation.label}`,
  ).toEqual(baseline);
}

/** Earned change ⇒ the projection changes (proves the surface is sensitive to this fact class). */
export function expectEarnedByViewer<W, P>(
  surface: ViewerSurface<W, P>,
  world: W,
  viewerId: string,
  mutation: WorldMutation<W>,
  clone: (world: W) => W = defaultClone,
): void {
  const baseline = surface.project(clone(world), viewerId);
  const next = mutated(world, mutation, clone);
  expect(
    surface.project(next, viewerId),
    `[${surface.name}] viewer "${viewerId}" should see the earned change "${mutation.label}" — ` +
      'the surface is insensitive, so its hidden-change checks prove nothing',
  ).not.toEqual(baseline);
}

export function expectViewerSafety<W, P>(
  surface: ViewerSurface<W, P>,
  testCase: ViewerSafetyCase<W>,
): void {
  const clone = testCase.clone ?? defaultClone;
  expect(
    testCase.earned.length,
    `[${surface.name}] a viewer-safety case needs at least one earned control`,
  ).toBeGreaterThan(0);
  expect(testCase.hidden.length, `[${surface.name}] a viewer-safety case needs a hidden mutation`)
    .toBeGreaterThan(0);
  for (const mutation of testCase.hidden) {
    expectHiddenFromViewer(surface, testCase.world, testCase.viewerId, mutation, clone);
  }
  for (const mutation of testCase.earned) {
    expectEarnedByViewer(surface, testCase.world, testCase.viewerId, mutation, clone);
  }
}

/**
 * Hot seat: ONE shared authoritative world, two human viewers with asymmetric knowledge. A change
 * only `knownOnlyTo` has earned must reach that viewer and must not reach the other.
 */
export function expectHotSeatDifferential<W, P>(
  surface: ViewerSurface<W, P>,
  testCase: {
    world: W;
    viewers: readonly [string, string];
    knownOnlyTo: string;
    mutation: WorldMutation<W>;
    clone?: (world: W) => W;
  },
): void {
  const clone = testCase.clone ?? defaultClone;
  const [first, second] = testCase.viewers;
  expect(first, `[${surface.name}] hot-seat viewers must differ`).not.toBe(second);
  expect(
    testCase.viewers.includes(testCase.knownOnlyTo),
    `[${surface.name}] knownOnlyTo must be one of the two viewers`,
  ).toBe(true);
  const other = testCase.knownOnlyTo === first ? second : first;
  expectEarnedByViewer(surface, testCase.world, testCase.knownOnlyTo, testCase.mutation, clone);
  expectHiddenFromViewer(surface, testCase.world, other, testCase.mutation, clone);
}

/**
 * The viewer-visible content of a rendered DOM subtree: whitespace-normalized text plus every
 * attribute that can carry player-readable text (tooltips, ARIA labels, alt text, data-*).
 * Comparing this — not just `textContent` — catches a leak that hides in a `title=`.
 */
export function domProjection(root: Element): { text: string; attributes: string[] } {
  const attributes: string[] = [];
  const visit = (element: Element): void => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name;
      if (name === 'title' || name === 'alt' || name === 'placeholder'
        || name.startsWith('aria-') || name.startsWith('data-')) {
        attributes.push(`${element.tagName.toLowerCase()}[${name}]=${attribute.value}`);
      }
    }
    for (const child of Array.from(element.children)) visit(child);
  };
  visit(root);
  return {
    text: (root.textContent ?? '').replace(/\s+/g, ' ').trim(),
    attributes,
  };
}
