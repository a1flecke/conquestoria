import type { CustomCivDefinition, HotSeatConfig, HotSeatPlayer, MapScript, OpponentChallenge, StartPlacementMode } from '@/core/types';
import { GameCreationError, MAP_DIMENSIONS } from '@/core/game-state';
import { createCivSelectPanel } from './civ-select';
import { createCustomCivPanel } from './custom-civ-panel';
import { createDefaultSettings } from '@/core/game-state';
import { getPlayableCivDefinitions } from '@/systems/civ-registry';
import { buildCustomCivId, customCivDefinitionsEqual, mergeCustomCivDefinitions } from '@/systems/custom-civ-system';
import { loadSettings, saveSettings } from '@/storage/save-manager';
import { createOpponentChallengeSelector } from '@/ui/opponent-challenge-selector';
import { createGameButton } from '@/ui/ui-kit';
import { selectAIRoster } from '@/systems/ai-roster-selection';

export interface HotSeatSetupCallbacks {
  onComplete: (config: HotSeatConfig, opponentChallenge?: OpponentChallenge) => void;
  onCancel: () => void;
  onCustomCivilizationsChanged?: (customCivilizations: CustomCivDefinition[]) => void;
}

export interface HotSeatSetupOptions {
  initialCustomCivilizations?: CustomCivDefinition[];
}

