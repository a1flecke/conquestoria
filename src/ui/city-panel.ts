import type { City, CityFocus, GameState, HexCoord } from '@/core/types';
import {
  getAvailableBuildings,
  BUILDINGS,
  TRAINABLE_UNITS,
  getTrainableUnitsForCiv,
  getProductionCostForItem,
  getProductionDisplayName,
  getProductionIconForItem,
} from '@/systems/city-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
import {
  getCompactLegendaryWonderEntriesForCity,
  getLegendaryWonderPresentationForCity,
} from '@/systems/legendary-wonder-presentation';
import { canUpgradeUnit, getUpgradeCost } from '@/systems/unit-upgrade-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getUnrestYieldMultiplier } from '@/systems/faction-system';
import { getOccupiedCityMood, getOccupiedCityYieldMultiplier } from '@/systems/city-occupation-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { createCityGrid } from './city-grid';
import {
  calculateCityBuildingMaintenance,
  calculateCivEconomy,
  formatMaintenanceTooltip,
  getRushBuyQuote,
  type RushBuyDisabledReason,
} from '@/systems/economy-system';

export interface CityPanelCallbacks {
  onBuild: (cityId: string, itemId: string) => void;
  onMoveQueueItem?: (cityId: string, fromIndex: number, toIndex: number) => void;
  onRemoveQueueItem?: (cityId: string, index: number) => void;
  onOpenWonderPanel: (cityId: string) => void;
  onSetCityFocus?: (cityId: string, focus: Exclude<CityFocus, 'custom'>) => GameState | void;
  onToggleWorkedTile?: (cityId: string, coord: HexCoord, worked: boolean) => GameState | void;
  onPlaceBuilding?: (cityId: string, buildingId: string, row: number, col: number) => void;
  onClose: () => void;
  onPrevCity?: () => void;
  onNextCity?: () => void;
  onUpgradeUnit?: (unitId: string) => void;
  onSetIdleProduction?: (cityId: string, mode: 'gold' | 'science' | null) => void;
  onRushBuyActiveProduction?: (cityId: string) => GameState | void;
}

type CityPanelTab = 'list' | 'grid';

function getWonderBuildListStatus(state: string): string {
  switch (state) {
    case 'ready':
      return 'Ready to build';
    case 'building':
      return 'Under construction';
    case 'recovered':
      return 'Carryover recovered';
    case 'questing':
      return 'Quest in progress';
    case 'near':
      return 'Available soon';
    default:
      return 'Open journal';
  }
}

function getRushBuyReasonText(reason: RushBuyDisabledReason | null): string | null {
  switch (reason) {
    case 'no-active-production':
      return 'Choose production before buying it with gold.';
    case 'wonders-cannot-be-bought':
      return 'Legendary wonders cannot be rush bought.';
    case 'treasury-strain-too-high':
      return 'Rush buy disabled: treasury strain is too high. Improve net gold before buying instantly.';
    case 'not-enough-gold':
      return 'Not enough gold.';
    case 'not-owner':
      return 'Only the owner can buy production.';
    case 'invalid-active-item':
      return 'This production item cannot be bought.';
    default:
      return null;
  }
}

