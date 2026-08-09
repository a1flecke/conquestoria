import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(__dirname, '..');

describe('campaign entry wiring', () => {
  // #787 phase 10: showStartSavePanel, enterCampaign, and startGame all moved
  // out of main.ts into CampaignEntryController/GameSessionController. Their
  // real behavior (all three entry routes through the shared challenge-prompt
  // gate, the gameOver-before-hotSeat ordering + handleVictoryIfNeeded, and
  // startGame's showRequiredChoicesIfNeeded call) is now proven at runtime by
  // campaign-entry-controller.test.ts and game-session-controller.test.ts.
  // Only the e2e-mode gating (never behaviorally tested even before this
  // phase -- it depends on Vite's build-time import.meta.env.MODE, not
  // something worth stubbing for a structural regression guard) stays a
  // source check, relocated to its new home.
  it('gates direct E2E autosave entry before the save-panel UI and exposes no mutable runtime globals', () => {
    const controller = readFileSync(resolve(PROJECT_ROOT, 'src/app/controllers/game-session-controller.ts'), 'utf8');

    expect(controller).toContain("if (import.meta.env.MODE === 'e2e')");
    expect(controller).toContain("await import('@/testing/e2e-runtime')");
    expect(controller.indexOf("import.meta.env.MODE === 'e2e'"))
      .toBeLessThan(controller.indexOf('await deps.campaignEntry.showStartSavePanel()'));
    expect(controller).not.toContain('window.gameState');
    expect(controller).not.toContain('window.renderLoop');
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
  it('routes the live blocked-tap path through recovery helpers', () => {
    // #787 phase 8d: handleHexTap itself (and its 'blocked-movement' case)
    // moved out of main.ts entirely into MapInteractionController -- this
    // scope, and its DOM anchor, moved with it. Real behavior (a blocked
    // tap does not move the unit and warns the player) is covered by
    // map-interaction-controller.test.ts's "blocked-movement shows a
    // notification and does not move the unit"; this test keeps the
    // narrower structural proof that survived 8b/8c: the live dispatch
    // site routes through the same recovery helpers and store, not a
    // reimplementation of the blocker logic itself.
    const controller = readFileSync(resolve(PROJECT_ROOT, 'src/app/controllers/map-interaction-controller.ts'), 'utf8');
    const tapFlow = controller.slice(
      controller.indexOf("case 'blocked-movement': {"),
      controller.indexOf("case 'enemy-unit-info': {"),
    );

    expect(tapFlow).toContain('handleSelectedUnitMovementBlocker(');
    // Phase 3 (#787) moved the water-recovery binding into SelectionStore; the
    // tap flow now reads it from the store instead of a module-scope `let`.
    expect(tapFlow).toContain('selection.getWaterRecovery()');
    expect(tapFlow).not.toContain('getLandUnitWaterRecovery(');
    expect(tapFlow).toContain('reselectUnit: unitId => selectionController.selectUnit(unitId, { suppressSelectionSfx: true })');
    expect(tapFlow).toContain('playError: SFX.error');
  });
});

describe('completed-round AI wiring', () => {
  // #787 phase 9: endTurn, beginHotSeatHandoff, and runCurrentCompletedRound
  // all moved into TurnFlowController -- the "one shared non-human scheduler",
  // "strategic-warning postprocess wired into every round", "warning cue
  // ordering", and "anonymous-then-resolved handoff recipient" invariants
  // this describe block used to prove by slicing main.ts source text are now
  // proven at runtime in turn-flow-controller.test.ts's "completed-round
  // scheduling and postprocess" and "hot-seat handoff" describe blocks.
  it('installs the composed presentation registrar set that ai:strategic-warning routes through', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');

    // ai:strategic-warning's real consumer moved to registerGeneralPresentation,
    // composed into registerAllPresentation (#787 phase 7) --
    // register-general-presentation.test.ts and register-all.test.ts prove the
    // registrar itself routes the event and is actually installed. #787 phase
    // 10 moved the actual registerAllPresentation(...) call out of main.ts's
    // module scope into bootstrap() (src/app/bootstrap.ts) -- bootstrap.test.ts
    // proves it is called with these exact bus/presentationContext values;
    // this only proves main.ts still hands them to bootstrap().
    const bootstrapCall = main.slice(main.indexOf('void bootstrap({'), main.indexOf('});', main.indexOf('void bootstrap({')));
    expect(bootstrapCall).toContain('bus,');
    expect(bootstrapCall).toContain('presentationContext,');
    expect(bootstrapCall).toContain('gameSession,');
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
      // #787 phase 10b-c: openWonderPanelForCityId moved into PanelActionsController;
      // openCityPanelForCity is what now immediately follows executeUpgrade.
      main.indexOf('function openCityPanelForCity('),
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

  it('routes strategic AI capture transitions through the shared emitter', () => {
    // #787 phase 9: finalizePendingCityCaptureChoice (the player-side caller
    // of emitMajorCityCaptureEvents) moved into TurnFlowController -- that
    // half of this invariant is now proven at runtime by
    // turn-flow-controller.test.ts's "finalizePendingCityCaptureChoice --
    // shared emitter" test. Only the strategic-AI side is still checked here.
    const strategicAi = readFileSync(
      resolve(PROJECT_ROOT, 'src/ai/ai-major-turn.ts'),
      'utf8',
    );

    expect(strategicAi).toContain('emitMajorCityCaptureEvents(');
  });

  it('does not resolve minor-civilization conquest after failed movement', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const minorCaptureFlow = main.slice(
      main.indexOf('function executeMinorCivConquest('),
      // #787 phase 10b-c: openDiplomacyPanel moved into PanelActionsController;
      // executeUpgrade is what now immediately follows executeMinorCivConquest.
      main.indexOf('function executeUpgrade('),
    );

    expect(minorCaptureFlow).toContain(
      'const movement = selectionController.executeAnimatedUnitMove(',
    );
    expect(minorCaptureFlow).toMatch(/if \(!movement\.ok\) return;/);
  });
});

// #783 air-defense overlay button placement: both grep assertions that used
// to live here (no competing absolute position; hidden until the civ has
// coverage) moved into hud-controller.test.ts as real DOM tests once
// HudController owned this button (#787 phase 10) -- a real test on the
// actual controller supersedes a source-text check on where it used to live.

describe('map interaction controller wiring (#787 phase 8d)', () => {
  it('handleHexTap dispatches on resolveMapTapIntent through an exhaustive switch', () => {
    // #787 phase 8d: handleHexTap itself moved out of main.ts into
    // MapInteractionController, so this completeness check moved with it.
    // The exhaustiveness guard below is now also enforced by tsc at compile
    // time (a MapTapIntent variant with no case arm fails the build, not
    // just this test) -- this stays as a human-readable audit trail of the
    // full case list, not the only thing standing between a new variant and
    // a silent runtime fallthrough.
    const controller = readFileSync(resolve(PROJECT_ROOT, 'src/app/controllers/map-interaction-controller.ts'), 'utf8');
    const handleHexTap = controller.slice(
      controller.indexOf('function handleHexTap('),
      controller.indexOf('function openTerritoryInspectionPanel('),
    );

    expect(handleHexTap).toContain('resolveMapTapIntent(');
    expect(handleHexTap).toContain('switch (intent.kind)');
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

  it('constructs MapInteractionController', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');

    expect(main).toContain('createMapInteractionController(');

    // These four used to be local `function` declarations in main.ts;
    // map-interaction-controller.test.ts now owns their behavioral coverage.
    // Asserting their absence guards against a future change silently
    // re-adding a shadowing local copy instead of calling the controller.
    const movedFunctionDeclarations = [
      'function handleHexTap(', 'function handleHexLongPress(',
      'function openTerritoryInspectionPanel(', 'function closeTerritoryInspectionPanel(',
    ];
    for (const declaration of movedFunctionDeclarations) {
      expect(main).not.toContain(declaration);
    }
  });

  // #787 phase 10: the onHexTap/onHexLongPress -> mapInteraction wiring moved
  // from main.ts's startGame() into GameSessionController.startGame(); the
  // routing behavior itself is now proven at runtime by
  // game-session-controller.test.ts's "routes a canvas tap through
  // MapInteractionController.handleHexTap..." test instead of a source check.
});

describe('selection controller wiring (#787 phase 8c)', () => {
  it('constructs SelectionController and no longer defines the eleven functions it now owns', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');

    expect(main).toContain('createSelectionController(');

    // Each of these used to be a local `function` declaration in main.ts;
    // selection-controller.test.ts now owns their behavioral coverage.
    // Asserting their absence here guards against a future change silently
    // re-adding a shadowing local copy instead of calling the controller.
    const movedFunctionDeclarations = [
      'function selectUnit(', 'function deselectUnit(', 'function isUnitAnimationLocked(',
      'function animateMovedUnit(', 'function executeAnimatedUnitMove(', 'function startAutoExplore(',
      'function cancelAutoExplore(', 'function cancelJourney(', 'function openUnitContextMenu(',
      'function selectNextUnit(', 'function refreshSelectedUnitAfterCombat(',
      'function refreshCurrentPlayerVisibility(',
    ];
    for (const declaration of movedFunctionDeclarations) {
      expect(main).not.toContain(declaration);
    }
  });

  it('routes the unit-turn-flow deps through the controller instead of stale local references', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const getUnitTurnFlow = main.slice(
      main.indexOf('function getUnitTurnFlow('),
      main.indexOf('function foundCityAction('),
    );

    expect(getUnitTurnFlow).toContain('selectUnit: selectionController.selectUnit,');
    expect(getUnitTurnFlow).toContain('deselectUnit: selectionController.deselectUnit,');
    expect(getUnitTurnFlow).toContain('selectNextUnit: selectionController.selectNextUnit,');
    expect(getUnitTurnFlow).toContain('refreshVisibility: selectionController.refreshCurrentPlayerVisibility,');
  });
});
