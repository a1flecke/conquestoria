/**
 * What a Great General command *looked like to the player* (#889): which units it touched, where, in whose colours
 * and with what one-line result. Pure and presentation-only -- it reads the state before and after an
 * `issueRally`/`issueSeizeTheMoment`/`issueLastStand` call and never changes either, so it cannot affect gameplay,
 * saves or determinism. The caller emits the moment; the renderer and the toast draw it.
 *
 * It is derived from the *difference* the command made (the markers the command itself writes on units), not from
 * the preview, so what is shown is exactly what happened: a command that changed nothing yields `null`.
 */
import type { HexCoord } from '@/core/types/hex';
import type { GeneralAbilityKind, GeneralAbilityMoment } from '@/core/types/general-presentation';
import { getHeroicCommandEligibility } from '@/systems/great-general-abilities';
import { getGeneralIdentityForUnit } from '@/systems/great-general-presentation';

export type { GeneralAbilityKind, GeneralAbilityMoment };

// The slice of state and unit this reads (structural, so a full `GameState` satisfies it without importing the core
// type barrel): the eligibility inputs plus the markers the three commands write.
type Unit = Parameters<typeof getHeroicCommandEligibility>[1] & {
  readonly id: string;
  readonly owner: string;
  readonly health: number;
  readonly position: HexCoord;
  readonly rallyProtectedThisRound?: boolean;
  readonly seizeGrantedBy?: { readonly turn: number };
  readonly lastStandHold?: { readonly formationId: string; readonly defenseBonusMultiplier: number; readonly expiresTurn: number };
};
type GameState = Parameters<typeof getHeroicCommandEligibility>[0] & {
  readonly units: Readonly<Record<string, Unit | undefined>>;
};

/** Enough to read as a formation without turning a ten-unit command into a screen of rings. */
export const MAX_DRAWN_AFFECTED_HEXES = 6;

const KIND_LABEL: Readonly<Record<GeneralAbilityKind, string>> = {
  rally: 'Rally',
  seize: 'Seize the Moment',
  'last-stand': 'Last Stand',
};

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function touchedUnits(kind: GeneralAbilityKind, before: GameState, after: GameState): Unit[] {
  const out: Unit[] = [];
  for (const unit of Object.values(after.units)) {
    if (!unit) continue;
    const prior = before.units[unit.id];
    if (!prior) continue;
    const touched =
      kind === 'rally' ? unit.rallyProtectedThisRound === true && prior.rallyProtectedThisRound !== true
      : kind === 'seize' ? unit.seizeGrantedBy?.turn === after.turn && prior.seizeGrantedBy?.turn !== after.turn
      : unit.lastStandHold !== undefined && unit.lastStandHold.formationId !== prior.lastStandHold?.formationId;
    if (touched) out.push(unit);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function summarize(kind: GeneralAbilityKind, touched: readonly Unit[], before: GameState, after: GameState): string {
  if (kind === 'rally') {
    const restored = touched.reduce((sum, unit) => sum + Math.max(0, unit.health - (before.units[unit.id]?.health ?? unit.health)), 0);
    return `Rally: ${plural(touched.length, 'unit')} steadied, ${restored} HP restored.`;
  }
  if (kind === 'seize') {
    return `Seize the Moment: ${plural(touched.length, 'unit')} can act again.`;
  }
  const hold = touched[0]?.lastStandHold;
  const percent = hold ? Math.round((hold.defenseBonusMultiplier - 1) * 100) : 0;
  const turns = hold ? Math.max(1, hold.expiresTurn - after.turn) : 0;
  return `Last Stand: ${plural(touched.length, 'unit')} hold the line, +${percent}% defense for ${plural(turns, 'turn')}.`;
}

/**
 * The moment a General's command produced, or `null` when it changed nothing (the issue functions return the
 * state unchanged when they have no valid target, so a refused command is never celebrated).
 */
export function describeGeneralAbilityMoment(
  kind: GeneralAbilityKind,
  before: GameState,
  after: GameState,
  generalUnitId: string,
): GeneralAbilityMoment | null {
  if (before === after) return null;
  const general = before.units[generalUnitId];
  const identity = getGeneralIdentityForUnit(before, generalUnitId);
  if (!general || !identity) return null;

  const touched = touchedUnits(kind, before, after);
  if (touched.length === 0) return null;

  const isFinalCommand = getHeroicCommandEligibility(before, general).isFinalCharge;
  const seen = new Set<string>();
  const affectedCoords: HexCoord[] = [];
  const nearest = [...touched].sort((a, b) => {
    const da = Math.abs(a.position.q - general.position.q) + Math.abs(a.position.r - general.position.r);
    const db = Math.abs(b.position.q - general.position.q) + Math.abs(b.position.r - general.position.r);
    return da - db || a.id.localeCompare(b.id);
  });
  for (const unit of nearest) {
    const key = `${unit.position.q},${unit.position.r}`;
    if (seen.has(key)) continue;
    seen.add(key);
    affectedCoords.push({ q: unit.position.q, r: unit.position.r });
    if (affectedCoords.length >= MAX_DRAWN_AFFECTED_HEXES) break;
  }

  const result = summarize(kind, touched, before, after);
  const summary = isFinalCommand
    ? `Final Command: ${result} ${identity.name} retires at the end of this turn.`
    : result;

  return {
    kind,
    civId: general.owner,
    generalUnitId,
    generalName: identity.name,
    isFinalCommand,
    generalCoord: { q: general.position.q, r: general.position.r },
    affectedCoords,
    affectedCount: touched.length,
    accent: identity.presentation.primary,
    glow: identity.presentation.secondary,
    summary,
  };
}

export function getGeneralAbilityLabel(kind: GeneralAbilityKind): string {
  return KIND_LABEL[kind];
}
