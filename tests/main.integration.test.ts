import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(__dirname, '..');

describe('campaign entry wiring', () => {
  it('routes Continue, exact save rows, and imports through the shared entry gate', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');

    expect(main).toContain('async function showStartSavePanel()');
    expect(main).toContain('loadMostRecentAutoSaveEntry()');
    expect(main).toContain('loadSaveEntry(source)');
    expect(main).toContain("{ kind: 'import', state }");
    expect(main.match(/await beginCampaignEntry\(/g)).toHaveLength(3);
    expect(main).not.toContain('loadAutoSave()');
    expect(main).not.toContain('loadGame(slotId)');
  });

  it('restores terminal saves before entering a hot-seat handoff', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const entry = main.slice(
      main.indexOf('function enterCampaign('),
      main.indexOf('async function showStartSavePanel'),
    );

    expect(entry.indexOf('if (session.getState().gameOver)'))
      .toBeLessThan(entry.indexOf('const hotSeat = session.getState().hotSeat;'));
    expect(entry).toContain('handleVictoryIfNeeded()');
  });

  it('gates direct E2E autosave entry before the save-panel UI and exposes no mutable runtime globals', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');

    expect(main).toContain("if (import.meta.env.MODE === 'e2e')");
    expect(main).toContain("await import('@/testing/e2e-runtime')");
    expect(main.indexOf("import.meta.env.MODE === 'e2e'"))
      .toBeLessThan(main.indexOf('await showStartSavePanel()'));
    expect(main).not.toContain('window.gameState');
    expect(main).not.toContain('window.renderLoop');
  });

  it('opens required research choices whenever a human turn becomes playable', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const release = main.slice(
      main.indexOf('function releaseHandoffToViewer'),
      main.indexOf('/** These player-owned surfaces may contain strategic targets'),
    );
    const start = main.slice(main.indexOf('function startGame()'), main.indexOf('\ninit();'));
    const endTurn = main.slice(main.indexOf('async function endTurn'), main.indexOf('function centerOnCurrentPlayer'));

    expect(release).toContain('showRequiredChoicesIfNeeded();');
    expect(start).toContain('showRequiredChoicesIfNeeded();');
    expect(endTurn).toMatch(/await replayAIMoves\(soloMoves\);\s*updateHUD\(\);\s*showRequiredChoicesIfNeeded\(\);/);
  });
});

describe('player combat wiring', () => {
  it('derives each player combat seed from the game, turn, and unit pair', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const executeAttack = main.slice(
      main.indexOf('function executeAttack('),
      main.indexOf('function restAction('),
    );

    expect(executeAttack).toContain(
      'deterministicCombatSeed(session.getState().gameId, session.getState().turn, attacker.id, defender.id)',
    );
  });

  it('refreshes the open selected-unit panel from post-combat state before delayed selection', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const executeAttack = main.slice(
      main.indexOf('function executeAttack('),
      main.indexOf('function restAction('),
    );
    const stateRefresh = executeAttack.indexOf('renderLoop.setGameState(session.getState());');
    const panelRefresh = executeAttack.indexOf('refreshSelectedUnitAfterCombat();');
    const delayedSelection = executeAttack.indexOf("renderLoop.animations.add('combat-flash'");

    expect(stateRefresh).toBeGreaterThan(-1);
    expect(panelRefresh).toBeGreaterThan(stateRefresh);
    expect(panelRefresh).toBeLessThan(delayedSelection);
  });

  it('refreshes the open selected-unit panel before returning through the city-capture branch', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const executeAttack = main.slice(
      main.indexOf('function executeAttack('),
      main.indexOf('function restAction('),
    );
    const cityCaptureBranch = executeAttack.slice(
      executeAttack.indexOf('const assaultStatus = beginPlayerCityAssault('),
      executeAttack.indexOf('return;', executeAttack.indexOf('const assaultStatus = beginPlayerCityAssault(')),
    );

    expect(cityCaptureBranch.indexOf('renderLoop.setGameState(session.getState());')).toBeGreaterThan(-1);
    expect(cityCaptureBranch.indexOf('refreshSelectedUnitAfterCombat();')).toBeGreaterThan(
      cityCaptureBranch.indexOf('renderLoop.setGameState(session.getState());'),
    );
  });
});

