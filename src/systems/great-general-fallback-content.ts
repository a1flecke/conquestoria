/**
 * #888 — culturally-coherent fallback officer generation.
 *
 * When a civ has used every authored `GENERAL_DEFINITIONS` entry it is
 * eligible for, `generateGeneralCandidates` fills the remaining candidate
 * slots with *generated* officers built from these controlled data tables.
 *
 * Content rules (contract §13 / issue #888 Phases 4-5):
 *   - Names are plausible-but-fictional combinations from controlled lists.
 *     No entry is the name of a real historical commander, and none may
 *     collide with an authored `GENERAL_DEFINITIONS[].name` (enforced by
 *     `great-general-fallback-content.test.ts`).
 *   - Descriptors are a fixed, fact-free template — a rank plus one bland
 *     cultural clause. No battles, no dates, no real places, no biography
 *     claims. Richer biographies are #886's scope.
 *   - Mechanically ordinary: generated officers always use
 *     `STANDARD_GENERAL_COMMAND_PROFILE`. Unique mechanics are #885's scope.
 *   - Deterministic: every draw goes through the shared seeded LCG, never
 *     `Math.random`/`Date.now`.
 *   - Portraits reuse existing emoji only (no new assets — #889's scope).
 */
import { seededLcg } from '@/systems/seeded-lcg';
import { STANDARD_GENERAL_COMMAND_PROFILE, type GeneratedGeneralIdentity } from '@/systems/great-general-definitions';

/** Broad culture registers. `generic` is the guaranteed fallback for any civ
 * with no explicit mapping (e.g. a future custom civ). */
export type GeneralCultureFamily =
  | 'egyptian' | 'roman' | 'hellenic' | 'steppe' | 'mesopotamian' | 'persian'
  | 'nguni' | 'sinic' | 'isles' | 'nahua' | 'yamato' | 'indic' | 'frankish'
  | 'germanic' | 'rus' | 'turkic' | 'iberian' | 'norse'
  | 'gondorian' | 'rohirric' | 'hobbit' | 'mordorish' | 'brythonic' | 'annuvin'
  | 'wakandan' | 'arthurian' | 'elven' | 'narnian' | 'atlantean'
  | 'generic';

/**
 * `CivDefinition.id` → culture family. Every playable civ id must appear here;
 * `great-general-fallback-content.test.ts` cross-checks this map against
 * `CIV_DEFINITIONS` so a newly-added civ fails loudly until it is mapped.
 */
export const CULTURE_FAMILIES: Record<string, GeneralCultureFamily> = {
  egypt: 'egyptian',
  rome: 'roman',
  greece: 'hellenic',
  mongolia: 'steppe',
  babylon: 'mesopotamian',
  persia: 'persian',
  zulu: 'nguni',
  china: 'sinic',
  england: 'isles',
  aztec: 'nahua',
  japan: 'yamato',
  india: 'indic',
  france: 'frankish',
  germany: 'germanic',
  russia: 'rus',
  ottoman: 'turkic',
  spain: 'iberian',
  viking: 'norse',
  gondor: 'gondorian',
  rohan: 'rohirric',
  shire: 'hobbit',
  isengard: 'mordorish',
  prydain: 'brythonic',
  annuvin: 'annuvin',
  wakanda: 'wakandan',
  avalon: 'arthurian',
  lothlorien: 'elven',
  narnia: 'narnian',
  atlantis: 'atlantean',
};

interface NamePool {
  given: string[];
  surname: string[];
}

/**
 * Given + surname fragments per family. Deliberately generic period-plausible
 * elements — none is the full name of a real famous commander. Surnames lean
 * on occupational / toponymic / patronymic forms so combinations read as
 * "an officer of this culture" rather than "this specific person".
 */
