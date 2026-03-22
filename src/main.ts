import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';
import { processAITurn } from '@/ai/basic-ai';
import { RenderLoop } from '@/renderer/render-loop';
import { TouchHandler, type InputCallbacks } from '@/input/touch-handler';
import { MouseHandler } from '@/input/mouse-handler';
import { hexKey } from '@/systems/hex-utils';
import { getMovementRange, moveUnit, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { foundCity } from '@/systems/city-system';
import { startResearch } from '@/systems/tech-system';
import { createTechPanel } from '@/ui/tech-panel';
import { createCityPanel } from '@/ui/city-panel';
import { resolveCombat } from '@/systems/combat-system';
import { canBuildImprovement, IMPROVEMENT_BUILD_TURNS } from '@/systems/improvement-system';
import { updateVisibility, isVisible } from '@/systems/fog-of-war';
import { destroyCamp } from '@/systems/barbarian-system';
import { autoSave, loadAutoSave } from '@/storage/save-manager';
import { AudioManager } from '@/audio/audio-manager';
import { SFX } from '@/audio/sfx';
import type { GameState, HexCoord, Unit } from '@/core/types';

// --- App State ---
let gameState: GameState;
let selectedUnitId: string | null = null;
let movementRange: HexCoord[] = [];
const bus = new EventBus();
const audio = new AudioManager();

// --- Canvas Setup ---
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiLayer = document.getElementById('ui-layer') as HTMLDivElement;
const renderLoop = new RenderLoop(canvas);

// --- Resize ---
window.addEventListener('resize', () => renderLoop.resizeCanvas());

// --- UI Construction (minimal for M1, will be expanded) ---
function createUI(): void {
  // HUD
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.style.cssText = 'position:absolute;top:0;left:0;right:0;padding:8px 12px;background:rgba(0,0,0,0.6);display:flex;justify-content:space-between;font-size:13px;z-index:10;';
  uiLayer.appendChild(hud);

  // Bottom bar
  const bottomBar = document.createElement('div');
  bottomBar.id = 'bottom-bar';
  bottomBar.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:8px 12px 24px;background:rgba(0,0,0,0.8);display:flex;justify-content:space-around;z-index:10;';

  const endTurnBtn = createButton('End Turn', '⏭️', () => endTurn());
  endTurnBtn.style.color = '#e8c170';

  bottomBar.appendChild(createButton('Tech', '🔬', () => togglePanel('tech')));
  bottomBar.appendChild(createButton('City', '🏛️', () => togglePanel('city')));
  bottomBar.appendChild(endTurnBtn);
  uiLayer.appendChild(bottomBar);

  // Notification area
  const notifArea = document.createElement('div');
  notifArea.id = 'notifications';
  notifArea.style.cssText = 'position:absolute;top:40px;left:12px;right:12px;z-index:20;display:flex;flex-direction:column;gap:8px;';
  uiLayer.appendChild(notifArea);

  // Info panel (for selected unit/city)
  const infoPanel = document.createElement('div');
  infoPanel.id = 'info-panel';
  infoPanel.style.cssText = 'position:absolute;bottom:80px;left:12px;right:12px;z-index:10;display:none;';
  uiLayer.appendChild(infoPanel);
}

function createButton(label: string, icon: string, onClick: () => void): HTMLElement {
  const btn = document.createElement('div');
  btn.style.cssText = 'text-align:center;font-size:10px;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;';
  btn.innerHTML = `<div style="width:40px;height:40px;background:rgba(255,255,255,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;margin:0 auto 2px;">${icon}</div>${label}`;
  let handled = false;
  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!handled) {
      handled = true;
      onClick();
      setTimeout(() => { handled = false; }, 300);
    }
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!handled) {
      handled = true;
      onClick();
      setTimeout(() => { handled = false; }, 300);
    }
  });
  return btn;
}

// --- Game Logic ---
function updateHUD(): void {
  const hud = document.getElementById('hud');
  if (!hud) return;
  const civ = gameState.civilizations.player;
  hud.innerHTML = `
    <div style="display:flex;gap:12px;">
      <span>💰 ${civ.gold}</span>
      <span>🔬 ${civ.techState.currentResearch ? '...' : 'None'}</span>
    </div>
    <div>Turn ${gameState.turn} · Era ${gameState.era}</div>
  `;
}

