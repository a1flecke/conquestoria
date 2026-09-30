import type { SpyMissionType, UnitType } from '@/core/types';

/**
 * Espionage mission and spy catalogs (#1009): base success rates, durations,
 * XP awards, tech-gate tables, spy-slot caps, promotion buckets, spy names and
 * the infiltration base table. Pure definitions -- no state, no RNG draws and
 * no mutation. Probability math lives in `espionage-probability.ts`; mission
 * execution in `espionage-missions.ts`.
 */
export const SPY_NAMES = [
  'Shadow', 'Whisper', 'Ghost', 'Cipher', 'Raven',
  'Viper', 'Falcon', 'Wraith', 'Phantom', 'Specter',
  'Dagger', 'Smoke', 'Shade', 'Flicker', 'Ash',
  'Thorn', 'Mist', 'Echo', 'Blade', 'Ember',
];

// --- Mission difficulty config ---

// Review finding (see "does this prevent future problems of this type"): the three
// tables below were previously `const X = {...} as Record<SpyMissionType, number>` — an
// `as` cast does NOT make TypeScript verify every union member is present (unlike a real
// type annotation), so a new SpyMissionType could silently ship without an entry here and
// nothing would fail to compile. Converting to real annotations immediately caught a
// real, pre-existing gap: counter_espionage was missing from all three.
//
// counter_espionage genuinely does not belong in these tables — it is not a startable,
// resolvable mission at all: getAvailableMissions()'s STAGE_3_MISSIONS list omits it, and
// every real caller of startMission (the panel's mission catalog, and both AI
// mission-selection paths in basic-ai.ts) draws exclusively from getAvailableMissions(),
// so it can never reach getSpySuccessChance/getMissionDuration/the XP-award path at
// runtime -- confirmed by tracing every call site, not assumed. Its own
// `resolveMissionResult` case below just `return {}` (see that case's comment for what
// the player-facing defensive-embed action actually does instead).
// Rather than inventing a fictional success%/duration/XP value for a mission that has no
// real one (which would look like tuned balance data to the next reader), the type itself
// excludes it: these tables are typed over OffensiveMissionType, and
// getSpySuccessChance/getMissionDuration guard counter_espionage explicitly at their
// single call each, rather than indexing a table that was never meant to describe it.
//
// MISSION_BASE_SUCCESS is exported so Object.keys(...) is a guaranteed-complete,
// zero-maintenance enumeration of every mission that actually flows through the
// offensive mission_succeeded pipeline, for the completeness test below ("every current
// mission type is explicitly classified").
type OffensiveMissionType = Exclude<SpyMissionType, 'counter_espionage'>;

export const MISSION_BASE_SUCCESS: Record<OffensiveMissionType, number> = {
  scout_area: 0.90,
  monitor_troops: 0.85,
  gather_intel: 0.70,
  identify_resources: 0.75,
  monitor_diplomacy: 0.70,
  steal_tech: 0.50,
  sabotage_production: 0.60,
  incite_unrest: 0.55,
  assassinate_advisor: 0.45,
  forge_documents: 0.55,
  fund_rebels: 0.60,
  arms_smuggling: 0.50,
  cyber_attack: 0.45,
  misinformation_campaign: 0.55,
  election_interference: 0.40,
  satellite_surveillance: 0.70,
  sabotage_relief: 0.60, // #526 MR7: reuses sabotage_production's detection parameters
  flip_loyalty: 0.40, // #524 MR2a: lowest tier alongside election_interference — outright city transfer, not a temporary effect
  intercept_courier: 0.55, // #442 MR1: mid-stakes, comparable to forge_documents
  bribe_official: 0.45, // #442 MR1: harder than intercept_courier — direct treasury theft, comparable to assassinate_advisor
  expose_scandal: 0.50, // #442 MR2: comparable to steal_tech — mid-tier social/intel operation
  signals_intercept: 0.60, // #442 MR2: comparable to satellite_surveillance — passive intel, no disruption
};

const MISSION_DURATIONS: Record<OffensiveMissionType, number> = {
  scout_area: 1,
  monitor_troops: 2,
  gather_intel: 3,
  identify_resources: 4,
  monitor_diplomacy: 3,
  steal_tech: 6,
  sabotage_production: 4,
  incite_unrest: 5,
  assassinate_advisor: 6,
  forge_documents: 5,
  fund_rebels: 6,
  arms_smuggling: 4,
  cyber_attack: 2,
  misinformation_campaign: 3,
  election_interference: 5,
  satellite_surveillance: 1,
  sabotage_relief: 4, // #526 MR7: reuses sabotage_production's duration
  flip_loyalty: 8, // #524 MR2a: longest duration in the game, above fund_rebels/assassinate_advisor (6) — matches the stakes
  intercept_courier: 4, // #442 MR1: matches sabotage_relief's setup window
  bribe_official: 5, // #442 MR1: matches forge_documents — a slow social build, not a snap action
  expose_scandal: 6, // #442 MR2: between forge_documents (5) and flip_loyalty (8) — more research/setup than a simple frame job
  signals_intercept: 2, // #442 MR2: matches cyber_attack's tier — quick remote intel snapshot
};