export const GENERAL_FALLBACK_NAME_POOLS: Record<GeneralCultureFamily, NamePool> = {
  egyptian: {
    given: ['Nakht', 'Userhat', 'Paser', 'Amenmose', 'Hori', 'Djedu', 'Kaemwaset', 'Setka', 'Ranefer', 'Ipuy'],
    surname: ['of Waset', 'of Abydos', 'of the Two Lands', 'the Standard-Bearer', 'of Elephantine', 'of the River Guard', 'of Iunu', "the King's Fanbearer"],
  },
  roman: {
    given: ['Marcus', 'Titus', 'Gaius', 'Quintus', 'Lucius', 'Servius', 'Decimus', 'Publius', 'Aulus', 'Gnaeus'],
    surname: ['Valerius', 'Aurelius', 'Cornelius', 'Fabius', 'Sempronius', 'Livius', 'Vibius', 'Rufus', 'Longinus', 'Severus'],
  },
  hellenic: {
    given: ['Nikias', 'Kleon', 'Demetrios', 'Lysandros', 'Antigonos', 'Philotas', 'Kallias', 'Theron', 'Diophantos', 'Aristeas'],
    surname: ['of Argos', 'of Corinth', 'son of Melas', 'of Thebes', 'the Strategos', 'of Rhodes', 'son of Kydon', 'of Miletos'],
  },
  steppe: {
    given: ['Batu', 'Tarkhan', 'Qutlugh', 'Berke', 'Toqto', 'Sartaq', 'Nogai', 'Chilagun', 'Boroghul', 'Kadan'],
    surname: ['of the White Horde', 'the Arrow-Rider', 'of the Nine Standards', 'the Left-Hand Noyan', 'of the Kerulen', 'the Swift', 'of the Felt-Wall Camp'],
  },
  mesopotamian: {
    given: ['Ibni', 'Shamash-eriba', 'Nabu-zer', 'Ea-mukin', 'Bel-ibni', 'Kudurru', 'Iddin-Nabu', 'Arad-Bel', 'Zakir', 'Marduk-shum'],
    surname: ['of the Gate of the Gods', 'the Rab-mugi', 'of Borsippa', 'the Wall-Warden', 'of the Chariot Levy', 'of Sippar', "the King's Right Hand"],
  },
  persian: {
    given: ['Aryandes', 'Bagabuxsha', 'Vahyazdata', 'Spitamana', 'Farnah', 'Artabanos', 'Gaubaruva', 'Hydarnes', 'Tiribazos', 'Datana'],
    surname: ['the Myriarch', 'of Parsa', 'of the Immortals', 'satrap-appointed', 'of Ecbatana', "the King's Eye", 'of the Royal Road'],
  },
  nguni: {
    given: ['Sethunya', 'Mgobhozi', 'Nqoboka', 'Zwelibanzi', 'Mhlangana', 'Ndlela', 'Sigujana', 'Manqondo', 'Godide', 'Mnyamana'],
    surname: ['of the Left Horn', 'kaNdaba', 'the Chest-Regiment Captain', 'of the Buffalo Head', 'kaSompisi', 'the Ring-Wearer', 'of the White Shields'],
  },
  sinic: {
    given: ['Zhao', 'Wen', 'Liang', 'Shan', 'Cheng', 'Kuan', 'Yong', 'Bao', 'Jing', 'Fu'],
    surname: ['Zhang', 'Li', 'Han', 'Sun', 'Yang', 'Guo', 'Meng', 'Cao', 'Zhou', 'Xu'],
  },
  isles: {
    given: ['Edmund', 'Godwin', 'Aldred', 'Osric', 'Wulfstan', 'Cerdic', 'Leofric', 'Beorn', 'Ealdred', 'Aethelmund'],
    surname: ['of Wessex', 'Ashdown', 'of the Fen March', 'Greycloak', 'of Mercia', 'Fairborne', 'of the Cinque Ports', 'Holt'],
  },
  nahua: {
    given: ['Tlacaelel', 'Cuitlahua', 'Axayaca', 'Tlacotzin', 'Coyohua', 'Tizoc', 'Motecuh', 'Cacama', 'Ixtlil', 'Opochtli'],
    surname: ['of the Eagle Company', 'Tlacatecatl', 'of Tlatelolco', 'the Jaguar Knight', 'of the Chinampa Wards', 'Quauhtli', 'of the Serpent Wall'],
  },
  yamato: {
    given: ['Munenori', 'Hachiro', 'Katsutoshi', 'Naomasa', 'Tadaoki', 'Ujisato', 'Moritsuna', 'Kagemoto', 'Harunaga', 'Sadatsune'],
    surname: ['no Kami', 'of Owari', 'the Ashigaru Captain', 'of the Eastern Road', 'Saemon', 'of Mikawa', 'the Banner-General'],
  },
  indic: {
    given: ['Bhima', 'Devadatta', 'Samudra', 'Vikrama', 'Skandagupta', 'Arjunayana', 'Pushkara', 'Chandaka', 'Bhagabhadra', 'Dhanyakumara'],
    surname: ['of Magadha', 'Senapati', 'of the Elephant Corps', 'of Ujjain', 'the Standard-Bearer', 'of Pataliputra', 'of the Southern March'],
  },
  frankish: {
    given: ['Bertrand', 'Gerard', 'Aymer', 'Thibault', 'Renaud', 'Ogier', 'Girart', 'Hugues', 'Foulques', 'Amauri'],
    surname: ['de Vermandois', "of the King's Host", 'de Laon', 'the Marshal', 'de Nevers', 'of the Oriflamme', 'de Coucy'],
  },
  germanic: {
    given: ['Konrad', 'Dietrich', 'Albrecht', 'Bruno', 'Lothar', 'Gottfried', 'Eberhard', 'Reinhard', 'Wichmann', 'Hartmann'],
    surname: ['von Falkenberg', 'of the Free Companies', 'von Hohenstein', 'the Landsknecht-Hauptmann', 'von Auerbach', 'of the Rhine March', 'Sturmwald'],
  },
  rus: {
    given: ['Vsevolod', 'Mstislav', 'Dobrynya', 'Rostislav', 'Gleb', 'Bryachislav', 'Volodar', 'Izyaslav', 'Putyata', 'Sveneld'],
    surname: ['of Novgorod', 'the Voivode', 'of the Druzhina', 'of Chernigov', 'Snowbound', 'of the Northern Watch', 'of Pskov'],
  },
  turkic: {
    given: ['Ilhan', 'Sinan', 'Kutalmish', 'Tugrul', 'Aydin', 'Chaka', 'Baris', 'Artuk', 'Demir', 'Korkut'],
    surname: ['the Sipahi', 'of Edirne', 'Bey of the Frontier', 'of the Janissary Ortas', 'Aslan', 'of the Anatolian March', 'Sancakbey'],
  },
  iberian: {
    given: ['Sancho', 'Fernan', 'Alvar', 'Ramiro', 'Nuno', 'Bermudo', 'Gonzalo', 'Ordono', 'Munio', 'Tello'],
    surname: ['de Vivar', 'of Leon', 'the Adalid', 'de Carrion', 'of the Frontier Host', 'de Lara', 'of the Reconquista Banners'],
  },
  norse: {
    given: ['Sigurd', 'Halfdan', 'Bjorn', 'Thorstein', 'Gunnar', 'Sten', 'Hakon', 'Ulf', 'Ketil', 'Eystein'],
    surname: ['Ironside', 'the Shield-Breaker', 'Longship-Captain', 'the Far-Travelled', 'Hard-Ruler', 'of the Jomsborg Company', 'Storm-Sailed'],
  },
  gondorian: {
    given: ['Beregond', 'Hurin', 'Turgon', 'Egalmoth', 'Duinhir', 'Forlong', 'Hirluin', 'Baranor', 'Ingold', 'Mardil'],
    surname: ['of the White Tower', 'Warden of the Keys', 'of Dol Amroth', 'of the Rammas Guard', 'of Lossarnach', 'Captain of the Fountain', 'of the Pelargir Ships'],
  },
  rohirric: {
    given: ['Eodwine', 'Grimbold', 'Deorwine', 'Elfhelm', 'Ceorl', 'Herefara', 'Fastred', 'Dunhere', 'Horn', 'Gamling'],
    surname: ['of the Eastfold', 'Marshal of the Mark', 'of the Westemnet', 'Horse-Master', 'of Aldburg', 'of the Snowbourn', 'Rider of the Third Eored'],
  },
  hobbit: {
    given: ['Fastolph', 'Odo', 'Wilcome', 'Bandobras', 'Hugo', 'Marmadoc', 'Rorimac', 'Adalgrim', 'Isengar', 'Fortinbras'],
    surname: ['Bracegirdle', 'of the Bounders', 'Hornblower', 'of the Shire-muster', 'Goodbody', 'of Buckland', 'Proudfoot'],
  },
  mordorish: {
    given: ['Grishnak', 'Muzgash', 'Lagduf', 'Radbug', 'Snaga', 'Gorbag', 'Ufthak', 'Shakru', 'Mauhur', 'Orbal'],
    surname: ['of the White Hand', 'Pit-Captain', 'of the Iron Ring', 'Slave-Driver', 'of the Deeping Assault', 'Tower-Warden', 'of the Furnace Levy'],
  },
  brythonic: {
    given: ['Pryderi', 'Math', 'Gwern', 'Bran', 'Custennin', 'Geraint', 'Cadwy', 'Elidyr', 'Owain', 'Cai'],
    surname: ['of the Sons of Don', 'War-Leader of the Cantrefs', 'of Caer Dathyl', 'the Border-Warden', 'of the Hill Forts', 'of the Free Commots'],
  },
  annuvin: {
    given: ['Gwyn', 'Pwyll', 'Havgan', 'Morgant', 'Dorath', 'Aeddan', 'Iddawc', 'Gwrgi', 'Caradawc', 'Melwas'],
    surname: ['of the Iron Portals', 'Huntsman of the Deathless', 'of the Cauldron Host', 'the Faithless', 'of the Dark Gate', 'Marshal of the Fell Legion'],
  },
  wakandan: {
    given: ['Ayo', 'Aneka', 'Teela', 'Xoliswa', 'Folami', 'Zola', 'Sefu', 'Nomble', 'Kagiso', 'Themba'],
    surname: ['of the Dora Milaje', 'of the River Tribe', 'Border Captain', 'of the Golden City', 'of the Mining Guard', 'of the Panther Cohort'],
  },
  arthurian: {
    given: ['Gareth', 'Bedivere', 'Kay', 'Pelleas', 'Lamorak', 'Bors', 'Griflet', 'Lucan', 'Sagramore', 'Dinadan'],
    surname: ['of the Round Table', 'Knight of Camelot', 'of the Lake March', 'of the Summer Country', 'Warden of the Marches', 'of the Siege Perilous Guard'],
  },
  elven: {
    given: ['Rumil', 'Orophin', 'Mablung', 'Beleg', 'Enerdhil', 'Aegnor', 'Galdor', 'Lindir', 'Thavron', 'Erestor'],
    surname: ['of the Golden Wood', 'Warden of the Marches', 'of the Silverlode', 'March-Captain of Caras Galadhon', 'of the Naith', 'Bowmaster of Lorien'],
  },
  narnian: {
    given: ['Peridan', 'Cole', 'Colin', 'Roonwit', 'Nimienus', 'Tran', 'Sallowpad', 'Chervy', 'Passarids', 'Dar'],
    surname: ['of the Western Wood', 'Faun-Captain', 'of the Talking Beasts', 'Centaur of the Northern Watch', 'of Cair Paravel', 'of the Dancing Lawn'],
  },
  atlantean: {
    given: ['Nereus', 'Koral', 'Thalos', 'Poros', 'Halios', 'Kymon', 'Aigaios', 'Delphis', 'Okeanos', 'Bythos'],
    surname: ['of the Tide-Legions', 'Warden of the Deep Gates', 'of the Sunken Terraces', 'Current-Master', 'of the Abyssal Watch', 'of the Coral Bastion'],
  },
  generic: {
    given: ['Corvin', 'Halden', 'Maroc', 'Ferran', 'Doran', 'Tervis', 'Aldwin', 'Roderic', 'Casian', 'Merrin'],
    surname: ['the Steadfast', 'Ironhand', 'of the Long March', 'Stormcrow', 'the Unbroken', 'Greymantle', 'of the Free Companies', 'Hollow-Watch'],
  },
};

