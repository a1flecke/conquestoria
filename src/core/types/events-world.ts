// WorldEvents: the world slice of the GameEvents map (#1361). GameEvents in core/types.ts extends this interface; keys, payloads and
// emit/listen behavior are unchanged. Leaf: type-only imports of other leaves, never the barrel.
import type { PirateFactionId, PirateHeadquarters, PirateMaritimeStage } from '../pirate-state';
import type { HexCoord } from './hex';
import type { BeastHoardChoice, BeastId, CrisisOutcome, CrisisStage, RogueElephantHostOutcome, StampedeOutcome, VillageOutcomeType, WorldRaceKind } from './world';

export interface WorldEvents {
  'pirate:faction-spawned': {
    factionId: PirateFactionId;
    factionName: string;
    headquartersKind: PirateHeadquarters['kind'];
    position: HexCoord;
    maritimeStage: PirateMaritimeStage;
  };
  'pirate:audio-cue': {
    cue: 'sighting' | 'raid' | 'blockade' | 'tribute' | 'contract-accepted' | 'contract-exposed'
      | 'siege' | 'city-razed';
    factionId: string;
    viewerIds: string[];
  };
  'pirate:headquarters-destroyed': { factionId: string; viewerIds: string[] };
  'barbarian:spawned': { campId: string; unitId: string };
  'beast:awakened': { lairId: string; beastId: BeastId; position: HexCoord };
  'beast:slain': { lairId: string; beastId: BeastId; slayerCivId: string; slayerUnitId: string; goldAwarded: number };
  'beast:sighted': { beastId: BeastId; civId: string };
  'beast:hoard-claimed': { lairId: string; beastId: BeastId; civId: string; choice: BeastHoardChoice };
  'barbarian:camp-destroyed': { campId: string; reward: number };
  'threat:barbarian-resurgence': { civId: string; landmassId: string; campId: string; position: HexCoord; isBanditLord: boolean; banditLordName?: string };
  'threat:pirate-fleet-spawned': { fleetId: string; civId: string; landmassId: string; position: HexCoord };
  'threat:pirate-plunder': { fleetId: string; cityId: string; goldStolen: number };
  'threat:pirate-siege': { fleetId: string; cityId: string; hpLost: number };
  'threat:pirate-fleet-destroyed': { fleetId: string; civId: string; landmassId: string };
  'barbarian:city-attacked': { attackerUnitId: string; cityId: string; hpLost: number };
  'barbarian:city-destroyed': { attackerUnitId: string; cityId: string; ownerId: string };
  // Pirate-faction naval siege (#522) mirror of the barbarian city-siege events above,
  // emitted from pirate-system.ts's completed-round processing (not the dead
  // threat-pressure-system.ts fleet path 'threat:pirate-siege' above).
  'pirate:city-destroyed': { cityId: string; ownerId: string; factionId: string };
  'village:visited': { civId: string; position: HexCoord; outcome: VillageOutcomeType; message: string };
  // Crisis events & revolutionary movements (#381, #354)
  'crisis:started':   { crisisId: string; flavorId: string; civId: string; cityIds: string[] };
  'crisis:spread':    { crisisId: string; fromCityId: string; toCityId: string };
  // civId/foeName are populated for Hunt transitions (spawn -> menacing, menacing ->
  // assaulting) — carried directly rather than re-read from state because both are set
  // for the first time in the same tick this event fires, and the listener may run
  // against a state snapshot from before this tick's processing (see
  // .claude/rules/end-to-end-wiring.md "Transition Events must be transition-owned").
  'crisis:escalated': { crisisId: string; stage: CrisisStage; civId?: string; foeName?: string };
  'crisis:response':  { crisisId: string; civId: string; action: string };
  // foeName/killerCivId populated for Hunt's 'hunted' outcome, for the same
  // same-tick-freshness reason as crisis:escalated above.
  'crisis:resolved':  { crisisId: string; flavorId: string; civId: string; outcome: CrisisOutcome; foeName?: string; killerCivId?: string };
  // Fires only when a hunt's killer differs from the crisis's own target civ (#526 MR6
  // hunt-their-foe interaction) -- a self-kill never emits this.
  'crisis:foe-hunted-by-ally': { crisisId: string; killerCivId: string; targetCivId: string; foeName?: string };
  // #526 MR6 send_aid interaction.
  'crisis:aid-sent': { crisisId: string; actorCivId: string; targetCivId: string; goldCost: number };
  // #919 MR1: fired once when a civ funds a nationwide remedy (applyEmpireContainment).
  'crisis:contained': { crisisId: string; civId: string; cityCount: number; goldCost: number };
  // #992 world races. All three are world-scoped, never civ-specific except
  // 'completed' -- 'unlocked' and 'launch-begun' are the two public milestones
  // and deliberately carry no civId (see world-race-system.ts / ActiveWorldRace
  // doc comment). 'entry-mooted' fires for every OTHER entrant still holding
  // the launch building queued once a winner is decided -- their own private
  // notification, not a public milestone.
  'worldrace:unlocked':      { kind: WorldRaceKind; turn: number };
  'worldrace:launch-begun':  { kind: WorldRaceKind; turn: number };
  'worldrace:completed':     { kind: WorldRaceKind; winnerCivId: string; hostCityId: string; turn: number };
  'worldrace:entry-mooted':  { kind: WorldRaceKind; civId: string; cityId: string; goldRefund: number };
  /** One-time, target-scoped Beast Stampede presentation transition. */
  'stampede:lifecycle':
    | { kind: 'warning'; targetCivId: string }
    | { kind: 'activated'; targetCivId: string; activeTurns: number }
    | { kind: 'resolved'; targetCivId: string; outcome: StampedeOutcome; rewardGranted: boolean };
  /** Target-scoped Rogue Host conversion and terminal result. */
  'rogue-elephant-host:lifecycle':
    | { kind: 'warning'; targetCivId: string }
    | { kind: 'command-broken'; targetCivId: string; dispersalTurnsRemaining: number }
    | { kind: 'resolved'; targetCivId: string; outcome: RogueElephantHostOutcome; rewardGranted: boolean };
}
