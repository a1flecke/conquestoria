import type { AudioMixer } from './audio-mixer';
import type { AudioLoader } from './audio-loader';
import type { EventBus } from '../core/event-bus';
import type { Unit, UnitType, CombatResult, HexCoord } from '../core/types';
import { UNIT_SFX, MOVEMENT_SFX, getLocomotionClass } from './sfx-catalog';
import { getMovementDurationMs } from '../renderer/unit-movement-animation';

export class SfxDirector {
  private unitTypeCache = new Map<string, UnitType>();
  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
  private unsubscribers: Array<() => void> = [];
  private started = false;

  constructor(
    private readonly mixer: AudioMixer,
    private readonly loader: AudioLoader,
  ) {}

  start(units: Record<string, Unit>, bus: EventBus): void {
    if (this.started) return;
    this.started = true;
    // Seed cache from initial snapshot. Units trained after start() are not cached
    // here; they receive SFX once they appear in a combat:resolved event while alive.
    for (const [id, unit] of Object.entries(units)) {
      this.unitTypeCache.set(id, unit.type);
    }
    this.unsubscribers.push(
      bus.on('combat:resolved', p => this.handleCombatResolved(p.result)),
      bus.on('unit:move', p => this.handleUnitMove(p.unitId, p.path)),
      bus.on('unit:destroyed', p => this.handleUnitDestroyed(p.unitId)),
    );
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    for (const id of this.pendingTimeouts) clearTimeout(id);
    this.pendingTimeouts = [];
    this.unitTypeCache.clear();
    this.started = false;
  }

  private playFile(path: string): void {
    void this.loader.get(path).then(buf => void this.mixer.playOneShot('sfx', buf));
  }

  private handleCombatResolved(result: CombatResult): void {
    const attackerType = this.unitTypeCache.get(result.attackerId);
    const defenderType = this.unitTypeCache.get(result.defenderId);

    if (attackerType) {
      const sfx = UNIT_SFX[attackerType];
      // Priority: ranged-loose (ranged), siege-fire (siege), attack-swing (melee)
      const sound = sfx?.['ranged-loose'] ?? sfx?.['siege-fire'] ?? sfx?.['attack-swing'];
      if (sound) this.playFile(sound.file);
    }

    if (defenderType) {
      const sfx = UNIT_SFX[defenderType];
      // Priority: attack-impact (melee), ranged-impact (ranged), siege-impact (siege)
      const impact = sfx?.['attack-impact'] ?? sfx?.['ranged-impact'] ?? sfx?.['siege-impact'];
      if (impact) this.playFile(impact.file);
    }

    if (!result.attackerSurvived && attackerType) {
      const death = UNIT_SFX[attackerType]?.death;
      if (death) this.playFile(death.file);
    }

    if (!result.defenderSurvived && defenderType) {
      const death = UNIT_SFX[defenderType]?.death;
      if (death) this.playFile(death.file);
    }
  }

  private handleUnitMove(unitId: string, path: HexCoord[]): void {
    const unitType = this.unitTypeCache.get(unitId);
    if (!unitType) return;

    const stepCount = path.length - 1;
    if (stepCount <= 0) return;

    const sfx = MOVEMENT_SFX[getLocomotionClass(unitType)];
    const totalDuration = getMovementDurationMs(stepCount);
    const interval = totalDuration / stepCount;

    for (let i = 0; i < stepCount; i++) {
      const id = setTimeout(() => {
        this.playFile(sfx.file);
        const idx = this.pendingTimeouts.indexOf(id);
        if (idx !== -1) this.pendingTimeouts.splice(idx, 1);
      }, i * interval);
      this.pendingTimeouts.push(id);
    }
  }

  private handleUnitDestroyed(unitId: string): void {
    const unitType = this.unitTypeCache.get(unitId);
    if (unitType) {
      const death = UNIT_SFX[unitType]?.death;
      if (death) this.playFile(death.file);
    }
    this.unitTypeCache.delete(unitId);
  }
}