/** Military titles per family. Rendered as the lead clause of the descriptor. */
export const GENERAL_FALLBACK_TITLES: Record<GeneralCultureFamily, string[]> = {
  egyptian: ['Overseer of the Host', 'Troop Commander', 'Standard-Bearer', 'General of the Southern Border'],
  roman: ['Legatus', 'Tribune', 'Praefectus', 'Dux'],
  hellenic: ['Strategos', 'Polemarch', 'Taxiarch', 'Hipparch'],
  steppe: ['Noyan', 'Commander of a Thousand', 'Tumen-Leader', 'Keshig Captain'],
  mesopotamian: ['Rab-uqu', 'Field Marshal', 'Chariot Commander', 'Warden of the Levy'],
  persian: ['Myriarch', 'Spahbod', 'Commander of the Guard', 'Hazarapatish'],
  nguni: ['Induna', 'Regimental Commander', 'War-Captain', 'Chief of the Left Horn'],
  sinic: ['General', 'Field Marshal', 'Commandant', 'Grand Marshal'],
  isles: ['Ealdorman', 'Marshal', 'Captain of the Household', 'Warden of the March'],
  nahua: ['Tlacatecatl', 'Eagle Captain', 'War Leader', 'Keeper of the House of Darts'],
  yamato: ['Taisho', 'Bugyo', 'Banner-General', 'Captain of Foot'],
  indic: ['Senapati', 'Mahadandanayaka', 'Commander of Elephants', 'Warden of the March'],
  frankish: ['Marshal', 'Constable', 'Captain of the Host', 'Seneschal of War'],
  germanic: ['Hauptmann', 'Feldherr', 'Marshal', 'Captain of the Free Companies'],
  rus: ['Voivode', 'Tysyatsky', 'Captain of the Druzhina', 'Warden of the North'],
  turkic: ['Bey', 'Serdar', 'Sancakbey', 'Agha of the Ortas'],
  iberian: ['Adalid', 'Adelantado', 'Captain of the Frontier', 'Master of the Host'],
  norse: ['Hersir', 'Jarl of War', 'Longship-Captain', 'Battle-Leader'],
  gondorian: ['Captain of Gondor', 'Warden of the Tower', 'Lord of the Fiefs', 'Marshal of the Rammas'],
  rohirric: ['Marshal of the Mark', 'Captain of the Eored', 'Master of the Horse-Levy', 'Warden of the Fold'],
  hobbit: ['Captain of the Bounders', 'Hayward of the Muster', 'Chief Shirriff', 'Marshal of the Watch'],
  mordorish: ['War-Captain', 'Pit-Master', 'Uruk Overseer', 'Captain of the Assault'],
  brythonic: ['War-Leader', 'Warden of the Cantrefs', 'Captain of the Fastness', 'Master of the Hill Forts'],
  annuvin: ['Marshal of the Fell Legion', 'Huntsman-Captain', 'Warden of the Iron Portals', 'Lord of the Cauldron Host'],
  wakandan: ['General of the Dora Milaje', 'Border Captain', 'War-Chief', 'Commander of the Panther Cohort'],
  arthurian: ['Knight-Commander', 'Marshal of Camelot', 'Warden of the Marches', 'Captain of the Table'],
  elven: ['March-Warden', 'Captain of the Galadhrim', 'Bowmaster', 'Warden of the Naith'],
  narnian: ['Captain of the Western Wood', 'Marshal of the Beasts', 'Warden of the Northern Watch', 'General of Cair Paravel'],
  atlantean: ['Warden of the Deep', 'Tide-Marshal', 'Current-Master', 'Commander of the Abyssal Watch'],
  generic: ['Field Commander', 'Marshal', 'Captain-General', 'Warden of the Host'],
};

