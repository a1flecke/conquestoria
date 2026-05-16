import type { GameState, DisguiseType, HexCoord, WorkerActionType } from '@/core/types';
import { UNIT_DEFINITIONS, UNIT_DESCRIPTIONS, canHeal } from '@/systems/unit-system';
import { getExperienceToNextTier, getVeterancyCombatModifier, getVeterancyTier } from '@/systems/combat-reward-system';
import { isSpyUnitType } from '@/systems/espionage-system';
import { canUpgradeUnit } from '@/systems/unit-upgrade-system';
import {
  formatWorkerActionBlockerReason,
  getAvailableWorkerActions,
  getWorkerActionBlockerReason,
  getWorkerActionLabel,
  type WorkerActionBlockerReason,
  type WorkerActionEligibilityOptions,
} from '@/systems/improvement-system';
import { DEFAULT_WORKER_CHARGES, getWorkerChargesRemaining } from '@/systems/worker-action-system';
import { hexKey } from '@/systems/hex-utils';
import { canFoundCityAt, formatCityFoundingBlockerMessage, getCityFoundingBlockers } from '@/systems/city-territory-system';

export interface SelectedUnitInfoCallbacks {
  onClose?: () => void;
  onFoundCity?: () => void;
  onWorkerAction?: (action: WorkerActionType) => void;
  onRest?: () => void;
  onSkipTurn?: (unitId: string) => void;
  onDeleteUnit?: (unitId: string) => void;
  onFortify?: (unitId: string) => void;
  onCancelAutoExplore?: () => void;
  onSetDisguise?: (unitId: string, disguise: DisguiseType | null) => void;
  onInfiltrate?: (unitId: string) => void;
  onEmbed?: (unitId: string) => void;
  onUpgradeUnit?: (unitId: string, cityId: string) => void;
  onOpenStack?: (coord: HexCoord) => void;
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

function nextTierLabel(currentLabel: string): string | null {
  if (currentLabel === 'Recruit') return 'Seasoned';
  if (currentLabel === 'Seasoned') return 'Veteran';
  if (currentLabel === 'Veteran') return 'Elite';
  return null;
}

const WORKER_ACTIONS: WorkerActionType[] = ['farm', 'mine', 'lumber_camp', 'watermill', 'drain_swamp'];

function chooseWorkerBlockerReason(
  tile: GameState['map']['tiles'][string] | undefined,
  completedTechs: string[],
  ownerId: string,
  options: WorkerActionEligibilityOptions,
): WorkerActionBlockerReason {
  let fallback: WorkerActionBlockerReason = 'invalid-terrain';
  for (const action of WORKER_ACTIONS) {
    const reason = getWorkerActionBlockerReason(tile, action, completedTechs, ownerId, options);
    if (reason === 'none') return 'none';
    if (reason !== 'invalid-terrain' && reason !== 'requires-tech') return reason;
    fallback = reason;
  }
  return fallback;
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

  const tier = getVeterancyTier(unit);
  const nextTierXp = getExperienceToNextTier(unit);
  const nextLabel = nextTierLabel(tier.label);
  const combatBonus = Math.round(getVeterancyCombatModifier(unit) * 100);
  const xpDiv = document.createElement('div');
  xpDiv.style.cssText = 'font-size:10px;opacity:0.75;margin-top:4px;';
  xpDiv.textContent = nextTierXp === null || nextLabel === null
    ? `XP: ${unit.experience ?? 0} · ${tier.label} · +${combatBonus}% combat`
    : `XP: ${unit.experience ?? 0} · ${tier.label} · +${combatBonus}% combat · ${nextTierXp} XP to ${nextLabel}`;
  wrapper.appendChild(xpDiv);

  const friendlyUnitsHere = Object.values(state.units).filter(other =>
    other.owner === unit.owner && hexKey(other.position) === hexKey(unit.position),
  );
  if (friendlyUnitsHere.length > 1 && callbacks.onOpenStack) {
    const stackRow = document.createElement('div');
    stackRow.style.cssText = 'margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;color:#e8c170;';
    const stackText = document.createElement('span');
    stackText.textContent = `Stack: ${friendlyUnitsHere.length} units here`;
    const switchButton = makeButton('Switch unit', '#374151', () => callbacks.onOpenStack?.({ ...unit.position }));
    stackRow.appendChild(stackText);
    stackRow.appendChild(switchButton);
    wrapper.appendChild(stackRow);
  }

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
    if (canFoundCityAt(state, unit.position)) {
      actionsDiv.appendChild(makeButton('Found City', '#e8c170', callbacks.onFoundCity));
    } else {
      const blockers = getCityFoundingBlockers(state, unit.position);
      const btn = makeButton('Found City', '#e8c170');
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.title = formatCityFoundingBlockerMessage(blockers);
      actionsDiv.appendChild(btn);
    }
  }

