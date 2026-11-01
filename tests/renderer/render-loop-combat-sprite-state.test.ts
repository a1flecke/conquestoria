// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/renderer/hex-renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/hex-renderer')>();
  return {
    ...actual,
    drawHexMap: vi.fn(),
    drawRivers: vi.fn(),
    drawHexHighlight: vi.fn(),
    drawMinorCivTerritory: vi.fn(),
  };
});
vi.mock('@/renderer/fog-renderer', () => ({ drawFogOfWar: vi.fn() }));
vi.mock('@/renderer/city-renderer', () => ({ drawCities: vi.fn() }));
vi.mock('@/renderer/unit-renderer', () => ({
  drawUnits: vi.fn(),
  drawUnitPresentations: vi.fn(),
  drawUnitGlyph: vi.fn(),
}));
vi.mock('@/renderer/pirate-headquarters-presentation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/pirate-headquarters-presentation')>();
  return { ...actual, drawPirateHeadquartersMapPresentation: vi.fn() };
});

import { RenderLoop } from '@/renderer/render-loop';
import { DEATH_STATE_MS } from '@/renderer/pirate-sprite-state';
import { createEmptyPirateState } from '@/core/pirate-state';
import { createNewGame } from '@/core/game-state';
import type { CombatResult, GameState, Unit } from '@/core/types';

function createMountedCanvas(): { canvas: HTMLCanvasElement; mount: HTMLDivElement } {
  const mount = document.createElement('div');
  const ctx = {
    clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    setTransform: vi.fn(), scale: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
  };
  const canvas = {
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
    getBoundingClientRect: () => ({ width: 320, height: 240 }),
    parentElement: mount,
  } as unknown as HTMLCanvasElement;
  return { canvas, mount };
}

function buildTestState(attacker: Unit, defender: Unit): GameState {
  return {
    turn: 5,
    currentPlayer: 'player',
    map: { width: 5, height: 5, wrapsHorizontally: false, tiles: {}, rivers: [] },
    tribalVillages: {},
    minorCivs: {},
    cities: {},
    units: { [attacker.id]: attacker, [defender.id]: defender },
    civilizations: {
      player: {
        color: '#4a90d9',
        visibility: { tiles: { '0,0': 'visible', '1,0': 'visible' } },
      },
    },
  } as unknown as GameState;
}

