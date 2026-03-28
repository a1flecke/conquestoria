import { EventBus } from '@/core/event-bus';
import { createNewGame, createHotSeatGame } from '@/core/game-state';
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
import { updateVisibility, isVisible, getVisibility } from '@/systems/fog-of-war';
import { destroyCamp } from '@/systems/barbarian-system';
import { autoSave, loadAutoSave, saveGame, loadGame, listSaves } from '@/storage/save-manager';
import { AudioManager } from '@/audio/audio-manager';
import { SFX } from '@/audio/sfx';
import { createCivSelectPanel } from '@/ui/civ-select';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { createMarketplacePanel } from '@/ui/marketplace-panel';
import { createSavePanel } from '@/ui/save-panel';
import { AdvisorSystem } from '@/ui/advisor-system';
import { declareWar, makePeace, proposeTreaty } from '@/systems/diplomacy-system';
import { visitVillage } from '@/systems/village-system';
import { processWonderDiscovery } from '@/systems/wonder-system';
import { getWonderDefinition } from '@/systems/wonder-definitions';
import { getNextPlayer, getAIPlayers, isRoundComplete } from '@/core/turn-cycling';
import { showTurnHandoff } from '@/ui/turn-handoff';
import { showHotSeatSetup } from '@/ui/hotseat-setup';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { conquestMinorCiv } from '@/systems/minor-civ-system';
import type { GameState, HexCoord, Unit, DiplomaticAction } from '@/core/types';

// --- App State ---
let gameState: GameState;
let selectedUnitId: string | null = null;
let movementRange: HexCoord[] = [];
let inputInitialized = false;
const bus = new EventBus();
const audio = new AudioManager();
const advisorSystem = new AdvisorSystem(bus);

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
  bottomBar.appendChild(createButton('Diplo', '🤝', () => togglePanel('diplomacy')));
  bottomBar.appendChild(createButton('Trade', '💰', () => togglePanel('marketplace')));
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
function currentCiv() {
  return gameState.civilizations[gameState.currentPlayer];
}

