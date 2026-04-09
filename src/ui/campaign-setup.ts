import type { SoloSetupConfig } from '@/core/types';
import { MAP_DIMENSIONS } from '@/core/game-state';
import { createCivSelectPanel } from '@/ui/civ-select';
import { getCivDefinition } from '@/systems/civ-definitions';

export interface CampaignSetupCallbacks {
  onStartSolo: (config: SoloSetupConfig) => void;
  onCancel: () => void;
  initialTitle?: string;
}

function createLabeledSelect(labelText: string, id: string): { wrapper: HTMLDivElement; select: HTMLSelectElement } {
  const wrapper = document.createElement('div');

  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  wrapper.appendChild(label);

  const select = document.createElement('select');
  select.id = id;
  wrapper.appendChild(select);

  return { wrapper, select };
}

export function showCampaignSetup(container: HTMLElement, callbacks: CampaignSetupCallbacks): HTMLElement {
  container.querySelector('#campaign-setup')?.remove();

  const panel = document.createElement('div');
  panel.id = 'campaign-setup';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(10,10,30,0.98);z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:16px;';

  const title = document.createElement('h1');
  title.textContent = 'Build Your Campaign';
  panel.appendChild(title);

  const titleLabel = document.createElement('label');
  titleLabel.htmlFor = 'campaign-title';
  titleLabel.textContent = 'Campaign title';
  panel.appendChild(titleLabel);

  const titleInput = document.createElement('input');
  titleInput.id = 'campaign-title';
  titleInput.type = 'text';
  titleInput.value = callbacks.initialTitle ?? 'New Campaign';
  panel.appendChild(titleInput);

  const civSummary = document.createElement('div');
  civSummary.dataset.role = 'selected-civ';
  civSummary.textContent = 'No civilization selected yet';
  panel.appendChild(civSummary);

  const chooseCivButton = document.createElement('button');
  chooseCivButton.type = 'button';
  chooseCivButton.dataset.action = 'choose-civ';
  chooseCivButton.textContent = 'Choose civilization';
  panel.appendChild(chooseCivButton);

  const mapSizeField = createLabeledSelect('Map size', 'campaign-map-size');
  for (const size of ['small', 'medium', 'large'] as const) {
    const option = document.createElement('option');
    option.value = size;
    option.textContent = size;
    mapSizeField.select.appendChild(option);
  }
  panel.appendChild(mapSizeField.wrapper);

  const opponentsField = createLabeledSelect('Opponents', 'campaign-opponents');
  panel.appendChild(opponentsField.wrapper);

  const refreshOpponentOptions = (): void => {
    const mapSize = mapSizeField.select.value as 'small' | 'medium' | 'large';
    const maxOpponents = MAP_DIMENSIONS[mapSize].maxPlayers - 1;
    const currentValue = opponentsField.select.value;
    opponentsField.select.textContent = '';
    for (let count = 1; count <= maxOpponents; count++) {
      const option = document.createElement('option');
      option.value = String(count);
      option.textContent = String(count);
      opponentsField.select.appendChild(option);
    }
    opponentsField.select.value = currentValue && Number(currentValue) <= maxOpponents ? currentValue : '1';
  };

  refreshOpponentOptions();
  mapSizeField.select.addEventListener('change', refreshOpponentOptions);

  let selectedCivId: string | null = null;
  chooseCivButton.addEventListener('click', () => {
    createCivSelectPanel(panel, {
      onSelect: (civId) => {
        selectedCivId = civId;
        civSummary.textContent = `Civilization: ${getCivDefinition(civId)?.name ?? civId}`;
      },
    });
  });

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:12px;';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => {
    panel.remove();
    callbacks.onCancel();
  });
  buttonRow.appendChild(cancelButton);

  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.textContent = 'Start Campaign';
  startButton.addEventListener('click', () => {
    if (!selectedCivId) {
      return;
    }
    const gameTitle = titleInput.value.trim();
    if (!gameTitle) {
      return;
    }
    panel.remove();
    callbacks.onStartSolo({
      civType: selectedCivId,
      mapSize: mapSizeField.select.value as 'small' | 'medium' | 'large',
      opponentCount: Number(opponentsField.select.value),
      gameTitle,
    });
  });
  buttonRow.appendChild(startButton);

  panel.appendChild(buttonRow);
  container.appendChild(panel);
  return panel;
}
