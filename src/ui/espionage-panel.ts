// src/ui/espionage-panel.ts
import type { AdvisorType, GameState, Spy, SpyMissionType, SpyPromotion, InterrogationIntel } from '../core/types';
import { getAvailableMissions, getEspionageModifierBreakdown, getMissionDuration, getSpySuccessChance, missionRequiresPlacedSpy } from '../systems/espionage-system';
import { getProductionLabel } from '../systems/economy-system';

export interface MissionCatalogEntry {
  id: SpyMissionType;
  label: string;
  stage: 1 | 2 | 3 | 4 | 5;
  accessLabel: string;
  description: string;
  durationTurns: number;
}

export interface SpySummary {
  id: string;
  name: string;
  status: Spy['status'];
  targetCityId: string | null;
  targetCivId: string | null;
  infiltrationCityId?: string | null;
  experience: number;
  promotion?: SpyPromotion;
  promotionReady: boolean;
  currentMission: SpyMissionType | null;
  cooldownMode?: 'stay_low' | 'passive_observe';
  lastSweepTurn?: number;
  /** cyber-intelligence: full production queue of the infiltrated city, when stationed/embedded there. */
  revealedProductionQueue?: string[];
}

export interface EspionagePanelData {
  spies: Spy[];
  spySummaries: SpySummary[];
  maxSpies: number;
  activeSpyCount: number;
  availableMissions: string[];
  missionCatalog: MissionCatalogEntry[];
  defendingCityIds: string[];
  disabledAdvisors: AdvisorType[];
  threatBoard: Array<{ cityId: string; foreignCivId: string; confidence: 'detected' }>;
  recentDetections: Array<{ position: { q: number; r: number }; turn: number; wasDisguised: boolean }>;
  missionSuccessChances?: Partial<Record<SpyMissionType, number>>;
  missionSuccessBreakdown?: Partial<Record<SpyMissionType, string>>;
  currentTurn: number;
  // #442 MR2 signals_intercept: the latest empire-wide troop snapshot per target civ this
  // player has intercepted. Without this, the computed data would never be rendered
  // (end-to-end-wiring.md "dead computed data is a bug").
  signalsIntelligence: Array<{ targetCivId: string; targetCivName: string; turn: number; unitCount: number }>;
  // Post-#442 audit fix: monitor_troops/gather_intel/identify_resources/monitor_diplomacy
  // reports, presented the same way as signalsIntelligence above — resolved to display
  // names here so the panel never needs to re-read live target state.
  troopReports: Array<{ targetCivId: string; targetCivName: string; cityId: string; cityName: string; turn: number; unitCount: number }>;
  intelReports: Array<{ targetCivId: string; targetCivName: string; turn: number; completedTechCount: number; currentResearch: string | null; treasury: number; treatyCount: number }>;
  resourceReports: Array<{ targetCivId: string; targetCivName: string; cityId: string; cityName: string; turn: number; resources: string[] }>;
  diplomacyReports: Array<{ targetCivId: string; targetCivName: string; turn: number; relationships: Array<{ civId: string; civName: string; value: number }>; tradePartnerNames: string[] }>;
}

export interface MissionStageGroup {
  stage: 1 | 2 | 3 | 4 | 5;
  title: string;
  description: string;
  missions: MissionCatalogEntry[];
}

export interface EspionagePanelViewModel extends EspionagePanelData {
  missionStages: MissionStageGroup[];
}

export type SpyAction = 'assign' | 'assign_defensive' | 'start_mission' | 'recall' | 'verify_agent';

export interface EspionagePanelCallbacks {
  onClose: () => void;
  onAssignDefensive?: (spyId: string) => void;
  onStartMission?: (spyId: string) => void;
  onRecall?: (spyId: string) => void;
  onVerifyAgent?: (spyId: string) => void;
  onExfiltrate?: (spyId: string) => void;
  onToggleCooldownMode?: (spyId: string) => void;
  onUnembed?: (spyId: string) => void;
  onSweep?: (spyId: string) => void;
}

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
  flip_loyalty: 'Flip Loyalty',
  cyber_attack: 'Cyber Attack',
  misinformation_campaign: 'Misinformation Campaign',
  election_interference: 'Election Interference',
  satellite_surveillance: 'Satellite Surveillance',
  sabotage_relief: 'Sabotage Relief',
  intercept_courier: 'Intercept Courier',
  bribe_official: 'Bribe Official',
  expose_scandal: 'Expose Scandal',
  signals_intercept: 'Signals Intercept',
};

