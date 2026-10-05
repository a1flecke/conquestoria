// src/ui/notification-routes/diplomacy-routes.ts
// #1250: treaties, peace, war, settlements, first contact and the vassalage/border consequences. The
// shared copy (describeWarReason, TREATY_LABELS, decline reasons) lives here because the diplomacy panel
// reads the same strings.
import type { GameEvents, GameState, TreatyDeclineReason, TreatyType } from '@/core/types';
import type { NotificationSink } from './notification-sink';

// Writes to both parties' logs from their own perspective.
// Shared between the war-declared notification and the diplomacy panel's
// "at war since" row (#554) -- one source of truth for the relationship-based
// reason string, so the two surfaces never drift.
export function describeWarReason(relationship: number): string {
  if (relationship <= -50) return 'deep hostility';
  if (relationship <= -20) return 'deteriorating relations';
  if (relationship < 0) return 'territorial disputes';
  return 'rising tensions';
}

// Shared between the treaty-proposed notification and the diplomacy panel's
// proposal buttons (#554) -- one source of truth for display names.
export const TREATY_LABELS: Record<TreatyType, string> = {
  non_aggression_pact: 'Non-Aggression Pact',
  trade_agreement: 'Trade Agreement',
  open_borders: 'Open Borders',
  alliance: 'Alliance',
  vassalage: 'Vassalage',
  arms_control_pact: 'Arms Control Pact',
  tribute: 'Tribute',
};

export function routeTreatyProposed(
  state: GameState,
  event: GameEvents['diplomacy:treaty-proposed'],
  sink: NotificationSink,
): void {
  const fromName = state.civilizations[event.fromCiv]?.name ?? 'Unknown';
  if (event.treaty === 'vassalage') {
    sink(event.toCiv, `${fromName} offers to become your vassal: receive 25% tribute and promise protection. Review the offer in Diplomacy.`, 'info');
    return;
  }
  const label = TREATY_LABELS[event.treaty];
  sink(event.toCiv, `${fromName} proposes a ${label}. Review it in the Diplomacy panel.`, 'info');
}

export function routeTreatyAccepted(
  state: GameState,
  event: GameEvents['diplomacy:treaty-accepted'],
  sink: NotificationSink,
): void {
  const civA = state.civilizations[event.civA]?.name ?? 'Unknown';
  const civB = state.civilizations[event.civB]?.name ?? 'Unknown';
  if (event.treaty === 'vassalage') {
    sink(event.civA, `${civB} is now your overlord. You pay 25% tribute and join their wars; they promise protection.`, 'success');
    sink(event.civB, `${civA} is now your vassal. You receive 25% tribute and must respond to threats within 3 turns.`, 'success');
    return;
  }
  const label = TREATY_LABELS[event.treaty];
  sink(event.civA, `${civB} accepted the ${label}.`, 'success');
  sink(event.civB, `You accepted the ${label} with ${civA}.`, 'success');
}

// #1090: authored, bounded copy per TreatyDeclineReason -- shared by every decline
// notification (treaty, vassalage, peace) so the same reason always reads the same way.
// Never invents new reasons; a value here must correspond to one ai-treaty-consent.ts can
// actually compute.
export const TREATY_DECLINE_REASON_TEXT: Record<TreatyDeclineReason, string> = {
  'relations-too-strained': 'Relations are too strained for them to agree.',
  'strategic-caution': 'They remain cautious about deeper commitments right now.',
  'peace-not-acceptable': 'They believe they can still prevail and refuse peace.',
  'terms-too-costly': 'They consider your proposed terms too costly to accept.',
};

export function routeTreatyDeclined(
  state: GameState,
  event: GameEvents['diplomacy:treaty-declined'],
  sink: NotificationSink,
): void {
  // #901: recipient-scoped to the *proposer* only -- so an inactive hot-seat
  // player whose offer was declined learns why, without leaking the decision
  // to any onlooker.
  const targetName = state.civilizations[event.targetCivId]?.name ?? 'Unknown';
  // #1090: `reason` is only present when a computed AI consent evaluation produced one
  // (the synchronous proposeTreatyAgreement/proposeVassalage refusal paths) -- a human's own
  // explicit decline of an AI's proposal (rejectDiplomaticRequest) has no reason to append,
  // and this keeps that case's message byte-identical to before.
  const reasonSuffix = event.reason ? ` ${TREATY_DECLINE_REASON_TEXT[event.reason]}` : '';
  sink(event.proposerCivId, `${targetName} declined your ${TREATY_LABELS[event.treaty]}.${reasonSuffix}`, 'warning');
}