function updateHUD(): void {
  const hud = document.getElementById('hud');
  if (!hud) return;
  const civ = currentCiv();
  const nameLabel = gameState.hotSeat ? `${civ.name} · ` : '';
  hud.innerHTML = `
    <div style="display:flex;gap:12px;">
      <span>💰 ${civ.gold}</span>
      <span>🔬 ${civ.techState.currentResearch ? '...' : 'None'}</span>
    </div>
    <div>${nameLabel}Turn ${gameState.turn} · Era ${gameState.era}</div>
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

function handleDiplomaticAction(targetCivId: string, action: DiplomaticAction): void {
  const cp = gameState.currentPlayer;
  switch (action) {
    case 'declare_war':
      currentCiv().diplomacy = declareWar(
        currentCiv().diplomacy, targetCivId, gameState.turn,
      );
      if (gameState.civilizations[targetCivId]?.diplomacy) {
        gameState.civilizations[targetCivId].diplomacy = declareWar(
          gameState.civilizations[targetCivId].diplomacy, cp, gameState.turn,
        );
      }
      bus.emit('diplomacy:war-declared', { attackerId: cp, defenderId: targetCivId });
      break;
    case 'request_peace':
      currentCiv().diplomacy = makePeace(
        currentCiv().diplomacy, targetCivId, gameState.turn,
      );
      if (gameState.civilizations[targetCivId]?.diplomacy) {
        gameState.civilizations[targetCivId].diplomacy = makePeace(
          gameState.civilizations[targetCivId].diplomacy, cp, gameState.turn,
        );
      }
      bus.emit('diplomacy:peace-made', { civA: cp, civB: targetCivId });
      break;
    case 'non_aggression_pact':
    case 'trade_agreement':
    case 'open_borders':
    case 'alliance':
      currentCiv().diplomacy = proposeTreaty(
        currentCiv().diplomacy, targetCivId, action,
        action === 'non_aggression_pact' ? 10 : -1, gameState.turn,
      );
      if (gameState.civilizations[targetCivId]?.diplomacy) {
        gameState.civilizations[targetCivId].diplomacy = proposeTreaty(
          gameState.civilizations[targetCivId].diplomacy, cp, action,
          action === 'non_aggression_pact' ? 10 : -1, gameState.turn,
        );
      }
      bus.emit('diplomacy:treaty-accepted', { civA: cp, civB: targetCivId, treaty: action });
      break;
  }
  showNotification(`Diplomatic action: ${action.replace(/_/g, ' ')}`, 'info');
}

function togglePanel(panel: string): void {
  // Remove any existing panel
  document.getElementById('tech-panel')?.remove();
  document.getElementById('city-panel')?.remove();
  document.getElementById('diplomacy-panel')?.remove();
  document.getElementById('marketplace-panel')?.remove();

  if (panel === 'tech') {
    createTechPanel(uiLayer, gameState, {
      onStartResearch: (techId) => {
        currentCiv().techState = startResearch(
          currentCiv().techState,
          techId,
        );
        renderLoop.setGameState(gameState);
        updateHUD();
        showNotification(`Researching ${techId}...`, 'info');
      },
      onClose: () => {},
    });
  } else if (panel === 'city') {
    const playerCityId = currentCiv().cities[0];
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
  } else if (panel === 'diplomacy') {
    createDiplomacyPanel(uiLayer, gameState, {
      onAction: handleDiplomaticAction,
      onClose: () => {},
    });
  } else if (panel === 'marketplace') {
    createMarketplacePanel(uiLayer, gameState, {
      onClose: () => {},
    });
  }
}

function selectUnit(unitId: string): void {
  selectedUnitId = unitId;
  const unit = gameState.units[unitId];
  if (!unit || unit.owner !== gameState.currentPlayer) return;

  // Calculate movement range
  const unitPositions: Record<string, string> = {};
  const unitOwners: Record<string, string> = {};
  for (const [id, u] of Object.entries(gameState.units)) {
    unitPositions[hexKey(u.position)] = id;
    unitOwners[id] = u.owner;
  }
  movementRange = getMovementRange(unit, gameState.map, unitPositions, unitOwners);

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

  const cp = gameState.currentPlayer;
  const city = foundCity(cp, unit.position, gameState.map);
  gameState.cities[city.id] = city;
  currentCiv().cities.push(city.id);

  // Mark tiles as owned
  for (const coord of city.ownedTiles) {
    const key = hexKey(coord);
    if (gameState.map.tiles[key]) {
      gameState.map.tiles[key].owner = cp;
    }
  }

  // Remove settler
  delete gameState.units[selectedUnitId];
  currentCiv().units = currentCiv().units.filter(id => id !== selectedUnitId);

  deselectUnit();
  bus.emit('city:founded', { city });
  showNotification(`${city.name} has been founded!`, 'success');
  SFX.foundCity();

  // Update visibility
  const playerUnits = currentCiv().units
    .map(id => gameState.units[id])
    .filter((u): u is Unit => u !== undefined);
  const cityPositions = currentCiv().cities
    .map(id => gameState.cities[id]?.position)
    .filter((p): p is HexCoord => p !== undefined);
  updateVisibility(currentCiv().visibility, playerUnits, gameState.map, cityPositions);

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

  if (unitAtHex) {
    if (unitAtHex[1].owner === gameState.currentPlayer) {
      selectUnit(unitAtHex[0]);
      return;
    }
    // Show enemy unit info (if no unit selected for attack)
    if (!selectedUnitId) {
      const enemyUnit = unitAtHex[1];
      const def = UNIT_DEFINITIONS[enemyUnit.type];
      const ownerName = enemyUnit.owner === 'barbarian' ? 'Barbarian' :
        (gameState.civilizations[enemyUnit.owner]?.name ?? enemyUnit.owner);
      const panel = document.getElementById('info-panel');
      if (panel) {
        panel.style.display = 'block';
        panel.innerHTML = `
          <div style="background:rgba(100,0,0,0.85);border-radius:12px;padding:12px 16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <strong>${ownerName} ${def.name}</strong> · HP: ${enemyUnit.health}/100 · Str: ${def.strength}
              </div>
              <span id="btn-deselect" style="cursor:pointer;font-size:18px;opacity:0.6;">✕</span>
            </div>
          </div>
        `;
        document.getElementById('btn-deselect')?.addEventListener('click', deselectUnit);
      }
      return;
    }
  }

  // If unit is selected and tapping a movement target
  if (selectedUnitId && movementRange.some(h => hexKey(h) === key)) {
    const unit = gameState.units[selectedUnitId];
    if (!unit) return;

    // Check for enemy unit at target (attack)
    if (unitAtHex && unitAtHex[1].owner !== gameState.currentPlayer) {
      const result = resolveCombat(unit, unitAtHex[1], gameState.map);
      bus.emit('combat:resolved', { result });

      if (!result.attackerSurvived) {
        delete gameState.units[selectedUnitId];
        currentCiv().units = currentCiv().units.filter(id => id !== selectedUnitId);
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
            currentCiv().gold += reward;
            showNotification(`Barbarian camp destroyed! +${reward} gold`, 'success');
            advisorSystem.resetMessage('treasurer_camp_reward');
            advisorSystem.check(gameState);
          }
        }

        // Check if a minor civ city was captured
        const cityAtTarget = Object.values(gameState.cities).find(c => hexKey(c.position) === key);
        if (cityAtTarget && cityAtTarget.owner.startsWith('mc-')) {
          const mcId = cityAtTarget.owner;
          conquestMinorCiv(gameState, mcId, gameState.currentPlayer, bus);
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

      // Check for tribal village at destination
      const villageAtDest = Object.values(gameState.tribalVillages).find(
        v => hexKey(v.position) === key,
      );
      if (villageAtDest) {
        let rngState = gameState.turn * 16807 + unit.id.charCodeAt(0);
        const villageRng = () => {
          rngState = (rngState * 48271) % 2147483647;
          return rngState / 2147483647;
        };
        const result = visitVillage(gameState, villageAtDest.id, unit, villageRng);
        bus.emit('village:visited', {
          civId: gameState.currentPlayer,
          position: villageAtDest.position,
          outcome: result.outcome,
          message: result.message,
        });
        showNotification(result.message, result.outcome === 'ambush' || result.outcome === 'illness' ? 'warning' : 'success');

        if (result.outcome === 'gold') advisorSystem.resetMessage('treasurer_village_gold');
        if (result.outcome === 'science') advisorSystem.resetMessage('scholar_village_science');
        if (result.outcome === 'free_tech') advisorSystem.resetMessage('scholar_village_tech');
        advisorSystem.check(gameState);
      }

      // Update visibility after move
      const playerUnits = currentCiv().units
        .map(id => gameState.units[id])
        .filter((u): u is Unit => u !== undefined);
      const cityPositions = currentCiv().cities
        .map(id => gameState.cities[id]?.position)
        .filter((p): p is HexCoord => p !== undefined);
      const revealed = updateVisibility(currentCiv().visibility, playerUnits, gameState.map, cityPositions);

      if (revealed.length > 0) {
        bus.emit('fog:revealed', { tiles: revealed });

        // Wonder discovery
        for (const revealedCoord of revealed) {
          const revTile = gameState.map.tiles[hexKey(revealedCoord)];
          if (revTile?.wonder) {
            const isFirst = processWonderDiscovery(gameState, gameState.currentPlayer, revTile.wonder);
            const wonderDef = getWonderDefinition(revTile.wonder);
            bus.emit('wonder:discovered', {
              civId: gameState.currentPlayer,
              wonderId: revTile.wonder,
              position: revealedCoord,
              isFirstDiscoverer: isFirst,
            });
            if (isFirst && wonderDef) {
              showNotification(
                `Discovered ${wonderDef.name}! +${wonderDef.discoveryBonus.amount} ${wonderDef.discoveryBonus.type}`,
                'success',
              );
            } else if (wonderDef) {
              showNotification(`Found ${wonderDef.name}!`, 'info');
            }
          }
        }
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
  const tile = gameState.map.tiles[hexKey(coord)];
  if (!tile) return;

  const vis = currentCiv()?.visibility;
  if (!vis) return;

  const visibility = getVisibility(vis, coord);

  if (visibility === 'unexplored') {
    showNotification('Unexplored territory');
    return;
  }

  if (visibility === 'fog') {
    showNotification(`${tile.terrain} (last seen)`);
    return;
  }

  const wonderInfo = tile.wonder ? ` · ⭐ ${getWonderDefinition(tile.wonder)?.name ?? tile.wonder}` : '';
  showNotification(`${tile.terrain} · ${tile.elevation}${tile.improvement !== 'none' ? ' · ' + tile.improvement : ''}${tile.resource ? ' · ' + tile.resource : ''}${wonderInfo}`);
}

async function endTurn(): Promise<void> {
  try {
    SFX.endTurn();
    deselectUnit();

    const hotSeat = gameState.hotSeat;

    if (hotSeat) {
      // --- Hot Seat Mode ---
      if (isRoundComplete(hotSeat, gameState.currentPlayer)) {
        // Last human player finished — process improvements, AI, and round end
        processImprovements();

        for (const ai of getAIPlayers(hotSeat)) {
          gameState = processAITurn(gameState, ai.slotId, bus);
        }

        gameState = processTurn(gameState, bus);

        if (gameState.settings.musicEnabled && gameState.era !== audio.getCurrentEra()) {
          audio.playProceduralMusic(gameState.era);
        }
      }

      // Advance to next human player
      const nextSlotId = getNextPlayer(hotSeat, gameState.currentPlayer);
      gameState.currentPlayer = nextSlotId;
      const nextPlayer = hotSeat.players.find(p => p.slotId === nextSlotId);

      await autoSave(gameState);

      // Show handoff screen
      showTurnHandoff(uiLayer, gameState, nextSlotId, nextPlayer?.name ?? 'Player', {
        onReady: () => {
          centerOnCurrentPlayer();
          renderLoop.setGameState(gameState);
          updateHUD();
        },
      });
    } else {
      // --- Solo Mode ---
      processImprovements();

      gameState = processAITurn(gameState, 'ai-1', bus);
      gameState = processTurn(gameState, bus);

      renderLoop.setGameState(gameState);
      updateHUD();

      showNotification(`Turn ${gameState.turn}`, 'info');
      advisorSystem.check(gameState);

      if (gameState.settings.musicEnabled && gameState.era !== audio.getCurrentEra()) {
        audio.playProceduralMusic(gameState.era);
      }

      await autoSave(gameState);
      bus.emit('game:saved', { turn: gameState.turn });
    }
  } catch (err) {
    console.error('endTurn error:', err);
    showNotification('Error processing turn!', 'warning');
  }
}

function processImprovements(): void {
  for (const tile of Object.values(gameState.map.tiles)) {
    if (tile.improvementTurnsLeft > 0) {
      tile.improvementTurnsLeft--;
      if (tile.improvementTurnsLeft === 0) {
        bus.emit('improvement:completed', { coord: tile.coord, type: tile.improvement });
        showNotification(`${tile.improvement} completed!`, 'success');
      }
    }
  }
}

function centerOnCurrentPlayer(): void {
  const units = Object.values(gameState.units).filter(u => u.owner === gameState.currentPlayer);
  if (units.length > 0) {
    renderLoop.camera.centerOn(units[0].position);
  }
}

// --- Event listeners ---
bus.on('tech:completed', ({ civId, techId }) => {
  if (civId === gameState.currentPlayer) {
    showNotification(`Research complete: ${techId}!`, 'success');
    SFX.research();
  }
});

bus.on('city:grew', ({ cityId, newPopulation }) => {
  const city = gameState.cities[cityId];
  if (city && city.owner === gameState.currentPlayer) {
    showNotification(`${city.name} grew to ${newPopulation} population!`, 'success');
  }
});

bus.on('city:building-complete', ({ cityId, buildingId }) => {
  const city = gameState.cities[cityId];
  if (city && city.owner === gameState.currentPlayer) {
    showNotification(`${city.name}: ${buildingId} completed!`, 'success');
  }
});

bus.on('diplomacy:war-declared', ({ attackerId, defenderId }) => {
  if (defenderId === gameState.currentPlayer) {
    const attacker = gameState.civilizations[attackerId];
    showNotification(`${attacker?.name ?? 'Unknown'} has declared war!`, 'warning');
  }
});

bus.on('diplomacy:peace-made', ({ civA, civB }) => {
  const cp = gameState.currentPlayer;
  const otherId = civA === cp ? civB : civA;
  if (civA === cp || civB === cp) {
    const other = gameState.civilizations[otherId];
    showNotification(`Peace with ${other?.name ?? 'Unknown'}!`, 'success');
  }
});

bus.on('advisor:message', ({ advisor, message, icon }) => {
  showNotification(`${icon} ${message}`, 'info');
});

bus.on('barbarian:spawned', ({ campId }) => {
  // Only notify if visible
  const camp = gameState.barbarianCamps[campId];
  if (camp) {
    const vis = currentCiv()?.visibility;
    if (vis && isVisible(vis, camp.position)) {
      showNotification('Barbarian raiders spotted!', 'warning');
    }
  }
});

bus.on('minor-civ:quest-issued', (data: any) => {
  if (data.majorCivId === gameState.currentPlayer) {
    const mc = gameState.minorCivs[data.minorCivId];
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc?.definitionId);
    showNotification(`${def?.name ?? 'City-state'} asks: ${data.quest.description}`, 'info');
  }
});

bus.on('minor-civ:quest-completed', (data: any) => {
  if (data.majorCivId === gameState.currentPlayer) {
    const mc = gameState.minorCivs[data.minorCivId];
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc?.definitionId);
    const rewards: string[] = [];
    if (data.reward.gold) rewards.push(`+${data.reward.gold} gold`);
    if (data.reward.science) rewards.push(`+${data.reward.science} science`);
    showNotification(`${def?.name ?? 'City-state'} is grateful! ${rewards.join(', ')}`, 'success');
  }
});

bus.on('minor-civ:evolved', (data: any) => {
  const mc = gameState.minorCivs[data.minorCivId];
  const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc?.definitionId);
  showNotification(`A barbarian tribe formed the city-state of ${def?.name ?? 'Unknown'}!`, 'info');
});

bus.on('minor-civ:destroyed', (data: any) => {
  const mc = gameState.minorCivs[data.minorCivId];
  const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc?.definitionId);
  showNotification(`${def?.name ?? 'City-state'} has fallen!`, 'warning');
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

  // Show save panel on start
  await createSavePanel(uiLayer, {
    onNewGame: () => {
      showGameModeSelection();
    },
    onContinue: async () => {
      const saved = await loadAutoSave();
      if (saved) {
        gameState = saved;
        migrateLegacySave();
        startGame();
        showNotification(`Welcome back! Turn ${gameState.turn}`, 'info');
      }
    },
    onLoadSlot: async (slotId) => {
      const saved = await loadGame(slotId);
      if (saved) {
        gameState = saved;
        migrateLegacySave();
        startGame();
        showNotification(`Game loaded! Turn ${gameState.turn}`, 'info');
      }
    },
  });
}

function migrateLegacySave(): void {
  for (const [civId, civ] of Object.entries(gameState.civilizations)) {
    if (!civ.civType) (civ as any).civType = 'generic';
    if (!civ.diplomacy) {
      const relationships: Record<string, number> = {};
      for (const otherId of Object.keys(gameState.civilizations)) {
        if (otherId !== civId) relationships[otherId] = 0;
      }
      (civ as any).diplomacy = {
        relationships,
        treaties: [],
        events: [],
        atWarWith: [],
      };
    }
  }
  if (!gameState.settings.advisorsEnabled) {
    gameState.settings.advisorsEnabled = { builder: true, explorer: true, chancellor: true, warchief: true, treasurer: true, scholar: true };
  }
  // Add new advisor types if missing (M3b migration)
  if (gameState.settings.advisorsEnabled && !('treasurer' in gameState.settings.advisorsEnabled)) {
    (gameState.settings.advisorsEnabled as any).treasurer = true;
    (gameState.settings.advisorsEnabled as any).scholar = true;
  }
  // Ensure pendingEvents exists for hot seat saves
  if (!gameState.pendingEvents) {
    gameState.pendingEvents = {};
  }
  // Add wonder/village state if missing
  if (!gameState.tribalVillages) (gameState as any).tribalVillages = {};
  if (!gameState.discoveredWonders) (gameState as any).discoveredWonders = {};
  if (!gameState.wonderDiscoverers) (gameState as any).wonderDiscoverers = {};
  // Add wonder field to tiles if missing
  for (const tile of Object.values(gameState.map.tiles)) {
    if (!('wonder' in tile)) (tile as any).wonder = null;
  }
  // M3c migration: minor civs and expanded tech tracks
  if (!gameState.minorCivs) (gameState as any).minorCivs = {};
  const allTracks = ['military', 'economy', 'science', 'civics', 'exploration',
    'agriculture', 'medicine', 'philosophy', 'arts', 'maritime',
    'metallurgy', 'construction', 'communication', 'espionage', 'spirituality'];
  for (const civ of Object.values(gameState.civilizations)) {
    for (const track of allTracks) {
      if (!(track in civ.techState.trackPriorities)) {
        (civ.techState.trackPriorities as any)[track] = 'medium';
      }
    }
  }
}

function showGameModeSelection(): void {
  const modePanel = document.createElement('div');
  modePanel.id = 'mode-select';
  modePanel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(10,10,30,0.98);z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;';
  modePanel.innerHTML = `
    <h1 style="font-size:22px;color:#e8c170;margin-bottom:24px;">New Game</h1>
    <div style="display:flex;gap:16px;">
      <div id="mode-solo" style="background:rgba(255,255,255,0.08);border:2px solid transparent;border-radius:12px;padding:24px;cursor:pointer;text-align:center;min-width:140px;transition:border-color 0.2s;">
        <div style="font-size:28px;margin-bottom:8px;">&#x1f3ae;</div>
        <div style="font-weight:bold;font-size:16px;color:#e8c170;">Solo</div>
        <div style="font-size:11px;opacity:0.6;margin-top:4px;">You vs AI</div>
      </div>
      <div id="mode-hotseat" style="background:rgba(255,255,255,0.08);border:2px solid transparent;border-radius:12px;padding:24px;cursor:pointer;text-align:center;min-width:140px;transition:border-color 0.2s;">
        <div style="font-size:28px;margin-bottom:8px;">&#x1f46a;</div>
        <div style="font-weight:bold;font-size:16px;color:#e8c170;">Hot Seat</div>
        <div style="font-size:11px;opacity:0.6;margin-top:4px;">Pass the device</div>
      </div>
    </div>
  `;

  uiLayer.appendChild(modePanel);

  document.getElementById('mode-solo')?.addEventListener('click', () => {
    modePanel.remove();
    createCivSelectPanel(uiLayer, {
      onSelect: (civId) => {
        gameState = createNewGame(civId);
        startGame();
        showNotification('Your tribe has settled near a river...', 'info');
      },
    });
  });

  document.getElementById('mode-hotseat')?.addEventListener('click', () => {
    modePanel.remove();
    showHotSeatSetup(uiLayer, {
      onComplete: (config) => {
        gameState = createHotSeatGame(config);
        startGame();
        showNotification(`Hot seat game started! ${config.players.filter(p => p.isHuman).length} players`, 'info');
      },
      onCancel: () => {
        showGameModeSelection();
      },
    });
  });
}

function startGame(): void {
  // Center camera on current player's starting position
  centerOnCurrentPlayer();

  renderLoop.setGameState(gameState);
  updateHUD();

  // Input (only set up once)
  if (!inputInitialized) {
    const callbacks: InputCallbacks = {
      onHexTap: handleHexTap,
      onHexLongPress: handleHexLongPress,
    };
    new TouchHandler(canvas, renderLoop.camera, callbacks);
    new MouseHandler(canvas, renderLoop.camera, callbacks);
    inputInitialized = true;
  }

  // Start procedural music
  if (gameState.settings.musicEnabled) {
    audio.playProceduralMusic(gameState.era);
  }

  // Initial advisor check
  advisorSystem.check(gameState);

  // Start render loop
  renderLoop.start();
}

init();
