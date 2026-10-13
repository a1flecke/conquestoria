import type { GameState, HexCoord, Unit, VisibilityMap } from '@/core/types';
import { Camera } from './camera';
import { drawHexMap, drawRivers, drawRoads, drawMinorCivTerritory, drawHexHighlight, drawKeyboardCursor } from './hex-renderer';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { drawFogOfWar } from './fog-renderer';
import { drawUnitPresentations } from './unit-renderer';
import { drawCities } from './city-renderer';
import { AnimationSystem, type EffectAnimationData, type EffectAnimationType } from './animation-system';
import { onCanvasAssetReady } from './canvas-asset-ready';
import { beginPaintTracking, paintAmbientRegion, paintWasTimeVarying, type PaintBounds } from './paint-clock';
import { hexToPixel, hexKey } from '@/systems/hex-utils';
import { getHorizontalWrapRenderCoords, nearestWrappedCoord } from './wrap-rendering';
import { getVisibility } from '@/systems/fog-of-war';
import { createMovementAnimation, getMovementAnimationPosition, getMovingUnitIds, type UnitMovementAnimation } from './unit-movement-animation';
import { resolveUnitVisual } from './unit-visual-resolver';
import { drawUnitGlyph } from './unit-renderer';
import { spriteCache } from './sprites/sprite-loader';
import { LOD_SPRITE_ZOOM_THRESHOLD } from './sprites/sprite-system';
import type { WonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import { SpriteOverlay } from './sprite-overlay';
import type { SpriteEntity } from './sprite-overlay';
import { buildUnitMapPresentations } from './unit-map-presentation';
import { isCrisisForceOwner, isPirateOwner } from '@/core/owner-kind';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import {
  CIVTYPE_TO_FACTION,
  civTypeToFaction,
} from './civilization-visual-family';
import { buildTerrainLabelSuppressionSet } from './terrain-label-presentation';
import {
  buildPirateHeadquartersMapPresentation,
  buildPirateHeadquartersSpriteEntities,
  drawPirateHeadquartersMapPresentation,
  type PirateHeadquartersMapEntity,
} from './pirate-headquarters-presentation';
import { PirateSpriteStateController, DEATH_STATE_MS } from './pirate-sprite-state';
import type { CombatResult } from '@/core/types';
import {
  getWorldPressurePresentationForViewer,
  type WorldPressurePresentation,
} from '@/systems/world-pressure-presentation';
import {
  getLoyaltyPressurePresentationForViewer,
  type LoyaltyPressurePresentation,
} from '@/systems/loyalty-pressure-presentation';
import {
  getReligionBadgePresentationForViewer,
  type ReligionBadgePresentation,
} from '@/systems/religion-badge-presentation';
import { drawAirDefenseOverlay } from './air-defense-overlay';
import { drawSupplyOverlay } from './supply-overlay-renderer';
import { getSupplyOverlayPresentationForViewer, type SupplyOverlayPresentation } from '@/systems/supply-overlay-presentation';
import { drawStrategicLaunchPreviewOverlay } from './strategic-launch-overlay-renderer';
import type { StrategicLaunchPreviewPresentation } from '@/systems/strategic-launch-preview-presentation';
import { drawStampedeRouteOverlay } from './stampede-route-overlay';
import { getHerdRoutePresentationForViewer, type HerdRoutePresentation } from '@/systems/stampede-route-system';
import {
  getKnownAirDefenseProviders,
  type ResolvedAirDefenseProvider,
} from '@/systems/air-defense-system';

export { CIVTYPE_TO_FACTION, civTypeToFaction };

/** A shape cue so ZOC destinations remain distinct without relying on amber alone. */
export function drawZoneOfControlChevrons(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  ctx.save();
  ctx.strokeStyle = '#fff0a8';
  ctx.lineWidth = Math.max(1.5, size * 0.045);
  ctx.lineCap = 'round';
  for (const offset of [-0.18, 0, 0.18]) {
    const chevronY = y + offset * size;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.16, chevronY - size * 0.07);
    ctx.lineTo(x, chevronY + size * 0.07);
    ctx.lineTo(x + size * 0.16, chevronY - size * 0.07);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Not a pure function: mutates `pirateSpriteState` as a side effect (clears expired combat/pirate
 * transients on read, inside PirateSpriteStateController.resolve()). Calling this twice with the
 * same arguments in the same frame can return different results for the second call — call it
 * exactly once per frame, matching the real render loop's usage.
 */
export function buildUnitEntities(
  state: GameState,
  viewerId: string,
  viewerVisibility: VisibilityMap,
  movingUnitIds: ReadonlySet<string>,
  selectedUnitId: string | null = null,
  pirateSpriteState: PirateSpriteStateController,
  nowMs: number,
): SpriteEntity[] {
  return buildUnitMapPresentations(
    state,
    viewerId,
    viewerVisibility,
    movingUnitIds,
    selectedUnitId,
  ).map(presentation => {
    const faction = state.pirates?.factions[presentation.leadUnit.owner];
    // besieging shares blockading's sprite mode/tier (#522) -- the apex threat must
    // never render as indistinguishable from a harmless patrol.
    const persistentMode = faction?.behavior === 'besieging' || faction?.behavior === 'blockading'
      ? 'blockade' as const
      : faction?.behavior === 'raiding' ? 'raid' as const : 'patrol' as const;
    const visual = faction
      ? pirateSpriteState.resolve(presentation.leadUnitId, {
          mode: persistentMode,
          damage: presentation.damage as 0 | 1 | 2 | 3,
          tier: faction.behavior === 'besieging' || faction.behavior === 'blockading' ? 3 : faction.behavior === 'raiding' ? 2 : 1,
          stage: faction.maritimeStage,
        }, nowMs)
      : null;
    // Non-pirate units have no PirateSpriteVisualState (mode/tier/stage are pirate-only
    // concepts), but applyCombatVisual() records an attack/hurt/death transient for every
    // combat's attacker/defender unconditionally, pirate or not — this reads it back for
    // everyone else so the transient doesn't just expire unread.
    const combatState = visual?.state
      ?? pirateSpriteState.resolveTransientState(presentation.leadUnitId, nowMs);
    // A unit mid-way through a multi-turn improvement build shows a sustained "work" pose
    // (matching cq-work-bob/.cq-tool's infinite loop) whenever nothing more urgent (an
    // active combat transient) is already claiming its state -- combat always wins.
    const entityState = combatState === 'idle' && presentation.leadUnit.workerTask ? 'work' as const : combatState;
    return {
      id: presentation.leadUnitId,
      memberIds: presentation.memberIds,
      kind: 'unit' as const,
      subtype: presentation.leadUnit.type,
      coord: presentation.coord,
      state: entityState,
      faction: presentation.faction,
      damage: visual?.damage ?? presentation.damage,
      stackCount: presentation.stackCount,
      selected: presentation.isSelected,
      health: presentation.leadUnit.health,
      fortified: presentation.leadUnit.isFortified,
      roleMarker: presentation.roleMarker,
      anchorOffsetFactor: presentation.anchorOffsetFactor,
      civId: presentation.leadUnit.owner,
      ...(visual ? { mode: visual.mode, tier: visual.tier, stage: visual.stage } : {}),
    };
  });
}

type TimedMovementAnimation = UnitMovementAnimation & {
  startTime: number;
  detachedFromState?: boolean;
};

function movingUnitDamage(unit: Unit): 0 | 1 | 2 | 3 {
  if ((UNIT_DEFINITIONS[unit.type]?.strength ?? 0) === 0 || unit.health >= 76) return 0;
  if (unit.health >= 51) return 1;
  if (unit.health >= 26) return 2;
  return 3;
}

export function buildMovingUnitEntities(
  state: GameState,
  animations: TimedMovementAnimation[],
  nowMs: number,
  colorLookup: Record<string, string>,
  viewerVisibility: VisibilityMap,
): SpriteEntity[] {
  return animations.flatMap(animation => {
    if (getVisibility(viewerVisibility, animation.to) !== 'visible') return [];
    const authoritativeUnit = state.units[animation.unit.id];
    if (!animation.detachedFromState && (!authoritativeUnit || authoritativeUnit.owner !== animation.unit.owner)) {
      return [];
    }
    const progress = animation.duration <= 0
      ? 1
      : Math.max(0, Math.min(1, (nowMs - animation.startTime) / animation.duration));
    const frame = getMovementAnimationPosition(animation, progress);
    const unit = authoritativeUnit ?? animation.unit;
    const visual = resolveUnitVisual(state, unit, colorLookup, frame.motion);
    const civilization = state.civilizations[unit.owner];
    return [{
      id: unit.id,
      memberIds: [unit.id],
      kind: 'unit' as const,
      subtype: unit.type,
      coord: frame.coord,
      state: 'walk' as const,
      faction: isPirateOwner(unit.owner)
        ? 'pirates'
        : isCrisisForceOwner(unit.owner)
          ? 'crisis'
        : civilization ? civTypeToFaction(civilization.civType) : unit.owner,
      damage: movingUnitDamage(unit),
      stackCount: 1,
      health: unit.health,
      fortified: unit.isFortified,
      roleMarker: visual.roleMarker,
      civId: unit.owner,
    }];
  });
}

export function positionMovingPirateHeadquarters(
  state: GameState,
  entities: PirateHeadquartersMapEntity[],
  animations: TimedMovementAnimation[],
  nowMs: number,
): PirateHeadquartersMapEntity[] {
  return entities.map(entity => {
    if (entity.subtype !== 'deep-sea-flotilla' || entity.mode !== 'current') return entity;
    const headquarters = state.pirates?.factions[entity.factionId]?.headquarters;
    if (!headquarters || headquarters.kind !== 'deep-sea-flotilla') return entity;
    const animation = animations.find(candidate => candidate.unit.id === headquarters.flagshipUnitId);
    if (!animation) return entity;
    const progress = animation.duration <= 0
      ? 1
      : Math.max(0, Math.min(1, (nowMs - animation.startTime) / animation.duration));
    return {
      ...entity,
      coord: getMovementAnimationPosition(animation, progress).coord,
      behaviorMode: 'relocating',
    };
  });
}

export interface HexHighlight {
  coord: HexCoord;
  type: 'move' | 'attack' | 'air-strike' | 'air-recon' | 'air-patrol' | 'air-intercept' | 'zoc-limited' | 'water-recovery' | 'worker-buildable' | 'worker-owned-blocked' | 'worker-foreign-blocked' | 'paradrop-target' | 'paradrop-flak-risk' | 'air-assault-target' | 'air-assault-flak-risk' | 'supply-projected';
}

const HEX_HIGHLIGHT_COLORS: Record<HexHighlight['type'], string> = {
  move: 'rgba(74, 144, 217, 0.35)',
  attack: 'rgba(217, 74, 74, 0.45)',
  'air-strike': '#f97316',
  'air-recon': '#38bdf8',
  // Distinct hue from air-recon (cyan-teal vs sky-blue) and air-strike
  // (orange) -- cyan-teal reads as "search/scan," matching Air Assault's
  // own teal-for-a-support-verb precedent (#543) rather than reusing
  // air-recon's color for a mission that does more than plain recon.
  'air-patrol': '#0891b2',
  'air-intercept': '#eab308',
  'zoc-limited': 'rgba(245, 184, 73, 0.55)',
  'water-recovery': 'rgba(245, 184, 73, 0.55)',
  'worker-buildable': 'rgba(80, 200, 120, 0.45)',
  'worker-owned-blocked': 'rgba(232, 193, 112, 0.40)',
  'worker-foreign-blocked': 'rgba(217, 74, 74, 0.35)',
  // Deliberately hue-distinct (purple vs red) rather than a red/green pair,
  // which is the classic colorblind-confusion case -- but this map is a
  // flat color fill like every other highlight type in this file, with no
  // per-hex icon/glyph overlay anywhere in this rendering system. The
  // accompanying text notification (selection-controller.ts's
  // onStartParadrop) spells out what each color means in words, which is
  // the accommodation that's actually buildable here without adding a new
  // icon-overlay rendering feature this file doesn't have for any
  // highlight type today.
  'paradrop-target': '#7c3aed',
  'paradrop-flak-risk': '#dc2626',
  // Distinct hue from paradrop-target (teal vs purple) so the two verbs
  // read as different highlight types when a Paratrooper (eligible for
  // both) is selected in a city with both an Airfield and a Helicopter
  // Base -- same color-plus-text-notification convention as above, not a
  // new icon-overlay system.
  'air-assault-target': '#0d9488',
  'air-assault-flak-risk': '#dc2626',
  // Live projected supply coverage (#544 MR2) while a naval logistics unit or
  // fort-eligible Worker is selected -- distinct hue and lower opacity from
  // the persistent overlay's own 'full' fill, and paired with a solid
  // outline (below) since a selection highlight and the persistent overlay
  // never render the exact same tile indistinguishably.
  'supply-projected': 'rgba(80, 200, 120, 0.18)',
};

const HEX_HIGHLIGHT_OUTLINES: Partial<Record<HexHighlight['type'], string>> = {
  'zoc-limited': '#fff0a8',
  'water-recovery': '#fff0a8',
  'supply-projected': '#8fe8b0',
};

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Subscribe to a media query, preferring the modern `addEventListener` pair and falling back to the
 * legacy `addListener` pair. Exactly one of them is registered, so a change never fires the listener
 * twice. Returns an unsubscribe function; a no-op when there is no `matchMedia` (unit tests, SSR).
 */
function observeMediaQuery(query: string, listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mediaQuery = window.matchMedia(query);
  if (typeof mediaQuery.addEventListener === 'function') {
    const handler = (): void => listener();
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }
  if (typeof mediaQuery.addListener === 'function') {
    const handler = (): void => listener();
    mediaQuery.addListener(handler);
    return () => mediaQuery.removeListener(handler);
  }
  return () => {};
}

/**
 * Watch an element's rendered size. `ResizeObserver` owns it when it is available; a `window` resize
 * listener is the fallback for engines that lack it. Returns a release function for whichever was used.
 */
function observeElementSize(target: Element, onResize: () => void): () => void {
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => onResize());
    observer.observe(target);
    return () => observer.disconnect();
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const handler = (): void => onResize();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }
  return () => {};
}

