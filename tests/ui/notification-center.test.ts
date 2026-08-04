// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNotificationCenter } from '@/ui/notification-center';
import type { GameState } from '@/core/types';
import type { NotificationMapTarget } from '@/core/notification-log';

const state = { turn: 3, currentPlayer: 'player', civilizations: {}, notificationLog: {}, idCounters: {} } as unknown as GameState;

describe('notification center queue', () => {
  let layer: HTMLElement;
  let playCue: ReturnType<typeof vi.fn<(cue: string | undefined) => void>>;
  let onFocusTarget: ReturnType<typeof vi.fn<(target: NotificationMapTarget | undefined) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    layer = document.createElement('div');
    document.body.appendChild(layer);
    playCue = vi.fn();
    onFocusTarget = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    layer.remove();
    document.getElementById('capture-verdict-modal')?.remove();
  });

  const make = () => createNotificationCenter({
    layer,
    getState: () => state,
    isSuppressed: () => false,
    playCue,
    onFocusTarget,
  });

  it('shows one toast at a time and drains the queue in order', () => {
    const center = make();

    center.toast('first', 'info');
    center.toast('second', 'info');

    expect(layer.textContent).toContain('first');
    expect(layer.textContent).not.toContain('second');

    // Two stages: the 6s auto-dismiss timer, then the 200ms fade-out-and-remove
    // timer it schedules — matches the original main.ts dismiss()/setTimeout chain.
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();

    expect(layer.textContent).toContain('second');
  });

  it('plays the sfx cue attached to a toast', () => {
    const center = make();

    center.toast('city captured', 'success', undefined, 'city-captured');

    expect(playCue).toHaveBeenCalledWith('city-captured');
  });

  it('passes undefined (never a magic string) when no sfxCue is attached, so the wiring plays the generic chime', () => {
    const center = make();

    center.toast('plain toast', 'info');

    expect(playCue).toHaveBeenCalledWith(undefined);
  });

  it('renders message text via textContent, never innerHTML', () => {
    const center = make();

    center.toast('<img src=x onerror=alert(1)>', 'warning');

    expect(layer.querySelector('img')).toBeNull();
    expect(layer.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('focuses the target and dismisses on click, without logging a notification entry', () => {
    const center = make();
    const target = { coord: { q: 1, r: 2 } } as unknown as NonNullable<Parameters<typeof center.toast>[2]>;

    center.toast('enemy spotted', 'warning', target);
    layer.querySelector('div')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onFocusTarget).toHaveBeenCalledWith(target);
    expect(state.notificationLog?.['player']).toBeUndefined();
  });

  it('does not enqueue while suppressed', () => {
    const center = createNotificationCenter({
      layer,
      getState: () => state,
      isSuppressed: () => true,
      playCue,
      onFocusTarget,
    });

    center.toast('hidden', 'info');

    expect(layer.textContent).not.toContain('hidden');
  });

  it('a choice notification stays until an action is chosen, then applies exactly one outcome', () => {
    const center = make();
    const execute = vi.fn();
    const release = vi.fn();

    center.choice('A spy was caught.', [
      { label: 'Execute', danger: true, onClick: execute },
      { label: 'Release', onClick: release },
    ]);

    expect(document.body.textContent).toContain('A spy was caught.');

    const [executeButton] = [...document.querySelectorAll('button')].filter(b => b.textContent === 'Execute');
    executeButton.click();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    expect(document.getElementById('capture-verdict-modal')).toBeNull();
  });

  it('styles a danger action distinctly from a regular action', () => {
    const center = make();

    center.choice('Confirm?', [
      { label: 'Execute', danger: true, onClick: vi.fn() },
      { label: 'Cancel', onClick: vi.fn() },
    ]);

    const buttons = [...document.querySelectorAll('button')];
    const executeButton = buttons.find(b => b.textContent === 'Execute')!;
    const cancelButton = buttons.find(b => b.textContent === 'Cancel')!;

    expect(executeButton.style.background).toContain('220, 60, 60');
    expect(cancelButton.style.background).not.toContain('220, 60, 60');
  });

  it('deliver logs to the recipient civ and stamps entries made inside withHappenedTurn with that turn', () => {
    const civState = {
      turn: 9,
      currentPlayer: 'player',
      hotSeat: undefined,
      civilizations: { player: { isHuman: true } },
      notificationLog: {},
      idCounters: {},
    } as unknown as GameState;
    const center = createNotificationCenter({
      layer,
      getState: () => civState,
      isSuppressed: () => false,
      playCue,
      onFocusTarget,
    });

    center.withHappenedTurn(5, () => {
      center.deliver('player', 'round event', 'info');
    });

    expect(civState.notificationLog?.['player']?.[0]?.turn).toBe(5);
  });
});
