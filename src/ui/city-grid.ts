import type { City, GameMap, HexTile } from '@/core/types';
import { hexKey, hexesInRange } from '@/systems/hex-utils';
import { BUILDINGS } from '@/systems/city-system';
import { calculateAdjacencyBonuses, findOptimalSlot } from '@/systems/adjacency-system';
import { TERRAIN_YIELDS } from '@/systems/resource-system';

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

export function createCityGrid(
  container: HTMLElement,
  city: City,
  map: GameMap,
  callbacks: CityGridCallbacks,
  suggestedBuilding?: string,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'city-grid';
  panel.style.cssText = 'padding:16px;';

  const adjBonuses = calculateAdjacencyBonuses(city.grid, city.gridSize);
  const suggestedSlot = suggestedBuilding
    ? findOptimalSlot(city.grid, city.gridSize, suggestedBuilding)
    : null;

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
    <strong style="color:#e8c170;">City Layout</strong> — Tap empty slots to place buildings. Adjacent buildings can boost each other. Edge slots show the terrain they sit on.
    ${suggestedBuilding ? `<div style="color:#e8c170;margin-top:4px;">Suggested: <strong>${suggestedBuilding}</strong></div>` : ''}
  </div>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;max-width:380px;margin:0 auto;">`;

  const edgeSlots: Record<string, number> = {
    '0,1': 0, '0,2': 1, '0,3': 2,
    '1,0': 3, '1,4': 4,
    '2,0': 5, '2,4': 6,
    '3,0': 7, '3,4': 8,
    '4,1': 9, '4,2': 10, '4,3': 11,
    '0,0': 12, '0,4': 13, '4,0': 14, '4,4': 15,
  };

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const building = city.grid[r]?.[c];
      const isUnlocked = isSlotUnlocked(r, c, city.gridSize);
      const isSuggested = suggestedSlot && suggestedSlot.row === r && suggestedSlot.col === c;
      const adjKey = `${r},${c}`;
      const bonus = adjBonuses[adjKey];

      if (!isUnlocked) {
        const popNeeded = r < 1 || r > 3 || c < 1 || c > 3 ? 6 : 3;
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
        if (edgeTile && r !== 2 && c !== 2) {
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

  panel.innerHTML = html;
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

function isSlotUnlocked(row: number, col: number, gridSize: number): boolean {
  const offset = Math.floor((5 - gridSize) / 2);
  return row >= offset && row < 5 - offset && col >= offset && col < 5 - offset;
}
