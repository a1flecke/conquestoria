import type { GameState, DiplomaticAction, TreatyType } from '@/core/types';
import {
  canReabsorbBreakaway,
  getRelationship,
  isAtWar,
  getAvailableActions,
  getPendingPeaceRequestForPair,
  getPendingTreatyProposalsFor,
} from '@/systems/diplomacy-system';
import { TREATY_LABELS, describeWarReason } from '@/ui/notification-routing';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { hasDiscoveredMinorCiv } from '@/systems/discovery-system';
import { shouldListMajorCivForViewer } from '@/systems/viewer-intel';
import {
  getMinorCivEconomyPresentationForPlayer,
  getMinorCivPresentationForPlayer,
} from '@/systems/minor-civ-presentation';
import {
  formatQuestReward,
  getMinorCivChainPresentationForPlayer,
  getMinorCivQuestPresentationForPlayer,
} from '@/systems/quest-presentation';
import { getMinorCivRelationshipStatus } from '@/systems/quest-chain-system';
import { isMinorCivAtWar } from '@/systems/minor-civ-diplomacy';
import { hasAccessibleLuxury } from '@/systems/quest-objective-system';
import { minorCivReparationsCost } from '@/systems/minor-civ-actions';
import { createGameButton } from '@/ui/ui-kit';
import { getWorldPressurePresentationForViewer } from '@/systems/world-pressure-presentation';
import { canSendAid, type SendAidFailureReason } from '@/systems/crisis-interaction-system';
import { TECH_TREE } from '@/systems/tech-definitions';

export interface DiplomacyPanelCallbacks {
  onAction: (targetCivId: string, action: DiplomaticAction) => void;
  onAcceptPeaceRequest?: (requestId: string) => void;
  onRejectPeaceRequest?: (requestId: string) => void;
  onAcceptTreatyProposal?: (requestId: string) => void;
  onDeclineTreatyProposal?: (requestId: string) => void;
  onBreakTreaty?: (civId: string, treatyType: TreatyType) => void;
  onGiftGold?: (mcId: string) => void;
  onSponsorFestival?: (mcId: string) => void;
  onMinorCivReparations?: (mcId: string) => void;
  onMinorCivWarPeace?: (mcId: string, currentlyAtWar: boolean) => void;
  onSendAid?: (crisisId: string) => void;
  onClose: () => void;
}

// Reasons canSendAid can disable the button for -- all player-facing, per spec's "cost,
// effect, and risk inline at the point of choice" UI requirement.
function describeSendAidDisabledReason(
  reason: SendAidFailureReason,
  goldCost: number | null,
  techId: string | null,
): string {
  switch (reason) {
    case 'no-tech': {
      const techName = techId ? TECH_TREE.find(t => t.id === techId)?.name ?? techId : 'the required technology';
      return `Requires ${techName}.`;
    }
    case 'not-enough-gold': return goldCost !== null ? `Requires ${goldCost} gold.` : 'Not enough gold.';
    case 'already-aided': return 'You already sent aid for this crisis.';
    case 'flag-off': return 'Crisis interactions are not available yet.';
    case 'unknown-civ':
    case 'no-crisis':
      return 'Unavailable.';
  }
}

interface CivRowData {
  civId: string;
  civIdx: number;
  name: string;
  color: string;
  bonusName: string;
  relationship: number;
  barWidth: number;
  barColor: string;
  statusText: string;
  treaties: Array<{ label: string; turns: number; type: TreatyType }>;
  actions: Array<{ action: DiplomaticAction; isHostile: boolean }>;
  peaceRequestState: 'none' | 'incoming' | 'outgoing';
  peaceRequestId: string | null;
  incomingTreatyProposals: Array<{ id: string; label: string }>;
  atWar: boolean;
  warSinceText: string | null;
  worldPressureStatusText: string | null;
  // #526 MR7 Task 7.1: exploit_weakness intel (severity + infected cities), gated on
  // the viewer's own diplomatic-networks -- see world-pressure-presentation.ts.
  worldPressureDetailText: string | null;
  sendAidCrisisId: string | null;
  sendAidLabel: string | null;
  sendAidHelpText: string | null;
  sendAidDisabled: boolean;
  sendAidDisabledReason: string | null;
}

