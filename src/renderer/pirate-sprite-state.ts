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

/**
 * Despite the name, this controller now serves two audiences:
 *  - Pirates get the full `resolve()` path: a persistent mode/tier/stage visual state plus a
 *    transient attack/hurt/death overlay, because pirate factions have patrol/raid/blockade
 *    identity that regular units don't.
 *  - Every other unit (player, AI, barbarian, minor-civ) gets only the transient combat pulse,
 *    via `resolveTransientState()` — the same underlying `transients` map, just without the
 *    pirate-specific persistent fields. `RenderLoop.applyCombatVisual()` writes into this map
 *    unconditionally for every combat, regardless of which audience will end up reading it back.
 */
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

  /**
   * Bare transient state for entities that have no PirateSpriteVisualState (mode/tier/stage
   * don't apply to non-pirate units). applyCombatVisual() records an attack/hurt/death
   * transient for *every* combat's attacker/defender unconditionally, pirate or not — this is
   * the missing read side for everyone else, so the transient it already writes doesn't just
   * expire unread.
   */
  resolveTransientState(entityId: string, nowMs: number): PirateSpriteState {
    const transient = this.transients.get(entityId);
    if (!transient) return 'idle';
    if (transient.expiresAtMs !== undefined && transient.expiresAtMs <= nowMs) {
      this.transients.delete(entityId);
      return 'idle';
    }
    return transient.state;
  }
}
