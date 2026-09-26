// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { shouldListMajorCivForViewer } from '@/systems/viewer-intel';
import {
  domProjection,
  expectEarnedByViewer,
  expectHiddenFromViewer,
  expectHotSeatDifferential,
  expectViewerSafety,
  type ViewerSurface,
} from './viewer-safety';
import {
  AI_A,
  AI_B,
  HUMAN_A,
  HUMAN_B,
  createTwoViewerWorld,
  expectUnmet,
  makeMet,
} from './viewer-knowledge-fixtures';

/**
 * #1002 — the harness must fail loudly on every way a viewer-safety test can be wrong, not just
 * pass on a correct surface. Each "leaky"/"insensitive"/"vacuous" case below is a realistic
 * mistake the harness exists to catch.
 */

// A correct surface: the names of civs the viewer may list, via the production predicate.
const listedCivs: ViewerSurface<GameState, string[]> = {
  name: 'listed civs (fixture surface)',
  project: (state, viewerId) => Object.values(state.civilizations)
    .filter(civ => civ.id !== viewerId && shouldListMajorCivForViewer(state, viewerId, civ.id))
    .map(civ => civ.name)
    .sort(),
};

// A leaky surface: "anonymised" copy that still reveals how many rivals exist (count leak).
const leakyRivalCount: ViewerSurface<GameState, string> = {
  name: 'leaky rival count',
  project: state => `${Object.keys(state.civilizations).length - 1} rival empires`,
};

// An insensitive surface: renders nothing — would pass every hidden-change check vacuously.
const constantSurface: ViewerSurface<GameState, string> = { name: 'constant', project: () => 'nothing to see' };

const renameUnmetAiB = { label: 'unmet AI_B renames itself', apply: (s: GameState) => { s.civilizations[AI_B]!.name = 'Renamed'; } };
const meetAiA = { label: `${HUMAN_A} meets ${AI_A}`, apply: (s: GameState) => makeMet(s, HUMAN_A, AI_A) };

describe('#1002 viewer-safety harness', () => {
  it('fixture world starts with every pair unmet', () => {
    const world = createTwoViewerWorld();
    for (const viewer of [HUMAN_A, HUMAN_B]) {
      for (const target of Object.keys(world.civilizations).filter(id => id !== viewer)) {
        expect(() => expectUnmet(world, viewer, target)).not.toThrow();
      }
    }
  });

  it('passes a correct surface: hidden change invisible, earned change visible', () => {
    expectViewerSafety(listedCivs, {
      world: createTwoViewerWorld(),
      viewerId: HUMAN_A,
      hidden: [renameUnmetAiB],
      earned: [meetAiA],
    });
  });

  it('fails a surface that leaks unmet-civ existence through an anonymised count', () => {
    const world = createTwoViewerWorld();
    const addCiv = {
      label: 'an unmet empire joins the world',
      apply: (s: GameState) => {
        s.civilizations['ai-9'] = { ...structuredClone(s.civilizations[AI_B]!), id: 'ai-9', knownCivilizations: [] };
      },
    };
    expect(() => expectHiddenFromViewer(leakyRivalCount, world, HUMAN_A, addCiv))
      .toThrow(/leaky rival count.*not earned: an unmet empire joins the world/);
  });

  it('fails a case whose "hidden" mutation changes nothing (vacuous)', () => {
    const noop = { label: 'no-op', apply: () => {} };
    expect(() => expectHiddenFromViewer(listedCivs, createTwoViewerWorld(), HUMAN_A, noop))
      .toThrow(/did not change the world/);
  });

  it('fails an insensitive surface through the required earned control', () => {
    expect(() => expectEarnedByViewer(constantSurface, createTwoViewerWorld(), HUMAN_A, meetAiA))
      .toThrow(/surface is insensitive/);
    expect(() => expectViewerSafety(constantSurface, {
      world: createTwoViewerWorld(), viewerId: HUMAN_A, hidden: [renameUnmetAiB], earned: [],
    })).toThrow(/at least one earned control/);
  });

  it('does not mutate the shared world', () => {
    const world = createTwoViewerWorld();
    const snapshot = JSON.stringify(world);
    expectViewerSafety(listedCivs, { world, viewerId: HUMAN_A, hidden: [renameUnmetAiB], earned: [meetAiA] });
    expect(JSON.stringify(world)).toBe(snapshot);
  });

  it('hot seat: one world, a contact only B earned reaches B and not A', () => {
    expectHotSeatDifferential(listedCivs, {
      world: createTwoViewerWorld(),
      viewers: [HUMAN_A, HUMAN_B],
      knownOnlyTo: HUMAN_B,
      mutation: { label: `${HUMAN_B} meets ${AI_B}`, apply: s => makeMet(s, HUMAN_B, AI_B) },
    });
    // And a surface that ignores its viewer argument is caught.
    const viewerBlind: ViewerSurface<GameState, string[]> = {
      name: 'viewer-blind listing',
      project: state => Object.values(state.civilizations)
        .filter(civ => (civ.knownCivilizations ?? []).length > 0).map(civ => civ.name).sort(),
    };
    expect(() => expectHotSeatDifferential(viewerBlind, {
      world: createTwoViewerWorld(),
      viewers: [HUMAN_A, HUMAN_B],
      knownOnlyTo: HUMAN_B,
      mutation: { label: `${HUMAN_B} meets ${AI_B}`, apply: s => makeMet(s, HUMAN_B, AI_B) },
    })).toThrow(/viewer "player-1" saw a change it has not earned/);
  });

  it('domProjection compares tooltip/ARIA text, not just visible text', () => {
    const root = document.createElement('div');
    const badge = document.createElement('span');
    badge.textContent = '?';
    badge.title = 'Delhi is plotting';
    badge.setAttribute('aria-label', 'Unknown empire');
    root.appendChild(badge);
    expect(domProjection(root)).toEqual({
      text: '?',
      attributes: ['span[title]=Delhi is plotting', 'span[aria-label]=Unknown empire'],
    });
  });
});
