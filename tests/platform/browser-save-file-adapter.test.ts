// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserSaveFileAdapter } from '@/platform/browser-save-file-adapter';

describe('createBrowserSaveFileAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads exported text with the requested filename', async () => {
    const adapter = createBrowserSaveFileAdapter();
    const click = vi.fn();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:save');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const createElement = vi.spyOn(document, 'createElement');
    createElement.mockImplementation(((tagName: string) => {
      const element = Document.prototype.createElement.call(document, tagName);
      if (tagName === 'a') {
        element.click = click;
      }
      return element;
    }) as typeof document.createElement);

    await expect(adapter.exportText('save.json', '{"turn":1}')).resolves.toEqual({ status: 'success' });

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:save');
  });

  it('reports browser picker cancellation', async () => {
    const adapter = createBrowserSaveFileAdapter();
    let input: HTMLInputElement | null = null;
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = Document.prototype.createElement.call(document, tagName);
      if (tagName === 'input') {
        input = element as HTMLInputElement;
        element.click = () => {
          element.dispatchEvent(new Event('cancel'));
        };
      }
      return element;
    }) as typeof document.createElement);

    await expect(adapter.importText()).resolves.toEqual({ status: 'cancelled' });
    expect(input?.type).toBe('file');
  });
});
