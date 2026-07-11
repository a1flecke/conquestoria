import type { GameState, Tech, TechTrack } from '@/core/types';
import { BUILDINGS } from '@/systems/city-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { estimateTurnsToComplete } from '@/systems/pacing-model';
import {
  buildTechProgressionView,
  canMoveQueuedResearch,
  hasReachedResearchFrontier,
  type TechProgressionNode,
  type TechTreeZoom,
} from '@/systems/tech-progression';
import { TECH_TREE, getEffectiveTechCost } from '@/systems/tech-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

function getUnlockLines(tech: Tech): string[] {
  const lines = [...tech.unlocks];
  for (const unitType of tech.unlocksUnits ?? []) {
    const def = UNIT_DEFINITIONS[unitType];
    if (def) lines.push(def.name);
  }
  for (const buildingId of tech.unlocksBuildings ?? []) {
    const building = BUILDINGS[buildingId];
    if (building) lines.push(building.name);
  }
  return lines;
}

function getFirstUnlockHint(tech: Tech): string {
  return getUnlockLines(tech)[0] ?? 'New options for your empire';
}

export interface TechPanelCallbacks {
  onQueueResearch: (techId: string) => void;
  onMoveQueuedResearch: (fromIndex: number, toIndex: number) => void;
  onRemoveQueuedResearch: (index: number) => void;
  onClose: () => void;
}

const TRACK_ICONS: Record<TechTrack, string> = {
  military: '⚔️',
  economy: '💰',
  science: '🔬',
  civics: '📜',
  exploration: '🧭',
  agriculture: '🌾',
  medicine: '🩺',
  philosophy: '💭',
  arts: '🎨',
  maritime: '⚓',
  metallurgy: '⛏️',
  construction: '🏗️',
  communication: '📯',
  espionage: '🕵️',
  spirituality: '🙏',
};

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export const ERA_NAMES: Record<number, string> = {
  1: 'Ancient', 2: 'Classical', 3: 'Medieval', 4: 'Renaissance',
  5: 'Early Modern', 6: 'Industrial', 7: 'Modern',
  8: 'Nationalist', 9: 'Progressive', 10: 'Cold War',
  11: 'Space Race', 12: 'Information Age',
};

function getEraLabel(era: number): string {
  return ERA_NAMES[era] ?? `Era ${era}`;
}

function getTechName(techId: string): string {
  return TECH_TREE.find(tech => tech.id === techId)?.name ?? techId;
}

function getNodeStatusLabel(node: TechProgressionNode): string {
  if (node.state === 'completed') return 'Done';
  if (node.state === 'current') return 'Researching';
  if (node.state === 'queued') return 'Queued';
  if (node.state === 'available') return 'Available now';
  if (node.state === 'next-layer') return 'Next layer';
  return 'Locked';
}

export function formatTechNodeEta(node: TechProgressionNode): string {
  if (node.state === 'completed') return '';
  if (node.turnsToResearch !== null) return `${node.turnsToResearch} turns`;
  if (node.state === 'locked') return 'ETA locked';
  return 'ETA pending';
}

function getPrerequisiteStatus(prereqId: string, civ: GameState['civilizations'][string]): string {
  if (civ.techState.completed.includes(prereqId)) return 'Done';
  if (civ.techState.currentResearch === prereqId) return 'Researching';
  if (civ.techState.researchQueue.includes(prereqId)) return 'Queued';
  return 'Locked';
}

function buildCurrentResearchSummary(currentTech: Tech | undefined, progress: number, turnsRemaining: number | null): HTMLDivElement | null {
  if (!currentTech) {
    return null;
  }

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'background:rgba(255,255,255,0.1);border-radius:10px;padding:12px;margin-bottom:16px;';

  const heading = document.createElement('div');
  heading.textContent = `Researching: ${currentTech.name}`;
  heading.style.cssText = 'font-weight:bold;color:#e8c170;';
  wrapper.appendChild(heading);

  const summary = document.createElement('div');
  summary.textContent = turnsRemaining === null
    ? `${titleCase(currentTech.track)} · ${getFirstUnlockHint(currentTech)}`
    : `${titleCase(currentTech.track)} · Turns remaining: ${turnsRemaining}`;
  summary.style.cssText = 'font-size:12px;opacity:0.7;';
  wrapper.appendChild(summary);

  const why = document.createElement('div');
  why.textContent = `Why next: ${getFirstUnlockHint(currentTech)}`;
  why.style.cssText = 'font-size:11px;opacity:0.8;margin-top:6px;';
  wrapper.appendChild(why);

  const progressBar = document.createElement('div');
  progressBar.style.cssText = 'background:rgba(0,0,0,0.3);border-radius:4px;height:8px;margin-top:8px;';
  const fill = document.createElement('div');
  fill.style.cssText = `background:#e8c170;border-radius:4px;height:8px;width:${Math.min(100, Math.max(0, progress))}%;`;
  progressBar.appendChild(fill);
  wrapper.appendChild(progressBar);

  return wrapper;
}

