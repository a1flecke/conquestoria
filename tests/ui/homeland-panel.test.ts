// @vitest-environment jsdom
/**
 * Turn-1 homeland panel (#1837, phase C, PR B): one real button per offered homeland, the current one marked, nothing
 * rendered with innerHTML, and a clear way to be done with it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomelandChoice } from '@/core/types';
import { createHomelandPanel } from '@/ui/homeland-panel';

const choice: HomelandChoice = {
  selected: 0,
  options: [
    { coord: { q: 5, r: 5 }, character: 'River valley', summary: 'A river at hand and open grassland.', food: 'rich', production: 'fair' },
    { coord: { q: 14, r: 9 }, character: 'Hill country', summary: '4 hills and woodland.', food: 'fair', production: 'rich' },
    { coord: { q: 3, r: 18 }, character: 'Coastal plain', summary: 'The sea close by.', food: 'lean', production: 'lean' },
  ],
};

function mount(overrides: Partial<Parameters<typeof createHomelandPanel>[2]> = {}, value: HomelandChoice = choice) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const onChoose = vi.fn();
  const onClose = vi.fn();
  const panel = createHomelandPanel(container, value, { onChoose, onClose, ...overrides });
  return { container, panel, onChoose, onClose };
}

describe('createHomelandPanel', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('is a registry-shaped panel with one card and one button per homeland', () => {
    const { panel } = mount();
    expect(panel.id).toBe('homeland-panel');
    expect(panel.querySelectorAll('[data-homeland-option]')).toHaveLength(3);
    expect(panel.textContent).toContain('River valley');
    expect(panel.textContent).toContain('Hill country');
    expect(panel.textContent).toContain('Coastal plain');
    expect(panel.textContent).toContain('A river at hand and open grassland.');
  });

  it('says what each homeland offers in words, not just numbers', () => {
    const { panel } = mount();
    const first = panel.querySelector('[data-homeland-option="0"]')!.textContent!;
    expect(first).toContain('Food: Rich');
    expect(first).toContain('Production: Fair');
    expect(panel.querySelector('[data-homeland-option="2"]')!.textContent).toContain('Food: Lean');
  });

  it('marks the current homeland and offers the others', () => {
    const { panel } = mount();
    const current = panel.querySelector<HTMLButtonElement>('[data-homeland-option="0"] button')!;
    const other = panel.querySelector<HTMLButtonElement>('[data-homeland-option="1"] button')!;
    expect(current.getAttribute('aria-pressed')).toBe('true');
    expect(current.textContent).toContain('Your homeland');
    expect(other.getAttribute('aria-pressed')).toBe('false');
    expect(other.textContent).toContain('Settle here');
  });

  it('chooses the clicked homeland, and clicking the current one chooses nothing', () => {
    const { panel, onChoose } = mount();
    panel.querySelector<HTMLButtonElement>('[data-homeland-option="2"] button')!.click();
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(2);
    panel.querySelector<HTMLButtonElement>('[data-homeland-option="0"] button')!.click();
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it('closes through a named button', () => {
    const { panel, onClose } = mount();
    const done = [...panel.querySelectorAll('button')].find(b => b.textContent?.includes('Done'))!;
    expect(done).toBeDefined();
    done.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.getElementById('homeland-panel')).toBeNull();
  });

  it('replaces itself rather than stacking when opened again', () => {
    mount();
    mount({}, { ...choice, selected: 1 });
    expect(document.querySelectorAll('#homeland-panel')).toHaveLength(1);
    expect(document.querySelector('[data-homeland-option="1"] button')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders text as text, never markup', () => {
    const hostile: HomelandChoice = {
      selected: 0,
      options: [
        { coord: { q: 0, r: 0 }, character: '<img src=x onerror=alert(1)>', summary: '<b>bold</b>', food: 'fair', production: 'fair' },
        choice.options[1],
      ],
    };
    const { panel } = mount({}, hostile);
    expect(panel.querySelector('img')).toBeNull();
    expect(panel.querySelector('b')).toBeNull();
    expect(panel.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('keeps every button a real, touch-sized control', () => {
    const { panel } = mount();
    for (const button of panel.querySelectorAll('button')) {
      expect(button.type).toBe('button');
      expect(button.style.minHeight).toBe('44px');
    }
  });
});
