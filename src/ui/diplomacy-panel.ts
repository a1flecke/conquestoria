import type { GameState, DiplomaticAction } from '@/core/types';
import { canReabsorbBreakaway, getRelationship, isAtWar, getAvailableActions } from '@/systems/diplomacy-system';
import { getCivDefinition } from '@/systems/civ-definitions';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { hasDiscoveredMinorCiv, hasMetCivilization } from '@/systems/discovery-system';
import { getMinorCivPresentationForPlayer } from '@/systems/minor-civ-presentation';
import { getQuestDescriptionForPlayer } from '@/systems/quest-system';

export interface DiplomacyPanelCallbacks {
  onAction: (targetCivId: string, action: DiplomaticAction) => void;
  onGiftGold?: (mcId: string) => void;
  onMinorCivWarPeace?: (mcId: string, currentlyAtWar: boolean) => void;
  onClose: () => void;
}

interface CivRowData {
  civId: string;
  civIdx: number;
  name: string;
  color: string;
  bonusName: string;
  relationship: number;
  barWidth: number;
  barColor: string;
  statusText: string;
  treaties: Array<{ label: string; turns: number }>;
  actions: Array<{ action: DiplomaticAction; isHostile: boolean }>;
}

interface MinorCivRowData {
  mcId: string;
  mcIdx: number;
  defName: string;
  defColor: string;
  archIcon: string;
  statusColor: string;
  statusText: string;
  questDescription: string | null;
  atWar: boolean;
  warBg: string;
  warBorder: string;
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

  // Pre-compute all data to avoid iterating twice
  const civRows: CivRowData[] = [];
  let civIdx = 0;
  for (const [civId, civ] of Object.entries(state.civilizations)) {
    if (civId === state.currentPlayer) continue;

    const hasMet = hasMetCivilization(state, state.currentPlayer, civId);
    const civDef = getCivDefinition(civ.civType ?? '');
    const relationship = getRelationship(playerDiplomacy, civId);
    const atWar = isAtWar(playerDiplomacy, civId);
    const actions = hasMet
      ? getAvailableActions(
          playerDiplomacy, civId, playerCiv.techState.completed, state.era,
        )
      : [];

    let barColor = '#888';
    if (relationship > 30) barColor = '#4a9b4a';
    else if (relationship > 0) barColor = '#8ab84a';
    else if (relationship > -30) barColor = '#d9d94a';
    else if (relationship > -60) barColor = '#d9944a';
    else barColor = '#d94a4a';

    let statusText = atWar ? '⚔️ At War'
      : relationship > 30 ? '😊 Friendly'
      : relationship > 0 ? '🤝 Neutral'
      : relationship > -30 ? '😐 Cautious'
      : '😠 Hostile';

    const rowActions = [...actions];
    if (civ.breakaway) {
      const turnsLeft = Math.max(0, civ.breakaway.establishesOnTurn - state.turn);
      statusText = civ.breakaway.status === 'secession'
        ? `Breakaway · ${turnsLeft} turns to establishment`
        : 'Established breakaway civ';

      if (
        civ.breakaway.originOwnerId === state.currentPlayer
        && canReabsorbBreakaway(state, state.currentPlayer, civId)
        && !rowActions.includes('reabsorb_breakaway')
      ) {
        rowActions.push('reabsorb_breakaway');
      }
    }

    const treaties = playerDiplomacy.treaties
      .filter(t => t.civB === civId || t.civA === civId)
      .map(t => ({ label: t.type.replace(/_/g, ' '), turns: t.turnsRemaining }));

    civRows.push({
      civId,
      civIdx,
      name: hasMet ? civ.name : `Unknown Civilization ${civIdx + 1}`,
      color: civ.color,
      bonusName: hasMet ? (civDef?.bonusName ?? '') : 'Unknown bonus',
      relationship: hasMet ? relationship : 0,
      barWidth: hasMet ? Math.max(2, (relationship + 100) / 2) : 50,
      barColor: hasMet ? barColor : '#888',
      statusText: hasMet ? statusText : 'Unknown rival',
      treaties,
      actions: rowActions.map(action => ({ action, isHostile: action === 'declare_war' })),
    });
    civIdx++;
  }

