// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { getProductionIconForItem } from '@/systems/city-production-presentation';
import { makeWonderPanelFixture } from './helpers/wonder-panel-fixture';

const SHARED_WONDER_ICON = getProductionIconForItem('legendary:oracle-of-delphi');
const callbacks = { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} };

function arts(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('img[data-wonder-art]')).map(img => img.dataset.wonderArt!);
}

/** Follow-up rows only: the head of the queue is the "Producing" line, not a `data-queue-index` row. */
function followUpRow(panel: HTMLElement, index: number): HTMLElement {
  const row = panel.querySelector<HTMLElement>(`div[data-queue-index="${index}"]`);
  expect(row, `queue row ${index}`).toBeTruthy();
  return row!;
}

function producingLine(panel: HTMLElement): HTMLElement {
  return panel.querySelector<HTMLElement>('[data-text="prod-name"]')!.parentElement!;
}

describe('legendary wonder art in the city panel (#613)', () => {
  it('has a visible shared icon to compare against', () => { expect(SHARED_WONDER_ICON.length).toBeGreaterThan(0); });

  it('shows the art on the "Producing" line for an Era 5-7 wonder at the head of the queue', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = ['legendary:crystal-palace', 'library'];
    const panel = createCityPanel(container, city, state, callbacks);

    expect(arts(producingLine(panel))).toEqual(['crystal-palace']);
    expect(producingLine(panel).textContent).not.toContain(SHARED_WONDER_ICON);
    expect(arts(followUpRow(panel, 1))).toEqual([]);
  });

  it('shows the art on a follow-up queue row', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = ['library', 'legendary:crystal-palace'];
    const panel = createCityPanel(container, city, state, callbacks);

    expect(arts(followUpRow(panel, 1))).toEqual(['crystal-palace']);
    expect(arts(producingLine(panel))).toEqual([]);
  });

  it('keeps the shared emoji for a wonder without art', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = ['library', 'legendary:oracle-of-delphi'];
    const panel = createCityPanel(container, city, state, callbacks);

    expect(arts(panel)).toEqual([]);
    expect(followUpRow(panel, 1).textContent).toContain(SHARED_WONDER_ICON);
    expect(panel.querySelector('[data-wonder-thumb]')).toBeNull();
  });

  it('ignores unknown or malformed legendary queue ids without throwing or showing a broken image', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = ['legendary:not-a-wonder', 'legendary:', 'legendary:"><img src=x onerror=alert(1)>'];
    const panel = createCityPanel(container, city, state, callbacks);
    expect(arts(panel)).toEqual([]);
    expect(panel.querySelector('img[onerror]')).toBeNull();
  });

  it('keeps the art after the panel is rebuilt following queue changes (add, reorder, remove)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = ['library'];
    expect(arts(createCityPanel(container, city, state, callbacks))).toEqual([]);

    city.productionQueue = ['library', 'legendary:suez-canal'];
    expect(arts(followUpRow(createCityPanel(container, city, state, callbacks), 1))).toEqual(['suez-canal']);

    city.productionQueue = ['legendary:suez-canal', 'library'];
    expect(arts(producingLine(createCityPanel(container, city, state, callbacks)))).toEqual(['suez-canal']);

    city.productionQueue = ['library'];
    expect(arts(createCityPanel(container, city, state, callbacks))).toEqual([]);
  });

  it('every art-bearing queue entry gets its own image', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = ['legendary:iron-arsenal', 'legendary:palace-of-the-sun'];
    const panel = createCityPanel(container, city, state, callbacks);
    expect(arts(producingLine(panel))).toEqual(['iron-arsenal']);
    expect(arts(followUpRow(panel, 1))).toEqual(['palace-of-the-sun']);
  });
});
