import type { City, CityFocus, GameState, HexCoord, ResourceType } from '@/core/types';
import {
  getAvailableBuildings,
  BUILDINGS,
  TRAINABLE_UNITS,
  getTrainableUnitsForCity,
  getProductionCostForItem,
  getProductionDisplayName,
  getProductionIconForItem,
} from '@/systems/city-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
import { SESSION_SHOWN_TIPS } from '@/ui/advisor-system';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { createGameButton } from './ui-kit';
import {
  getActiveNationalProjectsForCiv,
  getNationalProjectMultiplier,
  getReservedNationalProjectKeys,
} from '@/systems/national-project-system';
import {
  getCompactLegendaryWonderEntriesForCity,
  getLegendaryWonderPresentationForCity,
} from '@/systems/legendary-wonder-presentation';
import { getLegendaryLandmarkPreviewViewForCity } from '@/systems/legendary-wonder-landmark-presentation';
import { canUpgradeUnit, getUpgradeCost } from '@/systems/unit-upgrade-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import {
  getUnrestYieldMultiplier,
  getCityAppeaseCost,
  isCityProductionLocked,
  getContagionSpread,
  getConcessionCost,
} from '@/systems/faction-system';
import { getCrisisFlavor, getCrisisDisplayName } from '@/systems/crisis-flavor-definitions';
import { getCrisisYieldMultiplier, getOutbreakSeverityMultiplier, getCatastropheRecoveryMultiplier } from '@/systems/crisis-system';
import { resolveChallengeForCiv } from '@/core/opponent-challenge';
import { isCityHpRegenerating } from '@/systems/city-siege-system';
import { getOccupiedCityMood, getOccupiedCityYieldMultiplier } from '@/systems/city-occupation-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { getCityTechYields } from '@/systems/tech-yield-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { createCityWorkSection } from './city-grid';
import { createCityDistrictsTab } from './city-districts';
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
  /** Called when a locked-item frustration tip fires (5 s of looking at locked items). */
  onTip?: (message: string) => void;
  onPrevCity?: () => void;
  onNextCity?: () => void;
  onUpgradeUnit?: (unitId: string) => void;
  onSetIdleProduction?: (cityId: string, mode: 'gold' | 'science' | null) => void;
  onRushBuyActiveProduction?: (cityId: string) => GameState | void;
  onAppeaseFaction?: (cityId: string) => GameState | void;
  onConcedeToMovement?: (cityId: string) => GameState | void;
  onQuarantineCrisis?: (crisisId: string, cityId: string) => GameState | void;
  onRemedyCrisis?: (crisisId: string, cityId: string) => GameState | void;
  onFindResources?: (
    highlights: HexCoord[],
    toasts: Array<{ message: string; type: 'info' | 'warning' }>,
  ) => void;
}