interface MinorCivRowData {
  mcId: string;
  mcIdx: number;
  defName: string;
  defColor: string;
  archIcon: string;
  statusColor: string;
  statusText: string;
  questDescription: string | null;
  giftLabel: string;
  festivalLabel: string | null;
  festivalDisabledReason: string | null;
  regionalGrievanceText: string | null;
  economyHintText: string | null;
  reparationsLabel: string | null;
  reparationsDisabledReason: string | null;
  atWar: boolean;
}

export function createDiplomacyPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: DiplomacyPanelCallbacks,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'diplomacy-panel';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.95);z-index:30;overflow-y:auto;padding:16px;padding-bottom:80px;';

  const playerCiv = state.civilizations[state.currentPlayer];
  const playerDiplomacy = playerCiv.diplomacy;
  // Anchor surface for the later interaction buttons (spec §Visibility) -- viewer-safe,
  // single read path, never state.activeCrises directly.
  const worldPressurePresentation = getWorldPressurePresentationForViewer(state, state.currentPlayer);

  // Religion summary (#591 MR4): the viewer's OWN religion only -- name, boon (or a
  // pending-choice note), and own/foreign follower counts. Text injected via textContent
  // below (XSS-safe) -- the template only carries the static shell + data-text hooks.
  const ownReligion = Object.values(state.religions ?? {}).find(r => r.ownerCivId === state.currentPlayer);
  const religionSummary = ownReligion ? (() => {
    const followerCityIds = Object.entries(state.cityFaith ?? {})
      .filter(([, faith]) => faith.religionId === ownReligion.id)
      .map(([cityId]) => cityId);
    const ownFollowers = followerCityIds.filter(id => state.cities[id]?.owner === state.currentPlayer).length;
    const foreignFollowers = followerCityIds.length - ownFollowers;
    const boonLabel = ownReligion.boon
      ? `${ownReligion.boon.charAt(0).toUpperCase()}${ownReligion.boon.slice(1)}`
      : 'Choosing a boon…';
    return {
      nameLine: `🙏 ${ownReligion.name}`,
      statusLine: `Boon: ${boonLabel} · ${ownFollowers} own cit${ownFollowers === 1 ? 'y' : 'ies'}, ${foreignFollowers} foreign cit${foreignFollowers === 1 ? 'y' : 'ies'} following`,
    };
  })() : null;
  const religionSummaryHtml = religionSummary ? `
    <div style="background:rgba(150,120,217,0.12);border:1px solid rgba(150,120,217,0.35);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;">
      <div style="font-weight:bold;color:#b39ddb;margin-bottom:4px;" data-text="religion-name"></div>
      <div style="opacity:0.85;" data-text="religion-status"></div>
    </div>` : '';

  // Pre-compute all data to avoid iterating twice
  const civRows: CivRowData[] = [];
  let civIdx = 0;
  for (const [civId, civ] of Object.entries(state.civilizations)) {
    if (civId === state.currentPlayer) continue;
    if (civ.isEliminated) continue;
    if (!shouldListMajorCivForViewer(state, state.currentPlayer, civId)) continue;

    const civDef = resolveCivDefinition(state, civ.civType ?? '');
    const relationship = getRelationship(playerDiplomacy, civId);
    const atWar = isAtWar(playerDiplomacy, civId);
    const pendingPeaceRequest = getPendingPeaceRequestForPair(state, state.currentPlayer, civId);
    const peaceRequestState = !pendingPeaceRequest ? 'none'
      : pendingPeaceRequest.toCivId === state.currentPlayer ? 'incoming'
      : pendingPeaceRequest.fromCivId === state.currentPlayer ? 'outgoing'
      : 'none';
    const actions = getAvailableActions(
      playerDiplomacy, civId, playerCiv.techState.completed, state.era,
    );

    let barColor = '#888';
    if (relationship > 30) barColor = '#4a9b4a';
    else if (relationship > 0) barColor = '#8ab84a';
    else if (relationship > -30) barColor = '#d9d94a';
    else if (relationship > -60) barColor = '#d9944a';
    else barColor = '#d94a4a';

    let statusText = atWar ? '⚔️ At War'
      : relationship > 30 ? '😊 Friendly'
      : relationship > 0 ? '🤝 Neutral'
      : relationship > -30 ? '😐 Cautious'
      : '😠 Hostile';

    const rowActions = [...actions];
    if (civ.breakaway) {
      const turnsLeft = Math.max(0, civ.breakaway.establishesOnTurn - state.turn);
      statusText = civ.breakaway.status === 'secession'
        ? `Breakaway · ${turnsLeft} turns to establishment`
        : 'Established breakaway civ';

      if (
        civ.breakaway.originOwnerId === state.currentPlayer
        && canReabsorbBreakaway(state, state.currentPlayer, civId)
        && !rowActions.includes('reabsorb_breakaway')
      ) {
        rowActions.push('reabsorb_breakaway');
      }
    }

    const treaties = playerDiplomacy.treaties
      .filter(t => t.civB === civId || t.civA === civId)
      .map(t => ({ label: t.type.replace(/_/g, ' '), turns: t.turnsRemaining, type: t.type }));

    // #554: incoming treaty proposals FROM this civ TO the viewer only --
    // never surface the viewer's own outgoing proposals or third-party ones.
    const incomingTreatyProposals = getPendingTreatyProposalsFor(state, state.currentPlayer)
      .filter(request => request.fromCivId === civId)
      .map(request => ({ id: request.id, label: TREATY_LABELS[request.treatyType!] }));

    // #554: "at war since turn N -- reason" derived from the same
    // war_declared event + relationship-based reason the notification uses
    // (describeWarReason), so the two surfaces never disagree.
    let warSinceText: string | null = null;
    if (atWar) {
      const warEvent = [...playerDiplomacy.events]
        .filter(e => e.type === 'war_declared' && e.otherCiv === civId)
        .sort((a, b) => b.turn - a.turn)[0];
      warSinceText = warEvent
        ? `⚔ At war since turn ${warEvent.turn} — ${describeWarReason(relationship)}`
        : '⚔ At war';
    }

    // #554: don't offer the generic treaty action again while a proposal for
    // that exact type already sits pending between the viewer and this civ
    // (either direction) -- mirrors the existing request_peace suppression
    // just below. Without this, the player could instant-sign their own copy
    // via onAction while an unrelated incoming proposal of the same type is
    // still awaiting a decision, leaving a stale, already-fulfilled proposal
    // row behind.
    const pendingTreatyTypes = new Set(
      (state.pendingDiplomacyRequests ?? [])
        .filter(request => request.type === 'treaty'
          && ((request.fromCivId === state.currentPlayer && request.toCivId === civId)
            || (request.fromCivId === civId && request.toCivId === state.currentPlayer)))
        .map(request => request.treatyType),
    );

    // Send Aid (#526 MR6 Task 6.3) -- the crisis status line's anchor button. Only
    // outbreak/catastrophe/famine (#590 MR3) archetypes are send-aid hooks (hunt uses
    // hunt-their-foe instead), so a hunt-archetype crisis never gets a button at all rather than a
    // permanently-disabled one with a misleading "requires tech" message.
    const worldPressureLine = worldPressurePresentation.statusLinesByCivId[civId];
    let sendAidCrisisId: string | null = null;
    let sendAidLabel: string | null = null;
    let sendAidHelpText: string | null = null;
    let sendAidDisabled = false;
    let sendAidDisabledReason: string | null = null;
    if (worldPressureLine && worldPressureLine.archetype !== 'hunt') {
      sendAidCrisisId = worldPressureLine.crisisId;
      const check = canSendAid(state, state.currentPlayer, worldPressureLine.crisisId);
      const goldCost = check.goldCost ?? null;
      sendAidLabel = goldCost !== null ? `Send Aid (${goldCost} Gold)` : 'Send Aid';
      sendAidDisabled = !check.ok;
      if (!check.ok && check.reason === 'already-aided') {
        sendAidHelpText = `You already sent aid to help ${civ.name} with this crisis.`;
      } else {
        // Outbreak and famine (#590 MR3) both resolve via the same remedyCompletionByCity
        // timer (see applySendAid) -- only catastrophe credits the target civ raw relief
        // gold. Never fall through to the catastrophe wording for famine; it would tell
        // the player the target "receives it as relief" when no gold is actually credited.
        sendAidHelpText = worldPressureLine.archetype === 'catastrophe'
          ? `Pay ${goldCost ?? '?'} gold — ${civ.name} receives it as relief. ${civ.name} and onlookers will remember this.`
          : `Pay ${goldCost ?? '?'} gold — ${civ.name}'s crisis is cured in 2 turns. ${civ.name} and onlookers will remember this.`;
      }
      sendAidDisabledReason = check.ok ? null : describeSendAidDisabledReason(check.reason, goldCost, check.techId ?? null);
    }

    civRows.push({
      civId,
      civIdx,
      name: civ.name,
      color: civ.color,
      bonusName: civDef?.bonusName ?? '',
      relationship,
      barWidth: Math.max(2, (relationship + 100) / 2),
      barColor,
      statusText,
      treaties,
      actions: rowActions
        .filter(action => !(action === 'request_peace' && peaceRequestState !== 'none'))
        .filter(action => !pendingTreatyTypes.has(action as TreatyType))
        .map(action => ({ action, isHostile: action === 'declare_war' })),
      peaceRequestState,
      peaceRequestId: pendingPeaceRequest?.id ?? null,
      incomingTreatyProposals,
      atWar,
      warSinceText,
      worldPressureStatusText: worldPressureLine?.text ?? null,
      worldPressureDetailText: worldPressureLine?.detail ?? null,
      sendAidCrisisId,
      sendAidLabel,
      sendAidHelpText,
      sendAidDisabled,
      sendAidDisabledReason,
    });
    civIdx++;
  }

  // Minor civs data
  const mcEntries = Object.entries(state.minorCivs ?? {}).filter(([, mc]) => !mc.isDestroyed);
  const minorCivRows: MinorCivRowData[] = [];
  mcEntries.forEach(([mcId, mc], mcIdx) => {
    if (!hasDiscoveredMinorCiv(state, state.currentPlayer, mcId)) return;
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
    if (!def) return;
    const presentation = getMinorCivPresentationForPlayer(state, state.currentPlayer, mcId, 'City-State');
    const rel = mc.diplomacy.relationships[state.currentPlayer] ?? 0;
    const status = getMinorCivRelationshipStatus(state, state.currentPlayer, mcId);
    const archIcon = def.archetype === 'militaristic' ? '⚔️' : def.archetype === 'mercantile' ? '🪙' : '📜';
    const quest = mc.activeQuests[state.currentPlayer];
    const questPresentation = getMinorCivQuestPresentationForPlayer(state, state.currentPlayer, mcId);
    const chainPresentation = getMinorCivChainPresentationForPlayer(state, state.currentPlayer, mcId);
    const questDescription = questPresentation
      ? [
        questPresentation.chainName,
        questPresentation.stepLabel,
        questPresentation.stepTitle,
        questPresentation.description,
        questPresentation.progressLabel,
        questPresentation.turnsRemaining === undefined ? null : `${questPresentation.turnsRemaining} turns remaining`,
        `Reward: ${formatQuestReward(questPresentation.currentReward)}`,
        questPresentation.finalAllianceLabel,
      ].filter(Boolean).join(' · ')
      : chainPresentation ? `${chainPresentation.label} · ${chainPresentation.detail}` : null;
    const statusColor = status === 'allied' ? '#4a9b4a' : status === 'friendly' ? '#8ab84a' : status === 'hostile' || status === 'at-war' ? '#d94a4a' : '#888';
    const atWar = isMinorCivAtWar(state, state.currentPlayer, mcId);
    const festivalTarget = quest?.target.type === 'sponsor_festival' ? quest.target : null;
    const festivalDisabledReason = !festivalTarget ? null
      : !hasAccessibleLuxury(state, state.currentPlayer) ? 'Requires access to any luxury resource.'
      : playerCiv.gold < festivalTarget.amount ? `Requires ${festivalTarget.amount} gold.`
      : null;
    const grievance = mc.regionalGrievanceByCiv?.[state.currentPlayer];
    const reparationsCost = minorCivReparationsCost(state);
    const grievanceStatusLabel = grievance?.status
      .split('-')
      .map(part => part[0].toUpperCase() + part.slice(1))
      .join(' ');
    const economyPresentation = getMinorCivEconomyPresentationForPlayer(state, state.currentPlayer, mcId);
    const postureSuffix = economyPresentation.postureLabel && economyPresentation.postureLabel !== grievanceStatusLabel
      ? ` · ${economyPresentation.postureLabel}`
      : '';
    const regionalGrievanceText = grievance && grievanceStatusLabel
      ? `Regional grievance: ${grievanceStatusLabel}${postureSuffix}`
      : economyPresentation.postureLabel ? `City-state posture: ${economyPresentation.postureLabel}` : null;
    const canOfferReparations = Boolean(grievance && grievance.pressure >= 20);
    const reparationsDisabledReason = !canOfferReparations ? null
      : atWar ? 'Unavailable while at war.'
      : playerCiv.gold < reparationsCost ? `Requires ${reparationsCost} gold.`
      : null;

    minorCivRows.push({
      mcId,
      mcIdx,
      defName: presentation.name,
      defColor: presentation.color,
      archIcon,
      statusColor,
      statusText: `${status === 'at-war' ? 'At War' : status[0].toUpperCase() + status.slice(1)} (${rel})`,
      questDescription,
      giftLabel: quest?.target.type === 'gift_gold' ? `Gift ${quest.target.amount} Gold` : 'Gift 25 Gold',
      festivalLabel: festivalTarget
        ? `Sponsor ${questPresentation?.stepTitle ?? 'Festival'} (${festivalTarget.amount} Gold)`
        : null,
      festivalDisabledReason,
      regionalGrievanceText,
      economyHintText: economyPresentation.hint,
      reparationsLabel: canOfferReparations ? `Pay Reparations (${reparationsCost} Gold)` : null,
      reparationsDisabledReason,
      atWar,
    });
  });

  // Build structural HTML with only hardcoded strings and data-text placeholders
  let civRowsHtml = '';
  for (const row of civRows) {
    let treatiesHtml = '';
    if (row.treaties.length > 0) {
      treatiesHtml = '<div style="margin-bottom:8px;display:flex;flex-wrap:wrap;gap:4px;">';
      row.treaties.forEach((t, tIdx) => {
        const turnsPlaceholder = t.turns > 0
          ? ` (<span data-text="treaty-turns-${row.civIdx}-${tIdx}"></span> turns)`
          : '';
        treatiesHtml += `
          <span style="display:inline-flex;align-items:center;gap:4px;background:rgba(232,193,112,0.2);border-radius:4px;padding:2px 4px 2px 8px;font-size:10px;">
            <span><span data-text="treaty-label-${row.civIdx}-${tIdx}"></span>${turnsPlaceholder}</span>
            <button class="diplo-break-treaty" data-civ-id="${row.civId}" data-treaty-type="${t.type}" style="padding:2px 6px;background:rgba(217,74,74,0.25);border:1px solid #d94a4a;border-radius:4px;color:white;cursor:pointer;font-size:9px;">Break</button>
          </span>`;
      });
      treatiesHtml += '</div>';
    }

    let treatyProposalsHtml = '';
    row.incomingTreatyProposals.forEach((proposal, pIdx) => {
      treatyProposalsHtml += `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;background:rgba(232,193,112,0.12);border-radius:6px;padding:6px 8px;">
          <span style="font-size:11px;flex:1;">Proposes: <strong data-text="treaty-proposal-label-${row.civIdx}-${pIdx}"></strong></span>
          <button class="diplo-accept-treaty" data-request-id="${proposal.id}" data-action="accept-treaty-proposal" style="padding:5px 10px;background:rgba(74,155,74,0.3);border:1px solid #4a9b4a;border-radius:6px;color:white;cursor:pointer;font-size:11px;">Accept</button>
          <button class="diplo-decline-treaty" data-request-id="${proposal.id}" data-action="decline-treaty-proposal" style="padding:5px 10px;background:rgba(217,148,74,0.25);border:1px solid #d9944a;border-radius:6px;color:white;cursor:pointer;font-size:11px;">Decline</button>
        </div>`;
    });

    const warSinceHtml = row.warSinceText
      ? `<div style="font-size:11px;color:#d94a4a;margin-bottom:8px;" data-text="war-since-${row.civIdx}"></div>`
      : '';

    const worldPressureHtml = row.worldPressureStatusText
      ? `<div style="font-size:11px;color:#e88;margin-bottom:8px;" data-text="world-pressure-${row.civIdx}"></div>`
      : '';

    // #526 MR7 Task 7.1: exploit_weakness intel detail line, immediately below the base
    // status line -- only present at all when the viewer has diplomatic-networks.
    const worldPressureDetailHtml = row.worldPressureDetailText
      ? `<div style="font-size:10px;opacity:0.75;margin-bottom:8px;" data-text="world-pressure-detail-${row.civIdx}"></div>`
      : '';

    const sendAidHtml = row.sendAidCrisisId
      ? `<div style="margin-bottom:8px;">
          <div style="font-size:10px;opacity:0.75;margin-bottom:4px;" data-text="send-aid-help-${row.civIdx}"></div>
          <div data-role="send-aid-${row.civIdx}"></div>
        </div>`
      : '';

    let actionsHtml = '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    if (row.peaceRequestState === 'incoming' && row.peaceRequestId) {
      actionsHtml += `<button class="diplo-accept-peace" data-request-id="${row.peaceRequestId}" data-action="accept-peace-request" style="padding:6px 12px;background:rgba(74,155,74,0.3);border:1px solid #4a9b4a;border-radius:6px;color:white;cursor:pointer;font-size:11px;">Accept Peace</button>`;
      actionsHtml += `<button class="diplo-reject-peace" data-request-id="${row.peaceRequestId}" data-action="reject-peace-request" style="padding:6px 12px;background:rgba(217,148,74,0.25);border:1px solid #d9944a;border-radius:6px;color:white;cursor:pointer;font-size:11px;">Reject Peace</button>`;
    } else if (row.peaceRequestState === 'outgoing') {
      actionsHtml += '<span data-role="peace-requested-pill" style="display:inline-block;padding:6px 12px;background:rgba(232,193,112,0.2);border:1px solid rgba(232,193,112,0.5);border-radius:6px;color:#e8c170;font-size:11px;">Peace Requested</span>';
    }
    row.actions.forEach((a, aIdx) => {
      const btnColor = a.isHostile ? 'rgba(217,74,74,0.3)' : 'rgba(255,255,255,0.1)';
      const borderColor = a.isHostile ? '#d94a4a' : 'rgba(255,255,255,0.2)';
      actionsHtml += `<button class="diplo-action" data-civ-id="${row.civId}" data-action="${a.action}" style="padding:6px 12px;background:${btnColor};border:1px solid ${borderColor};border-radius:6px;color:white;cursor:pointer;font-size:11px;text-transform:capitalize;" data-text="action-label-${row.civIdx}-${aIdx}"></button>`;
    });
    actionsHtml += '</div>';

    civRowsHtml += `
      <div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:24px;height:24px;border-radius:50%;background:${row.color};"></div>
          <div>
            <div style="font-weight:bold;font-size:14px;" data-text="civ-name-${row.civIdx}"></div>
            <div style="font-size:11px;opacity:0.6;"><span data-text="civ-bonus-${row.civIdx}"></span> · <span data-text="civ-status-${row.civIdx}"></span></div>
            ${warSinceHtml}
            ${worldPressureHtml}
            ${worldPressureDetailHtml}
            ${treatyProposalsHtml}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="font-size:11px;opacity:0.5;min-width:30px;" data-text="civ-rel-${row.civIdx}"></span>
          <div style="flex:1;background:rgba(0,0,0,0.3);border-radius:4px;height:8px;">
            <div style="background:${row.barColor};border-radius:4px;height:8px;width:${row.barWidth}%;"></div>
          </div>
        </div>
        ${sendAidHtml}
        ${treatiesHtml}
        ${actionsHtml}
      </div>
    `;
  }

  let minorCivsHtml = '';
  if (minorCivRows.length > 0) {
    minorCivsHtml = `<h3 style="font-size:15px;color:#e8c170;margin:20px 0 10px;">City-States</h3>`;
    for (const row of minorCivRows) {
      minorCivsHtml += `<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;margin-bottom:8px;">`;
      minorCivsHtml += `<div style="display:flex;justify-content:space-between;align-items:center;">`;
      minorCivsHtml += `<span style="font-size:13px;">${row.archIcon} <strong style="color:${row.defColor};" data-text="mc-name-${row.mcIdx}"></strong></span>`;
      minorCivsHtml += `<span style="font-size:12px;color:${row.statusColor};" data-text="mc-status-${row.mcIdx}"></span>`;
      minorCivsHtml += `</div>`;
      if (row.questDescription !== null) {
        minorCivsHtml += `<div style="font-size:11px;opacity:0.7;margin-top:4px;">Quest: <span data-text="mc-quest-${row.mcIdx}"></span></div>`;
      }
      if (row.regionalGrievanceText !== null) {
        minorCivsHtml += `<div style="font-size:11px;color:#e8c170;margin-top:4px;" data-text="mc-grievance-${row.mcIdx}"></div>`;
      }
      if (row.economyHintText !== null) {
        minorCivsHtml += `<div style="font-size:11px;opacity:0.65;margin-top:4px;" data-text="mc-economy-hint-${row.mcIdx}"></div>`;
      }
      if (row.festivalDisabledReason) {
        minorCivsHtml += `<div style="font-size:10px;color:#e8c170;margin-top:5px;" data-text="mc-festival-reason-${row.mcIdx}"></div>`;
      }
      if (row.reparationsDisabledReason) {
        minorCivsHtml += `<div style="font-size:10px;color:#e8c170;margin-top:5px;" data-text="mc-reparations-reason-${row.mcIdx}"></div>`;
      }
      minorCivsHtml += `<div data-role="mc-actions-${row.mcIdx}" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;"></div>`;
      minorCivsHtml += `</div>`;
    }
  }

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="font-size:18px;color:#e8c170;margin:0;">Diplomacy</h2>
      <span id="diplo-close" style="cursor:pointer;font-size:24px;opacity:0.6;">✕</span>
    </div>
    ${religionSummaryHtml}
    ${civRowsHtml}
    ${minorCivsHtml}
  `;

  panel.innerHTML = html;

  // Inject all dynamic text via textContent (XSS-safe)
  const setText = (sel: string, text: string) => {
    const el = panel.querySelector(`[data-text="${sel}"]`);
    if (el) el.textContent = text;
  };

  if (religionSummary) {
    setText('religion-name', religionSummary.nameLine);
    setText('religion-status', religionSummary.statusLine);
  }

  for (const row of civRows) {
    setText(`civ-name-${row.civIdx}`, row.name);
    setText(`civ-bonus-${row.civIdx}`, row.bonusName);
    setText(`civ-status-${row.civIdx}`, row.statusText);
    setText(`civ-rel-${row.civIdx}`, String(row.relationship));
    row.treaties.forEach((t, tIdx) => {
      setText(`treaty-label-${row.civIdx}-${tIdx}`, t.label);
      if (t.turns > 0) {
        setText(`treaty-turns-${row.civIdx}-${tIdx}`, String(t.turns));
      }
    });
    row.actions.forEach((a, aIdx) => {
      setText(`action-label-${row.civIdx}-${aIdx}`, a.action.replace(/_/g, ' '));
    });
    if (row.warSinceText) {
      setText(`war-since-${row.civIdx}`, row.warSinceText);
    }
    if (row.worldPressureStatusText) {
      setText(`world-pressure-${row.civIdx}`, row.worldPressureStatusText);
    }
    if (row.worldPressureDetailText) {
      setText(`world-pressure-detail-${row.civIdx}`, row.worldPressureDetailText);
    }
    if (row.sendAidCrisisId) {
      setText(`send-aid-help-${row.civIdx}`, row.sendAidHelpText ?? '');
      const slot = panel.querySelector<HTMLElement>(`[data-role="send-aid-${row.civIdx}"]`);
      if (slot) {
        const button = createGameButton(row.sendAidLabel ?? 'Send Aid', 'secondary', { disabled: row.sendAidDisabled });
        button.className = 'diplo-send-aid';
        button.dataset.crisisId = row.sendAidCrisisId;
        if (row.sendAidDisabledReason) button.title = row.sendAidDisabledReason;
        slot.appendChild(button);
      }
    }
    row.incomingTreatyProposals.forEach((proposal, pIdx) => {
      setText(`treaty-proposal-label-${row.civIdx}-${pIdx}`, proposal.label);
    });
  }

  for (const row of minorCivRows) {
    setText(`mc-name-${row.mcIdx}`, row.defName);
    setText(`mc-status-${row.mcIdx}`, row.statusText);
    if (row.questDescription !== null) {
      setText(`mc-quest-${row.mcIdx}`, row.questDescription);
    }
    if (row.regionalGrievanceText !== null) {
      setText(`mc-grievance-${row.mcIdx}`, row.regionalGrievanceText);
    }
    if (row.economyHintText !== null) {
      setText(`mc-economy-hint-${row.mcIdx}`, row.economyHintText);
    }
    if (row.festivalDisabledReason) setText(`mc-festival-reason-${row.mcIdx}`, row.festivalDisabledReason);
    if (row.reparationsDisabledReason) setText(`mc-reparations-reason-${row.mcIdx}`, row.reparationsDisabledReason);
    const actions = panel.querySelector<HTMLElement>(`[data-role="mc-actions-${row.mcIdx}"]`);
    if (actions) {
      const gift = createGameButton(row.giftLabel, 'secondary', { disabled: row.atWar });
      gift.className = 'mc-gift';
      gift.dataset.mcId = row.mcId;
      actions.appendChild(gift);
      if (row.festivalLabel) {
        const festival = createGameButton(row.festivalLabel, 'primary', { disabled: row.atWar || Boolean(row.festivalDisabledReason) });
        festival.className = 'mc-festival';
        festival.dataset.mcId = row.mcId;
        festival.dataset.action = 'sponsor-festival';
        actions.appendChild(festival);
      }
      if (row.reparationsLabel) {
        const reparations = createGameButton(row.reparationsLabel, 'secondary', { disabled: Boolean(row.reparationsDisabledReason) });
        reparations.className = 'mc-reparations';
        reparations.dataset.mcId = row.mcId;
        reparations.dataset.action = 'pay-reparations';
        actions.appendChild(reparations);
      }
      const war = createGameButton(row.atWar ? 'Make Peace' : 'Declare War', row.atWar ? 'secondary' : 'danger');
      war.className = 'mc-war';
      war.dataset.mcId = row.mcId;
      war.dataset.atWar = String(row.atWar);
      actions.appendChild(war);
    }
  }

  container.appendChild(panel);

  panel.querySelector('#diplo-close')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onClose();
  });

  panel.querySelectorAll('.diplo-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const civId = (btn as HTMLElement).dataset.civId!;
      const action = (btn as HTMLElement).dataset.action! as DiplomaticAction;
      panel.remove();
      callbacks.onAction(civId, action);
    });
  });

  panel.querySelectorAll('.diplo-accept-peace').forEach(btn => {
    btn.addEventListener('click', () => {
      const requestId = (btn as HTMLElement).dataset.requestId!;
      panel.remove();
      callbacks.onAcceptPeaceRequest?.(requestId);
    });
  });

  panel.querySelectorAll('.diplo-reject-peace').forEach(btn => {
    btn.addEventListener('click', () => {
      const requestId = (btn as HTMLElement).dataset.requestId!;
      panel.remove();
      callbacks.onRejectPeaceRequest?.(requestId);
    });
  });

  panel.querySelectorAll('.diplo-accept-treaty').forEach(btn => {
    btn.addEventListener('click', () => {
      const requestId = (btn as HTMLElement).dataset.requestId!;
      panel.remove();
      callbacks.onAcceptTreatyProposal?.(requestId);
    });
  });

  panel.querySelectorAll('.diplo-decline-treaty').forEach(btn => {
    btn.addEventListener('click', () => {
      const requestId = (btn as HTMLElement).dataset.requestId!;
      panel.remove();
      callbacks.onDeclineTreatyProposal?.(requestId);
    });
  });

  // Two-click in-panel confirm (no window.confirm on mobile, #554): the first
  // click arms the button; a second click within 3s actually breaks it.
  panel.querySelectorAll('.diplo-break-treaty').forEach(btn => {
    const button = btn as HTMLButtonElement;
    let armed = false;
    let disarmTimer: ReturnType<typeof setTimeout> | null = null;
    button.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        button.textContent = 'Confirm?';
        disarmTimer = setTimeout(() => {
          armed = false;
          button.textContent = 'Break';
        }, 3000);
        return;
      }
      if (disarmTimer) clearTimeout(disarmTimer);
      const civId = button.dataset.civId!;
      const treatyType = button.dataset.treatyType! as TreatyType;
      panel.remove();
      callbacks.onBreakTreaty?.(civId, treatyType);
    });
  });

  panel.querySelectorAll('.diplo-send-aid').forEach(btn => {
    btn.addEventListener('click', () => {
      const crisisId = (btn as HTMLElement).dataset.crisisId!;
      callbacks.onSendAid?.(crisisId);
      panel.remove();
    });
  });

  panel.querySelectorAll('.mc-gift').forEach(btn => {
    btn.addEventListener('click', () => {
      const mcId = (btn as HTMLElement).dataset.mcId!;
      callbacks.onGiftGold?.(mcId);
      panel.remove();
    });
  });

  panel.querySelectorAll('.mc-war').forEach(btn => {
    btn.addEventListener('click', () => {
      const mcId = (btn as HTMLElement).dataset.mcId!;
      const atWar = (btn as HTMLElement).dataset.atWar === 'true';
      callbacks.onMinorCivWarPeace?.(mcId, atWar);
      panel.remove();
    });
  });

  panel.querySelectorAll('.mc-festival').forEach(btn => {
    btn.addEventListener('click', () => {
      const mcId = (btn as HTMLElement).dataset.mcId!;
      callbacks.onSponsorFestival?.(mcId);
      panel.remove();
    });
  });

  panel.querySelectorAll('.mc-reparations').forEach(btn => {
    btn.addEventListener('click', () => {
      const button = btn as HTMLButtonElement;
      if (button.disabled) return;
      button.disabled = true;
      const mcId = button.dataset.mcId!;
      panel.remove();
      callbacks.onMinorCivReparations?.(mcId);
    });
  });

  return panel;
}
