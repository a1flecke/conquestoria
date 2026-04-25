import type { City, CityFocus, GameMap, GameState, HexCoord, HexTile, ResourceYield } from '@/core/types';
import { hexKey, hexesInRange } from '@/systems/hex-utils';
import { BUILDINGS, getUnplacedBuildings } from '@/systems/city-system';
import { calculateAdjacencyBonuses, findOptimalSlot } from '@/systems/adjacency-system';
import { TERRAIN_YIELDS } from '@/systems/resource-system';
import {
  assignCityFocus,
  calculateProjectedCityYields,
  getWorkableTilesForCity,
  normalizeWorkedTilesForCity,
} from '@/systems/city-work-system';
import { getOccupiedCityYieldMultiplier } from '@/systems/city-occupation-system';
import { getUnrestYieldMultiplier } from '@/systems/faction-system';

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

interface CityGridCallbacks {
  onSlotTap: (row: number, col: number) => void;
  onBuyExpansion: () => void;
  onClose: () => void;
}

interface CityManagementOptions {
  state: GameState;
  onSetCityFocus?: (cityId: string, focus: Exclude<CityFocus, 'custom'>) => void;
  onToggleWorkedTile?: (cityId: string, coord: HexCoord, worked: boolean) => void;
}

function titleCase(value: string): string {
  return value.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
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

const EDGE_SLOTS: Record<string, number> = {
  '0,1': 0,
  '0,2': 1,
  '0,3': 2,
  '1,0': 3,
  '1,4': 4,
  '2,0': 5,
  '2,4': 6,
  '3,0': 7,
  '3,4': 8,
  '4,1': 9,
  '4,2': 10,
  '4,3': 11,
  '0,0': 12,
  '0,4': 13,
  '4,0': 14,
  '4,4': 15,
};

function getOwnedTileMap(city: City, map: GameMap): Record<string, HexTile> {
  const ownedTileMap: Record<string, HexTile> = {};
  const surroundingHexes = hexesInRange(city.position, 1);
  for (let index = 0; index < surroundingHexes.length && index < 8; index++) {
    const key = hexKey(surroundingHexes[index]);
    if (map.tiles[key]) ownedTileMap[`edge-${index}`] = map.tiles[key];
  }
  return ownedTileMap;
}

function appendTextSpan(parent: HTMLElement, text: string, style?: string): void {
  const span = document.createElement('span');
  if (style) span.style.cssText = style;
  span.textContent = text;
  parent.appendChild(span);
}

function appendBuildingDetail(detail: HTMLElement, buildingId: string): void {
  const building = BUILDINGS[buildingId];
  if (!building) return;

  const yields: string[] = [];
  if (building.yields.food > 0) yields.push(`+${building.yields.food} food`);
  if (building.yields.production > 0) yields.push(`+${building.yields.production} production`);
  if (building.yields.gold > 0) yields.push(`+${building.yields.gold} gold`);
  if (building.yields.science > 0) yields.push(`+${building.yields.science} science`);
  const yieldText = yields.length > 0 ? yields.join(', ') : 'no direct yields';

  detail.textContent = '';
  const strong = document.createElement('strong');
  strong.style.color = '#e8c170';
  strong.textContent = building.name;
  detail.appendChild(strong);
  detail.appendChild(document.createTextNode(`: ${building.description} - ${yieldText}`));
}

function renderBuildingBoard(
  root: HTMLElement,
  city: City,
  map: GameMap,
  callbacks: CityGridCallbacks,
  suggestedBuilding?: string,
): void {
  const adjBonuses = calculateAdjacencyBonuses(city.grid, city.gridSize);
  const suggestedSlot = suggestedBuilding
    ? findOptimalSlot(city.grid, city.gridSize, suggestedBuilding)
    : null;
  const renderGridSize = city.grid.length || 7;
  const gridCenter = Math.floor(renderGridSize / 2);
  const gridMaxWidth = Math.min(420, renderGridSize * 56);
  const ownedTileMap = getOwnedTileMap(city, map);

  const grid = document.createElement('div');
  grid.dataset.buildingGrid = 'core';
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${renderGridSize},minmax(0,1fr));gap:3px;max-width:${gridMaxWidth}px;margin:0 auto;`;

  const detail = document.createElement('div');
  detail.id = 'grid-detail';
  detail.style.cssText = 'margin-top:8px;font-size:11px;color:rgba(255,255,255,0.6);min-height:24px;padding:0 4px;';

  for (let row = 0; row < renderGridSize; row++) {
    for (let col = 0; col < renderGridSize; col++) {
      const buildingId = city.grid[row]?.[col];
      const isUnlocked = isSlotUnlocked(row, col, city.gridSize, renderGridSize);
      const isSuggested = suggestedSlot && suggestedSlot.row === row && suggestedSlot.col === col;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.style.cssText = [
        'aspect-ratio:1',
        'border-radius:6px',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'flex-direction:column',
        'font-size:10px',
        'cursor:pointer',
      ].join(';');

      if (!isUnlocked) {
        const distanceFromCenter = Math.max(Math.abs(row - gridCenter), Math.abs(col - gridCenter));
        const popNeeded = distanceFromCenter > 2 ? 6 : 3;
        const buyCost = popNeeded === 3 ? 50 : 150;
        cell.className = 'grid-locked';
        cell.style.cssText += ';background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);color:rgba(255,255,255,0.35);';
        appendTextSpan(cell, 'Locked');
        appendTextSpan(cell, `Pop ${popNeeded}`, 'margin-top:2px;');
        appendTextSpan(cell, `Gold ${buyCost}`, 'font-size:8px;');
        cell.addEventListener('click', () => callbacks.onBuyExpansion());
      } else if (buildingId) {
        const building = BUILDINGS[buildingId];
        const bonus = adjBonuses[`${row},${col}`];
        const bgColor = buildingId === 'city-center' ? 'rgba(232,193,112,0.3)' : 'rgba(107,155,75,0.2)';
        const borderColor = buildingId === 'city-center' ? '#e8c170' : 'rgba(107,155,75,0.5)';
        cell.className = 'grid-building';
        cell.dataset.building = buildingId;
        cell.dataset.buildingCell = buildingId;
        cell.style.cssText += `;background:${bgColor};border:2px solid ${borderColor};`;
        appendTextSpan(cell, BUILDING_ICONS[buildingId] ?? 'Build', 'font-size:18px;');
        appendTextSpan(cell, building?.name ?? titleCase(buildingId), 'font-size:7px;margin-top:1px;');
        if (bonus && bonus.food + bonus.production + bonus.gold + bonus.science > 0) {
          const parts: string[] = [];
          if (bonus.food > 0) parts.push(`+${bonus.food} food`);
          if (bonus.production > 0) parts.push(`+${bonus.production} production`);
          if (bonus.gold > 0) parts.push(`+${bonus.gold} gold`);
          if (bonus.science > 0) parts.push(`+${bonus.science} science`);
          appendTextSpan(cell, parts.join(' '), 'font-size:7px;color:#e8c170;');
        }
        cell.addEventListener('click', () => appendBuildingDetail(detail, buildingId));
      } else {
        const edgeIdx = EDGE_SLOTS[`${row},${col}`];
        const edgeTile = edgeIdx !== undefined ? ownedTileMap[`edge-${edgeIdx}`] : null;
        const border = isSuggested
          ? 'border:2px dashed #e8c170;'
          : 'border:2px dashed rgba(255,255,255,0.15);';
        const bg = edgeTile
          ? 'background:rgba(255,255,255,0.04);'
          : 'background:rgba(255,255,255,0.06);';
        cell.className = 'grid-slot';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.style.cssText += `;${bg}${border}`;
        if (edgeTile && (row !== gridCenter || col !== gridCenter)) {
          const terrainYield = TERRAIN_YIELDS[edgeTile.terrain];
          const yieldParts: string[] = [];
          if (terrainYield?.food) yieldParts.push(`${terrainYield.food} food`);
          if (terrainYield?.production) yieldParts.push(`${terrainYield.production} production`);
          if (edgeTile.hasRiver) yieldParts.push('+1 gold');
          appendTextSpan(cell, TERRAIN_ICONS[edgeTile.terrain] ?? '?', 'font-size:14px;');
          appendTextSpan(cell, titleCase(edgeTile.terrain), 'font-size:7px;color:rgba(255,255,255,0.5);');
          if (yieldParts.length > 0) appendTextSpan(cell, yieldParts.join(' '), 'font-size:7px;color:rgba(255,255,255,0.4);');
        } else {
          appendTextSpan(cell, '+', 'font-size:14px;color:rgba(255,255,255,0.25);');
        }
        if (isSuggested) appendTextSpan(cell, 'suggested', 'font-size:7px;color:#e8c170;');
        cell.addEventListener('click', () => callbacks.onSlotTap(row, col));
      }

      grid.appendChild(cell);
    }
  }

  root.appendChild(grid);
  root.appendChild(detail);
}

function renderBuildingsCoreSection(
  root: HTMLElement,
  city: City,
  map: GameMap,
  callbacks: CityGridCallbacks,
  suggestedBuilding?: string,
): void {
  const section = document.createElement('section');
  section.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  const heading = document.createElement('h3');
  heading.textContent = 'Buildings/Core';
  section.appendChild(heading);

  renderBuildingBoard(section, city, map, callbacks, suggestedBuilding);

  const unplaced = getUnplacedBuildings(city);
  if (unplaced.length > 0) {
    const unplacedSection = document.createElement('section');
    unplacedSection.dataset.unplacedBuildings = 'true';
    unplacedSection.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:12px;';
    const unplacedHeading = document.createElement('h4');
    unplacedHeading.textContent = 'Unplaced buildings';
    unplacedSection.appendChild(unplacedHeading);
    for (const buildingId of unplaced) {
      const row = document.createElement('div');
      row.textContent = BUILDINGS[buildingId]?.name ?? titleCase(buildingId);
      unplacedSection.appendChild(row);
    }
    section.appendChild(unplacedSection);
  }

  root.appendChild(section);
}

function renderWorkedLandSection(root: HTMLElement, city: City, options: CityManagementOptions): void {
  const section = document.createElement('section');
  section.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  const heading = document.createElement('h3');
  heading.textContent = 'Worked Land And Water';
  section.appendChild(heading);

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
  focusWrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
  const focusModes: Array<Exclude<CityFocus, 'custom'>> = ['balanced', 'food', 'production', 'gold', 'science'];
  for (const focus of focusModes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cityFocus = focus;
    button.textContent = `${focus[0].toUpperCase()}${focus.slice(1)}`;
    button.addEventListener('click', () => options.onSetCityFocus?.(city.id, focus));
    focusWrap.appendChild(button);
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
    if (tile.improvement !== 'none' && tile.improvementTurnsLeft === 0) labels.push(titleCase(tile.improvement));
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

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.workedTileAction = worked ? 'unwork' : 'work';
    button.textContent = worked ? 'Unwork' : 'Work';
    button.disabled = (!entry.available && !worked) || blockedByCapacity;
    if (blockedByCapacity) {
      button.title = 'Unwork another tile first';
    }
    button.addEventListener('click', () => options.onToggleWorkedTile?.(city.id, entry.coord, !worked));
    row.appendChild(button);
    section.appendChild(row);
  }

  root.appendChild(section);
}

export function createCityGrid(
  container: HTMLElement,
  city: City,
  map: GameMap,
  callbacks: CityGridCallbacks,
  suggestedBuilding?: string,
  managementOptions?: CityManagementOptions,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'city-grid';
  panel.style.cssText = 'padding:16px;';

  if (managementOptions) {
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
    renderBuildingsCoreSection(managementRoot, displayedWorkView.city, map, callbacks, suggestedBuilding);
    renderWorkedLandSection(managementRoot, displayedWorkView.city, displayedOptions);
    panel.appendChild(managementRoot);
  } else {
    const intro = document.createElement('div');
    intro.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.7);margin-bottom:10px;padding:0 4px;line-height:1.4;';
    const introTitle = document.createElement('strong');
    introTitle.style.color = '#e8c170';
    introTitle.textContent = 'Grid View';
    intro.appendChild(introTitle);
    intro.appendChild(document.createTextNode(' - Tap empty slots to place buildings, tap built slots to learn what they do, and use adjacency to make clever little combos.'));
    if (suggestedBuilding) {
      const suggested = document.createElement('div');
      suggested.style.cssText = 'color:#e8c170;margin-top:4px;';
      suggested.textContent = `Suggested: ${suggestedBuilding}`;
      intro.appendChild(suggested);
    }
    panel.appendChild(intro);
    renderBuildingBoard(panel, city, map, callbacks, suggestedBuilding);
  }
  container.appendChild(panel);

  return panel;
}

function isSlotUnlocked(row: number, col: number, gridSize: number, renderSize: number): boolean {
  const unlockedSize = Math.min(gridSize, renderSize);
  const offset = Math.floor((renderSize - unlockedSize) / 2);
  return row >= offset && row < renderSize - offset && col >= offset && col < renderSize - offset;
}
