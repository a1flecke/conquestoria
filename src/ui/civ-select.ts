import type { CivDefinition } from '@/core/types';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';
import { createRng } from '@/systems/map-generator';
import { createSetupShell } from '@/ui/setup-shell';
import { createGameButton, setButtonDisabled } from '@/ui/ui-kit';

export interface CivSelectCallbacks {
  onSelect: (civId: string) => void;
  onCreateCustomCiv?: () => void;
  onCancel?: () => void;
}

export interface CivSelectOptions {
  disabledCivs?: string[];
  headerText?: string;
  civDefinitions?: CivDefinition[];
  primaryActionText?: string;
}

export function createCivSelectPanel(
  container: HTMLElement,
  callbacks: CivSelectCallbacks,
  options?: CivSelectOptions,
): HTMLElement {
  const disabledCivs = options?.disabledCivs ?? [];
  const headerText = options?.headerText ?? 'Choose Your Civilization';
  const civDefinitions = options?.civDefinitions ?? CIV_DEFINITIONS;
  const primaryActionText = options?.primaryActionText ?? 'Start Game';
  const shell = createSetupShell({
    panelId: 'civ-select',
    eyebrow: 'Solo Campaign',
    title: headerText,
    subtitle: 'Each civilization has a distinct bonus that shapes your opening strategy.',
  });
  const panel = shell.surface;

  let selectedCiv: string | null = null;

  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(2,1fr)',
    gap: '12px',
    width: '100%',
  });
  shell.body.appendChild(grid);

  const cards: HTMLElement[] = [];
  for (const civ of civDefinitions) {
    const card = document.createElement('div');
    card.className = 'civ-card';
    card.dataset.civId = civ.id;
    card.dataset.selected = 'false';
    card.style.background = 'rgba(255,255,255,0.08)';
    card.style.border = '2px solid transparent';
    card.style.borderRadius = '12px';
    card.style.padding = '14px';
    card.style.cursor = 'pointer';
    card.style.transition = 'border-color 0.2s';
    card.style.minHeight = '44px';
    card.style.minWidth = '44px';

    const isDisabled = disabledCivs.includes(civ.id);
    if (isDisabled) {
      card.style.opacity = '0.3';
      card.style.pointerEvents = 'none';
    }

    const accent = document.createElement('div');
    accent.style.width = '100%';
    accent.style.height = '4px';
    accent.style.background = civ.color;
    accent.style.borderRadius = '2px';
    accent.style.marginBottom = '10px';
    card.appendChild(accent);

    const name = document.createElement('div');
    name.textContent = civ.name;
    name.style.fontWeight = 'bold';
    name.style.fontSize = '15px';
    name.style.color = civ.color;
    card.appendChild(name);

    const bonusName = document.createElement('div');
    bonusName.textContent = civ.bonusName;
    bonusName.style.fontSize = '12px';
    bonusName.style.color = '#e8c170';
    bonusName.style.marginTop = '4px';
    card.appendChild(bonusName);

    const bonusDescription = document.createElement('div');
    bonusDescription.textContent = civ.bonusDescription;
    bonusDescription.style.fontSize = '11px';
    bonusDescription.style.opacity = '0.7';
    bonusDescription.style.marginTop = '4px';
    card.appendChild(bonusDescription);

    const traits = document.createElement('div');
    traits.textContent = civ.personality.traits.join(', ');
    traits.style.fontSize = '10px';
    traits.style.opacity = '0.4';
    traits.style.marginTop = '6px';
    card.appendChild(traits);

    card.addEventListener('click', () => {
      selectedCiv = civ.id;
      for (const otherCard of cards) {
        otherCard.style.borderColor = 'transparent';
        otherCard.dataset.selected = 'false';
        otherCard.setAttribute('aria-pressed', 'false');
      }
      card.style.borderColor = '#e8c170';
      card.dataset.selected = 'true';
      card.setAttribute('aria-pressed', 'true');
      setButtonDisabled(startButton, false);
    });

    cards.push(card);
    grid.appendChild(card);
  }

  const actionBar = document.createElement('div');
  Object.assign(actionBar.style, {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  });
  shell.actions.appendChild(actionBar);

  if (callbacks.onCancel) {
    const cancelButton = createGameButton('Back', 'ghost');
    cancelButton.dataset.action = 'cancel-civ-select';
    cancelButton.addEventListener('click', () => {
      panel.remove();
      callbacks.onCancel?.();
    });
    actionBar.appendChild(cancelButton);
  }

  const randomButton = createGameButton('Surprise Me', 'secondary');
  randomButton.id = 'civ-random';
  actionBar.appendChild(randomButton);

  if (callbacks.onCreateCustomCiv) {
    const createCustomButton = createGameButton('Create Custom Civilization', 'secondary');
    createCustomButton.dataset.action = 'create-custom-civ';
    createCustomButton.addEventListener('click', () => callbacks.onCreateCustomCiv?.());
    actionBar.appendChild(createCustomButton);
  }

  const startButton = createGameButton(primaryActionText, 'primary', { disabled: true });
  startButton.id = 'civ-start';
  actionBar.appendChild(startButton);

  randomButton.addEventListener('click', () => {
    const available = civDefinitions.filter(civ => !disabledCivs.includes(civ.id));
    if (available.length === 0) return;
    const pickRng = createRng(`civ-pick-${Date.now()}`);
    const randomIdx = Math.floor(pickRng() * available.length);
    selectedCiv = available[randomIdx].id;
    for (const card of cards) {
      const selected = card.dataset.civId === selectedCiv;
      card.style.borderColor = selected ? '#e8c170' : 'transparent';
      card.dataset.selected = selected ? 'true' : 'false';
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
    setButtonDisabled(startButton, false);
  });

  startButton.addEventListener('click', () => {
    if (!selectedCiv) return;
    panel.remove();
    callbacks.onSelect(selectedCiv);
  });

  container.appendChild(panel);
  return panel;
}
