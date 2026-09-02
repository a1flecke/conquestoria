import { describe, expect, it } from 'vitest';
import type { Tech } from '@/core/types';
import { createTechState, TECH_TREE } from '@/systems/tech-system';
import {
  buildTechProgressionView,
  canMoveQueuedResearch,
  getDerivedTechTracks,
  getQueueableResearchIds,
  simulateResearchQueueTiming,
} from '@/systems/tech-progression';

describe('tech progression view model', () => {
  it('derives track order from TECH_TREE instead of a hardcoded UI list', () => {
    expect(getDerivedTechTracks(TECH_TREE)).toEqual([
      'military', 'economy', 'science', 'civics', 'exploration',
      'agriculture', 'medicine', 'philosophy', 'arts', 'maritime',
      'metallurgy', 'construction', 'communication', 'espionage', 'spirituality',
    ]);
  });

  it('marks current, queued, available, next-layer, and deep locked nodes distinctly', () => {
    const techState = {
      ...createTechState(),
      completed: ['gathering', 'pottery'],
      currentResearch: 'fire',
      researchQueue: ['writing'],
    };

    const view = buildTechProgressionView(techState);

    expect(view.nodesById.get('fire')?.state).toBe('current');
    expect(view.nodesById.get('writing')?.state).toBe('queued');
    expect(view.nodesById.get('stone-weapons')?.state).toBe('available');
    expect(view.nodesById.get('mathematics')?.state).toBe('next-layer');
    expect(view.nodesById.get('banking')?.state).toBe('locked');
    expect(view.nodesById.get('banking')?.visibleByDefault).toBe(false);
  });

  it('does not treat a conjunctive prerequisite as next-layer when only one branch is near', () => {
    const techState = {
      ...createTechState(),
      completed: ['gathering', 'pottery', 'currency'],
      currentResearch: 'trade-routes',
      researchQueue: [],
    };

    const view = buildTechProgressionView(techState);

    expect(view.nodesById.get('banking')?.state).toBe('locked');
    expect(view.nodesById.get('banking')?.visibleByDefault).toBe(false);
  });

  it('allows queued research only when the planned chain satisfies prerequisites in order', () => {
    const techState = {
      ...createTechState(),
      currentResearch: 'fire',
      researchQueue: ['writing'],
    };

    expect(getQueueableResearchIds(techState)).toContain('mathematics');
    expect(getQueueableResearchIds(techState)).not.toContain('banking');
  });

  it('starts with a small revealed tree and keeps far future tech hidden outside all-tech zoom', () => {
    const view = buildTechProgressionView(createTechState());

    expect(view.visibleIds.has('fire')).toBe(true);
    expect(view.visibleIds.has('writing')).toBe(true);
    expect(view.visibleIds.has('nuclear-theory')).toBe(false);
    expect(view.knownVisibleIds.has('nuclear-theory')).toBe(false);
  });

  it('grows the known tree as research reveals downstream children', () => {
    const early = buildTechProgressionView(createTechState());
    const later = buildTechProgressionView({
      ...createTechState(),
      completed: ['fire', 'writing'],
    });

    expect(early.knownVisibleIds.has('mathematics')).toBe(false);
    expect(later.knownVisibleIds.has('mathematics')).toBe(true);
  });

  it('focuses current research before the latest completed tech', () => {
    const currentView = buildTechProgressionView({
      ...createTechState(),
      completed: ['fire'],
      currentResearch: 'writing',
    });
    const completedView = buildTechProgressionView({
      ...createTechState(),
      completed: ['fire', 'writing'],
      currentResearch: null,
    });

    expect(currentView.focusTechId).toBe('writing');
    expect(completedView.focusTechId).toBe('writing');
  });

  it('computes ETA for current and queued tech nodes from science pacing', () => {
    const view = buildTechProgressionView({
      ...createTechState(),
      currentResearch: 'stone-weapons',
      researchProgress: 1,
      researchQueue: ['fire'],
    }, { sciencePerTurn: 3, zoom: 'all' });

    expect(view.nodesById.get('stone-weapons')?.turnsToResearch).toBe(6);
    expect(view.nodesById.get('fire')?.turnsToResearch).toBe(13);
    expect(view.nodesById.get('banking')?.turnsToResearch).toBeNull();
  });

  it('simulates queued research at one completion per turn', () => {
    const timing = simulateResearchQueueTiming({
      ...createTechState(),
      currentResearch: 'fire',
      researchProgress: 0,
      researchQueue: ['writing'],
    }, 100);

    expect(timing.get('fire')).toEqual({ startTurns: 0, finishTurns: 1 });
    expect(timing.get('writing')).toEqual({ startTurns: 1, finishTurns: 2 });
  });

  it('carries queue overflow into an existing successor and shortens its ETA (MR4, #917)', () => {
    const techs: Tech[] = [
      { id: 'a', name: 'A', track: 'science', cost: 20, prerequisites: [], unlocks: [], era: 1 },
      { id: 'b', name: 'B', track: 'science', cost: 35, prerequisites: ['a'], unlocks: [], era: 1 },
      { id: 'c', name: 'C', track: 'science', cost: 200, prerequisites: ['b'], unlocks: [], era: 1 },
    ];

    const timing = simulateResearchQueueTiming({
      ...createTechState(),
      currentResearch: 'a',
      researchProgress: 0,
      researchQueue: ['b', 'c'],
    }, 30, techs);

    // Turn 1: +30 finishes A (cost 20); 10 leftover carries into B.
    expect(timing.get('a')).toEqual({ startTurns: 0, finishTurns: 1 });
    // B holds 10 carried, so +30 on turn 2 reaches 40 >= 35 and it completes on
    // turn 2 — without carry it would need two more turns and finish on turn 3.
    expect(timing.get('b')).toEqual({ startTurns: 1, finishTurns: 2 });
    // B overflow (5) carries into C: remaining 195, ceil(195/30) = 7 → finish 9.
    expect(timing.get('c')).toEqual({ startTurns: 2, finishTurns: 9 });
  });

  it('discards overflow from the final queued technology (no successor to receive it)', () => {
    const techs: Tech[] = [
      { id: 'a', name: 'A', track: 'science', cost: 20, prerequisites: [], unlocks: [], era: 1 },
      { id: 'b', name: 'B', track: 'science', cost: 500, prerequisites: ['a'], unlocks: [], era: 1 },
    ];

    const timing = simulateResearchQueueTiming({
      ...createTechState(),
      currentResearch: 'a',
      researchProgress: 0,
      researchQueue: ['b'],
    }, 40, techs);

    // A finishes turn 1 with 20 overflow carried into B.
    expect(timing.get('a')).toEqual({ startTurns: 0, finishTurns: 1 });
    // B: remaining 500 - 20 = 480, ceil(480/40) = 12 → finish turn 13.
    expect(timing.get('b')).toEqual({ startTurns: 1, finishTurns: 13 });
  });

  it('still spends one turn on a successor even when carried overflow already covers its cost', () => {
    const techs: Tech[] = [
      { id: 'a', name: 'A', track: 'science', cost: 20, prerequisites: [], unlocks: [], era: 1 },
      { id: 'b', name: 'B', track: 'science', cost: 10, prerequisites: ['a'], unlocks: [], era: 1 },
      { id: 'c', name: 'C', track: 'science', cost: 10, prerequisites: ['b'], unlocks: [], era: 1 },
    ];

    const timing = simulateResearchQueueTiming({
      ...createTechState(),
      currentResearch: 'a',
      researchProgress: 0,
      researchQueue: ['b', 'c'],
    }, 1000, techs);

    expect(timing.get('a')).toEqual({ startTurns: 0, finishTurns: 1 });
    expect(timing.get('b')).toEqual({ startTurns: 1, finishTurns: 2 });
    expect(timing.get('c')).toEqual({ startTurns: 2, finishTurns: 3 });
  });

  it('returns the dependency path for a selected goal without including unrelated same-track techs', () => {
    const techState = {
      ...createTechState(),
      completed: ['gathering', 'pottery', 'fire', 'writing', 'philosophy'],
    };

    const view = buildTechProgressionView(techState, { selectedTechId: 'medicine' });

    expect(view.selectedPathIds).toEqual(new Set(['gathering', 'pottery', 'fire', 'writing', 'philosophy', 'medicine']));
    expect(view.selectedPathIds.has('astronomy')).toBe(false);
  });

  it('derives selected paths and queueability from an injected compact catalog', () => {
    const techs: Tech[] = [
      { id: 'pottery', name: 'Pottery', track: 'science', cost: 10, prerequisites: [], unlocks: [], era: 1 },
      { id: 'philosophy', name: 'Philosophy', track: 'science', cost: 20, prerequisites: ['pottery'], unlocks: [], era: 2 },
      { id: 'medicine', name: 'Medicine', track: 'science', cost: 30, prerequisites: ['philosophy'], unlocks: [], era: 3 },
    ];
    const state = { ...createTechState(), completed: ['pottery'] };

    const view = buildTechProgressionView(state, { techs, selectedTechId: 'medicine' });

    expect(view.nodesById.get('medicine')?.state).toBe('locked');
    expect(view.queueableIds.has('medicine')).toBe(false);
    expect(view.selectedPathIds).toEqual(new Set(['pottery', 'philosophy', 'medicine']));
  });

  // --- Phase 2: era cap ---

  it('Phase 2: fresh focus zoom has no visible nodes beyond era 2', () => {
    const view = buildTechProgressionView(createTechState(), { zoom: 'focus' });
    for (const node of view.nodes) {
      if (view.visibleIds.has(node.tech.id)) {
        expect(node.era).toBeLessThanOrEqual(2);
      }
    }
  });

  it('Phase 2: completing an era-2 tech exposes era-3 revealed nodes in focus zoom', () => {
    // bronze-working (era 2) → fortification (era 3) becomes revealed and era <= currentPlayerEra+1
    const techState = {
      ...createTechState(),
      completed: ['stone-weapons', 'bronze-working'],
    };
    const view = buildTechProgressionView(techState, { zoom: 'focus' });
    // currentPlayerEra = 2; era-3 revealed nodes must now be visible
    expect(view.visibleIds.has('fortification')).toBe(true);
    // No locked node with era > 3 should appear
    for (const node of view.nodes) {
      if (view.visibleIds.has(node.tech.id) && node.state === 'locked') {
        expect(node.era).toBeLessThanOrEqual(3);
      }
    }
  });

  it('Phase 2: focus zoom excludes locked nodes beyond era cap even when revealed', () => {
    // With currentPlayerEra=1, era-3 locked nodes must stay hidden in focus zoom
    const techState = createTechState();
    const view = buildTechProgressionView(techState, { zoom: 'focus' });
    // fortification is era 3 and should NOT be visible with no completed techs
    expect(view.visibleIds.has('fortification')).toBe(false);
  });

  it('rejects queue reorders that would place a tech before its prerequisite', () => {
    const techState = {
      ...createTechState(),
      currentResearch: 'fire',
      researchQueue: ['writing', 'mathematics'],
    };

    expect(canMoveQueuedResearch(techState, 1, 0)).toBe(false);
    expect(canMoveQueuedResearch(techState, 0, 1)).toBe(false);
    expect(canMoveQueuedResearch({
      ...createTechState(),
      currentResearch: 'fire',
      researchQueue: ['writing', 'wheel'],
    }, 0, 1)).toBe(true);
  });
});
