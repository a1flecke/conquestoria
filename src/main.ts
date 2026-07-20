import '@/assets/sprite-animations-v2.css';
import '@/assets/boar-animations.css';
import '@/assets/wolf-animations.css';
import '@/assets/basilisk-animations.css';
import '@/assets/hydra-animations.css';
import '@/assets/sea-serpent-animations.css';
import '@/assets/wurm-animations.css';
import '@/assets/roc-animations.css';
import '@/assets/dragon-animations.css';
import { EventBus } from '@/core/event-bus';
import { createNewGame, createHotSeatGame, createDefaultSettings } from '@/core/game-state';
import { resolveOpponentChallenge, setPendingOpponentChallenge, resolveChallengeForCiv, setPendingChallengeForCiv, applyPendingChallengeForCiv } from '@/core/opponent-challenge';
import { processTurn } from '@/core/turn-manager';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { RenderLoop } from '@/renderer/render-loop';
import { initSprites } from '@/renderer/sprites/sprite-loader';
import { preloadOutpostMarker } from '@/renderer/improvements/resource-outpost-marker';
import { preloadFamineBadgeMarker } from '@/renderer/improvements/famine-badge-marker';
import { preloadReligionBadgeMarker } from '@/renderer/improvements/religion-badge-marker';
import { preloadRailSegment } from '@/renderer/improvements/rail-segment-loader';
import { preloadTerrainTiles } from '@/renderer/terrain/terrain-tile-loader';
import { preloadNaturalWonderTiles } from '@/renderer/terrain/wonder-tile-loader';
import { TouchHandler, type InputCallbacks } from '@/input/touch-handler';
import { MouseHandler } from '@/input/mouse-handler';
import { installKeyboardShortcuts } from '@/input/keyboard-shortcuts';
import { hexKey, hexToPixel, hexesInRange, parseHexKey, wrapHexCoord } from '@/systems/hex-utils';
import { moveUnit, getMovementCost, UNIT_DEFINITIONS, UNIT_DESCRIPTIONS, restUnit, canHeal, getUnmovedUnits, createUnit, findPath } from '@/systems/unit-system';
import { classifyOwner, isAlwaysHostilePair, isMajorCivOwner } from '@/core/owner-kind';
import { BUILDINGS, getProductionDisplayName } from '@/systems/city-system';
import { chooseCircularManufacturingMaterial } from '@/systems/national-project-system';
import { usePropagandistAction } from '@/systems/propagandist-system';
import { foundCityInState } from '@/systems/city-founding-system';
import { assignCityFocus, setCityWorkedTile } from '@/systems/city-work-system';
import { formatCityFoundingBlockerMessage, getCityFoundingBlockers } from '@/systems/city-territory-system';
import { enqueueCityProduction, enqueueResearch, getIdleCityIds, getRecommendedIdleCityChoice, moveQueuedId, needsResearchChoice, removeQueuedId, reorderCityProduction, setIdleProduction } from '@/systems/planning-system';
import { formatImprovementYieldLabel, getImprovementDisplayName } from '@/systems/improvement-system';
import { applyPillageToState, canPillageTile, getPillageGoldReward } from '@/systems/pillage-system';
import { createTechPanel } from '@/ui/tech-panel';
import { createCityPanel } from '@/ui/city-panel';
import { createCityCapturePanel } from '@/ui/city-capture-panel';
import { createForeignCityEntryPanel } from '@/ui/foreign-city-entry-panel';
import { createWorkerReplacementConfirmPanel, createWorkerTaskWarningPanel } from '@/ui/worker-task-warning-panel';
import { createWonderPanel } from '@/ui/wonder-panel';
import { createWonderAtlasPanel } from '@/ui/wonder-atlas-panel';
import { calculateCombatStrengths, deterministicCombatSeed, resolveCombat, selectDefenderForAttack } from '@/systems/combat-system';
import { calculateCityAssaultStrengths } from '@/systems/city-siege-system';
import { buildCombatContextForDefender, getAmphibiousAssaultMultiplier } from '@/systems/combat-context';
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { getAirBaseCapacity, getAirBaseRoster, getInterceptCoverage, getLegalAirMissionTargets, getLegalRebaseDestinations, rebaseAircraft, resolveAirStrike, resolveReconMission, startIntercept } from '@/systems/air-operations-system';
import { buildSelectedUnitHighlights } from '@/input/selected-unit-highlights';
import { handleSelectedUnitMovementBlocker } from '@/input/selected-unit-movement-feedback';
import {
  NO_LAND_UNIT_WATER_RECOVERY,
  type LandUnitWaterRecovery,
} from '@/systems/unit-water-recovery';
import { applyCombatOutcomeToState, getCaptureNotificationLabel } from '@/systems/combat-reward-system';
import { recordCombatForCiv } from '@/systems/threat-pressure-system';
import { applyWorkerAction } from '@/systems/worker-action-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { resolveCombatEra } from '@/systems/era-resolution';
import { preach } from '@/systems/religion-system';
import { createUnitDeleteConfirmationPanel } from '@/ui/unit-delete-confirmation-panel';
import { isVisible, getVisibility, isForestConcealedUnit } from '@/systems/fog-of-war';
import { applyCampDestructionAtTarget } from '@/systems/barbarian-system';
import { recordBeastSlain, isBeastConcealedFrom, applyHoardChoice, getHoardChoicePreview, canUnitAttackBeast, getBeastTrophyGoldPerTurn, isCivUnitInBeastTerritory } from '@/systems/beast-system';
import { createBeastHoardPanel } from '@/ui/beast-hoard-panel';
import { BEAST_DEFINITIONS, getBeastDefinitionByUnitType } from '@/systems/beast-definitions';
import { recordBeastSightings, getBestiaryEntriesForPlayer } from '@/systems/beast-presentation';
import { showBeastSightingBanner } from '@/ui/beast-sighting-banner';
import { showBeastSlayCeremony } from '@/ui/beast-slay-ceremony';
import { createBestiaryPanel } from '@/ui/bestiary-panel';
import {
  autoSave,
  loadMostRecentAutoSaveEntry,
  loadSaveEntry,
  loadSettings,
  rewriteLoadedSaveEntry,
  saveGame,
  saveSettings,
} from '@/storage/save-manager';
import { AudioSystem } from '@/audio/audio-system';
import { SFX, routeSfxThrough } from '@/audio/sfx';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { createMarketplacePanel } from '@/ui/marketplace-panel';
import { createEspionagePanel } from '@/ui/espionage-panel';
import { createSavePanel } from '@/ui/save-panel';
import { AdvisorSystem } from '@/ui/advisor-system';
import { createCouncilPanel } from '@/ui/council-panel';
import { createGameShell } from '@/ui/game-shell';
import { createContextMenu } from '@/ui/context-menu';
import { createNotificationLogPanel } from '@/ui/notification-log-panel';
import { closePirateWatersPanels, createPirateWatersPanel } from '@/ui/pirate-waters-panel';
import { createGameButton } from '@/ui/ui-kit';
import { getPirateWatersPresentation, type PirateFocusTarget } from '@/systems/pirate-presentation';
import { hirePirateFlotilla, payPirateTribute, type PirateActionResult } from '@/systems/pirate-actions';
import { markNotificationRead, resolvePirateNotificationReview } from '@/ui/pirate-notification-listeners';
import { resolvePirateHeadquartersSelection } from '@/input/pirate-headquarters-selection';
import {
  confirmPirateHeadquartersAssault,
  findAvailablePirateHeadquartersAssault,
  preparePirateHeadquartersAssault,
} from '@/input/pirate-headquarters-assault';
import { createPirateHeadquartersAssaultPanel } from '@/ui/pirate-headquarters-assault-panel';
import { formatNotificationTargetFocusMessage } from '@/ui/notification-targets';
import { renderSelectedUnitInfo } from '@/ui/selected-unit-info';
import { createNetworkIntentPanel } from '@/ui/network-intent-panel';
import { createNetworkPanel, getNetworkPanelModel } from '@/ui/network-panel';
import { renderUnitStackPanel } from '@/ui/unit-stack-panel';
import { createUnitTurnFlow } from '@/ui/unit-turn-flow';
import { createUiInteractionState } from '@/ui/ui-interaction-state';
import { closePlanningPanels, createRequiredChoicePanel } from '@/ui/required-choice-panel';
import { createReligionBoonModal } from '@/ui/religion-boon-modal';
import { chooseBoon } from '@/systems/religion-system';
import { showCampaignSetup } from '@/ui/campaign-setup';
import { showGameModeSelect } from '@/ui/game-mode-select';
import { createPacingDebugPanel } from '@/ui/pacing-debug-panel';
import { formatCombatPreviewDetails } from '@/ui/combat-preview';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { canInspectUnitForViewer } from '@/systems/viewer-intel';
import {
  acceptDiplomaticRequest,
  applyDiplomaticAction,
  breakTreaty,
  declareWar,
  makePeace,
  modifyRelationship,
  rejectDiplomaticRequest,
  resolveOpponentKind,
} from '@/systems/diplomacy-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { estimateTurnsToComplete } from '@/systems/pacing-model';
import { visitVillage } from '@/systems/village-system';
import { getWonderDefinition } from '@/systems/wonder-definitions';
import { buildWonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { getAvailableTechs, getEffectiveTechCost } from '@/systems/tech-system';
import {
  assignNetworkPlan,
  beginNetworkPlansForVictimTurn,
  cancelNetworkPlan,
  holdNetworkPlan,
  isAutonomyActivated,
  retargetNetworkPlan,
} from '@/systems/network-plan-system';
import { beginAutonomySurge, requestAutonomyPosture } from '@/systems/autonomy-postures';
import { getNetworkWarningForViewer } from '@/systems/network-viewer-intel';
import {
  getNextActiveHumanPlayerId,
  isActiveHumanRoundComplete,
} from '@/core/turn-cycling';
import { resolveHotSeatPostSimulation } from '@/core/hotseat-outcome';
import {
  acknowledgeTurnHandoffSummary,
  showTurnHandoff,
} from '@/ui/turn-handoff';
import { showHotSeatSetup } from '@/ui/hotseat-setup';
import { collectCouncilInterrupt, clearStaleSoloPendingEvents } from '@/core/hotseat-events';
import { refreshKnownCivilizations, syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { getMinorCivPresentationForPlayer } from '@/systems/minor-civ-presentation';
import { getMinorCivNotification } from '@/ui/minor-civ-notifications';
import { registerMinorCivNotificationListeners } from '@/ui/minor-civ-notification-listeners';
import { conquestMinorCiv, applyDiplomaticReaction } from '@/systems/minor-civ-system';
import { createIconLegendOverlay } from '@/ui/icon-legend';
import { showVictoryPanel } from '@/ui/victory-panel';
import { buildUnitOccupancy, hasHostileUnitAtCoord } from '@/systems/unit-occupancy';
import {
  type PendingCityCaptureChoice,
  beginPlayerCityAssaultChoice,
  finalizePlayerCityAssaultChoice,
  shouldPromptForPlayerCityCapture,
} from '@/input/city-assault-flow';
import {
  canUnitOccupyCity,
  emitMajorCityCaptureEvents,
} from '@/systems/city-capture-system';
import { resolveSelectedUnitTapIntent } from '@/input/selected-unit-tap-intent';
import { resolveWonderAtlasIntent } from '@/input/wonder-atlas-intent';
import { resolveNaturalWonderAudioFocus } from '@/input/natural-wonder-audio-focus';
import { buildCombatPresentation } from '@/systems/viewer-event-presentation';
import { handleFriendlyUnitStackTap } from '@/input/unit-stack-selection';
import {
  initializeLegendaryWonderProjectsForCity,
  getLegendaryWonderEligibility,
  startLegendaryWonderBuild,
} from '@/systems/legendary-wonder-system';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import {
  embedSpy,
  unembedSpy,
  attemptSweep,
  attemptInfiltration,
  getAvailableMissions,
  getInfiltrationSuccessChance,
  getSpyCaptureRelationshipPenalty,
  expelSpy,
  executeSpy,
  startInterrogation,
  isSpyUnitType,
  missionRequiresPlacedSpy,
  recallSpy,
  resolveMissionResult,
  setDisguise,
  startMission,
  verifyAgent,
} from '@/systems/espionage-system';
import { getCouncilInterrupt } from '@/systems/council-system';
import { applyAutoExploreOrder } from '@/systems/auto-explore-system';
import {
  applyUnitUpgradeToState,
  canUpgradeUnit,
} from '@/systems/unit-upgrade-system';
import { executeUnitMove, isWorkerBusy, type ExecuteUnitMoveResult } from '@/systems/unit-movement-system';
import {
  canLoadUnitOntoTransport,
  getTransportCargo,
  getTransportCapacity,
  getTransportCargoUsed,
  getUnitCargoSize,
  getUnloadDestinations,
  getEmbarkedAssaultTarget,
  detachCargoForEmbarkedAssault,
  loadUnitOntoTransport,
  unloadUnitFromTransport,
} from '@/systems/transport-system';
import { getPendingUnload, getUnloadRange, setPendingUnload, clearPendingUnload } from '@/ui/transport-ui-state';
import { getCapitalCity, getCapitalCityId } from '@/systems/capital-system';
import type { CombatResult, GameState, HexCoord, ImprovementType, Unit, UnitType, DiplomaticAction, CivBonusEffect, WorkerActionType, TreatyType } from '@/core/types';
import {
  appendNotification,
  getNotificationsForPlayer,
  type NotificationCityAction,
  type NotificationEntry,
} from '@/core/notification-log';
import {
  routeBarbarianSpawned,
  routeCombatRewardEarned,
  routeDroppedProductionItem,
  routeEconomyTreasuryStrain,
  routeEraAdvanced,
  routeFactionTransition,
  routeFirstContact,
  routeLegendaryWonder,
  routePeaceMade,
  routePeaceRequested,
  routeTerritoryTileFlipped,
  routeWarDeclared,
  routeTreatyProposed,
  TREATY_LABELS,
  routeStrategicWarning,
  routeCrisisStarted,
  routeCrisisSpread,
  routeCrisisEscalated,
  routeCrisisResolved,
  routeWorldPressureCrisisStarted,
  routeWorldPressureCrisisResolved,
  routeCrisisFoeHuntedByAlly,
  routeCrisisAidSent,
  routeReligionFounded,
  routeReligionCityConverted,
  routeLoyaltyWarning,
  routeCityDefected,
  routeOpportunisticWar,
  routeSabotageReliefDiscovered,
  routeCityFlipped,
  type NotificationSink,
} from '@/ui/notification-routing';
import { createNotificationDelivery } from '@/ui/notification-delivery';
import { registerConquestoriaServiceWorker } from '@/platform/service-worker';
import { initializeDesktopMenu } from '@/platform/desktop-menu';
import { beginConfirmedForeignCityEntry } from '@/input/foreign-city-entry-flow';
import { confirmBusyWorkerMove } from '@/input/worker-movement-flow';
import { createTerritoryInspectionPanel } from '@/ui/territory-inspection-panel';
import { fortifyUnitInState, unfortifyUnitInState } from '@/systems/unit-lifecycle-system';
import { showPauseMenu } from '@/ui/pause-menu-panel';
import { beginCampaignEntry } from '@/ui/campaign-entry-flow';
import { showLegacyOpponentChallengePrompt } from '@/ui/legacy-opponent-challenge-prompt';
import { updateAndRefreshVisibility, reconstructLastSeenFromMap } from '@/systems/last-seen-presentation';
import { calculateCivEconomy, formatGoldHudText, rushBuyActiveProduction } from '@/systems/economy-system';
import { appeaseFaction, concedeToMovement } from '@/systems/faction-system';
import { applyQuarantine, applyRemedy } from '@/systems/crisis-system';
import { createTreasuryDrawer, type TreasuryDrawer } from '@/ui/treasury-drawer';
import { getCivHappinessFromResources, getCivAvailableResources, canEstablishOutpost, performEstablishOutpost, canBuyResourceAccess, performBuyResourceAccess } from '@/systems/resource-acquisition-system';
import { fireResourceDiscoveredTip } from '@/ui/advisor-system';
import { createWonderDiscoveryRevealQueue } from '@/ui/wonder-discovery-queue';
import { buildLegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import { createLegendaryWonderCompletionQueue } from '@/ui/legendary-wonder-completion-queue';
import { removeRouteForUnit, createMarketplaceState, getEffectiveGoldPerTurn, getRouteTechGoldBonus } from '@/systems/trade-system';
import { establishQuestAwareRoute } from '@/systems/quest-aware-trade-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { performMinorCivFestival, performMinorCivGift, performMinorCivReparations, setMinorCivWarState } from '@/systems/minor-civ-actions';
import { canSendAid, applySendAid, applyOpportunisticWarPenaltyIfCrisisStruck } from '@/systems/crisis-interaction-system';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { openEstablishRoutePanel } from '@/ui/establish-route-panel';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { createCompletedRoundHandoffTransaction } from '@/core/completed-round-handoff';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { handleCombatResolvedEvent } from '@/ui/combat-resolved-presentation';
import { applyStrategicWarningTransitions } from '@/systems/strategic-warning-system';
import { createCityOverviewPanel } from '@/ui/city-overview-panel';

// --- App State ---
let gameState: GameState;
let drawer: TreasuryDrawer;
let selectedUnitId: string | null = null;
let selectedUnitWaterRecovery: LandUnitWaterRecovery = NO_LAND_UNIT_WATER_RECOVERY;
let selectedPirateFactionId: string | null = null;
let selectedPirateHistoryId: string | null = null;
let movementRange: HexCoord[] = [];
let attackRange: HexCoord[] = [];
// Tracks whether the "tap a highlighted tile or cancel" notification has been shown
// for the current pendingUnload session — resets when clearUnloadState() is called.
let _mistapNotified = false;
let currentCityIndex = 0;
let inputInitialized = false;
let councilPanelOpen = false;
let persistedSettings: GameState['settings'] | undefined;
let pacingDebugOpen = false;
let pendingCityCaptureChoice: PendingCityCaptureChoice | null = null;
let pendingJourneyUnitId: string | null = null;
let pendingAirMission: { unitId: string; mission: 'strike' | 'recon' } | null = null;
let deferWonderDiscoveryRevealUntilMoveSettles = false;

/** Clears pendingUnload state and resets the mis-tap notification guard. */
function clearUnloadState(): void {
  clearPendingUnload();
  _mistapNotified = false;
}

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
const audioCtx = new AudioContext();
const audio = new AudioSystem(audioCtx);
const roundPresentationGate = new RoundPresentationGate();
// Master volume is not persisted (no GameSettings field) — tracked in memory only
// so the pause menu slider shows the correct current value on re-open.
let currentMasterVolume = 1.0;
const advisorSystem = new AdvisorSystem(bus);
const uiInteractions = createUiInteractionState();

// --- Canvas Setup ---
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiLayer = document.getElementById('ui-layer') as HTMLDivElement;
const renderLoop = new RenderLoop(canvas);
let wonderDiscoveryQueue: ReturnType<typeof createWonderDiscoveryRevealQueue> | null = null;
let legendaryCompletionQueue: ReturnType<typeof createLegendaryWonderCompletionQueue> | null = null;

function setBlockingOverlay(id: string | null): void {
  uiInteractions.setBlockingOverlay(id);
  if (id === null) {
    wonderDiscoveryQueue?.pump();
    legendaryCompletionQueue?.pump();
  }
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

wonderDiscoveryQueue = createWonderDiscoveryRevealQueue({
  container: uiLayer,
  isInteractionBlocked: () => uiInteractions.isInteractionBlocked(),
  requestMapHighlight: (item, reducedMotion) => {
    renderLoop.requestWonderDiscoveryHighlight(item.coord, item.visual, { reducedMotion });
  },
  openAtlas: wonderId => openWonderAtlas(wonderId),
  onRevealStarted: item => {
    void audio.playNaturalWonderDiscovery(item.wonderId);
  },
  reducedMotion: prefersReducedMotion,
  setBlockingOverlay,
});

legendaryCompletionQueue = createLegendaryWonderCompletionQueue({
  container: uiLayer,
  isInteractionBlocked: () => uiInteractions.isInteractionBlocked(),
  reducedMotion: prefersReducedMotion,
  openCity: cityId => {
    const city = gameState.cities[cityId];
    if (city) openCityPanelForCity(city);
  },
  openJournal: cityId => {
    if (gameState.cities[cityId]) openWonderPanelForCityId(cityId);
  },
  setBlockingOverlay,
});

// --- Resize ---
window.addEventListener('resize', () => renderLoop.resizeCanvas());
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && pendingJourneyUnitId) {
    pendingJourneyUnitId = null;
    showNotification('Journey cancelled.', 'info');
    return;
  }
  if (event.key !== '`') {
    return;
  }

  pacingDebugOpen = !pacingDebugOpen;
  document.getElementById('pacing-debug-panel')?.remove();
  if (pacingDebugOpen && gameState) {
    createPacingDebugPanel(uiLayer, gameState);
  }
});

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
    onOpenPirateWaters: () => openPirateWaters(),
    onToggleIconLegend: () => {
      const existing = document.getElementById('icon-legend');
      if (existing && existing.style.display !== 'none') {
        // Already visible — hide it
        existing.style.display = 'none';
        return;
      }
      // Stale or absent — remove old, rebuild fresh with current techs
      existing?.remove();
      const viewerTechs = new Set<string>(
        gameState.civilizations[gameState.currentPlayer]?.techState.completed ?? []
      );
      const overlay = createIconLegendOverlay(viewerTechs);
      uiLayer.appendChild(overlay);
    },
    onOpenWonderAtlas: () => openWonderAtlas(),
    onOpenMenu: () => {
      showPauseMenu(uiLayer, {
        turn: gameState.turn,
        civName: gameState.civilizations[gameState.currentPlayer].name,
        onResume: () => {},
        onSave: async (slotId, name) => {
          await saveGame(slotId, name, gameState);
          showNotification('Game saved.', 'info');
        },
        onNewGame: () => showGameModeSelection(),
        autoSave: () => autoSave(gameState),
        onOpenBestiary: () => openBestiary(),
        opponentChallenge: resolveOpponentChallenge(gameState),
        pendingOpponentChallenge: gameState.pendingOpponentChallenge,
        onOpponentChallengeChange: (challenge) => {
          gameState = setPendingOpponentChallenge(gameState, challenge);
        },
        personalChallenge: resolveChallengeForCiv(gameState, gameState.currentPlayer),
        pendingPersonalChallenge: gameState.civilizations[gameState.currentPlayer]?.pendingChallenge,
        onPersonalChallengeChange: (challenge) => {
          gameState = setPendingChallengeForCiv(gameState, gameState.currentPlayer, challenge);
        },
        // Spec 3: per-channel audio settings
        audioSettings: {
          masterVolume:   currentMasterVolume,   // tracked in memory across menu reopens
          musicVolume:    gameState.settings.musicVolume,
          sfxVolume:      gameState.settings.sfxVolume,
          voiceVolume:    gameState.settings.voiceVolume    ?? 1.0,
          stingerVolume:  gameState.settings.stingerVolume  ?? 1.0,
          musicEnabled:   gameState.settings.musicEnabled,
          soundEnabled:   gameState.settings.soundEnabled,
          voiceEnabled:   gameState.settings.voiceEnabled   ?? true,
          stingerEnabled: gameState.settings.stingerEnabled ?? true,
        },
        onAudioSettingChange: (key, value) => {
          // Apply to audio system immediately — no restart needed
          switch (key) {
            case 'masterVolume':
              currentMasterVolume = value as number;
              audio.setMasterVolume(value as number);
              return; // master not in GameSettings — skip the settings write below
            case 'musicVolume':    audio.setMusicVolume(value as number);   break;
            case 'sfxVolume':      audio.setSfxVolume(value as number);     break;
            case 'voiceVolume':    audio.setVoiceVolume(value as number);   break;
            case 'stingerVolume':  audio.setStingerVolume(value as number); break;
            case 'musicEnabled':   audio.setMusicEnabled(value as boolean); break;
            case 'soundEnabled':   audio.setSfxEnabled(value as boolean);   break;
            case 'voiceEnabled':   audio.setVoiceEnabled(value as boolean); break;
            case 'stingerEnabled': audio.setStingerEnabled(value as boolean); break;
          }
          // Persist all non-master settings to GameSettings (saved on next save)
          (gameState.settings as unknown as Record<string, number | boolean>)[key] = value;
        },
      });
    },
  });
}

function openBestiary(): void {
  createBestiaryPanel(uiLayer, getBestiaryEntriesForPlayer(gameState, gameState.currentPlayer), {
    onClose: () => {},
    slayerNameFor: (civId) => gameState.civilizations[civId]?.name ?? civId,
  });
}

