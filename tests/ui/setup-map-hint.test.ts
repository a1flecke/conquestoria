// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showCampaignSetup } from '@/ui/campaign-setup';
import { showHotSeatSetup } from '@/ui/hotseat-setup';

// #1456: both setup screens report the map currently selected (the default on open, then every change) so the
// owner can prefetch a geographic map's data while the player is still choosing. It is a hint: it never blocks.

describe('setup screens report the selected map (#1456)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('solo setup reports the default Earth map on open, then each change', () => {
    const onMapScriptChosen = vi.fn();
    showCampaignSetup(document.body, { onStartSolo: vi.fn(), onCancel: vi.fn(), onMapScriptChosen });
    expect(onMapScriptChosen).toHaveBeenCalledTimes(1);
    expect(onMapScriptChosen).toHaveBeenLastCalledWith('earth');

    (document.querySelector('[data-map-script="old-world"]') as HTMLElement).click();
    expect(onMapScriptChosen).toHaveBeenLastCalledWith('old-world');
    (document.querySelector('[data-map-script="balanced"]') as HTMLElement).click();
    expect(onMapScriptChosen).toHaveBeenLastCalledWith('balanced');
    expect(onMapScriptChosen).toHaveBeenCalledTimes(3);
  });

  it('hot-seat setup reports the default Earth map on open, then each change', () => {
    const onMapScriptChosen = vi.fn();
    showHotSeatSetup(document.body, { onComplete: vi.fn(), onCancel: vi.fn(), onMapScriptChosen });
    expect(onMapScriptChosen).toHaveBeenCalledTimes(1);
    expect(onMapScriptChosen).toHaveBeenLastCalledWith('earth');

    (document.querySelector('[data-size="small"]') as HTMLElement).click();
    (document.querySelector('[data-map-script="new-world"]') as HTMLElement).click();
    expect(onMapScriptChosen).toHaveBeenLastCalledWith('new-world');
    expect(onMapScriptChosen).toHaveBeenCalledTimes(2);
  });

  it('both screens work without the hint', () => {
    expect(() => showCampaignSetup(document.body, { onStartSolo: vi.fn(), onCancel: vi.fn() })).not.toThrow();
    expect(() => showHotSeatSetup(document.body, { onComplete: vi.fn(), onCancel: vi.fn() })).not.toThrow();
  });
});