export class RenderLoop {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  /** DPR currently baked into the context transform; 0 until the first resize so it is always applied once. */
  private appliedDpr = 0;
  /** Canvas CSS size the current backing store and camera viewport were built from; -1 until the first resize. */
  private appliedCssWidth = -1;
  private appliedCssHeight = -1;
  /** Releases the canvas-size observer (ResizeObserver, or the window-resize fallback). */
  private resizeObserverDisconnect: (() => void) | null = null;
  /** Releases the current device-pixel-ratio media query; re-armed whenever the ratio changes. */
  private dprQueryUnsubscribe: (() => void) | null = null;
  readonly camera: Camera;
  /** Timed effects. Private: enroll through `playEffect` so enrollment always invalidates. */
  private readonly timeline: AnimationSystem;
  private generation = 0;
  private readonly unsubscribers: Array<() => void> = [];
  private state: GameState | null = null;
  // Computed once per setGameState (not per animation frame) -- see
  // getWorldPressurePresentationForViewer's own doc comment for the cost this avoids.
  private worldPressurePresentation: WorldPressurePresentation = { cityBadges: [], statusLinesByCivId: {} };
  private herdRoutePresentation: HerdRoutePresentation = { routes: [] };
  // #593 MR6: same per-setGameState caching convention as worldPressurePresentation above.
  private loyaltyPressurePresentation: LoyaltyPressurePresentation = { cityBadges: [] };
  // #594 MR7: same per-setGameState caching convention as worldPressurePresentation above.
  private religionBadgePresentation: ReligionBadgePresentation = { cityBadges: [] };
  private running = false;
  /** Pending requestAnimationFrame handle; 0 when no frame is queued. */
  private animFrameId = 0;
  /** Deadline wake: completes timed work and repaints even if no animation frame is delivered. */
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private highlights: HexHighlight[] = [];
  private journeyPath: HexCoord[] | null = null;
  /** #1459: the keyboard map cursor; null when the player is not using the keyboard on the map. */
  private keyboardCursor: HexCoord | null = null;
  private unitMovementAnimations: Array<UnitMovementAnimation & {
    startTime: number;
    onComplete?: () => void;
    detachedFromState?: boolean;
  }> = [];
  private spriteOverlay: SpriteOverlay | null = null;
  private touchHandlerRef: { isPinching: boolean } | null = null;
  private pinchUnsubscribe: (() => void) | null = null;
  /** Generation at the last DOM-overlay sync; -1 until the first sync. */
  private lastSyncedGeneration = -1;
  /** Set when time-bound work (a death snapshot) retired and the overlay must drop it. */
  private overlayStale = false;
  /** Generation the last paint started from; -1 until the first paint. */
  private lastPaintedGeneration = -1;
  /** Regions the last paint's time-varying content occupies; null when it had none or any was unbounded. */
  private lastAmbientRegion: readonly PaintBounds[] | null = null;
  private fullPaintCount = 0;
  private ambientPaintCount = 0;
  private selectedUnitId: string | null = null;
  private selectedPirateFactionId: string | null = null;
  private airDefenseOverlayEnabledByViewer = new Map<string, boolean>();
  // Viewer-scoped and refreshed with each authoritative state commit, so render frames
  // reuse the same fog-safe provider list instead of rebuilding it from game state.
  private airDefenseOverlayProviders: ResolvedAirDefenseProvider[] = [];

