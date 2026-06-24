// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { closePirateWatersPanels, createPirateWatersPanel } from '@/ui/pirate-waters-panel';

function presentation() {
  return {
    viewerId: 'player', available: true, selectedFactionId: 'pirate-1', history: [],
    factions: [
      {
        factionId: 'pirate-1', name: 'The Red Wake', level: 'sighted', discoveredRound: 2, lastUpdatedRound: 8,
        behavior: 'raiding', maritimeStage: 3, observedUnitIds: ['ship-1'],
        headquarters: { kind: 'coastal-enclave', position: { q: 4, r: 4 }, observedRound: 8, current: false, integrityBand: 'damaged' },
        focusTarget: { kind: 'headquarters', coord: { q: 4, r: 4 }, current: false, label: 'Last known pirate headquarters' },
        tributeQuote: { available: true, reason: null, cost: 40, durationRounds: 15 },
        contractTargets: [], contractUnavailableReason: 'Only final-era deep-sea flotillas can be hired.',
      },
      {
        factionId: 'pirate-2', name: 'Unknown pirate faction', level: 'rumor', discoveredRound: 7, lastUpdatedRound: 7,
        approximateRegion: { center: { q: 8, r: 8 }, radius: 4 }, observedUnitIds: [],
        focusTarget: { kind: 'region', center: { q: 8, r: 8 }, radius: 4, label: 'Suspected pirate waters' },
        tributeQuote: { available: false, reason: 'This faction has not demanded tribute.', cost: 20 },
        contractTargets: [
          { civId: 'ai-1', name: 'Rome', cost: 100, durationRounds: 8 },
          { civId: 'ai-2', name: 'Egypt', cost: 100, durationRounds: 8 },
        ],
      },
    ],
  } as any;
}

