import type { GameState, Tech, TechTrack } from '@/core/types';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { estimateTurnsToComplete } from '@/systems/pacing-model';
import {
  buildTechProgressionView,
  type TechProgressionNode,
  type TechTreeZoom,
} from '@/systems/tech-progression';
import { TECH_TREE } from '@/systems/tech-system';

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

function getEraLabel(era: number): string {
  return era === 5 ? 'Late Era Foundations' : `Era ${era}`;
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
    ? `${titleCase(currentTech.track)} · ${currentTech.unlocks[0] ?? 'New options for your empire'}`
    : `${titleCase(currentTech.track)} · Turns remaining: ${turnsRemaining}`;
  summary.style.cssText = 'font-size:12px;opacity:0.7;';
  wrapper.appendChild(summary);

  const why = document.createElement('div');
  why.textContent = `Why next: ${currentTech.unlocks[0] ?? 'Keeps your current plan moving.'}`;
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
        cost: Math.max(0, currentTech.cost - civ.techState.researchProgress),
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
      cost: tech.cost,
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
    onSelect: (techId: string) => void;
    onQueueResearch: (techId: string) => void;
  },
): HTMLButtonElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'tech-item';
  item.dataset.techId = node.tech.id;
  item.dataset.state = node.state;
  item.dataset.techState = node.state;
  item.dataset.track = node.track;
  item.dataset.era = String(node.era);
  if (opts.isFocused) item.dataset.focused = 'true';
  if (opts.isSelected) item.dataset.selected = 'true';

  let background = 'rgba(255,255,255,0.05)';
  let border = 'rgba(255,255,255,0.12)';
  let opacity = '0.62';
  let cursor = 'pointer';

  if (node.state === 'completed') {
    background = 'rgba(107,155,75,0.28)';
    border = '#6b9b4b';
    opacity = '1';
  } else if (node.state === 'current') {
    background = 'rgba(232,193,112,0.22)';
    border = '#e8c170';
    opacity = '1';
  } else if (node.state === 'queued') {
    background = 'rgba(100,170,255,0.18)';
    border = 'rgba(100,170,255,0.55)';
    opacity = '1';
  } else if (node.state === 'available') {
    background = 'rgba(255,255,255,0.11)';
    border = 'rgba(255,255,255,0.36)';
    opacity = '1';
  } else if (node.state === 'next-layer') {
    background = 'rgba(232,193,112,0.1)';
    border = 'rgba(232,193,112,0.28)';
    opacity = '0.88';
  }

  if (opts.isFocused || opts.isSelected) {
    border = '#f0d48a';
    background = node.state === 'completed' ? 'rgba(107,155,75,0.34)' : 'rgba(232,193,112,0.18)';
  }

  item.style.cssText = [
    `background:${background}`,
    `border:1px solid ${border}`,
    'border-radius:8px',
    'color:white',
    'cursor:pointer',
    'display:block',
    'font:inherit',
    'min-height:84px',
    'opacity:' + opacity,
    'padding:10px',
    'text-align:left',
    'width:190px',
  ].join(';');

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
  const etaText = node.turnsToResearch === null ? 'ETA unknown' : `${node.turnsToResearch} turns`;
  detail.textContent = `${node.tech.unlocks[0] ?? 'New options'} · ${etaText} · Cost: ${node.tech.cost}`;
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

