import type { TechJudgement } from '../../helpers/tech-audit-judgement';

/**
 * #420 child 1 — the authored half of the audit. `tech-strategic-audit.test.ts` fails for any tech the derivation
 * rules flag (`needsDecision`) that has no entry here, and for any entry that names an unknown tech or no longer
 * applies. Every REPLACE/TUNE/WIRE names a candidate built from a mechanic that already exists (a `YieldKind`,
 * a `UNIT_MODIFIERS` condition, an `UNREST_RELIEF_SOURCES` row, an espionage modifier); nothing here needs a new
 * subsystem. `child` is the era-band child issue that owns the change (2 = Eras 1–4, 3 = Eras 5–8, 4 = Eras 9–11);
 * 0 means "not scheduled" (Era 12 is reference material per #420).
 */
export type TechAuditEntry = TechJudgement & { child: 0 | 2 | 3 | 4 };

const replace = (child: TechAuditEntry['child'], candidate: string, note: string): TechAuditEntry =>
  ({ cls: 'REPLACE', rating: 1, note, candidate, child });
const tune = (child: TechAuditEntry['child'], candidate: string, note: string): TechAuditEntry =>
  ({ cls: 'TUNE', rating: 2, note, candidate, child });
const wire = (child: TechAuditEntry['child'], candidate: string, note: string, textFix = false): TechAuditEntry =>
  ({ cls: 'WIRE', rating: 1, note, candidate, textFix, child });
const textOnly = (child: TechAuditEntry['child'], candidate: string, note: string): TechAuditEntry =>
  ({ cls: 'TUNE', rating: 2, note, candidate, textFix: true, child });
const keep = (rating: TechAuditEntry['rating'], note: string, child: TechAuditEntry['child'] = 0): TechAuditEntry =>
  ({ cls: 'KEEP', rating, note, child });


const REP_FARM = 'Farm/food niche repeats on seven techs; each should answer a different question.';
const REP_ROUTE = 'Per-route gold repeats on four techs; split by route type or partner count.';
const REP_CULTURE = 'Culture-building gold repeats on six techs across five eras.';
const REP_MARKET = 'Marketplace gold repeats on three techs.';
const REP_FAITH = 'Temple/monastery science repeats on three techs.';
const REP_MEDIA = 'Film/radio gold repeats on three techs.';
const REP_LAB = 'research_institute science repeats on four techs.';

const FLAT = 'Unconditional flat or percentage yield; value does not depend on any choice the player made.';