// #442 MR1 review: the mission catalog previously showed only a label, stage tag, and
// access tag — no plain-language effect text anywhere, for any mission (not just the two
// added here). That fails CLAUDE.md's "all UI elements must be self-explanatory" rule and
// the precedent set by world-pressure interactions ("cost, effect, and risk inline at the
// point of choice" — docs/superpowers/specs/2026-07-11-world-pressure-symmetry-design.md).
// Fixed for the whole catalog rather than just the two new missions, so descriptions don't
// appear inconsistently between old and new entries.
const MISSION_DESCRIPTIONS: Record<SpyMissionType, string> = {
  scout_area: 'Reveals the fog of war around the target city.',
  monitor_troops: 'Reveals enemy unit positions and strength near the target city.',
  gather_intel: "Reveals the target's tech progress, treasury, and treaties.",
  identify_resources: "Reveals strategic resources in the target city's territory.",
  monitor_diplomacy: "Reveals the target's relationships and trade partners.",
  steal_tech: "Copies one technology the target has that you don't.",
  sabotage_production: "Destroys several turns of the target city's production progress.",
  incite_unrest: 'Increases unrest in the target city.',
  counter_espionage: 'Passively strengthens counter-intelligence in the defending city.',
  assassinate_advisor: 'Disables one of the target empire\'s advisors for 10 turns.',
  forge_documents: 'Frames the target, damaging their relationship with another civilization.',
  fund_rebels: 'Escalates unrest further in an already-unstable city.',
  arms_smuggling: 'Spawns a hostile armed group near the target city.',
  flip_loyalty: 'Peacefully defects a non-capital foreign city to your empire.',
  cyber_attack: "Disables the target city's production for several turns.",
  misinformation_campaign: "Slows the target empire's research for several turns.",
  election_interference: 'Injects unrest and political instability into the target city.',
  satellite_surveillance: "Grants ongoing vision of the target empire's territory.",
  sabotage_relief: "Delays a rival's crisis relief; witnessed civilizations notice if discovered.",
  intercept_courier: "Severs the target city's most valuable active trade route.",
  bribe_official: "Steals a capped share of the target empire's treasury.",
  expose_scandal: 'Exposes the target\'s secret dealings, damaging their relationship with up to 4 of their treaty partners.',
  signals_intercept: "One-time snapshot of the target empire's unit positions and strength, empire-wide.",
};

const MISSION_STAGE: Record<SpyMissionType, 1 | 2 | 3 | 4 | 5> = {
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
  flip_loyalty: 4, // propaganda is era 6, same "Shadow Operations" UI bucket as the other era 5-6 Stage 4 missions
  cyber_attack: 5,
  misinformation_campaign: 5,
  election_interference: 5,
  satellite_surveillance: 5,
  sabotage_relief: 5, // covert-operations is era 7, same UI bucket as the other era 5-7 missions
  intercept_courier: 4, // #442 MR1: black-chambers is era 5, same "Shadow Operations" UI bucket as flip_loyalty/other era 5-6 Stage 4 missions
  bribe_official: 4, // #442 MR1: diplomatic-networks is era 5, same UI bucket as above
  expose_scandal: 5, // #442 MR2: disinformation-bureau is era 8, same "higher stakes" bucket as sabotage_relief (era 7)
  signals_intercept: 5, // #442 MR2: counterintelligence is era 9, same bucket as above
};

function toMissionCatalog(missions: SpyMissionType[]): MissionCatalogEntry[] {
  return missions.map((mission) => ({
    id: mission,
    label: MISSION_LABELS[mission],
    stage: MISSION_STAGE[mission],
    accessLabel: missionRequiresPlacedSpy(mission) ? 'Requires placed spy' : 'Remote-capable',
    description: MISSION_DESCRIPTIONS[mission],
    durationTurns: getMissionDuration(mission),
  }));
}

function buildMissionStageGroups(missionCatalog: MissionCatalogEntry[]): MissionStageGroup[] {
  const stages: Record<1 | 2 | 3 | 4 | 5, { title: string; description: string; missions: MissionCatalogEntry[] }> = {
    1: { title: 'Stage 1: Scouts', description: 'Passive intelligence and city perimeter awareness.', missions: [] },
    2: { title: 'Stage 2: Informants', description: 'Active reconnaissance and diplomatic spying.', missions: [] },
    3: { title: 'Stage 3: Spy Rings', description: 'Disruption, theft, and covert pressure.', missions: [] },
    4: { title: 'Stage 4: Shadow Operations', description: 'High-risk operations that shape empires.', missions: [] },
    5: { title: 'Stage 5: Digital Warfare', description: 'Remote disruption and global surveillance. Higher stakes, higher diplomatic fallout.', missions: [] },
  };

  for (const mission of missionCatalog) {
    stages[mission.stage].missions.push(mission);
  }

  const stageOrder: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];
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

function appendActionButton(
  parent: HTMLElement,
  label: string,
  action: string,
  onClick: () => void,
): void {
  const button = createEl('button', label);
  button.dataset.action = action;
  button.style.cssText = 'padding:6px 10px;border:1px solid rgba(255,255,255,0.16);border-radius:8px;background:rgba(255,255,255,0.06);color:#f5f7fb;font-size:11px;cursor:pointer;';
  button.addEventListener('click', onClick);
  parent.appendChild(button);
}

