import type { GameState, HexCoord, Unit, VisibilityMap } from '@/core/types';
import { Camera } from './camera';
import { drawHexMap, drawRivers, drawMinorCivTerritory, drawHexHighlight } from './hex-renderer';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { drawFogOfWar } from './fog-renderer';
import { drawUnits } from './unit-renderer';
import { drawCities } from './city-renderer';
import { AnimationSystem } from './animation-system';
import { hexToPixel } from '@/systems/hex-utils';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';
import { getVisibleUnitsForPlayer } from '@/systems/espionage-stealth';
import { getVisibility } from '@/systems/fog-of-war';
import { createMovementAnimation, getMovementAnimationPosition, getMovingUnitIds, type UnitMovementAnimation } from './unit-movement-animation';
import { resolveUnitVisual } from './unit-visual-resolver';
import { drawUnitGlyph } from './unit-renderer';
import { spriteCache } from './sprites/sprite-loader';
import { LOD_SPRITE_ZOOM_THRESHOLD } from './sprites/sprite-system';
import type { WonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import { SpriteOverlay } from './sprite-overlay';
import type { SpriteEntity } from './sprite-overlay';

/** Maps real CivDefinition.id values to the sprite palette name used by the v2 sprite system. */
export const CIVTYPE_TO_FACTION: Record<string, string> = {
  // Ancient Mediterranean
  egypt:      'pharaohs',
  greece:     'hellenes',
  rome:       'imperials',
  babylon:    'pharaohs',
  persia:     'pharaohs',
  spain:      'imperials',
  atlantis:   'imperials',
  // Northern European
  england:    'vikings',
  germany:    'imperials',
  france:     'imperials',
  russia:     'imperials',
  viking:     'vikings',
  // British Isles / Celtic
  gondor:     'imperials',
  rohan:      'imperials',
  shire:      'imperials',
  prydain:    'imperials',
  annuvin:    'imperials',
  avalon:     'imperials',
  // East / Central Asian
  mongolia:   'khanate',
  china:      'khanate',
  japan:      'shogunate',
  india:      'khanate',
  ottoman:    'khanate',
  // Sub-Saharan / Mesoamerican / Fantasy
  zulu:       'imperials',
  aztec:      'imperials',
  wakanda:    'imperials',
  // Fantasy / Tolkien
  lothlorien: 'hellenes',
  isengard:   'imperials',
  narnia:     'imperials',
};

export function civTypeToFaction(civType: string): string {
  return CIVTYPE_TO_FACTION[civType] ?? 'imperials';
}

export function buildBuildingEntities(
  state: GameState,
  viewerVisibility: VisibilityMap,
): SpriteEntity[] {
  const entities: SpriteEntity[] = [];
  for (const city of Object.values(state.cities)) {
    if (getVisibility(viewerVisibility, city.position) !== 'visible') continue;
    if (city.buildings.length === 0) continue;

    // Use the CITY OWNER's civType — enemy cities use their owner's faction colors
    const ownerCivType = state.civilizations[city.owner]?.civType ?? 'generic';
    const faction = civTypeToFaction(ownerCivType);

    // Show only the most recently completed building — stacking all at city.position is unreadable (#340)
    const buildingId = city.buildings[city.buildings.length - 1];
    entities.push({
      id: `${city.id}:${buildingId}`,
      kind: 'building',
      subtype: buildingId,
      coord: city.position,
      state: 'idle',
      faction,
    });
  }
  return entities;
}

export function buildUnitEntities(
  state: GameState,
  viewerId: string,
  viewerVisibility: VisibilityMap,
  movingUnitIds: ReadonlySet<string>,
): SpriteEntity[] {
  const visibleRecord = getVisibleUnitsForPlayer(state.units, state, viewerId);
  return Object.values(visibleRecord)
    .filter(u => {
      if (movingUnitIds.has(u.id)) return false;
      return getVisibility(viewerVisibility, u.position) === 'visible';
    })
    .map(u => {
      // Use the UNIT OWNER'S civType (not the viewer's) — enemy units use their owner's faction colors
      const civType = state.civilizations[u.owner]?.civType ?? 'generic';
      const faction = civTypeToFaction(civType);
      return {
        id: u.id,
        kind: 'unit' as const,
        subtype: u.type,
        coord: u.position,
        state: 'idle' as const, // walk state set per-frame during movement (future)
        faction,
      };
    });
}

export interface HexHighlight {
  coord: HexCoord;
  type: 'move' | 'attack' | 'worker-buildable' | 'worker-owned-blocked' | 'worker-foreign-blocked';
}

const HEX_HIGHLIGHT_COLORS: Record<HexHighlight['type'], string> = {
  move: 'rgba(74, 144, 217, 0.35)',
  attack: 'rgba(217, 74, 74, 0.45)',
  'worker-buildable': 'rgba(80, 200, 120, 0.45)',
  'worker-owned-blocked': 'rgba(232, 193, 112, 0.40)',
  'worker-foreign-blocked': 'rgba(217, 74, 74, 0.35)',
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
  private unitMovementAnimations: Array<UnitMovementAnimation & { startTime: number; onComplete?: () => void }> = [];
  private spriteOverlay: SpriteOverlay | null = null;
  private touchHandlerRef: { isPinching: boolean } | null = null;

  setTouchHandler(th: { isPinching: boolean }): void {
    this.touchHandlerRef = th;
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
    if (!this.state || path.length < 2) {
      onComplete?.();
      return;
    }
    this.unitMovementAnimations.push({
      ...createMovementAnimation(unit, path, this.state.map),
      startTime: performance.now(),
      onComplete,
    });
  }

  /**
   * Slide a unit from its current position to `destination` in one step.
   * Used for boarding animations: the unit has already been removed from
   * game state (loaded onto the transport), so only the animation renders it.
   */
  animateUnitSlide(unit: Unit, destination: HexCoord): void {
    this.animateUnitMove(unit, [unit.position, destination]);
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
    drawHexMap(this.ctx, this.state.map, this.camera, villagePositions, beastLairGlyphs, viewerId, viewerVisibility, viewerTechs);

    // Draw rivers
    drawRivers(this.ctx, this.state.map, this.camera, viewerVisibility);

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
        drawHexHighlight(this.ctx, screen.x, screen.y, scaledSize, color);
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
    this.drawInfiltratedSpyIndicators();
    this.drawEmbeddedSpyIndicators();

    // Draw trade route lines (after cities, before units)
    this.drawTradeRouteLines(viewerId);

    // Draw units
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
      const visibleUnits = getVisibleUnitsForPlayer(this.state.units, this.state, viewerId);
      drawUnits(this.ctx, visibleUnits, this.camera, viewerVisibility, this.state, viewerId, colorLookup, {
        hiddenUnitIds: getMovingUnitIds(this.unitMovementAnimations),
      }, this.spriteOverlay?.getActiveIds() ?? new Set());
      this.drawUnitMovementAnimations(performance.now(), colorLookup, viewerVisibility);
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

    // Draw animations
    this.animations.update(this.ctx, performance.now());

    // Sprite overlay — unit + building entities
    const unitEntities = viewerVisibility
      ? buildUnitEntities(
          this.state,
          viewerId,
          viewerVisibility,
          new Set(getMovingUnitIds(this.unitMovementAnimations)),
        )
      : [];
    const buildingEntities = viewerVisibility
      ? buildBuildingEntities(this.state, viewerVisibility)
      : [];
    this.spriteOverlay?.sync(
      this.camera,
      [...unitEntities, ...buildingEntities],
      {
        width: this.state.map.width,
        wrapsHorizontally: this.state.map.wrapsHorizontally,
      },
      {
        isPinching: this.touchHandlerRef?.isPinching ?? false,
        reducedMotion: prefersReducedMotion(),
      },
    );
  }

  private drawUnitMovementAnimations(
    now: number,
    colorLookup: Record<string, string>,
    viewerVisibility: VisibilityMap,
  ): void {
    if (!this.state) return;
    const remaining: typeof this.unitMovementAnimations = [];
    const completedCallbacks: Array<() => void> = [];
    for (const animation of this.unitMovementAnimations) {
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
      for (const renderCoord of renderCoords) {
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

  private drawEmbeddedSpyIndicators(): void {
    if (!this.state) return;
    const civEsp = this.state.espionage?.[this.state.currentPlayer];
    if (!civEsp) return;
    this.ctx.save();
    for (const spy of Object.values(civEsp.spies)) {
      if (spy.status !== 'embedded' || !spy.targetCityId) continue;
      const city = this.state.cities[spy.targetCityId];
      if (!city || city.owner !== this.state.currentPlayer) continue;
      const pixel = hexToPixel(city.position, this.camera.hexSize);
      const screen = this.camera.worldToScreen(pixel.x, pixel.y);
      const size = this.camera.hexSize * this.camera.zoom;
      this.ctx.font = `${size * 0.3}px system-ui`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('🛡', screen.x - size * 0.5, screen.y - size * 0.4);
    }
    this.ctx.restore();
  }

  private drawInfiltratedSpyIndicators(): void {
    if (!this.state) return;
    const civEsp = this.state.espionage?.[this.state.currentPlayer];
    if (!civEsp) return;
    this.ctx.save();
    for (const spy of Object.values(civEsp.spies)) {
      if (spy.status !== 'stationed' && spy.status !== 'on_mission' && spy.status !== 'idle') continue;
      if (!spy.infiltrationCityId) continue;
      const city = this.state.cities[spy.infiltrationCityId];
      if (!city) continue;
      const pixel = hexToPixel(city.position, this.camera.hexSize);
      const screen = this.camera.worldToScreen(pixel.x, pixel.y);
      const size = this.camera.hexSize * this.camera.zoom;
      this.ctx.font = `${size * 0.3}px system-ui`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('👁', screen.x + size * 0.5, screen.y - size * 0.4);
    }
    this.ctx.restore();
  }
}
