/**
 * Start-game feedback shared by the solo and hot-seat setup screens (#1456).
 *
 * Starting a campaign on a geographic map first loads that map's data, so the start callback may now return a
 * promise. A synchronous start (any non-geographic map, or data already loaded) behaves exactly as before. A
 * pending start locks the Start and Cancel controls, shows "Loading map…" in a status region and `aria-busy`
 * on the panel, and exactly one start can be in flight. If it fails, the typed game-creation message is shown
 * when there is one, otherwise a plain "could not load the map" line; the controls come back and focus returns
 * to Start so pressing it again retries. The game is never started on a different map.
 */
import { GameCreationError } from '@/core/game-state';
import { createGuardedAsyncAction } from '@/ui/guarded-async-action';

export const MAP_LOADING_MESSAGE = 'Loading map…';
export const MAP_LOAD_FAILED_MESSAGE = 'The map data could not be loaded. Check your connection, then press Start again.';

export interface SetupStartFlightOptions {
  readonly startButton: HTMLButtonElement;
  /** Everything that must not be used while the start is pending (Start, Cancel). Read fresh each run. */
  readonly controls: () => HTMLButtonElement[];
  readonly busyTarget: HTMLElement;
  /** Appends the status and error regions where this screen wants them. */
  readonly mount: (status: HTMLElement, error: HTMLElement) => void;
}

export interface SetupStartFlight {
  /**
   * Hands over the start callback's return value. A promise is awaited under the busy/error contract and
   * `onStarted` runs once it fulfils; anything else means the start already happened and `onStarted` runs now.
   */
  settle(result: void | PromiseLike<void>, onStarted: () => void): void;
}

function isThenable(value: unknown): value is PromiseLike<void> {
  return typeof value === 'object' && value !== null && typeof (value as PromiseLike<void>).then === 'function';
}

export function createSetupStartFlight(options: SetupStartFlightOptions): SetupStartFlight {
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.dataset.role = 'setup-start-status';
  status.style.cssText = 'color:#c9d2e0;font-size:12px;margin:0 0 8px;min-height:1em;';

  const error = document.createElement('p');
  error.setAttribute('role', 'alert');
  error.dataset.role = 'setup-error';
  error.hidden = true;
  error.style.cssText = 'color:#ffb4ab;font-size:12px;font-weight:bold;margin:0 0 8px;';
  options.mount(status, error);

  const action = createGuardedAsyncAction({
    controls: options.controls,
    busyTarget: options.busyTarget,
    status,
    error,
    pendingMessage: MAP_LOADING_MESSAGE,
    failureMessage: failure => (failure instanceof GameCreationError ? failure.message : MAP_LOAD_FAILED_MESSAGE),
    focusOnError: () => options.startButton,
  });

  return {
    settle(result, onStarted) {
      if (!isThenable(result)) {
        onStarted();
        return;
      }
      void action.run(async () => {
        await result;
        onStarted();
      });
    },
  };
}