function showNotification(message: string, type: 'info' | 'success' | 'warning' = 'info'): void {
  const area = document.getElementById('notifications');
  if (!area) return;

  const colors = { info: '#e8c170', success: '#6b9b4b', warning: '#d94a4a' };
  const notif = document.createElement('div');
  notif.style.cssText = `background:${colors[type]}ee;color:#1a1a2e;padding:10px 14px;border-radius:10px;font-size:12px;cursor:pointer;transition:opacity 0.3s;`;
  notif.textContent = message;
  notif.addEventListener('click', () => {
    notif.style.opacity = '0';
    setTimeout(() => notif.remove(), 300);
  });
  area.appendChild(notif);

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    if (notif.parentNode) {
      notif.style.opacity = '0';
      setTimeout(() => notif.remove(), 300);
    }
  }, 4000);

  SFX.notification();
}

function togglePanel(panel: string): void {
  // Remove any existing panel
  document.getElementById('tech-panel')?.remove();
  document.getElementById('city-panel')?.remove();

  if (panel === 'tech') {
    createTechPanel(uiLayer, gameState, {
      onStartResearch: (techId) => {
        gameState.civilizations.player.techState = startResearch(
          gameState.civilizations.player.techState,
          techId,
        );
        renderLoop.setGameState(gameState);
        updateHUD();
        showNotification(`Researching ${techId}...`, 'info');
      },
      onClose: () => {},
    });
  } else if (panel === 'city') {
    const playerCityId = gameState.civilizations.player.cities[0];
    const city = playerCityId ? gameState.cities[playerCityId] : null;
    if (!city) {
      showNotification('No cities founded yet!', 'info');
      return;
    }
    createCityPanel(uiLayer, city, gameState, {
      onBuild: (cityId, itemId) => {
        const targetCity = gameState.cities[cityId];
        if (targetCity) {
          targetCity.productionQueue = [itemId];
          targetCity.productionProgress = 0;
          renderLoop.setGameState(gameState);
          showNotification(`${targetCity.name}: building ${itemId}`, 'info');
        }
      },
      onClose: () => {},
    });
  }
}

function selectUnit(unitId: string): void {
  selectedUnitId = unitId;
  const unit = gameState.units[unitId];
  if (!unit || unit.owner !== 'player') return;

  // Calculate movement range
  const unitPositions: Record<string, string> = {};
  for (const [id, u] of Object.entries(gameState.units)) {
    unitPositions[hexKey(u.position)] = id;
  }
  movementRange = getMovementRange(unit, gameState.map, unitPositions);

  // Show unit info panel
  const panel = document.getElementById('info-panel');
  if (panel) {
    const def = UNIT_DEFINITIONS[unit.type];
    let actions = '';
    if (def.canFoundCity) actions += '<button id="btn-found-city" style="padding:8px 16px;border-radius:8px;background:#e8c170;border:none;color:#1a1a2e;font-weight:bold;cursor:pointer;">Found City</button> ';
    if (def.canBuildImprovements) {
      const tile = gameState.map.tiles[hexKey(unit.position)];
      if (tile && canBuildImprovement(tile, 'farm')) actions += '<button id="btn-build-farm" style="padding:8px 16px;border-radius:8px;background:#6b9b4b;border:none;color:white;cursor:pointer;">Build Farm</button> ';
      if (tile && canBuildImprovement(tile, 'mine')) actions += '<button id="btn-build-mine" style="padding:8px 16px;border-radius:8px;background:#8b7355;border:none;color:white;cursor:pointer;">Build Mine</button> ';
    }

    panel.style.display = 'block';
    panel.innerHTML = `
      <div style="background:rgba(0,0,0,0.85);border-radius:12px;padding:12px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong>${def.name}</strong> · HP: ${unit.health}/100 · Moves: ${unit.movementPointsLeft}/${def.movementPoints}
          </div>
          <span id="btn-deselect" style="cursor:pointer;font-size:18px;opacity:0.6;">✕</span>
        </div>
        <div style="margin-top:8px;display:flex;gap:8px;">${actions}</div>
      </div>
    `;

    document.getElementById('btn-deselect')?.addEventListener('click', deselectUnit);
    document.getElementById('btn-found-city')?.addEventListener('click', () => foundCityAction());
    document.getElementById('btn-build-farm')?.addEventListener('click', () => buildImprovementAction('farm'));
    document.getElementById('btn-build-mine')?.addEventListener('click', () => buildImprovementAction('mine'));
  }

  SFX.select();
}