describe('render-loop — non-pirate combat sprite state', () => {
  it('reflects attack/hurt data-state for a regular unit combat via the DOM overlay', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);

    const attacker = {
      id: 'rifleman-1', type: 'rifleman', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false,
      isResting: false,
    } as unknown as Unit;
    const defender = {
      id: 'barbarian-1', type: 'warrior', owner: 'barbarian', position: { q: 1, r: 0 },
      movementPointsLeft: 2, health: 60, experience: 0, hasMoved: false, hasActed: false,
      isResting: false,
    } as unknown as Unit;

    loop.setGameState(buildTestState(attacker, defender));
    loop.camera.isHexVisible = () => true;

    loop.applyCombatVisual({
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerDamage: 10,
      defenderDamage: 40,
      attackerSurvived: true,
      defenderSurvived: true,
      attackerStrength: 10,
      defenderStrength: 6,
      attackerPosition: attacker.position,
      defenderPosition: defender.position,
    } as CombatResult);

    (loop as unknown as { render: () => void }).render();

    const attackerWrap = mount.querySelector(`[data-entity-id="${attacker.id}"]`)?.firstElementChild;
    const defenderWrap = mount.querySelector(`[data-entity-id="${defender.id}"]`)?.firstElementChild;
    expect(attackerWrap?.getAttribute('data-state')).toBe('attack');
    expect(defenderWrap?.getAttribute('data-state')).toBe('hurt');
  });

  it('hands the sprite player the start time of the combat pulse, and a renewed one has a later start (#1627)', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);
    const attacker = {
      id: 'rifleman-1', type: 'rifleman', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false,
      isResting: false,
    } as unknown as Unit;
    const defender = {
      id: 'barbarian-1', type: 'warrior', owner: 'barbarian', position: { q: 1, r: 0 },
      movementPointsLeft: 2, health: 60, experience: 0, hasMoved: false, hasActed: false,
      isResting: false,
    } as unknown as Unit;
    loop.setGameState(buildTestState(attacker, defender));
    loop.camera.isHexVisible = () => true;
    const result = {
      attackerId: attacker.id, defenderId: defender.id, attackerDamage: 10, defenderDamage: 40,
      attackerSurvived: true, defenderSurvived: true, attackerStrength: 10, defenderStrength: 6,
      attackerPosition: attacker.position, defenderPosition: defender.position,
    } as CombatResult;
    const render = () => (loop as unknown as { render: () => void }).render();
    const keyOf = () => (mount.querySelector(`[data-entity-id="${attacker.id}"]`)?.firstElementChild as HTMLElement).getAttribute('data-png-key');

    const first = performance.now();
    loop.applyCombatVisual(result, first);
    render();
    expect(keyOf()).toBe(`attack:0:${first}`); // the rifleman is a PNG unit: state, damage tier, epoch

    const second = first + 0.5; // inside the first attack's 1.5 s hold
    loop.applyCombatVisual(result, second);
    render();
    expect(keyOf()).toBe(`attack:0:${second}`);
  });

  it('returns to idle after the combat pulse window expires', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);

    const attacker = {
      id: 'rifleman-1', type: 'rifleman', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false,
      isResting: false,
    } as unknown as Unit;
    const defender = {
      id: 'barbarian-1', type: 'warrior', owner: 'barbarian', position: { q: 1, r: 0 },
      movementPointsLeft: 2, health: 60, experience: 0, hasMoved: false, hasActed: false,
      isResting: false,
    } as unknown as Unit;

    loop.setGameState(buildTestState(attacker, defender));
    loop.camera.isHexVisible = () => true;

    const nowMs = 10_000;
    loop.applyCombatVisual({
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerDamage: 10,
      defenderDamage: 40,
      attackerSurvived: true,
      defenderSurvived: true,
      attackerStrength: 10,
      defenderStrength: 6,
      attackerPosition: attacker.position,
      defenderPosition: defender.position,
    } as CombatResult, nowMs);

    // A full 1.4s v2 attack cycle in: the short `hurt` one-shot (700ms) is long done,
    // but the attacker must still be mid-animation so the whole
    // anticipation -> strike -> hold -> recover sequence plays (#916).
    vi.spyOn(performance, 'now').mockReturnValue(nowMs + 1_400);
    (loop as unknown as { render: () => void }).render();

    const attackerWrapMidSwing = mount.querySelector(`[data-entity-id="${attacker.id}"]`)?.firstElementChild;
    const defenderWrap = mount.querySelector(`[data-entity-id="${defender.id}"]`)?.firstElementChild;
    expect(attackerWrapMidSwing?.getAttribute('data-state')).toBe('attack');
    expect(defenderWrap?.getAttribute('data-state')).toBe('idle');

    // Well past ATTACK_STATE_MS the attacker settles back to idle too.
    vi.spyOn(performance, 'now').mockReturnValue(nowMs + 2_000);
    (loop as unknown as { render: () => void }).render();
    const attackerWrapSettled = mount.querySelector(`[data-entity-id="${attacker.id}"]`)?.firstElementChild;
    expect(attackerWrapSettled?.getAttribute('data-state')).toBe('idle');
    vi.restoreAllMocks();
  });
});

describe('render-loop — trade unit delivery sprite state', () => {
  it('reflects a work data-state for a unit right after applyDeliveryVisual', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);

    const wagon = {
      id: 'wagon-1', type: 'merchant_wagon', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: false, hasActed: true,
      isResting: false,
    } as unknown as Unit;

    loop.setGameState({
      turn: 5,
      currentPlayer: 'player',
      map: { width: 5, height: 5, wrapsHorizontally: false, tiles: {}, rivers: [] },
      tribalVillages: {},
      minorCivs: {},
      cities: {},
      units: { [wagon.id]: wagon },
      civilizations: { player: { color: '#4a90d9', visibility: { tiles: { '0,0': 'visible' } } } },
    } as unknown as GameState);
    loop.camera.isHexVisible = () => true;

    loop.applyDeliveryVisual(wagon.id);
    (loop as unknown as { render: () => void }).render();

    const wagonWrap = mount.querySelector(`[data-entity-id="${wagon.id}"]`)?.firstElementChild;
    expect(wagonWrap?.getAttribute('data-state')).toBe('work');
  });

  it('returns to idle after the work pulse window expires', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);

    const wagon = {
      id: 'wagon-1', type: 'merchant_wagon', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: false, hasActed: true,
      isResting: false,
    } as unknown as Unit;

    loop.setGameState({
      turn: 5,
      currentPlayer: 'player',
      map: { width: 5, height: 5, wrapsHorizontally: false, tiles: {}, rivers: [] },
      tribalVillages: {},
      minorCivs: {},
      cities: {},
      units: { [wagon.id]: wagon },
      civilizations: { player: { color: '#4a90d9', visibility: { tiles: { '0,0': 'visible' } } } },
    } as unknown as GameState);
    loop.camera.isHexVisible = () => true;

    const nowMs = 20_000;
    loop.applyDeliveryVisual(wagon.id, nowMs);

    vi.spyOn(performance, 'now').mockReturnValue(nowMs + 2_000); // past WORK_STATE_MS (1400ms)
    (loop as unknown as { render: () => void }).render();

    const wagonWrap = mount.querySelector(`[data-entity-id="${wagon.id}"]`)?.firstElementChild;
    expect(wagonWrap?.getAttribute('data-state')).toBe('idle');
    vi.restoreAllMocks();
  });
});

