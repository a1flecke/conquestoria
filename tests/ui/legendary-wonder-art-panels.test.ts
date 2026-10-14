// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { appendProjectCard } from '@/ui/wonder-panel-view';
import { createWonderCodexPage } from '@/ui/wonder-codex-page';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import type { WonderCodexPageViewModel } from '@/systems/wonder-codex/presentation';
import { makeWonderPresentationEntry } from './helpers/wonder-panel-fixture';

function card(wonderId: string, name: string, mode: 'recommended' | 'compact'): HTMLElement {
  const grid = document.createElement('div');
  appendProjectCard(makeWonderPresentationEntry({ wonderId, queueItemId: `legendary:${wonderId}`, name }), grid, () => {}, mode);
  return grid.querySelector<HTMLElement>(`[data-project-card="${wonderId}"]`)!;
}

describe('legendary wonder art in the wonder panel (#613)', () => {
  it.each(['recommended', 'compact'] as const)('puts the art beside the title of an Era 5-7 wonder (%s card)', mode => {
    const article = card('merchant-admiralty', 'Merchant Admiralty', mode);
    const title = article.querySelector('h4')!;
    expect(title.querySelectorAll('img[data-wonder-art="merchant-admiralty"]')).toHaveLength(1);
    expect(title.textContent).toContain('Merchant Admiralty');
    expect(title.querySelector('img')!.getAttribute('aria-hidden')).toBe('true');
  });

  it.each(['recommended', 'compact'] as const)('leaves a wonder without art exactly as before (%s card)', mode => {
    const article = card('oracle-of-delphi', 'Oracle of Delphi', mode);
    expect(article.querySelector('img')).toBeNull();
    expect(article.querySelector('h4')!.textContent).toBe(`${mode === 'recommended' ? '🏛️ ' : ''}Oracle of Delphi`);
  });
});

function codexPage(overrides: Partial<WonderCodexPageViewModel>): WonderCodexPageViewModel {
  return {
    id: 'continental-congress',
    kind: 'legendary',
    title: 'Continental Congress',
    subtitle: 'A hall where a young republic argues itself into being.',
    stateLabel: 'Available',
    visual: getWonderVisualDefinition('continental-congress'),
    authoredLead: 'Lead.',
    learningText: 'Learning.',
    image: {
      src: '/images/wonders/codex/archive.jpg',
      alt: 'Source image',
      attribution: 'Someone / CC BY-SA 3.0',
      sourceUrl: 'https://example.org/source',
      license: 'CC BY-SA 3.0',
    },
    statusLines: [],
    sections: [],
    relatedEntries: [],
    actions: [],
    ...overrides,
  } as WonderCodexPageViewModel;
}

describe('legendary wonder art in the Codex (#613)', () => {
  it('adds the game art to an Era 5-7 legendary page and keeps the credited source photo', () => {
    const root = createWonderCodexPage(codexPage({}), { reducedMotion: true } as never);
    expect(root.querySelectorAll('img[data-wonder-art="continental-congress"]')).toHaveLength(1);
    expect(root.querySelector('a[href="https://example.org/source"]')?.textContent).toContain('CC BY-SA 3.0');
    expect(root.querySelector('img[src="/images/wonders/codex/archive.jpg"]')).not.toBeNull();
  });

  it('adds nothing to a legendary page without art or to a natural-wonder page', () => {
    const noArt = createWonderCodexPage(codexPage({ id: 'oracle-of-delphi', title: 'Oracle of Delphi' }), { reducedMotion: true } as never);
    expect(noArt.querySelector('img[data-wonder-art]')).toBeNull();
    const natural = createWonderCodexPage(codexPage({ id: 'crystal-palace', kind: 'natural' }), { reducedMotion: true } as never);
    expect(natural.querySelector('img[data-wonder-art]')).toBeNull();
  });
});
