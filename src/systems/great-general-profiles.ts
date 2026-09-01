/**
 * #886 — rich Great General biographies and facts.
 *
 * Static, definition-only editorial content for the *authored*
 * `GENERAL_DEFINITIONS` roster: a short sourced biography, 2–4 facts, optional
 * context, and provenance notes. Deliberately a separate module from
 * `great-general-definitions.ts` rather than a field on `GeneralDefinition`:
 *
 *   - `GeneratedGeneralIdentity` (#888) shares the `GeneralDefinition` shape, so
 *     keeping profiles off that interface means generated officers *structurally*
 *     cannot carry one. Their fact-free design (contract §13 / #888 Phase 9)
 *     stays guaranteed with no runtime check.
 *   - Zero save-shape impact: `generatedGenerals` is the only persisted General
 *     data, authored entries are resolved by id, and nothing here is ever
 *     serialized. No migration, no `SAVE_VERSION` bump.
 *   - Editorial content and mechanical identity stay decoupled — #885 (unique
 *     mechanics) and #887 (Hall of Fame) can consume/evolve independently.
 *
 * Content rules (see `.claude/rules/great-general-content.md`):
 *   - `kind: 'historical'` — real person. Plain language for ages ~7–43, neutral
 *     tone, >= 2 authoritative sources (museum / Britannica / university /
 *     military-history institution). Disputed claims are hedged in the fact text
 *     ("later writers credited...", "traditionally said..."). Not player-facing
 *     URL dumps — `sources` is provenance for audit.
 *   - `kind: 'lore'` — fictional / legendary figure. `loreWork` names the source
 *     fiction; no invented canon; no fake external citations. The handful of
 *     game-original entries (Atlantis' admiral, the universal fallbacks) omit
 *     `loreWork` and are listed in `GAME_ORIGINAL_LORE_IDS`.
 *   - Nothing here changes gameplay. #885 owns unique mechanics.
 *
 * Enforced by `tests/systems/great-general-profiles.test.ts` (catalog-derived —
 * a new authored roster entry fails until its profile is added).
 */

export interface GeneralSourceNote {
  /** Page / article title. */
  title: string;
  /** The authoritative body responsible for the source. */
  publisher: string;
  /** https URL. Parseable; not fetched at runtime or in tests. */
  sourceUrl: string;
  /** ISO date the source was last checked, `YYYY-MM-DD`. */
  accessed: string;
}

export interface GeneralProfile {
  kind: 'historical' | 'lore';
  /** 1–3 sentences, clear first sentence. */
  summary: string;
  /** 2–4 items, one plain sentence each. */
  facts: string[];
  /** Optional short paragraph of orientation / caveat. */
  context?: string;
  /** Provenance. `historical` requires >= 2; `lore` may be empty. */
  sources: GeneralSourceNote[];
  /** `lore` only — the source fiction. Absent for game-original entries. */
  loreWork?: string;
}

/** Uniform access date for this content pass. */
const ACCESSED = '2026-08-31';

/**
 * `lore` entries that legitimately have no `loreWork` and no `sources` because
 * they are original to this game (no external fiction to cite). The completeness
 * test permits an absent `loreWork` for these ids only.
 */
export const GAME_ORIGINAL_LORE_IDS: ReadonlySet<string> = new Set([
  'gen_thessaly',
  'gen_universal_marshal',
  'gen_universal_warlord',
  'gen_universal_field_marshal',
  'gen_universal_commodore',
]);

const s = (title: string, publisher: string, sourceUrl: string): GeneralSourceNote => ({
  title,
  publisher,
  sourceUrl,
  accessed: ACCESSED,
});

