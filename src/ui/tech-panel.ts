import type { GameState, Tech, TechTrack } from '@/core/types';
import { getAvailableTechs, TECH_TREE } from '@/systems/tech-system';

export interface TechPanelCallbacks {
  onStartResearch: (techId: string) => void;
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

function buildCurrentResearchSummary(currentTech: Tech | undefined, progress: number): HTMLDivElement | null {
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
  summary.textContent = `${titleCase(currentTech.track)} · ${currentTech.unlocks[0] ?? 'New options for your empire'}`;
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

function createTechItem(
  tech: Tech,
  opts: {
    isCompleted: boolean;
    isCurrent: boolean;
    isAvailable: boolean;
    onStartResearch: (techId: string) => void;
    onClosePanel: () => void;
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

  item.style.cssText = `background:${background};border:1px solid ${border};border-radius:8px;padding:10px;margin-bottom:6px;opacity:${opacity};cursor:${cursor};`;

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:bold;font-size:13px;';
  title.textContent = `${tech.name}${opts.isCompleted ? ' ✓' : ''}${opts.isCurrent ? ' ⏳' : ''}`;
  item.appendChild(title);

  const detail = document.createElement('div');
  detail.style.cssText = 'font-size:11px;opacity:0.7;';
  detail.textContent = `${tech.unlocks[0] ?? 'New options'} · Cost: ${tech.cost}`;
  item.appendChild(detail);

  if (opts.isAvailable) {
    item.addEventListener('click', () => {
      opts.onStartResearch(tech.id);
      opts.onClosePanel();
    });
  }

  return item;
}

function buildEraSection(
  era: number,
  techs: Tech[],
  civ: GameState['civilizations'][string],
  available: Tech[],
  callbacks: TechPanelCallbacks,
  panel: HTMLElement,
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
    section.appendChild(createTechItem(tech, {
      isCompleted: civ.techState.completed.includes(tech.id),
      isCurrent: civ.techState.currentResearch === tech.id,
      isAvailable: available.some(candidate => candidate.id === tech.id),
      onStartResearch: callbacks.onStartResearch,
      onClosePanel: () => panel.remove(),
    }));
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
  const summary = buildCurrentResearchSummary(currentTech, currentProgress);
  if (summary) {
    panel.appendChild(summary);
  }

  const grid = document.createElement('div');
  grid.dataset.layout = 'tech-tree-grid';

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
      trackBlock.appendChild(buildEraSection(era, eraTechs, civ, available, callbacks, panel));
    }

    grid.appendChild(trackBlock);
  }

  panel.appendChild(grid);
  container.appendChild(panel);
  return panel;
}
