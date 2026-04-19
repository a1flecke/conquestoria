/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showGameModeSelect } from '@/ui/game-mode-select';

describe('game-mode-select', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the new-game launcher inside the shared setup shell and exposes a solo entry card', () => {
    const panel = showGameModeSelect(document.body, {
      initialTitle: 'New Campaign',
      onChooseSolo: () => {},
      onChooseHotSeat: () => {},
      onTitleRequired: () => {},
      onCancel: () => {},
    });

    expect(panel.dataset.role).toBe('setup-surface');
    expect(panel.textContent).toContain('New Game');
    expect(panel.querySelector('[data-action="choose-solo-mode"]')).toBeTruthy();
    expect(panel.querySelector('[data-action="cancel-mode-select"]')).toBeTruthy();
  });

  it('requires a non-empty title before continuing into hot seat setup', () => {
    const onChooseHotSeat = vi.fn();
    const onTitleRequired = vi.fn();
    const panel = showGameModeSelect(document.body, {
      initialTitle: '',
      onChooseSolo: () => {},
      onChooseHotSeat,
      onTitleRequired,
      onCancel: () => {},
    });

    const titleInput = panel.querySelector('#new-game-title') as HTMLInputElement;
    titleInput.value = '   ';

    (panel.querySelector('[data-action="choose-hotseat-mode"]') as HTMLButtonElement).click();

    expect(onChooseHotSeat).not.toHaveBeenCalled();
    expect(onTitleRequired).toHaveBeenCalledTimes(1);
  });

  it('passes the trimmed title into hot seat setup when provided', () => {
    const onChooseHotSeat = vi.fn();
    const panel = showGameModeSelect(document.body, {
      initialTitle: '  River War  ',
      onChooseSolo: () => {},
      onChooseHotSeat,
      onTitleRequired: () => {},
      onCancel: () => {},
    });

    (panel.querySelector('[data-action="choose-hotseat-mode"]') as HTMLButtonElement).click();

    expect(onChooseHotSeat).toHaveBeenCalledWith('River War');
  });

  it('lets the player back out to the previous screen', () => {
    const onCancel = vi.fn();
    const panel = showGameModeSelect(document.body, {
      initialTitle: 'New Campaign',
      onChooseSolo: () => {},
      onChooseHotSeat: () => {},
      onTitleRequired: () => {},
      onCancel,
    });

    (panel.querySelector('[data-action="cancel-mode-select"]') as HTMLButtonElement).click();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.getElementById('mode-select')).toBeNull();
  });
});