function scanBeastSightings(): void {
  const visTiles = currentCiv()?.visibility?.tiles;
  if (!visTiles) return;
  const viewerUnits = Object.values(gameState.units).filter(
    u => u.owner === gameState.currentPlayer && !u.transportId,
  );
  const visibleKeys = new Set(
    Object.entries(visTiles).filter(([, v]) => v === 'visible').map(([k]) => k),
  );
  // A beast concealed in its habitat cannot be sighted even if the tile is visible
  for (const unit of Object.values(gameState.units)) {
    if (isBeastConcealedFrom(unit, gameState.map, viewerUnits)) {
      visibleKeys.delete(hexKey(unit.position));
    }
  }
  const sightingResult = recordBeastSightings(gameState, gameState.currentPlayer, visibleKeys);
  gameState = sightingResult.state;
  for (const beastId of sightingResult.newSightings) {
    bus.emit('beast:sighted', { beastId, civId: gameState.currentPlayer });
  }
}

function maybeShowPendingHoardChoice(): void {
  const pending = (gameState.beasts?.pendingHoardChoices ?? [])
    .find(p => p.civId === gameState.currentPlayer);
  if (!pending) return;
  const preview = getHoardChoicePreview(gameState, pending.lairId);
  const lair = gameState.beasts!.lairs[pending.lairId];
  createBeastHoardPanel(uiLayer, preview, choice => {
    gameState = applyHoardChoice(gameState, pending.lairId, pending.civId, choice);
    bus.emit('beast:hoard-claimed', { lairId: pending.lairId, beastId: lair.beastId, civId: pending.civId, choice });
    updateHUD();
    maybeShowPendingHoardChoice();
  });
}

