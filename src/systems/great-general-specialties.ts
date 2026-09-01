/**
 * #885 — reusable typed Great General specialties.
 *
 * `GeneralDefinition` / `GeneratedGeneralIdentity` are deliberately NOT touched
 * (mirrors #886's separate-module pattern): generated officers structurally
 * cannot be specialists, and there is no save-normalize change. Every ability /
 * AI / UI consumer reads `resolveGeneralMechanics(def)` instead of raw
 * definition fields or the old module constants in great-general-abilities.ts.
 *
 * No General-ID branches: divergence is data in GENERAL_SPECIALTIES +
 * GENERAL_SPECIALTY_ASSIGNMENTS only. Adding a 6th specialty = one catalog
 * entry + some assignments; zero consumer edits (see
 * .claude/rules/game-balance.md "Great General Specialty Bounds").
 */
import type { GeneralDefinition } from '@/systems/great-general-definitions';

export type GeneralSpecialtyId =
  | 'generalist' | 'defensive' | 'initiative' | 'logistician' | 'mobile' | 'endurance';

export interface ResolvedGeneralMechanics {
  commandRange: number;
  commandCapacity: number;
  maxCommandCharges: number;
  cooldownTurns: number;
  rally: { healAmount: number };
  lastStand: { defenseMultiplier: number; durationTurns: number };
  seize: { extraTargets: number };
}

/** The audited V1 numbers — the base every specialty delta applies to. */
export const BASELINE_GENERAL_MECHANICS: ResolvedGeneralMechanics = {
  commandRange: 2,
  commandCapacity: 3,
  maxCommandCharges: 3,
  cooldownTurns: 10,
  rally: { healAmount: 30 },
  lastStand: { defenseMultiplier: 1.15, durationTurns: 2 },
  seize: { extraTargets: 0 },
};

export interface GeneralSpecialtyDef {
  id: GeneralSpecialtyId;
  /** Kid-friendly name shown on existing surfaces. */
  displayName: string;
  /** One plain-language sentence: what it's good at + the cost. */
  summary: string;
  apply(base: ResolvedGeneralMechanics): ResolvedGeneralMechanics;
}

const clone = (m: ResolvedGeneralMechanics): ResolvedGeneralMechanics => ({
  ...m,
  rally: { ...m.rally },
  lastStand: { ...m.lastStand },
  seize: { ...m.seize },
});

export const GENERAL_SPECIALTIES: Record<GeneralSpecialtyId, GeneralSpecialtyDef> = {
  generalist: {
    id: 'generalist',
    displayName: 'Field Commander',
    summary: 'A dependable all-rounder with no special strength or weakness.',
    apply: base => clone(base),
  },
  defensive: {
    id: 'defensive',
    displayName: 'Defensive Commander',
    summary:
      'Especially good at holding ground: Last Stand protects more strongly (+25%) and lasts longer (3 turns). In exchange, a shorter command range.',
    apply: base => {
      const m = clone(base);
      m.lastStand.defenseMultiplier = 1.25;
      m.lastStand.durationTurns = 3;
      m.commandRange = 1;
      return m;
    },
  },
  initiative: {
    id: 'initiative',
    displayName: 'Bold Commander',
    summary:
      'Especially good at pressing an advantage: Seize the Moment reaches one more unit and its cooldown is shorter (7 turns). In exchange, a weaker Last Stand.',
    apply: base => {
      const m = clone(base);
      m.seize.extraTargets = 1;
      m.cooldownTurns = 7;
      m.lastStand.defenseMultiplier = 1.10;
      return m;
    },
  },
  logistician: {
    id: 'logistician',
    displayName: 'Supply Master',
    summary:
      'Especially good at keeping an army in the field: Rally heals far more (50). In exchange, a longer cooldown (13 turns).',
    apply: base => {
      const m = clone(base);
      m.rally.healAmount = 50;
      m.cooldownTurns = 13;
      return m;
    },
  },
  mobile: {
    id: 'mobile',
    displayName: 'Swift Commander',
    summary:
      'Especially good at covering ground: a longer command range (3). In exchange, commands fewer units at once (2).',
    apply: base => {
      const m = clone(base);
      m.commandRange = 3;
      m.commandCapacity = 2;
      return m;
    },
  },
  endurance: {
    id: 'endurance',
    displayName: 'Tireless Commander',
    summary:
      'Especially good at a long war: one extra lifetime Command Charge (4). In exchange, a lighter Rally (20).',
    apply: base => {
      const m = clone(base);
      m.maxCommandCharges = 4;
      m.rally.healAmount = 20;
      return m;
    },
  },
};

/**
 * Authored roster id -> specialty. Covers exactly GENERAL_DEFINITIONS ids; no
 * 'generated:' keys (a generated officer resolves to baseline via the absent
 * lookup). Universal fallback commanders are 'generalist' by policy — the clear
 * mechanical fallback tier (#885 Phase 32). #886 historical/lore framing was
 * design inspiration only; nothing here reads profile strings.
 */