function getQueuedResearchTiming(
  civ: GameState['civilizations'][string],
  sciencePerTurn: number,
): Map<string, { startTurns: number; finishTurns: number }> {
  let elapsedTurns = 0;
  const timing = new Map<string, { startTurns: number; finishTurns: number }>();

  if (civ.techState.currentResearch) {
    const currentTech = TECH_TREE.find(tech => tech.id === civ.techState.currentResearch);
    if (currentTech) {
      elapsedTurns = estimateTurnsToComplete({
        cost: Math.max(0, getEffectiveTechCost(currentTech, civ.techState.completed) - civ.techState.researchProgress),
        outputPerTurn: sciencePerTurn,
      });
    }
  }

  civ.techState.researchQueue.forEach(techId => {
    const tech = TECH_TREE.find(candidate => candidate.id === techId);
    if (!tech) {
      return;
    }

    const startTurns = elapsedTurns;
    const finishTurns = startTurns + estimateTurnsToComplete({
      cost: getEffectiveTechCost(tech, civ.techState.completed),
      outputPerTurn: sciencePerTurn,
    });

    timing.set(techId, { startTurns, finishTurns });
    elapsedTurns = finishTurns;
  });

  return timing;
}

function createTechNode(
  node: TechProgressionNode,
  opts: {
    isFocused: boolean;
    isSelected: boolean;
    isPath: boolean;
    effectiveCost: number;
    onSelect: (techId: string) => void;
    onQueueResearch: (techId: string) => void;
  },
): HTMLButtonElement {
  const visualStyle = getTechNodeVisualStyle(node, opts.isFocused || opts.isSelected);

  const item = document.createElement('button');
  item.style.cssText = [
    `background:${visualStyle.background}`,
    `border:1px solid ${visualStyle.border}`,
    'border-radius:8px',
    'color:white',
    'cursor:pointer',
    'display:block',
    'font:inherit',
    'min-height:84px',
    `opacity:${visualStyle.opacity}`,
    'padding:10px',
    'text-align:left',
    'width:190px',
  ].join(';');
  item.type = 'button';
  item.className = 'tech-item';
  item.dataset.techId = node.tech.id;
  item.dataset.state = node.state;
  item.dataset.techState = node.state;
  item.dataset.track = node.track;
  item.dataset.era = String(node.era);
  updateTechNodeSelection(item, node, opts.isFocused, opts.isSelected, opts.isPath);

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:bold;font-size:13px;line-height:1.2;';
  title.textContent = node.tech.name;
  item.appendChild(title);

  const status = document.createElement('div');
  status.style.cssText = 'font-size:11px;color:#e8c170;margin-top:5px;';
  status.textContent = getNodeStatusLabel(node);
  item.appendChild(status);

  const detail = document.createElement('div');
  detail.style.cssText = 'font-size:11px;opacity:0.72;line-height:1.3;margin-top:5px;';
  const etaText = formatTechNodeEta(node);
  const etaSegment = etaText ? ` · ${etaText}` : '';
  detail.textContent = `${getFirstUnlockHint(node.tech)}${etaSegment} · Cost: ${opts.effectiveCost}`;
  item.appendChild(detail);

  item.addEventListener('click', () => {
    if (node.state === 'available') {
      opts.onQueueResearch(node.tech.id);
      return;
    }
    opts.onSelect(node.tech.id);
  });

  return item;
}