function openWonderAtlas(initialWonderId?: string): void {
  drawer?.close();
  audio.stopNaturalWonderAmbient('codex-page-hidden');
  createWonderAtlasPanel(uiLayer, gameState, {
    initialWonderId,
    onViewOnMap: coord => {
      renderLoop.camera.centerOn(coord);
    },
    onOpenCity: cityId => {
      const city = gameState.cities[cityId];
      if (city) openCityPanelForCity(city);
    },
    onNaturalWonderPageShown: wonderId => {
      void audio.startNaturalWonderCodexAmbient(wonderId);
    },
    onNaturalWonderPageHidden: () => {
      audio.stopNaturalWonderAmbient('codex-page-hidden');
    },
    onNaturalWonderReplay: wonderId => {
      void audio.playNaturalWonderReplay(wonderId);
    },
    onClose: () => {},
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
  let totalFood = 0, totalProd = 0, totalScience = 0;
  for (const cityId of civ.cities) {
    const city = gameState.cities[cityId];
    if (!city) continue;
    const y = calculateProjectedCityYields(gameState, cityId);
    totalFood += y.food;
    totalProd += y.production;
    totalScience += y.science;
  }
  const economyStatus = calculateCivEconomy(gameState, civ.id);

  const techName = civ.techState.currentResearch ?? 'None';
  hud.textContent = '';

  const yieldsRow = document.createElement('div');
  yieldsRow.dataset.role = 'hud-yields';
  yieldsRow.style.cssText =
    'display:flex;align-items:center;gap:10px;flex-wrap:nowrap;overflow:hidden;min-width:0;';

  const yieldSpan = document.createElement('span');
  yieldSpan.textContent = `🌾 ${totalFood}`;
  yieldsRow.appendChild(yieldSpan);

  const prodSpan = document.createElement('span');
  prodSpan.textContent = `⚒️ ${totalProd}`;
  yieldsRow.appendChild(prodSpan);

  const goldBtn = document.createElement('button');
  goldBtn.style.cssText =
    'background:transparent;color:inherit;border:none;font-family:inherit;font-size:inherit;padding:0;cursor:pointer;min-height:44px;display:inline-flex;align-items:center;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:1;';
  goldBtn.textContent = `💰 ${formatGoldHudText(economyStatus, civ.gold)}`;
  goldBtn.addEventListener('click', () => drawer?.toggle());
  yieldsRow.appendChild(goldBtn);
  drawer?.update(economyStatus, civ.gold);

  const sciSpan = document.createElement('span');
  sciSpan.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:1;';
  sciSpan.textContent = `🔬 ${techName !== 'None' ? techName : 'None'} (+${totalScience})`;
  yieldsRow.appendChild(sciSpan);

  if (isAutonomyActivated(gameState, civ.id)) {
    const networkButton = document.createElement('button');
    networkButton.type = 'button';
    networkButton.style.cssText = 'background:transparent;color:inherit;border:1px solid rgba(232,193,112,0.45);border-radius:6px;font:inherit;padding:4px 8px;min-height:44px;';
    networkButton.textContent = getNetworkPanelModel(gameState, civ.id).statusText;
    networkButton.addEventListener('click', () => openNetworkPanel());
    yieldsRow.appendChild(networkButton);
  }

  const happiness = getCivHappinessFromResources(gameState, civ.id);
  if (happiness > 0) {
    const happySpan = document.createElement('span');
    happySpan.title = 'Happiness from luxury resources — each point reduces city unrest pressure by 2';
    happySpan.textContent = `☺ ${happiness} (stability)`;
    yieldsRow.appendChild(happySpan);
  }

  const infoRow = document.createElement('div');
  if (gameState.hotSeat && civ.name) {
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${civ.name} · `;
    infoRow.appendChild(nameSpan);
  }
  const turnSpan = document.createElement('span');
  turnSpan.textContent = `Turn ${gameState.turn} · Your Era ${resolveCivilizationEra(civ.techState.completed)} · World Age ${gameState.era}`;
  infoRow.appendChild(turnSpan);

  hud.appendChild(yieldsRow);
  hud.appendChild(infoRow);

  const pirateWatersButton = document.getElementById('btn-pirate-waters');
  if (pirateWatersButton) {
    pirateWatersButton.hidden = !getPirateWatersPresentation(gameState, gameState.currentPlayer).available;
  }

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
const notificationQueue: Array<Pick<NotificationEntry, 'message' | 'type' | 'target'> & { sfxCue?: string }> = [];
let isShowingNotification = false;
let currentDismissTimer: ReturnType<typeof setTimeout> | null = null;

function enqueueToast(
  message: string,
  type: NotificationEntry['type'],
  target?: NotificationEntry['target'],
  sfxCue?: string,
): void {
  if (roundPresentationGate.isSuppressed()) return;
  notificationQueue.push({ message, type, target, sfxCue });
  if (!isShowingNotification) displayNextNotification();
}

function showNotification(
  message: string,
  type: NotificationEntry['type'] = 'info',
  target?: NotificationEntry['target'],
): void {
  enqueueToast(message, type, target);
  if (gameState) {
    appendNotification(gameState, gameState.currentPlayer, {
      message,
      type,
      turn: gameState.turn,
      target,
    });
  }
}

// The single delivery contract for game-consequence notifications (#551):
// logs to the recipient civ always, toasts only when that civ is the active
// unsuppressed viewer, and queues to pendingEvents (hot seat only) otherwise
// -- the turn-handoff summary drains that queue. All existing router call
// sites keep using this name unchanged; it now enforces the contract instead
// of the old emit-time currentPlayer attribution that leaked across hot-seat
// players and never drained in solo.
const notificationDelivery = createNotificationDelivery({
  getState: () => gameState,
  toast: enqueueToast,
  isSuppressed: () => roundPresentationGate.isSuppressed(),
});
const appendToCivLog: NotificationSink = notificationDelivery.deliver;

function focusNotificationTarget(target: NotificationEntry['target']): void {
  if (!target) return;
  renderLoop.camera.centerOn(target.coord);
  const visibility = currentCiv().visibility;
  const isCurrentlyVisible = visibility ? getVisibility(visibility, target.coord) === 'visible' : false;
  enqueueToast(formatNotificationTargetFocusMessage(target, isCurrentlyVisible), 'info');
}

function focusPirateTarget(target: PirateFocusTarget): void {
  const coord = target.kind === 'region' ? target.center : target.coord;
  renderLoop.camera.centerOn(coord);
  enqueueToast(target.label, 'info');
}

function applyPirateActionResult(result: PirateActionResult, successMessage: string): void {
  if (!result.success) {
    showNotification(result.reason ?? 'That pirate action is no longer available.', 'warning');
    return;
  }
  gameState = result.state;
  for (const event of result.events) {
    if (event.type === 'tribute-paid') {
      bus.emit('pirate:audio-cue', { cue: 'tribute', factionId: event.factionId, viewerIds: [event.civId] });
    } else if (event.type === 'contract-accepted') {
      bus.emit('pirate:audio-cue', { cue: 'contract-accepted', factionId: event.factionId, viewerIds: [event.employerId] });
    }
  }
  renderLoop.setGameState(gameState);
  updateHUD();
  showNotification(successMessage, 'success');
}

function openPirateWaters(selection?: { factionId?: string; historyId?: string }): void {
  if (selection?.factionId) {
    selectedPirateFactionId = selection.factionId;
    selectedPirateHistoryId = null;
  } else if (selection?.historyId) {
    selectedPirateHistoryId = selection.historyId;
    selectedPirateFactionId = null;
  }

  const renderPanel = (): void => {
    const base = getPirateWatersPresentation(gameState, gameState.currentPlayer);
    if (!base.available) return;
    const factionId = selectedPirateFactionId && base.factions.some(faction => faction.factionId === selectedPirateFactionId)
      ? selectedPirateFactionId
      : base.factions[0]?.factionId;
    let historyId = selectedPirateHistoryId && base.history.some(entry => entry.id === selectedPirateHistoryId)
      ? selectedPirateHistoryId
      : undefined;
    if (!historyId && selectedPirateFactionId && !base.factions.some(faction => faction.factionId === selectedPirateFactionId)) {
      historyId = [...base.history].reverse().find(entry => entry.factionId === selectedPirateFactionId)?.id;
      selectedPirateHistoryId = historyId ?? null;
    }
    if (!historyId) selectedPirateFactionId = factionId ?? null;
    renderLoop.setSelectedPirateFactionId(historyId ? null : (factionId ?? null));
    if (historyId || !factionId) audio.stopPirateAmbience('focus-changed');
    else void audio.startPirateHeadquartersAmbience(factionId);
    const presentation = {
      ...base,
      ...(factionId && !historyId ? { selectedFactionId: factionId } : {}),
      ...(historyId ? { selectedHistoryId: historyId } : {}),
    };
    createPirateWatersPanel(uiLayer, presentation, {
      onClose: () => {
        document.getElementById('pirate-waters-panel')?.remove();
        renderLoop.setSelectedPirateFactionId(null);
        audio.stopPirateAmbience('panel-closed');
      },
      onSelectFaction: nextFactionId => {
        selectedPirateFactionId = nextFactionId;
        selectedPirateHistoryId = null;
        renderPanel();
      },
      onSelectHistory: nextHistoryId => {
        selectedPirateHistoryId = nextHistoryId;
        selectedPirateFactionId = null;
        renderPanel();
      },
      onFocus: focusPirateTarget,
      onPayTribute: faction => {
        const result = payPirateTribute(gameState, faction, gameState.currentPlayer);
        applyPirateActionResult(result, 'Pirate tribute paid.');
        renderPanel();
        return result;
      },
      onHireFlotilla: (faction, targetId) => {
        const result = hirePirateFlotilla(gameState, faction, gameState.currentPlayer, targetId);
        applyPirateActionResult(result, 'Pirate flotilla hired.');
        renderPanel();
        return result;
      },
      onOpenAssault: faction => {
        if (selectedUnitId) {
          const pending = preparePirateHeadquartersAssault(gameState, faction, selectedUnitId);
          if (pending.preview.available) {
            openPirateHeadquartersAssault(faction, selectedUnitId);
            return;
          }
        }
        const target = base.factions.find(entry => entry.factionId === faction)?.focusTarget;
        if (target) focusPirateTarget(target);
        showNotification('Select an adjacent available naval combat unit to assault this enclave.', 'info');
      },
    });
  };

  renderPanel();
}

function openPirateHeadquartersAssault(factionId: string, unitId: string): void {
  const pending = preparePirateHeadquartersAssault(gameState, factionId, unitId);
  if (!pending.preview.available) {
    showNotification(pending.preview.reason ?? 'This enclave cannot be assaulted now.', 'warning');
    return;
  }
  const panel = createPirateHeadquartersAssaultPanel(uiLayer, pending, {
    onCancel: () => panel.remove(),
    onConfirm: () => {
      const result = confirmPirateHeadquartersAssault(gameState, pending);
      if (!result.success) {
        panel.remove();
        showNotification(result.reason ?? 'The assault is no longer available.', 'warning');
        if (gameState.units[unitId]) selectUnit(unitId);
        return;
      }
      renderLoop.applyPirateHeadquartersAssaultVisual(factionId, unitId, {
        destroyed: Boolean(result.destroyed),
        attackerSurvived: Boolean(result.state.units[unitId]),
      });
      if (result.destroyed) {
        bus.emit('pirate:headquarters-destroyed', {
          factionId,
          viewerIds: [gameState.currentPlayer],
        });
      }
      gameState = result.state;
      panel.remove();
      renderLoop.setGameState(gameState);
      updateHUD();
      SFX.combat();
      const bountyAwarded = result.events.find(event => event.type === 'faction-destroyed')?.bountyAwarded ?? 0;
      showNotification(
        result.destroyed
          ? `Pirate enclave destroyed. Bounty awarded: ${bountyAwarded} gold.`
          : `Pirate enclave damaged for ${result.damageToHeadquarters ?? 0} integrity.`,
        result.destroyed ? 'success' : 'info',
      );
      if (gameState.units[unitId]) selectUnit(unitId);
      else deselectUnit();
      openPirateWaters({ factionId });
    },
  });
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

  notif.addEventListener('click', () => {
    focusNotificationTarget(next.target);
    dismiss();
  });
  area.innerHTML = '';
  area.appendChild(notif);

  currentDismissTimer = setTimeout(() => {
    if (notif.parentNode) dismiss();
  }, 6000);

  // #594 MR7: religion toasts carry a bespoke sfxCue that replaces the generic synth
  // chime -- see notification-routing.ts's routeReligionFounded/routeReligionCityConverted/
  // routeLoyaltyWarning/routeCityDefected for where sfxCue is set.
  if (next.sfxCue) {
    void audio.playReligionStinger(next.sfxCue).catch(() => {});
  } else {
    SFX.notification();
  }
}

function toggleNotificationLog(): void {
  const existing = document.getElementById('notification-log');
  if (existing) { existing.remove(); return; }

  const ul = document.getElementById('ui-layer');
  if (!ul) return;

  const entries = gameState
    ? getNotificationsForPlayer(gameState.notificationLog ?? {}, gameState.currentPlayer)
    : [];
  const panel = createNotificationLogPanel(entries, {
    onClose: () => panel.remove(),
    onFocusTarget: focusNotificationTarget,
    onOpenCity: (cityId) => {
      panel.remove();
      const city = gameState?.cities[cityId];
      if (city) openCityPanelForCity(city);
    },
    onOpenWonderCity: action => {
      const city = gameState?.cities[action.cityId];
      const definition = getLegendaryWonderDefinition(action.wonderId);
      if (!city || !definition || city.owner !== gameState.currentPlayer
        || !getLegendaryWonderEligibility(gameState, gameState.currentPlayer, city.id, definition).buildable) {
        showNotification('That wonder is no longer available in this city.', 'warning');
        return;
      }
      panel.remove();
      openWonderPanelForCityId(city.id);
    },
    onMarkRead: notificationId => {
      gameState = markNotificationRead(gameState, gameState.currentPlayer, notificationId);
    },
    onReviewPirate: review => {
      const resolved = resolvePirateNotificationReview(gameState, gameState.currentPlayer, review);
      panel.remove();
      if (resolved?.kind === 'active') openPirateWaters({ factionId: resolved.factionId });
      if (resolved?.kind === 'history') openPirateWaters({ historyId: resolved.historyId });
    },
  });

  ul.appendChild(panel);

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
  if (action === 'declare_war') {
    gameState = applyOpportunisticWarPenaltyIfCrisisStruck(gameState, cp, targetCivId, bus);
  }
  renderLoop.setGameState(gameState);
  updateHUD();
  openDiplomacyPanel();
  if (action === 'request_peace') {
    showNotification('Peace requested.', 'info');
  } else {
    showNotification(`Diplomatic action: ${action.replace(/_/g, ' ')}`, 'info');
  }
}

function handleAcceptPeaceRequest(requestId: string): void {
  gameState = acceptDiplomaticRequest(gameState, gameState.currentPlayer, requestId, bus);
  renderLoop.setGameState(gameState);
  updateHUD();
  openDiplomacyPanel();
  showNotification('Peace accepted.', 'success');
}

function handleRejectPeaceRequest(requestId: string): void {
  gameState = rejectDiplomaticRequest(gameState, gameState.currentPlayer, requestId);
  renderLoop.setGameState(gameState);
  updateHUD();
  openDiplomacyPanel();
  showNotification('Peace request rejected.', 'info');
}

function handleAcceptTreatyProposal(requestId: string): void {
  gameState = acceptDiplomaticRequest(gameState, gameState.currentPlayer, requestId, bus);
  renderLoop.setGameState(gameState);
  updateHUD();
  openDiplomacyPanel();
  showNotification('Treaty signed.', 'success');
}

function handleDeclineTreatyProposal(requestId: string): void {
  gameState = rejectDiplomaticRequest(gameState, gameState.currentPlayer, requestId);
  renderLoop.setGameState(gameState);
  updateHUD();
  openDiplomacyPanel();
  showNotification('Proposal declined.', 'info');
}

function handleBreakTreaty(civId: string, treatyType: TreatyType): void {
  const actorId = gameState.currentPlayer;
  const actor = gameState.civilizations[actorId];
  const target = gameState.civilizations[civId];
  if (!actor || !target) return;
  gameState = {
    ...gameState,
    civilizations: {
      ...gameState.civilizations,
      [actorId]: { ...actor, diplomacy: breakTreaty(actor.diplomacy, civId, treatyType, gameState.turn) },
      [civId]: { ...target, diplomacy: breakTreaty(target.diplomacy, actorId, treatyType, gameState.turn) },
    },
  };
  renderLoop.setGameState(gameState);
  updateHUD();
  openDiplomacyPanel();
  showNotification(`${TREATY_LABELS[treatyType]} broken with ${target.name}.`, 'warning');
}

function executeMinorCivConquest(unitId: string, target: HexCoord, minorCivId: string, cityId: string): void {
  const cityName = gameState.cities[cityId]?.name ?? 'City-State';
  const movement = executeAnimatedUnitMove(unitId, () => executeUnitMove(gameState, unitId, target, {
    actor: 'player',
    civId: gameState.currentPlayer,
    bus,
    foreignCityEntryId: cityId,
  }));
  if (!movement.ok) return;
  const movedUnit = gameState.units[unitId];
  if (movedUnit) gameState.units[unitId] = { ...movedUnit, movementPointsLeft: 0 };
  const conquered = conquestMinorCiv(gameState, minorCivId, gameState.currentPlayer);
  gameState = conquered.state;
  emitMinorCivQuestTransitions(bus, conquered.transitions, gameState);
  if (conquered.conquered) bus.emit('minor-civ:destroyed', { minorCivId, conquerorId: gameState.currentPlayer });
  showNotification(`${cityName} has been conquered!`, 'success');
  SFX.tap();
  renderLoop.setGameState(gameState);
  updateHUD();
}

function handleGiftGold(mcId: string): void {
  const result = performMinorCivGift(gameState, gameState.currentPlayer, mcId);
  if (!result.ok) {
    showNotification(result.reason ?? 'Gift unavailable.', 'warning');
    return;
  }
  gameState = result.state;
  emitMinorCivQuestTransitions(bus, result.transitions, gameState);
  showNotification('Gift delivered.', 'info');
  renderLoop.setGameState(gameState);
  updateHUD();
  openDiplomacyPanel();
}

function handleSponsorFestival(mcId: string): void {
  const result = performMinorCivFestival(gameState, gameState.currentPlayer, mcId);
  if (!result.ok) {
    showNotification(result.reason ?? 'Festival unavailable.', 'warning');
    return;
  }
  gameState = result.state;
  emitMinorCivQuestTransitions(bus, result.transitions, gameState);
  showNotification('Festival sponsored.', 'success');
  renderLoop.setGameState(gameState);
  updateHUD();
  openDiplomacyPanel();
}

function handleMinorCivReparations(mcId: string): void {
  const result = performMinorCivReparations(gameState, gameState.currentPlayer, mcId);
  if (!result.ok) {
    showNotification(result.reason ?? 'Reparations unavailable.', 'warning');
    return;
  }
  gameState = result.state;
  showNotification('Reparations paid.', 'success');
  renderLoop.setGameState(gameState);
  updateHUD();
  openDiplomacyPanel();
}

function handleSendAid(crisisId: string): void {
  const check = canSendAid(gameState, gameState.currentPlayer, crisisId);
  if (!check.ok) {
    showNotification('Send Aid unavailable.', 'warning');
    return;
  }
  gameState = applySendAid(gameState, gameState.currentPlayer, crisisId, bus);
  showNotification('Aid sent.', 'success');
  renderLoop.setGameState(gameState);
  updateHUD();
  openDiplomacyPanel();
}

function handleMinorCivWarPeace(mcId: string, currentlyAtWar: boolean): void {
  const result = setMinorCivWarState(gameState, gameState.currentPlayer, mcId, !currentlyAtWar);
  if (!result.ok) return;
  gameState = result.state;
  emitMinorCivQuestTransitions(bus, result.transitions, gameState);
  showNotification(currentlyAtWar ? 'Peace with city-state' : 'War declared on city-state!', currentlyAtWar ? 'success' : 'warning');
  renderLoop.setGameState(gameState);
  updateHUD();
  openDiplomacyPanel();
}

function openDiplomacyPanel(): void {
  drawer?.close();
  document.getElementById('diplomacy-panel')?.remove();
  createDiplomacyPanel(uiLayer, gameState, {
    onAction: handleDiplomaticAction,
    onAcceptPeaceRequest: handleAcceptPeaceRequest,
    onRejectPeaceRequest: handleRejectPeaceRequest,
    onAcceptTreatyProposal: handleAcceptTreatyProposal,
    onDeclineTreatyProposal: handleDeclineTreatyProposal,
    onBreakTreaty: handleBreakTreaty,
    onGiftGold: handleGiftGold,
    onSponsorFestival: handleSponsorFestival,
    onMinorCivReparations: handleMinorCivReparations,
    onMinorCivWarPeace: handleMinorCivWarPeace,
    onSendAid: handleSendAid,
    onClose: () => {},
  });
}

function openMarketplacePanel(): void {
  drawer?.close();
  document.getElementById('marketplace-panel')?.remove();
  createMarketplacePanel(uiLayer, gameState, {
    onClose: () => {},
    onSelectUnit: (unitId) => {
      document.getElementById('marketplace-panel')?.remove();
      selectUnit(unitId);
      const unit = gameState.units[unitId];
      if (unit) renderLoop.camera.centerOn(unit.position);
    },
    onBuyResourceAccess: (sellerCivId, resource) => {
      if (!canBuyResourceAccess(gameState, gameState.currentPlayer, sellerCivId, resource)) return;
      gameState = performBuyResourceAccess(gameState, gameState.currentPlayer, sellerCivId, resource);
      renderLoop.setGameState(gameState);
      updateHUD();
      showNotification(`Purchased ${resource} access for 10 turns.`, 'success');
      openMarketplacePanel(); // re-render panel with updated state
    },
  });
}

function executeUpgrade(
  unitId: string,
  targetType: import('@/core/types').UnitType,
): boolean {
  const result = applyUnitUpgradeToState(gameState, unitId, targetType);
  if (!result.upgraded) return false;
  gameState = result.state;
  renderLoop.setGameState(gameState);
  updateHUD();
  return true;
}

function openWonderPanelForCityId(selectedCityId: string): void {
  if (!gameState.cities[selectedCityId]) return;

  const openWonderPanel = () => {
    document.getElementById('wonder-panel')?.remove();
    createWonderPanel(uiLayer, gameState, selectedCityId, {
      onStartBuild: (buildCityId, wonderId) => {
        gameState = startLegendaryWonderBuild(gameState, gameState.currentPlayer, buildCityId, wonderId, bus);
        const targetCity = gameState.cities[buildCityId];
        if (targetCity) {
          renderLoop.setGameState(gameState);
          updateHUD();
          const productionItemId = `legendary:${wonderId}`;
          if (targetCity.productionQueue[0] === productionItemId) {
            showNotification(`${targetCity.name}: preparing ${getProductionDisplayName(productionItemId)}`, 'info');
          } else {
            showNotification(`${targetCity.name}: ${getProductionDisplayName(productionItemId)} is not ready to start.`, 'warning');
          }
          openWonderPanel();
        }
      },
      onClose: () => {
        document.getElementById('wonder-panel')?.remove();
      },
    });
  };
  gameState = initializeLegendaryWonderProjectsForCity(gameState, gameState.currentPlayer, selectedCityId);
  openWonderPanel();
}

function openCityOverviewPanel(): void {
  drawer?.close();
  const existing = document.getElementById('city-overview-panel');
  if (existing) existing.remove();
  createCityOverviewPanel(uiLayer, gameState, {
    onOpenCity: (cityId) => {
      const overview = document.getElementById('city-overview-panel');
      overview?.remove();
      const city = gameState.cities[cityId];
      if (city) openCityPanelForCity(city);
    },
    onAppeaseFaction: (cityId) => {
      handleAppeaseFaction(cityId);
      openCityOverviewPanel(); // re-render with updated unrest/gold state
    },
    onConcedeToMovement: (cityId) => {
      handleConcedeToMovement(cityId);
      openCityOverviewPanel(); // re-render with updated unrest/gold state
    },
    onClose: () => {
      document.getElementById('city-overview-panel')?.remove();
    },
  });
}

function handleAppeaseFaction(cityId: string): typeof gameState {
  const targetCity = gameState.cities[cityId];
  if (!targetCity) return gameState;
  const result = appeaseFaction(gameState, cityId, gameState.currentPlayer);
  if (!result.success) {
    showNotification(result.message, 'warning');
    return gameState;
  }
  gameState = result.state;
  renderLoop.setGameState(gameState);
  updateHUD();
  showNotification(result.message, 'success');
  return gameState;
}

function handleConcedeToMovement(cityId: string): typeof gameState {
  const targetCity = gameState.cities[cityId];
  if (!targetCity) return gameState;
  const result = concedeToMovement(gameState, cityId, gameState.currentPlayer);
  if (!result.success) {
    showNotification(result.message, 'warning');
    return gameState;
  }
  gameState = result.state;
  bus.emit('faction:unrest-resolved', { cityId, owner: gameState.currentPlayer });
  bus.emit('faction:concession-made', { cityId, owner: gameState.currentPlayer, concessionType: 'charter' });
  renderLoop.setGameState(gameState);
  updateHUD();
  showNotification(result.message, 'success');
  return gameState;
}

function openCityPanelForCity(city: import('@/core/types').City): void {
  drawer?.close();
  if (city.owner !== gameState.currentPlayer) return;
  const playerCities = currentCiv().cities;
  const idx = playerCities.indexOf(city.id);
  if (idx !== -1) currentCityIndex = (idx + 1) % playerCities.length;

  createCityPanel(uiLayer, city, gameState, {
    onBuild: (cityId, itemId) => {
      const targetCity = gameState.cities[cityId];
      if (targetCity) {
        try {
          gameState.cities[cityId] = enqueueCityProduction(targetCity, itemId);
          renderLoop.setGameState(gameState);
          showNotification(`${targetCity.name}: queued ${getProductionDisplayName(itemId)}`, 'info');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Queue limit reached';
          showNotification(`${targetCity.name}: ${message}`, 'warning');
        }
      }
    },
    onMoveQueueItem: (cityId, fromIndex, toIndex) => {
      const targetCity = gameState.cities[cityId];
      if (!targetCity) return;
      gameState.cities[cityId] = reorderCityProduction(targetCity, fromIndex, toIndex);
      renderLoop.setGameState(gameState);
    },
    onRemoveQueueItem: (cityId, index) => {
      const targetCity = gameState.cities[cityId];
      if (!targetCity) return;
      gameState.cities[cityId] = {
        ...targetCity,
        productionQueue: removeQueuedId(targetCity.productionQueue, index),
        productionProgress: index === 0 ? 0 : targetCity.productionProgress,
      };
      renderLoop.setGameState(gameState);
    },
    onOpenWonderPanel: (selectedCityId) => {
      openWonderPanelForCityId(selectedCityId);
    },
    onSetCityFocus: (cityId, focus) => {
      const result = assignCityFocus(gameState, cityId, focus);
      gameState = result.state;
      renderLoop.setGameState(gameState);
      updateHUD();
      showNotification(`${gameState.cities[cityId].name} reassigned citizens for ${focus} focus.`, 'info');
      return gameState;
    },
    onToggleWorkedTile: (cityId, coord, worked) => {
      const result = setCityWorkedTile(gameState, cityId, coord, worked);
      gameState = result.state;
      renderLoop.setGameState(gameState);
      updateHUD();
      if (!result.changed && result.reason === 'claimed') {
        showNotification('That tile is already worked by another city.', 'warning');
      }
      return gameState;
    },
    onClose: () => {},
    onTip: (message) => { showNotification(message, 'info'); },
    onSelectUnit: (unitId) => selectUnit(unitId),
    onEstablishRoute: handleEstablishRoute,
    onPrevCity: () => {
      const cities = currentCiv().cities;
      if (cities.length <= 1) return;
      const currentIdx = cities.indexOf(city.id);
      const prevIdx = (currentIdx - 1 + cities.length) % cities.length;
      const prevCity = gameState.cities[cities[prevIdx]];
      if (prevCity) openCityPanelForCity(prevCity);
    },
    onNextCity: () => {
      const cities = currentCiv().cities;
      if (cities.length <= 1) return;
      const currentIdx = cities.indexOf(city.id);
      const nextIdx = (currentIdx + 1) % cities.length;
      const nextCity = gameState.cities[cities[nextIdx]];
      if (nextCity) openCityPanelForCity(nextCity);
    },
    onUpgradeUnit: (unitId) => {
      const unit = gameState.units[unitId];
      if (!unit || unit.owner !== gameState.currentPlayer) return;
      const civ = gameState.civilizations[gameState.currentPlayer];
      const completedTechs = civ?.techState?.completed ?? [];
      const homeCity = Object.values(gameState.cities).find(
        c => c.owner === unit.owner &&
             c.position.q === unit.position.q &&
             c.position.r === unit.position.r,
      );
      if (!homeCity) return;
      const upgrade = canUpgradeUnit(unit, homeCity.id, gameState.cities, completedTechs, undefined, getCivAvailableResources(gameState, unit.owner));
      if (!upgrade.canUpgrade || !upgrade.targetType) return;
      if (civ.gold < upgrade.cost) {
        showNotification('Not enough gold to upgrade!', 'warning');
        return;
      }
      if (executeUpgrade(unitId, upgrade.targetType)) {
        showNotification(`Upgraded to ${UNIT_DEFINITIONS[upgrade.targetType].name}!`, 'success');
      }
    },
    onSetIdleProduction: (cityId, mode) => {
      const targetCity = gameState.cities[cityId];
      if (!targetCity) return;
      gameState.cities[cityId] = setIdleProduction(targetCity, mode);
      renderLoop.setGameState(gameState);
    },
    onRushBuyActiveProduction: (cityId) => {
      const targetCity = gameState.cities[cityId];
      if (!targetCity) return gameState;
      const result = rushBuyActiveProduction(gameState, gameState.currentPlayer, cityId, bus);
      if (!result.success) {
        showNotification(result.message, 'warning');
        return gameState;
      }
      gameState = result.state;
      renderLoop.setGameState(gameState);
      updateHUD();
      showNotification(`${targetCity.name}: rush bought ${result.label} for ${result.cost} gold.`, 'success');
      return gameState;
    },
    onAppeaseFaction: (cityId) => handleAppeaseFaction(cityId),
    onConcedeToMovement: (cityId) => handleConcedeToMovement(cityId),
    onQuarantineCrisis: (crisisId, cityId) => {
      const result = applyQuarantine(gameState, crisisId, cityId);
      if (!result.success) {
        showNotification(result.message, 'warning');
        return gameState;
      }
      gameState = result.state;
      renderLoop.setGameState(gameState);
      updateHUD();
      showNotification(result.message, 'success');
      return gameState;
    },
    onRemedyCrisis: (crisisId, cityId) => {
      const result = applyRemedy(gameState, crisisId, cityId);
      if (!result.success) {
        showNotification(result.message, 'warning');
        return gameState;
      }
      gameState = result.state;
      renderLoop.setGameState(gameState);
      updateHUD();
      showNotification(result.message, 'success');
      return gameState;
    },
    onFindResources: (highlights, toasts) => {
      renderLoop.setHighlights(highlights.map(coord => ({ coord, type: 'worker-buildable' as const })));
      for (const t of toasts) showNotification(t.message, t.type);
    },
    onChooseCircularManufacturingMaterial: (material) => {
      try {
        gameState = chooseCircularManufacturingMaterial(gameState, gameState.currentPlayer, material);
      } catch (error) {
        showNotification(error instanceof Error ? error.message : 'That material choice is unavailable.', 'warning');
        return;
      }
      renderLoop.setGameState(gameState);
      showNotification(`Circular Manufacturing Network will substitute ${material.replaceAll('-', ' ')} when it helps.`, 'success');
      const refreshedCity = gameState.cities[city.id];
      if (refreshedCity) openCityPanelForCity(refreshedCity);
    },
  });
}

function closeRequiredChoicePanel(): void {
  document.getElementById('required-choice-panel')?.remove();
  setBlockingOverlay(null);
}

// #591 MR4: a founded-but-boonless religion has NO effects until the owner chooses —
// re-prompted every time the owner attempts to end their turn, same blocking pattern as
// showRequiredChoicesIfNeeded (the only other "must decide before proceeding" surface
// in this file), so a human owner can never leave their own religion pending forever.
function showReligionBoonIfNeeded(): boolean {
  const civId = gameState.currentPlayer;
  const civ = gameState.civilizations[civId];
  if (!civ?.isHuman) return false;
  const ownReligion = Object.values(gameState.religions ?? {}).find(r => r.ownerCivId === civId);
  if (!ownReligion || ownReligion.boon !== undefined) {
    document.getElementById('religion-boon-modal')?.remove();
    return false;
  }
  if (document.getElementById('religion-boon-modal')) return true;

  closePlanningPanels(document);
  setBlockingOverlay('religion-boon');
  createReligionBoonModal(uiLayer, {
    religionName: ownReligion.name,
    onChooseBoon: (boon) => {
      gameState = chooseBoon(gameState, ownReligion.id, boon);
      document.getElementById('religion-boon-modal')?.remove();
      setBlockingOverlay(null);
      showNotification(`${ownReligion.name} now grants ${boon}.`, 'success');
      renderLoop.setGameState(gameState);
      updateHUD();
    },
  });
  return true;
}

function refreshRequiredChoicesAfterAction(): void {
  document.getElementById('required-choice-panel')?.remove();
  closePlanningPanels(document);
  renderLoop.setGameState(gameState);
  updateHUD();
  showRequiredChoicesIfNeeded();
}

function showRequiredChoicesIfNeeded(): boolean {
  const civId = gameState.currentPlayer;
  const idleCityIds = getIdleCityIds(gameState, civId);
  const missingResearch = needsResearchChoice(gameState, civId);
  const existing = document.getElementById('required-choice-panel');

  if (!idleCityIds.length && !missingResearch) {
    closeRequiredChoicePanel();
    return false;
  }

  if (existing) {
    return true;
  }

  closePlanningPanels(document);

  const civ = currentCiv();
  const sciencePerTurn = Math.max(
    1,
    civ.cities
      .reduce((total, cityId) => total + calculateProjectedCityYields(gameState, cityId).science, 0),
  );
  const researchChoices = missingResearch
    ? getAvailableTechs(civ.techState).slice(0, 3).map(tech => ({
      techId: tech.id,
      label: tech.name,
      turns: estimateTurnsToComplete({ cost: getEffectiveTechCost(tech, civ.techState.completed), outputPerTurn: sciencePerTurn }),
    }))
    : [];

  const cityChoices = idleCityIds
    .map(cityId => {
      const city = gameState.cities[cityId];
      const choice = getRecommendedIdleCityChoice(gameState, civId, cityId);
      if (!city || !choice) {
        return null;
      }
      return {
        cityId,
        cityName: city.name,
        itemId: choice.itemId,
        label: choice.label,
        turns: choice.turns,
      };
    })
    .filter((choice): choice is NonNullable<typeof choice> => choice !== null);

  setBlockingOverlay('required-choice');
  createRequiredChoicePanel(uiLayer, {
    researchChoices,
    cityChoices,
    onChooseResearch: (techId) => {
      currentCiv().techState = enqueueResearch(currentCiv().techState, techId);
      showNotification(`Researching ${techId}...`, 'info');
      refreshRequiredChoicesAfterAction();
    },
    onChooseCityBuild: (cityId, itemId) => {
      const city = gameState.cities[cityId];
      if (!city) return;
      gameState.cities[cityId] = enqueueCityProduction(city, itemId);
      showNotification(`${city.name}: queued ${itemId}`, 'info');
      refreshRequiredChoicesAfterAction();
    },
    onOpenTech: () => {
      closeRequiredChoicePanel();
      togglePanel('tech');
    },
    onOpenCity: (cityId) => {
      const city = gameState.cities[cityId];
      if (!city) return;
      closeRequiredChoicePanel();
      openCityPanelForCity(city);
    },
  });

  return true;
}

function togglePanel(panel: string): void {
  drawer?.close();
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
      onQueueResearch: (techId) => {
        try {
          currentCiv().techState = enqueueResearch(currentCiv().techState, techId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Queue limit reached';
          showNotification(message, 'warning');
          return;
        }
        renderLoop.setGameState(gameState);
        updateHUD();
        showNotification(`Queued research: ${techId}`, 'info');
      },
      onMoveQueuedResearch: (fromIndex, toIndex) => {
        currentCiv().techState = {
          ...currentCiv().techState,
          researchQueue: moveQueuedId(currentCiv().techState.researchQueue, fromIndex, toIndex),
        };
        renderLoop.setGameState(gameState);
        updateHUD();
      },
      onRemoveQueuedResearch: (index) => {
        currentCiv().techState = {
          ...currentCiv().techState,
          researchQueue: removeQueuedId(currentCiv().techState.researchQueue, index),
        };
        renderLoop.setGameState(gameState);
        updateHUD();
      },
      onClose: () => {},
    });
  } else if (panel === 'city') {
    openCityOverviewPanel();
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
      // #524 MR2a review fix: flip_loyalty can never succeed against a capital (see
      // resolveMissionResult's guard in espionage-system.ts) -- don't offer it as a
      // choice when the spy's current target already is one. Without this, a spy
      // stationed in an enemy capital could "succeed" an 8-turn flip_loyalty mission
      // that silently does nothing, with no explanation.
      const spyTargetsCapital = Boolean(
        spy?.targetCivId && spy.targetCityId
          && getCapitalCityId(gameState, spy.targetCivId) === spy.targetCityId,
      );
      const missions = getAvailableMissions(completedTechs)
        .filter(mission => !missionRequiresPlacedSpy(mission) || Boolean(spy?.targetCivId))
        .filter(mission => mission !== 'flip_loyalty' || !spyTargetsCapital);
      if (missions.length === 0) {
        showNotification('No missions available for this spy.', 'info');
        return null;
      }
      return window.prompt(`Choose mission:\n${missions.join('\n')}`, missions[0]);
    };

    uiLayer.appendChild(createEspionagePanel(gameState, {
      onClose: () => document.getElementById('espionage-panel')?.remove(),
      onAssignDefensive: (spyId) => {
        const target = chooseFriendlyCityTarget();
        if (!target) return;
        gameState.espionage![gameState.currentPlayer] = embedSpy(
          gameState.espionage![gameState.currentPlayer],
          spyId,
          target.cityId,
          target.position,
        );
        const unit = gameState.units[spyId];
        if (unit) {
          delete gameState.units[spyId];
          gameState.civilizations[gameState.currentPlayer].units =
            gameState.civilizations[gameState.currentPlayer].units.filter(id => id !== spyId);
        }
        renderLoop.setGameState(gameState);
        togglePanel('espionage');
        const cityName = gameState.cities[target.cityId]?.name ?? target.cityId;
        showNotification(`Spy embedded in ${cityName}. Counter-intelligence boosted.`, 'info');
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
      onExfiltrate: (spyId) => {
        const ownerEsp = gameState.espionage?.[gameState.currentPlayer];
        const spy = ownerEsp?.spies[spyId];
        if (!spy || spy.status !== 'stationed') return;
        const capital = getCapitalCity(gameState, gameState.currentPlayer);
        if (!capital) { showNotification('Cannot exfiltrate — no capital found.', 'warning'); return; }

        // Spawn occupancy: find a free tile at/near the capital
        const existingPositions = new Set(
          Object.values(gameState.units).map(u => `${u.position.q},${u.position.r}`),
        );
        let spawnPos = capital.position;
        if (existingPositions.has(`${spawnPos.q},${spawnPos.r}`)) {
          const adjacent = hexesInRange(capital.position, 1).filter(
            c => !(c.q === capital.position.q && c.r === capital.position.r) &&
                 !existingPositions.has(`${c.q},${c.r}`) &&
                 gameState.map.tiles[hexKey(c)],
          );
          if (adjacent.length === 0) {
            showNotification('Cannot exfiltrate — no free tile near capital.', 'warning');
            return;
          }
          spawnPos = adjacent[0];
        }

        const newUnit = createUnit(spy.unitType, gameState.currentPlayer, spawnPos, gameState.idCounters);
        gameState.units[newUnit.id] = newUnit;
        gameState.civilizations[gameState.currentPlayer].units =
          [...(gameState.civilizations[gameState.currentPlayer].units ?? []), newUnit.id];
        const updatedSpy = {
          ...spy, id: newUnit.id, status: 'cooldown' as const,
          cooldownTurns: 8, infiltrationCityId: null, cityVisionTurnsLeft: 0, targetCivId: null, cooldownMode: undefined,
        };
        const { [spyId]: _old, ...rest } = ownerEsp!.spies;
        gameState.espionage![gameState.currentPlayer] = { ...ownerEsp!, spies: { ...rest, [newUnit.id]: updatedSpy } };
        renderLoop.setGameState(gameState);
        // Refresh panel in place
        document.getElementById('espionage-panel')?.remove();
        togglePanel('espionage');
        showNotification('Spy exfiltrated. Available again in 8 turns.', 'info');
      },
      onToggleCooldownMode: (spyId) => {
        const civEsp = gameState.espionage?.[gameState.currentPlayer];
        const spy = civEsp?.spies[spyId];
        if (!spy || spy.status !== 'cooldown') return;
        const next: 'stay_low' | 'passive_observe' =
          (spy.cooldownMode ?? 'stay_low') === 'passive_observe' ? 'stay_low' : 'passive_observe';
        gameState = {
          ...gameState,
          espionage: {
            ...gameState.espionage!,
            [gameState.currentPlayer]: {
              ...civEsp!,
              spies: { ...civEsp!.spies, [spyId]: { ...spy, cooldownMode: next } },
            },
          },
        };
        renderLoop.setGameState(gameState);
        document.getElementById('espionage-panel')?.remove();
        togglePanel('espionage');
      },
      onUnembed: (spyId) => {
        const ownerEsp = gameState.espionage?.[gameState.currentPlayer];
        const spy = ownerEsp?.spies[spyId];
        if (!spy || spy.status !== 'embedded' || !spy.targetCityId) return;
        const city = gameState.cities[spy.targetCityId];
        if (!city) return;
        const newUnit = createUnit(spy.unitType, gameState.currentPlayer, city.position, gameState.idCounters);
        gameState.units[newUnit.id] = newUnit;
        gameState.civilizations[gameState.currentPlayer].units.push(newUnit.id);
        const unembedded = unembedSpy(ownerEsp!, spyId);
        const rekeyed = { ...unembedded.spies[spyId], id: newUnit.id };
        const { [spyId]: _old, ...rest } = unembedded.spies;
        gameState.espionage![gameState.currentPlayer] = { ...unembedded, spies: { ...rest, [newUnit.id]: rekeyed } };
        renderLoop.setGameState(gameState);
        document.getElementById('espionage-panel')?.remove();
        togglePanel('espionage');
        showNotification(`Spy recalled from ${city.name}. Available in 5 turns.`, 'info');
      },
      onSweep: (spyId) => {
        const ownerEsp = gameState.espionage?.[gameState.currentPlayer];
        if (!ownerEsp) return;
        const seed = `sweep-${spyId}-${gameState.turn}`;
        const { detectedSpyIds, state: updatedEsp } = attemptSweep(ownerEsp, spyId, seed, gameState);
        gameState.espionage![gameState.currentPlayer] = updatedEsp;
        if (detectedSpyIds.length > 0) {
          showNotification(`Sweep detected ${detectedSpyIds.length} enemy spy(ies) in the city!`, 'warning');
        } else {
          showNotification('Sweep complete — no enemy spies detected.', 'info');
        }
        renderLoop.setGameState(gameState);
        document.getElementById('espionage-panel')?.remove();
        togglePanel('espionage');
      },
    }));
  } else if (panel === 'diplomacy') {
    openDiplomacyPanel();
  } else if (panel === 'marketplace') {
    openMarketplacePanel();
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
    voiceVolume:    persistedSettings.voiceVolume    ?? 1.0,
    voiceEnabled:   persistedSettings.voiceEnabled   ?? true,
    stingerVolume:  persistedSettings.stingerVolume  ?? 1.0,
    stingerEnabled: persistedSettings.stingerEnabled ?? true,
    tutorialEnabled: persistedSettings.tutorialEnabled,
    advisorsEnabled: persistedSettings.advisorsEnabled,
    councilTalkLevel: persistedSettings.councilTalkLevel,
  };
}

function openUnitStackPicker(coord: HexCoord, unitIds: string[]): void {
  const panel = document.getElementById('info-panel');
  if (!panel) return;

  renderUnitStackPanel(panel, gameState, coord, unitIds, {
    onSelectUnit: (unitId) => selectUnit(unitId),
    onOpenCity: (cityId) => {
      const city = gameState.cities[cityId];
      if (!city) return;
      document.getElementById('tech-panel')?.remove();
      document.getElementById('city-panel')?.remove();
      document.getElementById('espionage-panel')?.remove();
      document.getElementById('diplomacy-panel')?.remove();
      document.getElementById('marketplace-panel')?.remove();
      document.getElementById('council-panel')?.remove();
      deselectUnit();
      openCityPanelForCity(city);
    },
    onClose: () => deselectUnit(),
  }, { selectedUnitId });
}

function openNetworkIntentPanel(sourceUnitId: string): void {
  const source = gameState.units[sourceUnitId];
  const ownerCivId = gameState.currentPlayer;
  if (!source || source.owner !== ownerCivId || !isAutonomyActivated(gameState, ownerCivId)) {
    showNotification('This unit cannot coordinate the network right now.', 'warning');
    return;
  }
  if (source.type === 'drone_controller') {
    // Formation targets are generated and previewed by the same full Network
    // panel used for city plans, so the controller never receives a UI-only
    // legality shortcut.
    openNetworkPanel();
    return;
  }
  if (source.type !== 'cyber_unit') {
    showNotification('Only a Cyber Unit or Drone Controller can coordinate the network.', 'warning');
    return;
  }

  let panel: HTMLElement | undefined;
  const close = () => panel?.remove();
  panel = createNetworkIntentPanel(gameState, ownerCivId, sourceUnitId, {
    onAssign: (definitionId, cityId) => {
      const current = Object.values(gameState.autonomyByCiv?.[ownerCivId]?.plans ?? {})
        .find(plan => plan.sourceUnitId === sourceUnitId);
      const stateForAssignment = current && current.definitionId !== definitionId
        ? holdNetworkPlan(gameState, ownerCivId, sourceUnitId).state
        : gameState;
      const result = current && current.definitionId === definitionId
        ? retargetNetworkPlan(gameState, ownerCivId, current.id, { kind: 'city', cityId })
        : assignNetworkPlan(stateForAssignment, {
          ownerCivId,
          sourceUnitId,
          definitionId,
          target: { kind: 'city', cityId },
        });
      if (!result.validation.ok) {
        showNotification('That network intent is no longer available. Choose another target.', 'warning');
        close();
        openNetworkIntentPanel(sourceUnitId);
        return;
      }
      gameState = result.state;
      renderLoop.setGameState(gameState);
      updateHUD();
      close();
      selectUnit(sourceUnitId);
      const cityName = gameState.cities[cityId]?.name ?? 'the city';
      showNotification(`${definitionId === 'harden' ? 'Harden' : 'Exploit'} assigned to ${cityName}.`, 'success');
    },
    onHold: () => {
      const result = holdNetworkPlan(gameState, ownerCivId, sourceUnitId);
      gameState = result.state;
      renderLoop.setGameState(gameState);
      updateHUD();
      close();
      selectUnit(sourceUnitId);
      showNotification('Cyber Unit is holding.', 'info');
    },
    onClose: close,
  });
  uiLayer.appendChild(panel);
}

function openNetworkPanel(): void {
  const civId = gameState.currentPlayer;
  if (!isAutonomyActivated(gameState, civId)) return;
  let panel: HTMLElement | undefined;
  const rerender = () => {
    panel?.remove();
    panel = createNetworkPanel(getNetworkPanelModel(gameState, civId), {
      onAssign: request => {
        const result = assignNetworkPlan(gameState, request);
        if (!result.validation.ok) {
          showNotification('That plan is no longer available.', 'warning');
          rerender();
          return;
        }
        gameState = result.state;
        renderLoop.setGameState(gameState);
        updateHUD();
        showNotification('Network plan assigned.', 'success');
        rerender();
      },
      onCancel: planId => {
        gameState = cancelNetworkPlan(gameState, civId, planId).state;
        renderLoop.setGameState(gameState);
        updateHUD();
        rerender();
      },
      onSurge: planId => {
        const result = beginAutonomySurge(gameState, civId, planId);
        if (!result.validation.ok) showNotification('Surge is unavailable while the network recovers or cools down.', 'warning');
        else {
          gameState = result.state;
          renderLoop.setGameState(gameState);
          updateHUD();
          bus.emit('network:audio-cue', { cue: 'surge', viewerIds: [civId] });
          showNotification('Network Surge confirmed.', 'success');
        }
        rerender();
      },
      onPosture: posture => {
        gameState = requestAutonomyPosture(gameState, civId, posture);
        updateHUD();
        rerender();
      },
      onClose: () => panel?.remove(),
    });
    uiLayer.appendChild(panel);
  };
  rerender();
}

// Trade Routes Overhaul (#553 MR4/4) — extracted so the City panel's Trade Routes
// section and selected-unit-info's Establish Route button trigger the exact same code
// path (per ui-panels.md's Extracted UI Flows rule), not two copies that could drift.
function handleEstablishRoute(caravanId: string): void {
  openEstablishRoutePanel(uiLayer, gameState, caravanId, (toCityId) => {
    const resourceDiversity = getCivAvailableResources(gameState, gameState.currentPlayer).size;
    const routeResult = establishQuestAwareRoute(gameState, caravanId, toCityId, resourceDiversity);
    gameState = routeResult.state;
    emitMinorCivQuestTransitions(bus, routeResult.questTransitions, gameState);
    bus.emit('trade:route-created', { route: routeResult.route });
    renderLoop.setGameState(gameState);
    updateHUD();
    selectUnit(caravanId);
    showNotification('Trade route established!', 'success');
  });
}

function selectUnit(
  unitId: string,
  opts?: {
    pendingUnloadUnitName?: string;
    suppressSelectionSfx?: boolean;
  },
): void {
  if (renderLoop.hasMovingUnit(unitId)) {
    showNotification('Unit is moving.', 'info');
    return;
  }
  const unit = gameState.units[unitId];
  if (!unit || unit.owner !== gameState.currentPlayer) return;
  selectedUnitId = unitId;
  renderLoop.setSelectedUnitId(unitId);

  const highlightResult = buildSelectedUnitHighlights(gameState, unitId);
  selectedUnitWaterRecovery = highlightResult.waterRecovery;
  if (gameState.units[unitId]?.committedToRouteId) {
    // Committed caravans cannot move or attack — keep highlights empty
    movementRange = [];
    attackRange = [];
    clearUnloadState();
  } else {
    movementRange = highlightResult.movementRange;
    attackRange = highlightResult.attackTargets.map(target => target.coord);
  }
  renderLoop.setHighlights(highlightResult.highlights);

  // Update journey path overlay
  if (unit.automation?.mode === 'journey') {
    const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
    const completedTechs = gameState.civilizations[unit.owner]?.techState.completed ?? [];
    const path = findPath(unit.position, unit.automation.destination, gameState.map, domain, { unit, completedTechs });
    renderLoop.setJourneyPath(path);
  } else {
    renderLoop.setJourneyPath(null);
  }

  // Show unit info panel
  const panel = document.getElementById('info-panel');
  if (panel) {
    renderSelectedUnitInfo(panel, gameState, unitId, {
      onClose: () => deselectUnit(),
      onStartIntercept: uid => {
        const result = startIntercept(gameState, uid);
        if (!result.ok) {
          showNotification('That fighter cannot enter intercept stance now.', 'warning');
          return;
        }
        gameState = result.state;
        renderLoop.setGameState(gameState);
        updateHUD();
        SFX.airScramble();
        selectUnit(uid);
        renderLoop.setHighlights(getInterceptCoverage(gameState, uid).map(coord => ({ coord, type: 'air-intercept' as const })));
      },
      getAirRebaseDestinations: uid => getLegalRebaseDestinations(gameState, uid).map(base => {
        const position = base.kind === 'city' ? gameState.cities[base.cityId]?.position : gameState.units[base.unitId]?.position;
        const name = base.kind === 'city'
          ? gameState.cities[base.cityId]?.name ?? base.cityId
          : UNIT_DEFINITIONS[gameState.units[base.unitId]?.type ?? 'carrier'].name;
        return { base, label: `${name} (${getAirBaseRoster(gameState, base).length}/${getAirBaseCapacity(gameState, base)})${position ? '' : ''}` };
      }),
      onRebaseAircraft: (uid, base) => {
        const result = rebaseAircraft(gameState, uid, base);
        if (!result.ok) {
          showNotification('That base is no longer reachable.', 'warning');
          return;
        }
        gameState = result.state;
        renderLoop.setGameState(gameState);
        updateHUD();
        SFX.airRebase();
        selectUnit(uid);
      },
      onStartAirMission: (uid, mission) => {
        pendingAirMission = { unitId: uid, mission };
        const targets = getLegalAirMissionTargets(gameState, uid, mission);
        movementRange = [];
        attackRange = [];
        selectUnit(uid);
        renderLoop.setHighlights(targets.map(coord => ({
          coord,
          type: mission === 'strike' ? 'air-strike' as const : 'air-recon' as const,
        })));
        showNotification(mission === 'strike' ? 'Tap a hostile target within operational range, or cancel.' : 'Tap a recon center within operational range, or cancel.', 'info');
      },
      onCancelAirMission: uid => {
        if (pendingAirMission?.unitId !== uid) return;
        pendingAirMission = null;
        selectUnit(uid);
        showNotification('Air mission cancelled.', 'info');
      },
      onOpenNetworkIntent: uid => openNetworkIntentPanel(uid),
      onUsePropagandistAction: (uid, action, cityId) => {
        const result = usePropagandistAction(gameState, uid, action, cityId);
        if (!result.ok) {
          showNotification('That civic action is no longer available.', 'warning');
          return;
        }
        gameState = result.state;
        renderLoop.setGameState(gameState);
        updateHUD();
        showNotification(result.message, action === 'rally' ? 'success' : 'warning');
        selectUnit(uid);
      },
      onFoundCity: () => foundCityAction(),
      onWorkerAction: action => performWorkerAction(action),
      onPreach: (unitId, cityId) => performPreach(unitId, cityId),
      onRest: () => restAction(),
      onSkipTurn: uid => getUnitTurnFlow().skipUnitAction(uid),
      onDeleteUnit: uid => getUnitTurnFlow().showDeleteUnitConfirmation(uid),
      onFortify: uid => {
        const unit = gameState.units[uid];
        if (!unit || unit.owner !== gameState.currentPlayer) return;
        if (unit.isFortified) {
          gameState = unfortifyUnitInState(gameState, gameState.currentPlayer, uid);
          showNotification('Unit unfortified.', 'info');
        } else {
          gameState = fortifyUnitInState(gameState, gameState.currentPlayer, uid);
          showNotification('Unit fortified. +25% defense until unfortified or moved.', 'info');
        }
        renderLoop.setGameState(gameState);
        updateHUD();
        selectUnit(uid);
      },
      onPillage: uid => {
        const unit = gameState.units[uid];
        if (!unit || unit.owner !== gameState.currentPlayer) return;
        const tile = gameState.map.tiles[hexKey(unit.position)];
        if (!tile || !canPillageTile(tile, unit.owner)) return;

        const hasFinishedImprovement = tile.improvement !== 'none' && tile.improvementTurnsLeft === 0;
        const goldPreview = hasFinishedImprovement ? getPillageGoldReward(tile.improvement) : 0;
        const targetLabel = hasFinishedImprovement ? getImprovementDisplayName(tile.improvement) : 'the road';
        const preview = goldPreview > 0
          ? `Pillage ${targetLabel}?\n\n+${goldPreview} gold, unit heals +25 HP.`
          : `Pillage ${targetLabel}?\n\nUnit heals +25 HP.`;
        if (!window.confirm(preview)) return;

        if (tile.owner && isMajorCivOwner(tile.owner)) {
          ensurePlayerWarState(tile.owner);
        }

        const result = applyPillageToState(gameState, uid);
        if (!result.ok) return;
        gameState = result.state;
        showNotification(
          result.goldAwarded! > 0 ? `Pillaged ${targetLabel} for ${result.goldAwarded} gold.` : `Pillaged ${targetLabel}.`,
          'success',
        );
        renderLoop.setGameState(gameState);
        updateHUD();
        selectUnit(uid);
      },
      onCancelAutoExplore: () => cancelAutoExplore(unitId),
      onCancelJourney: () => cancelJourney(unitId),
      onOpenStack: (coord) => {
        handleFriendlyUnitStackTap(gameState, coord, selectedUnitId, {
          onSelectUnit: selectUnit,
          onOpenStackPicker: openUnitStackPicker,
        });
      },
      getTransportOptions: uid => {
        const selectedUnit = gameState.units[uid];
        const needs = selectedUnit ? getUnitCargoSize(selectedUnit) : 1;
        return Object.values(gameState.units)
          .filter(candidate => {
            const def = UNIT_DEFINITIONS[candidate.type];
            return (def?.domain ?? 'land') === 'naval' && def?.cargoCapacity !== undefined
              && candidate.owner === gameState.currentPlayer;
          })
          .map(candidate => {
            const used  = getTransportCargoUsed(gameState, candidate.id);
            const cap   = getTransportCapacity(candidate);
            const free  = cap - used;
            const fits  = needs <= free;
            const suffix = !fits
              ? ` — needs ${needs} slots, ${free} remaining`
              : free - needs === 0
                ? ' — last slot'
                : ` — ${free} of ${cap} slots free`;
            return {
              transportId: candidate.id,
              label: `Load onto ${UNIT_DEFINITIONS[candidate.type]?.name ?? 'Transport'}${suffix}`,
              disabled: !fits,
              tooltip: !fits
                ? `${UNIT_DEFINITIONS[selectedUnit?.type ?? 'warrior']?.name ?? 'This unit'} requires ${needs} cargo slots. A Galleon or larger transport is needed.`
                : undefined,
            };
          })
          .filter(o => canLoadUnitOntoTransport(gameState, uid, o.transportId).ok || o.disabled);
      },
      getCargoBoardInfo: transportId => getTransportCargo(gameState, transportId).map(cargoUnit => ({
        cargoUnitId: cargoUnit.id,
        label: UNIT_DEFINITIONS[cargoUnit.type]?.name ?? cargoUnit.type,
        slotCost: getUnitCargoSize(cargoUnit),
        canUnload: !cargoUnit.hasActed && cargoUnit.movementPointsLeft > 0,
      })),
      onSelectCargoToUnload: (transportId, cargoUnitId) => {
        const range = getUnloadDestinations(gameState, transportId, cargoUnitId);
        setPendingUnload({ transportId, cargoUnitId }, range);
        renderLoop.setHighlights(range.map(coord => ({ coord, type: 'move' as const })));
        const cargoUnit = gameState.units[cargoUnitId];
        const unitName = UNIT_DEFINITIONS[cargoUnit?.type ?? 'warrior']?.name ?? 'Unit';
        selectUnit(transportId, { pendingUnloadUnitName: unitName });
      },
      onCancelUnload: () => {
        clearUnloadState();
        renderLoop.clearHighlights();
        if (selectedUnitId) selectUnit(selectedUnitId);
      },
      pendingUnloadUnitName: opts?.pendingUnloadUnitName,
      getPirateAssaultAction: uid => {
        const pending = findAvailablePirateHeadquartersAssault(gameState, gameState.currentPlayer, uid);
        if (!pending) return null;
        const faction = getPirateWatersPresentation(gameState, gameState.currentPlayer).factions
          .find(entry => entry.factionId === pending.factionId);
        return { factionId: pending.factionId, label: `Assault ${faction?.name ?? 'pirate'} enclave` };
      },
      onOpenPirateAssault: (factionId, uid) => openPirateHeadquartersAssault(factionId, uid),
      onLoadTransport: (uid, transportId) => {
        const prevPos = gameState.units[uid]?.position;
        const result = loadUnitOntoTransport(gameState, uid, transportId);
        if (!result.ok) {
          showNotification(result.message, 'warning');
          SFX.error();
          return;
        }
        gameState = result.state;
        renderLoop.setGameState(gameState);
        updateHUD();
        // Boarding animation: slide cargo unit to transport hex before it disappears
        const transportUnit = gameState.units[transportId];
        if (prevPos && transportUnit) {
          renderLoop.animateUnitSlide(
            { ...result.state.units[uid] ?? { id: uid } as Unit, position: prevPos },
            transportUnit.position,
          );
        }
        selectUnit(transportId);
        const tName = UNIT_DEFINITIONS[gameState.units[transportId]?.type ?? 'transport']?.name ?? 'Transport';
        showNotification(`Unit loaded onto ${tName}.`, 'info');
        SFX.transportLoad();
      },
      onUnloadTransport: (transportId, cargoUnitId, destination) => {
        const result = unloadUnitFromTransport(gameState, transportId, cargoUnitId, destination);
        if (!result.ok) {
          showNotification(result.message, 'warning');
          SFX.error();
          return;
        }
        const tName = UNIT_DEFINITIONS[gameState.units[transportId]?.type ?? 'transport']?.name ?? 'Transport';
        const cName = UNIT_DEFINITIONS[gameState.units[cargoUnitId]?.type ?? 'warrior']?.name ?? 'Unit';
        clearUnloadState();
        gameState = result.state;
        renderLoop.setGameState(gameState);
        updateHUD();
        renderLoop.animateUnitAppear(destination);
        // Stay on the transport so the player can unload remaining cargo
        selectUnit(transportId);
        showNotification(`${cName} disembarked from ${tName}.`, 'info');
        SFX.transportUnload();
      },
      onSetDisguise: (uid, disguise) => {
        const unit = gameState.units[uid];
        if (!unit || unit.hasActed) return;
        if (unit.owner !== gameState.currentPlayer) return;
        const civEsp = gameState.espionage?.[gameState.currentPlayer];
        if (!civEsp) return;
        const spy = civEsp.spies[uid];
        if (!spy || spy.status !== 'idle') return;
        gameState.espionage![gameState.currentPlayer] = setDisguise(civEsp, uid, disguise);
        if (disguise !== null) {
          gameState.units[uid] = { ...unit, hasActed: true, movementPointsLeft: 0 };
        }
        renderLoop.setGameState(gameState);
        updateHUD();
        selectUnit(uid);
        showNotification(disguise ? `Spy disguised as ${disguise}.` : 'Disguise removed.', 'info');
      },
      onInfiltrate: (uid) => {
        const unit = gameState.units[uid];
        if (!unit || unit.owner !== gameState.currentPlayer) return;
        const civEsp = gameState.espionage?.[gameState.currentPlayer];
        if (!civEsp) return;
        const targetCity = Object.values(gameState.cities).find(
          c => c.owner !== gameState.currentPlayer &&
               c.position.q === unit.position.q && c.position.r === unit.position.r,
        );
        if (!targetCity) { showNotification('No enemy city at this location.', 'info'); return; }

        const alreadyInside = Object.values(civEsp.spies).some(
          s => s.infiltrationCityId === targetCity.id &&
               (s.status === 'stationed' || s.status === 'on_mission'),
        );
        if (alreadyInside) { showNotification('You already have a spy in that city.', 'info'); return; }

        const cityCI = gameState.espionage![targetCity.owner]?.counterIntelligence[targetCity.id] ?? 0;
        const chance = getInfiltrationSuccessChance(unit.type as UnitType, civEsp.spies[uid]?.experience ?? 0, cityCI);
        const preview = `Infiltrate ${targetCity.name}?\n\nSuccess chance: ${Math.round(chance * 100)}%\nCity CI: ${cityCI}\n\nIf caught, spy may be lost permanently.`;
        if (!window.confirm(preview)) return;

        const seed = `infiltrate-${uid}-${gameState.turn}`;
        const result = attemptInfiltration(
          civEsp, uid, unit.type as UnitType, targetCity.id, targetCity.position, cityCI, seed,
        );
        // Record the original target civ so auto-exfiltrate can detect third-party captures
        const spyAfterAttempt = result.civEsp.spies[uid];
        const civEspWithTarget = spyAfterAttempt ? {
          ...result.civEsp,
          spies: { ...result.civEsp.spies, [uid]: { ...spyAfterAttempt, targetCivId: targetCity.owner } },
        } : result.civEsp;
        gameState.espionage![gameState.currentPlayer] = civEspWithTarget;

        if (result.removeUnitFromMap) {
          // Era 2+: spy removed from map, stationed inside city
          delete gameState.units[uid];
          const civUnits = gameState.civilizations[gameState.currentPlayer].units;
          if (civUnits) {
            gameState.civilizations[gameState.currentPlayer].units = civUnits.filter(id => id !== uid);
          }
          showNotification(`Spy successfully infiltrated ${targetCity.name}. Open Intel panel to issue orders.`, 'success');
          bus.emit('espionage:spy-infiltrated', { civId: gameState.currentPlayer, spyId: uid, cityId: targetCity.id });
          deselectUnit();
        } else if (result.era1ScoutResult !== undefined) {
          // Era 1 (spy_scout): spy stays on map, infiltrationCityId + 5-turn city vision already set
          const missionResult = resolveMissionResult('scout_area', targetCity.owner, targetCity.id, gameState, gameState.currentPlayer, uid);
          const tilesToReveal = missionResult.tilesToReveal ?? [];
          if (tilesToReveal.length > 0) {
            const visibilityTiles = { ...(gameState.civilizations[gameState.currentPlayer].visibility?.tiles ?? {}) };
            for (const coord of tilesToReveal) {
              visibilityTiles[`${coord.q},${coord.r}`] = 'visible';
            }
            gameState.civilizations[gameState.currentPlayer].visibility = {
              ...gameState.civilizations[gameState.currentPlayer].visibility!,
              tiles: visibilityTiles,
            };
          }
          gameState.units[uid] = { ...unit, hasActed: true, movementPointsLeft: 0 };
          showNotification(`Scout revealed ${tilesToReveal.length} tile${tilesToReveal.length !== 1 ? 's' : ''} around ${targetCity.name}.`, 'success');
          selectUnit(uid);
        } else if (result.caught) {
          // Caught: remove unit from map (spy lost)
          delete gameState.units[uid];
          const civUnits = gameState.civilizations[gameState.currentPlayer].units;
          if (civUnits) {
            gameState.civilizations[gameState.currentPlayer].units = civUnits.filter(id => id !== uid);
          }
          bus.emit('espionage:spy-caught-infiltrating', { capturingCivId: targetCity.owner, spyOwner: gameState.currentPlayer, spyId: uid, cityId: targetCity.id });
          deselectUnit();
        } else {
          const cooldown = result.civEsp.spies[uid]?.cooldownTurns ?? 3;
          showNotification(`Spy failed to infiltrate ${targetCity.name}. Lying low for ${cooldown} turns.`, 'info');
          gameState.units[uid] = { ...unit, hasActed: true, movementPointsLeft: 0 };
          selectUnit(uid);
        }

        renderLoop.setGameState(gameState);
        updateHUD();
      },
      onEmbed: (uid) => {
        const unit = gameState.units[uid];
        if (!unit || unit.owner !== gameState.currentPlayer) return;
        const civEsp = gameState.espionage?.[gameState.currentPlayer];
        if (!civEsp) return;
        const city = Object.values(gameState.cities).find(
          c => c.owner === gameState.currentPlayer &&
               c.position.q === unit.position.q && c.position.r === unit.position.r,
        );
        if (!city) return;
        gameState.espionage![gameState.currentPlayer] = embedSpy(civEsp, uid, city.id, city.position);
        delete gameState.units[uid];
        gameState.civilizations[gameState.currentPlayer].units =
          gameState.civilizations[gameState.currentPlayer].units.filter(id => id !== uid);
        deselectUnit();
        renderLoop.setGameState(gameState);
        updateHUD();
        showNotification(`Spy embedded in ${city.name}. Counter-intelligence boosted.`, 'info');
      },
      onUpgradeUnit: (uid, cityId) => {
        const unit = gameState.units[uid];
        if (!unit || unit.owner !== gameState.currentPlayer) return;
        const civ = gameState.civilizations[gameState.currentPlayer];
        const completedTechs = civ?.techState?.completed ?? [];
        const upgrade = canUpgradeUnit(unit, cityId, gameState.cities, completedTechs, undefined, getCivAvailableResources(gameState, unit.owner));
        if (!upgrade.canUpgrade || !upgrade.targetType) return;
        if (civ.gold < upgrade.cost) {
          showNotification('Not enough gold to upgrade!', 'warning');
          return;
        }
        if (executeUpgrade(uid, upgrade.targetType)) {
          selectUnit(uid);
          showNotification(`Upgraded to ${UNIT_DEFINITIONS[upgrade.targetType].name}!`, 'success');
        }
      },
      onEstablishOutpost: (unitId) => {
        if (!canEstablishOutpost(gameState, unitId)) return;
        gameState = performEstablishOutpost(gameState, unitId);
        autoSave(gameState).catch(() => {});
        selectedUnitId = null;
        renderLoop.setSelectedUnitId(null);
        renderLoop.setGameState(gameState);
        updateHUD();
        showNotification('Expedition planted a flag! Outpost completes in 2 turns.', 'success');
      },
      onEstablishRoute: handleEstablishRoute,
      onReplaceImprovement: (action) => {
        if (!selectedUnitId) return;
        const unit = gameState.units[selectedUnitId];
        if (!unit) return;
        const tileKey = hexKey(unit.position);
        const currentTile = gameState.map.tiles[tileKey];
        if (!currentTile || currentTile.improvement === 'none') return;
        const existingName = getImprovementDisplayName(currentTile.improvement);
        const newName = getImprovementDisplayName(action);
        const existingYield = formatImprovementYieldLabel(currentTile.improvement) || undefined;
        const newYield = formatImprovementYieldLabel(action) || undefined;
        const uid = selectedUnitId;
        createWorkerReplacementConfirmPanel(uiLayer, {
          existingName,
          newName,
          existingYield,
          newYield,
          onCancel: () => selectUnit(uid),
          onConfirm: () => {
            const result = applyWorkerAction(gameState, uid, action, { allowReplacement: true });
            if (!result.ok) return;
            gameState = result.state;
            for (const event of result.events) {
              if (event.type === 'improvement:started') {
                bus.emit('improvement:started', event.payload);
              } else if (event.type === 'road:started') {
                bus.emit('road:started', event.payload);
              } else {
                bus.emit('unit:destroyed', event.payload);
              }
            }
            renderLoop.setGameState(gameState);
            updateHUD();
            if (result.workerConsumed || result.workerLost || !gameState.units[uid]) {
              deselectUnit();
            } else {
              selectUnit(uid);
            }
            showNotification(result.message, result.workerLost ? 'warning' : 'info');
          },
        });
      },
    }, {
      waterRecovery: highlightResult.waterRecovery,
      hasZoneOfControlWarning: highlightResult.zocLimitedRange.length > 0,
      airMissionPending: pendingAirMission?.unitId === unitId ? pendingAirMission.mission : undefined,
    });
  }

  if (!opts?.suppressSelectionSfx) SFX.select();
}

function deselectUnit(): void {
  selectedUnitId = null;
  pendingAirMission = null;
  selectedUnitWaterRecovery = NO_LAND_UNIT_WATER_RECOVERY;
  renderLoop.setSelectedUnitId(null);
  movementRange = [];
  attackRange = [];
  clearUnloadState();
  pendingJourneyUnitId = null;
  renderLoop.clearHighlights();
  renderLoop.setJourneyPath(null);
  const panel = document.getElementById('info-panel');
  if (panel) {
    panel.style.display = 'none';
    panel.replaceChildren();
  }
}

function isUnitAnimationLocked(unitId: string | null): boolean {
  return Boolean(unitId && renderLoop.hasMovingUnit(unitId));
}

function animateMovedUnit(unitId: string, path: HexCoord[]): void {
  const movedUnit = gameState.units[unitId];
  if (!movedUnit || path.length < 2) return;
  movementRange = [];
  attackRange = [];
  clearUnloadState();
  renderLoop.clearHighlights();
  renderLoop.animateUnitMove({ ...movedUnit, position: path[0]! }, path, () => {
    renderLoop.setGameState(gameState);
    updateHUD();
    deferWonderDiscoveryRevealUntilMoveSettles = false;
    wonderDiscoveryQueue?.notifyActionSettled();
    const unit = gameState.units[unitId];
    if (!unit || unit.owner !== gameState.currentPlayer) return;

    if ((unit.movementPointsLeft ?? 0) <= 0) {
      selectNextUnit();
    } else if (selectedUnitId === unitId) {
      selectUnit(unitId);
    }
  });
}

function executeAnimatedUnitMove(unitId: string, move: () => ExecuteUnitMoveResult): ExecuteUnitMoveResult {
  const movingUnit = gameState.units[unitId];
  deferWonderDiscoveryRevealUntilMoveSettles = true;
  try {
    const moveResult = move();
    if (!moveResult.ok) {
      deferWonderDiscoveryRevealUntilMoveSettles = false;
      showNotification(moveResult.message, 'warning');
      SFX.error();
      return moveResult;
    }
    if (moveResult.stopReason === 'zone-of-control') {
      showNotification('Stopped — enemy nearby', 'info');
    }
    // Clear journey automation when the player manually moves a unit.
    if (movingUnit?.automation?.mode === 'journey') {
      const movedUnit = gameState.units[unitId];
      if (movedUnit) {
        gameState = {
          ...gameState,
          units: { ...gameState.units, [unitId]: { ...movedUnit, automation: undefined } },
        };
      }
      renderLoop.setJourneyPath(null);
    }
    animateMovedUnit(unitId, moveResult.path);
    return moveResult;
  } catch (error) {
    deferWonderDiscoveryRevealUntilMoveSettles = false;
    throw error;
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
      lastTargets: unit.automation?.mode === 'auto-explore' ? unit.automation.lastTargets : [],
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

function cancelJourney(unitId: string): void {
  const unit = gameState.units[unitId];
  if (!unit?.automation) return;
  gameState = {
    ...gameState,
    units: { ...gameState.units, [unitId]: { ...unit, automation: undefined } },
  };
  renderLoop.setGameState(gameState);
  renderLoop.setJourneyPath(null);
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

function refreshCurrentPlayerVisibility(): void {
  if (!currentCiv()?.visibility) return;

  // Snapshot unexplored tile keys before the update so we can detect fog-lift transitions
  const visTiles = currentCiv()!.visibility!.tiles;
  const prevUnexplored = new Set(
    Object.keys(visTiles).filter(k => visTiles[k] === 'unexplored'),
  );

  updateAndRefreshVisibility(gameState, gameState.currentPlayer);

  // Fire at most one resource-discovered tip per visibility update to avoid
  // flooding the player when a scout reveals several resource tiles at once.
  const updatedTiles = currentCiv()?.visibility?.tiles ?? {};
  for (const key of prevUnexplored) {
    if (updatedTiles[key] !== 'unexplored') {
      const tile = gameState.map.tiles[key];
      if (tile?.resource) {
        const fired = fireResourceDiscoveredTip(tile.resource, gameState, bus);
        if (fired) break; // one tip per move is enough
      }
    }
  }

  for (const contact of syncCivilizationContactsFromVisibility(gameState, gameState.currentPlayer)) {
    bus.emit('civilization:first-contact', contact);
  }

  scanBeastSightings();
}

function getUnitTurnFlow() {
  return createUnitTurnFlow({
    uiLayer,
    getState: () => gameState,
    setState: nextState => { gameState = nextState; },
    getSelectedUnitId: () => selectedUnitId,
    selectUnit,
    deselectUnit,
    selectNextUnit,
    centerOn: coord => renderLoop.camera.centerOn(coord),
    refreshVisibility: refreshCurrentPlayerVisibility,
    setRenderState: state => renderLoop.setGameState(state),
    updateHUD,
    showNotification,
    setBlockingOverlay,
    endTurn: options => { void endTurn(options); },
    onUnitDisbanded: (state, unitId, routeId) =>
      removeRouteForUnit(state, unitId, bus, 'unit-disbanded', routeId),
  });
}

function foundCityAction(): void {
  if (!selectedUnitId) return;
  const unit = gameState.units[selectedUnitId];
  if (!unit || unit.type !== 'settler') return;

  const blockers = getCityFoundingBlockers(gameState, unit.position);
  if (blockers.length > 0) {
    showNotification(formatCityFoundingBlockerMessage(blockers), 'warning');
    return;
  }

  let result;
  try {
    result = foundCityInState(gameState, selectedUnitId, bus);
  } catch (error) {
    showNotification(
      error instanceof Error ? error.message : 'City cannot be founded here.',
      'warning',
    );
    return;
  }
  gameState = result.state;

  deselectUnit();
  const foundedCity = gameState.cities[result.cityId];
  showNotification(`${foundedCity.name} has been founded!`, 'success');
  SFX.foundCity();

  // Update visibility
  updateAndRefreshVisibility(gameState, gameState.currentPlayer);
  for (const contact of syncCivilizationContactsFromVisibility(gameState, gameState.currentPlayer)) {
    bus.emit('civilization:first-contact', contact);
  }

  renderLoop.setGameState(gameState);
  updateHUD();
}

function performWorkerAction(action: WorkerActionType): void {
  if (!selectedUnitId) return;

  const result = applyWorkerAction(gameState, selectedUnitId, action);
  if (!result.ok) return;

  gameState = result.state;
  for (const event of result.events) {
    if (event.type === 'improvement:started') {
      bus.emit('improvement:started', event.payload);
    } else if (event.type === 'road:started') {
      bus.emit('road:started', event.payload);
    } else {
      bus.emit('unit:destroyed', event.payload);
    }
  }

  renderLoop.setGameState(gameState);
  updateHUD();

  if (result.workerConsumed || result.workerLost || !gameState.units[selectedUnitId]) {
    deselectUnit();
  } else {
    selectUnit(selectedUnitId);
  }

  showNotification(result.message, result.workerLost ? 'warning' : 'info');
}

// #592 MR5: preach action. Mirrors performWorkerAction's state-apply + rerender pattern,
// but adds a non-destructive confirmation dialog when the missionary is consumed on its
// last charge — the deletion has already happened inside preach() by this point, so the
// dialog is an acknowledgment, not a gate (hideCancel: true, no undo possible).
function performPreach(unitId: string, cityId: string): void {
  const unit = gameState.units[unitId];
  const cityName = gameState.cities[cityId]?.name ?? cityId;
  const result = preach(gameState, unitId, cityId, bus);
  if (!result.ok) return;

  gameState = result.state;
  renderLoop.setGameState(gameState);
  updateHUD();

  const message = result.converted
    ? `${cityName} has converted to your faith!`
    : `You preached in ${cityName}.`;

  if (result.unitConsumed) {
    deselectUnit();
    setBlockingOverlay('unit-delete-confirmation');
    createUnitDeleteConfirmationPanel(uiLayer, {
      unitName: unit ? UNIT_DEFINITIONS[unit.type].name : 'Missionary',
      title: 'Missionary Used Up',
      bodyText: `${message} That was its last charge, so the missionary is gone.`,
      confirmLabel: 'OK',
      hideCancel: true,
      tone: 'neutral',
      onConfirm: () => {
        uiLayer.querySelector('#unit-delete-confirmation-panel')?.remove();
        setBlockingOverlay(null);
      },
      onCancel: () => {
        uiLayer.querySelector('#unit-delete-confirmation-panel')?.remove();
        setBlockingOverlay(null);
      },
    });
  } else {
    selectUnit(unitId);
    showNotification(message, result.converted ? 'success' : 'info');
  }
}

function ensurePlayerWarState(targetCivId: string): void {
  const targetCiv = gameState.civilizations[targetCivId];
  if (!targetCiv || !isMajorCivOwner(targetCivId)) return;

  const cp = gameState.currentPlayer;
  const alreadyAtWar = currentCiv().diplomacy?.atWarWith.includes(targetCivId) ?? false;
  if (alreadyAtWar) return;

  currentCiv().diplomacy = declareWar(currentCiv().diplomacy, targetCivId, gameState.turn);
  targetCiv.diplomacy = declareWar(targetCiv.diplomacy, cp, gameState.turn);
  bus.emit('diplomacy:war-declared', { attackerId: cp, defenderId: targetCivId, opponentKind: resolveOpponentKind(targetCivId) });
  gameState = applyOpportunisticWarPenaltyIfCrisisStruck(gameState, cp, targetCivId, bus);
}

function finalizePendingCityCaptureChoice(
  disposition: 'occupy' | 'raze',
  attackerBonus?: CivBonusEffect,
): void {
  if (!pendingCityCaptureChoice) return;

  const pending = pendingCityCaptureChoice;
  const cityBeforeResolution = gameState.cities[pending.cityId];
  const previousOwner = cityBeforeResolution?.owner ?? '';
  const cityName = cityBeforeResolution?.name ?? pending.cityId;
  const beforeCapture = gameState;
  const result = finalizePlayerCityAssaultChoice(gameState, pending, disposition, gameState.turn, bus);

  pendingCityCaptureChoice = null;
  document.getElementById('city-capture-panel')?.remove();
  gameState = result.state;
  emitMajorCityCaptureEvents(
    beforeCapture,
    result,
    pending.cityId,
    gameState.currentPlayer,
    previousOwner,
    bus,
  );

  if (result.outcome === 'occupied') {
    const capturingCiv = currentCiv();
    if (capturingCiv && attackerBonus?.type === 'naval_raiding') {
      capturingCiv.gold += 30;
      showNotification('Viking raid spoils! +30 gold', 'success');
    }
    showNotification(`We have captured ${cityName}!`, 'success');
  } else {
    showNotification(`${cityName} was razed! +${result.goldAwarded} gold`, 'success');
  }

  renderLoop.setGameState(gameState);
  updateHUD();
  setTimeout(() => selectNextUnit(), 400);
}

function beginPlayerCityAssault(
  attackerId: string,
  cityId: string,
  attackerBonus?: CivBonusEffect,
  precedingCombat?: CombatResult,
  embarkedAssault = false,
): 'pending' | 'resolved' {
  const city = gameState.cities[cityId];
  if (!city) return 'resolved';
  const attacker = gameState.units[attackerId];
  if (!attacker || !canUnitOccupyCity(attacker)) return 'resolved';

  ensurePlayerWarState(city.owner);
  let attackerMultiplier: number | undefined;
  if (embarkedAssault) {
    const legality = getEmbarkedAssaultTarget(gameState, attackerId, city.position, { viewerId: gameState.currentPlayer });
    if (!legality.ok || legality.targetType !== 'city') {
      showNotification('That coastal assault is no longer possible.', 'warning');
      return 'resolved';
    }
    attackerMultiplier = getAmphibiousAssaultMultiplier(gameState, attacker, city.position);
    const detached = detachCargoForEmbarkedAssault(gameState, attackerId);
    if (!detached.ok) return 'resolved';
    gameState = detached.state;
  }
  const begun = beginPlayerCityAssaultChoice(
    gameState,
    attackerId,
    cityId,
    bus,
    precedingCombat,
    attackerMultiplier,
  );
  gameState = begun.state;

  if (!begun.ok) {
    showNotification(
      begun.reason === 'repelled-by-city-defense'
        ? "Your attack was repelled by the city's defenses!"
        : 'The attack could not proceed.',
      'warning',
    );
    renderLoop.setGameState(gameState);
    updateHUD();
    return 'resolved';
  }

  pendingCityCaptureChoice = begun.pending;
  if (!shouldPromptForPlayerCityCapture(city)) {
    finalizePendingCityCaptureChoice('raze', attackerBonus);
    return 'resolved';
  }

  createCityCapturePanel(uiLayer, {
    cityName: city.name,
    occupiedPopulation: begun.pending.occupiedPopulation,
    razeGold: begun.pending.razeGold,
    onOccupy: () => finalizePendingCityCaptureChoice('occupy', attackerBonus),
    onRaze: () => finalizePendingCityCaptureChoice('raze', attackerBonus),
  });
  return 'pending';
}

function executeAttack(attackerId: string, targetKey: string): void {
  const initialAttacker = gameState.units[attackerId];
  const targetCoord = parseHexKey(targetKey);
  const amphibiousAssault = Boolean(initialAttacker?.transportId);
  const legality = amphibiousAssault
    ? getEmbarkedAssaultTarget(gameState, attackerId, targetCoord, { viewerId: gameState.currentPlayer })
    : canUnitAttackTarget(gameState, initialAttacker, targetCoord, { viewerId: gameState.currentPlayer });
  // hasActed guard: enforce "no action remaining" at the execution layer, not just
  // the highlight layer (getAttackTargets). Prevents double-action if executeAttack
  // is ever called outside the normal tap → highlight → confirm flow.
  if (!initialAttacker || initialAttacker.hasActed || !legality.ok || legality.targetType !== 'unit') {
    showNotification('That target is no longer attackable.', 'warning');
    if (selectedUnitId) selectUnit(selectedUnitId);
    return;
  }

  const defenderId = legality.targetUnitId;
  const defender = gameState.units[defenderId];
  if (!defender) return;

  let attacker = initialAttacker;
  if (amphibiousAssault) {
    const detached = detachCargoForEmbarkedAssault(gameState, attackerId);
    if (!detached.ok) {
      showNotification('That coastal assault is no longer possible.', 'warning');
      return;
    }
    gameState = detached.state;
    attacker = detached.attacker;
  }

  ensurePlayerWarState(defender.owner);

  const seed = deterministicCombatSeed(gameState.gameId, gameState.turn, attacker.id, defender.id);
  const attackerBonus = currentCivDef()?.bonusEffect;
  // Capture defender position before combat (defender may be removed from state after)
  const defenderPosition = { ...defender.position };
  // Capture route IDs before combat (units may be removed from state after)
  const attackerRouteId = attacker.committedToRouteId;
  const defenderRouteId = defender.committedToRouteId;
  const result = resolveCombat(
    attacker,
    gameState.units[defenderId] ?? defender,
    gameState.map,
    seed,
    buildCombatContextForDefender(gameState, attacker, defender, { amphibiousAssault }),
    resolveCombatEra(gameState, attacker, defender),
  );
  bus.emit('combat:resolved', {
    result,
    ...buildCombatPresentation(gameState, result, attacker, defender),
  });

  const applied = applyCombatOutcomeToState(gameState, result, seed);
  gameState = applied.state;
  gameState = recordCombatForCiv(gameState, gameState.currentPlayer, defenderPosition);
  emitMinorCivQuestTransitions(bus, applied.questTransitions, gameState);
  // Clean up trade routes for any committed caravans that died or were captured
  if (applied.attackerDefeated && attackerRouteId) {
    gameState = removeRouteForUnit(gameState, result.attackerId, bus, 'unit-died', attackerRouteId);
  } else if (applied.attackerCaptured && attackerRouteId) {
    gameState = removeRouteForUnit(gameState, result.attackerId, bus, 'unit-captured', attackerRouteId);
  }
  if (applied.defenderDefeated && defenderRouteId) {
    gameState = removeRouteForUnit(gameState, result.defenderId, bus, 'unit-died', defenderRouteId);
  } else if (applied.defenderCaptured && defenderRouteId) {
    gameState = removeRouteForUnit(gameState, result.defenderId, bus, 'unit-captured', defenderRouteId);
  }

  if (applied.attackerDefeated) {
    showNotification('Our unit was destroyed!', 'warning');
  } else if (applied.attackerCaptured) {
    showNotification(`Our ${getCaptureNotificationLabel(attacker.type)}`, 'warning');
  }

  for (const reward of applied.rewards) {
    bus.emit('combat:reward-earned', { reward });
  }

  if (applied.defenderDefeated) {
    showNotification('Enemy unit destroyed!', 'success');

    const slayResult = recordBeastSlain(gameState, defender, attacker);
    gameState = slayResult.state;
    if (slayResult.slain) {
      bus.emit('beast:slain', slayResult.slain);
    }
    // Tier 3+ beasts use the slay ceremony (beast:slain listener); ceremony calls
    // maybeShowPendingHoardChoice via onContinue so the choice panel appears after
    // the ceremony is dismissed rather than racing with it.
    if (!slayResult.slain || BEAST_DEFINITIONS[slayResult.slain.beastId].tier < 3) {
      maybeShowPendingHoardChoice();
    }

    const destroyedCamp = applyCampDestructionAtTarget(gameState, gameState.currentPlayer, defender.position, gameState.turn);
    if (destroyedCamp.campId) {
      gameState = destroyedCamp.state;
      emitMinorCivQuestTransitions(bus, destroyedCamp.questTransitions, gameState);
      showNotification(`Barbarian camp destroyed! +${destroyedCamp.reward} gold`, 'success');
      advisorSystem.resetMessage('treasurer_camp_reward');
      advisorSystem.check(gameState);
      for (const mcId of Object.keys(gameState.minorCivs)) {
        applyDiplomaticReaction(gameState, 'camp_destroyed_nearby', gameState.currentPlayer, mcId);
      }
    }

    const cityAtTarget = Object.values(gameState.cities).find(c => hexKey(c.position) === targetKey);
    if (cityAtTarget) {
      const occupancy = buildUnitOccupancy(gameState.units);
      const remainingHostileDefenders = hasHostileUnitAtCoord(occupancy, cityAtTarget.position, gameState.currentPlayer);
      if (!remainingHostileDefenders) {
        if (cityAtTarget.owner.startsWith('mc-')) {
          const conqueredCityName = cityAtTarget.name;
          const conquered = conquestMinorCiv(gameState, cityAtTarget.owner, gameState.currentPlayer);
          gameState = conquered.state;
          emitMinorCivQuestTransitions(bus, conquered.transitions, gameState);
          if (conquered.conquered) {
            bus.emit('minor-civ:destroyed', { minorCivId: cityAtTarget.owner, conquerorId: gameState.currentPlayer });
          }
          showNotification(`${conqueredCityName} has been conquered!`, 'success');
        }
        if (!cityAtTarget.owner.startsWith('mc-') && cityAtTarget.owner !== gameState.currentPlayer) {
          const assaultStatus = beginPlayerCityAssault(
            attackerId,
            cityAtTarget.id,
            attackerBonus,
            result,
            amphibiousAssault,
          );
          SFX.combat();
          renderLoop.setGameState(gameState);
          updateHUD();
          if (assaultStatus === 'resolved') {
            setTimeout(() => selectNextUnit(), 400);
          }
          return;
        }
      }
    }
  } else if (applied.defenderCaptured) {
    showNotification(getCaptureNotificationLabel(defender.type), 'success');
  }

  // `attacker` was captured before applyCombatOutcomeToState — safe even if attacker was destroyed
  SFX.combat();
  renderLoop.setGameState(gameState);
  updateHUD();
  renderLoop.animations.add('combat-flash', 400, { coord: attacker.position }, () => selectNextUnit());
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

function visibleUnitEntriesAtKey(key: string): Array<[string, Unit]> {
  const viewerUnits = Object.values(gameState.units).filter(u => u.owner === gameState.currentPlayer && !u.transportId);
  return Object.entries(gameState.units).filter(([, unit]) =>
    hexKey(unit.position) === key
    && canInspectUnitForViewer(gameState, gameState.currentPlayer, unit.id)
    && (unit.owner === gameState.currentPlayer || !isForestConcealedUnit(gameState, gameState.currentPlayer, unit))
    && !isBeastConcealedFrom(unit, gameState.map, viewerUnits)
  );
}

function visibleHostileUnitEntriesAtKey(key: string): Array<[string, Unit]> {
  return visibleUnitEntriesAtKey(key).filter(([, unit]) => unit.owner !== gameState.currentPlayer);
}

function selectDefenderEntryAtKey(key: string): [string, Unit] | undefined {
  const hostileEntries = visibleHostileUnitEntriesAtKey(key);
  const defender = selectDefenderForAttack(hostileEntries.map(([, unit]) => unit), gameState.map);
  if (!defender) return undefined;
  return hostileEntries.find(([id]) => id === defender.id);
}

function handleHexTap(rawCoord: HexCoord): void {
  if (pendingCityCaptureChoice) {
    return;
  }

  const coord = gameState.map.wrapsHorizontally
    ? wrapHexCoord(rawCoord, gameState.map.width)
    : rawCoord;

  if (pendingJourneyUnitId) {
    const unit = gameState.units[pendingJourneyUnitId];
    if (unit) {
      const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
      const path = findPath(unit.position, coord, gameState.map, domain);
      if (!path || path.length < 2) {
        showNotification('No path to that destination.', 'warning');
      } else {
        gameState = {
          ...gameState,
          units: {
            ...gameState.units,
            [pendingJourneyUnitId]: { ...unit, automation: { mode: 'journey', destination: coord } },
          },
        };
        renderLoop.setGameState(gameState);
        selectUnit(pendingJourneyUnitId);
        showNotification('Journey set. Your unit will advance each turn.', 'info');
      }
    }
    pendingJourneyUnitId = null;
    return;
  }
  const key = hexKey(coord);

  if (pendingAirMission) {
    const pending = pendingAirMission;
    const result = pending.mission === 'strike'
      ? resolveAirStrike(gameState, pending.unitId, coord)
      : resolveReconMission(gameState, pending.unitId, coord);
    if (!result.ok) {
      showNotification('That air mission target is no longer legal.', 'warning');
      return;
    }
    pendingAirMission = null;
    gameState = result.state;
    renderLoop.setGameState(gameState);
    refreshCurrentPlayerVisibility();
    updateHUD();
    if (pending.mission === 'recon') SFX.airRecon();
    else SFX.combat();
    selectUnit(pending.unitId);
    return;
  }

  if (!selectedUnitId) {
    const pirateSelection = resolvePirateHeadquartersSelection(gameState, gameState.currentPlayer, coord);
    if (pirateSelection?.kind === 'faction') {
      openPirateWaters({ factionId: pirateSelection.factionId });
      return;
    }
    if (pirateSelection?.kind === 'region') {
      renderLoop.camera.centerOn(pirateSelection.center);
      openPirateWaters({ factionId: pirateSelection.factionId });
      return;
    }
  }

  if (isUnitAnimationLocked(selectedUnitId)) {
    showNotification('Unit is moving.', 'info');
    return;
  }

  // ── Pending-unload mode: consume the tap before any normal movement logic ──
  const pendingUnload = getPendingUnload();
  if (pendingUnload) {
    const unloadRange = getUnloadRange();
    const inRange = unloadRange.some(h => hexKey(h) === key);
    if (inRange) {
      // Delegate to onUnloadTransport which handles state, animation, and notification
      const panel = document.getElementById('info-panel');
      if (panel) {
        // Re-invoke via the callback registered in selectUnit's renderSelectedUnitInfo block
        // by triggering the transport system directly here (callbacks are not stored).
        const { transportId, cargoUnitId } = pendingUnload;
        const result = unloadUnitFromTransport(gameState, transportId, cargoUnitId, coord);
        if (!result.ok) {
          showNotification(result.message, 'warning');
          SFX.error();
        } else {
          const tName = UNIT_DEFINITIONS[gameState.units[transportId]?.type ?? 'transport']?.name ?? 'Transport';
          const cName = UNIT_DEFINITIONS[gameState.units[cargoUnitId]?.type ?? 'warrior']?.name ?? 'Unit';
          clearUnloadState();
          gameState = result.state;
          renderLoop.setGameState(gameState);
          updateHUD();
          renderLoop.animateUnitAppear(coord);
          selectUnit(transportId);
          showNotification(`${cName} disembarked from ${tName}.`, 'info');
          SFX.transportUnload();
        }
      }
    } else {
      // Mis-tap: block the tap; first occurrence shows an error notification
      if (!_mistapNotified) {
        showNotification('Tap a highlighted hex to disembark, or Cancel in the panel.', 'warning');
        SFX.error();
        _mistapNotified = true;
      }
    }
    return;
  }

  const selectedUnitCanMoveToTappedHex = selectedUnitId && movementRange.some(h => hexKey(h) === key);
  const selectedUnitCanAttackTappedHex = selectedUnitId && attackRange.some(h => hexKey(h) === key);
  if (!selectedUnitCanMoveToTappedHex && !selectedUnitCanAttackTappedHex) {
    if (handleFriendlyUnitStackTap(gameState, coord, selectedUnitId, {
      onSelectUnit: selectUnit,
      onOpenStackPicker: openUnitStackPicker,
    })) {
      return;
    }
  }

  if (selectedUnitId && !selectedUnitCanMoveToTappedHex && !selectedUnitCanAttackTappedHex) {
    const selectedUnit = gameState.units[selectedUnitId];
    if (selectedUnit) {
      if (selectedUnit.committedToRouteId) {
        showNotification('Caravan is committed to a trade route and cannot move.', 'warning');
        selectUnit(selectedUnitId);
        return;
      }
      // Check for a navalOnly beast before falling through to the generic movement blocker —
      // "Ocean is impassable" is less useful than the specific combat restriction reason.
      const defenderAtHex = selectDefenderEntryAtKey(key)?.[1];
      if (defenderAtHex) {
        const navalGate = canUnitAttackBeast(selectedUnit, defenderAtHex);
        if (!navalGate.allowed) {
          showNotification(navalGate.reason ?? 'Cannot attack that target.', 'warning');
          selectUnit(selectedUnitId);
          return;
        }
      }
      if (handleSelectedUnitMovementBlocker(
        gameState,
        selectedUnitId,
        coord,
        selectedUnitWaterRecovery,
        {
          showNotification,
          reselectUnit: unitId => selectUnit(unitId, { suppressSelectionSfx: true }),
          playError: SFX.error,
        },
      )) {
        return;
      }
    }
  }

  const defenderEntryAtHex = selectDefenderEntryAtKey(key);

  if (defenderEntryAtHex) {
    // Show enemy unit info (if no unit selected for attack)
    if (!selectedUnitId && defenderEntryAtHex) {
      const enemyUnit = defenderEntryAtHex[1];
      const def = UNIT_DEFINITIONS[enemyUnit.type];
      const desc = UNIT_DESCRIPTIONS[enemyUnit.type] ?? '';
      const ownerKind = classifyOwner(enemyUnit.owner);
      const isMinorCiv = ownerKind === 'minor';
      let ownerName: string;
      let ownerColor: string;

      if (ownerKind === 'barbarian') {
        ownerName = 'Barbarian';
        ownerColor = '#8b4513';
      } else if (ownerKind === 'pirate') {
        ownerName = 'Pirates';
        ownerColor = '#7f1d1d';
      } else if (ownerKind === 'rebel') {
        ownerName = 'Rebels';
        ownerColor = '#6b3f2a';
      } else if (ownerKind === 'beast') {
        ownerName = 'Legendary Beasts';
        ownerColor = '#7a1f2b';
      } else if (isMinorCiv) {
        const presentation = getMinorCivPresentationForPlayer(gameState, gameState.currentPlayer, enemyUnit.owner, 'City-State');
        ownerName = presentation.name;
        ownerColor = presentation.color;
      } else {
        const civ = gameState.civilizations[enemyUnit.owner];
        ownerName = civ?.name ?? enemyUnit.owner;
        ownerColor = civ?.color ?? '#888';
      }

      const alwaysHostile = isAlwaysHostilePair(gameState.currentPlayer, enemyUnit.owner);
      const atWar = ownerKind === 'major' && (currentCiv()?.diplomacy?.atWarWith.includes(enemyUnit.owner) ?? false);
      const relationshipTag = alwaysHostile ? 'Hostile' : atWar ? 'At War' : 'Neutral';
      const relColor = alwaysHostile || atWar ? '#d94a4a' : '#e8c170';

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

        const closeBtn = createGameButton('X', 'close');
        closeBtn.id = 'btn-deselect';
        closeBtn.setAttribute('aria-label', 'Close unit details');

        header.appendChild(info);
        header.appendChild(closeBtn);
        wrapper.appendChild(header);

        const descDiv = document.createElement('div');
        descDiv.style.cssText = 'font-size:10px;opacity:0.6;margin-top:4px;';
        descDiv.textContent = desc;
        wrapper.appendChild(descDiv);

        if (ownerKind === 'pirate') {
          const pirateWaters = createGameButton('Open Pirate Waters', 'secondary');
          pirateWaters.dataset.action = 'open-pirate-waters';
          pirateWaters.addEventListener('click', () => openPirateWaters({ factionId: enemyUnit.owner }));
          wrapper.appendChild(pirateWaters);
        }

        const hostileStackSize = visibleHostileUnitEntriesAtKey(key).length;
        if (hostileStackSize > 1) {
          const stackDiv = document.createElement('div');
          stackDiv.style.cssText = 'font-size:10px;opacity:0.72;margin-top:4px;';
          stackDiv.textContent = `${def.name} defends this stack. ${hostileStackSize} enemy units present.`;
          wrapper.appendChild(stackDiv);
        }

        panel.appendChild(wrapper);
        closeBtn.addEventListener('click', deselectUnit);
      }
      return;
    }
  }

  // If unit is selected and tapping a movement or attack target
  if (selectedUnitId && (selectedUnitCanMoveToTappedHex || selectedUnitCanAttackTappedHex)) {
    const unit = gameState.units[selectedUnitId];
    if (!unit) return;

    // Check for enemy unit at target — show combat preview
    const defenderEntry = selectDefenderEntryAtKey(key);
    if (selectedUnitCanAttackTappedHex && defenderEntry) {
      const defender = defenderEntry[1];
      const amphibiousAssault = Boolean(unit.transportId);
      const previewAttacker = amphibiousAssault
        ? { ...unit, position: { ...gameState.units[unit.transportId!].position }, transportId: undefined }
        : unit;
      const navalGate = canUnitAttackBeast(previewAttacker, defender);
      if (!navalGate.allowed) {
        showNotification(navalGate.reason ?? 'Cannot attack that target.', 'warning');
        selectUnit(selectedUnitId);
        return;
      }
      const atkDef = UNIT_DEFINITIONS[unit.type];
      const defDef = UNIT_DEFINITIONS[defender.type];
      const strengthPreview = calculateCombatStrengths(
        previewAttacker,
        defender,
        gameState.map,
        buildCombatContextForDefender(gameState, previewAttacker, defender, { amphibiousAssault }),
      );
      const atkStr = Math.round(strengthPreview.attackerStrength);
      const defStr = Math.round(strengthPreview.defenderStrength);

      const ownerKind = classifyOwner(defender.owner);
      const isMinorCiv = ownerKind === 'minor';
      let ownerName: string;
      if (ownerKind === 'barbarian') {
        ownerName = 'Barbarian';
      } else if (ownerKind === 'pirate') {
        ownerName = 'Pirates';
      } else if (ownerKind === 'rebel') {
        ownerName = 'Rebels';
      } else if (ownerKind === 'beast') {
        ownerName = 'Legendary Beasts';
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
        info.textContent = formatCombatPreviewDetails(ownerName, defender.health, strengthPreview);
        previewDiv.appendChild(info);

        const defenderBeastDef = getBeastDefinitionByUnitType(defender.type);
        if (defenderBeastDef?.regenPerTurn) {
          const traitLine = document.createElement('div');
          traitLine.style.cssText = 'font-size:10px;color:#f4c842;margin-bottom:6px;';
          traitLine.textContent = `⚠ Regenerates ${defenderBeastDef.regenPerTurn} HP every turn`;
          previewDiv.appendChild(traitLine);
        }
        if (defenderBeastDef?.navalOnly) {
          const traitLine = document.createElement('div');
          traitLine.style.cssText = 'font-size:10px;color:#f4c842;margin-bottom:6px;';
          traitLine.textContent = '⚠ Only ships and ranged units can fight it';
          previewDiv.appendChild(traitLine);
        }

        const hostileStackSize = visibleHostileUnitEntriesAtKey(key).length;
        if (hostileStackSize > 1) {
          const stackInfo = document.createElement('div');
          stackInfo.style.cssText = 'font-size:10px;opacity:0.72;margin-bottom:8px;';
          stackInfo.textContent = `${defDef.name} defends this stack. ${hostileStackSize} enemy units present.`;
          previewDiv.appendChild(stackInfo);
        }

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
          const attacker = selectedUnitId ? gameState.units[selectedUnitId] : undefined;
          const legality = attacker?.transportId
            ? getEmbarkedAssaultTarget(gameState, attacker.id, coord, { viewerId: gameState.currentPlayer })
            : canUnitAttackTarget(gameState, attacker, coord, { viewerId: gameState.currentPlayer });
          if (!legality.ok || legality.targetType !== 'unit') {
            showNotification('That target is no longer attackable.', 'warning');
            if (selectedUnitId) selectUnit(selectedUnitId);
            return;
          }
          executeAttack(selectedUnitId!, key);
        });
        return; // Wait for button press
      }
    } else {
      const tapIntent = resolveSelectedUnitTapIntent(gameState, selectedUnitId, coord, movementRange);
      if (tapIntent.kind === 'assault-city') {
        const attackerUnit = gameState.units[selectedUnitId];
        const targetCity = gameState.cities[tapIntent.cityId];
        const ownerCiv = targetCity ? gameState.civilizations[targetCity.owner] : undefined;
        if (!attackerUnit || !targetCity || !ownerCiv) return;

        const attackerMultiplier = tapIntent.embarkedAssault
          ? getAmphibiousAssaultMultiplier(gameState, attackerUnit, targetCity.position)
          : undefined;
        const effectiveAttacker = tapIntent.embarkedAssault && attackerUnit.transportId
          ? { ...attackerUnit, position: { ...gameState.units[attackerUnit.transportId].position }, transportId: undefined }
          : attackerUnit;
        const strengths = calculateCityAssaultStrengths(effectiveAttacker, targetCity, ownerCiv, gameState.map, { attackerMultiplier });
        const atkStr = Math.round(strengths.attackerStrength);
        const cityStr = Math.round(strengths.intrinsicStrength);
        const odds = strengths.winProbability > 0.55 ? 'Favorable' : strengths.winProbability > 0.45 ? 'Even' : 'Risky';
        const oddsColor = strengths.winProbability > 0.55 ? '#6b9b4b' : strengths.winProbability > 0.45 ? '#e8c170' : '#d94a4a';

        const panel = document.getElementById('info-panel');
        if (panel) {
          panel.style.display = 'block';
          const previewDiv = document.createElement('div');
          previewDiv.style.cssText = 'background:rgba(100,0,0,0.9);border-radius:12px;padding:12px 16px;';

          const title = document.createElement('div');
          title.style.cssText = 'font-size:13px;color:#e8c170;margin-bottom:6px;';
          title.textContent = 'Assault Preview';
          previewDiv.appendChild(title);

          const stats = document.createElement('div');
          stats.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px;';
          const atkSpan = document.createElement('span');
          atkSpan.textContent = `${UNIT_DEFINITIONS[attackerUnit.type].name} (${atkStr})`;
          const oddsSpan = document.createElement('span');
          oddsSpan.style.cssText = `color:${oddsColor};font-weight:bold;`;
          oddsSpan.textContent = odds;
          const defSpan = document.createElement('span');
          defSpan.textContent = `${targetCity.name} defenses (${cityStr})`;
          stats.appendChild(atkSpan);
          stats.appendChild(oddsSpan);
          stats.appendChild(defSpan);
          previewDiv.appendChild(stats);

          const info = document.createElement('div');
          info.style.cssText = 'font-size:10px;opacity:0.6;margin-bottom:8px;';
          info.textContent = tapIntent.embarkedAssault
            ? 'Landing -50%. Marine training and adjacent shore bombardment are included.'
            : 'A walled city fights back if it has no garrison.';
          previewDiv.appendChild(info);

          const btnRow = document.createElement('div');
          btnRow.style.cssText = 'display:flex;gap:8px;';
          const attackBtn = document.createElement('button');
          attackBtn.id = 'btn-assault-confirm';
          attackBtn.textContent = 'Attack';
          attackBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:#d94a4a;border:none;color:white;font-weight:bold;cursor:pointer;';
          const cancelBtn = document.createElement('button');
          cancelBtn.id = 'btn-cancel-assault';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:rgba(255,255,255,0.15);border:none;color:white;cursor:pointer;';
          btnRow.appendChild(attackBtn);
          btnRow.appendChild(cancelBtn);
          previewDiv.appendChild(btnRow);

          panel.innerHTML = '';
          panel.appendChild(previewDiv);

          cancelBtn.addEventListener('click', deselectUnit);
          attackBtn.addEventListener('click', () => {
            const assaultStatus = beginPlayerCityAssault(selectedUnitId!, tapIntent.cityId, undefined, undefined, tapIntent.embarkedAssault);
            SFX.combat();
            renderLoop.setGameState(gameState);
            updateHUD();
            if (assaultStatus === 'resolved') {
              setTimeout(() => selectNextUnit(), 400);
            }
          });
        }
        return;
      }

      if (tapIntent.kind === 'confirm-war-city') {
        const selectedId = selectedUnitId;
        const city = gameState.cities[tapIntent.cityId];
        const defender = gameState.civilizations[tapIntent.defenderId];
        createForeignCityEntryPanel(uiLayer, {
          cityName: city?.name ?? 'this city',
          defenderName: defender?.name ?? tapIntent.defenderId,
          onConfirm: () => {
            const begun = beginConfirmedForeignCityEntry(gameState, selectedId, tapIntent.cityId, bus);
            gameState = begun.state;
            if (!begun.ok) {
              showNotification(
                begun.reason === 'repelled-by-city-defense'
                  ? "Your attack was repelled by the city's defenses!"
                  : 'The attack could not proceed.',
                'warning',
              );
              renderLoop.setGameState(gameState);
              updateHUD();
              return;
            }
            pendingCityCaptureChoice = begun.pending;
            const captureCity = gameState.cities[tapIntent.cityId];
            if (captureCity) {
              createCityCapturePanel(uiLayer, {
                cityName: captureCity.name,
                occupiedPopulation: begun.pending.occupiedPopulation,
                razeGold: begun.pending.razeGold,
                onOccupy: () => finalizePendingCityCaptureChoice('occupy'),
                onRaze: () => finalizePendingCityCaptureChoice('raze'),
              });
            }
            SFX.tap();
            renderLoop.setGameState(gameState);
            updateHUD();
          },
          onCancel: () => selectUnit(selectedId),
        });
        return;
      }

      if (tapIntent.kind === 'confirm-war-minor-civ') {
        const selectedId = selectedUnitId;
        const city = gameState.cities[tapIntent.cityId];
        const minor = gameState.minorCivs[tapIntent.minorCivId];
        const definition = MINOR_CIV_DEFINITIONS.find(candidate => candidate.id === minor?.definitionId);
        createForeignCityEntryPanel(uiLayer, {
          cityName: city?.name ?? 'this city-state',
          defenderName: definition?.name ?? 'the city-state',
          onConfirm: () => {
            const war = setMinorCivWarState(gameState, gameState.currentPlayer, tapIntent.minorCivId, true);
            if (!war.ok) return;
            gameState = war.state;
            emitMinorCivQuestTransitions(bus, war.transitions, gameState);
            executeMinorCivConquest(selectedId, coord, tapIntent.minorCivId, tapIntent.cityId);
          },
          onCancel: () => selectUnit(selectedId),
        });
        return;
      }

      if (tapIntent.kind === 'assault-minor-civ') {
        const mc = gameState.minorCivs[tapIntent.minorCivId];
        if (mc && !mc.isDestroyed) {
          executeMinorCivConquest(selectedUnitId, coord, tapIntent.minorCivId, tapIntent.cityId);
        } else {
          SFX.tap();
          renderLoop.setGameState(gameState);
          updateHUD();
          setTimeout(() => selectNextUnit(), 400);
        }
        return;
      }

      // Move unit
      if (isWorkerBusy(gameState, selectedUnitId)) {
        const selectedId = selectedUnitId;
        const task = gameState.units[selectedId]?.workerTask;
        const taskTile = task ? gameState.map.tiles[hexKey(task.coord)] : undefined;
        const isRoadTask = task?.action === 'build_road';
        createWorkerTaskWarningPanel(uiLayer, {
          improvementName: task
            ? (isRoadTask ? 'Road' : getImprovementDisplayName(task.action as ImprovementType))
            : 'Improvement',
          turnsLeft: (isRoadTask ? taskTile?.roadTurnsLeft : taskTile?.improvementTurnsLeft) ?? 1,
          onCancel: () => selectUnit(selectedId),
          onConfirm: () => {
            executeAnimatedUnitMove(selectedId, () => confirmBusyWorkerMove(gameState, selectedId, coord, {
              actor: 'player',
              civId: gameState.currentPlayer,
              bus,
            }));
            SFX.tap();
            renderLoop.setGameState(gameState);
            updateHUD();
          },
        });
        return;
      }

      executeAnimatedUnitMove(selectedUnitId, () => executeUnitMove(gameState, selectedUnitId!, coord, {
        actor: 'player',
        civId: gameState.currentPlayer,
        bus,
      }));
      SFX.tap();
    }

    renderLoop.setGameState(gameState);
    updateHUD();
    return;
  }

  // Check if tapping a player-owned city hex
  const cityAtHex = Object.values(gameState.cities).find(
    c => c.owner === gameState.currentPlayer && hexKey(c.position) === key,
  );
  if (cityAtHex) {
    document.getElementById('tech-panel')?.remove();
    document.getElementById('city-panel')?.remove();
    document.getElementById('espionage-panel')?.remove();
    document.getElementById('diplomacy-panel')?.remove();
    document.getElementById('marketplace-panel')?.remove();
    document.getElementById('council-panel')?.remove();
    deselectUnit();
    openCityPanelForCity(cityAtHex);
    return;
  }

  const wonderAtlasIntent = resolveWonderAtlasIntent(gameState, gameState.currentPlayer, coord);
  if (wonderAtlasIntent.type === 'open-atlas') {
    deselectUnit();
    const audioFocus = resolveNaturalWonderAudioFocus(gameState, gameState.currentPlayer, coord);
    if (audioFocus) void audio.startNaturalWonderMapFocusAmbient(audioFocus.wonderId);
    openWonderAtlas(wonderAtlasIntent.wonderId);
    SFX.tap();
    return;
  }

  // Tapping empty hex — deselect
  deselectUnit();
  SFX.tap();
}

function openTerritoryInspectionPanel(coord: HexCoord): void {
  document.getElementById('territory-inspection-panel')?.remove();
  const audioFocus = resolveNaturalWonderAudioFocus(gameState, gameState.currentPlayer, coord);
  if (audioFocus) void audio.startNaturalWonderMapFocusAmbient(audioFocus.wonderId);
  const panel = createTerritoryInspectionPanel(gameState, coord, gameState.currentPlayer, () => {
    audio.stopNaturalWonderAmbient('panel-closed');
    document.getElementById('territory-inspection-panel')?.remove();
  });
  uiLayer.appendChild(panel);
}

function closeTerritoryInspectionPanel(): void {
  audio.stopNaturalWonderAmbient('panel-closed');
  document.getElementById('territory-inspection-panel')?.remove();
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
    closeTerritoryInspectionPanel();
    showNotification('Unexplored territory');
    return;
  }

  if (visibility === 'fog') {
    openTerritoryInspectionPanel(coord);
    return;
  }

  const unitAtHex = Object.values(gameState.units).find(unit =>
    unit.owner === gameState.currentPlayer
      && unit.position.q === coord.q
      && unit.position.r === coord.r,
  );
  if (unitAtHex) {
    closeTerritoryInspectionPanel();
    selectUnit(unitAtHex.id);
    openUnitContextMenu(unitAtHex.id);
    return;
  }

  openTerritoryInspectionPanel(coord);
}

function handleVictoryIfNeeded(): boolean {
  if (!gameState.gameOver) return false;
  const winnerCiv = gameState.winner
    ? gameState.civilizations[gameState.winner]
    : undefined;
  const winnerName = winnerCiv?.name ?? gameState.winner ?? '';
  const outcome = gameState.winner === gameState.currentPlayer ? 'victory' : 'defeat';
  setBlockingOverlay('victory');
  showVictoryPanel(uiLayer, {
    winnerName,
    victoryType: outcome === 'victory' ? 'Domination Victory' : 'Campaign Defeat',
    outcome,
    reason: gameState.gameOverReason ?? 'domination',
    turn: gameState.turn,
    onNewGame: () => {
      document.getElementById('victory-panel')?.remove();
      setBlockingOverlay(null);
      showGameModeSelection();
    },
  });
  return true;
}

type AIMoveRecord = {
  unit: Unit;
  viewerId: string;
  visibleSegments: HexCoord[][];
};

function captureAIMoves(fn: () => void): AIMoveRecord[] {
  const moves: AIMoveRecord[] = [];
  const unsub = bus.on('unit:move', ({ presentationByViewer }) => {
    for (const [viewerId, presentation] of Object.entries(presentationByViewer)) {
      moves.push({
        unit: structuredClone(presentation.unit),
        viewerId,
        visibleSegments: structuredClone(presentation.visibleSegments),
      });
    }
  });
  fn();
  unsub();
  return moves;
}

async function replayAIMoves(moves: AIMoveRecord[]): Promise<void> {
  if (roundPresentationGate.isSuppressed()) return;
  const visibleMoves = moves
    .filter(move => move.viewerId === gameState.currentPlayer)
    .slice(0, 6);
  for (const { unit, visibleSegments } of visibleMoves) {
    for (const path of visibleSegments.filter(segment => segment.length >= 2)) {
      if (roundPresentationGate.isSuppressed() || gameState.currentPlayer !== visibleMoves[0]?.viewerId) return;
      await new Promise<void>(resolve => renderLoop.animateUnitMove(
        { ...unit, position: path[0]! },
        path,
        resolve,
      ));
    }
  }
}

function runCurrentCompletedRound(state: GameState) {
  return runCompletedRound(state, bus, {
    improvements: (current, eventBus) => processImprovementTurns(current, eventBus),
    majors: (current, eventBus) => processNonHumanMajorRound(current, eventBus).state,
    world: (current, eventBus) => processTurn(current, eventBus),
    postprocess: (beforeRound, current, eventBus) =>
      applyStrategicWarningTransitions(beforeRound, current, eventBus),
  });
}

function emitCurrentPlayerAudioSnapshot(civId: string): void {
  const civ = gameState.civilizations[civId];
  const cities = Object.values(gameState.cities).filter(city => city.owner === civId);
  bus.emit('currentPlayer:changed-after-handoff', {
    civId,
    civType: civ?.civType ?? civId,
    era: gameState.era,
    atWarCount: civ?.diplomacy?.atWarWith?.length ?? 0,
    unrestCityCount: cities.filter(city => city.unrestLevel > 0).length,
    nearDefeat: civ?.nearDefeat ?? false,
    inBeastTerritory: isCivUnitInBeastTerritory(gameState, civId),
  });
}

/** Opens due Exploit warnings only after the human viewer's identity has been confirmed. */
function beginNetworkPlansForCurrentViewer(): void {
  const viewerId = gameState.currentPlayer;
  if (!gameState.civilizations[viewerId]?.isHuman) return;
  const result = beginNetworkPlansForVictimTurn(gameState, viewerId);
  gameState = result.state;
  for (const warning of result.warnings) {
    const plan = Object.values(gameState.autonomyByCiv ?? {})
      .map(autonomy => autonomy.plans[warning.planId])
      .find(Boolean);
    if (plan?.target.kind !== 'city') continue;
    bus.emit('network:exploit-warning', {
      planId: warning.planId,
      victimCivId: viewerId,
      cityId: plan.target.cityId,
    });
  }
}

function releaseHandoffToViewer(nextSlotId: string): void {
  centerOnCurrentPlayer();
  renderLoop.setGameState(gameState);
  updateHUD();
  scanBeastSightings();
  maybeShowPendingHoardChoice();
  roundPresentationGate.resume();
  audio.setMasterVolume(currentMasterVolume);
  setBlockingOverlay(null);
  emitCurrentPlayerAudioSnapshot(nextSlotId);
  handleVictoryIfNeeded();
}

/** These player-owned surfaces may contain strategic targets; never carry them across a hot-seat veil. */
function closeNetworkPanelsForHandoff(): void {
  document.getElementById('network-panel')?.remove();
  document.querySelector('[aria-label="Network intent"]')?.remove();
}

async function beginHotSeatHandoff(
  hotSeat: NonNullable<GameState['hotSeat']>,
  completesRound: boolean,
): Promise<void> {
  const preSimulationState = gameState;
  const previousHumanId = preSimulationState.currentPlayer;
  let resolvedNextSlotId = completesRound
    ? null
    : getNextActiveHumanPlayerId(preSimulationState, previousHumanId);
  const nextPlayer = hotSeat.players.find(player => player.slotId === resolvedNextSlotId);
  closePirateWatersPanels(uiLayer);
  closeNetworkPanelsForHandoff();
  renderLoop.setSelectedPirateFactionId(null);
  audio.stopPirateAmbience('player-changed');
  audio.setMasterVolume(0);
  setBlockingOverlay('turn-handoff');
  roundPresentationGate.suppress();
  const controller = showTurnHandoff(
    uiLayer,
    preSimulationState,
    resolvedNextSlotId,
    resolvedNextSlotId ? (nextPlayer?.name ?? 'Player') : null,
    {
      initiallyReady: false,
      preparingLabel: 'Preparing next turn…',
      onReady: async summary => {
        if (!resolvedNextSlotId) return;
        const acknowledgement = acknowledgeTurnHandoffSummary(
          gameState,
          resolvedNextSlotId,
          summary,
        );
        gameState = acknowledgement.state;
        beginNetworkPlansForCurrentViewer();
        let acknowledgementFailed = false;
        try {
          await autoSave(gameState);
        } catch {
          acknowledgementFailed = true;
        }
        releaseHandoffToViewer(resolvedNextSlotId);
        if (acknowledgement.playStrategicWarningAudio) {
          bus.emit('ai:strategic-warning-audio', {
            viewerId: resolvedNextSlotId,
            turn: summary.turn,
          });
        }
        if (acknowledgementFailed) {
          showNotification('Turn opened, but its summary may repeat after reload.', 'warning');
        }
      },
    },
  );

  const returnToSaves = (): void => {
    roundPresentationGate.resume();
    window.location.reload();
  };

  const persistIntermediateHandoff = async (): Promise<void> => {
    try {
      await autoSave(gameState);
      controller.setReady(gameState);
    } catch {
      controller.setError(
        'The turn handoff could not be saved. Retry saving before opening the next turn.',
        {
          onRetry: () => void persistIntermediateHandoff(),
          onReturnToSaves: returnToSaves,
        },
      );
    }
  };

  if (!completesRound) {
    if (!resolvedNextSlotId) {
      gameState = resolveHotSeatPostSimulation(preSimulationState, previousHumanId).state;
      controller.remove();
      handleVictoryIfNeeded();
      return;
    }
    gameState = applyPendingChallengeForCiv(
      { ...preSimulationState, currentPlayer: resolvedNextSlotId },
      resolvedNextSlotId,
    );
    void persistIntermediateHandoff();
    return;
  }

  const transaction = createCompletedRoundHandoffTransaction({
    initialState: preSimulationState,
    runCompletedRound: runCurrentCompletedRound,
    prepareCompletedState: state =>
      resolveHotSeatPostSimulation(state, previousHumanId).state,
    eventTarget: bus,
    adoptState: state => {
      gameState = state;
    },
    persistState: autoSave,
    onCommitErrors: errors => {
      if (errors.length > 0) {
        console.error('[handoff] Buffered presentation events failed to dispatch.', errors);
      }
    },
  });

  const persistCompletedHandoff = async (): Promise<void> => {
    const outcome = await transaction.persistCompletedRoundHandoff();
    if (outcome.status === 'ready') {
      if (outcome.state.gameOver) {
        controller.remove();
        handleVictoryIfNeeded();
        return;
      }
      resolvedNextSlotId = outcome.state.currentPlayer;
      const recipient = hotSeat.players.find(player => player.slotId === resolvedNextSlotId);
      controller.setRecipient(outcome.state, resolvedNextSlotId, recipient?.name ?? 'Player');
      return;
    }
    controller.setError(
      'The round finished, but the handoff could not be saved. Retry saving before opening the next turn.',
      {
        onRetry: () => void persistCompletedHandoff(),
        onReturnToSaves: returnToSaves,
      },
    );
  };

  const simulate = async (): Promise<void> => {
    // withHappenedTurn only needs to cover the synchronous commitTo() inside
    // runCompletedRoundSimulation (completed-round-handoff.ts) -- it runs
    // before that function's first await, so wrapping the whole (async) call
    // still stamps every event committed this round with the pre-round turn
    // (#551). If that commit ever moves after an await, thread the turn
    // through the transaction options instead.
    const outcome = await notificationDelivery.withHappenedTurn(
      preSimulationState.turn,
      () => transaction.runCompletedRoundSimulation(),
    );
    if (outcome.status === 'simulation-failed') {
      controller.setError(
        'The round could not be completed. Your turn is unchanged and was not autosaved.',
        {
          onRetry: () => void simulate(),
          onReturnToSaves: returnToSaves,
        },
      );
      return;
    }
    if (outcome.status === 'persistence-failed') {
      controller.setError(
        'The round finished, but the handoff could not be saved. Retry saving before opening the next turn.',
        {
          onRetry: () => void persistCompletedHandoff(),
          onReturnToSaves: returnToSaves,
        },
      );
      return;
    }
    if (outcome.state.gameOver) {
      controller.remove();
      handleVictoryIfNeeded();
      return;
    }
    resolvedNextSlotId = outcome.state.currentPlayer;
    const recipient = hotSeat.players.find(player => player.slotId === resolvedNextSlotId);
    controller.setRecipient(outcome.state, resolvedNextSlotId, recipient?.name ?? 'Player');
  };
  void simulate();
}

async function endTurn(options: { allowUnmovedUnits?: boolean } = {}): Promise<void> {
  if (gameState.gameOver) return;
  try {
    if (showReligionBoonIfNeeded()) {
      showNotification('Choose a boon for your religion before ending the turn.', 'info');
      return;
    }

    if (showRequiredChoicesIfNeeded()) {
      showNotification('Choose production and research before ending the turn.', 'info');
      return;
    }

    if (!options.allowUnmovedUnits && getUnitTurnFlow().showEndTurnUnitWarningIfNeeded()) {
      return;
    }

    SFX.endTurn();
    deselectUnit();

    const hotSeat = gameState.hotSeat;

    if (hotSeat) {
      await beginHotSeatHandoff(
        hotSeat,
        isActiveHumanRoundComplete(gameState, gameState.currentPlayer),
      );
    } else {
      // --- Solo Mode ---
      const roundTurn = gameState.turn;
      const result = runCurrentCompletedRound(gameState);
      if (!result.ok) throw result.error;
      gameState = result.state;
      beginNetworkPlansForCurrentViewer();
      const soloMoves = captureAIMoves(() => {
        notificationDelivery.withHappenedTurn(roundTurn, () => {
          result.events.commitTo(bus);
        });
      });

      if (handleVictoryIfNeeded()) return;

      renderLoop.setGameState(gameState);
      await replayAIMoves(soloMoves);
      updateHUD();

      showNotification(`Turn ${gameState.turn}`, 'info');
      advisorSystem.check(gameState);

      await autoSave(gameState);
      bus.emit('game:saved', { turn: gameState.turn });
    }
  } catch (err) {
    console.error('endTurn error:', err);
    showNotification('Error processing turn!', 'warning');
  }
}

function centerOnCurrentPlayer(): void {
  const units = Object.values(gameState.units).filter(u => u.owner === gameState.currentPlayer);
  if (units.length > 0) {
    renderLoop.camera.centerOn(units[0].position);
  }
}

// --- Capture verdict UI ---

interface ChoiceAction {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

function createPersistentChoiceNotification(message: string, actions: ChoiceAction[]): void {
  const existing = document.getElementById('capture-verdict-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'capture-verdict-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:999;';

  const inner = document.createElement('div');
  inner.style.cssText = 'background:#1a1e2e;border-radius:14px;padding:20px;max-width:380px;width:90%;display:flex;flex-direction:column;gap:12px;color:#f5f7fb;';

  const msg = document.createElement('p');
  msg.textContent = message;
  msg.style.cssText = 'margin:0;font-size:13px;line-height:1.5;';
  inner.appendChild(msg);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';

  for (const action of actions) {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.style.cssText = action.danger
      ? 'padding:8px 14px;border-radius:8px;background:rgba(220,60,60,0.25);border:1px solid rgba(220,60,60,0.5);color:#ff9999;font-size:12px;cursor:pointer;'
      : 'padding:8px 14px;border-radius:8px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#f5f7fb;font-size:12px;cursor:pointer;';
    btn.addEventListener('click', () => {
      overlay.remove();
      action.onClick();
    });
    btnRow.appendChild(btn);
  }

  inner.appendChild(btnRow);
  overlay.appendChild(inner);
  document.body.appendChild(overlay);
}

function showEspionageCaptureChoice(spyId: string, spyOwner: string): void {
  const captorEsp = gameState.espionage?.[gameState.currentPlayer];
  const spy = gameState.espionage?.[spyOwner]?.spies[spyId];
  if (!captorEsp || !spy) return;
  const spyOwnerName = gameState.civilizations[spyOwner]?.name ?? spyOwner;

  // D1: always reveal true identity to captor regardless of disguise
  const captureMessage = `You have captured ${spy.name}, a ${spy.unitType} belonging to ${spyOwnerName}.`;

  // infiltrated spies are inside the city (distance 0); otherwise use boundary penalty
  const distanceToCity = spy.infiltrationCityId ? 0 : 1;
  const relPenalty = getSpyCaptureRelationshipPenalty(distanceToCity);

  createPersistentChoiceNotification(captureMessage, [
    {
      label: `Expel (${relPenalty} relations)`,
      onClick: () => {
        const updatedOwnerEsp = expelSpy(gameState.espionage![spyOwner], spyId, 15);
        const capital = getCapitalCity(gameState, spyOwner);
        if (capital) {
          const newUnit = createUnit(spy.unitType, spyOwner, capital.position, gameState.idCounters);
          gameState = {
            ...gameState,
            units: { ...gameState.units, [newUnit.id]: newUnit },
            civilizations: {
              ...gameState.civilizations,
              [spyOwner]: {
                ...gameState.civilizations[spyOwner],
                units: [...gameState.civilizations[spyOwner].units, newUnit.id],
              },
            },
          };
          const { [spyId]: _old, ...rest } = updatedOwnerEsp.spies;
          gameState = {
            ...gameState,
            espionage: {
              ...gameState.espionage,
              [spyOwner]: {
                ...updatedOwnerEsp,
                spies: { ...rest, [newUnit.id]: { ...updatedOwnerEsp.spies[spyId]!, id: newUnit.id } },
              },
            },
          };
        } else {
          gameState = { ...gameState, espionage: { ...gameState.espionage, [spyOwner]: updatedOwnerEsp } };
        }
        // Bilateral: captor's view of spy owner AND spy owner's view of captor
        const captorId = gameState.currentPlayer;
        gameState = {
          ...gameState,
          civilizations: {
            ...gameState.civilizations,
            [captorId]: {
              ...gameState.civilizations[captorId],
              diplomacy: modifyRelationship(
                gameState.civilizations[captorId].diplomacy, spyOwner, relPenalty,
              ),
            },
            [spyOwner]: {
              ...gameState.civilizations[spyOwner],
              diplomacy: modifyRelationship(
                gameState.civilizations[spyOwner].diplomacy, captorId, relPenalty,
              ),
            },
          },
        };
        showNotification(`${spy.name} expelled. Will return to their capital after 15 turns.`, 'info');
        renderLoop.setGameState(gameState);
      },
    },
    {
      label: 'Execute',
      danger: true,
      onClick: () => {
        // Second in-panel confirmation — no window.confirm on mobile
        createPersistentChoiceNotification(
          `Execute ${spy.name}? This cannot be undone and will severely damage relations with ${spyOwnerName}.`,
          [
            {
              label: 'Cancel',
              onClick: () => showEspionageCaptureChoice(spyId, spyOwner),
            },
            {
              label: 'Confirm Execute',
              danger: true,
              onClick: () => {
                const captorId = gameState.currentPlayer;
                gameState = {
                  ...gameState,
                  espionage: {
                    ...gameState.espionage,
                    [spyOwner]: executeSpy(gameState.espionage![spyOwner], spyId),
                  },
                  // Bilateral: captor's view AND spy owner's view
                  civilizations: {
                    ...gameState.civilizations,
                    [captorId]: {
                      ...gameState.civilizations[captorId],
                      diplomacy: modifyRelationship(
                        gameState.civilizations[captorId].diplomacy, spyOwner, relPenalty * 2,
                      ),
                    },
                    [spyOwner]: {
                      ...gameState.civilizations[spyOwner],
                      diplomacy: modifyRelationship(
                        gameState.civilizations[spyOwner].diplomacy, captorId, relPenalty * 2,
                      ),
                    },
                  },
                };
                bus.emit('espionage:spy-executed', {
                  executingCivId: captorId, spyOwner, spyId, spyName: spy.name,
                });
                showNotification(`${spy.name} has been executed.`, 'warning');
                renderLoop.setGameState(gameState);
              },
            },
          ],
        );
      },
    },
    {
      label: 'Interrogate (4 turns)',
      onClick: () => {
        const ownerEsp = gameState.espionage![spyOwner];
        gameState = {
          ...gameState,
          espionage: {
            ...gameState.espionage,
            [gameState.currentPlayer]: startInterrogation(captorEsp, spyId, spyOwner),
            // Set spy status to 'interrogated' on the spy owner's record
            [spyOwner]: {
              ...ownerEsp,
              spies: {
                ...ownerEsp.spies,
                [spyId]: { ...ownerEsp.spies[spyId]!, status: 'interrogated' as const },
              },
            },
          },
        };
        showNotification(`${spy.name} is being interrogated. Check the Intel panel for results.`, 'info');
        renderLoop.setGameState(gameState);
      },
    },
  ]);
}

// --- Event listeners ---
bus.on('tech:completed', ({ civId, techId }) => {
  appendToCivLog(civId, `Research complete: ${techId}!`, 'success');
  if (techId === 'fishing') {
    appendToCivLog(civId, 'Fishing unlocked — build a Dock in your coastal cities to boost food and trade.', 'info');
  }
  if (civId === gameState.currentPlayer) SFX.research();
});

bus.on('city:grew', ({ cityId, newPopulation }) => {
  const city = gameState.cities[cityId];
  if (!city) return;
  appendToCivLog(city.owner, `${city.name} grew to ${newPopulation} population!`, 'success');
});

bus.on('city:maturity-upgraded', ({ cityId, current }) => {
  const city = gameState.cities[cityId];
  if (!city) return;
  const label = `${current[0].toUpperCase()}${current.slice(1)}`;
  appendToCivLog(city.owner, `${city.name} became a ${label}. New city slots unlocked.`, 'success');
});

bus.on('city:building-complete', ({ cityId, buildingId }) => {
  const city = gameState.cities[cityId];
  if (!city) return;
  const bldg = BUILDINGS[buildingId];
  const buildingName = bldg?.name ?? buildingId;
  appendToCivLog(city.owner, `${city.name}: ${buildingName} completed!`, 'success');
  if (bldg?.nationalProject) {
    SFX.nationalProjectBuilt();
  }
});

bus.on('city:national-project-expired', ({ civId, cityId, buildingId }) => {
  const city = gameState.cities[cityId];
  const bldg = BUILDINGS[buildingId];
  if (!bldg || !city) return;
  const msg = document.createTextNode(
    `${city.name}: ${bldg.name} has expired — your civilization has grown beyond this era's institutions.`
  );
  appendToCivLog(civId, msg.textContent ?? '', 'warning');
  SFX.nationalProjectExpired();
});

bus.on('city:production-item-dropped', event => routeDroppedProductionItem(gameState, event, appendToCivLog));

bus.on('city:cyber-drained', ({ cityName, drainerOwner, goldLost, blocked, victimCivId }) => {
  const drainerName = gameState.civilizations[drainerOwner]?.name ?? drainerOwner;
  const victimName = gameState.civilizations[victimCivId]?.name ?? victimCivId;
  if (blocked) {
    appendToCivLog(victimCivId, `Cyber Defense Center blocked an intrusion in ${cityName}.`, 'success');
    appendToCivLog(drainerOwner, `Cyber attack on ${cityName} was blocked by ${victimName}'s Cyber Defense Center.`, 'warning');
    return;
  }
  appendToCivLog(victimCivId, `Cyber attack: ${cityName} lost ${goldLost} gold (${drainerName} cyber unit).`, 'warning');
  appendToCivLog(drainerOwner, `Cyber unit stole ${goldLost} gold from ${victimName}'s ${cityName}.`, 'success');
});

bus.on('network:exploit-warning', ({ planId, victimCivId, cityId }) => {
  const warning = getNetworkWarningForViewer(gameState, victimCivId, planId);
  const city = gameState.cities[cityId];
  if (!warning || !city) return;
  const disclosure = warning.source?.unitId
    ? ' The source has been identified.'
    : warning.source?.position
      ? ' The source position has been detected.'
      : '';
  appendToCivLog(
    victimCivId,
    `Network exploit warning: ${city.name} will be targeted at the end of this turn. A Cyber Defense Center or Harden reduces the effect.${disclosure}`,
    'warning',
    { kind: 'map', coord: city.position, label: city.name },
  );
  bus.emit('network:audio-cue', { cue: 'hostile-warning', viewerIds: [victimCivId] });
});

bus.on('network:exploit-resolved', ({ cityId, ownerCivId, goldTransferred, delayed }) => {
  const city = gameState.cities[cityId];
  if (!city) return;
  if (delayed) {
    appendToCivLog(city.owner, `${city.name}'s Cyber Defense Center delayed a network exploit.`, 'success');
    appendToCivLog(ownerCivId, `Your network exploit against ${city.name} was delayed by its Cyber Defense Center.`, 'warning');
    return;
  }
  appendToCivLog(city.owner, `Network exploit: ${city.name} lost ${goldTransferred} gold.`, 'warning');
  appendToCivLog(ownerCivId, `Network exploit transferred ${goldTransferred} gold from ${city.name}.`, 'success');
  bus.emit('network:audio-cue', { cue: 'hostile-consequence', viewerIds: [city.owner, ownerCivId] });
});

bus.on('network:audio-cue', ({ cue, viewerIds }) => {
  if (cue === 'constructive-resolution') {
    appendToCivLog(viewerIds[0]!, 'Stable network plan milestone reached: three resolutions recorded.', 'success');
  } else if (cue === 'recovery') {
    appendToCivLog(viewerIds[0]!, 'Network recovery complete.', 'success');
  }
});

bus.on('village:visited', ({ civId, outcome, message }) => {
  if (outcome === 'gold') advisorSystem.resetMessage('treasurer_village_gold');
  if (outcome === 'science') advisorSystem.resetMessage('scholar_village_science');
  if (outcome === 'free_tech') advisorSystem.resetMessage('scholar_village_tech');
  advisorSystem.check(gameState);
  appendToCivLog(civId, message, outcome === 'ambush' || outcome === 'illness' ? 'warning' : 'success');
});

bus.on('wonder:discovered', event => {
  const wonderDef = getWonderDefinition(event.wonderId);
  if (!wonderDef) return;
  const message = event.isFirstDiscoverer
    ? `Discovered ${wonderDef.name}! +${wonderDef.discoveryBonus.amount} ${wonderDef.discoveryBonus.type}`
    : `Found ${wonderDef.name}!`;
  appendToCivLog(event.civId, message, event.isFirstDiscoverer ? 'success' : 'info');

  const revealItem = buildWonderDiscoveryRevealItem(gameState, gameState.currentPlayer, event);
  if (revealItem) {
    wonderDiscoveryQueue?.enqueue(revealItem);
    if (!deferWonderDiscoveryRevealUntilMoveSettles) {
      wonderDiscoveryQueue?.notifyActionSettled();
    }
  }
});

bus.on('wonder:legendary-ready', ({ civId, cityId, wonderId }) => {
  routeLegendaryWonder(gameState, { type: 'wonder:legendary-ready', civId, cityId, wonderId }, appendToCivLog);
});

bus.on('wonder:legendary-availability', event => {
  routeLegendaryWonder(gameState, { type: 'wonder:legendary-availability', ...event }, appendToCivLog);
});

bus.on('wonder:legendary-completed', ({ civId, cityId, wonderId, turnCompleted }) => {
  const event = { civId, cityId, wonderId, turnCompleted };
  routeLegendaryWonder(gameState, { type: 'wonder:legendary-completed', ...event }, appendToCivLog);
  const ceremonyItem = buildLegendaryWonderCompletionCeremonyItem(gameState, event);
  if (ceremonyItem) {
    legendaryCompletionQueue?.enqueue(ceremonyItem);
    legendaryCompletionQueue?.notifyActionSettled();
  }
});

bus.on('wonder:legendary-lost', ({ civId, cityId, wonderId, goldRefund, transferableProduction }) => {
  routeLegendaryWonder(
    gameState,
    { type: 'wonder:legendary-lost', civId, cityId, wonderId, goldRefund, transferableProduction },
    appendToCivLog,
  );
});

bus.on('wonder:legendary-race-revealed', ({ observerId, civId, cityId, wonderId }) => {
  routeLegendaryWonder(
    gameState,
    { type: 'wonder:legendary-race-revealed', observerId, civId, cityId, wonderId },
    appendToCivLog,
  );
});

bus.on('diplomacy:war-declared', ({ attackerId, defenderId }) => {
  routeWarDeclared(gameState, attackerId, defenderId, appendToCivLog);
});

bus.on('diplomacy:treaty-proposed', event => {
  routeTreatyProposed(gameState, event, appendToCivLog);
});

bus.on('civilization:first-contact', ({ civA, civB }) => {
  // #551: routeFirstContact's sink is the delivery contract, which already
  // queues to pendingEvents for a non-active hot-seat recipient -- the old
  // unconditional queueFirstContactPendingEvents call was a second, always-on
  // queue that leaked stale growth into solo saves (which never drain it).
  routeFirstContact(gameState, civA, civB, appendToCivLog);
});

bus.on('diplomacy:peace-requested', ({ fromCivId, toCivId }) => {
  // #551: routePeaceRequested already delivers to toCivId via appendToCivLog
  // (the delivery contract) -- the old extra showNotification here duplicated
  // the message AND leaked it to whoever currentPlayer was at emit time
  // instead of the actual recipient.
  routePeaceRequested(gameState, fromCivId, toCivId, appendToCivLog);
});

bus.on('diplomacy:peace-made', ({ civA, civB }) => {
  routePeaceMade(gameState, civA, civB, appendToCivLog);
});

// viewer-scoped by design: advisors run for the active player only (#551).
bus.on('advisor:message', ({ advisor, message, icon }) => {
  showNotification(`${icon} ${message}`, 'info');
});

// Per-civ dedup: each civ sees a "raiders spotted!" entry only the first time
// its visibility covers any raider from a given camp.
const notifiedBarbarianCampsPerCiv = new Map<string, Set<string>>();

bus.on('combat:resolved', event => {
  handleCombatResolvedEvent(gameState, event, {
    isPresentationSuppressed: () => roundPresentationGate.isSuppressed(),
    applyVisual: result => renderLoop.applyCombatVisual(result),
    appendNotification: appendToCivLog,
  });
});

bus.on('combat:reward-earned', ({ reward }) => {
  routeCombatRewardEarned(gameState, reward, appendToCivLog);
});

bus.on('territory:tile-flipped', event => {
  routeTerritoryTileFlipped(gameState, { type: 'territory:tile-flipped', ...event }, appendToCivLog);
});

bus.on('barbarian:spawned', ({ campId, unitId }) => {
  const unit = gameState.units[unitId];
  if (!unit) return;
  routeBarbarianSpawned(
    gameState,
    unit.position,
    campId,
    notifiedBarbarianCampsPerCiv,
    appendToCivLog,
    (vis, pos) => isVisible(vis as Parameters<typeof isVisible>[0], pos),
  );
});

bus.on('threat:barbarian-resurgence', ({ civId, isBanditLord, banditLordName }) => {
  const message = isBanditLord
    ? `${banditLordName ?? 'A bandit lord'} has united the raiders and threatens your lands!`
    : 'Barbarian forces are resurgent on your lands!';
  appendToCivLog(civId, message, 'warning');
  SFX.barbarianResurgence?.();
});

bus.on('barbarian:city-attacked', ({ cityId, hpLost }) => {
  const city = gameState.cities[cityId];
  if (!city) return;
  if (!gameState.civilizations[city.owner]?.isHuman) return;
  appendToCivLog(city.owner, `Barbarians attack ${city.name}! (−${hpLost} HP)`, 'warning');
});

bus.on('barbarian:city-destroyed', ({ cityId, ownerId }) => {
  if (!gameState.civilizations[ownerId]?.isHuman) return;
  const cityName = gameState.cities[cityId]?.name ?? 'A city';
  appendToCivLog(ownerId, `${cityName} was destroyed by barbarian raiders!`, 'warning');
});

// A walled, ungarrisoned city fighting back against a besieger (#522) -- covers BOTH
// the barbarian (turn-manager.ts) and pirate (pirate-system.ts) counter-fire call
// sites, since both emit this same shared event with their respective 'source' value.
bus.on('city:counter-fire', ({ cityId, source, damage, attackerDied }) => {
  const city = gameState.cities[cityId];
  if (!city) return;
  if (!gameState.civilizations[city.owner]?.isHuman) return;
  const raiderLabel = source === 'barbarian' ? 'raider' : 'ship';
  const message = attackerDied
    ? `${city.name}'s defenses destroyed a ${source === 'barbarian' ? 'barbarian raider' : 'pirate ship'}!`
    : `${city.name}'s walls fought back, damaging a ${raiderLabel} (−${damage} HP)!`;
  appendToCivLog(city.owner, message, attackerDied ? 'success' : 'info');
});

// Pirate-faction naval siege (#522) mirror of the barbarian handler above.
bus.on('pirate:city-destroyed', ({ cityId, ownerId }) => {
  if (!gameState.civilizations[ownerId]?.isHuman) return;
  const cityName = gameState.cities[cityId]?.name ?? 'A coastal city';
  appendToCivLog(ownerId, `${cityName} was razed by pirates!`, 'warning');
});

// A sacked city survives the raid at 1 HP — phrased distinctly from outright
// destruction so a recoverable loss is never mistaken for a permanent one. Both
// barbarians (turn-manager.ts) and pirates (pirate-system.ts, #522) route through
// this shared event with their respective 'source' value.
bus.on('city:sacked', ({ cityId, source, goldLost }) => {
  const city = gameState.cities[cityId];
  if (!city) return;
  if (!gameState.civilizations[city.owner]?.isHuman) return;
  const raiders = source === 'barbarian' ? 'Barbarian raiders' : 'Pirates';
  appendToCivLog(
    city.owner,
    `${raiders} have sacked ${city.name}! The city survives at 1 HP, but ${goldLost} gold was looted.`,
    'warning',
  );
});

bus.on('beast:awakened', ({ beastId, position }) => {
  const def = BEAST_DEFINITIONS[beastId];
  for (const [civId, civ] of Object.entries(gameState.civilizations)) {
    if (!civ.visibility || getVisibility(civ.visibility, position) === 'unexplored') continue;
    appendToCivLog(civId, def.awakeningFlavor, 'warning', { kind: 'map', coord: position, label: `${def.name} lair` });
  }
});

bus.on('beast:slain', ({ beastId, lairId, slayerCivId, goldAwarded }) => {
  const def = BEAST_DEFINITIONS[beastId];
  const slayerName = gameState.civilizations[slayerCivId]?.name ?? slayerCivId;
  const isApex = def.tier >= 4;
  const isChoiceTier = def.tier >= 2 && !isApex;
  for (const civId of Object.keys(gameState.civilizations)) {
    const slayerMsg = isApex
      ? `Your forces have slain the ${def.name}! The apex hoard is yours — gold, lore, trophy, and legend.`
      : isChoiceTier
        ? `Your forces have slain the ${def.name}! Choose your reward.`
        : `Your forces have slain the ${def.name}! Hoard claimed: +${goldAwarded} gold.`;
    const message = civId === slayerCivId ? slayerMsg : `${slayerName} has slain the ${def.name}!`;
    appendToCivLog(civId, message, civId === slayerCivId ? 'success' : 'info');
  }
  if (slayerCivId === gameState.currentPlayer) {
    if (def.tier >= 3) {
      let rewardLines: string[];
      if (isApex) {
        const trophyGold = getBeastTrophyGoldPerTurn(def.tier);
        rewardLines = [
          `+${goldAwarded} gold`,
          'Ancient Lore claimed (+research)',
          `Beast Trophy raised (+${trophyGold} gold/turn)`,
          'Your hero is now Legendary',
        ];
      } else {
        const preview = getHoardChoicePreview(gameState, lairId);
        rewardLines = [
          'Choose one reward:',
          `Gold: +${preview.gold}`,
          `Lore: +${preview.lore} research`,
          `Trophy: +${preview.trophyGoldPerTurn} gold/turn`,
        ];
      }
      showBeastSlayCeremony(uiLayer, {
        beastName: def.name,
        unitType: def.unitType,
        slayerName,
        rewardLines,
        onContinue: () => { if (!isApex) maybeShowPendingHoardChoice(); },
      });
    }
    // #551: the tier<3 case's toast used to be a separate showNotification
    // call here, duplicating the delivery-contract message the appendToCivLog
    // loop above already sent to slayerCivId. Removed; the loop's message
    // ("Hoard claimed: +N gold" / "Choose your reward.") is the single
    // delivery for this event now.
  }
});

bus.on('beast:hoard-claimed', ({ beastId, civId, choice }) => {
  const def = BEAST_DEFINITIONS[beastId];
  let message: string;
  if (choice === 'gold') message = `You took the Gold Hoard of the ${def.name}.`;
  else if (choice === 'lore') message = `You claimed the Ancient Lore of the ${def.name}.`;
  else message = `You raised a ${def.name} Trophy.`;
  appendToCivLog(civId, message, 'success');
});

bus.on('beast:sighted', ({ beastId, civId }) => {
  const def = BEAST_DEFINITIONS[beastId];
  const lair = gameState.beasts ? Object.values(gameState.beasts.lairs).find(l => l.beastId === beastId) : undefined;
  const target = lair ? { kind: 'map' as const, coord: lair.position, label: def.name } : undefined;
  appendToCivLog(civId, def.sightingFlavor, 'info', target);
  if (civId === gameState.currentPlayer) {
    showBeastSightingBanner(uiLayer, {
      name: def.name,
      flavor: def.sightingFlavor,
      unitType: def.unitType,
      onContinue: () => {},
      onOpenBestiary: () => openBestiary(),
    });
  }
});

registerMinorCivNotificationListeners(bus, () => gameState, { appendToCivLog });

bus.on('ai:strategic-warning', event => {
  // #551: appendToCivLog (the delivery contract) already queues to
  // pendingEvents for a non-active hot-seat recipient -- the old
  // queueStrategicWarningPendingEvent call was a second, always-on queue.
  routeStrategicWarning(event, appendToCivLog);
});

function appendFactionNotice(civId: string, message: string, type: NotificationEntry['type']): void {
  // #551: appendToCivLog (the delivery contract) already queues to
  // pendingEvents for a non-active hot-seat recipient -- the old manual
  // collectEvent call here was a second, always-on queue that duplicated the
  // entry in that player's next turn-handoff summary.
  appendToCivLog(civId, message, type);
}

bus.on('era:advanced', ({ era }) => {
  const humanCivIds = Object.entries(gameState.civilizations)
    .filter(([, civ]) => civ.isHuman)
    .map(([civId]) => civId);
  routeEraAdvanced(era, humanCivIds, appendToCivLog);
});

bus.on('civilization:era-advanced', ({ civId, era }) => {
  const civ = gameState.civilizations[civId];
  if (!civ?.isHuman) return;
  appendToCivLog(civId, `${civ.name} has entered Era ${era}. Your technology now sets your civilization's era.`, 'success');
  if (civId === gameState.currentPlayer) SFX.notification();
});

bus.on('faction:unrest-started', event => {
  routeFactionTransition(gameState, { type: 'faction:unrest-started', ...event }, appendFactionNotice);
});

bus.on('faction:revolt-started', event => {
  routeFactionTransition(gameState, { type: 'faction:revolt-started', ...event }, appendFactionNotice);
});

bus.on('faction:unrest-resolved', event => {
  routeFactionTransition(gameState, { type: 'faction:unrest-resolved', ...event }, appendFactionNotice);
});

bus.on('faction:concession-made', event => {
  routeFactionTransition(gameState, { type: 'faction:concession-made', ...event }, appendFactionNotice);
});

bus.on('faction:breakaway-started', event => {
  routeFactionTransition(gameState, { type: 'faction:breakaway-started', ...event }, appendFactionNotice);
});

bus.on('faction:breakaway-established', event => {
  routeFactionTransition(gameState, { type: 'faction:breakaway-established', ...event }, appendFactionNotice);
});

bus.on('faction:critical-status', event => {
  routeFactionTransition(gameState, { type: 'faction:critical-status', ...event }, appendFactionNotice);
});

bus.on('crisis:started', event => {
  routeCrisisStarted(gameState, event, appendToCivLog);
  routeWorldPressureCrisisStarted(gameState, event, appendToCivLog);
});

bus.on('religion:founded', event => {
  routeReligionFounded(gameState, event, appendToCivLog);
});

bus.on('religion:city-converted', event => {
  routeReligionCityConverted(gameState, event, appendToCivLog);
});

bus.on('religion:loyalty-warning', event => {
  routeLoyaltyWarning(gameState, event, appendToCivLog);
});

bus.on('religion:city-defected', event => {
  routeCityDefected(gameState, event, appendToCivLog);
});

bus.on('crisis:spread', event => {
  routeCrisisSpread(gameState, event, appendToCivLog);
});

bus.on('crisis:escalated', event => {
  routeCrisisEscalated(gameState, event, appendToCivLog);
});

bus.on('crisis:resolved', event => {
  routeCrisisResolved(gameState, event, appendToCivLog);
  routeWorldPressureCrisisResolved(gameState, event, appendToCivLog);
});

bus.on('crisis:foe-hunted-by-ally', event => {
  routeCrisisFoeHuntedByAlly(gameState, event, appendToCivLog);
});

bus.on('crisis:aid-sent', event => {
  routeCrisisAidSent(gameState, event, appendToCivLog);
});

bus.on('diplomacy:opportunistic-war', event => {
  routeOpportunisticWar(gameState, event, appendToCivLog);
});

bus.on('espionage:sabotage-relief-discovered', event => {
  routeSabotageReliefDiscovered(gameState, event, appendToCivLog);
});

bus.on('economy:treasury-strain', event => {
  // #551: routeEconomyTreasuryStrain already delivers to event.civId via the
  // delivery contract; the old extra showNotification duplicated the message
  // and leaked it to whoever currentPlayer was at emit time.
  routeEconomyTreasuryStrain(gameState, event, appendToCivLog);
});

bus.on('espionage:spy-detected-traveling', ({ detectingCivId, spyOwner, wasDisguised, position }) => {
  const label = wasDisguised ? 'A disguised unit' : 'An enemy spy';
  appendToCivLog(
    detectingCivId,
    `${label} from ${spyOwner} was spotted near (${position.q}, ${position.r}).`,
    'warning',
  );
});

bus.on('espionage:spy-caught-infiltrating', ({ capturingCivId, spyOwner, spyId, cityId }) => {
  const spy = gameState.espionage?.[spyOwner]?.spies[spyId];
  const city = gameState.cities[cityId];
  const captor = gameState.civilizations[capturingCivId]?.name ?? capturingCivId;
  appendToCivLog(
    spyOwner,
    `${spy?.name ?? 'Your spy'} was caught by ${captor} trying to infiltrate ${city?.name ?? 'an enemy city'}!`,
    'warning',
  );
  // Captor side: show verdict choice only when the human captor is currently active
  if (capturingCivId === gameState.currentPlayer) {
    showEspionageCaptureChoice(spyId, spyOwner);
  }
});

// Show verdict choice when human player captures a spy during a mission
bus.on('espionage:spy-captured', ({ capturingCivId, spyOwner, spyId }) => {
  if (capturingCivId === gameState.currentPlayer) {
    showEspionageCaptureChoice(spyId, spyOwner);
  }
  // Spy owner always gets a log entry, regardless of who is "current"
  const spy = gameState.espionage?.[spyOwner]?.spies[spyId];
  const captorName = gameState.civilizations[capturingCivId]?.name ?? capturingCivId;
  appendToCivLog(spyOwner, `${spy?.name ?? 'Your spy'} was captured by ${captorName}!`, 'warning');
});

// Notify the spy's owner when they are executed by an AI or human captor
bus.on('espionage:spy-executed', ({ executingCivId, spyOwner, spyName }) => {
  appendToCivLog(
    spyOwner,
    `${spyName} was executed by ${gameState.civilizations[executingCivId]?.name ?? 'an enemy'}.`,
    'warning',
  );
});

bus.on('unit:obsolete', ({ civId, unitType }) => {
  const name = UNIT_DEFINITIONS[unitType]?.name ?? unitType;
  appendToCivLog(civId, `Your ${name} is now obsolete — upgrade it in your home city.`, 'info');
});

bus.on('unit:journey-blocked', ({ unitId, position }) => {
  // #551: recipient is the unit's actual owner, not whoever currentPlayer
  // happens to be at emit time -- the old showNotification call leaked this
  // to the wrong hot-seat player. Skip entirely if the unit is gone rather
  // than falling back to currentPlayer.
  const unit = gameState.units[unitId];
  if (!unit) return;
  const type = UNIT_DEFINITIONS[unit.type]?.name ?? unit.type;
  const msg = `Your ${type} was blocked and stopped at (${position.q}, ${position.r}).`;
  appendToCivLog(unit.owner, msg, 'warning');
});

bus.on('espionage:spy-expired', ({ civId, spyName, unitType }) => {
  appendToCivLog(civId, `${spyName}'s network dissolved — ${unitType} era ended. No diplomatic penalty.`, 'info');
});

bus.on('espionage:spy-auto-exfiltrated', ({ civId, cityId }) => {
  const city = gameState.cities[cityId];
  appendToCivLog(civId, `Your spy was auto-exfiltrated from ${city?.name ?? 'a city'} after it changed hands.`, 'info');
});

bus.on('espionage:city-flipped', event => {
  routeCityFlipped(gameState, event, appendToCivLog);
});

bus.on('trade:route-created', ({ route }) => {
  const ownerCity = gameState.cities[route.fromCityId];
  const toCity = gameState.cities[route.toCityId];
  if (!ownerCity) return;
  const goldPerTurn = getEffectiveGoldPerTurn(route, getRouteTechGoldBonus(gameState, route));
  appendToCivLog(ownerCity.owner, `Trade route to ${toCity?.name ?? route.toCityId} established (+${goldPerTurn} gold/turn)`, 'success');
});

bus.on('trade:route-ended', ({ fromCityId, toCityId, reason }) => {
  const ownerCity = gameState.cities[fromCityId];
  const toCity = gameState.cities[toCityId];
  if (!ownerCity) return;
  const reasonText: Record<string, string> = {
    'unit-died': 'caravan destroyed',
    'unit-disbanded': 'caravan disbanded',
    'war-declared': 'war declared — caravan is free to redeploy',
    'hostile-relations': 'hostile relations — caravan is free to redeploy',
    'embargo': 'embargo enforced — caravan is free to redeploy',
    'trips-exhausted': 'caravan retired after completing its service',
    'unit-captured': 'caravan captured',
  };
  appendToCivLog(ownerCity.owner, `Trade route to ${toCity?.name ?? toCityId} ended: ${reasonText[reason] ?? reason}`, 'warning');
  // Also tell the other end of the route, if it's a different human civ (#551).
  if (toCity && toCity.owner !== ownerCity.owner && gameState.civilizations[toCity.owner]?.isHuman) {
    appendToCivLog(toCity.owner, `Trade route from ${ownerCity.name} ended: ${reasonText[reason] ?? reason}`, 'warning');
  }
});

// --- Initialization ---
async function init(): Promise<void> {
  await registerConquestoriaServiceWorker();
  await initializeDesktopMenu();

  createUI();
  persistedSettings = await loadSettings();

  await showStartSavePanel();
}

function enterCampaign(
  state: GameState,
  message: string,
  persistBeforeReady: boolean = false,
): void {
  document.getElementById('save-panel')?.remove();
  gameState = state;
  migrateLegacySave();
  if (gameState.gameOver) {
    startGame();
    handleVictoryIfNeeded();
    return;
  }
  if (!gameState.hotSeat) {
    startGame();
    showNotification(message, 'info');
    return;
  }

  audio.setMasterVolume(0);
  closeNetworkPanelsForHandoff();
  const player = gameState.hotSeat.players.find(candidate => candidate.slotId === gameState.currentPlayer);
  setBlockingOverlay('turn-handoff');
  roundPresentationGate.suppress();
  const controller = showTurnHandoff(
    uiLayer,
    gameState,
    gameState.currentPlayer,
    player?.name ?? 'Player',
    {
      initiallyReady: !persistBeforeReady,
      preparingLabel: 'Saving campaign…',
      onReady: async summary => {
        const viewerId = gameState.currentPlayer;
        const acknowledgement = acknowledgeTurnHandoffSummary(
          gameState,
          viewerId,
          summary,
        );
        gameState = acknowledgement.state;
        try {
          await autoSave(gameState);
        } catch {
          // Entry persistence already succeeded; acknowledgement may safely retry later.
        }
        roundPresentationGate.resume();
        setBlockingOverlay(null);
        startGame();
        audio.setMasterVolume(currentMasterVolume);
        if (acknowledgement.playStrategicWarningAudio) {
          bus.emit('ai:strategic-warning-audio', {
            viewerId,
            turn: summary.turn,
          });
        }
        showNotification(message, 'info');
      },
    },
  );

  if (!persistBeforeReady) return;
  const persist = async (): Promise<void> => {
    try {
      await autoSave(gameState);
      controller.setReady(gameState);
    } catch {
      controller.setError(
        'The campaign could not be saved. Retry before opening the first turn.',
        {
          onRetry: () => void persist(),
          onReturnToSaves: () => {
            roundPresentationGate.resume();
            window.location.reload();
          },
        },
      );
    }
  };
  void persist();
}

async function showStartSavePanel(): Promise<void> {
  await createSavePanel(uiLayer, {
    onNewGame: () => {
      showGameModeSelection();
    },
    onContinue: async invoker => {
      const loaded = await loadMostRecentAutoSaveEntry();
      if (!loaded) throw new Error('Autosave no longer exists.');
      await beginCampaignEntry(
        { kind: 'stored', loaded },
        invoker,
        {
          persistStoredChoice: rewriteLoadedSaveEntry,
          persistImport: autoSave,
          showChallengePrompt: showLegacyOpponentChallengePrompt,
          onReady: state => enterCampaign(state, `Welcome back! Turn ${state.turn}`),
        },
      );
    },
    onLoadEntry: async (source, invoker) => {
      const loaded = await loadSaveEntry(source);
      if (!loaded) throw new Error('Save no longer exists.');
      await beginCampaignEntry(
        { kind: 'stored', loaded },
        invoker,
        {
          persistStoredChoice: rewriteLoadedSaveEntry,
          persistImport: autoSave,
          showChallengePrompt: showLegacyOpponentChallengePrompt,
          onReady: state => enterCampaign(state, `Game loaded! Turn ${state.turn}`),
        },
      );
    },
    onImportSave: async (state, invoker) => {
      await beginCampaignEntry(
        { kind: 'import', state },
        invoker,
        {
          persistStoredChoice: rewriteLoadedSaveEntry,
          persistImport: autoSave,
          showChallengePrompt: showLegacyOpponentChallengePrompt,
          onReady: readyState => enterCampaign(
            readyState,
            `Save imported! Turn ${readyState.turn}`,
          ),
        },
      );
    },
  });
}

function migrateLegacySave(): void {
  for (const [civId, civ] of Object.entries(gameState.civilizations)) {
    if (!civ.civType) (civ as any).civType = 'generic';
    if (!civ.knownCivilizations) (civ as any).knownCivilizations = [];
    if (!civ.lastCombatTurnByLandmass) (civ as any).lastCombatTurnByLandmass = {};
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
  clearStaleSoloPendingEvents(gameState);
  // Add wonder/village state if missing
  if (!gameState.tribalVillages) (gameState as any).tribalVillages = {};
  if (!gameState.discoveredWonders) (gameState as any).discoveredWonders = {};
  if (!gameState.wonderDiscoverers) (gameState as any).wonderDiscoverers = {};
  if (!gameState.legendaryWonderHistory) {
    (gameState as any).legendaryWonderHistory = { destroyedStrongholds: [], discoveredSites: [] };
  }
  const legendaryWonderHistory = gameState.legendaryWonderHistory!;
  legendaryWonderHistory.networkPlanResolutions ??= [];
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
  // Reconstruct missing lastSeen entries for fog tiles on old saves (M5 migration)
  for (const civId of Object.keys(gameState.civilizations)) {
    reconstructLastSeenFromMap(gameState, civId);
  }
  // S5 migration: marketplace state init
  if (!gameState.marketplace) {
    gameState.marketplace = createMarketplaceState();
  }
  // S5 migration: TradeRoute shape — assign id, goldPerTrip, turnsPerTrip
  let legacyRouteN = 1;
  for (const route of gameState.marketplace.tradeRoutes) {
    const r = route as any;
    if (!r.id) {
      r.id = `route-legacy-${legacyRouteN++}`;
    }
    if (!r.goldPerTrip) {
      r.goldPerTrip = (r.goldPerTurn ?? 2) * (r.turnsPerTrip ?? 3);
    }
    if (!r.turnsPerTrip) {
      r.turnsPerTrip = 3;
    }
    delete r.goldPerTurn;
  }

  // Beasts migration: flag legacy saves so processTurn places lairs on the FIRST tick after load.
  // This defers the 🐾 markers and discovery notification until the player takes an action,
  // giving them a moment to orient before the map changes.
  if (!gameState.beasts) {
    (gameState as any).beasts = { mode: 'wild', lairs: {}, sightingsByCiv: {}, migrationPending: true };
  }
  if (!gameState.resurgentCampCooldownByCivLandmass) {
    (gameState as any).resurgentCampCooldownByCivLandmass = {};
  }
}

function showGameModeSelection(): void {
  let modePanel: HTMLElement;
  const updatePersistedCustomCivilizations = (customCivilizations: GameState['settings']['customCivilizations'] = []): void => {
    persistedSettings = {
      ...mergePersistedSettings(persistedSettings),
      customCivilizations: [...customCivilizations],
    };
  };

  modePanel = showGameModeSelect(uiLayer, {
    initialTitle: 'New Campaign',
    onCancel: () => {},
    onTitleRequired: () => {
      showNotification('Campaign title is required', 'warning');
    },
    onChooseSolo: async (title) => {
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
            // Merge: persisted A/V settings first, then per-game setup choices (e.g. beastsMode) win
            settingsOverrides: { ...getPersistedSettingsOverrides(), ...config.settingsOverrides },
            customCivilizations: config.customCivilizations,
            seed: config.seed,
            mapScript: config.mapScript,
            startPlacementMode: config.startPlacementMode,
            opponentChallenge: config.opponentChallenge,
          });
          if (persistedSettings?.councilTalkLevel) {
            gameState.settings.councilTalkLevel = persistedSettings.councilTalkLevel;
          }
          startGame();
        },
        onCustomCivilizationsChanged: (customCivilizations) => {
          updatePersistedCustomCivilizations(customCivilizations);
        },
        onCancel: () => showGameModeSelection(),
      }, {
        initialCustomCivilizations: savedCustomCivilizations,
      });
    },
    onChooseHotSeat: async (title) => {
      const currentSettings = await refreshPersistedSettings();
      const savedCustomCivilizations = currentSettings.customCivilizations ?? [];
      modePanel.remove();
      showHotSeatSetup(uiLayer, {
        onComplete: (config, opponentChallenge) => {
          gameState = createHotSeatGame(config, undefined, title, opponentChallenge ?? 'standard');
          if (persistedSettings?.councilTalkLevel) {
            gameState.settings.councilTalkLevel = persistedSettings.councilTalkLevel;
          }
          enterCampaign(
            gameState,
            `Hot seat game started! ${config.players.filter(p => p.isHuman).length} players`,
            true,
          );
        },
        onCustomCivilizationsChanged: (customCivilizations) => {
          updatePersistedCustomCivilizations(customCivilizations);
        },
        onCancel: () => {
          showGameModeSelection();
        },
      }, {
        initialCustomCivilizations: savedCustomCivilizations,
      });
    },
  });
}

