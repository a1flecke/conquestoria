import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NotificationEntry } from '@/core/notification-log';
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
});

describe('completed-round AI wiring', () => {
  it('uses one shared non-human scheduler for solo and hot-seat completed rounds', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');

    expect(main.match(/processNonHumanMajorRound\(current, eventBus\)/g)).toHaveLength(1);
    expect(main).not.toContain('processAITurn(');
    expect(main).not.toContain("getAIPlayers(");
    expect(main).not.toContain("'ai-1'");
  });

  it('keeps strategic warnings dark behind the real false flag while wiring postprocess', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');

    expect(main).toContain('applyStrategicWarningTransitions(beforeRound, current, eventBus');
    expect(main).toContain('purposefulAIEnabled: PURPOSEFUL_AI_FEATURE_ENABLED');
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
      /acknowledgeTurnHandoffSummary\(\s*gameState,\s*nextSlotId,\s*summary,\s*\)/,
    );
    expect(handoff.indexOf('releaseHandoffToViewer(nextSlotId)'))
      .toBeLessThan(handoff.indexOf("bus.emit('ai:strategic-warning-audio'"));
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

  it('routes player and legacy AI capture transitions through the shared emitter', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const basicAi = readFileSync(
      resolve(PROJECT_ROOT, 'src/ai/basic-ai.ts'),
      'utf8',
    );

    expect(main).toContain('emitMajorCityCaptureEvents(');
    expect(basicAi).toContain('emitMajorCityCaptureEvents(');
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

function makeToastSink() {
  const calls: Array<{ message: string; type: NotificationEntry['type'] }> = [];
  const sink = (message: string, type: NotificationEntry['type']) => calls.push({ message, type });
  return { sink, calls };
}

describe('era:advanced notification', () => {
  it('era 2 calls toastSink with Era 2 and factionSink once with Era 2 and unrest', () => {
    const { sink: toastSink, calls: toastCalls } = makeToastSink();
    const { sink: factionSink, calls: factionCalls } = makeSink();

    routeEraAdvanced(2, 'p1', 'Alice', toastSink, factionSink);

    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]!.message).toContain('Era 2');
    expect(toastCalls[0]!.type).toBe('success');

    expect(factionCalls).toHaveLength(1);
    expect(factionCalls[0]!.civId).toBe('p1');
    expect(factionCalls[0]!.message).toContain('Era 2');
    expect(factionCalls[0]!.message).toContain('unrest');
    expect(factionCalls[0]!.type).toBe('info');
  });

  it('era 3 calls toastSink with Era 3 but does NOT call factionSink', () => {
    const { sink: toastSink, calls: toastCalls } = makeToastSink();
    const { sink: factionSink, calls: factionCalls } = makeSink();

    routeEraAdvanced(3, 'p1', 'Alice', toastSink, factionSink);

    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]!.message).toContain('Era 3');
    expect(factionCalls).toHaveLength(0);
  });
});
