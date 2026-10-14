// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { makeWonderPanelFixture } from './helpers/wonder-panel-fixture';

// #1459: the city panel is where a campaign's production is decided. Everything a pointer can click in it must be a
// control the keyboard can reach.

afterEach(() => {
  document.body.innerHTML = '';
});

function baseCallbacks() {
  return {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
  };
}

describe('city panel keyboard access (#1459)', () => {
  it('queueing production, cycling cities and closing are all real, named buttons', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const onBuild = vi.fn();
    const onClose = vi.fn();
    const panel = createCityPanel(container, city, state, {
      ...baseCallbacks(),
      onBuild: (...args: unknown[]) => { onBuild(...args); },
      onPrevCity: vi.fn(),
      onNextCity: vi.fn(),
      onClose,
    });

    // A city queues production by activating a build item: that must not be a clickable div.
    const items = Array.from(panel.querySelectorAll('.build-item'));
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.tagName, item.textContent ?? '').toBe('BUTTON');
    (items[0] as HTMLButtonElement).click();
    expect(onBuild).toHaveBeenCalledTimes(1);

    // Nothing that looks clickable is left as a plain element.
    expect(panel.querySelectorAll('div[style*="cursor:pointer"], span[style*="cursor:pointer"]').length).toBe(0);

    const prev = panel.querySelector<HTMLButtonElement>('#city-prev')!;
    const next = panel.querySelector<HTMLButtonElement>('#city-next')!;
    const close = panel.querySelector<HTMLButtonElement>('#city-close')!;
    expect([prev.tagName, next.tagName, close.tagName]).toEqual(['BUTTON', 'BUTTON', 'BUTTON']);
    expect(prev.getAttribute('aria-label')).toBe('Previous city');
    expect(next.getAttribute('aria-label')).toBe('Next city');
    expect(close.getAttribute('aria-label')).toBe('Close city panel');
    close.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the section switchers say which one is showing', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const panel = createCityPanel(container, city, state, baseCallbacks());
    const pressed = (id: string) => panel.querySelector(`#${id}`)!.getAttribute('aria-pressed');
    expect(panel.querySelector('[aria-label="City sections"]')!.getAttribute('role')).toBe('group');
    expect([pressed('tab-list'), pressed('tab-districts'), pressed('tab-citizens')]).toEqual(['true', 'false', 'false']);
    panel.querySelector<HTMLButtonElement>('#tab-districts')!.click();
    expect([pressed('tab-list'), pressed('tab-districts'), pressed('tab-citizens')]).toEqual(['false', 'true', 'false']);
    panel.querySelector<HTMLButtonElement>('#tab-citizens')!.click();
    expect([pressed('tab-list'), pressed('tab-districts'), pressed('tab-citizens')]).toEqual(['false', 'false', 'true']);
    // "Legendary Wonders" opens another panel, so it is a plain button with no pressed state.
    expect(panel.querySelector('#tab-wonders')!.hasAttribute('aria-pressed')).toBe(false);
  });
});
