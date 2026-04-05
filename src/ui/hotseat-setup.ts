import type { HotSeatConfig, HotSeatPlayer } from '@/core/types';
import { MAP_DIMENSIONS } from '@/core/game-state';
import { createCivSelectPanel } from './civ-select';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';

interface HotSeatSetupCallbacks {
  onComplete: (config: HotSeatConfig) => void;
  onCancel: () => void;
}

export function showHotSeatSetup(
  container: HTMLElement,
  callbacks: HotSeatSetupCallbacks,
): void {
  const existing = document.getElementById('hotseat-setup');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'hotseat-setup';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.98);z-index:50;overflow-y:auto;padding:16px;display:flex;flex-direction:column;align-items:center;';

  let selectedMapSize: 'small' | 'medium' | 'large' | null = null;
  let playerCount = 0;
  const players: HotSeatPlayer[] = [];
  const chosenCivs: string[] = [];

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

    container.appendChild(panel);

    panel.querySelectorAll('.map-size-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedMapSize = (card as HTMLElement).dataset.size as 'small' | 'medium' | 'large';
        showPlayerCountStage();
      });
    });

    panel.querySelector('#hs-cancel')?.addEventListener('click', () => {
      panel.remove();
      callbacks.onCancel();
    });
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
      showMapSizeStage();
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
    }, {
      disabledCivs: chosenCivs,
      headerText: `${players[playerIdx].name}, choose your civilization`,
    });
  }

  function finalize() {
    // Add AI players to fill remaining map slots
    const max = MAP_DIMENSIONS[selectedMapSize!].maxPlayers;
    const aiCount = Math.max(1, max - playerCount); // at least 1 AI
    const availableCivs = CIV_DEFINITIONS.filter(c => !chosenCivs.includes(c.id));

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
      players,
    };

    panel.remove();
    callbacks.onComplete(config);
  }
}
