// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { createBestiaryPanel } from '@/ui/bestiary-panel';
import type { BestiaryEntry } from '@/systems/beast-presentation';

const unknownEntry: BestiaryEntry = {
  lairId: 'lair-giant_boar', status: 'unknown',
  hint: 'Trees splinter and the ground is churned in the deep woods. Something heavy lives there.',
};
const sightedEntry: BestiaryEntry = {
  ...unknownEntry, status: 'sighted', name: 'Giant Boar', unitType: 'beast_boar', tier: 1,
  sightingFlavor: 'Your scouts lay eyes on the Giant Boar — a beast of legend!',
};
const slainEntry: BestiaryEntry = {
  ...sightedEntry, status: 'slain', slainBy: 'player', slainTurn: 22,
};

describe('bestiary panel', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders unknown entries with hint only — never the name (negative privacy test)', () => {
    createBestiaryPanel(container, [unknownEntry], { onClose: () => {}, slayerNameFor: () => '' });
    const panel = container.querySelector('#bestiary-panel')!;
    expect(panel.textContent).toContain('Something heavy lives there');
    expect(panel.textContent).not.toContain('Giant Boar');
    expect(panel.textContent).not.toContain('forest'); // habitat must not leak via labels
  });

  it('renders sighted entries with name and tier', () => {
    createBestiaryPanel(container, [sightedEntry], { onClose: () => {}, slayerNameFor: () => '' });
    const panel = container.querySelector('#bestiary-panel')!;
    expect(panel.textContent).toContain('Giant Boar');
    expect(panel.textContent).toContain('Sighted');
  });

  it('renders slain entries with slayer credit and turn', () => {
    createBestiaryPanel(container, [slainEntry], { onClose: () => {}, slayerNameFor: () => 'Rome' });
    const panel = container.querySelector('#bestiary-panel')!;
    expect(panel.textContent).toContain('Slain');
    expect(panel.textContent).toContain('Rome');
    expect(panel.textContent).toContain('22');
  });

  it('close button removes the panel; reopening never duplicates', () => {
    let closed = 0;
    createBestiaryPanel(container, [unknownEntry], { onClose: () => { closed++; }, slayerNameFor: () => '' });
    createBestiaryPanel(container, [unknownEntry], { onClose: () => { closed++; }, slayerNameFor: () => '' });
    expect(container.querySelectorAll('#bestiary-panel')).toHaveLength(1);
    (container.querySelector('#bestiary-panel button[data-action="close"]') as HTMLButtonElement).click();
    expect(container.querySelector('#bestiary-panel')).toBeNull();
    expect(closed).toBe(1);
  });

  it('lists every provided entry (catalog completeness)', () => {
    createBestiaryPanel(container, [unknownEntry, sightedEntry], { onClose: () => {}, slayerNameFor: () => '' });
    expect(container.querySelectorAll('#bestiary-panel [data-bestiary-entry]')).toHaveLength(2);
  });
});
