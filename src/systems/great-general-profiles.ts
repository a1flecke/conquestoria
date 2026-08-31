/**
 * #886: rich educational content for the authored Great General roster.
 *
 * Kept separate from `great-general-definitions.ts` (which stays a compact
 * gameplay-facing table) and merged onto `GENERAL_DEFINITIONS` at module load.
 * Every authored id must appear here exactly once; the completeness suite
 * (`great-general-profiles.test.ts`) fails loudly for a roster entry with no
 * profile, so a future General cannot ship content-less.
 *
 * Policy (see the PR and `.claude/rules/wonder-content.md`'s sibling note for
 * the full rationale):
 *   - `historical` / `legendary` entries carry a `GeneralHistoricalProfile`
 *     with >= 1 authoritative `sources` note. Facts are cross-checked against
 *     those sources; disputed or legendary claims are worded as tradition
 *     ("later accounts credit...") rather than settled fact.
 *   - `lore` / `archetype` entries carry a `GeneralLoreProfile` drawn only from
 *     the named `setting`; no external citations for fictional material.
 *   - Content is non-mechanical: it grants no gameplay effect. #885 owns unique
 *     General mechanics; #887 owns dynamic campaign history.
 *   - #888 generated officers stay fact-free — they get no entry here.
 */
import type {
  GeneralHistoricalProfile,
  GeneralLoreProfile,
} from '@/core/types';

export type GeneralProfileEntry =
  | { provenance: 'historical'; profile: GeneralHistoricalProfile }
  | { provenance: 'legendary'; profile: GeneralHistoricalProfile }
  | { provenance: 'lore'; profile: GeneralLoreProfile }
  | { provenance: 'archetype'; profile: GeneralLoreProfile };

// --- source-note builders (shared shape with WonderCodexFactSource) ---------

const whe = (path: string, notes: string) => ({
  title: 'World History Encyclopedia',
  publisher: 'World History Encyclopedia (registered educational nonprofit)',
  sourceUrl: `https://www.worldhistory.org/${path}/`,
  notes,
});

const britannica = (slug: string, notes: string) => ({
  title: 'Encyclopaedia Britannica',
  publisher: 'Encyclopaedia Britannica, Inc.',
  sourceUrl: `https://www.britannica.com/${slug}`,
  notes,
});

const nam = (path: string, notes: string) => ({
  title: 'National Army Museum',
  publisher: 'National Army Museum (United Kingdom)',
  sourceUrl: `https://www.nam.ac.uk/${path}`,
  notes,
});

// --- archetype builder (the nation-neutral universal fallback pool) ---------

const archetype = (summary: string, facts: string[], context: string): GeneralProfileEntry => ({
  provenance: 'archetype',
  profile: { summary, facts, context, setting: 'Original Conquestoria lore' },
});

// ---------------------------------------------------------------------------

