import type { City, CityFocus, GameMap, GameState, HexCoord, HexTile, ResourceYield } from '@/core/types';
import { hexKey, hexesInRange } from '@/systems/hex-utils';
import { BUILDINGS } from '@/systems/city-system';
import { TERRAIN_YIELDS } from '@/systems/resource-system';
import { getImprovementYieldBonus } from '@/systems/improvement-system';
import {
  assignCityFocus,
  calculateProjectedCityYields,
  getWorkableTilesForCity,
  normalizeWorkedTilesForCity,
} from '@/systems/city-work-system';
import { getOccupiedCityYieldMultiplier } from '@/systems/city-occupation-system';
import { getUnrestYieldMultiplier } from '@/systems/faction-system';
import { createGameButton } from '@/ui/ui-kit';

const BUILDING_ICONS: Record<string, string> = {
  'city-center': '🏛️',
  granary: '🌾',
  herbalist: '🌿',
  aqueduct: '💧',
  workshop: '⚒️',
  forge: '🔥',
  lumbermill: '🪵',
  'quarry-building': '🪨',
  library: '📚',
  archive: '📜',
  observatory: '🔭',
  marketplace: '🏪',
  harbor: '⚓',
  dock: '🚢',
  barracks: '⚔️',
  walls: '🧱',
  stable: '🐴',
  temple: '🕍',
  monument: '🗿',
  amphitheater: '🎭',
  shrine: '⛩️',
  forum: '🏛️',
};

const TERRAIN_ICONS: Record<string, string> = {
  grassland: '🌿',
  plains: '🌾',
  desert: '🏜️',
  forest: '🌲',
  hills: '⛰️',
  jungle: '🌴',
  swamp: '🌊',
  volcanic: '🌋',
  tundra: '❄️',
  coast: '🏖️',
};

interface CityManagementOptions {
  state: GameState;
  onSetCityFocus?: (cityId: string, focus: Exclude<CityFocus, 'custom'>) => void;
  onToggleWorkedTile?: (cityId: string, coord: HexCoord, worked: boolean) => void;
}

function titleCase(value: string): string {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function formatYield(yieldValue: ResourceYield): string {
  const parts: string[] = [];
  if (yieldValue.food) parts.push(`+${yieldValue.food} food`);
  if (yieldValue.production) parts.push(`+${yieldValue.production} production`);
  if (yieldValue.gold) parts.push(`+${yieldValue.gold} gold`);
  if (yieldValue.science) parts.push(`+${yieldValue.science} science`);
  return parts.length > 0 ? parts.join(', ') : 'No yield';
}

function formatFocusLabel(focus: CityFocus): string {
  return `${titleCase(focus)} focus`;
}

interface DisplayedCityWorkView {
  state: GameState;
  city: City;
}

function getDisplayedCityWorkView(state: GameState, city: City): DisplayedCityWorkView {
  const result = city.focus === 'custom'
    ? normalizeWorkedTilesForCity(state, city.id)
    : assignCityFocus(state, city.id, city.focus);
  return {
    state: result.state,
    city: result.state.cities[city.id] ?? city,
  };
}

function getDisplayedCityYields(state: GameState, city: City): ResourceYield {
  const baseYields = calculateProjectedCityYields(state, city.id);
  const yieldMultiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city));
  return {
    food: Math.floor(baseYields.food * yieldMultiplier),
    production: Math.floor(baseYields.production * yieldMultiplier),
    gold: Math.floor(baseYields.gold * yieldMultiplier),
    science: Math.floor(baseYields.science * yieldMultiplier),
  };
}

function renderOverviewSection(root: HTMLElement, city: City, options: CityManagementOptions): void {
  const section = document.createElement('section');
  section.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  const heading = document.createElement('h3');
  heading.textContent = 'Overview';
  section.appendChild(heading);

  const yields = getDisplayedCityYields(options.state, city);
  const summary = document.createElement('div');
  summary.textContent = [
    `Population ${city.population}`,
    formatFocusLabel(city.focus),
    `Food +${yields.food}`,
    `Production +${yields.production}`,
    `Gold +${yields.gold}`,
    `Science +${yields.science}`,
  ].join(' · ');
  section.appendChild(summary);
  root.appendChild(section);
}

