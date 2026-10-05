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
const keep = (rating: TechAuditEntry['rating'], note: string, child: TechAuditEntry['child'] = 0): TechAuditEntry =>
  ({ cls: 'KEEP', rating, note, child });


const followUp = (child: TechAuditEntry['child'], note: string, issue: string): TechAuditEntry =>
  ({ cls: 'FOLLOW-UP', rating: 1, note, followUp: issue, child });

const PINNED_PERCENT = 'Unconditional percentage yield pinned into the reference economy that RESEARCH_OUTPUT_BY_ERA and every persisted tech cost derive from; replacing it is a pacing decision, not a tech-text edit.';

const FLAT = 'Unconditional flat or percentage yield; value does not depend on any choice the player made.';

export const TECH_AUDIT_ENTRIES: Record<string, TechAuditEntry> = {
  // ---- flat yields, Eras 5–8 (child 3) ----

  // ---- flat yields, Eras 9–11 (child 4) ----
  'lab-grown-food': { ...replace(0, 'terrainYield food on barren terrain', FLAT), note: `${FLAT} Era 12 is reference material for #420; left unscheduled.` },

  // ---- broad combat modifiers ----
  'nanomaterials': { ...replace(0, 'UNIT_MODIFIERS: bonus conditional on fullHP (matches the Era 12 reference)', 'Unconditional combat bonus across every unit.'), note: 'Unconditional combat bonus across every unit. Era 12 is reference; left unscheduled.' },

  // ---- broad cost discounts ----
  'vaulted-ceilings': keep(2, 'Verified #1304: a 10% building discount is a modest efficiency; no narrower scope exists in TECH_COST_DISCOUNTS without a new discount shape. Left unchanged.', 3),
  'general-mobilization': keep(2, 'Verified #1304: x0.85 on military units is the era-8 military-economy lever and already stacks multiplicatively by design (production-costs.test.ts). Left unchanged.', 3),

  // ---- text claims with no mechanic behind them (WIRE or textFix) ----
  'irrigation': keep(3, 'Verified in #1303: tile-yield.ts gives river farms +1 production once irrigation is known; the text was true.', 2),
  'professional-army': keep(3, 'Verified #1304: combat-system applies +10% to defenders in cities, shown in the combat preview parts; text is true.', 3),
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
  'political-intelligence': keep(3, 'Owned by espionage-catalog/modifiers.', 3),
  'disinformation-bureau': keep(3, 'Owned by espionage-catalog/modifiers.', 3),
  'counterintelligence': keep(3, 'Owned by espionage-catalog/modifiers.', 4),
  'signals-intelligence': keep(3, 'Owned by espionage-counterintel and modifiers.', 4),
  'cloud-computing': keep(3, 'Owned by tech-system cost discount for science techs. Era 12 reference.'),
  'private-spaceflight': keep(3, 'Owned by unit-production-completion and building. Era 12 reference.'),
  'precision-agriculture': keep(3, 'Owned by tile-yield via precision_farm. Era 12 reference.'),

  // ---- conditional, but the same shape repeats on three or more techs (differentiate, do not delete) ----
  'plantation-farming': keep(2, 'Reviewed #1315: canonical per-farm rung (+1, era 5). Scales with the farms a player commits to.', 3),
  'agricultural-machinery': keep(2, 'Reviewed #1315 KEEP: the intensification rung (+2 per farm, era 7) for a player who committed to agriculture; its gap to the +1 rungs is the point.', 3),
  'pesticides': keep(2, 'Reviewed #1315 KEEP: the late maintenance rung (+1 per farm, era 10) that keeps farm-heavy empires growing as the other farm rungs convert to terrain and population effects. Three per-farm rungs across five eras is an accepted specialization ladder.', 4),

  // ---- percentage techs held back on purpose (#1304): see the follow-up issue ----
  'rationalism': followUp(3, PINNED_PERCENT, 'Tracked in #1311.'),
  'parliamentary-reform': followUp(3, PINNED_PERCENT, 'Tracked in #1311.'),
  'mass-production': followUp(3, `${PINNED_PERCENT} Its 5% unit discount stays, a documented stack with general-mobilization.`, 'Tracked in #1311.'),
  'pragmatism': followUp(3, PINNED_PERCENT, 'Tracked in #1311.'),

  // ---- Era 9-11 outcomes that remain flagged by the generic rules (#1305) ----
  'tungsten-alloys': keep(2, 'Scoped to armor and siege units: a class identity that matches its text, not an army-wide bonus. The class-scoped-and-unconditional shape is tracked in #1318.', 4),
  'carbon-fiber': keep(2, 'Scoped to air and armored units, matching its text. Tracked in #1318.', 4),
  'mercantilism': keep(2, 'Reviewed #1315 KEEP: per distinct peacetime trade partner (hurt by war). The partner-count shape recurs in arms-control-negotiations and globalization because each is the same diplomacy-scaled decision in a different era; no existing verb separates them without a new mechanic.', 3),
  'arms-control-negotiations': keep(2, 'Reviewed #1315 KEEP: per distinct peacetime partner; its text/effect mismatch was fixed in #1305. Shares the partner-count shape with mercantilism and globalization (see mercantilism).', 4),
  'globalization': keep(3, 'Era 12 reference: per distinct peacetime partner. Left unchanged.', 0),
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

