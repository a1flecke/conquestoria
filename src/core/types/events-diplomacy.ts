// DiplomacyEvents: the diplomacy slice of the GameEvents map (#1361). GameEvents in core/types.ts extends this interface; keys, payloads and
// emit/listen behavior are unchanged. Leaf: type-only imports of other leaves, never the barrel.
import type { TreatyDeclineReason, TreatyType } from './diplomacy';

export interface DiplomacyEvents {
  'diplomacy:vassalage-offered': { fromCivId: string; toCivId: string };
  'diplomacy:vassalage-accepted': { vassalId: string; overlordId: string };
  'diplomacy:vassalage-ended': { vassalId: string; overlordId: string; reason: 'independence' | 'war' | 'auto_breakaway' | 'overlord_eliminated' | 'released' };
  'diplomacy:independence-requested': { vassalId: string; overlordId: string };
  'diplomacy:protection-requested': { vassalId: string; overlordId: string; attackerId: string };
  'diplomacy:independence-petition': { vassalId: string; overlordId: string; accepted: boolean };
  'diplomacy:protection-failed': { overlordId: string; vassalId: string; attackerId: string };
  'diplomacy:vassal-auto-war': { vassalId: string; overlordId: string; targetCivId: string };
  'diplomacy:vassal-auto-peace': { vassalId: string; overlordId: string; targetCivId: string };
  // #871: a diplomatic transition left `unitCount` of `civId`'s armed units standing inside a
  // border that is now closed to them. Names no civilization -- the recipient's own units only.
  'diplomacy:access-lost': { civId: string; unitCount: number };
  'diplomacy:treachery': { civId: string; action: string; newScore: number };
  'diplomacy:embargo-proposed': { proposerId: string; targetCivId: string; embargoId: string };
  'diplomacy:embargo-joined': { civId: string; embargoId: string };
  'diplomacy:embargo-left': { civId: string; embargoId: string };
  'diplomacy:league-formed': { leagueId: string; members: string[] };
  'diplomacy:league-joined': { civId: string; leagueId: string };
  'diplomacy:league-dissolved': { leagueId: string; reason: string };
  'diplomacy:league-triggered': { leagueId: string; attackerId: string; defenderId: string };
  'diplomacy:war-declared': { attackerId: string; defenderId: string; opponentKind: 'major' | 'minor' | 'barbarian' };
  // #526 MR7 Task 7.1: fired alongside diplomacy:war-declared whenever the declared-upon
  // civ has an active crisis -- applyOpportunisticWarPenaltyIfCrisisStruck already applied
  // the reputation deltas by the time this fires.
  'diplomacy:opportunistic-war': { actorId: string; targetCivId: string; crisisId: string };
  'diplomacy:peace-requested': { fromCivId: string; toCivId: string };
  'diplomacy:peace-made': { civA: string; civB: string };
  // #1090: fired when a peace proposal is refused by the synchronous AI-target consent path
  // (proposeTreatyAgreement) -- peace is deliberately a sibling to diplomacy:treaty-declined
  // rather than folded into it, since TreatyType (and diplomacy:treaty-declined's own `treaty`
  // field) structurally excludes 'peace' (a war-state transition, not a treaty), matching the
  // existing diplomacy:peace-made / diplomacy:treaty-accepted split. `reason` is present only
  // when computed by an AI consent evaluation; absent for any other resolution path.
  'diplomacy:peace-declined': { proposerCivId: string; targetCivId: string; reason?: TreatyDeclineReason };
  // #988: fired the instant a war goal's status flips to 'exceeded' (never
  // per-turn while it stays exceeded -- see overreachPenaltyApplied).
  'diplomacy:war-goal-exceeded': { civId: string; opponentCivId: string; turn: number };
  // #988: a settlement offer (typed peace terms) was proposed, accepted, or executed.
  'diplomacy:settlement-proposed': { fromCivId: string; toCivId: string; termCount: number };
  'diplomacy:settlement-declined': { proposerCivId: string; targetCivId: string; reason?: TreatyDeclineReason };
  'diplomacy:settlement-signed': { civA: string; civB: string; termCount: number };
  'diplomacy:treaty-proposed': { fromCiv: string; toCiv: string; treaty: TreatyType };
  'diplomacy:treaty-accepted': { civA: string; civB: string; treaty: TreatyType };
  // #901: a queued treaty proposal the recipient explicitly declined -- so the
  // original proposer (who may be an inactive hot-seat player) learns the
  // outcome instead of the request silently vanishing from their panel.
  // #1090: also fired (in addition to rejectDiplomaticRequest's original explicit-decline
  // path) from proposeTreatyAgreement's synchronous AI-target consent refusal, which
  // previously emitted nothing at all. `reason` is present only when a computed AI consent
  // evaluation produced one (never for a human's own explicit decline of an AI's proposal --
  // there is no AI "reason" for a choice the human made).
  'diplomacy:treaty-declined': { proposerCivId: string; targetCivId: string; treaty: TreatyType; reason?: TreatyDeclineReason };
  'diplomacy:tribute-demanded': { demanderId: string; targetId: string; goldPerRound: number; rounds: number };
  'diplomacy:tribute-accepted': { demanderId: string; payerId: string; goldPerRound: number; rounds: number };
  'diplomacy:tribute-refused': { demanderId: string; payerId: string };
  'diplomacy:tribute-ended': { demanderId: string; payerId: string; reason: 'expired' | 'war' | 'vassalage' | 'eliminated' };
  'diplomacy:treaty-broken': { breakerId: string; otherCiv: string; treaty: TreatyType };
}
