// src/ui/espionage-panel.ts
import type { AdvisorType, GameState, Spy, SpyMissionType, SpyPromotion } from '../core/types';
import { canRecruitSpy, getAvailableMissions } from '../systems/espionage-system';

export interface MissionCatalogEntry {
  id: SpyMissionType;
  label: string;
  stage: 1 | 2 | 3 | 4;
}

export interface SpySummary {
  id: string;
  name: string;
  status: Spy['status'];
  targetCityId: string | null;
  targetCivId: string | null;
  experience: number;
  promotion?: SpyPromotion;
  promotionReady: boolean;
  currentMission: SpyMissionType | null;
}

export interface EspionagePanelData {
  spies: Spy[];
  spySummaries: SpySummary[];
  canRecruit: boolean;
  maxSpies: number;
  activeSpyCount: number;
  availableMissions: string[];
  missionCatalog: MissionCatalogEntry[];
  defendingCityIds: string[];
  disabledAdvisors: AdvisorType[];
}

export interface MissionStageGroup {
  stage: 1 | 2 | 3 | 4;
  title: string;
  description: string;
  missions: MissionCatalogEntry[];
}

export interface EspionagePanelViewModel extends EspionagePanelData {
  missionStages: MissionStageGroup[];
}

export type SpyAction = 'assign' | 'assign_defensive' | 'start_mission' | 'recall';

const MISSION_LABELS: Record<SpyMissionType, string> = {
  scout_area: 'Scout Area',
  monitor_troops: 'Monitor Troops',
  gather_intel: 'Gather Intel',
  identify_resources: 'Identify Resources',
  monitor_diplomacy: 'Monitor Diplomacy',
  steal_tech: 'Steal Tech',
  sabotage_production: 'Sabotage Production',
  incite_unrest: 'Incite Unrest',
  counter_espionage: 'Counter-Espionage',
  assassinate_advisor: 'Assassinate Advisor',
  forge_documents: 'Forge Documents',
  fund_rebels: 'Fund Rebels',
  arms_smuggling: 'Arms Smuggling',
};

const MISSION_STAGE: Record<SpyMissionType, 1 | 2 | 3 | 4> = {
  scout_area: 1,
  monitor_troops: 1,
  gather_intel: 2,
  identify_resources: 2,
  monitor_diplomacy: 2,
  steal_tech: 3,
  sabotage_production: 3,
  incite_unrest: 3,
  counter_espionage: 3,
  assassinate_advisor: 4,
  forge_documents: 4,
  fund_rebels: 4,
  arms_smuggling: 4,
};

function toMissionCatalog(missions: SpyMissionType[]): MissionCatalogEntry[] {
  return missions.map((mission) => ({
    id: mission,
    label: MISSION_LABELS[mission],
    stage: MISSION_STAGE[mission],
  }));
}

function buildMissionStageGroups(missionCatalog: MissionCatalogEntry[]): MissionStageGroup[] {
  const stages: Record<1 | 2 | 3 | 4, { title: string; description: string; missions: MissionCatalogEntry[] }> = {
    1: { title: 'Stage 1: Scouts', description: 'Passive intelligence and city perimeter awareness.', missions: [] },
    2: { title: 'Stage 2: Informants', description: 'Active reconnaissance and diplomatic spying.', missions: [] },
    3: { title: 'Stage 3: Spy Rings', description: 'Disruption, theft, and covert pressure.', missions: [] },
    4: { title: 'Stage 4: Shadow Operations', description: 'High-risk operations that shape empires.', missions: [] },
  };

  for (const mission of missionCatalog) {
    stages[mission.stage].missions.push(mission);
  }

  const stageOrder: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];
  return stageOrder.map(stage => ({
    stage,
    title: stages[stage].title,
    description: stages[stage].description,
    missions: stages[stage].missions,
  }));
}

export function getEspionagePanelViewModel(state: GameState): EspionagePanelViewModel {
  const base = getEspionagePanelData(state);
  return {
    ...base,
    missionStages: buildMissionStageGroups(base.missionCatalog),
  };
}

function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
}

function appendChip(parent: HTMLElement, label: string): void {
  const chip = createEl('span', label);
  chip.style.cssText = 'display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,0.08);font-size:11px;color:#e8eef8;';
  parent.appendChild(chip);
}