export const GENERAL_PROFILES: Readonly<Record<string, GeneralProfile | undefined>> = {
  // ---------------------------------------------------------------------------
  // Historical
  // ---------------------------------------------------------------------------
  gen_ramesses: {
    kind: 'historical',
    summary:
      `Ramesses II, often called Ramesses the Great, was a pharaoh of Egypt's New Kingdom who reigned for about 66 years in the 1200s BCE. He is remembered for the hard-fought Battle of Kadesh against the Hittite Empire, for the peace treaty that later ended that war, and for a building program larger than any other pharaoh's.`,
    facts: [
      `He was the third pharaoh of Egypt's Nineteenth Dynasty and ruled for roughly 66 years, one of the longest reigns in ancient history.`,
      `At the Battle of Kadesh, around 1274 BCE, his army was ambushed by the Hittites; he rallied his troops to avoid a rout and then had the fight carved on temple walls as a personal triumph.`,
      `About sixteen years later he and the Hittite king Hattusili III agreed a treaty that is the earliest surviving peace treaty between two states.`,
      `He ordered the rock-cut temples at Abu Simbel, the memorial temple called the Ramesseum, and a new capital city, Pi-Ramesses.`,
    ],
    context:
      `Egyptian kings recorded their reigns as unbroken successes, so Ramesses' own monuments describe Kadesh as a crushing victory even though the battle changed little on the ground. Historians read those inscriptions alongside surviving Hittite records to reconstruct what actually happened.`,
    sources: [
      s(`Colossal statue of Ramesses II`, `British Museum`, `https://www.britishmuseum.org/collection/galleries/egyptian-sculpture/colossal-statue-ramesses-ii`),
      s(`Ramses II, king of Egypt`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Ramses-II-king-of-Egypt`),
      s(`The Battle of Kadesh & the First Peace Treaty`, `World History Encyclopedia`, `https://www.worldhistory.org/article/78/the-battle-of-kadesh--the-first-peace-treaty/`),
    ],
  },

  gen_caesar: {
    kind: 'historical',
    summary:
      `Julius Caesar was a Roman general and statesman whose conquest of Gaul and victory in a civil war made him the most powerful man in Rome. His seizure of sole power helped end the Roman Republic, and he was assassinated by a group of senators in 44 BCE.`,
    facts: [
      `Between 58 and 50 BCE he conquered Gaul, roughly modern France and Belgium, and wrote his own account of the campaigns, the "Commentaries on the Gallic War".`,
      `His siege of Vercingetorix at Alesia in 52 BCE, where his troops built two rings of fortifications at once, ended large-scale Gallic resistance.`,
      `In 49 BCE he led his army across the Rubicon river into Italy against the Senate's orders, starting a civil war he won at the Battle of Pharsalus in 48 BCE.`,
      `He was known for moving armies faster than his enemies expected, often arriving before they were ready.`,
    ],
    context:
      `Much of what we know about Caesar's campaigns comes from his own writing, which was meant to build his political reputation, so historians weigh it against other Roman sources.`,
    sources: [
      s(`Julius Caesar, Roman ruler`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Julius-Caesar-Roman-ruler`),
      s(`Gallic Wars`, `Encyclopaedia Britannica`, `https://www.britannica.com/event/Gallic-Wars`),
    ],
  },

  gen_alexander: {
    kind: 'historical',
    summary:
      `Alexander III of Macedon led his army from Greece across the Persian Empire to the edge of India without losing a battle. In little more than a decade he built one of the largest empires the ancient world had seen, and it broke apart among his generals after his death at age 32.`,
    facts: [
      `He won his major battles against the Persian king Darius III at Issus in 333 BCE and Gaugamela in 331 BCE, though his army was usually outnumbered.`,
      `He chose ground that suited him, such as the narrow plain at Issus, to stop larger enemy forces from surrounding him.`,
      `His last great battle, at the Hydaspes river in India in 326 BCE, was won against war elephants after a night crossing; soon after, his exhausted soldiers refused to march further east.`,
      `He was tutored as a boy by the philosopher Aristotle.`,
    ],
    context:
      `Alexander's campaigns spread Greek language and culture across western Asia, a period historians call the Hellenistic age, but the conquests were also very destructive to the cities that resisted him.`,
    sources: [
      s(`Alexander the Great`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Alexander-the-Great`),
      s(`Battle of the Hydaspes`, `World History Encyclopedia`, `https://www.worldhistory.org/article/660/battle-of-hydaspes/`),
    ],
  },

  gen_genghis: {
    kind: 'historical',
    summary:
      `Genghis Khan united the rival nomadic tribes of Mongolia in 1206 and turned them into the most effective army of their age. His campaigns began an empire that, under him and his successors, became the largest connected land empire in history.`,
    facts: [
      `In 1206 a great assembly of tribal leaders recognized him as ruler of all the Mongols, ending generations of steppe infighting.`,
      `His army was built around fast, lightly equipped horse archers who could move and regroup far quicker than the forces sent against them.`,
      `He organized his troops in units of ten, a hundred, and a thousand, and promoted commanders on ability rather than birth.`,
      `He issued a body of law known as the Yasa to govern the new state.`,
    ],
    context:
      `Mongol campaigns opened long-distance trade and travel across Asia, but the conquests also killed very large numbers of people and destroyed cities that resisted, and medieval accounts of the death tolls are hard to verify.`,
    sources: [
      s(`Genghis Khan`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Genghis-Khan`),
      s(`Mongol empire`, `Encyclopaedia Britannica`, `https://www.britannica.com/place/Mongol-empire`),
    ],
  },

  gen_nebuchadnezzar: {
    kind: 'historical',
    summary:
      `Nebuchadnezzar II was the most powerful king of the Neo-Babylonian Empire, ruling from 605 to 562 BCE. He is remembered for his wars in the eastern Mediterranean, especially the capture of Jerusalem, and for rebuilding Babylon into one of the ancient world's greatest cities.`,
    facts: [
      `After defeating Egyptian forces at Carchemish in 605 BCE, he made Babylon the leading power in the Near East.`,
      `His armies took Jerusalem twice; in 587 BCE they destroyed the city and its temple and deported many of its people, an event known as the Babylonian Exile.`,
      `He rebuilt Babylon on a huge scale, including the blue-tiled Ishtar Gate and a massive double city wall.`,
      `Later Greek and Roman writers credited him with building the Hanging Gardens of Babylon for his wife, though no archaeological trace of them has been found.`,
    ],
    context:
      `Much of Nebuchadnezzar's fame in Europe comes from the Hebrew Bible, which casts him as a villain; Babylonian records present him mainly as a builder and administrator.`,
    sources: [
      s(`Nebuchadnezzar II`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Nebuchadnezzar-II`),
      s(`Hanging Gardens of Babylon`, `World History Encyclopedia`, `https://www.worldhistory.org/Hanging_Gardens_of_Babylon/`),
    ],
  },

  gen_cyrus: {
    kind: 'historical',
    summary:
      `Cyrus II of Persia, known as Cyrus the Great, founded the Achaemenid Empire in the 6th century BCE. Starting from a small kingdom, he conquered the Median, Lydian, and Babylonian realms to build the largest empire the world had yet seen, stretching from the Aegean Sea toward the edge of India.`,
    facts: [
      `Around 550 BCE he united the Medes and Persians under his rule, then defeated King Croesus of wealthy Lydia about 546 BCE.`,
      `In 539 BCE his army entered Babylon with little fighting, and he presented himself as a restorer of local temples and customs rather than a destroyer.`,
      `A clay document called the Cyrus Cylinder records his version of the capture of Babylon and his policy toward the city's people.`,
      `The Hebrew Bible remembers him for allowing exiled Judeans to return home and rebuild their temple in Jerusalem.`,
    ],
    context:
      `The Cylinder and the Bible are both favourable accounts written for particular audiences, so Cyrus' reputation for tolerance rests on sources with reasons to praise him; even so, historians regard his light-handed treatment of conquered peoples as unusual for the period.`,
    sources: [
      s(`Cyrus the Great`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Cyrus-the-Great`),
      s(`Cyrus the Great`, `World History Encyclopedia`, `https://www.worldhistory.org/Cyrus_the_Great/`),
    ],
  },

  gen_chandragupta: {
    kind: 'historical',
    summary:
      `Chandragupta Maurya founded the Maurya Empire around 321 BCE and became the first ruler to bring most of the Indian subcontinent under a single government. He is usually described as rising with the guidance of his adviser Chanakya, also called Kautilya.`,
    facts: [
      `He overthrew the Nanda dynasty of Magadha, in about 321 BCE, to take control of the Ganges plain.`,
      `Around 305 BCE he fought Seleucus I, a former general of Alexander the Great, and the two settled with a treaty that gave the Mauryas land beyond the Indus in exchange for war elephants.`,
      `His empire was run through a large bureaucracy and network of informers described in the political manual known as the Arthashastra, linked to Chanakya.`,
      `According to Jain tradition he later gave up his throne, became a monk, and died by ritual fasting.`,
    ],
    context:
      `The main written sources are Greek accounts and much later Indian and Jain texts, so some details of his life, including his end, come from tradition rather than contemporary record.`,
    sources: [
      s(`Chandragupta, founder of Mauryan dynasty`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Chandragupta`),
      s(`Chandragupta Maurya`, `World History Encyclopedia`, `https://www.worldhistory.org/Chandragupta_Maurya/`),
    ],
  },

  gen_hannibal: {
    kind: 'historical',
    summary:
      `Hannibal Barca was a general of Carthage who fought Rome in the Second Punic War. In 218 BCE he marched an army, including war elephants, from Spain over the Alps into Italy, where he won a string of victories but could never force Rome to give in.`,
    facts: [
      `His crossing of the Alps in 218 BCE cost him much of his army and nearly all his elephants but let him strike Italy from an unexpected direction.`,
      `At Cannae in 216 BCE he let his centre give ground so his flanks could close around a much larger Roman army and destroy it, a manoeuvre still studied today.`,
      `He stayed in Italy for around fifteen years without a home base strong enough to finish the war.`,
      `He was finally beaten by the Roman general Scipio at Zama in North Africa in 202 BCE.`,
    ],
    context:
      `The main surviving accounts were written by Romans and Greeks after Carthage lost, so Hannibal is often described through the eyes of the side he fought; even so, his tactics were admired by Roman writers.`,
    sources: [
      s(`Hannibal, Carthaginian general`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Hannibal-Carthaginian-general-247-183-BCE`),
      s(`Second Punic War`, `Encyclopaedia Britannica`, `https://www.britannica.com/event/Second-Punic-War`),
    ],
  },

  gen_yuefei: {
    kind: 'historical',
    summary:
      `Yue Fei was a general of the Southern Song dynasty who fought to hold back the Jurchen Jin state after it overran northern China in the 1120s. Famous for his discipline and his refusal to loot, he was executed on false charges in 1142 and later became one of China's most honoured patriotic heroes.`,
    facts: [
      `He rose from a farming family to high command during the wars against the Jin invasion.`,
      `He drilled his troops hard and forbade them from stealing from civilians, which made his army unusually well regarded by the people it passed through.`,
      `His campaigns recovered territory in central China, but a court faction led by the minister Qin Hui wanted peace and had him imprisoned.`,
      `He was put to death in 1142 on charges later summed up in a phrase, "maybe there is", that became a Chinese byword for a fabricated accusation.`,
    ],
    context:
      `About twenty years after his death the Song court cleared his name and moved his body to an honoured tomb beside West Lake in Hangzhou, where kneeling statues of Qin Hui still stand as figures of shame.`,
    sources: [
      s(`Yue Fei`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Yue-Fei`),
      s(`Southern Song dynasty`, `Encyclopaedia Britannica`, `https://www.britannica.com/topic/Southern-Song-dynasty`),
    ],
  },

  gen_shaka: {
    kind: 'historical',
    summary:
      `Shaka was the king who built the Zulu from a small chiefdom into the leading military power in southeastern Africa in the early 1800s. He is linked to a set of battlefield reforms in weapons, formation, and organisation that reshaped warfare in the region.`,
    facts: [
      `He took power around 1816 and expanded Zulu control across a wide area within roughly a decade.`,
      `He is associated with favouring a short stabbing spear for close combat over the older long throwing spear.`,
      `His armies used the "horns of the buffalo" formation, in which a central force held the enemy while two wings swept around the flanks and a reserve waited behind.`,
      `He organised fighters into age-based regiments that lived in royal barracks, which let the kingdom raise and move troops quickly.`,
    ],
    context:
      `Most detailed accounts of Shaka come from a small number of European traders and later popular writers who dramatised and exaggerated his life, so historians treat the most extreme stories about him carefully.`,
    sources: [
      s(`Shaka, Zulu chief`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Shaka-Zulu-chief`),
      s(`Shaka Zulu's famous Impondo Zenkomo / the bull horns tactical battle formation`, `Ditsong Museums of South Africa`, `https://ditsong.org.za/en/shaka-zulus-famous-impondo-zenkomo-the-bull-horns-tactical-battle-formation/`),
    ],
  },

  gen_wellington: {
    kind: 'historical',
    summary:
      `Arthur Wellesley, the first Duke of Wellington, was a British general best known for his careful, defensive style of command. He drove French armies out of Spain and Portugal in the Peninsular War and then defeated Napoleon at Waterloo in 1815.`,
    facts: [
      `He commanded British and allied forces in the Peninsular War from 1808 to 1814, gradually pushing the French back across Spain.`,
      `He often placed his troops on the far side of a ridge, out of sight and out of artillery fire, then brought them forward to fire at close range when the enemy attacked.`,
      `At Waterloo in 1815 his army held its position all day until Prussian forces arrived to help complete the victory.`,
      `He later served twice as British prime minister.`,
    ],
    context:
      `Wellington's reputation rests as much on supply and defence as on attack; he was sparing with his soldiers' lives because Britain could not easily replace a lost army.`,
    sources: [
      s(`Wellington: The Iron Duke`, `National Army Museum`, `https://www.nam.ac.uk/explore/duke-wellington`),
      s(`Arthur Wellesley, 1st duke of Wellington`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Arthur-Wellesley-1st-Duke-of-Wellington`),
    ],
  },

  gen_napoleon: {
    kind: 'historical',
    summary:
      `Napoleon Bonaparte rose during the French Revolution to become Emperor of the French and the dominant military figure of his age. He reorganised how armies were structured and moved, won a long run of victories across Europe, and was finally defeated in 1815.`,
    facts: [
      `He built his Grande Armée around self-contained corps that could march by separate roads and combine quickly for battle, making the army faster than its rivals.`,
      `He trained as an artillery officer and used massed cannon fire as a central part of his battle plans.`,
      `His 1812 invasion of Russia destroyed most of his army through battle, hunger, and cold, and marked the turning point against him.`,
      `After a brief return to power in 1815 he lost the Battle of Waterloo and was exiled to the remote island of Saint Helena, where he died in 1821.`,
    ],
    context:
      `Napoleon's wars spread revolution-era legal reforms across Europe but also caused huge casualties over more than a decade of near-continuous fighting.`,
    sources: [
      s(`Napoleon Bonaparte`, `World History Encyclopedia`, `https://www.worldhistory.org/Napoleon_Bonaparte/`),
      s(`Napoleon I, emperor of France`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Napoleon-I`),
    ],
  },

  gen_frederick: {
    kind: 'historical',
    summary:
      `Frederick II of Prussia, called Frederick the Great, was an 18th-century king remembered as one of the leading generals of his day. He fought long wars to hold the province of Silesia against Austria and its allies, and drilled the Prussian army into a fast, disciplined force.`,
    facts: [
      `Soon after becoming king in 1740 he seized the wealthy Austrian province of Silesia, setting off decades of war.`,
      `He trained his army in the "oblique order", massing an attack against one end of the enemy line while holding the rest of his force back.`,
      `In late 1757, outnumbered on two fronts, he won at Rossbach and then at Leuthen within a month, saving Prussia from being overrun.`,
      `Away from war he was a keen flute player and writer who exchanged letters with Enlightenment thinkers such as Voltaire.`,
    ],
    context:
      `Prussia was a fairly small state surrounded by larger ones, so Frederick relied on constant drill to make his army move and fire faster than its enemies rather than on sheer numbers.`,
    sources: [
      s(`Frederick II, king of Prussia`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Frederick-II-king-of-Prussia`),
      s(`Silesian Wars`, `Encyclopaedia Britannica`, `https://www.britannica.com/event/Silesian-Wars`),
    ],
  },

  gen_suvorov: {
    kind: 'historical',
    summary:
      `Alexander Suvorov was a Russian field marshal of the late 1700s with a reputation for relentless attack. Over a career of about fifty years he won a long list of battles and sieges and is traditionally said never to have lost one.`,
    facts: [
      `He stressed speed, surprise, and aggressive use of the bayonet, and set out his methods in a short training manual called "The Science of Victory".`,
      `In 1799, in his late sixties, he cleared French armies out of northern Italy in a single campaign season.`,
      `When ordered on to Switzerland he led his outnumbered army on a hard fighting march across the Alps to avoid being trapped.`,
      `He was known for sharing hardships with his troops and paying close attention to their food, health, and morale.`,
    ],
    context:
      `The claim that Suvorov never lost a battle comes from a long admiring tradition in Russian military history; the exact number of his victories is given differently by different sources.`,
    sources: [
      s(`Aleksandr Vasilyevich Suvorov, Count Rimniksky`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Aleksandr-Vasilyevich-Suvorov-Graf-Rimniksky`),
      s(`Suvorov Crossing the Alps in 1799 (Vasily Surikov, State Russian Museum)`, `Google Arts & Culture`, `https://artsandculture.google.com/asset/suvorov-crossing-the-alps-in-1799/_AHnWPcZJr1YrQ`),
    ],
  },

  gen_mehmed: {
    kind: 'historical',
    summary:
      `Mehmed II, known as Mehmed the Conqueror, was the Ottoman sultan who captured Constantinople in 1453, ending the Byzantine Empire. He made the city his capital and spent the rest of his reign expanding Ottoman power in the Balkans and Anatolia.`,
    facts: [
      `He returned to the throne in 1451 and at once began preparing a campaign against Constantinople, the last major Byzantine stronghold.`,
      `His army battered the city's famous layered walls with very large cannon, one of which needed teams of oxen and hundreds of men to move.`,
      `When a chain blocked the harbour, he had warships dragged overland on greased tracks to get a fleet behind the defences.`,
      `The city fell on 29 May 1453 after a siege of roughly seven weeks, and he rebuilt it as the Ottoman capital.`,
    ],
    context:
      `European histories often use 1453 to mark the end of the Middle Ages; for the Ottomans, taking the city turned a strong regional state into an empire spanning two continents.`,
    sources: [
      s(`Mehmed II, Ottoman sultan`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Mehmed-II-Ottoman-sultan`),
      s(`Fall of Constantinople, 1453`, `Encyclopaedia Britannica`, `https://www.britannica.com/event/Fall-of-Constantinople-1453`),
    ],
  },

  gen_cuauhtemoc: {
    kind: 'historical',
    summary:
      `Cuauhtémoc was the last independent ruler of the Aztec (Mexica) empire. He took power as the Spanish and their allies closed in, refused to negotiate, and led the defence of the capital Tenochtitlan through a siege that ended in 1521. He is honoured today as a national hero in Mexico.`,
    facts: [
      `He became ruler around 1520, in his mid-twenties, after an epidemic of smallpox killed his predecessor.`,
      `He rejected the earlier policy of talking with the Spanish and organised the city for a fight to the finish.`,
      `Tenochtitlan, built on islands in a lake, held out for about three months before it fell, largely in ruins, on 13 August 1521; he was captured trying to escape by canoe.`,
      `His captors tortured him to make him reveal hidden gold, and four years later he was hanged during a Spanish expedition to Honduras.`,
    ],
    context:
      `Smallpox carried by the invaders had already killed a large part of the population before the siege began, which badly weakened the city's defence.`,
    sources: [
      s(`Cuauhtémoc, Mexica ruler`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Cuauhtemoc`),
      s(`The Fall of Tenochtitlan`, `World History Encyclopedia`, `https://www.worldhistory.org/article/2028/the-fall-of-tenochtitlan/`),
    ],
  },

  gen_tokugawa: {
    kind: 'historical',
    summary:
      `Tokugawa Ieyasu was the warlord who ended more than a century of civil war in Japan. His victory at the Battle of Sekigahara in 1600 made him the country's leading power, and in 1603 he founded a government, the Tokugawa shogunate, that ruled Japan for over 250 years.`,
    facts: [
      `He spent much of his childhood as a hostage of rival warlord families before building his own domain around Edo, today's Tokyo.`,
      `At Sekigahara in 1600 his eastern coalition defeated a western alliance in a single day, deciding who would govern Japan.`,
      `In 1603 the emperor named him shogun, and he made Edo the seat of national government instead of Kyoto.`,
      `He soon passed the title of shogun to his son but kept real control, ensuring the new government would outlast him.`,
    ],
    context:
      `The peace the Tokugawa enforced was long and stable but strict, with tight government limits on travel, social class, and contact with the outside world for the next two and a half centuries.`,
    sources: [
      s(`Tokugawa Ieyasu`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/Tokugawa-Ieyasu`),
      s(`Battle of Sekigahara`, `Encyclopaedia Britannica`, `https://www.britannica.com/event/Battle-of-Sekigahara`),
    ],
  },

  gen_elcid: {
    kind: 'historical',
    summary:
      `El Cid was the war name of Rodrigo Díaz de Vivar, an 11th-century Castilian noble and professional soldier. He fought for both Christian and Muslim rulers in the divided Spain of his day and ended his life as the independent ruler of Valencia.`,
    facts: [
      `The name "El Cid" comes from an Arabic word meaning "the lord"; he was also called "El Campeador", the champion.`,
      `After falling out with King Alfonso VI of Castile he spent years as a soldier for hire, for a time serving the Muslim rulers of Zaragoza.`,
      `In 1094, after a long siege, he captured the rich city of Valencia and governed it until his death in 1099.`,
      `About a century later an epic poem, the "Song of the Cid", reshaped him into a model of loyalty, and still later legends added deeds that are not in the historical record.`,
    ],
    context:
      `The real Rodrigo Díaz changed sides for pay and advantage, which was normal for a frontier warlord of his time; the faithful, idealised "Cid" of poems and films is a later invention.`,
    sources: [
      s(`El Cid, Castilian military leader`, `Encyclopaedia Britannica`, `https://www.britannica.com/biography/El-Cid-Castilian-military-leader`),
      s(`El Cid: history and legend`, `Camino del Cid Consortium`, `https://www.caminodelcid.org/en/cid-history-legend/cid-history`),
    ],
  },

  // ---------------------------------------------------------------------------
  // Lore
  // ---------------------------------------------------------------------------
  gen_ragnar: {
    kind: 'lore',
    summary:
      `Ragnar Lothbrok is a Viking hero of medieval Norse legend rather than a firmly historical person. Sagas written centuries later cast him as a Danish king and sea-raider whose sons led a great army against England, and historians believe the character blends several real ninth-century figures with pure storytelling.`,
    facts: [
      `The main stories about him come from Icelandic sagas and a Danish history written roughly 300 to 400 years after the events they describe.`,
      `There is no solid contemporary evidence that a single man called Ragnar Lothbrok existed.`,
      `Several of his supposed sons, including Ivar the Boneless and Halfdan, do appear in reliable records as leaders of the "Great Heathen Army" that invaded England in 865.`,
      `His by-name means roughly "hairy breeches", which legend explains as the protective clothing he wore to fight a serpent.`,
    ],
    context:
      `Ragnar's modern fame owes a great deal to television and novels; the medieval sources already treat him as heroic legend, and the game presents him that way too.`,
    loreWork: `Norse saga tradition — "Ragnars saga loðbrókar" (13th century) and Saxo Grammaticus, "Gesta Danorum" (c. 1185)`,
    sources: [
      s(`Ragnar Lothbrok`, `Encyclopaedia Britannica`, `https://www.britannica.com/topic/Ragnar-Lothbrok`),
      s(`Ragnar Lothbrok`, `World History Encyclopedia`, `https://www.worldhistory.org/Ragnar_Lothbrok/`),
    ],
  },

  gen_boromir: {
    kind: 'lore',
    summary:
      `In Tolkien's "The Lord of the Rings", Boromir is the elder son of the Steward of Gondor and the captain most trusted to defend its capital, Minas Tirith. He joins the Fellowship of the Ring, briefly tries to seize the Ring by force, and dies covering the escape of two companions.`,
    facts: [
      `He is heir to the Stewardship of Gondor, the office that rules the kingdom while its throne stands empty.`,
      `He led the defence of the ruined river-city of Osgiliath against Mordor before travelling north to the Council of Elrond.`,
      `The Ring's influence drove him to try to take it from Frodo, a lapse he repented moments later.`,
      `He was killed by orc arrows shielding Merry and Pippin, and his companions set his body adrift over the falls of Rauros.`,
    ],
    context:
      `Boromir embodies the temptation to use an enemy's weapon against him, a central danger in Tolkien's story.`,
    loreWork: `J.R.R. Tolkien, "The Lord of the Rings"`,
    sources: [],
  },

  gen_eomer: {
    kind: 'lore',
    summary:
      `Éomer is a cavalry commander of Rohan in "The Lord of the Rings", nephew of King Théoden and a Marshal of the Mark. He leads a decisive charge of the Rohirrim at the Battle of the Pelennor Fields and afterwards becomes king of Rohan.`,
    facts: [
      `As a Marshal of the Mark he commands one of Rohan's mounted armies, called éoreds.`,
      `He is first met patrolling the plains against orc raiders, against orders given to the king under bad counsel.`,
      `At the Pelennor Fields his horsemen arrive in time to break the siege of Minas Tirith.`,
      `After the war he succeeds Théoden as king of Rohan.`,
    ],
    loreWork: `J.R.R. Tolkien, "The Lord of the Rings"`,
    sources: [],
  },

  gen_merry: {
    kind: 'lore',
    summary:
      `Meriadoc "Merry" Brandybuck is a hobbit of the Shire in "The Lord of the Rings". Not a soldier by upbringing, he rides to war hidden among the Rohirrim and helps bring down one of the enemy's most feared commanders.`,
    facts: [
      `He is one of the four hobbits who leave the Shire with Frodo at the start of the quest.`,
      `King Théoden takes him as an esquire, and he reaches the battlefield carried in secret by the shield-maiden Éowyn.`,
      `At the Pelennor Fields he stabs the Lord of the Nazgûl from behind, letting Éowyn destroy him.`,
      `He returns home a decorated soldier and helps lead the Shire's own small uprising.`,
    ],
    context:
      `Tolkien's story repeatedly shows small, underestimated people changing great events, and Merry is one of its clearest cases.`,
    loreWork: `J.R.R. Tolkien, "The Lord of the Rings"`,
    sources: [],
  },

  gen_ugluk: {
    kind: 'lore',
    summary:
      `Uglúk is an Uruk-hai captain in "The Lord of the Rings", serving the wizard Saruman from the fortress of Isengard. He leads the war party that captures Merry and Pippin and drives it on a punishing forced march.`,
    facts: [
      `Saruman bred the Uruk-hai as larger, tougher fighters able to march in daylight, unlike common orcs.`,
      `Uglúk commands the band that seizes the two hobbits after Boromir's last stand.`,
      `He keeps his company moving at a brutal pace and puts down a mutiny among orcs from Mordor who want to halt.`,
      `He is killed by Éomer's riders when they catch the party at the edge of Fangorn Forest.`,
    ],
    context:
      `Uglúk is written as a genuinely competent field commander on the enemy's side, not a bungling minion.`,
    loreWork: `J.R.R. Tolkien, "The Lord of the Rings"`,
    sources: [],
  },

  gen_gwydion: {
    kind: 'lore',
    summary:
      `In Lloyd Alexander's "The Chronicles of Prydain", Gwydion is a prince of the House of Don and the land's foremost war-leader against Arawn, lord of the death-realm Annuvin. He is a mentor to the young hero Taran.`,
    facts: [
      `He is the most respected warrior of the Sons of Don, the royal house that guards Prydain.`,
      `He often works by disguise and stealth rather than at the head of an army.`,
      `He leads the final campaign against Arawn's forces in the last book of the series.`,
      `His name and rank are borrowed from Gwydion of the medieval Welsh "Mabinogi", though Alexander's character is his own invention.`,
    ],
    context:
      `Alexander took the setting and many names of Prydain from Welsh mythology but invented most of its characters and plots.`,
    loreWork: `Lloyd Alexander, "The Chronicles of Prydain"`,
    sources: [],
  },

  gen_hornedking: {
    kind: 'lore',
    summary:
      `In Lloyd Alexander's "The Chronicles of Prydain", Annuvin is the guarded death-realm ruled by Arawn, and its armies are led in the field by a masked, antlered war-leader, the Horned King. This General stands for that role: the supreme field commander of Annuvin's forces.`,
    facts: [
      `Annuvin is a fortress-realm of the dead and the source of Prydain's worst evils, including the tireless undead warriors called the Cauldron-Born.`,
      `In "The Book of Three", the Horned King serves as Arawn's champion and burns his way across the land at the head of an army.`,
      `Annuvin's soldiers are disciplined and merciless, and its enchanted servants and weapons are what make it so dangerous.`,
      `"The Champion" is the game's name for whoever holds that command; in the books it is the Horned King himself.`,
    ],
    context:
      `Treating Annuvin's commander as a role rather than one named person keeps the entry faithful to the books while fitting the game's roster format.`,
    loreWork: `Lloyd Alexander, "The Chronicles of Prydain"`,
    sources: [],
  },

  gen_okoye: {
    kind: 'lore',
    summary:
      `Okoye is a warrior of Wakanda in Marvel's comics and films, and the general of the Dora Milaje, the elite guard that protects the throne. She is known for total loyalty to Wakanda itself rather than to any single ruler.`,
    facts: [
      `The Dora Milaje are an all-women special-forces unit who serve as royal bodyguards and Wakanda's front-line troops.`,
      `Okoye's signature weapon is a spear, which she often prefers to firearms.`,
      `Her loyalty is to the nation and its traditions, which puts her in hard positions when the throne is contested.`,
      `Wakanda is depicted as a technologically advanced country that long hid its true strength from the outside world.`,
    ],
    context:
      `Wakanda and Okoye are modern creations owned by Marvel; this is a short description of a fictional character, not a historical account.`,
    loreWork: `Marvel Comics and the Marvel Cinematic Universe`,
    sources: [],
  },

  gen_lancelot: {
    kind: 'lore',
    summary:
      `Sir Lancelot is the most celebrated knight of King Arthur's Round Table in medieval legend. Stories praise him as unmatched in combat, but his love for Queen Guinevere finally splits the fellowship and helps bring Arthur's kingdom down.`,
    facts: [
      `He is called "du Lac", of the Lake, because legend says the Lady of the Lake raised him.`,
      `He entered French Arthurian romance in the 1100s and became central to the English tradition through Malory's "Le Morte d'Arthur" in the 1400s.`,
      `His love affair with Guinevere leads to war among the knights and the end of the Round Table.`,
      `He is a literary figure with no basis in recorded history.`,
    ],
    context:
      `Camelot and its knights are legend rather than history, and the game's Avalon civilization is built on that legendary material.`,
    loreWork: `Arthurian legend (Chrétien de Troyes; Thomas Malory, "Le Morte d'Arthur")`,
    sources: [],
  },

  gen_haldir: {
    kind: 'lore',
    summary:
      `Haldir is an Elf of Lothlórien in "The Lord of the Rings", one of the marchwardens who guard the borders of the forest realm. He meets the Fellowship at the woods' edge and escorts them to the elven city of Caras Galadhon.`,
    facts: [
      `Marchwardens patrol the forest's edges and challenge anyone trying to enter Lothlórien.`,
      `In the book his part is small: he blindfolds the Fellowship and guides them inward.`,
      `Peter Jackson's films give him a larger role, leading an elven company that fights and dies at Helm's Deep, which does not happen in the book.`,
      `Lothlórien's archers are among the most skilled in Tolkien's world.`,
    ],
    context:
      `Where the book and the well-known films differ, this profile flags it so the two versions are not mixed up.`,
    loreWork: `J.R.R. Tolkien, "The Lord of the Rings" (expanded role in Peter Jackson's films)`,
    sources: [],
  },

  gen_oreius: {
    kind: 'lore',
    summary:
      `Oreius is a centaur and the commander of Aslan's army in the 2005 film of "The Lion, the Witch and the Wardrobe". He is a steady, disciplined battlefield leader who fights for the Pevensie children against the White Witch.`,
    facts: [
      `He is a centaur, part human and part horse, one of the noble creature-peoples in Lewis's Narnia.`,
      `The named character Oreius was created for the film; Lewis's book describes Aslan's forces without giving this commander a name.`,
      `In the film he leads the charge at the Battle of Beruna and is briefly turned to stone by the White Witch before being revived.`,
      `Narnia's armies mix talking beasts and mythological creatures rather than ordinary soldiers.`,
    ],
    context:
      `This entry draws mainly on the film adaptation rather than the novels, which is worth knowing if you look for him in the books.`,
    loreWork: `"The Chronicles of Narnia" by C.S. Lewis; the named character Oreius is from the 2005 film "The Lion, the Witch and the Wardrobe"`,
    sources: [],
  },

  gen_thessaly: {
    kind: 'lore',
    summary:
      `Admiral Thessaly is an original character for this game's Atlantis civilization. She commands the "Sunken Fleet", the tide-legions that carry Atlantean power across and beneath the sea.`,
    facts: [
      `Atlantis in this game is a seafaring nation whose strength lies in coastal cities and naval warfare.`,
      `Thessaly's command is the fleet itself rather than a land army.`,
      `She is written as a master of underwater and coastal manoeuvre that surface navies struggle to match.`,
    ],
    context:
      `The classical "Atlantis" began as a story told by the philosopher Plato; this game's version, and Thessaly, are new inventions built on that idea.`,
    sources: [],
  },

  gen_universal_marshal: {
    kind: 'lore',
    summary:
      `The Iron Marshal is a stock early-era commander with no set homeland — an archetype rather than a specific person. Figures like this stand in for any civilization that has no general of its own from history or story.`,
    facts: [
      `The name and background are kept deliberately plain so the figure can belong to any early culture.`,
      `It fits an age before large standing armies, when a war-leader raised troops for a single campaign and then sent them home.`,
    ],
    context:
      `A commander like this one carries no real history by design, which is what lets him represent any people.`,
    sources: [],
  },

  gen_universal_warlord: {
    kind: 'lore',
    summary:
      `The Grey Warlord is a stock mid-era commander with no set homeland — an archetype rather than a named person. The game reaches for a figure like this when a civilization has no general of its own available.`,
    facts: [
      `He is imagined as a soldier who rose to command through skill on the battlefield rather than by birth.`,
      `The identity is left broad on purpose so it suits many cultures rather than one.`,
    ],
    sources: [],
  },

  gen_universal_field_marshal: {
    kind: 'lore',
    summary:
      `The Steel Field Marshal is a stock gunpowder-era commander with no set homeland — an archetype rather than a real person, used when a civilization has no dedicated general for the period.`,
    facts: [
      `The figure fits an age of drilled infantry, massed artillery, and professional staff work.`,
      `The lack of a fixed identity is intentional, so it can represent any power of the era.`,
    ],
    sources: [],
  },

  gen_universal_commodore: {
    kind: 'lore',
    summary:
      `The Storm Commodore is a stock modern-era commander with no set homeland — an archetype rather than a named person, used when no dedicated general is available.`,
    facts: [
      `The figure is imagined as an officer used to coordinating land, sea, and air forces across a whole theatre of war.`,
      `Like the other stock commanders, it is a culture-neutral stand-in rather than a portrait of anyone real.`,
    ],
    sources: [],
  },
};

/**
 * The single canonical resolver for authored-General editorial content. Returns
 * `undefined` for a generated-officer id or any unknown id — callers must treat
 * a missing profile as normal (generated officers never have one, and the
 * compact chooser UI does not depend on it).
 */
export function getGeneralProfile(generalId: string | undefined): GeneralProfile | undefined {
  if (!generalId) return undefined;
  return GENERAL_PROFILES[generalId];
}
