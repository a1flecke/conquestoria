import type { BuildableImprovementType, GameState, DisguiseType, HexCoord, Unit, WorkerActionType } from '@/core/types';
import { UNIT_DEFINITIONS, UNIT_DESCRIPTIONS, canHeal } from '@/systems/unit-system';
import { resolveSuperweaponContentDescription } from '@/systems/superweapon-content-honesty';
import { isSuperweaponsEnabled } from '@/systems/superweapons-flag';
import { resolveGeneralDefinition } from '@/systems/great-general-definitions';
import { getGeneralProfile } from '@/systems/great-general-profiles';
import { getGeneralSpecialtyPresentation, resolveGeneralMechanics } from '@/systems/great-general-specialties';
import { getHeroicCommandEligibility } from '@/systems/great-general-abilities';
import { getEffectiveCommandStats } from '@/systems/great-general-system';
import { createGameButton } from '@/ui/ui-kit';
import { unitParticipatesInLandSupply } from '@/systems/supply-participation';
import { getPrimarySupplySource } from '@/systems/supply-sources';
import { getTurnsUntilNextSupplyStage } from '@/systems/supply-progression';
import { getParadropLaunchState, PARADROP_FAILURE_MESSAGES, getAirAssaultLaunchState, AIR_ASSAULT_FAILURE_MESSAGES } from '@/systems/airborne-system';
import { getSubmarineRevealState } from '@/systems/concealment';
import { getExperienceToNextTier, getVeterancyCombatModifier, getVeterancyTier } from '@/systems/combat-reward-system';
import { isSpyUnitType } from '@/systems/espionage-system';
import { getStrategicArsenal } from '@/systems/strategic-arsenal-system';
import { evaluateUnitUpgrade, type UpgradeMissingRequirement } from '@/systems/unit-upgrade-system';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import {
  formatImprovementYieldLabel,
  formatWorkerActionBlockerReason,
  type ImprovementWorkerActionType,
  getAvailableWorkerActions,
  getImprovementDisplayName,
  getKnownTileResourceForWorkerAction,
  getWorkerActionBlockerReason,
  getWorkerActionLabel,
  getWorkerBlockerHints,
  type WorkerActionBlockerReason,
  type WorkerActionEligibilityOptions,
} from '@/systems/improvement-system';
import { DEFAULT_WORKER_CHARGES, getWorkerChargesRemaining } from '@/systems/worker-action-system';
import { getRoadBlockerReason, formatRoadBlockerReason } from '@/systems/road-system';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import { canFoundCityAt, formatCityFoundingBlockerMessage, getCityFoundingBlockers } from '@/systems/city-territory-system';
import { resolveFromCity } from '@/systems/trade-system';
import { hasAITradeRole } from '@/ai/ai-unit-roles';
import { canEstablishOutpost, getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { getTransportCargo, getTransportCapacity, getTransportCargoUsed } from '@/systems/transport-system';
import { calculateCivUnitMaintenance } from '@/systems/economy-system';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import {
  getLandUnitWaterRecoveryPanelMessage,
  type LandUnitWaterRecovery,
} from '@/systems/unit-water-recovery';
import { isAutonomyActivated } from '@/systems/network-plan-system';
import { isAtWar } from '@/systems/diplomacy-system';
import type { PropagandistAction } from '@/systems/propagandist-system';
import { canPreachTarget } from '@/systems/religion-system';
import { getAirBaseCapacity, getAirBaseRoster } from '@/systems/air-operations-system';
import type { AirBaseRef } from '@/core/types';
import { canPillageTile } from '@/systems/pillage-system';
import { getUnitRolePresentation } from '@/ui/unit-role-presentation';
import { getFortificationCapacity, getFortificationPlacement, getFortificationTier } from '@/systems/fortification-system';
import { isCrisisForceOwner } from '@/core/owner-kind';
import { CRISIS_FORCE_PRESENTATION } from '@/systems/crisis-force-system';
import { getHerdRoutePresentationForViewer } from '@/systems/stampede-route-system';
import { getRogueElephantCommandFact } from '@/systems/rogue-elephant-host-system';

export interface TransportLoadOption {
  transportId: string;
  label: string;
  disabled?: boolean;
  tooltip?: string;
}

export interface TransportUnloadOption {
  cargoUnitId: string;
  destination: HexCoord;
  label: string;
}

/** One entry in the cargo manifest shown in Stage 1 of the unload UX. */
export interface CargoBoardItem {
  cargoUnitId: string;
  /** Display name of the cargo unit. */
  label: string;
  /** Number of cargo slots this unit occupies. */
  slotCost: number;
  /** Whether this unit can be unloaded this turn. */
  canUnload: boolean;
}

export interface SelectedUnitInfoCallbacks {
  onClose?: () => void;
  /** #544 MR2: reopens the first-time supply tutorial message on demand. */
  onReopenSupplyTutorial?: () => void;
  /** #544 MR4: opens the Rally auto-preview/confirm panel. */
  onOpenRally?: (generalUnitId: string) => void;
  /** #544 MR4: opens the Seize the Moment eligible-unit picker. */
  onOpenSeize?: (generalUnitId: string) => void;
  /** #544 MR4: begins Last Stand's hex-targeting mode. */
  onStartLastStandTargeting?: (generalUnitId: string) => void;
  /** #544 MR4: reopens the first-time General command tutorial on demand. */
  onReopenGeneralTutorial?: () => void;
  onFoundCity?: () => void;
  onWorkerAction?: (action: WorkerActionType) => void;
  onPreach?: (unitId: string, cityId: string) => void;
  onRest?: () => void;
  onSkipTurn?: (unitId: string) => void;
  onDeleteUnit?: (unitId: string) => void;
  onFortify?: (unitId: string) => void;
  onPillage?: (unitId: string) => void;
  /** #545 MR4 §14 stage 1: opens the strategic-launch flow for this Missile Submarine. */
  onPrepareStrategicLaunch?: (unitId: string) => void;
  onStartAutoExplore?: (unitId: string) => void;
  onCancelAutoExplore?: () => void;
  onCancelJourney?: () => void;
  onSetDisguise?: (unitId: string, disguise: DisguiseType | null) => void;
  onInfiltrate?: (unitId: string) => void;
  onEmbed?: (unitId: string) => void;
  onUpgradeUnit?: (unitId: string, cityId: string) => void;
  onOpenStack?: (coord: HexCoord) => void;
  onEstablishRoute?: (caravanId: string) => void;
  onEstablishOutpost?: (unitId: string) => void;
  onReplaceImprovement?: (action: BuildableImprovementType) => void;
  getTransportOptions?: (unitId: string) => TransportLoadOption[];
  /** @deprecated Use getCargoBoardInfo + onSelectCargoToUnload instead. */
  getUnloadOptions?: (transportId: string) => TransportUnloadOption[];
  onLoadTransport?: (unitId: string, transportId: string) => void;
  onUnloadTransport?: (transportId: string, cargoUnitId: string, destination: HexCoord) => void;
  /** Returns the cargo manifest for a transport unit (Stage 1 unload UX). */
  getCargoBoardInfo?: (transportId: string) => CargoBoardItem[];
  /** Called when the player clicks Unload for a specific cargo unit (enters Stage 2). */
  onSelectCargoToUnload?: (transportId: string, cargoUnitId: string) => void;
  /** Called when the player cancels an in-progress unload (Stage 2 → deselect). */
  onCancelUnload?: () => void;
  /**
   * When set, the panel renders Stage 2: an instruction banner with the named
   * unit and a Cancel button, instead of the normal cargo list.
   */
  pendingUnloadUnitName?: string;
  getPirateAssaultAction?: (unitId: string) => { factionId: string; label: string } | null;
  onOpenPirateAssault?: (factionId: string, unitId: string) => void;
  /** Opens the persistent-network intent surface for an activated Cyber Unit. */
  onOpenNetworkIntent?: (unitId: string) => void;
  onUsePropagandistAction?: (unitId: string, action: PropagandistAction, cityId: string) => void;
  onStartIntercept?: (unitId: string) => void;
  getAirRebaseDestinations?: (unitId: string) => Array<{ base: AirBaseRef; label: string }>;
  onRebaseAircraft?: (unitId: string, base: AirBaseRef) => void;
  onStartAirMission?: (unitId: string, mission: 'strike' | 'recon' | 'patrol') => void;
  onCancelAirMission?: (unitId: string) => void;
  onStartParadrop?: (unitId: string) => void;
  onCancelParadrop?: (unitId: string) => void;
  onStartAirAssault?: (unitId: string) => void;
  onCancelAirAssault?: (unitId: string) => void;
}

export interface SelectedUnitInfoPresentation {
  waterRecovery?: LandUnitWaterRecovery;
  hasZoneOfControlWarning?: boolean;
  airMissionPending?: 'strike' | 'recon' | 'patrol';
  paradropPending?: boolean;
  airAssaultPending?: boolean;
}

function makeButton(label: string, color: string, onClick?: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = `padding:8px 16px;min-height:44px;border-radius:8px;background:${color};border:none;color:white;cursor:pointer;`;
  if (onClick) {
    button.addEventListener('click', onClick);
  }
  return button;
}

/** True for all 5 naval transport unit types. */
function isNavalTransport(unitType: string): boolean {
  return ['transport', 'carrack', 'galleon', 'steamship', 'troop_transport'].includes(unitType);
}

/** First city on/adjacent to `unit` that canPreachTarget() accepts, or null. Deterministic
 * (sorted city id order) so the offered target never varies between renders. */
function findEligiblePreachTargetCityId(state: GameState, unit: Unit): string | null {
  const candidateIds = Object.keys(state.cities).sort();
  for (const cityId of candidateIds) {
    if (canPreachTarget(state, unit, cityId)) return cityId;
  }
  return null;
}

/**
 * Truthful lines for the unit's #544 land-supply status. Vocabulary matches
 * contract §12 exactly (`Full Supply — Memphis`, `Stable but Unsupported —
 * no healing`, `Overextended — Stage 2 of 3`) so MR2's fuller overlay/
 * tutorial can reuse the same wording without introducing a second,
 * inconsistent set of labels. Returns `null` when the unit doesn't
 * participate in land supply at all (naval/air/beast/etc.) — no line is
 * rendered in that case. MR2 (#544 Task 2) extends the single MR1 status
 * line with a turns-until-next-stage countdown and recovery guidance; an
 * array of lines (rather than one concatenated string) matches this panel's
 * existing convention of one fact per `<div>`.
 *
 * Only ever computed for the viewer's own units — the same
 * `unit.owner === state.currentPlayer` gate this file already uses for
 * `rolePresentation` below. `getPrimarySupplySource` names a specific
 * City/Fort, which could otherwise leak an enemy's undiscovered
 * infrastructure to the viewer when inspecting a foreign unit; contract §26
 * is explicit that "supply overlay never leaks enemy coverage," and this
 * per-unit status block is architecturally a miniature overlay for one unit.
 */
function getLandSupplyStatusLines(state: GameState, unit: Unit): string[] | null {
  if (unit.owner !== state.currentPlayer) return null;
  if (!unitParticipatesInLandSupply(unit)) return null;
  const status = unit.landSupply;
  if (status === undefined || status.state === 'full') {
    const source = getPrimarySupplySource(state, unit.owner, unit.position);
    const sourceLabel = source
      ? (source.kind === 'city' ? state.cities[source.id]?.name ?? 'a city' : 'a Fort')
      : 'territory';
    return [`Full Supply — ${sourceLabel}`];
  }

  const lines: string[] = [];
  if (status.state === 'stable-unsupported') lines.push('Stable but Unsupported — no healing');
  else if (status.state === 'grace') lines.push('Overextended — Stage 1 of 3');
  else if (status.state === 'degraded') lines.push('Overextended — Stage 2 of 3 · -10% Combat');
  else lines.push('Overextended — Stage 3 of 3 · -10% Combat, -1 Movement');

  const turnsUntilNext = getTurnsUntilNextSupplyStage(status);
  if (turnsUntilNext !== null) {
    const nextPenalty = status.state === 'grace' ? '-10% Combat' : '-1 Movement';
    lines.push(`${nextPenalty} in ${turnsUntilNext} turn${turnsUntilNext === 1 ? '' : 's'}`);
  }

  const recoverySource = getPrimarySupplySource(state, unit.owner, unit.position);
  lines.push(recoverySource
    ? `Move toward ${recoverySource.kind === 'city' ? state.cities[recoverySource.id]?.name ?? 'your city' : 'your Fort'} to recover`
    : 'No supply source in range — retreat toward friendly territory');
  return lines;
}

function nextTierLabel(currentLabel: string): string | null {
  if (currentLabel === 'Recruit') return 'Seasoned';
  if (currentLabel === 'Seasoned') return 'Veteran';
  if (currentLabel === 'Veteran') return 'Elite';
  return null;
}

const WORKER_ACTIONS: ImprovementWorkerActionType[] = [
  'farm', 'mine', 'lumber_camp', 'watermill',
  'plantation', 'pasture', 'camp', 'quarry',
  'oil_well',
  'drain_swamp',
];

function chooseWorkerBlockerReason(
  tile: GameState['map']['tiles'][string] | undefined,
  completedTechs: string[],
  ownerId: string,
  options: WorkerActionEligibilityOptions,
): WorkerActionBlockerReason {
  let fallback: WorkerActionBlockerReason = 'invalid-terrain';
  for (const action of WORKER_ACTIONS) {
    const reason = getWorkerActionBlockerReason(tile, action, completedTechs, ownerId, options);
    if (reason === 'none') return 'none';
    if (reason !== 'invalid-terrain' && reason !== 'requires-tech') return reason;
    fallback = reason;
  }
  return fallback;
}

// A Hunt crisis's foe is a real, named world entity ("any civilization may fight it") —
// surface its name whenever the player selects the actual beast/ship unit. Camps have no
// equivalent selectable-unit tap target (consistent with barbarian camps generally having
// no inspection panel today), so bandit-uprising hunts aren't covered here.
function findHuntFoeNameForUnit(state: GameState, unitId: string): string | undefined {
  for (const crisis of Object.values(state.activeCrises ?? {})) {
    if (crisis.archetype !== 'hunt' || !crisis.huntEntityId || !crisis.foeName) continue;
    if (crisis.huntEntityId === unitId) return crisis.foeName;
    const fleet = state.pirateFleets?.[crisis.huntEntityId];
    if (fleet?.unitId === unitId) return crisis.foeName;
  }
  return undefined;
}

export function renderSelectedUnitInfo(
  container: HTMLElement,
  state: GameState,
  unitId: string,
  callbacks: SelectedUnitInfoCallbacks,
  presentation: SelectedUnitInfoPresentation = {},
): void {
  const unit = state.units[unitId];
  if (!unit) {
    container.style.display = 'none';
    container.replaceChildren();
    return;
  }

  const def = UNIT_DEFINITIONS[unit.type];
  const isBeast = unit.owner === 'beasts';
  const isCrisisForce = isCrisisForceOwner(unit.owner);
  // Beasts have no civilization entry — use their dedicated crimson color
  const civColor = isBeast ? '#7a1f2b' : (isCrisisForce ? CRISIS_FORCE_PRESENTATION.color : (state.civilizations[unit.owner]?.color ?? '#e8c170'));
  const tile = state.map.tiles[hexKey(unit.position)];

  container.style.display = 'block';
  container.replaceChildren();

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `background:rgba(0,0,0,0.85);border-radius:12px;padding:12px 16px;border-left:4px solid ${civColor};`;

  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

  const infoDiv = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = def.name;
  infoDiv.appendChild(strong);
  if (isBeast) {
    const legendLabel = document.createElement('span');
    legendLabel.style.cssText = `margin-left:8px;font-size:11px;font-weight:700;text-transform:uppercase;color:${civColor};letter-spacing:0.05em;`;
    legendLabel.textContent = '⚠ Legendary Beast';
    infoDiv.appendChild(legendLabel);
  } else if (isCrisisForce) {
    const crisisLabel = document.createElement('span');
    crisisLabel.style.cssText = `margin-left:8px;font-size:11px;font-weight:700;text-transform:uppercase;color:${civColor};letter-spacing:0.05em;`;
    crisisLabel.textContent = `⚠ ${CRISIS_FORCE_PRESENTATION.label}`;
    infoDiv.appendChild(crisisLabel);
    const route = getHerdRoutePresentationForViewer(state, state.currentPlayer).routes.find(candidate => candidate.unitId === unit.id);
    if (route) {
      const routeLabel = document.createElement('div');
      routeLabel.style.cssText = 'margin-top:6px;font-size:12px;color:#f6d365;';
      routeLabel.textContent = route.stopsAtFort ? 'Herd path: stops at Fort/Citadel.' : `Herd path: next ${route.steps.length} step${route.steps.length === 1 ? '' : 's'}.`;
      infoDiv.appendChild(routeLabel);
    }
    const command = getRogueElephantCommandFact(state, unit.id);
    if (command && state.civilizations[state.currentPlayer]?.visibility?.tiles[`${unit.position.q},${unit.position.r}`] === 'visible') {
      const commandLabel = document.createElement('div');
      commandLabel.style.cssText = 'margin-top:6px;font-size:12px;color:#f6d365;';
      commandLabel.textContent = 'Handler command: +20% attack and defense within 2 hexes.';
      infoDiv.appendChild(commandLabel);
    }
  }
  infoDiv.appendChild(document.createTextNode(` · HP: ${unit.health}/100 · Moves: ${unit.movementPointsLeft}/${def.movementPoints}`));

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.style.cssText = 'cursor:pointer;font-size:18px;opacity:0.6;background:none;border:none;color:white;';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => callbacks.onClose?.());

  topRow.appendChild(infoDiv);
  topRow.appendChild(closeBtn);

  const descDiv = document.createElement('div');
  descDiv.style.cssText = 'font-size:10px;opacity:0.6;margin-top:2px;';
  descDiv.textContent = resolveSuperweaponContentDescription(unit.type, UNIT_DESCRIPTIONS[unit.type] ?? '', state);

  wrapper.appendChild(topRow);
  wrapper.appendChild(descDiv);

  // #544 MR3: show the specific commander this unit represents, layered under
  // the generic "Great General" def.name/description above -- mirrors this
  // function's existing pattern of additional info blocks beneath descDiv.
  if (unit.type === 'great_general' && unit.generalDefinitionId) {
    const generalDef = resolveGeneralDefinition(state, unit.generalDefinitionId);
    if (generalDef) {
      const generalLine = document.createElement('div');
      generalLine.style.cssText = 'font-size:12px;margin-top:4px;color:#e8c170;font-weight:600;';
      generalLine.textContent = `${generalDef.portraitIcon} ${generalDef.name} — Era ${generalDef.era}`;
      wrapper.appendChild(generalLine);
      const descriptorLine = document.createElement('div');
      descriptorLine.style.cssText = 'font-size:11px;opacity:0.8;margin-top:2px;';
      descriptorLine.textContent = generalDef.descriptor;
      wrapper.appendChild(descriptorLine);

      // #885: a one-line specialty summary (text only, no color-coding for
      // meaning). `undefined` for a Field Commander / generated officer, so
      // nothing misleading is shown for those.
      const specialty = getGeneralSpecialtyPresentation(generalDef);
      if (specialty) {
        const specialtyLine = document.createElement('div');
        specialtyLine.style.cssText = 'font-size:11px;margin-top:3px;color:#f0c674;';
        specialtyLine.textContent = `Specialty: ${specialty.displayName} — ${specialty.summary}`;
        wrapper.appendChild(specialtyLine);
      }

      // #886: authored Generals carry a rich biography/facts profile. Render it
      // as a collapsed <details> (opt-in depth, no forced reading, no overflow)
      // mirroring this file's existing "Role details" pattern. Generated
      // officers (#888) have no profile and this block is simply skipped.
      // `sources` are provenance for audit and are deliberately not shown here.
      const profile = getGeneralProfile(generalDef.id);
      if (profile) {
        const bio = document.createElement('details');
        bio.style.cssText = 'margin-top:4px;font-size:11px;opacity:0.85;';
        const bioSummary = document.createElement('summary');
        bioSummary.style.cssText = 'cursor:pointer;opacity:0.8;';
        bioSummary.textContent =
          profile.kind === 'historical' ? `Who was ${generalDef.name}?` : `About ${generalDef.name}`;
        bio.appendChild(bioSummary);

        const bioSummaryText = document.createElement('div');
        bioSummaryText.style.cssText = 'margin-top:4px;';
        bioSummaryText.textContent = profile.summary;
        bio.appendChild(bioSummaryText);

        for (const fact of profile.facts) {
          const row = document.createElement('div');
          row.style.cssText = 'margin-top:3px;';
          row.textContent = `• ${fact}`;
          bio.appendChild(row);
        }

        if (profile.context) {
          const ctx = document.createElement('div');
          ctx.style.cssText = 'margin-top:4px;opacity:0.7;';
          ctx.textContent = profile.context;
          bio.appendChild(ctx);
        }

        if (profile.loreWork) {
          const work = document.createElement('div');
          work.style.cssText = 'margin-top:4px;opacity:0.6;font-style:italic;';
          work.textContent = `From: ${profile.loreWork}`;
          bio.appendChild(work);
        }

        wrapper.appendChild(bio);
      }

      // #544 MR4: exact command stats, ability buttons, and reopenable tutorial.
      const eligibility = getHeroicCommandEligibility(state, unit);
      const { commandRange, commandCapacity } = getEffectiveCommandStats(unit, generalDef);

      const statsLine = document.createElement('div');
      statsLine.style.cssText = 'font-size:12px;opacity:0.85;margin:6px 0;';
      statsLine.textContent =
        `Command range ${commandRange} · Command capacity ${commandCapacity} · `
        + `Charges ${eligibility.chargesRemaining}/${resolveGeneralMechanics(generalDef).maxCommandCharges}`
        + (eligibility.cooldownTurnsRemaining > 0 ? ` · Cooldown ${eligibility.cooldownTurnsRemaining} turn(s)` : '');
      wrapper.appendChild(statsLine);

      if (!eligibility.eligible && eligibility.reason) {
        const reasonLine = document.createElement('div');
        reasonLine.textContent = eligibility.reason;
        reasonLine.style.cssText = 'font-size:11px;opacity:0.7;margin-bottom:6px;';
        wrapper.appendChild(reasonLine);
      }

      const abilityRow = document.createElement('div');
      abilityRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;';

      const rallyButton = createGameButton(
        eligibility.isFinalCharge ? 'Rally (Final Command)' : 'Rally',
        'secondary',
        { disabled: !eligibility.eligible },
      );
      rallyButton.addEventListener('click', () => callbacks.onOpenRally?.(unit.id));
      abilityRow.appendChild(rallyButton);

      const seizeButton = createGameButton(
        eligibility.isFinalCharge ? 'Seize the Moment (Final Command)' : 'Seize the Moment',
        'secondary',
        { disabled: !eligibility.eligible },
      );
      seizeButton.addEventListener('click', () => callbacks.onOpenSeize?.(unit.id));
      abilityRow.appendChild(seizeButton);

      const lastStandButton = createGameButton(
        eligibility.isFinalCharge ? 'Last Stand (Final Command)' : 'Last Stand',
        'secondary',
        { disabled: !eligibility.eligible },
      );
      lastStandButton.addEventListener('click', () => callbacks.onStartLastStandTargeting?.(unit.id));
      abilityRow.appendChild(lastStandButton);

      wrapper.appendChild(abilityRow);

      if (callbacks.onReopenGeneralTutorial) {
        const helpLink = document.createElement('button');
        helpLink.type = 'button';
        helpLink.textContent = 'ℹ️ How does command work?';
        helpLink.style.cssText = 'margin-top:4px;background:none;border:none;color:#8fe8b0;font-size:10px;text-decoration:underline;cursor:pointer;padding:0;';
        helpLink.addEventListener('click', () => callbacks.onReopenGeneralTutorial!());
        wrapper.appendChild(helpLink);
      }
    }
  }

  const landSupplyStatusLines = getLandSupplyStatusLines(state, unit);
  if (landSupplyStatusLines) {
    for (const [index, line] of landSupplyStatusLines.entries()) {
      const supplyLine = document.createElement('div');
      supplyLine.style.cssText = `font-size:11px;margin-top:${index === 0 ? 4 : 2}px;color:#c9d6e3;`;
      supplyLine.textContent = line;
      wrapper.appendChild(supplyLine);
    }
    if (callbacks.onReopenSupplyTutorial) {
      const helpLink = document.createElement('button');
      helpLink.type = 'button';
      helpLink.textContent = 'ℹ️ How supply works';
      helpLink.style.cssText = 'margin-top:2px;background:none;border:none;color:#8fe8b0;font-size:10px;text-decoration:underline;cursor:pointer;padding:0;';
      helpLink.addEventListener('click', () => callbacks.onReopenSupplyTutorial!());
      wrapper.appendChild(helpLink);
    }
  }

  const revealState = getSubmarineRevealState(state, unit, state.currentPlayer);
  if (revealState) {
    const revealBadge = document.createElement('div');
    revealBadge.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;color:#f8d28a;';
    revealBadge.textContent = revealState === 'tracked'
      ? 'Tracked by your detector'
      : 'Spotted momentarily — will vanish next turn unless still tracked';
    wrapper.appendChild(revealBadge);
  }

  const rolePresentation = getUnitRolePresentation(
    unit.type,
    unit.owner === state.currentPlayer
      ? state.civilizations[state.currentPlayer]?.techState.completed ?? []
      : [],
  );
  if (rolePresentation) {
    const roleSummary = document.createElement('div');
    roleSummary.style.cssText = 'font-size:11px;line-height:1.35;margin-top:6px;color:#f8d28a;';
    roleSummary.textContent = rolePresentation.summary;
    wrapper.appendChild(roleSummary);

    const details = document.createElement('details');
    details.style.cssText = 'margin-top:6px;font-size:11px;line-height:1.4;';
    const summary = document.createElement('summary');
    summary.textContent = 'Role details';
    summary.style.cssText = 'cursor:pointer;color:#f8d28a;font-weight:700;';
    details.appendChild(summary);
    for (const fact of [
      { icon: '🛡️', text: rolePresentation.roleText },
      ...rolePresentation.counters,
      ...rolePresentation.vulnerabilities,
      ...rolePresentation.publicFacts,
      rolePresentation.upgrade,
      ...(unit.owner === state.currentPlayer ? rolePresentation.requirements : []),
    ]) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-top:3px;';
      row.textContent = `${fact.icon} ${fact.text}`;
      details.appendChild(row);
    }
    wrapper.appendChild(details);
  }

  if (unit.owner === state.currentPlayer && tile?.improvement === 'fort' && tile.improvementTurnsLeft <= 0 && tile.owner === unit.owner) {
    const fortification = document.createElement('div');
    const fortTier = getFortificationTier(state.civilizations[unit.owner]?.techState.completed ?? []);
    fortification.style.cssText = 'margin-top:6px;padding:6px 8px;border-radius:6px;background:rgba(104,91,72,0.28);border:1px solid rgba(184,157,112,0.55);font-size:11px;line-height:1.4;color:#f8d28a;';
    const fortifyLayer = unit.isFortified ? ' Fortify stance: +25% defense.' : '';
    fortification.textContent = `${fortTier.label} improvement: +${Math.round((fortTier.multiplier - 1) * 100)}% defense.${fortifyLayer}`;
    wrapper.appendChild(fortification);
  }

  const scrollCue = document.createElement('div');
  scrollCue.dataset.scrollCue = 'true';
  scrollCue.style.cssText = 'display:none;margin-top:6px;font-size:11px;font-weight:700;color:#f8d28a;letter-spacing:0.01em;';
  scrollCue.textContent = '↓ More details and actions below — scroll';
  wrapper.appendChild(scrollCue);

  if (unit.airBase && def.airOperation) {
    const baseName = unit.airBase.kind === 'city'
      ? `${state.cities[unit.airBase.cityId]?.name ?? 'Unknown'} Airfield`
      : `${UNIT_DEFINITIONS[state.units[unit.airBase.unitId]?.type ?? 'carrier'].name}`;
    const baseLine = document.createElement('div');
    baseLine.style.cssText = 'font-size:11px;opacity:0.8;margin-top:5px;';
    baseLine.textContent = `Base: ${baseName} · Slots: ${getAirBaseRoster(state, unit.airBase).length}/${getAirBaseCapacity(state, unit.airBase)} · Range: ${def.airOperation.operationalRange}/${def.airOperation.ferryRange}`;
    wrapper.appendChild(baseLine);
  }

  const huntFoeName = findHuntFoeNameForUnit(state, unitId);
  if (huntFoeName) {
    const huntLine = document.createElement('div');
    huntLine.style.cssText = 'margin-top:6px;padding:6px 8px;border-radius:6px;background:rgba(122,31,43,0.25);border:1px solid rgba(122,31,43,0.5);font-size:11px;font-weight:700;color:#e88;';
    huntLine.textContent = `⚔ ${huntFoeName} — slay it to end the threat. Any civilization may claim the hunt.`;
    wrapper.appendChild(huntLine);
  }

  const waterRecovery = presentation.waterRecovery;
  const waterRecoveryMessage = waterRecovery
    ? getLandUnitWaterRecoveryPanelMessage(waterRecovery)
    : null;
  if (waterRecovery && waterRecoveryMessage) {
    const recoveryLine = document.createElement('div');
    recoveryLine.dataset.waterRecoveryKind = waterRecovery.kind;
    recoveryLine.setAttribute('role', 'status');
    recoveryLine.setAttribute('aria-live', 'polite');
    recoveryLine.style.cssText = 'margin-top:8px;padding:8px;border:1px solid rgba(245,184,73,0.45);border-radius:8px;background:rgba(245,184,73,0.16);color:#f5b849;font-size:12px;font-weight:600;line-height:1.4;';
    recoveryLine.textContent = waterRecoveryMessage;
    wrapper.appendChild(recoveryLine);
  }
  if (presentation.hasZoneOfControlWarning) {
    const zocLine = document.createElement('div');
    zocLine.dataset.zoneOfControlWarning = 'true';
    zocLine.setAttribute('role', 'status');
    zocLine.setAttribute('aria-live', 'polite');
    zocLine.style.cssText = 'margin-top:8px;padding:8px;border:1px solid rgba(245,184,73,0.7);border-radius:8px;background:rgba(245,184,73,0.12);color:#f5b849;font-size:12px;font-weight:600;line-height:1.4;';
    zocLine.textContent = '⚠ Enemy nearby — entering ends movement.';
    wrapper.appendChild(zocLine);
  }

  const tier = getVeterancyTier(unit);
  const nextTierXp = getExperienceToNextTier(unit);
  const nextLabel = nextTierLabel(tier.label);
  const combatBonus = Math.round(getVeterancyCombatModifier(unit) * 100);
  const xpDiv = document.createElement('div');
  xpDiv.style.cssText = 'font-size:10px;opacity:0.75;margin-top:4px;';
  xpDiv.textContent = nextTierXp === null || nextLabel === null
    ? `XP: ${unit.experience ?? 0} · ${tier.label} · +${combatBonus}% combat`
    : `XP: ${unit.experience ?? 0} · ${tier.label} · +${combatBonus}% combat · ${nextTierXp} XP to ${nextLabel}`;
  wrapper.appendChild(xpDiv);

  if (unit.owner === state.currentPlayer) {
    const unitMaint = calculateCivUnitMaintenance(state, unit.owner);
    const freeEntry = unitMaint.freeDefenderUnits.find(r => r.id === unitId)
      ?? unitMaint.supportedUnits.find(r => r.id === unitId);
    const paidEntry = unitMaint.paidUnits.find(r => r.id === unitId);
    if (freeEntry || paidEntry) {
      const upkeepLine = document.createElement('div');
      upkeepLine.style.cssText = 'font-size:10px;margin-top:2px;';
      if (freeEntry) {
        upkeepLine.textContent = 'Upkeep: Free support';
        upkeepLine.style.color = '#4ade80';
      } else {
        upkeepLine.textContent = `Upkeep: -${paidEntry!.upkeep} 💰/turn`;
        upkeepLine.style.color = '#f87171';
      }
      wrapper.appendChild(upkeepLine);
    }
  }

  const friendlyUnitsHere = Object.values(state.units).filter(other =>
    other.owner === unit.owner && !other.transportId && hexKey(other.position) === hexKey(unit.position),
  );
  if (friendlyUnitsHere.length > 1 && callbacks.onOpenStack) {
    const stackRow = document.createElement('div');
    stackRow.style.cssText = 'margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;color:#e8c170;';
    const stackText = document.createElement('span');
    stackText.textContent = `Stack: ${friendlyUnitsHere.length} units here`;
    const switchButton = makeButton('Switch unit', '#374151', () => callbacks.onOpenStack?.({ ...unit.position }));
    stackRow.appendChild(stackText);
    stackRow.appendChild(switchButton);
    wrapper.appendChild(stackRow);
  }

  if (unit.automation?.mode === 'auto-explore') {
    const statusRow = document.createElement('div');
    statusRow.style.cssText = 'margin-top:8px;font-size:12px;color:#a5f3fc;display:flex;justify-content:space-between;align-items:center;gap:8px;';
    const statusText = document.createElement('span');
    statusText.textContent = `Auto-exploring since turn ${unit.automation.startedTurn}`;
    statusRow.appendChild(statusText);
    if (callbacks.onCancelAutoExplore) {
      statusRow.appendChild(makeButton('Cancel auto-explore', '#0f766e', callbacks.onCancelAutoExplore));
    }
    wrapper.appendChild(statusRow);
  }

  if (unit.automation?.mode === 'journey') {
    const { q, r } = unit.automation.destination;
    const statusRow = document.createElement('div');
    statusRow.style.cssText = 'margin-top:8px;font-size:12px;color:#fcd34d;display:flex;justify-content:space-between;align-items:center;gap:8px;';
    const statusText = document.createElement('span');
    statusText.textContent = `Journeying to (${q}, ${r})`;
    statusRow.appendChild(statusText);
    if (callbacks.onCancelJourney) {
      statusRow.appendChild(makeButton('Cancel journey', '#b45309', callbacks.onCancelJourney));
    }
    wrapper.appendChild(statusRow);
  }

  const actionsDiv = document.createElement('div');
  actionsDiv.style.cssText = 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;';

  if (unit.owner === state.currentPlayer && !unit.automation && callbacks.onStartAutoExplore) {
    const autoExplore = makeButton('Auto-explore', '#0f766e', () => callbacks.onStartAutoExplore!(unitId));
    autoExplore.title = 'Explore nearby unknown land automatically until you cancel or the unit can no longer continue.';
    actionsDiv.appendChild(autoExplore);
  }

  if (unit.transportId) {
    const transport = state.units[unit.transportId];
    const transportStatus = document.createElement('div');
    transportStatus.style.cssText = 'margin-top:8px;font-size:12px;color:#a5f3fc;';
    transportStatus.textContent = `Aboard ${transport ? UNIT_DEFINITIONS[transport.type]?.name ?? 'Transport' : 'Transport'}`;
    wrapper.appendChild(transportStatus);
    container.appendChild(wrapper);
    return;
  }

  if (isNavalTransport(unit.type)) {
    const cargo = getTransportCargo(state, unitId);
    const cargoDiv = document.createElement('div');
    cargoDiv.style.cssText = 'margin-top:8px;font-size:12px;color:#bfdbfe;';
    cargoDiv.textContent = cargo.length === 0
      ? 'Cargo: Empty'
      : `Cargo: Carrying ${cargo.map(cargoUnit => UNIT_DEFINITIONS[cargoUnit.type]?.name ?? cargoUnit.type).join(', ')}`;
    wrapper.appendChild(cargoDiv);
  }

  if (def.canFoundCity && callbacks.onFoundCity) {
    if (unit.movementPointsLeft > 0 && canFoundCityAt(state, unit.position)) {
      actionsDiv.appendChild(makeButton('Found City', '#e8c170', callbacks.onFoundCity));
    } else {
      const blockerTitle = unit.movementPointsLeft <= 0
        ? 'No movement remaining'
        : formatCityFoundingBlockerMessage(getCityFoundingBlockers(state, unit.position));
      const btn = makeButton('Found City', '#e8c170');
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.title = blockerTitle;
      actionsDiv.appendChild(btn);
    }
  }

  if (unit.type === 'missionary') {
    const charges = unit.chargesRemaining ?? 0;
    const chargeDiv = document.createElement('div');
    chargeDiv.style.cssText = 'font-size:10px;opacity:0.75;margin-top:6px;';
    chargeDiv.textContent = `Missionary Charges: ${charges}`;
    wrapper.appendChild(chargeDiv);

    const onCooldown = (unit.missionaryCooldownUntilTurn ?? 0) > state.turn;
    const eligibleCityId = charges > 0 && !onCooldown ? findEligiblePreachTargetCityId(state, unit) : null;
    if (callbacks.onPreach) {
      if (eligibleCityId) {
        const btn = makeButton('Preach', '#b39ddb', () => callbacks.onPreach!(unit.id, eligibleCityId));
        btn.title = 'Push this city toward your faith. Uses one charge — the missionary is used up after its last charge.';
        actionsDiv.appendChild(btn);
      } else if (charges > 0) {
        const btn = makeButton('Preach', '#b39ddb');
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.title = onCooldown
          ? 'This missionary is resting after its last preach — try again in a few turns.'
          : 'No eligible city nearby — move next to a discovered city that is not a holy city, not held by a civ you are at war with, and hasn\'t recently changed faith.';
        actionsDiv.appendChild(btn);
      }
    }
  }

  if (def.canBuildImprovements) {
    const charges = getWorkerChargesRemaining(unit);
    const chargeDiv = document.createElement('div');
    chargeDiv.style.cssText = 'font-size:10px;opacity:0.75;margin-top:6px;';
    chargeDiv.textContent = `Worker Charges: ${charges}/${DEFAULT_WORKER_CHARGES}`;
    wrapper.appendChild(chargeDiv);

    if (tile?.improvement === 'fort' && tile.improvementOwner === unit.owner && tile.improvementTurnsLeft > 0) {
      const progress = document.createElement('div');
      progress.style.cssText = 'font-size:11px;color:#f8d28a;margin-top:4px;';
      progress.textContent = `Building Fort — ${tile.improvementTurnsLeft} turns remaining.`;
      wrapper.appendChild(progress);
    }

    if (charges > 0 && !unit.hasActed && unit.movementPointsLeft > 0 && callbacks.onWorkerAction) {
      const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
      const unitTileKey = hexKey(unit.position);
      const isCityTile = Object.values(state.cities).some(city => hexKey(city.position) === unitTileKey);
      const knownResource = tile ? getKnownTileResourceForWorkerAction(tile, completedTechs) : null;
      const workerEligibilityOptions = { isCityTile, knownResource, currentTurn: state.turn, state };
      const workerActions = getAvailableWorkerActions(tile, completedTechs, unit.owner, workerEligibilityOptions);
      if (knownResource) {
        const rd = RESOURCE_DEFINITIONS.find(r => r.id === knownResource);
        if (rd) {
          const resourceInfoDiv = document.createElement('div');
          resourceInfoDiv.style.cssText = 'font-size:12px;color:#e8c170;margin-bottom:4px;';
          const effectStr = rd.effect ? ` · +${rd.effect.amount} ${rd.effect.type}` : '';
          resourceInfoDiv.textContent = `${rd.icon} ${rd.name} (${rd.type})${effectStr} — harvest with: ${getImprovementDisplayName(rd.requiredImprovement)}`;
          wrapper.appendChild(resourceInfoDiv);
        }
      }
      for (const action of workerActions) {
        const color = action === 'farm'
          ? '#6b9b4b'
          : action === 'mine'
            ? '#8b7355'
            : action === 'lumber_camp'
              ? '#476f3a'
              : action === 'watermill'
                ? '#3f7f8f'
                : action === 'drain_swamp'
                  ? '#4a7c59'
                  : action === 'restore_land'
                    ? '#b45309'
                    : '#64748b';
        let label = action === 'drain_swamp'
          ? 'Drain Swamp (→ Grassland, +1 🌾)'
          : getWorkerActionLabel(action);
        if (knownResource && action !== 'drain_swamp' && action !== 'restore_land') {
          const rd = RESOURCE_DEFINITIONS.find(r => r.id === knownResource && r.requiredImprovement === action);
          if (rd) {
            const yieldLabel = formatImprovementYieldLabel(action);
            label = `Build ${getImprovementDisplayName(action)} → ${rd.icon} ${rd.name}${yieldLabel ? ` ${yieldLabel}` : ''}`;
          }
        }
        actionsDiv.appendChild(makeButton(label, color, () => callbacks.onWorkerAction!(action)));
      }

      if (tile && completedTechs.includes('fortresses') && !workerActions.includes('fort')) {
        const placement = getFortificationPlacement(state, unit.owner, unit.position);
        if (!placement.ok) {
          const reason = placement.reason === 'adjacent-fort'
            ? 'adjacent Fort'
            : placement.reason === 'empire-cap'
              ? 'Fort limit reached'
              : placement.reason === 'city-center'
                ? 'city center'
                : placement.reason === 'outside-territory'
                  ? 'outside your territory'
                  : 'invalid terrain';
          const fortButton = makeButton(`Build Fort — ${reason}`, '#64748b');
          fortButton.disabled = true;
          fortButton.style.opacity = '0.5';
          fortButton.style.cursor = 'not-allowed';
          fortButton.title = placement.reason === 'empire-cap'
            ? (() => {
                const capacity = getFortificationCapacity(state, unit.owner);
                return capacity.built >= capacity.limit
                  ? `Forts: ${capacity.built}/${capacity.limit}. Build another city to raise the Fort limit.`
                  : `Forts: ${capacity.built}/${capacity.limit}. Build another city or place this Fort on the frontier.`;
              })()
            : 'Forts cannot be adjacent and are limited by your city count.';
          actionsDiv.appendChild(fortButton);
        }
      }

      const roadBlockerReason = getRoadBlockerReason(tile, completedTechs, unit.owner, isCityTile);
      if (roadBlockerReason === 'none') {
        actionsDiv.appendChild(makeButton('Build Road (2 turns)', '#8a6a3a', () => callbacks.onWorkerAction!('build_road')));
      } else if (roadBlockerReason === 'requires-tech' || roadBlockerReason === 'outside-territory') {
        const btn = makeButton('Build Road (2 turns)', '#8a6a3a');
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.title = formatRoadBlockerReason(roadBlockerReason);
        actionsDiv.appendChild(btn);
      }

      if (workerActions.length === 0) {
        const eligibilityOpts = workerEligibilityOptions;
        if (tile && tile.improvement !== 'none' && callbacks.onReplaceImprovement) {
          const replaceable = getAvailableWorkerActions(tile, completedTechs, unit.owner, { ...workerEligibilityOptions, allowReplacement: true })
            .filter((a): a is BuildableImprovementType => a !== 'drain_swamp' && a !== 'restore_land');
          for (const action of replaceable) {
            const yieldStr = formatImprovementYieldLabel(action);
            const label = `Replace ${getImprovementDisplayName(tile.improvement)} with ${getImprovementDisplayName(action)}${yieldStr ? ` ${yieldStr}` : ''}`;
            actionsDiv.appendChild(makeButton(label, '#7c5c38', () => callbacks.onReplaceImprovement!(action)));
          }
        } else {
          const hints = getWorkerBlockerHints(tile, completedTechs, unit.owner, eligibilityOpts);
          const displayText = hints.length > 0
            ? hints.join(' · ')
            : formatWorkerActionBlockerReason(chooseWorkerBlockerReason(tile, completedTechs, unit.owner, eligibilityOpts));
          if (displayText) {
            const blockerDiv = document.createElement('div');
            blockerDiv.style.cssText = 'font-size:11px;color:#f8d28a;margin-top:4px;';
            blockerDiv.textContent = displayText;
            wrapper.appendChild(blockerDiv);
          }
        }
      }
    }
  }

  // Trade-unit actions (caravan + Trade Routes Overhaul (#553 MR1/4) Naval Trader line)
  if (hasAITradeRole(unit.type) && unit.owner === state.currentPlayer) {
    if (unit.committedToRouteId) {
      const statusEl = document.createElement('div');
      statusEl.style.cssText = 'font-size:12px;opacity:0.7;padding:8px 0;';
      statusEl.textContent = `Committed to route (${unit.tripsRemaining ?? '?'} trips remaining)`;
      actionsDiv.appendChild(statusEl);
    } else if (callbacks.onEstablishRoute) {
      const fromCity = resolveFromCity(state, unit);
      const hasCapacity = fromCity !== null;
      const btn = makeButton('Establish Route', '#e8c170');
      if (!hasCapacity) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.title = 'No cities with available route capacity — build a Caravanserai or Marketplace to add slots';
      } else {
        btn.addEventListener('click', () => callbacks.onEstablishRoute!(unitId));
      }
      actionsDiv.appendChild(btn);
    }
  }

  if (unit.type === 'expedition' && !unit.hasActed && callbacks.onEstablishOutpost) {
    if (canEstablishOutpost(state, unitId)) {
      const btn = makeButton('🚩 Establish Outpost', '#4a7c59');
      btn.title = 'Plant a Resource Outpost on this tile. Expedition is consumed immediately. Outpost completes in 2 turns.';
      btn.style.cssText += ';min-height:44px;width:100%;margin-top:6px;';
      btn.addEventListener('click', () => callbacks.onEstablishOutpost!(unitId));
      actionsDiv.appendChild(btn);
    }
  }

  // ── Load onto transport ───────────────────────────────────────────────────
  // Show for any unit that is not already aboard a transport and is not itself
  // a naval transport (transports cannot board other transports).
  if (!unit.transportId && !isNavalTransport(unit.type) && callbacks.getTransportOptions && callbacks.onLoadTransport) {
    const transportOptions = callbacks.getTransportOptions(unitId);
    for (const option of transportOptions) {
      const btn = makeButton(option.label, option.disabled ? '#374151' : '#2563eb',
        option.disabled ? undefined : () => callbacks.onLoadTransport!(unitId, option.transportId));
      if (option.disabled) {
        btn.disabled = true;
        btn.style.opacity = '0.55';
        btn.style.cursor = 'not-allowed';
      }
      if (option.tooltip) {
        btn.title = option.tooltip;
      }
      actionsDiv.appendChild(btn);
    }
  }

  // ── Naval transport cargo panel ───────────────────────────────────────────
  if (isNavalTransport(unit.type) && callbacks.getCargoBoardInfo && callbacks.onSelectCargoToUnload) {
    const cargoItems = callbacks.getCargoBoardInfo(unitId);
    const capacity = getTransportCapacity(state.units[unitId]!);
    const used = getTransportCargoUsed(state, unitId);

    // Slot bar header
    const cargoHeader = document.createElement('div');
    cargoHeader.style.cssText = 'margin-top:8px;font-size:11px;opacity:0.7;';
    cargoHeader.textContent = `Cargo: ${used}/${capacity} slots`;
    actionsDiv.appendChild(cargoHeader);

    if (callbacks.pendingUnloadUnitName) {
      // ── Stage 2: unload destination picking ──────────────────────────────
      const banner = document.createElement('div');
      banner.style.cssText = 'margin-top:6px;padding:8px 10px;background:rgba(15,118,110,0.25);border-radius:8px;border:1px solid rgba(15,118,110,0.5);font-size:12px;';
      banner.textContent = `Tap a highlighted hex to disembark ${callbacks.pendingUnloadUnitName}.`;
      actionsDiv.appendChild(banner);
      if (callbacks.onCancelUnload) {
        const cancelBtn = makeButton('Cancel Unload', '#374151', () => callbacks.onCancelUnload!());
        cancelBtn.style.cssText += ';margin-top:6px;width:100%;border:1px solid rgba(255,255,255,0.2);';
        actionsDiv.appendChild(cancelBtn);
      }
    } else if (cargoItems.length === 0) {
      // ── Empty hold ───────────────────────────────────────────────────────
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'margin-top:4px;font-size:11px;opacity:0.5;font-style:italic;';
      emptyMsg.textContent = 'Hold is empty.';
      actionsDiv.appendChild(emptyMsg);
    } else {
      // ── Stage 1: cargo manifest with per-unit Unload buttons ─────────────
      for (const item of cargoItems) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;';

        const slotBadge = document.createElement('span');
        slotBadge.style.cssText = 'font-size:10px;background:rgba(255,255,255,0.12);border-radius:4px;padding:2px 5px;flex-shrink:0;';
        slotBadge.textContent = `${item.slotCost}⚓`;
        row.appendChild(slotBadge);

        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'font-size:12px;flex:1;';
        nameSpan.textContent = item.label;
        row.appendChild(nameSpan);

        const unloadBtn = makeButton('Unload', item.canUnload ? '#0f766e' : '#374151',
          item.canUnload ? () => callbacks.onSelectCargoToUnload!(unitId, item.cargoUnitId) : undefined);
        unloadBtn.style.cssText += ';padding:4px 10px;min-height:36px;font-size:11px;';
        if (!item.canUnload) {
          unloadBtn.disabled = true;
          unloadBtn.style.opacity = '0.45';
          unloadBtn.style.cursor = 'not-allowed';
          unloadBtn.title = 'Unit has already acted this turn.';
        }
        row.appendChild(unloadBtn);
        actionsDiv.appendChild(row);
      }
    }
  }

  // ── Carrier air-wing roster panel (#582) ──────────────────────────────────
  if (def.carrierDeckCapacity !== undefined) {
    const base: AirBaseRef = { kind: 'carrier', unitId };
    const roster = getAirBaseRoster(state, base);
    const capacity = def.carrierDeckCapacity;

    const wingHeader = document.createElement('div');
    wingHeader.style.cssText = 'margin-top:8px;font-size:11px;opacity:0.7;';
    wingHeader.textContent = `Air Wing: ${roster.length}/${capacity} slots`;
    actionsDiv.appendChild(wingHeader);

    for (const aircraft of roster) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-top:4px;font-size:12px;';
      const status = aircraft.hasActed ? 'Used' : 'Ready';
      row.textContent = `• ${UNIT_DEFINITIONS[aircraft.type].name} — ${status}`;
      actionsDiv.appendChild(row);
    }
    for (let i = roster.length; i < capacity; i++) {
      const emptyRow = document.createElement('div');
      emptyRow.style.cssText = 'margin-top:4px;font-size:12px;opacity:0.5;font-style:italic;';
      emptyRow.textContent = '• Empty slot';
      actionsDiv.appendChild(emptyRow);
    }
  }

  if (canHeal(unit) && !unit.hasMoved && !unit.hasActed && unit.movementPointsLeft > 0 && callbacks.onRest) {
    actionsDiv.appendChild(makeButton('Rest (+15 HP)', '#4a90d9', callbacks.onRest));
  }

  if (def.airOperation?.missions.includes('intercept') && unit.airBase && !unit.hasActed && callbacks.onStartIntercept) {
    actionsDiv.appendChild(makeButton('Intercept', '#2563eb', () => callbacks.onStartIntercept!(unitId)));
  }

  if (def.airOperation?.missions.includes('rebase') && unit.airBase && !unit.hasActed && callbacks.getAirRebaseDestinations && callbacks.onRebaseAircraft) {
    for (const destination of callbacks.getAirRebaseDestinations(unitId)) {
      actionsDiv.appendChild(makeButton(`Rebase: ${destination.label}`, '#0f766e', () => callbacks.onRebaseAircraft!(unitId, destination.base)));
    }
  }

  if (presentation.airMissionPending && callbacks.onCancelAirMission) {
    actionsDiv.appendChild(makeButton(`Cancel ${presentation.airMissionPending === 'strike' ? 'Air Strike' : presentation.airMissionPending === 'recon' ? 'Recon' : 'Patrol'}`, '#6b7280', () => callbacks.onCancelAirMission!(unitId)));
  } else if (unit.airBase && !unit.hasActed && callbacks.onStartAirMission) {
    if (def.airOperation?.missions.includes('strike')) {
      actionsDiv.appendChild(makeButton('Air Strike', '#b45309', () => callbacks.onStartAirMission!(unitId, 'strike')));
    }
    if (def.airOperation?.missions.includes('recon')) {
      actionsDiv.appendChild(makeButton('Recon', '#2563eb', () => callbacks.onStartAirMission!(unitId, 'recon')));
    }
    if (def.airOperation?.missions.includes('patrol')) {
      actionsDiv.appendChild(makeButton('Patrol', '#0891b2', () => callbacks.onStartAirMission!(unitId, 'patrol')));
    }
  }

  if (presentation.paradropPending && callbacks.onCancelParadrop) {
    actionsDiv.appendChild(makeButton('Cancel Paradrop', '#6b7280', () => callbacks.onCancelParadrop!(unitId)));
  } else if (def.paradrop && !unit.hasActed && callbacks.onStartParadrop) {
    const launchState = getParadropLaunchState(state, unitId);
    if (launchState.ok) {
      actionsDiv.appendChild(makeButton('Paradrop', '#7c3aed', () => callbacks.onStartParadrop!(unitId)));
    } else {
      const btn = makeButton('Paradrop', '#7c3aed');
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.title = PARADROP_FAILURE_MESSAGES[launchState.reason];
      actionsDiv.appendChild(btn);
    }
  }

  if (presentation.airAssaultPending && callbacks.onCancelAirAssault) {
    actionsDiv.appendChild(makeButton('Cancel Air Assault', '#6b7280', () => callbacks.onCancelAirAssault!(unitId)));
  } else if (
    def.airAssaultPassengerEligible && !unit.hasActed && callbacks.onStartAirAssault
    // Unlike Paradrop (whose only carrier, Paratrooper, cannot exist before
    // its own tech), Air Assault's passenger pool includes ordinary
    // infantry types available many eras before Helicopter Warfare -- a
    // Musketeer selected at era 5 would otherwise show a permanently
    // disabled button for ~6 eras with a message ("Stand in a friendly
    // city with a Helicopter Base") that misleadingly implies the player
    // could act on it right now by building one. Gate visibility on the
    // owner having researched the tech so the button only appears once
    // the mechanic is actually reachable. Derived from Attack Helicopter's
    // own TRAINABLE_UNITS entry rather than a hardcoded tech id, so this
    // gate can't silently drift if that unit's prerequisite ever changes.
    && (state.civilizations[unit.owner]?.techState.completed ?? [])
      .includes(TRAINABLE_UNITS.find(entry => entry.type === 'attack_helicopter')!.techRequired!)
  ) {
    const launchState = getAirAssaultLaunchState(state, unitId);
    if (launchState.ok) {
      actionsDiv.appendChild(makeButton('Air Assault', '#0d9488', () => callbacks.onStartAirAssault!(unitId)));
    } else {
      const btn = makeButton('Air Assault', '#0d9488');
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.title = AIR_ASSAULT_FAILURE_MESSAGES[launchState.reason];
      actionsDiv.appendChild(btn);
    }
  }

  const pirateAssault = callbacks.getPirateAssaultAction?.(unitId);
  if (pirateAssault && callbacks.onOpenPirateAssault) {
    actionsDiv.appendChild(makeButton(
      pirateAssault.label,
      '#8b2635',
      () => callbacks.onOpenPirateAssault?.(pirateAssault.factionId, unitId),
    ));
  }

  if (unit.movementPointsLeft > 0 && !unit.hasActed && !unit.skippedTurn && callbacks.onSkipTurn) {
    actionsDiv.appendChild(makeButton('Skip Turn', '#5b6472', () => callbacks.onSkipTurn!(unitId)));
  }

  if (callbacks.onDeleteUnit) {
    actionsDiv.appendChild(makeButton('Delete Unit', '#b91c1c', () => callbacks.onDeleteUnit!(unitId)));
  }

  if (def.strength > 0 && !unit.hasActed && callbacks.onPillage && canPillageTile(tile, unit.owner)) {
    actionsDiv.appendChild(makeButton('Pillage', '#8b2635', () => callbacks.onPillage!(unitId)));
  }

  if (def.strength > 0 && callbacks.onFortify) {
    if (unit.isFortified) {
      actionsDiv.appendChild(makeButton('Unfortify', '#6b7a8a', () => callbacks.onFortify!(unitId)));
    } else if (!unit.hasMoved && !unit.hasActed && unit.movementPointsLeft > 0) {
      actionsDiv.appendChild(makeButton('Fortify', '#3b5268', () => callbacks.onFortify!(unitId)));
    }
  }

  // #545 MR4 §14 stage 1: actionsDiv has no single shared ownership gate --
  // each action re-checks `unit.owner === state.currentPlayer` itself (see
  // the auto-explore block above), so this one must too.
  if (isSuperweaponsEnabled(state) && unit.type === 'missile_submarine' && unit.owner === state.currentPlayer) {
    const arsenal = getStrategicArsenal(state.civilizations[unit.owner]!);
    const launchButton = createGameButton('Prepare Strategic Launch', 'danger', { disabled: arsenal < 1 });
    launchButton.dataset.action = 'prepare-strategic-launch';
    launchButton.addEventListener('click', () => callbacks.onPrepareStrategicLaunch?.(unit.id));
    actionsDiv.appendChild(launchButton);
    if (arsenal < 1) {
      const reason = document.createElement('div');
      reason.textContent = 'No warheads in arsenal.';
      reason.style.cssText = 'font-size:11px;opacity:0.7;margin-top:4px;width:100%;';
      actionsDiv.appendChild(reason);
    }
  }

  if (isSpyUnitType(unit.type) && !unit.hasActed && callbacks.onSetDisguise) {
    const spy = state.espionage?.[unit.owner]?.spies[unitId];
    if (spy?.status === 'idle') {
    const SPY_DISGUISE_TIERS: Partial<Record<string, number>> = {
      spy_scout: 0, spy_informant: 1, spy_agent: 2, spy_operative: 3, spy_hacker: 3,
    };
    const spyTier = SPY_DISGUISE_TIERS[unit.type] ?? 0;
    type DisguiseOption = { label: string; value: DisguiseType | null; minTier?: number };
    const allDisguises: DisguiseOption[] = [
      { label: 'No Disguise',   value: null },
      { label: 'As Barbarian',  value: 'barbarian', minTier: 1 },
      { label: 'As Warrior',    value: 'warrior',   minTier: 1 },
      { label: 'As Scout',      value: 'scout',     minTier: 2 },
      { label: 'As Archer',     value: 'archer',    minTier: 2 },
      { label: 'As Worker',     value: 'worker',    minTier: 3 },
    ];
    const disguiseOptions = allDisguises.filter(opt => !opt.minTier || spyTier >= opt.minTier);

    if (disguiseOptions.length > 1) {
      const disguiseSection = document.createElement('div');
      disguiseSection.style.cssText = 'margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;';
      const sectionLabel = document.createElement('div');
      sectionLabel.textContent = "Set disguise (costs this turn's move):";
      sectionLabel.style.cssText = 'font-size:10px;opacity:0.6;width:100%;';
      disguiseSection.appendChild(sectionLabel);
      for (const opt of disguiseOptions) {
        const active = (spy?.disguiseAs ?? null) === opt.value;
        const btn = makeButton(active ? `✓ ${opt.label}` : opt.label, active ? '#7c3aed' : '#374151',
          () => callbacks.onSetDisguise!(unitId, opt.value));
        disguiseSection.appendChild(btn);
      }
      actionsDiv.appendChild(disguiseSection);
    }
    } // end spy?.status === 'idle'
  }

  if (isSpyUnitType(unit.type) && callbacks.onInfiltrate) {
    const spyRecord = state.espionage?.[unit.owner]?.spies[unitId];
    const isAvailable = !unit.hasActed && (
      !spyRecord || spyRecord.status === 'idle' ||
      (spyRecord.status === 'cooldown' && (spyRecord.cooldownTurns ?? 1) === 0)
    );
    const enemyCityHere = Object.values(state.cities).some(
      c => c.owner !== unit.owner && c.position.q === unit.position.q && c.position.r === unit.position.r,
    );
    if (enemyCityHere) {
      if (isAvailable) {
        actionsDiv.appendChild(makeButton('Infiltrate City', '#7c3aed', () => callbacks.onInfiltrate!(unitId)));
      } else if (spyRecord?.status === 'cooldown' && (spyRecord.cooldownTurns ?? 0) > 0) {
        const btn = makeButton(`Infiltrate City (${spyRecord.cooldownTurns}t)`, '#4b5563');
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        actionsDiv.appendChild(btn);
      }
    }
  }

  if (isSpyUnitType(unit.type) && callbacks.onEmbed) {
    const spyRecord = state.espionage?.[unit.owner]?.spies[unitId];
    const ownCityHere = Object.values(state.cities).some(
      c => c.owner === unit.owner && c.position.q === unit.position.q && c.position.r === unit.position.r,
    );
    if (ownCityHere && spyRecord?.status === 'idle' && !unit.hasActed) {
      actionsDiv.appendChild(makeButton('Embed (counter-espionage)', '#374151', () => callbacks.onEmbed!(unitId)));
    }
  }

  if (
    (unit.type === 'cyber_unit' || unit.type === 'drone_controller')
    && unit.owner === state.currentPlayer
    && isAutonomyActivated(state, unit.owner)
    && callbacks.onOpenNetworkIntent
  ) {
    actionsDiv.appendChild(makeButton(
      unit.type === 'drone_controller' ? 'Coordinate Formation' : 'Set Network Intent',
      '#2563eb',
      () => callbacks.onOpenNetworkIntent!(unitId),
    ));
  }

  if (unit.type === 'propagandist' && unit.owner === state.currentPlayer && !unit.hasActed && callbacks.onUsePropagandistAction) {
    const nearbyCities = Object.values(state.cities)
      .filter(city => hexDistance(unit.position, city.position) <= 1)
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const city of nearbyCities) {
      if (city.owner === unit.owner && city.spyUnrestBonus > 0) {
        actionsDiv.appendChild(makeButton(
          `Rally ${city.name}`,
          '#2563eb',
          () => callbacks.onUsePropagandistAction!(unitId, 'rally', city.id),
        ));
        continue;
      }
      const owner = state.civilizations[unit.owner];
      const targetOwner = state.civilizations[city.owner];
      if (city.owner !== unit.owner && owner && targetOwner
        && isAtWar(owner.diplomacy, city.owner) && isAtWar(targetOwner.diplomacy, unit.owner)) {
        actionsDiv.appendChild(makeButton(
          `Undermine ${city.name}`,
          '#9b2c2c',
          () => callbacks.onUsePropagandistAction!(unitId, 'undermine', city.id),
        ));
      }
    }
  }

  if (callbacks.onUpgradeUnit && unit.owner === state.currentPlayer) {
    const targetType = TRAINABLE_UNITS.find(entry => entry.type === unit.type)?.upgradesTo;
    if (targetType) {
      const upgrade = evaluateUnitUpgrade(state, unitId, targetType);
      const requirementLabel = (requirement: UpgradeMissingRequirement): string => {
        const displayId = (id: string) => id.split('_').map(word => word[0]!.toUpperCase() + word.slice(1)).join(' ');
        switch (requirement.kind) {
          case 'technology': return `Research ${displayId(requirement.techId)}`;
          case 'building': return `Build ${displayId(requirement.buildingId)}`;
          case 'resource': return `Acquire ${requirement.resource}`;
          case 'gold': return `Need ${requirement.required} gold (have ${requirement.available})`;
          case 'friendly-city': return 'Move into one of your cities';
          case 'action-already-spent': return 'Wait until next turn';
          case 'air-base': return `Air base unavailable: ${requirement.reason.replace(/-/g, ' ')}`;
          default: return 'Upgrade target is unavailable';
        }
      };
      if (upgrade.canUpgrade && upgrade.cityId) {
        const upgradeButton = makeButton(`Upgrade → ${UNIT_DEFINITIONS[targetType].name} (${upgrade.cost} gold)`, '#7c3aed', () => {
          const confirmation = document.createElement('div');
          confirmation.style.cssText = 'font-size:12px;color:#f8d28a;margin-top:6px;';
          confirmation.textContent = `Upgrade to ${UNIT_DEFINITIONS[targetType].name}? Keeps ${upgrade.preserved.health} HP and ${upgrade.preserved.experience} XP.`;
          const confirm = makeButton('Confirm upgrade', '#7c3aed', () => callbacks.onUpgradeUnit!(unitId, upgrade.cityId!));
          const cancel = makeButton('Cancel', '#555', () => confirmation.remove());
          confirmation.appendChild(confirm);
          confirmation.appendChild(cancel);
          wrapper.appendChild(confirmation);
          upgradeButton.style.display = 'none';
        });
        actionsDiv.appendChild(upgradeButton);
      } else if (upgrade.targetType) {
        const readiness = document.createElement('div');
        readiness.style.cssText = 'margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(232,193,112,0.1);border:1px solid rgba(232,193,112,0.28);font-size:11px;color:#f8d28a;line-height:1.45;';
        const heading = document.createElement('strong');
        heading.textContent = `Upgrade to ${UNIT_DEFINITIONS[upgrade.targetType].name} needs:`;
        readiness.appendChild(heading);
        const details = document.createElement('div');
        details.textContent = upgrade.missing.map(requirementLabel).join(' · ');
        readiness.appendChild(details);
        wrapper.appendChild(readiness);
      }
    }
  }

  if (actionsDiv.childElementCount > 0) {
    wrapper.appendChild(actionsDiv);
  }

  container.appendChild(wrapper);

  const updateScrollCue = () => {
    const hasOverflow = container.scrollHeight > container.clientHeight + 1;
    const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1;
    scrollCue.style.display = hasOverflow && !isAtBottom ? 'block' : 'none';
  };
  updateScrollCue();
  container.onscroll = updateScrollCue;
}