/** Family-neutral epithets. Empty slots (weighted ~3x) render no epithet. */
export const GENERAL_FALLBACK_EPITHETS: string[] = [
  '', '', '',
  'the Steadfast', 'the Bold', 'the Vigilant', 'the Unyielding', 'the Tireless',
  'the Even-Handed', 'the Wary', 'the Iron-Willed', 'the Far-Sighted', 'the Resolute',
  'the Patient', 'the Undaunted', 'the Ready',
];

/** Bland cultural adjective for the fact-free descriptor. */
const FAMILY_DESCRIPTOR_ADJ: Record<GeneralCultureFamily, string> = {
  egyptian: 'Egyptian', roman: 'Roman', hellenic: 'Hellenic', steppe: 'steppe',
  mesopotamian: 'Mesopotamian', persian: 'Persian', nguni: 'Nguni', sinic: 'Chinese',
  isles: 'island', nahua: 'Nahua', yamato: 'Japanese', indic: 'Indian', frankish: 'Frankish',
  germanic: 'Germanic', rus: 'Rus', turkic: 'Anatolian', iberian: 'Iberian', norse: 'Norse',
  gondorian: 'Gondorian', rohirric: 'Rohirric', hobbit: 'Shire', mordorish: 'Isengard',
  brythonic: 'Prydain', annuvin: 'Annuvin', wakandan: 'Wakandan', arthurian: 'Camelot',
  elven: 'Lorien', narnian: 'Narnian', atlantean: 'Atlantean', generic: 'seasoned',
};

