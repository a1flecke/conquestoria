import type { CustomCivDefinition } from '@/core/types';
import {
  buildCustomCivId,
  CUSTOM_CIV_PRIMARY_TRAITS,
  validateCustomCivDefinition,
} from '@/systems/custom-civ-system';
import { createSetupSection } from '@/ui/setup-shell';

export interface CustomCivPanelCallbacks {
  onSave: (def: CustomCivDefinition) => void;
  onCancel: () => void;
}

export interface CustomCivPanelOptions {
  existingDefinitions?: CustomCivDefinition[];
}

const TEMPERAMENT_TRAITS = [
  { id: 'aggressive', label: 'Aggressive' },
  { id: 'diplomatic', label: 'Diplomatic' },
  { id: 'expansionist', label: 'Expansionist' },
  { id: 'trader', label: 'Trader' },
] as const;

function createLabeledSection(title: string, sectionId?: string): HTMLDivElement {
  const section = document.createElement('div');
  if (sectionId) {
    section.dataset.section = sectionId;
  }
  section.style.display = 'flex';
  section.style.flexDirection = 'column';
  section.style.gap = '8px';

  const heading = document.createElement('label');
  heading.textContent = title;
  heading.style.fontSize = '0.95em';
  heading.style.fontWeight = '700';
  section.appendChild(heading);

  return section;
}

function createTextInput(field: string, type: string = 'text'): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.dataset.field = field;
  input.style.minHeight = '44px';
  input.style.minWidth = '44px';
  input.style.borderRadius = '10px';
  input.style.border = '1px solid rgba(255,255,255,0.25)';
  input.style.background = 'rgba(255,255,255,0.08)';
  input.style.color = '#f4f1e8';
  input.style.padding = '10px 12px';
  input.style.fontFamily = 'inherit';
  return input;
}

