import { resolveGeneralDefinition, type GeneralDefinition, type GeneratedGeneralIdentity } from '@/systems/great-general-definitions';
import { getGeneralPortraitArt, type GeneralPortraitArt } from '@/systems/great-general-portraits';
import { resolveCultureFamily, type GeneralCultureFamily } from '@/systems/great-general-fallback-content';

/**
 * #889: the ONE place a Great General's visual identity is decided.
 *
 * Before this module every surface (candidate chooser, selected-unit panel, Hall of Fame card,
 * the Hall of Fame view-model) printed `definition.portraitIcon`, a single emoji shared by
 * several Generals (🦅 was Caesar, Cuauhtémoc and Frederick; 🛡️ and ⚔️ were shared by three
 * each). A surface that needs a General's look now asks `getGeneralPresentation(definition)`
 * and renders the result with `createGeneralPortrait` (`src/ui/general-portrait.ts`).
 *
 * What this is, honestly: an original, locally drawn heraldic CREST (a shield/round/diamond/banner field in two colours
 * with one geometric emblem). Where a vetted portrait image exists (`great-general-portraits.ts`) it is drawn inside that
 * field and the emblem is the fallback; those images are illustrations after public-domain artworks (or generated images of
 * imaginary people), never verified likenesses, and nothing here claims otherwise.
 *
 * Pure data: no DOM, no `GameState`, no randomness, nothing persisted (a save carries no
 * presentation; it is derived from the definition every time, so a repeated load always agrees).
 */

export type GeneralMotif =
  | 'sun' | 'wings' | 'swords' | 'bow' | 'tower' | 'shield' | 'crown' | 'star' | 'leaf' | 'wave'
  | 'axe' | 'horseshoe' | 'snowflake' | 'gear' | 'skull' | 'trident' | 'horn' | 'fleur' | 'serpent'
  | 'torii' | 'hat' | 'medal' | 'crescent' | 'spear';

export type GeneralCrestShape = 'shield' | 'round' | 'diamond' | 'banner';

/** 1 (early) .. 4 (late): drawn as pips under the emblem so an officer's era is legible at a glance. */
export type GeneralEraTier = 1 | 2 | 3 | 4;

export interface GeneralPresentation {
  readonly generalId: string;
  /** `authored`: an explicit row in `AUTHORED_CRESTS`. `generated`: derived from culture family + era (#888 officers). */
  readonly source: 'authored' | 'generated';
  readonly motif: GeneralMotif;
  readonly shape: GeneralCrestShape;
  readonly primary: string;
  readonly secondary: string;
  readonly eraTier: GeneralEraTier;
  /** The legacy emoji. Kept as the accessible/graceful fallback when the crest cannot be drawn. */
  readonly fallbackIcon: string;
  /** A portrait image drawn inside the crest field, when this authored General has one; the emblem is the fallback if it cannot load. */
  readonly portrait?: GeneralPortraitArt;
}

interface CrestSpec {
  readonly motif: GeneralMotif;
  readonly shape: GeneralCrestShape;
  readonly primary: string;
  readonly secondary: string;
}

/**
 * One row per authored General, keyed by the stable definition id. `(motif, shape, primary)` is unique
 * across the roster (pinned by `tests/systems/great-general-presentation.test.ts`), which is the whole
 * point: no two named commanders look alike. Colours are cultural shorthand, not a claim about arms.
 */
