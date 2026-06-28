import type { OpponentChallenge } from '@/core/types';
import { createGameButton } from '@/ui/ui-kit';

export const OPPONENT_CHALLENGE_COPY = {
  explorer: {
    label: 'Explorer',
    description: 'Clear warnings, smaller attacks, and more time to recover.',
  },
  standard: {
    label: 'Standard',
    badge: 'Recommended',
    description: 'Purposeful rivals, coordinated attacks, and fair breathing room.',
  },
  veteran: {
    label: 'Veteran',
    description: 'Faster plans, stronger coordination, and fewer tactical mistakes.',
  },
} as const;

const CHALLENGES: OpponentChallenge[] = ['explorer', 'standard', 'veteran'];

export interface OpponentChallengeSelectorOptions {
  selected: OpponentChallenge | null;
  onSelect: (challenge: OpponentChallenge) => void;
  mode: 'new-game' | 'migration' | 'settings';
}

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

export function createOpponentChallengeSelector(
  options: OpponentChallengeSelectorOptions,
): HTMLElement {
  const selector = document.createElement('div');
  selector.className = 'opponent-challenge-grid';
  selector.dataset.opponentChallengeSelector = options.mode;
  selector.setAttribute('role', 'group');
  selector.setAttribute('aria-label', 'Opponent challenge');
  selector.style.cssText = [
    'display:grid',
    'grid-template-columns:minmax(0, 1fr)',
    'gap:12px',
    'width:100%',
    'min-width:0',
  ].join(';');

  const responsiveStyle = document.createElement('style');
  responsiveStyle.textContent = [
    '@media (min-width: 720px) {',
    '  .opponent-challenge-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }',
    '}',
  ].join('\n');
  selector.appendChild(responsiveStyle);

  let selected = options.selected ?? (options.mode === 'new-game' ? 'standard' : null);
  const buttons = new Map<OpponentChallenge, HTMLButtonElement>();

  const refreshSelection = (): void => {
    for (const [challenge, button] of buttons) {
      const isSelected = challenge === selected;
      button.setAttribute('aria-pressed', String(isSelected));
      button.style.borderColor = isSelected ? '#e8c170' : 'rgba(232,193,112,0.45)';
      button.style.background = isSelected
        ? 'rgba(232,193,112,0.18)'
        : 'rgba(255,255,255,0.08)';
      button.style.boxShadow = isSelected ? '0 0 0 2px rgba(232,193,112,0.22)' : 'none';
    }
  };

  for (const challenge of CHALLENGES) {
    const copy = OPPONENT_CHALLENGE_COPY[challenge];
    const button = createGameButton('', 'secondary');
    button.dataset.challenge = challenge;
    button.setAttribute('aria-pressed', 'false');
    button.style.cssText += [
      'display:flex',
      'flex-direction:column',
      'align-items:flex-start',
      'justify-content:flex-start',
      'gap:6px',
      'width:100%',
      'min-height:44px',
      'height:auto',
      'padding:14px',
      'text-align:left',
      'white-space:normal',
    ].join(';');

    const heading = document.createElement('span');
    heading.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-weight:700;';
    appendText(heading, 'span', copy.label);
    if ('badge' in copy) {
      const badge = appendText(heading, 'span', copy.badge);
      badge.style.cssText = [
        'border-radius:999px',
        'background:#e8c170',
        'color:#1f1a12',
        'padding:2px 7px',
        'font-size:0.72rem',
        'font-weight:700',
      ].join(';');
    }
    button.appendChild(heading);

    const description = appendText(button, 'span', copy.description);
    description.style.cssText = 'color:rgba(244,241,232,0.82);font-size:0.9rem;line-height:1.35;';
    button.addEventListener('click', () => {
      selected = challenge;
      refreshSelection();
      options.onSelect(challenge);
    });
    buttons.set(challenge, button);
    selector.appendChild(button);
  }

  refreshSelection();
  return selector;
}
