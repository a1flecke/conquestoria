// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHallOfFamePanel } from '@/ui/hall-of-fame-panel';
import type { HallOfFameEntry } from '@/systems/great-general-hall-of-fame';

function makeEntry(over: Partial<HallOfFameEntry> = {}): HallOfFameEntry {
  return {
    generalDefinitionId: 'gen_caesar',
    name: 'Julius Caesar',
    portraitIcon: '🦅',
    era: 2,
    descriptor: 'Dictator of Rome.',
    status: 'fallen',
    stats: {
      generalDefinitionId: 'gen_caesar', spawnedTurn: 4, lastActiveTurn: 20, status: 'fallen',
      careerTurns: 16, battlesInfluenced: 3, citiesCaptured: 2, uniqueCitiesDefended: 1,
      cityDefenseActions: 4, unitsSaved: 2, rallyUses: 1, seizeUses: 0, lastStandUses: 1, finalCommandUsed: true,
    },
    statLine: '2 cities captured, 1 city defended, 2 units saved, 3 battles influenced.',
    specialtyLine: 'Vanguard — presses the attack, weaker on defence',
    profile: { kind: 'historical', summary: 'A Roman general and statesman.', facts: ['Crossed the Rubicon.'], context: 'Late Republic.' },
    bookendStart: 'Turn 4 — took command',
    bookendEnd: 'Turn 20 — fell in battle',
    moments: [
      { turn: 10, text: 'captured Thebes' },
      { turn: 14, text: 'defended Memphis' },
      { turn: 20, text: 'gave their final command' },
    ],
    ...over,
  };
}

describe('hall of fame panel', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders one <details> card per entry with no truncation', () => {
    const entries = [makeEntry({ generalDefinitionId: 'a', name: 'A' }), makeEntry({ generalDefinitionId: 'b', name: 'B' }), makeEntry({ generalDefinitionId: 'c', name: 'C' })];
    createHallOfFamePanel(container, entries, { onClose: () => {} });
    expect(container.querySelectorAll('[data-hall-of-fame-entry]')).toHaveLength(3);
  });

  it('keeps the collapsed summary to identity only (icon, name, era, status) — deed summary is in the body', () => {
    createHallOfFamePanel(container, [makeEntry()], { onClose: () => {} });
    const summary = container.querySelector('[data-hall-of-fame-entry] summary')!;
    expect(summary.textContent).toBe('🦅 Julius Caesar · Era 2 · Fallen');
    // the stat line still appears, but in the card body (visible once expanded), not the summary
    expect(summary.textContent).not.toContain('2 cities captured');
    const card = container.querySelector('[data-hall-of-fame-entry]')!;
    expect(card.textContent).toContain('2 cities captured, 1 city defended, 2 units saved, 3 battles influenced.');
  });

  it('keeps the native disclosure marker so a collapsed card reads as expandable', () => {
    createHallOfFamePanel(container, [makeEntry({ status: 'retired' })], { onClose: () => {} });
    const summary = container.querySelector<HTMLElement>('[data-hall-of-fame-entry] summary')!;
    expect(summary.style.listStyle).toBe('');
    expect(summary.style.cssText).not.toContain('list-style');
  });

  it('opens the active General card and leaves an ended one collapsed', () => {
    const [active, ended] = [makeEntry({ generalDefinitionId: 'x', status: 'active', bookendEnd: undefined }), makeEntry({ generalDefinitionId: 'y', status: 'retired' })];
    createHallOfFamePanel(container, [active, ended], { onClose: () => {} });
    const cards = container.querySelectorAll<HTMLDetailsElement>('[data-hall-of-fame-entry]');
    expect(cards[0].open).toBe(true);
    expect(cards[1].open).toBe(false);
  });

  it('shows no dangling separator for a General with no recorded deeds (any status)', () => {
    createHallOfFamePanel(container, [makeEntry({ status: 'retired', statLine: '', profile: undefined })], { onClose: () => {} });
    const summary = container.querySelector('[data-hall-of-fame-entry] summary')!;
    expect(summary.textContent).toBe('🦅 Julius Caesar · Era 2 · Retired');
    expect(summary.textContent).not.toContain('yet');
    expect(summary.textContent).not.toMatch(/[—-]\s*$/);
  });

  it('renders the timeline chronologically between the two bookends', () => {
    createHallOfFamePanel(container, [makeEntry()], { onClose: () => {} });
    const body = container.querySelector('[data-hall-of-fame-entry]')!.textContent!;
    const iStart = body.indexOf('Turn 4 — took command');
    const iT10 = body.indexOf('Turn 10 — captured Thebes');
    const iT14 = body.indexOf('Turn 14 — defended Memphis');
    const iEnd = body.indexOf('Turn 20 — fell in battle');
    expect(iStart).toBeGreaterThanOrEqual(0);
    expect(iStart).toBeLessThan(iT10);
    expect(iT10).toBeLessThan(iT14);
    expect(iT14).toBeLessThan(iEnd);
  });

  it('renders every stat number including zeros and uses uniqueCitiesDefended', () => {
    createHallOfFamePanel(container, [makeEntry()], { onClose: () => {} });
    const text = container.querySelector('[data-hall-of-fame-entry]')!.textContent!;
    expect(text).toContain('Cities defended 1');   // uniqueCitiesDefended, not cityDefenseActions (4)
    expect(text).toContain('Seize');               // the Rally/Seize/Last Stand triplet label
    expect(text).toContain('1/0/1');               // seizeUses is 0 and must still be shown
  });

  it('shows the empty-state message and no cards for an empty roster', () => {
    createHallOfFamePanel(container, [], { onClose: () => {} });
    expect(container.querySelectorAll('[data-hall-of-fame-entry]')).toHaveLength(0);
    expect(container.textContent).toContain('No Great Generals have served yet');
  });

  it('close button removes the panel and calls onClose; a second call replaces rather than duplicates', () => {
    let closed = 0;
    createHallOfFamePanel(container, [makeEntry()], { onClose: () => { closed += 1; } });
    createHallOfFamePanel(container, [makeEntry()], { onClose: () => { closed += 1; } });
    expect(container.querySelectorAll('#hall-of-fame-panel')).toHaveLength(1);
    container.querySelector<HTMLButtonElement>('#hall-of-fame-panel [data-action="close"]')!.click();
    expect(container.querySelector('#hall-of-fame-panel')).toBeNull();
    expect(closed).toBe(1);
  });

  it('renders a name containing markup as literal text', () => {
    createHallOfFamePanel(container, [makeEntry({ name: '<b>Nero</b>' })], { onClose: () => {} });
    expect(container.querySelector('#hall-of-fame-panel b')).toBeNull();
    expect(container.textContent).toContain('<b>Nero</b>');
  });

  it('the panel module imports no GameState', () => {
    const src = readFileSync('src/ui/hall-of-fame-panel.ts', 'utf8');
    expect(src).not.toMatch(/\bGameState\b/);
  });
});
