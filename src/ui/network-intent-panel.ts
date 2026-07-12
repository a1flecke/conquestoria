import type { NetworkPlanDefinitionId } from '@/core/autonomy-state';
import type { GameState } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { isAtWar } from '@/systems/diplomacy-system';
import { hexDistance } from '@/systems/hex-utils';
import { NETWORK_PLAN_DEFINITIONS } from '@/systems/network-plan-definitions';
import { createGameButton } from '@/ui/ui-kit';

export interface NetworkIntentTargetOption {
  cityId: string;
  cityName: string;
}

export interface NetworkIntentPanelModel {
  sourceName: string;
  currentIntentLabel: string;
  hardenDescription: string;
  exploitDescription: string;
  hardenTargets: NetworkIntentTargetOption[];
  exploitTargets: NetworkIntentTargetOption[];
}

export interface NetworkIntentPanelCallbacks {
  onAssign: (definitionId: NetworkPlanDefinitionId, cityId: string) => void;
  onHold: () => void;
  onClose: () => void;
}

function getCurrentPlanLabel(state: GameState, ownerCivId: string, sourceUnitId: string): string {
  const plan = Object.values(state.autonomyByCiv?.[ownerCivId]?.plans ?? {})
    .find(candidate => candidate.sourceUnitId === sourceUnitId);
  if (!plan) return 'Hold';
  const cityName = plan.target.kind === 'city' ? state.cities[plan.target.cityId]?.name : undefined;
  const verb = plan.definitionId === 'harden' ? 'Harden' : 'Exploit';
  return cityName ? `${verb} ${cityName}` : verb;
}

export function getNetworkIntentPanelModel(
  state: GameState,
  ownerCivId: string,
  sourceUnitId: string,
): NetworkIntentPanelModel {
  const source = state.units[sourceUnitId];
  const owner = state.civilizations[ownerCivId];
  const harden = NETWORK_PLAN_DEFINITIONS.harden;
  const exploit = NETWORK_PLAN_DEFINITIONS.exploit;
  const candidates = Object.values(state.cities)
    .filter(city => source && hexDistance(source.position, city.position) <= Math.max(harden.range, exploit.range))
    .sort((left, right) => left.id.localeCompare(right.id));
  const hardenTargets = candidates
    .filter(city => city.owner === ownerCivId)
    .map(city => ({ cityId: city.id, cityName: city.name }));
  const exploitTargets = candidates
    .filter(city => city.owner !== ownerCivId && owner && state.civilizations[city.owner]
      && isAtWar(owner.diplomacy, city.owner)
      && isAtWar(state.civilizations[city.owner].diplomacy, ownerCivId))
    .map(city => ({ cityId: city.id, cityName: city.name }));

  return {
    sourceName: UNIT_DEFINITIONS[source?.type ?? 'cyber_unit']?.name ?? 'Cyber Unit',
    currentIntentLabel: getCurrentPlanLabel(state, ownerCivId, sourceUnitId),
    hardenDescription: 'Harden a nearby friendly city (Load 1). The next cyber loss there is cut in half.',
    exploitDescription: 'Exploit a nearby city of a civilization you are at war with (Load 2). Transfers 10% of its gold at the end of its next turn; Cyber Defense Center and Harden reduce it.',
    hardenTargets,
    exploitTargets,
  };
}

function appendTargetButtons(
  panel: HTMLElement,
  label: string,
  description: string,
  targets: NetworkIntentTargetOption[],
  definitionId: NetworkPlanDefinitionId,
  callbacks: NetworkIntentPanelCallbacks,
): void {
  const section = document.createElement('section');
  section.style.cssText = 'margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.14);';
  const heading = document.createElement('strong');
  heading.textContent = label;
  section.appendChild(heading);
  const detail = document.createElement('p');
  detail.style.cssText = 'margin:5px 0 8px;font-size:12px;line-height:1.4;color:rgba(244,241,232,0.82);';
  detail.textContent = description;
  section.appendChild(detail);
  if (targets.length === 0) {
    const unavailable = document.createElement('div');
    unavailable.style.cssText = 'font-size:12px;color:rgba(244,241,232,0.6);';
    unavailable.textContent = definitionId === 'harden'
      ? 'No nearby friendly city is available.'
      : 'No nearby city belonging to a civilization you are at war with is available.';
    section.appendChild(unavailable);
  } else {
    for (const target of targets) {
      const button = createGameButton(`${label} ${target.cityName}`, definitionId === 'harden' ? 'secondary' : 'primary');
      button.style.margin = '4px 6px 0 0';
      button.addEventListener('click', () => callbacks.onAssign(definitionId, target.cityId));
      section.appendChild(button);
    }
  }
  panel.appendChild(section);
}

/** Creates the player-owned persistent intent surface; mutations stay in the caller's canonical system path. */
export function createNetworkIntentPanel(
  state: GameState,
  ownerCivId: string,
  sourceUnitId: string,
  callbacks: NetworkIntentPanelCallbacks,
): HTMLElement {
  const model = getNetworkIntentPanelModel(state, ownerCivId, sourceUnitId);
  const panel = document.createElement('div');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Network intent');
  panel.style.cssText = 'position:fixed;z-index:1600;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,470px);max-height:85vh;overflow:auto;padding:20px;border-radius:12px;background:#172033;color:#f4f1e8;border:1px solid rgba(232,193,112,0.6);box-shadow:0 20px 48px rgba(0,0,0,0.55);';

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0;font-size:20px;';
  title.textContent = `${model.sourceName} network intent`;
  panel.appendChild(title);
  const current = document.createElement('p');
  current.style.cssText = 'margin:8px 0 0;font-size:13px;color:#e8c170;';
  current.textContent = `Current intent: ${model.currentIntentLabel}`;
  panel.appendChild(current);

  appendTargetButtons(panel, 'Harden', model.hardenDescription, model.hardenTargets, 'harden', callbacks);
  appendTargetButtons(panel, 'Exploit', model.exploitDescription, model.exploitTargets, 'exploit', callbacks);

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:18px;';
  const hold = createGameButton('Hold', 'secondary');
  hold.addEventListener('click', callbacks.onHold);
  const close = createGameButton('Close', 'ghost');
  close.addEventListener('click', callbacks.onClose);
  footer.append(hold, close);
  panel.appendChild(footer);
  return panel;
}
