import type { GameState, Tech, TechTrack } from '@/core/types';
import { getAvailableTechs, TECH_TREE } from '@/systems/tech-system';
import { calculateCityYields } from '@/systems/resource-system';
import { estimateTurnsToComplete } from '@/systems/pacing-model';

export interface TechPanelCallbacks {
  onQueueResearch: (techId: string) => void;
  onMoveQueuedResearch: (fromIndex: number, toIndex: number) => void;
  onRemoveQueuedResearch: (index: number) => void;
  onClose: () => void;
}

const TRACKS: TechTrack[] = [
  'military', 'economy', 'science', 'civics', 'exploration',
  'agriculture', 'medicine', 'philosophy', 'arts', 'maritime',
  'metallurgy', 'construction', 'communication', 'espionage', 'spirituality',
];

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

function titleCase(track: string): string {
  return track.charAt(0).toUpperCase() + track.slice(1);
}

function getEraLabel(era: number): string {
  return era === 5 ? 'Late Era Foundations' : `Era ${era}`;
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
  fill.style.cssText = `background:#e8c170;border-radius:4px;height:8px;width:${progress}%;`;
  progressBar.appendChild(fill);
  wrapper.appendChild(progressBar);

  return wrapper;
}

function getNextLayerTechIds(civ: GameState['civilizations'][string]): Set<string> {
  const availableIds = new Set(getAvailableTechs(civ.techState).map(tech => tech.id));
  const completedIds = new Set(civ.techState.completed);
  return new Set(
    TECH_TREE
      .filter(tech => !availableIds.has(tech.id) && !completedIds.has(tech.id) && civ.techState.currentResearch !== tech.id)
      .filter(tech => tech.prerequisites.length > 0)
      .filter(tech => tech.prerequisites.every(prereq =>
        completedIds.has(prereq)
        || availableIds.has(prereq)
        || civ.techState.currentResearch === prereq))
      .filter(tech => tech.prerequisites.some(prereq => !completedIds.has(prereq)))
      .map(tech => tech.id),
  );
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

function createTechItem(
  tech: Tech,
  opts: {
    isCompleted: boolean;
    isCurrent: boolean;
    isAvailable: boolean;
    isNextLayer: boolean;
    turnsToResearch: number | null;
    onQueueResearch: (techId: string) => void;
  },
): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'tech-item';
  item.dataset.techId = tech.id;
  item.dataset.state = opts.isCompleted ? 'completed' : opts.isCurrent ? 'current' : opts.isAvailable ? 'available' : 'locked';

  let background = 'rgba(255,255,255,0.05)';
  let border = 'transparent';
  let opacity = '0.4';
  let cursor = 'default';

  if (opts.isCompleted) {
    background = 'rgba(107,155,75,0.3)';
    border = '#6b9b4b';
    opacity = '1';
  } else if (opts.isCurrent) {
    background = 'rgba(232,193,112,0.2)';
    border = '#e8c170';
    opacity = '1';
  } else if (opts.isAvailable) {
    background = 'rgba(255,255,255,0.1)';
    border = 'rgba(255,255,255,0.3)';
    opacity = '1';
    cursor = 'pointer';
  }

  if (opts.isNextLayer && !opts.isAvailable && !opts.isCurrent && !opts.isCompleted) {
    opacity = '0.75';
    border = 'rgba(232,193,112,0.2)';
  }

  item.style.cssText = `background:${background};border:1px solid ${border};border-radius:8px;padding:10px;margin-bottom:6px;opacity:${opacity};cursor:${cursor};`;

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:bold;font-size:13px;';
  title.textContent = `${tech.name}${opts.isCompleted ? ' ✓' : ''}${opts.isCurrent ? ' ⏳' : ''}`;
  item.appendChild(title);

  const detail = document.createElement('div');
  detail.style.cssText = 'font-size:11px;opacity:0.7;';
  const etaText = opts.turnsToResearch === null ? 'ETA unknown' : `${opts.turnsToResearch} turns`;
  detail.textContent = `${tech.unlocks[0] ?? 'New options'} · ${etaText} · Cost: ${tech.cost}`;
  item.appendChild(detail);

  if (opts.isAvailable) {
    item.addEventListener('click', () => {
      opts.onQueueResearch(tech.id);
    });
  }

  return item;
}