export const AUTHORED_CRESTS: Readonly<Record<string, CrestSpec>> = {
  // --- Historical civs ---
  gen_ramesses: { motif: 'sun', shape: 'round', primary: '#d4a13c', secondary: '#1d3a6b' },
  gen_caesar: { motif: 'wings', shape: 'shield', primary: '#8b1e1e', secondary: '#e8c64a' },
  gen_alexander: { motif: 'swords', shape: 'shield', primary: '#5b4a7a', secondary: '#e8c64a' },
  gen_genghis: { motif: 'bow', shape: 'banner', primary: '#2f6b8a', secondary: '#efe6cf' },
  gen_nebuchadnezzar: { motif: 'tower', shape: 'shield', primary: '#2a5f8f', secondary: '#e8c64a' },
  gen_shaka: { motif: 'shield', shape: 'round', primary: '#6a5e4a', secondary: '#efe6cf' },
  gen_yuefei: { motif: 'serpent', shape: 'banner', primary: '#b02a2a', secondary: '#e8c64a' },
  gen_cyrus: { motif: 'crown', shape: 'diamond', primary: '#7a2e8c', secondary: '#e8c64a' },
  gen_wellington: { motif: 'medal', shape: 'shield', primary: '#a03030', secondary: '#1d2a5c' },
  gen_cuauhtemoc: { motif: 'wings', shape: 'round', primary: '#1f7a5a', secondary: '#e8c64a' },
  gen_tokugawa: { motif: 'torii', shape: 'banner', primary: '#26263a', secondary: '#c4413a' },
  gen_chandragupta: { motif: 'horn', shape: 'diamond', primary: '#d98a1e', secondary: '#7a1f1f' },
  gen_napoleon: { motif: 'hat', shape: 'shield', primary: '#1d3a8c', secondary: '#e8c64a' },
  gen_frederick: { motif: 'wings', shape: 'diamond', primary: '#2b2f3a', secondary: '#c9ced6' },
  gen_suvorov: { motif: 'snowflake', shape: 'round', primary: '#4a7a9a', secondary: '#f2f6fa' },
  gen_mehmed: { motif: 'crescent', shape: 'banner', primary: '#b01c2e', secondary: '#f2f6fa' },
  gen_elcid: { motif: 'swords', shape: 'diamond', primary: '#8a6a3a', secondary: '#efe6cf' },
  gen_ragnar: { motif: 'axe', shape: 'round', primary: '#5a6068', secondary: '#c4413a' },
  // --- Fantasy / lore civs ---
  gen_boromir: { motif: 'tower', shape: 'banner', primary: '#dcdce6', secondary: '#1f1a14' },
  gen_eomer: { motif: 'horseshoe', shape: 'banner', primary: '#2d6a3d', secondary: '#d4a13c' },
  gen_merry: { motif: 'leaf', shape: 'round', primary: '#7ea860', secondary: '#5e3f24' },
  gen_ugluk: { motif: 'gear', shape: 'shield', primary: '#3a3a3a', secondary: '#c4413a' },
  gen_gwydion: { motif: 'swords', shape: 'banner', primary: '#3a6e94', secondary: '#dcdce6' },
  gen_hornedking: { motif: 'skull', shape: 'banner', primary: '#4a2a5a', secondary: '#e6dcc6' },
  gen_okoye: { motif: 'spear', shape: 'diamond', primary: '#7a1f3a', secondary: '#e8c64a' },
  gen_lancelot: { motif: 'fleur', shape: 'shield', primary: '#2a4a9a', secondary: '#dcdce6' },
  gen_haldir: { motif: 'bow', shape: 'round', primary: '#c9a227', secondary: '#2d6a3d' },
  gen_oreius: { motif: 'star', shape: 'round', primary: '#d4a13c', secondary: '#2a4a9a' },
  gen_thessaly: { motif: 'wave', shape: 'diamond', primary: '#2a7f9a', secondary: '#f08a6a' },
  // --- Universal fallback pool ---
  gen_hannibal: { motif: 'horn', shape: 'round', primary: '#6a5e4a', secondary: '#e8c64a' },
  gen_universal_marshal: { motif: 'shield', shape: 'shield', primary: '#5a6068', secondary: '#e8c64a' },
  gen_universal_warlord: { motif: 'swords', shape: 'round', primary: '#6a6a6a', secondary: '#7a1f1f' },
  gen_universal_field_marshal: { motif: 'medal', shape: 'diamond', primary: '#3a5a3a', secondary: '#e8c64a' },
  gen_universal_commodore: { motif: 'trident', shape: 'round', primary: '#3a4a7a', secondary: '#e8e8f0' },
};