  toggleAirDefenseOverlay(): boolean {
    const viewerId = this.state?.currentPlayer;
    if (!viewerId) return false;
    const enabled = !this.airDefenseOverlayEnabledByViewer.get(viewerId);
    this.airDefenseOverlayEnabledByViewer.set(viewerId, enabled);
    this.invalidate();
    return enabled;
  }

  isAirDefenseOverlayEnabled(viewerId = this.state?.currentPlayer): boolean {
    return viewerId !== undefined && this.airDefenseOverlayEnabledByViewer.get(viewerId) === true;
  }

  // #544 MR2: same per-viewer toggle convention as airDefenseOverlayEnabledByViewer
  // above -- each hot-seat player's overlay preference persists independently
  // across handoffs instead of one flag leaking between players.
  private supplyOverlayEnabledByViewer = new Map<string, boolean>();
  private supplyOverlayPresentation: SupplyOverlayPresentation = { tiles: [], sources: [] };

  toggleSupplyOverlay(): boolean {
    const viewerId = this.state?.currentPlayer;
    if (!viewerId) return false;
    const enabled = !this.supplyOverlayEnabledByViewer.get(viewerId);
    this.supplyOverlayEnabledByViewer.set(viewerId, enabled);
    if (enabled && this.state) {
      this.supplyOverlayPresentation = getSupplyOverlayPresentationForViewer(this.state, viewerId);
    }
    this.invalidate();
    return enabled;
  }

  isSupplyOverlayEnabled(viewerId = this.state?.currentPlayer): boolean {
    return viewerId !== undefined && this.supplyOverlayEnabledByViewer.get(viewerId) === true;
  }

  private strategicLaunchPreview: StrategicLaunchPreviewPresentation | null = null;

  /** #545 MR4: set by strategic-launch-flow.ts on stage-2 entry, cleared on
   * stage-2 exit (cancel, back, or advancing to stage 3) and on flow close. */
  setStrategicLaunchPreview(presentation: StrategicLaunchPreviewPresentation | null): void {
    this.strategicLaunchPreview = presentation;
    this.invalidate();
  }
  private pirateSpriteState = new PirateSpriteStateController();
  private pirateUnitDeathSnapshots = new Map<string, { unit: Unit; expiresAtMs: number }>();
  private pirateLandmarkDeathSnapshots = new Map<string, {
    entity: ReturnType<typeof buildPirateHeadquartersMapPresentation>['entities'][number];
    expiresAtMs: number;
  }>();

  setTouchHandler(th: { isPinching: boolean; onPinchChange?(listener: () => void): () => void }): void {
    this.pinchUnsubscribe?.();
    this.touchHandlerRef = th;
    this.pinchUnsubscribe = th.onPinchChange?.(() => this.invalidate()) ?? null;
    this.invalidate();
  }

  setSelectedUnitId(unitId: string | null): void {
    this.selectedUnitId = unitId;
    this.invalidate();
  }

  setSelectedPirateFactionId(factionId: string | null): void {
    this.selectedPirateFactionId = factionId;
    this.invalidate();
  }

  /** Brief "work" pulse for a unit that just performed its civilian action (e.g. a
   * trade-line unit delivering goods on route arrival) -- same transient mechanism
   * as applyCombatVisual's attack/hurt, just a different trigger. */
  applyDeliveryVisual(unitId: string, nowMs = performance.now()): void {
    this.pirateSpriteState.apply({ type: 'work', entityId: unitId }, nowMs);
    this.invalidate();
  }