function appendSectionHeader(parent: HTMLElement, title: string, subtitle: string): void {
  const header = createEl('div');
  header.style.cssText = 'display:flex;flex-direction:column;gap:2px;margin-bottom:10px;';

  const titleEl = createEl('div', title);
  titleEl.style.cssText = 'font-size:13px;font-weight:700;color:#e8c170;';
  header.appendChild(titleEl);

  const subtitleEl = createEl('div', subtitle);
  subtitleEl.style.cssText = 'font-size:11px;opacity:0.7;line-height:1.35;';
  header.appendChild(subtitleEl);

  parent.appendChild(header);
}

function appendMissionStage(parent: HTMLElement, group: MissionStageGroup): void {
  const section = createEl('section');
  section.dataset.stage = String(group.stage);
  section.style.cssText = 'padding:10px 0;border-top:1px solid rgba(255,255,255,0.08);';

  appendSectionHeader(section, group.title, group.description);

  if (group.missions.length === 0) {
    section.appendChild(createEl('div', 'No missions unlocked.'));
    (section.lastChild as HTMLElement).style.cssText = 'font-size:11px;opacity:0.55;';
  } else {
    const list = createEl('div');
    list.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    for (const mission of group.missions) {
      const item = createEl('div');
      item.dataset.missionId = mission.id;
      item.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,0.06);font-size:11px;';
      item.appendChild(createEl('span', mission.label));
      const stageTag = createEl('span', `S${mission.stage}`);
      stageTag.style.cssText = 'color:#e8c170;font-size:10px;font-weight:700;';
      item.appendChild(stageTag);
      list.appendChild(item);
    }
    section.appendChild(list);
  }

  parent.appendChild(section);
}

function appendSpyCard(parent: HTMLElement, state: GameState, spy: SpySummary): void {
  const card = createEl('article');
  card.dataset.spyId = spy.id;
  card.style.cssText = 'padding:10px;border-radius:10px;background:rgba(255,255,255,0.06);display:flex;flex-direction:column;gap:8px;';

  const top = createEl('div');
  top.style.cssText = 'display:flex;justify-content:space-between;gap:10px;';

  const nameBlock = createEl('div');
  nameBlock.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
  const nameEl = createEl('div', spy.name);
  nameEl.style.cssText = 'font-size:13px;font-weight:700;';
  nameBlock.appendChild(nameEl);
  const status = createEl('div', `${spy.status} · XP ${spy.experience}`);
  status.style.cssText = 'font-size:11px;opacity:0.75;';
  nameBlock.appendChild(status);
  top.appendChild(nameBlock);

  const promo = createEl('div', spy.promotion ?? (spy.promotionReady ? 'promotion ready' : 'no promotion'));
  promo.dataset.spyPromotion = spy.promotion ?? '';
  promo.style.cssText = 'font-size:11px;color:#e8c170;text-align:right;';
  top.appendChild(promo);
  card.appendChild(top);

  const target = createEl('div', spy.targetCivId ? `Target: ${spy.targetCivId} / ${spy.targetCityId ?? 'unknown city'}` : 'No target assigned');
  target.style.cssText = 'font-size:11px;opacity:0.7;';
  card.appendChild(target);

  const actions = getSpyActions(state, spy.id);
  if (actions.length > 0) {
    const actionRow = createEl('div');
    actionRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    for (const action of actions) {
      appendChip(actionRow, action.replace(/_/g, ' '));
    }
    card.appendChild(actionRow);
  }

  parent.appendChild(card);
}

function appendBulletList(parent: HTMLElement, items: string[], emptyText: string): void {
  if (items.length === 0) {
    const empty = createEl('div', emptyText);
    empty.style.cssText = 'font-size:11px;opacity:0.55;';
    parent.appendChild(empty);
    return;
  }

  const list = createEl('div');
  list.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
  for (const item of items) appendChip(list, item);
  parent.appendChild(list);
}

