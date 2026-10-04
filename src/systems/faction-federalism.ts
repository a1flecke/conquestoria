// src/systems/faction-federalism.ts
// #1246: Federal Autonomy policy (#927 rung 6) — constants, the toggle lock and the one command that
// flips the stance. The relief *amount* it buys lives in faction-relief.ts, which imports this module
// (never the reverse), so the policy never depends on the pressure model.
import type { GameState } from '../core/types';

// #927 Rung 6 (final) — Federal Autonomy. The only rung that is a real
// tradeoff rather than a free lever: a persistent civ-wide toggle (not an
// automatic tech effect) trading substantial Empire overextension relief for
// a share of central gold income. Deliberately NOT named "autonomy" alone —
// AutonomyPostureId already exists in the unrelated Cyber/network-warfare
// system (src/core/autonomy-state.ts) and this must not collide with it.
// Targets ONLY Empire overextension (Bureaucracy's own row family) — every
// distance-pressure lever already belongs to Road & Post/Regional
// Capital/Railway Administration, and giving this rung a fourth distance
// lever would blur its identity as the ladder's last-resort city-count lever.
export const FEDERALISM_TECH_ID = 'decolonization';
export const FEDERALISM_REMITTANCE_LOSS_FRACTION = 0.2;

/**
 * Gold lost to reduced central remittance while Federal Autonomy is active,
 * applied once per civ per turn at the canonical revenue-aggregation point in
 * turn-manager.ts (same choke point as Vassalage tribute). `Math.max(0, ...)`
 * guards against a reverse subsidy: a civ already running a deficit never has
 * that deficit reduced by enabling the stance.
 */
export function getFederalismRemittanceLoss(totalGoldThisTurn: number): number {
  return Math.floor(Math.max(0, totalGoldThisTurn) * FEDERALISM_REMITTANCE_LOSS_FRACTION);
}
// One lock, not separate min-duration/cooldown timers, covers both
// directions: after ANY toggle the stance is locked for this many turns.
// This isn't closing a phase-order exploit (relief and remittance loss both
// read the identical field at the identical per-civ turn-processing pass, so
// there is no gap between them to abuse) — it exists purely to stop thrash
// (flipping every turn to chase a marginal edge).
export const FEDERALISM_LOCK_TURNS = 8;

export function getFederalismLockedUntilTurn(civ: { federalismChangedTurn?: number }): number {
  return civ.federalismChangedTurn === undefined ? -Infinity : civ.federalismChangedTurn + FEDERALISM_LOCK_TURNS;
}

export function canToggleFederalism(state: GameState, civId: string): boolean {
  const civ = state.civilizations[civId];
  if (!civ) return false;
  return state.turn >= getFederalismLockedUntilTurn(civ);
}

export interface FederalismToggleResult {
  success: boolean;
  state: GameState;
  message: string;
}

export function setFederalismStance(state: GameState, civId: string, enabled: boolean): FederalismToggleResult {
  const civ = state.civilizations[civId];
  if (!civ) return { success: false, state, message: 'Unknown civilization.' };
  if (!civ.techState.completed.includes(FEDERALISM_TECH_ID)) {
    return { success: false, state, message: 'Research Decolonization before enabling Federal Autonomy.' };
  }
  if ((civ.federalismEnabled ?? false) === enabled) {
    return {
      success: false, state,
      message: enabled ? 'Federal Autonomy is already active.' : 'Federal Autonomy is already disabled.',
    };
  }
  if (!canToggleFederalism(state, civId)) {
    return {
      success: false, state,
      message: `Federal Autonomy cannot be changed again until turn ${getFederalismLockedUntilTurn(civ)}.`,
    };
  }
  return {
    success: true,
    message: enabled
      ? 'Federal Autonomy enabled — administrative relief begins, at reduced central gold income.'
      : 'Federal Autonomy disabled — full central gold income resumes.',
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: { ...civ, federalismEnabled: enabled, federalismChangedTurn: state.turn },
      },
    },
  };
}
