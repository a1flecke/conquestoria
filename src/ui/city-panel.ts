import type { City, GameState } from '@/core/types';
import { getAvailableBuildings, BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { calculateCityYields } from '@/systems/resource-system';
import { createCityGrid } from './city-grid';

export interface CityPanelCallbacks {
  onBuild: (cityId: string, itemId: string) => void;
  onOpenWonderPanel: (cityId: string) => void;
  onClose: () => void;
  onPrevCity?: () => void;
  onNextCity?: () => void;
}

export function createCityPanel(
  container: HTMLElement,
  city: City,
  state: GameState,
  callbacks: CityPanelCallbacks,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'city-panel';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.95);z-index:30;overflow-y:auto;padding:16px;padding-bottom:80px;';

  const yields = calculateCityYields(city, state.map);
  const availableBuildings = getAvailableBuildings(city, state.civilizations[state.currentPlayer].techState.completed);
  const cityWonderProject = Object.values(state.legendaryWonderProjects ?? {}).find(project => project.cityId === city.id);

  // Build placeholders for dynamic data; style attributes with pure numbers (progress%) are safe
  let buildingPlaceholders = '';
  for (let idx = 0; idx < city.buildings.length; idx++) {
    const bid = city.buildings[idx];
    const b = BUILDINGS[bid];
    if (b) {
      buildingPlaceholders += `<div style="background:rgba(255,255,255,0.05);border-radius:6px;padding:8px;margin-bottom:4px;font-size:12px;">
        <strong data-text="bldg-name-${idx}"></strong> — <span data-text="bldg-desc-${idx}"></span>
      </div>`;
    }
  }

  let buildItemPlaceholders = '';
  for (let idx = 0; idx < availableBuildings.length; idx++) {
    const b = availableBuildings[idx];
    const turns = yields.production > 0 ? Math.ceil(b.productionCost / yields.production) : '∞';
    const yieldParts: string[] = [];
    if (b.yields.food) yieldParts.push(`+${b.yields.food} 🌾`);
    if (b.yields.production) yieldParts.push(`+${b.yields.production} ⚒️`);
    if (b.yields.gold) yieldParts.push(`+${b.yields.gold} 💰`);
    if (b.yields.science) yieldParts.push(`+${b.yields.science} 🔬`);
    const yieldStr = yieldParts.length > 0 ? yieldParts.join(' ') + ' · ' : '';
    buildItemPlaceholders += `<div class="build-item" data-item-id="${b.id}" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;">
      <div style="font-weight:bold;font-size:13px;">🏗️ <span data-text="build-name-${idx}"></span></div>
      <div style="font-size:11px;opacity:0.7;">${yieldStr}${turns} turns</div>
      <div style="font-size:10px;opacity:0.5;" data-text="build-desc-${idx}"></div>
    </div>`;
  }

  const completedTechs = state.civilizations[state.currentPlayer].techState.completed;
  const availableUnits = TRAINABLE_UNITS.filter(u => !u.techRequired || completedTechs.includes(u.techRequired));

  let unitPlaceholders = '';
  for (let idx = 0; idx < availableUnits.length; idx++) {
    const u = availableUnits[idx];
    const turns = yields.production > 0 ? Math.ceil(u.cost / yields.production) : '∞';
    unitPlaceholders += `<div class="build-item" data-item-id="${u.type}" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;">
      <div style="font-weight:bold;font-size:13px;">⚔️ <span data-text="unit-name-${idx}"></span></div>
      <div style="font-size:11px;opacity:0.7;">Cost: ${u.cost} · ${turns} turns</div>
    </div>`;
  }

  // Current production placeholders
  let currentProductionHtml = '';
  if (city.productionQueue.length > 0) {
    const currentItem = city.productionQueue[0];
    const building = BUILDINGS[currentItem];
    const unit = TRAINABLE_UNITS.find(u => u.type === currentItem);
    const totalCost = building?.productionCost ?? unit?.cost ?? 0;
    const progress = totalCost > 0 ? Math.round((city.productionProgress / totalCost) * 100) : 0;

    currentProductionHtml = `
      <div style="background:rgba(255,255,255,0.1);border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="font-weight:bold;color:#e8c170;">Building: <span data-text="prod-name"></span></div>
        <div style="font-size:12px;opacity:0.7;"><span data-text="prod-turns"></span> turns remaining</div>
        <div style="background:rgba(0,0,0,0.3);border-radius:4px;height:8px;margin-top:8px;">
          <div style="background:#6b9b4b;border-radius:4px;height:8px;width:${progress}%;"></div>
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

    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <div id="tab-list" style="padding:6px 16px;background:rgba(255,255,255,0.15);border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">List</div>
      <div id="tab-grid" style="padding:6px 16px;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;font-size:12px;">Grid</div>
      <div id="tab-wonders" style="padding:6px 16px;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;font-size:12px;">Legendary Wonders</div>
    </div>
    <div id="city-list-view">
      ${currentProductionHtml}
      ${cityWonderProject ? `<div style="margin-bottom:12px;font-size:12px;opacity:0.75;">Wonder carryover: ${cityWonderProject.transferableProduction}</div>` : ''}
      ${city.buildings.length > 0 ? `<div style="margin-bottom:16px;"><h3 style="font-size:14px;margin:0 0 8px;">Buildings</h3>${buildingPlaceholders}</div>` : ''}
      <div><h3 style="font-size:14px;margin:0 0 8px;">Build</h3>
        ${buildItemPlaceholders}
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

  setText('city-name', city.name);
  setText('city-pop', String(city.population));
  setText('yield-food', String(yields.food));
  setText('yield-prod', String(yields.production));
  setText('yield-gold', String(yields.gold));
  setText('yield-science', String(yields.science));

  if (city.productionQueue.length > 0) {
    const currentItem = city.productionQueue[0];
    const building = BUILDINGS[currentItem];
    const unit = TRAINABLE_UNITS.find(u => u.type === currentItem);
    const totalCost = building?.productionCost ?? unit?.cost ?? 0;
    const turnsLeft = yields.production > 0 ? Math.ceil((totalCost - city.productionProgress) / yields.production) : '∞';
    setText('prod-name', building?.name ?? currentItem);
    setText('prod-turns', String(turnsLeft));
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

  container.appendChild(panel);

  panel.querySelector('#city-close')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onClose();
  });

  if (callbacks.onPrevCity) {
    panel.querySelector('#city-prev')?.addEventListener('click', () => {
      panel.remove();
      callbacks.onPrevCity!();
    });
  }
  if (callbacks.onNextCity) {
    panel.querySelector('#city-next')?.addEventListener('click', () => {
      panel.remove();
      callbacks.onNextCity!();
    });
  }

  panel.querySelectorAll('.build-item').forEach(el => {
    el.addEventListener('click', () => {
      const itemId = (el as HTMLElement).dataset.itemId!;
      callbacks.onBuild(city.id, itemId);
      panel.remove();
    });
  });

  // Tab switching
  const listTab = panel.querySelector('#tab-list') as HTMLElement;
  const gridTab = panel.querySelector('#tab-grid') as HTMLElement;
  const wondersTab = panel.querySelector('#tab-wonders') as HTMLElement;
  const listView = panel.querySelector('#city-list-view') as HTMLElement;
  const gridView = panel.querySelector('#city-grid-view') as HTMLElement;

  listTab?.addEventListener('click', () => {
    listView.style.display = 'block';
    gridView.style.display = 'none';
    listTab.style.background = 'rgba(255,255,255,0.15)';
    gridTab.style.background = 'rgba(255,255,255,0.05)';
  });

  gridTab?.addEventListener('click', () => {
    listView.style.display = 'none';
    gridView.style.display = 'block';
    gridTab.style.background = 'rgba(255,255,255,0.15)';
    listTab.style.background = 'rgba(255,255,255,0.05)';
    if (!gridView.hasChildNodes()) {
      createCityGrid(gridView, city, state.map, {
        onSlotTap: (_row, _col) => {
          callbacks.onClose();
        },
        onBuyExpansion: () => {
          callbacks.onClose();
        },
        onClose: callbacks.onClose,
      });
    }
  });

  wondersTab?.addEventListener('click', () => {
    callbacks.onOpenWonderPanel(city.id);
    panel.remove();
  });

  return panel;
}