export function getMissionDuration(missionType: SpyMissionType): number {
  // counter_espionage has no countdown to resolve -- see MISSION_BASE_SUCCESS's comment.
  // Never actually reached (getAvailableMissions() excludes it from every real caller),
  // but explicit rather than an unsafe table index.
  if (missionType === 'counter_espionage') return 0;
  return MISSION_DURATIONS[missionType];
}

// --- Tech gating ---

const STAGE_1_TECHS = ['espionage-scouting'];
const STAGE_2_TECHS = ['espionage-informants'];
const STAGE_3_TECHS = ['spy-networks', 'sabotage'];      // either unlocks stage 3
const STAGE_4_TECHS = ['cryptography', 'counter-intelligence']; // either unlocks stage 4
// STAGE_5 is intentionally absent — digital-surveillance gates no missions until era-appropriate
// missions are added in a follow-up issue. cold-war-networks resumes the ladder at era 10.
const STAGE_5_TECHS = ['cold-war-networks'];       // era 10 — Cold War propaganda/subversion
const STAGE_6_TECHS = ['satellite-surveillance'];   // era 11 — spy satellites
const STAGE_7_TECHS = ['cyber-intelligence'];        // era 12 — cyber operative attacks
// #526 MR7: covert-operations (era 7) gates sabotage_relief -- its own bucket rather
// than folded into STAGE_4_TECHS, since covert-operations isn't one of that stage's
// gating techs (cryptography/counter-intelligence) and gates only this one mission.
const SABOTAGE_RELIEF_TECHS = ['covert-operations'];
const PROPAGANDA_TECHS = ['propaganda']; // era 6 — gates flip_loyalty specifically, not the shared Stage 4 set
// #442 MR1: black-chambers/diplomatic-networks (era 5) each get their own single-mission
// bucket, same pattern as SABOTAGE_RELIEF_TECHS/PROPAGANDA_TECHS above — neither tech is
// one of Stage 4's gating techs (cryptography/counter-intelligence), and each gates only
// one mission.
const INTERCEPT_COURIER_TECHS = ['black-chambers'];
const BRIBE_OFFICIAL_TECHS = ['diplomatic-networks'];
// #442 MR2: disinformation-bureau/counterintelligence (era 8/9) get their own single-mission
// buckets, same pattern as the era-5 pair above.
const EXPOSE_SCANDAL_TECHS = ['disinformation-bureau'];
const SIGNALS_INTERCEPT_TECHS = ['counterintelligence'];

const STAGE_1_MISSIONS: SpyMissionType[] = ['scout_area', 'monitor_troops'];
const STAGE_2_MISSIONS: SpyMissionType[] = ['gather_intel', 'identify_resources', 'monitor_diplomacy'];
const STAGE_3_MISSIONS: SpyMissionType[] = ['steal_tech', 'sabotage_production', 'incite_unrest'];
const STAGE_4_MISSIONS: SpyMissionType[] = ['assassinate_advisor', 'forge_documents', 'fund_rebels', 'arms_smuggling'];
const STAGE_5_MISSIONS: SpyMissionType[] = ['misinformation_campaign', 'election_interference'];
const STAGE_6_MISSIONS: SpyMissionType[] = ['satellite_surveillance'];
const STAGE_7_MISSIONS: SpyMissionType[] = ['cyber_attack'];
const SABOTAGE_RELIEF_MISSIONS: SpyMissionType[] = ['sabotage_relief'];
const PROPAGANDA_MISSIONS: SpyMissionType[] = ['flip_loyalty'];
const INTERCEPT_COURIER_MISSIONS: SpyMissionType[] = ['intercept_courier'];
const BRIBE_OFFICIAL_MISSIONS: SpyMissionType[] = ['bribe_official'];
const EXPOSE_SCANDAL_MISSIONS: SpyMissionType[] = ['expose_scandal'];
const SIGNALS_INTERCEPT_MISSIONS: SpyMissionType[] = ['signals_intercept'];

