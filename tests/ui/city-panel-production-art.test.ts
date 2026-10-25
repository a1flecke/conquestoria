// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { TECH_TREE } from '@/systems/tech-definitions';
import { derivePalette } from '@/renderer/sprites/sprite-system';
import { BUILDING_ART_IDS } from '@/renderer/buildings/building-art-catalog';
import { getPngUnitManifest } from '@/renderer/sprites/png/png-sprite-catalog';
import { getProductionItemIconHtml } from '@/ui/city-panel-building-icon';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { makeWonderPanelFixture } from './helpers/wonder-panel-fixture';

// #620 / #1535: every production list in the city panel shows a building's art or a unit's real sprite, not its emoji.

const noopCallbacks = { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} };

// `maxEra` limits which techs the fixture unlocks, and so how many rows the chooser renders. The default keeps the panel small
// enough for the unit-row test to stay well inside the 5 s test timeout on a slow runner; only the building chooser test widens it.
function panelFixture(maxEra = 4) {
  const fixture = makeWonderPanelFixture();
  fixture.state.civilizations.player.techState.completed = TECH_TREE
    .filter(tech => tech.era <= maxEra && tech.countsForEraAdvancement !== false)
    .map(tech => tech.id);
  fixture.city.buildings = [];
  fixture.city.productionQueue = [];
  return fixture;
}

function owner(color: string) {
  return { palette: derivePalette(color), color };
}

const unitIconKind = (type: string) => (getPngUnitManifest(type) ? 'png' : 'svg');

describe('production item icons for buildings with art (#620)', () => {
  it('shows the art with the owner banner in the build chooser, and the emoji for a building without art', () => {
    // Every era: each art group repaints the early buildings, and this test needs a building that still has no art to prove the
    // emoji fallback. An era <= 4 fixture went stale when #1547 painted the last of them.
    const { container, city, state } = panelFixture(Number.POSITIVE_INFINITY);
    const panel = createCityPanel(container, city, state, noopCallbacks);

    const buildingRows = Array.from(panel.querySelectorAll<HTMLElement>('.build-item'))
      .filter(row => !TRAINABLE_UNITS.some(unit => unit.type === row.dataset.itemId));
    const withArt = buildingRows.filter(row => BUILDING_ART_IDS.includes(row.dataset.itemId ?? ''));
    expect(withArt.length, 'no building with art is offered in this fixture').toBeGreaterThan(0);
    for (const row of withArt) {
      const icon = row.querySelector<HTMLElement>(`[data-building-art="${row.dataset.itemId}"]`);
      expect(icon, `${row.dataset.itemId} chooser row`).toBeTruthy();
      expect(icon!.getAttribute('aria-hidden')).toBe('true');
      expect(icon!.innerHTML).toContain(`images/buildings/art/${row.dataset.itemId}.png`);
      expect(icon!.innerHTML).toContain(derivePalette(state.civilizations.player.color).mid);
    }
    const withoutArt = buildingRows.filter(row => !BUILDING_ART_IDS.includes(row.dataset.itemId ?? ''));
    expect(withoutArt.length).toBeGreaterThan(0);
    for (const row of withoutArt) expect(row.querySelector('[data-building-art]'), `${row.dataset.itemId} must keep its emoji`).toBeNull();
  });

  it('shows the art on the Producing line and in every queue row, keeping the name next to it', () => {
    const { container, city, state } = panelFixture();
    const artId = 'royal_mint';
    city.productionQueue = [artId, 'modular_arcology', artId];
    const panel = createCityPanel(container, city, state, noopCallbacks);

    const producing = Array.from(panel.querySelectorAll<HTMLElement>('div')).find(div => div.textContent?.startsWith('Producing:'));
    expect(producing?.querySelector(`[data-building-art="${artId}"]`)).toBeTruthy();
    expect(producing?.textContent).toContain('Royal Mint');

    const rows = Array.from(panel.querySelectorAll<HTMLElement>('div[data-queue-index]')); // the row, not its remove/move buttons
    expect(rows.length).toBeGreaterThan(0);
    const byIndex = new Map(rows.map(row => [row.dataset.queueIndex, row]));
    expect(byIndex.get('1')?.querySelector('[data-building-art]')).toBeNull(); // modular_arcology has no art
    expect(byIndex.get('2')?.querySelector(`[data-building-art="${artId}"]`)).toBeTruthy();
  });
});