describe('render-loop — sustained work state for an active workerTask', () => {
  function buildWorkerState(worker: Unit): GameState {
    return {
      turn: 5,
      currentPlayer: 'player',
      map: { width: 5, height: 5, wrapsHorizontally: false, tiles: {}, rivers: [] },
      tribalVillages: {},
      minorCivs: {},
      cities: {},
      units: { [worker.id]: worker },
      civilizations: { player: { color: '#4a90d9', visibility: { tiles: { '0,0': 'visible' } } } },
    } as unknown as GameState;
  }

  it('renders data-state="work" for a unit with an active workerTask and no combat transient', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);

    const worker = {
      id: 'worker-1', type: 'worker', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: false, hasActed: true,
      isResting: false,
      workerTask: { action: 'build-farm', coord: { q: 0, r: 0 } },
    } as unknown as Unit;

    loop.setGameState(buildWorkerState(worker));
    loop.camera.isHexVisible = () => true;
    (loop as unknown as { render: () => void }).render();

    const workerWrap = mount.querySelector(`[data-entity-id="${worker.id}"]`)?.firstElementChild;
    expect(workerWrap?.getAttribute('data-state')).toBe('work');
  });

  it('lets an active combat transient take priority over a sustained workerTask', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);

    const worker = {
      id: 'worker-1', type: 'worker', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 0, health: 60, experience: 0, hasMoved: false, hasActed: true,
      isResting: false,
      workerTask: { action: 'build-farm', coord: { q: 0, r: 0 } },
    } as unknown as Unit;

    loop.setGameState(buildWorkerState(worker));
    loop.camera.isHexVisible = () => true;
    loop.applyCombatVisual({
      attackerId: 'enemy-1',
      defenderId: worker.id,
      attackerDamage: 0,
      defenderDamage: 40,
      attackerSurvived: true,
      defenderSurvived: true,
      attackerStrength: 10,
      defenderStrength: 0,
      attackerPosition: { q: 1, r: 0 },
      defenderPosition: worker.position,
    } as unknown as CombatResult);
    (loop as unknown as { render: () => void }).render();

    const workerWrap = mount.querySelector(`[data-entity-id="${worker.id}"]`)?.firstElementChild;
    expect(workerWrap?.getAttribute('data-state')).toBe('hurt');
  });
});

