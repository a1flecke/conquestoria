import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { routeEraAdvanced, type NotificationSink } from '@/ui/notification-routing';

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

    expect(entry.indexOf('if (gameState.gameOver)'))
      .toBeLessThan(entry.indexOf('if (!gameState.hotSeat)'));
    expect(entry).toContain('handleVictoryIfNeeded()');
  });
});

describe('player combat wiring', () => {
  it('derives each player combat seed from the game, turn, and unit pair', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const executeAttack = main.slice(
      main.indexOf('function executeAttack('),
      main.indexOf("bus.on('combat:resolved'"),
    );

    expect(executeAttack).toContain(
      'deterministicCombatSeed(gameState.gameId, gameState.turn, attacker.id, defender.id)',
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
    const tapFlow = main.slice(
      main.indexOf('const selectedUnitCanMoveToTappedHex'),
      main.indexOf('const defenderEntryAtHex'),
    );

    expect(selectFlow).toContain('waterRecovery: highlightResult.waterRecovery');
    expect(tapFlow).toContain('handleSelectedUnitMovementBlocker(');
    expect(tapFlow).toContain('selectedUnitWaterRecovery');
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
    expect(main).toContain("bus.on('ai:strategic-warning'");
  });

  it('emits one warning cue only after the exact rendered handoff summary is acknowledged', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const handoff = main.slice(
      main.indexOf('async function beginHotSeatHandoff'),
      main.indexOf('async function endTurn'),
    );

    expect(handoff).toContain('onReady: async summary =>');
    expect(handoff).toMatch(
      /acknowledgeTurnHandoffSummary\(\s*gameState,\s*resolvedNextSlotId,\s*summary,\s*\)/,
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
      'foundCityInState(gameState, selectedUnitId, bus)',
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
      /beginPlayerCityAssaultChoice\(\s*gameState,\s*attackerId,\s*cityId,\s*bus,\s*precedingCombat,\s*\)/,
    );
    expect(main).toMatch(
      /beginPlayerCityAssault\(\s*attackerId,\s*cityAtTarget\.id,\s*attackerBonus,\s*result,\s*\)/,
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

function makeSink() {
  const calls: Array<{ civId: string; message: string; type: string }> = [];
  const sink: NotificationSink = (civId, message, type) => calls.push({ civId, message, type });
  return { sink, calls };
}

describe('era:advanced notification', () => {
  it('era 2 delivers to every human civ, with an extra unrest-primer line per civ', () => {
    const { sink, calls } = makeSink();

    routeEraAdvanced(2, ['p1', 'p2'], sink);

    // Each human civ gets both the era announcement and the era-2 unrest primer.
    const p1Calls = calls.filter(c => c.civId === 'p1');
    const p2Calls = calls.filter(c => c.civId === 'p2');
    expect(p1Calls).toHaveLength(2);
    expect(p2Calls).toHaveLength(2);
    expect(p1Calls[0]!.message).toContain('Era 2');
    expect(p1Calls[0]!.type).toBe('success');
    expect(p1Calls[1]!.message).toContain('Era 2');
    expect(p1Calls[1]!.message).toContain('unrest');
    expect(p1Calls[1]!.type).toBe('info');
  });

  it('era 3 delivers only the announcement line to each human civ, no unrest primer', () => {
    const { sink, calls } = makeSink();

    routeEraAdvanced(3, ['p1'], sink);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p1');
    expect(calls[0]!.message).toContain('Era 3');
  });

  it('delivers to no one when there are no human civs', () => {
    const { sink, calls } = makeSink();

    routeEraAdvanced(2, [], sink);

    expect(calls).toHaveLength(0);
  });
});
