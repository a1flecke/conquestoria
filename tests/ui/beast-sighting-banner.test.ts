// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showBeastSightingBanner } from '@/ui/beast-sighting-banner';

const BASE_OPTIONS = {
  name: 'Giant Boar',
  flavor: 'Your scouts lay eyes on the Giant Boar — a beast of legend!',
  unitType: 'beast_boar' as const,
  onContinue: vi.fn(),
  onOpenBestiary: vi.fn(),
};

describe('beast-sighting-banner', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
  });

  it('renders beast name and flavor text', () => {
    showBeastSightingBanner(container, BASE_OPTIONS);
    const banner = container.querySelector('#beast-sighting-banner')!;
    expect(banner.textContent).toContain('Giant Boar');
    expect(banner.textContent).toContain('Your scouts lay eyes on the Giant Boar');
    expect(banner.textContent).toContain('BEAST SIGHTED');
  });

  it('Continue button removes banner and calls onContinue', () => {
    showBeastSightingBanner(container, BASE_OPTIONS);
    const continueBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Continue')) as HTMLButtonElement;
    expect(continueBtn).not.toBeNull();
    continueBtn.click();
    expect(container.querySelector('#beast-sighting-banner')).toBeNull();
    expect(BASE_OPTIONS.onContinue).toHaveBeenCalledOnce();
    expect(BASE_OPTIONS.onOpenBestiary).not.toHaveBeenCalled();
  });

  it('Open Bestiary button removes banner and calls onOpenBestiary', () => {
    showBeastSightingBanner(container, BASE_OPTIONS);
    const bestiaryBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Open Bestiary')) as HTMLButtonElement;
    expect(bestiaryBtn).not.toBeNull();
    bestiaryBtn.click();
    expect(container.querySelector('#beast-sighting-banner')).toBeNull();
    expect(BASE_OPTIONS.onOpenBestiary).toHaveBeenCalledOnce();
    expect(BASE_OPTIONS.onContinue).not.toHaveBeenCalled();
  });

  it('reopening replaces the old banner (no duplicates)', () => {
    showBeastSightingBanner(container, BASE_OPTIONS);
    showBeastSightingBanner(container, BASE_OPTIONS);
    expect(container.querySelectorAll('#beast-sighting-banner')).toHaveLength(1);
  });
});