  // Minor civs data
  const mcEntries = Object.entries(state.minorCivs ?? {}).filter(([, mc]) => !mc.isDestroyed);
  const minorCivRows: MinorCivRowData[] = [];
  mcEntries.forEach(([mcId, mc], mcIdx) => {
    if (!hasDiscoveredMinorCiv(state, state.currentPlayer, mcId)) return;
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
    if (!def) return;
    const presentation = getMinorCivPresentationForPlayer(state, state.currentPlayer, mcId, 'City-State');
    const rel = mc.diplomacy.relationships[state.currentPlayer] ?? 0;
    const status = rel <= -60 ? 'Hostile' : rel >= 60 ? 'Allied' : rel >= 30 ? 'Friendly' : 'Neutral';
    const archIcon = def.archetype === 'militaristic' ? '⚔️' : def.archetype === 'mercantile' ? '🪙' : '📜';
    const quest = mc.activeQuests[state.currentPlayer];
    const statusColor = rel >= 60 ? '#4a9b4a' : rel >= 30 ? '#8ab84a' : rel <= -60 ? '#d94a4a' : '#888';
    const atWar = mc.diplomacy.atWarWith?.includes(state.currentPlayer) ?? false;

    minorCivRows.push({
      mcId,
      mcIdx,
      defName: presentation.name,
      defColor: presentation.color,
      archIcon,
      statusColor,
      statusText: `${status} (${rel})`,
      questDescription: quest ? getQuestDescriptionForPlayer(state, state.currentPlayer, quest) : null,
      atWar,
      warBg: atWar ? 'rgba(74,155,74,0.3)' : 'rgba(217,74,74,0.3)',
      warBorder: atWar ? '#4a9b4a' : '#d94a4a',
    });
  });