describe('land-unit water recovery wiring', () => {
  it('routes the live selected-unit panel and blocked-tap path through recovery helpers', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const selectFlow = main.slice(
      main.indexOf('function selectUnit('),
      main.indexOf('function deselectUnit('),
    );
    // #787 phase 8b: the movement-blocker dispatch moved from an inline
    // if-chain in handleHexTap into the 'blocked-movement' case of its
    // resolveMapTapIntent-driven switch -- resolveMapTapIntent.test.ts and
    // this switch's own case now own the decision of *whether* a tap is
    // blocked; this scope only proves the live dispatch site still routes
    // through the same recovery helpers once resolveMapTapIntent says it is.
    const tapFlow = main.slice(
      main.indexOf("case 'blocked-movement': {"),
      main.indexOf("case 'enemy-unit-info': {"),
    );

    expect(selectFlow).toContain('waterRecovery: highlightResult.waterRecovery');
    expect(tapFlow).toContain('handleSelectedUnitMovementBlocker(');
    // Phase 3 (#787) moved the water-recovery binding into SelectionStore; the
    // tap flow now reads it from the store instead of a module-scope `let`.
    expect(tapFlow).toContain('selection.getWaterRecovery()');
    expect(tapFlow).not.toContain('getLandUnitWaterRecovery(');
    expect(tapFlow).toContain('reselectUnit: unitId => selectUnit(unitId, { suppressSelectionSfx: true })');
    expect(tapFlow).toContain('playError: SFX.error');
  });
});

describe('completed-round AI wiring', () => {
  it('uses one shared non-human scheduler for solo and hot-seat completed rounds', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');

    expect(main.match(/processNonHumanMajorRound\(current, eventBus\)/g)).toHaveLength(1);
    expect(main).not.toContain('processAITurn(');
    expect(main).not.toContain("getAIPlayers(");
    expect(main).not.toContain("'ai-1'");
  });

  it('runs strategic warning postprocess on the live completed-round path', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');

    expect(main).toContain('applyStrategicWarningTransitions(beforeRound, current, eventBus');
    expect(main).toContain('applyStrategicWarningTransitions(beforeRound, current, eventBus)');
    // ai:strategic-warning's real consumer moved to registerGeneralPresentation,
    // composed into registerAllPresentation (#787 phase 7) --
    // register-general-presentation.test.ts and register-all.test.ts prove the
    // registrar itself routes the event and is actually installed; this only
    // proves main.ts installs the composed set.
    expect(main).toContain('registerAllPresentation(bus, presentationContext)');
  });

  it('emits one warning cue only after the exact rendered handoff summary is acknowledged', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const handoff = main.slice(
      main.indexOf('async function beginHotSeatHandoff'),
      main.indexOf('async function endTurn'),
    );

    expect(handoff).toContain('onReady: async summary =>');
    expect(handoff).toMatch(
      /acknowledgeTurnHandoffSummary\(\s*session\.getState\(\),\s*resolvedNextSlotId,\s*summary,\s*\)/,
    );
    expect(handoff.indexOf('releaseHandoffToViewer(resolvedNextSlotId)'))
      .toBeLessThan(handoff.indexOf("bus.emit('ai:strategic-warning-audio'"));
  });

  it('keeps completed-round handoff anonymous and resolves its recipient after simulation', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const handoff = main.slice(
      main.indexOf('async function beginHotSeatHandoff'),
      main.indexOf('async function endTurn'),
    );

    expect(handoff).toContain('const previousHumanId = preSimulationState.currentPlayer');
    expect(handoff).toContain('const nextPlayer = hotSeat.players.find');
    expect(handoff).toContain('resolveHotSeatPostSimulation(state, previousHumanId).state');
    expect(handoff).toContain('resolvedNextSlotId = outcome.state.currentPlayer');
    expect(handoff).toContain('controller.setRecipient(outcome.state, resolvedNextSlotId');
  });
});

describe('shared city founding wiring', () => {
  it('routes both the live player action and legacy AI through foundCityInState', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const basicAi = readFileSync(
      resolve(PROJECT_ROOT, 'src/ai/basic-ai.ts'),
      'utf8',
    );
    const playerFlow = main.slice(
      main.indexOf('function foundCityAction(): void'),
      main.indexOf('function performWorkerAction('),
    );

    expect(playerFlow).toContain(
      'foundCityInState(session.getState(), selectedUnitId, bus)',
    );
    expect(playerFlow).not.toContain('const city = foundCity(');
    expect(basicAi).toContain(
      'foundCityInState(newState, settler.id, bus)',
    );
  });
});

describe('shared unit upgrade wiring', () => {
  it('delegates the live human handler to the canonical whole-state mutation', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const handler = main.slice(
      main.indexOf('function executeUpgrade('),
      main.indexOf('function openWonderPanelForCityId'),
    );

    expect(handler).toContain('applyUnitUpgradeToState(');
    expect(handler).not.toContain('civ.gold - cost');
    expect(handler).not.toContain('applyUpgrade(');
  });
});

