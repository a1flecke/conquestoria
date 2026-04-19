import type { CustomCivDefinition, SoloSetupConfig } from '@/core/types';
import { MAP_DIMENSIONS } from '@/core/game-state';
import { createCivSelectPanel } from '@/ui/civ-select';
import { createCustomCivPanel } from '@/ui/custom-civ-panel';
import { getPlayableCivDefinitions } from '@/systems/civ-registry';
import { buildCustomCivId, customCivDefinitionsEqual, mergeCustomCivDefinitions } from '@/systems/custom-civ-system';
import { createDefaultSettings } from '@/core/game-state';
import { loadSettings, saveSettings } from '@/storage/save-manager';
import { createSetupSection, createSetupShell } from '@/ui/setup-shell';

export interface CampaignSetupCallbacks {
  onStartSolo: (config: SoloSetupConfig) => void;
  onCancel: () => void;
  onCustomCivilizationsChanged?: (customCivilizations: CustomCivDefinition[]) => void;
  initialTitle?: string;
}

export interface CampaignSetupOptions {
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

  const shell = createSetupShell({
    panelId: 'campaign-setup',
    eyebrow: 'Solo Campaign',
    title: 'Build Your Campaign',
    subtitle: 'Choose your civilization, world size, and rival count before your people settle their first city.',
  });
  const panel = shell.surface;

  const hero = document.createElement('div');
  hero.dataset.role = 'setup-hero';
  hero.style.display = 'flex';
  hero.style.flexDirection = 'column';
  hero.style.gap = '16px';
  shell.body.appendChild(hero);

  const titleSection = createSetupSection({
    title: 'Campaign Title',
    description: 'Name this campaign before your first settlers arrive.',
  });
  hero.appendChild(titleSection.section);

  const titleLabel = document.createElement('label');
  titleLabel.htmlFor = 'campaign-title';
  titleLabel.textContent = 'Campaign title';
  titleSection.content.appendChild(titleLabel);

  const titleInput = document.createElement('input');
  titleInput.id = 'campaign-title';
  titleInput.type = 'text';
  titleInput.value = callbacks.initialTitle ?? 'New Campaign';
  Object.assign(titleInput.style, {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.08)',
    color: '#f4f1e8',
    fontSize: '14px',
  });
  titleSection.content.appendChild(titleInput);

  const civSection = createSetupSection({
    title: 'Civilization',
    description: 'Pick the culture you want to lead into the first age.',
    role: 'selected-civ-summary',
  });
  hero.appendChild(civSection.section);

  const civSummary = document.createElement('div');
  civSummary.textContent = 'No civilization selected yet';
  civSection.content.appendChild(civSummary);

  const chooseCivButton = document.createElement('button');
  chooseCivButton.type = 'button';
  chooseCivButton.dataset.action = 'choose-civ';
  chooseCivButton.textContent = 'Choose civilization';
  chooseCivButton.style.alignSelf = 'flex-start';
  civSection.content.appendChild(chooseCivButton);

  const mapSection = createSetupSection({
    title: 'Map size',
    description: 'Choose the world footprint for this campaign.',
  });
  hero.appendChild(mapSection.section);

  const mapSizeField = createLabeledSelect('Map size', 'campaign-map-size');
  for (const size of ['small', 'medium', 'large'] as const) {
    const option = document.createElement('option');
    option.value = size;
    option.textContent = size;
    mapSizeField.select.appendChild(option);
  }
  mapSection.content.appendChild(mapSizeField.wrapper);

  const opponentSection = createSetupSection({
    title: 'Opponents',
    description: 'Decide how many rival civilizations share the world with you.',
  });
  hero.appendChild(opponentSection.section);

  const opponentsField = createLabeledSelect('Opponents', 'campaign-opponents');
  opponentSection.content.appendChild(opponentsField.wrapper);

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

  const syncCampaignReadiness = (): void => {
    const gameTitle = titleInput.value.trim();
    const selectedDefinition = civDefinitions.find(def => def.id === selectedCivId);
    civSummary.textContent = selectedDefinition
      ? `Leading civilization: ${selectedDefinition.name}`
      : 'No civilization selected yet';
    startButton.disabled = !selectedCivId || !gameTitle;
  };

  const replaceSetupOverlay = (render: () => void): void => {
    panel.querySelector('#custom-civ-panel')?.remove();
    panel.querySelector('#civ-select')?.remove();
    render();
  };

  const selectCivilization = (civId: string): void => {
    selectedCivId = civId;
    syncCampaignReadiness();
  };

  const openCivPicker = (): void => {
    replaceSetupOverlay(() => {
      createCivSelectPanel(panel, {
        onSelect: selectCivilization,
        onCancel: () => {},
        onCreateCustomCiv: () => {
          openCustomCivEditor();
        },
      }, {
        civDefinitions,
        primaryActionText: 'Confirm Civilization',
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
          syncCampaignReadiness();
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
  startButton.disabled = true;
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

  shell.actions.appendChild(buttonRow);

  titleInput.addEventListener('input', syncCampaignReadiness);
  syncCampaignReadiness();
  container.appendChild(panel);
  return panel;
}
