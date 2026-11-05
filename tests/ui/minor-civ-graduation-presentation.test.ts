// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { GameEvents, GameState } from '@/core/types';
import { getGraduateCivId, graduateMinorCiv } from '@/systems/minor-civ-graduation-conversion';
import { routeMinorCivGraduated } from '@/ui/notification-routes/world-routes';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { ripeGraduationState } from '../helpers/graduation-fixture';

/** #497 PR 6: only a civilization that had discovered the city-state is told, or shown, where the graduate came from. */

function explore(state: GameState, minorCivId: string, civId: string, explored: boolean): void {
  const position = state.cities[state.minorCivs[minorCivId]!.cityId]!.position;
  const key = `${position.q},${position.r}`;
  if (explored) state.civilizations[civId]!.visibility.tiles[key] = 'fog';
  else delete state.civilizations[civId]!.visibility.tiles[key];
}

function graduate() {
  const { state, minorCivId } = ripeGraduationState('graduation-presentation');
  explore(state, minorCivId, 'player', true);
  explore(state, minorCivId, 'ai-1', false);
  const civId = getGraduateCivId(state.minorCivs[minorCivId]!.definitionId);
  const result = graduateMinorCiv(state, minorCivId);
  if (!result.ok) throw new Error(`graduation refused: ${result.reason}`);
  const event: GameEvents['minor-civ:graduated'] = {
    minorCivId,
    civId,
    definitionId: result.transition.definitionId,
    turn: result.transition.turn,
    discovererCivIds: result.transition.discovererCivIds,
  };
  return { state: result.state, civId, event };
}

describe('graduation notification route', () => {
  it('records exactly the discoverers on the transition and on the civilization', () => {
    const { state, civId, event } = graduate();
    expect(event.discovererCivIds).toEqual(['player']);
    expect(state.civilizations[civId]!.graduatedFrom!.knownBy).toEqual(['player']);
  });

  it('tells a discoverer once, with the new name and a map target, and tells nobody else', () => {
    const { state, civId, event } = graduate();
    const sent: Array<{ civId: string; message: string; target?: { kind: string; label: string } }> = [];
    routeMinorCivGraduated(state, event, (recipient, message, _type, target) => sent.push({ civId: recipient, message, target }));

    expect(sent).toHaveLength(1);
    expect(sent[0]!.civId).toBe('player');
    expect(sent[0]!.message).toContain(state.civilizations[civId]!.name);
    expect(sent[0]!.target).toMatchObject({ kind: 'map', label: state.civilizations[civId]!.name });
  });

  it('sends nothing at all when nobody had discovered the city-state', () => {
    const { state, event } = graduate();
    const sent: string[] = [];
    routeMinorCivGraduated(state, { ...event, discovererCivIds: [] }, recipient => sent.push(recipient));
    expect(sent).toEqual([]);
  });

  it('never tells the graduate itself or an unknown civilization', () => {
    const { state, civId, event } = graduate();
    const sent: string[] = [];
    routeMinorCivGraduated(state, { ...event, discovererCivIds: [civId, 'ghost'] }, recipient => sent.push(recipient));
    expect(sent).toEqual([]);
  });
});

describe('graduation diplomacy panel row', () => {
  function panelText(state: GameState, viewer: string): string {
    const container = document.createElement('div');
    const panel = createDiplomacyPanel(container, { ...state, currentPlayer: viewer }, { onAction: () => {}, onClose: () => {} });
    return panel.textContent ?? '';
  }

  it('shows "Formerly a city-state" to a discoverer', () => {
    const { state, civId } = graduate();
    expect(state.civilizations.player!.knownCivilizations).toContain(civId);
    expect(panelText(state, 'player')).toContain('Formerly a city-state');
  });

  it('does not show it to a civilization that met the graduate later but had not discovered the city-state', () => {
    const { state, civId } = graduate();
    state.civilizations['ai-1']!.knownCivilizations = [...(state.civilizations['ai-1']!.knownCivilizations ?? []), civId];
    state.civilizations[civId]!.knownCivilizations = [...(state.civilizations[civId]!.knownCivilizations ?? []), 'ai-1'];
    const text = panelText(state, 'ai-1');
    expect(text).toContain(state.civilizations[civId]!.name);
    expect(text).not.toContain('Formerly a city-state');
  });

  it('shows no row for a save written before the knownBy field existed', () => {
    const { state, civId } = graduate();
    delete state.civilizations[civId]!.graduatedFrom!.knownBy;
    expect(panelText(state, 'player')).not.toContain('Formerly a city-state');
  });
});
