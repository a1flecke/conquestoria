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
import {
  getVisibleCityBadgeSlots,
  getVisibleHexViewportCopies,
} from '@/renderer/city-renderer';
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
import { BUILDINGS, getProductionDisplayName, TRAINABLE_UNITS } from '@/systems/city-system';
import { civHasAirDefenseCoverage } from '@/systems/air-defense-system';
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
  evaluateUnitUpgrade,
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
import { applyPersistedUserSettings } from '@/storage/settings-merge';
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
import type { GameSession } from '@/app/ports';
import { createGameSession } from '@/app/game-session';

// --- App State ---
/**
 * The single owner of game state (#787 phase 2).
 *
 * Constructed unset: `enterCampaign` commits the first real state, exactly
 * where `let gameState: GameState` used to receive its first assignment. The
 * cast reproduces that binding's pre-assignment `undefined` so the existing
 * `if (session.getState())` guards keep their current meaning.
 */
const session: GameSession = createGameSession(undefined as unknown as GameState);
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
  return resolveCivDefinition(session.getState(), currentCiv().civType ?? '');
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
const airDefenseOverlayButton = createGameButton('🛡 Anti-aircraft coverage', 'secondary');
airDefenseOverlayButton.id = 'btn-air-defense-overlay';
airDefenseOverlayButton.hidden = true; // shown once the current civ has built AA coverage — see updateHUD()
airDefenseOverlayButton.setAttribute('aria-pressed', 'false');
airDefenseOverlayButton.addEventListener('click', () => {
  const enabled = renderLoop.toggleAirDefenseOverlay();
  airDefenseOverlayButton.setAttribute('aria-pressed', String(enabled));
  airDefenseOverlayButton.textContent = enabled ? '🛡 Anti-aircraft coverage: on' : '🛡 Anti-aircraft coverage';
});
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
    const city = session.getState().cities[cityId];
    if (city) openCityPanelForCity(city);
  },
  openJournal: cityId => {
    if (session.getState().cities[cityId]) openWonderPanelForCityId(cityId);
  },
  setBlockingOverlay,
});

// --- Resize ---
window.addEventListener('resize', () => renderLoop.resizeCanvas());

function setMapViewportBottomInset(height: number): void {
  canvas.style.bottom = `${height}px`;
  // With both top and bottom set, an auto height makes the canvas occupy only
  // the remaining map viewport instead of living behind the action bar.
  canvas.style.height = 'auto';
  renderLoop.resizeCanvas();
}

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
  if (pacingDebugOpen && session.getState()) {
    createPacingDebugPanel(uiLayer, session.getState());
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
        session.getState().civilizations[session.getState().currentPlayer]?.techState.completed ?? []
      );
      const overlay = createIconLegendOverlay(viewerTechs);
      uiLayer.appendChild(overlay);
    },
    onOpenWonderAtlas: () => openWonderAtlas(),
    onBottomBarHeightChange: setMapViewportBottomInset,
    onOpenMenu: () => {
      showPauseMenu(uiLayer, {
        turn: session.getState().turn,
        civName: session.getState().civilizations[session.getState().currentPlayer].name,
        onResume: () => {},
        onSave: async (slotId, name) => {
          await saveGame(slotId, name, session.getState());
          showNotification('Game saved.', 'info');
        },
        onNewGame: () => showGameModeSelection(),
        autoSave: () => autoSave(session.getState()),
        onOpenBestiary: () => openBestiary(),
        opponentChallenge: resolveOpponentChallenge(session.getState()),
        pendingOpponentChallenge: session.getState().pendingOpponentChallenge,
        onOpponentChallengeChange: (challenge) => {
          session.setStateWithoutRefresh(setPendingOpponentChallenge(session.getState(), challenge));
        },
        personalChallenge: resolveChallengeForCiv(session.getState(), session.getState().currentPlayer),
        pendingPersonalChallenge: session.getState().civilizations[session.getState().currentPlayer]?.pendingChallenge,
        onPersonalChallengeChange: (challenge) => {
          session.setStateWithoutRefresh(setPendingChallengeForCiv(session.getState(), session.getState().currentPlayer, challenge));
        },
        // Spec 3: per-channel audio settings
        audioSettings: {
          masterVolume:   currentMasterVolume,   // tracked in memory across menu reopens
          musicVolume:    session.getState().settings.musicVolume,
          sfxVolume:      session.getState().settings.sfxVolume,
          stingerVolume:  session.getState().settings.stingerVolume  ?? 1.0,
          musicEnabled:   session.getState().settings.musicEnabled,
          soundEnabled:   session.getState().settings.soundEnabled,
          stingerEnabled: session.getState().settings.stingerEnabled ?? true,
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
            case 'stingerVolume':  audio.setStingerVolume(value as number); break;
            case 'musicEnabled':   audio.setMusicEnabled(value as boolean); break;
            case 'soundEnabled':   audio.setSfxEnabled(value as boolean);   break;
            case 'stingerEnabled': audio.setStingerEnabled(value as boolean); break;
          }
          // Persist all non-master settings to GameSettings (saved on next save)
          (session.getState().settings as unknown as Record<string, number | boolean>)[key] = value;
        },
      });
    },
  });

  // Join the utility toolbar's flex row instead of an independent absolute position —
  // a second, uncoordinated top-right anchor overlapped the HUD and the toolbar's own
  // icon buttons (#783).
  const utilityToolbar = document.getElementById('utility-toolbar');
  const pauseMenuButton = document.getElementById('btn-pause-menu');
  if (utilityToolbar) {
    if (pauseMenuButton) utilityToolbar.insertBefore(airDefenseOverlayButton, pauseMenuButton);
    else utilityToolbar.appendChild(airDefenseOverlayButton);
  }
}

function openBestiary(): void {
  createBestiaryPanel(uiLayer, getBestiaryEntriesForPlayer(session.getState(), session.getState().currentPlayer), {
    onClose: () => {},
    slayerNameFor: (civId) => session.getState().civilizations[civId]?.name ?? civId,
  });
}

function scanBeastSightings(): void {
  const visTiles = currentCiv()?.visibility?.tiles;
  if (!visTiles) return;
  const viewerUnits = Object.values(session.getState().units).filter(
    u => u.owner === session.getState().currentPlayer && !u.transportId,
  );
  const visibleKeys = new Set(
    Object.entries(visTiles).filter(([, v]) => v === 'visible').map(([k]) => k),
  );
  // A beast concealed in its habitat cannot be sighted even if the tile is visible
  for (const unit of Object.values(session.getState().units)) {
    if (isBeastConcealedFrom(unit, session.getState().map, viewerUnits)) {
      visibleKeys.delete(hexKey(unit.position));
    }
  }
  const sightingResult = recordBeastSightings(session.getState(), session.getState().currentPlayer, visibleKeys);
  session.setStateWithoutRefresh(sightingResult.state);
  for (const beastId of sightingResult.newSightings) {
    bus.emit('beast:sighted', { beastId, civId: session.getState().currentPlayer });
  }
}

function maybeShowPendingHoardChoice(): void {
  const pending = (session.getState().beasts?.pendingHoardChoices ?? [])
    .find(p => p.civId === session.getState().currentPlayer);
  if (!pending) return;
  const preview = getHoardChoicePreview(session.getState(), pending.lairId);
  const lair = session.getState().beasts!.lairs[pending.lairId];
  createBeastHoardPanel(uiLayer, preview, choice => {
    session.setStateWithoutRefresh(applyHoardChoice(session.getState(), pending.lairId, pending.civId, choice));
    bus.emit('beast:hoard-claimed', { lairId: pending.lairId, beastId: lair.beastId, civId: pending.civId, choice });
    updateHUD();
    maybeShowPendingHoardChoice();
  });
}