describe('shared city assault wiring', () => {
  it('passes the live event bus and exact post-combat result into canonical assault', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');

    expect(main).toMatch(
      /beginPlayerCityAssaultChoice\(\s*session\.getState\(\),\s*attackerId,\s*cityId,\s*bus,\s*precedingCombat,\s*attackerMultiplier,\s*\)/,
    );
    expect(main).toMatch(
      /beginPlayerCityAssault\(\s*attackerId,\s*cityAtTarget\.id,\s*attackerBonus,\s*result,\s*amphibiousAssault,\s*\)/,
    );
  });

  it('does not enter capture flow when the surviving attacker cannot occupy a city', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const playerAssault = main.slice(
      main.indexOf('function beginPlayerCityAssault('),
      main.indexOf('function executeAttack('),
    );

    expect(playerAssault).toMatch(
      /if \(!attacker \|\| !canUnitOccupyCity\(attacker\)\) return 'resolved';/,
    );
  });

  it('routes player and strategic AI capture transitions through the shared emitter', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const strategicAi = readFileSync(
      resolve(PROJECT_ROOT, 'src/ai/ai-major-turn.ts'),
      'utf8',
    );

    expect(main).toContain('emitMajorCityCaptureEvents(');
    expect(strategicAi).toContain('emitMajorCityCaptureEvents(');
  });

  it('does not resolve minor-civilization conquest after failed movement', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const minorCaptureFlow = main.slice(
      main.indexOf('function executeMinorCivConquest('),
      main.indexOf('function handleGiftGold('),
    );

    expect(minorCaptureFlow).toContain(
      'const movement = executeAnimatedUnitMove(',
    );
    expect(minorCaptureFlow).toMatch(/if \(!movement\.ok\) return;/);
  });
});

describe('air-defense overlay button placement (#783)', () => {
  it('joins the utility toolbar flex row instead of an independent absolute position', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const createUI = main.slice(main.indexOf('function createUI(): void {'), main.indexOf('function openBestiary('));

    // Regression for #783: this button used to carry its own
    // `position:absolute;right:12px;top:64px` and land directly on `uiLayer`, which put it
    // on top of the utility toolbar's own icon buttons and the HUD's turn/era text at the
    // same screen coordinates. It must not reintroduce a competing absolute anchor.
    expect(main).not.toMatch(/airDefenseOverlayButton\.style\.cssText[^;]*position:\s*absolute/);
    expect(createUI).toContain("document.getElementById('utility-toolbar')");
    expect(createUI).toMatch(/utilityToolbar\.(insertBefore|appendChild)\(airDefenseOverlayButton/);
  });

  it('only shows the button once the current civ has built AA coverage', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');

    // Starts hidden so it never flashes visible before the first updateHUD() call.
    expect(main).toContain('airDefenseOverlayButton.hidden = true;');
    const updateHud = main.slice(main.indexOf('function updateHUD(): void {'), main.indexOf('\nfunction ', main.indexOf('function updateHUD(): void {') + 1));
    expect(updateHud).toContain('airDefenseOverlayButton.hidden = !civHasAirDefenseCoverage(session.getState(), civ.id);');
  });
});

describe('map tap wiring (#787 phase 8b)', () => {
  it('handleHexTap dispatches on resolveMapTapIntent through an exhaustive switch', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const handleHexTap = main.slice(
      main.indexOf('function handleHexTap('),
      main.indexOf('function openTerritoryInspectionPanel('),
    );

    expect(handleHexTap).toContain('resolveMapTapIntent(');
    expect(handleHexTap).toContain('switch (intent.kind)');

    // The exhaustiveness guard: a future MapTapIntent variant with no case
    // arm fails to compile, not silently falls through at runtime.
    expect(handleHexTap).toContain('const _exhaustive: never = intent;');

    // One case per current MapTapIntent variant (src/input/map-tap-intent.ts) --
    // resolveMapTapIntent's own test suite proves which *data* reaches each
    // kind; this only proves handleHexTap still has a live dispatch arm for it.
    const expectedKinds = [
      'resolve-pending', 'mistap', 'ignore', 'open-pirate-faction', 'open-pirate-region',
      'animation-locked', 'open-stack-picker', 'select-unit', 'blocked-caravan-committed',
      'blocked-naval-gate', 'blocked-movement', 'enemy-unit-info', 'combat-preview',
      'assault-preview', 'confirm-war-city', 'confirm-war-minor-civ', 'assault-minor-civ',
      'worker-busy', 'move', 'open-city', 'open-wonder-atlas', 'deselect',
    ];
    for (const kind of expectedKinds) {
      expect(handleHexTap).toContain(`case '${kind}':`);
    }
  });
});