export const TECH_AUDIT_ENTRIES: Record<string, TechAuditEntry> = {
  // ---- flat yields, Eras 5–8 (child 3) ----
  'civic-humanism': replace(3, 'perPopulation gold (per 5 population) so the bonus follows city growth', FLAT),
  'empiricism': replace(3, 'cityFlatConditional +2 science in cities that own a library-category building', FLAT),
  'rationalism': replace(3, 'lowestCityScience: lift the weakest city, a catch-up verb for wide empires', FLAT),
  'blast-furnace-tech': replace(3, 'perImprovement mine production, rewarding actual mining', FLAT),
  'mercantilism': replace(3, 'perTradeRoute foreignOnly gold, so it pays only with foreign partners', FLAT),
  'parliamentary-reform': replace(3, 'UNREST_RELIEF_SOURCES row (distance-from-capital relief) instead of +5% production', FLAT),
  'land-survey': replace(3, 'foundingBonus food for newly founded cities: a settling decision', FLAT),
  'newspaper-press': replace(3, 'perBuildingId library/printing houses science: scales with the investment', FLAT),
  'mass-production': replace(3, 'perBuildingCategory production for owned workshop/factory buildings', FLAT),
  'industrialization': replace(3, 'foodFromScience-style cross-track verb or perBuildingId factory science', FLAT),
  'positivism': replace(3, 'cityFlatConditional science in cities with a university-class building', FLAT),
  'engineering-exhibition': replace(3, 'perCompletedLegendaryWonder science', FLAT),
  'public-records': replace(3, 'maintenanceDiscount for empires with many buildings', FLAT),
  'refrigeration': replace(3, 'perBuildingId granary/market food: stores the harvest instead of flat food', FLAT),
  'pragmatism': replace(3, 'lowestCityScience plus per-population gold; drop the +5% to everything', FLAT),
  'grand-opera': replace(3, 'perBuildingCategory culture gold (a theatre/opera specialisation)', FLAT),
  'sanitation-networks': replace(3, 'terrainYield food on river/coastal tiles, or perPopulation food above size 8', FLAT),
  'shorthand-press': replace(3, 'perTradeRoute domesticOnly science (paperwork between own cities)', FLAT),

  // ---- flat yields, Eras 9–11 (child 4) ----
  'quantum-theory': replace(4, 'cityFlatConditional science in cities with a research_institute', FLAT),
  'universal-suffrage': replace(4, 'UNREST_RELIEF_SOURCES row for happiness-driven cities instead of +1 food', FLAT),
  'large-scale-irrigation': replace(4, 'perImprovement farm food next to river tiles (terrainYield)', FLAT),
  'aluminium-smelting': replace(4, 'perImprovement mine production plus air-unit cost note', FLAT),
  'wireless-telegraph': replace(4, 'perRoutePartnerCiv gold: grows with the number of distinct civilisations connected', FLAT),
  'secular-humanism': replace(4, 'perPopulation science for cities with no majority faith, a relationship-sensitive verb', FLAT),
  'keynesian-economics': replace(4, 'maintenanceDiscount keyed to treasury size, or perBuildingId bank gold', FLAT),
  'nuclear-theory': replace(4, 'cityFlatConditional science in cities with a research_institute (distinct from quantum-theory by requiresBuilding)', FLAT),
  'radar-systems': replace(4, 'UNIT_MODIFIERS vision +1 for air/naval units (conditional vision), not +2 science', FLAT),
  'decolonization': replace(4, 'perRoutePartnerCiv gold limited to former-vassal partners, or UNREST_RELIEF_SOURCES for captured cities', FLAT),
  'international-institutions': replace(4, 'perRoutePartnerCiv science and gold when at peace with the partner', FLAT),
  'universal-healthcare': replace(4, 'perPopulation food for cities above size 10 (large cities only)', FLAT),
  'post-colonial-theory': replace(4, 'cityFlatConditional science in cities that were conquered or have foreign-faith followers', FLAT),
  'human-rights-framework': replace(4, 'UNREST_RELIEF_SOURCES row; gold only while not at war', FLAT),
  'synthetic-polymers': replace(4, 'perBuildingCategory production for owned factory buildings', FLAT),
  'highway-network': replace(4, 'perCityRoute gold requiring a market/airport building', FLAT),
  'stagflation-response': replace(4, 'maintenanceDiscount: removes upkeep for the largest building counts instead of +3 gold', FLAT),
  'molecular-biology': replace(4, 'foodFromScience: cross-track, scales with science invested', FLAT),
  'arms-control-negotiations': replace(4, 'perRoutePartnerCiv gold while not at war: hurt by conflict', FLAT),
  'civil-rights-legislation': replace(4, 'UNREST_RELIEF_SOURCES row for minority-faith cities instead of +2 food', FLAT),
  'deep-sea-drilling': replace(4, 'terrainYield gold/production on ocean tiles worked by coastal cities', FLAT),
  'aquaculture': replace(4, 'terrainYield food on coast/ocean tiles', FLAT),
  'vaccination-campaigns': replace(4, 'crisis-effects hook: population-loss events halved (the existing epidemic resolver), not +2 food', FLAT),
  'structuralism': replace(4, 'perBuildingCategory culture science', FLAT),
  'megastructures': replace(4, 'perCompletedLegendaryWonder production', FLAT),
  'offshore-platforms': replace(4, 'terrainYield production/gold on ocean tiles; distinct from deep-sea-drilling by yields', FLAT),
  'black-ops-programs': replace(4, 'espionage modifier (mission success and a spy slot) instead of +2 gold', FLAT),
  'ecumenical-movement': replace(4, 'cityFlatConditional science and food for cities with two or more faiths', FLAT),
  'lab-grown-food': { ...replace(0, 'terrainYield food on barren terrain', FLAT), note: `${FLAT} Era 12 is reference material for #420; left unscheduled.` },

  // ---- broad combat modifiers ----
  'tactics': replace(2, 'UNIT_MODIFIERS: combatStrength only when attacking at full HP, or on open ground', 'Unconditional combat bonus across every unit.'),
  'naval-gunnery': replace(3, 'UNIT_MODIFIERS: naval combatStrength vsCoastalCity or when attacking', 'Unconditional combat bonus across every unit.'),
  'tungsten-alloys': replace(4, 'UNIT_MODIFIERS scoped to armor/siege class instead of every unit', 'Unconditional combat bonus across every unit.'),
  'carbon-fiber': replace(4, 'UNIT_MODIFIERS scoped to air units or when defending in a friendly city', 'Unconditional combat bonus across every unit.'),
  'nanomaterials': { ...replace(0, 'UNIT_MODIFIERS: bonus conditional on fullHP (matches the Era 12 reference)', 'Unconditional combat bonus across every unit.'), note: 'Unconditional combat bonus across every unit. Era 12 is reference; left unscheduled.' },

  // ---- broad cost discounts ----
  'vaulted-ceilings': tune(3, 'narrow TECH_COST_DISCOUNTS appliesTo to a building category', 'Whole-category discount with no condition.'),
  'general-mobilization': tune(3, 'discount only the unit classes the text names, or only while at war', 'Whole-category discount with no condition.'),

  // ---- text claims with no mechanic behind them (WIRE or textFix) ----
  'irrigation': wire(2, 'perImprovement farm/terrainYield river food+production, or reword to what tile-yield does', 'Text promises river-farm production; tile-yield owns only part of it.', true),
  'mining-tech': wire(2, 'perImprovement mine production (kind exists, era 5+ only today)', 'Text promises +1 production on mines; no yield row exists for Era 3.', true),
  'banking': wire(2, 'tradeRoutePercent or perBuildingId bank gold; replace "+20% in all cities" which no row implements', 'Text promises +20% gold; nothing implements it.', true),
  'medicine': wire(2, 'keep the crisis-intervention verb; reword or implement "population grows faster" via food modifier', 'Crisis aid is real; the growth claim is not.', true),
  'early-empire': wire(2, 'city-maturity-system owns the claim; confirm radius change is wired in territory claim', 'Text promises +1 claim radius; verify the city-maturity owner applies it.', true),
  'sailing': wire(2, 'embarkation is a movement rule; confirm it is gated by this tech, else reword', 'Text promises embarkation on coast.', true),
  'professional-army': wire(3, 'combat-system names the tech; move to a UNIT_MODIFIERS inFriendlyCity defender row so previews show it', 'Owner is bespoke combat code, invisible to the modifier table.', true),
  'circumnavigation': wire(3, 'reword; no map-edge/uncharted mechanic exists. Candidate: vision modifier for scouts', 'Text promises faster continent reveal; no mechanic.', true),
  'postal-service': keep(3, 'Owned by getRoadTileTechGold in tech-yield-system; conditional on roads. Text matches.', 3),
  'black-chambers': keep(3, 'Owned by espionage-catalog (mission) and spy slot logic. Verify slot claim.', 3),
  'diplomatic-networks': keep(3, 'Owned by espionage modifiers and crisis intelligence.', 3),
  'epidemic-control': keep(3, 'Owned by crisis-effects/crisis-progression.', 3),
  'trade-winds': keep(3, 'Owned by unit-production-completion (+1 naval movement).', 3),
  'fortification-engineering': keep(3, 'Owned by fortification-system and combat-system.', 3),
  'courier-network': keep(3, 'Owned by getConnectedCityTechGold; conditional on road-connected cities.', 3),
  'counter-espionage': keep(3, 'Owned by espionage-modifier-definitions and counterintelligence.', 3),
  'colonial-railways': keep(3, 'Owned by getConnectedCityTechGold; same niche as courier-network and electric-telegraph (see repeated niche).', 3),
  'electric-telegraph': keep(3, 'Owned by tech-yield-system and vision-and-contacts (allied vision).', 3),
  'covert-operations': keep(3, 'Owned by espionage-catalog/modifiers.', 3),
  'secret-police': keep(3, 'Owned by espionage-modifier-definitions; same counter-intel niche as counter-espionage/disinformation-bureau.', 3),
  'transcontinental-rail': keep(3, 'Owned by getConnectedCityTechGold; third road-connected-gold tech in a row.', 3),
  'public-health-service': wire(3, 'no owner found for plague immunity/halved spread; implement via crisis-effects or reword', 'Text promises plague immunity with no code owner.', true),
  'naval-armor': wire(3, 'UNIT_MODIFIERS naval combatStrength +5 (flat) with coastal condition', 'Text promises +5 naval strength with no modifier row.', true),
  'telephony': { cls: 'KEEP', rating: 0, note: 'Flavor text only; reword to what the telephone_exchange building does.', textFix: true, child: 3 },
  'political-intelligence': keep(3, 'Owned by espionage-catalog/modifiers.', 3),
  'disinformation-bureau': keep(3, 'Owned by espionage-catalog/modifiers.', 3),
  'welfare-state': { cls: 'KEEP', rating: 0, note: 'Flavor text only; its buildings carry the effect. Reword.', textFix: true, child: 4 },
  'counterintelligence': keep(3, 'Owned by espionage-catalog/modifiers.', 4),
  'signals-intelligence': keep(3, 'Owned by espionage-counterintel and modifiers.', 4),
  'cold-war-networks': wire(4, 'text promises +2 gold empire-wide with no row; either add espionage verb or reword', 'Unbacked +2 gold claim.', true),
  'cloud-computing': keep(3, 'Owned by tech-system cost discount for science techs. Era 12 reference.'),
  'private-spaceflight': keep(3, 'Owned by unit-production-completion and building. Era 12 reference.'),
  'precision-agriculture': keep(3, 'Owned by tile-yield via precision_farm. Era 12 reference.'),

  // ---- conditional, but the same shape repeats on three or more techs (differentiate, do not delete) ----
  'plantation-farming': tune(3, 'keep per-improvement farm food as the one farm-improvement tech of the band', REP_FARM),
  'improved-agriculture': tune(3, 'swap to terrainYield food on river/grass tiles; keep granary link out of it', REP_FARM),
  'mechanized-farming': tune(3, 'perImprovement farm production (food→production conversion), distinct from granary food', REP_FARM),
  'agricultural-machinery': tune(3, 'perPopulation food above a size, rewarding large farming cities', REP_FARM),
  'scientific-breeding': tune(3, 'perImprovement pasture/plantation resource tiles rather than farm', REP_FARM),
  'chemical-fertilizers': tune(4, 'terrainYield food on poor terrain (desert/tundra) so it lifts weak cities', REP_FARM),
  'pesticides': tune(4, 'crisis-effects hook: famine events halved (existing resolver)', REP_FARM),
  'green-revolution-crops': tune(4, 'foundingBonus food plus per-population food: a growth-for-new-cities verb', REP_FARM),
  'guilds': tune(3, 'perTradeRoute domesticOnly gold (guild halls link own cities)', REP_ROUTE),
  'convoy-system': tune(4, 'perTradeRoute coastalOnly gold plus naval supply protection (naval-operations owner)', REP_ROUTE),
  'petrodollar-system': tune(4, 'perRoutePartnerCiv gold: scales with distinct partners', REP_ROUTE),
  'autonomous-shipping': tune(0, 'perTradeRoute coastalOnly gold; Era 12 reference', REP_ROUTE),
  'renaissance-painting': tune(3, 'keep per-category culture gold as the band anchor', REP_CULTURE),
  'separation-of-powers': tune(3, 'unrest relief verb (already in the ladder) replaces culture gold', REP_CULTURE),
  'baroque-music': tune(3, 'perBuildingId concert_hall happiness/culture gold only', REP_CULTURE),
  'existentialism': tune(4, 'perPopulation science for cities with a university, drop culture gold', REP_CULTURE),
  'postmodernism': tune(4, 'perLuxuryResource gold: culture trade value', REP_CULTURE),
  'video-games': tune(0, 'perBuildingCategory culture gold; Era 12 reference', REP_CULTURE),
  'industrial-monopoly': tune(3, 'perLuxuryResource gold requires owning the resource (monopoly), not just a marketplace', REP_MARKET),
  'social-contract': tune(3, 'unrest relief via UNREST_RELIEF_SOURCES (marketplace gold dropped)', REP_MARKET),
  'consumer-boom': tune(4, 'perPopulation gold above city size 8: large-city consumers', REP_MARKET),
  'modernist-theology': tune(3, 'cityFlatConditional science only in a city with a temple and a university', REP_FAITH),
  'religious-modernism': tune(4, 'faith-conditional science for cities where followers are own-faith (religion-system owner)', REP_FAITH),
  'interfaith-council': tune(4, 'cityFlatConditional science for cities with two or more faiths present', REP_FAITH),
  'propaganda-campaigns': tune(4, 'espionage/loyalty verb (propaganda mission) rather than a film-studio gold row', REP_MEDIA),
  'television': tune(4, 'perBuildingId film_studio culture plus a vision-of-opinion modifier on loyalty', REP_MEDIA),
  'satellite-television': tune(4, 'perRoutePartnerCiv gold: broadcast reach over foreign partners', REP_MEDIA),
  'nuclear-physics': tune(4, 'keep as research_institute science anchor', REP_LAB),
  'rocketry': tune(4, 'perBuildingId launch/air-base production rather than research_institute science', REP_LAB),
  'electronic-computing': tune(4, 'lowestCityScience or foodFromScience instead of research_institute science', REP_LAB),
  'integrated-circuits': tune(4, 'perBuildingCategory science for owned laboratory buildings', REP_LAB),
};