  applyCombatVisual(result: CombatResult, nowMs = performance.now()): void {
    this.pirateSpriteState.apply({ type: 'combat', ...result }, nowMs);
    this.invalidate();
    if (!this.state) return;
    for (const [unitId, survived] of [
      [result.attackerId, result.attackerSurvived],
      [result.defenderId, result.defenderSurvived],
    ] as const) {
      const unit = this.state.units[unitId];
      if (!survived && unit && isPirateOwner(unit.owner)) {
        this.pirateUnitDeathSnapshots.set(unitId, { unit: { ...unit }, expiresAtMs: nowMs + DEATH_STATE_MS });
      }
    }
  }

  applyPirateHeadquartersAssaultVisual(
    factionId: string,
    unitId: string,
    options: { destroyed: boolean; attackerSurvived: boolean },
    nowMs = performance.now(),
  ): void {
    const entityId = `pirate-headquarters-${factionId}`;
    this.pirateSpriteState.apply({
      type: options.destroyed ? 'destroyed' : 'hurt',
      entityId,
    }, nowMs);
    if (!options.attackerSurvived) {
      this.pirateSpriteState.apply({ type: 'destroyed', entityId: unitId }, nowMs);
    } else {
      this.pirateSpriteState.apply({ type: 'hurt', entityId: unitId }, nowMs);
    }
    this.invalidate();
    if (!options.destroyed || !this.state) return;
    const entity = buildPirateHeadquartersMapPresentation(
      this.state,
      this.state.currentPlayer,
      factionId,
    ).entities.find(candidate => candidate.factionId === factionId);
    if (entity) this.pirateLandmarkDeathSnapshots.set(entityId, { entity, expiresAtMs: nowMs + DEATH_STATE_MS });
  }

  setHighlights(highlights: HexHighlight[]): void {
    this.highlights = highlights;
    this.invalidate();
  }

  clearHighlights(): void {
    this.highlights = [];
    this.invalidate();
  }

  setKeyboardCursor(coord: HexCoord | null): void {
    this.keyboardCursor = coord ? { ...coord } : null;
    this.invalidate();
  }

  setJourneyPath(path: HexCoord[] | null): void {
    this.journeyPath = path;
    this.invalidate();
  }

  requestWonderDiscoveryHighlight(
    coord: HexCoord,
    visual: WonderVisualDefinition,
    options: { reducedMotion: boolean },
  ): void {
    this.camera.centerOn(coord);
    this.playEffect(
      options.reducedMotion ? 'wonder-discovery-static-highlight' : 'wonder-discovery-pulse',
      900,
      {
        coord,
        accent: visual.palette.accent,
        glow: visual.palette.glow,
      },
    );
  }

  animateUnitMove(unit: Unit, path: HexCoord[], onComplete?: () => void): void {
    this.queueUnitMovement(unit, path, onComplete, false);
  }

  private queueUnitMovement(
    unit: Unit,
    path: HexCoord[],
    onComplete: (() => void) | undefined,
    detachedFromState: boolean,
  ): void {
    if (!this.state || path.length < 2) {
      onComplete?.();
      return;
    }
    this.unitMovementAnimations.push({
      ...createMovementAnimation(unit, path, this.state.map),
      startTime: performance.now(),
      onComplete,
      detachedFromState,
    });
    this.invalidate();
  }

  /**
   * Slide a unit from its current position to `destination` in one step.
   * Used for boarding animations: the unit has already been removed from
   * game state (loaded onto the transport), so only the animation renders it.
   */
  animateUnitSlide(unit: Unit, destination: HexCoord): void {
    this.queueUnitMovement(unit, [unit.position, destination], undefined, true);
  }

  /**
   * Flash a teal expanding ring at `position` to signal a unit disembarking.
   * Skipped when the user prefers reduced motion.
   */
  animateUnitAppear(position: HexCoord): void {
    if (prefersReducedMotion()) return;
    this.playEffect('disembark-flash', 500, { coord: position });
  }

  /** The only way to enroll a timed effect: enrollment wakes the renderer. */
  playEffect(
    type: EffectAnimationType,
    duration: number,
    data: EffectAnimationData,
    onComplete?: () => void,
  ): string {
    const id = this.timeline.add(type, duration, data, onComplete);
    this.invalidate();
    return id;
  }

  /** Monotonic count of canvas-visible input changes; the scheduler repaints when it moves. */
  get renderGeneration(): number {
    return this.generation;
  }

  /** Every canvas-visible input change lands here: bump the generation and make sure a frame is coming. */
  private invalidate(): void {
    this.generation++;
    this.requestFrame();
    this.armWakeTimer();
  }

  private requestFrame(): void {
    if (!this.running || this.animFrameId) return;
    this.animFrameId = requestAnimationFrame(this.tick);
  }

  /** Release camera / asset / runtime-environment subscriptions. Safe to call more than once. */
  dispose(): void {
    this.stop();
    this.pinchUnsubscribe?.();
    this.pinchUnsubscribe = null;
    this.resizeObserverDisconnect?.();
    this.resizeObserverDisconnect = null;
    this.dprQueryUnsubscribe?.();
    this.dprQueryUnsubscribe = null;
    for (const off of this.unsubscribers.splice(0)) off();
  }

  hasMovingUnit(unitId: string): boolean {
    return this.unitMovementAnimations.some(animation => animation.unit.id === unitId);
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.camera = new Camera();
    this.unsubscribers.push(
      this.camera.onChange(() => this.invalidate()),
      onCanvasAssetReady(() => this.invalidate()),
      // #1439: a runtime reduced-motion change alters canvas and DOM-sprite presentation, so it must
      // wake an idle loop. The paint reads the live preference, so one bounded repaint is enough.
      observeMediaQuery(REDUCED_MOTION_QUERY, () => this.invalidate()),
    );
    this.timeline = new AnimationSystem();
    this.resizeCanvas();
    this.resizeObserverDisconnect = observeElementSize(canvas, () => this.onCanvasMetricsChanged());
    this.observeDevicePixelRatio();
    // Mount the sprite overlay — guarded for test environments without DOM
    if (typeof document !== 'undefined') {
      const mountPoint = canvas.parentElement ?? document.body;
      this.spriteOverlay = new SpriteOverlay(mountPoint);
    }
  }

