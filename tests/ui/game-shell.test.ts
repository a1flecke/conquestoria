// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
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
    });

    const button = shell.querySelector<HTMLButtonElement>('#btn-pirate-waters');
    expect(button).toBeTruthy();
    expect(button?.hidden).toBe(true);

    button!.hidden = false;
    button!.click();

    expect(opened).toBe(true);
  });
});