/** Portrait emoji per family — reuses the emoji register already used by the
 * authored roster; adds no new art assets. */
const FAMILY_PORTRAIT_ICON: Record<GeneralCultureFamily, string> = {
  egyptian: '☀️', roman: '🦅', hellenic: '⚔️', steppe: '🏹', mesopotamian: '🏛️',
  persian: '👑', nguni: '🛡️', sinic: '🐉', isles: '🎖️', nahua: '🦅', yamato: '⛩️',
  indic: '🐘', frankish: '⚜️', germanic: '🦅', rus: '❄️', turkic: '🏰', iberian: '🗡️',
  norse: '🪓', gondorian: '🛡️', rohirric: '🐎', hobbit: '🍂', mordorish: '⚙️',
  brythonic: '⚔️', annuvin: '💀', wakandan: '🔱', arthurian: '⚜️', elven: '🍃',
  narnian: '🌟', atlantean: '🌊', generic: '🎖️',
};

/** Bounded per-slot draw budget before the deterministic cross-product walk. */
export const MAX_FALLBACK_ATTEMPTS = 40;

const HEX_FOLD_PRIME = 16777619;

/** Deterministic 32-bit FNV-style fold of a string → non-negative int. Mirrors
 * the folds already scattered across this codebase's seed helpers. */