  /**
   * Bring the backing store, the context transform and the camera viewport in line with the canvas's
   * current CSS size and the current device pixel ratio, then repaint. `resizeCanvas` is a real canvas
   * input (a window resize, the HUD, the tests' forced repaint) and keeps the historical contract that
   * it always invalidates. The backing store itself is only re-sized when its effective device-pixel
   * size actually moved, so repeated calls never reallocate or compound the DPR scale. The observer
   * path additionally dedupes no-op notifications through `onCanvasMetricsChanged`.
   */
  resizeCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const backingWidth = Math.round(rect.width * dpr);
    const backingHeight = Math.round(rect.height * dpr);
    let backingChanged = false;
    if (this.canvas.width !== backingWidth) {
      this.canvas.width = backingWidth;
      backingChanged = true;
    }
    if (this.canvas.height !== backingHeight) {
      this.canvas.height = backingHeight;
      backingChanged = true;
    }
    // Assigning width/height clears the context transform, so re-apply the DPR scale whenever the
    // backing store was resized or the ratio itself moved. `setTransform` replaces rather than
    // compounds, so the canvas never ends up double-scaled.
    if (backingChanged || this.appliedDpr !== dpr) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // The camera works in CSS pixels, not device pixels.
    if (this.camera.width !== rect.width || this.camera.height !== rect.height) {
      this.camera.setViewport(rect.width, rect.height);
    }
    this.appliedDpr = dpr;
    this.appliedCssWidth = rect.width;
    this.appliedCssHeight = rect.height;
    this.invalidate();
  }

  /**
   * The canvas-size observer's dedupe. A ResizeObserver can fire with an unchanged content box (and
   * some engines fire once as soon as `observe` is called), so only a genuine CSS-size or DPR change is
   * forwarded to `resizeCanvas`. This is what keeps an untouched, idle campaign from repainting on a
   * no-op notification (#1439).
   */
  private onCanvasMetricsChanged(): void {
    if (typeof window === 'undefined') return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === this.appliedCssWidth && rect.height === this.appliedCssHeight && dpr === this.appliedDpr) {
      return;
    }
    this.resizeCanvas();
  }

  /**
   * Watch for a device-pixel-ratio change (a monitor move, browser zoom). The resolution media query is
   * pinned to the current ratio, so it is re-armed after every change; the change itself only resizes
   * the backing store. Nothing is scheduled while the ratio is unchanged.
   */
  private observeDevicePixelRatio(): void {
    this.dprQueryUnsubscribe?.();
    this.dprQueryUnsubscribe = null;
    if (typeof window === 'undefined') return;
    const dpr = window.devicePixelRatio || 1;
    this.dprQueryUnsubscribe = observeMediaQuery(`(resolution: ${dpr}dppx)`, () => {
      this.resizeCanvas();
      this.observeDevicePixelRatio();
    });
  }

  setGameState(state: GameState): void {
    this.state = state;
    this.invalidate();
    this.worldPressurePresentation = getWorldPressurePresentationForViewer(state, state.currentPlayer);
    this.herdRoutePresentation = getHerdRoutePresentationForViewer(state, state.currentPlayer);
    this.loyaltyPressurePresentation = getLoyaltyPressurePresentationForViewer(state, state.currentPlayer);
    this.religionBadgePresentation = getReligionBadgePresentationForViewer(state, state.currentPlayer);
    this.airDefenseOverlayProviders = getKnownAirDefenseProviders(state, state.currentPlayer);
    // #544 MR2: unlike the unconditional presentations above, this one can be
    // a full-territory-tile scan, so it's only recomputed when the current
    // viewer actually has the overlay toggled on.
    if (this.isSupplyOverlayEnabled(state.currentPlayer)) {
      this.supplyOverlayPresentation = getSupplyOverlayPresentationForViewer(state, state.currentPlayer);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.paintFrame();
  }

  stop(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
    this.clearWakeTimer();
  }

  private tick = (): void => {
    this.animFrameId = 0;
    if (!this.running) return;
    this.paintFrame();
  };

  /**
   * One scheduled frame: settle camera inertia, advance time-dependent work, paint, then decide
   * whether anything still needs frames. The generation is read before painting, so an
   * invalidation raised during the paint (or by a completion callback) is never erased: it keeps
   * the generation ahead of the snapshot and queues another frame.
   */
  private paintFrame(): void {
    this.camera.applyInertia();
    const paintedGeneration = this.generation;
    const ambientRegion = this.ambientOnlyRegion(paintedGeneration);
    beginPaintTracking();
    if (ambientRegion) this.renderAmbientRegion(ambientRegion);
    else {
      this.fullPaintCount++;
      this.render();
    }
    this.lastPaintedGeneration = paintedGeneration;
    this.lastAmbientRegion = paintAmbientRegion();
    const needsFrames = this.generation !== paintedGeneration
      || this.camera.isMoving()
      || this.unitMovementAnimations.length > 0
      || this.timeline.hasActive()
      || paintWasTimeVarying();
    this.armWakeTimer();
    if (needsFrames) this.requestFrame();
  }

  /**
   * The regions an ambient-only frame may repaint, or null when this frame must be a full paint.
   * It is ambient-only exactly when the previous paint left every canvas input untouched (same
   * generation, so no camera, state, presentation, asset or size change since) and everything
   * time-bound is quiet, so the only thing that differs from the pixels already on screen is the
   * bounded ambient motion the previous paint reported (#1439 phase 3).
   */
  private ambientOnlyRegion(generation: number): readonly PaintBounds[] | null {
    const region = this.lastAmbientRegion;
    if (!region || !this.state) return null;
    if (generation !== this.lastPaintedGeneration || this.camera.isMoving()) return null;
    if (this.unitMovementAnimations.length > 0 || this.timeline.hasActive()) return null;
    if (this.overlayStale || this.pirateSpriteState.nextExpiryMs() !== null) return null;
    if (this.pirateUnitDeathSnapshots.size > 0 || this.pirateLandmarkDeathSnapshots.size > 0) return null;
    return region;
  }

  /**
   * Runs the unchanged full paint pipeline clipped to the ambient regions. The clip makes every
   * pixel outside them untouched (so the previous frame stays), and every pixel inside them is
   * produced by the same z-ordered draw sequence a full paint would run, so the result is
   * identical to a full paint at this instant.
   */
  private renderAmbientRegion(region: readonly PaintBounds[]): void {
    const dpr = window.devicePixelRatio || 1;
    this.ambientPaintCount++;
    this.ctx.save();
    this.ctx.beginPath();
    for (const bounds of region) {
      // Align outward to whole device pixels so antialiased edges are never half-clipped.
      const x0 = Math.floor(bounds.x0 * dpr) / dpr - 1;
      const y0 = Math.floor(bounds.y0 * dpr) / dpr - 1;
      const x1 = Math.ceil(bounds.x1 * dpr) / dpr + 1;
      const y1 = Math.ceil(bounds.y1 * dpr) / dpr + 1;
      this.ctx.rect(x0, y0, x1 - x0, y1 - y0);
    }
    this.ctx.clip();
    try {
      this.render();
    } finally {
      this.ctx.restore();
    }
  }

  /** Diagnostics: how many paints ran the whole canvas versus only the ambient regions. */
  get paintCounts(): { full: number; ambient: number } {
    return { full: this.fullPaintCount, ambient: this.ambientPaintCount };
  }

  /**
   * Earliest moment any timed work expires: a movement tween, a timed effect, a pirate death
   * snapshot or a sprite-state transient. Null when nothing is time-bound.
   */
  private nextDeadlineMs(): number | null {
    const candidates: number[] = [];
    for (const animation of this.unitMovementAnimations) {
      candidates.push(animation.startTime + animation.duration);
    }
    const effect = this.timeline.nextDeadline();
    if (effect !== null) candidates.push(effect);
    for (const snapshot of this.pirateUnitDeathSnapshots.values()) candidates.push(snapshot.expiresAtMs);
    for (const snapshot of this.pirateLandmarkDeathSnapshots.values()) candidates.push(snapshot.expiresAtMs);
    const transient = this.pirateSpriteState.nextExpiryMs();
    if (transient !== null) candidates.push(transient);
    return candidates.length === 0 ? null : Math.min(...candidates);
  }

  private clearWakeTimer(): void {
    if (this.wakeTimer !== null) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }
  }

  /** Schedule the wake for the next deadline. Completion must not depend on a frame being delivered. */
  private armWakeTimer(): void {
    this.clearWakeTimer();
    if (!this.running) return;
    const deadline = this.nextDeadlineMs();
    if (deadline === null) return;
    const delay = Math.max(0, deadline - performance.now()) + 1;
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      if (!this.running) return;
      this.advance(performance.now());
      this.invalidate();
      if (!this.animFrameId) this.armWakeTimer();
    }, delay);
  }

  /**
   * Time-driven lifecycle, separate from drawing: completes movement tweens and timed effects
   * (firing their callbacks exactly once) and retires expired pirate death snapshots. Runs at the
   * top of every paint and from the deadline wake, so skipping a paint can never strand it.
   */
  private advance(nowMs: number): void {
    this.timeline.advance(nowMs);
    for (const [unitId, snapshot] of this.pirateUnitDeathSnapshots) {
      if (snapshot.expiresAtMs <= nowMs) {
        this.pirateUnitDeathSnapshots.delete(unitId);
        this.overlayStale = true;
      }
    }
    for (const [entityId, snapshot] of this.pirateLandmarkDeathSnapshots) {
      if (snapshot.expiresAtMs <= nowMs) {
        this.pirateLandmarkDeathSnapshots.delete(entityId);
        this.overlayStale = true;
      }
    }
    this.advanceUnitMovements(nowMs);
  }

  private render(): void {
    if (!this.state) return;
    // Read before advancing: a completion callback that invalidates must force the next sync.
    const generationAtPaint = this.generation;
    this.advance(performance.now());
    const viewerId = this.state.currentPlayer;
    const viewerVisibility = this.state.civilizations[viewerId]?.visibility;
    const viewerTechs = new Set<string>(
      this.state.civilizations[viewerId]?.techState?.completed ?? []
    );

    const { width, height } = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, width, height);

    // Background
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, width, height);

    // Draw hex map
    const villagePositions = new Set(
      Object.values(this.state.tribalVillages ?? {}).map(v => `${v.position.q},${v.position.r}`),
    );
    const beastLairGlyphs = this.state.beasts
      ? new Map(
          Object.values(this.state.beasts.lairs).map(lair => [
            `${lair.position.q},${lair.position.r}`,
            lair.status === 'slain' || lair.status === 'claimed' ? '🏆' : '🐾',
          ]),
        )
      : undefined;
    const movingUnitIds = new Set(getMovingUnitIds(this.unitMovementAnimations));
    const unitPresentations = viewerVisibility
      ? buildUnitMapPresentations(
          this.state,
          viewerId,
          viewerVisibility,
          movingUnitIds,
          this.selectedUnitId,
        )
      : [];
    const pirateHeadquartersPresentation = buildPirateHeadquartersMapPresentation(
      this.state,
      viewerId,
      this.selectedPirateFactionId,
    );
    const movingVisibleCoords = viewerVisibility
      ? this.unitMovementAnimations.flatMap(animation => [animation.from, animation.to])
          .filter(coord => getVisibility(viewerVisibility, coord) !== 'unexplored')
      : [];
    const terrainLabelSuppressedCoords = buildTerrainLabelSuppressionSet({
      state: this.state,
      viewerId,
      visibleUnitCoords: [
        ...unitPresentations.map(presentation => presentation.coord),
        ...movingVisibleCoords,
        ...pirateHeadquartersPresentation.entities.map(entity => entity.coord),
      ],
      villagePositions,
      beastLairPositions: new Set(beastLairGlyphs?.keys() ?? []),
      viewerTechs,
    });
    const completedTechsByCiv = Object.fromEntries(
      Object.entries(this.state.civilizations).map(([id, civ]) => [id, civ.techState?.completed ?? []]),
    );
    drawHexMap(
      this.ctx,
      this.state.map,
      this.camera,
      villagePositions,
      beastLairGlyphs,
      viewerId,
      viewerVisibility,
      viewerTechs,
      terrainLabelSuppressedCoords,
      this.state.turn,
      completedTechsByCiv,
    );

    // Draw rivers
    drawRivers(this.ctx, this.state.map, this.camera, viewerVisibility);

    // Draw roads (overlay, drawn under units — see drawUnits below)
    const cityTileKeys = new Set(Object.values(this.state.cities).map(city => hexKey(city.position)));
    drawRoads(this.ctx, this.state.map, this.camera, cityTileKeys, viewerVisibility, completedTechsByCiv);
    if (this.isAirDefenseOverlayEnabled(viewerId)) {
      drawAirDefenseOverlay(this.ctx, this.camera, this.state.map, this.airDefenseOverlayProviders);
    }
    drawStampedeRouteOverlay(this.ctx, this.camera, this.herdRoutePresentation.routes);

    // Draw minor civ territory
    if (this.state.minorCivs) {
      for (const mc of Object.values(this.state.minorCivs)) {
        if (mc.isDestroyed) continue;
        const city = this.state.cities[mc.cityId];
        if (!city) continue;
        const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
        if (!def) continue;
        drawMinorCivTerritory(
          this.ctx,
          city.position,
          def.color,
          this.camera,
          this.state.map.width,
          this.state.map.wrapsHorizontally,
          viewerVisibility,
          viewerId,
          mc.id,
        );
      }
    }

    // Draw movement/attack highlights (behind units and cities)
    for (const highlight of this.highlights) {
      const renderCoords = this.state.map.wrapsHorizontally
        ? getHorizontalWrapRenderCoords(highlight.coord, this.state.map.width, this.camera)
        : [highlight.coord];

      for (const renderCoord of renderCoords) {
        if (!this.camera.isHexVisible(renderCoord)) continue;
        const pixel = hexToPixel(renderCoord, this.camera.hexSize);
        const screen = this.camera.worldToScreen(pixel.x, pixel.y);
        const scaledSize = this.camera.hexSize * this.camera.zoom;
        const color = HEX_HIGHLIGHT_COLORS[highlight.type];
        const outline = HEX_HIGHLIGHT_OUTLINES[highlight.type];
        drawHexHighlight(this.ctx, screen.x, screen.y, scaledSize, color, outline);
        if (highlight.type === 'zoc-limited') {
          drawZoneOfControlChevrons(this.ctx, screen.x, screen.y, scaledSize);
        }
      }
    }

    // Draw journey path overlay. Seam-crossing steps are unwrapped into a
    // pixel-continuous polyline, then drawn once per visible wrap copy.
    if (this.journeyPath && this.journeyPath.length >= 2) {
      const renderPath: HexCoord[] = [this.journeyPath[0]!];
      for (let i = 1; i < this.journeyPath.length; i++) {
        renderPath.push(
          this.state.map.wrapsHorizontally
            ? nearestWrappedCoord(renderPath[i - 1]!, this.journeyPath[i]!, this.state.map.width)
            : this.journeyPath[i]!,
        );
      }
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255, 200, 50, 0.8)';
      this.ctx.lineWidth = 3;
      this.ctx.setLineDash([6, 4]);
      for (const offset of this.visibleWrapOffsets(renderPath)) {
        this.ctx.beginPath();
        let started = false;
        for (const coord of renderPath) {
          const pixel = hexToPixel({ q: coord.q + offset, r: coord.r }, this.camera.hexSize);
          const screen = this.camera.worldToScreen(pixel.x, pixel.y);
          if (!started) { this.ctx.moveTo(screen.x, screen.y); started = true; }
          else { this.ctx.lineTo(screen.x, screen.y); }
        }
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    // #1459: keyboard cursor ring -- a dark under-stroke plus a bright stroke so it reads on any terrain.
    if (this.keyboardCursor) {
      const cursorCoords = this.state.map.wrapsHorizontally
        ? getHorizontalWrapRenderCoords(this.keyboardCursor, this.state.map.width, this.camera)
        : [this.keyboardCursor];
      for (const renderCoord of cursorCoords) {
        if (!this.camera.isHexVisible(renderCoord)) continue;
        const pixel = hexToPixel(renderCoord, this.camera.hexSize);
        const screen = this.camera.worldToScreen(pixel.x, pixel.y);
        drawKeyboardCursor(this.ctx, screen.x, screen.y, this.camera.hexSize * this.camera.zoom);
      }
    }

    // Draw cities
    drawCities(this.ctx, this.state, this.camera, viewerId, {
      reducedMotion: prefersReducedMotion(),
      nowMs: performance.now(),
      worldPressurePresentation: this.worldPressurePresentation,
      loyaltyPressurePresentation: this.loyaltyPressurePresentation,
      religionBadgePresentation: this.religionBadgePresentation,
    });

    // Draw trade route lines (after cities, before units)
    this.drawTradeRouteLines(viewerId);

    // Prepare and draw units. Static high-zoom stacks may use DOM; movement stays Canvas below fog.
    if (viewerVisibility) {
      const colorLookup: Record<string, string> = { barbarian: '#8b4513' };
      for (const [id, civ] of Object.entries(this.state.civilizations)) {
        colorLookup[id] = civ.color;
      }
      // Add minor civ colors
      for (const mc of Object.values(this.state.minorCivs ?? {})) {
        const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
        if (def) colorLookup[mc.id] = def.color;
      }
      const nowMs = performance.now();
      // The DOM overlay's entity set only changes with an input (generation) or while a movement
      // tween is live. A frame kept alive purely by an ambient canvas animation reuses the last
      // sync (its active ids still gate the canvas draws) instead of rewriting the DOM.
      const syncOverlay = this.generation !== this.lastSyncedGeneration
        || this.unitMovementAnimations.length > 0
        || this.overlayStale
        || this.pirateSpriteState.nextExpiryMs() !== null
        || this.pirateUnitDeathSnapshots.size > 0
        || this.pirateLandmarkDeathSnapshots.size > 0
        || this.spriteOverlay === null;
      if (syncOverlay) {
      const unitEntities = buildUnitEntities(
        this.state,
        viewerId,
        viewerVisibility,
        movingUnitIds,
        this.selectedUnitId,
        this.pirateSpriteState,
        nowMs,
      );
      for (const [unitId, snapshot] of this.pirateUnitDeathSnapshots) {
        if (snapshot.expiresAtMs <= nowMs) continue;
        if (getVisibility(viewerVisibility, snapshot.unit.position) !== 'visible') continue;
        unitEntities.push({
          id: unitId,
          memberIds: [unitId],
          kind: 'unit',
          subtype: snapshot.unit.type,
          coord: snapshot.unit.position,
          state: 'death',
          faction: 'pirates',
          damage: 3,
          stackCount: 1,
          selected: false,
          health: 0,
          fortified: false,
          roleMarker: 'chevron',
          anchorOffsetFactor: { x: 0, y: 0 },
          civId: snapshot.unit.owner,
        });
      }
      const movingUnitEntities = buildMovingUnitEntities(
        this.state,
        this.unitMovementAnimations,
        nowMs,
        colorLookup,
        viewerVisibility,
      );
      const landmarkPresentationEntities = positionMovingPirateHeadquarters(
        this.state,
        pirateHeadquartersPresentation.entities,
        this.unitMovementAnimations,
        nowMs,
      );
      for (const [entityId, snapshot] of this.pirateLandmarkDeathSnapshots) {
        if (snapshot.expiresAtMs <= nowMs) continue;
        if (!landmarkPresentationEntities.some(entity => entity.id === entityId)) {
          landmarkPresentationEntities.push(snapshot.entity);
        }
      }
      const landmarkEntities = buildPirateHeadquartersSpriteEntities(
        this.state,
        landmarkPresentationEntities,
        this.pirateSpriteState,
        nowMs,
      );
      this.spriteOverlay?.sync(
        this.camera,
        [...unitEntities, ...movingUnitEntities, ...landmarkEntities],
        {
          width: this.state.map.width,
          wrapsHorizontally: this.state.map.wrapsHorizontally,
        },
        {
          isPinching: this.touchHandlerRef?.isPinching ?? false,
          reducedMotion: prefersReducedMotion(),
        },
        colorLookup,
      );
      this.lastSyncedGeneration = generationAtPaint;
      this.overlayStale = false;
      }
      drawPirateHeadquartersMapPresentation(
        this.ctx,
        { entities: pirateHeadquartersPresentation.entities, regions: [] },
        this.camera,
        this.state.map,
        this.spriteOverlay?.getActiveIds() ?? new Set(),
      );
      drawUnitPresentations(
        this.ctx,
        unitPresentations,
        this.camera,
        this.state,
        colorLookup,
        this.spriteOverlay?.getActiveIds() ?? new Set(),
      );
      this.drawUnitMovementAnimations(
        nowMs,
        colorLookup,
        viewerVisibility,
        this.spriteOverlay?.getActiveIds() ?? new Set(),
      );
    } else {
      this.spriteOverlay?.sync(
        this.camera,
        [],
        { width: this.state.map.width, wrapsHorizontally: this.state.map.wrapsHorizontally },
        { isPinching: false, reducedMotion: prefersReducedMotion() },
      );
    }

    // Draw the toggleable supply overlay (#544 MR2), before fog so fog's own
    // dimming still reads correctly over any tile the overlay covers.
    if (this.isSupplyOverlayEnabled(viewerId)) {
      drawSupplyOverlay(
        this.ctx,
        this.supplyOverlayPresentation,
        this.state.map.width,
        this.state.map.height,
        this.camera,
        this.state.map.wrapsHorizontally,
      );
    }

    // #545 MR4: the strategic-launch stage-2 target/preview overlay, same
    // before-fog placement as the supply overlay above.
    if (this.strategicLaunchPreview) {
      drawStrategicLaunchPreviewOverlay(
        this.ctx,
        this.strategicLaunchPreview,
        this.state.map.width,
        this.state.map.height,
        this.camera,
        this.state.map.wrapsHorizontally,
      );
    }

    // Draw fog of war
    if (viewerVisibility) {
      drawFogOfWar(
        this.ctx,
        viewerVisibility,
        this.state.map.width,
        this.state.map.height,
        this.camera,
        this.state.map.wrapsHorizontally,
      );
    }

    drawPirateHeadquartersMapPresentation(
      this.ctx,
      { entities: [], regions: pirateHeadquartersPresentation.regions },
      this.camera,
      this.state.map,
    );

    // Draw animations (world-anchored: screen position derives from the camera each frame)
    this.timeline.draw(this.ctx, this.camera, this.state.map, performance.now());

  }

  /** Retire finished or orphaned movement tweens and fire their callbacks exactly once (#1039). */
  private advanceUnitMovements(nowMs: number): void {
    if (this.unitMovementAnimations.length === 0) return;
    const remaining: typeof this.unitMovementAnimations = [];
    const completedCallbacks: Array<() => void> = [];
    for (const animation of this.unitMovementAnimations) {
      const authoritativeUnit = this.state?.units[animation.unit.id];
      const orphaned = !animation.detachedFromState
        && (!authoritativeUnit || authoritativeUnit.owner !== animation.unit.owner);
      // A finished animation must still fire its completion callback even when it was never
      // drawn (unexplored destination) -- several callers `await` it or advance focus from it.
      if (orphaned || nowMs - animation.startTime >= animation.duration) {
        if (animation.onComplete) completedCallbacks.push(animation.onComplete);
      } else {
        remaining.push(animation);
      }
    }
    this.unitMovementAnimations = remaining;
    for (const callback of completedCallbacks) callback();
  }

  private drawUnitMovementAnimations(
    now: number,
    colorLookup: Record<string, string>,
    viewerVisibility: VisibilityMap,
    overlayActiveIds: ReadonlySet<string>,
  ): void {
    if (!this.state) return;
    for (const animation of this.unitMovementAnimations) {
      const elapsed = now - animation.startTime;
      const progress = Math.min(1, elapsed / animation.duration);
      const frame = getMovementAnimationPosition(animation, progress);
      if (getVisibility(viewerVisibility, animation.to) === 'unexplored') continue;
      const renderCoords = this.state.map.wrapsHorizontally
        ? getHorizontalWrapRenderCoords(frame.coord, this.state.map.width, this.camera)
        : [frame.coord];
      const visual = resolveUnitVisual(this.state, animation.unit, colorLookup, frame.motion);
      const useSprites = this.camera.zoom >= LOD_SPRITE_ZOOM_THRESHOLD;
      const sprite = useSprites
        ? spriteCache.getUnitMotion(animation.unit.type, visual.spriteOwnerId, frame.motion)
        : null;
      for (const renderCoord of overlayActiveIds.has(animation.unit.id) ? [] : renderCoords) {
        if (!this.camera.isHexVisible(renderCoord)) continue;
        const pixel = hexToPixel(renderCoord, this.camera.hexSize);
        const screen = this.camera.worldToScreen(pixel.x, pixel.y);
        drawUnitGlyph(this.ctx, this.state, animation.unit, screen.x, screen.y, this.camera.hexSize * this.camera.zoom, colorLookup, {
          stackSize: 1,
          stackIndex: 0,
          motion: frame.motion,
          useSprites,
          spriteOverride: sprite,
        });
      }
    }
  }

  private drawTradeRouteLines(viewerId: string): void {
    if (!this.state?.marketplace?.tradeRoutes?.length) return;
    const playerCiv = this.state.civilizations[viewerId];
    if (!playerCiv) return;
    const routeColor = playerCiv.color ?? '#888';

    this.ctx.save();
    this.ctx.setLineDash([6, 4]);
    this.ctx.lineWidth = 2 * this.camera.zoom;
    this.ctx.globalAlpha = 0.6;
    this.ctx.strokeStyle = routeColor;

    for (const route of this.state.marketplace.tradeRoutes) {
      const fromCity = this.state.cities[route.fromCityId];
      const toCity   = this.state.cities[route.toCityId];
      if (!fromCity || !toCity) continue;
      if (fromCity.owner !== viewerId) continue; // privacy: only show own routes

      // Both endpoints must be at least fog-seen
      const fromVis = playerCiv.visibility ? getVisibility(playerCiv.visibility, fromCity.position) : 'unexplored';
      const toVis   = playerCiv.visibility ? getVisibility(playerCiv.visibility, toCity.position) : 'unexplored';
      if (fromVis === 'unexplored' || toVis === 'unexplored') continue;

      // Route lines crossing the wrap seam draw to the nearest ghost copy of
      // the destination, once per visible wrap copy of the pair.
      const toPosition = this.state.map.wrapsHorizontally
        ? nearestWrappedCoord(fromCity.position, toCity.position, this.state.map.width)
        : toCity.position;
      for (const offset of this.visibleWrapOffsets([fromCity.position, toPosition])) {
        const fromPx = hexToPixel({ q: fromCity.position.q + offset, r: fromCity.position.r }, this.camera.hexSize);
        const toPx   = hexToPixel({ q: toPosition.q + offset, r: toPosition.r }, this.camera.hexSize);
        const fromScreen = this.camera.worldToScreen(fromPx.x, fromPx.y);
        const toScreen   = this.camera.worldToScreen(toPx.x, toPx.y);

        this.ctx.beginPath();
        this.ctx.moveTo(fromScreen.x, fromScreen.y);
        this.ctx.lineTo(toScreen.x, toScreen.y);
        this.ctx.stroke();
      }
    }

    this.ctx.restore();
  }

  /**
   * Wrap offsets (multiples of map width, applied to q) under which at least
   * one of `coords` lands on screen. Always [0] for non-wrapping maps, so
   * callers can share one code path.
   */
  private visibleWrapOffsets(coords: readonly HexCoord[]): number[] {
    if (!this.state?.map.wrapsHorizontally || coords.length === 0) return [0];
    const width = this.state.map.width;
    const offsets = new Set<number>();
    for (const endpoint of [coords[0]!, coords[coords.length - 1]!]) {
      for (const copy of getHorizontalWrapRenderCoords(endpoint, width, this.camera)) {
        offsets.add(copy.q - endpoint.q);
      }
    }
    return Array.from(offsets).filter(offset =>
      coords.some(coord => this.camera.isHexVisible({ q: coord.q + offset, r: coord.r })),
    );
  }

}
