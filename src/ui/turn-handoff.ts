import type { GameState } from '@/core/types';
import {
  clearEventsForPlayer,
  generateSummary,
  type TurnSummary,
} from '@/core/hotseat-events';
import { createEmptyOpponentAIState } from '@/core/opponent-ai-state';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { createGameButton, setButtonDisabled } from '@/ui/ui-kit';

export interface TurnHandoffOptions {
  initiallyReady: boolean;
  preparingLabel?: 'Preparing next turn…' | 'Saving campaign…';
  onReady: (summary: TurnSummary) => Promise<void> | void;
}

export interface TurnHandoffController {
  setReady(state: GameState): void;
  setError(
    message: string,
    callbacks: { onRetry: () => void; onReturnToSaves: () => void },
  ): void;
  remove(): void;
}

export interface TurnHandoffAcknowledgement {
  state: GameState;
  playStrategicWarningAudio: boolean;
}

export function acknowledgeTurnHandoffSummary(
  state: GameState,
  viewerId: string,
  summary: TurnSummary,
): TurnHandoffAcknowledgement {
  const hasStrategicWarning = summary.events.some(
    event => event.type === 'ai:strategic-warning',
  );
  const opponentAI = structuredClone(
    state.opponentAI ?? createEmptyOpponentAIState(),
  );
  const ledger = opponentAI.pressureByHuman[viewerId] ?? {
    activeIndependentThreatIds: [],
    recoveryUntilTurn: 0,
    lastResolvedThreatTurn: null,
    lastWarningTurnByKey: {},
    lastStrategicAudioTurn: null,
  };
  const playStrategicWarningAudio = hasStrategicWarning
    && ledger.lastStrategicAudioTurn !== summary.turn;
  if (hasStrategicWarning) {
    opponentAI.pressureByHuman[viewerId] = {
      ...ledger,
      lastStrategicAudioTurn: summary.turn,
    };
  }
  return {
    state: {
      ...state,
      pendingEvents: clearEventsForPlayer(state.pendingEvents ?? {}, viewerId),
      ...(hasStrategicWarning ? { opponentAI } : {}),
    },
    playStrategicWarningAudio,
  };
}

let activeHandoffController: TurnHandoffController | null = null;