export function routePeaceDeclined(
  state: GameState,
  event: GameEvents['diplomacy:peace-declined'],
  sink: NotificationSink,
): void {
  const targetName = state.civilizations[event.targetCivId]?.name ?? 'Unknown';
  const reasonSuffix = event.reason ? ` ${TREATY_DECLINE_REASON_TEXT[event.reason]}` : '';
  sink(event.proposerCivId, `${targetName} refused your peace offer.${reasonSuffix}`, 'warning');
}

export function routeWarDeclared(
  state: GameState,
  attackerId: string,
  defenderId: string,
  sink: NotificationSink,
): void {
  const attackerName = state.civilizations[attackerId]?.name ?? 'Unknown';
  const defenderName = state.civilizations[defenderId]?.name ?? 'Unknown';
  const rel = state.civilizations[defenderId]?.diplomacy?.relationships[attackerId] ?? 0;
  const reason = describeWarReason(rel);
  sink(defenderId, `${attackerName} has declared war! (Reason: ${reason})`, 'warning');
  sink(attackerId, `War has been declared on ${defenderName}!`, 'warning');
}

// Writes to both parties' logs.
export function routePeaceMade(
  state: GameState,
  civA: string,
  civB: string,
  sink: NotificationSink,
): void {
  const a = state.civilizations[civA]?.name ?? 'Unknown';
  const b = state.civilizations[civB]?.name ?? 'Unknown';
  sink(civA, `Peace with ${b}!`, 'success');
  sink(civB, `Peace with ${a}!`, 'success');
}

// Writes only to the recipient civ's log because the requester already
// gets direct action feedback from the initiating UI/AI path.
export function routePeaceRequested(
  state: GameState,
  fromCivId: string,
  toCivId: string,
  sink: NotificationSink,
): void {
  const fromName = state.civilizations[fromCivId]?.name ?? 'Unknown';
  sink(toCivId, `${fromName} requests peace.`, 'info');
}

// #988: writes only to the recipient civ's log, mirroring routePeaceRequested --
// the proposer already gets direct action feedback from the initiating UI/AI path.
export function routeSettlementProposed(
  state: GameState,
  event: GameEvents['diplomacy:settlement-proposed'],
  sink: NotificationSink,
): void {
  const fromName = state.civilizations[event.fromCivId]?.name ?? 'Unknown';
  const termWord = event.termCount === 1 ? 'term' : 'terms';
  sink(event.toCivId, `${fromName} proposes a peace settlement (${event.termCount} ${termWord}).`, 'info');
}

export function routeSettlementDeclined(
  state: GameState,
  event: GameEvents['diplomacy:settlement-declined'],
  sink: NotificationSink,
): void {
  const targetName = state.civilizations[event.targetCivId]?.name ?? 'Unknown';
  const reasonSuffix = event.reason ? ` ${TREATY_DECLINE_REASON_TEXT[event.reason]}` : '';
  sink(event.proposerCivId, `${targetName} rejected your settlement offer.${reasonSuffix}`, 'warning');
}

// Writes to both parties' logs, mirroring routePeaceMade.
export function routeSettlementSigned(
  state: GameState,
  event: GameEvents['diplomacy:settlement-signed'],
  sink: NotificationSink,
): void {
  const a = state.civilizations[event.civA]?.name ?? 'Unknown';
  const b = state.civilizations[event.civB]?.name ?? 'Unknown';
  const termWord = event.termCount === 1 ? 'term' : 'terms';
  sink(event.civA, `Peace settlement with ${b} signed (${event.termCount} ${termWord}).`, 'success');
  sink(event.civB, `Peace settlement with ${a} signed (${event.termCount} ${termWord}).`, 'success');
}

export function routeWarGoalExceeded(
  state: GameState,
  event: GameEvents['diplomacy:war-goal-exceeded'],
  sink: NotificationSink,
): void {
  const opponentName = state.civilizations[event.opponentCivId]?.name ?? 'Unknown';
  sink(event.civId, `Your war against ${opponentName} has gone beyond its declared goal. Other civilizations take note.`, 'warning');
}