function getTechNodeVisualStyle(
  node: TechProgressionNode,
  isEmphasized: boolean,
): { background: string; border: string; opacity: string } {
  let background = 'rgba(255,255,255,0.05)';
  let border = 'rgba(255,255,255,0.12)';
  let opacity = '0.62';

  if (node.state === 'completed') {
    background = 'rgba(107,155,75,0.28)'; border = '#6b9b4b'; opacity = '1';
  } else if (node.state === 'current') {
    background = 'rgba(232,193,112,0.22)'; border = '#e8c170'; opacity = '1';
  } else if (node.state === 'queued') {
    background = 'rgba(100,170,255,0.18)'; border = 'rgba(100,170,255,0.55)'; opacity = '1';
  } else if (node.state === 'available') {
    background = 'rgba(255,255,255,0.11)'; border = 'rgba(255,255,255,0.36)'; opacity = '1';
  } else if (node.state === 'next-layer') {
    background = 'rgba(232,193,112,0.1)'; border = 'rgba(232,193,112,0.28)'; opacity = '0.88';
  }
  if (isEmphasized) {
    border = '#f0d48a';
    background = node.state === 'completed' ? 'rgba(107,155,75,0.34)' : 'rgba(232,193,112,0.18)';
  }

  return { background, border, opacity };
}

function updateTechNodeSelection(
  item: HTMLElement,
  node: TechProgressionNode,
  isFocused: boolean,
  isSelected: boolean,
  isPath: boolean,
): void {
  const visualStyle = getTechNodeVisualStyle(node, isFocused || isSelected);
  item.style.background = visualStyle.background;
  item.style.borderColor = visualStyle.border;
  item.style.opacity = visualStyle.opacity;

  if (isFocused) item.dataset.focused = 'true';
  else delete item.dataset.focused;
  if (isSelected) item.dataset.selected = 'true';
  else delete item.dataset.selected;
  if (isPath) item.dataset.path = 'selected';
  else delete item.dataset.path;
}

function renderInspector(
  inspector: HTMLElement,
  selectedNode: TechProgressionNode | undefined,
  civ: GameState['civilizations'][string],
  queueableIds: Set<string>,
  nextStepId: string | null,
  onQueueResearch: (techId: string) => void,
): void {
  inspector.textContent = '';
  inspector.dataset.role = 'tech-detail';
  inspector.style.cssText = 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:12px;min-width:220px;max-width:320px;';

  if (!selectedNode) {
    const empty = document.createElement('div');
    empty.textContent = 'Select a tech to inspect its path.';
    empty.style.cssText = 'font-size:12px;opacity:0.72;';
    inspector.appendChild(empty);
    return;
  }

  const title = document.createElement('div');
  title.textContent = selectedNode.tech.name;
  title.style.cssText = 'font-weight:bold;color:#e8c170;margin-bottom:4px;';
  inspector.appendChild(title);

  const meta = document.createElement('div');
  meta.textContent = `${titleCase(selectedNode.track)} · ${getEraLabel(selectedNode.era)} · ${getNodeStatusLabel(selectedNode)}`;
  meta.style.cssText = 'font-size:12px;opacity:0.72;margin-bottom:8px;';
  inspector.appendChild(meta);

  const unlocks = document.createElement('div');
  unlocks.textContent = getUnlockLines(selectedNode.tech).join(', ') || 'New options for your empire';
  unlocks.style.cssText = 'font-size:12px;line-height:1.35;margin-bottom:10px;';
  inspector.appendChild(unlocks);

  const prereqTitle = document.createElement('div');
  prereqTitle.textContent = 'Prerequisites';
  prereqTitle.style.cssText = 'font-size:11px;text-transform:uppercase;opacity:0.65;margin-bottom:5px;';
  inspector.appendChild(prereqTitle);

  if (selectedNode.prerequisiteIds.length === 0) {
    const none = document.createElement('div');
    none.textContent = 'None';
    none.style.cssText = 'font-size:12px;opacity:0.75;margin-bottom:10px;';
    inspector.appendChild(none);
  } else {
    for (const prereqId of selectedNode.prerequisiteIds) {
      const row = document.createElement('div');
      row.textContent = `${getTechName(prereqId)} · ${getPrerequisiteStatus(prereqId, civ)}`;
      row.style.cssText = 'font-size:12px;line-height:1.4;opacity:0.86;';
      inspector.appendChild(row);
    }
  }

  if (queueableIds.has(selectedNode.tech.id)) {
    const action = document.createElement('button');
    action.type = 'button';
    action.dataset.action = 'queue-selected-tech';
    action.textContent = civ.techState.currentResearch ? 'Add to queue' : 'Research';
    action.style.cssText = 'margin-top:12px;padding:8px 10px;background:#e8c170;border:0;border-radius:6px;color:#1f1a12;font-weight:bold;cursor:pointer;';
    action.addEventListener('click', () => onQueueResearch(selectedNode.tech.id));
    inspector.appendChild(action);
  } else if (nextStepId) {
    const next = document.createElement('div');
    next.textContent = `Next step: ${getTechName(nextStepId)}`;
    next.style.cssText = 'font-size:12px;color:#e8c170;margin-top:12px;';
    inspector.appendChild(next);
  } else if (selectedNode.state === 'locked') {
    const locked = document.createElement('div');
    locked.textContent = 'No direct queue action yet';
    locked.style.cssText = 'font-size:12px;opacity:0.72;margin-top:12px;';
    inspector.appendChild(locked);
  }
}