  if (def.canBuildImprovements) {
    const charges = getWorkerChargesRemaining(unit);
    const chargeDiv = document.createElement('div');
    chargeDiv.style.cssText = 'font-size:10px;opacity:0.75;margin-top:6px;';
    chargeDiv.textContent = `Worker Charges: ${charges}/${DEFAULT_WORKER_CHARGES}`;
    wrapper.appendChild(chargeDiv);

    if (charges > 0 && !unit.hasActed && callbacks.onWorkerAction) {
      const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
      const unitTileKey = hexKey(unit.position);
      const isCityTile = Object.values(state.cities).some(city => hexKey(city.position) === unitTileKey);
      const workerActions = getAvailableWorkerActions(tile, completedTechs, unit.owner, { isCityTile });
      for (const action of workerActions) {
        const color = action === 'farm'
          ? '#6b9b4b'
          : action === 'mine'
            ? '#8b7355'
            : action === 'lumber_camp'
              ? '#476f3a'
              : action === 'watermill'
                ? '#3f7f8f'
                : '#64748b';
        actionsDiv.appendChild(makeButton(getWorkerActionLabel(action), color, () => callbacks.onWorkerAction!(action)));
      }
      if (workerActions.length === 0) {
        const blockerReason = chooseWorkerBlockerReason(tile, completedTechs, unit.owner, { isCityTile });
        const blockerText = formatWorkerActionBlockerReason(blockerReason);
        if (blockerText) {
          const blockerDiv = document.createElement('div');
          blockerDiv.style.cssText = 'font-size:11px;color:#f8d28a;margin-top:4px;';
          blockerDiv.textContent = blockerText;
          wrapper.appendChild(blockerDiv);
        }
      }
    }
  }

  if (canHeal(unit) && !unit.hasActed && callbacks.onRest) {
    actionsDiv.appendChild(makeButton('Rest (+15 HP)', '#4a90d9', callbacks.onRest));
  }

  if (unit.movementPointsLeft > 0 && !unit.hasActed && !unit.skippedTurn && callbacks.onSkipTurn) {
    actionsDiv.appendChild(makeButton('Skip Turn', '#5b6472', () => callbacks.onSkipTurn!(unitId)));
  }

  if (callbacks.onDeleteUnit) {
    actionsDiv.appendChild(makeButton('Delete Unit', '#b91c1c', () => callbacks.onDeleteUnit!(unitId)));
  }

  if (def.strength > 0 && callbacks.onFortify) {
    if (unit.isFortified) {
      actionsDiv.appendChild(makeButton('Unfortify', '#6b7a8a', () => callbacks.onFortify!(unitId)));
    } else if (!unit.hasActed) {
      actionsDiv.appendChild(makeButton('Fortify', '#3b5268', () => callbacks.onFortify!(unitId)));
    }
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

  if (isSpyUnitType(unit.type) && callbacks.onEmbed) {
    const spyRecord = state.espionage?.[unit.owner]?.spies[unitId];
    const ownCityHere = Object.values(state.cities).some(
      c => c.owner === unit.owner && c.position.q === unit.position.q && c.position.r === unit.position.r,
    );
    if (ownCityHere && spyRecord?.status === 'idle' && !unit.hasActed) {
      actionsDiv.appendChild(makeButton('Embed (counter-espionage)', '#374151', () => callbacks.onEmbed!(unitId)));
    }
  }

  if (callbacks.onUpgradeUnit && !unit.hasActed) {
    const homeCity = Object.values(state.cities).find(
      c => c.owner === unit.owner &&
           c.position.q === unit.position.q &&
           c.position.r === unit.position.r,
    );
    if (homeCity) {
      const completedTechs = state.civilizations[unit.owner]?.techState?.completed ?? [];
      const civGold = state.civilizations[unit.owner]?.gold ?? 0;
      const upgrade = canUpgradeUnit(unit, homeCity.id, state.cities, completedTechs, civGold);
      if (upgrade.canUpgrade && upgrade.targetType) {
        const targetName = UNIT_DEFINITIONS[upgrade.targetType].name;
        const btn = makeButton(
          `Upgrade → ${targetName} (${upgrade.cost} gold)`,
          '#7c3aed',
          () => callbacks.onUpgradeUnit!(unitId, homeCity.id),
        );
        actionsDiv.appendChild(btn);
      }
    }
  }

  if (actionsDiv.childElementCount > 0) {
    wrapper.appendChild(actionsDiv);
  }

  container.appendChild(wrapper);
}
