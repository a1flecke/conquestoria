import type { CivDefinition } from '@/core/types';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';
import { createRng } from '@/systems/map-generator';

export interface CivSelectCallbacks {
  onSelect: (civId: string) => void;
  onCreateCustomCiv?: () => void;
}

export interface CivSelectOptions {
  disabledCivs?: string[];
  headerText?: string;
  civDefinitions?: CivDefinition[];
  primaryActionText?: string;
}

function createButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.minHeight = '44px';
  button.style.minWidth = '44px';
  button.style.padding = '10px 20px';
  button.style.borderRadius = '8px';
  button.style.border = '1px solid rgba(255,255,255,0.2)';
  button.style.cursor = 'pointer';
  button.style.fontSize = '13px';
  return button;
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
  const panel = document.createElement('div');
  panel.id = 'civ-select';
  panel.style.position = 'absolute';
  panel.style.top = '0';
  panel.style.left = '0';
  panel.style.right = '0';
  panel.style.bottom = '0';
  panel.style.background = 'rgba(15,15,25,0.98)';
  panel.style.zIndex = '50';
  panel.style.overflowY = 'auto';
  panel.style.padding = '16px';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.alignItems = 'center';

  let selectedCiv: string | null = null;

  const header = document.createElement('h1');
  header.dataset.text = 'header';
  header.textContent = headerText;
  header.style.fontSize = '22px';
  header.style.color = '#e8c170';
  header.style.margin = '24px 0 8px';
  header.style.textAlign = 'center';
  panel.appendChild(header);

  const subhead = document.createElement('p');
  subhead.textContent = 'Each civilization has a unique bonus that shapes your strategy.';
  subhead.style.fontSize = '13px';
  subhead.style.opacity = '0.6';
  subhead.style.marginBottom = '24px';
  subhead.style.textAlign = 'center';
  panel.appendChild(subhead);

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(2,1fr)';
  grid.style.gap = '12px';
  grid.style.maxWidth = '400px';
  grid.style.width = '100%';
  panel.appendChild(grid);

  const cards: HTMLElement[] = [];
  for (const civ of civDefinitions) {
    const card = document.createElement('div');
    card.className = 'civ-card';
    card.dataset.civId = civ.id;
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
      }
      card.style.borderColor = '#e8c170';
      startButton.disabled = false;
      startButton.style.opacity = '1';
    });

    cards.push(card);
    grid.appendChild(card);
  }

  const actionBar = document.createElement('div');
  actionBar.style.marginTop = '20px';
  actionBar.style.display = 'flex';
  actionBar.style.gap = '12px';
  actionBar.style.flexWrap = 'wrap';
  actionBar.style.justifyContent = 'center';
  panel.appendChild(actionBar);

  const randomButton = createButton('Random');
  randomButton.id = 'civ-random';
  randomButton.style.background = 'rgba(255,255,255,0.1)';
  randomButton.style.color = 'white';
  actionBar.appendChild(randomButton);

  if (callbacks.onCreateCustomCiv) {
    const createCustomButton = createButton('Create Custom Civilization');
    createCustomButton.dataset.action = 'create-custom-civ';
    createCustomButton.style.background = 'rgba(74,144,217,0.2)';
    createCustomButton.style.color = '#dbeafe';
    createCustomButton.addEventListener('click', () => callbacks.onCreateCustomCiv?.());
    actionBar.appendChild(createCustomButton);
  }

  const startButton = createButton(primaryActionText);
  startButton.id = 'civ-start';
  startButton.style.background = 'rgba(232,193,112,0.3)';
  startButton.style.border = '2px solid #e8c170';
  startButton.style.color = '#e8c170';
  startButton.style.fontSize = '14px';
  startButton.style.fontWeight = 'bold';
  startButton.style.opacity = '0.4';
  startButton.disabled = true;
  actionBar.appendChild(startButton);

  randomButton.addEventListener('click', () => {
    const available = civDefinitions.filter(civ => !disabledCivs.includes(civ.id));
    if (available.length === 0) return;
    const pickRng = createRng(`civ-pick-${Date.now()}`);
    const randomIdx = Math.floor(pickRng() * available.length);
    selectedCiv = available[randomIdx].id;
    for (const card of cards) {
      card.style.borderColor = card.dataset.civId === selectedCiv ? '#e8c170' : 'transparent';
    }
    startButton.disabled = false;
    startButton.style.opacity = '1';
  });

  startButton.addEventListener('click', () => {
    if (!selectedCiv) return;
    panel.remove();
    callbacks.onSelect(selectedCiv);
  });

  container.appendChild(panel);
  return panel;
}