export const GENERAL_PROFILES: Record<string, GeneralProfileEntry> = {
  // ===================== HISTORICAL (real people) =====================

  gen_ramesses: {
    provenance: 'historical',
    profile: {
      summary:
        'Ramesses II ruled Egypt for roughly 66 years in the 13th century BCE, at the height of the New Kingdom. He is remembered as much for his enormous building programme and tireless self-promotion as for his campaigns.',
      facts: [
        'At the Battle of Kadesh (about 1274 BCE) his lead division was ambushed by the Hittites; he rallied his troops and avoided disaster, though the fight ended closer to a draw than the sweeping victory his monuments claim.',
        'Years later he and the Hittite king Hattusili III agreed a treaty that is the earliest formal peace treaty between two states known to survive.',
        'He founded a new capital, Per-Ramesses, and left temples across Egypt, including the rock-cut temples at Abu Simbel and the Ramesseum.',
        'His reign was long and stable enough that later Egyptians treated it as a golden age.',
      ],
      context:
        'Historians still debate how much of his fame reflects real achievement and how much is the sheer volume of inscriptions he left praising himself.',
      sources: [
        whe('Ramesses_II', 'Reign dates, Kadesh outcome, the Egyptian-Hittite treaty, and building programme.'),
      ],
    },
  },

  gen_caesar: {
    provenance: 'historical',
    profile: {
      summary:
        'Julius Caesar (100-44 BCE) was a Roman politician and general whose conquest of Gaul and victory in a civil war made him dictator of Rome. His career helped end the Roman Republic.',
      facts: [
        'His eight-year campaign in Gaul (58-51 BCE) ended with the siege of Alesia in 52 BCE and the surrender of the Gallic leader Vercingetorix.',
        'He twice landed troops in Britain and had his engineers bridge the Rhine to overawe the tribes beyond it.',
        'In 49 BCE he led his army across the Rubicon river into Italy, an act of open rebellion, and defeated his rival Pompey at Pharsalus the next year.',
        'He was named dictator for life in 44 BCE and assassinated weeks later by a group of senators.',
      ],
      context:
        'Caesar wrote his own campaign accounts, which is one reason his version of events is so well known and so often re-examined.',
      sources: [
        whe('Julius_Caesar', 'Dates, offices, the Gallic Wars and Alesia, the Rubicon and civil war, and his assassination.'),
      ],
    },
  },

  gen_alexander: {
    provenance: 'historical',
    profile: {
      summary:
        'Alexander III of Macedon (356-323 BCE), called "the Great", led a Greek and Macedonian army from the Balkans to the edge of India in about a decade and was never beaten in a pitched battle.',
      facts: [
        'He was tutored as a boy by the philosopher Aristotle.',
        'He broke the Persian Empire of Darius III in three great battles - Granicus, Issus, and Gaugamela - between 334 and 331 BCE.',
        'His army combined a long-pike infantry phalanx with a hard-hitting Companion cavalry that he usually led in person.',
        'He died of a fever in Babylon at the age of 32; the exact cause is still argued over.',
      ],
      context:
        'His empire was divided among his generals almost immediately after his death and did not outlast the century as a single state.',
      sources: [
        whe('Alexander_the_Great', 'Dates, Aristotle, the three battles against Darius III, army composition, and death in Babylon.'),
      ],
    },
  },

  gen_genghis: {
    provenance: 'historical',
    profile: {
      summary:
        'Born Temujin around 1162, Genghis Khan united the rival tribes of the Mongolian steppe and was proclaimed their overlord in 1206. The empire he began became the largest connected land empire in history.',
      facts: [
        'He organised his army in units of tens, hundreds, thousands, and ten-thousands, cutting across old tribal loyalties and enforcing strict discipline.',
        'His forces were almost all mounted archers, able to move and resupply over huge distances and to coordinate through a relay courier system.',
        'He campaigned against the Jin state in northern China and destroyed the Khwarazmian Empire in Central Asia in 1219-1221.',
        'The Mongol campaigns caused very large loss of life; medieval casualty figures are high but considered unreliable.',
      ],
      context:
        'His descendants continued the expansion, and Mongol rule eventually stretched from Korea to Eastern Europe.',
      sources: [
        whe('Genghis_Khan', 'Birth name and the 1206 assembly, decimal army organisation, mounted-archer mobility, the Jin and Khwarazm campaigns, and the human cost.'),
      ],
    },
  },

  gen_nebuchadnezzar: {
    provenance: 'historical',
    profile: {
      summary:
        'Nebuchadnezzar II ruled the Neo-Babylonian Empire for 43 years (about 605-562 BCE) and made Babylon one of the most impressive cities of the ancient world.',
      facts: [
        'His victory at Carchemish in 605 BCE, over an Egyptian army, secured Babylonian control of the lands between Mesopotamia and the Mediterranean.',
        'After Judah rebelled, his army besieged and destroyed Jerusalem in 587/586 BCE and carried much of its population into exile in Babylon.',
        'He rebuilt Babylon on a grand scale, including the tiled Ishtar Gate and its processional way and the great ziggurat Etemenanki.',
        'The Hanging Gardens are traditionally linked to him, but no trace of them has been found and his own inscriptions never mention them.',
      ],
      context:
        'He is portrayed harshly in the Hebrew Bible because of the exile, but other ancient writers describe a capable and cultured ruler.',
      sources: [
        whe('Nebuchadnezzar_II', 'Reign length, Carchemish, the fall of Jerusalem and the exile, the building programme, and the disputed Hanging Gardens attribution.'),
      ],
    },
  },

  gen_shaka: {
    provenance: 'historical',
    profile: {
      summary:
        'Shaka led the Zulu kingdom in south-eastern Africa from about 1816 until his assassination in 1828. In little more than a decade the Zulu grew from a small chiefdom into a regional power.',
      facts: [
        'Tradition credits him with arming his warriors with a short stabbing spear and a large shield for close combat, in place of thrown spears and skirmishing.',
        'His armies used a "bull horns" formation, pinning an enemy with the chest while two horns swept around the flanks.',
        'He organised fighting men into standing age-regiments who lived, trained, and campaigned together.',
        'He was killed in 1828 by his half-brothers, one of whom, Dingane, took his place.',
      ],
      context:
        'Zulu expansion was one factor in a wider period of upheaval and migration in the region; historians disagree about how large a role Shaka personally played in it.',
      sources: [
        whe('Zulu_Kingdom', "Shaka's reign dates, the weapon and shield changes, the bull-horns formation, age-regiments, and his assassination."),
      ],
    },
  },

  gen_yuefei: {
    provenance: 'historical',
    profile: {
      summary:
        "Yue Fei (1103-1142) was a general of the Southern Song dynasty who fought to hold back, and then to reverse, the Jurchen Jin invasion of northern China. He became one of China's most enduring symbols of loyalty.",
      facts: [
        'He rose from a modest background through the ranks by ability rather than birth.',
        'His army was famous for its discipline and for not looting the civilians it passed among.',
        "His campaigns to retake the north were cut short when the court's peace faction, led by the minister Qin Hui, recalled him.",
        'He was imprisoned in 1141 and executed early in 1142 on charges widely regarded even at the time as fabricated; a later emperor cleared his name in 1162.',
      ],
      context:
        'The story that his mother tattooed a vow of loyalty to the country on his back is a later tradition rather than contemporary record.',
      sources: [
        britannica('biography/Yue-Fei', 'Dates, service against the Jin, the conflict with Qin Hui and the peace party, the execution, and the 1162 rehabilitation.'),
      ],
    },
  },

  gen_cyrus: {
    provenance: 'historical',
    profile: {
      summary:
        'Cyrus II ("the Great", died about 530 BCE) founded the Achaemenid Persian Empire, the largest state the world had yet seen, in a run of campaigns lasting only about twenty years.',
      facts: [
        'He overthrew the Median king Astyages, then defeated Croesus of Lydia and took his capital, Sardis.',
        'He entered Babylon in 539 BCE with little fighting and was presented there as a restorer rather than a conqueror.',
        'He generally left local officials, laws, and religious practices in place, which is a large part of his lasting reputation.',
        'Ancient sources agree he died on campaign against nomadic peoples east of the empire, but disagree on which people and how.',
      ],
      context:
        'A clay document known as the Cyrus Cylinder records his takeover of Babylon in his own favourable terms; it is a royal proclamation, not a neutral account.',
      sources: [
        whe('Cyrus_the_Great', 'The conquests of Media, Lydia, and Babylon; the policy toward conquered peoples; the Cyrus Cylinder; and the disputed accounts of his death.'),
      ],
    },
  },

  gen_wellington: {
    provenance: 'historical',
    profile: {
      summary:
        "Arthur Wellesley, 1st Duke of Wellington (1769-1852), was a British general best known for defeating Napoleon. He was careful with his soldiers' lives and unusually attentive to supply.",
      facts: [
        'He first made his name in India, where he rated his 1803 victory at Assaye his finest battle.',
        'In the Peninsular War (1808-1814) he shielded Portugal behind the fortified Lines of Torres Vedras, then went over to the attack and cleared French armies out of Spain.',
        "At Waterloo in 1815, holding a defensive position until the Prussians under Blucher arrived, he ended Napoleon's career for good.",
        'He later served twice as British Prime Minister, with less success than he had as a soldier.',
      ],
      context:
        'He was known for reverse-slope tactics - keeping troops hidden behind a ridge to blunt enemy artillery and surprise attackers at the crest.',
      sources: [
        nam('explore/duke-wellington', 'Dates, the Indian campaigns and Assaye, the Peninsular War and Torres Vedras, Waterloo, and his political career.'),
      ],
    },
  },

  gen_cuauhtemoc: {
    provenance: 'historical',
    profile: {
      summary:
        'Cuauhtemoc (about 1495-1525) was the last independent ruler of the Aztec (Mexica) at Tenochtitlan. He led the defence of the city through the final siege of the Spanish conquest.',
      facts: [
        'He came to power during the conquest, after his predecessors Moctezuma II and Cuitlahuac.',
        'He directed the defence of Tenochtitlan against Hernan Cortes and his large force of Indigenous allies during the siege of 1521.',
        'He was captured as the city fell on 13 August 1521 and afterwards tortured by his captors to make him reveal hidden gold.',
        'Cortes had him executed about 1525 during an expedition to Honduras, on an accusation of plotting.',
      ],
      context:
        'In modern Mexico he is treated as a national symbol of resistance to conquest.',
      sources: [
        whe('Cuauhtemoc', 'His position as last tlatoani, the 1521 siege and capture, the torture, and his later execution.'),
        britannica('biography/Cuauhtemoc', 'Approximate birth and death dates and the circumstances of his execution.'),
      ],
    },
  },

  gen_tokugawa: {
    provenance: 'historical',
    profile: {
      summary:
        'Tokugawa Ieyasu (1543-1616) ended more than a century of civil war in Japan and founded a shogunate that ruled for about 250 years. He was famous for patience and for outlasting his rivals.',
      facts: [
        'He built his position under the earlier unifiers Oda Nobunaga and Toyotomi Hideyoshi before making his own bid for power.',
        'His victory at the Battle of Sekigahara in 1600 left him the strongest lord in Japan.',
        'In 1603 he was named shogun and established the Tokugawa (Edo) government.',
        'The sieges of Osaka Castle in 1614-1615 destroyed the last rival house, the Toyotomi.',
      ],
      context:
        "The peace his settlement imposed lasted until the 1860s, a period of unusual internal stability for a large state.",
      sources: [
        whe('Tokugawa_Ieyasu', 'Dates, the Sengoku context and the earlier unifiers, Sekigahara, appointment as shogun, and the Osaka sieges.'),
      ],
    },
  },

  gen_chandragupta: {
    provenance: 'historical',
    profile: {
      summary:
        'Chandragupta Maurya (ruled about 321-297 BCE) founded the Maurya Empire, the first state to bring most of the Indian subcontinent under one government.',
      facts: [
        'With his adviser Chanakya (Kautilya) he overthrew the Nanda dynasty of Magadha and took its capital, Pataliputra.',
        "Around 305-303 BCE he came to terms with Seleucus I, one of Alexander's successors, gaining large territories in the north-west in exchange for 500 war elephants.",
        'His empire reached from the western coast of India toward the south of the subcontinent.',
        'Contemporary hard evidence about him is thin; much of the detail comes from later Greek and Indian writers.',
      ],
      context:
        'Later tradition holds that he gave up the throne to his son and ended his life as a Jain ascetic, but this is not firmly documented.',
      sources: [
        whe('Chandragupta_Maurya', 'Reign dates, Chanakya and the fall of the Nandas, the treaty with Seleucus, the extent of the empire, and the traditional abdication story.'),
      ],
    },
  },

  gen_napoleon: {
    provenance: 'historical',
    profile: {
      summary:
        'Napoleon Bonaparte (1769-1821) rose during the French Revolution to rule France as emperor and to dominate continental Europe for a decade through a long series of wars.',
      facts: [
        'He organised his army into self-contained corps that could march apart and concentrate quickly for battle, and he made heavy, mobile artillery central to his tactics.',
        'His victory over Austria and Russia at Austerlitz in 1805 is usually rated his finest battle.',
        'His invasion of Russia in 1812 lost most of its army and turned the war against him.',
        'He was defeated and exiled in 1814, returned for the "Hundred Days", and was beaten for good at Waterloo in 1815; he died in exile on Saint Helena in 1821.',
      ],
      context:
        'The Napoleonic Code, a civil law code drawn up under his government, spread across Europe and still shapes legal systems today.',
      sources: [
        whe('Napoleon', 'Dates, rise under the Revolution, the corps system and artillery, Austerlitz, the 1812 Russian campaign, Waterloo and Saint Helena, and the Napoleonic Code.'),
      ],
    },
  },

  gen_frederick: {
    provenance: 'historical',
    profile: {
      summary:
        'Frederick II of Prussia ("the Great", reigned 1740-1786) turned a middling kingdom into a European great power and was also a noted patron of the Enlightenment.',
      facts: [
        'He opened his reign by seizing the wealthy province of Silesia from Austria, starting decades of war between the two states.',
        "In the Seven Years' War (1756-1763) Prussia held out against Austria, France, and Russia at the same time.",
        'His battlefield method leaned on rapid marches, hard-drilled infantry firepower, and the "oblique order", massing strength against one enemy flank; Rossbach and Leuthen in 1757 were his showpiece victories.',
        'Prussia\'s survival also owed a great deal to luck, especially Russia leaving the war in 1762 after its empress died.',
      ],
      context:
        'Away from the army he corresponded with Voltaire, wrote music and essays, reformed Prussian law, and pushed new farming methods.',
      sources: [
        whe('Frederick_the_Great', "Reign dates, the Silesian and Seven Years' Wars, the oblique order and Rossbach/Leuthen, the role of luck in 1762, and his Enlightenment activity."),
      ],
    },
  },

  gen_suvorov: {
    provenance: 'historical',
    profile: {
      summary:
        'Alexander Suvorov (1729/30-1800) was a Russian field marshal celebrated for aggressive, fast-moving campaigns. He is often said never to have lost a battle.',
      facts: [
        'He served Catherine the Great in the wars against the Ottomans, including the storming of the fortress of Izmail in 1790.',
        'In 1794 he crushed the Kosciuszko uprising in Poland; the assault on the Warsaw suburb of Praga killed large numbers of civilians and is remembered as a massacre.',
        'In 1799 he beat French armies in northern Italy, then led a hard fighting retreat over the Alps when the campaign collapsed around him.',
        'He set out his ideas - speed, the offensive, the bayonet, and the morale of the common soldier - in a short manual, "The Science of Victory".',
      ],
      context:
        'His "never defeated" record is a genuine part of his reputation but, like most such claims, is celebrated more confidently than it can be strictly proven.',
      sources: [
        whe('Alexander_Suvorov', 'Service under Catherine the Great, Izmail, the Polish campaign and the storming of Praga, the 1799 Italian and Swiss campaigns, and "The Science of Victory".'),
      ],
    },
  },

  gen_mehmed: {
    provenance: 'historical',
    profile: {
      summary:
        'Mehmed II ("the Conqueror", 1432-1481) was the Ottoman sultan who took Constantinople in 1453, ending the Byzantine Empire. He was both a relentless campaigner and a patron of scholars.',
      facts: [
        "For the 1453 siege he had a foundry cast unusually large siege cannons that could batter the city's famous walls.",
        'When a chain blocked the harbour, he had ships hauled overland on greased rollers into the Golden Horn to threaten the city from a new side.',
        'After the city fell he made it his capital and repopulated it with settlers of many origins.',
        'He went on to absorb Serbia, most of Greece, and the last small Byzantine successor state at Trebizond.',
      ],
      context:
        'He read Greek and Latin, collected books, and kept poets and philosophers at his court alongside the demands of near-constant war.',
      sources: [
        whe('Mehmed_II', 'Dates, the 1453 siege - the large cannons and the ships moved overland - the making of Constantinople as capital, later Balkan and Anatolian conquests, and his cultural patronage.'),
      ],
    },
  },

  gen_elcid: {
    provenance: 'historical',
    profile: {
      summary:
        'Rodrigo Diaz de Vivar (about 1043-1099), known as El Cid, was a Castilian commander in an Iberia split between Christian kingdoms and Muslim states. He ended his life as the independent ruler of Valencia.',
      facts: [
        'His nickname comes from the Arabic word for "lord"; he was also called Campeador, roughly "battlefield champion".',
        'He served King Sancho II of Castile and then Alfonso VI, who exiled him in 1081 after an unauthorised raid.',
        'In exile he took service with the Muslim rulers of Zaragoza and built a reputation as a commander who was not beaten in the field.',
        'He captured Valencia in 1094 and ruled it - over both its Muslim and Christian inhabitants - until his death in 1099.',
      ],
      context:
        'The medieval epic poem "El Cantar de Mio Cid", written about a century after he died, turned him into an idealised national hero and is not a reliable record of events.',
      sources: [
        britannica('biography/El-Cid-Castilian-military-leader', 'Dates, the meaning of "El Cid", service under Sancho II and Alfonso VI, exile and service to Zaragoza, and the rule of Valencia.'),
      ],
    },
  },

  gen_hannibal: {
    provenance: 'historical',
    profile: {
      summary:
        'Hannibal Barca (247-about 183 BCE) was a Carthaginian general who fought Rome in the Second Punic War. His invasion of Italy is one of the most studied campaigns in military history.',
      facts: [
        'In 218 BCE he marched an army with war elephants from Iberia, over the Alps, and into Italy, losing many troops on the way.',
        'At Cannae in 216 BCE he let his centre give ground and then closed his wings around a much larger Roman army, destroying most of it.',
        'He stayed in Italy for years but never had the siege equipment or reinforcements to attack Rome itself.',
        'Recalled to defend Carthage, he was beaten by the Roman general Scipio at Zama in 202 BCE, ending the war.',
      ],
      context:
        'Ancient writers disagree on his exact route across the Alps and on how many elephants survived it.',
      sources: [
        whe('hannibal', 'Dates, the crossing of the Alps with elephants, the victories in Italy and especially Cannae, why he could not take Rome, and the defeat at Zama.'),
      ],
    },
  },

  gen_ragnar: {
    provenance: 'legendary',
    profile: {
      summary:
        'Ragnar Lothbrok is a legendary Viking king and raider of Old Norse tradition. Whether a single real person of that name ever existed is disputed; many scholars treat him as a figure assembled from several 9th-century Norse leaders.',
      facts: [
        'His story survives mainly in Icelandic and Danish sagas written centuries after the Viking Age, not in contemporary records.',
        'The nickname "Lothbrok" means roughly "shaggy breeches" in Old Norse.',
        'In the sagas he raids widely in Francia and the British Isles and is finally killed by the Northumbrian king Aella, cast into a pit of snakes.',
        'Several of his saga "sons" - such as Ivar and Halfdan - do match leaders named in real 9th-century sources for the Viking army that invaded England in 865.',
      ],
      context:
        'The Ragnar of the sagas should be read as heroic literature. His sons are on firmer historical ground than he is.',
      sources: [
        britannica('topic/Ragnar-Lothbrok', 'Ragnar as a figure of Norse legend, the saga sources, the "shaggy breeches" nickname, the snake-pit death, and the better-attested sons.'),
      ],
    },
  },

  // ===================== LORE (fictional, established settings) =====================

  gen_boromir: {
    provenance: 'lore',
    profile: {
      summary:
        'Boromir is the elder son of Denethor, the Ruling Steward of Gondor, and captain of its armies. He joins the Fellowship of the Ring as Gondor\'s representative.',
      facts: [
        "He leads the defence of Gondor's eastern frontier, including the river-crossing at Osgiliath.",
        "He argues that the Fellowship should use the Ring as a weapon rather than destroy it, and the Ring's pull eventually overcomes him.",
        'He dies defending the hobbits Merry and Pippin from orcs, and is given a boat-burial down the falls of Rauros.',
        'His younger brother Faramir, and later his father, are left to hold Gondor without him.',
      ],
      context:
        "Within Tolkien's legendarium Boromir stands for the danger of trying to fight evil with its own tools.",
      setting: "J.R.R. Tolkien's The Lord of the Rings",
    },
  },

  gen_eomer: {
    provenance: 'lore',
    profile: {
      summary:
        'Eomer is a Marshal of the Mark of Rohan and nephew of King Theoden. He commands a large mounted force, the eored, on Rohan\'s eastern borders.',
      facts: [
        "He is briefly imprisoned for attacking an orc band against the orders of Theoden's corrupted counsellor, Grima.",
        'He fights at the Battle of the Hornburg and then rides with Theoden to relieve the siege of Minas Tirith.',
        'On the Pelennor Fields, after Theoden falls, Eomer takes command of the Rohirrim in the thick of the battle.',
        'He becomes King of Rohan after the war and remains a close ally of the restored kingdom of Gondor.',
      ],
      context:
        "Rohan's strength in the stories is its cavalry, and Eomer is its most prominent field commander.",
      setting: "J.R.R. Tolkien's The Lord of the Rings",
    },
  },

  gen_merry: {
    provenance: 'lore',
    profile: {
      summary:
        'Meriadoc "Merry" Brandybuck is a hobbit of the Shire and a member of the Fellowship of the Ring. He is the most organised and map-minded of the four hobbit companions.',
      facts: [
        'He swears service to King Theoden and rides to war hidden among the Rohirrim as an unofficial soldier.',
        'On the Pelennor Fields he helps bring down the Witch-king of Angmar, stabbing him from behind so that Eowyn can strike the killing blow.',
        'He is wounded by that same blow and healed in the Houses of Healing at Minas Tirith.',
        "Back home he helps lead the hobbits' fight to free the Shire, and is later made a Knight of the Mark.",
      ],
      context:
        "Merry's arc is a small person from a sheltered land turning out to matter on a battlefield of kings.",
      setting: "J.R.R. Tolkien's The Lord of the Rings",
    },
  },

  gen_ugluk: {
    provenance: 'lore',
    profile: {
      summary:
        'Ugluk is an Uruk-hai captain in the service of the wizard Saruman at Isengard. He commands the war party that carries the captured hobbits Merry and Pippin toward Isengard.',
      facts: [
        'He drives his company on a brutal forced march across open country, outpacing pursuit.',
        'He holds his mixed force together through a running quarrel with orcs from Mordor and from the Misty Mountains who want to eat the prisoners or turn back.',
        'His band is caught and destroyed by the Riders of Rohan at the edge of Fangorn Forest.',
        'Ugluk is killed in that fight by Eomer of Rohan.',
      ],
      context:
        "Saruman's Uruk-hai are bred to be tougher and faster than common orcs and to march in daylight, and Ugluk is written as a competent, disciplined example of the type.",
      setting: "J.R.R. Tolkien's The Lord of the Rings",
    },
  },

  gen_haldir: {
    provenance: 'lore',
    profile: {
      summary:
        'Haldir is a march-warden of Lothlorien, the Elven realm ruled by Celeborn and Galadriel. He guards its borders and speaks for its wardens to outsiders.',
      facts: [
        'He and his brothers intercept the Fellowship at the edge of the wood and escort them, blindfolded at first, to the Elven city of Caras Galadhon.',
        "He acts as the Fellowship's guide and interpreter during their stay in Lothlorien.",
        "Lorien's wardens are archers who watch the forest's northern and western marches against orc incursions from Moria and Dol Guldur.",
        "In Peter Jackson's film version - but not in Tolkien's book - Haldir leads an Elven company to Helm's Deep and is killed there.",
      ],
      context:
        "The book and the best-known film differ on Haldir's fate; the film addition is noted here so the two are not confused.",
      setting: "J.R.R. Tolkien's The Lord of the Rings (with a noted film-only addition)",
    },
  },

  gen_gwydion: {
    provenance: 'lore',
    profile: {
      summary:
        "Gwydion, Prince of Don, is the foremost war-leader of the land of Prydain in Lloyd Alexander's Chronicles. He is a seasoned commander who mentors the young hero Taran.",
      facts: [
        'He leads the free cantrevs of Prydain against Arawn, the Death-Lord of Annuvin, across the five books of the series.',
        'He is patient and unshowy, and repeatedly teaches Taran that leadership is service and hard choices rather than glory.',
        'He survives capture, disguise, and betrayal over the course of the war.',
        "In the final book he commands the campaign that ends Arawn's power.",
      ],
      context:
        'Alexander drew the name and some flavour from Welsh myth (the Mabinogi), but his Gwydion is his own character within the invented land of Prydain.',
      setting: "Lloyd Alexander's The Chronicles of Prydain",
    },
  },

  gen_hornedking: {
    provenance: 'lore',
    profile: {
      summary:
        "The Horned King is the antlered, masked champion and war-leader of Arawn, the Death-Lord of Annuvin, in Lloyd Alexander's \"The Book of Three\". This roster entry represents a commander of Annuvin's forces in that mould.",
      facts: [
        "Annuvin's armies in the Chronicles include the Cauldron-Born, silent undead warriors who feel no fear or pain.",
        'The Horned King leads a campaign of raids and burning across Prydain early in the series.',
        "He is destroyed when the enchanter Dallben's ward, Taran, and his companions expose him to a countering power.",
        'Arawn simply replaces him; Annuvin\'s threat does not depend on any single commander.',
      ],
      context:
        'Annuvin is written as a faceless, disciplined war-machine, so its "general" is defined more by the force he commands than by a personality.',
      setting: "Lloyd Alexander's The Chronicles of Prydain",
    },
  },

  gen_okoye: {
    provenance: 'lore',
    profile: {
      summary:
        "Okoye is the General of the Dora Milaje, the elite guard of the African nation of Wakanda, in Marvel's film continuity. She is Wakanda's senior soldier and a fiercely traditional patriot.",
      facts: [
        'She commands the Dora Milaje, an all-women corps armed with vibranium spears and trained for close protection and open battle.',
        "She leads Wakandan forces in the field, including the defence of Wakanda against Thanos's army.",
        'She is torn between loyalty to the throne itself and loyalty to a particular king, and in one crisis sides with the throne.',
        "She later helps lead Wakanda's defence during a succession crisis and an undersea threat.",
      ],
      context:
        'The Dora Milaje first appeared in Marvel comics in 1998; Okoye is chiefly known from the Marvel Cinematic Universe films from 2018 onward.',
      setting: "Marvel's Black Panther films (Marvel Cinematic Universe)",
    },
  },

  gen_lancelot: {
    provenance: 'lore',
    profile: {
      summary:
        "Sir Lancelot du Lac is the leading knight of King Arthur's Round Table in medieval romance. He is presented as the finest fighter of the age and Arthur's greatest champion in war.",
      facts: [
        'He is raised by the Lady of the Lake, which gives him his surname, "du Lac" ("of the Lake").',
        "He is Arthur's foremost commander in the wars that build and defend the realm.",
        'His love affair with Queen Guinevere, once discovered, splits the Round Table into factions and triggers the war that ruins the kingdom.',
        'He appears mainly in French romances of the 12th and 13th centuries and in Thomas Malory\'s later English "Le Morte d\'Arthur".',
      ],
      context:
        'Lancelot is a literary creation of medieval romance, not a figure from chronicle history; the Arthurian tradition treats him as legend.',
      setting: 'Arthurian legend (the medieval Matter of Britain)',
    },
  },

  gen_oreius: {
    provenance: 'lore',
    profile: {
      summary:
        'Oreius is a centaur and the commander of Aslan\'s army in the 2005 film of "The Lion, the Witch and the Wardrobe". He is the general who prepares Narnia\'s host for the battle against the White Witch.',
      facts: [
        'He drills and organises a mixed army of talking beasts, fauns, centaurs, and other Narnians.',
        'He acts as battlefield second to the young King Peter at the Battle of Beruna.',
        'He is turned to stone by the White Witch during the battle while covering Peter.',
        "He is restored to life when Aslan breathes on the Witch's stone victims after her defeat.",
      ],
      context:
        'In C.S. Lewis\'s original book the centaur commander is present but unnamed; "Oreius" is a name given to the character in the film adaptation.',
      setting: 'The Chronicles of Narnia (2005 film adaptation of C.S. Lewis)',
    },
  },

  gen_thessaly: {
    provenance: 'lore',
    profile: {
      summary:
        'Admiral Thessaly of the Sunken Fleet is an original Conquestoria commander for the fictional civilization of Atlantis: the senior officer of a submerged navy that fights from beneath the waves.',
      facts: [
        'She commands the "tide-legions" of Atlantis, forces built around currents, pressure, and coordinated undersea movement rather than surface sailing.',
        'Her doctrine assumes the enemy cannot see her formations until they strike.',
        'She is a game-original character; there is no external Atlantis myth she is drawn from.',
        "She fills the roster slot for the Atlantis civilization the way an authored historical general fills a real civilization's slot.",
      ],
      context:
        'Atlantis in Conquestoria is a fantasy civilization, and its commander is invented to match - she is not presented as a figure from Plato or from folklore.',
      setting: 'Original Conquestoria lore',
    },
  },

  // ===================== ARCHETYPE (nation-neutral universal fallback pool) =====================

  gen_universal_marshal: archetype(
    'The Iron Marshal is a stand-in commander with no fixed nation - the kind of hard, early professional soldier any people might raise when its famous captains are gone.',
    [
      'This is an archetype, not a specific person: a placeholder the game can offer when a civilization has used up its own roster of named generals.',
      'The "Iron Marshal" suggests an early-era commander who rose through discipline and long service rather than birth.',
      'Mechanically the archetype commanders are identical to any other general; only the name and flavour are generic.',
      'Any civilization may draw this commander, which is why it belongs to no culture in particular.',
    ],
    'The universal pool exists so that a long game never runs out of generals to offer.',
  ),

  gen_universal_warlord: archetype(
    'The Grey Warlord is a stand-in commander who rose from the ranks on tactical instinct alone, with no nation, dynasty, or legend attached.',
    [
      'This is an archetype rather than a real or fictional individual - a generic officer for any civilization.',
      'The flavour points at a mid-era field commander known for reading a battle quickly.',
      'It carries the same command stats and abilities as every other general in the game.',
      "It is drawn only as a fallback, after a civilization's named commanders are spent.",
    ],
    'Archetype commanders keep the candidate choice meaningful late in a very long game.',
  ),

  gen_universal_field_marshal: archetype(
    'The Steel Field Marshal is a stand-in commander of the gunpowder age - a staff officer who modernised doctrine faster than rivals - with no specific country behind the title.',
    [
      'This is a deliberately generic archetype, not a portrait of any real field marshal.',
      'The flavour suggests a later-era commander focused on organisation, training, and up-to-date methods.',
      'Its gameplay profile is the standard one shared by every authored general.',
      'It appears only as a fallback option for any civilization that needs one.',
    ],
    "The universal pool guarantees a full slate of candidates even after a civilization's own roster is exhausted.",
  ),

  gen_universal_commodore: archetype(
    'The Storm Commodore is a stand-in commander of the modern era, associated with combined-arms operations across a whole theatre, and tied to no particular nation.',
    [
      'This is an archetype: a generic senior officer the game can offer to any civilization.',
      'The flavour points at a modern commander coordinating land, sea, and air rather than a single arm.',
      'It uses the same command range, capacity, and abilities as every other general.',
      "It is a late-pool fallback, not a civilization's primary choice.",
    ],
    'Keeping a small pool of nation-neutral archetypes means the Great General system never simply stops offering candidates.',
  ),
};