describe('unit rows in the production chooser (#1535)', () => {
  it('shows every offered unit as its sprite (SVG or PNG idle frame) with the name, cost and click behaviour intact', () => {
    const { container, city, state } = panelFixture();
    const onBuild = vi.fn();
    const panel = createCityPanel(container, city, state, { ...noopCallbacks, onBuild });

    const unitRows = Array.from(panel.querySelectorAll<HTMLElement>('.build-item'))
      .filter(row => TRAINABLE_UNITS.some(unit => unit.type === row.dataset.itemId));
    expect(unitRows.length, 'no unit is offered in this fixture').toBeGreaterThan(3);
    const kinds = new Set<string>();
    for (const row of unitRows) {
      const type = row.dataset.itemId!;
      const icon = row.querySelector<HTMLElement>(`[data-unit-art="${type}"]`);
      expect(icon, `${type} chooser row has no sprite`).toBeTruthy();
      expect(icon!.dataset.unitArtKind, type).toBe(unitIconKind(type));
      expect(icon!.getAttribute('aria-hidden')).toBe('true');
      expect(row.textContent, `${type} lost its cost line`).toContain('Cost:');
      expect(row.tagName, `${type} is still a real button`).toBe('BUTTON');
      kinds.add(icon!.dataset.unitArtKind!);
    }
    expect(kinds.has('svg')).toBe(true);

    // The sprite is inside the button, so activating it still queues the unit.
    const first = unitRows[0]!;
    first.querySelector<HTMLElement>('[data-unit-art]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onBuild).toHaveBeenCalledWith(city.id, first.dataset.itemId);
  });

  it('gives each rendered SVG unit icon ids of its own, so two icons never share a gradient or pattern id', () => {
    const { container, city, state } = panelFixture();
    const panel = createCityPanel(container, city, state, noopCallbacks);
    const ids = Array.from(panel.querySelectorAll('[data-unit-art-kind="svg"] [id]')).map(el => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows a unit on the Producing line and in the queue', () => {
    const { container, city, state } = panelFixture();
    city.productionQueue = ['warrior', 'archer'];
    const panel = createCityPanel(container, city, state, noopCallbacks);
    const producing = Array.from(panel.querySelectorAll<HTMLElement>('div')).find(div => div.textContent?.startsWith('Producing:'));
    expect(producing?.querySelector('[data-unit-art="warrior"]')).toBeTruthy();
    const queueRow = panel.querySelector<HTMLElement>('div[data-queue-index="1"]');
    expect(queueRow?.querySelector('[data-unit-art="archer"]')).toBeTruthy();
  });
});

describe('hot seat: icons wear the colour of the city owner (#1535)', () => {
  it('draws every production icon in the owning civ colour, whichever seat is looking', () => {
    const { container, city, state } = panelFixture();
    const rivalId = 'rival';
    state.civilizations[rivalId] = {
      ...state.civilizations.player,
      id: rivalId,
      color: '#27ae60',
      cities: [city.id],
    };
    state.civilizations.player.cities = [];
    city.owner = rivalId;
    state.currentPlayer = rivalId;
    city.productionQueue = ['royal_mint', 'warrior'];

    const panel = createCityPanel(container, city, state, noopCallbacks);
    const rival = derivePalette('#27ae60').mid;
    const original = derivePalette(state.civilizations.player.color).mid;
    const buildingIcon = panel.querySelector<HTMLElement>('[data-building-art="royal_mint"]');
    const unitIcon = panel.querySelector<HTMLElement>('[data-unit-art="warrior"]');
    expect(buildingIcon?.innerHTML).toContain(rival);
    expect(unitIcon?.innerHTML).toContain(rival);
    for (const icon of Array.from(panel.querySelectorAll<HTMLElement>('[data-building-art], [data-unit-art-kind="svg"]'))) {
      expect(icon.innerHTML, 'an icon wore the other seat colour').not.toContain(original);
    }
  });
});

describe('locked-items list (#1535)', () => {
  function lockedPanel() {
    const fixture = panelFixture();
    // Era 5 techs are done but no building is: Apothecary House (art) needs a Herbalist, so it is listed as locked.
    fixture.state.civilizations.player.techState.completed = TECH_TREE
      .filter(tech => tech.era <= 5 && tech.countsForEraAdvancement !== false)
      .map(tech => tech.id);
    const panel = createCityPanel(fixture.container, fixture.city, fixture.state, noopCallbacks);
    return { ...fixture, panel };
  }

  it('keeps the lock marker, the name and the reason on every locked row, now with the item art', () => {
    const { panel } = lockedPanel();
    const section = panel.querySelector<HTMLElement>('[data-section="locked-items"]');
    expect(section, 'this fixture has no locked items').toBeTruthy();
    const rows = Array.from(section!.children).filter(el => el.querySelector('[data-locked-name]')) as HTMLElement[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.textContent).toContain('🔒');
      expect(row.style.opacity).toBe('0.5');
      const id = row.querySelector<HTMLElement>('[data-locked-name]')!.dataset.lockedName!;
      expect(row.querySelector('[data-locked-reason]'), `${id} lost its reason`).toBeTruthy();
      const isUnit = TRAINABLE_UNITS.some(unit => unit.type === id);
      if (isUnit) expect(row.querySelector(`[data-unit-art="${id}"]`), `${id} locked unit row`).toBeTruthy();
      else if (BUILDING_ART_IDS.includes(id)) expect(row.querySelector(`[data-building-art="${id}"]`), `${id} locked building row`).toBeTruthy();
      else expect(row.querySelector('[data-building-art], [data-unit-art]'), `${id} keeps its emoji`).toBeNull();
    }
  });

  it('shows a locked building with art as its art, in the first page and in the "show more" expansion', () => {
    const { panel } = lockedPanel();
    const lockedArtIds = BUILDING_ART_IDS.filter(id => panel.querySelector(`[data-locked-name="${id}"]`));
    const showMore = panel.querySelector<HTMLElement>('[data-locked-show-more]');
    expect(showMore, 'the fixture must have more locked items than the first page').toBeTruthy();
    const before = panel.querySelectorAll('[data-locked-name]').length;
    showMore!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const extraRows = Array.from(panel.querySelectorAll<HTMLElement>('[data-locked-name-extra]'));
    expect(extraRows.length).toBeGreaterThan(0);
    expect(panel.querySelectorAll('[data-locked-name]').length).toBe(before);
    for (const name of extraRows) {
      const id = name.dataset.lockedNameExtra!;
      const row = name.parentElement!.parentElement as HTMLElement;
      expect(row.textContent).toContain('🔒');
      expect(row.style.opacity).toBe('0.5');
      expect(row.querySelector(`[data-locked-reason-extra="${id}"]`), `${id} lost its reason`).toBeTruthy();
      const isUnit = TRAINABLE_UNITS.some(unit => unit.type === id);
      if (isUnit) expect(row.querySelector(`[data-unit-art="${id}"]`), `${id} expanded unit row`).toBeTruthy();
      else if (BUILDING_ART_IDS.includes(id)) expect(row.querySelector(`[data-building-art="${id}"]`), `${id} expanded building row`).toBeTruthy();
    }
    // At least one of the two pages must have shown real building art, or this test proved nothing.
    const anyArt = lockedArtIds.length > 0 || extraRows.some(name => BUILDING_ART_IDS.includes(name.dataset.lockedNameExtra!));
    expect(anyArt, 'no locked building with art appeared in either page').toBe(true);
  });
});

describe('getProductionItemIconHtml', () => {
  const red = owner('#c0392b');

  it('is the art for a building with art, the sprite for a unit, and the unchanged production icon for everything else', () => {
    expect(getProductionItemIconHtml('royal_mint', red)).toContain('data-building-art="royal_mint"');
    expect(getProductionItemIconHtml('warrior', red)).toContain('data-unit-art="warrior"');
    expect(getProductionItemIconHtml('modular_arcology', red)).not.toMatch(/data-(building|unit)-art/);
    const fallback = getProductionItemIconHtml('legendary:not-a-wonder', red);
    expect(fallback).not.toContain('<svg');
    expect(fallback).not.toMatch(/data-(building|unit)-art/);
  });

  it('draws the owner colour and nothing else for a building, an SVG unit and a PNG unit', () => {
    const blue = owner('#2980b9');
    const pngUnit = TRAINABLE_UNITS.find(unit => getPngUnitManifest(unit.type))!.type;
    const svgUnit = TRAINABLE_UNITS.find(unit => !getPngUnitManifest(unit.type))!.type;
    for (const id of ['royal_mint', svgUnit, pngUnit]) {
      const a = getProductionItemIconHtml(id, red);
      const b = getProductionItemIconHtml(id, blue);
      expect(a, id).not.toBe(b);
      expect(a, id).toMatch(/c0392b|#[0-9a-f]{6}/i);
    }
    expect(getProductionItemIconHtml('royal_mint', red)).toContain(derivePalette('#c0392b').mid);
    expect(getProductionItemIconHtml('royal_mint', blue)).toContain(derivePalette('#2980b9').mid);
    expect(getProductionItemIconHtml(pngUnit, red)).toContain('--cq-tint:#c0392b');
    expect(getProductionItemIconHtml(pngUnit, blue)).toContain('--cq-tint:#2980b9');
  });

  it('holds a PNG unit on its first frame, so a list of icons never animates', () => {
    const pngUnit = TRAINABLE_UNITS.find(unit => getPngUnitManifest(unit.type))!.type;
    const html = getProductionItemIconHtml(pngUnit, red);
    expect(html).toContain('cq-png-static');
    expect(html).toContain('data-unit-art-kind="png"');
  });

  it('numbers the ids inside an SVG unit icon so repeated icons stay independent', () => {
    const svgWithIds = TRAINABLE_UNITS
      .map(unit => unit.type)
      .find(type => !getPngUnitManifest(type) && /\bid="/.test(getProductionItemIconHtml(type, red)));
    if (!svgWithIds) return; // no unit sprite uses an id today: nothing to collide
    const first = getProductionItemIconHtml(svgWithIds, red);
    const second = getProductionItemIconHtml(svgWithIds, red);
    const idsOf = (html: string) => Array.from(html.matchAll(/\bid="([^"]+)"/g)).map(m => m[1]);
    for (const id of idsOf(first)) expect(idsOf(second)).not.toContain(id);
  });

  it('uses the neutral look for an owner with no colour rather than a hard-coded civ', () => {
    const html = getProductionItemIconHtml('warrior', { palette: derivePalette('#8a8a8a'), color: null });
    expect(html).toContain('data-unit-art="warrior"');
    expect(html).not.toContain('c0392b');
  });
});
