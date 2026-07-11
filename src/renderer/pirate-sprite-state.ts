import type { PirateBehavior } from '@/core/pirate-state';

export type PirateSpriteState = 'idle' | 'walk' | 'attack' | 'hurt' | 'death';
export type PirateSpriteMode = 'patrol' | 'raid' | 'blockade' | 'relocating';

export interface PirateSpriteVisualState {
  state: PirateSpriteState;
  mode: PirateSpriteMode;
  damage: 0 | 1 | 2 | 3;
  tier: 1 | 2 | 3;
  stage: 1 | 2 | 3 | 4 | 5;
  expiresAtMs?: number;
}

export type PirateSpriteVisualEvent =
  | {
      type: 'combat';
      attackerId: string;
      defenderId: string;
      attackerSurvived: boolean;
      defenderSurvived: boolean;
    }
  | { type: 'destroyed'; entityId: string }
  | { type: 'attack'; entityId: string }
  | { type: 'hurt'; entityId: string }
  | { type: 'relocation-started'; entityId: string }
  | { type: 'relocation-finished'; entityId: string };

type PersistentVisualState = Omit<PirateSpriteVisualState, 'state' | 'expiresAtMs'>;

const COMBAT_STATE_MS = 420;
const DEATH_STATE_MS = 1_200;

interface TransientState {
  state: PirateSpriteState;
  expiresAtMs?: number;
  mode?: PirateSpriteMode;
}

export function derivePirateSpriteMode(
  faction: {
    behavior: PirateBehavior;
    headquarters:
      | { kind: 'coastal-enclave' }
      | { kind: 'deep-sea-flotilla'; relocation: { planned: unknown | null } };
  },
): PirateSpriteMode {
  if (
    faction.headquarters.kind === 'deep-sea-flotilla'
    && faction.headquarters.relocation.planned
  ) return 'relocating';
  // besieging reuses the 'blockade' sprite mode — no new sprite art in this MR (#522).
  if (faction.behavior === 'besieging' || faction.behavior === 'blockading') return 'blockade';
  if (faction.behavior === 'raiding') return 'raid';
  return 'patrol';
}

export class PirateSpriteStateController {
  private transients = new Map<string, TransientState>();

  apply(event: PirateSpriteVisualEvent, nowMs: number): void {
    switch (event.type) {
      case 'combat':
        this.transients.set(event.attackerId, {
          state: event.attackerSurvived ? 'attack' : 'death',
          expiresAtMs: nowMs + (event.attackerSurvived ? COMBAT_STATE_MS : DEATH_STATE_MS),
        });
        this.transients.set(event.defenderId, {
          state: event.defenderSurvived ? 'hurt' : 'death',
          expiresAtMs: nowMs + (event.defenderSurvived ? COMBAT_STATE_MS : DEATH_STATE_MS),
        });
        return;
      case 'destroyed':
        this.transients.set(event.entityId, { state: 'death', expiresAtMs: nowMs + DEATH_STATE_MS });
        return;
      case 'attack':
      case 'hurt':
        this.transients.set(event.entityId, { state: event.type, expiresAtMs: nowMs + COMBAT_STATE_MS });
        return;
      case 'relocation-started':
        this.transients.set(event.entityId, { state: 'walk', mode: 'relocating' });
        return;
      case 'relocation-finished':
        this.transients.delete(event.entityId);
    }
  }

  resolve(entityId: string, persistent: PersistentVisualState, nowMs: number): PirateSpriteVisualState {
    const transient = this.transients.get(entityId);
    if (transient?.expiresAtMs !== undefined && transient.expiresAtMs <= nowMs) {
      this.transients.delete(entityId);
      return { state: 'idle', ...persistent };
    }
    if (!transient) return { state: 'idle', ...persistent };
    return {
      state: transient.state,
      ...persistent,
      mode: transient.mode ?? persistent.mode,
      ...(transient.expiresAtMs === undefined ? {} : { expiresAtMs: transient.expiresAtMs }),
    };
  }
}
