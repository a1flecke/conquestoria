// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldRaceConclusionMomentItem } from '@/systems/world-race-presentation';
import { createWorldRaceConclusionCeremony } from '@/ui/world-race-conclusion-ceremony';

function item(overrides: Partial<WorldRaceConclusionMomentItem> = {}): WorldRaceConclusionMomentItem {
  return {
    kind: 'first-satellite',
    displayName: 'First Satellite',
    turn: 42,
    won: false,
    winnerName: null,
    rewardSummary: 'National prestige and a wave of new trade contracts follow the launch.',
    ...overrides,
  };
}

describe('world-race-conclusion-ceremony', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows a victory headline and the reward summary when the viewer won', () => {
    createWorldRaceConclusionCeremony(document.body, item({ won: true, winnerName: 'player' }), { onResolve: () => {} });

    expect(document.body.textContent).toContain('Your empire won the First Satellite race!');
    expect(document.body.textContent).toContain('National prestige');
  });

  it('names the winner without a reward summary when a known rival won', () => {
    createWorldRaceConclusionCeremony(document.body, item({ won: false, winnerName: 'Rome' }), { onResolve: () => {} });

    expect(document.body.textContent).toContain('Rome won the First Satellite race.');
    expect(document.body.textContent).not.toContain('National prestige');
  });

  it('never names an unmet winner -- shows the redacted phrasing instead', () => {
    createWorldRaceConclusionCeremony(document.body, item({ won: false, winnerName: null }), { onResolve: () => {} });

    expect(document.body.textContent).toContain('A civilization you have not yet met has won the First Satellite race.');
  });

  it('resolves exactly once when Continue is clicked', () => {
    const onResolve = vi.fn();
    createWorldRaceConclusionCeremony(document.body, item(), { onResolve });

    const button = document.querySelector<HTMLButtonElement>('[data-world-race-conclusion-action="continue"]');
    expect(button).toBeTruthy();
    button!.click();
    button!.click();

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#world-race-conclusion-ceremony')).toBeNull();
  });

  it('resolves on Escape', () => {
    const onResolve = vi.fn();
    const overlay = createWorldRaceConclusionCeremony(document.body, item(), { onResolve });

    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('replaces an existing ceremony rather than stacking a second one', () => {
    createWorldRaceConclusionCeremony(document.body, item(), { onResolve: () => {} });
    createWorldRaceConclusionCeremony(document.body, item({ won: true, winnerName: 'player' }), { onResolve: () => {} });

    expect(document.querySelectorAll('#world-race-conclusion-ceremony')).toHaveLength(1);
    expect(document.body.textContent).toContain('Your empire won');
  });
});
