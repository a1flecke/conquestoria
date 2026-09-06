// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { CityInteraction } from '@/systems/city-interaction';
import { formatCityDefenseText, renderCityActionPreview } from '@/ui/city-action-preview';

function captureInteraction(overrides: Partial<Extract<CityInteraction['available'][number], { kind: 'capture' }>> = {}): CityInteraction {
  return {
    available: [{
      kind: 'capture',
      winProbability: 0.65,
      attackerStrength: 15,
      defenseBefore: 54,
      defenseAfter: 54,
      label: 'Capture the city — 65%',
      ...overrides,
    }],
    denied: [],
  };
}

function makeCallbacks() {
  return { onCapture: vi.fn(), onBombard: vi.fn(), onHoldSiege: vi.fn(), onAttackDefender: vi.fn(), onCancel: vi.fn() };
}

function render(interaction: CityInteraction, callbacks = makeCallbacks()) {
  const container = document.createElement('div');
  renderCityActionPreview(container, {
    attackerName: 'Archer',
    attackerStrength: 15,
    cityName: 'Athens',
    cityHp: 100,
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

  // #974 phase 2: the three city actions render together, so a player facing a defended city
  // can choose between fighting the garrison and shelling the walls.
  it('renders attack-defender, bombard and capture together, in siege order', () => {
    const { container } = render({
      available: [
        { kind: 'attack-defender', defenderId: 'd1', label: 'Attack the Spearman' },
        { kind: 'bombard', hpLoss: 12, counterFire: 0, label: 'Attack the city — −12 HP' },
        { kind: 'capture', winProbability: 0.6, attackerStrength: 15, defenseBefore: 20, defenseAfter: 20, label: 'Capture the city — 60%' },
      ],
      denied: [],
    });

    const ids = [...container.querySelectorAll('button')].map(b => b.id);
    expect(ids).toEqual([
      'btn-attack-defender', 'btn-bombard-city', 'btn-hold-siege', 'btn-assault-confirm', 'btn-cancel-assault',
    ]);
  });

  it('warns on the bombard button when the city will shoot back', () => {
    const { container } = render({
      available: [{ kind: 'bombard', hpLoss: 12, counterFire: 7, label: 'Attack the city — −12 HP' }],
      denied: [],
    });

    expect(container.querySelector('#btn-bombard-city')?.textContent).toBe('Attack the city — −12 HP (−7 to you)');
  });

  it('shows the city HP so a damage figure means something', () => {
    const container = document.createElement('div');
    renderCityActionPreview(container, {
      attackerName: 'Catapult', attackerStrength: 20, cityName: 'Athens', cityHp: 64,
      interaction: { available: [], denied: [] }, infoText: 'info',
    }, makeCallbacks());

    expect(container.textContent).toContain('City strength: 64/100');
  });

  it('wires the bombard and attack-defender callbacks', () => {
    const { container, callbacks } = render({
      available: [
        { kind: 'attack-defender', defenderId: 'd1', label: 'Attack the Spearman' },
        { kind: 'bombard', hpLoss: 12, counterFire: 0, label: 'Attack the city — −12 HP' },
      ],
      denied: [],
    });

    (container.querySelector('#btn-bombard-city') as HTMLButtonElement).click();
    (container.querySelector('#btn-attack-defender') as HTMLButtonElement).click();
    (container.querySelector('#btn-hold-siege') as HTMLButtonElement).click();

    expect(callbacks.onBombard).toHaveBeenCalledTimes(1);
    expect(callbacks.onAttackDefender).toHaveBeenCalledTimes(1);
    expect(callbacks.onHoldSiege).toHaveBeenCalledTimes(1);
  });

  // A siege runs at least 5 turns by design, so the standing order sits beside the single
  // shot -- but only when bombarding is actually on offer.
  it('offers Hold siege only alongside a live bombard action', () => {
    const withBombard = render({
      available: [{ kind: 'bombard', hpLoss: 9, counterFire: 0, label: 'Attack the city — −9 HP' }],
      denied: [],
    });
    expect(withBombard.container.querySelector('#btn-hold-siege')).not.toBeNull();

    const captureOnly = render(captureInteraction());
    expect(captureOnly.container.querySelector('#btn-hold-siege')).toBeNull();
  });

  it('uses textContent for game-generated names (XSS-safe)', () => {
    const container = document.createElement('div');
    renderCityActionPreview(container, {
      attackerName: '<img src=x onerror=alert(1)>',
      attackerStrength: 15,
      cityName: '<script>bad()</script>',
      cityHp: 100,
      interaction: captureInteraction(),
      infoText: 'info',
    }, makeCallbacks());

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('formatCityDefenseText rounds both sides', () => {
    expect(formatCityDefenseText('Athens', 54.4, 32.6)).toBe('Athens defenses (54 → 33 damaged)');
    expect(formatCityDefenseText('Athens', 54.4, 54.4)).toBe('Athens defenses (54)');
  });
});