function openWonderAtlas(initialWonderId?: string): void {
  drawer?.close();
  audio.stopNaturalWonderAmbient('codex-page-hidden');
  createWonderAtlasPanel(uiLayer, session.getState(), {
    initialWonderId,
    onViewOnMap: coord => {
      renderLoop.camera.centerOn(coord);
    },
    onOpenCity: cityId => {
      const city = session.getState().cities[cityId];
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
  return session.getState().civilizations[session.getState().currentPlayer];
}

function updateHUD(): void {
  const civ = currentCiv();
  airDefenseOverlayButton.hidden = !civHasAirDefenseCoverage(session.getState(), civ.id);
  const airDefenseEnabled = renderLoop.isAirDefenseOverlayEnabled(session.getState().currentPlayer);
  airDefenseOverlayButton.setAttribute('aria-pressed', String(airDefenseEnabled));
  airDefenseOverlayButton.textContent = airDefenseEnabled ? '🛡 Anti-aircraft coverage: on' : '🛡 Anti-aircraft coverage';
  const hud = document.getElementById('hud');
  if (!hud) return;

  // Sum yields across all cities
  let totalFood = 0, totalProd = 0, totalScience = 0;
  for (const cityId of civ.cities) {
    const city = session.getState().cities[cityId];
    if (!city) continue;
    const y = calculateProjectedCityYields(session.getState(), cityId);
    totalFood += y.food;
    totalProd += y.production;
    totalScience += y.science;
  }
  const economyStatus = calculateCivEconomy(session.getState(), civ.id);

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

  if (isAutonomyActivated(session.getState(), civ.id)) {
    const networkButton = document.createElement('button');
    networkButton.type = 'button';
    networkButton.style.cssText = 'background:transparent;color:inherit;border:1px solid rgba(232,193,112,0.45);border-radius:6px;font:inherit;padding:4px 8px;min-height:44px;';
    networkButton.textContent = getNetworkPanelModel(session.getState(), civ.id).statusText;
    networkButton.addEventListener('click', () => openNetworkPanel());
    yieldsRow.appendChild(networkButton);
  }

  const happiness = getCivHappinessFromResources(session.getState(), civ.id);
  if (happiness > 0) {
    const happySpan = document.createElement('span');
    happySpan.title = 'Happiness from luxury resources — each point reduces city unrest pressure by 2';
    happySpan.textContent = `☺ ${happiness} (stability)`;
    yieldsRow.appendChild(happySpan);
  }

  const infoRow = document.createElement('div');
  if (session.getState().hotSeat && civ.name) {
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${civ.name} · `;
    infoRow.appendChild(nameSpan);
  }
  const turnSpan = document.createElement('span');
  turnSpan.textContent = `Turn ${session.getState().turn} · Your Era ${resolveCivilizationEra(civ.techState.completed)} · World Age ${session.getState().era}`;
  infoRow.appendChild(turnSpan);

  hud.appendChild(yieldsRow);
  hud.appendChild(infoRow);

  const pirateWatersButton = document.getElementById('btn-pirate-waters');
  if (pirateWatersButton) {
    pirateWatersButton.hidden = !getPirateWatersPresentation(session.getState(), session.getState().currentPlayer).available;
  }

  // Show "Next Unit" button when there are unmoved units
  const nextUnitBtn = document.getElementById('btn-next-unit');
  if (nextUnitBtn) {
    const unmovedCount = getUnmovedUnits(session.getState().units, session.getState().currentPlayer).length;
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
  if (session.getState()) {
    appendNotification(session.getState(), session.getState().currentPlayer, {
      message,
      type,
      turn: session.getState().turn,
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
  getState: () => session.getState(),
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
  session.setStateWithoutRefresh(result.state);
  for (const event of result.events) {
    if (event.type === 'tribute-paid') {
      bus.emit('pirate:audio-cue', { cue: 'tribute', factionId: event.factionId, viewerIds: [event.civId] });
    } else if (event.type === 'contract-accepted') {
      bus.emit('pirate:audio-cue', { cue: 'contract-accepted', factionId: event.factionId, viewerIds: [event.employerId] });
    }
  }
  renderLoop.setGameState(session.getState());
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
    const base = getPirateWatersPresentation(session.getState(), session.getState().currentPlayer);
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
        const result = payPirateTribute(session.getState(), faction, session.getState().currentPlayer);
        applyPirateActionResult(result, 'Pirate tribute paid.');
        renderPanel();
        return result;
      },
      onHireFlotilla: (faction, targetId) => {
        const result = hirePirateFlotilla(session.getState(), faction, session.getState().currentPlayer, targetId);
        applyPirateActionResult(result, 'Pirate flotilla hired.');
        renderPanel();
        return result;
      },
      onOpenAssault: faction => {
        if (selectedUnitId) {
          const pending = preparePirateHeadquartersAssault(session.getState(), faction, selectedUnitId);
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
  const pending = preparePirateHeadquartersAssault(session.getState(), factionId, unitId);
  if (!pending.preview.available) {
    showNotification(pending.preview.reason ?? 'This enclave cannot be assaulted now.', 'warning');
    return;
  }
  const panel = createPirateHeadquartersAssaultPanel(uiLayer, pending, {
    onCancel: () => panel.remove(),
    onConfirm: () => {
      const result = confirmPirateHeadquartersAssault(session.getState(), pending);
      if (!result.success) {
        panel.remove();
        showNotification(result.reason ?? 'The assault is no longer available.', 'warning');
        if (session.getState().units[unitId]) selectUnit(unitId);
        return;
      }
      renderLoop.applyPirateHeadquartersAssaultVisual(factionId, unitId, {
        destroyed: Boolean(result.destroyed),
        attackerSurvived: Boolean(result.state.units[unitId]),
      });
      if (result.destroyed) {
        bus.emit('pirate:headquarters-destroyed', {
          factionId,
          viewerIds: [session.getState().currentPlayer],
        });
      }
      session.setStateWithoutRefresh(result.state);
      panel.remove();
      renderLoop.setGameState(session.getState());
      updateHUD();
      SFX.combat();
      const bountyAwarded = result.events.find(event => event.type === 'faction-destroyed')?.bountyAwarded ?? 0;
      showNotification(
        result.destroyed
          ? `Pirate enclave destroyed. Bounty awarded: ${bountyAwarded} gold.`
          : `Pirate enclave damaged for ${result.damageToHeadquarters ?? 0} integrity.`,
        result.destroyed ? 'success' : 'info',
      );
      if (session.getState().units[unitId]) selectUnit(unitId);
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

  const entries = session.getState()
    ? getNotificationsForPlayer(session.getState().notificationLog ?? {}, session.getState().currentPlayer)
    : [];
  const panel = createNotificationLogPanel(entries, {
    onClose: () => panel.remove(),
    onFocusTarget: focusNotificationTarget,
    onOpenCity: (cityId) => {
      panel.remove();
      const city = session.getState()?.cities[cityId];
      if (city) openCityPanelForCity(city);
    },
    onOpenWonderCity: action => {
      const city = session.getState()?.cities[action.cityId];
      const definition = getLegendaryWonderDefinition(action.wonderId);
      if (!city || !definition || city.owner !== session.getState().currentPlayer
        || !getLegendaryWonderEligibility(session.getState(), session.getState().currentPlayer, city.id, definition).buildable) {
        showNotification('That wonder is no longer available in this city.', 'warning');
        return;
      }
      panel.remove();
      openWonderPanelForCityId(city.id);
    },
    onMarkRead: notificationId => {
      session.setStateWithoutRefresh(markNotificationRead(session.getState(), session.getState().currentPlayer, notificationId));
    },
    onReviewPirate: review => {
      const resolved = resolvePirateNotificationReview(session.getState(), session.getState().currentPlayer, review);
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
  const cp = session.getState().currentPlayer;
  session.setStateWithoutRefresh(applyDiplomaticAction(session.getState(), cp, targetCivId, action, bus));
  if (action === 'declare_war') {
    session.setStateWithoutRefresh(applyOpportunisticWarPenaltyIfCrisisStruck(session.getState(), cp, targetCivId, bus));
  }
  renderLoop.setGameState(session.getState());
  updateHUD();
  openDiplomacyPanel();
  if (action === 'request_peace') {
    showNotification('Peace requested.', 'info');
  } else {
    showNotification(`Diplomatic action: ${action.replace(/_/g, ' ')}`, 'info');
  }
}

function handleAcceptPeaceRequest(requestId: string): void {
  session.setStateWithoutRefresh(acceptDiplomaticRequest(session.getState(), session.getState().currentPlayer, requestId, bus));
  renderLoop.setGameState(session.getState());
  updateHUD();
  openDiplomacyPanel();
  showNotification('Peace accepted.', 'success');
}

function handleRejectPeaceRequest(requestId: string): void {
  session.setStateWithoutRefresh(rejectDiplomaticRequest(session.getState(), session.getState().currentPlayer, requestId));
  renderLoop.setGameState(session.getState());
  updateHUD();
  openDiplomacyPanel();
  showNotification('Peace request rejected.', 'info');
}

function handleAcceptTreatyProposal(requestId: string): void {
  session.setStateWithoutRefresh(acceptDiplomaticRequest(session.getState(), session.getState().currentPlayer, requestId, bus));
  renderLoop.setGameState(session.getState());
  updateHUD();
  openDiplomacyPanel();
  showNotification('Treaty signed.', 'success');
}

function handleDeclineTreatyProposal(requestId: string): void {
  session.setStateWithoutRefresh(rejectDiplomaticRequest(session.getState(), session.getState().currentPlayer, requestId));
  renderLoop.setGameState(session.getState());
  updateHUD();
  openDiplomacyPanel();
  showNotification('Proposal declined.', 'info');
}

function handleBreakTreaty(civId: string, treatyType: TreatyType): void {
  const actorId = session.getState().currentPlayer;
  const actor = session.getState().civilizations[actorId];
  const target = session.getState().civilizations[civId];
  if (!actor || !target) return;
  session.setStateWithoutRefresh({
    ...session.getState(),
    civilizations: {
      ...session.getState().civilizations,
      [actorId]: { ...actor, diplomacy: breakTreaty(actor.diplomacy, civId, treatyType, session.getState().turn) },
      [civId]: { ...target, diplomacy: breakTreaty(target.diplomacy, actorId, treatyType, session.getState().turn) },
    },
  });
  renderLoop.setGameState(session.getState());
  updateHUD();
  openDiplomacyPanel();
  showNotification(`${TREATY_LABELS[treatyType]} broken with ${target.name}.`, 'warning');
}

function executeMinorCivConquest(unitId: string, target: HexCoord, minorCivId: string, cityId: string): void {
  const cityName = session.getState().cities[cityId]?.name ?? 'City-State';
  const movement = executeAnimatedUnitMove(unitId, () => executeUnitMove(session.getState(), unitId, target, {
    actor: 'player',
    civId: session.getState().currentPlayer,
    bus,
    foreignCityEntryId: cityId,
  }));
  if (!movement.ok) return;
  const movedUnit = session.getState().units[unitId];
  if (movedUnit) session.getState().units[unitId] = { ...movedUnit, movementPointsLeft: 0 };
  const conquered = conquestMinorCiv(session.getState(), minorCivId, session.getState().currentPlayer);
  session.setStateWithoutRefresh(conquered.state);
  emitMinorCivQuestTransitions(bus, conquered.transitions, session.getState());
  if (conquered.conquered) bus.emit('minor-civ:destroyed', { minorCivId, conquerorId: session.getState().currentPlayer });
  showNotification(`${cityName} has been conquered!`, 'success');
  SFX.tap();
  renderLoop.setGameState(session.getState());
  updateHUD();
}

function handleGiftGold(mcId: string): void {
  const result = performMinorCivGift(session.getState(), session.getState().currentPlayer, mcId);
  if (!result.ok) {
    showNotification(result.reason ?? 'Gift unavailable.', 'warning');
    return;
  }
  session.setStateWithoutRefresh(result.state);
  emitMinorCivQuestTransitions(bus, result.transitions, session.getState());
  showNotification('Gift delivered.', 'info');
  renderLoop.setGameState(session.getState());
  updateHUD();
  openDiplomacyPanel();
}

function handleSponsorFestival(mcId: string): void {
  const result = performMinorCivFestival(session.getState(), session.getState().currentPlayer, mcId);
  if (!result.ok) {
    showNotification(result.reason ?? 'Festival unavailable.', 'warning');
    return;
  }
  session.setStateWithoutRefresh(result.state);
  emitMinorCivQuestTransitions(bus, result.transitions, session.getState());
  showNotification('Festival sponsored.', 'success');
  renderLoop.setGameState(session.getState());
  updateHUD();
  openDiplomacyPanel();
}

function handleMinorCivReparations(mcId: string): void {
  const result = performMinorCivReparations(session.getState(), session.getState().currentPlayer, mcId);
  if (!result.ok) {
    showNotification(result.reason ?? 'Reparations unavailable.', 'warning');
    return;
  }
  session.setStateWithoutRefresh(result.state);
  showNotification('Reparations paid.', 'success');
  renderLoop.setGameState(session.getState());
  updateHUD();
  openDiplomacyPanel();
}

function handleSendAid(crisisId: string): void {
  const check = canSendAid(session.getState(), session.getState().currentPlayer, crisisId);
  if (!check.ok) {
    showNotification('Send Aid unavailable.', 'warning');
    return;
  }
  session.setStateWithoutRefresh(applySendAid(session.getState(), session.getState().currentPlayer, crisisId, bus));
  showNotification('Aid sent.', 'success');
  renderLoop.setGameState(session.getState());
  updateHUD();
  openDiplomacyPanel();
}

function handleMinorCivWarPeace(mcId: string, currentlyAtWar: boolean): void {
  const result = setMinorCivWarState(session.getState(), session.getState().currentPlayer, mcId, !currentlyAtWar);
  if (!result.ok) return;
  session.setStateWithoutRefresh(result.state);
  emitMinorCivQuestTransitions(bus, result.transitions, session.getState());
  showNotification(currentlyAtWar ? 'Peace with city-state' : 'War declared on city-state!', currentlyAtWar ? 'success' : 'warning');
  renderLoop.setGameState(session.getState());
  updateHUD();
  openDiplomacyPanel();
}

function openDiplomacyPanel(): void {
  drawer?.close();
  document.getElementById('diplomacy-panel')?.remove();
  createDiplomacyPanel(uiLayer, session.getState(), {
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
  createMarketplacePanel(uiLayer, session.getState(), {
    onClose: () => {},
    onSelectUnit: (unitId) => {
      document.getElementById('marketplace-panel')?.remove();
      selectUnit(unitId);
      const unit = session.getState().units[unitId];
      if (unit) renderLoop.camera.centerOn(unit.position);
    },
    onBuyResourceAccess: (sellerCivId, resource) => {
      if (!canBuyResourceAccess(session.getState(), session.getState().currentPlayer, sellerCivId, resource)) return;
      session.setStateWithoutRefresh(performBuyResourceAccess(session.getState(), session.getState().currentPlayer, sellerCivId, resource));
      renderLoop.setGameState(session.getState());
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
  const result = applyUnitUpgradeToState(session.getState(), unitId, targetType);
  if (!result.upgraded) return false;
  session.setStateWithoutRefresh(result.state);
  renderLoop.setGameState(session.getState());
  updateHUD();
  return true;
}

function openWonderPanelForCityId(selectedCityId: string): void {
  if (!session.getState().cities[selectedCityId]) return;

  const openWonderPanel = () => {
    document.getElementById('wonder-panel')?.remove();
    createWonderPanel(uiLayer, session.getState(), selectedCityId, {
      onStartBuild: (buildCityId, wonderId) => {
        session.setStateWithoutRefresh(startLegendaryWonderBuild(session.getState(), session.getState().currentPlayer, buildCityId, wonderId, bus));
        const targetCity = session.getState().cities[buildCityId];
        if (targetCity) {
          renderLoop.setGameState(session.getState());
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
  session.setStateWithoutRefresh(initializeLegendaryWonderProjectsForCity(session.getState(), session.getState().currentPlayer, selectedCityId));
  openWonderPanel();
}

function openCityOverviewPanel(): void {
  drawer?.close();
  const existing = document.getElementById('city-overview-panel');
  if (existing) existing.remove();
  createCityOverviewPanel(uiLayer, session.getState(), {
    onOpenCity: (cityId) => {
      const overview = document.getElementById('city-overview-panel');
      overview?.remove();
      const city = session.getState().cities[cityId];
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

function handleAppeaseFaction(cityId: string): GameState {
  const targetCity = session.getState().cities[cityId];
  if (!targetCity) return session.getState();
  const result = appeaseFaction(session.getState(), cityId, session.getState().currentPlayer);
  if (!result.success) {
    showNotification(result.message, 'warning');
    return session.getState();
  }
  session.setStateWithoutRefresh(result.state);
  renderLoop.setGameState(session.getState());
  updateHUD();
  showNotification(result.message, 'success');
  return session.getState();
}

function handleConcedeToMovement(cityId: string): GameState {
  const targetCity = session.getState().cities[cityId];
  if (!targetCity) return session.getState();
  const result = concedeToMovement(session.getState(), cityId, session.getState().currentPlayer);
  if (!result.success) {
    showNotification(result.message, 'warning');
    return session.getState();
  }
  session.setStateWithoutRefresh(result.state);
  bus.emit('faction:unrest-resolved', { cityId, owner: session.getState().currentPlayer });
  bus.emit('faction:concession-made', { cityId, owner: session.getState().currentPlayer, concessionType: 'charter' });
  renderLoop.setGameState(session.getState());
  updateHUD();
  showNotification(result.message, 'success');
  return session.getState();
}

function openCityPanelForCity(city: import('@/core/types').City): void {
  drawer?.close();
  if (city.owner !== session.getState().currentPlayer) return;
  const playerCities = currentCiv().cities;
  const idx = playerCities.indexOf(city.id);
  if (idx !== -1) currentCityIndex = (idx + 1) % playerCities.length;

  createCityPanel(uiLayer, city, session.getState(), {
    onBuild: (cityId, itemId) => {
      const targetCity = session.getState().cities[cityId];
      if (targetCity) {
        try {
          session.getState().cities[cityId] = enqueueCityProduction(targetCity, itemId);
          renderLoop.setGameState(session.getState());
          showNotification(`${targetCity.name}: queued ${getProductionDisplayName(itemId)}`, 'info');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Queue limit reached';
          showNotification(`${targetCity.name}: ${message}`, 'warning');
        }
      }
    },
    onMoveQueueItem: (cityId, fromIndex, toIndex) => {
      const targetCity = session.getState().cities[cityId];
      if (!targetCity) return;
      session.getState().cities[cityId] = reorderCityProduction(targetCity, fromIndex, toIndex);
      renderLoop.setGameState(session.getState());
    },
    onRemoveQueueItem: (cityId, index) => {
      const targetCity = session.getState().cities[cityId];
      if (!targetCity) return;
      session.getState().cities[cityId] = {
        ...targetCity,
        productionQueue: removeQueuedId(targetCity.productionQueue, index),
        productionProgress: index === 0 ? 0 : targetCity.productionProgress,
      };
      renderLoop.setGameState(session.getState());
    },
    onOpenWonderPanel: (selectedCityId) => {
      openWonderPanelForCityId(selectedCityId);
    },
    onSetCityFocus: (cityId, focus) => {
      const result = assignCityFocus(session.getState(), cityId, focus);
      session.setStateWithoutRefresh(result.state);
      renderLoop.setGameState(session.getState());
      updateHUD();
      showNotification(`${session.getState().cities[cityId].name} reassigned citizens for ${focus} focus.`, 'info');
      return session.getState();
    },
    onToggleWorkedTile: (cityId, coord, worked) => {
      const result = setCityWorkedTile(session.getState(), cityId, coord, worked);
      session.setStateWithoutRefresh(result.state);
      renderLoop.setGameState(session.getState());
      updateHUD();
      if (!result.changed && result.reason === 'claimed') {
        showNotification('That tile is already worked by another city.', 'warning');
      }
      return session.getState();
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
      const prevCity = session.getState().cities[cities[prevIdx]];
      if (prevCity) openCityPanelForCity(prevCity);
    },
    onNextCity: () => {
      const cities = currentCiv().cities;
      if (cities.length <= 1) return;
      const currentIdx = cities.indexOf(city.id);
      const nextIdx = (currentIdx + 1) % cities.length;
      const nextCity = session.getState().cities[cities[nextIdx]];
      if (nextCity) openCityPanelForCity(nextCity);
    },
    onUpgradeUnit: (unitId) => {
      const unit = session.getState().units[unitId];
      if (!unit || unit.owner !== session.getState().currentPlayer) return;
      const targetType = TRAINABLE_UNITS.find(entry => entry.type === unit.type)?.upgradesTo;
      if (!targetType) return;
      const upgrade = evaluateUnitUpgrade(session.getState(), unitId, targetType);
      if (!upgrade.canUpgrade || !upgrade.targetType) return;
      if (executeUpgrade(unitId, upgrade.targetType)) {
        showNotification(`Upgraded to ${UNIT_DEFINITIONS[upgrade.targetType].name}!`, 'success');
      }
    },
    onSetIdleProduction: (cityId, mode) => {
      const targetCity = session.getState().cities[cityId];
      if (!targetCity) return;
      session.getState().cities[cityId] = setIdleProduction(targetCity, mode);
      renderLoop.setGameState(session.getState());
    },
    onRushBuyActiveProduction: (cityId) => {
      const targetCity = session.getState().cities[cityId];
      if (!targetCity) return session.getState();
      const result = rushBuyActiveProduction(session.getState(), session.getState().currentPlayer, cityId, bus);
      if (!result.success) {
        showNotification(result.message, 'warning');
        return session.getState();
      }
      session.setStateWithoutRefresh(result.state);
      renderLoop.setGameState(session.getState());
      updateHUD();
      showNotification(`${targetCity.name}: rush bought ${result.label} for ${result.cost} gold.`, 'success');
      return session.getState();
    },
    onAppeaseFaction: (cityId) => handleAppeaseFaction(cityId),
    onConcedeToMovement: (cityId) => handleConcedeToMovement(cityId),
    onQuarantineCrisis: (crisisId, cityId) => {
      const result = applyQuarantine(session.getState(), crisisId, cityId);
      if (!result.success) {
        showNotification(result.message, 'warning');
        return session.getState();
      }
      session.setStateWithoutRefresh(result.state);
      renderLoop.setGameState(session.getState());
      updateHUD();
      showNotification(result.message, 'success');
      return session.getState();
    },
    onRemedyCrisis: (crisisId, cityId) => {
      const result = applyRemedy(session.getState(), crisisId, cityId);
      if (!result.success) {
        showNotification(result.message, 'warning');
        return session.getState();
      }
      session.setStateWithoutRefresh(result.state);
      renderLoop.setGameState(session.getState());
      updateHUD();
      showNotification(result.message, 'success');
      return session.getState();
    },
    onFindResources: (highlights, toasts) => {
      renderLoop.setHighlights(highlights.map(coord => ({ coord, type: 'worker-buildable' as const })));
      for (const t of toasts) showNotification(t.message, t.type);
    },
    onChooseCircularManufacturingMaterial: (material) => {
      try {
        session.setStateWithoutRefresh(chooseCircularManufacturingMaterial(session.getState(), session.getState().currentPlayer, material));
      } catch (error) {
        showNotification(error instanceof Error ? error.message : 'That material choice is unavailable.', 'warning');
        return;
      }
      renderLoop.setGameState(session.getState());
      showNotification(`Circular Manufacturing Network will substitute ${material.replaceAll('-', ' ')} when it helps.`, 'success');
      const refreshedCity = session.getState().cities[city.id];
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
  const civId = session.getState().currentPlayer;
  const civ = session.getState().civilizations[civId];
  if (!civ?.isHuman) return false;
  const ownReligion = Object.values(session.getState().religions ?? {}).find(r => r.ownerCivId === civId);
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
      session.setStateWithoutRefresh(chooseBoon(session.getState(), ownReligion.id, boon));
      document.getElementById('religion-boon-modal')?.remove();
      setBlockingOverlay(null);
      showNotification(`${ownReligion.name} now grants ${boon}.`, 'success');
      renderLoop.setGameState(session.getState());
      updateHUD();
    },
  });
  return true;
}

function refreshRequiredChoicesAfterAction(): void {
  document.getElementById('required-choice-panel')?.remove();
  closePlanningPanels(document);
  renderLoop.setGameState(session.getState());
  updateHUD();
  showRequiredChoicesIfNeeded();
}

function showRequiredChoicesIfNeeded(): boolean {
  const civId = session.getState().currentPlayer;
  const idleCityIds = getIdleCityIds(session.getState(), civId);
  const missingResearch = needsResearchChoice(session.getState(), civId);
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
      .reduce((total, cityId) => total + calculateProjectedCityYields(session.getState(), cityId).science, 0),
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
      const city = session.getState().cities[cityId];
      const choice = getRecommendedIdleCityChoice(session.getState(), civId, cityId);
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
      const city = session.getState().cities[cityId];
      if (!city) return;
      session.getState().cities[cityId] = enqueueCityProduction(city, itemId);
      showNotification(`${city.name}: queued ${itemId}`, 'info');
      refreshRequiredChoicesAfterAction();
    },
    onOpenTech: () => {
      closeRequiredChoicePanel();
      togglePanel('tech');
    },
    onOpenCity: (cityId) => {
      const city = session.getState().cities[cityId];
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
    createCouncilPanel(uiLayer, session.getState(), {
      onClose: () => {
        document.getElementById('council-panel')?.remove();
        councilPanelOpen = false;
      },
      onTalkLevelChange: (level) => {
        session.getState().settings.councilTalkLevel = level;
        void saveSettings(session.getState().settings);
      },
    });
    councilPanelOpen = true;
  } else if (panel === 'tech') {
    createTechPanel(uiLayer, session.getState(), {
      onQueueResearch: (techId) => {
        try {
          currentCiv().techState = enqueueResearch(currentCiv().techState, techId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Queue limit reached';
          showNotification(message, 'warning');
          return;
        }
        renderLoop.setGameState(session.getState());
        updateHUD();
        showNotification(`Queued research: ${techId}`, 'info');
      },
      onMoveQueuedResearch: (fromIndex, toIndex) => {
        currentCiv().techState = {
          ...currentCiv().techState,
          researchQueue: moveQueuedId(currentCiv().techState.researchQueue, fromIndex, toIndex),
        };
        renderLoop.setGameState(session.getState());
        updateHUD();
      },
      onRemoveQueuedResearch: (index) => {
        currentCiv().techState = {
          ...currentCiv().techState,
          researchQueue: removeQueuedId(currentCiv().techState.researchQueue, index),
        };
        renderLoop.setGameState(session.getState());
        updateHUD();
      },
      onClose: () => {},
    });
  } else if (panel === 'city') {
    openCityOverviewPanel();
  } else if (panel === 'espionage') {
    const chooseForeignCityTarget = (): { civId: string; cityId: string; position: HexCoord } | null => {
      const choices = Object.values(session.getState().cities)
        .filter(city => city.owner !== session.getState().currentPlayer)
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
      const city = session.getState().cities[selection];
      if (!city || city.owner === session.getState().currentPlayer) {
        showNotification('Invalid espionage target.', 'warning');
        return null;
      }
      return { civId: city.owner, cityId: city.id, position: city.position };
    };

    const chooseFriendlyCityTarget = (): { cityId: string; position: HexCoord } | null => {
      const choices = currentCiv().cities
        .map(cityId => session.getState().cities[cityId])
        .filter((city): city is NonNullable<GameState['cities'][string]> => city !== undefined);
      if (choices.length === 0) {
        showNotification('No cities available for defensive espionage.', 'info');
        return null;
      }
      const selection = window.prompt(
        `Choose friendly city by id:\n${choices.map(city => city.id).join('\n')}`,
        choices[0].id,
      );
      if (!selection) return null;
      const city = session.getState().cities[selection];
      if (!city || city.owner !== session.getState().currentPlayer) {
        showNotification('Invalid defensive target.', 'warning');
        return null;
      }
      return { cityId: city.id, position: city.position };
    };

    const chooseMission = (spyId: string): string | null => {
      const spy = session.getState().espionage?.[session.getState().currentPlayer]?.spies[spyId];
      const completedTechs = currentCiv().techState.completed ?? [];
      // #524 MR2a review fix: flip_loyalty can never succeed against a capital (see
      // resolveMissionResult's guard in espionage-system.ts) -- don't offer it as a
      // choice when the spy's current target already is one. Without this, a spy
      // stationed in an enemy capital could "succeed" an 8-turn flip_loyalty mission
      // that silently does nothing, with no explanation.
      const spyTargetsCapital = Boolean(
        spy?.targetCivId && spy.targetCityId
          && getCapitalCityId(session.getState(), spy.targetCivId) === spy.targetCityId,
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

    uiLayer.appendChild(createEspionagePanel(session.getState(), {
      onClose: () => document.getElementById('espionage-panel')?.remove(),
      onAssignDefensive: (spyId) => {
        const target = chooseFriendlyCityTarget();
        if (!target) return;
        session.getState().espionage![session.getState().currentPlayer] = embedSpy(
          session.getState().espionage![session.getState().currentPlayer],
          spyId,
          target.cityId,
          target.position,
        );
        const unit = session.getState().units[spyId];
        if (unit) {
          delete session.getState().units[spyId];
          session.getState().civilizations[session.getState().currentPlayer].units =
            session.getState().civilizations[session.getState().currentPlayer].units.filter(id => id !== spyId);
        }
        renderLoop.setGameState(session.getState());
        togglePanel('espionage');
        const cityName = session.getState().cities[target.cityId]?.name ?? target.cityId;
        showNotification(`Spy embedded in ${cityName}. Counter-intelligence boosted.`, 'info');
      },
      onStartMission: (spyId) => {
        const spy = session.getState().espionage?.[session.getState().currentPlayer]?.spies[spyId];
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
        session.getState().espionage![session.getState().currentPlayer] = startMission(
          session.getState().espionage![session.getState().currentPlayer],
          spyId,
          mission as any,
          currentCivDef()?.bonusEffect,
          targetCivId,
          targetCityId,
        );
        renderLoop.setGameState(session.getState());
        togglePanel('espionage');
        showNotification(`Mission ${mission} started.`, 'info');
      },
      onRecall: (spyId) => {
        session.getState().espionage![session.getState().currentPlayer] = recallSpy(
          session.getState().espionage![session.getState().currentPlayer],
          spyId,
        );
        renderLoop.setGameState(session.getState());
        togglePanel('espionage');
        showNotification('Spy recalled.', 'info');
      },
      onVerifyAgent: (spyId) => {
        session.getState().espionage![session.getState().currentPlayer] = verifyAgent(
          session.getState().espionage![session.getState().currentPlayer],
          spyId,
        );
        renderLoop.setGameState(session.getState());
        togglePanel('espionage');
        showNotification('Agent verified and cleared.', 'success');
      },
      onExfiltrate: (spyId) => {
        const ownerEsp = session.getState().espionage?.[session.getState().currentPlayer];
        const spy = ownerEsp?.spies[spyId];
        if (!spy || spy.status !== 'stationed') return;
        const capital = getCapitalCity(session.getState(), session.getState().currentPlayer);
        if (!capital) { showNotification('Cannot exfiltrate — no capital found.', 'warning'); return; }

        // Spawn occupancy: find a free tile at/near the capital
        const existingPositions = new Set(
          Object.values(session.getState().units).map(u => `${u.position.q},${u.position.r}`),
        );
        let spawnPos = capital.position;
        if (existingPositions.has(`${spawnPos.q},${spawnPos.r}`)) {
          const adjacent = hexesInRange(capital.position, 1).filter(
            c => !(c.q === capital.position.q && c.r === capital.position.r) &&
                 !existingPositions.has(`${c.q},${c.r}`) &&
                 session.getState().map.tiles[hexKey(c)],
          );
          if (adjacent.length === 0) {
            showNotification('Cannot exfiltrate — no free tile near capital.', 'warning');
            return;
          }
          spawnPos = adjacent[0];
        }

        const newUnit = createUnit(spy.unitType, session.getState().currentPlayer, spawnPos, session.getState().idCounters);
        session.getState().units[newUnit.id] = newUnit;
        session.getState().civilizations[session.getState().currentPlayer].units =
          [...(session.getState().civilizations[session.getState().currentPlayer].units ?? []), newUnit.id];
        const updatedSpy = {
          ...spy, id: newUnit.id, status: 'cooldown' as const,
          cooldownTurns: 8, infiltrationCityId: null, cityVisionTurnsLeft: 0, targetCivId: null, cooldownMode: undefined,
        };
        const { [spyId]: _old, ...rest } = ownerEsp!.spies;
        session.getState().espionage![session.getState().currentPlayer] = { ...ownerEsp!, spies: { ...rest, [newUnit.id]: updatedSpy } };
        renderLoop.setGameState(session.getState());
        // Refresh panel in place
        document.getElementById('espionage-panel')?.remove();
        togglePanel('espionage');
        showNotification('Spy exfiltrated. Available again in 8 turns.', 'info');
      },
      onToggleCooldownMode: (spyId) => {
        const civEsp = session.getState().espionage?.[session.getState().currentPlayer];
        const spy = civEsp?.spies[spyId];
        if (!spy || spy.status !== 'cooldown') return;
        const next: 'stay_low' | 'passive_observe' =
          (spy.cooldownMode ?? 'stay_low') === 'passive_observe' ? 'stay_low' : 'passive_observe';
        session.setStateWithoutRefresh({
          ...session.getState(),
          espionage: {
            ...session.getState().espionage!,
            [session.getState().currentPlayer]: {
              ...civEsp!,
              spies: { ...civEsp!.spies, [spyId]: { ...spy, cooldownMode: next } },
            },
          },
        });
        renderLoop.setGameState(session.getState());
        document.getElementById('espionage-panel')?.remove();
        togglePanel('espionage');
      },
      onUnembed: (spyId) => {
        const ownerEsp = session.getState().espionage?.[session.getState().currentPlayer];
        const spy = ownerEsp?.spies[spyId];
        if (!spy || spy.status !== 'embedded' || !spy.targetCityId) return;
        const city = session.getState().cities[spy.targetCityId];
        if (!city) return;
        const newUnit = createUnit(spy.unitType, session.getState().currentPlayer, city.position, session.getState().idCounters);
        session.getState().units[newUnit.id] = newUnit;
        session.getState().civilizations[session.getState().currentPlayer].units.push(newUnit.id);
        const unembedded = unembedSpy(ownerEsp!, spyId);
        const rekeyed = { ...unembedded.spies[spyId], id: newUnit.id };
        const { [spyId]: _old, ...rest } = unembedded.spies;
        session.getState().espionage![session.getState().currentPlayer] = { ...unembedded, spies: { ...rest, [newUnit.id]: rekeyed } };
        renderLoop.setGameState(session.getState());
        document.getElementById('espionage-panel')?.remove();
        togglePanel('espionage');
        showNotification(`Spy recalled from ${city.name}. Available in 5 turns.`, 'info');
      },
      onSweep: (spyId) => {
        const ownerEsp = session.getState().espionage?.[session.getState().currentPlayer];
        if (!ownerEsp) return;
        const seed = `sweep-${spyId}-${session.getState().turn}`;
        const { detectedSpyIds, state: updatedEsp } = attemptSweep(ownerEsp, spyId, seed, session.getState());
        session.getState().espionage![session.getState().currentPlayer] = updatedEsp;
        if (detectedSpyIds.length > 0) {
          showNotification(`Sweep detected ${detectedSpyIds.length} enemy spy(ies) in the city!`, 'warning');
        } else {
          showNotification('Sweep complete — no enemy spies detected.', 'info');
        }
        renderLoop.setGameState(session.getState());
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
  const state = session.getState();
  if (!state) {
    return;
  }
  const interrupt = getCouncilInterrupt(state, state.currentPlayer, state.settings.councilTalkLevel);
  if (!interrupt) {
    return;
  }
  if (state.hotSeat && state.pendingEvents && interrupt.civId !== state.currentPlayer) {
    collectCouncilInterrupt(state.pendingEvents, interrupt.civId, interrupt, state.turn);
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

  renderUnitStackPanel(panel, session.getState(), coord, unitIds, {
    onSelectUnit: (unitId) => selectUnit(unitId),
    onOpenCity: (cityId) => {
      const city = session.getState().cities[cityId];
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
  const source = session.getState().units[sourceUnitId];
  const ownerCivId = session.getState().currentPlayer;
  if (!source || source.owner !== ownerCivId || !isAutonomyActivated(session.getState(), ownerCivId)) {
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
  panel = createNetworkIntentPanel(session.getState(), ownerCivId, sourceUnitId, {
    onAssign: (definitionId, cityId) => {
      const current = Object.values(session.getState().autonomyByCiv?.[ownerCivId]?.plans ?? {})
        .find(plan => plan.sourceUnitId === sourceUnitId);
      const stateForAssignment = current && current.definitionId !== definitionId
        ? holdNetworkPlan(session.getState(), ownerCivId, sourceUnitId).state
        : session.getState();
      const result = current && current.definitionId === definitionId
        ? retargetNetworkPlan(session.getState(), ownerCivId, current.id, { kind: 'city', cityId })
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
      session.setStateWithoutRefresh(result.state);
      renderLoop.setGameState(session.getState());
      updateHUD();
      close();
      selectUnit(sourceUnitId);
      const cityName = session.getState().cities[cityId]?.name ?? 'the city';
      showNotification(`${definitionId === 'harden' ? 'Harden' : 'Exploit'} assigned to ${cityName}.`, 'success');
    },
    onHold: () => {
      const result = holdNetworkPlan(session.getState(), ownerCivId, sourceUnitId);
      session.setStateWithoutRefresh(result.state);
      renderLoop.setGameState(session.getState());
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
  const civId = session.getState().currentPlayer;
  if (!isAutonomyActivated(session.getState(), civId)) return;
  let panel: HTMLElement | undefined;
  const rerender = () => {
    panel?.remove();
    panel = createNetworkPanel(getNetworkPanelModel(session.getState(), civId), {
      onAssign: request => {
        const result = assignNetworkPlan(session.getState(), request);
        if (!result.validation.ok) {
          showNotification('That plan is no longer available.', 'warning');
          rerender();
          return;
        }
        session.setStateWithoutRefresh(result.state);
        renderLoop.setGameState(session.getState());
        updateHUD();
        showNotification('Network plan assigned.', 'success');
        rerender();
      },
      onCancel: planId => {
        session.setStateWithoutRefresh(cancelNetworkPlan(session.getState(), civId, planId).state);
        renderLoop.setGameState(session.getState());
        updateHUD();
        rerender();
      },
      onSurge: planId => {
        const result = beginAutonomySurge(session.getState(), civId, planId);
        if (!result.validation.ok) showNotification('Surge is unavailable while the network recovers or cools down.', 'warning');
        else {
          session.setStateWithoutRefresh(result.state);
          renderLoop.setGameState(session.getState());
          updateHUD();
          bus.emit('network:audio-cue', { cue: 'surge', viewerIds: [civId] });
          showNotification('Network Surge confirmed.', 'success');
        }
        rerender();
      },
      onPosture: posture => {
        session.setStateWithoutRefresh(requestAutonomyPosture(session.getState(), civId, posture));
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
  openEstablishRoutePanel(uiLayer, session.getState(), caravanId, (toCityId) => {
    const resourceDiversity = getCivAvailableResources(session.getState(), session.getState().currentPlayer).size;
    const routeResult = establishQuestAwareRoute(session.getState(), caravanId, toCityId, resourceDiversity);
    session.setStateWithoutRefresh(routeResult.state);
    emitMinorCivQuestTransitions(bus, routeResult.questTransitions, session.getState());
    bus.emit('trade:route-created', { route: routeResult.route });
    renderLoop.setGameState(session.getState());
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
  const unit = session.getState().units[unitId];
  if (!unit || unit.owner !== session.getState().currentPlayer) return;
  selectedUnitId = unitId;
  renderLoop.setSelectedUnitId(unitId);

  const highlightResult = buildSelectedUnitHighlights(session.getState(), unitId);
  selectedUnitWaterRecovery = highlightResult.waterRecovery;
  if (session.getState().units[unitId]?.committedToRouteId) {
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
    const completedTechs = session.getState().civilizations[unit.owner]?.techState.completed ?? [];
    const path = findPath(unit.position, unit.automation.destination, session.getState().map, domain, { unit, completedTechs });
    renderLoop.setJourneyPath(path);
  } else {
    renderLoop.setJourneyPath(null);
  }

  // Show unit info panel
  const panel = document.getElementById('info-panel');
  if (panel) {
    renderSelectedUnitInfo(panel, session.getState(), unitId, {
      onClose: () => deselectUnit(),
      onStartIntercept: uid => {
        const result = startIntercept(session.getState(), uid);
        if (!result.ok) {
          showNotification('That fighter cannot enter intercept stance now.', 'warning');
          return;
        }
        session.setStateWithoutRefresh(result.state);
        renderLoop.setGameState(session.getState());
        updateHUD();
        SFX.airScramble();
        selectUnit(uid);
        renderLoop.setHighlights(getInterceptCoverage(session.getState(), uid).map(coord => ({ coord, type: 'air-intercept' as const })));
      },
      getAirRebaseDestinations: uid => getLegalRebaseDestinations(session.getState(), uid).map(base => {
        const position = base.kind === 'city' ? session.getState().cities[base.cityId]?.position : session.getState().units[base.unitId]?.position;
        const name = base.kind === 'city'
          ? session.getState().cities[base.cityId]?.name ?? base.cityId
          : UNIT_DEFINITIONS[session.getState().units[base.unitId]?.type ?? 'carrier'].name;
        return { base, label: `${name} (${getAirBaseRoster(session.getState(), base).length}/${getAirBaseCapacity(session.getState(), base)})${position ? '' : ''}` };
      }),
      onRebaseAircraft: (uid, base) => {
        const result = rebaseAircraft(session.getState(), uid, base);
        if (!result.ok) {
          showNotification('That base is no longer reachable.', 'warning');
          return;
        }
        session.setStateWithoutRefresh(result.state);
        renderLoop.setGameState(session.getState());
        updateHUD();
        SFX.airRebase();
        selectUnit(uid);
      },
      onStartAirMission: (uid, mission) => {
        pendingAirMission = { unitId: uid, mission };
        const targets = getLegalAirMissionTargets(session.getState(), uid, mission);
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
        const result = usePropagandistAction(session.getState(), uid, action, cityId);
        if (!result.ok) {
          showNotification('That civic action is no longer available.', 'warning');
          return;
        }
        session.setStateWithoutRefresh(result.state);
        renderLoop.setGameState(session.getState());
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
        const unit = session.getState().units[uid];
        if (!unit || unit.owner !== session.getState().currentPlayer) return;
        if (unit.isFortified) {
          session.setStateWithoutRefresh(unfortifyUnitInState(session.getState(), session.getState().currentPlayer, uid));
          showNotification('Unit unfortified.', 'info');
        } else {
          session.setStateWithoutRefresh(fortifyUnitInState(session.getState(), session.getState().currentPlayer, uid));
          showNotification('Unit fortified. +25% defense until unfortified or moved.', 'info');
        }
        renderLoop.setGameState(session.getState());
        updateHUD();
        selectUnit(uid);
      },
      onPillage: uid => {
        const unit = session.getState().units[uid];
        if (!unit || unit.owner !== session.getState().currentPlayer) return;
        const tile = session.getState().map.tiles[hexKey(unit.position)];
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

        const result = applyPillageToState(session.getState(), uid);
        if (!result.ok) return;
        session.setStateWithoutRefresh(result.state);
        showNotification(
          result.goldAwarded! > 0 ? `Pillaged ${targetLabel} for ${result.goldAwarded} gold.` : `Pillaged ${targetLabel}.`,
          'success',
        );
        renderLoop.setGameState(session.getState());
        updateHUD();
        selectUnit(uid);
      },
      onStartAutoExplore: uid => startAutoExplore(uid),
      onCancelAutoExplore: () => cancelAutoExplore(unitId),
      onCancelJourney: () => cancelJourney(unitId),
      onOpenStack: (coord) => {
        handleFriendlyUnitStackTap(session.getState(), coord, selectedUnitId, {
          onSelectUnit: selectUnit,
          onOpenStackPicker: openUnitStackPicker,
        });
      },
      getTransportOptions: uid => {
        const selectedUnit = session.getState().units[uid];
        const needs = selectedUnit ? getUnitCargoSize(selectedUnit) : 1;
        return Object.values(session.getState().units)
          .filter(candidate => {
            const def = UNIT_DEFINITIONS[candidate.type];
            return (def?.domain ?? 'land') === 'naval' && def?.cargoCapacity !== undefined
              && candidate.owner === session.getState().currentPlayer;
          })
          .map(candidate => {
            const used  = getTransportCargoUsed(session.getState(), candidate.id);
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
          .filter(o => canLoadUnitOntoTransport(session.getState(), uid, o.transportId).ok || o.disabled);
      },
      getCargoBoardInfo: transportId => getTransportCargo(session.getState(), transportId).map(cargoUnit => ({
        cargoUnitId: cargoUnit.id,
        label: UNIT_DEFINITIONS[cargoUnit.type]?.name ?? cargoUnit.type,
        slotCost: getUnitCargoSize(cargoUnit),
        canUnload: !cargoUnit.hasActed && cargoUnit.movementPointsLeft > 0,
      })),
      onSelectCargoToUnload: (transportId, cargoUnitId) => {
        const range = getUnloadDestinations(session.getState(), transportId, cargoUnitId);
        setPendingUnload({ transportId, cargoUnitId }, range);
        renderLoop.setHighlights(range.map(coord => ({ coord, type: 'move' as const })));
        const cargoUnit = session.getState().units[cargoUnitId];
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
        const pending = findAvailablePirateHeadquartersAssault(session.getState(), session.getState().currentPlayer, uid);
        if (!pending) return null;
        const faction = getPirateWatersPresentation(session.getState(), session.getState().currentPlayer).factions
          .find(entry => entry.factionId === pending.factionId);
        return { factionId: pending.factionId, label: `Assault ${faction?.name ?? 'pirate'} enclave` };
      },
      onOpenPirateAssault: (factionId, uid) => openPirateHeadquartersAssault(factionId, uid),
      onLoadTransport: (uid, transportId) => {
        const prevPos = session.getState().units[uid]?.position;
        const result = loadUnitOntoTransport(session.getState(), uid, transportId);
        if (!result.ok) {
          showNotification(result.message, 'warning');
          SFX.error();
          return;
        }
        session.setStateWithoutRefresh(result.state);
        renderLoop.setGameState(session.getState());
        updateHUD();
        // Boarding animation: slide cargo unit to transport hex before it disappears
        const transportUnit = session.getState().units[transportId];
        if (prevPos && transportUnit) {
          renderLoop.animateUnitSlide(
            { ...result.state.units[uid] ?? { id: uid } as Unit, position: prevPos },
            transportUnit.position,
          );
        }
        selectUnit(transportId);
        const tName = UNIT_DEFINITIONS[session.getState().units[transportId]?.type ?? 'transport']?.name ?? 'Transport';
        showNotification(`Unit loaded onto ${tName}.`, 'info');
        SFX.transportLoad();
      },
      onUnloadTransport: (transportId, cargoUnitId, destination) => {
        const result = unloadUnitFromTransport(session.getState(), transportId, cargoUnitId, destination);
        if (!result.ok) {
          showNotification(result.message, 'warning');
          SFX.error();
          return;
        }
        const tName = UNIT_DEFINITIONS[session.getState().units[transportId]?.type ?? 'transport']?.name ?? 'Transport';
        const cName = UNIT_DEFINITIONS[session.getState().units[cargoUnitId]?.type ?? 'warrior']?.name ?? 'Unit';
        clearUnloadState();
        session.setStateWithoutRefresh(result.state);
        renderLoop.setGameState(session.getState());
        updateHUD();
        renderLoop.animateUnitAppear(destination);
        // Stay on the transport so the player can unload remaining cargo
        selectUnit(transportId);
        showNotification(`${cName} disembarked from ${tName}.`, 'info');
        SFX.transportUnload();
      },
      onSetDisguise: (uid, disguise) => {
        const unit = session.getState().units[uid];
        if (!unit || unit.hasActed) return;
        if (unit.owner !== session.getState().currentPlayer) return;
        const civEsp = session.getState().espionage?.[session.getState().currentPlayer];
        if (!civEsp) return;
        const spy = civEsp.spies[uid];
        if (!spy || spy.status !== 'idle') return;
        session.getState().espionage![session.getState().currentPlayer] = setDisguise(civEsp, uid, disguise);
        if (disguise !== null) {
          session.getState().units[uid] = { ...unit, hasActed: true, movementPointsLeft: 0 };
        }
        renderLoop.setGameState(session.getState());
        updateHUD();
        selectUnit(uid);
        showNotification(disguise ? `Spy disguised as ${disguise}.` : 'Disguise removed.', 'info');
      },
      onInfiltrate: (uid) => {
        const unit = session.getState().units[uid];
        if (!unit || unit.owner !== session.getState().currentPlayer) return;
        const civEsp = session.getState().espionage?.[session.getState().currentPlayer];
        if (!civEsp) return;
        const targetCity = Object.values(session.getState().cities).find(
          c => c.owner !== session.getState().currentPlayer &&
               c.position.q === unit.position.q && c.position.r === unit.position.r,
        );
        if (!targetCity) { showNotification('No enemy city at this location.', 'info'); return; }

        const alreadyInside = Object.values(civEsp.spies).some(
          s => s.infiltrationCityId === targetCity.id &&
               (s.status === 'stationed' || s.status === 'on_mission'),
        );
        if (alreadyInside) { showNotification('You already have a spy in that city.', 'info'); return; }

        const cityCI = session.getState().espionage![targetCity.owner]?.counterIntelligence[targetCity.id] ?? 0;
        const chance = getInfiltrationSuccessChance(unit.type as UnitType, civEsp.spies[uid]?.experience ?? 0, cityCI);
        const preview = `Infiltrate ${targetCity.name}?\n\nSuccess chance: ${Math.round(chance * 100)}%\nCity CI: ${cityCI}\n\nIf caught, spy may be lost permanently.`;
        if (!window.confirm(preview)) return;

        const seed = `infiltrate-${uid}-${session.getState().turn}`;
        const result = attemptInfiltration(
          civEsp, uid, unit.type as UnitType, targetCity.id, targetCity.position, cityCI, seed,
        );
        // Record the original target civ so auto-exfiltrate can detect third-party captures
        const spyAfterAttempt = result.civEsp.spies[uid];
        const civEspWithTarget = spyAfterAttempt ? {
          ...result.civEsp,
          spies: { ...result.civEsp.spies, [uid]: { ...spyAfterAttempt, targetCivId: targetCity.owner } },
        } : result.civEsp;
        session.getState().espionage![session.getState().currentPlayer] = civEspWithTarget;

        if (result.removeUnitFromMap) {
          // Era 2+: spy removed from map, stationed inside city
          delete session.getState().units[uid];
          const civUnits = session.getState().civilizations[session.getState().currentPlayer].units;
          if (civUnits) {
            session.getState().civilizations[session.getState().currentPlayer].units = civUnits.filter(id => id !== uid);
          }
          showNotification(`Spy successfully infiltrated ${targetCity.name}. Open Intel panel to issue orders.`, 'success');
          bus.emit('espionage:spy-infiltrated', { civId: session.getState().currentPlayer, spyId: uid, cityId: targetCity.id });
          deselectUnit();
        } else if (result.era1ScoutResult !== undefined) {
          // Era 1 (spy_scout): spy stays on map, infiltrationCityId + 5-turn city vision already set
          const missionResult = resolveMissionResult('scout_area', targetCity.owner, targetCity.id, session.getState(), session.getState().currentPlayer, uid);
          const tilesToReveal = missionResult.tilesToReveal ?? [];
          if (tilesToReveal.length > 0) {
            const visibilityTiles = { ...(session.getState().civilizations[session.getState().currentPlayer].visibility?.tiles ?? {}) };
            for (const coord of tilesToReveal) {
              visibilityTiles[`${coord.q},${coord.r}`] = 'visible';
            }
            session.getState().civilizations[session.getState().currentPlayer].visibility = {
              ...session.getState().civilizations[session.getState().currentPlayer].visibility!,
              tiles: visibilityTiles,
            };
          }
          session.getState().units[uid] = { ...unit, hasActed: true, movementPointsLeft: 0 };
          showNotification(`Scout revealed ${tilesToReveal.length} tile${tilesToReveal.length !== 1 ? 's' : ''} around ${targetCity.name}.`, 'success');
          selectUnit(uid);
        } else if (result.caught) {
          // Caught: remove unit from map (spy lost)
          delete session.getState().units[uid];
          const civUnits = session.getState().civilizations[session.getState().currentPlayer].units;
          if (civUnits) {
            session.getState().civilizations[session.getState().currentPlayer].units = civUnits.filter(id => id !== uid);
          }
          bus.emit('espionage:spy-caught-infiltrating', { capturingCivId: targetCity.owner, spyOwner: session.getState().currentPlayer, spyId: uid, cityId: targetCity.id });
          deselectUnit();
        } else {
          const cooldown = result.civEsp.spies[uid]?.cooldownTurns ?? 3;
          showNotification(`Spy failed to infiltrate ${targetCity.name}. Lying low for ${cooldown} turns.`, 'info');
          session.getState().units[uid] = { ...unit, hasActed: true, movementPointsLeft: 0 };
          selectUnit(uid);
        }

        renderLoop.setGameState(session.getState());
        updateHUD();
      },
      onEmbed: (uid) => {
        const unit = session.getState().units[uid];
        if (!unit || unit.owner !== session.getState().currentPlayer) return;
        const civEsp = session.getState().espionage?.[session.getState().currentPlayer];
        if (!civEsp) return;
        const city = Object.values(session.getState().cities).find(
          c => c.owner === session.getState().currentPlayer &&
               c.position.q === unit.position.q && c.position.r === unit.position.r,
        );
        if (!city) return;
        session.getState().espionage![session.getState().currentPlayer] = embedSpy(civEsp, uid, city.id, city.position);
        delete session.getState().units[uid];
        session.getState().civilizations[session.getState().currentPlayer].units =
          session.getState().civilizations[session.getState().currentPlayer].units.filter(id => id !== uid);
        deselectUnit();
        renderLoop.setGameState(session.getState());
        updateHUD();
        showNotification(`Spy embedded in ${city.name}. Counter-intelligence boosted.`, 'info');
      },
      onUpgradeUnit: (uid, cityId) => {
        const unit = session.getState().units[uid];
        if (!unit || unit.owner !== session.getState().currentPlayer) return;
        const targetType = TRAINABLE_UNITS.find(entry => entry.type === unit.type)?.upgradesTo;
        if (!targetType) return;
        const upgrade = evaluateUnitUpgrade(session.getState(), uid, targetType);
        if (!upgrade.canUpgrade || !upgrade.targetType) return;
        if (executeUpgrade(uid, upgrade.targetType)) {
          selectUnit(uid);
          showNotification(`Upgraded to ${UNIT_DEFINITIONS[upgrade.targetType].name}!`, 'success');
        }
      },
      onEstablishOutpost: (unitId) => {
        if (!canEstablishOutpost(session.getState(), unitId)) return;
        session.setStateWithoutRefresh(performEstablishOutpost(session.getState(), unitId));
        autoSave(session.getState()).catch(() => {});
        selectedUnitId = null;
        renderLoop.setSelectedUnitId(null);
        renderLoop.setGameState(session.getState());
        updateHUD();
        showNotification('Expedition planted a flag! Outpost completes in 2 turns.', 'success');
      },
      onEstablishRoute: handleEstablishRoute,
      onReplaceImprovement: (action) => {
        if (!selectedUnitId) return;
        const unit = session.getState().units[selectedUnitId];
        if (!unit) return;
        const tileKey = hexKey(unit.position);
        const currentTile = session.getState().map.tiles[tileKey];
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
            const result = applyWorkerAction(session.getState(), uid, action, { allowReplacement: true });
            if (!result.ok) return;
            session.setStateWithoutRefresh(result.state);
            for (const event of result.events) {
              if (event.type === 'improvement:started') {
                bus.emit('improvement:started', event.payload);
              } else if (event.type === 'road:started') {
                bus.emit('road:started', event.payload);
              } else {
                bus.emit('unit:destroyed', event.payload);
              }
            }
            renderLoop.setGameState(session.getState());
            updateHUD();
            if (result.workerConsumed || result.workerLost || !session.getState().units[uid]) {
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
  const movedUnit = session.getState().units[unitId];
  if (!movedUnit || path.length < 2) return;
  movementRange = [];
  attackRange = [];
  clearUnloadState();
  renderLoop.clearHighlights();
  renderLoop.animateUnitMove({ ...movedUnit, position: path[0]! }, path, () => {
    renderLoop.setGameState(session.getState());
    updateHUD();
    deferWonderDiscoveryRevealUntilMoveSettles = false;
    wonderDiscoveryQueue?.notifyActionSettled();
    const unit = session.getState().units[unitId];
    if (!unit || unit.owner !== session.getState().currentPlayer) return;

    if ((unit.movementPointsLeft ?? 0) <= 0) {
      selectNextUnit();
    } else if (selectedUnitId === unitId) {
      selectUnit(unitId);
    }
  });
}

function executeAnimatedUnitMove(unitId: string, move: () => ExecuteUnitMoveResult): ExecuteUnitMoveResult {
  const movingUnit = session.getState().units[unitId];
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
      const movedUnit = session.getState().units[unitId];
      if (movedUnit) {
        session.setStateWithoutRefresh({
          ...session.getState(),
          units: { ...session.getState().units, [unitId]: { ...movedUnit, automation: undefined } },
        });
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
  const unit = session.getState().units[unitId];
  if (!unit || unit.owner !== session.getState().currentPlayer) return;

  session.getState().units[unitId] = {
    ...unit,
    automation: {
      mode: 'auto-explore',
      startedTurn: session.getState().turn,
      lastTargets: unit.automation?.mode === 'auto-explore' ? unit.automation.lastTargets : [],
    },
  };

  if (session.getState().units[unitId].movementPointsLeft > 0 && !session.getState().units[unitId].hasActed) {
    applyAutoExploreOrder(session.getState(), unitId, { bus });
  }

  renderLoop.setGameState(session.getState());
  updateHUD();
  selectUnit(unitId);
}

function cancelAutoExplore(unitId: string): void {
  const unit = session.getState().units[unitId];
  if (!unit?.automation) return;
  delete session.getState().units[unitId].automation;
  renderLoop.setGameState(session.getState());
  updateHUD();
  if (selectedUnitId === unitId) {
    selectUnit(unitId);
  }
}

function cancelJourney(unitId: string): void {
  const unit = session.getState().units[unitId];
  if (!unit?.automation) return;
  session.setStateWithoutRefresh({
    ...session.getState(),
    units: { ...session.getState().units, [unitId]: { ...unit, automation: undefined } },
  });
  renderLoop.setGameState(session.getState());
  renderLoop.setJourneyPath(null);
  updateHUD();
  if (selectedUnitId === unitId) {
    selectUnit(unitId);
  }
}

function openUnitContextMenu(unitId: string): void {
  const panel = document.getElementById('info-panel');
  if (!panel) return;

  createContextMenu(panel, session.getState(), { unitId }, {
    onStartAutoExplore: id => startAutoExplore(id),
    onCancelAutoExplore: id => cancelAutoExplore(id),
  }, uiInteractions);
}

function selectNextUnit(): void {
  const unmoved = getUnmovedUnits(session.getState().units, session.getState().currentPlayer);
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

function refreshSelectedUnitAfterCombat(): void {
  if (!selectedUnitId) return;
  const selectedUnit = session.getState().units[selectedUnitId];
  if (!selectedUnit || selectedUnit.owner !== session.getState().currentPlayer) {
    deselectUnit();
    return;
  }
  selectUnit(selectedUnitId, { suppressSelectionSfx: true });
}

function refreshCurrentPlayerVisibility(): void {
  if (!currentCiv()?.visibility) return;

  // Snapshot unexplored tile keys before the update so we can detect fog-lift transitions
  const visTiles = currentCiv()!.visibility!.tiles;
  const prevUnexplored = new Set(
    Object.keys(visTiles).filter(k => visTiles[k] === 'unexplored'),
  );

  updateAndRefreshVisibility(session.getState(), session.getState().currentPlayer);

  // Fire at most one resource-discovered tip per visibility update to avoid
  // flooding the player when a scout reveals several resource tiles at once.
  const updatedTiles = currentCiv()?.visibility?.tiles ?? {};
  for (const key of prevUnexplored) {
    if (updatedTiles[key] !== 'unexplored') {
      const tile = session.getState().map.tiles[key];
      if (tile?.resource) {
        const fired = fireResourceDiscoveredTip(tile.resource, session.getState(), bus);
        if (fired) break; // one tip per move is enough
      }
    }
  }

  for (const contact of syncCivilizationContactsFromVisibility(session.getState(), session.getState().currentPlayer)) {
    bus.emit('civilization:first-contact', contact);
  }

  scanBeastSightings();
}

function getUnitTurnFlow() {
  return createUnitTurnFlow({
    uiLayer,
    getState: () => session.getState(),
    setState: nextState => { session.setStateWithoutRefresh(nextState); },
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
  const unit = session.getState().units[selectedUnitId];
  if (!unit || unit.type !== 'settler') return;

  const blockers = getCityFoundingBlockers(session.getState(), unit.position);
  if (blockers.length > 0) {
    showNotification(formatCityFoundingBlockerMessage(blockers), 'warning');
    return;
  }

  let result;
  try {
    result = foundCityInState(session.getState(), selectedUnitId, bus);
  } catch (error) {
    showNotification(
      error instanceof Error ? error.message : 'City cannot be founded here.',
      'warning',
    );
    return;
  }
  session.setStateWithoutRefresh(result.state);

  deselectUnit();
  const foundedCity = session.getState().cities[result.cityId];
  showNotification(`${foundedCity.name} has been founded!`, 'success');
  SFX.foundCity();

  // Update visibility
  updateAndRefreshVisibility(session.getState(), session.getState().currentPlayer);
  for (const contact of syncCivilizationContactsFromVisibility(session.getState(), session.getState().currentPlayer)) {
    bus.emit('civilization:first-contact', contact);
  }

  renderLoop.setGameState(session.getState());
  updateHUD();
}

function performWorkerAction(action: WorkerActionType): void {
  if (!selectedUnitId) return;

  const result = applyWorkerAction(session.getState(), selectedUnitId, action);
  if (!result.ok) return;

  session.setStateWithoutRefresh(result.state);
  for (const event of result.events) {
    if (event.type === 'improvement:started') {
      bus.emit('improvement:started', event.payload);
    } else if (event.type === 'road:started') {
      bus.emit('road:started', event.payload);
    } else {
      bus.emit('unit:destroyed', event.payload);
    }
  }

  renderLoop.setGameState(session.getState());
  updateHUD();

  if (result.workerConsumed || result.workerLost || !session.getState().units[selectedUnitId]) {
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
  const unit = session.getState().units[unitId];
  const cityName = session.getState().cities[cityId]?.name ?? cityId;
  const result = preach(session.getState(), unitId, cityId, bus);
  if (!result.ok) return;

  session.setStateWithoutRefresh(result.state);
  renderLoop.setGameState(session.getState());
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
  const targetCiv = session.getState().civilizations[targetCivId];
  if (!targetCiv || !isMajorCivOwner(targetCivId)) return;

  const cp = session.getState().currentPlayer;
  const alreadyAtWar = currentCiv().diplomacy?.atWarWith.includes(targetCivId) ?? false;
  if (alreadyAtWar) return;

  currentCiv().diplomacy = declareWar(currentCiv().diplomacy, targetCivId, session.getState().turn);
  targetCiv.diplomacy = declareWar(targetCiv.diplomacy, cp, session.getState().turn);
  bus.emit('diplomacy:war-declared', { attackerId: cp, defenderId: targetCivId, opponentKind: resolveOpponentKind(targetCivId) });
  session.setStateWithoutRefresh(applyOpportunisticWarPenaltyIfCrisisStruck(session.getState(), cp, targetCivId, bus));
}

function finalizePendingCityCaptureChoice(
  disposition: 'occupy' | 'raze',
  attackerBonus?: CivBonusEffect,
): void {
  if (!pendingCityCaptureChoice) return;

  const pending = pendingCityCaptureChoice;
  const cityBeforeResolution = session.getState().cities[pending.cityId];
  const previousOwner = cityBeforeResolution?.owner ?? '';
  const cityName = cityBeforeResolution?.name ?? pending.cityId;
  const beforeCapture = session.getState();
  const result = finalizePlayerCityAssaultChoice(session.getState(), pending, disposition, session.getState().turn, bus);

  pendingCityCaptureChoice = null;
  document.getElementById('city-capture-panel')?.remove();
  session.setStateWithoutRefresh(result.state);
  emitMajorCityCaptureEvents(
    beforeCapture,
    result,
    pending.cityId,
    session.getState().currentPlayer,
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

  renderLoop.setGameState(session.getState());
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
  const city = session.getState().cities[cityId];
  if (!city) return 'resolved';
  const attacker = session.getState().units[attackerId];
  if (!attacker || !canUnitOccupyCity(attacker)) return 'resolved';

  ensurePlayerWarState(city.owner);
  let attackerMultiplier: number | undefined;
  if (embarkedAssault) {
    const legality = getEmbarkedAssaultTarget(session.getState(), attackerId, city.position, { viewerId: session.getState().currentPlayer });
    if (!legality.ok || legality.targetType !== 'city') {
      showNotification('That coastal assault is no longer possible.', 'warning');
      return 'resolved';
    }
    attackerMultiplier = getAmphibiousAssaultMultiplier(session.getState(), attacker, city.position);
    const detached = detachCargoForEmbarkedAssault(session.getState(), attackerId);
    if (!detached.ok) return 'resolved';
    session.setStateWithoutRefresh(detached.state);
  }
  const begun = beginPlayerCityAssaultChoice(
    session.getState(),
    attackerId,
    cityId,
    bus,
    precedingCombat,
    attackerMultiplier,
  );
  session.setStateWithoutRefresh(begun.state);

  if (!begun.ok) {
    showNotification(
      begun.reason === 'repelled-by-city-defense'
        ? "Your attack was repelled by the city's defenses!"
        : 'The attack could not proceed.',
      'warning',
    );
    renderLoop.setGameState(session.getState());
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
  const initialAttacker = session.getState().units[attackerId];
  const targetCoord = parseHexKey(targetKey);
  const amphibiousAssault = Boolean(initialAttacker?.transportId);
  const legality = amphibiousAssault
    ? getEmbarkedAssaultTarget(session.getState(), attackerId, targetCoord, { viewerId: session.getState().currentPlayer })
    : canUnitAttackTarget(session.getState(), initialAttacker, targetCoord, { viewerId: session.getState().currentPlayer });
  // hasActed guard: enforce "no action remaining" at the execution layer, not just
  // the highlight layer (getAttackTargets). Prevents double-action if executeAttack
  // is ever called outside the normal tap → highlight → confirm flow.
  if (!initialAttacker || initialAttacker.hasActed || !legality.ok || legality.targetType !== 'unit') {
    showNotification('That target is no longer attackable.', 'warning');
    if (selectedUnitId) selectUnit(selectedUnitId);
    return;
  }

  const defenderId = legality.targetUnitId;
  const defender = session.getState().units[defenderId];
  if (!defender) return;

  let attacker = initialAttacker;
  if (amphibiousAssault) {
    const detached = detachCargoForEmbarkedAssault(session.getState(), attackerId);
    if (!detached.ok) {
      showNotification('That coastal assault is no longer possible.', 'warning');
      return;
    }
    session.setStateWithoutRefresh(detached.state);
    attacker = detached.attacker;
  }

  ensurePlayerWarState(defender.owner);

  const seed = deterministicCombatSeed(session.getState().gameId, session.getState().turn, attacker.id, defender.id);
  const attackerBonus = currentCivDef()?.bonusEffect;
  // Capture defender position before combat (defender may be removed from state after)
  const defenderPosition = { ...defender.position };
  // Capture route IDs before combat (units may be removed from state after)
  const attackerRouteId = attacker.committedToRouteId;
  const defenderRouteId = defender.committedToRouteId;
  const result = resolveCombat(
    attacker,
    session.getState().units[defenderId] ?? defender,
    session.getState().map,
    seed,
    buildCombatContextForDefender(session.getState(), attacker, defender, { amphibiousAssault }),
    resolveCombatEra(session.getState(), attacker, defender),
  );
  bus.emit('combat:resolved', {
    result,
    ...buildCombatPresentation(session.getState(), result, attacker, defender),
  });

  const applied = applyCombatOutcomeToState(session.getState(), result, seed);
  session.setStateWithoutRefresh(applied.state);
  session.setStateWithoutRefresh(recordCombatForCiv(session.getState(), session.getState().currentPlayer, defenderPosition));
  emitMinorCivQuestTransitions(bus, applied.questTransitions, session.getState());
  // Clean up trade routes for any committed caravans that died or were captured
  if (applied.attackerDefeated && attackerRouteId) {
    session.setStateWithoutRefresh(removeRouteForUnit(session.getState(), result.attackerId, bus, 'unit-died', attackerRouteId));
  } else if (applied.attackerCaptured && attackerRouteId) {
    session.setStateWithoutRefresh(removeRouteForUnit(session.getState(), result.attackerId, bus, 'unit-captured', attackerRouteId));
  }
  if (applied.defenderDefeated && defenderRouteId) {
    session.setStateWithoutRefresh(removeRouteForUnit(session.getState(), result.defenderId, bus, 'unit-died', defenderRouteId));
  } else if (applied.defenderCaptured && defenderRouteId) {
    session.setStateWithoutRefresh(removeRouteForUnit(session.getState(), result.defenderId, bus, 'unit-captured', defenderRouteId));
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

    const slayResult = recordBeastSlain(session.getState(), defender, attacker);
    session.setStateWithoutRefresh(slayResult.state);
    if (slayResult.slain) {
      bus.emit('beast:slain', slayResult.slain);
    }
    // Tier 3+ beasts use the slay ceremony (beast:slain listener); ceremony calls
    // maybeShowPendingHoardChoice via onContinue so the choice panel appears after
    // the ceremony is dismissed rather than racing with it.
    if (!slayResult.slain || BEAST_DEFINITIONS[slayResult.slain.beastId].tier < 3) {
      maybeShowPendingHoardChoice();
    }

    const destroyedCamp = applyCampDestructionAtTarget(session.getState(), session.getState().currentPlayer, defender.position, session.getState().turn);
    if (destroyedCamp.campId) {
      session.setStateWithoutRefresh(destroyedCamp.state);
      emitMinorCivQuestTransitions(bus, destroyedCamp.questTransitions, session.getState());
      showNotification(`Barbarian camp destroyed! +${destroyedCamp.reward} gold`, 'success');
      advisorSystem.resetMessage('treasurer_camp_reward');
      advisorSystem.check(session.getState());
      for (const mcId of Object.keys(session.getState().minorCivs)) {
        applyDiplomaticReaction(session.getState(), 'camp_destroyed_nearby', session.getState().currentPlayer, mcId);
      }
    }

    const cityAtTarget = Object.values(session.getState().cities).find(c => hexKey(c.position) === targetKey);
    if (cityAtTarget) {
      const occupancy = buildUnitOccupancy(session.getState().units);
      const remainingHostileDefenders = hasHostileUnitAtCoord(occupancy, cityAtTarget.position, session.getState().currentPlayer);
      if (!remainingHostileDefenders) {
        if (cityAtTarget.owner.startsWith('mc-')) {
          const conqueredCityName = cityAtTarget.name;
          const conquered = conquestMinorCiv(session.getState(), cityAtTarget.owner, session.getState().currentPlayer);
          session.setStateWithoutRefresh(conquered.state);
          emitMinorCivQuestTransitions(bus, conquered.transitions, session.getState());
          if (conquered.conquered) {
            bus.emit('minor-civ:destroyed', { minorCivId: cityAtTarget.owner, conquerorId: session.getState().currentPlayer });
          }
          showNotification(`${conqueredCityName} has been conquered!`, 'success');
        }
        if (!cityAtTarget.owner.startsWith('mc-') && cityAtTarget.owner !== session.getState().currentPlayer) {
          const assaultStatus = beginPlayerCityAssault(
            attackerId,
            cityAtTarget.id,
            attackerBonus,
            result,
            amphibiousAssault,
          );
          SFX.combat();
          renderLoop.setGameState(session.getState());
          updateHUD();
          refreshSelectedUnitAfterCombat();
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
  renderLoop.setGameState(session.getState());
  updateHUD();
  refreshSelectedUnitAfterCombat();
  renderLoop.animations.add('combat-flash', 400, { coord: attacker.position }, () => selectNextUnit());
}

function restAction(): void {
  if (!selectedUnitId) return;
  const unit = session.getState().units[selectedUnitId];
  if (!unit || !canHeal(unit)) return;

  session.getState().units[selectedUnitId] = restUnit(unit);
  showNotification(`${UNIT_DEFINITIONS[unit.type].name} is resting and will heal +15 HP next turn`, 'info');
  deselectUnit();
  renderLoop.setGameState(session.getState());
}

function visibleUnitEntriesAtKey(key: string): Array<[string, Unit]> {
  const viewerUnits = Object.values(session.getState().units).filter(u => u.owner === session.getState().currentPlayer && !u.transportId);
  return Object.entries(session.getState().units).filter(([, unit]) =>
    hexKey(unit.position) === key
    && canInspectUnitForViewer(session.getState(), session.getState().currentPlayer, unit.id)
    && (unit.owner === session.getState().currentPlayer || !isForestConcealedUnit(session.getState(), session.getState().currentPlayer, unit))
    && !isBeastConcealedFrom(unit, session.getState().map, viewerUnits)
  );
}

function visibleHostileUnitEntriesAtKey(key: string): Array<[string, Unit]> {
  return visibleUnitEntriesAtKey(key).filter(([, unit]) => unit.owner !== session.getState().currentPlayer);
}

function selectDefenderEntryAtKey(key: string): [string, Unit] | undefined {
  const hostileEntries = visibleHostileUnitEntriesAtKey(key);
  const defender = selectDefenderForAttack(hostileEntries.map(([, unit]) => unit), session.getState().map);
  if (!defender) return undefined;
  return hostileEntries.find(([id]) => id === defender.id);
}

function handleHexTap(rawCoord: HexCoord): void {
  if (pendingCityCaptureChoice) {
    return;
  }

  const coord = session.getState().map.wrapsHorizontally
    ? wrapHexCoord(rawCoord, session.getState().map.width)
    : rawCoord;

  if (pendingJourneyUnitId) {
    const unit = session.getState().units[pendingJourneyUnitId];
    if (unit) {
      const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
      const completedTechs = session.getState().civilizations[unit.owner]?.techState.completed ?? [];
      const path = findPath(unit.position, coord, session.getState().map, domain, { unit, completedTechs });
      if (!path || path.length < 2) {
        showNotification('No path to that destination.', 'warning');
      } else {
        session.setStateWithoutRefresh({
          ...session.getState(),
          units: {
            ...session.getState().units,
            [pendingJourneyUnitId]: { ...unit, automation: { mode: 'journey', destination: coord } },
          },
        });
        renderLoop.setGameState(session.getState());
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
      ? resolveAirStrike(session.getState(), pending.unitId, coord)
      : resolveReconMission(session.getState(), pending.unitId, coord);
    if (!result.ok) {
      showNotification('That air mission target is no longer legal.', 'warning');
      return;
    }
    pendingAirMission = null;
    session.setStateWithoutRefresh(result.state);
    renderLoop.setGameState(session.getState());
    refreshCurrentPlayerVisibility();
    updateHUD();
    if (pending.mission === 'recon') SFX.airRecon();
    else SFX.combat();
    selectUnit(pending.unitId);
    return;
  }

  if (!selectedUnitId) {
    const pirateSelection = resolvePirateHeadquartersSelection(session.getState(), session.getState().currentPlayer, coord);
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
        const result = unloadUnitFromTransport(session.getState(), transportId, cargoUnitId, coord);
        if (!result.ok) {
          showNotification(result.message, 'warning');
          SFX.error();
        } else {
          const tName = UNIT_DEFINITIONS[session.getState().units[transportId]?.type ?? 'transport']?.name ?? 'Transport';
          const cName = UNIT_DEFINITIONS[session.getState().units[cargoUnitId]?.type ?? 'warrior']?.name ?? 'Unit';
          clearUnloadState();
          session.setStateWithoutRefresh(result.state);
          renderLoop.setGameState(session.getState());
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
    if (handleFriendlyUnitStackTap(session.getState(), coord, selectedUnitId, {
      onSelectUnit: selectUnit,
      onOpenStackPicker: openUnitStackPicker,
    })) {
      return;
    }
  }

  if (selectedUnitId && !selectedUnitCanMoveToTappedHex && !selectedUnitCanAttackTappedHex) {
    const selectedUnit = session.getState().units[selectedUnitId];
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
        session.getState(),
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
        const presentation = getMinorCivPresentationForPlayer(session.getState(), session.getState().currentPlayer, enemyUnit.owner, 'City-State');
        ownerName = presentation.name;
        ownerColor = presentation.color;
      } else {
        const civ = session.getState().civilizations[enemyUnit.owner];
        ownerName = civ?.name ?? enemyUnit.owner;
        ownerColor = civ?.color ?? '#888';
      }

      const alwaysHostile = isAlwaysHostilePair(session.getState().currentPlayer, enemyUnit.owner);
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
    const unit = session.getState().units[selectedUnitId];
    if (!unit) return;

    // Check for enemy unit at target — show combat preview
    const defenderEntry = selectDefenderEntryAtKey(key);
    if (selectedUnitCanAttackTappedHex && defenderEntry) {
      const defender = defenderEntry[1];
      const amphibiousAssault = Boolean(unit.transportId);
      const previewAttacker = amphibiousAssault
        ? { ...unit, position: { ...session.getState().units[unit.transportId!].position }, transportId: undefined }
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
        session.getState().map,
        buildCombatContextForDefender(session.getState(), previewAttacker, defender, { amphibiousAssault }),
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
        const presentation = getMinorCivPresentationForPlayer(session.getState(), session.getState().currentPlayer, defender.owner, 'City-State');
        ownerName = presentation.name;
      } else {
        ownerName = session.getState().civilizations[defender.owner]?.name ?? defender.owner;
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
          const attacker = selectedUnitId ? session.getState().units[selectedUnitId] : undefined;
          const legality = attacker?.transportId
            ? getEmbarkedAssaultTarget(session.getState(), attacker.id, coord, { viewerId: session.getState().currentPlayer })
            : canUnitAttackTarget(session.getState(), attacker, coord, { viewerId: session.getState().currentPlayer });
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
      const tapIntent = resolveSelectedUnitTapIntent(session.getState(), selectedUnitId, coord, movementRange);
      if (tapIntent.kind === 'assault-city') {
        const attackerUnit = session.getState().units[selectedUnitId];
        const targetCity = session.getState().cities[tapIntent.cityId];
        const ownerCiv = targetCity ? session.getState().civilizations[targetCity.owner] : undefined;
        if (!attackerUnit || !targetCity || !ownerCiv) return;

        const attackerMultiplier = tapIntent.embarkedAssault
          ? getAmphibiousAssaultMultiplier(session.getState(), attackerUnit, targetCity.position)
          : undefined;
        const effectiveAttacker = tapIntent.embarkedAssault && attackerUnit.transportId
          ? { ...attackerUnit, position: { ...session.getState().units[attackerUnit.transportId].position }, transportId: undefined }
          : attackerUnit;
        const strengths = calculateCityAssaultStrengths(effectiveAttacker, targetCity, ownerCiv, session.getState().map, { attackerMultiplier });
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
            renderLoop.setGameState(session.getState());
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
        const city = session.getState().cities[tapIntent.cityId];
        const defender = session.getState().civilizations[tapIntent.defenderId];
        createForeignCityEntryPanel(uiLayer, {
          cityName: city?.name ?? 'this city',
          defenderName: defender?.name ?? tapIntent.defenderId,
          onConfirm: () => {
            const begun = beginConfirmedForeignCityEntry(session.getState(), selectedId, tapIntent.cityId, bus);
            session.setStateWithoutRefresh(begun.state);
            if (!begun.ok) {
              showNotification(
                begun.reason === 'repelled-by-city-defense'
                  ? "Your attack was repelled by the city's defenses!"
                  : 'The attack could not proceed.',
                'warning',
              );
              renderLoop.setGameState(session.getState());
              updateHUD();
              return;
            }
            pendingCityCaptureChoice = begun.pending;
            const captureCity = session.getState().cities[tapIntent.cityId];
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
            renderLoop.setGameState(session.getState());
            updateHUD();
          },
          onCancel: () => selectUnit(selectedId),
        });
        return;
      }

      if (tapIntent.kind === 'confirm-war-minor-civ') {
        const selectedId = selectedUnitId;
        const city = session.getState().cities[tapIntent.cityId];
        const minor = session.getState().minorCivs[tapIntent.minorCivId];
        const definition = MINOR_CIV_DEFINITIONS.find(candidate => candidate.id === minor?.definitionId);
        createForeignCityEntryPanel(uiLayer, {
          cityName: city?.name ?? 'this city-state',
          defenderName: definition?.name ?? 'the city-state',
          onConfirm: () => {
            const war = setMinorCivWarState(session.getState(), session.getState().currentPlayer, tapIntent.minorCivId, true);
            if (!war.ok) return;
            session.setStateWithoutRefresh(war.state);
            emitMinorCivQuestTransitions(bus, war.transitions, session.getState());
            executeMinorCivConquest(selectedId, coord, tapIntent.minorCivId, tapIntent.cityId);
          },
          onCancel: () => selectUnit(selectedId),
        });
        return;
      }

      if (tapIntent.kind === 'assault-minor-civ') {
        const mc = session.getState().minorCivs[tapIntent.minorCivId];
        if (mc && !mc.isDestroyed) {
          executeMinorCivConquest(selectedUnitId, coord, tapIntent.minorCivId, tapIntent.cityId);
        } else {
          SFX.tap();
          renderLoop.setGameState(session.getState());
          updateHUD();
          setTimeout(() => selectNextUnit(), 400);
        }
        return;
      }

      // Move unit
      if (isWorkerBusy(session.getState(), selectedUnitId)) {
        const selectedId = selectedUnitId;
        const task = session.getState().units[selectedId]?.workerTask;
        const taskTile = task ? session.getState().map.tiles[hexKey(task.coord)] : undefined;
        const isRoadTask = task?.action === 'build_road';
        createWorkerTaskWarningPanel(uiLayer, {
          improvementName: task
            ? (isRoadTask ? 'Road' : getImprovementDisplayName(task.action as ImprovementType))
            : 'Improvement',
          turnsLeft: (isRoadTask ? taskTile?.roadTurnsLeft : taskTile?.improvementTurnsLeft) ?? 1,
          onCancel: () => selectUnit(selectedId),
          onConfirm: () => {
            executeAnimatedUnitMove(selectedId, () => confirmBusyWorkerMove(session.getState(), selectedId, coord, {
              actor: 'player',
              civId: session.getState().currentPlayer,
              bus,
            }));
            SFX.tap();
            renderLoop.setGameState(session.getState());
            updateHUD();
          },
        });
        return;
      }

      executeAnimatedUnitMove(selectedUnitId, () => executeUnitMove(session.getState(), selectedUnitId!, coord, {
        actor: 'player',
        civId: session.getState().currentPlayer,
        bus,
      }));
      SFX.tap();
    }

    renderLoop.setGameState(session.getState());
    updateHUD();
    return;
  }

  // Check if tapping a player-owned city hex
  const cityAtHex = Object.values(session.getState().cities).find(
    c => c.owner === session.getState().currentPlayer && hexKey(c.position) === key,
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

  const wonderAtlasIntent = resolveWonderAtlasIntent(session.getState(), session.getState().currentPlayer, coord);
  if (wonderAtlasIntent.type === 'open-atlas') {
    deselectUnit();
    const audioFocus = resolveNaturalWonderAudioFocus(session.getState(), session.getState().currentPlayer, coord);
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
  const audioFocus = resolveNaturalWonderAudioFocus(session.getState(), session.getState().currentPlayer, coord);
  if (audioFocus) void audio.startNaturalWonderMapFocusAmbient(audioFocus.wonderId);
  const panel = createTerritoryInspectionPanel(session.getState(), coord, session.getState().currentPlayer, () => {
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
  const coord = session.getState().map.wrapsHorizontally
    ? wrapHexCoord(rawCoord, session.getState().map.width)
    : rawCoord;
  const tile = session.getState().map.tiles[hexKey(coord)];
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

  const unitAtHex = Object.values(session.getState().units).find(unit =>
    unit.owner === session.getState().currentPlayer
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
  const state = session.getState();
  if (!state.gameOver) return false;
  const winnerCiv = state.winner
    ? state.civilizations[state.winner]
    : undefined;
  const winnerName = winnerCiv?.name ?? state.winner ?? '';
  const outcome = state.winner === state.currentPlayer ? 'victory' : 'defeat';
  setBlockingOverlay('victory');
  showVictoryPanel(uiLayer, {
    winnerName,
    victoryType: outcome === 'victory' ? 'Domination Victory' : 'Campaign Defeat',
    outcome,
    reason: state.gameOverReason ?? 'domination',
    turn: state.turn,
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
    .filter(move => move.viewerId === session.getState().currentPlayer)
    .slice(0, 6);
  for (const { unit, visibleSegments } of visibleMoves) {
    for (const path of visibleSegments.filter(segment => segment.length >= 2)) {
      if (roundPresentationGate.isSuppressed() || session.getState().currentPlayer !== visibleMoves[0]?.viewerId) return;
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
  const civ = session.getState().civilizations[civId];
  const cities = Object.values(session.getState().cities).filter(city => city.owner === civId);
  bus.emit('currentPlayer:changed-after-handoff', {
    civId,
    civType: civ?.civType ?? civId,
    era: session.getState().era,
    atWarCount: civ?.diplomacy?.atWarWith?.length ?? 0,
    unrestCityCount: cities.filter(city => city.unrestLevel > 0).length,
    nearDefeat: civ?.nearDefeat ?? false,
    inBeastTerritory: isCivUnitInBeastTerritory(session.getState(), civId),
  });
}

/** Opens due Exploit warnings only after the human viewer's identity has been confirmed. */
function beginNetworkPlansForCurrentViewer(): void {
  const viewerId = session.getState().currentPlayer;
  if (!session.getState().civilizations[viewerId]?.isHuman) return;
  const result = beginNetworkPlansForVictimTurn(session.getState(), viewerId);
  session.setStateWithoutRefresh(result.state);
  for (const warning of result.warnings) {
    const plan = Object.values(session.getState().autonomyByCiv ?? {})
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
  renderLoop.setGameState(session.getState());
  updateHUD();
  scanBeastSightings();
  maybeShowPendingHoardChoice();
  roundPresentationGate.resume();
  audio.setMasterVolume(currentMasterVolume);
  setBlockingOverlay(null);
  emitCurrentPlayerAudioSnapshot(nextSlotId);
  if (handleVictoryIfNeeded()) return;
  showRequiredChoicesIfNeeded();
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
  const preSimulationState = session.getState();
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
          session.getState(),
          resolvedNextSlotId,
          summary,
        );
        session.setStateWithoutRefresh(acknowledgement.state);
        beginNetworkPlansForCurrentViewer();
        let acknowledgementFailed = false;
        try {
          await autoSave(session.getState());
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
      await autoSave(session.getState());
      controller.setReady(session.getState());
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
      session.setStateWithoutRefresh(resolveHotSeatPostSimulation(preSimulationState, previousHumanId).state);
      controller.remove();
      handleVictoryIfNeeded();
      return;
    }
    session.setStateWithoutRefresh(applyPendingChallengeForCiv(
      { ...preSimulationState, currentPlayer: resolvedNextSlotId },
      resolvedNextSlotId,
    ));
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
      session.setStateWithoutRefresh(state);
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
  if (session.getState().gameOver) return;
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

    const hotSeat = session.getState().hotSeat;

    if (hotSeat) {
      await beginHotSeatHandoff(
        hotSeat,
        isActiveHumanRoundComplete(session.getState(), session.getState().currentPlayer),
      );
    } else {
      // --- Solo Mode ---
      const roundTurn = session.getState().turn;
      const result = runCurrentCompletedRound(session.getState());
      if (!result.ok) throw result.error;
      session.setStateWithoutRefresh(result.state);
      beginNetworkPlansForCurrentViewer();
      const soloMoves = captureAIMoves(() => {
        notificationDelivery.withHappenedTurn(roundTurn, () => {
          result.events.commitTo(bus);
        });
      });

      if (handleVictoryIfNeeded()) return;

      renderLoop.setGameState(session.getState());
      await replayAIMoves(soloMoves);
      updateHUD();
      showRequiredChoicesIfNeeded();

      showNotification(`Turn ${session.getState().turn}`, 'info');
      advisorSystem.check(session.getState());

      await autoSave(session.getState());
      bus.emit('game:saved', { turn: session.getState().turn });
    }
  } catch (err) {
    console.error('endTurn error:', err);
    showNotification('Error processing turn!', 'warning');
  }
}

function centerOnCurrentPlayer(): void {
  const units = Object.values(session.getState().units).filter(u => u.owner === session.getState().currentPlayer);
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
  const captorEsp = session.getState().espionage?.[session.getState().currentPlayer];
  const spy = session.getState().espionage?.[spyOwner]?.spies[spyId];
  if (!captorEsp || !spy) return;
  const spyOwnerName = session.getState().civilizations[spyOwner]?.name ?? spyOwner;

  // D1: always reveal true identity to captor regardless of disguise
  const captureMessage = `You have captured ${spy.name}, a ${spy.unitType} belonging to ${spyOwnerName}.`;

  // infiltrated spies are inside the city (distance 0); otherwise use boundary penalty
  const distanceToCity = spy.infiltrationCityId ? 0 : 1;
  const relPenalty = getSpyCaptureRelationshipPenalty(distanceToCity);

  createPersistentChoiceNotification(captureMessage, [
    {
      label: `Expel (${relPenalty} relations)`,
      onClick: () => {
        const updatedOwnerEsp = expelSpy(session.getState().espionage![spyOwner], spyId, 15);
        const capital = getCapitalCity(session.getState(), spyOwner);
        if (capital) {
          const newUnit = createUnit(spy.unitType, spyOwner, capital.position, session.getState().idCounters);
          session.setStateWithoutRefresh({
            ...session.getState(),
            units: { ...session.getState().units, [newUnit.id]: newUnit },
            civilizations: {
              ...session.getState().civilizations,
              [spyOwner]: {
                ...session.getState().civilizations[spyOwner],
                units: [...session.getState().civilizations[spyOwner].units, newUnit.id],
              },
            },
          });
          const { [spyId]: _old, ...rest } = updatedOwnerEsp.spies;
          session.setStateWithoutRefresh({
            ...session.getState(),
            espionage: {
              ...session.getState().espionage,
              [spyOwner]: {
                ...updatedOwnerEsp,
                spies: { ...rest, [newUnit.id]: { ...updatedOwnerEsp.spies[spyId]!, id: newUnit.id } },
              },
            },
          });
        } else {
          session.setStateWithoutRefresh({ ...session.getState(), espionage: { ...session.getState().espionage, [spyOwner]: updatedOwnerEsp } });
        }
        // Bilateral: captor's view of spy owner AND spy owner's view of captor
        const captorId = session.getState().currentPlayer;
        session.setStateWithoutRefresh({
          ...session.getState(),
          civilizations: {
            ...session.getState().civilizations,
            [captorId]: {
              ...session.getState().civilizations[captorId],
              diplomacy: modifyRelationship(
                session.getState().civilizations[captorId].diplomacy, spyOwner, relPenalty,
              ),
            },
            [spyOwner]: {
              ...session.getState().civilizations[spyOwner],
              diplomacy: modifyRelationship(
                session.getState().civilizations[spyOwner].diplomacy, captorId, relPenalty,
              ),
            },
          },
        });
        showNotification(`${spy.name} expelled. Will return to their capital after 15 turns.`, 'info');
        renderLoop.setGameState(session.getState());
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
                const captorId = session.getState().currentPlayer;
                session.setStateWithoutRefresh({
                  ...session.getState(),
                  espionage: {
                    ...session.getState().espionage,
                    [spyOwner]: executeSpy(session.getState().espionage![spyOwner], spyId),
                  },
                  // Bilateral: captor's view AND spy owner's view
                  civilizations: {
                    ...session.getState().civilizations,
                    [captorId]: {
                      ...session.getState().civilizations[captorId],
                      diplomacy: modifyRelationship(
                        session.getState().civilizations[captorId].diplomacy, spyOwner, relPenalty * 2,
                      ),
                    },
                    [spyOwner]: {
                      ...session.getState().civilizations[spyOwner],
                      diplomacy: modifyRelationship(
                        session.getState().civilizations[spyOwner].diplomacy, captorId, relPenalty * 2,
                      ),
                    },
                  },
                });
                bus.emit('espionage:spy-executed', {
                  executingCivId: captorId, spyOwner, spyId, spyName: spy.name,
                });
                showNotification(`${spy.name} has been executed.`, 'warning');
                renderLoop.setGameState(session.getState());
              },
            },
          ],
        );
      },
    },
    {
      label: 'Interrogate (4 turns)',
      onClick: () => {
        const ownerEsp = session.getState().espionage![spyOwner];
        session.setStateWithoutRefresh({
          ...session.getState(),
          espionage: {
            ...session.getState().espionage,
            [session.getState().currentPlayer]: startInterrogation(captorEsp, spyId, spyOwner),
            // Set spy status to 'interrogated' on the spy owner's record
            [spyOwner]: {
              ...ownerEsp,
              spies: {
                ...ownerEsp.spies,
                [spyId]: { ...ownerEsp.spies[spyId]!, status: 'interrogated' as const },
              },
            },
          },
        });
        showNotification(`${spy.name} is being interrogated. Check the Intel panel for results.`, 'info');
        renderLoop.setGameState(session.getState());
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
  if (civId === session.getState().currentPlayer) SFX.research();
});

bus.on('city:grew', ({ cityId, newPopulation }) => {
  const city = session.getState().cities[cityId];
  if (!city) return;
  appendToCivLog(city.owner, `${city.name} grew to ${newPopulation} population!`, 'success');
});

bus.on('city:maturity-upgraded', ({ cityId, current }) => {
  const city = session.getState().cities[cityId];
  if (!city) return;
  const label = `${current[0].toUpperCase()}${current.slice(1)}`;
  appendToCivLog(city.owner, `${city.name} became a ${label}. New city slots unlocked.`, 'success');
});

bus.on('city:building-complete', ({ cityId, buildingId }) => {
  const city = session.getState().cities[cityId];
  if (!city) return;
  const bldg = BUILDINGS[buildingId];
  const buildingName = bldg?.name ?? buildingId;
  appendToCivLog(city.owner, `${city.name}: ${buildingName} completed!`, 'success');
  if (bldg?.nationalProject) {
    SFX.nationalProjectBuilt();
  }
});

bus.on('city:national-project-expired', ({ civId, cityId, buildingId }) => {
  const city = session.getState().cities[cityId];
  const bldg = BUILDINGS[buildingId];
  if (!bldg || !city) return;
  const msg = document.createTextNode(
    `${city.name}: ${bldg.name} has expired — your civilization has grown beyond this era's institutions.`
  );
  appendToCivLog(civId, msg.textContent ?? '', 'warning');
  SFX.nationalProjectExpired();
});

bus.on('city:production-item-dropped', event => routeDroppedProductionItem(session.getState(), event, appendToCivLog));

bus.on('city:cyber-drained', ({ cityName, drainerOwner, goldLost, blocked, victimCivId }) => {
  const drainerName = session.getState().civilizations[drainerOwner]?.name ?? drainerOwner;
  const victimName = session.getState().civilizations[victimCivId]?.name ?? victimCivId;
  if (blocked) {
    appendToCivLog(victimCivId, `Cyber Defense Center blocked an intrusion in ${cityName}.`, 'success');
    appendToCivLog(drainerOwner, `Cyber attack on ${cityName} was blocked by ${victimName}'s Cyber Defense Center.`, 'warning');
    return;
  }
  appendToCivLog(victimCivId, `Cyber attack: ${cityName} lost ${goldLost} gold (${drainerName} cyber unit).`, 'warning');
  appendToCivLog(drainerOwner, `Cyber unit stole ${goldLost} gold from ${victimName}'s ${cityName}.`, 'success');
});

bus.on('network:exploit-warning', ({ planId, victimCivId, cityId }) => {
  const warning = getNetworkWarningForViewer(session.getState(), victimCivId, planId);
  const city = session.getState().cities[cityId];
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
  const city = session.getState().cities[cityId];
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
  advisorSystem.check(session.getState());
  appendToCivLog(civId, message, outcome === 'ambush' || outcome === 'illness' ? 'warning' : 'success');
});

bus.on('wonder:discovered', event => {
  const wonderDef = getWonderDefinition(event.wonderId);
  if (!wonderDef) return;
  const message = event.isFirstDiscoverer
    ? `Discovered ${wonderDef.name}! +${wonderDef.discoveryBonus.amount} ${wonderDef.discoveryBonus.type}`
    : `Found ${wonderDef.name}!`;
  appendToCivLog(event.civId, message, event.isFirstDiscoverer ? 'success' : 'info');

  const revealItem = buildWonderDiscoveryRevealItem(session.getState(), session.getState().currentPlayer, event);
  if (revealItem) {
    wonderDiscoveryQueue?.enqueue(revealItem);
    if (!deferWonderDiscoveryRevealUntilMoveSettles) {
      wonderDiscoveryQueue?.notifyActionSettled();
    }
  }
});

bus.on('wonder:legendary-ready', ({ civId, cityId, wonderId }) => {
  routeLegendaryWonder(session.getState(), { type: 'wonder:legendary-ready', civId, cityId, wonderId }, appendToCivLog);
});

bus.on('wonder:legendary-availability', event => {
  routeLegendaryWonder(session.getState(), { type: 'wonder:legendary-availability', ...event }, appendToCivLog);
});

bus.on('wonder:legendary-completed', ({ civId, cityId, wonderId, turnCompleted }) => {
  const event = { civId, cityId, wonderId, turnCompleted };
  routeLegendaryWonder(session.getState(), { type: 'wonder:legendary-completed', ...event }, appendToCivLog);
  const ceremonyItem = buildLegendaryWonderCompletionCeremonyItem(session.getState(), event);
  if (ceremonyItem) {
    legendaryCompletionQueue?.enqueue(ceremonyItem);
    legendaryCompletionQueue?.notifyActionSettled();
  }
});

bus.on('wonder:legendary-lost', ({ civId, cityId, wonderId, goldRefund, transferableProduction }) => {
  routeLegendaryWonder(
    session.getState(),
    { type: 'wonder:legendary-lost', civId, cityId, wonderId, goldRefund, transferableProduction },
    appendToCivLog,
  );
});

bus.on('wonder:legendary-race-revealed', ({ observerId, civId, cityId, wonderId }) => {
  routeLegendaryWonder(
    session.getState(),
    { type: 'wonder:legendary-race-revealed', observerId, civId, cityId, wonderId },
    appendToCivLog,
  );
});

bus.on('diplomacy:war-declared', ({ attackerId, defenderId }) => {
  routeWarDeclared(session.getState(), attackerId, defenderId, appendToCivLog);
});

bus.on('diplomacy:treaty-proposed', event => {
  routeTreatyProposed(session.getState(), event, appendToCivLog);
});

bus.on('civilization:first-contact', ({ civA, civB }) => {
  // #551: routeFirstContact's sink is the delivery contract, which already
  // queues to pendingEvents for a non-active hot-seat recipient -- the old
  // unconditional queueFirstContactPendingEvents call was a second, always-on
  // queue that leaked stale growth into solo saves (which never drain it).
  routeFirstContact(session.getState(), civA, civB, appendToCivLog);
});

bus.on('diplomacy:peace-requested', ({ fromCivId, toCivId }) => {
  // #551: routePeaceRequested already delivers to toCivId via appendToCivLog
  // (the delivery contract) -- the old extra showNotification here duplicated
  // the message AND leaked it to whoever currentPlayer was at emit time
  // instead of the actual recipient.
  routePeaceRequested(session.getState(), fromCivId, toCivId, appendToCivLog);
});

bus.on('diplomacy:peace-made', ({ civA, civB }) => {
  routePeaceMade(session.getState(), civA, civB, appendToCivLog);
});

// viewer-scoped by design: advisors run for the active player only (#551).
bus.on('advisor:message', ({ advisor, message, icon }) => {
  showNotification(`${icon} ${message}`, 'info');
});

// Per-civ dedup: each civ sees a "raiders spotted!" entry only the first time
// its visibility covers any raider from a given camp.
const notifiedBarbarianCampsPerCiv = new Map<string, Set<string>>();

bus.on('combat:resolved', event => {
  handleCombatResolvedEvent(session.getState(), event, {
    isPresentationSuppressed: () => roundPresentationGate.isSuppressed(),
    applyVisual: result => renderLoop.applyCombatVisual(result),
    appendNotification: appendToCivLog,
  });
});

bus.on('trade:route-delivered', ({ unitId }) => {
  renderLoop.applyDeliveryVisual(unitId);
});

bus.on('combat:reward-earned', ({ reward }) => {
  routeCombatRewardEarned(session.getState(), reward, appendToCivLog);
});

bus.on('territory:tile-flipped', event => {
  routeTerritoryTileFlipped(session.getState(), { type: 'territory:tile-flipped', ...event }, appendToCivLog);
});

bus.on('barbarian:spawned', ({ campId, unitId }) => {
  const unit = session.getState().units[unitId];
  if (!unit) return;
  routeBarbarianSpawned(
    session.getState(),
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
  const city = session.getState().cities[cityId];
  if (!city) return;
  if (!session.getState().civilizations[city.owner]?.isHuman) return;
  appendToCivLog(city.owner, `Barbarians attack ${city.name}! (−${hpLost} HP)`, 'warning');
});

bus.on('barbarian:city-destroyed', ({ cityId, ownerId }) => {
  if (!session.getState().civilizations[ownerId]?.isHuman) return;
  const cityName = session.getState().cities[cityId]?.name ?? 'A city';
  appendToCivLog(ownerId, `${cityName} was destroyed by barbarian raiders!`, 'warning');
});

// A walled, ungarrisoned city fighting back against a besieger (#522) -- covers BOTH
// the barbarian (turn-manager.ts) and pirate (pirate-system.ts) counter-fire call
// sites, since both emit this same shared event with their respective 'source' value.
bus.on('city:counter-fire', ({ cityId, source, damage, attackerDied }) => {
  const city = session.getState().cities[cityId];
  if (!city) return;
  if (!session.getState().civilizations[city.owner]?.isHuman) return;
  const raiderLabel = source === 'barbarian' ? 'raider' : 'ship';
  const message = attackerDied
    ? `${city.name}'s defenses destroyed a ${source === 'barbarian' ? 'barbarian raider' : 'pirate ship'}!`
    : `${city.name}'s walls fought back, damaging a ${raiderLabel} (−${damage} HP)!`;
  appendToCivLog(city.owner, message, attackerDied ? 'success' : 'info');
});

// Pirate-faction naval siege (#522) mirror of the barbarian handler above.
bus.on('pirate:city-destroyed', ({ cityId, ownerId }) => {
  if (!session.getState().civilizations[ownerId]?.isHuman) return;
  const cityName = session.getState().cities[cityId]?.name ?? 'A coastal city';
  appendToCivLog(ownerId, `${cityName} was razed by pirates!`, 'warning');
});

// A sacked city survives the raid at 1 HP — phrased distinctly from outright
// destruction so a recoverable loss is never mistaken for a permanent one. Both
// barbarians (turn-manager.ts) and pirates (pirate-system.ts, #522) route through
// this shared event with their respective 'source' value.
bus.on('city:sacked', ({ cityId, source, goldLost }) => {
  const city = session.getState().cities[cityId];
  if (!city) return;
  if (!session.getState().civilizations[city.owner]?.isHuman) return;
  const raiders = source === 'barbarian' ? 'Barbarian raiders' : 'Pirates';
  appendToCivLog(
    city.owner,
    `${raiders} have sacked ${city.name}! The city survives at 1 HP, but ${goldLost} gold was looted.`,
    'warning',
  );
});

bus.on('beast:awakened', ({ beastId, position }) => {
  const def = BEAST_DEFINITIONS[beastId];
  for (const [civId, civ] of Object.entries(session.getState().civilizations)) {
    if (!civ.visibility || getVisibility(civ.visibility, position) === 'unexplored') continue;
    appendToCivLog(civId, def.awakeningFlavor, 'warning', { kind: 'map', coord: position, label: `${def.name} lair` });
  }
});

bus.on('beast:slain', ({ beastId, lairId, slayerCivId, goldAwarded }) => {
  const def = BEAST_DEFINITIONS[beastId];
  const slayerName = session.getState().civilizations[slayerCivId]?.name ?? slayerCivId;
  const isApex = def.tier >= 4;
  const isChoiceTier = def.tier >= 2 && !isApex;
  for (const civId of Object.keys(session.getState().civilizations)) {
    const slayerMsg = isApex
      ? `Your forces have slain the ${def.name}! The apex hoard is yours — gold, lore, trophy, and legend.`
      : isChoiceTier
        ? `Your forces have slain the ${def.name}! Choose your reward.`
        : `Your forces have slain the ${def.name}! Hoard claimed: +${goldAwarded} gold.`;
    const message = civId === slayerCivId ? slayerMsg : `${slayerName} has slain the ${def.name}!`;
    appendToCivLog(civId, message, civId === slayerCivId ? 'success' : 'info');
  }
  if (slayerCivId === session.getState().currentPlayer) {
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
        const preview = getHoardChoicePreview(session.getState(), lairId);
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
  const beasts = session.getState().beasts;
  const lair = beasts ? Object.values(beasts.lairs).find(l => l.beastId === beastId) : undefined;
  const target = lair ? { kind: 'map' as const, coord: lair.position, label: def.name } : undefined;
  appendToCivLog(civId, def.sightingFlavor, 'info', target);
  if (civId === session.getState().currentPlayer) {
    showBeastSightingBanner(uiLayer, {
      name: def.name,
      flavor: def.sightingFlavor,
      unitType: def.unitType,
      onContinue: () => {},
      onOpenBestiary: () => openBestiary(),
    });
  }
});

registerMinorCivNotificationListeners(bus, () => session.getState(), { appendToCivLog });

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
  const humanCivIds = Object.entries(session.getState().civilizations)
    .filter(([, civ]) => civ.isHuman)
    .map(([civId]) => civId);
  routeEraAdvanced(era, humanCivIds, appendToCivLog);
});

bus.on('civilization:era-advanced', ({ civId, era }) => {
  const civ = session.getState().civilizations[civId];
  if (!civ?.isHuman) return;
  appendToCivLog(civId, `${civ.name} has entered Era ${era}. Your technology now sets your civilization's era.`, 'success');
  if (civId === session.getState().currentPlayer) SFX.notification();
});

bus.on('faction:unrest-started', event => {
  routeFactionTransition(session.getState(), { type: 'faction:unrest-started', ...event }, appendFactionNotice);
});

bus.on('faction:revolt-started', event => {
  routeFactionTransition(session.getState(), { type: 'faction:revolt-started', ...event }, appendFactionNotice);
});

bus.on('faction:unrest-resolved', event => {
  routeFactionTransition(session.getState(), { type: 'faction:unrest-resolved', ...event }, appendFactionNotice);
});

bus.on('faction:concession-made', event => {
  routeFactionTransition(session.getState(), { type: 'faction:concession-made', ...event }, appendFactionNotice);
});

bus.on('faction:breakaway-started', event => {
  routeFactionTransition(session.getState(), { type: 'faction:breakaway-started', ...event }, appendFactionNotice);
});

bus.on('faction:breakaway-established', event => {
  routeFactionTransition(session.getState(), { type: 'faction:breakaway-established', ...event }, appendFactionNotice);
});

bus.on('faction:critical-status', event => {
  routeFactionTransition(session.getState(), { type: 'faction:critical-status', ...event }, appendFactionNotice);
});

bus.on('crisis:started', event => {
  routeCrisisStarted(session.getState(), event, appendToCivLog);
  routeWorldPressureCrisisStarted(session.getState(), event, appendToCivLog);
});

bus.on('religion:founded', event => {
  routeReligionFounded(session.getState(), event, appendToCivLog);
});

bus.on('religion:city-converted', event => {
  routeReligionCityConverted(session.getState(), event, appendToCivLog);
});

bus.on('religion:loyalty-warning', event => {
  routeLoyaltyWarning(session.getState(), event, appendToCivLog);
});

bus.on('religion:city-defected', event => {
  routeCityDefected(session.getState(), event, appendToCivLog);
});

bus.on('crisis:spread', event => {
  routeCrisisSpread(session.getState(), event, appendToCivLog);
});

bus.on('crisis:escalated', event => {
  routeCrisisEscalated(session.getState(), event, appendToCivLog);
});

bus.on('crisis:resolved', event => {
  routeCrisisResolved(session.getState(), event, appendToCivLog);
  routeWorldPressureCrisisResolved(session.getState(), event, appendToCivLog);
});

bus.on('crisis:foe-hunted-by-ally', event => {
  routeCrisisFoeHuntedByAlly(session.getState(), event, appendToCivLog);
});

bus.on('crisis:aid-sent', event => {
  routeCrisisAidSent(session.getState(), event, appendToCivLog);
});

bus.on('diplomacy:opportunistic-war', event => {
  routeOpportunisticWar(session.getState(), event, appendToCivLog);
});

bus.on('espionage:sabotage-relief-discovered', event => {
  routeSabotageReliefDiscovered(session.getState(), event, appendToCivLog);
});

bus.on('economy:treasury-strain', event => {
  // #551: routeEconomyTreasuryStrain already delivers to event.civId via the
  // delivery contract; the old extra showNotification duplicated the message
  // and leaked it to whoever currentPlayer was at emit time.
  routeEconomyTreasuryStrain(session.getState(), event, appendToCivLog);
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
  const spy = session.getState().espionage?.[spyOwner]?.spies[spyId];
  const city = session.getState().cities[cityId];
  const captor = session.getState().civilizations[capturingCivId]?.name ?? capturingCivId;
  appendToCivLog(
    spyOwner,
    `${spy?.name ?? 'Your spy'} was caught by ${captor} trying to infiltrate ${city?.name ?? 'an enemy city'}!`,
    'warning',
  );
  // Captor side: show verdict choice only when the human captor is currently active
  if (capturingCivId === session.getState().currentPlayer) {
    showEspionageCaptureChoice(spyId, spyOwner);
  }
});

// Show verdict choice when human player captures a spy during a mission
bus.on('espionage:spy-captured', ({ capturingCivId, spyOwner, spyId }) => {
  if (capturingCivId === session.getState().currentPlayer) {
    showEspionageCaptureChoice(spyId, spyOwner);
  }
  // Spy owner always gets a log entry, regardless of who is "current"
  const spy = session.getState().espionage?.[spyOwner]?.spies[spyId];
  const captorName = session.getState().civilizations[capturingCivId]?.name ?? capturingCivId;
  appendToCivLog(spyOwner, `${spy?.name ?? 'Your spy'} was captured by ${captorName}!`, 'warning');
});

// Notify the spy's owner when they are executed by an AI or human captor
bus.on('espionage:spy-executed', ({ executingCivId, spyOwner, spyName }) => {
  appendToCivLog(
    spyOwner,
    `${spyName} was executed by ${session.getState().civilizations[executingCivId]?.name ?? 'an enemy'}.`,
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
  const unit = session.getState().units[unitId];
  if (!unit) return;
  const type = UNIT_DEFINITIONS[unit.type]?.name ?? unit.type;
  const msg = `Your ${type} was blocked and stopped at (${position.q}, ${position.r}).`;
  appendToCivLog(unit.owner, msg, 'warning');
});

bus.on('espionage:spy-expired', ({ civId, spyName, unitType }) => {
  appendToCivLog(civId, `${spyName}'s network dissolved — ${unitType} era ended. No diplomatic penalty.`, 'info');
});

bus.on('espionage:spy-auto-exfiltrated', ({ civId, cityId }) => {
  const city = session.getState().cities[cityId];
  appendToCivLog(civId, `Your spy was auto-exfiltrated from ${city?.name ?? 'a city'} after it changed hands.`, 'info');
});

bus.on('espionage:city-flipped', event => {
  routeCityFlipped(session.getState(), event, appendToCivLog);
});

bus.on('trade:route-created', ({ route }) => {
  const ownerCity = session.getState().cities[route.fromCityId];
  const toCity = session.getState().cities[route.toCityId];
  if (!ownerCity) return;
  const goldPerTurn = getEffectiveGoldPerTurn(route, getRouteTechGoldBonus(session.getState(), route));
  appendToCivLog(ownerCity.owner, `Trade route to ${toCity?.name ?? route.toCityId} established (+${goldPerTurn} gold/turn)`, 'success');
});

bus.on('trade:route-ended', ({ fromCityId, toCityId, reason }) => {
  const ownerCity = session.getState().cities[fromCityId];
  const toCity = session.getState().cities[toCityId];
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
  if (toCity && toCity.owner !== ownerCity.owner && session.getState().civilizations[toCity.owner]?.isHuman) {
    appendToCivLog(toCity.owner, `Trade route from ${ownerCity.name} ended: ${reasonText[reason] ?? reason}`, 'warning');
  }
});

// --- Initialization ---
async function init(): Promise<void> {
  await registerConquestoriaServiceWorker();
  await initializeDesktopMenu();

  createUI();
  persistedSettings = await loadSettings();

  if (import.meta.env.MODE === 'e2e') {
    // Browser tests must target the same live camera transform as player input;
    // exposing only viewport copies keeps game state and camera internals private.
    window.__CONQUESTORIA_E2E_GET_VISIBLE_HEX_COPIES__ = coord => getVisibleHexViewportCopies(
      session.getState(),
      renderLoop.camera,
      session.getState().currentPlayer,
      coord,
    );
    const { isExactAutosaveE2ERequest } = await import('@/testing/e2e-mode');
    if (isExactAutosaveE2ERequest(import.meta.env.MODE, window.location.search)) {
      const { installE2ERuntime } = await import('@/testing/e2e-runtime');
      await installE2ERuntime({
        loadAutosave: loadMostRecentAutoSaveEntry,
        enterSoloCampaign: state => enterCampaignForE2E(state),
        getVisibleHexCopies: coord => getVisibleHexViewportCopies(
          session.getState(),
          renderLoop.camera,
          session.getState().currentPlayer,
          coord,
        ),
        getCityBadgeSlots: (cityId, slot) => getVisibleCityBadgeSlots(
          session.getState(),
          renderLoop.camera,
          session.getState().currentPlayer,
          cityId,
          slot,
        ),
      });
      return;
    }
  }

  await showStartSavePanel();
}

function enterCampaign(
  state: GameState,
  message: string,
  persistBeforeReady: boolean = false,
): Promise<void> | null {
  document.getElementById('save-panel')?.remove();
  session.setStateWithoutRefresh(applyPersistedUserSettings(state, persistedSettings));
  if (session.getState().gameOver) {
    const spritesReady = startGame();
    handleVictoryIfNeeded();
    return spritesReady;
  }
  if (!session.getState().hotSeat) {
    const spritesReady = startGame();
    showNotification(message, 'info');
    return spritesReady;
  }

  audio.setMasterVolume(0);
  closeNetworkPanelsForHandoff();
  const player = session.getState().hotSeat?.players.find(candidate => candidate.slotId === session.getState().currentPlayer);
  setBlockingOverlay('turn-handoff');
  roundPresentationGate.suppress();
  const controller = showTurnHandoff(
    uiLayer,
    session.getState(),
    session.getState().currentPlayer,
    player?.name ?? 'Player',
    {
      initiallyReady: !persistBeforeReady,
      preparingLabel: 'Saving campaign…',
      onReady: async summary => {
        const viewerId = session.getState().currentPlayer;
        const acknowledgement = acknowledgeTurnHandoffSummary(
          session.getState(),
          viewerId,
          summary,
        );
        session.setStateWithoutRefresh(acknowledgement.state);
        try {
          await autoSave(session.getState());
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

  if (!persistBeforeReady) return null;
  const persist = async (): Promise<void> => {
    try {
      await autoSave(session.getState());
      controller.setReady(session.getState());
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
  return null;
}

function enterCampaignForE2E(state: GameState): Promise<void> {
  if (state.hotSeat) throw new Error('E2E direct entry does not bypass hot-seat handoff.');
  const spritesReady = enterCampaign(state, `Welcome back! Turn ${state.turn}`);
  if (!spritesReady) throw new Error('E2E direct entry requires a solo campaign.');
  return spritesReady;
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
          session.setStateWithoutRefresh(createNewGame({
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
          }));
          if (persistedSettings?.councilTalkLevel) {
            session.getState().settings.councilTalkLevel = persistedSettings.councilTalkLevel;
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
          session.setStateWithoutRefresh(createHotSeatGame(config, undefined, title, opponentChallenge ?? 'standard'));
          if (persistedSettings?.councilTalkLevel) {
            session.getState().settings.councilTalkLevel = persistedSettings.councilTalkLevel;
          }
          enterCampaign(
            session.getState(),
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

function startGame(): Promise<void> {
  // Initialize treasury drawer once
  if (!drawer) {
    drawer = createTreasuryDrawer();
    (document.getElementById('game-shell') ?? document.body).appendChild(drawer.element);
  }

  // Warm sprite cache non-blocking — renderers fall back to emoji while loading
  const civColors: Record<string, string> = {};
  for (const [civId, civ] of Object.entries(session.getState().civilizations)) {
    civColors[civId] = civ.color;
  }
  const spritesReady = initSprites(civColors);
  void spritesReady.catch(() => {});
  preloadOutpostMarker().catch(() => {});
  preloadFamineBadgeMarker().catch(() => {});
  preloadReligionBadgeMarker().catch(() => {});
  preloadRailSegment().catch(() => {});
  preloadTerrainTiles().catch(() => {});
  preloadNaturalWonderTiles().catch(() => {});

  // Center camera on current player's starting position
  centerOnCurrentPlayer();

  renderLoop.setGameState(session.getState());
  updateHUD();
  maybeShowCouncilInterrupt();
  maybeShowPendingHoardChoice();

  // Auto-save immediately so closing before turn 1 doesn't lose the game
  autoSave(session.getState()).catch(() => {});

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
        const unit = session.getState().units[selectedUnitId];
        if (unit) renderLoop.camera.centerOn(unit.position);
      },
      onFortify: () => {
        if (!selectedUnitId) return;
        const unit = session.getState().units[selectedUnitId];
        if (!unit || unit.hasActed || unit.owner !== session.getState().currentPlayer) return;
        if (unit.isFortified) {
          session.setStateWithoutRefresh(unfortifyUnitInState(session.getState(), session.getState().currentPlayer, selectedUnitId));
          showNotification('Unit unfortified.', 'info');
        } else {
          session.setStateWithoutRefresh(fortifyUnitInState(session.getState(), session.getState().currentPlayer, selectedUnitId));
          showNotification('Unit fortified. +25% defense until unfortified or moved.', 'info');
        }
        renderLoop.setGameState(session.getState());
        updateHUD();
        selectUnit(selectedUnitId);
      },
      onSettle: () => {
        if (!selectedUnitId) return;
        const unit = session.getState().units[selectedUnitId];
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
    session.getState(),
    bus,
    () => session.getState(),
    () => roundPresentationGate.isSuppressed(),
  );
  audio.setMasterVolume(currentMasterVolume);
  routeSfxThrough(audio.getSfxRoutingNode());
  emitCurrentPlayerAudioSnapshot(session.getState().currentPlayer);

  // Prevent zoom-out duplication: ensure the camera cannot zoom past one full
  // map-width. hexToPixel({q: width, r:0}).x equals the wrapSpan used in
  // wrap-rendering.ts, so minZoom = camera.width / wrapSpan guarantees the
  // visible world is never wider than one map copy.
  const mapWidthPx = hexToPixel({ q: session.getState().map.width, r: 0 }, renderLoop.camera.hexSize).x;
  renderLoop.camera.setMinZoomForMap(mapWidthPx);

  // Initial advisor check
  advisorSystem.check(session.getState());
  showRequiredChoicesIfNeeded();

  // Start render loop
  renderLoop.start();
  return spritesReady;
}

init();
