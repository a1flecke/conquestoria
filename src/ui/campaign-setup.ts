import type { CivDefinition, CustomCivDefinition, SoloSetupConfig } from '@/core/types';
import { MAP_DIMENSIONS } from '@/core/game-state';
import { createCivSelectPanel } from '@/ui/civ-select';
import { createCustomCivPanel } from '@/ui/custom-civ-panel';
import { getPlayableCivDefinitions } from '@/systems/civ-registry';
import { buildCustomCivId, customCivDefinitionsEqual, mergeCustomCivDefinitions } from '@/systems/custom-civ-system';
import { createDefaultSettings } from '@/core/game-state';
import { loadSettings, saveSettings } from '@/storage/save-manager';

export interface CampaignSetupCallbacks {
  onStartSolo: (config: SoloSetupConfig) => void;
  onCancel: () => void;
  onCustomCivilizationsChanged?: (customCivilizations: CustomCivDefinition[]) => void;
  initialTitle?: string;
}

export interface CampaignSetupOptions {
  civDefinitions?: CivDefinition[];
  initialCustomCivilizations?: CustomCivDefinition[];
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

export function showCampaignSetup(container: HTMLElement, callbacks: CampaignSetupCallbacks, options?: CampaignSetupOptions): HTMLElement {
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
  let customCivilizations: CustomCivDefinition[] = [...(options?.initialCustomCivilizations ?? [])];
  let civDefinitions = getPlayableCivDefinitions({ customCivilizations });

  const replaceSetupOverlay = (render: () => void): void => {
    panel.querySelector('#custom-civ-panel')?.remove();
    panel.querySelector('#civ-select')?.remove();
    render();
  };

  const selectCivilization = (civId: string): void => {
    selectedCivId = civId;
    civSummary.textContent = `Civilization: ${civDefinitions.find(def => def.id === civId)?.name ?? civId}`;
  };

  const openCivPicker = (): void => {
    replaceSetupOverlay(() => {
      createCivSelectPanel(panel, {
        onSelect: selectCivilization,
        onCreateCustomCiv: () => {
          openCustomCivEditor();
        },
      }, {
        civDefinitions,
      });
    });
  };

  const openCustomCivEditor = (): void => {
    replaceSetupOverlay(() => {
      createCustomCivPanel(panel, {
        onSave: async (definition) => {
          const loaded = (await loadSettings()) ?? createDefaultSettings('small');
          const authoritativeCustomCivilizations = mergeCustomCivDefinitions(
            customCivilizations,
            loaded.customCivilizations ?? [],
          );
          const existingDefinition = authoritativeCustomCivilizations.find(def => def.id === definition.id);
          const resolvedDefinition = existingDefinition && !customCivDefinitionsEqual(existingDefinition, definition)
            ? { ...definition, id: buildCustomCivId(definition.name, authoritativeCustomCivilizations) }
            : definition;
          customCivilizations = mergeCustomCivDefinitions(authoritativeCustomCivilizations, [resolvedDefinition]);
          await saveSettings({ ...loaded, customCivilizations });
          callbacks.onCustomCivilizationsChanged?.([...customCivilizations]);
          civDefinitions = getPlayableCivDefinitions({ customCivilizations });
          openCivPicker();
        },
        onCancel: () => {
          openCivPicker();
        },
      }, {
        existingDefinitions: customCivilizations,
      });
    });
  };

  chooseCivButton.addEventListener('click', () => {
    openCivPicker();
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
      customCivilizations,
    });
  });
  buttonRow.appendChild(startButton);

  panel.appendChild(buttonRow);
  container.appendChild(panel);
  return panel;
}
