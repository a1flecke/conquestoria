// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { recordAssessmentDigest } from '@/systems/assessment-history';
import { hexKey } from '@/systems/hex-utils';
import { createCouncilPanel } from '@/ui/council-panel';
import { HUMAN_A, HUMAN_B } from '../helpers/viewer-knowledge-fixtures';
import { twoCityWorld } from '../helpers/assessment-fixtures';

function starveSecondCity(state: GameState): void {
  state.cities['city-b-second'].population = 6;
  for (const coord of state.cities['city-b-second'].ownedTiles) state.map.tiles[hexKey(coord)].terrain = 'desert';
}

function open(state: GameState): HTMLElement {
  return createCouncilPanel(document.createElement('div'), state, { onClose: () => {}, onTalkLevelChange: () => {} });
}

const sinceSection = (panel: HTMLElement) => panel.querySelector<HTMLElement>('[data-section="since-last-turn"]');

describe('Council "Since your last turn" (#1238)', () => {
  it('is hidden on the first turn: no previous assessment, so nothing to compare', () => {
    const state = twoCityWorld(true);
    state.currentPlayer = HUMAN_A;

    expect(sinceSection(open(state))).toBeNull();
  });

  it('is hidden when nothing changed since the baseline', () => {
    const state = recordAssessmentDigest(twoCityWorld(true), HUMAN_A);
    state.currentPlayer = HUMAN_A;

    expect(sinceSection(open(state))).toBeNull();
  });

  it('shows the change above Do Now, with a plain label and the reason', () => {
    const state = recordAssessmentDigest(twoCityWorld(false), HUMAN_A);
    starveSecondCity(state);
    state.currentPlayer = HUMAN_A;

    const panel = open(state);
    const section = sinceSection(panel);

    expect(section).not.toBeNull();
    expect(section!.querySelector('h3')?.textContent).toBe('Since your last turn');
    expect(section!.textContent).toContain('New: Feed B-SECOND');
    expect(section!.textContent).toContain('so it cannot grow');
    // Above the Do Now bucket in document order.
    const headings = Array.from(panel.querySelectorAll('section')).map(s => s.querySelector('h3')?.textContent);
    expect(headings.indexOf('Since your last turn')).toBeLessThan(headings.indexOf('Do Now'));
  });

  it('shows at most three changes', () => {
    const state = recordAssessmentDigest(twoCityWorld(false), HUMAN_A);
    starveSecondCity(state);
    state.cities['city-a-first'].unrestLevel = 2;
    state.cities['city-a-first'].unrestTurns = 1;
    state.civilizations[HUMAN_A].techState.currentResearch = null;
    state.economyStatusByCiv = {
      ...state.economyStatusByCiv,
      [HUMAN_A]: {
        turn: state.turn, grossGoldIncome: 1, buildingMaintenance: 4, unitMaintenance: 4,
        netGoldPerTurn: -7, unpaidMaintenance: 7, strainLevel: 'critical',
      },
    };
    state.currentPlayer = HUMAN_A;

    const items = sinceSection(open(state))!.querySelectorAll('article');

    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(3);
  });

  it('hot seat: the section follows state.currentPlayer, and one seat\'s digest never reaches another', () => {
    const state = recordAssessmentDigest(twoCityWorld(false), HUMAN_A);
    starveSecondCity(state);

    state.currentPlayer = HUMAN_B;
    expect(sinceSection(open(state))).toBeNull();

    state.currentPlayer = HUMAN_A;
    expect(sinceSection(open(state))).not.toBeNull();
  });

  it('renders game-supplied text as text, never as markup', () => {
    const state = recordAssessmentDigest(twoCityWorld(false), HUMAN_A);
    state.cities['city-b-second'].name = '<img src=x onerror="alert(1)">';
    starveSecondCity(state);
    state.currentPlayer = HUMAN_A;

    const section = sinceSection(open(state))!;

    expect(section.querySelector('img')).toBeNull();
    expect(section.textContent).toContain('<img src=x');
  });

  it('shows the same section every time the Council is opened within a turn (opening never consumes it)', () => {
    const state = recordAssessmentDigest(twoCityWorld(false), HUMAN_A);
    starveSecondCity(state);
    state.currentPlayer = HUMAN_A;

    const first = sinceSection(open(state))!.textContent;
    const second = sinceSection(open(state))!.textContent;

    expect(second).toBe(first);
    expect(first).not.toBe('');
  });
});
