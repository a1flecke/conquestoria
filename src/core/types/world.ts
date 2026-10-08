// World-actor and threat kind contracts (#1361): beast, crisis, stampede, rogue host, tribal village and world-race kinds.
// Leaf: imports nothing. The persisted state shapes that use them stay in core/types.ts for now.

export type BeastId = 'giant_boar' | 'dire_wolf' | 'emerald_basilisk' | 'sea_serpent' | 'dune_wurm' | 'storm_roc' | 'swamp_hydra' | 'ancient_dragon';
export type BeastHoardChoice = 'gold' | 'lore' | 'trophy';
export type StampedeOutcome = 'defeated' | 'contained' | 'survived';
export type RogueElephantHostOutcome = 'defeated' | 'dispersed' | 'escaped';
export type VillageOutcomeType = 'gold' | 'food' | 'science' | 'free_unit' | 'free_tech' | 'ambush' | 'illness';
export type CrisisStage = 'active' | 'contained' | 'recovery' | 'menacing' | 'assaulting';
export type CrisisOutcome = 'contained' | 'expired' | 'hunted' | 'recovered' | 'abandoned';
export type WorldRaceKind = 'first-satellite' | 'interstellar-colony';