export function createTechPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: TechPanelCallbacks,
): HTMLElement {
  container.querySelector('#tech-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'tech-panel';
  panel.dataset.layout = 'tech-dependency-panel';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.95);z-index:30;overflow-y:auto;padding:16px;padding-bottom:80px;color:white;';

  const civ = state.civilizations[state.currentPlayer];
  const sciencePerTurn = Math.max(
    1,
    civ.cities
      .reduce((total, cityId) => total + calculateProjectedCityYields(state, cityId).science, 0),
  );
  const queueTiming = getQueuedResearchTiming(civ, sciencePerTurn);

  let zoom: TechTreeZoom = 'focus';
  let selectedTechId: string | null = civ.techState.currentResearch
    ?? civ.techState.researchQueue[0]
    ?? (civ.techState.completed.length > 0 ? civ.techState.completed[civ.techState.completed.length - 1] : null);

  const reopenPanel = () => {
    panel.remove();
    createTechPanel(container, state, callbacks);
  };

  const queueResearchAndReopen = (techId: string) => {
    callbacks.onQueueResearch(techId);
    reopenPanel();
  };

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';

  const title = document.createElement('h2');
  title.textContent = 'Research';
  title.style.cssText = 'font-size:18px;color:#e8c170;margin:0;';
  header.appendChild(title);

  const close = document.createElement('button');
  close.type = 'button';
  close.id = 'tech-close';
  close.textContent = '✕';
  close.style.cssText = 'cursor:pointer;font-size:24px;opacity:0.6;background:none;border:0;color:white;';
  close.addEventListener('click', () => {
    panel.remove();
    callbacks.onClose();
  });
  header.appendChild(close);

  panel.appendChild(header);

  const currentTech = civ.techState.currentResearch
    ? TECH_TREE.find(tech => tech.id === civ.techState.currentResearch)
    : undefined;
  const currentProgress = currentTech
    ? Math.round((civ.techState.researchProgress / getEffectiveTechCost(currentTech, civ.techState.completed)) * 100)
    : 0;
  const turnsRemaining = currentTech
    ? estimateTurnsToComplete({
      cost: Math.max(0, getEffectiveTechCost(currentTech, civ.techState.completed) - civ.techState.researchProgress),
      outputPerTurn: sciencePerTurn,
    })
    : null;
  const summary = buildCurrentResearchSummary(currentTech, currentProgress, turnsRemaining);
  if (summary) {
    panel.appendChild(summary);
  }

  if (hasReachedResearchFrontier(civ.techState)) {
    const frontier = document.createElement('div');
    frontier.dataset.role = 'research-frontier';
    frontier.textContent = 'Research frontier reached — your campaign continues';
    frontier.style.cssText = 'background:rgba(94,180,128,0.16);border:1px solid rgba(120,220,155,0.55);border-radius:8px;padding:10px 12px;margin-bottom:16px;color:#d9f6df;font-size:13px;';
    panel.appendChild(frontier);
  }

  const queueBtnStyle = 'padding:4px 8px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:white;cursor:pointer;font-size:13px;';
  const queueBtnDisabledStyle = 'padding:4px 8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:rgba(255,255,255,0.3);font-size:13px;cursor:not-allowed;';

  const queueSection = document.createElement('div');
  queueSection.style.cssText = 'background:rgba(255,255,255,0.08);border-radius:10px;padding:12px;margin-bottom:16px;';
  const queueHeading = document.createElement('div');
  queueHeading.textContent = 'Research Queue';
  queueHeading.style.cssText = 'font-weight:bold;color:#e8c170;margin-bottom:8px;';
  queueSection.appendChild(queueHeading);

  if (civ.techState.researchQueue.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'No queued follow-up techs.';
    empty.style.cssText = 'font-size:12px;opacity:0.7;';
    queueSection.appendChild(empty);
  } else {
    civ.techState.researchQueue.forEach((techId, index) => {
      const tech = TECH_TREE.find(candidate => candidate.id === techId);
      const timing = queueTiming.get(techId);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;background:rgba(255,255,255,0.06);border-radius:8px;padding:8px;gap:10px;';

      const labelWrap = document.createElement('div');
      const label = document.createElement('div');
      label.textContent = tech?.name ?? techId;
      label.style.cssText = 'font-weight:bold;';
      const slot = document.createElement('div');
      slot.textContent = timing
        ? `Queue slot ${index + 1} · Starts in ${timing.startTurns} turns · Finishes in ${timing.finishTurns} turns`
        : `Queue slot ${index + 1}`;
      slot.style.cssText = 'font-size:11px;opacity:0.7;';
      labelWrap.appendChild(label);
      labelWrap.appendChild(slot);
      row.appendChild(labelWrap);

      const controls = document.createElement('div');
      controls.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';

      const canMoveUp = index > 0 && canMoveQueuedResearch(civ.techState, index, index - 1);
      const canMoveDown = index < civ.techState.researchQueue.length - 1 && canMoveQueuedResearch(civ.techState, index, index + 1);

      const up = document.createElement('button');
      up.type = 'button';
      up.dataset.queueAction = 'up';
      up.dataset.queueIndex = String(index);
      up.textContent = '↑';
      up.disabled = !canMoveUp;
      up.style.cssText = canMoveUp ? queueBtnStyle : queueBtnDisabledStyle;

      const down = document.createElement('button');
      down.type = 'button';
      down.dataset.queueAction = 'down';
      down.dataset.queueIndex = String(index);
      down.textContent = '↓';
      down.disabled = !canMoveDown;
      down.style.cssText = canMoveDown ? queueBtnStyle : queueBtnDisabledStyle;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.queueAction = 'remove';
      remove.dataset.queueIndex = String(index);
      remove.textContent = '✕';
      remove.style.cssText = queueBtnStyle;

      controls.appendChild(up);
      controls.appendChild(down);
      controls.appendChild(remove);
      row.appendChild(controls);
      queueSection.appendChild(row);
    });
  }

  panel.appendChild(queueSection);

  const zoomControls = document.createElement('div');
  zoomControls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;';
  panel.appendChild(zoomControls);

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;';

  const techTreeWrapper = document.createElement('div');
  techTreeWrapper.style.cssText = 'display:flex;flex-direction:row;align-items:flex-start;flex:1 1 620px;min-width:280px;overflow:hidden;';
  body.appendChild(techTreeWrapper);

  const trackSidebar = document.createElement('div');
  trackSidebar.id = 'tech-track-sidebar';
  trackSidebar.style.cssText = 'width:48px;flex-shrink:0;position:relative;overflow:hidden;';
  techTreeWrapper.appendChild(trackSidebar);

  const mapWrap = document.createElement('div');
  mapWrap.dataset.layout = 'tech-dependency-map';
  mapWrap.style.cssText = 'flex:1;overflow:auto;position:relative;padding-bottom:12px;';
  techTreeWrapper.appendChild(mapWrap);

  const inspector = document.createElement('aside');
  body.appendChild(inspector);
  panel.appendChild(body);
  container.appendChild(panel);

  const renderZoomControls = () => {
    zoomControls.textContent = '';
    const options: Array<{ value: TechTreeZoom; label: string }> = [
      { value: 'focus', label: 'Focus' },
      { value: 'known', label: 'Known tree' },
      { value: 'all', label: 'All techs' },
    ];

    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.zoom = option.value;
      button.textContent = option.label;
      button.style.cssText = option.value === zoom
        ? 'padding:8px 10px;background:#e8c170;border:0;border-radius:6px;color:#1f1a12;font-weight:bold;cursor:pointer;'
        : 'padding:8px 10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);border-radius:6px;color:white;cursor:pointer;';
      button.addEventListener('click', () => {
        zoom = option.value;
        renderTree();
      });
      zoomControls.appendChild(button);
    }
  };

  let hasScrolledToFocus = false;
  const renderTree = () => {
    renderZoomControls();
    mapWrap.textContent = '';
    const progression = buildTechProgressionView(civ.techState, { sciencePerTurn, zoom, selectedTechId });
    if (!selectedTechId) {
      selectedTechId = progression.focusTechId
        ?? progression.nodes.find(node => node.state === 'available')?.tech.id
        ?? null;
    }

    const visibleNodes = progression.nodes.filter(node => progression.visibleIds.has(node.tech.id));
    const visibleIds = new Set(visibleNodes.map(node => node.tech.id));
    const edgeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    edgeLayer.setAttribute('data-role', 'tech-dependency-edges');
    edgeLayer.setAttribute('width', '1');
    edgeLayer.setAttribute('height', '1');
    edgeLayer.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;pointer-events:none;z-index:0;';

    for (const edge of progression.edges) {
      if (!visibleIds.has(edge.fromId) || !visibleIds.has(edge.toId)) {
        continue;
      }
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.dataset.edgeFrom = edge.fromId;
      path.dataset.edgeTo = edge.toId;
      path.dataset.edgeState = edge.state;
      if (progression.selectedPathIds.has(edge.fromId) && progression.selectedPathIds.has(edge.toId)) {
        path.dataset.edgePath = 'selected';
      }
      path.setAttribute('d', 'M0 0 L1 1');
      path.setAttribute('stroke', edge.state === 'satisfied' ? '#6b9b4b' : edge.state === 'planned' ? '#e8c170' : 'rgba(255,255,255,0.24)');
      path.setAttribute('fill', 'none');
      edgeLayer.appendChild(path);
    }
    // --- Phase 3: DAG layout ---
    const CARD_W = 200;
    const CARD_H = 92;
    const GAP_H = 28;
    const GAP_V = 16;

    // 1. Topological depth over full TECH_TREE
    const depthMap = new Map<string, number>();
    const visited = new Set<string>();
    const inProg = new Set<string>();
    const topoOrder: string[] = [];
    function topoVisit(techId: string): void {
      if (visited.has(techId) || inProg.has(techId)) return;
      inProg.add(techId);
      const t = TECH_TREE.find(x => x.id === techId);
      if (t) { for (const p of t.prerequisites) topoVisit(p); topoOrder.push(techId); }
      inProg.delete(techId); visited.add(techId);
    }
    for (const t of TECH_TREE) topoVisit(t.id);
    for (const techId of topoOrder) {
      const t = TECH_TREE.find(x => x.id === techId)!;
      const maxPrereq = t.prerequisites.length > 0 ? Math.max(...t.prerequisites.map(p => depthMap.get(p) ?? 0)) : -1;
      depthMap.set(techId, maxPrereq + 1);
    }

    // 2. Track row indices (only visible tracks)
    const trackOrder = Object.keys(TRACK_ICONS) as Tech['track'][];
    const visibleTracks = trackOrder.filter(tr => visibleNodes.some(n => n.track === tr));
    const trackRow = new Map<string, number>();
    visibleTracks.forEach((tr, i) => trackRow.set(tr, i));

    // 3. Pixel positions — sort by (depth, row) then pack downward per column
    const sortedForLayout = [...visibleNodes].sort((a, b) => {
      const da = depthMap.get(a.tech.id) ?? 0;
      const db = depthMap.get(b.tech.id) ?? 0;
      if (da !== db) return da - db;
      return (trackRow.get(a.track) ?? 0) - (trackRow.get(b.track) ?? 0);
    });
    const colNextY = new Map<number, number>();
    const nodePos = new Map<string, { x: number; y: number }>();
    for (const node of sortedForLayout) {
      const depth = depthMap.get(node.tech.id) ?? 0;
      const row = trackRow.get(node.track) ?? 0;
      const baseY = row * (CARD_H + GAP_V);
      const prevY = colNextY.get(depth) ?? 0;
      const y = Math.max(baseY, prevY);
      colNextY.set(depth, y + CARD_H + GAP_V);
      nodePos.set(node.tech.id, { x: depth * (CARD_W + GAP_H), y });
    }

    const allPos = Array.from(nodePos.values());
    const maxX = allPos.length > 0 ? Math.max(...allPos.map(p => p.x)) : 0;
    const maxY = allPos.length > 0 ? Math.max(...allPos.map(p => p.y)) : 0;
    const contentW = maxX + CARD_W;
    const contentH = maxY + CARD_H;

    // 4. Content container
    const contentContainer = document.createElement('div');
    contentContainer.style.cssText = `position:relative;width:${contentW}px;height:${contentH}px;`;
    contentContainer.appendChild(edgeLayer);

    const updateSelection = (techId: string) => {
      selectedTechId = techId;
      const selectedProgression = buildTechProgressionView(civ.techState, {
        sciencePerTurn,
        zoom,
        selectedTechId,
      });

      mapWrap.querySelectorAll<HTMLElement>('[data-tech-id]').forEach(card => {
        const cardTechId = card.dataset.techId;
        if (!cardTechId) return;
        const cardNode = selectedProgression.nodesById.get(cardTechId);
        if (!cardNode) return;

        updateTechNodeSelection(
          card,
          cardNode,
          selectedProgression.focusTechId === cardTechId,
          selectedTechId === cardTechId,
          selectedProgression.selectedPathIds.has(cardTechId),
        );
      });

      edgeLayer.querySelectorAll<SVGPathElement>('path').forEach(path => {
        const fromId = path.dataset.edgeFrom;
        const toId = path.dataset.edgeTo;
        const isSelectedPath = Boolean(
          fromId
          && toId
          && selectedProgression.selectedPathIds.has(fromId)
          && selectedProgression.selectedPathIds.has(toId),
        );
        if (isSelectedPath) path.dataset.edgePath = 'selected';
        else delete path.dataset.edgePath;
        path.setAttribute('stroke-width', isSelectedPath ? '3' : '1.5');
      });

      renderInspector(
        inspector,
        selectedProgression.nodesById.get(techId),
        civ,
        selectedProgression.queueableIds,
        selectedProgression.nextStepId,
        queueResearchAndReopen,
      );
    };

    // 5. Era boundary markers
    const eraMinX = new Map<number, number>();
    for (const node of visibleNodes) {
      const pos = nodePos.get(node.tech.id);
      if (!pos) continue;
      const cur = eraMinX.get(node.era);
      if (cur === undefined || pos.x < cur) eraMinX.set(node.era, pos.x);
    }
    for (const [era, x] of eraMinX) {
      const marker = document.createElement('div');
      marker.dataset.era = String(era);
      marker.style.cssText = `position:absolute;left:${x > 0 ? x - GAP_H / 2 - 0.5 : 0}px;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.1);z-index:0;`;
      const label = document.createElement('div');
      label.textContent = getEraLabel(era);
      label.style.cssText = 'position:absolute;top:2px;left:4px;font-size:10px;white-space:nowrap;opacity:0.5;letter-spacing:0.05em;color:#e8c170;';
      marker.appendChild(label);
      contentContainer.appendChild(marker);
    }

    // 6. Cards
    for (const node of visibleNodes) {
      const pos = nodePos.get(node.tech.id);
      if (!pos) continue;
      const card = createTechNode(node, {
        isFocused: progression.focusTechId === node.tech.id,
        isSelected: selectedTechId === node.tech.id,
        isPath: progression.selectedPathIds.has(node.tech.id),
        effectiveCost: getEffectiveTechCost(node.tech, civ.techState.completed),
        onSelect: updateSelection,
        onQueueResearch: queueResearchAndReopen,
      });
      card.style.position = 'absolute';
      card.style.left = `${pos.x}px`;
      card.style.top = `${pos.y}px`;
      card.style.width = `${CARD_W}px`;
      card.dataset.depth = String(depthMap.get(node.tech.id) ?? 0);
      contentContainer.appendChild(card);
    }

    mapWrap.appendChild(contentContainer);

    // 7. Track sidebar icons — align with first card in each visible track
    const trackMinY = new Map<string, number>();
    for (const node of visibleNodes) {
      const pos = nodePos.get(node.tech.id);
      if (!pos) continue;
      const cur = trackMinY.get(node.track);
      if (cur === undefined || pos.y < cur) trackMinY.set(node.track, pos.y);
    }
    trackSidebar.textContent = '';
    trackSidebar.style.height = `${contentH}px`;
    for (const tr of visibleTracks) {
      const minY = trackMinY.get(tr) ?? (trackRow.get(tr) ?? 0) * (CARD_H + GAP_V);
      const icon = document.createElement('div');
      icon.title = titleCase(tr);
      icon.textContent = TRACK_ICONS[tr];
      icon.style.cssText = `position:absolute;left:0;top:${minY + CARD_H / 2 - 12}px;width:48px;height:24px;display:flex;align-items:center;justify-content:center;font-size:18px;`;
      trackSidebar.appendChild(icon);
    }

    const updateEdgeGeometry = () => {
      const mapRect = mapWrap.getBoundingClientRect();
      const width = Math.max(mapWrap.scrollWidth, Math.ceil(mapRect.width), 1);
      const height = Math.max(mapWrap.scrollHeight, Math.ceil(mapRect.height), 1);
      edgeLayer.setAttribute('width', String(width));
      edgeLayer.setAttribute('height', String(height));
      edgeLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
      edgeLayer.style.width = `${width}px`;
      edgeLayer.style.height = `${height}px`;

      edgeLayer.querySelectorAll<SVGPathElement>('path').forEach(path => {
        const fromId = path.dataset.edgeFrom;
        const toId = path.dataset.edgeTo;
        if (!fromId || !toId) {
          return;
        }

        const fromEl = mapWrap.querySelector<HTMLElement>(`[data-tech-id="${fromId}"]`);
        const toEl = mapWrap.querySelector<HTMLElement>(`[data-tech-id="${toId}"]`);
        if (!fromEl || !toEl) {
          return;
        }

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        if (fromRect.width === 0 && toRect.width === 0) {
          return;
        }

        const startX = fromRect.right - mapRect.left + mapWrap.scrollLeft;
        const startY = fromRect.top + fromRect.height / 2 - mapRect.top + mapWrap.scrollTop;
        const endX = toRect.left - mapRect.left + mapWrap.scrollLeft;
        const endY = toRect.top + toRect.height / 2 - mapRect.top + mapWrap.scrollTop;
        const bend = Math.max(24, Math.abs(endX - startX) / 2);
        path.setAttribute('d', `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`);
        path.setAttribute('stroke-width', path.dataset.edgePath === 'selected' ? '3' : '1.5');
      });
    };

    updateEdgeGeometry();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        updateEdgeGeometry();
        if (!hasScrolledToFocus) {
          hasScrolledToFocus = true;
          const focusPos = progression.focusTechId ? nodePos.get(progression.focusTechId) : undefined;
          if (focusPos && mapWrap.clientWidth > 0) {
            const target = focusPos.x - (mapWrap.clientWidth / 2 - CARD_W / 2);
            if (target > 0) mapWrap.scrollLeft = target;
          }
        }
      });
    }

    renderInspector(
      inspector,
      selectedTechId ? progression.nodesById.get(selectedTechId) : undefined,
      civ,
      progression.queueableIds,
      progression.nextStepId,
      queueResearchAndReopen,
    );
  };

  renderTree();

  panel.querySelectorAll('[data-queue-action]').forEach(el => {
    el.addEventListener('click', event => {
      event.stopPropagation();
      const action = (el as HTMLElement).dataset.queueAction;
      const index = Number((el as HTMLElement).dataset.queueIndex);

      if (!Number.isInteger(index)) {
        return;
      }

      if (action === 'remove') {
        callbacks.onRemoveQueuedResearch(index);
        reopenPanel();
        return;
      }

      if (action === 'up' && index > 0 && canMoveQueuedResearch(civ.techState, index, index - 1)) {
        callbacks.onMoveQueuedResearch(index, index - 1);
        reopenPanel();
        return;
      }

      if (
        action === 'down'
        && index < civ.techState.researchQueue.length - 1
        && canMoveQueuedResearch(civ.techState, index, index + 1)
      ) {
        callbacks.onMoveQueuedResearch(index, index + 1);
        reopenPanel();
      }
    });
  });

  return panel;
}
