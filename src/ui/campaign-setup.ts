import type { BeastsMode, CustomCivDefinition, SoloSetupConfig, MapScript, OpponentChallenge } from '@/core/types';
import { MAP_DIMENSIONS } from '@/core/game-state';
import { createCivSelectPanel } from '@/ui/civ-select';
import { createCustomCivPanel } from '@/ui/custom-civ-panel';
import { getPlayableCivDefinitions } from '@/systems/civ-registry';
import { buildCustomCivId, customCivDefinitionsEqual, mergeCustomCivDefinitions } from '@/systems/custom-civ-system';
import { createDefaultSettings } from '@/core/game-state';
import { loadSettings, saveSettings } from '@/storage/save-manager';
import { createSetupSection, createSetupShell } from '@/ui/setup-shell';
import { createGameButton, setButtonDisabled } from '@/ui/ui-kit';
import { createOpponentChallengeSelector } from '@/ui/opponent-challenge-selector';

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

function createChoiceButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  Object.assign(button.style, {
    minHeight: '44px',
    minWidth: '44px',
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.08)',
    color: '#f4f1e8',
    cursor: 'pointer',
    fontSize: '14px',
    textTransform: 'capitalize',
  });
  button.textContent = label;
  return button;
}

function syncChoiceButtonState(button: HTMLButtonElement, selected: boolean): void {
  button.dataset.selected = selected ? 'true' : 'false';
  button.style.borderColor = selected ? '#e8c170' : 'rgba(255,255,255,0.18)';
  button.style.background = selected ? 'rgba(232,193,112,0.16)' : 'rgba(255,255,255,0.08)';
  button.style.color = selected ? '#f7f1d7' : '#f4f1e8';
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

  const chooseCivButton = createGameButton('Choose civilization', 'secondary');
  chooseCivButton.dataset.action = 'choose-civ';
  chooseCivButton.style.alignSelf = 'flex-start';
  civSection.content.appendChild(chooseCivButton);

  const mapSection = createSetupSection({
    title: 'Map',
    description: 'Choose your world and its size.',
  });
  hero.appendChild(mapSection.section);

  const MAP_SCRIPT_LABELS: Record<string, { emoji: string; label: string; description: string }> = {
    earth: {
      emoji: '🌍', label: 'Earth',
      description: 'Real-world geography. Civilizations start near their historical homelands; fantasy and out-of-region civs get good constrained starts. Resources follow real-world distribution.',
    },
    'old-world': {
      emoji: '🗺️', label: 'Old World',
      description: 'Europe, Asia, and Africa. Historical civilizations start at their homelands. Best for Old World civs — Aztec gets a constrained random start. Resources follow real-world distribution.',
    },
    'new-world': {
      emoji: '🌎', label: 'New World',
      description: 'North and South America. Aztec starts in Central Mexico. England and France land on the eastern seaboard; Spain lands on the Gulf of Mexico; Viking land in Newfoundland. Other civs get a constrained random start.',
    },
    balanced: {
      emoji: '⚖️', label: 'Balanced',
      description: 'Procedurally generated. Each civilization receives an algorithmically fair share of terrain and resources. A cluster of luxury resources between civilizations creates a natural conflict hotspot.',
    },
    'single-continent': {
      emoji: '🏝️', label: 'Continent',
      description: 'One large connected landmass with small islands in the surrounding ocean. Fast early contact between civilizations; islands reward naval exploration with bonus resources.',
    },
  };

  const MAP_SCRIPT_ORDER = ['earth', 'old-world', 'new-world', 'balanced', 'single-continent'] as const;
  type MapScriptKey = typeof MAP_SCRIPT_ORDER[number];

  const mapScriptSelect = document.createElement('select');
  mapScriptSelect.hidden = true;
  mapScriptSelect.id = 'campaign-map-script';
  for (const script of MAP_SCRIPT_ORDER) {
    const opt = document.createElement('option');
    opt.value = script;
    mapScriptSelect.appendChild(opt);
  }
  mapScriptSelect.value = 'earth';
  mapSection.content.appendChild(mapScriptSelect);

  const mapTypeRow = document.createElement('div');
  Object.assign(mapTypeRow.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '8px',
    marginBottom: '10px',
  });
  const mapTypeStyleTag = document.createElement('style');
  mapTypeStyleTag.textContent = `@media (min-width: 480px) { #map-type-row { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; } }`;
  document.head.appendChild(mapTypeStyleTag);
  mapTypeRow.id = 'map-type-row';
  mapSection.content.appendChild(mapTypeRow);

  const mapDescEl = document.createElement('p');
  mapDescEl.dataset.role = 'map-description';
  Object.assign(mapDescEl.style, {
    margin: '0 0 10px',
    fontSize: '12px',
    opacity: '0.82',
    lineHeight: '1.45',
  });
  mapSection.content.appendChild(mapDescEl);

  const mapScriptCards = new Map<MapScriptKey, HTMLButtonElement>();

  const syncMapScriptCards = (): void => {
    const current = mapScriptSelect.value as MapScriptKey;
    for (const [script, btn] of mapScriptCards.entries()) {
      syncChoiceButtonState(btn, script === current);
    }
    mapDescEl.textContent = MAP_SCRIPT_LABELS[current]?.description ?? '';
  };

  for (const script of MAP_SCRIPT_ORDER) {
    const info = MAP_SCRIPT_LABELS[script];
    const btn = createChoiceButton(`${info.emoji} ${info.label}`);
    btn.dataset.mapScript = script;
    btn.style.flexDirection = 'column';
    btn.style.gap = '2px';
    btn.style.fontSize = '12px';
    btn.addEventListener('click', () => {
      mapScriptSelect.value = script;
      syncMapScriptCards();
    });
    mapScriptCards.set(script, btn);
    mapTypeRow.appendChild(btn);
  }

  syncMapScriptCards();

  const mapSizeCardRow = document.createElement('div');
  Object.assign(mapSizeCardRow.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '10px',
  });
  mapSection.content.appendChild(mapSizeCardRow);

  const startSpacingNote = document.createElement('p');
  startSpacingNote.dataset.role = 'start-spacing-note';
  startSpacingNote.textContent = 'Balanced starts keep rival civilizations from beginning next door, including across the wrapped map edge.';
  Object.assign(startSpacingNote.style, {
    margin: '0',
    fontSize: '12px',
    opacity: '0.72',
    lineHeight: '1.45',
  });
  mapSection.content.appendChild(startSpacingNote);

  const mapSizeField = createLabeledSelect('Map size', 'campaign-map-size');
  mapSizeField.wrapper.hidden = true;
  for (const size of ['small', 'medium', 'large'] as const) {
    const option = document.createElement('option');
    option.value = size;
    option.textContent = size;
    mapSizeField.select.appendChild(option);
  }
  mapSizeField.select.value = 'medium';
  mapSection.content.appendChild(mapSizeField.wrapper);

  const mapSizeCards = new Map<'small' | 'medium' | 'large', HTMLButtonElement>();
  const syncMapSizeCards = (): void => {
    for (const [size, button] of mapSizeCards.entries()) {
      syncChoiceButtonState(button, mapSizeField.select.value === size);
    }
  };
  for (const size of ['small', 'medium', 'large'] as const) {
    const button = createChoiceButton(size);
    button.dataset.size = size;
    button.addEventListener('click', () => {
      mapSizeField.select.value = size;
      refreshOpponentOptions();
      syncMapSizeCards();
    });
    mapSizeCards.set(size, button);
    mapSizeCardRow.appendChild(button);
  }

  const opponentSection = createSetupSection({
    title: 'Opponents',
    description: 'Decide how many rival civilizations share the world with you.',
  });
  hero.appendChild(opponentSection.section);

  const opponentCardRow = document.createElement('div');
  Object.assign(opponentCardRow.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '10px',
  });
  opponentSection.content.appendChild(opponentCardRow);

  const opponentsField = createLabeledSelect('Opponents', 'campaign-opponents');
  opponentsField.wrapper.hidden = true;
  opponentSection.content.appendChild(opponentsField.wrapper);

  const syncOpponentCards = (): void => {
    for (const button of opponentCardRow.querySelectorAll('[data-opponent-count]')) {
      syncChoiceButtonState(
        button as HTMLButtonElement,
        (button as HTMLButtonElement).dataset.opponentCount === opponentsField.select.value,
      );
    }
  };

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

    const normalizedValue = !currentValue
      ? 1
      : Math.max(1, Math.min(Number(currentValue), maxOpponents));
    opponentsField.select.value = String(normalizedValue);

    opponentCardRow.textContent = '';
    for (let count = 1; count <= maxOpponents; count++) {
      const button = createChoiceButton(String(count));
      button.dataset.opponentCount = String(count);
      button.addEventListener('click', () => {
        opponentsField.select.value = String(count);
        syncOpponentCards();
      });
      opponentCardRow.appendChild(button);
    }
    syncOpponentCards();
  };

  refreshOpponentOptions();
  syncMapSizeCards();
  mapSizeField.select.addEventListener('change', () => {
    refreshOpponentOptions();
    syncMapSizeCards();
  });

  let selectedOpponentChallenge: OpponentChallenge = 'standard';
  const challengeSection = createSetupSection({
    title: 'Opponent Challenge',
    description: 'Choose how computer rivals and roaming threats plan and coordinate.',
  });
  challengeSection.section.dataset.opponentChallengeSection = '';
  hero.appendChild(challengeSection.section);
  challengeSection.content.appendChild(createOpponentChallengeSelector({
    selected: selectedOpponentChallenge,
    mode: 'new-game',
    onSelect: challenge => {
      selectedOpponentChallenge = challenge;
    },
  }));

  // Legendary Beasts mode section
  let beastsModeSelected: BeastsMode = 'wild';

  const beastsSection = createSetupSection({
    title: 'Legendary Beasts',
    description: 'Powerful creatures that guard ancient lairs. Slay them to claim their gold hoard.',
  });
  hero.appendChild(beastsSection.section);

  const beastsModeCardRow = document.createElement('div');
  Object.assign(beastsModeCardRow.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '10px',
  });
  beastsSection.content.appendChild(beastsModeCardRow);

  const beastsHelpText = document.createElement('p');
  Object.assign(beastsHelpText.style, {
    margin: '8px 0 0',
    fontSize: '12px',
    opacity: '0.72',
    lineHeight: '1.45',
  });
  beastsSection.content.appendChild(beastsHelpText);

  const BEASTS_MODE_DESCRIPTIONS: Record<BeastsMode, string> = {
    wild: 'Legendary beasts roam near their lairs and attack intruders.',
    calm: 'Beasts appear and can be hunted, but never attack first.',
    off: 'No legendary beasts this game.',
  };

  const beastsModeCards = new Map<BeastsMode, HTMLButtonElement>();
  const syncBeastsModeCards = (): void => {
    for (const [mode, button] of beastsModeCards.entries()) {
      syncChoiceButtonState(button, beastsModeSelected === mode);
    }
    beastsHelpText.textContent = BEASTS_MODE_DESCRIPTIONS[beastsModeSelected];
  };

  for (const mode of ['wild', 'calm', 'off'] as const) {
    const button = createChoiceButton(mode);
    button.dataset.beastsMode = mode;
    button.addEventListener('click', () => {
      beastsModeSelected = mode;
      syncBeastsModeCards();
    });
    beastsModeCards.set(mode, button);
    beastsModeCardRow.appendChild(button);
  }
  syncBeastsModeCards();

  let selectedCivId: string | null = null;
  let customCivilizations: CustomCivDefinition[] = [...(options?.initialCustomCivilizations ?? [])];
  let civDefinitions = getPlayableCivDefinitions({ customCivilizations });

  const syncCampaignReadiness = (): void => {
    const gameTitle = titleInput.value.trim();
    const selectedDefinition = civDefinitions.find(def => def.id === selectedCivId);
    civSummary.textContent = selectedDefinition
      ? `Leading civilization: ${selectedDefinition.name}`
      : 'No civilization selected yet';
    const isDisabled = !selectedCivId || !gameTitle;
    setButtonDisabled(startButton, isDisabled);
    startButton.dataset.ready = isDisabled ? 'false' : 'true';
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

  const cancelButton = createGameButton('Cancel', 'ghost');
  cancelButton.addEventListener('click', () => {
    panel.remove();
    callbacks.onCancel();
  });
  buttonRow.appendChild(cancelButton);

  const startButton = createGameButton('Start Campaign', 'primary', { disabled: true });
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
      mapScript: mapScriptSelect.value as MapScript,
      opponentChallenge: selectedOpponentChallenge,
      settingsOverrides: { beastsMode: beastsModeSelected },
    });
  });
  buttonRow.appendChild(startButton);

  shell.actions.appendChild(buttonRow);

  titleInput.addEventListener('input', syncCampaignReadiness);
  syncCampaignReadiness();
  container.appendChild(panel);
  return panel;
}
