import type { NetworkPlanDefinitionId } from '@/core/autonomy-state';
import type { GameState } from '@/core/types';
import { getAutonomyCapacity, getAutonomyLoad } from '@/systems/autonomy-capacity';
import { getAutonomySurgeRules } from '@/systems/autonomy-postures';
import { getNetworkPlanDefinition } from '@/systems/network-plan-definitions';
import {
  type NetworkPlanRequest,
  previewNetworkPlan,
} from '@/systems/network-plan-system';
import { createGameButton } from '@/ui/ui-kit';

export interface NetworkPanelCandidate {
  label: string;
  request: NetworkPlanRequest;
  enabled: boolean;
  reason: string | null;
}

export interface NetworkPanelModel {
  active: boolean;
  statusText: string;
  posture: string;
  candidates: NetworkPanelCandidate[];
  activePlanIds: string[];
}

export interface NetworkPanelCallbacks {
  onAssign: (request: NetworkPlanRequest) => void;
  onCancel: (planId: string) => void;
  onSurge: (planId: string) => void;
  onPosture: (id: 'safeguarded' | 'integrated' | 'accelerated') => void;
  onClose: () => void;
}

const CITY_PLAN_IDS: readonly NetworkPlanDefinitionId[] = [
  'fabrication-sprint', 'research-mesh', 'logistics-routing', 'survey-grid',
];

const LABELS: Readonly<Record<NetworkPlanDefinitionId, string>> = {
  harden: 'Harden', exploit: 'Exploit', 'fabrication-sprint': 'Fabrication Sprint',
  'research-mesh': 'Research Mesh', 'logistics-routing': 'Logistics Routing',
  'survey-grid': 'Survey Grid', 'guardian-screen': 'Guardian Screen', 'swarm-strike': 'Swarm Strike',
};

function reasonForPreview(preview: ReturnType<typeof previewNetworkPlan>): string | null {
  if (preview.validation.ok) return null;
  if (preview.validation.reason === 'ordinary-load-exceeds-capacity') {
    return `Need ${Math.max(1, preview.load - preview.remainingCapacity)} more Capacity`;
  }
  return preview.validation.reason.replaceAll('-', ' ');
}

/** A compact, all-actions-reachable catalog. It deliberately recommends nothing hidden or future-only. */
export function getNetworkPanelModel(state: GameState, civId: string): NetworkPanelModel {
  const capacity = getAutonomyCapacity(state, civId);
  if (capacity.unrestricted === 0) {
    return { active: false, statusText: 'Network unavailable until Era 13', posture: 'Integrated', candidates: [], activePlanIds: [] };
  }
  const autonomy = state.autonomyByCiv?.[civId];
  const load = getAutonomyLoad(state, civId);
  const stable = autonomy?.surgeRecoveryUntilTurn === null;
  const candidates: NetworkPanelCandidate[] = [];
  const ownedCities = Object.values(state.cities).filter(candidate => candidate.owner === civId).sort((a, b) => a.id.localeCompare(b.id));
  for (const city of ownedCities) {
    for (const definitionId of CITY_PLAN_IDS) {
      const definition = getNetworkPlanDefinition(definitionId);
      const request: NetworkPlanRequest = {
        ownerCivId: civId,
        source: { kind: 'city', cityId: city.id },
        definitionId,
        target: { kind: 'city', cityId: city.id },
        ...(definitionId === 'research-mesh' ? { linkedCityIds: ownedCities.filter(candidate => candidate.id !== city.id).slice(0, 2).map(candidate => candidate.id) } : {}),
        ...(definitionId === 'survey-grid' ? { linkedUnitIds: state.civilizations[civId]?.units.slice(0, 3) ?? [] } : {}),
      };
      const preview = previewNetworkPlan(state, request);
      candidates.push({
        label: `${LABELS[definitionId]} · ${city.name} (Load ${preview.load})`, request,
        enabled: preview.validation.ok, reason: reasonForPreview(preview),
      });
    }
  }
  const posture = autonomy?.posture ?? 'integrated';
  const recovery = autonomy?.surgeRecoveryUntilTurn;
  const rules = getAutonomySurgeRules(posture);
  return {
    active: true,
    statusText: recovery !== null && recovery !== undefined && recovery > state.turn
      ? `Network: Recovering · ${load.unrestricted}/${capacity.unrestricted}`
      : `Network: Stable · ${load.unrestricted}/${capacity.unrestricted}`,
    posture: `${posture[0].toUpperCase()}${posture.slice(1)} · Surge ${rules.allowance}/${rules.recoveryRounds}`,
    candidates,
    activePlanIds: Object.values(autonomy?.plans ?? {}).filter(plan => plan.status === 'active').map(plan => plan.id).sort(),
  };
}

export function createNetworkPanel(model: NetworkPanelModel, callbacks: NetworkPanelCallbacks): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'network-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Autonomy Network');
  panel.style.cssText = 'position:fixed;z-index:1600;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,560px);max-height:85vh;overflow:auto;padding:20px;border-radius:12px;background:#172033;color:#f4f1e8;border:1px solid rgba(232,193,112,0.6);box-shadow:0 20px 48px rgba(0,0,0,0.55);';
  const title = document.createElement('h2');
  title.textContent = 'Autonomy Network';
  panel.appendChild(title);
  const status = document.createElement('p');
  status.textContent = model.statusText;
  panel.appendChild(status);
  const posture = document.createElement('p');
  posture.textContent = `Posture: ${model.posture}`;
  panel.appendChild(posture);
  const postureRow = document.createElement('div');
  for (const id of ['safeguarded', 'integrated', 'accelerated'] as const) {
    const button = createGameButton(id[0].toUpperCase() + id.slice(1), 'secondary');
    button.style.marginRight = '6px';
    button.addEventListener('click', () => callbacks.onPosture(id));
    postureRow.appendChild(button);
  }
  panel.appendChild(postureRow);
  const catalog = document.createElement('section');
  const heading = document.createElement('h3'); heading.textContent = 'Available plans'; catalog.appendChild(heading);
  if (!model.active) {
    const unavailable = document.createElement('p'); unavailable.textContent = model.statusText; catalog.appendChild(unavailable);
  }
  for (const candidate of model.candidates) {
    const button = createGameButton(`Assign ${candidate.label}`, candidate.enabled ? 'primary' : 'secondary', { disabled: !candidate.enabled });
    button.style.margin = '4px 6px 0 0';
    button.title = candidate.reason ?? 'Assign this plan';
    button.addEventListener('click', () => callbacks.onAssign(candidate.request));
    catalog.appendChild(button);
    if (candidate.reason) {
      const reason = document.createElement('div'); reason.textContent = candidate.reason; reason.style.fontSize = '12px'; catalog.appendChild(reason);
    }
  }
  panel.appendChild(catalog);
  for (const planId of model.activePlanIds) {
    const surge = createGameButton(`Surge ${planId}`, 'secondary'); surge.addEventListener('click', () => callbacks.onSurge(planId)); panel.appendChild(surge);
    const cancel = createGameButton(`Hold ${planId}`, 'ghost'); cancel.addEventListener('click', () => callbacks.onCancel(planId)); panel.appendChild(cancel);
  }
  const close = createGameButton('Close', 'ghost'); close.addEventListener('click', callbacks.onClose); panel.appendChild(close);
  return panel;
}