export function showHotSeatSetup(
  container: HTMLElement,
  callbacks: HotSeatSetupCallbacks,
  options?: HotSeatSetupOptions,
): void {
  const existing = document.getElementById('hotseat-setup');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'hotseat-setup';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.98);z-index:50;overflow-y:auto;padding:16px;display:flex;flex-direction:column;align-items:center;';

  let selectedMapSize: 'small' | 'medium' | 'large' | null = null;
  let selectedMapScript: MapScript = 'earth';
  let selectedPlacementMode: StartPlacementMode = 'balanced';
  let selectedOpponentChallenge: OpponentChallenge = 'standard';
  let playerCount = 0;
  let aiCount = 1;
  const players: HotSeatPlayer[] = [];
  const chosenCivs: string[] = [];
  let customCivilizations: CustomCivDefinition[] = [...(options?.initialCustomCivilizations ?? [])];
  let civDefinitions = getPlayableCivDefinitions({ customCivilizations });

  const replaceSetupOverlay = (render: () => void): void => {
    panel.querySelector('#custom-civ-panel')?.remove();
    panel.querySelector('#civ-select')?.remove();
    render();
  };

  showMapSizeStage();

  function showMapSizeStage() {
    const sizes = [
      { key: 'small' as const, label: 'Small', desc: '30x30', max: MAP_DIMENSIONS.small.maxPlayers },
      { key: 'medium' as const, label: 'Medium', desc: '50x50', max: MAP_DIMENSIONS.medium.maxPlayers },
      { key: 'large' as const, label: 'Large', desc: '80x80', max: MAP_DIMENSIONS.large.maxPlayers },
    ];

    panel.innerHTML = `
      <h1 style="font-size:22px;color:#e8c170;margin:24px 0 8px;text-align:center;">Hot Seat Setup</h1>
      <p style="font-size:13px;opacity:0.6;margin-bottom:24px;text-align:center;">Choose your map size</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
        ${sizes.map(s => `
          <div class="map-size-card" data-size="${s.key}" style="background:rgba(255,255,255,0.08);border:2px solid transparent;border-radius:12px;padding:20px;cursor:pointer;text-align:center;min-width:100px;transition:border-color 0.2s;">
            <div style="font-weight:bold;font-size:16px;color:#e8c170;" data-label="${s.key}"></div>
            <div style="font-size:12px;opacity:0.6;margin-top:4px;" data-desc="${s.key}"></div>
            <div style="font-size:11px;opacity:0.5;margin-top:4px;" data-max="${s.key}"></div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:20px;">
        <button id="hs-cancel" style="padding:10px 20px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;cursor:pointer;font-size:13px;">Cancel</button>
      </div>
    `;

    // Fill in map size card text safely
    for (const s of sizes) {
      const labelEl = panel.querySelector(`[data-label="${s.key}"]`);
      if (labelEl) labelEl.textContent = s.label;
      const descEl = panel.querySelector(`[data-desc="${s.key}"]`);
      if (descEl) descEl.textContent = s.desc;
      const maxEl = panel.querySelector(`[data-max="${s.key}"]`);
      if (maxEl) maxEl.textContent = `Up to ${s.max} players`;
    }

    const spacingNote = document.createElement('p');
    spacingNote.dataset.role = 'hotseat-start-spacing-note';
    spacingNote.textContent = 'Balanced starts keep rival civilizations from beginning next door, including across the wrapped map edge.';
    spacingNote.style.cssText = 'font-size:12px;opacity:0.65;margin:16px 0 0;text-align:center;max-width:420px;line-height:1.45;';
    panel.querySelector('.map-size-card')?.parentElement?.insertAdjacentElement('afterend', spacingNote);

    container.appendChild(panel);

    panel.querySelectorAll('.map-size-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedMapSize = (card as HTMLElement).dataset.size as 'small' | 'medium' | 'large';
        showMapTypeStage();
      });
    });

    panel.querySelector('#hs-cancel')?.addEventListener('click', () => {
      panel.remove();
      callbacks.onCancel();
    });
  }

  function showMapTypeStage() {
    type MapScriptKey = 'earth' | 'old-world' | 'new-world' | 'balanced' | 'single-continent';
    const MAP_SCRIPT_ORDER: MapScriptKey[] = ['earth', 'old-world', 'new-world', 'balanced', 'single-continent'];
    const MAP_SCRIPT_LABELS: Record<MapScriptKey, { emoji: string; label: string; description: string }> = {
      earth: {
        emoji: '🌍',
        label: 'Earth',
        description: 'Real-world geography with your choice of separated Balanced starts or exact True Starts.',
      },
      'old-world': {
        emoji: '🗺️',
        label: 'Old World',
        description: 'Europe, Asia, and Africa with Balanced or exact True Start placement.',
      },
      'new-world': {
        emoji: '🌎',
        label: 'New World',
        description: 'North and South America with Balanced or exact True Start placement.',
      },
      balanced: {
        emoji: '⚖️',
        label: 'Balanced',
        description: 'Procedurally generated. Each civilization receives an algorithmically fair share of terrain and resources. A cluster of luxury resources creates a natural conflict hotspot.',
      },
      'single-continent': {
        emoji: '🏝️',
        label: 'Continent',
        description: 'One large connected landmass with small islands in the surrounding ocean. Fast early contact between civilizations; islands reward naval exploration with bonus resources.',
      },
    };

    panel.innerHTML = '';

    const h1 = document.createElement('h1');
    h1.style.cssText = 'font-size:22px;color:#e8c170;margin:24px 0 8px;text-align:center;';
    h1.textContent = 'Choose Map Type';
    panel.appendChild(h1);

    const subtitle = document.createElement('p');
    subtitle.style.cssText = 'font-size:13px;opacity:0.6;margin-bottom:20px;text-align:center;';
    subtitle.textContent = 'Select the world your civilizations will inhabit';
    panel.appendChild(subtitle);

    const cardRow = document.createElement('div');
    cardRow.id = 'hs-map-type-row';
    cardRow.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-width:480px;width:100%;';
    panel.appendChild(cardRow);

    const descEl = document.createElement('p');
    descEl.dataset.role = 'map-script-description';
    descEl.style.cssText = 'font-size:12px;opacity:0.82;margin:12px 0;text-align:center;max-width:420px;line-height:1.45;';
    panel.appendChild(descEl);

    const placement = document.createElement('div');
    placement.dataset.role = 'start-placement-options';
    placement.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:480px;';
    const balancedPlacement = createGameButton('Balanced (Recommended)', 'secondary');
    balancedPlacement.dataset.placementMode = 'balanced';
    const historicalPlacement = createGameButton('True Start', 'secondary');
    historicalPlacement.dataset.placementMode = 'historical';
    placement.append(balancedPlacement, historicalPlacement);
    panel.appendChild(placement);

    const placementDescription = document.createElement('p');
    placementDescription.dataset.role = 'start-placement-description';
    placementDescription.style.cssText = 'font-size:12px;opacity:0.82;margin:8px 0;text-align:center;max-width:420px;line-height:1.45;';
    panel.appendChild(placementDescription);

    const syncPlacement = (): void => {
      const geographic = selectedMapScript === 'earth'
        || selectedMapScript === 'old-world'
        || selectedMapScript === 'new-world';
      placement.hidden = !geographic;
      placementDescription.hidden = !geographic;
      if (!geographic) selectedPlacementMode = 'balanced';
      for (const button of [balancedPlacement, historicalPlacement]) {
        button.dataset.selected = button.dataset.placementMode === selectedPlacementMode
          ? 'true'
          : 'false';
        button.style.outline = button.dataset.selected === 'true' ? '2px solid #e8c170' : 'none';
      }
      placementDescription.textContent = selectedPlacementMode === 'balanced'
        ? 'Separated viable starts are guaranteed; historical regions are soft preferences.'
        : 'Exact known homelands are used. Nearby civilizations may begin close together.';
    };
    balancedPlacement.addEventListener('click', () => {
      selectedPlacementMode = 'balanced';
      syncPlacement();
    });
    historicalPlacement.addEventListener('click', () => {
      selectedPlacementMode = 'historical';
      syncPlacement();
    });

    const buttons = new Map<MapScriptKey, HTMLButtonElement>();

    const syncCards = (current: MapScriptKey): void => {
      for (const [script, btn] of buttons.entries()) {
        const sel = script === current;
        btn.dataset.selected = sel ? 'true' : 'false';
        btn.style.borderColor = sel ? '#e8c170' : 'rgba(255,255,255,0.18)';
        btn.style.background = sel ? 'rgba(232,193,112,0.16)' : 'rgba(255,255,255,0.08)';
        btn.style.color = sel ? '#f7f1d7' : '#f4f1e8';
      }
      descEl.textContent = MAP_SCRIPT_LABELS[current].description;
      syncPlacement();
    };

    for (const script of MAP_SCRIPT_ORDER) {
      const info = MAP_SCRIPT_LABELS[script];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.mapScript = script;
      btn.style.cssText = 'min-height:44px;padding:10px 8px;border-radius:12px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:#f4f1e8;cursor:pointer;font-size:13px;display:flex;flex-direction:column;align-items:center;gap:4px;';

      const emojiSpan = document.createElement('span');
      emojiSpan.style.fontSize = '18px';
      emojiSpan.textContent = info.emoji;

      const labelSpan = document.createElement('span');
      labelSpan.textContent = info.label;

      btn.appendChild(emojiSpan);
      btn.appendChild(labelSpan);

      btn.addEventListener('click', () => {
        selectedMapScript = script;
        syncCards(script);
      });

      buttons.set(script, btn);
      cardRow.appendChild(btn);
    }

    // Pre-select current choice so description is always visible on first render
    const preselect = MAP_SCRIPT_ORDER.includes(selectedMapScript as MapScriptKey)
      ? (selectedMapScript as MapScriptKey)
      : 'earth';
    syncCards(preselect);

    const nav = document.createElement('div');
    nav.style.cssText = 'margin-top:20px;display:flex;gap:12px;';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.id = 'hs-back-map-size';
    backBtn.style.cssText = 'padding:10px 20px;min-height:44px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;cursor:pointer;font-size:13px;';
    backBtn.textContent = 'Back';
    backBtn.addEventListener('click', () => showMapSizeStage());

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.id = 'hs-map-type-next';
    nextBtn.style.cssText = 'padding:10px 24px;min-height:44px;background:rgba(232,193,112,0.3);border:2px solid #e8c170;border-radius:8px;color:#e8c170;cursor:pointer;font-size:14px;font-weight:bold;';
    nextBtn.textContent = 'Next';
    nextBtn.addEventListener('click', () => {
      showOpponentChallengeStage();
    });

    nav.appendChild(backBtn);
    nav.appendChild(nextBtn);
    panel.appendChild(nav);
  }

  function showOpponentChallengeStage() {
    panel.replaceChildren();

    const title = document.createElement('h1');
    title.textContent = 'Choose Opponent Challenge';
    title.style.cssText = 'font-size:22px;color:#e8c170;margin:24px 0 8px;text-align:center;';
    panel.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Choose together before private player setup begins.';
    subtitle.style.cssText = 'font-size:13px;opacity:0.72;margin:0 0 20px;text-align:center;';
    panel.appendChild(subtitle);

    const selector = createOpponentChallengeSelector({
      selected: selectedOpponentChallenge,
      mode: 'new-game',
      onSelect: challenge => {
        selectedOpponentChallenge = challenge;
      },
    });
    selector.style.maxWidth = '840px';
    panel.appendChild(selector);

    const fairness = document.createElement('p');
    fairness.textContent = 'This choice applies to computer-controlled opponents for everyone in this campaign.';
    fairness.style.cssText = 'font-size:12px;opacity:0.78;margin:14px 0 0;text-align:center;line-height:1.45;';
    panel.appendChild(fairness);

    const nav = document.createElement('div');
    nav.style.cssText = 'margin-top:20px;display:flex;gap:12px;';
    const backButton = createGameButton('Back', 'ghost');
    backButton.id = 'hs-challenge-back';
    backButton.addEventListener('click', () => showMapTypeStage());
    const nextButton = createGameButton('Next', 'primary');
    nextButton.id = 'hs-challenge-next';
    nextButton.addEventListener('click', () => showPlayerCountStage());
    nav.append(backButton, nextButton);
    panel.appendChild(nav);
  }

  function showPlayerCountStage() {
    const max = MAP_DIMENSIONS[selectedMapSize!].maxPlayers;

    const counts = Array.from({ length: Math.max(1, max - 2) }, (_, i) => i + 2);

    panel.innerHTML = `
      <h1 style="font-size:22px;color:#e8c170;margin:24px 0 8px;text-align:center;">How Many Players?</h1>
      <p style="font-size:13px;opacity:0.6;margin-bottom:16px;text-align:center;">Human players (choose AI opponents separately on the next screen)</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
        ${counts.map(n => `
          <div class="count-card" data-count="${n}" style="background:rgba(255,255,255,0.08);border:2px solid transparent;border-radius:12px;padding:16px 24px;cursor:pointer;text-align:center;transition:border-color 0.2s;">
            <div style="font-weight:bold;font-size:20px;color:#e8c170;" data-count-num="${n}"></div>
            <div style="font-size:11px;opacity:0.5;margin-top:4px;">players</div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:20px;">
        <button id="hs-back-size" style="padding:10px 20px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;cursor:pointer;font-size:13px;">Back</button>
      </div>
    `;

    // Fill in player count numbers safely
    for (const n of counts) {
      const numEl = panel.querySelector(`[data-count-num="${n}"]`);
      if (numEl) numEl.textContent = String(n);
    }

    panel.querySelectorAll('.count-card').forEach(card => {
      card.addEventListener('click', () => {
        playerCount = parseInt((card as HTMLElement).dataset.count!, 10);
        showPlayerNamesStage();
      });
    });

    panel.querySelector('#hs-back-size')?.addEventListener('click', () => {
      showMapTypeStage();
    });
  }

  function showPlayerNamesStage() {
    const defaultNames = Array.from({ length: playerCount }, (_, i) => `Player ${i + 1}`);

    panel.innerHTML = `
      <h1 style="font-size:22px;color:#e8c170;margin:24px 0 8px;text-align:center;">Player Names</h1>
      <p style="font-size:13px;opacity:0.6;margin-bottom:16px;text-align:center;">Enter names for each player</p>
      <div data-role="ai-count-options" style="margin-bottom:16px;text-align:center;">
        <div style="font-size:13px;color:#e8c170;margin-bottom:8px;">AI opponents</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          ${Array.from(
            { length: MAP_DIMENSIONS[selectedMapSize!].maxPlayers - playerCount },
            (_, index) => index + 1,
          ).map(count => `
            <button type="button" data-ai-count="${count}" style="min-height:44px;min-width:44px;padding:8px;background:rgba(255,255,255,0.08);color:white;border:1px solid rgba(255,255,255,0.2);border-radius:8px;">${count}</button>
          `).join('')}
        </div>
        <p style="font-size:11px;opacity:0.65;margin:6px 0 0;">Choose independently; map capacity is a limit, not a target.</p>
      </div>
      <div style="max-width:300px;width:100%;display:flex;flex-direction:column;gap:10px;">
        ${defaultNames.map((_name, i) => `
          <input class="player-name-input" data-idx="${i}" type="text"
            style="padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:white;font-size:14px;" />
        `).join('')}
      </div>
      <div style="margin-top:20px;display:flex;gap:12px;">
        <button id="hs-back-count" style="padding:10px 20px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;cursor:pointer;font-size:13px;">Back</button>
        <button id="hs-names-next" style="padding:10px 24px;background:rgba(232,193,112,0.3);border:2px solid #e8c170;border-radius:8px;color:#e8c170;cursor:pointer;font-size:14px;font-weight:bold;">Next</button>
      </div>
    `;

    aiCount = Math.max(1, Math.min(
      aiCount,
      MAP_DIMENSIONS[selectedMapSize!].maxPlayers - playerCount,
    ));
    const syncAICount = (): void => {
      panel.querySelectorAll<HTMLButtonElement>('[data-ai-count]').forEach(button => {
        const selected = Number(button.dataset.aiCount) === aiCount;
        button.dataset.selected = selected ? 'true' : 'false';
        button.style.borderColor = selected ? '#e8c170' : 'rgba(255,255,255,0.2)';
      });
    };
    panel.querySelectorAll<HTMLButtonElement>('[data-ai-count]').forEach(button => {
      button.addEventListener('click', () => {
        aiCount = Number(button.dataset.aiCount);
        syncAICount();
      });
    });
    syncAICount();

    // Set placeholder and value via DOM properties (not attributes) to avoid XSS
    const inputs = panel.querySelectorAll('.player-name-input') as NodeListOf<HTMLInputElement>;
    inputs.forEach((input, i) => {
      input.placeholder = defaultNames[i];
      input.value = defaultNames[i];
    });

    panel.querySelector('#hs-names-next')?.addEventListener('click', () => {
      const inputs = panel.querySelectorAll('.player-name-input') as NodeListOf<HTMLInputElement>;
      players.length = 0;
      inputs.forEach((input, i) => {
        const name = input.value.trim() || `Player ${i + 1}`;
        players.push({
          name,
          slotId: `player-${i + 1}`,
          civType: '', // filled during civ selection
          isHuman: true,
        });
      });
      showCivPickStage(0);
    });

    panel.querySelector('#hs-back-count')?.addEventListener('click', () => {
      showPlayerCountStage();
    });
  }

  function showCivPickStage(playerIdx: number) {
    panel.innerHTML = '';

    // Show pass-to screen first (except for first player)
    if (playerIdx > 0) {
      panel.innerHTML = `
        <div style="text-align:center;margin-top:60px;">
          <h2 style="font-size:20px;color:#e8c170;margin-bottom:8px;">Pass the device to</h2>
          <h1 style="font-size:28px;color:white;margin-bottom:24px;" data-text="hs-pass-name"></h1>
          <button id="hs-civ-ready" style="padding:14px 32px;border-radius:10px;background:#e8c170;border:none;color:#1a1a2e;font-weight:bold;font-size:16px;cursor:pointer;" data-text="hs-pass-btn"></button>
        </div>
      `;
      // Inject player name via textContent (user-entered, XSS risk)
      const passNameEl = panel.querySelector('[data-text="hs-pass-name"]');
      if (passNameEl) passNameEl.textContent = players[playerIdx].name;
      const passBtnEl = panel.querySelector('[data-text="hs-pass-btn"]');
      if (passBtnEl) passBtnEl.textContent = `I'm ${players[playerIdx].name}`;

      panel.querySelector('#hs-civ-ready')?.addEventListener('click', () => {
        showCivSelector(playerIdx);
      });
    } else {
      showCivSelector(playerIdx);
    }
  }

  function showCivSelector(playerIdx: number) {
    panel.innerHTML = '';

    const openCustomCivEditor = (): void => {
      replaceSetupOverlay(() => {
        createCustomCivPanel(panel, {
          onSave: async (definition) => {
            const loaded = (await loadSettings()) ?? createDefaultSettings(selectedMapSize ?? 'small');
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
            showCivSelector(playerIdx);
          },
          onCancel: () => {
            showCivSelector(playerIdx);
          },
        }, {
          existingDefinitions: customCivilizations,
        });
      });
    };

    replaceSetupOverlay(() => {
      createCivSelectPanel(panel, {
        onSelect: (civId: string) => {
          players[playerIdx].civType = civId;
          chosenCivs.push(civId);
          showPersonalChallengeStage(playerIdx);
        },
        onCreateCustomCiv: () => {
          openCustomCivEditor();
        },
      }, {
        disabledCivs: chosenCivs,
        headerText: `${players[playerIdx].name}, choose your civilization`,
        civDefinitions,
        // Every player now passes through the personal-difficulty screen next,
        // so this button never actually starts the game — label it "Next" so it
        // doesn't over-promise, even for the last player.
        primaryActionText: 'Next',
      });
    });
  }

  function showPersonalChallengeStage(playerIdx: number) {
    panel.innerHTML = '';

    const title = document.createElement('h1');
    title.textContent = 'Your Personal Difficulty';
    title.style.cssText = 'font-size:22px;color:#e8c170;margin:24px 0 8px;text-align:center;';
    panel.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.textContent = `${players[playerIdx].name}, this only affects crises and unrest for your own empire — it's private to you.`;
    subtitle.style.cssText = 'font-size:13px;opacity:0.72;margin:0 0 20px;text-align:center;max-width:420px;';
    panel.appendChild(subtitle);

    const selector = createOpponentChallengeSelector({
      selected: players[playerIdx].challenge ?? 'standard',
      mode: 'new-game',
      onSelect: challenge => {
        players[playerIdx].challenge = challenge;
      },
    });
    selector.style.maxWidth = '840px';
    panel.appendChild(selector);

    const nav = document.createElement('div');
    nav.style.cssText = 'margin-top:20px;display:flex;gap:12px;';
    const nextButton = createGameButton(playerIdx + 1 < players.length ? 'Next Player' : 'Start Game', 'primary');
    nextButton.id = 'hs-personal-challenge-next';
    nextButton.addEventListener('click', () => {
      players[playerIdx].challenge ??= 'standard';
      if (playerIdx + 1 < players.length) {
        showCivPickStage(playerIdx + 1);
      } else {
        showFinalReview();
      }
    });
    nav.appendChild(nextButton);
    panel.appendChild(nav);
  }

  function buildFinalConfig(): {
    config: HotSeatConfig;
    minimumHistoricalDistance: number | null;
    fallbackCivilizationTypeIds: string[];
  } {
    const humanPlayers = players.filter(player => player.isHuman);
    const selection = selectAIRoster({
      definitions: civDefinitions,
      humanCivilizationTypeIds: humanPlayers.map(player => player.civType),
      count: aiCount,
      mapScript: selectedMapScript,
      mapSize: selectedMapSize!,
      placementMode: selectedPlacementMode,
      seed: 'hotseat-roster-preview',
    });
    const aiPlayers = selection.civilizationTypeIds.map((id, index) => {
      const definition = civDefinitions.find(candidate => candidate.id === id);
      return {
        name: definition?.name ?? id,
        slotId: `ai-${index + 1}`,
        civType: id,
        isHuman: false,
      };
    });
    return {
      config: {
      playerCount: humanPlayers.length + aiPlayers.length,
      mapSize: selectedMapSize!,
      mapScript: selectedMapScript,
      startPlacementMode: selectedPlacementMode,
      players: [...humanPlayers, ...aiPlayers],
      customCivilizations,
      },
      minimumHistoricalDistance: selection.minimumHistoricalDistance,
      fallbackCivilizationTypeIds: selection.fallbackCivilizationTypeIds,
    };
  }

  function showFinalReview() {
    const review = buildFinalConfig();
    const humans = review.config.players.filter(player => player.isHuman);
    const ais = review.config.players.filter(player => !player.isHuman);
    const crowded = selectedPlacementMode === 'historical'
      && review.minimumHistoricalDistance !== null
      && review.minimumHistoricalDistance < 9;
    panel.replaceChildren();
    const title = document.createElement('h1');
    title.textContent = 'Review Campaign';
    title.style.cssText = 'font-size:22px;color:#e8c170;margin:24px 0 12px;text-align:center;';
    panel.appendChild(title);
    const summary = document.createElement('div');
    summary.dataset.role = 'hotseat-final-review';
    summary.style.cssText = 'max-width:520px;width:100%;background:rgba(255,255,255,0.06);border-radius:12px;padding:16px;line-height:1.6;';
    const lines = [
      `Map: ${selectedMapSize} ${selectedMapScript}`,
      `Starts: ${selectedPlacementMode === 'balanced' ? 'Balanced' : 'True Start'}`,
      `Humans: ${humans.map(player => `${player.name} (${player.civType})`).join(', ')}`,
      `AI opponents (${ais.length}): ${ais.map(player => player.civType).join(', ')}`,
    ];
    for (const line of lines) {
      const row = document.createElement('p');
      row.textContent = line;
      row.style.margin = '0 0 6px';
      summary.appendChild(row);
    }
    if (review.fallbackCivilizationTypeIds.length > 0) {
      const fallback = document.createElement('p');
      fallback.textContent = `Fallback starts: ${review.fallbackCivilizationTypeIds.join(', ')}`;
      fallback.style.margin = '0 0 6px';
      summary.appendChild(fallback);
    }
    if (crowded) {
      const warning = document.createElement('p');
      warning.dataset.role = 'historical-crowding-warning';
      warning.textContent = `Warning: this roster has historical starts only ${review.minimumHistoricalDistance} hexes apart.`;
      warning.style.cssText = 'color:#ffb870;font-weight:bold;margin:10px 0 0;';
      summary.appendChild(warning);
    }
    panel.appendChild(summary);

    const start = createGameButton(
      crowded ? 'Review Crowding Risk' : 'Start Game',
      'primary',
    );
    start.id = 'hs-review-start';
    start.style.marginTop = '16px';
    start.addEventListener('click', () => {
      if (crowded && start.dataset.confirmed !== 'true') {
        start.dataset.confirmed = 'true';
        start.textContent = 'Start Crowded Historical Game';
        return;
      }
      try {
        callbacks.onComplete(review.config, selectedOpponentChallenge);
        panel.remove();
      } catch (error) {
        if (!(error instanceof GameCreationError)) throw error;
        const message = document.createElement('p');
        message.dataset.role = 'setup-error';
        message.textContent = error.message;
        message.style.cssText = 'color:#ffb4ab;font-size:12px;font-weight:bold;margin:10px 0 0;';
        summary.appendChild(message);
      }
    });
    panel.appendChild(start);
  }
}
