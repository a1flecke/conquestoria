import type { BuildableImprovementType, GameState, DisguiseType, HexCoord, WorkerActionType } from '@/core/types';
import { UNIT_DEFINITIONS, UNIT_DESCRIPTIONS, canHeal } from '@/systems/unit-system';
import { getExperienceToNextTier, getVeterancyCombatModifier, getVeterancyTier } from '@/systems/combat-reward-system';
import { isSpyUnitType } from '@/systems/espionage-system';
import { canUpgradeUnit, getCanonicalUpgradeTarget } from '@/systems/unit-upgrade-system';
import { TRAINABLE_UNITS, BUILDINGS } from '@/systems/city-system';
import {
  formatImprovementYieldLabel,
  formatWorkerActionBlockerReason,
  type ImprovementWorkerActionType,
  getAvailableWorkerActions,
  getImprovementDisplayName,
  getKnownTileResourceForWorkerAction,
  getWorkerActionBlockerReason,
  getWorkerActionLabel,
  getWorkerBlockerHints,
  type WorkerActionBlockerReason,
  type WorkerActionEligibilityOptions,
} from '@/systems/improvement-system';
import { DEFAULT_WORKER_CHARGES, getWorkerChargesRemaining } from '@/systems/worker-action-system';
import { getRoadBlockerReason, formatRoadBlockerReason } from '@/systems/road-system';
import { hexKey } from '@/systems/hex-utils';
import { canFoundCityAt, formatCityFoundingBlockerMessage, getCityFoundingBlockers } from '@/systems/city-territory-system';
import { resolveFromCity } from '@/systems/trade-system';
import { canEstablishOutpost, getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { getTransportCargo, getTransportCapacity, getTransportCargoUsed } from '@/systems/transport-system';
import { calculateCivUnitMaintenance } from '@/systems/economy-system';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import {
  getLandUnitWaterRecoveryPanelMessage,
  type LandUnitWaterRecovery,
} from '@/systems/unit-water-recovery';

export interface TransportLoadOption {
  transportId: string;
  label: string;
  disabled?: boolean;
  tooltip?: string;
}

export interface TransportUnloadOption {
  cargoUnitId: string;
  destination: HexCoord;
  label: string;
}

/** One entry in the cargo manifest shown in Stage 1 of the unload UX. */
export interface CargoBoardItem {
  cargoUnitId: string;
  /** Display name of the cargo unit. */
  label: string;
  /** Number of cargo slots this unit occupies. */
  slotCost: number;
  /** Whether this unit can be unloaded this turn. */
  canUnload: boolean;
}

export interface SelectedUnitInfoCallbacks {
  onClose?: () => void;
  onFoundCity?: () => void;
  onWorkerAction?: (action: WorkerActionType) => void;
  onRest?: () => void;
  onSkipTurn?: (unitId: string) => void;
  onDeleteUnit?: (unitId: string) => void;
  onFortify?: (unitId: string) => void;
  onCancelAutoExplore?: () => void;
  onCancelJourney?: () => void;
  onSetDisguise?: (unitId: string, disguise: DisguiseType | null) => void;
  onInfiltrate?: (unitId: string) => void;
  onEmbed?: (unitId: string) => void;
  onUpgradeUnit?: (unitId: string, cityId: string) => void;
  onOpenStack?: (coord: HexCoord) => void;
  onEstablishRoute?: (caravanId: string) => void;
  onEstablishOutpost?: (unitId: string) => void;
  onReplaceImprovement?: (action: BuildableImprovementType) => void;
  getTransportOptions?: (unitId: string) => TransportLoadOption[];
  /** @deprecated Use getCargoBoardInfo + onSelectCargoToUnload instead. */
  getUnloadOptions?: (transportId: string) => TransportUnloadOption[];
  onLoadTransport?: (unitId: string, transportId: string) => void;
  onUnloadTransport?: (transportId: string, cargoUnitId: string, destination: HexCoord) => void;
  /** Returns the cargo manifest for a transport unit (Stage 1 unload UX). */
  getCargoBoardInfo?: (transportId: string) => CargoBoardItem[];
  /** Called when the player clicks Unload for a specific cargo unit (enters Stage 2). */
  onSelectCargoToUnload?: (transportId: string, cargoUnitId: string) => void;
  /** Called when the player cancels an in-progress unload (Stage 2 → deselect). */
  onCancelUnload?: () => void;
  /**
   * When set, the panel renders Stage 2: an instruction banner with the named
   * unit and a Cancel button, instead of the normal cargo list.
   */
  pendingUnloadUnitName?: string;
  getPirateAssaultAction?: (unitId: string) => { factionId: string; label: string } | null;
  onOpenPirateAssault?: (factionId: string, unitId: string) => void;
}

export interface SelectedUnitInfoPresentation {
  waterRecovery?: LandUnitWaterRecovery;
}

function makeButton(label: string, color: string, onClick?: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = `padding:8px 16px;min-height:44px;border-radius:8px;background:${color};border:none;color:white;cursor:pointer;`;
  if (onClick) {
    button.addEventListener('click', onClick);
  }
  return button;
}

/** True for all 5 naval transport unit types. */
function isNavalTransport(unitType: string): boolean {
  return ['transport', 'carrack', 'galleon', 'steamship', 'troop_transport'].includes(unitType);
}

function nextTierLabel(currentLabel: string): string | null {
  if (currentLabel === 'Recruit') return 'Seasoned';
  if (currentLabel === 'Seasoned') return 'Veteran';
  if (currentLabel === 'Veteran') return 'Elite';
  return null;
}

const WORKER_ACTIONS: ImprovementWorkerActionType[] = [
  'farm', 'mine', 'lumber_camp', 'watermill',
  'plantation', 'pasture', 'camp', 'quarry',
  'drain_swamp',
];

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

// A Hunt crisis's foe is a real, named world entity ("any civilization may fight it") —
// surface its name whenever the player selects the actual beast/ship unit. Camps have no
// equivalent selectable-unit tap target (consistent with barbarian camps generally having
// no inspection panel today), so bandit-uprising hunts aren't covered here.
function findHuntFoeNameForUnit(state: GameState, unitId: string): string | undefined {
  for (const crisis of Object.values(state.activeCrises ?? {})) {
    if (crisis.archetype !== 'hunt' || !crisis.huntEntityId || !crisis.foeName) continue;
    if (crisis.huntEntityId === unitId) return crisis.foeName;
    const fleet = state.pirateFleets?.[crisis.huntEntityId];
    if (fleet?.unitId === unitId) return crisis.foeName;
  }
  return undefined;
}

export function renderSelectedUnitInfo(
  container: HTMLElement,
  state: GameState,
  unitId: string,
  callbacks: SelectedUnitInfoCallbacks,
  presentation: SelectedUnitInfoPresentation = {},
): void {
  const unit = state.units[unitId];
  if (!unit) {
    container.style.display = 'none';
    container.replaceChildren();
    return;
  }

  const def = UNIT_DEFINITIONS[unit.type];
  const isBeast = unit.owner === 'beasts';
  // Beasts have no civilization entry — use their dedicated crimson color
  const civColor = isBeast ? '#7a1f2b' : (state.civilizations[unit.owner]?.color ?? '#e8c170');
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
  if (isBeast) {
    const legendLabel = document.createElement('span');
    legendLabel.style.cssText = `margin-left:8px;font-size:11px;font-weight:700;text-transform:uppercase;color:${civColor};letter-spacing:0.05em;`;
    legendLabel.textContent = '⚠ Legendary Beast';
    infoDiv.appendChild(legendLabel);
  }
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

  const huntFoeName = findHuntFoeNameForUnit(state, unitId);
  if (huntFoeName) {
    const huntLine = document.createElement('div');
    huntLine.style.cssText = 'margin-top:6px;padding:6px 8px;border-radius:6px;background:rgba(122,31,43,0.25);border:1px solid rgba(122,31,43,0.5);font-size:11px;font-weight:700;color:#e88;';
    huntLine.textContent = `⚔ ${huntFoeName} — slay it to end the threat. Any civilization may claim the hunt.`;
    wrapper.appendChild(huntLine);
  }

  const waterRecovery = presentation.waterRecovery;
  const waterRecoveryMessage = waterRecovery
    ? getLandUnitWaterRecoveryPanelMessage(waterRecovery)
    : null;
  if (waterRecovery && waterRecoveryMessage) {
    const recoveryLine = document.createElement('div');
    recoveryLine.dataset.waterRecoveryKind = waterRecovery.kind;
    recoveryLine.setAttribute('role', 'status');
    recoveryLine.setAttribute('aria-live', 'polite');
    recoveryLine.style.cssText = 'margin-top:8px;padding:8px;border:1px solid rgba(245,184,73,0.45);border-radius:8px;background:rgba(245,184,73,0.16);color:#f5b849;font-size:12px;font-weight:600;line-height:1.4;';
    recoveryLine.textContent = waterRecoveryMessage;
    wrapper.appendChild(recoveryLine);
  }

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

  if (unit.owner === state.currentPlayer) {
    const unitMaint = calculateCivUnitMaintenance(state, unit.owner);
    const freeEntry = unitMaint.freeDefenderUnits.find(r => r.id === unitId)
      ?? unitMaint.supportedUnits.find(r => r.id === unitId);
    const paidEntry = unitMaint.paidUnits.find(r => r.id === unitId);
    if (freeEntry || paidEntry) {
      const upkeepLine = document.createElement('div');
      upkeepLine.style.cssText = 'font-size:10px;margin-top:2px;';
      if (freeEntry) {
        upkeepLine.textContent = 'Upkeep: Free support';
        upkeepLine.style.color = '#4ade80';
      } else {
        upkeepLine.textContent = `Upkeep: -${paidEntry!.upkeep} 💰/turn`;
        upkeepLine.style.color = '#f87171';
      }
      wrapper.appendChild(upkeepLine);
    }
  }

  const friendlyUnitsHere = Object.values(state.units).filter(other =>
    other.owner === unit.owner && !other.transportId && hexKey(other.position) === hexKey(unit.position),
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

  if (unit.automation?.mode === 'journey') {
    const { q, r } = unit.automation.destination;
    const statusRow = document.createElement('div');
    statusRow.style.cssText = 'margin-top:8px;font-size:12px;color:#fcd34d;display:flex;justify-content:space-between;align-items:center;gap:8px;';
    const statusText = document.createElement('span');
    statusText.textContent = `Journeying to (${q}, ${r})`;
    statusRow.appendChild(statusText);
    if (callbacks.onCancelJourney) {
      statusRow.appendChild(makeButton('Cancel journey', '#b45309', callbacks.onCancelJourney));
    }
    wrapper.appendChild(statusRow);
  }

  const actionsDiv = document.createElement('div');
  actionsDiv.style.cssText = 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;';

  if (unit.transportId) {
    const transport = state.units[unit.transportId];
    const transportStatus = document.createElement('div');
    transportStatus.style.cssText = 'margin-top:8px;font-size:12px;color:#a5f3fc;';
    transportStatus.textContent = `Aboard ${transport ? UNIT_DEFINITIONS[transport.type]?.name ?? 'Transport' : 'Transport'}`;
    wrapper.appendChild(transportStatus);
    container.appendChild(wrapper);
    return;
  }

  if (isNavalTransport(unit.type)) {
    const cargo = getTransportCargo(state, unitId);
    const cargoDiv = document.createElement('div');
    cargoDiv.style.cssText = 'margin-top:8px;font-size:12px;color:#bfdbfe;';
    cargoDiv.textContent = cargo.length === 0
      ? 'Cargo: Empty'
      : `Cargo: Carrying ${cargo.map(cargoUnit => UNIT_DEFINITIONS[cargoUnit.type]?.name ?? cargoUnit.type).join(', ')}`;
    wrapper.appendChild(cargoDiv);
  }

  if (def.canFoundCity && callbacks.onFoundCity) {
    if (unit.movementPointsLeft > 0 && canFoundCityAt(state, unit.position)) {
      actionsDiv.appendChild(makeButton('Found City', '#e8c170', callbacks.onFoundCity));
    } else {
      const blockerTitle = unit.movementPointsLeft <= 0
        ? 'No movement remaining'
        : formatCityFoundingBlockerMessage(getCityFoundingBlockers(state, unit.position));
      const btn = makeButton('Found City', '#e8c170');
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.title = blockerTitle;
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
      const knownResource = tile ? getKnownTileResourceForWorkerAction(tile, completedTechs) : null;
      const workerEligibilityOptions = { isCityTile, knownResource, currentTurn: state.turn };
      const workerActions = getAvailableWorkerActions(tile, completedTechs, unit.owner, workerEligibilityOptions);
      if (knownResource) {
        const rd = RESOURCE_DEFINITIONS.find(r => r.id === knownResource);
        if (rd) {
          const resourceInfoDiv = document.createElement('div');
          resourceInfoDiv.style.cssText = 'font-size:12px;color:#e8c170;margin-bottom:4px;';
          const effectStr = rd.effect ? ` · +${rd.effect.amount} ${rd.effect.type}` : '';
          resourceInfoDiv.textContent = `${rd.icon} ${rd.name} (${rd.type})${effectStr} — harvest with: ${getImprovementDisplayName(rd.requiredImprovement)}`;
          wrapper.appendChild(resourceInfoDiv);
        }
      }
      for (const action of workerActions) {
        const color = action === 'farm'
          ? '#6b9b4b'
          : action === 'mine'
            ? '#8b7355'
            : action === 'lumber_camp'
              ? '#476f3a'
              : action === 'watermill'
                ? '#3f7f8f'
                : action === 'drain_swamp'
                  ? '#4a7c59'
                  : action === 'restore_land'
                    ? '#b45309'
                    : '#64748b';
        let label = action === 'drain_swamp'
          ? 'Drain Swamp (→ Grassland, +1 🌾)'
          : getWorkerActionLabel(action);
        if (knownResource && action !== 'drain_swamp' && action !== 'restore_land') {
          const rd = RESOURCE_DEFINITIONS.find(r => r.id === knownResource && r.requiredImprovement === action);
          if (rd) {
            const yieldLabel = formatImprovementYieldLabel(action);
            label = `Build ${getImprovementDisplayName(action)} → ${rd.icon} ${rd.name}${yieldLabel ? ` ${yieldLabel}` : ''}`;
          }
        }
        actionsDiv.appendChild(makeButton(label, color, () => callbacks.onWorkerAction!(action)));
      }

      const roadBlockerReason = getRoadBlockerReason(tile, completedTechs, unit.owner, isCityTile);
      if (roadBlockerReason === 'none') {
        actionsDiv.appendChild(makeButton('Build Road (2 turns)', '#8a6a3a', () => callbacks.onWorkerAction!('build_road')));
      } else if (roadBlockerReason === 'requires-tech' || roadBlockerReason === 'outside-territory') {
        const btn = makeButton('Build Road (2 turns)', '#8a6a3a');
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.title = formatRoadBlockerReason(roadBlockerReason);
        actionsDiv.appendChild(btn);
      }

      if (workerActions.length === 0) {
        const eligibilityOpts = workerEligibilityOptions;
        if (tile && tile.improvement !== 'none' && callbacks.onReplaceImprovement) {
          const replaceable = getAvailableWorkerActions(tile, completedTechs, unit.owner, { ...workerEligibilityOptions, allowReplacement: true })
            .filter((a): a is BuildableImprovementType => a !== 'drain_swamp' && a !== 'restore_land');
          for (const action of replaceable) {
            const yieldStr = formatImprovementYieldLabel(action);
            const label = `Replace ${getImprovementDisplayName(tile.improvement)} with ${getImprovementDisplayName(action)}${yieldStr ? ` ${yieldStr}` : ''}`;
            actionsDiv.appendChild(makeButton(label, '#7c5c38', () => callbacks.onReplaceImprovement!(action)));
          }
        } else {
          const hints = getWorkerBlockerHints(tile, completedTechs, unit.owner, eligibilityOpts);
          const displayText = hints.length > 0
            ? hints.join(' · ')
            : formatWorkerActionBlockerReason(chooseWorkerBlockerReason(tile, completedTechs, unit.owner, eligibilityOpts));
          if (displayText) {
            const blockerDiv = document.createElement('div');
            blockerDiv.style.cssText = 'font-size:11px;color:#f8d28a;margin-top:4px;';
            blockerDiv.textContent = displayText;
            wrapper.appendChild(blockerDiv);
          }
        }
      }
    }
  }

  // Caravan-specific actions
  if (unit.type === 'caravan' && unit.owner === state.currentPlayer) {
    if (unit.committedToRouteId) {
      const statusEl = document.createElement('div');
      statusEl.style.cssText = 'font-size:12px;opacity:0.7;padding:8px 0;';
      statusEl.textContent = `Committed to route (${unit.tripsRemaining ?? '?'} trips remaining)`;
      actionsDiv.appendChild(statusEl);
    } else if (callbacks.onEstablishRoute) {
      const fromCity = resolveFromCity(state, unit);
      const hasCapacity = fromCity !== null;
      const btn = makeButton('Establish Route', '#e8c170');
      if (!hasCapacity) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.title = 'No cities with available route capacity — build a Caravanserai or Marketplace to add slots';
      } else {
        btn.addEventListener('click', () => callbacks.onEstablishRoute!(unitId));
      }
      actionsDiv.appendChild(btn);
    }
  }

  if (unit.type === 'expedition' && !unit.hasActed && callbacks.onEstablishOutpost) {
    if (canEstablishOutpost(state, unitId)) {
      const btn = makeButton('🚩 Establish Outpost', '#4a7c59');
      btn.title = 'Plant a Resource Outpost on this tile. Expedition is consumed immediately. Outpost completes in 2 turns.';
      btn.style.cssText += ';min-height:44px;width:100%;margin-top:6px;';
      btn.addEventListener('click', () => callbacks.onEstablishOutpost!(unitId));
      actionsDiv.appendChild(btn);
    }
  }

  // ── Load onto transport ───────────────────────────────────────────────────
  // Show for any unit that is not already aboard a transport and is not itself
  // a naval transport (transports cannot board other transports).
  if (!unit.transportId && !isNavalTransport(unit.type) && callbacks.getTransportOptions && callbacks.onLoadTransport) {
    const transportOptions = callbacks.getTransportOptions(unitId);
    for (const option of transportOptions) {
      const btn = makeButton(option.label, option.disabled ? '#374151' : '#2563eb',
        option.disabled ? undefined : () => callbacks.onLoadTransport!(unitId, option.transportId));
      if (option.disabled) {
        btn.disabled = true;
        btn.style.opacity = '0.55';
        btn.style.cursor = 'not-allowed';
      }
      if (option.tooltip) {
        btn.title = option.tooltip;
      }
      actionsDiv.appendChild(btn);
    }
  }

  // ── Naval transport cargo panel ───────────────────────────────────────────
  if (isNavalTransport(unit.type) && callbacks.getCargoBoardInfo && callbacks.onSelectCargoToUnload) {
    const cargoItems = callbacks.getCargoBoardInfo(unitId);
    const capacity = getTransportCapacity(state.units[unitId]!);
    const used = getTransportCargoUsed(state, unitId);

    // Slot bar header
    const cargoHeader = document.createElement('div');
    cargoHeader.style.cssText = 'margin-top:8px;font-size:11px;opacity:0.7;';
    cargoHeader.textContent = `Cargo: ${used}/${capacity} slots`;
    actionsDiv.appendChild(cargoHeader);

    if (callbacks.pendingUnloadUnitName) {
      // ── Stage 2: unload destination picking ──────────────────────────────
      const banner = document.createElement('div');
      banner.style.cssText = 'margin-top:6px;padding:8px 10px;background:rgba(15,118,110,0.25);border-radius:8px;border:1px solid rgba(15,118,110,0.5);font-size:12px;';
      banner.textContent = `Tap a highlighted hex to disembark ${callbacks.pendingUnloadUnitName}.`;
      actionsDiv.appendChild(banner);
      if (callbacks.onCancelUnload) {
        const cancelBtn = makeButton('Cancel Unload', '#374151', () => callbacks.onCancelUnload!());
        cancelBtn.style.cssText += ';margin-top:6px;width:100%;border:1px solid rgba(255,255,255,0.2);';
        actionsDiv.appendChild(cancelBtn);
      }
    } else if (cargoItems.length === 0) {
      // ── Empty hold ───────────────────────────────────────────────────────
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'margin-top:4px;font-size:11px;opacity:0.5;font-style:italic;';
      emptyMsg.textContent = 'Hold is empty.';
      actionsDiv.appendChild(emptyMsg);
    } else {
      // ── Stage 1: cargo manifest with per-unit Unload buttons ─────────────
      for (const item of cargoItems) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;';

        const slotBadge = document.createElement('span');
        slotBadge.style.cssText = 'font-size:10px;background:rgba(255,255,255,0.12);border-radius:4px;padding:2px 5px;flex-shrink:0;';
        slotBadge.textContent = `${item.slotCost}⚓`;
        row.appendChild(slotBadge);

        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'font-size:12px;flex:1;';
        nameSpan.textContent = item.label;
        row.appendChild(nameSpan);

        const unloadBtn = makeButton('Unload', item.canUnload ? '#0f766e' : '#374151',
          item.canUnload ? () => callbacks.onSelectCargoToUnload!(unitId, item.cargoUnitId) : undefined);
        unloadBtn.style.cssText += ';padding:4px 10px;min-height:36px;font-size:11px;';
        if (!item.canUnload) {
          unloadBtn.disabled = true;
          unloadBtn.style.opacity = '0.45';
          unloadBtn.style.cursor = 'not-allowed';
          unloadBtn.title = 'Unit has already acted this turn.';
        }
        row.appendChild(unloadBtn);
        actionsDiv.appendChild(row);
      }
    }
  }

  if (canHeal(unit) && !unit.hasMoved && !unit.hasActed && unit.movementPointsLeft > 0 && callbacks.onRest) {
    actionsDiv.appendChild(makeButton('Rest (+15 HP)', '#4a90d9', callbacks.onRest));
  }

  const pirateAssault = callbacks.getPirateAssaultAction?.(unitId);
  if (pirateAssault && callbacks.onOpenPirateAssault) {
    actionsDiv.appendChild(makeButton(
      pirateAssault.label,
      '#8b2635',
      () => callbacks.onOpenPirateAssault?.(pirateAssault.factionId, unitId),
    ));
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
    } else if (!unit.hasMoved && !unit.hasActed && unit.movementPointsLeft > 0) {
      actionsDiv.appendChild(makeButton('Fortify', '#3b5268', () => callbacks.onFortify!(unitId)));
    }
  }

  if (isSpyUnitType(unit.type) && !unit.hasActed && callbacks.onSetDisguise) {
    const spy = state.espionage?.[unit.owner]?.spies[unitId];
    if (spy?.status === 'idle') {
    const SPY_DISGUISE_TIERS: Partial<Record<string, number>> = {
      spy_scout: 0, spy_informant: 1, spy_agent: 2, spy_operative: 3, spy_hacker: 3,
    };
    const spyTier = SPY_DISGUISE_TIERS[unit.type] ?? 0;
    type DisguiseOption = { label: string; value: DisguiseType | null; minTier?: number };
    const allDisguises: DisguiseOption[] = [
      { label: 'No Disguise',   value: null },
      { label: 'As Barbarian',  value: 'barbarian', minTier: 1 },
      { label: 'As Warrior',    value: 'warrior',   minTier: 1 },
      { label: 'As Scout',      value: 'scout',     minTier: 2 },
      { label: 'As Archer',     value: 'archer',    minTier: 2 },
      { label: 'As Worker',     value: 'worker',    minTier: 3 },
    ];
    const disguiseOptions = allDisguises.filter(opt => !opt.minTier || spyTier >= opt.minTier);

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
      const availableResources = getCivAvailableResources(state, unit.owner);
      const upgrade = canUpgradeUnit(unit, homeCity.id, state.cities, completedTechs, civGold, availableResources);
      if (upgrade.canUpgrade && upgrade.targetType) {
        const targetName = UNIT_DEFINITIONS[upgrade.targetType].name;
        const btn = makeButton(
          `Upgrade → ${targetName} (${upgrade.cost} gold)`,
          '#7c3aed',
          () => callbacks.onUpgradeUnit!(unitId, homeCity.id),
        );
        actionsDiv.appendChild(btn);
      } else if (upgrade.reason === 'missing-building') {
        const targetType = getCanonicalUpgradeTarget(unit, completedTechs);
        const requiredBuilding = targetType
          ? TRAINABLE_UNITS.find(candidate => candidate.type === targetType)?.trainedFromBuilding
          : undefined;
        const buildingName = requiredBuilding ? BUILDINGS[requiredBuilding]?.name ?? requiredBuilding : 'the required building';
        const blockerDiv = document.createElement('div');
        blockerDiv.style.cssText = 'font-size:11px;color:#f8d28a;margin-top:4px;';
        blockerDiv.textContent = `Upgrade requires ${buildingName} in this city.`;
        wrapper.appendChild(blockerDiv);
      }
    }
  }

  if (actionsDiv.childElementCount > 0) {
    wrapper.appendChild(actionsDiv);
  }

  container.appendChild(wrapper);
}
