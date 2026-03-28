import type { GameState, DiplomaticAction } from '@/core/types';
import { getRelationship, isAtWar, getAvailableActions } from '@/systems/diplomacy-system';
import { getCivDefinition } from '@/systems/civ-definitions';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';

export interface DiplomacyPanelCallbacks {
  onAction: (targetCivId: string, action: DiplomaticAction) => void;
  onGiftGold?: (mcId: string) => void;
  onMinorCivWarPeace?: (mcId: string, currentlyAtWar: boolean) => void;
  onClose: () => void;
}

export function createDiplomacyPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: DiplomacyPanelCallbacks,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'diplomacy-panel';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.95);z-index:30;overflow-y:auto;padding:16px;padding-bottom:80px;';

  const playerCiv = state.civilizations[state.currentPlayer];
  const playerDiplomacy = playerCiv.diplomacy;

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="font-size:18px;color:#e8c170;margin:0;">Diplomacy</h2>
      <span id="diplo-close" style="cursor:pointer;font-size:24px;opacity:0.6;">✕</span>
    </div>
  `;

  for (const [civId, civ] of Object.entries(state.civilizations)) {
    if (civId === state.currentPlayer) continue;

    const civDef = getCivDefinition(civ.civType ?? '');
    const relationship = getRelationship(playerDiplomacy, civId);
    const atWar = isAtWar(playerDiplomacy, civId);
    const actions = getAvailableActions(
      playerDiplomacy, civId, playerCiv.techState.completed, state.era,
    );

    let barColor = '#888';
    if (relationship > 30) barColor = '#4a9b4a';
    else if (relationship > 0) barColor = '#8ab84a';
    else if (relationship > -30) barColor = '#d9d94a';
    else if (relationship > -60) barColor = '#d9944a';
    else barColor = '#d94a4a';

    const statusText = atWar ? '⚔️ At War'
      : relationship > 30 ? '😊 Friendly'
      : relationship > 0 ? '🤝 Neutral'
      : relationship > -30 ? '😐 Cautious'
      : '😠 Hostile';

    html += `
      <div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:24px;height:24px;border-radius:50%;background:${civ.color};"></div>
          <div>
            <div style="font-weight:bold;font-size:14px;">${civ.name}</div>
            <div style="font-size:11px;opacity:0.6;">${civDef?.bonusName ?? ''} · ${statusText}</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="font-size:11px;opacity:0.5;min-width:30px;">${relationship}</span>
          <div style="flex:1;background:rgba(0,0,0,0.3);border-radius:4px;height:8px;">
            <div style="background:${barColor};border-radius:4px;height:8px;width:${Math.max(2, (relationship + 100) / 2)}%;"></div>
          </div>
        </div>
    `;

    // Active treaties
    const treaties = playerDiplomacy.treaties.filter(
      t => t.civB === civId || t.civA === civId,
    );
    if (treaties.length > 0) {
      html += '<div style="margin-bottom:8px;">';
      for (const t of treaties) {
        const label = t.type.replace(/_/g, ' ');
        const turns = t.turnsRemaining > 0 ? ` (${t.turnsRemaining} turns)` : '';
        html += `<span style="display:inline-block;background:rgba(232,193,112,0.2);border-radius:4px;padding:2px 8px;font-size:10px;margin-right:4px;">${label}${turns}</span>`;
      }
      html += '</div>';
    }

    // Available actions
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    for (const action of actions) {
      const label = action.replace(/_/g, ' ');
      const isHostile = action === 'declare_war';
      const btnColor = isHostile ? 'rgba(217,74,74,0.3)' : 'rgba(255,255,255,0.1)';
      const borderColor = isHostile ? '#d94a4a' : 'rgba(255,255,255,0.2)';
      html += `<button class="diplo-action" data-civ-id="${civId}" data-action="${action}" style="padding:6px 12px;background:${btnColor};border:1px solid ${borderColor};border-radius:6px;color:white;cursor:pointer;font-size:11px;text-transform:capitalize;">${label}</button>`;
    }
    html += '</div></div>';
  }

  // City-States section
  const mcEntries = Object.entries(state.minorCivs ?? {}).filter(([, mc]) => !mc.isDestroyed);
  if (mcEntries.length > 0) {
    html += `<h3 style="font-size:15px;color:#e8c170;margin:20px 0 10px;">City-States</h3>`;
    for (const [mcId, mc] of mcEntries) {
      const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
      if (!def) continue;
      const rel = mc.diplomacy.relationships[state.currentPlayer] ?? 0;
      const status = rel <= -60 ? 'Hostile' : rel >= 60 ? 'Allied' : rel >= 30 ? 'Friendly' : 'Neutral';
      const archIcon = def.archetype === 'militaristic' ? '⚔️' : def.archetype === 'mercantile' ? '🪙' : '📜';
      const quest = mc.activeQuests[state.currentPlayer];
      const statusColor = rel >= 60 ? '#4a9b4a' : rel >= 30 ? '#8ab84a' : rel <= -60 ? '#d94a4a' : '#888';

      html += `<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;margin-bottom:8px;">`;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;">`;
      html += `<span style="font-size:13px;">${archIcon} <strong style="color:${def.color}">${def.name}</strong></span>`;
      html += `<span style="font-size:12px;color:${statusColor}">${status} (${rel})</span>`;
      html += `</div>`;
      if (quest) {
        html += `<div style="font-size:11px;opacity:0.7;margin-top:4px;">Quest: ${quest.description}</div>`;
      }
      const atWar = mc.diplomacy.atWarWith?.includes(state.currentPlayer) ?? false;
      html += `<div style="display:flex;gap:6px;margin-top:6px;">`;
      html += `<button class="mc-gift" data-mc-id="${mcId}" style="padding:4px 10px;background:rgba(232,193,112,0.2);border:1px solid rgba(232,193,112,0.4);border-radius:5px;color:#e8c170;cursor:pointer;font-size:10px;">Gift Gold</button>`;
      const warLabel = atWar ? 'Make Peace' : 'Declare War';
      const warBg = atWar ? 'rgba(74,155,74,0.3)' : 'rgba(217,74,74,0.3)';
      const warBorder = atWar ? '#4a9b4a' : '#d94a4a';
      html += `<button class="mc-war" data-mc-id="${mcId}" data-at-war="${atWar}" style="padding:4px 10px;background:${warBg};border:1px solid ${warBorder};border-radius:5px;color:white;cursor:pointer;font-size:10px;">${warLabel}</button>`;
      html += `</div>`;
      html += `</div>`;
    }
  }

  panel.innerHTML = html;
  container.appendChild(panel);

  panel.querySelector('#diplo-close')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onClose();
  });

  panel.querySelectorAll('.diplo-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const civId = (btn as HTMLElement).dataset.civId!;
      const action = (btn as HTMLElement).dataset.action! as DiplomaticAction;
      callbacks.onAction(civId, action);
      panel.remove();
    });
  });

  panel.querySelectorAll('.mc-gift').forEach(btn => {
    btn.addEventListener('click', () => {
      const mcId = (btn as HTMLElement).dataset.mcId!;
      callbacks.onGiftGold?.(mcId);
      panel.remove();
    });
  });

  panel.querySelectorAll('.mc-war').forEach(btn => {
    btn.addEventListener('click', () => {
      const mcId = (btn as HTMLElement).dataset.mcId!;
      const atWar = (btn as HTMLElement).dataset.atWar === 'true';
      callbacks.onMinorCivWarPeace?.(mcId, atWar);
      panel.remove();
    });
  });

  return panel;
}