function buildEraSection(
  era: number,
  techs: Tech[],
  civ: GameState['civilizations'][string],
  available: Tech[],
  nextLayerIds: Set<string>,
  callbacks: TechPanelCallbacks,
  outputPerTurn: number,
  showAll: boolean,
): HTMLElement {
  const section = document.createElement('div');
  section.dataset.era = String(era);
  section.style.cssText = 'margin-bottom:10px;';

  const heading = document.createElement('div');
  heading.textContent = getEraLabel(era);
  heading.style.cssText = era === 5
    ? 'font-size:11px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#e8c170;margin:0 0 6px;'
    : 'font-size:11px;font-weight:bold;letter-spacing:0.04em;text-transform:uppercase;opacity:0.65;margin:0 0 6px;';
  section.appendChild(heading);

  for (const tech of techs) {
    const isVisibleByDefault = civ.techState.currentResearch === tech.id
      || available.some(candidate => candidate.id === tech.id)
      || nextLayerIds.has(tech.id)
      || civ.techState.completed.includes(tech.id);

    if (!showAll && !isVisibleByDefault) {
      continue;
    }

    section.appendChild(createTechItem(tech, {
      isCompleted: civ.techState.completed.includes(tech.id),
      isCurrent: civ.techState.currentResearch === tech.id,
      isAvailable: available.some(candidate => candidate.id === tech.id),
      isNextLayer: nextLayerIds.has(tech.id),
      turnsToResearch: available.some(candidate => candidate.id === tech.id)
        ? estimateTurnsToComplete({ cost: tech.cost, outputPerTurn })
        : null,
      onQueueResearch: callbacks.onQueueResearch,
    }));
  }

  if (!section.querySelector('.tech-item')) {
    return document.createElement('div');
  }

  return section;
}

export function createTechPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: TechPanelCallbacks,
): HTMLElement {
  container.querySelector('#tech-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'tech-panel';
  panel.dataset.layout = 'tech-tree-grid';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.95);z-index:30;overflow-y:auto;padding:16px;padding-bottom:80px;';

  const civ = state.civilizations[state.currentPlayer];
  const available = getAvailableTechs(civ.techState);
  const nextLayerIds = getNextLayerTechIds(civ);
  const sciencePerTurn = Math.max(
    1,
    civ.cities
      .map(cityId => state.cities[cityId])
      .filter((city): city is NonNullable<typeof state.cities[string]> => city !== undefined)
      .reduce((total, city) => total + calculateCityYields(city, state.map).science, 0),
  );
  const queueTiming = getQueuedResearchTiming(civ, sciencePerTurn);

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
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;background:rgba(255,255,255,0.06);border-radius:8px;padding:8px;';

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
      controls.style.cssText = 'display:flex;gap:6px;';
      const up = document.createElement('button');
      up.type = 'button';
      up.dataset.queueAction = 'up';
      up.dataset.queueIndex = String(index);
      up.textContent = '↑';
      const down = document.createElement('button');
      down.type = 'button';
      down.dataset.queueAction = 'down';
      down.dataset.queueIndex = String(index);
      down.textContent = '↓';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.queueAction = 'remove';
      remove.dataset.queueIndex = String(index);
      remove.textContent = '✕';
      controls.appendChild(up);
      controls.appendChild(down);
      controls.appendChild(remove);
      row.appendChild(controls);
      queueSection.appendChild(row);
    });
  }

  panel.appendChild(queueSection);

  const showAllButton = document.createElement('button');
  showAllButton.type = 'button';
  showAllButton.dataset.action = 'show-all-techs';
  showAllButton.textContent = 'Show all techs';
  showAllButton.style.cssText = 'margin-bottom:12px;';
  panel.appendChild(showAllButton);

  const grid = document.createElement('div');
  grid.dataset.layout = 'tech-tree-grid';

  const renderGrid = (showAll: boolean) => {
    grid.textContent = '';

    for (const track of TRACKS) {
      const trackBlock = document.createElement('section');
      trackBlock.className = 'tech-track';
      trackBlock.dataset.track = track;
      trackBlock.style.cssText = 'margin-bottom:16px;';

      const heading = document.createElement('h3');
      heading.textContent = `${TRACK_ICONS[track]} ${titleCase(track)}`;
      heading.style.cssText = 'font-size:14px;color:#e0d6c8;margin:0 0 8px;';
      trackBlock.appendChild(heading);

      const techs = TECH_TREE.filter(tech => tech.track === track);
      const eras = [...new Set(techs.map(tech => tech.era))].sort((a, b) => a - b);
      for (const era of eras) {
        const eraTechs = techs.filter(tech => tech.era === era);
        const section = buildEraSection(era, eraTechs, civ, available, nextLayerIds, callbacks, sciencePerTurn, showAll);
        if (section.childNodes.length > 0) {
          trackBlock.appendChild(section);
        }
      }

      if (trackBlock.querySelector('.tech-item')) {
        grid.appendChild(trackBlock);
      }
    }
  };

  renderGrid(false);
  showAllButton.addEventListener('click', () => {
    renderGrid(true);
    showAllButton.remove();
  });

  panel.appendChild(grid);
  container.appendChild(panel);

  const reopenPanel = () => {
    panel.remove();
    createTechPanel(container, state, callbacks);
  };

  panel.querySelectorAll('[data-state="available"]').forEach(el => {
    el.addEventListener('click', () => {
      reopenPanel();
    });
  });

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
