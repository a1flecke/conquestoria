// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { CityInteraction } from '@/systems/city-interaction';
import { formatCityDefenseText, renderCityActionPreview } from '@/ui/city-action-preview';

function captureInteraction(overrides: Partial<Extract<CityInteraction['available'][number], { kind: 'capture' }>> = {}): CityInteraction {
  return {
    available: [{
      kind: 'capture',
      winProbability: 0.65,
      defenseBefore: 54,
      defenseAfter: 54,
      label: 'Capture the city — 65%',
      ...overrides,
    }],
    denied: [],
  };
}

function render(interaction: CityInteraction, callbacks = { onCapture: vi.fn(), onCancel: vi.fn() }) {
  const container = document.createElement('div');
  renderCityActionPreview(container, {
    attackerName: 'Archer',
    attackerStrength: 15,
    cityName: 'Athens',
    interaction,
    infoText: 'A walled city fights back if it has no garrison.',
  }, callbacks);
  return { container, callbacks };
}

describe('#966 city action preview', () => {
  // The HP-scales-defense mechanic is invisible unless the preview shows the payoff.
  it('shows the damaged defense alongside the undamaged one for a bombarded city', () => {
    const { container } = render(captureInteraction({ defenseBefore: 54, defenseAfter: 32 }));

    expect(container.textContent).toContain('Athens defenses (54 → 32 damaged)');
  });

  it('shows a single defense number for an undamaged city, with no arrow', () => {
    const { container } = render(captureInteraction({ defenseBefore: 54, defenseAfter: 54 }));

    expect(container.textContent).toContain('Athens defenses (54)');
    expect(container.textContent).not.toContain('→');
  });

  it('labels the confirm button with the resolver’s outcome-first copy, not a bare verb', () => {
    const { container } = render(captureInteraction());
    const button = container.querySelector('#btn-assault-confirm');

    expect(button?.textContent).toBe('Capture the city — 65%');
  });

  it('renders truthful denial copy instead of silently omitting the action', () => {
    const { container } = render({
      available: [],
      denied: [{ kind: 'capture', reason: 'Defeat the defenders first.' }],
    });

    expect(container.textContent).toContain('Defeat the defenders first.');
    expect(container.querySelector('#btn-assault-confirm')).toBeNull();
    // Cancel is always available so the panel is never a dead end.
    expect(container.querySelector('#btn-cancel-assault')).not.toBeNull();
  });

  it('wires the confirm and cancel callbacks', () => {
    const { container, callbacks } = render(captureInteraction());

    (container.querySelector('#btn-assault-confirm') as HTMLButtonElement).click();
    (container.querySelector('#btn-cancel-assault') as HTMLButtonElement).click();

    expect(callbacks.onCapture).toHaveBeenCalledTimes(1);
    expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses textContent for game-generated names (XSS-safe)', () => {
    const container = document.createElement('div');
    renderCityActionPreview(container, {
      attackerName: '<img src=x onerror=alert(1)>',
      attackerStrength: 15,
      cityName: '<script>bad()</script>',
      interaction: captureInteraction(),
      infoText: 'info',
    }, { onCapture: vi.fn(), onCancel: vi.fn() });

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('formatCityDefenseText rounds both sides', () => {
    expect(formatCityDefenseText('Athens', 54.4, 32.6)).toBe('Athens defenses (54 → 33 damaged)');
    expect(formatCityDefenseText('Athens', 54.4, 54.4)).toBe('Athens defenses (54)');
  });
});