export function createCustomCivPanel(
  container: HTMLElement,
  callbacks: CustomCivPanelCallbacks,
  options: CustomCivPanelOptions = {},
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'custom-civ-panel';
  panel.style.position = 'absolute';
  panel.style.inset = '12px 12px 96px 12px';
  panel.style.zIndex = '20';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.gap = '14px';
  panel.style.padding = '16px';
  panel.style.borderRadius = '16px';
  panel.style.background = 'rgba(0,0,0,0.85)';
  panel.style.color = '#f4f1e8';
  panel.style.overflowY = 'auto';
  panel.style.maxHeight = 'calc(100vh - 108px)';
  panel.style.fontFamily = 'inherit';

  const header = document.createElement('div');
  header.dataset.role = 'setup-panel-header';
  header.style.display = 'flex';
  header.style.flexDirection = 'column';
  header.style.gap = '8px';
  panel.appendChild(header);

  const title = document.createElement('h2');
  title.textContent = 'Create Custom Civilization';
  title.style.margin = '0';
  title.style.fontSize = '1.1em';
  header.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.textContent = 'Shape a balanced custom civilization with one signature specialty and up to two temperament traits.';
  subtitle.style.margin = '0';
  subtitle.style.fontSize = '0.9em';
  header.appendChild(subtitle);

  const state = {
    civName: '',
    leaderName: '',
    color: '#4a90d9',
    cityNamesText: '',
    primaryTrait: '' as CustomCivDefinition['primaryTrait'] | '',
    temperamentTraits: [] as CustomCivDefinition['temperamentTraits'],
  };

  const traitBudget = document.createElement('p');
  traitBudget.textContent = 'Trait budget: 0 / 3';
  traitBudget.style.margin = '0';
  traitBudget.style.fontSize = '0.9em';
  panel.appendChild(traitBudget);

  const validationMessage = document.createElement('p');
  validationMessage.dataset.role = 'custom-civ-validation';
  validationMessage.style.margin = '0';
  validationMessage.style.fontSize = '0.85em';
  validationMessage.style.color = '#f2c572';
  panel.appendChild(validationMessage);

  const basicsSection = createSetupSection({
    title: 'Identity',
    description: 'Name your civilization, choose a leader, and set its banner color.',
    role: 'custom-civ-basics',
  });
  panel.appendChild(basicsSection.section);

  const civNameSection = createLabeledSection('Civilization Name');
  const civNameInput = createTextInput('civ-name');
  civNameSection.appendChild(civNameInput);
  basicsSection.content.appendChild(civNameSection);

  const leaderNameSection = createLabeledSection('Leader Name');
  const leaderNameInput = createTextInput('leader-name');
  leaderNameSection.appendChild(leaderNameInput);
  basicsSection.content.appendChild(leaderNameSection);

  const colorSection = createLabeledSection('Civilization Color');
  const colorInput = createTextInput('civ-color', 'color');
  colorInput.value = state.color;
  colorSection.appendChild(colorInput);
  basicsSection.content.appendChild(colorSection);

  const traitsSection = createSetupSection({
    title: 'Traits',
    description: 'Pick one signature strength and up to two temperament traits.',
    role: 'custom-civ-traits',
  });
  panel.appendChild(traitsSection.section);

  const primaryTraitSection = createLabeledSection('Primary Trait', 'primary-trait');
  primaryTraitSection.style.display = 'flex';
  primaryTraitSection.style.flexWrap = 'wrap';
  primaryTraitSection.style.gap = '8px';
  const primaryButtons = new Map<CustomCivDefinition['primaryTrait'], HTMLButtonElement>();
  for (const trait of CUSTOM_CIV_PRIMARY_TRAITS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = trait.label;
    button.style.minHeight = '44px';
    button.style.minWidth = '44px';
    button.style.padding = '10px 12px';
    button.style.borderRadius = '999px';
    button.style.border = '1px solid rgba(255,255,255,0.25)';
    button.style.background = 'rgba(255,255,255,0.08)';
    button.style.color = '#f4f1e8';
    button.addEventListener('click', () => {
      state.primaryTrait = trait.id;
      syncUi();
    });
    primaryButtons.set(trait.id, button);
    primaryTraitSection.appendChild(button);
  }
  traitsSection.content.appendChild(primaryTraitSection);

  const temperamentSection = createLabeledSection('Temperament Traits', 'temperament-traits');
  temperamentSection.style.display = 'flex';
  temperamentSection.style.flexWrap = 'wrap';
  temperamentSection.style.gap = '8px';
  const temperamentButtons = new Map<string, HTMLButtonElement>();
  for (const trait of TEMPERAMENT_TRAITS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = trait.label;
    button.style.minHeight = '44px';
    button.style.minWidth = '44px';
    button.style.padding = '10px 12px';
    button.style.borderRadius = '999px';
    button.style.border = '1px solid rgba(255,255,255,0.25)';
    button.style.background = 'rgba(255,255,255,0.08)';
    button.style.color = '#f4f1e8';
    button.addEventListener('click', () => {
      const alreadySelected = state.temperamentTraits.includes(trait.id);
      if (alreadySelected) {
        state.temperamentTraits = state.temperamentTraits.filter(entry => entry !== trait.id);
      } else if (state.temperamentTraits.length < 2) {
        state.temperamentTraits = [...state.temperamentTraits, trait.id];
      }
      syncUi();
    });
    temperamentButtons.set(trait.id, button);
    temperamentSection.appendChild(button);
  }
  traitsSection.content.appendChild(temperamentSection);

  const cityNamesShell = createSetupSection({
    title: 'City Names',
    description: 'Provide at least six settlement names, one per line.',
    role: 'custom-civ-city-names',
  });
  panel.appendChild(cityNamesShell.section);

  const cityNamesSection = createLabeledSection('City Names');
  const cityNamesInput = document.createElement('textarea');
  cityNamesInput.dataset.field = 'city-names';
  cityNamesInput.style.minHeight = '132px';
  cityNamesInput.style.minWidth = '44px';
  cityNamesInput.style.borderRadius = '10px';
  cityNamesInput.style.border = '1px solid rgba(255,255,255,0.25)';
  cityNamesInput.style.background = 'rgba(255,255,255,0.08)';
  cityNamesInput.style.color = '#f4f1e8';
  cityNamesInput.style.padding = '10px 12px';
  cityNamesInput.style.fontFamily = 'inherit';
  cityNamesSection.appendChild(cityNamesInput);
  cityNamesShell.content.appendChild(cityNamesSection);

  const actionBar = document.createElement('div');
  actionBar.style.display = 'flex';
  actionBar.style.flexDirection = 'row';
  actionBar.style.flexWrap = 'wrap';
  actionBar.style.gap = '10px';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.dataset.action = 'cancel-custom-civ';
  cancelButton.textContent = 'Cancel';
  cancelButton.style.minHeight = '44px';
  cancelButton.style.minWidth = '44px';
  cancelButton.style.padding = '10px 14px';
  cancelButton.style.borderRadius = '999px';
  cancelButton.style.border = '1px solid rgba(255,255,255,0.25)';
  cancelButton.style.background = 'transparent';
  cancelButton.style.color = '#f4f1e8';
  cancelButton.addEventListener('click', () => callbacks.onCancel());
  actionBar.appendChild(cancelButton);

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.dataset.action = 'save-custom-civ';
  saveButton.textContent = 'Save Civilization';
  saveButton.disabled = true;
  saveButton.style.minHeight = '44px';
  saveButton.style.minWidth = '44px';
  saveButton.style.padding = '10px 14px';
  saveButton.style.borderRadius = '999px';
  saveButton.style.border = '1px solid rgba(255,255,255,0.25)';
  saveButton.style.background = '#d9a441';
  saveButton.style.color = '#1f1400';
  actionBar.appendChild(saveButton);

  panel.appendChild(actionBar);

  function buildDefinition(): CustomCivDefinition {
    return {
      id: buildCustomCivId(state.civName, options.existingDefinitions ?? []),
      name: state.civName.trim(),
      color: state.color.trim(),
      leaderName: state.leaderName.trim(),
      cityNames: state.cityNamesText.split('\n').map(name => name.trim()).filter(Boolean),
      primaryTrait: state.primaryTrait as CustomCivDefinition['primaryTrait'],
      temperamentTraits: [...state.temperamentTraits],
    };
  }

  function syncUi(): void {
    traitBudget.textContent = `Trait budget: ${state.primaryTrait ? 1 + state.temperamentTraits.length : state.temperamentTraits.length} / 3`;

    for (const [traitId, button] of primaryButtons.entries()) {
      const selected = state.primaryTrait === traitId;
      button.dataset.selected = selected ? 'true' : 'false';
      button.style.background = selected ? 'rgba(217,164,65,0.28)' : 'rgba(255,255,255,0.08)';
      button.style.borderColor = selected ? '#d9a441' : 'rgba(255,255,255,0.25)';
    }

    for (const [traitId, button] of temperamentButtons.entries()) {
      const selected = state.temperamentTraits.includes(traitId as CustomCivDefinition['temperamentTraits'][number]);
      button.dataset.selected = selected ? 'true' : 'false';
      button.style.background = selected ? 'rgba(96,165,250,0.28)' : 'rgba(255,255,255,0.08)';
      button.style.borderColor = selected ? '#60a5fa' : 'rgba(255,255,255,0.25)';
    }

    try {
      const definition = buildDefinition();
      validateCustomCivDefinition(definition);
      saveButton.disabled = false;
      saveButton.dataset.ready = 'true';
      saveButton.style.opacity = '1';
      saveButton.style.cursor = 'pointer';
      saveButton.style.background = '#d9a441';
      saveButton.style.color = '#1f1400';
      saveButton.style.boxShadow = '0 10px 24px rgba(217,164,65,0.28)';
      validationMessage.style.color = '#9fe0a8';
      validationMessage.textContent = 'Ready to save.';
    } catch (error) {
      saveButton.disabled = true;
      saveButton.dataset.ready = 'false';
      saveButton.style.opacity = '0.45';
      saveButton.style.cursor = 'not-allowed';
      saveButton.style.background = 'rgba(255,255,255,0.12)';
      saveButton.style.color = 'rgba(244,241,232,0.68)';
      saveButton.style.boxShadow = 'none';
      validationMessage.style.color = '#f2c572';
      validationMessage.textContent = error instanceof Error ? error.message : 'Complete the form to save.';
    }
  }

  civNameInput.addEventListener('input', () => {
    state.civName = civNameInput.value;
    syncUi();
  });
  leaderNameInput.addEventListener('input', () => {
    state.leaderName = leaderNameInput.value;
    syncUi();
  });
  colorInput.addEventListener('input', () => {
    state.color = colorInput.value;
    syncUi();
  });
  cityNamesInput.addEventListener('input', () => {
    state.cityNamesText = cityNamesInput.value;
    syncUi();
  });
  saveButton.addEventListener('click', () => {
    const definition = buildDefinition();
    validateCustomCivDefinition(definition);
    callbacks.onSave(definition);
  });

  syncUi();
  container.appendChild(panel);
  return panel;
}