describe('render-loop — pirate death snapshots (#1439 characterization)', () => {
  /** The overlay is only mounted under jsdom; spy on its sync to observe the
   * entity stream render() produces without depending on sprite lookup. */
  function spyOverlaySync(loop: RenderLoop) {
    const overlay = (loop as unknown as { spriteOverlay: { sync: (...args: unknown[]) => void } }).spriteOverlay;
    return vi.spyOn(overlay, 'sync');
  }

  function pirateDeathState(pirate: Unit): GameState {
    return {
      turn: 5,
      currentPlayer: 'player',
      map: { width: 5, height: 5, wrapsHorizontally: false, tiles: {}, rivers: [] },
      tribalVillages: {},
      minorCivs: {},
      cities: {},
      units: { [pirate.id]: pirate },
      pirates: { version: 1, factions: { 'pirate-1': { behavior: 'raiding', maritimeStage: 2 } }, history: [], pressure: { value: 0, suppression: [] }, intelByCiv: {}, nextSpawnCheckTurn: 1 },
      civilizations: {
        player: {
          color: '#4a90d9',
          visibility: { tiles: { '0,0': 'visible' } },
        },
      },
    } as unknown as GameState;
  }

  function renderAt(loop: RenderLoop, nowMs: number): void {
    vi.spyOn(performance, 'now').mockReturnValue(nowMs);
    (loop as unknown as { render: () => void }).render();
  }

  it('renders a dead pirate unit from its snapshot and drops it once DEATH_STATE_MS elapses', () => {
    const { canvas } = createMountedCanvas();
    const loop = new RenderLoop(canvas);
    const pirate = {
      id: 'pirate-ship-1', owner: 'pirate-1', type: 'pirate_galley', position: { q: 0, r: 0 },
      movementPointsLeft: 1, health: 0, experience: 0, hasMoved: false,
      hasActed: false, isResting: false,
    } as unknown as Unit;
    loop.setGameState(pirateDeathState(pirate));
    loop.camera.isHexVisible = () => true;
    const syncSpy = spyOverlaySync(loop);
    const nowMs = 10_000;

    loop.applyCombatVisual({
      attackerId: 'player-unit-1',
      defenderId: pirate.id,
      attackerDamage: 0,
      defenderDamage: 100,
      attackerSurvived: true,
      defenderSurvived: false,
      attackerStrength: 10,
      defenderStrength: 4,
      attackerPosition: { q: 1, r: 0 },
      defenderPosition: pirate.position,
    } as CombatResult, nowMs);

    // The dead unit has already left authoritative state -- the snapshot is the
    // only remaining source that can still draw the collapse animation.
    delete (loop as unknown as { state: { units: Record<string, unknown> } }).state.units[pirate.id];

    renderAt(loop, nowMs + 100);
    const liveEntities = syncSpy.mock.calls.at(-1)?.[1] as Array<{ id: string; state: string }>;
    expect(liveEntities.some(entity => entity.id === pirate.id && entity.state === 'death')).toBe(true);

    // Snapshot cleanup happens *during* render: past the shared death clock the
    // snapshot is gone, so a frame-skipping scheduler must not strand it.
    renderAt(loop, nowMs + DEATH_STATE_MS + 50);
    const expiredEntities = syncSpy.mock.calls.at(-1)?.[1] as Array<{ id: string; state: string }>;
    expect(expiredEntities.some(entity => entity.id === pirate.id)).toBe(false);
    expect((loop as unknown as { pirateUnitDeathSnapshots: Map<string, unknown> }).pirateUnitDeathSnapshots.size).toBe(0);
    vi.restoreAllMocks();
  });

  it('keeps a pirate headquarters landmark death snapshot after the live faction leaves state', () => {
    const { canvas } = createMountedCanvas();
    const loop = new RenderLoop(canvas);
    const state = createNewGame(undefined, 'pirate-landmark-death', 'small') as GameState;
    state.currentPlayer = 'player';
    state.turn = 20;
    state.pirates = createEmptyPirateState();
    state.pirates.factions['pirate-1'] = {
      id: 'pirate-1', name: 'The Red Wake', spawnedRound: 2, behavior: 'raiding', maritimeStage: 3,
      notoriety: 3, shipIds: [],
      headquarters: { kind: 'coastal-enclave', position: { q: 5, r: 5 }, integrity: 40, maxIntegrity: 100 },
      tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null,
      transitionGuards: { emittedEventKeys: [] },
    } as unknown as (typeof state.pirates)['factions'][string];
    state.pirates.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'sighted', discoveredRound: 10, lastUpdatedRound: 20,
        lastKnownHeadquarters: {
          kind: 'coastal-enclave', position: { q: 5, r: 5 }, observedRound: 20, integrityBand: 'damaged',
        },
        knownBehavior: 'raiding', knownMaritimeStage: 3, observedUnitIds: [],
      },
    } as unknown as (typeof state.pirates)['intelByCiv'][string];
    for (const civ of Object.values(state.civilizations)) civ.visibility = { tiles: { '5,5': 'visible' }, lastSeen: {} };

    loop.setGameState(state);
    loop.camera.isHexVisible = () => true;
    const syncSpy = spyOverlaySync(loop);
    const nowMs = 30_000;

    loop.applyPirateHeadquartersAssaultVisual('pirate-1', 'player-unit-1', {
      destroyed: true,
      attackerSurvived: true,
    }, nowMs);

    // The viewer's intel on the faction is gone (e.g. the faction's defeat was
    // processed): only the render-loop snapshot can still show the collapse.
    state.pirates.intelByCiv.player = {};

    renderAt(loop, nowMs + 100);
    const liveEntities = syncSpy.mock.calls.at(-1)?.[1] as Array<{ id: string; state: string }>;
    expect(liveEntities.some(entity => entity.id === 'pirate-headquarters-pirate-1' && entity.state === 'death')).toBe(true);

    renderAt(loop, nowMs + DEATH_STATE_MS + 50);
    const expiredEntities = syncSpy.mock.calls.at(-1)?.[1] as Array<{ id: string; state: string }>;
    expect(expiredEntities.some(entity => entity.id === 'pirate-headquarters-pirate-1')).toBe(false);
    expect((loop as unknown as { pirateLandmarkDeathSnapshots: Map<string, unknown> }).pirateLandmarkDeathSnapshots.size).toBe(0);
    vi.restoreAllMocks();
  });
});