function renderWorkedLandSection(root: HTMLElement, city: City, options: CityManagementOptions): void {
  const section = document.createElement('section');
  section.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  const heading = document.createElement('h3');
  heading.textContent = 'Worked Land And Water';
  section.appendChild(heading);

  const help = document.createElement('p');
  help.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.55);margin:0;line-height:1.4;';
  help.textContent = 'Workers have 2 charges by default. They build Farms (+2 food), Mines (+2 production, +1 gold), Lumber Camps (+2 production on forest/jungle), and Watermills (+1 food, +1 production on river land).';
  section.appendChild(help);

  const workedKeys = new Set((city.workedTiles ?? []).map(coord => hexKey(coord)));
  const workedCount = Math.min(city.population, workedKeys.size);
  const unassigned = Math.max(0, city.population - workedCount);
  const hasOpenCitizen = workedCount < city.population;

  const summary = document.createElement('div');
  summary.textContent = `Worked ${workedCount}/${city.population} citizens · ${formatFocusLabel(city.focus)}`;
  section.appendChild(summary);

  if (unassigned > 0) {
    const unassignedLabel = document.createElement('div');
    unassignedLabel.textContent = `Unassigned citizens: ${unassigned}`;
    section.appendChild(unassignedLabel);
  }

  const focusWrap = document.createElement('div');
  focusWrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;';
  const focusModes: Array<Exclude<CityFocus, 'custom'>> = ['balanced', 'food', 'production', 'gold', 'science'];
  for (const focus of focusModes) {
    const button = createGameButton(`${focus[0].toUpperCase()}${focus.slice(1)}`, 'secondary');
    button.dataset.cityFocus = focus;
    button.addEventListener('click', () => options.onSetCityFocus?.(city.id, focus));
    focusWrap.appendChild(button);
  }
  if (city.focus === 'custom') {
    const customIndicator = document.createElement('span');
    customIndicator.dataset.customFocusIndicator = '';
    customIndicator.textContent = 'Custom';
    customIndicator.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.35);padding:4px 8px;border:1px solid rgba(255,255,255,0.15);border-radius:4px;';
    focusWrap.appendChild(customIndicator);
  }
  section.appendChild(focusWrap);

  for (const entry of getWorkableTilesForCity(options.state, city.id)) {
    const tile = options.state.map.tiles[hexKey(entry.coord)];
    if (!tile) continue;
    const worked = workedKeys.has(hexKey(entry.coord));
    const row = document.createElement('div');
    row.style.cssText = [
      'display:grid',
      'grid-template-columns:minmax(0,1fr) auto',
      'gap:8px',
      'align-items:center',
      'padding:10px',
      'border:1px solid rgba(255,255,255,0.14)',
      'border-radius:8px',
    ].join(';');

    const text = document.createElement('div');
    const labels = [titleCase(tile.terrain), formatYield(entry.yield)];
    if (tile.improvement !== 'none' && tile.improvementTurnsLeft === 0) {
      const bonus = getImprovementYieldBonus(tile.improvement);
      const bonusParts: string[] = [];
      if (bonus.food) bonusParts.push(`+${bonus.food} food`);
      if (bonus.production) bonusParts.push(`+${bonus.production} production`);
      if (bonus.gold) bonusParts.push(`+${bonus.gold} gold`);
      if (bonus.science) bonusParts.push(`+${bonus.science} science`);
      const bonusText = bonusParts.length > 0 ? ` (${bonusParts.join(', ')})` : '';
      labels.push(`${titleCase(tile.improvement)}${bonusText}`);
    }
    if (entry.isWater) labels.push('Water work: fishing/trapping');
    const blockedByCapacity = !worked && entry.available && !hasOpenCitizen;
    if (entry.claim) {
      const claimingCity = options.state.cities[entry.claim.cityId];
      labels.push(claimingCity && claimingCity.owner === city.owner ? `Worked by ${claimingCity.name}` : 'Worked by another city');
    } else if (worked) {
      labels.push('Working');
    } else if (blockedByCapacity) {
      labels.push('No open citizen');
    } else {
      labels.push('Available');
    }
    text.textContent = labels.join(' · ');
    row.appendChild(text);

    if (blockedByCapacity) {
      row.style.opacity = '0.4';
    } else {
      const button = createGameButton(worked ? 'Unwork' : 'Work', 'secondary', { disabled: !entry.available && !worked });
      button.dataset.workedTileAction = worked ? 'unwork' : 'work';
      button.addEventListener('click', () => {
        options.onToggleWorkedTile?.(city.id, entry.coord, !worked);
      });
      row.appendChild(button);
    }
    section.appendChild(row);
  }

  root.appendChild(section);
}

export function createCityWorkSection(
  city: City,
  map: GameMap,
  managementOptions: CityManagementOptions,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'city-grid';
  panel.style.cssText = 'padding:16px;';

  const managementRoot = document.createElement('div');
  managementRoot.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'gap:12px',
    'max-width:720px',
    'margin:0 auto',
  ].join(';');
  const displayedWorkView = getDisplayedCityWorkView(managementOptions.state, city);
  const displayedOptions = { ...managementOptions, state: displayedWorkView.state };
  renderOverviewSection(managementRoot, displayedWorkView.city, displayedOptions);
  renderWorkedLandSection(managementRoot, displayedWorkView.city, displayedOptions);
  panel.appendChild(managementRoot);

  return panel;
}

export function createCityGrid(
  container: HTMLElement,
  city: City,
  map: GameMap,
  _suggestedBuilding?: string,
  managementOptions?: CityManagementOptions,
): HTMLElement {
  const panel = managementOptions
    ? createCityWorkSection(city, map, managementOptions)
    : createCityWorkSection(city, map, { state: { cities: { [city.id]: city }, map } as any });
  container.appendChild(panel);
  return panel;
}