export type WarfareStatus = 'shipped-elsewhere' | 'partial' | 'absent' | 'not-worth-adding' | 'separate-feature';

export interface WarfareReconciliationRow {
  era: number;
  kind: 'hard' | 'soft';
  idea: string;
  status: WarfareStatus;
  /** Where it lives today, or why it is not a tech-balance concern. Evidence is a module, not a promise. */
  evidence: string;
  /** Tech-balance child that may reference it; 0 = nothing for a tech child to do. */
  child: 0 | 2 | 3 | 4;
}

/** #420's 2026-06 brainstorm, one row per era per kind. Checked against `src/` on the audit date. */
export const WARFARE_RECONCILIATION: WarfareReconciliationRow[] = [
  { era: 1, kind: 'hard', idea: 'Raiding: pillage improvements for food', status: 'shipped-elsewhere', evidence: 'pillage-system.ts', child: 0 },
  { era: 1, kind: 'soft', idea: 'Oral tradition: absorb neutral tribes by influence', status: 'separate-feature', evidence: 'no culture-absorption action exists; minor-civ diplomacy is a separate system', child: 0 },
  { era: 2, kind: 'hard', idea: 'Chariot rush against undefended early cities', status: 'not-worth-adding', evidence: 'city capture is adjacent-only and garrison-gated (#974); an era-gated rush rule would be a special case', child: 0 },
  { era: 2, kind: 'soft', idea: 'Trade monopoly over resource tiles', status: 'partial', evidence: 'resource-advantages.ts, diplomacy-embargoes.ts, perLuxuryResource yield kind', child: 2 },
  { era: 3, kind: 'hard', idea: 'Formation warfare: adjacent-unit bonus', status: 'shipped-elsewhere', evidence: 'combined-arms-system.ts', child: 0 },
  { era: 3, kind: 'soft', idea: 'Tribute demands without war', status: 'separate-feature', evidence: 'vassalage exists (diplomacy-vassal-rules.ts); a tribute action is a diplomacy contract', child: 0 },
  { era: 4, kind: 'hard', idea: 'Siege attrition: surrounded cities lose food', status: 'partial', evidence: 'city-siege-system.ts and city HP bombardment (#974); food loss deliberately absent', child: 0 },
  { era: 4, kind: 'soft', idea: 'Cultural absorption flips neighbour loyalty', status: 'shipped-elsewhere', evidence: 'religion-loyalty-system.ts, flip_loyalty mission', child: 0 },
  { era: 5, kind: 'hard', idea: 'Artillery softens walls before assault', status: 'shipped-elsewhere', evidence: 'city-bombardment-system.ts (#974)', child: 0 },
  { era: 5, kind: 'soft', idea: 'Printing-press propaganda at range', status: 'shipped-elsewhere', evidence: 'propaganda tech gates flip_loyalty; misinformation_campaign mission', child: 0 },
  { era: 6, kind: 'hard', idea: 'Line infantry: open-terrain bonus, rough-terrain penalty', status: 'shipped-elsewhere', evidence: 'UNIT_MODIFIERS onOpenGround / onRoughGround conditions', child: 3 },
  { era: 6, kind: 'soft', idea: 'Colonial extraction: 2x yield with unrest', status: 'partial', evidence: 'colonial_administration national project and unrest pressure; no occupied-city extraction toggle', child: 3 },
  { era: 7, kind: 'hard', idea: 'Rail logistics: faster movement on rail', status: 'partial', evidence: 'road entry cost 1 to 0.5 (military-logistics, railway-expansion); bounded by the movement stacking policy', child: 0 },
  { era: 7, kind: 'soft', idea: 'Labor unrest: spies trigger strikes', status: 'shipped-elsewhere', evidence: 'sabotage_production, incite_unrest, fund_rebels missions', child: 0 },
  { era: 8, kind: 'hard', idea: 'Conscription converts population to units', status: 'shipped-elsewhere', evidence: 'Conscription Levy governance policy', child: 0 },
  { era: 8, kind: 'soft', idea: 'Nationalist propaganda flips low-loyalty cities', status: 'shipped-elsewhere', evidence: 'flip_loyalty, religion-loyalty-system.ts', child: 0 },
  { era: 9, kind: 'hard', idea: 'Combined arms: tank + infantry bonus', status: 'shipped-elsewhere', evidence: 'combined-arms-system.ts', child: 0 },
  { era: 9, kind: 'soft', idea: 'Blockade: naval units starve coastal cities', status: 'separate-feature', evidence: 'pirate blockades exist; naval starvation of a major civ needs new persisted pressure', child: 0 },
  { era: 10, kind: 'hard', idea: 'Nuclear threat deters war declarations', status: 'shipped-elsewhere', evidence: 'strategic-arsenal-system.ts and AI deterrence (#545 arc)', child: 0 },
  { era: 10, kind: 'soft', idea: 'Proxy conflict: fund rebels in enemy land', status: 'shipped-elsewhere', evidence: 'fund_rebels and arms_smuggling missions', child: 0 },
  { era: 11, kind: 'hard', idea: 'ICBM mutual assured destruction', status: 'shipped-elsewhere', evidence: 'strategic-arsenal-system.ts, civilization-elimination-system.ts', child: 0 },
  { era: 11, kind: 'soft', idea: 'Satellite intelligence with anti-satellite counter', status: 'partial', evidence: 'satellite vision/espionage exists; no anti-satellite counter', child: 4 },
  { era: 12, kind: 'hard', idea: 'Stealth strike bypasses air defence', status: 'shipped-elsewhere', evidence: 'combat-role-definitions.ts, air-operations-system.ts', child: 0 },
  { era: 12, kind: 'soft', idea: 'Cyber sabotage with probabilistic counter', status: 'shipped-elsewhere', evidence: 'cyber-warfare-system.ts, cyber_attack mission', child: 0 },
];

