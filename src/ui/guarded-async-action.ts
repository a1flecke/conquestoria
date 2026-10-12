export interface GuardedAsyncActionOptions {
  /** Controls to lock while the action is pending; read fresh on every run. */
  controls: () => HTMLButtonElement[];
  /** Region that gets aria-busy while pending (role="status" text goes in `status`). */
  busyTarget: HTMLElement;
  /** Live region (role="status") for the pending message. */
  status: HTMLElement;
  /** Alert region (role="alert") for the failure message. */
  error: HTMLElement;
  pendingMessage: string;
  /** Player-facing failure copy. Never the raw error: it can carry storage internals. */
  failureMessage: string;
  /** Receives focus after a failure so keyboard users land on the retry. */
  focusOnError: () => HTMLElement | null;
}

export interface GuardedAsyncAction {
  /**
   * Runs `task` once at a time. Resolves true if it fulfilled, false if it
   * rejected or another run was already pending. Never rejects, so an event
   * handler can `void` it without leaving an unhandled rejection.
   * On success the controls stay locked: the owner decides what closes next.
   */
  run: (task: () => Promise<void> | void) => Promise<boolean>;
  isPending: () => boolean;
}

export function createGuardedAsyncAction(options: GuardedAsyncActionOptions): GuardedAsyncAction {
  let pending = false;
  return {
    isPending: () => pending,
    run: async task => {
      if (pending) return false;
      pending = true;
      const controls = options.controls();
      const priorDisabled = controls.map(control => control.disabled);
      controls.forEach(control => { control.disabled = true; });
      options.busyTarget.setAttribute('aria-busy', 'true');
      options.error.hidden = true;
      options.error.textContent = '';
      options.status.textContent = options.pendingMessage;
      try {
        await task();
        options.status.textContent = '';
        options.busyTarget.setAttribute('aria-busy', 'false');
        return true;
      } catch {
        controls.forEach((control, index) => { control.disabled = priorDisabled[index]; });
        options.status.textContent = '';
        options.busyTarget.setAttribute('aria-busy', 'false');
        options.error.textContent = options.failureMessage;
        options.error.hidden = false;
        options.focusOnError()?.focus();
        return false;
      } finally {
        pending = false;
      }
    },
  };
}
