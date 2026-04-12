import { EventBus } from '@/core/event-bus';
import { createNewGame, createHotSeatGame, createDefaultSettings } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';
import { processAITurn } from '@/ai/basic-ai';
import { RenderLoop, type HexHighlight } from '@/renderer/render-loop';
import { TouchHandler, type InputCallbacks } from '@/input/touch-handler';
import { MouseHandler } from '@/input/mouse-handler';
import { installKeyboardShortcuts } from '@/input/keyboard-shortcuts';
import { hexKey, wrapHexCoord } from '@/systems/hex-utils';
import { getMovementRange, moveUnit, getMovementCost, UNIT_DEFINITIONS, UNIT_DESCRIPTIONS, restUnit, canHeal, getUnmovedUnits } from '@/systems/unit-system';
import { foundCity } from '@/systems/city-system';
import { collectUsedCityNames } from '@/systems/city-name-system';
import { startResearch } from '@/systems/tech-system';
import { createTechPanel } from '@/ui/tech-panel';
import { createCityPanel } from '@/ui/city-panel';
import { createWonderPanel } from '@/ui/wonder-panel';
import { resolveCombat, getTerrainDefenseBonus } from '@/systems/combat-system';
import { canBuildImprovement, IMPROVEMENT_BUILD_TURNS } from '@/systems/improvement-system';
import { updateVisibility, isVisible, getVisibility, isForestConcealedUnit } from '@/systems/fog-of-war';
import { applyCampDestructionAtTarget } from '@/systems/barbarian-system';
import { autoSave, loadAutoSave, saveGame, loadGame, listSaves, loadSettings, saveSettings } from '@/storage/save-manager';
import { AudioManager } from '@/audio/audio-manager';
import { SFX } from '@/audio/sfx';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { createMarketplacePanel } from '@/ui/marketplace-panel';
import { createEspionagePanel } from '@/ui/espionage-panel';
import { createSavePanel } from '@/ui/save-panel';
import { AdvisorSystem } from '@/ui/advisor-system';
import { createCouncilPanel } from '@/ui/council-panel';
import { createGameShell } from '@/ui/game-shell';
import { createContextMenu } from '@/ui/context-menu';
import { renderSelectedUnitInfo } from '@/ui/selected-unit-info';
import { createUiInteractionState } from '@/ui/ui-interaction-state';
import { showCampaignSetup } from '@/ui/campaign-setup';
import { getPlayableCivDefinitions, resolveCivDefinition } from '@/systems/civ-registry';
import { applyDiplomaticAction, declareWar, makePeace, modifyRelationship } from '@/systems/diplomacy-system';
import { calculateCityYields } from '@/systems/resource-system';
import { visitVillage } from '@/systems/village-system';
import { processWonderDiscovery } from '@/systems/wonder-system';
import { getWonderDefinition } from '@/systems/wonder-definitions';
import { getNextPlayer, getAIPlayers, isRoundComplete } from '@/core/turn-cycling';
import { showTurnHandoff } from '@/ui/turn-handoff';
import { showHotSeatSetup } from '@/ui/hotseat-setup';
import { collectCouncilInterrupt, collectEvent } from '@/core/hotseat-events';
import { refreshKnownCivilizations, syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { getMinorCivPresentationForPlayer } from '@/systems/minor-civ-presentation';
import { getMinorCivNotification } from '@/ui/minor-civ-notifications';
import { registerMinorCivNotificationListeners } from '@/ui/minor-civ-notification-listeners';
import { conquestMinorCiv, applyDiplomaticReaction } from '@/systems/minor-civ-system';
import { createIconLegendOverlay, toggleIconLegend } from '@/ui/icon-legend';
import { transferCapturedCityOwnership } from '@/systems/city-capture-system';
import {
  initializeLegendaryWonderProjectsForCity,
  startLegendaryWonderBuild,
} from '@/systems/legendary-wonder-system';
import { getLegendaryWonderNotification } from '@/ui/legendary-wonder-notifications';
import {
  assignSpy,
  assignSpyDefensive,
  canRecruitSpy,
  getAvailableMissions,
  missionRequiresPlacedSpy,
  recallSpy,
  recruitSpy,
  startMission,
  verifyAgent,
} from '@/systems/espionage-system';
import { getCouncilInterrupt } from '@/systems/council-system';
import { applyAutoExploreOrder } from '@/systems/auto-explore-system';
import { executeUnitMove } from '@/systems/unit-movement-system';
import type { GameState, HexCoord, Unit, DiplomaticAction, NotificationEntry } from '@/core/types';

// --- App State ---
let gameState: GameState;
let selectedUnitId: string | null = null;
let movementRange: HexCoord[] = [];
let currentCityIndex = 0;
let inputInitialized = false;
let councilPanelOpen = false;
let persistedSettings: GameState['settings'] | undefined;

function mergePersistedSettings(loadedSettings?: GameState['settings']): GameState['settings'] {
  const baseSettings = loadedSettings ?? persistedSettings ?? createDefaultSettings('small');
  const customCivilizations = loadedSettings?.customCivilizations ?? persistedSettings?.customCivilizations ?? [];

  return {
    ...createDefaultSettings('small', baseSettings),
    ...baseSettings,
    customCivilizations: [...customCivilizations],
  };
}

async function refreshPersistedSettings(): Promise<GameState['settings']> {
  const loadedSettings = (await loadSettings()) ?? persistedSettings;
  persistedSettings = mergePersistedSettings(loadedSettings);
  return persistedSettings;
}

function currentCivDef() {
  return resolveCivDefinition(gameState, currentCiv().civType ?? '');
}
const bus = new EventBus();
const audio = new AudioManager();
const advisorSystem = new AdvisorSystem(bus);
const uiInteractions = createUiInteractionState();

// --- Canvas Setup ---
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiLayer = document.getElementById('ui-layer') as HTMLDivElement;
const renderLoop = new RenderLoop(canvas);

// --- Resize ---
window.addEventListener('resize', () => renderLoop.resizeCanvas());

function createUI(): void {
  createGameShell(uiLayer, {
    onOpenCouncil: () => togglePanel('council'),
    onOpenTech: () => togglePanel('tech'),
    onOpenCity: () => togglePanel('city'),
    onOpenEspionage: () => togglePanel('espionage'),
    onOpenDiplomacy: () => togglePanel('diplomacy'),
    onOpenMarketplace: () => togglePanel('marketplace'),
    onEndTurn: () => endTurn(),
    onNextUnit: () => selectNextUnit(),
    onOpenNotificationLog: () => toggleNotificationLog(),
    onToggleIconLegend: () => toggleIconLegend(),
    iconLegendOverlay: createIconLegendOverlay(),
  });
}

// --- Game Logic ---
function currentCiv() {
  return gameState.civilizations[gameState.currentPlayer];
}

function updateHUD(): void {
  const hud = document.getElementById('hud');
  if (!hud) return;
  const civ = currentCiv();

  // Sum yields across all cities
  let totalFood = 0, totalProd = 0, totalGold = 0, totalScience = 0;
  for (const cityId of civ.cities) {
    const city = gameState.cities[cityId];
    if (!city) continue;
    const y = calculateCityYields(city, gameState.map);
    totalFood += y.food;
    totalProd += y.production;
    totalGold += y.gold;
    totalScience += y.science;
  }

  const techName = civ.techState.currentResearch ?? 'None';
  hud.textContent = '';

  const yieldsRow = document.createElement('div');
  yieldsRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';

  const yieldSpan = document.createElement('span');
  yieldSpan.textContent = `🌾 ${totalFood}`;
  yieldsRow.appendChild(yieldSpan);

  const prodSpan = document.createElement('span');
  prodSpan.textContent = `⚒️ ${totalProd}`;
  yieldsRow.appendChild(prodSpan);

  const goldSpan = document.createElement('span');
  goldSpan.textContent = `💰 ${civ.gold} (+${totalGold})`;
  yieldsRow.appendChild(goldSpan);

  const sciSpan = document.createElement('span');
  sciSpan.textContent = `🔬 ${techName !== 'None' ? techName : 'None'} (+${totalScience})`;
  yieldsRow.appendChild(sciSpan);

  const infoRow = document.createElement('div');
  if (gameState.hotSeat && civ.name) {
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${civ.name} · `;
    infoRow.appendChild(nameSpan);
  }
  const turnSpan = document.createElement('span');
  turnSpan.textContent = `Turn ${gameState.turn} · Era ${gameState.era}`;
  infoRow.appendChild(turnSpan);

  hud.appendChild(yieldsRow);
  hud.appendChild(infoRow);

  // Show "Next Unit" button when there are unmoved units
  const nextUnitBtn = document.getElementById('btn-next-unit');
  if (nextUnitBtn) {
    const unmovedCount = getUnmovedUnits(gameState.units, gameState.currentPlayer).length;
    nextUnitBtn.style.display = unmovedCount > 0 ? 'block' : 'none';
    if (unmovedCount > 0) {
      nextUnitBtn.textContent = `⏩ ${unmovedCount}`;
    }
  }
}

// --- Notification queue ---
const notificationQueue: Array<{ message: string; type: 'info' | 'success' | 'warning' }> = [];
const notificationLog: NotificationEntry[] = [];
let isShowingNotification = false;
let currentDismissTimer: ReturnType<typeof setTimeout> | null = null;

function showNotification(message: string, type: 'info' | 'success' | 'warning' = 'info'): void {
  notificationQueue.push({ message, type });
  notificationLog.push({ message, type, turn: gameState?.turn ?? 0 });
  if (notificationLog.length > 50) notificationLog.shift();
  if (!isShowingNotification) displayNextNotification();
}

function displayNextNotification(): void {
  const area = document.getElementById('notifications');
  if (!area) return;

  const next = notificationQueue.shift();
  if (!next) {
    isShowingNotification = false;
    return;
  }

  isShowingNotification = true;
  const colors = { info: '#e8c170', success: '#6b9b4b', warning: '#d94a4a' };
  const notif = document.createElement('div');
  notif.style.cssText = `background:${colors[next.type]}ee;color:#1a1a2e;padding:10px 14px;border-radius:10px;font-size:12px;cursor:pointer;transition:opacity 0.3s;max-width:90%;`;
  notif.textContent = next.message;

  if (notificationQueue.length > 0) {
    const badge = document.createElement('span');
    badge.style.cssText = 'margin-left:8px;font-size:10px;opacity:0.7;';
    badge.textContent = `(${notificationQueue.length} more)`;
    notif.appendChild(badge);
  }

  const dismiss = () => {
    if (currentDismissTimer) clearTimeout(currentDismissTimer);
    currentDismissTimer = null;
    notif.style.opacity = '0';
    setTimeout(() => {
      notif.remove();
      displayNextNotification();
    }, 200);
  };

  notif.addEventListener('click', dismiss);
  area.innerHTML = '';
  area.appendChild(notif);

  currentDismissTimer = setTimeout(() => {
    if (notif.parentNode) dismiss();
  }, 6000);

  SFX.notification();
}

function toggleNotificationLog(): void {
  const existing = document.getElementById('notification-log');
  if (existing) { existing.remove(); return; }

  const ul = document.getElementById('ui-layer');
  if (!ul) return;

  const panel = document.createElement('div');
  panel.id = 'notification-log';
  panel.style.cssText = 'position:absolute;top:70px;right:12px;width:280px;max-height:300px;overflow-y:auto;background:rgba(10,10,30,0.95);border:1px solid rgba(255,255,255,0.15);border-radius:10px;z-index:25;padding:12px;';

  const colors = { info: '#e8c170', success: '#6b9b4b', warning: '#d94a4a' };

  const header = document.createElement('div');
  header.style.cssText = 'font-size:13px;color:#e8c170;margin-bottom:8px;display:flex;justify-content:space-between;';
  const headerTitle = document.createElement('span');
  headerTitle.textContent = 'Message Log';
  const closeBtn = document.createElement('span');
  closeBtn.id = 'close-log';
  closeBtn.style.cssText = 'cursor:pointer;opacity:0.6;';
  closeBtn.textContent = '✕';
  header.appendChild(headerTitle);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  if (notificationLog.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:11px;opacity:0.5;text-align:center;';
    empty.textContent = 'No messages yet';
    panel.appendChild(empty);
  } else {
    for (let i = notificationLog.length - 1; i >= 0; i--) {
      const entry = notificationLog[i];
      const row = document.createElement('div');
      row.style.cssText = 'font-size:11px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);';
      const turnSpan = document.createElement('span');
      turnSpan.style.cssText = `color:${colors[entry.type]};opacity:0.7;margin-right:4px;`;
      turnSpan.textContent = `T${entry.turn}`;
      row.appendChild(turnSpan);
      row.appendChild(document.createTextNode(entry.message));
      panel.appendChild(row);
    }
  }

  ul.appendChild(panel);
  closeBtn.addEventListener('click', () => panel.remove());

  setTimeout(() => {
    const handler = (e: Event) => {
      if (!panel.contains(e.target as Node)) {
        panel.remove();
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }, 100);
}

function handleDiplomaticAction(targetCivId: string, action: DiplomaticAction): void {
  const cp = gameState.currentPlayer;
  gameState = applyDiplomaticAction(gameState, cp, targetCivId, action, bus);
  showNotification(`Diplomatic action: ${action.replace(/_/g, ' ')}`, 'info');
}

function handleGiftGold(mcId: string): void {
  const mc = gameState.minorCivs[mcId];
  if (!mc) return;
  const quest = mc.activeQuests[gameState.currentPlayer];
  const amount = quest?.target.type === 'gift_gold' ? (quest.target as { amount: number }).amount : 25;

  if (currentCiv().gold < amount) {
    showNotification('Not enough gold!', 'warning');
    return;
  }

  currentCiv().gold -= amount;
  mc.diplomacy = modifyRelationship(mc.diplomacy, gameState.currentPlayer, 10);

  if (quest?.target.type === 'gift_gold') {
    quest.progress += amount;
  }

  showNotification(`Gifted ${amount} gold`, 'info');
  renderLoop.setGameState(gameState);
  updateHUD();
}

function handleMinorCivWarPeace(mcId: string, currentlyAtWar: boolean): void {
  const mc = gameState.minorCivs[mcId];
  if (!mc) return;

  const playerCiv = currentCiv();
  if (currentlyAtWar) {
    mc.diplomacy = makePeace(mc.diplomacy, gameState.currentPlayer, gameState.turn);
    playerCiv.diplomacy = makePeace(playerCiv.diplomacy, mcId, gameState.turn);
    showNotification('Peace with city-state', 'success');
  } else {
    mc.diplomacy = declareWar(mc.diplomacy, gameState.currentPlayer, gameState.turn);
    playerCiv.diplomacy = declareWar(playerCiv.diplomacy, mcId, gameState.turn);
    showNotification('War declared on city-state!', 'warning');
  }
  renderLoop.setGameState(gameState);
  updateHUD();
}

function togglePanel(panel: string): void {
  // Remove any existing panel
  document.getElementById('tech-panel')?.remove();
  document.getElementById('city-panel')?.remove();
  document.getElementById('espionage-panel')?.remove();
  document.getElementById('diplomacy-panel')?.remove();
  document.getElementById('marketplace-panel')?.remove();
  document.getElementById('council-panel')?.remove();
  councilPanelOpen = false;

  if (panel === 'council') {
    createCouncilPanel(uiLayer, gameState, {
      onClose: () => {
        document.getElementById('council-panel')?.remove();
        councilPanelOpen = false;
      },
      onTalkLevelChange: (level) => {
        gameState.settings.councilTalkLevel = level;
        void saveSettings(gameState.settings);
      },
    });
    councilPanelOpen = true;
  } else if (panel === 'tech') {
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
    const playerCities = currentCiv().cities;
    if (playerCities.length === 0) {
      showNotification('No cities founded yet!', 'info');
      return;
    }
    if (currentCityIndex >= playerCities.length) currentCityIndex = 0;
    const cityId = playerCities[currentCityIndex];
    const city = gameState.cities[cityId];
    if (!city) return;
    currentCityIndex = (currentCityIndex + 1) % playerCities.length;
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
      onOpenWonderPanel: (selectedCityId) => {
        gameState = initializeLegendaryWonderProjectsForCity(gameState, gameState.currentPlayer, selectedCityId);
        createWonderPanel(uiLayer, gameState, selectedCityId, {
          onStartBuild: (buildCityId, wonderId) => {
            gameState = startLegendaryWonderBuild(gameState, gameState.currentPlayer, buildCityId, wonderId, bus);
            const targetCity = gameState.cities[buildCityId];
            if (targetCity) {
              renderLoop.setGameState(gameState);
              showNotification(`${targetCity.name}: preparing ${wonderId}`, 'info');
            }
          },
          onClose: () => {},
        });
      },
      onClose: () => {},
    });
  } else if (panel === 'espionage') {
    const chooseForeignCityTarget = (): { civId: string; cityId: string; position: HexCoord } | null => {
      const choices = Object.values(gameState.cities)
        .filter(city => city.owner !== gameState.currentPlayer)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (choices.length === 0) {
        showNotification('No foreign cities available for espionage.', 'info');
        return null;
      }
      const selection = window.prompt(
        `Choose target city by id:\n${choices.map(city => `${city.id} (${city.owner})`).join('\n')}`,
        choices[0].id,
      );
      if (!selection) return null;
      const city = gameState.cities[selection];
      if (!city || city.owner === gameState.currentPlayer) {
        showNotification('Invalid espionage target.', 'warning');
        return null;
      }
      return { civId: city.owner, cityId: city.id, position: city.position };
    };

    const chooseFriendlyCityTarget = (): { cityId: string; position: HexCoord } | null => {
      const choices = currentCiv().cities
        .map(cityId => gameState.cities[cityId])
        .filter((city): city is NonNullable<typeof gameState.cities[string]> => city !== undefined);
      if (choices.length === 0) {
        showNotification('No cities available for defensive espionage.', 'info');
        return null;
      }
      const selection = window.prompt(
        `Choose friendly city by id:\n${choices.map(city => city.id).join('\n')}`,
        choices[0].id,
      );
      if (!selection) return null;
      const city = gameState.cities[selection];
      if (!city || city.owner !== gameState.currentPlayer) {
        showNotification('Invalid defensive target.', 'warning');
        return null;
      }
      return { cityId: city.id, position: city.position };
    };

    const chooseMission = (spyId: string): string | null => {
      const spy = gameState.espionage?.[gameState.currentPlayer]?.spies[spyId];
      const completedTechs = currentCiv().techState.completed ?? [];
      const missions = getAvailableMissions(completedTechs)
        .filter(mission => !missionRequiresPlacedSpy(mission) || Boolean(spy?.targetCivId));
      if (missions.length === 0) {
        showNotification('No missions available for this spy.', 'info');
        return null;
      }
      return window.prompt(`Choose mission:\n${missions.join('\n')}`, missions[0]);
    };

    uiLayer.appendChild(createEspionagePanel(gameState, {
      onClose: () => document.getElementById('espionage-panel')?.remove(),
      onRecruit: () => {
        const civEsp = gameState.espionage?.[gameState.currentPlayer];
        if (!civEsp || !canRecruitSpy(civEsp)) {
          showNotification('No spy recruitment slots available.', 'warning');
          return;
        }
        const recruited = recruitSpy(civEsp, gameState.currentPlayer, `player-recruit-${gameState.turn}`);
        gameState.espionage![gameState.currentPlayer] = recruited.state;
        renderLoop.setGameState(gameState);
        updateHUD();
        togglePanel('espionage');
        showNotification(`${recruited.spy.name} recruited.`, 'success');
      },
      onAssign: (spyId) => {
        const target = chooseForeignCityTarget();
        if (!target) return;
        gameState.espionage![gameState.currentPlayer] = assignSpy(
          gameState.espionage![gameState.currentPlayer],
          spyId,
          target.civId,
          target.cityId,
          target.position,
        );
        renderLoop.setGameState(gameState);
        togglePanel('espionage');
        showNotification(`Spy assigned to ${target.cityId}.`, 'info');
      },
      onAssignDefensive: (spyId) => {
        const target = chooseFriendlyCityTarget();
        if (!target) return;
        gameState.espionage![gameState.currentPlayer] = assignSpyDefensive(
          gameState.espionage![gameState.currentPlayer],
          spyId,
          target.cityId,
          target.position,
        );
        renderLoop.setGameState(gameState);
        togglePanel('espionage');
        showNotification(`Spy defending ${target.cityId}.`, 'info');
      },
      onStartMission: (spyId) => {
        const spy = gameState.espionage?.[gameState.currentPlayer]?.spies[spyId];
        if (!spy) return;
        const mission = chooseMission(spyId);
        if (!mission) return;
        let targetCivId = spy.targetCivId ?? undefined;
        let targetCityId = spy.targetCityId ?? undefined;
        if (!missionRequiresPlacedSpy(mission as any)) {
          const target = chooseForeignCityTarget();
          if (!target) return;
          targetCivId = target.civId;
          targetCityId = target.cityId;
        }
        gameState.espionage![gameState.currentPlayer] = startMission(
          gameState.espionage![gameState.currentPlayer],
          spyId,
          mission as any,
          currentCivDef()?.bonusEffect,
          targetCivId,
          targetCityId,
        );
        renderLoop.setGameState(gameState);
        togglePanel('espionage');
        showNotification(`Mission ${mission} started.`, 'info');
      },
      onRecall: (spyId) => {
        gameState.espionage![gameState.currentPlayer] = recallSpy(
          gameState.espionage![gameState.currentPlayer],
          spyId,
        );
        renderLoop.setGameState(gameState);
        togglePanel('espionage');
        showNotification('Spy recalled.', 'info');
      },
      onVerifyAgent: (spyId) => {
        gameState.espionage![gameState.currentPlayer] = verifyAgent(
          gameState.espionage![gameState.currentPlayer],
          spyId,
        );
        renderLoop.setGameState(gameState);
        togglePanel('espionage');
        showNotification('Agent verified and cleared.', 'success');
      },
    }));
  } else if (panel === 'diplomacy') {
    createDiplomacyPanel(uiLayer, gameState, {
      onAction: handleDiplomaticAction,
      onGiftGold: handleGiftGold,
      onMinorCivWarPeace: handleMinorCivWarPeace,
      onClose: () => {},
    });
  } else if (panel === 'marketplace') {
    createMarketplacePanel(uiLayer, gameState, {
      onClose: () => {},
    });
  }
}

function maybeShowCouncilInterrupt(): void {
  if (!gameState) {
    return;
  }
  const interrupt = getCouncilInterrupt(gameState, gameState.currentPlayer, gameState.settings.councilTalkLevel);
  if (!interrupt) {
    return;
  }
  if (gameState.hotSeat && gameState.pendingEvents && interrupt.civId !== gameState.currentPlayer) {
    collectCouncilInterrupt(gameState.pendingEvents, interrupt.civId, interrupt, gameState.turn);
    return;
  }
  showNotification(interrupt.summary, 'info');
}

function getPersistedSettingsOverrides(): Partial<GameState['settings']> {
  if (!persistedSettings) {
    return {};
  }
  return {
    soundEnabled: persistedSettings.soundEnabled,
    musicEnabled: persistedSettings.musicEnabled,
    musicVolume: persistedSettings.musicVolume,
    sfxVolume: persistedSettings.sfxVolume,
    tutorialEnabled: persistedSettings.tutorialEnabled,
    advisorsEnabled: persistedSettings.advisorsEnabled,
    councilTalkLevel: persistedSettings.councilTalkLevel,
  };
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

  // Classify hexes as move or attack and send to renderer
  const highlights: HexHighlight[] = movementRange.map(coord => {
    const k = hexKey(coord);
    const occupantId = unitPositions[k];
    if (occupantId && unitOwners[occupantId] !== gameState.currentPlayer) {
      return { coord, type: 'attack' as const };
    }
    return { coord, type: 'move' as const };
  });
  renderLoop.setHighlights(highlights);

  // Show unit info panel
  const panel = document.getElementById('info-panel');
  if (panel) {
    renderSelectedUnitInfo(panel, gameState, unitId, {
      onClose: () => deselectUnit(),
      onFoundCity: () => foundCityAction(),
      onBuildFarm: () => buildImprovementAction('farm'),
      onBuildMine: () => buildImprovementAction('mine'),
      onRest: () => restAction(),
      onCancelAutoExplore: () => cancelAutoExplore(unitId),
    });
  }

  SFX.select();
}

function deselectUnit(): void {
  selectedUnitId = null;
  movementRange = [];
  renderLoop.clearHighlights();
  const panel = document.getElementById('info-panel');
  if (panel) {
    panel.style.display = 'none';
    panel.replaceChildren();
  }
}

function startAutoExplore(unitId: string): void {
  const unit = gameState.units[unitId];
  if (!unit || unit.owner !== gameState.currentPlayer) return;

  gameState.units[unitId] = {
    ...unit,
    automation: {
      mode: 'auto-explore',
      startedTurn: gameState.turn,
      lastTargets: unit.automation?.lastTargets ?? [],
    },
  };

  if (gameState.units[unitId].movementPointsLeft > 0 && !gameState.units[unitId].hasActed) {
    applyAutoExploreOrder(gameState, unitId, { bus });
  }

  renderLoop.setGameState(gameState);
  updateHUD();
  selectUnit(unitId);
}

function cancelAutoExplore(unitId: string): void {
  const unit = gameState.units[unitId];
  if (!unit?.automation) return;
  delete gameState.units[unitId].automation;
  renderLoop.setGameState(gameState);
  updateHUD();
  if (selectedUnitId === unitId) {
    selectUnit(unitId);
  }
}

function openUnitContextMenu(unitId: string): void {
  const panel = document.getElementById('info-panel');
  if (!panel) return;

  createContextMenu(panel, gameState, { unitId }, {
    onStartAutoExplore: id => startAutoExplore(id),
    onCancelAutoExplore: id => cancelAutoExplore(id),
  }, uiInteractions);
}

function selectNextUnit(): void {
  const unmoved = getUnmovedUnits(gameState.units, gameState.currentPlayer);
  if (unmoved.length === 0) {
    // All units have moved — silently deselect
    deselectUnit();
    return;
  }
  // Skip current unit if it's in the list
  const filtered = unmoved.filter(u => u.id !== selectedUnitId);
  const next = filtered.length > 0 ? filtered[0] : unmoved[0];
  selectUnit(next.id);
  renderLoop.camera.centerOn(next.position);
}

function foundCityAction(): void {
  if (!selectedUnitId) return;
  const unit = gameState.units[selectedUnitId];
  if (!unit || unit.type !== 'settler') return;

  const cp = gameState.currentPlayer;
  const civDef = currentCivDef();
  const city = foundCity(cp, unit.position, gameState.map, {
    civType: currentCiv().civType,
    namingPool: civDef?.cityNames,
    civName: civDef?.name ?? currentCiv().name,
    usedNames: collectUsedCityNames(gameState),
  });
  gameState.cities[city.id] = city;
  currentCiv().cities.push(city.id);
  gameState = initializeLegendaryWonderProjectsForCity(gameState, cp, city.id);

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
  syncCivilizationContactsFromVisibility(gameState, gameState.currentPlayer);

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

function executeAttack(attackerId: string, defenderId: string, defender: Unit, targetKey: string): void {
  const attacker = gameState.units[attackerId];
  if (!attacker) return;

  const defOwnerCiv = defender.owner;
  const isBarbarian = defOwnerCiv === 'barbarian' || defOwnerCiv.startsWith('mc-');
  if (!isBarbarian && gameState.civilizations[defOwnerCiv]) {
    const cp = gameState.currentPlayer;
    const alreadyAtWar = currentCiv().diplomacy?.atWarWith.includes(defOwnerCiv) ?? false;
    if (!alreadyAtWar) {
      currentCiv().diplomacy = declareWar(currentCiv().diplomacy, defOwnerCiv, gameState.turn);
      gameState.civilizations[defOwnerCiv].diplomacy = declareWar(
        gameState.civilizations[defOwnerCiv].diplomacy, cp, gameState.turn,
      );
      bus.emit('diplomacy:war-declared', { attackerId: cp, defenderId: defOwnerCiv });
    }
  }

  const seed = gameState.turn * 16807 + attacker.id.charCodeAt(0) + defender.id.charCodeAt(0);
  const attackerBonus = currentCivDef()?.bonusEffect;
  const defenderBonus = resolveCivDefinition(gameState, gameState.civilizations[defender.owner]?.civType ?? '')?.bonusEffect;
  const result = resolveCombat(
    attacker,
    gameState.units[defenderId] ?? defender,
    gameState.map,
    seed,
    { attackerBonus, defenderBonus },
    gameState.era,
  );
  bus.emit('combat:resolved', { result });

  if (!result.attackerSurvived) {
    delete gameState.units[attackerId];
    currentCiv().units = currentCiv().units.filter(id => id !== attackerId);
    showNotification('Our unit was destroyed!', 'warning');
  } else {
    gameState.units[attackerId].health -= result.attackerDamage;
    gameState.units[attackerId].movementPointsLeft = 0;
    gameState.units[attackerId].hasMoved = true;
  }

  if (!result.defenderSurvived) {
    const defOwner = defender.owner;
    delete gameState.units[defenderId];
    if (gameState.civilizations[defOwner]) {
      gameState.civilizations[defOwner].units = gameState.civilizations[defOwner].units.filter(id => id !== defenderId);
    }
    showNotification('Enemy unit destroyed!', 'success');

    const destroyedCamp = applyCampDestructionAtTarget(gameState, gameState.currentPlayer, defender.position, gameState.turn);
    if (destroyedCamp.campId) {
      gameState = destroyedCamp.state;
      showNotification(`Barbarian camp destroyed! +${destroyedCamp.reward} gold`, 'success');
      advisorSystem.resetMessage('treasurer_camp_reward');
      advisorSystem.check(gameState);
      for (const mcId of Object.keys(gameState.minorCivs)) {
        applyDiplomaticReaction(gameState, 'camp_destroyed_nearby', gameState.currentPlayer, mcId);
      }
    }

    const cityAtTarget = Object.values(gameState.cities).find(c => hexKey(c.position) === targetKey);
    if (cityAtTarget && cityAtTarget.owner.startsWith('mc-')) {
      conquestMinorCiv(gameState, cityAtTarget.owner, gameState.currentPlayer, bus);
    }
    if (cityAtTarget && !cityAtTarget.owner.startsWith('mc-') && cityAtTarget.owner !== gameState.currentPlayer) {
      const previousOwner = cityAtTarget.owner;
      gameState = transferCapturedCityOwnership(gameState, cityAtTarget.id, gameState.currentPlayer, gameState.turn);
      const capturingCiv = currentCiv();
      if (capturingCiv && !capturingCiv.cities.includes(cityAtTarget.id)) {
        capturingCiv.cities.push(cityAtTarget.id);
      }
      if (capturingCiv && attackerBonus?.type === 'naval_raiding') {
        capturingCiv.gold += 30;
        showNotification('Viking raid spoils! +30 gold', 'success');
      }
      showNotification(`We have captured ${cityAtTarget.name}!`, 'success');
      bus.emit('city:captured', { cityId: cityAtTarget.id, newOwner: gameState.currentPlayer, previousOwner });
    }
  } else {
    if (gameState.units[defenderId]) {
      gameState.units[defenderId].health -= result.defenderDamage;
    }
  }

  SFX.combat();
  renderLoop.setGameState(gameState);
  updateHUD();
  selectNextUnit();
}

function restAction(): void {
  if (!selectedUnitId) return;
  const unit = gameState.units[selectedUnitId];
  if (!unit || !canHeal(unit)) return;

  gameState.units[selectedUnitId] = restUnit(unit);
  showNotification(`${UNIT_DEFINITIONS[unit.type].name} is resting and will heal +15 HP next turn`, 'info');
  deselectUnit();
  renderLoop.setGameState(gameState);
}

function handleHexTap(rawCoord: HexCoord): void {
  const coord = gameState.map.wrapsHorizontally
    ? wrapHexCoord(rawCoord, gameState.map.width)
    : rawCoord;
  const key = hexKey(coord);

  // Check if tapping a unit
  const unitAtHex = Object.entries(gameState.units).find(
    ([_, u]) => hexKey(u.position) === key && (
      u.owner === gameState.currentPlayer || !isForestConcealedUnit(gameState, gameState.currentPlayer, u)
    )
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
      const desc = UNIT_DESCRIPTIONS[enemyUnit.type] ?? '';
      const isBarbarian = enemyUnit.owner === 'barbarian';
      const isMinorCiv = enemyUnit.owner.startsWith('mc-');
      let ownerName: string;
      let ownerColor: string;

      if (isBarbarian) {
        ownerName = 'Barbarian';
        ownerColor = '#8b4513';
      } else if (isMinorCiv) {
        const presentation = getMinorCivPresentationForPlayer(gameState, gameState.currentPlayer, enemyUnit.owner, 'City-State');
        ownerName = presentation.name;
        ownerColor = presentation.color;
      } else {
        const civ = gameState.civilizations[enemyUnit.owner];
        ownerName = civ?.name ?? enemyUnit.owner;
        ownerColor = civ?.color ?? '#888';
      }

      const atWar = !isBarbarian && !isMinorCiv && (currentCiv()?.diplomacy?.atWarWith.includes(enemyUnit.owner) ?? false);
      const relationshipTag = isBarbarian ? 'Hostile' : atWar ? 'At War' : 'Neutral';
      const relColor = isBarbarian || atWar ? '#d94a4a' : '#e8c170';

      const panel = document.getElementById('info-panel');
      if (panel) {
        panel.style.display = 'block';
        panel.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `background:rgba(40,20,20,0.92);border-radius:12px;padding:12px 16px;border-left:4px solid ${ownerColor};`;

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

        const info = document.createElement('div');
        const ownerLine = document.createElement('div');
        ownerLine.style.cssText = `font-size:10px;color:${ownerColor};`;
        const ownerSpan = document.createTextNode(ownerName + ' ');
        const relSpan = document.createElement('span');
        relSpan.style.cssText = `color:${relColor};font-size:9px;`;
        relSpan.textContent = `(${relationshipTag})`;
        ownerLine.appendChild(ownerSpan);
        ownerLine.appendChild(relSpan);

        const unitLine = document.createElement('div');
        const boldName = document.createElement('strong');
        boldName.textContent = def.name;
        unitLine.appendChild(boldName);
        unitLine.appendChild(document.createTextNode(` · HP: ${enemyUnit.health}/100 · Str: ${def.strength}`));

        info.appendChild(ownerLine);
        info.appendChild(unitLine);

        const closeBtn = document.createElement('span');
        closeBtn.id = 'btn-deselect';
        closeBtn.style.cssText = 'cursor:pointer;font-size:18px;opacity:0.6;';
        closeBtn.textContent = '✕';

        header.appendChild(info);
        header.appendChild(closeBtn);
        wrapper.appendChild(header);

        const descDiv = document.createElement('div');
        descDiv.style.cssText = 'font-size:10px;opacity:0.6;margin-top:4px;';
        descDiv.textContent = desc;
        wrapper.appendChild(descDiv);

        panel.appendChild(wrapper);
        closeBtn.addEventListener('click', deselectUnit);
      }
      return;
    }
  }

  // If unit is selected and tapping a movement target
  if (selectedUnitId && movementRange.some(h => hexKey(h) === key)) {
    const unit = gameState.units[selectedUnitId];
    if (!unit) return;

    // Check for enemy unit at target — show combat preview
    if (unitAtHex && unitAtHex[1].owner !== gameState.currentPlayer) {
      const defender = unitAtHex[1];
      const atkDef = UNIT_DEFINITIONS[unit.type];
      const defDef = UNIT_DEFINITIONS[defender.type];
      const atkStr = Math.round(atkDef.strength * (unit.health / 100));
      const defTile = gameState.map.tiles[hexKey(defender.position)];
      const terrainBonus = defTile ? getTerrainDefenseBonus(defTile.terrain) : 0;
      const defStr = Math.round(defDef.strength * (defender.health / 100) * (1 + terrainBonus));

      const isBarbarian = defender.owner === 'barbarian';
      const isMinorCiv = defender.owner.startsWith('mc-');
      let ownerName: string;
      if (isBarbarian) {
        ownerName = 'Barbarian';
      } else if (isMinorCiv) {
        const presentation = getMinorCivPresentationForPlayer(gameState, gameState.currentPlayer, defender.owner, 'City-State');
        ownerName = presentation.name;
      } else {
        ownerName = gameState.civilizations[defender.owner]?.name ?? defender.owner;
      }

      const odds = atkStr > defStr ? 'Favorable' : atkStr === defStr ? 'Even' : 'Risky';
      const oddsColor = atkStr > defStr ? '#6b9b4b' : atkStr === defStr ? '#e8c170' : '#d94a4a';

      const panel = document.getElementById('info-panel');
      if (panel) {
        panel.style.display = 'block';
        const previewDiv = document.createElement('div');
        previewDiv.style.cssText = 'background:rgba(100,0,0,0.9);border-radius:12px;padding:12px 16px;';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:13px;color:#e8c170;margin-bottom:6px;';
        title.textContent = 'Combat Preview';
        previewDiv.appendChild(title);

        const stats = document.createElement('div');
        stats.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px;';
        const atkSpan = document.createElement('span');
        atkSpan.textContent = `${atkDef.name} (${atkStr})`;
        const oddsSpan = document.createElement('span');
        oddsSpan.style.cssText = `color:${oddsColor};font-weight:bold;`;
        oddsSpan.textContent = odds;
        const defSpan = document.createElement('span');
        defSpan.textContent = `${defDef.name} (${defStr})`;
        stats.appendChild(atkSpan);
        stats.appendChild(oddsSpan);
        stats.appendChild(defSpan);
        previewDiv.appendChild(stats);

        const info = document.createElement('div');
        info.style.cssText = 'font-size:10px;opacity:0.6;margin-bottom:8px;';
        info.textContent = `${ownerName} · HP: ${defender.health}/100${terrainBonus > 0 ? ` · +${Math.round(terrainBonus * 100)}% terrain` : ''}`;
        previewDiv.appendChild(info);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;';
        const attackBtn = document.createElement('button');
        attackBtn.id = 'btn-attack-confirm';
        attackBtn.textContent = 'Attack';
        attackBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:#d94a4a;border:none;color:white;font-weight:bold;cursor:pointer;';
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'btn-cancel-attack';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:rgba(255,255,255,0.15);border:none;color:white;cursor:pointer;';
        btnRow.appendChild(attackBtn);
        btnRow.appendChild(cancelBtn);
        previewDiv.appendChild(btnRow);

        panel.innerHTML = '';
        panel.appendChild(previewDiv);

        cancelBtn.addEventListener('click', deselectUnit);
        attackBtn.addEventListener('click', () => {
          executeAttack(selectedUnitId!, unitAtHex[0], defender, key);
        });
        return; // Wait for button press
      }
    } else {
      // Move unit
      executeUnitMove(gameState, selectedUnitId, coord, {
        actor: 'player',
        civId: gameState.currentPlayer,
        bus,
      });
      SFX.tap();

      // Re-select to update movement range, or advance to next unit
      if (gameState.units[selectedUnitId]?.movementPointsLeft > 0) {
        selectUnit(selectedUnitId);
      } else {
        selectNextUnit();
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

function handleHexLongPress(rawCoord: HexCoord): void {
  const coord = gameState.map.wrapsHorizontally
    ? wrapHexCoord(rawCoord, gameState.map.width)
    : rawCoord;
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

  const unitAtHex = Object.values(gameState.units).find(unit =>
    unit.owner === gameState.currentPlayer
      && unit.position.q === coord.q
      && unit.position.r === coord.r,
  );
  if (unitAtHex) {
    selectUnit(unitAtHex.id);
    openUnitContextMenu(unitAtHex.id);
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
      uiInteractions.setBlockingOverlay('turn-handoff');
      showTurnHandoff(uiLayer, gameState, nextSlotId, nextPlayer?.name ?? 'Player', {
        onReady: () => {
          uiInteractions.setBlockingOverlay(null);
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

bus.on('village:visited', ({ civId, outcome, message }) => {
  if (outcome === 'gold') advisorSystem.resetMessage('treasurer_village_gold');
  if (outcome === 'science') advisorSystem.resetMessage('scholar_village_science');
  if (outcome === 'free_tech') advisorSystem.resetMessage('scholar_village_tech');
  advisorSystem.check(gameState);

  if (civId === gameState.currentPlayer) {
    showNotification(message, outcome === 'ambush' || outcome === 'illness' ? 'warning' : 'success');
  }
});

bus.on('wonder:discovered', ({ civId, wonderId, isFirstDiscoverer }) => {
  if (civId !== gameState.currentPlayer) {
    return;
  }
  const wonderDef = getWonderDefinition(wonderId);
  if (!wonderDef) {
    return;
  }
  if (isFirstDiscoverer) {
    showNotification(
      `Discovered ${wonderDef.name}! +${wonderDef.discoveryBonus.amount} ${wonderDef.discoveryBonus.type}`,
      'success',
    );
    return;
  }
  showNotification(`Found ${wonderDef.name}!`, 'info');
});

bus.on('wonder:legendary-ready', ({ civId, cityId, wonderId }) => {
  const notification = getLegendaryWonderNotification(gameState, gameState.currentPlayer, {
    type: 'wonder:legendary-ready',
    civId,
    cityId,
    wonderId,
  });
  if (notification) {
    showNotification(notification.message, notification.type);
  }
});

bus.on('wonder:legendary-completed', ({ civId, cityId, wonderId }) => {
  const notification = getLegendaryWonderNotification(gameState, gameState.currentPlayer, {
    type: 'wonder:legendary-completed',
    civId,
    cityId,
    wonderId,
  });
  if (notification) {
    showNotification(notification.message, notification.type);
  }
});

bus.on('wonder:legendary-lost', ({ civId, cityId, wonderId, goldRefund, transferableProduction }) => {
  const notification = getLegendaryWonderNotification(gameState, gameState.currentPlayer, {
    type: 'wonder:legendary-lost',
    civId,
    cityId,
    wonderId,
    goldRefund,
    transferableProduction,
  });
  if (notification) {
    showNotification(notification.message, notification.type);
  }
});

bus.on('wonder:legendary-race-revealed', ({ observerId, civId, cityId, wonderId }) => {
  const notification = getLegendaryWonderNotification(gameState, gameState.currentPlayer, {
    type: 'wonder:legendary-race-revealed',
    observerId,
    civId,
    cityId,
    wonderId,
  });
  if (notification) {
    showNotification(notification.message, notification.type);
  }
});

bus.on('diplomacy:war-declared', ({ attackerId, defenderId }) => {
  if (defenderId === gameState.currentPlayer) {
    const attacker = gameState.civilizations[attackerId];
    const attackerName = attacker?.name ?? 'Unknown';
    const rel = gameState.civilizations[gameState.currentPlayer]?.diplomacy?.relationships[attackerId] ?? 0;
    let reason = 'rising tensions';
    if (rel <= -50) reason = 'deep hostility';
    else if (rel <= -20) reason = 'deteriorating relations';
    else if (rel < 0) reason = 'territorial disputes';
    showNotification(`${attackerName} has declared war! (Reason: ${reason})`, 'warning');
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

// Track which camps have already triggered a "spotted" notification this session
const notifiedBarbarianCamps = new Set<string>();

bus.on('barbarian:spawned', ({ campId, unitId }) => {
  // Only notify the first time we see a raider from this camp
  if (notifiedBarbarianCamps.has(campId)) return;
  const unit = gameState.units[unitId];
  if (!unit) return;
  const vis = currentCiv()?.visibility;
  if (vis && isVisible(vis, unit.position)) {
    notifiedBarbarianCamps.add(campId);
    showNotification('Barbarian raiders spotted!', 'warning');
  }
});

registerMinorCivNotificationListeners(bus, () => gameState, { showNotification });

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
  persistedSettings = await loadSettings();

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
    onImportSave: (state) => {
      gameState = state;
      migrateLegacySave();
      startGame();
      showNotification(`Save imported! Turn ${gameState.turn}`, 'info');
    },
  });
}

function migrateLegacySave(): void {
  for (const [civId, civ] of Object.entries(gameState.civilizations)) {
    if (!civ.civType) (civ as any).civType = 'generic';
    if (!civ.knownCivilizations) (civ as any).knownCivilizations = [];
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
    gameState.settings.advisorsEnabled = { builder: true, explorer: true, chancellor: true, warchief: true, treasurer: true, scholar: true, spymaster: true, artisan: true };
  }
  // Add new advisor types if missing (M3b migration)
  if (gameState.settings.advisorsEnabled && !('treasurer' in gameState.settings.advisorsEnabled)) {
    (gameState.settings.advisorsEnabled as any).treasurer = true;
    (gameState.settings.advisorsEnabled as any).scholar = true;
  }
  // Add spymaster advisor if missing (M4a migration)
  if (gameState.settings.advisorsEnabled && !('spymaster' in gameState.settings.advisorsEnabled)) {
    (gameState.settings.advisorsEnabled as any).spymaster = true;
  }
  if (!gameState.settings.councilTalkLevel) {
    gameState.settings.councilTalkLevel = persistedSettings?.councilTalkLevel ?? 'normal';
  }
  // Ensure pendingEvents exists for hot seat saves
  if (!gameState.pendingEvents) {
    gameState.pendingEvents = {};
  }
  // Add wonder/village state if missing
  if (!gameState.tribalVillages) (gameState as any).tribalVillages = {};
  if (!gameState.discoveredWonders) (gameState as any).discoveredWonders = {};
  if (!gameState.wonderDiscoverers) (gameState as any).wonderDiscoverers = {};
  if (!gameState.legendaryWonderHistory) {
    (gameState as any).legendaryWonderHistory = { destroyedStrongholds: [], discoveredSites: [] };
  }
  const legendaryWonderHistory = gameState.legendaryWonderHistory!;
  if (!legendaryWonderHistory.discoveredSites) {
    legendaryWonderHistory.discoveredSites = [];
    for (const [wonderId, discoverers] of Object.entries(gameState.wonderDiscoverers ?? {})) {
      const wonderTile = Object.values(gameState.map.tiles).find(tile => tile.wonder === wonderId);
      for (const civId of discoverers) {
        if (!legendaryWonderHistory.discoveredSites.some(record => record.civId === civId && record.siteId === wonderId)) {
          legendaryWonderHistory.discoveredSites.push({
            civId,
            siteId: wonderId,
            siteType: 'natural-wonder',
            position: wonderTile?.coord ?? { q: 0, r: 0 },
            turn: gameState.turn,
          });
        }
      }
    }
  }
  if (!gameState.legendaryWonderIntel) {
    (gameState as any).legendaryWonderIntel = {};
  }
  // Add wonder field to tiles if missing
  for (const tile of Object.values(gameState.map.tiles)) {
    if (!('wonder' in tile)) (tile as any).wonder = null;
  }
  // M4-playtest migration: add isResting to existing units
  for (const unit of Object.values(gameState.units)) {
    if (!('isResting' in unit)) (unit as any).isResting = false;
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
  for (const civId of Object.keys(gameState.civilizations)) {
    refreshKnownCivilizations(gameState, civId);
  }
}

function showGameModeSelection(): void {
  const modePanel = document.createElement('div');
  modePanel.id = 'mode-select';
  modePanel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(10,10,30,0.98);z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;';
  modePanel.innerHTML = `
    <h1 style="font-size:22px;color:#e8c170;margin-bottom:24px;">New Game</h1>
    <div style="width:100%;max-width:320px;margin-bottom:20px;">
      <input id="new-game-title" type="text" placeholder="Campaign title" value="New Campaign" style="width:100%;padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:white;font-size:14px;" />
    </div>
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

  const getRequestedTitle = (): string | null => {
    const input = document.getElementById('new-game-title') as HTMLInputElement | null;
    const title = input?.value.trim() ?? '';
    if (!title) {
      showNotification('Campaign title is required', 'warning');
      return null;
    }
    return title;
  };

  const updatePersistedCustomCivilizations = (customCivilizations: GameState['settings']['customCivilizations'] = []): void => {
    persistedSettings = {
      ...mergePersistedSettings(persistedSettings),
      customCivilizations: [...customCivilizations],
    };
  };

  document.getElementById('mode-solo')?.addEventListener('click', async () => {
    const title = (document.getElementById('new-game-title') as HTMLInputElement | null)?.value.trim() || 'New Campaign';
    const currentSettings = await refreshPersistedSettings();
    const savedCustomCivilizations = currentSettings.customCivilizations ?? [];
    modePanel.remove();
    showCampaignSetup(uiLayer, {
      initialTitle: title,
      onStartSolo: (config) => {
        gameState = createNewGame({
          civType: config.civType,
          mapSize: config.mapSize,
          opponentCount: config.opponentCount,
          gameTitle: config.gameTitle,
          settingsOverrides: getPersistedSettingsOverrides(),
          customCivilizations: config.customCivilizations,
        });
        if (persistedSettings?.councilTalkLevel) {
          gameState.settings.councilTalkLevel = persistedSettings.councilTalkLevel;
        }
        startGame();
        showNotification('Your tribe has settled near a river...', 'info');
      },
      onCustomCivilizationsChanged: (customCivilizations) => {
        updatePersistedCustomCivilizations(customCivilizations);
      },
      onCancel: () => showGameModeSelection(),
    }, {
      civDefinitions: getPlayableCivDefinitions({ customCivilizations: savedCustomCivilizations }),
      initialCustomCivilizations: savedCustomCivilizations,
    });
  });

  document.getElementById('mode-hotseat')?.addEventListener('click', async () => {
    const title = getRequestedTitle();
    if (!title) return;
    const currentSettings = await refreshPersistedSettings();
    const savedCustomCivilizations = currentSettings.customCivilizations ?? [];
    modePanel.remove();
    showHotSeatSetup(uiLayer, {
      onComplete: (config) => {
        gameState = createHotSeatGame(config, undefined, title);
        if (persistedSettings?.councilTalkLevel) {
          gameState.settings.councilTalkLevel = persistedSettings.councilTalkLevel;
        }
        startGame();
        showNotification(`Hot seat game started! ${config.players.filter(p => p.isHuman).length} players`, 'info');
      },
      onCustomCivilizationsChanged: (customCivilizations) => {
        updatePersistedCustomCivilizations(customCivilizations);
      },
      onCancel: () => {
        showGameModeSelection();
      },
    }, {
      civDefinitions: getPlayableCivDefinitions({ customCivilizations: savedCustomCivilizations }),
      initialCustomCivilizations: savedCustomCivilizations,
    });
  });
}

function startGame(): void {
  // Center camera on current player's starting position
  centerOnCurrentPlayer();

  renderLoop.setGameState(gameState);
  updateHUD();
  maybeShowCouncilInterrupt();

  // Auto-save immediately so closing before turn 1 doesn't lose the game
  autoSave(gameState).catch(() => {});

  // Input (only set up once)
  if (!inputInitialized) {
    const callbacks: InputCallbacks = {
      onHexTap: handleHexTap,
      onHexLongPress: handleHexLongPress,
    };
    new TouchHandler(canvas, renderLoop.camera, callbacks);
    new MouseHandler(canvas, renderLoop.camera, callbacks, {
      canInteract: () => !uiInteractions.isInteractionBlocked(),
    });
    installKeyboardShortcuts(document, {
      onOpenCouncil: () => togglePanel('council'),
      onOpenTech: () => togglePanel('tech'),
      onEndTurn: () => {
        void endTurn();
      },
    }, {
      canHandle: () => !uiInteractions.isInteractionBlocked(),
    });
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
