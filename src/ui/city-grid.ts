import type { City, CityFocus, GameMap, GameState, HexCoord, HexTile, ResourceYield } from '@/core/types';
import { hexKey, hexesInRange } from '@/systems/hex-utils';
import { BUILDINGS } from '@/systems/city-system';
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

function renderBuildingsCoreSection(root: HTMLElement, city: City): void {
  const section = document.createElement('section');
  section.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  const heading = document.createElement('h3');
  heading.textContent = 'Buildings/Core';
  section.appendChild(heading);

  const placedBuildingIds = city.grid.flat().filter((buildingId): buildingId is string => Boolean(buildingId));
  const summary = document.createElement('div');
  summary.textContent = placedBuildingIds.length > 0
    ? placedBuildingIds.map(buildingId => BUILDINGS[buildingId]?.name ?? titleCase(buildingId)).join(', ')
    : 'City Center';
  section.appendChild(summary);
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

  const adjBonuses = calculateAdjacencyBonuses(city.grid, city.gridSize);
  const suggestedSlot = suggestedBuilding
    ? findOptimalSlot(city.grid, city.gridSize, suggestedBuilding)
    : null;
  const renderGridSize = city.grid.length || 7;
  const gridCenter = Math.floor(renderGridSize / 2);
  const gridMaxWidth = Math.min(420, renderGridSize * 56);

  // Get terrain for edge slots from owned tiles
  const ownedTileMap: Record<string, HexTile> = {};
  const surroundingHexes = hexesInRange(city.position, 1);
  for (let i = 0; i < surroundingHexes.length && i < 8; i++) {
    const key = hexKey(surroundingHexes[i]);
    if (map.tiles[key]) {
      ownedTileMap[`edge-${i}`] = map.tiles[key];
    }
  }

  let html = `
  <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-bottom:10px;padding:0 4px;line-height:1.4;">
    <strong style="color:#e8c170;">Grid View</strong> — Tap empty slots to place buildings, tap built slots to learn what they do, and use adjacency to make clever little combos. Edge slots show the terrain they sit on so the board explains itself.
    ${suggestedBuilding ? `<div style="color:#e8c170;margin-top:4px;">Suggested: <strong>${suggestedBuilding}</strong></div>` : ''}
  </div>
  <div style="display:grid;grid-template-columns:repeat(${renderGridSize},minmax(0,1fr));gap:3px;max-width:${gridMaxWidth}px;margin:0 auto;">`;

  const edgeSlots: Record<string, number> = {
    '0,1': 0, '0,2': 1, '0,3': 2,
    '1,0': 3, '1,4': 4,
    '2,0': 5, '2,4': 6,
    '3,0': 7, '3,4': 8,
    '4,1': 9, '4,2': 10, '4,3': 11,
    '0,0': 12, '0,4': 13, '4,0': 14, '4,4': 15,
  };

  for (let r = 0; r < renderGridSize; r++) {
    for (let c = 0; c < renderGridSize; c++) {
      const building = city.grid[r]?.[c];
      const isUnlocked = isSlotUnlocked(r, c, city.gridSize, renderGridSize);
      const isSuggested = suggestedSlot && suggestedSlot.row === r && suggestedSlot.col === c;
      const adjKey = `${r},${c}`;
      const bonus = adjBonuses[adjKey];

      if (!isUnlocked) {
        const distanceFromCenter = Math.max(Math.abs(r - gridCenter), Math.abs(c - gridCenter));
        const popNeeded = distanceFromCenter > 2 ? 6 : 3;
        const buyCost = popNeeded === 3 ? 50 : 150;
        html += `<div class="grid-locked" style="aspect-ratio:1;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:6px;display:flex;align-items:center;justify-content:center;flex-direction:column;font-size:10px;color:rgba(255,255,255,0.15);cursor:pointer;">
          <span>🔒</span>
          <span style="margin-top:2px;">Pop ${popNeeded}</span>
          <span style="font-size:8px;">💰${buyCost}</span>
        </div>`;
      } else if (building) {
        const icon = BUILDING_ICONS[building] ?? '🏗️';
        const bDef = BUILDINGS[building];
        const name = bDef?.name ?? building;
        let bonusText = '';
        if (bonus && (bonus.food + bonus.production + bonus.gold + bonus.science > 0)) {
          const parts: string[] = [];
          if (bonus.food > 0) parts.push(`+${bonus.food}🍞`);
          if (bonus.production > 0) parts.push(`+${bonus.production}⚒️`);
          if (bonus.gold > 0) parts.push(`+${bonus.gold}💰`);
          if (bonus.science > 0) parts.push(`+${bonus.science}🔬`);
          bonusText = `<span style="font-size:7px;color:#e8c170;">${parts.join(' ')}</span>`;
        }
        const bgColor = building === 'city-center' ? 'rgba(232,193,112,0.3)' : 'rgba(107,155,75,0.2)';
        const borderColor = building === 'city-center' ? '#e8c170' : 'rgba(107,155,75,0.5)';
        html += `<div class="grid-building" data-building="${building}" style="aspect-ratio:1;background:${bgColor};border:2px solid ${borderColor};border-radius:6px;display:flex;align-items:center;justify-content:center;flex-direction:column;font-size:10px;cursor:pointer;">
          <span style="font-size:18px;">${icon}</span>
          <span style="font-size:7px;margin-top:1px;">${name}</span>
          ${bonusText}
        </div>`;
      } else {
        const edgeKey = `${r},${c}`;
        const edgeIdx = edgeSlots[edgeKey];
        const edgeTile = edgeIdx !== undefined ? ownedTileMap[`edge-${edgeIdx}`] : null;

        let terrainInfo = '';
        if (edgeTile && (r !== gridCenter || c !== gridCenter)) {
          const tIcon = TERRAIN_ICONS[edgeTile.terrain] ?? '?';
          const tYield = TERRAIN_YIELDS[edgeTile.terrain];
          const yieldParts: string[] = [];
          if (tYield?.food) yieldParts.push(`${tYield.food}🍞`);
          if (tYield?.production) yieldParts.push(`${tYield.production}⚒️`);
          if (edgeTile.hasRiver) yieldParts.push('+1💰');
          terrainInfo = `<span style="font-size:14px;">${tIcon}</span>
            <span style="font-size:7px;color:rgba(255,255,255,0.5);">${edgeTile.terrain}</span>
            <span style="font-size:7px;color:rgba(255,255,255,0.4);">${yieldParts.join(' ')}</span>`;
        } else {
          terrainInfo = '<span style="font-size:14px;color:rgba(255,255,255,0.25);">+</span>';
        }

        const border = isSuggested
          ? 'border:2px dashed #e8c170;animation:pulse 1.5s infinite;'
          : 'border:2px dashed rgba(255,255,255,0.15);';
        const bg = edgeTile
          ? 'background:rgba(255,255,255,0.04);'
          : 'background:rgba(255,255,255,0.06);';

        html += `<div class="grid-slot" data-row="${r}" data-col="${c}" style="aspect-ratio:1;${bg}${border}border-radius:6px;display:flex;align-items:center;justify-content:center;flex-direction:column;cursor:pointer;font-size:10px;">
          ${terrainInfo}
          ${isSuggested ? '<span style="font-size:7px;color:#e8c170;">✨ suggested</span>' : ''}
        </div>`;
      }
    }
  }

  html += '</div>';
  html += '<div id="grid-detail" style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.6);min-height:24px;padding:0 4px;"></div>';
  html += '<style>@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.6; } }</style>';

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
    renderBuildingsCoreSection(managementRoot, displayedWorkView.city);
    renderWorkedLandSection(managementRoot, displayedWorkView.city, displayedOptions);

    const boardRoot = document.createElement('div');
    boardRoot.innerHTML = html;
    panel.appendChild(managementRoot);
    panel.appendChild(boardRoot);
  } else {
    panel.innerHTML = html;
  }
  container.appendChild(panel);

  // Click handlers for occupied building slots — show info inline
  panel.querySelectorAll('.grid-building').forEach(el => {
    el.addEventListener('click', () => {
      const buildingId = (el as HTMLElement).dataset.building!;
      const bDef = BUILDINGS[buildingId];
      if (!bDef) return;
      const yields: string[] = [];
      if (bDef.yields.food > 0) yields.push(`+${bDef.yields.food} food`);
      if (bDef.yields.production > 0) yields.push(`+${bDef.yields.production} production`);
      if (bDef.yields.gold > 0) yields.push(`+${bDef.yields.gold} gold`);
      if (bDef.yields.science > 0) yields.push(`+${bDef.yields.science} science`);
      const yieldText = yields.length > 0 ? yields.join(', ') : 'no direct yields';
      const detailEl = panel.querySelector('#grid-detail');
      if (detailEl) {
        detailEl.textContent = '';
        const strong = document.createElement('strong');
        strong.style.color = '#e8c170';
        strong.textContent = bDef.name;
        detailEl.appendChild(strong);
        detailEl.appendChild(document.createTextNode(`: ${bDef.description} — ${yieldText}`));
      }
    });
  });

  // Click handlers for empty slots
  panel.querySelectorAll('.grid-slot').forEach(el => {
    el.addEventListener('click', () => {
      const row = parseInt((el as HTMLElement).dataset.row!);
      const col = parseInt((el as HTMLElement).dataset.col!);
      callbacks.onSlotTap(row, col);
    });
  });

  // Click handlers for locked slots (gold purchase)
  panel.querySelectorAll('.grid-locked').forEach(el => {
    el.addEventListener('click', () => {
      callbacks.onBuyExpansion();
    });
  });

  return panel;
}

function isSlotUnlocked(row: number, col: number, gridSize: number, renderSize: number): boolean {
  const unlockedSize = Math.min(gridSize, renderSize);
  const offset = Math.floor((renderSize - unlockedSize) / 2);
  return row >= offset && row < renderSize - offset && col >= offset && col < renderSize - offset;
}
