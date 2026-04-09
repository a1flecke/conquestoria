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
    });

    expect(document.querySelectorAll('#bottom-bar')).toHaveLength(1);
    expect(document.querySelectorAll('#hud')).toHaveLength(1);
    expect(shell.textContent).toContain('Council');
    expect(shell.textContent).toContain('End Turn');
    expect(shell.querySelector('#btn-next-unit')).toBeTruthy();
  });
});