export function routeFirstContact(
  state: GameState,
  civA: string,
  civB: string,
  sink: NotificationSink,
): void {
  const aName = state.civilizations[civA]?.name ?? civA;
  const bName = state.civilizations[civB]?.name ?? civB;
  sink(civA, `You have encountered ${bName}.`, 'info');
  sink(civB, `You have encountered ${aName}.`, 'info');
}

export function routeIndependenceRequested(state: GameState, event: GameEvents['diplomacy:independence-requested'], sink: NotificationSink): void {
  const name = state.civilizations[event.vassalId]?.name ?? 'Your vassal';
  sink(event.overlordId, `${name} petitions for independence. Grant it peacefully or refuse and face war. Decide in Diplomacy.`, 'warning');
}

export function routeVassalageEnded(state: GameState, event: GameEvents['diplomacy:vassalage-ended'], sink: NotificationSink): void {
  const vassal = state.civilizations[event.vassalId]?.name ?? 'The vassal';
  const overlord = state.civilizations[event.overlordId]?.name ?? 'The overlord';
  const reason = event.reason === 'war' ? 'The independence petition was refused: war has begun.'
    : event.reason === 'released' ? 'The overlord released the vassal, taking 40 treachery for abandoning protection.'
    : event.reason === 'auto_breakaway' ? 'Failed protection allowed an automatic peaceful breakaway.'
    : event.reason === 'overlord_eliminated' ? 'The overlord was eliminated.' : 'Independence was granted peacefully.';
  sink(event.vassalId, `You are independent of ${overlord}. Tribute and protection have ended. ${reason}`, event.reason === 'war' ? 'warning' : 'info');
  sink(event.overlordId, `${vassal} is independent. Tribute and protection have ended. ${reason}`, event.reason === 'war' ? 'warning' : 'info');
}

export function routeProtectionRequested(state: GameState, event: GameEvents['diplomacy:protection-requested'], sink: NotificationSink): void {
  const vassal = state.civilizations[event.vassalId]?.name ?? 'Your vassal';
  sink(event.overlordId, `${vassal} needs protection. Join the attacker's war within 3 turns or lose 20 protection. Use Defend Vassal in Diplomacy.`, 'warning');
}

export function routeProtectionFailed(state: GameState, event: GameEvents['diplomacy:protection-failed'], sink: NotificationSink): void {
  const vassal = state.civilizations[event.vassalId]?.name ?? 'Your vassal';
  sink(event.overlordId, `You failed to protect ${vassal}: protection fell by 20.`, 'warning');
  sink(event.vassalId, 'Your overlord failed to protect you: protection fell by 20. At 20 or less, you become independent.', 'warning');
}

export function routeVassalAutoWar(state: GameState, event: GameEvents['diplomacy:vassal-auto-war'], sink: NotificationSink): void {
  const target = state.civilizations[event.targetCivId]?.name ?? 'a city-state';
  sink(event.vassalId, `You joined your overlord's war against ${target}, without a treachery penalty.`, 'warning');
}

export function routeAccessLost(event: GameEvents['diplomacy:access-lost'], sink: NotificationSink): void {
  const one = event.unitCount === 1;
  const who = one ? 'One of your units is' : `${event.unitCount} of your units are`;
  sink(
    event.civId,
    `${who} now inside borders that are closed to ${one ? 'it' : 'them'}. ${one ? 'It' : 'They'} can keep moving and leave, but cannot come back in without Open Borders, an alliance, or war.`,
    'warning',
  );
}

export function routeVassalAutoPeace(state: GameState, event: GameEvents['diplomacy:vassal-auto-peace'], sink: NotificationSink): void {
  // Same fallback as routeVassalAutoWar: a target that is not in `civilizations`
  // is a city-state, and its real name is discovery-gated — never read it here.
  const target = state.civilizations[event.targetCivId]?.name ?? 'a city-state';
  const overlord = state.civilizations[event.overlordId]?.name ?? 'your overlord';
  sink(event.vassalId, `${overlord} made peace with ${target}, so your war with them has ended too.`, 'info');
}