export function createCityPanel(
  container: HTMLElement,
  city: City,
  state: GameState,
  callbacks: CityPanelCallbacks,
  initialTab: CityPanelTab = 'list',
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'city-panel';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.95);z-index:30;overflow-y:auto;padding:16px;padding-bottom:80px;';

  const baseYields = calculateProjectedCityYields(state, city.id);
  const yieldMultiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city));
  const yields = {
    food: Math.floor(baseYields.food * yieldMultiplier),
    production: Math.floor(baseYields.production * yieldMultiplier),
    gold: Math.floor(baseYields.gold * yieldMultiplier),
    science: Math.floor(baseYields.science * yieldMultiplier),
  };
  const occupiedMood = getOccupiedCityMood(city);
  const occupiedStatus = city.occupation ? `Occupied: ${city.occupation.turnsRemaining} turns to integrate` : '';
  const occupiedMoodText = occupiedMood === 2 ? 'Very Unhappy' : occupiedMood === 1 ? 'Unhappy' : '';

  // Resource bonus sections: happiness (empire-wide) and yield (per-city)
  const playerResources = getCivAvailableResources(state, state.currentPlayer);
  const happinessResources = RESOURCE_DEFINITIONS.filter(
    d => d.effect?.type === 'happiness' && playerResources.has(d.id as never),
  );
  const yieldResources = RESOURCE_DEFINITIONS.filter(
    d => d.effect && d.effect.type !== 'happiness' && playerResources.has(d.id as never),
  );

  function resourceDisplayName(defId: string, defName: string): string {
    // The "gold" resource name collides with the currency name in context like "+1 gold/turn"
    return defId === 'gold' ? 'Gold deposits' : defName;
  }

  function yieldLabel(effectType: string): string {
    switch (effectType) {
      case 'gold': return '+1 gold/turn';
      case 'production': return '+1 production/turn';
      case 'food': return '+1 food/turn';
      default: return '';
    }
  }

  let resourceBonusSectionHtml = '';
  if (happinessResources.length > 0 || yieldResources.length > 0) {
    let empireBonusHtml = '';
    if (happinessResources.length > 0) {
      let rows = '';
      for (const def of happinessResources) {
        rows += `<div style="font-size:12px;opacity:0.85;" data-res-happiness="${def.id}"></div>`;
      }
      empireBonusHtml = `<div style="font-weight:bold;font-size:12px;color:#d4af70;margin-bottom:4px;">Empire bonuses</div>${rows}`;
    }

    let cityBonusHtml = '';
    if (yieldResources.length > 0) {
      let rows = '';
      for (const def of yieldResources) {
        rows += `<div style="font-size:12px;opacity:0.85;" data-res-yield="${def.id}"></div>`;
      }
      const topMargin = happinessResources.length > 0 ? 'margin-top:8px;' : '';
      cityBonusHtml = `<div style="font-weight:bold;font-size:12px;color:#d4af70;margin-bottom:4px;${topMargin}">City bonuses</div>${rows}`;
    }

    resourceBonusSectionHtml = `
      <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;margin-bottom:16px;">
        <div style="font-size:13px;font-weight:bold;color:#e8c170;margin-bottom:6px;">Resources</div>
        ${empireBonusHtml}${cityBonusHtml}
      </div>
    `;
  }

  const currentCiv = state.civilizations[state.currentPlayer];
  const civDef = resolveCivDefinition(state, currentCiv.civType);
  const getDisplayedCost = (itemId: string): number => getProductionCostForItem(itemId, {
    city,
    bonusEffect: civDef?.bonusEffect,
    era: state.era,
  });
  const availableBuildings = getAvailableBuildings(city, currentCiv.techState.completed, state.map.tiles);
  const cityWonderEntries = getLegendaryWonderPresentationForCity(state, state.currentPlayer, city.id);
  const compactWonderEntries = getCompactLegendaryWonderEntriesForCity(state, state.currentPlayer, city.id, 4);
  const activeLegendaryEntry = city.productionQueue[0]?.startsWith('legendary:')
    ? cityWonderEntries.find(entry => entry.queueItemId === city.productionQueue[0]) ?? null
    : null;
  const cityWonderProject = Object.values(state.legendaryWonderProjects ?? {}).find(project => project.cityId === city.id);
  const economyStatus = calculateCivEconomy(state, city.owner);
  const cityMaintenance = calculateCityBuildingMaintenance(state, city);
  const cityFreeBuildings = cityMaintenance.exemptBuildings.length + cityMaintenance.supportedBuildings.length;
  const maintenanceTooltip = formatMaintenanceTooltip(economyStatus);
  const rushBuyQuote = getRushBuyQuote(state, city.owner, city.id);
  const rushBuyReason = getRushBuyReasonText(rushBuyQuote.reason);
  const getFutureBuildingUpkeep = (buildingId: string): number => {
    const projected = calculateCityBuildingMaintenance(state, {
      ...city,
      buildings: [...city.buildings, buildingId],
    });
    return Math.max(0, projected.upkeep - cityMaintenance.upkeep);
  };

  // Build placeholders for dynamic data; style attributes with pure numbers (progress%) are safe
  let buildingPlaceholders = '';
  for (let idx = 0; idx < city.buildings.length; idx++) {
    const bid = city.buildings[idx];
    const b = BUILDINGS[bid];
    if (b) {
      const upkeep = cityMaintenance.rows.find(row => row.id === bid)?.upkeep ?? 0;
      buildingPlaceholders += `<div style="background:rgba(255,255,255,0.05);border-radius:6px;padding:8px;margin-bottom:4px;font-size:12px;">
        <strong data-text="bldg-name-${idx}"></strong> — <span data-text="bldg-desc-${idx}"></span>
        <div style="font-size:11px;opacity:0.72;margin-top:3px;" data-text="bldg-upkeep-${idx}">${upkeep > 0 ? `Upkeep: -${upkeep} gold/turn` : 'Free support'}</div>
      </div>`;
    }
  }

  let buildItemPlaceholders = '';
  for (let idx = 0; idx < availableBuildings.length; idx++) {
    const b = availableBuildings[idx];
    const cost = getDisplayedCost(b.id);
    const turns = yields.production > 0 ? Math.ceil(cost / yields.production) : '∞';
    const yieldParts: string[] = [];
    if (b.yields.food) yieldParts.push(`+${b.yields.food} 🌾`);
    if (b.yields.production) yieldParts.push(`+${b.yields.production} ⚒️`);
    if (b.yields.gold) yieldParts.push(`+${b.yields.gold} 💰`);
    if (b.yields.science) yieldParts.push(`+${b.yields.science} 🔬`);
    const yieldStr = yieldParts.length > 0 ? yieldParts.join(' ') + ' · ' : '';
    const futureUpkeep = getFutureBuildingUpkeep(b.id);
    const upkeepStr = futureUpkeep > 0 ? ` · Upkeep: -${futureUpkeep}/turn` : ' · Free support';
    buildItemPlaceholders += `<div class="build-item" data-item-id="${b.id}" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;">
      <div style="font-weight:bold;font-size:13px;">${getProductionIconForItem(b.id)} <span data-text="build-name-${idx}"></span></div>
      <div style="font-size:11px;opacity:0.7;">${yieldStr}${turns} turns${upkeepStr}</div>
      <div style="font-size:10px;opacity:0.5;" data-text="build-desc-${idx}"></div>
    </div>`;
  }

  const completedTechs = currentCiv.techState.completed;
  const availableUnits = getTrainableUnitsForCiv(completedTechs, currentCiv.civType);

  let unitPlaceholders = '';
  for (let idx = 0; idx < availableUnits.length; idx++) {
    const u = availableUnits[idx];
    const cost = getDisplayedCost(u.type);
    const turns = yields.production > 0 ? Math.ceil(cost / yields.production) : '∞';
    unitPlaceholders += `<div class="build-item" data-item-id="${u.type}" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;">
      <div style="font-weight:bold;font-size:13px;">${getProductionIconForItem(u.type)} <span data-text="unit-name-${idx}"></span></div>
      <div style="font-size:11px;opacity:0.7;">Cost: ${cost} · ${turns} turns</div>
    </div>`;
  }

  let compactWonderHtml = '';
  for (let idx = 0; idx < compactWonderEntries.length; idx++) {
    const entry = compactWonderEntries[idx];
    const turns = yields.production > 0 ? Math.ceil(entry.productionCost / yields.production) : '∞';
    compactWonderHtml += `
      <div data-wonder-card="${entry.wonderId}" style="background:rgba(232,193,112,0.12);border:1px solid rgba(232,193,112,0.34);border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;">
        <div style="font-weight:bold;font-size:13px;">${getProductionIconForItem(entry.queueItemId)} <span data-text="wonder-name-${idx}"></span></div>
        <div style="font-size:11px;color:#e8c170;"><span data-text="wonder-state-${idx}"></span> · ${entry.productionCost} production · ${turns} turns</div>
        <div style="font-size:10px;opacity:0.65;" data-text="wonder-summary-${idx}"></div>
        <div style="font-size:10px;opacity:0.72;" data-text="wonder-recovery-${idx}"></div>
        <div style="font-size:10px;opacity:0.72;" data-text="wonder-resumed-${idx}"></div>
      </div>
    `;
  }
  const compactWonderSectionHtml = `
    <div data-section="compact-wonder-build-list" style="margin-top:12px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <h3 style="font-size:14px;margin:0;">Wonder Ambitions</h3>
        <button type="button" data-open-wonder-panel="true" style="min-height:44px;padding:7px 10px;background:rgba(232,193,112,0.16);border:1px solid rgba(232,193,112,0.45);border-radius:6px;color:#f0d897;cursor:pointer;font-size:12px;">Show all ambitions</button>
      </div>
      ${compactWonderEntries.length > 0
        ? compactWonderHtml
        : '<div style="font-size:12px;opacity:0.65;">No near-term legendary wonders fit this city yet.</div>'}
    </div>
  `;

  // Idle production selector — always visible; conversion only fires when queue is empty.
  const activeMode = city.idleProduction ?? 'none';
  const goldActive = activeMode === 'gold' ? 'border-color:#d4aa2c;background:rgba(212,170,44,0.3);' : '';
  const sciActive = activeMode === 'science' ? 'border-color:#6496ff;background:rgba(100,150,255,0.3);' : '';
  const noneActive = activeMode === 'none' ? 'border-color:rgba(255,255,255,0.5);background:rgba(255,255,255,0.2);' : '';
  const idleSelectorHtml = `
    <div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:12px;margin-bottom:16px;">
      <div style="font-weight:bold;color:#e8c170;margin-bottom:6px;">Idle Production</div>
      <div style="font-size:12px;opacity:0.7;margin-bottom:8px;">When idle, convert +${yields.production}/turn production to:</div>
      <div style="display:flex;gap:8px;">
        <button type="button" data-idle-mode="gold" style="flex:1;padding:8px;background:rgba(212,170,44,0.15);border:1px solid rgba(212,170,44,0.4);border-radius:6px;color:white;cursor:pointer;font-size:12px;${goldActive}">💰 Gold +${yields.production}/turn</button>
        <button type="button" data-idle-mode="science" style="flex:1;padding:8px;background:rgba(100,150,255,0.15);border:1px solid rgba(100,150,255,0.4);border-radius:6px;color:white;cursor:pointer;font-size:12px;${sciActive}">🔬 Science +${yields.production}/turn</button>
        <button type="button" data-idle-mode="none" style="flex:1;padding:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;cursor:pointer;font-size:12px;${noneActive}">None</button>
      </div>
    </div>
  `;

  // Current production placeholders
  let currentProductionHtml = '';
  if (city.productionQueue.length > 0) {
    const currentItem = city.productionQueue[0];
    const totalCost = getDisplayedCost(currentItem);
    const progress = totalCost > 0 ? Math.round((city.productionProgress / totalCost) * 100) : 0;
    const rushBuyLabel = rushBuyQuote.cost > 0 ? `Buy now: ${rushBuyQuote.cost} gold` : 'Buy now';
    const rushDisabled = !rushBuyQuote.available || !callbacks.onRushBuyActiveProduction;
    const rushDisabledAttr = rushDisabled ? 'disabled' : '';
    const rushButtonStyle = rushDisabled
      ? 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.45);cursor:not-allowed;'
      : 'background:#d4aa2c;border:1px solid rgba(255,255,255,0.2);color:#1f1700;cursor:pointer;';

    currentProductionHtml = `
      <div style="background:rgba(255,255,255,0.1);border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="font-weight:bold;color:#e8c170;">Producing: ${getProductionIconForItem(currentItem)} <span data-text="prod-name"></span></div>
        <div style="font-size:12px;opacity:0.7;"><span data-text="prod-turns"></span> turns remaining</div>
        <div style="background:rgba(0,0,0,0.3);border-radius:4px;height:8px;margin-top:8px;">
          <div style="background:#6b9b4b;border-radius:4px;height:8px;width:${progress}%;"></div>
        </div>
        ${activeLegendaryEntry ? `
          <div data-active-legendary="true" style="margin-top:10px;border-top:1px solid rgba(232,193,112,0.22);padding-top:10px;">
            <div style="font-size:12px;color:#e8c170;" data-text="legendary-milestone"></div>
            <div style="font-size:12px;opacity:0.82;" data-text="legendary-reward-teaser"></div>
            <div style="font-size:12px;opacity:0.82;" data-text="legendary-race-tension"></div>
            <div style="font-size:12px;opacity:0.82;" data-text="legendary-queue-continuity"></div>
            <button type="button" data-open-active-wonder-journal="true" style="min-height:44px;margin-top:8px;padding:7px 10px;background:rgba(232,193,112,0.16);border:1px solid rgba(232,193,112,0.45);border-radius:6px;color:#f0d897;cursor:pointer;font-size:12px;">Open Journal</button>
          </div>
        ` : ''}
        <div style="display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <button type="button" data-rush-buy="active" ${rushDisabledAttr} title="" style="min-height:44px;padding:7px 10px;border-radius:6px;font-size:12px;font-weight:bold;${rushButtonStyle}">${rushBuyLabel}</button>
          ${rushBuyReason ? '<span style="font-size:11px;color:#d9a25c;" data-text="rush-reason"></span>' : ''}
        </div>
      </div>
    `;
  }

  // Compute timing for each follow-up queue item (productionQueue[1+])
  const followUpTimings: Array<{ startTurns: number; finishTurns: number } | null> = [];
  if (city.productionQueue.length > 1 && yields.production > 0) {
    const currentItem0 = city.productionQueue[0];
    const currentCost0 = getDisplayedCost(currentItem0);
    let elapsed = Math.ceil(Math.max(0, currentCost0 - city.productionProgress) / yields.production);
    for (let i = 1; i < city.productionQueue.length; i++) {
      const followId = city.productionQueue[i];
      const followCost = getDisplayedCost(followId);
      const duration = Math.ceil(followCost / yields.production);
      followUpTimings.push({ startTurns: elapsed, finishTurns: elapsed + duration });
      elapsed += duration;
    }
  } else {
    for (let i = 1; i < city.productionQueue.length; i++) {
      followUpTimings.push(null);
    }
  }

  const queueBtnStyle = 'padding:4px 8px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:white;cursor:pointer;font-size:13px;';
  const queueBtnDisabledStyle = 'padding:4px 8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:rgba(255,255,255,0.3);font-size:13px;cursor:not-allowed;';
  const lastQueueIdx = city.productionQueue.length - 1;
  let queueRowsHtml = '';
  for (let idx = 1; idx < city.productionQueue.length; idx++) {
    const timing = followUpTimings[idx - 1];
    const slotLabel = timing
      ? `Queue slot ${idx} · Starts in ${timing.startTurns} turns · Done in ${timing.finishTurns} turns`
      : `Queue slot ${idx}`;
    const downStyle = idx === lastQueueIdx ? queueBtnDisabledStyle : queueBtnStyle;
    const downDisabled = idx === lastQueueIdx ? 'disabled' : '';
    queueRowsHtml += `
      <div data-queue-index="${idx}" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;background:rgba(255,255,255,0.06);border-radius:8px;padding:8px;">
        <div>
          <div style="font-weight:bold;">${getProductionIconForItem(city.productionQueue[idx])} <span data-text="queue-name-${idx}"></span></div>
          <div style="font-size:11px;opacity:0.7;">${slotLabel}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button type="button" data-queue-action="up" data-queue-index="${idx}" style="${queueBtnStyle}">↑</button>
          <button type="button" data-queue-action="down" data-queue-index="${idx}" style="${downStyle}" ${downDisabled}>↓</button>
          <button type="button" data-queue-action="remove" data-queue-index="${idx}" style="${queueBtnStyle}">✕</button>
        </div>
      </div>
    `;
  }

  const navHtml = (callbacks.onPrevCity || callbacks.onNextCity)
    ? `<div style="display:flex;align-items:center;gap:8px;">
        <span id="city-prev" style="cursor:pointer;font-size:20px;opacity:0.7;padding:4px 8px;background:rgba(255,255,255,0.1);border-radius:6px;">&#8249;</span>
        <span id="city-next" style="cursor:pointer;font-size:20px;opacity:0.7;padding:4px 8px;background:rgba(255,255,255,0.1);border-radius:6px;">&#8250;</span>
      </div>`
    : '';

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div>
        <h2 style="font-size:18px;color:#e8c170;margin:0;"><span data-text="city-name"></span></h2>
        <div style="font-size:12px;opacity:0.7;">Population: <span data-text="city-pop"></span></div>
        ${city.occupation ? '<div style="font-size:12px;color:#e8c170;" data-text="occupied-status"></div>' : ''}
        ${occupiedMoodText ? '<div style="font-size:12px;color:#d9a25c;" data-text="occupied-mood"></div>' : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${navHtml}
        <span id="city-close" style="cursor:pointer;font-size:24px;opacity:0.6;">&#x2715;</span>
      </div>
    </div>

    <div style="display:flex;gap:16px;margin-bottom:16px;font-size:13px;">
      <span>🌾 +<span data-text="yield-food"></span></span>
      <span>⚒️ +<span data-text="yield-prod"></span></span>
      <span>💰 +<span data-text="yield-gold"></span></span>
      <span>🔬 +<span data-text="yield-science"></span></span>
    </div>
    ${resourceBonusSectionHtml}
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;font-size:12px;color:#d9d3c0;">
      <span title="" data-maintenance-summary>Free support: ${cityFreeBuildings} buildings, ${economyStatus.breakdown.freeUnits} units</span>
      <span title="" data-maintenance-summary>Paid upkeep: -${cityMaintenance.upkeep} city / -${economyStatus.unitMaintenance} empire</span>
      <span>Net treasury: ${economyStatus.netGoldPerTurn >= 0 ? '+' : ''}${economyStatus.netGoldPerTurn}/turn</span>
      ${economyStatus.strainLevel !== 'none' ? '<span style="color:#d9a25c;" data-text="economy-strain"></span>' : ''}
    </div>

    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <div id="tab-list" style="padding:6px 16px;background:rgba(255,255,255,0.15);border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">List</div>
      <div id="tab-grid" style="padding:6px 16px;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;font-size:12px;">Grid</div>
      <div id="tab-wonders" style="padding:6px 16px;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;font-size:12px;">Legendary Wonders</div>
    </div>
    <div id="city-list-view">
      ${idleSelectorHtml}${currentProductionHtml}
      ${city.productionQueue.length > 1 ? `<div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:12px;margin-bottom:16px;"><div style="font-weight:bold;color:#e8c170;margin-bottom:8px;">Production Queue</div>${queueRowsHtml}</div>` : ''}
      ${cityWonderProject ? `<div style="margin-bottom:12px;font-size:12px;opacity:0.75;">Wonder carryover: ${cityWonderProject.transferableProduction}</div>` : ''}
      ${city.buildings.length > 0 ? `<div style="margin-bottom:16px;"><h3 style="font-size:14px;margin:0 0 8px;">Buildings</h3>${buildingPlaceholders}</div>` : ''}
      <div><h3 style="font-size:14px;margin:0 0 8px;">Build</h3>
        ${buildItemPlaceholders}
        ${compactWonderSectionHtml}
        <div style="margin-top:12px;font-size:12px;opacity:0.5;margin-bottom:8px;">Units</div>
        ${unitPlaceholders}
      </div>
    </div>
    <div id="city-grid-view" style="display:none;"></div>
  `;

  panel.innerHTML = html;

  // Inject dynamic text via textContent (safe)
  const setText = (sel: string, text: string) => {
    const el = panel.querySelector(`[data-text="${sel}"]`);
    if (el) el.textContent = text;
  };
  const byId = <T extends HTMLElement>(id: string): T | null => panel.querySelector<T>(`[id="${id}"]`);

  setText('city-name', city.name);
  setText('city-pop', String(city.population));
  if (city.occupation) {
    setText('occupied-status', occupiedStatus);
  }
  if (occupiedMoodText) {
    setText('occupied-mood', occupiedMoodText);
  }
  setText('yield-food', String(yields.food));
  setText('yield-prod', String(yields.production));
  setText('yield-gold', String(yields.gold));
  setText('yield-science', String(yields.science));

  // Populate resource bonus rows via textContent (XSS-safe)
  for (const def of happinessResources) {
    const el = panel.querySelector(`[data-res-happiness="${def.id}"]`);
    if (el) el.textContent = `${def.icon} ${resourceDisplayName(def.id, def.name)} → +1 happiness`;
  }
  for (const def of yieldResources) {
    const el = panel.querySelector(`[data-res-yield="${def.id}"]`);
    if (el) el.textContent = `${def.icon} ${resourceDisplayName(def.id, def.name)} → ${yieldLabel(def.effect!.type)}`;
  }

  if (city.productionQueue.length > 0) {
    const currentItem = city.productionQueue[0];
    const totalCost = getDisplayedCost(currentItem);
    const turnsLeft = yields.production > 0 ? Math.ceil((totalCost - city.productionProgress) / yields.production) : '∞';
    setText('prod-name', getProductionDisplayName(currentItem));
    setText('prod-turns', String(turnsLeft));
    if (rushBuyReason) {
      setText('rush-reason', rushBuyReason);
    }
    if (activeLegendaryEntry) {
      setText('legendary-milestone', activeLegendaryEntry.milestoneLabel ?? '');
      setText('legendary-reward-teaser', `Reward: ${activeLegendaryEntry.rewardSummary}`);
      setText('legendary-race-tension', activeLegendaryEntry.raceTensionLabel ?? 'Construction underway');
      setText('legendary-queue-continuity', activeLegendaryEntry.queueContinuityLabel ?? '');
    }
    const rushButton = panel.querySelector<HTMLElement>('[data-rush-buy]');
    if (rushButton && rushBuyReason) rushButton.title = rushBuyReason;
  }
  panel.querySelectorAll<HTMLElement>('[data-maintenance-summary]').forEach(el => {
    el.title = maintenanceTooltip;
  });
  if (economyStatus.strainLevel !== 'none') {
    const strainLabel = economyStatus.strainLevel === 'critical'
      ? 'Critical strain'
      : economyStatus.strainLevel === 'high'
        ? 'High strain'
        : 'Low strain';
    setText('economy-strain', strainLabel);
  }

  let bldgIdx = 0;
  for (const bid of city.buildings) {
    const b = BUILDINGS[bid];
    if (b) {
      setText(`bldg-name-${bldgIdx}`, b.name);
      setText(`bldg-desc-${bldgIdx}`, b.description);
      bldgIdx++;
    }
  }

  availableBuildings.forEach((b, i) => {
    setText(`build-name-${i}`, b.name);
    setText(`build-desc-${i}`, b.description);
  });

  availableUnits.forEach((u, i) => {
    setText(`unit-name-${i}`, u.name);
  });

  city.productionQueue.forEach((itemId, index) => {
    setText(`queue-name-${index}`, getProductionDisplayName(itemId));
  });

  compactWonderEntries.forEach((entry, index) => {
    setText(`wonder-name-${index}`, entry.name);
    setText(`wonder-state-${index}`, getWonderBuildListStatus(entry.visibleState));
    const missing = entry.missingRequirements.slice(0, 2).join(', ');
    setText(`wonder-summary-${index}`, entry.canStartBuild
      ? 'Open the journal to start construction.'
      : missing
        ? `Needs ${missing}.`
        : entry.rewardSummary);
    setText(`wonder-recovery-${index}`, entry.recoveryLabel ?? '');
    setText(`wonder-resumed-${index}`, entry.productionResumedLabel ?? '');
  });

  container.appendChild(panel);

  const rerenderPanel = (nextState: GameState | void = state, nextTab: CityPanelTab = 'list') => {
    const renderState = nextState ?? state;
    const refreshedCity = renderState.cities[city.id];
    if (!refreshedCity) {
      panel.remove();
      callbacks.onClose();
      return;
    }

    panel.remove();
    createCityPanel(container, refreshedCity, renderState, callbacks, nextTab);
  };

  byId('city-close')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onClose();
  });

  if (callbacks.onPrevCity) {
    byId('city-prev')?.addEventListener('click', () => {
      panel.remove();
      callbacks.onPrevCity!();
    });
  }
  if (callbacks.onNextCity) {
    byId('city-next')?.addEventListener('click', () => {
      panel.remove();
      callbacks.onNextCity!();
    });
  }

  panel.querySelectorAll('.build-item').forEach(el => {
    el.addEventListener('click', () => {
      const itemId = (el as HTMLElement).dataset.itemId!;
      callbacks.onBuild(city.id, itemId);
      rerenderPanel();
    });
  });

  panel.querySelectorAll<HTMLElement>('[data-wonder-card]').forEach(el => {
    el.addEventListener('click', () => {
      callbacks.onOpenWonderPanel(city.id);
      panel.remove();
    });
  });

  panel.querySelector<HTMLElement>('[data-open-wonder-panel]')?.addEventListener('click', () => {
    callbacks.onOpenWonderPanel(city.id);
    panel.remove();
  });

  panel.querySelector<HTMLElement>('[data-open-active-wonder-journal]')?.addEventListener('click', () => {
    callbacks.onOpenWonderPanel(city.id);
    panel.remove();
  });

  panel.querySelectorAll('[data-queue-action]').forEach(el => {
    el.addEventListener('click', event => {
      event.stopPropagation();
      const action = (el as HTMLElement).dataset.queueAction;
      const index = Number((el as HTMLElement).dataset.queueIndex);

      if (!Number.isInteger(index)) {
        return;
      }

      if (action === 'remove') {
        callbacks.onRemoveQueueItem?.(city.id, index);
        rerenderPanel();
        return;
      }

      if (action === 'up' && index > 0) {
        callbacks.onMoveQueueItem?.(city.id, index, index - 1);
        rerenderPanel();
        return;
      }

      if (action === 'down' && index < city.productionQueue.length - 1) {
        callbacks.onMoveQueueItem?.(city.id, index, index + 1);
        rerenderPanel();
      }
    });
  });

  panel.querySelectorAll<HTMLElement>('[data-rush-buy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextState = callbacks.onRushBuyActiveProduction?.(city.id);
      rerenderPanel(nextState);
    });
  });

  panel.querySelectorAll<HTMLElement>('[data-idle-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const raw = btn.dataset.idleMode;
      const mode = raw === 'gold' || raw === 'science' ? raw : null;
      callbacks.onSetIdleProduction?.(city.id, mode);
      rerenderPanel();
    });
  });

  // Tab switching
  const listTab = byId('tab-list') as HTMLElement;
  const gridTab = byId('tab-grid') as HTMLElement;
  const wondersTab = byId('tab-wonders') as HTMLElement;
  const listView = byId('city-list-view') as HTMLElement;
  const gridView = byId('city-grid-view') as HTMLElement;

  const renderCityGridTab = (): void => {
    gridView.textContent = '';
    createCityGrid(gridView, city, state.map, {
      onSlotTap: () => {
        callbacks.onClose();
      },
      onBuyExpansion: () => {
        callbacks.onClose();
      },
      onClose: callbacks.onClose,
      onPlaceBuilding: (buildingId, row, col) => callbacks.onPlaceBuilding?.(city.id, buildingId, row, col),
    }, undefined, {
      state,
      onSetCityFocus: (cityId, focus) => rerenderPanel(callbacks.onSetCityFocus?.(cityId, focus), 'grid'),
      onToggleWorkedTile: (cityId, coord, worked) => rerenderPanel(callbacks.onToggleWorkedTile?.(cityId, coord, worked), 'grid'),
    });
  };

  const activateListTab = () => {
    listView.style.display = 'block';
    gridView.style.display = 'none';
    listTab.style.background = 'rgba(255,255,255,0.15)';
    gridTab.style.background = 'rgba(255,255,255,0.05)';
  };

  const activateGridTab = () => {
    listView.style.display = 'none';
    gridView.style.display = 'block';
    gridTab.style.background = 'rgba(255,255,255,0.15)';
    listTab.style.background = 'rgba(255,255,255,0.05)';
    renderCityGridTab();
  };

  listTab?.addEventListener('click', () => {
    activateListTab();
  });

  gridTab?.addEventListener('click', () => {
    activateGridTab();
  });

  wondersTab?.addEventListener('click', () => {
    callbacks.onOpenWonderPanel(city.id);
    panel.remove();
  });

  if (initialTab === 'grid') {
    activateGridTab();
  }

  // Upgradeable units section — computed and rendered after rerenderPanel is defined
  // so click handlers can call rerenderPanel() to refresh after upgrade.
  if (callbacks.onUpgradeUnit) {
    const civGold = state.civilizations[city.owner]?.gold ?? 0;
    const upgradeEntries = Object.values(state.units)
      .map(u => ({ u, upgrade: canUpgradeUnit(u, city.id, state.cities, completedTechs, civGold) }))
      .filter(({ u, upgrade }) =>
        u.owner === city.owner &&
        u.position.q === city.position.q &&
        u.position.r === city.position.r &&
        upgrade.canUpgrade,
      );

    if (upgradeEntries.length > 0) {
      const upgradeSection = document.createElement('div');
      upgradeSection.style.cssText = 'margin-top:16px;';

      const header = document.createElement('div');
      header.style.cssText = 'font-size:12px;font-weight:bold;color:#a78bfa;margin-bottom:8px;';
      header.textContent = 'Upgradeable Units';
      upgradeSection.appendChild(header);

      for (const { u, upgrade } of upgradeEntries) {
        if (!upgrade.targetType) continue;

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.06);border-radius:8px;padding:8px;margin-bottom:6px;';

        const info = document.createElement('span');
        info.style.cssText = 'font-size:12px;';
        const currentName = UNIT_DEFINITIONS[u.type]?.name ?? u.type;
        const targetName = UNIT_DEFINITIONS[upgrade.targetType].name;
        info.textContent = `${currentName} → ${targetName} (${upgrade.cost} gold)`;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Upgrade';
        btn.style.cssText = 'padding:4px 10px;border-radius:6px;background:#7c3aed;border:none;color:white;cursor:pointer;font-size:11px;';
        btn.addEventListener('click', () => {
          callbacks.onUpgradeUnit!(u.id);
          rerenderPanel();
        });

        row.appendChild(info);
        row.appendChild(btn);
        upgradeSection.appendChild(row);
      }

      const listViewEl = panel.querySelector('#city-list-view');
      if (listViewEl) {
        listViewEl.appendChild(upgradeSection);
      } else {
        panel.appendChild(upgradeSection);
      }
    }
  }

  return panel;
}
