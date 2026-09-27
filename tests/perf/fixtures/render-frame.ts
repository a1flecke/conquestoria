/**
 * #1072 — deterministic render-frame fixtures: same visible scene, different
 * off-screen world size.
 *
 * Two states share one camera, viewport, zoom, viewer, fog basis, selection
 * (none) and render time, so the visible scene is materially identical:
 *
 * - `base`: a small legal world (2 viewer cities + 4 viewer units in view).
 * - `expanded`: base steps PLUS 24 off-screen cities and 160 off-screen
 *   units placed far from the viewport through the same canonical
 *   scenario-builder steps `#1007` uses (`buildScenario`, fixed seed).
 *
 * Every extra position is asserted off-screen (`camera.isHexVisible`) at
 * build time, so any canvas-work difference between the two frames is a real
 * scaling defect, not fixture drift. `measureRenderFrame` executes the real
 * production base passes (`drawHexMap`, `drawRivers`, `drawRoads`,
 * `drawCities`, unit presentations, `drawFogOfWar`) against the shared
 * test-only recording context — no DOM, no RAF loop, no sprite preload (all
 * image loaders are null-safe without preload and fall back to flat colors /
 * canvas glyphs, deterministically).
 *
 * Deliberately OUTSIDE the measured frame (documented, not forgotten):
 * minor-civ territory rings, selection highlights, journey path, trade-route
 * lines, the toggleable overlays (air-defense / supply / strategic-launch /
 * stampede routes), combat/movement animations, and the DOM sprite overlay.
 * The guard owns the always-on base map/unit/fog path; spectacles and
 * toggles are #985's / their own systems' scope.
 */
import type { GameState, HexCoord, HotSeatConfig, UnitType } from '@/core/types';
import { createHotSeatGame } from '@/core/game-state';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import { getVisibility } from '@/systems/fog-of-war';
import { buildScenario } from '@/testing/scenario-builder';
import type { ScenarioDefinition, ScenarioStep } from '@/testing/scenario-types';
import { Camera } from '@/renderer/camera';
import { drawFogOfWar } from '@/renderer/fog-renderer';
import { drawCities } from '@/renderer/city-renderer';
import { drawHexMap, drawRivers, drawRoads } from '@/renderer/hex-renderer';
import { buildUnitMapPresentations } from '@/renderer/unit-map-presentation';
import { drawUnitPresentations } from '@/renderer/unit-renderer';
import { RecordingCanvasContext, type RenderWorkCounts } from '../recording-canvas';

const RENDER_SEED = 'perf-render-1072';
const VIEWER_ID = 'player-1';
const OTHER_ID = 'player-2';
/** Fixed render time so animated landmarks/pulses cannot drift counts. */
const FRAME_NOW_MS = 0;
const VIEWPORT = { width: 800, height: 600 } as const;
const EXTRA_CITIES = 24;
const EXTRA_UNITS = 160;
const UNIT_ROTATION: readonly UnitType[] = ['warrior', 'archer', 'scout', 'spearman'];
const BLOCKED_TERRAIN = new Set(['ocean', 'coast', 'mountain']);

function hotSeatConfig(): HotSeatConfig {
  return {
    playerCount: 2,
    mapSize: 'large',
    players: [
      { name: 'Viewer', slotId: VIEWER_ID, civType: 'rome', isHuman: true },
      { name: 'Other', slotId: OTHER_ID, civType: 'greece', isHuman: false },
    ],
  };
}

/** Free land tiles on `state`'s map, in deterministic hexKey order. */
function freeLandTiles(state: GameState): HexCoord[] {
  const occupied = new Set<string>();
  for (const city of Object.values(state.cities)) occupied.add(hexKey(city.position));
  for (const unit of Object.values(state.units)) occupied.add(hexKey(unit.position));
  return Object.entries(state.map.tiles)
    .filter(([key, tile]) => !BLOCKED_TERRAIN.has(tile.terrain) && !occupied.has(key))
    .map(([key]) => {
      const [q, r] = key.split(',').map(Number);
      return { q: q!, r: r! };
    })
    .sort((a, b) => hexKey(a).localeCompare(hexKey(b)));
}