export function getAvailableMissions(completedTechs: string[]): SpyMissionType[] {
  const missions: SpyMissionType[] = [];
  if (STAGE_1_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_1_MISSIONS);
  if (STAGE_2_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_2_MISSIONS);
  if (STAGE_3_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_3_MISSIONS);
  if (STAGE_4_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_4_MISSIONS);
  if (STAGE_5_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_5_MISSIONS);
  if (STAGE_6_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_6_MISSIONS);
  if (STAGE_7_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_7_MISSIONS);
  if (SABOTAGE_RELIEF_TECHS.some(t => completedTechs.includes(t))) missions.push(...SABOTAGE_RELIEF_MISSIONS);
  if (PROPAGANDA_TECHS.some(t => completedTechs.includes(t))) missions.push(...PROPAGANDA_MISSIONS);
  if (INTERCEPT_COURIER_TECHS.some(t => completedTechs.includes(t))) missions.push(...INTERCEPT_COURIER_MISSIONS);
  if (BRIBE_OFFICIAL_TECHS.some(t => completedTechs.includes(t))) missions.push(...BRIBE_OFFICIAL_MISSIONS);
  if (EXPOSE_SCANDAL_TECHS.some(t => completedTechs.includes(t))) missions.push(...EXPOSE_SCANDAL_MISSIONS);
  if (SIGNALS_INTERCEPT_TECHS.some(t => completedTechs.includes(t))) missions.push(...SIGNALS_INTERCEPT_MISSIONS);
  return missions;
}

// #442 MR2: signals_intercept is the first remote-capable mission that isn't a
// digital-era (cyber-warfare/digital-surveillance-family) effect — it's codebreaking, not
// hacking, so it doesn't need a spy physically inside the target's territory the way
// intercept_courier/bribe_official/expose_scandal do. Placed alongside the era-10+ remote
// missions on that basis, not by proximity to their tech era.
export function missionRequiresPlacedSpy(missionType: SpyMissionType): boolean {
  return !['cyber_attack', 'misinformation_campaign', 'satellite_surveillance', 'signals_intercept'].includes(missionType);
}

export const PROMOTION_XP_THRESHOLD = 60;

// Mission categories for auto-promotion
export const INFILTRATOR_MISSIONS = new Set<SpyMissionType>([
  'steal_tech', 'sabotage_production', 'assassinate_advisor', 'arms_smuggling', 'sabotage_relief',
  'intercept_courier', // #442 MR1: physical/sabotage-flavored, matches this bucket's other entries
]);
export const HANDLER_MISSIONS = new Set<SpyMissionType>([
  'incite_unrest', 'forge_documents', 'fund_rebels', 'monitor_diplomacy', 'flip_loyalty',
  'bribe_official', // #442 MR1: social/manipulation-flavored, matches this bucket's other entries
  'expose_scandal', // #442 MR2: social/manipulation-flavored, matches this bucket's other entries
]);
// signals_intercept (#442 MR2) is intel-flavored, like monitor_troops/gather_intel — falls
// through to Sentinel, the same as those, rather than joining either bucket above.
// Sentinel: everything else (intel, scouting, defensive)

const XP_PER_MISSION: Record<OffensiveMissionType, number> = {
  scout_area: 5,
  monitor_troops: 5,
  gather_intel: 10,
  identify_resources: 8,
  monitor_diplomacy: 10,
  steal_tech: 15,
  sabotage_production: 12,
  incite_unrest: 12,
  assassinate_advisor: 18,
  forge_documents: 15,
  fund_rebels: 12,
  arms_smuggling: 12,
  cyber_attack: 16,
  misinformation_campaign: 14,
  election_interference: 16,
  satellite_surveillance: 8,
  sabotage_relief: 12, // #526 MR7: matches sabotage_production's xp
  flip_loyalty: 20, // #524 MR2a: highest xp in the game, above assassinate_advisor (18)
  intercept_courier: 14, // #442 MR1: matches misinformation_campaign's tier
  bribe_official: 16, // #442 MR1: matches election_interference's tier — high-value theft
  expose_scandal: 16, // #442 MR2: matches bribe_official's tier — high-value multilateral effect
  signals_intercept: 10, // #442 MR2: matches gather_intel's tier — informational, not disruptive
};

// counter_espionage never grants mission XP through this path -- see
// MISSION_BASE_SUCCESS's comment. Never actually reached (getAvailableMissions()
// excludes it from every real caller), but explicit rather than an unsafe table index.
export function getMissionXp(missionType: SpyMissionType): number {
  if (missionType === 'counter_espionage') return 0;
  return XP_PER_MISSION[missionType];
}

export const EXPULSION_COOLDOWN = 5;

export const ESPIONAGE_TECH_MAX_SPIES: Record<string, number> = {
  'espionage-scouting': 1,
  'espionage-informants': 2,
  'spy-networks': 3,
  'cryptography': 4,
  'counter-intelligence': 5,
  'black-chambers': 6,          // era 5: "+1 spy slot empire-wide"
  'covert-operations': 8,       // era 7: "+2 spy slots empire-wide"
  'political-intelligence': 11, // era 8: "+3 spy slots empire-wide"
};

// ─── Infiltration ────────────────────────────────────────────────────────────

export const INFILTRATION_BASE: Partial<Record<UnitType, number>> = {
  spy_scout: 0.55,
  spy_informant: 0.65,
  spy_agent: 0.70,
  spy_operative: 0.75,
  spy_hacker: 0.80,
};