function appendMissionStage(
  parent: HTMLElement,
  group: MissionStageGroup,
  successChances?: Partial<Record<SpyMissionType, number>>,
  successBreakdown?: Partial<Record<SpyMissionType, string>>,
): void {
  const section = createEl('section');
  section.dataset.stage = String(group.stage);
  section.style.cssText = 'padding:10px 0;border-top:1px solid rgba(255,255,255,0.08);';

  appendSectionHeader(section, group.title, group.description);

  if (group.missions.length === 0) {
    const empty = createEl('div', 'No missions unlocked.');
    empty.style.cssText = 'font-size:11px;opacity:0.55;';
    section.appendChild(empty);
  } else {
    const list = createEl('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    for (const mission of group.missions) {
      const item = createEl('div');
      item.dataset.missionId = mission.id;
      item.style.cssText = 'display:flex;flex-direction:column;gap:3px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,0.06);font-size:11px;';

      const topRow = createEl('div');
      topRow.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:6px;';
      topRow.appendChild(createEl('span', mission.label));
      const stageTag = createEl('span', `S${mission.stage}`);
      stageTag.style.cssText = 'color:#e8c170;font-size:10px;font-weight:700;';
      topRow.appendChild(stageTag);
      const accessTag = createEl('span', mission.accessLabel);
      accessTag.style.cssText = 'color:#9dd1ff;font-size:10px;';
      topRow.appendChild(accessTag);
      const durationTag = createEl('span', `${mission.durationTurns} turn${mission.durationTurns === 1 ? '' : 's'}`);
      durationTag.style.cssText = 'color:#b8bfd0;font-size:10px;';
      topRow.appendChild(durationTag);
      if (successChances && successChances[mission.id] !== undefined) {
        const pct = Math.round((successChances[mission.id] as number) * 100);
        const pctTag = createEl('span', `${pct}%`);
        pctTag.style.cssText = 'color:#7cff8a;font-size:10px;font-weight:700;';
        const breakdown = successBreakdown?.[mission.id];
        if (breakdown) pctTag.title = `Modifiers: ${breakdown}`;
        topRow.appendChild(pctTag);
      }
      item.appendChild(topRow);

      const descriptionEl = createEl('div', mission.description);
      descriptionEl.dataset.missionDescription = 'true';
      descriptionEl.style.cssText = 'font-size:10px;opacity:0.75;line-height:1.3;';
      item.appendChild(descriptionEl);

      list.appendChild(item);
    }
    section.appendChild(list);
  }

  parent.appendChild(section);
}