function appendText(
  parent: HTMLElement,
  tagName: keyof HTMLElementTagNameMap,
  text: string,
): HTMLElement {
  const element = document.createElement(tagName);
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

export function showTurnHandoff(
  container: HTMLElement,
  state: GameState,
  nextCivId: string,
  playerName: string,
  options: TurnHandoffOptions,
): TurnHandoffController {
  activeHandoffController?.remove();

  let currentState = state;
  let ready = options.initiallyReady;
  let removed = false;
  let controller: TurnHandoffController;
  const civ = state.civilizations[nextCivId];
  const civDef = resolveCivDefinition(state, civ?.civType ?? '');
  const color = civ?.color ?? civDef?.color ?? '#e8c170';
  const accessibilityRoot = container.closest<HTMLElement>('#game-shell') ?? container;
  const previousAriaHidden = accessibilityRoot.getAttribute('aria-hidden');
  const previousInert = Boolean(accessibilityRoot.inert);
  accessibilityRoot.inert = true;
  accessibilityRoot.setAttribute('aria-hidden', 'true');

  const overlay = document.createElement('div');
  overlay.id = 'turn-handoff';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'turn-handoff-title');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'box-sizing:border-box',
    'background:#0a0a1e',
    'z-index:1001',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'overflow:hidden',
    'padding:16px',
  ].join(';');

  const safeAreaStyle = document.createElement('style');
  safeAreaStyle.textContent = [
    '#turn-handoff {',
    '  padding: max(16px, env(safe-area-inset-top))',
    '    max(16px, env(safe-area-inset-right))',
    '    max(16px, env(safe-area-inset-bottom))',
    '    max(16px, env(safe-area-inset-left));',
    '}',
  ].join('\n');
  overlay.appendChild(safeAreaStyle);

  const card = document.createElement('div');
  card.dataset.handoffCard = '';
  card.style.cssText = [
    'box-sizing:border-box',
    'width:100%',
    'max-width:520px',
    'max-height:min(90dvh, 720px)',
    'overflow-y:auto',
    'overflow-x:hidden',
    'overscroll-behavior:contain',
    'border:1px solid rgba(255,255,255,0.14)',
    'border-radius:16px',
    'background:#15182a',
    'color:#f4f1e8',
    'padding:clamp(16px, 4vw, 28px)',
    'text-align:center',
    'overflow-wrap:anywhere',
  ].join(';');
  overlay.appendChild(card);

  const restoreAccessibility = (): void => {
    accessibilityRoot.inert = previousInert;
    if (previousAriaHidden === null) accessibilityRoot.removeAttribute('aria-hidden');
    else accessibilityRoot.setAttribute('aria-hidden', previousAriaHidden);
  };

  const remove = (): void => {
    if (removed) return;
    removed = true;
    overlay.remove();
    restoreAccessibility();
    if (activeHandoffController === controller) activeHandoffController = null;
  };

  const trapFocus = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      overlay.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex]:not([tabindex="-1"])'),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      overlay.querySelector<HTMLElement>('#turn-handoff-title')?.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  overlay.addEventListener('keydown', trapFocus);

  let confirmButton: HTMLButtonElement;

  const renderPassTo = (): void => {
    card.replaceChildren();
    const avatar = appendText(card, 'div', '👤');
    avatar.style.cssText = `width:60px;height:60px;border-radius:50%;background:${color};margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:24px;`;
    const title = appendText(card, 'h2', 'Pass to');
    title.id = 'turn-handoff-title';
    title.tabIndex = -1;
    title.style.cssText = 'font-size:20px;margin:0 0 8px;color:#e8c170;';
    const name = appendText(card, 'h1', playerName);
    name.style.cssText = `font-size:clamp(22px, 7vw, 30px);margin:0 0 24px;color:${color};`;
    confirmButton = createGameButton(
      ready ? `I'm ${playerName}` : (options.preparingLabel ?? 'Preparing next turn…'),
      'primary',
      { disabled: !ready },
    );
    confirmButton.id = 'handoff-confirm';
    confirmButton.style.width = '100%';
    confirmButton.addEventListener('click', () => {
      if (ready) renderSummary();
    });
    card.appendChild(confirmButton);
    if (ready) confirmButton.focus();
    else title.focus();
  };

  const renderSummary = (): void => {
    const summary = generateSummary(currentState, nextCivId);
    const summaryCiv = currentState.civilizations[nextCivId];
    const warNames = summary.atWarWith.map(id => currentState.civilizations[id]?.name ?? id);
    const allyNames = summary.allies.map(id => currentState.civilizations[id]?.name ?? id);
    card.replaceChildren();

    const title = appendText(card, 'h2', playerName);
    title.id = 'turn-handoff-title';
    title.style.cssText = `font-size:20px;color:${color};margin:0 0 4px;`;
    appendText(card, 'p', `Turn ${summary.turn} · Era ${summary.era}`)
      .style.cssText = 'font-size:13px;opacity:0.7;margin:0 0 16px;';

    const facts = document.createElement('div');
    facts.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:16px;text-align:left;';
    for (const [label, value] of [
      ['Gold', String(summary.gold)],
      ['Cities', String(summary.cities)],
      ['Units', String(summary.units)],
      ['Research', summary.currentResearch ?? 'None'],
    ]) {
      const fact = document.createElement('div');
      fact.style.cssText = 'min-width:0;background:rgba(255,255,255,0.06);border-radius:8px;padding:10px;';
      appendText(fact, 'strong', value).style.cssText = 'display:block;';
      appendText(fact, 'span', label).style.cssText = 'font-size:11px;opacity:0.65;';
      facts.appendChild(fact);
    }
    card.appendChild(facts);

    const diplomacy = document.createElement('div');
    diplomacy.style.cssText = 'text-align:left;margin-bottom:12px;font-size:12px;';
    appendText(diplomacy, 'p', `⚔️ At war: ${warNames.join(', ') || 'None'}`).style.margin = '0 0 4px';
    appendText(diplomacy, 'p', `🤝 Allies: ${allyNames.join(', ') || 'None'}`).style.margin = '0';
    card.appendChild(diplomacy);

    const events = document.createElement('div');
    events.dataset.handoffSummaryEvents = '';
    events.style.cssText = 'text-align:left;background:rgba(255,255,255,0.04);border-radius:8px;padding:10px;margin-bottom:16px;';
    appendText(events, 'strong', 'Since your last turn:').style.cssText = 'display:block;color:#e8c170;margin-bottom:6px;';
    if (summary.events.length === 0) {
      appendText(events, 'p', 'Nothing notable happened.').style.cssText = 'font-size:12px;opacity:0.6;margin:0;';
    } else {
      for (const event of summary.events) {
        appendText(events, 'p', `• ${event.message}`).style.cssText = 'font-size:12px;margin:0;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);';
      }
    }
    card.appendChild(events);

    const openError = document.createElement('p');
    openError.setAttribute('role', 'alert');
    openError.hidden = true;
    openError.style.cssText = 'margin:0 0 8px;color:#ffb4ab;font-size:12px;font-weight:600;';
    card.appendChild(openError);

    const start = createGameButton('Start Turn', 'primary');
    start.id = 'handoff-start';
    start.style.width = '100%';
    start.addEventListener('click', async () => {
      if (start.disabled) return;
      setButtonDisabled(start, true);
      start.textContent = 'Opening turn…';
      openError.replaceChildren();
      openError.hidden = true;
      try {
        await options.onReady(summary);
        remove();
      } catch {
        openError.textContent = 'Could not open the turn. Please try again.';
        openError.hidden = false;
        start.textContent = 'Try Again';
        setButtonDisabled(start, false);
        start.focus();
      }
    });
    card.appendChild(start);
    start.focus();

    if (!summaryCiv) setButtonDisabled(start, true);
  };

  const setError: TurnHandoffController['setError'] = (message, callbacks) => {
    ready = false;
    card.replaceChildren();
    const title = appendText(card, 'h2', 'Handoff paused');
    title.id = 'turn-handoff-title';
    title.tabIndex = -1;
    title.style.cssText = 'margin:0 0 8px;color:#e8c170;';
    appendText(card, 'p', message).style.cssText = 'margin:0 0 16px;line-height:1.45;';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;';
    let actionStarted = false;
    const retry = createGameButton('Retry', 'primary');
    retry.dataset.action = 'retry-handoff';
    retry.addEventListener('click', () => {
      if (actionStarted) return;
      actionStarted = true;
      setButtonDisabled(retry, true);
      setButtonDisabled(returnButton, true);
      retry.textContent = 'Retrying…';
      callbacks.onRetry();
    });
    const returnButton = createGameButton('Return to Saves', 'ghost');
    returnButton.dataset.action = 'return-to-saves';
    returnButton.addEventListener('click', () => {
      if (actionStarted) return;
      actionStarted = true;
      setButtonDisabled(retry, true);
      setButtonDisabled(returnButton, true);
      remove();
      callbacks.onReturnToSaves();
    });
    actions.append(retry, returnButton);
    card.appendChild(actions);
    retry.focus();
  };

  const mount = container.ownerDocument.body ?? container;
  mount.appendChild(overlay);
  renderPassTo();

  controller = {
    setReady(updatedState) {
      currentState = updatedState;
      ready = true;
      if (confirmButton?.isConnected) {
        confirmButton.textContent = `I'm ${playerName}`;
        setButtonDisabled(confirmButton, false);
        confirmButton.focus();
      } else {
        renderPassTo();
      }
    },
    setError,
    remove,
  };
  activeHandoffController = controller;
  return controller;
}
