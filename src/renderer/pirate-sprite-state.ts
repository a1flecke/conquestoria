import type { PirateBehavior } from '@/core/pirate-state';

export type PirateSpriteState = 'idle' | 'walk' | 'attack' | 'hurt' | 'death' | 'work';
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
  | { type: 'work'; entityId: string }
  | { type: 'relocation-started'; entityId: string }
  | { type: 'relocation-finished'; entityId: string };

type PersistentVisualState = Omit<PirateSpriteVisualState, 'state' | 'expiresAtMs'>;

// The v2 `attack` keyframes (cq2-attack-body / cq2-attack-swing / cq2-plume-attack /
// cq2-hound-attack-body / ... in sprite-animations-v2.css) run a 1.4s
// anticipation -> strike -> hold -> recover cycle. Keep the attacker pinned in the
// `attack` sprite state long enough for a full cycle to actually land -- the old
// shared 420ms window flipped `data-state` back to idle just past the strike frame,
// so all the player ever saw was a truncated pulse (#916). Mirrors WORK_STATE_MS's
// "long enough to see the loop play at least once" convention.
const ATTACK_STATE_MS = 1_500;
// `cq2-hurt` is a 0.55s one-shot (single iteration). 700ms clears it with margin
// without freezing the struck unit in a recoil pose the way ATTACK_STATE_MS would.
const HURT_STATE_MS = 700;
/**
 * How long a unit / landmark stays in the `death` sprite state. Exported because
 * `render-loop.ts` keeps a parallel death *snapshot* (the dead entity's data,
 * retained so it can still be drawn mid-collapse) that MUST expire on the same
 * clock -- a drifting literal there would either cut the collapse animation short
 * or leave a ghost sprite after it finishes.
 */
export const DEATH_STATE_MS = 1_200;
// A brief "just performed its civilian action" pulse (e.g. a trade unit delivering
// goods) -- long enough to see the cq-deliver/cq-work-bob loop play at least once
// (their keyframes run ~1.1s), matching ATTACK_STATE_MS's role for attack.
const WORK_STATE_MS = 1_400;

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
          expiresAtMs: nowMs + (event.attackerSurvived ? ATTACK_STATE_MS : DEATH_STATE_MS),
        });
        this.transients.set(event.defenderId, {
          state: event.defenderSurvived ? 'hurt' : 'death',
          expiresAtMs: nowMs + (event.defenderSurvived ? HURT_STATE_MS : DEATH_STATE_MS),
        });
        return;
      case 'destroyed':
        this.transients.set(event.entityId, { state: 'death', expiresAtMs: nowMs + DEATH_STATE_MS });
        return;
      case 'attack':
        this.transients.set(event.entityId, { state: 'attack', expiresAtMs: nowMs + ATTACK_STATE_MS });
        return;
      case 'hurt':
        this.transients.set(event.entityId, { state: 'hurt', expiresAtMs: nowMs + HURT_STATE_MS });
        return;
      case 'work':
        this.transients.set(event.entityId, { state: 'work', expiresAtMs: nowMs + WORK_STATE_MS });
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