function makeCamera(focus: HexCoord): Camera {
  const camera = new Camera();
  camera.setViewport(VIEWPORT.width, VIEWPORT.height);
  camera.centerOn(focus);
  return camera;
}

export interface RenderFrameFixture {
  state: GameState;
  viewerId: string;
  camera: Camera;
  focus: HexCoord;
  /** positions added only in the expanded fixture (all verified off-screen) */
  extraPositions: HexCoord[];
  /** viewer-visible cities inside the viewport (must be non-empty) */
  visibleCityCount: number;
  /** unit presentations inside the viewport (must be non-empty) */
  visibleUnitPresentationCount: number;
}

export interface RenderFrameFixtures {
  base: RenderFrameFixture;
  expanded: RenderFrameFixture;
}

function buildDefinition(extra: boolean, lattice: HexCoord[], focus: HexCoord): ScenarioDefinition {
  const near = lattice
    .filter(coord => hexDistance(coord, focus) <= 5)
    .sort((a, b) => hexDistance(a, focus) - hexDistance(b, focus) || hexKey(a).localeCompare(hexKey(b)));
  if (near.length < 6) throw new Error(`perf render fixture: only ${near.length} near-focus tiles`);
  const steps: ScenarioStep[] = [
    { kind: 'city', civId: VIEWER_ID, position: near[0]! },
    { kind: 'city', civId: VIEWER_ID, position: near[1]! },
    ...([2, 3, 4, 5] as const).map(
      (i, index): ScenarioStep => ({
        kind: 'unit',
        civId: VIEWER_ID,
        type: UNIT_ROTATION[index % UNIT_ROTATION.length]!,
        position: near[i]!,
      }),
    ),
  ];
  if (extra) {
    const used = new Set(steps.map(step => (step.kind === 'city' || step.kind === 'unit' ? hexKey(step.position) : '')));
    const far = lattice
      .filter(coord => !used.has(hexKey(coord)))
      .sort((a, b) => hexDistance(b, focus) - hexDistance(a, focus) || hexKey(a).localeCompare(hexKey(b)));
    if (far.length < EXTRA_CITIES + EXTRA_UNITS) {
      throw new Error(`perf render fixture: only ${far.length} far tiles for extras`);
    }
    const owners = [VIEWER_ID, OTHER_ID] as const;
    for (let i = 0; i < EXTRA_CITIES; i += 1) {
      steps.push({ kind: 'city', civId: owners[i % owners.length]!, position: far[i]! });
    }
    for (let i = 0; i < EXTRA_UNITS; i += 1) {
      steps.push({
        kind: 'unit',
        civId: owners[i % owners.length]!,
        type: UNIT_ROTATION[i % UNIT_ROTATION.length]!,
        position: far[EXTRA_CITIES + i]!,
      });
    }
  }
  return {
    name: `perf-render-${extra ? 'expanded' : 'base'}`,
    description: `#1072 render fixture: shared visible scene${extra ? ` +${EXTRA_CITIES} cities +${EXTRA_UNITS} units off-screen` : ''}`,
    seed: RENDER_SEED,
    base: { kind: 'hotSeat', config: hotSeatConfig() },
    steps,
  };
}

function toFixture(state: GameState, focus: HexCoord, extraPositions: HexCoord[]): RenderFrameFixture {
  const camera = makeCamera(focus);
  const vis = state.civilizations[VIEWER_ID]?.visibility;
  if (!vis) throw new Error('perf render fixture: viewer has no visibility map');
  for (const coord of extraPositions) {
    if (camera.isHexVisible(coord)) {
      throw new Error(`perf render fixture: extra entity at ${hexKey(coord)} is on-screen — fixture is not off-screen`);
    }
  }
  const visibleCityCount = Object.values(state.cities).filter(
    city => getVisibility(vis, city.position) === 'visible' && camera.isHexVisible(city.position),
  ).length;
  const visibleUnitPresentationCount = buildUnitMapPresentations(state, VIEWER_ID, vis, new Set(), null).filter(
    presentation => camera.isHexVisible(presentation.coord),
  ).length;
  return { state, viewerId: VIEWER_ID, camera, focus, extraPositions, visibleCityCount, visibleUnitPresentationCount };
}