function foldString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(hash ^ input.charCodeAt(i), HEX_FOLD_PRIME);
  }
  return hash >>> 0;
}

export function resolveCultureFamily(civType: string | undefined): GeneralCultureFamily {
  if (!civType) return 'generic';
  return CULTURE_FAMILIES[civType] ?? 'generic';
}

interface FallbackDraw {
  familyKey: GeneralCultureFamily;
  givenIdx: number;
  surnameIdx: number;
  titleIdx: number;
  epithetIdx: number;
  ordinal: number; // 0 = none; >= 2 renders " II", " III", ... in display text only
}

function toRoman(n: number): string {
  const table: [number, string][] = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  let value = n;
  for (const [v, sym] of table) {
    while (value >= v) {
      out += sym;
      value -= v;
    }
  }
  return out;
}

function buildIdentityFromDraw(civType: string, era: number, draw: FallbackDraw): GeneratedGeneralIdentity {
  const pool = GENERAL_FALLBACK_NAME_POOLS[draw.familyKey];
  const titles = GENERAL_FALLBACK_TITLES[draw.familyKey];
  const given = pool.given[draw.givenIdx % pool.given.length]!;
  const surname = pool.surname[draw.surnameIdx % pool.surname.length]!;
  const title = titles[draw.titleIdx % titles.length]!;
  const epithet = GENERAL_FALLBACK_EPITHETS[draw.epithetIdx % GENERAL_FALLBACK_EPITHETS.length]!;
  const roman = draw.ordinal >= 2 ? ` ${toRoman(draw.ordinal)}` : '';

  const baseName = `${given} ${surname}`.replace(/\s+/g, ' ').trim();
  const name = `${baseName}${roman}${epithet ? `, ${epithet}` : ''}`;

  // Stable, save-safe id. Carries its own identity — the pools are NEVER
  // re-consulted to resolve it (the persisted record in
  // `state.generatedGenerals` is authoritative), so a later name-pool edit can
  // never rename an existing officer. civType + era + token keep it globally
  // unique within a game.
  const token = foldString(
    `${draw.familyKey}:${draw.givenIdx}:${draw.surnameIdx}:${draw.titleIdx}:${draw.epithetIdx}:${draw.ordinal}`,
  ).toString(16).padStart(8, '0');
  const id = `generated:${civType || 'generic'}:${era}:${token}`;

  return {
    id,
    name,
    civTypeEligibility: civType ? [civType] : [],
    era,
    // Fact-free: a rank plus one bland cultural clause. No battle/date/place.
    descriptor: `${title}. A ${FAMILY_DESCRIPTOR_ADJ[draw.familyKey]} field commander, risen through the ranks of the host.`,
    portraitIcon: FAMILY_PORTRAIT_ICON[draw.familyKey],
    origin: 'generated',
    ...STANDARD_GENERAL_COMMAND_PROFILE,
    abilityIds: [...STANDARD_GENERAL_COMMAND_PROFILE.abilityIds],
  };
}

