import { describe, expect, it } from 'vitest';
import { createTechState, TECH_TREE } from '@/systems/tech-system';
import {
  buildTechProgressionView,
  getDerivedTechTracks,
  getQueueableResearchIds,
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

  it('returns the dependency path for a selected goal without including unrelated same-track techs', () => {
    const techState = {
      ...createTechState(),
      completed: ['gathering', 'pottery', 'fire', 'writing', 'philosophy'],
    };

    const view = buildTechProgressionView(techState, { selectedTechId: 'medicine' });

    expect(view.selectedPathIds).toEqual(new Set(['pottery', 'philosophy', 'medicine']));
    expect(view.selectedPathIds.has('astronomy')).toBe(false);
  });
});