function renderInspector(
  inspector: HTMLElement,
  selectedNode: TechProgressionNode | undefined,
  civ: GameState['civilizations'][string],
  queueableIds: Set<string>,
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
  unlocks.textContent = selectedNode.tech.unlocks.join(', ') || 'New options for your empire';
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
    ? Math.round((civ.techState.researchProgress / currentTech.cost) * 100)
    : 0;
  const turnsRemaining = currentTech
    ? estimateTurnsToComplete({
      cost: Math.max(0, currentTech.cost - civ.techState.researchProgress),
      outputPerTurn: sciencePerTurn,
    })
    : null;
  const summary = buildCurrentResearchSummary(currentTech, currentProgress, turnsRemaining);
  if (summary) {
    panel.appendChild(summary);
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

      const isFirst = index === 0;
      const isLast = index === civ.techState.researchQueue.length - 1;

      const up = document.createElement('button');
      up.type = 'button';
      up.dataset.queueAction = 'up';
      up.dataset.queueIndex = String(index);
      up.textContent = '↑';
      up.disabled = isFirst;
      up.style.cssText = isFirst ? queueBtnDisabledStyle : queueBtnStyle;

      const down = document.createElement('button');
      down.type = 'button';
      down.dataset.queueAction = 'down';
      down.dataset.queueIndex = String(index);
      down.textContent = '↓';
      down.disabled = isLast;
      down.style.cssText = isLast ? queueBtnDisabledStyle : queueBtnStyle;

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

  const mapWrap = document.createElement('div');
  mapWrap.dataset.layout = 'tech-dependency-map';
  mapWrap.style.cssText = 'position:relative;flex:1 1 620px;min-width:280px;overflow:auto;padding-bottom:12px;';
  body.appendChild(mapWrap);

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

  const renderTree = () => {
    renderZoomControls();
    mapWrap.textContent = '';
    const progression = buildTechProgressionView(civ.techState, { sciencePerTurn, zoom });
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
    edgeLayer.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;pointer-events:none;';

    for (const edge of progression.edges) {
      if (!visibleIds.has(edge.fromId) || !visibleIds.has(edge.toId)) {
        continue;
      }
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.dataset.edgeFrom = edge.fromId;
      path.dataset.edgeTo = edge.toId;
      path.dataset.edgeState = edge.state;
      path.setAttribute('d', 'M0 0 L1 1');
      path.setAttribute('stroke', edge.state === 'satisfied' ? '#6b9b4b' : edge.state === 'planned' ? '#e8c170' : 'rgba(255,255,255,0.24)');
      path.setAttribute('fill', 'none');
      edgeLayer.appendChild(path);
    }
    mapWrap.appendChild(edgeLayer);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-auto-flow:column;grid-auto-columns:minmax(210px, max-content);gap:14px;align-items:start;';
    mapWrap.appendChild(grid);

    const eras = [...new Set(visibleNodes.map(node => node.era))].sort((a, b) => a - b);
    for (const era of eras) {
      const eraColumn = document.createElement('section');
      eraColumn.dataset.era = String(era);
      eraColumn.style.cssText = 'min-width:210px;';

      const eraHeading = document.createElement('h3');
      eraHeading.textContent = getEraLabel(era);
      eraHeading.style.cssText = era === 5
        ? 'font-size:11px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#e8c170;margin:0 0 8px;'
        : 'font-size:11px;font-weight:bold;letter-spacing:0.04em;text-transform:uppercase;opacity:0.65;margin:0 0 8px;';
      eraColumn.appendChild(eraHeading);

      for (const track of progression.tracks) {
        const trackNodes = visibleNodes.filter(node => node.era === era && node.track === track);
        if (trackNodes.length === 0) {
          continue;
        }

        const trackBlock = document.createElement('section');
        trackBlock.className = 'tech-track';
        trackBlock.dataset.track = track;
        trackBlock.style.cssText = 'margin-bottom:12px;';

        const trackHeading = document.createElement('div');
        trackHeading.textContent = `${TRACK_ICONS[track]} ${titleCase(track)}`;
        trackHeading.style.cssText = 'font-size:12px;color:#e0d6c8;margin:0 0 6px;';
        trackBlock.appendChild(trackHeading);

        for (const node of trackNodes) {
          trackBlock.appendChild(createTechNode(node, {
            isFocused: progression.focusTechId === node.tech.id,
            isSelected: selectedTechId === node.tech.id,
            onSelect: (techId) => {
              selectedTechId = techId;
              renderTree();
            },
            onQueueResearch: queueResearchAndReopen,
          }));
        }

        eraColumn.appendChild(trackBlock);
      }

      grid.appendChild(eraColumn);
    }

    renderInspector(
      inspector,
      selectedTechId ? progression.nodesById.get(selectedTechId) : undefined,
      civ,
      progression.queueableIds,
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

      if (action === 'up' && index > 0) {
        callbacks.onMoveQueuedResearch(index, index - 1);
        reopenPanel();
        return;
      }

      if (action === 'down' && index < civ.techState.researchQueue.length - 1) {
        callbacks.onMoveQueuedResearch(index, index + 1);
        reopenPanel();
      }
    });
  });

  return panel;
}