/**
 * Deterministically generate `count` fresh officer identities for `civType`
 * at `era`, none of whose ids appears in `excludeIds` (already-picked authored
 * or generated candidates, plus every id in the civ's used ledger).
 *
 * Determinism: the whole draw sequence is driven by `seededLcg` seeded from
 * `gameId + civType + era + baseSeed`. Same inputs -> identical output.
 *
 * Exhaustion safety (Phase 8): each slot gets up to `MAX_FALLBACK_ATTEMPTS`
 * random draws; on collision it advances the LCG and retries. After the cap it
 * walks the (given x surname x title x epithet) cross-product from a
 * seed-derived offset, and finally appends a Roman ordinal to the display name
 * only. No unbounded loop.
 */
export function generateFallbackGeneralCandidates(
  gameId: string | undefined,
  civType: string | undefined,
  era: number,
  baseSeed: number,
  count: number,
  excludeIds: Iterable<string>,
): GeneratedGeneralIdentity[] {
  const exclude = new Set(excludeIds);
  const familyKey = resolveCultureFamily(civType);
  const pool = GENERAL_FALLBACK_NAME_POOLS[familyKey];
  const titles = GENERAL_FALLBACK_TITLES[familyKey];
  const epithetCount = GENERAL_FALLBACK_EPITHETS.length;

  const rng = seededLcg(foldString(`${gameId ?? 'game'}:${civType ?? 'generic'}:${era}:${baseSeed}`) | 0);
  const out: GeneratedGeneralIdentity[] = [];

  const tryAccept = (draw: FallbackDraw): boolean => {
    const identity = buildIdentityFromDraw(civType ?? '', era, draw);
    if (exclude.has(identity.id)) return false;
    exclude.add(identity.id);
    out.push(identity);
    return true;
  };

  for (let slot = 0; slot < count; slot++) {
    let placed = false;

    for (let attempt = 0; attempt < MAX_FALLBACK_ATTEMPTS && !placed; attempt++) {
      placed = tryAccept({
        familyKey,
        givenIdx: Math.floor(rng() * pool.given.length),
        surnameIdx: Math.floor(rng() * pool.surname.length),
        titleIdx: Math.floor(rng() * titles.length),
        epithetIdx: Math.floor(rng() * epithetCount),
        ordinal: 0,
      });
    }

    // Deterministic cross-product walk from a seed-derived offset.
    if (!placed) {
      const span = pool.given.length * pool.surname.length * titles.length * epithetCount;
      const offset = Math.floor(rng() * Math.max(1, span));
      for (let step = 0; step < span && !placed; step++) {
        const linear = (offset + step) % span;
        const epithetIdx = linear % epithetCount;
        const t = Math.floor(linear / epithetCount);
        const titleIdx = t % titles.length;
        const s = Math.floor(t / titles.length);
        const surnameIdx = s % pool.surname.length;
        const givenIdx = Math.floor(s / pool.surname.length) % pool.given.length;
        placed = tryAccept({ familyKey, givenIdx, surnameIdx, titleIdx, epithetIdx, ordinal: 0 });
      }
    }

    // Final safety net: ordinal-suffixed display name (id stays distinct via
    // the ordinal in its token). Bounded at a sane ceiling.
    for (let ordinal = 2; ordinal < 200 && !placed; ordinal++) {
      placed = tryAccept({
        familyKey,
        givenIdx: Math.floor(rng() * pool.given.length),
        surnameIdx: Math.floor(rng() * pool.surname.length),
        titleIdx: Math.floor(rng() * titles.length),
        epithetIdx: 0,
        ordinal,
      });
    }
  }

  return out;
}