function appendSpyCard(
  parent: HTMLElement,
  state: GameState,
  spy: SpySummary,
  callbacks: EspionagePanelCallbacks,
): void {
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

  if (spy.revealedProductionQueue !== undefined) {
    const queueLabel = spy.revealedProductionQueue.length > 0
      ? `Production queue: ${spy.revealedProductionQueue.join(', ')}`
      : 'Production queue: empty';
    const queueEl = createEl('div', queueLabel);
    queueEl.dataset.spyRevealedQueue = 'true';
    queueEl.style.cssText = 'font-size:11px;color:#e8c170;opacity:0.85;';
    card.appendChild(queueEl);
  }

  const actions = getSpyActions(state, spy.id);
  if (spy.status === 'captured') {
    const capturedDiv = createEl('div', `${spy.name} has been captured! Awaiting the captor's verdict.`);
    capturedDiv.className = 'spy-captured-notice';
    capturedDiv.style.cssText = 'font-size:11px;color:#ff9966;padding:4px 0;';
    card.appendChild(capturedDiv);
  }

  if (actions.length > 0) {
    const actionRow = createEl('div');
    actionRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    for (const action of actions) {
      const actionLabel = action.replace(/_/g, ' ');
      if (action === 'assign_defensive' && callbacks.onAssignDefensive) {
        appendActionButton(actionRow, actionLabel, action, () => callbacks.onAssignDefensive?.(spy.id));
      } else if (action === 'start_mission' && callbacks.onStartMission) {
        appendActionButton(actionRow, actionLabel, action, () => callbacks.onStartMission?.(spy.id));
      } else if (action === 'recall' && callbacks.onRecall) {
        appendActionButton(actionRow, action, action, () => callbacks.onRecall?.(spy.id));
      } else if (action === 'verify_agent' && callbacks.onVerifyAgent) {
        appendActionButton(actionRow, 'verify agent', action, () => callbacks.onVerifyAgent?.(spy.id));
      } else {
        appendChip(actionRow, actionLabel);
      }
    }
    if (spy.status === 'stationed' && spy.infiltrationCityId && callbacks.onExfiltrate) {
      appendActionButton(actionRow, 'exfiltrate (8 turn cooldown)', 'exfiltrate', () => callbacks.onExfiltrate?.(spy.id));
    }
    if (spy.status === 'embedded' && spy.targetCityId) {
      if (callbacks.onUnembed) {
        appendActionButton(actionRow, 'Unembed (5 turn cooldown)', 'unembed', () => callbacks.onUnembed!(spy.id));
      }
      if (callbacks.onSweep) {
        const alreadySwept = spy.lastSweepTurn === state.turn;
        if (!alreadySwept) {
          appendActionButton(actionRow, 'Run Sweep', 'sweep', () => callbacks.onSweep!(spy.id));
        } else {
          appendChip(actionRow, 'Sweep done this turn');
        }
      }
    }
    if (spy.status === 'cooldown' && spy.infiltrationCityId && callbacks.onToggleCooldownMode) {
      const current = spy.cooldownMode ?? 'stay_low';
      const label = current === 'passive_observe' ? 'Passive Observe (higher risk)' : 'Stay Low (safer)';
      const btn = createEl('button', `Mode: ${label}`);
      btn.dataset.action = 'toggle-mode';
      btn.style.cssText = 'padding:6px 10px;border:1px solid rgba(255,255,255,0.16);border-radius:8px;background:rgba(255,255,255,0.06);color:#f5f7fb;font-size:11px;cursor:pointer;';
      btn.title = 'Stay Low: 2% detection risk per turn. Passive Observe: 4% but grants basic intel at cooldown end.';
      btn.addEventListener('click', () => callbacks.onToggleCooldownMode?.(spy.id));
      actionRow.appendChild(btn);
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

function appendThreatBoard(
  parent: HTMLElement,
  threats: Array<{ cityId: string; foreignCivId: string; confidence: 'detected' }>,
): void {
  const threatBlock = createEl('section');
  threatBlock.dataset.section = 'threat-board';
  appendSectionHeader(threatBlock, 'Threat Board', 'Detected foreign spy activity in your cities.');

  if (threats.length === 0) {
    const empty = createEl('div', 'No foreign spy activity detected.');
    empty.style.cssText = 'font-size:11px;opacity:0.55;';
    threatBlock.appendChild(empty);
    parent.appendChild(threatBlock);
    return;
  }

  for (const threat of threats) {
    const row = createEl('div', `${threat.cityId} · ${threat.foreignCivId} · ${threat.confidence}`);
    row.style.cssText = 'font-size:11px;opacity:0.8;padding:4px 0;';
    threatBlock.appendChild(row);
  }

  parent.appendChild(threatBlock);
}

function appendRecentDetections(
  parent: HTMLElement,
  detections: Array<{ position: { q: number; r: number }; turn: number; wasDisguised: boolean }>,
): void {
  const block = createEl('section');
  block.dataset.section = 'recent-detections';
  appendSectionHeader(block, 'Recent Detections', 'Spy units spotted near your territory this game.');

  if (detections.length === 0) {
    const empty = createEl('div', 'No spy sightings recorded.');
    empty.style.cssText = 'font-size:11px;opacity:0.55;';
    block.appendChild(empty);
    parent.appendChild(block);
    return;
  }

  for (const d of [...detections].reverse().slice(0, 5)) {
    const label = d.wasDisguised ? 'disguised unit' : 'spy unit';
    const row = createEl('div', `Turn ${d.turn} · ${label} at (${d.position.q}, ${d.position.r})`);
    row.style.cssText = 'font-size:11px;opacity:0.8;padding:4px 0;';
    block.appendChild(row);
  }

  parent.appendChild(block);
}

// #442 MR2 signals_intercept: renders the persisted snapshot from
// EspionagePanelData.signalsIntelligence — see that field's doc comment for why this
// exists (dead-computed-data avoidance).
function appendSignalsIntelligence(
  parent: HTMLElement,
  snapshots: Array<{ targetCivId: string; targetCivName: string; turn: number; unitCount: number }>,
  currentTurn: number,
): void {
  const block = createEl('section');
  block.dataset.section = 'signals-intelligence';
  appendSectionHeader(block, 'Signals Intelligence', 'Latest intercepted troop snapshots. Ages fast — positions may have changed.');

  if (snapshots.length === 0) {
    const empty = createEl('div', 'No signals intelligence gathered yet.');
    empty.style.cssText = 'font-size:11px;opacity:0.55;';
    block.appendChild(empty);
    parent.appendChild(block);
    return;
  }

  for (const snapshot of [...snapshots].sort((a, b) => b.turn - a.turn)) {
    const age = currentTurn - snapshot.turn;
    const row = createEl(
      'div',
      `${snapshot.targetCivName}: ${snapshot.unitCount} unit${snapshot.unitCount === 1 ? '' : 's'} spotted (turn ${snapshot.turn}, ${age === 0 ? 'this turn' : `${age} turn${age === 1 ? '' : 's'} ago`})`,
    );
    row.dataset.signalsTarget = snapshot.targetCivId;
    row.style.cssText = 'font-size:11px;opacity:0.8;padding:4px 0;';
    block.appendChild(row);
  }

  parent.appendChild(block);
}

// UX review finding: the espionage panel already had 8 top-level sections before this
// fix; appending 4 more independent top-level sections (5 counting Signals Intelligence)
// would mean 12 stacked sections, most showing an empty placeholder in the common
// early-game case -- real scroll fatigue on a mobile-first panel. Groups every intel
// snapshot type under one coherent parent section instead (this is what fully commits
// to "expand Signals Intelligence into a general Intelligence Reports section" rather
// than leaving it as a sibling). Each sub-block keeps its own `data-section` for DOM
// testability -- findAll() recurses through children regardless of nesting depth, so
// existing signals-intelligence tests are unaffected by the move. The append* helpers
// already accept any HTMLElement as their parent, so this only changes what gets passed
// in -- no change to how any individual sub-block is built or styled.
function appendIntelligenceReportsGroup(panel: HTMLElement, data: EspionagePanelData): void {
  const group = createEl('section');
  group.dataset.section = 'intelligence-reports';
  group.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:10px 0;border-top:1px solid rgba(255,255,255,0.08);';
  appendSectionHeader(
    group,
    'Intelligence Reports',
    'Everything your spies have learned about rivals, grouped by source. Snapshots only — they age fast and do not track live enemy state.',
  );

  appendSignalsIntelligence(group, data.signalsIntelligence, data.currentTurn);
  appendTroopReports(group, data.troopReports, data.currentTurn);
  appendIntelReports(group, data.intelReports, data.currentTurn);
  appendResourceReports(group, data.resourceReports, data.currentTurn);
  appendDiplomacyReports(group, data.diplomacyReports, data.currentTurn);

  panel.appendChild(group);
}

function formatAge(currentTurn: number, reportTurn: number): string {
  const age = currentTurn - reportTurn;
  return age === 0 ? 'this turn' : `${age} turn${age === 1 ? '' : 's'} ago`;
}

// Post-#442 audit fix: monitor_troops was computing nearbyUnits (city-radius troop
// observation) and discarding it — same dead-computed-data bug signals_intercept fixed
// for the empire-wide case above, now fixed for the city-scoped case.
function appendTroopReports(
  parent: HTMLElement,
  reports: EspionagePanelData['troopReports'],
  currentTurn: number,
): void {
  const block = createEl('section');
  block.dataset.section = 'troop-reports';
  appendSectionHeader(block, 'Troop Reports', 'Latest observed enemy unit counts near watched cities. Ages fast.');

  if (reports.length === 0) {
    const empty = createEl('div', 'No troop reports gathered yet.');
    empty.style.cssText = 'font-size:11px;opacity:0.55;';
    block.appendChild(empty);
    parent.appendChild(block);
    return;
  }

  for (const report of [...reports].sort((a, b) => b.turn - a.turn)) {
    const row = createEl(
      'div',
      `${report.cityName} (${report.targetCivName}): ${report.unitCount} unit${report.unitCount === 1 ? '' : 's'} observed (turn ${report.turn}, ${formatAge(currentTurn, report.turn)})`,
    );
    row.dataset.troopReportCity = report.cityId;
    row.style.cssText = 'font-size:11px;opacity:0.8;padding:4px 0;';
    block.appendChild(row);
  }

  parent.appendChild(block);
}

function appendIntelReports(
  parent: HTMLElement,
  reports: EspionagePanelData['intelReports'],
  currentTurn: number,
): void {
  const block = createEl('section');
  block.dataset.section = 'intel-reports';
  appendSectionHeader(block, 'Civ Intelligence', 'Latest tech, treasury, and treaty snapshots gathered on rival civilizations.');

  if (reports.length === 0) {
    const empty = createEl('div', 'No civ intelligence gathered yet.');
    empty.style.cssText = 'font-size:11px;opacity:0.55;';
    block.appendChild(empty);
    parent.appendChild(block);
    return;
  }

  for (const report of [...reports].sort((a, b) => b.turn - a.turn)) {
    const researchLabel = report.currentResearch ?? 'nothing';
    const row = createEl(
      'div',
      `${report.targetCivName}: ${report.completedTechCount} techs completed, researching ${researchLabel}, ~${report.treasury}🪙 treasury, ${report.treatyCount} active treat${report.treatyCount === 1 ? 'y' : 'ies'} (turn ${report.turn}, ${formatAge(currentTurn, report.turn)})`,
    );
    row.dataset.intelReportTarget = report.targetCivId;
    row.style.cssText = 'font-size:11px;opacity:0.8;padding:4px 0;';
    block.appendChild(row);
  }

  parent.appendChild(block);
}

function appendResourceReports(
  parent: HTMLElement,
  reports: EspionagePanelData['resourceReports'],
  currentTurn: number,
): void {
  const block = createEl('section');
  block.dataset.section = 'resource-reports';
  appendSectionHeader(block, 'Resource Intelligence', 'Latest strategic resources identified in watched cities\' territory.');

  if (reports.length === 0) {
    const empty = createEl('div', 'No resource intelligence gathered yet.');
    empty.style.cssText = 'font-size:11px;opacity:0.55;';
    block.appendChild(empty);
    parent.appendChild(block);
    return;
  }

  for (const report of [...reports].sort((a, b) => b.turn - a.turn)) {
    const resourceLabel = report.resources.length > 0 ? report.resources.join(', ') : 'none found';
    const row = createEl(
      'div',
      `${report.cityName} (${report.targetCivName}): ${resourceLabel} (turn ${report.turn}, ${formatAge(currentTurn, report.turn)})`,
    );
    row.dataset.resourceReportCity = report.cityId;
    row.style.cssText = 'font-size:11px;opacity:0.8;padding:4px 0;';
    block.appendChild(row);
  }

  parent.appendChild(block);
}

function appendDiplomacyReports(
  parent: HTMLElement,
  reports: EspionagePanelData['diplomacyReports'],
  currentTurn: number,
): void {
  const block = createEl('section');
  block.dataset.section = 'diplomacy-reports';
  appendSectionHeader(block, 'Diplomatic Intelligence', 'Latest known relationships and trade partners for watched civilizations.');

  if (reports.length === 0) {
    const empty = createEl('div', 'No diplomatic intelligence gathered yet.');
    empty.style.cssText = 'font-size:11px;opacity:0.55;';
    block.appendChild(empty);
    parent.appendChild(block);
    return;
  }

  for (const report of [...reports].sort((a, b) => b.turn - a.turn)) {
    const relLabel = report.relationships.length > 0
      ? report.relationships.map(r => `${r.civName} ${r.value >= 0 ? '+' : ''}${r.value}`).join(', ')
      : 'no known relationships';
    const tradeLabel = report.tradePartnerNames.length > 0 ? report.tradePartnerNames.join(', ') : 'none';
    const row = createEl(
      'div',
      `${report.targetCivName}: relations — ${relLabel}; trade partners — ${tradeLabel} (turn ${report.turn}, ${formatAge(currentTurn, report.turn)})`,
    );
    row.dataset.diplomacyReportTarget = report.targetCivId;
    row.style.cssText = 'font-size:11px;opacity:0.8;padding:4px 0;';
    block.appendChild(row);
  }

  parent.appendChild(block);
}

function formatIntelItem(item: InterrogationIntel): string {
  switch (item.type) {
    case 'spy_identity': return `Enemy spy ${item.data.spyName as string} is currently ${item.data.status as string}${item.data.location ? ` in ${item.data.location as string}` : ''}`;
    case 'city_location': return `Revealed city ${item.data.cityName as string} at position ${JSON.stringify(item.data.position)}`;
    case 'production_queue': return `${item.data.cityName as string} is producing: ${(item.data.queue as string[]).join(', ')}`;
    case 'wonder_in_progress': return `${item.data.cityId as string} is building wonder ${item.data.wonderId as string}`;
    case 'map_area': return `Received map data for ${(item.data.tiles as unknown[]).length} tiles (may be outdated)`;
    case 'tech_hint': return `Research hint: ${item.data.techId as string} (+5% progress)`;
    default: return 'Unknown intel';
  }
}

function showIntelModal(intel: InterrogationIntel[]): void {
  const existing = document.getElementById('intel-modal');
  if (existing) existing.remove();

  const modal = createEl('div');
  modal.id = 'intel-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';

  const inner = createEl('div');
  inner.style.cssText = 'background:#1a1e2e;border-radius:12px;padding:20px;max-width:400px;width:90%;display:flex;flex-direction:column;gap:10px;color:#f5f7fb;';

  const title = createEl('h3', 'Extracted Intel');
  title.style.cssText = 'margin:0;font-size:14px;color:#e8c170;';
  inner.appendChild(title);

  if (intel.length === 0) {
    inner.appendChild(createEl('p', 'No intel extracted yet.'));
  } else {
    for (const item of intel) {
      const p = createEl('p', formatIntelItem(item));
      p.style.cssText = 'margin:0;font-size:12px;opacity:0.85;';
      inner.appendChild(p);
    }
  }

  const closeBtn = createEl('button', 'Close');
  closeBtn.style.cssText = 'padding:8px 14px;border-radius:8px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#f5f7fb;cursor:pointer;';
  closeBtn.addEventListener('click', () => modal.remove());
  inner.appendChild(closeBtn);

  modal.appendChild(inner);
  document.body.appendChild(modal);
}

function appendInterrogationProgress(parent: HTMLElement, state: GameState): void {
  const captorEsp = state.espionage?.[state.currentPlayer];
  const records = Object.values(captorEsp?.activeInterrogations ?? {});
  if (records.length === 0) return;

  const section = createEl('section');
  section.dataset.section = 'interrogations';
  appendSectionHeader(section, 'Active Interrogations', 'Captured spies being questioned for intel.');

  for (const record of records) {
    const div = createEl('div');
    div.style.cssText = 'padding:8px;border-radius:8px;background:rgba(255,255,255,0.06);display:flex;flex-direction:column;gap:6px;font-size:11px;';

    const spyName = state.espionage?.[record.spyOwner]?.spies[record.spyId]?.name ?? record.spyId;
    const ownerName = state.civilizations[record.spyOwner]?.name ?? record.spyOwner;
    const summary = document.createTextNode(
      `Interrogating: ${spyName} (owner: ${ownerName}) — ${record.turnsRemaining} turns remaining | Intel: ${record.extractedIntel.length} items`,
    );
    div.appendChild(summary);

    if (record.extractedIntel.length > 0) {
      const btn = createEl('button', 'View Intel');
      btn.style.cssText = 'padding:5px 10px;border-radius:6px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.16);color:#9dd1ff;font-size:11px;cursor:pointer;';
      btn.addEventListener('click', () => showIntelModal(record.extractedIntel));
      div.appendChild(btn);
    }

    section.appendChild(div);
  }

  parent.appendChild(section);
}

export function createEspionagePanel(
  state: GameState,
  callbacks: EspionagePanelCallbacks = { onClose: () => {} },
): HTMLDivElement {
  const data = getEspionagePanelViewModel(state);
  const panel = createEl('div');
  panel.id = 'espionage-panel';
  panel.style.cssText = 'display:flex;flex-direction:column;gap:14px;padding:14px;border-radius:14px;background:rgba(12,16,28,0.96);color:#f5f7fb;';
  panel.dataset.panel = 'espionage';

  const headerRow = createEl('div');
  headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;';
  const titleWrap = createEl('div');
  titleWrap.style.cssText = 'flex:1;';
  appendSectionHeader(
    titleWrap,
    'Espionage',
    `Spies ${data.activeSpyCount}/${data.maxSpies}`,
  );
  headerRow.appendChild(titleWrap);
  const headerActions = createEl('div');
  headerActions.style.cssText = 'display:flex;gap:8px;align-items:center;';
  appendActionButton(headerActions, 'Close', 'close-panel', () => callbacks.onClose());
  headerRow.appendChild(headerActions);
  panel.appendChild(headerRow);

  const missionBlock = createEl('section');
  missionBlock.dataset.section = 'missions';
  appendSectionHeader(missionBlock, 'Mission Tiers', 'Available operations grouped by stage.');
  for (const group of data.missionStages) appendMissionStage(missionBlock, group, data.missionSuccessChances, data.missionSuccessBreakdown);
  panel.appendChild(missionBlock);

  const spiesBlock = createEl('section');
  spiesBlock.dataset.section = 'spies';
  appendSectionHeader(spiesBlock, 'Spy Roster', 'Current assignments, promotion state, and mission posture.');
  if (data.spySummaries.length === 0) {
    const empty = createEl('div', 'No active spies.');
    empty.style.cssText = 'font-size:11px;opacity:0.55;';
    spiesBlock.appendChild(empty);
  } else {
    for (const spy of data.spySummaries) appendSpyCard(spiesBlock, state, spy, callbacks);
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

  appendThreatBoard(panel, data.threatBoard);
  appendRecentDetections(panel, data.recentDetections);
  appendIntelligenceReportsGroup(panel, data);
  appendInterrogationProgress(panel, state);

  return panel;
}

export function getEspionagePanelData(state: GameState): EspionagePanelData {
  const civEsp = state.espionage?.[state.currentPlayer];
  if (!civEsp) {
    return {
      spies: [],
      spySummaries: [],
      maxSpies: 0,
      activeSpyCount: 0,
      availableMissions: [],
      missionCatalog: [],
      defendingCityIds: [],
      disabledAdvisors: [],
      threatBoard: [],
      recentDetections: [],
      currentTurn: state.turn,
      signalsIntelligence: [],
      troopReports: [],
      intelReports: [],
      resourceReports: [],
      diplomacyReports: [],
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
    .filter(s => (s.status === 'stationed' || s.status === 'embedded') && s.targetCivId === null && s.targetCityId !== null)
    .map(s => s.targetCityId!)
    .sort();
  const playerTechs = state.civilizations[state.currentPlayer]?.techState.completed ?? [];
  const canDetectThreats = playerTechs.includes('digital-surveillance') || playerTechs.includes('counter-intelligence');
  const threatBoard = canDetectThreats
    ? Object.values(civEsp.detectedThreats ?? {})
      .filter(threat => threat.expiresOnTurn >= state.turn)
      .map(threat => ({
        cityId: threat.cityId,
        foreignCivId: threat.foreignCivId,
        confidence: 'detected' as const,
      }))
    : [];
  const hasCyberIntelligence = playerTechs.includes('cyber-intelligence');
  const spySummaries = spies.map((spy) => {
    const canRevealQueue = hasCyberIntelligence
      && (spy.status === 'stationed' || spy.status === 'embedded')
      && Boolean(spy.infiltrationCityId);
    const revealedProductionQueue = canRevealQueue
      ? (state.cities[spy.infiltrationCityId!]?.productionQueue ?? []).map(getProductionLabel)
      : undefined;
    return {
      id: spy.id,
      name: spy.name,
      status: spy.status,
      targetCityId: spy.targetCityId,
      targetCivId: spy.targetCivId,
      infiltrationCityId: spy.infiltrationCityId ?? null,
      experience: spy.experience,
      promotion: spy.promotion,
      promotionReady: spy.promotionAvailable || (spy.experience >= 60 && spy.promotion === undefined),
      currentMission: spy.currentMission?.type ?? null,
      cooldownMode: spy.cooldownMode,
      lastSweepTurn: spy.lastSweepTurn,
      ...(revealedProductionQueue !== undefined ? { revealedProductionQueue } : {}),
    };
  });

  const stationedSpy = spies.find(
    s => (s.status === 'stationed' || s.status === 'on_mission') && s.infiltrationCityId && s.targetCivId,
  );
  let missionSuccessChances: Partial<Record<SpyMissionType, number>> | undefined;
  let missionSuccessBreakdown: Partial<Record<SpyMissionType, string>> | undefined;
  if (stationedSpy) {
    const enemyCIMap = state.espionage?.[stationedSpy.targetCivId!]?.counterIntelligence ?? {};
    const ci = enemyCIMap[stationedSpy.infiltrationCityId!] ?? 0;
    const modifiers = getEspionageModifierBreakdown(
      state,
      state.currentPlayer,
      stationedSpy.targetCivId!,
      stationedSpy.infiltrationCityId!,
    );
    const breakdownText = modifiers.parts.length > 0
      ? modifiers.parts.map(part => `${part.label} ${part.delta >= 0 ? '+' : ''}${Math.round(part.delta * 100)}%`).join(', ')
      : undefined;
    const chances: Partial<Record<SpyMissionType, number>> = {};
    const breakdowns: Partial<Record<SpyMissionType, string>> = {};
    for (const mission of availableMissions as SpyMissionType[]) {
      chances[mission] = getSpySuccessChance(
        stationedSpy.experience, ci, mission, stationedSpy.promotion, modifiers.missionSuccessDelta,
      );
      if (breakdownText) breakdowns[mission] = breakdownText;
    }
    missionSuccessChances = chances;
    if (Object.keys(breakdowns).length > 0) missionSuccessBreakdown = breakdowns;
  }

  const signalsIntelligence = Object.entries(civEsp.signalsIntelligence ?? {}).map(
    ([targetCivId, snapshot]) => ({
      targetCivId,
      targetCivName: state.civilizations[targetCivId]?.name ?? targetCivId,
      turn: snapshot.turn,
      unitCount: snapshot.units.length,
    }),
  );

  // Post-#442 audit fix: resolve viewer-safe display names here, once, from the
  // acting civ's own persisted reports — never from live target-civ state (ui-panels.md
  // "Persistent intel UI must render from viewer-safe snapshots, not from the richer
  // source object if the player did not earn that detail").
  const troopReports = Object.entries(civEsp.troopObservations ?? {}).map(
    ([cityId, snapshot]) => ({
      targetCivId: snapshot.targetCivId,
      targetCivName: state.civilizations[snapshot.targetCivId]?.name ?? snapshot.targetCivId,
      cityId,
      cityName: state.cities[cityId]?.name ?? cityId,
      turn: snapshot.turn,
      unitCount: snapshot.units.length,
    }),
  );

  const intelReports = Object.entries(civEsp.intelReports ?? {}).map(
    ([targetCivId, snapshot]) => ({
      targetCivId,
      targetCivName: state.civilizations[targetCivId]?.name ?? targetCivId,
      turn: snapshot.turn,
      completedTechCount: snapshot.completedTechCount,
      currentResearch: snapshot.currentResearch,
      treasury: snapshot.treasury,
      treatyCount: snapshot.treaties.length,
    }),
  );

  const resourceReports = Object.entries(civEsp.resourceReports ?? {}).map(
    ([cityId, snapshot]) => ({
      targetCivId: snapshot.targetCivId,
      targetCivName: state.civilizations[snapshot.targetCivId]?.name ?? snapshot.targetCivId,
      cityId,
      cityName: state.cities[cityId]?.name ?? cityId,
      turn: snapshot.turn,
      resources: snapshot.resources,
    }),
  );

  const diplomacyReports = Object.entries(civEsp.diplomacyReports ?? {}).map(
    ([targetCivId, snapshot]) => ({
      targetCivId,
      targetCivName: state.civilizations[targetCivId]?.name ?? targetCivId,
      turn: snapshot.turn,
      relationships: Object.entries(snapshot.relationships).map(([relCivId, value]) => ({
        civId: relCivId,
        civName: state.civilizations[relCivId]?.name ?? relCivId,
        value,
      })),
      tradePartnerNames: snapshot.tradePartners.map(id => state.civilizations[id]?.name ?? id),
    }),
  );

  return {
    spies,
    spySummaries,
    maxSpies: civEsp.maxSpies,
    activeSpyCount,
    availableMissions,
    missionCatalog: toMissionCatalog(availableMissions),
    defendingCityIds,
    disabledAdvisors,
    threatBoard,
    recentDetections: civEsp.recentDetections ?? [],
    currentTurn: state.turn,
    signalsIntelligence,
    troopReports,
    intelReports,
    resourceReports,
    diplomacyReports,
    ...(missionSuccessChances !== undefined ? { missionSuccessChances } : {}),
    ...(missionSuccessBreakdown !== undefined ? { missionSuccessBreakdown } : {}),
  };
}

export function getSpyActions(state: GameState, spyId: string): SpyAction[] {
  const civEsp = state.espionage?.[state.currentPlayer];
  if (!civEsp) return [];
  const spy = civEsp.spies[spyId];
  if (!spy) return [];

  const actions: SpyAction[] = [];
  const completedTechs = state.civilizations[state.currentPlayer]?.techState.completed ?? [];
  const hasRemoteMission = getAvailableMissions(completedTechs).some(mission => !missionRequiresPlacedSpy(mission));

  switch (spy.status) {
    case 'idle':
      actions.push('assign', 'assign_defensive');
      if (hasRemoteMission) {
        actions.push('start_mission');
      }
      break;
    case 'stationed':
      if (spy.turnedBy) {
        actions.push('verify_agent');
      }
      if (!spy.currentMission && (spy.targetCivId || hasRemoteMission)) {
        actions.push('start_mission');
      }
      actions.push('recall');
      break;
    case 'embedded':
      // Unembed and Sweep are rendered directly in renderSpyCard, not via getSpyActions
      break;
    case 'captured':
    case 'cooldown':
    case 'on_mission':
      // No actions available
      break;
  }

  return actions;
}
