import type { GameState, DisguiseType } from '@/core/types';
import { UNIT_DEFINITIONS, UNIT_DESCRIPTIONS, canHeal } from '@/systems/unit-system';
import { isSpyUnitType } from '@/systems/espionage-system';
import { canBuildImprovement } from '@/systems/improvement-system';
import { hexKey } from '@/systems/hex-utils';

export interface SelectedUnitInfoCallbacks {
  onClose?: () => void;
  onFoundCity?: () => void;
  onBuildFarm?: () => void;
  onBuildMine?: () => void;
  onRest?: () => void;
  onCancelAutoExplore?: () => void;
  onSetDisguise?: (unitId: string, disguise: DisguiseType | null) => void;
  onInfiltrate?: (unitId: string) => void;
}

function makeButton(label: string, color: string, onClick?: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = `padding:8px 16px;border-radius:8px;background:${color};border:none;color:white;cursor:pointer;`;
  if (onClick) {
    button.addEventListener('click', onClick);
  }
  return button;
}

export function renderSelectedUnitInfo(
  container: HTMLElement,
  state: GameState,
  unitId: string,
  callbacks: SelectedUnitInfoCallbacks,
): void {
  const unit = state.units[unitId];
  if (!unit) {
    container.style.display = 'none';
    container.replaceChildren();
    return;
  }

  const def = UNIT_DEFINITIONS[unit.type];
  const civColor = state.civilizations[unit.owner]?.color ?? '#e8c170';
  const tile = state.map.tiles[hexKey(unit.position)];

  container.style.display = 'block';
  container.replaceChildren();

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `background:rgba(0,0,0,0.85);border-radius:12px;padding:12px 16px;border-left:4px solid ${civColor};`;

  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

  const infoDiv = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = def.name;
  infoDiv.appendChild(strong);
  infoDiv.appendChild(document.createTextNode(` · HP: ${unit.health}/100 · Moves: ${unit.movementPointsLeft}/${def.movementPoints}`));

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.style.cssText = 'cursor:pointer;font-size:18px;opacity:0.6;background:none;border:none;color:white;';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => callbacks.onClose?.());

  topRow.appendChild(infoDiv);
  topRow.appendChild(closeBtn);

  const descDiv = document.createElement('div');
  descDiv.style.cssText = 'font-size:10px;opacity:0.6;margin-top:2px;';
  descDiv.textContent = UNIT_DESCRIPTIONS[unit.type] ?? '';

  wrapper.appendChild(topRow);
  wrapper.appendChild(descDiv);

  if (unit.automation?.mode === 'auto-explore') {
    const statusRow = document.createElement('div');
    statusRow.style.cssText = 'margin-top:8px;font-size:12px;color:#a5f3fc;display:flex;justify-content:space-between;align-items:center;gap:8px;';
    const statusText = document.createElement('span');
    statusText.textContent = `Auto-exploring since turn ${unit.automation.startedTurn}`;
    statusRow.appendChild(statusText);
    if (callbacks.onCancelAutoExplore) {
      statusRow.appendChild(makeButton('Cancel auto-explore', '#0f766e', callbacks.onCancelAutoExplore));
    }
    wrapper.appendChild(statusRow);
  }

  const actionsDiv = document.createElement('div');
  actionsDiv.style.cssText = 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;';

  if (def.canFoundCity && callbacks.onFoundCity) {
    actionsDiv.appendChild(makeButton('Found City', '#e8c170', callbacks.onFoundCity));
  }

  if (def.canBuildImprovements) {
    if (tile && canBuildImprovement(tile, 'farm') && callbacks.onBuildFarm) {
      actionsDiv.appendChild(makeButton('Build Farm', '#6b9b4b', callbacks.onBuildFarm));
    }
    if (tile && canBuildImprovement(tile, 'mine') && callbacks.onBuildMine) {
      actionsDiv.appendChild(makeButton('Build Mine', '#8b7355', callbacks.onBuildMine));
    }
  }

  if (canHeal(unit) && !unit.hasActed && callbacks.onRest) {
    actionsDiv.appendChild(makeButton('Rest (+15 HP)', '#4a90d9', callbacks.onRest));
  }

  if (isSpyUnitType(unit.type) && !unit.hasActed && callbacks.onSetDisguise) {
    const spy = state.espionage?.[unit.owner]?.spies[unitId];
    if (spy?.status === 'idle') {
    const ownerTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
    type DisguiseOption = { label: string; value: DisguiseType | null; tech?: string };
    const allDisguises: DisguiseOption[] = [
      { label: 'No Disguise', value: null },
      { label: 'As Barbarian', value: 'barbarian', tech: 'espionage-informants' },
      { label: 'As Warrior',   value: 'warrior',   tech: 'espionage-informants' },
      { label: 'As Scout',     value: 'scout',     tech: 'spy-networks' },
      { label: 'As Archer',    value: 'archer',    tech: 'spy-networks' },
      { label: 'As Worker',    value: 'worker',    tech: 'cryptography' },
    ];
    const disguiseOptions = allDisguises.filter(opt => !opt.tech || ownerTechs.includes(opt.tech));

    if (disguiseOptions.length > 1) {
      const disguiseSection = document.createElement('div');
      disguiseSection.style.cssText = 'margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;';
      const sectionLabel = document.createElement('div');
      sectionLabel.textContent = "Set disguise (costs this turn's move):";
      sectionLabel.style.cssText = 'font-size:10px;opacity:0.6;width:100%;';
      disguiseSection.appendChild(sectionLabel);
      for (const opt of disguiseOptions) {
        const active = (spy?.disguiseAs ?? null) === opt.value;
        const btn = makeButton(active ? `✓ ${opt.label}` : opt.label, active ? '#7c3aed' : '#374151',
          () => callbacks.onSetDisguise!(unitId, opt.value));
        disguiseSection.appendChild(btn);
      }
      actionsDiv.appendChild(disguiseSection);
    }
    } // end spy?.status === 'idle'
  }

  if (isSpyUnitType(unit.type) && callbacks.onInfiltrate) {
    const spyRecord = state.espionage?.[unit.owner]?.spies[unitId];
    const isAvailable = !unit.hasActed && (
      !spyRecord || spyRecord.status === 'idle' ||
      (spyRecord.status === 'cooldown' && (spyRecord.cooldownTurns ?? 1) === 0)
    );
    const enemyCityHere = Object.values(state.cities).some(
      c => c.owner !== unit.owner && c.position.q === unit.position.q && c.position.r === unit.position.r,
    );
    if (enemyCityHere) {
      if (isAvailable) {
        actionsDiv.appendChild(makeButton('Infiltrate City', '#7c3aed', () => callbacks.onInfiltrate!(unitId)));
      } else if (spyRecord?.status === 'cooldown' && (spyRecord.cooldownTurns ?? 0) > 0) {
        const btn = makeButton(`Infiltrate City (${spyRecord.cooldownTurns}t)`, '#4b5563');
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        actionsDiv.appendChild(btn);
      }
    }
  }

  if (actionsDiv.childElementCount > 0) {
    wrapper.appendChild(actionsDiv);
  }

  container.appendChild(wrapper);
}
