// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { showVictoryPanel } from '@/ui/victory-panel';

describe('showVictoryPanel', () => {
  it('renders winner name, type, and turn via textContent', () => {
    const container = document.createElement('div');

    showVictoryPanel(container, {
      winnerName: 'Egypt',
      victoryType: 'Domination',
      turn: 42,
      onNewGame: () => {},
    });

    const panel = container.querySelector('#victory-panel');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain('Egypt');
    expect(panel!.textContent).toContain('Domination');
    expect(panel!.textContent).toContain('42');
  });

  it('removes existing panel before adding new one', () => {
    const container = document.createElement('div');
    showVictoryPanel(container, { winnerName: 'A', victoryType: 'Domination', turn: 1, onNewGame: () => {} });
    showVictoryPanel(container, { winnerName: 'B', victoryType: 'Domination', turn: 2, onNewGame: () => {} });
    expect(container.querySelectorAll('#victory-panel').length).toBe(1);
    expect(container.querySelector('#victory-panel')!.textContent).toContain('B');
  });

  it('calls onNewGame callback when New Game button is clicked', () => {
    const container = document.createElement('div');
    let called = false;
    showVictoryPanel(container, {
      winnerName: 'Rome',
      victoryType: 'Domination',
      turn: 10,
      onNewGame: () => { called = true; },
    });
    const btn = container.querySelector<HTMLButtonElement>('#victory-new-game-btn');
    expect(btn).not.toBeNull();
    btn!.click();
    expect(called).toBe(true);
  });

  it('XSS safe: script tag in winner name is not executed', () => {
    const container = document.createElement('div');
    showVictoryPanel(container, {
      winnerName: '<script>window.__xss=1</script>',
      victoryType: 'Domination',
      turn: 1,
      onNewGame: () => {},
    });
    expect((window as unknown as Record<string, unknown>).__xss).toBeUndefined();
    expect(container.querySelector('#victory-panel')!.textContent).toContain('<script>');
  });

  it('renders defeat instead of victory when every human is eliminated', () => {
    const container = document.createElement('div');
    showVictoryPanel(container, {
      winnerName: '',
      victoryType: 'Campaign Defeat',
      outcome: 'defeat',
      reason: 'all-humans-eliminated',
      turn: 12,
      onNewGame: () => {},
    });

    expect(container.textContent).toContain('Defeat');
    expect(container.textContent).toContain('No human civilizations remain');
    expect(container.textContent).not.toContain('Victory!');
  });

  it('identifies the conquering civilization when another actor wins', () => {
    const container = document.createElement('div');
    showVictoryPanel(container, {
      winnerName: 'Rome',
      victoryType: 'Domination',
      outcome: 'defeat',
      reason: 'domination',
      turn: 20,
      onNewGame: () => {},
    });

    expect(container.textContent).toContain('Defeat');
    expect(container.textContent).toContain('Rome');
  });
});
