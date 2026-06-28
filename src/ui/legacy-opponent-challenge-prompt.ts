import type { OpponentChallenge } from '@/core/types';
import { createOpponentChallengeSelector } from '@/ui/opponent-challenge-selector';
import { createGameButton, setButtonDisabled } from '@/ui/ui-kit';

export interface LegacyOpponentChallengePromptOptions {
  hotSeat: boolean;
  returnFocusTo?: HTMLElement;
  onContinue: (challenge: OpponentChallenge) => Promise<void>;
  onCancel: () => void;
}

function appendParagraph(parent: HTMLElement, text: string): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  paragraph.style.cssText = 'margin:0;color:rgba(244,241,232,0.82);line-height:1.45;';
  parent.appendChild(paragraph);
  return paragraph;
}

function getFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  ));
}

export function showLegacyOpponentChallengePrompt(
  container: HTMLElement,
  options: LegacyOpponentChallengePromptOptions,
): HTMLElement {
  container.querySelector('#legacy-opponent-challenge-prompt')?.remove();

  const panel = document.createElement('div');
  panel.id = 'legacy-opponent-challenge-prompt';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'legacy-opponent-challenge-title');
  panel.setAttribute('aria-describedby', 'legacy-opponent-challenge-description');
  panel.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:1000',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'box-sizing:border-box',
    'background:rgba(7,9,16,0.88)',
    'padding:max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
  ].join(';');

  const dialog = document.createElement('div');
  dialog.dataset.legacyChallengeDialog = '';
  dialog.style.cssText = [
    'box-sizing:border-box',
    'width:min(960px, 100%)',
    'max-height:min(90dvh, 720px)',
    'overflow-y:auto',
    'overscroll-behavior:contain',
    'border:1px solid rgba(232,193,112,0.45)',
    'border-radius:14px',
    'background:#141827',
    'color:#f4f1e8',
    'box-shadow:0 24px 64px rgba(0,0,0,0.55)',
    'padding:16px',
  ].join(';');
  panel.appendChild(dialog);

  const safeAreaStyle = document.createElement('style');
  safeAreaStyle.textContent = [
    '#legacy-opponent-challenge-prompt [data-legacy-challenge-dialog] {',
    '  padding: max(16px, env(safe-area-inset-top))',
    '    max(16px, env(safe-area-inset-right))',
    '    max(16px, env(safe-area-inset-bottom))',
    '    max(16px, env(safe-area-inset-left));',
    '}',
  ].join('\n');
  dialog.appendChild(safeAreaStyle);

  const title = document.createElement('h2');
  title.id = 'legacy-opponent-challenge-title';
  title.tabIndex = -1;
  title.textContent = 'Choose Opponent Challenge';
  title.style.cssText = 'margin:0 0 8px;font-size:clamp(1.35rem,4vw,2rem);';
  dialog.appendChild(title);

  const description = appendParagraph(
    dialog,
    'This campaign was created before opponent difficulty was added. Choose how computer rivals and roaming threats should behave.',
  );
  description.id = 'legacy-opponent-challenge-description';
  description.style.marginBottom = '16px';

  let selected: OpponentChallenge | null = null;
  const selector = createOpponentChallengeSelector({
    selected: null,
    mode: 'migration',
    onSelect: challenge => {
      selected = challenge;
      setButtonDisabled(continueButton, false);
      alert.replaceChildren();
    },
  });
  dialog.appendChild(selector);

  const fairness = document.createElement('div');
  fairness.style.cssText = 'display:grid;gap:6px;margin-top:16px;';
  appendParagraph(fairness, 'Combat rules and bonuses remain the same.');
  if (options.hotSeat) {
    appendParagraph(
      fairness,
      'This choice applies to computer-controlled opponents for everyone in this campaign.',
    );
  }
  dialog.appendChild(fairness);

  const alert = document.createElement('p');
  alert.setAttribute('role', 'alert');
  alert.style.cssText = 'min-height:1.4em;margin:12px 0 0;color:#ffb4ab;font-weight:600;';
  dialog.appendChild(alert);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;margin-top:12px;';
  const cancelButton = createGameButton('Cancel', 'ghost');
  cancelButton.dataset.action = 'cancel';
  const continueButton = createGameButton('Continue Campaign', 'primary', { disabled: true });
  continueButton.dataset.action = 'continue';
  actions.append(cancelButton, continueButton);
  dialog.appendChild(actions);

  let busy = false;
  let closed = false;

  const restoreFocus = (): void => {
    if (options.returnFocusTo?.isConnected) options.returnFocusTo.focus();
  };

  const close = (notifyCancel: boolean): void => {
    if (closed) return;
    closed = true;
    panel.remove();
    restoreFocus();
    if (notifyCancel) options.onCancel();
  };

  const setBusy = (nextBusy: boolean): void => {
    busy = nextBusy;
    panel.setAttribute('aria-busy', String(nextBusy));
    for (const button of selector.querySelectorAll<HTMLButtonElement>('[data-challenge]')) {
      setButtonDisabled(button, nextBusy);
    }
    setButtonDisabled(cancelButton, nextBusy);
    setButtonDisabled(continueButton, nextBusy || selected === null);
    continueButton.textContent = nextBusy ? 'Saving…' : 'Continue Campaign';
  };

  cancelButton.addEventListener('click', () => {
    if (!busy) close(true);
  });
  continueButton.addEventListener('click', async () => {
    if (busy || selected === null) return;
    alert.replaceChildren();
    setBusy(true);
    try {
      await options.onContinue(selected);
      close(false);
    } catch {
      if (closed) return;
      setBusy(false);
      alert.textContent = 'Could not save your choice. Check available storage and try again.';
      continueButton.focus();
    }
  });

  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!busy) close(true);
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(panel);
    if (focusable.length === 0) {
      event.preventDefault();
      title.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === title || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  container.appendChild(panel);
  title.focus();
  return panel;
}
