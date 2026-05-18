import type { CustomCivDefinition, HotSeatConfig, HotSeatPlayer, MapScript } from '@/core/types';
import { MAP_DIMENSIONS } from '@/core/game-state';
import { createCivSelectPanel } from './civ-select';
import { createCustomCivPanel } from './custom-civ-panel';
import { createDefaultSettings } from '@/core/game-state';
import { getPlayableCivDefinitions } from '@/systems/civ-registry';
import { buildCustomCivId, customCivDefinitionsEqual, mergeCustomCivDefinitions } from '@/systems/custom-civ-system';
import { loadSettings, saveSettings } from '@/storage/save-manager';

interface HotSeatSetupCallbacks {
  onComplete: (config: HotSeatConfig) => void;
  onCancel: () => void;
  onCustomCivilizationsChanged?: (customCivilizations: CustomCivDefinition[]) => void;
}

interface HotSeatSetupOptions {
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
  let playerCount = 0;
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
        description: 'Real-world geography. Civilizations start near their historical homelands; fantasy and out-of-region civs get good constrained starts. Resources follow real-world distribution.',
      },
      'old-world': {
        emoji: '🗺️',
        label: 'Old World',
        description: 'Europe, Asia, and Africa. Historical civilizations start at their homelands. Best for Old World civs — Aztec gets a constrained random start.',
      },
      'new-world': {
        emoji: '🌎',
        label: 'New World',
        description: 'North and South America. Aztec starts in Central Mexico. England and France land on the eastern seaboard; Spain lands on the Gulf of Mexico.',
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
    nextBtn.addEventListener('click', () => showPlayerCountStage());

    nav.appendChild(backBtn);
    nav.appendChild(nextBtn);
    panel.appendChild(nav);
  }

  function showPlayerCountStage() {
    const max = MAP_DIMENSIONS[selectedMapSize!].maxPlayers;

    const counts = Array.from({ length: max - 1 }, (_, i) => i + 2);

    panel.innerHTML = `
      <h1 style="font-size:22px;color:#e8c170;margin:24px 0 8px;text-align:center;">How Many Players?</h1>
      <p style="font-size:13px;opacity:0.6;margin-bottom:16px;text-align:center;">Human players (AI opponents will fill remaining slots)</p>
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

          if (playerIdx + 1 < players.length) {
            showCivPickStage(playerIdx + 1);
          } else {
            finalize();
          }
        },
        onCreateCustomCiv: () => {
          openCustomCivEditor();
        },
      }, {
        disabledCivs: chosenCivs,
        headerText: `${players[playerIdx].name}, choose your civilization`,
        civDefinitions,
        primaryActionText: playerIdx + 1 < players.length ? 'Next Player' : 'Start Game',
      });
    });
  }

  function finalize() {
    // Add AI players to fill remaining map slots
    const max = MAP_DIMENSIONS[selectedMapSize!].maxPlayers;
    const aiCount = Math.max(1, max - playerCount); // at least 1 AI
    const availableCivs = civDefinitions.filter(c => !chosenCivs.includes(c.id));

    for (let i = 0; i < aiCount && i < availableCivs.length; i++) {
      players.push({
        name: availableCivs[i].name,
        slotId: `ai-${i + 1}`,
        civType: availableCivs[i].id,
        isHuman: false,
      });
    }

    const config: HotSeatConfig = {
      playerCount: players.length,
      mapSize: selectedMapSize!,
      mapScript: selectedMapScript,
      players,
      customCivilizations,
    };

    panel.remove();
    callbacks.onComplete(config);
  }
}
