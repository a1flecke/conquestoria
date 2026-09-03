// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameShell } from '@/ui/game-shell';

describe('game-shell', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('creates exactly one bottom action bar and exposes Council in the live shell', () => {
    createGameShell(document.body, {
      onOpenCouncil: () => {},
      onOpenTech: () => {},
      onOpenCity: () => {},
      onOpenEspionage: () => {},
      onOpenDiplomacy: () => {},
      onOpenMarketplace: () => {},
      onEndTurn: () => {},
      onNextUnit: () => {},
      onOpenNotificationLog: () => {},
      onToggleIconLegend: () => {},
      onOpenWonderAtlas: () => {},
      onOpenMenu: () => {},
      supplyOverlayEnabled: false,
      onToggleSupplyOverlay: () => false,
    });

    const shell = createGameShell(document.body, {
      onOpenCouncil: () => {},
      onOpenTech: () => {},
      onOpenCity: () => {},
      onOpenEspionage: () => {},
      onOpenDiplomacy: () => {},
      onOpenMarketplace: () => {},
      onEndTurn: () => {},
      onNextUnit: () => {},
      onOpenNotificationLog: () => {},
      onToggleIconLegend: () => {},
      onOpenWonderAtlas: () => {},
      onOpenMenu: () => {},
      supplyOverlayEnabled: false,
      onToggleSupplyOverlay: () => false,
    });

    expect(document.querySelectorAll('#bottom-bar')).toHaveLength(1);
    expect(document.querySelectorAll('#hud')).toHaveLength(1);
    expect(shell.textContent).toContain('Council');
    expect(shell.textContent).toContain('End Turn');
    expect(shell.querySelector('#btn-next-unit')).toBeTruthy();
  });

  it('exposes the Wonder Atlas from the live shell', () => {
    let opened = false;
    const shell = createGameShell(document.body, {
      onOpenCouncil: () => {},
      onOpenTech: () => {},
      onOpenCity: () => {},
      onOpenEspionage: () => {},
      onOpenDiplomacy: () => {},
      onOpenMarketplace: () => {},
      onEndTurn: () => {},
      onNextUnit: () => {},
      onOpenNotificationLog: () => {},
      onToggleIconLegend: () => {},
      onOpenWonderAtlas: () => { opened = true; },
      onOpenMenu: () => {},
      supplyOverlayEnabled: false,
      onToggleSupplyOverlay: () => false,
    });

    const button = shell.querySelector<HTMLButtonElement>('#btn-wonder-atlas');
    expect(button).toBeTruthy();
    expect(button?.title).toBe('Open Wonder Atlas');

    button!.click();

    expect(opened).toBe(true);
  });

  it('reveals Pirate Waters only after discovery and routes the launcher', () => {
    let opened = false;
    const shell = createGameShell(document.body, {
      onOpenCouncil: () => {},
      onOpenTech: () => {},
      onOpenCity: () => {},
      onOpenEspionage: () => {},
      onOpenDiplomacy: () => {},
      onOpenMarketplace: () => {},
      onEndTurn: () => {},
      onNextUnit: () => {},
      onOpenNotificationLog: () => {},
      onToggleIconLegend: () => {},
      onOpenWonderAtlas: () => {},
      onOpenPirateWaters: () => { opened = true; },
      onOpenMenu: () => {},
      supplyOverlayEnabled: false,
      onToggleSupplyOverlay: () => false,
    });

    const button = shell.querySelector<HTMLButtonElement>('#btn-pirate-waters');
    expect(button).toBeTruthy();
    expect(button?.hidden).toBe(true);

    button!.hidden = false;
    button!.click();

    expect(opened).toBe(true);
  });

  it('provides a Hall of Fame button, hidden on creation, that routes its optional callback', () => {
    let opened = 0;
    const shell = createGameShell(document.body, {
      onOpenCouncil: () => {}, onOpenTech: () => {}, onOpenCity: () => {},
      onOpenEspionage: () => {}, onOpenDiplomacy: () => {}, onOpenMarketplace: () => {},
      onEndTurn: () => {}, onNextUnit: () => {}, onOpenNotificationLog: () => {},
      onToggleIconLegend: () => {}, onOpenWonderAtlas: () => {}, onOpenMenu: () => {},
      onOpenHallOfFame: () => { opened += 1; },
      supplyOverlayEnabled: false, onToggleSupplyOverlay: () => false,
    });
    const button = shell.querySelector<HTMLButtonElement>('#btn-hall-of-fame');
    expect(button).toBeTruthy();
    expect(button?.hidden).toBe(true);
    expect(button?.title).toBe('Great Generals — Hall of Fame');
    button!.hidden = false;
    button!.click();
    expect(opened).toBe(1);
  });

  it('does not throw when the Hall of Fame button is clicked without the optional callback wired', () => {
    const shell = createGameShell(document.body, {
      onOpenCouncil: () => {}, onOpenTech: () => {}, onOpenCity: () => {},
      onOpenEspionage: () => {}, onOpenDiplomacy: () => {}, onOpenMarketplace: () => {},
      onEndTurn: () => {}, onNextUnit: () => {}, onOpenNotificationLog: () => {},
      onToggleIconLegend: () => {}, onOpenWonderAtlas: () => {}, onOpenMenu: () => {},
      supplyOverlayEnabled: false, onToggleSupplyOverlay: () => false,
    });
    const button = shell.querySelector<HTMLButtonElement>('#btn-hall-of-fame')!;
    expect(() => button.click()).not.toThrow();
  });

  it('keeps desktop utility controls in a non-overlapping toolbar', () => {
    const shell = createGameShell(document.body, {
      onOpenCouncil: () => {}, onOpenTech: () => {}, onOpenCity: () => {},
      onOpenEspionage: () => {}, onOpenDiplomacy: () => {}, onOpenMarketplace: () => {},
      onEndTurn: () => {}, onNextUnit: () => {}, onOpenNotificationLog: () => {},
      onToggleIconLegend: () => {}, onOpenWonderAtlas: () => {}, onOpenMenu: () => {},
      supplyOverlayEnabled: false,
      onToggleSupplyOverlay: () => false,
    });

    const toolbar = shell.querySelector<HTMLElement>('#utility-toolbar');
    expect(toolbar?.style.display).toBe('flex');
    expect(toolbar?.style.gap).toBe('8px');
    expect(toolbar?.style.position).toBe('absolute');
    expect(toolbar?.style.flexWrap).toBe('wrap');
    expect(toolbar?.style.maxWidth).toBe('calc(100% - 24px)');
    expect([...toolbar?.querySelectorAll('button') ?? []].map(button => button.id)).toEqual([
      'btn-next-unit', 'btn-notif-log', 'btn-icon-legend', 'btn-wonder-atlas',
      'btn-supply-overlay', 'btn-pirate-waters', 'btn-hall-of-fame', 'btn-pause-menu',
    ]);
    expect(toolbar?.querySelectorAll('[style*="right:"]')).toHaveLength(0);
  });

  it('caps selected-unit cards at a readable desktop width while preserving mobile width', () => {
    const shell = createGameShell(document.body, {
      onOpenCouncil: () => {}, onOpenTech: () => {}, onOpenCity: () => {},
      onOpenEspionage: () => {}, onOpenDiplomacy: () => {}, onOpenMarketplace: () => {},
      onEndTurn: () => {}, onNextUnit: () => {}, onOpenNotificationLog: () => {},
      onToggleIconLegend: () => {}, onOpenWonderAtlas: () => {}, onOpenMenu: () => {},
      supplyOverlayEnabled: false,
      onToggleSupplyOverlay: () => false,
    });

    const panel = shell.querySelector<HTMLElement>('#info-panel');
    expect(panel?.style.width).toBe('calc(100% - 24px)');
    expect(panel?.style.maxWidth).toBe('620px');
  });

  it('reserves the measured action-bar height for the map and keeps selected-unit details scrollable', () => {
    const onBottomBarHeightChange = vi.fn();
    const shell = createGameShell(document.body, {
      onOpenCouncil: () => {}, onOpenTech: () => {}, onOpenCity: () => {},
      onOpenEspionage: () => {}, onOpenDiplomacy: () => {}, onOpenMarketplace: () => {},
      onEndTurn: () => {}, onNextUnit: () => {}, onOpenNotificationLog: () => {},
      onToggleIconLegend: () => {}, onOpenWonderAtlas: () => {}, onOpenMenu: () => {},
      supplyOverlayEnabled: false,
      onToggleSupplyOverlay: () => false,
      onBottomBarHeightChange,
    });
    const bottomBar = shell.querySelector<HTMLElement>('#bottom-bar')!;
    vi.spyOn(bottomBar, 'getBoundingClientRect').mockReturnValue({
      height: 132,
    } as DOMRect);

    window.dispatchEvent(new Event('resize'));

    const panel = shell.querySelector<HTMLElement>('#info-panel');
    expect(onBottomBarHeightChange).toHaveBeenLastCalledWith(132);
    expect(document.body.style.getPropertyValue('--bottom-ui-height')).toBe('132px');
    expect(panel?.style.bottom).toBe('calc(var(--bottom-ui-height) + 12px)');
    expect(panel?.style.maxHeight).toBe('calc(100% - 84px - var(--bottom-ui-height))');
    expect(panel?.style.overflowY).toBe('auto');
    expect(panel?.getAttribute('aria-label')).toBe('Selected unit details and actions (scroll for more)');
  });

  it('renders the Supply overlay toggle, paints its initial state, and repaints on click (#544 MR2)', () => {
    const onToggleSupplyOverlay = vi.fn(() => true);
    const shell = createGameShell(document.body, {
      onOpenCouncil: () => {}, onOpenTech: () => {}, onOpenCity: () => {},
      onOpenEspionage: () => {}, onOpenDiplomacy: () => {}, onOpenMarketplace: () => {},
      onEndTurn: () => {}, onNextUnit: () => {}, onOpenNotificationLog: () => {},
      onToggleIconLegend: () => {}, onOpenWonderAtlas: () => {}, onOpenMenu: () => {},
      supplyOverlayEnabled: false,
      onToggleSupplyOverlay,
    });

    const button = shell.querySelector<HTMLButtonElement>('#btn-supply-overlay')!;
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-pressed')).toBe('false');

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onToggleSupplyOverlay).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('paints the Supply overlay toggle as already-active when the initial state is enabled', () => {
    const shell = createGameShell(document.body, {
      onOpenCouncil: () => {}, onOpenTech: () => {}, onOpenCity: () => {},
      onOpenEspionage: () => {}, onOpenDiplomacy: () => {}, onOpenMarketplace: () => {},
      onEndTurn: () => {}, onNextUnit: () => {}, onOpenNotificationLog: () => {},
      onToggleIconLegend: () => {}, onOpenWonderAtlas: () => {}, onOpenMenu: () => {},
      supplyOverlayEnabled: true,
      onToggleSupplyOverlay: () => true,
    });

    const button = shell.querySelector<HTMLButtonElement>('#btn-supply-overlay')!;
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});
