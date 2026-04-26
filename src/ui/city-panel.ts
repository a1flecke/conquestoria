import type { City, CityFocus, GameState, HexCoord } from '@/core/types';
import { getAvailableBuildings, BUILDINGS, TRAINABLE_UNITS, getTrainableUnitsForCiv } from '@/systems/city-system';
import { canUpgradeUnit, getUpgradeCost } from '@/systems/unit-upgrade-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getUnrestYieldMultiplier } from '@/systems/faction-system';
import { getOccupiedCityMood, getOccupiedCityYieldMultiplier } from '@/systems/city-occupation-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { createCityGrid } from './city-grid';

export interface CityPanelCallbacks {
  onBuild: (cityId: string, itemId: string) => void;
  onMoveQueueItem?: (cityId: string, fromIndex: number, toIndex: number) => void;
  onRemoveQueueItem?: (cityId: string, index: number) => void;
  onOpenWonderPanel: (cityId: string) => void;
  onSetCityFocus?: (cityId: string, focus: Exclude<CityFocus, 'custom'>) => GameState | void;
  onToggleWorkedTile?: (cityId: string, coord: HexCoord, worked: boolean) => GameState | void;
  onClose: () => void;
  onPrevCity?: () => void;
  onNextCity?: () => void;
  onUpgradeUnit?: (unitId: string) => void;
}

type CityPanelTab = 'list' | 'grid';

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
  const civType = state.civilizations[city.owner]?.civType;
  const availableUnits = getTrainableUnitsForCiv(completedTechs, civType);

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

  let queueRowsHtml = '';
  for (let idx = 0; idx < city.productionQueue.length; idx++) {
    queueRowsHtml += `
      <div data-queue-index="${idx}" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;background:rgba(255,255,255,0.06);border-radius:8px;padding:8px;">
        <div>
          <div style="font-weight:bold;" data-text="queue-name-${idx}"></div>
          <div style="font-size:11px;opacity:0.7;">Queue slot ${idx + 1}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button type="button" data-queue-action="up" data-queue-index="${idx}">↑</button>
          <button type="button" data-queue-action="down" data-queue-index="${idx}">↓</button>
          <button type="button" data-queue-action="remove" data-queue-index="${idx}">✕</button>
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

    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <div id="tab-list" style="padding:6px 16px;background:rgba(255,255,255,0.15);border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">List</div>
      <div id="tab-grid" style="padding:6px 16px;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;font-size:12px;">Grid</div>
      <div id="tab-wonders" style="padding:6px 16px;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;font-size:12px;">Legendary Wonders</div>
    </div>
    <div id="city-list-view">
      ${currentProductionHtml}
      ${city.productionQueue.length > 0 ? `<div style="margin-bottom:16px;"><h3 style="font-size:14px;margin:0 0 8px;">Queue</h3>${queueRowsHtml}</div>` : ''}
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

  city.productionQueue.forEach((itemId, index) => {
    setText(`queue-name-${index}`, BUILDINGS[itemId]?.name ?? TRAINABLE_UNITS.find(unit => unit.type === itemId)?.name ?? itemId);
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
