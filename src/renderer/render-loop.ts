import type { GameState, HexCoord, Unit, VisibilityMap } from '@/core/types';
import { Camera } from './camera';
import { drawHexMap, drawRivers, drawRoads, drawMinorCivTerritory, drawHexHighlight } from './hex-renderer';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { drawFogOfWar } from './fog-renderer';
import { drawUnitPresentations } from './unit-renderer';
import { drawCities } from './city-renderer';
import { AnimationSystem } from './animation-system';
import { hexToPixel, hexKey } from '@/systems/hex-utils';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';
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
import { isPirateOwner } from '@/core/owner-kind';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
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
import { PirateSpriteStateController } from './pirate-sprite-state';
import type { CombatResult } from '@/core/types';

export { CIVTYPE_TO_FACTION, civTypeToFaction };

export function buildUnitEntities(
  state: GameState,
  viewerId: string,
  viewerVisibility: VisibilityMap,
  movingUnitIds: ReadonlySet<string>,
  selectedUnitId: string | null = null,
): SpriteEntity[] {
  return buildUnitMapPresentations(
    state,
    viewerId,
    viewerVisibility,
    movingUnitIds,
    selectedUnitId,
  ).map(presentation => {
      return {
        id: presentation.leadUnitId,
        memberIds: presentation.memberIds,
        kind: 'unit' as const,
        subtype: presentation.leadUnit.type,
        coord: presentation.coord,
        state: 'idle' as const,
        faction: presentation.faction,
        damage: presentation.damage,
        stackCount: presentation.stackCount,
        selected: presentation.isSelected,
        health: presentation.leadUnit.health,
        fortified: presentation.leadUnit.isFortified,
        roleMarker: presentation.roleMarker,
        anchorOffsetFactor: presentation.anchorOffsetFactor,
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
  type: 'move' | 'attack' | 'water-recovery' | 'worker-buildable' | 'worker-owned-blocked' | 'worker-foreign-blocked';
}

const HEX_HIGHLIGHT_COLORS: Record<HexHighlight['type'], string> = {
  move: 'rgba(74, 144, 217, 0.35)',
  attack: 'rgba(217, 74, 74, 0.45)',
  'water-recovery': 'rgba(245, 184, 73, 0.55)',
  'worker-buildable': 'rgba(80, 200, 120, 0.45)',
  'worker-owned-blocked': 'rgba(232, 193, 112, 0.40)',
  'worker-foreign-blocked': 'rgba(217, 74, 74, 0.35)',
};

const HEX_HIGHLIGHT_OUTLINES: Partial<Record<HexHighlight['type'], string>> = {
  'water-recovery': '#fff0a8',
};

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class RenderLoop {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  camera: Camera;
  animations: AnimationSystem;
  private state: GameState | null = null;
  private running = false;
  private animFrameId = 0;
  private highlights: HexHighlight[] = [];
  private journeyPath: HexCoord[] | null = null;
  private unitMovementAnimations: Array<UnitMovementAnimation & {
    startTime: number;
    onComplete?: () => void;
    detachedFromState?: boolean;
  }> = [];
  private spriteOverlay: SpriteOverlay | null = null;
  private touchHandlerRef: { isPinching: boolean } | null = null;
  private selectedUnitId: string | null = null;
  private selectedPirateFactionId: string | null = null;
  private pirateSpriteState = new PirateSpriteStateController();
  private pirateUnitDeathSnapshots = new Map<string, { unit: Unit; expiresAtMs: number }>();
  private pirateLandmarkDeathSnapshots = new Map<string, {
    entity: ReturnType<typeof buildPirateHeadquartersMapPresentation>['entities'][number];
    expiresAtMs: number;
  }>();

  setTouchHandler(th: { isPinching: boolean }): void {
    this.touchHandlerRef = th;
  }

  setSelectedUnitId(unitId: string | null): void {
    this.selectedUnitId = unitId;
  }

  setSelectedPirateFactionId(factionId: string | null): void {
    this.selectedPirateFactionId = factionId;
  }

  applyCombatVisual(result: CombatResult, nowMs = performance.now()): void {
    this.pirateSpriteState.apply({ type: 'combat', ...result }, nowMs);
    if (!this.state) return;
    for (const [unitId, survived] of [
      [result.attackerId, result.attackerSurvived],
      [result.defenderId, result.defenderSurvived],
    ] as const) {
      const unit = this.state.units[unitId];
      if (!survived && unit && isPirateOwner(unit.owner)) {
        this.pirateUnitDeathSnapshots.set(unitId, { unit: { ...unit }, expiresAtMs: nowMs + 1_200 });
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
    if (!options.destroyed || !this.state) return;
    const entity = buildPirateHeadquartersMapPresentation(
      this.state,
      this.state.currentPlayer,
      factionId,
    ).entities.find(candidate => candidate.factionId === factionId);
    if (entity) this.pirateLandmarkDeathSnapshots.set(entityId, { entity, expiresAtMs: nowMs + 1_200 });
  }

  setHighlights(highlights: HexHighlight[]): void {
    this.highlights = highlights;
  }

  clearHighlights(): void {
    this.highlights = [];
  }

  setJourneyPath(path: HexCoord[] | null): void {
    this.journeyPath = path;
  }

  requestWonderDiscoveryHighlight(
    coord: HexCoord,
    visual: WonderVisualDefinition,
    options: { reducedMotion: boolean },
  ): void {
    this.camera.centerOn(coord);
    const pixel = hexToPixel(coord, this.camera.hexSize);
    const screen = this.camera.worldToScreen(pixel.x, pixel.y);
    const size = this.camera.hexSize * this.camera.zoom;
    this.animations.add(
      options.reducedMotion ? 'wonder-discovery-static-highlight' : 'wonder-discovery-pulse',
      900,
      {
        x: screen.x,
        y: screen.y,
        size,
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
    const pixel = hexToPixel(position, this.camera.hexSize);
    const screen = this.camera.worldToScreen(pixel.x, pixel.y);
    const size = this.camera.hexSize * this.camera.zoom;
    this.animations.add('disembark-flash', 500, { x: screen.x, y: screen.y, size });
  }

  hasMovingUnit(unitId: string): boolean {
    return this.unitMovementAnimations.some(animation => animation.unit.id === unitId);
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.camera = new Camera();
    this.animations = new AnimationSystem();
    this.resizeCanvas();
    // Mount the sprite overlay — guarded for test environments without DOM
    if (typeof document !== 'undefined') {
      const mountPoint = canvas.parentElement ?? document.body;
      this.spriteOverlay = new SpriteOverlay(mountPoint);
    }
  }

  resizeCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.camera.setViewport(rect.width, rect.height);
  }

  setGameState(state: GameState): void {
    this.state = state;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  private tick = (): void => {
    if (!this.running) return;

    this.camera.applyInertia();
    this.render();

    this.animFrameId = requestAnimationFrame(this.tick);
  };

  private render(): void {
    if (!this.state) return;
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
    );

    // Draw rivers
    drawRivers(this.ctx, this.state.map, this.camera, viewerVisibility);

    // Draw roads (overlay, drawn under units — see drawUnits below)
    const cityTileKeys = new Set(Object.values(this.state.cities).map(city => hexKey(city.position)));
    const completedTechsByCiv = Object.fromEntries(
      Object.entries(this.state.civilizations).map(([id, civ]) => [id, civ.techState?.completed ?? []]),
    );
    drawRoads(this.ctx, this.state.map, this.camera, cityTileKeys, viewerVisibility, completedTechsByCiv);

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
      }
    }

    // Draw journey path overlay
    if (this.journeyPath && this.journeyPath.length >= 2) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255, 200, 50, 0.8)';
      this.ctx.lineWidth = 3;
      this.ctx.setLineDash([6, 4]);
      this.ctx.beginPath();
      let started = false;
      for (const coord of this.journeyPath) {
        const pixel = hexToPixel(coord, this.camera.hexSize);
        const screen = this.camera.worldToScreen(pixel.x, pixel.y);
        if (!started) { this.ctx.moveTo(screen.x, screen.y); started = true; }
        else { this.ctx.lineTo(screen.x, screen.y); }
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Draw cities
    drawCities(this.ctx, this.state, this.camera, viewerId, {
      reducedMotion: prefersReducedMotion(),
      nowMs: performance.now(),
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
      const unitEntities = unitPresentations.map(presentation => {
        const faction = this.state!.pirates?.factions[presentation.leadUnit.owner];
        const persistentMode = faction?.behavior === 'blockading'
          ? 'blockade' as const
          : faction?.behavior === 'raiding' ? 'raid' as const : 'patrol' as const;
        const visual = faction
          ? this.pirateSpriteState.resolve(presentation.leadUnitId, {
              mode: persistentMode,
              damage: presentation.damage as 0 | 1 | 2 | 3,
              tier: faction.behavior === 'blockading' ? 3 : faction.behavior === 'raiding' ? 2 : 1,
              stage: faction.maritimeStage,
            }, nowMs)
          : null;
        return {
          id: presentation.leadUnitId,
          memberIds: presentation.memberIds,
          kind: 'unit' as const,
          subtype: presentation.leadUnit.type,
          coord: presentation.coord,
          state: visual?.state ?? 'idle' as const,
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
      for (const [unitId, snapshot] of this.pirateUnitDeathSnapshots) {
        if (snapshot.expiresAtMs <= nowMs) {
          this.pirateUnitDeathSnapshots.delete(unitId);
          continue;
        }
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
        if (snapshot.expiresAtMs <= nowMs) {
          this.pirateLandmarkDeathSnapshots.delete(entityId);
          continue;
        }
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

    // Draw animations
    this.animations.update(this.ctx, performance.now());

  }

  private drawUnitMovementAnimations(
    now: number,
    colorLookup: Record<string, string>,
    viewerVisibility: VisibilityMap,
    overlayActiveIds: ReadonlySet<string>,
  ): void {
    if (!this.state) return;
    const remaining: typeof this.unitMovementAnimations = [];
    const completedCallbacks: Array<() => void> = [];
    for (const animation of this.unitMovementAnimations) {
      const authoritativeUnit = this.state.units[animation.unit.id];
      if (
        !animation.detachedFromState
        && (!authoritativeUnit || authoritativeUnit.owner !== animation.unit.owner)
      ) {
        if (animation.onComplete) completedCallbacks.push(animation.onComplete);
        continue;
      }
      const elapsed = now - animation.startTime;
      const progress = Math.min(1, elapsed / animation.duration);
      const frame = getMovementAnimationPosition(animation, progress);
      if (getVisibility(viewerVisibility, animation.to) === 'unexplored') {
        if (progress < 1) remaining.push(animation);
        continue;
      }
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
      if (progress < 1) {
        remaining.push(animation);
      } else {
        if (animation.onComplete) completedCallbacks.push(animation.onComplete);
      }
    }
    this.unitMovementAnimations = remaining;
    for (const callback of completedCallbacks) {
      callback();
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

      const fromPx = hexToPixel(fromCity.position, this.camera.hexSize);
      const toPx   = hexToPixel(toCity.position, this.camera.hexSize);
      const fromScreen = this.camera.worldToScreen(fromPx.x, fromPx.y);
      const toScreen   = this.camera.worldToScreen(toPx.x, toPx.y);

      this.ctx.beginPath();
      this.ctx.moveTo(fromScreen.x, fromScreen.y);
      this.ctx.lineTo(toScreen.x, toScreen.y);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

}
