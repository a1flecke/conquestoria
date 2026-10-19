// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { TECH_TREE } from '@/systems/tech-definitions';
import { derivePalette } from '@/renderer/sprites/sprite-system';
import { BUILDING_ART_IDS } from '@/renderer/buildings/building-art-catalog';
import { getProductionItemIconHtml } from '@/ui/city-panel-building-icon';
import { makeWonderPanelFixture } from './helpers/wonder-panel-fixture';

// #620: the production chooser, the "Producing" line and the queue show a building's art, not its emoji.

function panelWithArtAvailable() {
  const fixture = makeWonderPanelFixture();
  fixture.state.civilizations.player.techState.completed = TECH_TREE
    .filter(tech => tech.era <= 4 && tech.countsForEraAdvancement !== false)
    .map(tech => tech.id);
  fixture.city.buildings = [];
  fixture.city.productionQueue = [];
  return fixture;
}

describe('production item icons for buildings with art (#620)', () => {
  it('shows the art with the owner banner in the build chooser, and the emoji for a building without art', () => {
    const { container, city, state } = panelWithArtAvailable();
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });

    const chooserRows = Array.from(panel.querySelectorAll<HTMLElement>('.build-item'));
    const withArt = chooserRows.filter(row => BUILDING_ART_IDS.includes(row.dataset.itemId ?? ''));
    expect(withArt.length, 'no building with art is offered in this fixture').toBeGreaterThan(0);
    for (const row of withArt) {
      const icon = row.querySelector<HTMLElement>(`[data-building-art="${row.dataset.itemId}"]`);
      expect(icon, `${row.dataset.itemId} chooser row`).toBeTruthy();
      expect(icon!.getAttribute('aria-hidden')).toBe('true');
      expect(icon!.innerHTML).toContain(`images/buildings/art/${row.dataset.itemId}.png`);
      expect(icon!.innerHTML).toContain(derivePalette(state.civilizations.player.color).mid);
    }
    const withoutArt = chooserRows.filter(row => !BUILDING_ART_IDS.includes(row.dataset.itemId ?? ''));
    expect(withoutArt.length).toBeGreaterThan(0);
    for (const row of withoutArt) expect(row.querySelector('[data-building-art]'), `${row.dataset.itemId} must keep its emoji`).toBeNull();
  });

  it('shows the art on the Producing line and in every queue row, keeping the name next to it', () => {
    const { container, city, state } = panelWithArtAvailable();
    const artId = 'royal_mint';
    city.productionQueue = [artId, 'granary', artId];
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });

    const producing = Array.from(panel.querySelectorAll<HTMLElement>('div')).find(div => div.textContent?.startsWith('Producing:'));
    expect(producing?.querySelector(`[data-building-art="${artId}"]`)).toBeTruthy();
    expect(producing?.textContent).toContain('Royal Mint');

    const rows = Array.from(panel.querySelectorAll<HTMLElement>('div[data-queue-index]')); // the row, not its remove/move buttons
    expect(rows.length).toBeGreaterThan(0);
    const byIndex = new Map(rows.map(row => [row.dataset.queueIndex, row]));
    expect(byIndex.get('1')?.querySelector('[data-building-art]')).toBeNull(); // granary has no art
    expect(byIndex.get('2')?.querySelector(`[data-building-art="${artId}"]`)).toBeTruthy();
  });
});

describe('getProductionItemIconHtml', () => {
  const palette = derivePalette('#c0392b');

  it('is the art for a building with art and the unchanged production icon for everything else', () => {
    expect(getProductionItemIconHtml('royal_mint', palette)).toContain('data-building-art="royal_mint"');
    expect(getProductionItemIconHtml('granary', palette)).not.toContain('data-building-art');
    expect(getProductionItemIconHtml('legendary:not-a-wonder', palette)).not.toContain('<svg');
  });

  it('draws the owner colour on the banner and nothing else', () => {
    const red = getProductionItemIconHtml('royal_mint', derivePalette('#c0392b'));
    const blue = getProductionItemIconHtml('royal_mint', derivePalette('#2980b9'));
    expect(red).not.toBe(blue);
    expect(red).toContain(derivePalette('#c0392b').mid);
    expect(blue).toContain(derivePalette('#2980b9').mid);
  });
});