  // Build structural HTML with only hardcoded strings and data-text placeholders
  let civRowsHtml = '';
  for (const row of civRows) {
    let treatiesHtml = '';
    if (row.treaties.length > 0) {
      treatiesHtml = '<div style="margin-bottom:8px;">';
      row.treaties.forEach((t, tIdx) => {
        const turnsPlaceholder = t.turns > 0
          ? ` (<span data-text="treaty-turns-${row.civIdx}-${tIdx}"></span> turns)`
          : '';
        treatiesHtml += `<span style="display:inline-block;background:rgba(232,193,112,0.2);border-radius:4px;padding:2px 8px;font-size:10px;margin-right:4px;"><span data-text="treaty-label-${row.civIdx}-${tIdx}"></span>${turnsPlaceholder}</span>`;
      });
      treatiesHtml += '</div>';
    }

    let actionsHtml = '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    row.actions.forEach((a, aIdx) => {
      const btnColor = a.isHostile ? 'rgba(217,74,74,0.3)' : 'rgba(255,255,255,0.1)';
      const borderColor = a.isHostile ? '#d94a4a' : 'rgba(255,255,255,0.2)';
      actionsHtml += `<button class="diplo-action" data-civ-id="${row.civId}" data-action="${a.action}" style="padding:6px 12px;background:${btnColor};border:1px solid ${borderColor};border-radius:6px;color:white;cursor:pointer;font-size:11px;text-transform:capitalize;" data-text="action-label-${row.civIdx}-${aIdx}"></button>`;
    });
    actionsHtml += '</div>';

    civRowsHtml += `
      <div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:24px;height:24px;border-radius:50%;background:${row.color};"></div>
          <div>
            <div style="font-weight:bold;font-size:14px;" data-text="civ-name-${row.civIdx}"></div>
            <div style="font-size:11px;opacity:0.6;"><span data-text="civ-bonus-${row.civIdx}"></span> · <span data-text="civ-status-${row.civIdx}"></span></div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="font-size:11px;opacity:0.5;min-width:30px;" data-text="civ-rel-${row.civIdx}"></span>
          <div style="flex:1;background:rgba(0,0,0,0.3);border-radius:4px;height:8px;">
            <div style="background:${row.barColor};border-radius:4px;height:8px;width:${row.barWidth}%;"></div>
          </div>
        </div>
        ${treatiesHtml}
        ${actionsHtml}
      </div>
    `;
  }

  let minorCivsHtml = '';
  if (minorCivRows.length > 0) {
    minorCivsHtml = `<h3 style="font-size:15px;color:#e8c170;margin:20px 0 10px;">City-States</h3>`;
    for (const row of minorCivRows) {
      minorCivsHtml += `<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;margin-bottom:8px;">`;
      minorCivsHtml += `<div style="display:flex;justify-content:space-between;align-items:center;">`;
      minorCivsHtml += `<span style="font-size:13px;">${row.archIcon} <strong style="color:${row.defColor};" data-text="mc-name-${row.mcIdx}"></strong></span>`;
      minorCivsHtml += `<span style="font-size:12px;color:${row.statusColor};" data-text="mc-status-${row.mcIdx}"></span>`;
      minorCivsHtml += `</div>`;
      if (row.questDescription !== null) {
        minorCivsHtml += `<div style="font-size:11px;opacity:0.7;margin-top:4px;">Quest: <span data-text="mc-quest-${row.mcIdx}"></span></div>`;
      }
      minorCivsHtml += `<div style="display:flex;gap:6px;margin-top:6px;">`;
      minorCivsHtml += `<button class="mc-gift" data-mc-id="${row.mcId}" style="padding:4px 10px;background:rgba(232,193,112,0.2);border:1px solid rgba(232,193,112,0.4);border-radius:5px;color:#e8c170;cursor:pointer;font-size:10px;">Gift Gold</button>`;
      minorCivsHtml += `<button class="mc-war" data-mc-id="${row.mcId}" data-at-war="${row.atWar}" style="padding:4px 10px;background:${row.warBg};border:1px solid ${row.warBorder};border-radius:5px;color:white;cursor:pointer;font-size:10px;" data-text="mc-war-label-${row.mcIdx}"></button>`;
      minorCivsHtml += `</div>`;
      minorCivsHtml += `</div>`;
    }
  }

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="font-size:18px;color:#e8c170;margin:0;">Diplomacy</h2>
      <span id="diplo-close" style="cursor:pointer;font-size:24px;opacity:0.6;">✕</span>
    </div>
    ${civRowsHtml}
    ${minorCivsHtml}
  `;

  panel.innerHTML = html;

  // Inject all dynamic text via textContent (XSS-safe)
  const setText = (sel: string, text: string) => {
    const el = panel.querySelector(`[data-text="${sel}"]`);
    if (el) el.textContent = text;
  };

  for (const row of civRows) {
    setText(`civ-name-${row.civIdx}`, row.name);
    setText(`civ-bonus-${row.civIdx}`, row.bonusName);
    setText(`civ-status-${row.civIdx}`, row.statusText);
    setText(`civ-rel-${row.civIdx}`, String(row.relationship));
    row.treaties.forEach((t, tIdx) => {
      setText(`treaty-label-${row.civIdx}-${tIdx}`, t.label);
      if (t.turns > 0) {
        setText(`treaty-turns-${row.civIdx}-${tIdx}`, String(t.turns));
      }
    });
    row.actions.forEach((a, aIdx) => {
      setText(`action-label-${row.civIdx}-${aIdx}`, a.action.replace(/_/g, ' '));
    });
  }

  for (const row of minorCivRows) {
    setText(`mc-name-${row.mcIdx}`, row.defName);
    setText(`mc-status-${row.mcIdx}`, row.statusText);
    setText(`mc-war-label-${row.mcIdx}`, row.atWar ? 'Make Peace' : 'Declare War');
    if (row.questDescription !== null) {
      setText(`mc-quest-${row.mcIdx}`, row.questDescription);
    }
  }

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