export function buildRenderFrameFixtures(): RenderFrameFixtures {
  const probe = createHotSeatGame(hotSeatConfig(), RENDER_SEED);
  const lattice = freeLandTiles(probe);
  const center: HexCoord = {
    q: Math.floor(probe.map.width / 2),
    r: Math.floor(probe.map.height / 2),
  };
  const focus = lattice
    .slice()
    .sort((a, b) => hexDistance(a, center) - hexDistance(b, center) || hexKey(a).localeCompare(hexKey(b)))[0];
  if (!focus) throw new Error('perf render fixture: no free land tile near map center');

  const base = toFixture(buildScenario(buildDefinition(false, lattice, focus)), focus, []);
  const expandedState = buildScenario(buildDefinition(true, lattice, focus));
  const baseKeys = new Set([
    ...Object.values(base.state.cities).map(city => hexKey(city.position)),
    ...Object.values(base.state.units).map(unit => hexKey(unit.position)),
  ]);
  const extraPositions = [
    ...Object.values(expandedState.cities).map(city => city.position),
    ...Object.values(expandedState.units).map(unit => unit.position),
  ].filter(coord => !baseKeys.has(hexKey(coord)));
  const expanded = toFixture(expandedState, focus, extraPositions);

  if (base.visibleCityCount < 1) throw new Error('perf render fixture: base frame shows no city — not a valid performance frame');
  if (base.visibleUnitPresentationCount < 1) {
    throw new Error('perf render fixture: base frame shows no units — not a valid performance frame');
  }
  if (expanded.visibleCityCount !== base.visibleCityCount) {
    throw new Error(
      `perf render fixture: visible city count drifted (base ${base.visibleCityCount}, expanded ${expanded.visibleCityCount})`,
    );
  }
  if (expanded.visibleUnitPresentationCount !== base.visibleUnitPresentationCount) {
    throw new Error(
      `perf render fixture: visible unit count drifted (base ${base.visibleUnitPresentationCount}, expanded ${expanded.visibleUnitPresentationCount})`,
    );
  }
  return { base, expanded };
}

/**
 * Execute one ordinary base frame against a fresh recording context and
 * return its machine-independent work counts. Pure w.r.t. the fixture state
 * (rendering must never mutate game state).
 *
 * Pass `cullEverything: true` ONLY for the sabotage proof: it disables
 * viewport culling so the measurement reflects full-world draw work.
 */
export function measureRenderFrame(
  fixture: RenderFrameFixture,
  options: { cullEverything?: boolean } = {},
): RenderWorkCounts {
  const { state, viewerId } = fixture;
  const camera = options.cullEverything
    ? (() => {
        const wide = makeCamera(fixture.focus);
        wide.isHexVisible = () => true;
        return wide;
      })()
    : fixture.camera;
  const recorder = new RecordingCanvasContext();
  const ctx = recorder as unknown as CanvasRenderingContext2D;
  const vis = state.civilizations[viewerId]?.visibility;
  if (!vis) throw new Error('perf render fixture: viewer has no visibility map');
  const viewerTechs = new Set<string>(state.civilizations[viewerId]?.techState?.completed ?? []);
  const completedTechsByCiv = Object.fromEntries(
    Object.entries(state.civilizations).map(([id, civ]) => [id, civ.techState?.completed ?? []]),
  );
  const colorLookup: Record<string, string> = {};
  for (const [id, civ] of Object.entries(state.civilizations)) colorLookup[id] = civ.color;

  drawHexMap(ctx, state.map, camera, undefined, undefined, viewerId, vis, viewerTechs, new Set(), state.turn, completedTechsByCiv);
  drawRivers(ctx, state.map, camera, vis);
  const cityTileKeys = new Set(Object.values(state.cities).map(city => hexKey(city.position)));
  drawRoads(ctx, state.map, camera, cityTileKeys, vis, completedTechsByCiv);
  drawCities(ctx, state, camera, viewerId, { reducedMotion: true, nowMs: FRAME_NOW_MS });
  const presentations = buildUnitMapPresentations(state, viewerId, vis, new Set(), null);
  drawUnitPresentations(ctx, presentations, camera, state, colorLookup, new Set());
  drawFogOfWar(ctx, vis, state.map.width, state.map.height, camera, state.map.wrapsHorizontally);
  return { ...recorder.counts };
}
