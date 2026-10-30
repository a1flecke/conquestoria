import type { AudioMixer } from './audio-mixer';
import type { AudioLoader } from './audio-loader';
import type { EventBus } from '../core/event-bus';
import type { Unit, UnitType, CombatResult, HexCoord, GameState, ImprovementType } from '../core/types';
import type { CaptureKind } from '../core/types/combat';
import type { GeneralAbilityMoment } from '../core/types/general-presentation';
import { UNIT_SFX, PIRATE_MOVEMENT_SFX, COMBAT_OUTCOME_SFX, GENERAL_COMMAND_SFX, getLocomotionClass, getMovementSfx, type PirateUnitType } from './sfx-catalog';
import { getMovementDurationMs } from '../renderer/unit-movement-animation';
import { getVisibility } from '@/systems/fog-of-war';

export class SfxDirector {
  private unitTypeCache = new Map<string, UnitType>();
  private deathPlayed = new Set<string>();
  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
  private unsubscribers: Array<() => void> = [];
  private started = false;
  private generation = 0;
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
        p.attackerCaptureKind,
        p.defenderCaptureKind,
      )),
      bus.on('unit:move', p => this.handleUnitMove(p.unitId, p.path, p.presentationByViewer)),
      bus.on('unit:destroyed', p => this.handleUnitDestroyed(p.unitId, p.position)),
      bus.on('pillage:resolved', p => this.handlePillageResolved(p.coord, p.improvement, p.roadPillaged)),
      // #889: Great General moments. Command and retirement cues are the owner's own and heard only while that owner
      // is the viewing seat; the Last Stand save is heard wherever the viewer can currently see the hex.
      bus.on('general:command-used', ({ moment }) => this.playFile(
        this.generalCommandCue(moment),
        [moment.civId],
      )),
      // #1522: an AI activation is heard only where the viewer can already see the General's hex, under the same
      // suppression/mute/volume path as every other cue. No cue at all for an unseen General.
      bus.on('general:ai-command-used', ({ moment }) => {
        if (!this.isVisible(moment.generalCoord)) return;
        this.playFile(this.generalCommandCue(moment), this.viewerOnly());
      }),
      bus.on('general:last-stand-held', p => {
        if (this.isVisible(p.coord)) this.playFile(GENERAL_COMMAND_SFX['last-stand'].file, this.viewerOnly());
      }),
      bus.on('general:retired', p => this.playFile(GENERAL_COMMAND_SFX['final-command'].file, [p.civId])),
    );
  }

  dispose(): void {
    this.generation += 1;
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

  replaceUnits(
    units: Record<string, Unit>,
    getState?: () => GameState,
    isPresentationSuppressed?: () => boolean,
  ): void {
    this.generation += 1;
    for (const id of this.pendingTimeouts) clearTimeout(id);
    this.pendingTimeouts = [];
    this.unitTypeCache.clear();
    this.deathPlayed.clear();
    for (const [id, unit] of Object.entries(units)) {
      this.unitTypeCache.set(id, unit.type);
    }
    if (getState) this.getState = getState;
    if (isPresentationSuppressed) {
      this.isPresentationSuppressed = isPresentationSuppressed;
    }
  }

  private canPresentTo(viewerIds?: string[]): boolean {
    if (this.isPresentationSuppressed()) return false;
    if (!viewerIds) return true;
    const state = this.getState?.();
    if (!state) return true;
    const viewerId = state.currentPlayer;
    return Boolean(viewerId && viewerIds.includes(viewerId));
  }

  /** The seat looking at the screen right now, captured at the event so a hot-seat handoff before the decode cancels the cue. */
  private viewerOnly(): string[] | undefined {
    const viewerId = this.getState?.().currentPlayer;
    return viewerId ? [viewerId] : undefined;
  }

  /** A Final Command plays the final cue instead of its ability's cue. */
  private generalCommandCue(moment: Pick<GeneralAbilityMoment, 'kind' | 'isFinalCommand'>): string {
    return (moment.isFinalCommand ? GENERAL_COMMAND_SFX['final-command'] : GENERAL_COMMAND_SFX[moment.kind]).file;
  }

  private playFile(path: string, viewerIds?: string[]): void {
    if (!this.canPresentTo(viewerIds)) return;
    const generation = this.generation;
    void this.loader.get(path).then(buf => {
      if (generation === this.generation && this.canPresentTo(viewerIds)) void this.mixer.playOneShot('sfx', buf);
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
    attackerCaptureKind?: CaptureKind,
    defenderCaptureKind?: CaptureKind,
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

    // A unit that was CAPTURED changed hands; it must never sound like it died.
    // The confirmed capture kind comes from applyCombatOutcomeToState, so this
    // never guesses from the raw combat result (#657).
    this.playDefeatOutcome(result.attackerId, attackerType, !result.attackerSurvived, attackerCaptureKind, viewerIds);
    this.playDefeatOutcome(result.defenderId, defenderType, !result.defenderSurvived, defenderCaptureKind, viewerIds);
  }

  /** The cue for one participant's non-survival: a capture cue when it was taken
   * (never a death cue), otherwise the ordinary defeat cue for a destroyed unit. */
  private playDefeatOutcome(
    unitId: string,
    unitType: UnitType | undefined,
    defeated: boolean,
    captureKind: CaptureKind | undefined,
    viewerIds: string[] | undefined,
  ): void {
    if (captureKind) {
      this.playFile(this.captureCue(captureKind).file, viewerIds);
      return;
    }
    if (!defeated || !unitType) return;
    const death = UNIT_SFX[unitType]?.death;
    if (death) this.playFile(death.file, viewerIds);
    this.deathPlayed.add(unitId);
  }

  private captureCue(kind: CaptureKind): { file: string } {
    if (kind === 'naval-boarding') return COMBAT_OUTCOME_SFX['capture-naval-boarding'];
    if (kind === 'naval-modern') return COMBAT_OUTCOME_SFX['capture-naval-modern'];
    return COMBAT_OUTCOME_SFX['capture-civilian'];
  }

  private handlePillageResolved(
    coord: HexCoord,
    improvement: ImprovementType | null,
    roadPillaged: boolean,
  ): void {
    if (!this.isVisible(coord)) return;
    // Capture the seat that owns this moment so a hot-seat handoff between the
    // event and the async decode cancels the cue (same rule as combat/movement).
    const viewerId = this.getState?.().currentPlayer;
    const viewerIds = viewerId ? [viewerId] : undefined;
    const cue = improvement
      ? COMBAT_OUTCOME_SFX['pillage-improvement']
      : roadPillaged
        ? COMBAT_OUTCOME_SFX['pillage-road']
        : null;
    if (cue) this.playFile(cue.file, viewerIds);
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
    const visibleSegments = presentationByViewer
      ? (presentation?.visibleSegments ?? [])
      : (path.some(coord => this.isVisible(coord)) ? [path] : []);
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
    const sfx = getMovementSfx(unitType);
    // Aircraft are heard once per move, not once per hex: their cues are sustained, and retriggering one every
    // 220 ms cut each short and ran them together. Like the pirate ships above, one cue spans the whole move.
    if (getLocomotionClass(unitType) === 'air') {
      this.scheduleFile(sfx.file, 0, viewerIds);
      return;
    }
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
