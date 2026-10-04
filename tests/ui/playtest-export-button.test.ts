// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createPlaytestExportButton, type PlaytestExportResult } from '@/ui/playtest-export-button';

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function mount(result: PlaytestExportResult) {
  const container = document.createElement('div');
  const onExport = vi.fn(async () => result);
  createPlaytestExportButton(container, { onExport });
  const button = container.querySelector('button')!;
  const status = container.querySelector('[role="status"]') as HTMLElement;
  return { container, onExport, button, status };
}

describe('createPlaytestExportButton (#1244)', () => {
  it('renders one labelled, touch-sized button and a hidden status line', () => {
    const { container, button, status } = mount({ status: 'success' });

    expect(container.querySelectorAll('[data-role="playtest-export"]')).toHaveLength(1);
    expect(button.textContent).toBe('Export playtest log');
    expect(button.style.minHeight).toBe('44px');
    expect(status.hidden).toBe(true);
  });

  it('exports on click and says so, in plain text', async () => {
    const { onExport, button, status } = mount({ status: 'success' });

    button.click();
    await flush();

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe('Playtest log saved on this device.');
  });

  it('reports a cancelled export', async () => {
    const { button, status } = mount({ status: 'cancelled' });

    button.click();
    await flush();

    expect(status.textContent).toBe('Export cancelled.');
  });

  it('reports a failed export and never renders the message as markup', async () => {
    const { container, button, status } = mount({ status: 'error', message: '<img src=x onerror="alert(1)">' });

    button.click();
    await flush();

    expect(status.textContent).toBe('Export failed: <img src=x onerror="alert(1)">');
    expect(container.querySelector('img')).toBeNull();
  });

  it('replaces a previous button instead of stacking a second one', () => {
    const container = document.createElement('div');
    createPlaytestExportButton(container, { onExport: async () => ({ status: 'success' }) });
    createPlaytestExportButton(container, { onExport: async () => ({ status: 'success' }) });

    expect(container.querySelectorAll('[data-role="playtest-export"]')).toHaveLength(1);
  });
});