function startGame(): void {
  // Initialize treasury drawer once
  if (!drawer) {
    drawer = createTreasuryDrawer();
    (document.getElementById('game-shell') ?? document.body).appendChild(drawer.element);
  }

  // Warm sprite cache non-blocking — renderers fall back to emoji while loading
  const civColors: Record<string, string> = {};
  for (const [civId, civ] of Object.entries(gameState.civilizations)) {
    civColors[civId] = civ.color;
  }
  initSprites(civColors);
  preloadOutpostMarker().catch(() => {});
  preloadFamineBadgeMarker().catch(() => {});
  preloadReligionBadgeMarker().catch(() => {});
  preloadRailSegment().catch(() => {});
  preloadTerrainTiles().catch(() => {});
  preloadNaturalWonderTiles().catch(() => {});

  // Center camera on current player's starting position
  centerOnCurrentPlayer();

  renderLoop.setGameState(gameState);
  updateHUD();
  maybeShowCouncilInterrupt();
  maybeShowPendingHoardChoice();

  // Auto-save immediately so closing before turn 1 doesn't lose the game
  autoSave(gameState).catch(() => {});

  // Input (only set up once)
  if (!inputInitialized) {
    canvas.addEventListener('pointerdown', () => { if (drawer?.isOpen()) drawer.close(); });

    const callbacks: InputCallbacks = {
      onHexTap: handleHexTap,
      onHexLongPress: handleHexLongPress,
    };
    const touchHandler = new TouchHandler(canvas, renderLoop.camera, callbacks);
    renderLoop.setTouchHandler(touchHandler);
    new MouseHandler(canvas, renderLoop.camera, callbacks, {
      canInteract: () => !uiInteractions.isInteractionBlocked(),
    });
    installKeyboardShortcuts(document, {
      onOpenCouncil: () => togglePanel('council'),
      onOpenTech: () => togglePanel('tech'),
      onEndTurn: () => { void endTurn(); },
      getSelectedUnitId: () => selectedUnitId,
      onCenterUnit: () => {
        if (!selectedUnitId) return;
        const unit = gameState.units[selectedUnitId];
        if (unit) renderLoop.camera.centerOn(unit.position);
      },
      onFortify: () => {
        if (!selectedUnitId) return;
        const unit = gameState.units[selectedUnitId];
        if (!unit || unit.hasActed || unit.owner !== gameState.currentPlayer) return;
        if (unit.isFortified) {
          gameState = unfortifyUnitInState(gameState, gameState.currentPlayer, selectedUnitId);
          showNotification('Unit unfortified.', 'info');
        } else {
          gameState = fortifyUnitInState(gameState, gameState.currentPlayer, selectedUnitId);
          showNotification('Unit fortified. +25% defense until unfortified or moved.', 'info');
        }
        renderLoop.setGameState(gameState);
        updateHUD();
        selectUnit(selectedUnitId);
      },
      onSettle: () => {
        if (!selectedUnitId) return;
        const unit = gameState.units[selectedUnitId];
        if (!unit || unit.type !== 'settler') return;
        foundCityAction();
      },
      onNextUnit: () => selectNextUnit(),
      onStartJourney: () => {
        if (!selectedUnitId) return;
        pendingJourneyUnitId = selectedUnitId;
        showNotification('Tap a destination for this unit. Press Escape to cancel.', 'info');
      },
    }, {
      canHandle: () => !uiInteractions.isInteractionBlocked(),
    });
    inputInitialized = true;
  }

  audio.start(
    gameState,
    bus,
    () => gameState,
    () => roundPresentationGate.isSuppressed(),
  );
  audio.setMasterVolume(currentMasterVolume);
  routeSfxThrough(audio.getSfxRoutingNode());
  emitCurrentPlayerAudioSnapshot(gameState.currentPlayer);

  // Prevent zoom-out duplication: ensure the camera cannot zoom past one full
  // map-width. hexToPixel({q: width, r:0}).x equals the wrapSpan used in
  // wrap-rendering.ts, so minZoom = camera.width / wrapSpan guarantees the
  // visible world is never wider than one map copy.
  const mapWidthPx = hexToPixel({ q: gameState.map.width, r: 0 }, renderLoop.camera.hexSize).x;
  renderLoop.camera.setMinZoomForMap(mapWidthPx);

  // Initial advisor check
  advisorSystem.check(gameState);

  // Start render loop
  renderLoop.start();
}

init();