/** Generated officers: one emblem + two colours per culture family (the family drives the officer's name pool already). */
const FAMILY_CREST: Readonly<Record<GeneralCultureFamily, { motif: GeneralMotif; primary: string; secondary: string }>> = {
  egyptian: { motif: 'sun', primary: '#c99a2e', secondary: '#1d3a6b' },
  roman: { motif: 'wings', primary: '#8b1e1e', secondary: '#e8c64a' },
  hellenic: { motif: 'swords', primary: '#3f5fa0', secondary: '#efe6cf' },
  steppe: { motif: 'bow', primary: '#2f6b8a', secondary: '#efe6cf' },
  mesopotamian: { motif: 'tower', primary: '#2a5f8f', secondary: '#e8c64a' },
  persian: { motif: 'crown', primary: '#7a2e8c', secondary: '#e8c64a' },
  nguni: { motif: 'shield', primary: '#6a5e4a', secondary: '#efe6cf' },
  sinic: { motif: 'serpent', primary: '#b02a2a', secondary: '#e8c64a' },
  isles: { motif: 'medal', primary: '#a03030', secondary: '#1d2a5c' },
  nahua: { motif: 'wings', primary: '#1f7a5a', secondary: '#e8c64a' },
  yamato: { motif: 'torii', primary: '#26263a', secondary: '#c4413a' },
  indic: { motif: 'horn', primary: '#d98a1e', secondary: '#7a1f1f' },
  frankish: { motif: 'fleur', primary: '#1d3a8c', secondary: '#e8c64a' },
  germanic: { motif: 'wings', primary: '#2b2f3a', secondary: '#c9ced6' },
  rus: { motif: 'snowflake', primary: '#4a7a9a', secondary: '#f2f6fa' },
  turkic: { motif: 'crescent', primary: '#b01c2e', secondary: '#f2f6fa' },
  iberian: { motif: 'swords', primary: '#8a6a3a', secondary: '#efe6cf' },
  norse: { motif: 'axe', primary: '#5a6068', secondary: '#c4413a' },
  gondorian: { motif: 'tower', primary: '#dcdce6', secondary: '#1f1a14' },
  rohirric: { motif: 'horseshoe', primary: '#2d6a3d', secondary: '#d4a13c' },
  hobbit: { motif: 'leaf', primary: '#7ea860', secondary: '#5e3f24' },
  mordorish: { motif: 'gear', primary: '#3a3a3a', secondary: '#c4413a' },
  brythonic: { motif: 'spear', primary: '#3a6e94', secondary: '#dcdce6' },
  annuvin: { motif: 'skull', primary: '#4a2a5a', secondary: '#e6dcc6' },
  wakandan: { motif: 'spear', primary: '#7a1f3a', secondary: '#e8c64a' },
  arthurian: { motif: 'fleur', primary: '#2a4a9a', secondary: '#dcdce6' },
  elven: { motif: 'leaf', primary: '#c9a227', secondary: '#2d6a3d' },
  narnian: { motif: 'star', primary: '#d4a13c', secondary: '#2a4a9a' },
  atlantean: { motif: 'wave', primary: '#2a7f9a', secondary: '#f08a6a' },
  generic: { motif: 'medal', primary: '#6a6a7a', secondary: '#e8c64a' },
};

export function getGeneralEraTier(era: number): GeneralEraTier {
  if (era <= 2) return 1;
  if (era <= 4) return 2;
  if (era <= 6) return 3;
  return 4;
}

/**
 * The single resolver. Total: any definition (authored, generated, or an authored id this table
 * has not been taught yet) yields a drawable presentation, so a surface never has to branch on
 * "did lookup fail". An authored id missing from `AUTHORED_CRESTS` is reported as `generated` (it
 * is derived, not authored) and is caught by the roster-coverage test.
 */
export function getGeneralPresentation(definition: GeneralDefinition): GeneralPresentation {
  const eraTier = getGeneralEraTier(definition.era);
  const authored = definition.origin === 'generated' ? undefined : AUTHORED_CRESTS[definition.id];
  if (authored) {
    return {
      generalId: definition.id, source: 'authored', eraTier, fallbackIcon: definition.portraitIcon,
      portrait: getGeneralPortraitArt(definition.id),
      motif: authored.motif, shape: authored.shape, primary: authored.primary, secondary: authored.secondary,
    };
  }
  const family = FAMILY_CREST[resolveCultureFamily(definition.civTypeEligibility[0])];
  return {
    generalId: definition.id, source: 'generated', eraTier, fallbackIcon: definition.portraitIcon,
    motif: family.motif, shape: 'shield', primary: family.primary, secondary: family.secondary,
  };
}

/** A General unit's name + presentation, for the panels that act on it (command previews). Resolves through the canonical definition resolver; `undefined` when the unit is not a General. */
export interface GeneralIdentity {
  readonly name: string;
  readonly presentation: GeneralPresentation;
}

/** The slice of `GameState` this reads (structural, so a full `GameState` satisfies it without importing the core type barrel). */
export interface GeneralIdentitySource {
  readonly units: Readonly<Record<string, { readonly generalDefinitionId?: string } | undefined>>;
  readonly generatedGenerals?: Readonly<Record<string, GeneratedGeneralIdentity>>;
}

export function getGeneralIdentityForUnit(state: GeneralIdentitySource, unitId: string): GeneralIdentity | undefined {
  const definition = resolveGeneralDefinition(state, state.units[unitId]?.generalDefinitionId);
  return definition ? { name: definition.name, presentation: getGeneralPresentation(definition) } : undefined;
}

/** What the retirement moment needs, built from facts the `general:retired` event and the owner's own definition already hold. */
export interface GeneralRetirementMomentItem {
  readonly civId: string;
  /** Dedupe key part; absent only for an event from a source that predates the field. */
  readonly generalDefinitionId?: string;
  readonly name: string;
  readonly presentation?: GeneralPresentation;
  /** The system-written end-of-career sentence (carries the career's real numbers). */
  readonly careerLine: string;
}