function deselectUnit(): void {
  selectedUnitId = null;
  movementRange = [];
  const panel = document.getElementById('info-panel');
  if (panel) panel.style.display = 'none';
}

function foundCityAction(): void {
  if (!selectedUnitId) return;
  const unit = gameState.units[selectedUnitId];
  if (!unit || unit.type !== 'settler') return;

  const city = foundCity('player', unit.position, gameState.map);
  gameState.cities[city.id] = city;
  gameState.civilizations.player.cities.push(city.id);

  // Mark tiles as owned
  for (const coord of city.ownedTiles) {
    const key = hexKey(coord);
    if (gameState.map.tiles[key]) {
      gameState.map.tiles[key].owner = 'player';
    }
  }

  // Remove settler
  delete gameState.units[selectedUnitId];
  gameState.civilizations.player.units = gameState.civilizations.player.units.filter(id => id !== selectedUnitId);

  deselectUnit();
  bus.emit('city:founded', { city });
  showNotification(`${city.name} has been founded!`, 'success');
  SFX.foundCity();

  // Update visibility
  const playerUnits = gameState.civilizations.player.units
    .map(id => gameState.units[id])
    .filter((u): u is Unit => u !== undefined);
  const cityPositions = gameState.civilizations.player.cities
    .map(id => gameState.cities[id]?.position)
    .filter((p): p is HexCoord => p !== undefined);
  updateVisibility(gameState.civilizations.player.visibility, playerUnits, gameState.map, cityPositions);

  renderLoop.setGameState(gameState);
  updateHUD();
}

function buildImprovementAction(type: 'farm' | 'mine'): void {
  if (!selectedUnitId) return;
  const unit = gameState.units[selectedUnitId];
  if (!unit || unit.type !== 'worker') return;

  const tile = gameState.map.tiles[hexKey(unit.position)];
  if (!tile || !canBuildImprovement(tile, type)) return;

  tile.improvement = type;
  tile.improvementTurnsLeft = IMPROVEMENT_BUILD_TURNS[type];
  gameState.units[selectedUnitId].hasActed = true;

  deselectUnit();
  showNotification(`Building ${type}... (${IMPROVEMENT_BUILD_TURNS[type]} turns)`, 'info');
  renderLoop.setGameState(gameState);
}

function handleHexTap(coord: HexCoord): void {
  const key = hexKey(coord);

  // Check if tapping a unit
  const unitAtHex = Object.entries(gameState.units).find(
    ([_, u]) => hexKey(u.position) === key
  );

  if (unitAtHex && unitAtHex[1].owner === 'player') {
    selectUnit(unitAtHex[0]);
    return;
  }

  // If unit is selected and tapping a movement target
  if (selectedUnitId && movementRange.some(h => hexKey(h) === key)) {
    const unit = gameState.units[selectedUnitId];
    if (!unit) return;

    // Check for enemy unit at target (attack)
    if (unitAtHex && unitAtHex[1].owner !== 'player') {
      const result = resolveCombat(unit, unitAtHex[1], gameState.map);
      bus.emit('combat:resolved', { result });

      if (!result.attackerSurvived) {
        delete gameState.units[selectedUnitId];
        gameState.civilizations.player.units = gameState.civilizations.player.units.filter(id => id !== selectedUnitId);
        showNotification('Our unit was destroyed!', 'warning');
      } else {
        gameState.units[selectedUnitId].health -= result.attackerDamage;
        gameState.units[selectedUnitId].movementPointsLeft = 0;
      }

      if (!result.defenderSurvived) {
        const defOwner = unitAtHex[1].owner;
        delete gameState.units[unitAtHex[0]];
        if (gameState.civilizations[defOwner]) {
          gameState.civilizations[defOwner].units = gameState.civilizations[defOwner].units.filter(id => id !== unitAtHex[0]);
        }
        showNotification('Enemy unit destroyed!', 'success');

        // Check barbarian camp
        for (const [campId, camp] of Object.entries(gameState.barbarianCamps)) {
          if (hexKey(camp.position) === key) {
            const reward = destroyCamp(camp);
            delete gameState.barbarianCamps[campId];
            gameState.civilizations.player.gold += reward;
            showNotification(`Barbarian camp destroyed! +${reward} gold`, 'success');
          }
        }
      } else {
        gameState.units[unitAtHex[0]].health -= result.defenderDamage;
      }

      SFX.combat();
      deselectUnit();
    } else {
      // Move unit
      gameState.units[selectedUnitId] = moveUnit(unit, coord, 1);
      SFX.tap();

      // Update visibility after move
      const playerUnits = gameState.civilizations.player.units
        .map(id => gameState.units[id])
        .filter((u): u is Unit => u !== undefined);
      const cityPositions = gameState.civilizations.player.cities
        .map(id => gameState.cities[id]?.position)
        .filter((p): p is HexCoord => p !== undefined);
      const revealed = updateVisibility(gameState.civilizations.player.visibility, playerUnits, gameState.map, cityPositions);

      if (revealed.length > 0) {
        bus.emit('fog:revealed', { tiles: revealed });
      }

      // Re-select to update movement range
      if (gameState.units[selectedUnitId].movementPointsLeft > 0) {
        selectUnit(selectedUnitId);
      } else {
        deselectUnit();
      }
    }

    renderLoop.setGameState(gameState);
    updateHUD();
    return;
  }

  // Tapping empty hex — deselect
  deselectUnit();
  SFX.tap();
}

