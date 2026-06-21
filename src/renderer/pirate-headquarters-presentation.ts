import type { GameMap, GameState, HexCoord } from '@/core/types';
import type { PirateMaritimeStage } from '@/core/pirate-state';
import { getPirateWatersPresentation } from '@/systems/pirate-presentation';
import { hexToPixel } from '@/systems/hex-utils';
import { getHorizontalWrapRenderCoords } from '@/renderer/wrap-rendering';
import type { Camera } from '@/renderer/camera';
import { spriteCache } from '@/renderer/sprites/sprite-loader';
import type { PirateHeadquartersSpriteId } from '@/renderer/sprites/sprite-catalog';
import type { SpriteEntity } from '@/renderer/sprite-overlay';
import type { PirateSpriteMode, PirateSpriteStateController } from '@/renderer/pirate-sprite-state';

export type PirateBehaviorTierNumber = 1 | 2 | 3;
export type PirateVisualMode = 'current' | 'last-seen';

export interface PirateHeadquartersMapEntity {
  id: string;
  factionId: string;
  subtype: 'coastal-enclave' | 'deep-sea-flotilla';
  coord: HexCoord;
  stage: PirateMaritimeStage;
  tier: PirateBehaviorTierNumber;
  mode: PirateVisualMode;
  behaviorMode: PirateSpriteMode;
  damage: 0 | 1 | 2 | 3;
  selected: boolean;
  label: string;
}

export interface PirateSuspectedRegionMapPresentation {
  factionId: string;
  center: HexCoord;
  radius: number;
  label: string;
  selected: boolean;
}

export interface PirateHeadquartersMapPresentation {
  entities: PirateHeadquartersMapEntity[];
  regions: PirateSuspectedRegionMapPresentation[];
}

export function getPirateHeadquartersSpriteId(
  entity: Pick<PirateHeadquartersMapEntity, 'subtype' | 'stage'>,
): PirateHeadquartersSpriteId {
  const kind = entity.subtype === 'coastal-enclave' ? 'enclave' : 'flotilla';
  return `pirate_${kind}_stage_${entity.stage}` as PirateHeadquartersSpriteId;
}

function tierForBehavior(behavior: string | undefined): PirateBehaviorTierNumber {
  if (behavior === 'blockading') return 3;
  if (behavior === 'raiding') return 2;
  return 1;
}

function damageForBand(band: 'healthy' | 'worn' | 'damaged' | 'critical' | undefined): 0 | 1 | 2 | 3 {
  if (band === 'critical') return 3;
  if (band === 'damaged') return 2;
  if (band === 'worn') return 1;
  return 0;
}

function behaviorModeForPresentation(
  behavior: string | undefined,
  relocationDirection: string | undefined,
): PirateSpriteMode {
  if (relocationDirection) return 'relocating';
  if (behavior === 'blockading') return 'blockade';
  if (behavior === 'raiding') return 'raid';
  return 'patrol';
}

export function buildPirateHeadquartersMapPresentation(
  state: GameState,
  viewerId: string,
  selectedFactionId: string | null = null,
): PirateHeadquartersMapPresentation {
  const presentation = getPirateWatersPresentation(state, viewerId);
  const entities = presentation.factions.flatMap((faction): PirateHeadquartersMapEntity[] => {
    if (!faction.headquarters || !faction.maritimeStage) return [];
    return [{
      id: `pirate-headquarters-${faction.factionId}`,
      factionId: faction.factionId,
      subtype: faction.headquarters.kind,
      coord: { ...faction.headquarters.position },
      stage: faction.maritimeStage,
      tier: tierForBehavior(faction.behavior),
      mode: faction.headquarters.current ? 'current' : 'last-seen',
      behaviorMode: behaviorModeForPresentation(faction.behavior, faction.plannedRelocationDirection),
      damage: damageForBand(faction.headquarters.integrityBand),
      selected: faction.factionId === selectedFactionId,
      label: faction.headquarters.current ? `${faction.name} headquarters` : `Last known ${faction.name} headquarters`,
    }];
  });
  const regions = presentation.factions.flatMap((faction): PirateSuspectedRegionMapPresentation[] => {
    if (faction.level !== 'rumor' || !faction.approximateRegion) return [];
    return [{
      factionId: faction.factionId,
      center: { ...faction.approximateRegion.center },
      radius: faction.approximateRegion.radius,
      label: 'Suspected pirate waters',
      selected: faction.factionId === selectedFactionId,
    }];
  });
  return { entities, regions };
}

export function buildPirateHeadquartersSpriteEntities(
  _state: GameState,
  entities: PirateHeadquartersMapEntity[],
  controller: PirateSpriteStateController,
  nowMs: number,
): SpriteEntity[] {
  return entities.map(entity => {
    const visual = controller.resolve(entity.id, {
      mode: entity.behaviorMode,
      damage: entity.damage,
      tier: entity.tier,
      stage: entity.stage,
    }, nowMs);
    return {
      id: entity.id,
      kind: 'landmark',
      subtype: getPirateHeadquartersSpriteId(entity),
      coord: entity.coord,
      state: visual.state,
      faction: 'pirates',
      damage: visual.damage,
      selected: entity.selected,
      tier: visual.tier,
      stage: visual.stage,
      mode: visual.mode,
    };
  });
}

export function drawPirateHeadquartersMapPresentation(
  ctx: CanvasRenderingContext2D,
  presentation: PirateHeadquartersMapPresentation,
  camera: Camera,
  map: GameMap,
  domActiveIds: ReadonlySet<string> = new Set(),
): void {
  for (const region of presentation.regions) {
    const renderCoords = map.wrapsHorizontally
      ? getHorizontalWrapRenderCoords(region.center, map.width, camera)
      : [region.center];
    for (const coord of renderCoords) {
      const pixel = hexToPixel(coord, camera.hexSize);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const radius = camera.hexSize * camera.zoom * Math.max(1.5, region.radius * 1.25);
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = region.selected ? 'rgba(244, 196, 96, 0.9)' : 'rgba(190, 80, 70, 0.55)';
      ctx.fillStyle = 'rgba(120, 25, 35, 0.08)';
      ctx.lineWidth = region.selected ? 3 : 2;
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  for (const entity of presentation.entities) {
    if (domActiveIds.has(entity.id)) continue;
    const renderCoords = map.wrapsHorizontally
      ? getHorizontalWrapRenderCoords(entity.coord, map.width, camera)
      : [entity.coord];
    for (const coord of renderCoords) {
      const pixel = hexToPixel(coord, camera.hexSize);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const size = camera.hexSize * camera.zoom * 0.7;
      const image = spriteCache.getLandmark(getPirateHeadquartersSpriteId(entity));
      if (image) {
        const imageSize = camera.hexSize * camera.zoom * 2.2;
        ctx.save();
        ctx.globalAlpha = entity.mode === 'current' ? 1 : 0.55;
        ctx.drawImage(image, screen.x - imageSize / 2, screen.y - imageSize / 2, imageSize, imageSize);
        ctx.restore();
        continue;
      }
      ctx.save();
      ctx.globalAlpha = entity.mode === 'current' ? 1 : 0.55;
      ctx.translate(screen.x, screen.y);
      ctx.fillStyle = entity.damage >= 3 ? '#5f151b' : '#8b2635';
      ctx.strokeStyle = entity.selected ? '#f4c460' : '#d6a14a';
      ctx.lineWidth = entity.selected ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(-size, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.font = `bold ${Math.max(10, size * 0.8)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(entity.subtype === 'coastal-enclave' ? 'E' : 'F', 0, 0);
      ctx.restore();
    }
  }
}
