// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameCreationError } from '@/core/game-state';
import {
  MAP_LOADING_MESSAGE,
  MAP_LOAD_FAILED_MESSAGE,
  createSetupStartFlight,
} from '@/ui/setup-start-flight';
import { showCampaignSetup } from '@/ui/campaign-setup';

// #1456: starting on a geographic map first loads its data, so a start can be pending or fail. The setup
// screens must say so, lock out a second start, and let the player retry.

function setup() {
  const panel = document.createElement('div');
  const start = document.createElement('button');
  const cancel = document.createElement('button');
  const actions = document.createElement('div');
  panel.append(actions, start, cancel);
  document.body.appendChild(panel);
  const flight = createSetupStartFlight({
    startButton: start,
    controls: () => [start, cancel],
    busyTarget: panel,
    mount: (status, error) => actions.append(status, error),
  });
  return {
    panel, start, cancel, flight,
    status: () => actions.querySelector('[role="status"]') as HTMLElement,
    error: () => actions.querySelector('[role="alert"]') as HTMLElement,
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };

describe('createSetupStartFlight', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('a synchronous start completes immediately and shows no busy state', () => {
    const { flight, panel, start } = setup();
    const onStarted = vi.fn();
    flight.settle(undefined, onStarted);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(panel.getAttribute('aria-busy')).toBeNull();
    expect(start.disabled).toBe(false);
  });

  it('a pending start locks Start and Cancel, announces progress, and waits to finish', async () => {
    const { flight, panel, start, cancel, status } = setup();
    const onStarted = vi.fn();
    const load = deferred();
    flight.settle(load.promise, onStarted);

    expect(start.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
    expect(panel.getAttribute('aria-busy')).toBe('true');
    expect(status().textContent).toBe(MAP_LOADING_MESSAGE);
    expect(onStarted).not.toHaveBeenCalled();

    load.resolve();
    await settle();
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(status().textContent).toBe('');
  });

  it('a second start while one is pending does nothing', async () => {
    const { flight } = setup();
    const first = vi.fn();
    const second = vi.fn();
    const load = deferred();
    flight.settle(load.promise, first);
    flight.settle(Promise.resolve(), second);
    load.resolve();
    await settle();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('a failed load shows a plain message, unlocks the controls, focuses Start, and can be retried', async () => {
    const { flight, start, cancel, error, panel } = setup();
    const onStarted = vi.fn();
    const failing = deferred();
    flight.settle(failing.promise, onStarted);
    failing.reject(new Error('Failed to fetch /assets/earth-map-x.json'));
    await settle();

    expect(error().hidden).toBe(false);
    expect(error().textContent).toBe(MAP_LOAD_FAILED_MESSAGE);
    expect(error().textContent).not.toContain('assets/');
    expect(start.disabled).toBe(false);
    expect(cancel.disabled).toBe(false);
    expect(panel.getAttribute('aria-busy')).toBe('false');
    expect(document.activeElement).toBe(start);
    expect(onStarted).not.toHaveBeenCalled();

    flight.settle(Promise.resolve(), onStarted);
    await settle();
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(error().hidden).toBe(true);
  });

  it('a game-creation failure shows its own typed message instead of the generic one', async () => {
    const { flight, error } = setup();
    const failing = deferred();
    flight.settle(failing.promise, vi.fn());
    const creationError = new GameCreationError(6, 4);
    failing.reject(creationError);
    await settle();
    expect(error().textContent).toBe(creationError.message);
    expect(error().textContent).not.toBe(MAP_LOAD_FAILED_MESSAGE);
  });
});

describe('campaign setup with a pending map load (#1456)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  function chooseCivAndOpenStart(onStartSolo: () => void | Promise<void>): HTMLElement {
    const panel = showCampaignSetup(document.body, { onStartSolo, onCancel: vi.fn() });
    Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Choose civilization')?.click();
    (document.querySelector('.civ-card') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    (document.querySelector('#civ-start') as HTMLButtonElement).click();
    return panel;
  }
  const startButton = () => Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Start Campaign') as HTMLButtonElement;

  it('keeps the screen up with a busy Start while the load runs, then closes it', async () => {
    const load = deferred();
    const onStartSolo = vi.fn(() => load.promise);
    const panel = chooseCivAndOpenStart(onStartSolo);

    startButton().click();
    expect(onStartSolo).toHaveBeenCalledTimes(1);
    expect(panel.isConnected).toBe(true);
    expect(panel.getAttribute('aria-busy')).toBe('true');
    expect(startButton().disabled).toBe(true);
    expect(panel.querySelector('[role="status"]')?.textContent).toBe(MAP_LOADING_MESSAGE);

    startButton().click(); // a disabled button gives a second start no way in
    expect(onStartSolo).toHaveBeenCalledTimes(1);

    load.resolve();
    await settle();
    expect(panel.isConnected).toBe(false);
  });

  it('stays open with an alert when the load fails, and Start retries', async () => {
    const attempts = [Promise.reject(new Error('offline')), Promise.resolve()];
    const onStartSolo = vi.fn(() => attempts.shift()!);
    const panel = chooseCivAndOpenStart(onStartSolo);

    startButton().click();
    await settle();
    expect(panel.isConnected).toBe(true);
    expect(panel.querySelector('[role="alert"]')?.textContent).toBe(MAP_LOAD_FAILED_MESSAGE);
    expect(startButton().disabled).toBe(false);

    startButton().click();
    await settle();
    expect(onStartSolo).toHaveBeenCalledTimes(2);
    expect(panel.isConnected).toBe(false);
  });

  it('a synchronous start still closes the screen straight away', () => {
    const onStartSolo = vi.fn();
    const panel = chooseCivAndOpenStart(onStartSolo);
    startButton().click();
    expect(onStartSolo).toHaveBeenCalledTimes(1);
    expect(panel.isConnected).toBe(false);
  });
});