function handleHexLongPress(coord: HexCoord): void {
  // Show tile info
  const tile = gameState.map.tiles[hexKey(coord)];
  if (tile) {
    showNotification(`${tile.terrain} · ${tile.elevation}${tile.improvement !== 'none' ? ' · ' + tile.improvement : ''}${tile.resource ? ' · ' + tile.resource : ''}`);
  }
}

async function endTurn(): Promise<void> {
  try {
  SFX.endTurn();

  // Process improvements (count down build timers)
  for (const tile of Object.values(gameState.map.tiles)) {
    if (tile.improvementTurnsLeft > 0) {
      tile.improvementTurnsLeft--;
      if (tile.improvementTurnsLeft === 0) {
        bus.emit('improvement:completed', { coord: tile.coord, type: tile.improvement });
        showNotification(`${tile.improvement} completed!`, 'success');
      }
    }
  }

  // Process AI turn
  gameState = processAITurn(gameState, 'ai-1', bus);

  // Process end of turn (cities, research, barbarians, etc.)
  gameState = processTurn(gameState, bus);

  renderLoop.setGameState(gameState);
  updateHUD();

  // Auto-save
  await autoSave(gameState);
  bus.emit('game:saved', { turn: gameState.turn });
  } catch (err) {
    console.error('endTurn error:', err);
    showNotification('Error processing turn!', 'warning');
  }
}

// --- Event listeners ---
bus.on('tech:completed', ({ civId, techId }) => {
  if (civId === 'player') {
    showNotification(`Research complete: ${techId}!`, 'success');
    SFX.research();
  }
});

bus.on('city:grew', ({ cityId, newPopulation }) => {
  const city = gameState.cities[cityId];
  if (city && city.owner === 'player') {
    showNotification(`${city.name} grew to ${newPopulation} population!`, 'success');
  }
});

bus.on('city:building-complete', ({ cityId, buildingId }) => {
  const city = gameState.cities[cityId];
  if (city && city.owner === 'player') {
    showNotification(`${city.name}: ${buildingId} completed!`, 'success');
  }
});

bus.on('barbarian:spawned', ({ campId }) => {
  // Only notify if visible
  const camp = gameState.barbarianCamps[campId];
  if (camp) {
    const vis = gameState.civilizations.player.visibility;
    if (isVisible(vis, camp.position)) {
      showNotification('Barbarian raiders spotted!', 'warning');
    }
  }
});

// --- Initialization ---
async function init(): Promise<void> {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/conquestoria/sw.js');
    } catch {
      // SW registration failed — game still works
    }
  }

  createUI();

  // Try to load auto-save
  const saved = await loadAutoSave();
  if (saved) {
    gameState = saved;
    showNotification(`Welcome back! Turn ${gameState.turn}`, 'info');
  } else {
    gameState = createNewGame();
    showNotification('Your tribe has settled near a river...', 'info');
  }

  // Center camera on player's starting position
  const playerUnits = Object.values(gameState.units).filter(u => u.owner === 'player');
  if (playerUnits.length > 0) {
    renderLoop.camera.centerOn(playerUnits[0].position);
  }

  renderLoop.setGameState(gameState);
  updateHUD();

  // Input
  const callbacks: InputCallbacks = {
    onHexTap: handleHexTap,
    onHexLongPress: handleHexLongPress,
  };
  new TouchHandler(canvas, renderLoop.camera, callbacks);
  new MouseHandler(canvas, renderLoop.camera, callbacks);

  // Start render loop
  renderLoop.start();
}

init();
