import type { AudioMixer } from './audio-mixer';
import type { AudioLoader } from './audio-loader';
import type { EventBus } from '../core/event-bus';
import type { Unit, UnitType, CombatResult, HexCoord, GameState } from '../core/types';
import { UNIT_SFX, MOVEMENT_SFX, PIRATE_MOVEMENT_SFX, getLocomotionClass, type PirateUnitType } from './sfx-catalog';
import { getMovementDurationMs } from '../renderer/unit-movement-animation';
import { getVisibility } from '@/systems/fog-of-war';

export class SfxDirector {
  private unitTypeCache = new Map<string, UnitType>();
  private deathPlayed = new Set<string>();
  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
  private unsubscribers: Array<() => void> = [];
  private started = false;
  private getState: (() => GameState) | null = null;
  private isPresentationSuppressed: () => boolean = () => false;

  constructor(
    private readonly mixer: AudioMixer,
    private readonly loader: AudioLoader,
  ) {}

  start(
    units: Record<string, Unit>,
    bus: EventBus,
    getState?: () => GameState,
    isPresentationSuppressed: () => boolean = () => false,
  ): void {
    if (this.started) return;
    this.started = true;
    for (const [id, unit] of Object.entries(units)) {
      this.unitTypeCache.set(id, unit.type);
    }
    this.getState = getState ?? null;
    this.isPresentationSuppressed = isPresentationSuppressed;
    this.unsubscribers.push(
      bus.on('unit:created', p => {
        this.unitTypeCache.set(p.unit.id, p.unit.type);
      }),
      bus.on('combat:resolved', p => this.handleCombatResolved(
        p.result,
        p.visibleToViewerIds,
        p.attackerType,
        p.defenderType,
      )),
      bus.on('unit:move', p => this.handleUnitMove(p.unitId, p.path, p.presentationByViewer)),
      bus.on('unit:destroyed', p => this.handleUnitDestroyed(p.unitId, p.position)),
    );
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    for (const id of this.pendingTimeouts) clearTimeout(id);
    this.pendingTimeouts = [];
    this.unitTypeCache.clear();
    this.deathPlayed.clear();
    this.getState = null;
    this.isPresentationSuppressed = () => false;
    this.started = false;
  }

  private canPresentTo(viewerIds?: string[]): boolean {
    if (this.isPresentationSuppressed()) return false;
    if (!viewerIds) return true;
    const state = this.getState?.();
    if (!state) return true;
    const viewerId = state.currentPlayer;
    return Boolean(viewerId && viewerIds.includes(viewerId));
  }

  private playFile(path: string, viewerIds?: string[]): void {
    if (!this.canPresentTo(viewerIds)) return;
    void this.loader.get(path).then(buf => {
      if (this.canPresentTo(viewerIds)) void this.mixer.playOneShot('sfx', buf);
    });
  }

  private scheduleFile(path: string, delayMs: number, viewerIds?: string[]): void {
    if (!this.canPresentTo(viewerIds)) return;
    const id = setTimeout(() => {
      if (this.canPresentTo(viewerIds)) this.playFile(path, viewerIds);
      const index = this.pendingTimeouts.indexOf(id);
      if (index !== -1) this.pendingTimeouts.splice(index, 1);
    }, delayMs);
    this.pendingTimeouts.push(id);
  }

  private isVisible(coord: HexCoord): boolean {
    const state = this.getState?.();
    if (!state) return true;
    const visibility = state.civilizations[state.currentPlayer]?.visibility;
    return Boolean(visibility && getVisibility(visibility, coord) === 'visible');
  }

  private handleCombatResolved(
    result: CombatResult,
    visibleToViewerIds?: string[],
    eventAttackerType?: UnitType,
    eventDefenderType?: UnitType,
  ): void {
    const currentViewer = this.getState?.().currentPlayer;
    const viewerIds = visibleToViewerIds ?? (
      this.isVisible(result.attackerPosition) || this.isVisible(result.defenderPosition)
        ? (currentViewer ? [currentViewer] : undefined)
        : []
    );
    if (!this.canPresentTo(viewerIds)) return;
    const attackerType = eventAttackerType ?? this.unitTypeCache.get(result.attackerId);
    const defenderType = eventDefenderType ?? this.unitTypeCache.get(result.defenderId);

    if (attackerType) {
      const sfx = UNIT_SFX[attackerType];
      // Priority: ranged-loose (ranged), siege-fire (siege), attack-swing (melee)
      const sound = sfx?.['ranged-loose'] ?? sfx?.['siege-fire'] ?? sfx?.['attack-swing'];
      if (sound) this.playFile(sound.file, viewerIds);
    }

    if (defenderType) {
      const pirateAttacker = attackerType?.startsWith('pirate_') ?? false;
      const sfx = UNIT_SFX[pirateAttacker ? attackerType! : defenderType];
      // Priority: attack-impact (melee), ranged-impact (ranged), siege-impact (siege)
      const impact = sfx?.['attack-impact'] ?? sfx?.['ranged-impact'] ?? sfx?.['siege-impact'];
      if (impact) {
        if (pirateAttacker) this.scheduleFile(impact.file, 140, viewerIds);
        else this.playFile(impact.file, viewerIds);
      }
    }

    if (!result.attackerSurvived && attackerType) {
      const death = UNIT_SFX[attackerType]?.death;
      if (death) this.playFile(death.file, viewerIds);
      this.deathPlayed.add(result.attackerId);
    }

    if (!result.defenderSurvived && defenderType) {
      const death = UNIT_SFX[defenderType]?.death;
      if (death) this.playFile(death.file, viewerIds);
      this.deathPlayed.add(result.defenderId);
    }
  }

  private handleUnitMove(
    unitId: string,
    path: HexCoord[],
    presentationByViewer?: Record<string, { unit: Unit; visibleSegments: HexCoord[][] }>,
  ): void {
    const unitType = this.unitTypeCache.get(unitId);
    if (!unitType) return;
    const viewerId = this.getState?.().currentPlayer;
    const presentation = viewerId ? presentationByViewer?.[viewerId] : undefined;
    const visibleSegments = presentation?.visibleSegments
      ?? (path.some(coord => this.isVisible(coord)) ? [path] : []);
    if (visibleSegments.length === 0) return;
    const viewerIds = viewerId ? [viewerId] : undefined;

    const stepCount = visibleSegments.reduce(
      (total, segment) => total + Math.max(0, segment.length - 1),
      0,
    );
    if (stepCount <= 0) return;

    if (unitType.startsWith('pirate_')) {
      this.scheduleFile(PIRATE_MOVEMENT_SFX[unitType as PirateUnitType].file, 0, viewerIds);
      return;
    }
    const sfx = MOVEMENT_SFX[getLocomotionClass(unitType)];
    const totalDuration = getMovementDurationMs(stepCount);
    const interval = totalDuration / stepCount;

    for (let i = 0; i < stepCount; i++) {
      const id = setTimeout(() => {
        this.playFile(sfx.file, viewerIds);
        const idx = this.pendingTimeouts.indexOf(id);
        if (idx !== -1) this.pendingTimeouts.splice(idx, 1);
      }, i * interval);
      this.pendingTimeouts.push(id);
    }
  }

  private handleUnitDestroyed(unitId: string, position: HexCoord): void {
    const unitType = this.unitTypeCache.get(unitId);
    if (unitType && !this.deathPlayed.has(unitId) && this.isVisible(position)) {
      const death = UNIT_SFX[unitType]?.death;
      if (death) this.playFile(death.file);
    }
    this.unitTypeCache.delete(unitId);
    this.deathPlayed.delete(unitId);
  }
}