describe('Pirate Waters panel', () => {
  it('keeps every faction reachable and routes selection, focus, close, and tribute actions', () => {
    const container = document.createElement('div');
    const callbacks = {
      onClose: vi.fn(), onSelectFaction: vi.fn(), onFocus: vi.fn(),
      onPayTribute: vi.fn(() => ({ success: true })), onHireFlotilla: vi.fn(), onOpenAssault: vi.fn(),
    };
    const panel = createPirateWatersPanel(container, presentation(), callbacks as any);

    expect(panel.querySelectorAll('[data-pirate-faction]')).toHaveLength(2);
    (panel.querySelector('[data-pirate-faction="pirate-2"]') as HTMLButtonElement).click();
    expect(callbacks.onSelectFaction).toHaveBeenCalledWith('pirate-2');
    expect(panel.querySelectorAll('[data-pirate-faction]')).toHaveLength(2);

    (panel.querySelector('[data-action="focus-headquarters"]') as HTMLButtonElement).click();
    expect(callbacks.onFocus).toHaveBeenCalledWith(expect.objectContaining({ kind: 'headquarters', current: false }));
    (panel.querySelector('[data-action="pay-tribute"]') as HTMLButtonElement).click();
    expect(callbacks.onPayTribute).not.toHaveBeenCalled();
    (panel.querySelector('[data-action="confirm-pay-tribute"]') as HTMLButtonElement).click();
    expect(callbacks.onPayTribute).toHaveBeenCalledWith('pirate-1');
    (panel.querySelector('[aria-label="Close Pirate Waters"]') as HTMLButtonElement).click();
    expect(callbacks.onClose).toHaveBeenCalledOnce();
  });

  it('shows exact disabled reasons and the full valid rival picker', () => {
    const data = presentation();
    data.selectedFactionId = 'pirate-2';
    const container = document.createElement('div');
    const callbacks = {
      onClose: vi.fn(), onSelectFaction: vi.fn(), onFocus: vi.fn(), onPayTribute: vi.fn(),
      onHireFlotilla: vi.fn(), onOpenAssault: vi.fn(),
    };
    const panel = createPirateWatersPanel(container, data, callbacks as any);

    const tribute = panel.querySelector('[data-action="pay-tribute"]') as HTMLButtonElement;
    expect(tribute.disabled).toBe(true);
    expect(panel.textContent).toContain('This faction has not demanded tribute.');
    const target = panel.querySelector('[data-contract-target]') as HTMLSelectElement;
    expect([...target.options].map(option => option.textContent)).toEqual(['Rome', 'Egypt']);
    target.value = 'ai-2';
    (panel.querySelector('[data-action="hire-flotilla"]') as HTMLButtonElement).click();
    expect(callbacks.onHireFlotilla).not.toHaveBeenCalled();
    expect(panel.textContent).toContain('100 gold');
    (panel.querySelector('[data-action="confirm-hire-flotilla"]') as HTMLButtonElement).click();
    expect(callbacks.onHireFlotilla).toHaveBeenCalledWith('pirate-2', 'ai-2');
  });

  it('uses the same content in mobile bottom-sheet layout', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 480 });
    const panel = createPirateWatersPanel(document.createElement('div'), presentation(), {
      onClose: vi.fn(), onSelectFaction: vi.fn(), onFocus: vi.fn(), onPayTribute: vi.fn(),
      onHireFlotilla: vi.fn(), onOpenAssault: vi.fn(),
    } as any);
    expect(panel.dataset.layout).toBe('bottom-sheet');
    expect(panel.textContent).toContain('The Red Wake');
    expect(panel.querySelector<HTMLElement>('[data-layout="pirate-waters-content"]')?.style.gridTemplateColumns)
      .toBe('minmax(0,1fr)');
  });

  it('labels the management surface and closes all pirate panels for hot-seat privacy', () => {
    const container = document.createElement('div');
    const panel = createPirateWatersPanel(container, presentation(), {
      onClose: vi.fn(), onSelectFaction: vi.fn(), onFocus: vi.fn(), onPayTribute: vi.fn(),
      onHireFlotilla: vi.fn(), onOpenAssault: vi.fn(),
    } as any);
    const assault = document.createElement('section');
    assault.id = 'pirate-headquarters-assault-panel';
    container.appendChild(assault);

    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-labelledby')).toBe('pirate-waters-title');
    closePirateWatersPanels(container);
    expect(container.querySelector('#pirate-waters-panel')).toBeNull();
    expect(container.querySelector('#pirate-headquarters-assault-panel')).toBeNull();
  });

  it('rerenders from fresh state after tribute so a stale action cannot repeat', () => {
    const container = document.createElement('div');
    let data = presentation();
    let payments = 0;
    const render = () => createPirateWatersPanel(container, data, {
      onClose: vi.fn(), onSelectFaction: vi.fn(), onFocus: vi.fn(),
      onPayTribute: () => {
        payments += 1;
        data = presentation();
        data.factions[0].tributeQuote = { available: false, reason: 'Tribute protection is already active.', cost: 40 };
        render();
        return { success: true };
      },
      onHireFlotilla: vi.fn(), onOpenAssault: vi.fn(),
    } as any);
    render();

    const staleButton = container.querySelector('[data-action="pay-tribute"]') as HTMLButtonElement;
    staleButton.click();
    (container.querySelector('[data-action="confirm-pay-tribute"]') as HTMLButtonElement).click();
    staleButton.click();

    expect(payments).toBe(1);
    expect((container.querySelector('[data-action="pay-tribute"]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain('Tribute protection is already active.');
  });

  it('keeps destroyed factions reviewable as history without active actions', () => {
    const data = presentation();
    data.factions = [];
    data.selectedFactionId = undefined;
    data.selectedHistoryId = 'history-1';
    data.history = [{
      id: 'history-1', factionId: 'pirate-1', factionName: 'The Red Wake', round: 12,
      summary: 'The Red Wake was destroyed for 75 gold.',
    }];

    const panel = createPirateWatersPanel(document.createElement('div'), data, {
      onClose: vi.fn(), onSelectFaction: vi.fn(), onFocus: vi.fn(), onPayTribute: vi.fn(),
      onHireFlotilla: vi.fn(), onOpenAssault: vi.fn(),
    } as any);

    expect(panel.textContent).toContain('The Red Wake was destroyed for 75 gold.');
    expect(panel.querySelector('[data-action="pay-tribute"]')).toBeNull();
    expect(panel.querySelector('[data-action="hire-flotilla"]')).toBeNull();
  });

  it('rerenders from fresh state after hiring so a stale contract cannot repeat', () => {
    const container = document.createElement('div');
    let data = presentation();
    data.selectedFactionId = 'pirate-2';
    let hires = 0;
    const render = () => createPirateWatersPanel(container, data, {
      onClose: vi.fn(), onSelectFaction: vi.fn(), onFocus: vi.fn(), onPayTribute: vi.fn(),
      onHireFlotilla: () => {
        hires += 1;
        data = presentation();
        data.selectedFactionId = 'pirate-2';
        data.factions[1].contractTargets = [];
        data.factions[1].contractUnavailableReason = 'This flotilla is already under contract.';
        render();
        return { success: true };
      },
      onOpenAssault: vi.fn(),
    } as any);
    render();

    const staleButton = container.querySelector('[data-action="hire-flotilla"]') as HTMLButtonElement;
    staleButton.click();
    (container.querySelector('[data-action="confirm-hire-flotilla"]') as HTMLButtonElement).click();
    staleButton.click();

    expect(hires).toBe(1);
    expect(container.querySelector('[data-action="hire-flotilla"]')).toBeNull();
    expect(container.textContent).toContain('This flotilla is already under contract.');
  });
});