type CityPanelTab = 'list' | 'districts' | 'citizens' | 'wonders';

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
  const yieldMultiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city))
    * getCrisisYieldMultiplier(state, city.id);
  const techYieldParts = getCityTechYields(
    city,
    state.map,
    state.civilizations[city.owner]?.techState.completed ?? [],
  ).parts;
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
  const activeNationalProjects = getActiveNationalProjectsForCiv(state, city.owner);
  const getDisplayedCost = (itemId: string): number => getProductionCostForItem(itemId, {
    city,
    bonusEffect: civDef?.bonusEffect,
    era: state.era,
    completedTechs: currentCiv.techState.completed,
    activeNationalProjects,
  });
  const builtNPKeys = getReservedNationalProjectKeys(state, city.owner);
  const availableBuildings = getAvailableBuildings(
    city,
    currentCiv.techState.completed,
    state.map,
    playerResources,
    state.era,
    builtNPKeys,
    city.owner,
  );
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
  const appeaseCost = getCityAppeaseCost(city);
  const civGoldForAppease = state.civilizations[city.owner]?.gold ?? 0;
  const appeasedThisTurn = city.appeasedOnTurn === state.turn;
  const canAffordAppease = civGoldForAppease >= appeaseCost;
  const concessionImmuneTurnsLeft = (city.concessionImmunityUntilTurn ?? 0) - state.turn;
  const isConcessionImmune = concessionImmuneTurnsLeft > 0;
  const appeaseDisabled = !canAffordAppease || appeasedThisTurn || isConcessionImmune || !callbacks.onAppeaseFaction;
  const appeaseLabel = appeasedThisTurn
    ? 'Already appeased this turn'
    : !canAffordAppease
      ? `Not enough gold (needs ${appeaseCost})`
      : `Appease (${appeaseCost} gold)`;
  const concessionCost = getConcessionCost(state, city);
  const canAffordConcession = civGoldForAppease >= concessionCost;
  const concedeDisabled = !canAffordConcession || isConcessionImmune || !callbacks.onConcedeToMovement;
  const concedeLabel = !canAffordConcession
    ? `Not enough gold (needs ${concessionCost})`
    : `Concede (${concessionCost} gold)`;
  // Uprising contagion (MR4): only shown when the term is actually > 0 for THIS city —
  // garrisoning or concession immunity zero out getContagionSpread entirely, so this
  // stays honest rather than a blanket "any revolting civ city" check.
  const contagionSpread = getContagionSpread(city.id, state);
  const contagionSourceCity = contagionSpread.nearestCityId ? state.cities[contagionSpread.nearestCityId] : null;
  const showSpreadWarning = contagionSpread.pressure > 0 && contagionSourceCity !== null;
  const spreadWarningHtml = showSpreadWarning ? `
    <div style="background:rgba(217,80,80,0.10);border:1px solid rgba(217,80,80,0.3);border-radius:8px;padding:8px 12px;margin-bottom:16px;font-size:12px;color:#e88;" data-text="contagion-spread-warning"></div>` : '';
  const immunitySectionHtml = isConcessionImmune ? `
    <div style="background:rgba(74,144,217,0.12);border:1px solid rgba(74,144,217,0.35);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;">
      <div style="font-weight:bold;color:#7fb3e8;">🕊️ Immune to unrest for ${concessionImmuneTurnsLeft} more turn${concessionImmuneTurnsLeft === 1 ? '' : 's'}</div>
    </div>` : '';
  const unrestSectionHtml = city.unrestLevel > 0 ? `
    <div style="background:rgba(217,80,80,0.12);border:1px solid rgba(217,80,80,0.35);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;">
      <div style="font-weight:bold;color:#e88;margin-bottom:4px;">
        ${city.unrestLevel === 2 ? '⚠️ Revolt' : '⚠️ Unrest'} — yields reduced${isCityProductionLocked(city) ? ', production locked' : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" data-appease="${city.id}" ${appeaseDisabled ? 'disabled' : ''} title="${appeaseLabel}" style="min-height:44px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:${appeaseDisabled ? 'default' : 'pointer'};background:${appeaseDisabled ? 'rgba(255,255,255,0.08)' : '#d4aa2c'};color:${appeaseDisabled ? 'rgba(255,255,255,0.4)' : '#1a1a1a'};border:none;">${appeaseLabel}</button>
        <button type="button" data-concede="${city.id}" ${concedeDisabled ? 'disabled' : ''} title="${concedeLabel}" style="min-height:44px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:${concedeDisabled ? 'default' : 'pointer'};background:${concedeDisabled ? 'rgba(255,255,255,0.08)' : '#4a90d9'};color:${concedeDisabled ? 'rgba(255,255,255,0.4)' : '#fff'};border:none;">${concedeLabel}</button>
      </div>
    </div>` : '';
  // Post-catastrophe reward: transient, and the crisis itself may already be gone from
  // activeCrises by the time this is active — must render on its own, not piggyback on
  // the catastrophe crisis chip (see .claude/rules/end-to-end-wiring.md "never compute
  // without rendering").
  const resilienceTurnsLeft = (city.resilienceBonusUntilTurn ?? 0) - state.turn;
  const resilienceSectionHtml = resilienceTurnsLeft > 0 ? `
    <div style="background:rgba(107,155,75,0.12);border:1px solid rgba(107,155,75,0.35);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;">
      <div style="font-weight:bold;color:#9bd97b;">🌱 Rebuilding — +1 🌾 +1 ⚒️ for ${resilienceTurnsLeft} more turn${resilienceTurnsLeft === 1 ? '' : 's'}</div>
    </div>` : '';
  const cityCrises = Object.values(state.activeCrises ?? {})
    .filter(c => c.archetype === 'outbreak' && c.cityIds.includes(city.id));
  const crisisChips = cityCrises.map(crisis => {
    const flavor = getCrisisFlavor(crisis.flavorId);
    if (!flavor) return null;
    const civ = state.civilizations[crisis.targetCivId];
    const severity = flavor.severityByChallenge[resolveChallengeForCiv(state, crisis.targetCivId)];
    const isQuarantined = crisis.quarantinedCityIds?.includes(city.id) ?? false;
    const remedyCompletionTurn = crisis.remedyCompletionByCity?.[city.id];
    const remedyPending = remedyCompletionTurn !== undefined;
    const remedyCost = getCityAppeaseCost(city);
    const canAffordRemedy = (civ?.gold ?? 0) >= remedyCost;
    const yieldPenaltyPct = Math.round(severity.yieldPenalty * 100);
    const quarantinedPenaltyPct = Math.round((1 - getOutbreakSeverityMultiplier(severity, true)) * 100);

    const quarantineDisabled = isQuarantined || !callbacks.onQuarantineCrisis;
    const quarantineLabel = isQuarantined ? 'Quarantined' : 'Quarantine (free)';
    const remedyDisabled = remedyPending || !canAffordRemedy || !callbacks.onRemedyCrisis;
    const remedyLabel = remedyPending
      ? 'Remedy underway'
      : !canAffordRemedy
        ? `Not enough gold (needs ${remedyCost})`
        : `Remedy (${remedyCost} gold)`;

    return {
      crisis, flavor, isQuarantined, remedyPending, remedyCompletionTurn,
      yieldPenaltyPct, quarantinedPenaltyPct,
      quarantineDisabled, quarantineLabel, remedyDisabled, remedyLabel,
    };
  }).filter((c): c is NonNullable<typeof c> => c !== null);
  // Catastrophes respond via worker restore_land, not city-panel buttons — the chip is
  // status-only. Distinct data-text namespace so it never collides with outbreak chips.
  const catastropheCrises = Object.values(state.activeCrises ?? {})
    .filter(c => c.archetype === 'catastrophe' && c.cityIds.includes(city.id));
  const catastropheChips = catastropheCrises.map(crisis => {
    const flavor = getCrisisFlavor(crisis.flavorId);
    if (!flavor) return null;
    const severity = flavor.severityByChallenge[resolveChallengeForCiv(state, crisis.targetCivId)];
    const recoveryPenaltyPct = Math.round((1 - getCatastropheRecoveryMultiplier(severity)) * 100);
    return { crisis, flavor, recoveryPenaltyPct };
  }).filter((c): c is NonNullable<typeof c> => c !== null);
  const catastropheSectionHtml = catastropheChips.map((chip, idx) => `
    <div style="background:rgba(217,80,80,0.12);border:1px solid rgba(217,80,80,0.35);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;">
      <div style="font-weight:bold;color:#e88;margin-bottom:4px;" data-text="catastrophe-stage-${idx}"></div>
      <div style="opacity:0.85;" data-text="catastrophe-advisor-${idx}"></div>
    </div>`).join('');
  const crisisSectionHtml = crisisChips.map((chip, idx) => `
    <div style="background:rgba(217,80,80,0.12);border:1px solid rgba(217,80,80,0.35);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;">
      <div style="font-weight:bold;color:#e88;margin-bottom:4px;" data-text="crisis-stage-${idx}"></div>
      <div style="margin-bottom:8px;opacity:0.85;" data-text="crisis-advisor-${idx}"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" data-quarantine-crisis="${chip.crisis.id}:${city.id}" ${chip.quarantineDisabled ? 'disabled' : ''} title="${chip.quarantineLabel}" style="min-height:44px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:${chip.quarantineDisabled ? 'default' : 'pointer'};background:${chip.quarantineDisabled ? 'rgba(255,255,255,0.08)' : '#4a90d9'};color:${chip.quarantineDisabled ? 'rgba(255,255,255,0.4)' : '#fff'};border:none;">${chip.quarantineLabel}</button>
        <button type="button" data-remedy-crisis="${chip.crisis.id}:${city.id}" ${chip.remedyDisabled ? 'disabled' : ''} title="${chip.remedyLabel}" style="min-height:44px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:${chip.remedyDisabled ? 'default' : 'pointer'};background:${chip.remedyDisabled ? 'rgba(255,255,255,0.08)' : '#d4aa2c'};color:${chip.remedyDisabled ? 'rgba(255,255,255,0.4)' : '#1a1a1a'};border:none;">${chip.remedyLabel}</button>
      </div>
    </div>`).join('');
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
      const row = cityMaintenance.rows.find(r => r.id === bid);
      const upkeep = row?.upkeep ?? 0;
      let fadingBadge = '';
      if (b.nationalProject && b.uniquePerEmpire) {
        const record = state.builtNationalProjects?.[`${city.owner}:${bid}`];
        if (record) {
          const multiplier = getNationalProjectMultiplier(state.era, record.eraBuilt);
          if (multiplier === 0.5) {
            fadingBadge = ' <span style="color:#f0c040;font-size:10px;" title="This institution is losing relevance and will expire next era.">⏳ (fading)</span>';
          }
        }
      }
      const isObsolete = row?.reason === 'obsolete';
      const obsoleteBadge = isObsolete
        ? ' <span style="color:#e88;font-size:10px;" title="This building\'s purpose no longer applies — later technology has moved past it. No upkeep cost, but no effect either.">⚠️ (obsolete)</span>'
        : '';
      const upkeepText = isObsolete
        ? 'Obsolete — no upkeep'
        : upkeep > 0
          ? `Upkeep: -${upkeep} gold/turn`
          : 'Free support';
      buildingPlaceholders += `<div style="background:rgba(255,255,255,0.05);border-radius:6px;padding:8px;margin-bottom:4px;font-size:12px;">
        <strong data-text="bldg-name-${idx}"></strong>${fadingBadge}${obsoleteBadge} — <span data-text="bldg-desc-${idx}"></span>
        <div style="font-size:11px;opacity:0.72;margin-top:3px;" data-text="bldg-upkeep-${idx}">${upkeepText}</div>
      </div>`;
    }
  }

  const nationalProjectBuildings = availableBuildings.filter(b => b.nationalProject);
  const regularBuildings = availableBuildings.filter(b => !b.nationalProject);
  const orderedBuildings = [...nationalProjectBuildings, ...regularBuildings];

  let buildItemPlaceholders = '';
  if (nationalProjectBuildings.length > 0) {
    buildItemPlaceholders += `<div style="font-size:11px;font-weight:bold;color:#f0c040;text-transform:uppercase;letter-spacing:0.05em;padding:4px 0 2px;">National Projects</div>`;
  }
  for (let idx = 0; idx < orderedBuildings.length; idx++) {
    const b = orderedBuildings[idx];
    const cost = getDisplayedCost(b.id);
    const turns = yields.production > 0 ? Math.ceil(cost / yields.production) : '∞';
    const isNP = !!b.nationalProject;
    const displayedYields = isNP ? b.civYieldBonus ?? b.yields : b.yields;
    const yieldParts: string[] = [];
    if (displayedYields.food) yieldParts.push(`+${displayedYields.food} 🌾`);
    if (displayedYields.production) yieldParts.push(`+${displayedYields.production} ⚒️`);
    if (displayedYields.gold) yieldParts.push(`+${displayedYields.gold} 💰`);
    if (displayedYields.science) yieldParts.push(`+${displayedYields.science} 🔬`);
    const yieldScope = isNP ? 'Empire-wide: ' : '';
    const yieldStr = yieldParts.length > 0
      ? `${yieldScope}${yieldParts.join(' ')} · `
      : '';
    const futureUpkeep = getFutureBuildingUpkeep(b.id);
    const upkeepStr = futureUpkeep > 0 ? ` · Upkeep: -${futureUpkeep}/turn` : ' · Free support';
    const npBorder = isNP ? 'border:1px solid rgba(240,192,64,0.5);' : 'border:1px solid rgba(255,255,255,0.2);';
    const deadline = isNP ? ` · Era ${(b.nationalProject!.homeEra) + 1} deadline` : '';
    if (idx === nationalProjectBuildings.length && nationalProjectBuildings.length > 0) {
      buildItemPlaceholders += `<div style="font-size:11px;font-weight:bold;color:#aaa;text-transform:uppercase;letter-spacing:0.05em;padding:6px 0 2px;">Buildings</div>`;
    }
    buildItemPlaceholders += `<div class="build-item" data-item-id="${b.id}" style="background:rgba(255,255,255,0.1);${npBorder}border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;">
      <div style="font-weight:bold;font-size:13px;">${getProductionIconForItem(b.id)} <span data-text="build-name-${idx}"></span></div>
      <div style="font-size:11px;opacity:0.7;">${yieldStr}${turns} turns${upkeepStr}${deadline}</div>
      <div style="font-size:10px;opacity:0.5;" data-text="build-desc-${idx}"></div>
    </div>`;
  }

  const completedTechs = currentCiv.techState.completed;
  const availableUnits = getTrainableUnitsForCity(city, completedTechs, state.map, currentCiv.civType, playerResources);

  // Locked items: tech met + resource NOT met (tech-missing items stay hidden entirely)
  const allTechUnlockedUnits = getTrainableUnitsForCity(city, completedTechs, state.map, currentCiv.civType, undefined);
  const lockedUnits = allTechUnlockedUnits.filter(u => !availableUnits.some(a => a.type === u.type));

  const allTechUnlockedBuildings = getAvailableBuildings(city, completedTechs, state.map, undefined)
    .filter(b => !b.nationalProject);
  const lockedBuildings = allTechUnlockedBuildings.filter(b => !availableBuildings.some(a => a.id === b.id));

  const lockedItems: Array<{ id: string; name: string; missingResources: ResourceType[] }> = [
    ...lockedUnits.map(u => ({
      id: u.type,
      name: u.name,
      missingResources: (u.resourceRequired ?? []).filter(r => !playerResources.has(r)),
    })),
    ...lockedBuildings.map(b => ({
      id: b.id,
      name: b.name,
      missingResources: (b.resourceRequired ?? []).filter(r => !playerResources.has(r)),
    })),
  ];

  const IMPROVEMENT_LABELS: Record<string, string> = { mine: 'Mine', pasture: 'Pasture', quarry: 'Quarry', plantation: 'Plantation', camp: 'Camp', oil_well: 'Oil Well' };

  function buildLockedItemReason(resourceId: ResourceType, techs: string[]): string {
    const def = RESOURCE_DEFINITIONS.find(d => d.id === resourceId);
    if (!def) return String(resourceId);
    const impName = IMPROVEMENT_LABELS[def.requiredImprovement] ?? def.requiredImprovement;
    const lines = [
      `Needs ${def.name}. To get it:`,
      `• Expand your city + build a ${impName} on a nearby ${def.name} tile`,
      `• Send an Expedition to plant a Resource Outpost (no tech wait)`,
    ];
    if (techs.includes('trade-routes')) {
      lines.push(`• Buy access from a known civ (mid-game)`);
    }
    return lines.join('\n');
  }

  const LOCKED_SHOW_LIMIT = 3;
  const visibleLockedItems = lockedItems.slice(0, LOCKED_SHOW_LIMIT);
  const hiddenLockedCount = lockedItems.length - visibleLockedItems.length;

  let lockedItemsHtml = '';
  for (const item of visibleLockedItems) {
    lockedItemsHtml += `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px;margin-bottom:6px;opacity:0.5;">`;
    lockedItemsHtml += `<div style="font-weight:bold;font-size:13px;">🔒 ${getProductionIconForItem(item.id)} `;
    lockedItemsHtml += `<span data-locked-name="${item.id}"></span></div>`;
    lockedItemsHtml += `<div style="font-size:11px;" data-locked-reason="${item.id}"></div>`;
    lockedItemsHtml += `</div>`;
  }

  const showMoreButton = hiddenLockedCount > 0
    ? `<button type="button" data-locked-show-more="true" style="width:100%;min-height:44px;padding:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18);border-radius:6px;color:rgba(255,255,255,0.75);cursor:pointer;font-size:12px;">Show ${hiddenLockedCount} more locked</button>`
    : '';

  const lockedSectionHtml = lockedItems.length > 0
    ? `<div data-section="locked-items" style="margin-top:12px;">
        <div style="font-weight:bold;font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:8px;">🔒 Locked — missing resources</div>
        ${lockedItemsHtml}
        ${showMoreButton}
      </div>`
    : '';

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

  const landmarkPreview = getLegendaryLandmarkPreviewViewForCity(state, state.currentPlayer, city.id);
  const landmarkPreviewHtml = landmarkPreview
    ? `<div data-section="legendary-landmark-preview" style="background:rgba(232,193,112,0.08);border:1px solid rgba(232,193,112,0.22);border-radius:8px;padding:10px;margin-bottom:12px;">
        <div style="font-weight:bold;font-size:13px;color:#e8c170;margin-bottom:6px;">Legendary landmarks</div>
        ${landmarkPreview.items.map((item, index) => `<div data-landmark-preview="${item.wonderId}" style="font-size:12px;opacity:0.86;"><span data-text="landmark-preview-${index}"></span></div>`).join('')}
      </div>`
    : '';

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

  const cityHp = city.hp ?? 100;
  const cityDamaged = cityHp < 100;
  const cityRegenerating = cityDamaged && isCityHpRegenerating(state, city);
  const siegeHpPct = Math.max(0, cityHp);
  const hpStatusLabel = cityRegenerating
    ? `🩹 Recovering — ${cityHp}/100 HP (+5/turn)`
    : `⚔️ Under siege — ${cityHp}/100 HP (no regen)`;
  const siegeBarHtml = cityDamaged
    ? `<div style="margin-top:6px;">
        <div style="font-size:12px;color:${cityRegenerating ? '#4ade80' : '#f87171'};font-weight:bold;">${hpStatusLabel}</div>
        <div style="background:rgba(0,0,0,0.4);border-radius:4px;height:6px;margin-top:4px;width:120px;">
          <div style="background:${cityRegenerating ? '#4ade80' : '#ef4444'};border-radius:4px;height:6px;width:${siegeHpPct}%;transition:width 0.3s;"></div>
        </div>
      </div>`
    : '';

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div>
        <h2 style="font-size:18px;color:#e8c170;margin:0;"><span data-text="city-name"></span></h2>
        <div style="font-size:12px;opacity:0.7;">Population: <span data-text="city-pop"></span></div>
        ${city.occupation ? '<div style="font-size:12px;color:#e8c170;" data-text="occupied-status"></div>' : ''}
        ${occupiedMoodText ? '<div style="font-size:12px;color:#d9a25c;" data-text="occupied-mood"></div>' : ''}
        ${siegeBarHtml}
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
    ${techYieldParts.length > 0 ? `
    <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:bold;color:#e8c170;margin-bottom:6px;">From technology</div>
      ${techYieldParts.map((_, idx) => `<div style="font-size:12px;opacity:0.85;" data-tech-yield="${idx}"></div>`).join('')}
    </div>` : ''}
    ${resourceBonusSectionHtml}
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;font-size:12px;color:#d9d3c0;">
      <span title="" data-maintenance-summary>Free support: ${cityFreeBuildings} buildings, ${economyStatus.breakdown.freeUnits} units</span>
      <span title="" data-maintenance-summary>Paid upkeep: -${cityMaintenance.upkeep} city / -${economyStatus.unitMaintenance} empire</span>
      <span>Net treasury: ${economyStatus.netGoldPerTurn >= 0 ? '+' : ''}${economyStatus.netGoldPerTurn}/turn</span>
      ${economyStatus.strainLevel !== 'none' ? '<span style="color:#d9a25c;" data-text="economy-strain"></span>' : ''}
    </div>
    ${immunitySectionHtml}
    ${spreadWarningHtml}
    ${unrestSectionHtml}
    ${crisisSectionHtml}
    ${catastropheSectionHtml}
    ${resilienceSectionHtml}

    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <div id="tab-list" style="padding:6px 16px;background:rgba(255,255,255,0.15);border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">Queue</div>
      <div id="tab-districts" style="padding:6px 16px;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;font-size:12px;font-weight:normal;">Districts</div>
      <div id="tab-citizens" style="padding:6px 16px;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;font-size:12px;font-weight:normal;">Citizens</div>
      <div id="tab-wonders" style="padding:6px 16px;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;font-size:12px;">Legendary Wonders</div>
    </div>
    <div id="city-list-view">
      ${landmarkPreviewHtml}${idleSelectorHtml}${currentProductionHtml}
      ${city.productionQueue.length > 1 ? `<div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:12px;margin-bottom:16px;"><div style="font-weight:bold;color:#e8c170;margin-bottom:8px;">Production Queue</div>${queueRowsHtml}</div>` : ''}
      ${cityWonderProject ? `<div style="margin-bottom:12px;font-size:12px;opacity:0.75;">Wonder carryover: ${cityWonderProject.transferableProduction}</div>` : ''}
      ${city.buildings.length > 0 ? `<div style="margin-bottom:16px;"><h3 style="font-size:14px;margin:0 0 8px;">Buildings</h3>${buildingPlaceholders}</div>` : ''}
      <div><h3 style="font-size:14px;margin:0 0 8px;">Build</h3>
        ${buildItemPlaceholders}
        ${compactWonderSectionHtml}
        <div style="margin-top:12px;font-size:12px;opacity:0.5;margin-bottom:8px;">Units</div>
        <div data-section="trainable-units">${unitPlaceholders}</div>
        ${lockedSectionHtml}
      </div>
    </div>
    <div id="city-districts-view" style="display:none;"></div>
    <div id="city-citizens-view" style="display:none;"></div>
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

  if (showSpreadWarning && contagionSourceCity) {
    setText(
      'contagion-spread-warning',
      `Unrest is spreading from ${contagionSourceCity.name} (+${Math.round(contagionSpread.pressure)} pressure/turn) — garrison a unit to block it.`,
    );
  }

  crisisChips.forEach((chip, idx) => {
    const displayName = getCrisisDisplayName(chip.flavor, state.era);
    const stageText = chip.remedyPending
      ? `Remedy underway — cured in ${Math.max(0, chip.remedyCompletionTurn! - state.turn)} turn${Math.max(0, chip.remedyCompletionTurn! - state.turn) === 1 ? '' : 's'}`
      : chip.isQuarantined
        ? `Quarantined — spread stopped, −${chip.quarantinedPenaltyPct}% yields`
        : `⚠️ ${displayName} — −${chip.yieldPenaltyPct}% yields`;
    setText(`crisis-stage-${idx}`, stageText);
    const advisorLine = chip.flavor.advisorLine
      .replace('{name}', displayName)
      .replace('{city}', city.name);
    setText(`crisis-advisor-${idx}`, advisorLine);
  });

  catastropheChips.forEach((chip, idx) => {
    const displayName = getCrisisDisplayName(chip.flavor, state.era);
    // 'active' should be effectively unobservable (the shock applies the same turn the
    // scheduler starts it), but shown honestly rather than assuming it never renders.
    const stageText = chip.crisis.stage === 'recovery'
      ? `Recovering — restore devastated tiles, −${chip.recoveryPenaltyPct}% city yields`
      : `⚠️ ${displayName} strikes!`;
    setText(`catastrophe-stage-${idx}`, stageText);
    const advisorLine = chip.flavor.advisorLine
      .replace('{name}', displayName)
      .replace('{city}', city.name);
    setText(`catastrophe-advisor-${idx}`, advisorLine);
  });

  // Tech-yield breakdown rows via textContent (XSS-safe)
  techYieldParts.forEach((part, idx) => {
    const el = panel.querySelector(`[data-tech-yield="${idx}"]`);
    if (!el) return;
    const pieces: string[] = [];
    if (part.yields.food) pieces.push(`+${part.yields.food} 🌾`);
    if (part.yields.production) pieces.push(`+${part.yields.production} ⚒️`);
    if (part.yields.gold) pieces.push(`+${part.yields.gold} 💰`);
    if (part.yields.science) pieces.push(`+${part.yields.science} 🔬`);
    el.textContent = `${part.label}: ${pieces.join(' ')}`;
  });

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

  orderedBuildings.forEach((b, i) => {
    setText(`build-name-${i}`, b.name);
    setText(`build-desc-${i}`, b.description);
  });

  availableUnits.forEach((u, i) => {
    setText(`unit-name-${i}`, u.name);
  });

  // Fill locked item names and reasons via textContent (XSS-safe)
  for (const item of visibleLockedItems) {
    const nameEl = panel.querySelector(`[data-locked-name="${item.id}"]`);
    if (nameEl) nameEl.textContent = item.name;
    const reasonEl = panel.querySelector(`[data-locked-reason="${item.id}"]`);
    if (reasonEl) reasonEl.textContent = item.missingResources.map(r => buildLockedItemReason(r, completedTechs)).join('\n\n');
  }

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

  landmarkPreview?.items.forEach((item, index) => {
    setText(`landmark-preview-${index}`, item.state === 'under-construction'
      ? `${item.label} — Under construction`
      : `${item.label} — Completed`);
  });

  container.appendChild(panel);

  // Declare ref early so rerenderPanel (below) can cancel the timer via closure.
  const frustrationRef: { timer: ReturnType<typeof setTimeout> | null } = { timer: null };

  // Insert 📍 Find missing resources button into the locked section header
  if (lockedItems.length > 0) {
    const lockedSection = panel.querySelector('[data-section="locked-items"]');
    if (lockedSection) {
      const sectionHeader = lockedSection.firstElementChild as HTMLElement | null;
      if (sectionHeader) {
        sectionHeader.style.display = 'flex';
        sectionHeader.style.alignItems = 'center';
        sectionHeader.style.justifyContent = 'space-between';
        sectionHeader.style.gap = '8px';
        const findBtn = createGameButton('📍 Find missing resources', 'ghost');
        findBtn.dataset.findResourcesBtn = 'true';
        findBtn.style.fontSize = '11px';
        findBtn.style.padding = '4px 8px';
        sectionHeader.appendChild(findBtn);

        findBtn.addEventListener('click', () => {
          // Cancel frustration timer so it doesn't fire after panel closes.
          if (frustrationRef.timer !== null) {
            clearTimeout(frustrationRef.timer);
            frustrationRef.timer = null;
          }

          const highlights: HexCoord[] = [];
          const toasts: Array<{ message: string; type: 'info' | 'warning' }> = [];
          const seenResources = new Set<ResourceType>();
          const vis = state.civilizations[state.currentPlayer]?.visibility?.tiles ?? {};
          const calcDist = state.map.wrapsHorizontally
            ? (a: HexCoord, b: HexCoord) => wrappedHexDistance(a, b, state.map.width)
            : hexDistance;

          for (const item of lockedItems) {
            for (const resourceId of item.missingResources) {
              if (seenResources.has(resourceId)) continue;
              seenResources.add(resourceId);

              let nearestCoord: HexCoord | null = null;
              let nearestDist = Infinity;
              for (const [key, tile] of Object.entries(state.map.tiles)) {
                if (tile.resource !== resourceId) continue;
                const tileVis = vis[key];
                if (tileVis !== 'visible' && tileVis !== 'fog') continue;
                const dist = calcDist(city.position, tile.coord);
                if (dist < nearestDist) {
                  nearestDist = dist;
                  nearestCoord = tile.coord;
                }
              }

              const def = RESOURCE_DEFINITIONS.find(d => d.id === resourceId);
              const resourceName = def?.name ?? String(resourceId);
              const impName = def ? (IMPROVEMENT_LABELS[def.requiredImprovement] ?? def.requiredImprovement) : '';

              if (nearestCoord) {
                highlights.push(nearestCoord);
                const lines = [
                  `${resourceName} spotted! To acquire it:`,
                  `• Expand your city + build a ${impName} on that tile`,
                  `• Send an Expedition to plant a Resource Outpost there (no tech wait)`,
                ];
                if (completedTechs.includes('trade-routes')) {
                  lines.push(`• Buy access from a known civ (mid-game)`);
                }
                toasts.push({ message: lines.join('\n'), type: 'info' });
              } else {
                toasts.push({ message: `No ${resourceName} spotted yet — keep exploring!`, type: 'warning' });
              }
            }
          }

          callbacks.onFindResources?.(highlights, toasts);
          panel.remove();
          callbacks.onClose();
        });
      }
    }
  }

  const rerenderPanel = (nextState: GameState | void = state, nextTab: CityPanelTab = 'list') => {
    // Cancel the frustration timer before destroying this panel instance.
    if (frustrationRef.timer !== null) {
      clearTimeout(frustrationRef.timer);
      frustrationRef.timer = null;
    }
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

  // Locked-item frustration tip: if the player stares at a locked section for
  // 5 s without tapping a build item, suggest how to unlock the top resource.
  if (lockedItems.length > 0 && callbacks.onTip) {
    const onTip = callbacks.onTip;
    // Only suggest for items that have a concrete missing resource
    const actionableItem = lockedItems.find(it => it.missingResources.length > 0);
    if (actionableItem) {
      frustrationRef.timer = setTimeout(() => {
        frustrationRef.timer = null;
        const resourceId = actionableItem.missingResources[0];
        const tipId = `locked-frustration-${resourceId}`;
        if (SESSION_SHOWN_TIPS.has(tipId)) return;
        SESSION_SHOWN_TIPS.add(tipId);
        const def = RESOURCE_DEFINITIONS.find(d => d.id === resourceId);
        const resourceName = def?.name ?? String(resourceId);
        onTip(
          `To unlock ${actionableItem.name}, you need ${resourceName}. `
          + `Train an Expedition to find and claim a nearby deposit!`,
        );
      }, 5000);
    }
  }

  const cancelFrustrationTimer = () => {
    if (frustrationRef.timer !== null) {
      clearTimeout(frustrationRef.timer);
      frustrationRef.timer = null;
    }
  };

  byId('city-close')?.addEventListener('click', () => {
    cancelFrustrationTimer();
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

  panel.querySelector<HTMLElement>('[data-locked-show-more]')?.addEventListener('click', () => {
    const btn = panel.querySelector<HTMLElement>('[data-locked-show-more]');
    if (!btn) return;
    const hiddenItems = lockedItems.slice(LOCKED_SHOW_LIMIT);
    for (const item of hiddenItems) {
      let html = `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px;margin-bottom:6px;opacity:0.5;">`;
      html += `<div style="font-weight:bold;font-size:13px;">🔒 ${getProductionIconForItem(item.id)} `;
      html += `<span data-locked-name-extra="${item.id}"></span></div>`;
      html += `<div style="font-size:11px;" data-locked-reason-extra="${item.id}"></div>`;
      html += `</div>`;
      btn.insertAdjacentHTML('beforebegin', html);
      // Fill dynamic text via textContent (XSS-safe)
      const nameEl = panel.querySelector(`[data-locked-name-extra="${item.id}"]`);
      if (nameEl) nameEl.textContent = item.name;
      const reasonEl = panel.querySelector(`[data-locked-reason-extra="${item.id}"]`);
      if (reasonEl) reasonEl.textContent = item.missingResources.map(r => buildLockedItemReason(r, completedTechs)).join('\n\n');
    }
    btn.remove();
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

  panel.querySelectorAll<HTMLButtonElement>('[data-appease]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const nextState = callbacks.onAppeaseFaction?.(city.id);
      rerenderPanel(nextState);
    });
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-concede]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const nextState = callbacks.onConcedeToMovement?.(city.id);
      rerenderPanel(nextState);
    });
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-quarantine-crisis]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const [crisisId, cityId] = btn.dataset.quarantineCrisis!.split(':');
      const nextState = callbacks.onQuarantineCrisis?.(crisisId, cityId);
      rerenderPanel(nextState);
    });
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-remedy-crisis]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const [crisisId, cityId] = btn.dataset.remedyCrisis!.split(':');
      const nextState = callbacks.onRemedyCrisis?.(crisisId, cityId);
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
  const districtsTab = byId('tab-districts') as HTMLElement;
  const citizensTab = byId('tab-citizens') as HTMLElement;
  const wondersTab = byId('tab-wonders') as HTMLElement;
  const listView = byId('city-list-view') as HTMLElement;
  const districtsView = byId('city-districts-view') as HTMLElement;
  const citizensView = byId('city-citizens-view') as HTMLElement;

  const ALL_VIEWS = [listView, districtsView, citizensView];
  const ALL_TABS = [listTab, districtsTab, citizensTab, wondersTab];
  const ACTIVE_BG = 'rgba(255,255,255,0.15)';
  const INACTIVE_BG = 'rgba(255,255,255,0.05)';

  const deactivateAll = () => {
    for (const v of ALL_VIEWS) v.style.display = 'none';
    for (const t of ALL_TABS) { t.style.background = INACTIVE_BG; t.style.fontWeight = 'normal'; }
  };

  const activateListTab = () => {
    deactivateAll();
    listView.style.display = 'block';
    listTab.style.background = ACTIVE_BG;
    listTab.style.fontWeight = 'bold';
  };

  const activateDistrictsTab = () => {
    deactivateAll();
    districtsView.textContent = '';
    districtsView.appendChild(createCityDistrictsTab(city));
    districtsView.style.display = 'block';
    districtsTab.style.background = ACTIVE_BG;
    districtsTab.style.fontWeight = 'bold';
  };

  const activateCitizensTab = () => {
    deactivateAll();
    citizensView.textContent = '';
    citizensView.appendChild(createCityWorkSection(city, state.map, {
      state,
      onSetCityFocus: (cityId, focus) => rerenderPanel(callbacks.onSetCityFocus?.(cityId, focus), 'citizens'),
      onToggleWorkedTile: (cityId, coord, worked) => rerenderPanel(callbacks.onToggleWorkedTile?.(cityId, coord, worked), 'citizens'),
    }));
    citizensView.style.display = 'block';
    citizensTab.style.background = ACTIVE_BG;
    citizensTab.style.fontWeight = 'bold';
  };

  listTab?.addEventListener('click', activateListTab);
  districtsTab?.addEventListener('click', activateDistrictsTab);
  citizensTab?.addEventListener('click', activateCitizensTab);

  wondersTab?.addEventListener('click', () => {
    callbacks.onOpenWonderPanel(city.id);
    panel.remove();
  });

  if (initialTab === 'districts') {
    activateDistrictsTab();
  } else if (initialTab === 'citizens') {
    activateCitizensTab();
  } else {
    activateListTab();
  }

  // Upgradeable units section — computed and rendered after rerenderPanel is defined
  // so click handlers can call rerenderPanel() to refresh after upgrade.
  if (callbacks.onUpgradeUnit) {
    const civGold = state.civilizations[city.owner]?.gold ?? 0;
    const upgradeEntries = Object.values(state.units)
      .map(u => ({ u, upgrade: canUpgradeUnit(u, city.id, state.cities, completedTechs, civGold, playerResources) }))
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