export const GENERAL_SPECIALTY_ASSIGNMENTS: Record<string, GeneralSpecialtyId> = {
  gen_hannibal: 'generalist',
  gen_universal_marshal: 'generalist',
  gen_universal_warlord: 'generalist',
  gen_universal_field_marshal: 'generalist',
  gen_universal_commodore: 'generalist',
  gen_thessaly: 'generalist',

  gen_wellington: 'defensive',
  gen_boromir: 'defensive',
  gen_nebuchadnezzar: 'defensive',
  gen_tokugawa: 'defensive',
  gen_cuauhtemoc: 'defensive',
  gen_haldir: 'defensive',

  gen_caesar: 'initiative',
  gen_suvorov: 'initiative',
  gen_frederick: 'initiative',
  gen_napoleon: 'initiative',
  gen_lancelot: 'initiative',
  gen_merry: 'initiative',

  gen_yuefei: 'logistician',
  gen_chandragupta: 'logistician',
  gen_ramesses: 'logistician',
  gen_cyrus: 'logistician',
  gen_gwydion: 'logistician',

  gen_genghis: 'mobile',
  gen_eomer: 'mobile',
  gen_ragnar: 'mobile',
  gen_ugluk: 'mobile',
  gen_alexander: 'mobile',
  gen_oreius: 'mobile',

  gen_shaka: 'endurance',
  gen_mehmed: 'endurance',
  gen_elcid: 'endurance',
  gen_okoye: 'endurance',
  gen_hornedking: 'endurance',
};

type MechDefFields = Pick<
  GeneralDefinition,
  'id' | 'commandRange' | 'commandCapacity' | 'maxCommandCharges' | 'cooldownTurns'
>;

const CACHE = new Map<string, ResolvedGeneralMechanics>();

/**
 * Hard floors — belt-and-braces against a bad catalog entry / future bug.
 * Independent of (and stricter than the floor of) the softer documented bounds
 * enforced by `great-general-specialties.test.ts`. Never lets a consumer see
 * `cooldown 0` / a negative charge count / NaN.
 */
function clampHard(m: ResolvedGeneralMechanics): ResolvedGeneralMechanics {
  const out = clone(m);
  out.commandRange = Math.max(1, Math.round(out.commandRange));
  out.commandCapacity = Math.max(1, Math.round(out.commandCapacity));
  out.maxCommandCharges = Math.max(1, Math.round(out.maxCommandCharges));
  out.cooldownTurns = Math.max(1, Math.round(out.cooldownTurns));
  out.rally.healAmount = Math.max(0, out.rally.healAmount);
  out.lastStand.defenseMultiplier = Math.max(1, out.lastStand.defenseMultiplier);
  out.lastStand.durationTurns = Math.max(1, Math.round(out.lastStand.durationTurns));
  out.seize.extraTargets = Math.max(0, Math.round(out.seize.extraTargets));
  return out;
}

/**
 * The single canonical resolver. O(1): a Map lookup + one shallow merge,
 * memoized by `def.id`. Unknown / unassigned / 'generated:' id -> baseline.
 * Never reads difficulty.
 */
export function resolveGeneralMechanics(def: MechDefFields): ResolvedGeneralMechanics {
  const cached = CACHE.get(def.id);
  if (cached) return cached;

  const base: ResolvedGeneralMechanics = {
    commandRange: def.commandRange,
    commandCapacity: def.commandCapacity,
    maxCommandCharges: def.maxCommandCharges,
    cooldownTurns: def.cooldownTurns,
    rally: { healAmount: BASELINE_GENERAL_MECHANICS.rally.healAmount },
    lastStand: { ...BASELINE_GENERAL_MECHANICS.lastStand },
    seize: { ...BASELINE_GENERAL_MECHANICS.seize },
  };

  const specialtyId = GENERAL_SPECIALTY_ASSIGNMENTS[def.id];
  const resolved = clampHard(
    !specialtyId || specialtyId === 'generalist'
      ? base
      : GENERAL_SPECIALTIES[specialtyId].apply(base),
  );
  CACHE.set(def.id, resolved);
  return resolved;
}

/**
 * The specialty label + one line for the two existing surfaces (selected-unit
 * panel, candidate chooser). Returns `undefined` for a generalist or any id
 * without an assignment (generated officers, unknown ids) so callers render
 * nothing rather than a misleading line.
 */
export function getGeneralSpecialtyPresentation(
  def: Pick<GeneralDefinition, 'id'>,
): { id: GeneralSpecialtyId; displayName: string; summary: string } | undefined {
  const specialtyId = GENERAL_SPECIALTY_ASSIGNMENTS[def.id];
  if (!specialtyId || specialtyId === 'generalist') return undefined;
  const s = GENERAL_SPECIALTIES[specialtyId];
  return { id: s.id, displayName: s.displayName, summary: s.summary };
}