export function createEspionagePanel(state: GameState): HTMLDivElement {
  const data = getEspionagePanelViewModel(state);
  const panel = createEl('div');
  panel.id = 'espionage-panel';
  panel.style.cssText = 'display:flex;flex-direction:column;gap:14px;padding:14px;border-radius:14px;background:rgba(12,16,28,0.96);color:#f5f7fb;';
  panel.dataset.panel = 'espionage';

  appendSectionHeader(
    panel,
    'Espionage',
    `Spies ${data.activeSpyCount}/${data.maxSpies} · ${data.canRecruit ? 'Recruitment available' : 'No recruitment available'}`,
  );

  const missionBlock = createEl('section');
  missionBlock.dataset.section = 'missions';
  appendSectionHeader(missionBlock, 'Mission Tiers', 'Available operations grouped by stage.');
  for (const group of data.missionStages) appendMissionStage(missionBlock, group);
  panel.appendChild(missionBlock);

  const spiesBlock = createEl('section');
  spiesBlock.dataset.section = 'spies';
  appendSectionHeader(spiesBlock, 'Spy Roster', 'Current assignments, promotion state, and mission posture.');
  if (data.spySummaries.length === 0) {
    const empty = createEl('div', 'No active spies.');
    empty.style.cssText = 'font-size:11px;opacity:0.55;';
    spiesBlock.appendChild(empty);
  } else {
    for (const spy of data.spySummaries) appendSpyCard(spiesBlock, state, spy);
  }
  panel.appendChild(spiesBlock);

  const defenseBlock = createEl('section');
  defenseBlock.dataset.section = 'defense';
  appendSectionHeader(defenseBlock, 'Defensive Coverage', 'Cities currently receiving stationed spy coverage.');
  appendBulletList(defenseBlock, data.defendingCityIds, 'No cities are being defended by spies.');
  panel.appendChild(defenseBlock);

  const advisorBlock = createEl('section');
  advisorBlock.dataset.section = 'disabled-advisors';
  appendSectionHeader(advisorBlock, 'Disabled Advisors', 'Advisor systems currently shut down by sabotage.');
  appendBulletList(advisorBlock, data.disabledAdvisors, 'No advisors are disabled.');
  panel.appendChild(advisorBlock);

  return panel;
}

export function getEspionagePanelData(state: GameState): EspionagePanelData {
  const civEsp = state.espionage?.[state.currentPlayer];
  if (!civEsp) {
    return {
      spies: [],
      spySummaries: [],
      canRecruit: false,
      maxSpies: 0,
      activeSpyCount: 0,
      availableMissions: [],
      missionCatalog: [],
      defendingCityIds: [],
      disabledAdvisors: [],
    };
  }

  const spies = Object.values(civEsp.spies).filter(s => s.owner === state.currentPlayer);
  const activeSpyCount = spies.filter(s => s.status !== 'captured').length;
  const completedTechs = state.civilizations[state.currentPlayer]?.techState.completed ?? [];
  const availableMissions = getAvailableMissions(completedTechs);
  const disabledAdvisors = Object.entries(
    state.civilizations[state.currentPlayer]?.advisorDisabledUntil ?? {},
  )
    .filter(([, disabledUntil]) => disabledUntil !== undefined && disabledUntil >= state.turn)
    .map(([advisor]) => advisor as AdvisorType);
  const defendingCityIds = spies
    .filter(s => s.status === 'stationed' && s.targetCivId === null && s.targetCityId !== null)
    .map(s => s.targetCityId!)
    .sort();
  const spySummaries = spies.map((spy) => ({
    id: spy.id,
    name: spy.name,
    status: spy.status,
    targetCityId: spy.targetCityId,
    targetCivId: spy.targetCivId,
    experience: spy.experience,
    promotion: spy.promotion,
    promotionReady: spy.promotionAvailable || (spy.experience >= 60 && spy.promotion === undefined),
    currentMission: spy.currentMission?.type ?? null,
  }));

  return {
    spies,
    spySummaries,
    canRecruit: canRecruitSpy(civEsp),
    maxSpies: civEsp.maxSpies,
    activeSpyCount,
    availableMissions,
    missionCatalog: toMissionCatalog(availableMissions),
    defendingCityIds,
    disabledAdvisors,
  };
}

export function getSpyActions(state: GameState, spyId: string): SpyAction[] {
  const civEsp = state.espionage?.[state.currentPlayer];
  if (!civEsp) return [];
  const spy = civEsp.spies[spyId];
  if (!spy) return [];

  const actions: SpyAction[] = [];

  switch (spy.status) {
    case 'idle':
      actions.push('assign', 'assign_defensive');
      break;
    case 'stationed':
      if (!spy.currentMission && spy.targetCivId) {
        actions.push('start_mission');
      }
      actions.push('recall');
      break;
    case 'traveling':
      actions.push('recall');
      break;
    case 'captured':
    case 'cooldown':
    case 'on_mission':
      // No actions available
      break;
  }

  return actions;
}
