import type { GameState, TechTrack } from '@/core/types';
import { getAvailableTechs, TECH_TREE } from '@/systems/tech-system';

export interface TechPanelCallbacks {
  onStartResearch: (techId: string) => void;
  onClose: () => void;
}

export function createTechPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: TechPanelCallbacks,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'tech-panel';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.95);z-index:30;overflow-y:auto;padding:16px;padding-bottom:80px;';

  const civ = state.civilizations[state.currentPlayer];
  const available = getAvailableTechs(civ.techState);

  // Pre-compute current research data if active
  let currentResearchProgress = 0;
  let currentResearchHtml = '';
  if (civ.techState.currentResearch) {
    const currentTech = TECH_TREE.find(t => t.id === civ.techState.currentResearch);
    if (currentTech) {
      currentResearchProgress = Math.round((civ.techState.researchProgress / currentTech.cost) * 100);
      currentResearchHtml = `
        <div style="background:rgba(255,255,255,0.1);border-radius:10px;padding:12px;margin-bottom:16px;">
          <div style="font-weight:bold;color:#e8c170;">Researching: <span data-text="current-tech-name"></span></div>
          <div style="font-size:12px;opacity:0.7;"><span data-text="current-tech-track"></span> · <span data-text="current-tech-unlocks"></span></div>
          <div style="background:rgba(0,0,0,0.3);border-radius:4px;height:8px;margin-top:8px;">
            <div style="background:#e8c170;border-radius:4px;height:8px;width:${currentResearchProgress}%;"></div>
          </div>
          <div style="font-size:11px;opacity:0.5;margin-top:4px;"><span data-text="current-tech-progress"></span>/<span data-text="current-tech-cost"></span></div>
        </div>
      `;
    }
  }

  const tracks: TechTrack[] = [
    'military', 'economy', 'science', 'civics', 'exploration',
    'agriculture', 'medicine', 'philosophy', 'arts', 'maritime',
    'metallurgy', 'construction', 'communication', 'espionage', 'spirituality',
  ];
  const trackIcons: Record<string, string> = {
    military: '⚔️', economy: '💰', science: '🔬', civics: '📜', exploration: '🧭',
    agriculture: '🌾', medicine: '🩺', philosophy: '💭', arts: '🎨', maritime: '⚓',
    metallurgy: '⛏️', construction: '🏗️', communication: '📯', espionage: '🕵️', spirituality: '🙏',
  };

  // Pre-collect tech items with indices for textContent injection
  interface TechItem { trackLabel: string; techId: string; globalIdx: number; isCompleted: boolean; isCurrent: boolean; isAvailable: boolean; }
  const techItems: TechItem[] = [];
  let globalIdx = 0;

  let tracksHtml = '';
  for (const track of tracks) {
    const trackTechs = TECH_TREE.filter(t => t.track === track);
    const trackLabel = track.charAt(0).toUpperCase() + track.slice(1);
    tracksHtml += `<div style="margin-bottom:16px;">
      <h3 style="font-size:14px;color:#e0d6c8;margin:0 0 8px;">${trackIcons[track]} ${trackLabel}</h3>`;

    for (const tech of trackTechs) {
      const isCompleted = civ.techState.completed.includes(tech.id);
      const isAvailable = available.some(t => t.id === tech.id);
      const isCurrent = civ.techState.currentResearch === tech.id;

      let bg = 'rgba(255,255,255,0.05)';
      let border = 'transparent';
      let opacity = '0.4';
      let cursor = 'default';

      if (isCompleted) { bg = 'rgba(107,155,75,0.3)'; border = '#6b9b4b'; opacity = '1'; }
      else if (isCurrent) { bg = 'rgba(232,193,112,0.2)'; border = '#e8c170'; opacity = '1'; }
      else if (isAvailable) { bg = 'rgba(255,255,255,0.1)'; border = 'rgba(255,255,255,0.3)'; opacity = '1'; cursor = 'pointer'; }

      const completedMark = isCompleted ? ' ✓' : '';
      const currentMark = isCurrent ? ' ⏳' : '';

      tracksHtml += `
        <div class="tech-item" data-tech-id="${tech.id}" style="background:${bg};border:1px solid ${border};border-radius:8px;padding:10px;margin-bottom:6px;opacity:${opacity};cursor:${cursor};">
          <div style="font-weight:bold;font-size:13px;"><span data-text="tech-name-${globalIdx}"></span><span data-text="tech-marks-${globalIdx}"></span></div>
          <div style="font-size:11px;opacity:0.7;"><span data-text="tech-unlocks-${globalIdx}"></span> · Cost: <span data-text="tech-cost-${globalIdx}"></span></div>
        </div>
      `;

      techItems.push({ trackLabel, techId: tech.id, globalIdx, isCompleted, isCurrent, isAvailable });
      globalIdx++;
    }
    tracksHtml += '</div>';
  }

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="font-size:18px;color:#e8c170;margin:0;">Research</h2>
      <span id="tech-close" style="cursor:pointer;font-size:24px;opacity:0.6;">✕</span>
    </div>
    ${currentResearchHtml}
    ${tracksHtml}
  `;

  panel.innerHTML = html;

  // Inject all dynamic text via textContent (XSS-safe)
  const setText = (sel: string, text: string) => {
    const el = panel.querySelector(`[data-text="${sel}"]`);
    if (el) el.textContent = text;
  };

  if (civ.techState.currentResearch) {
    const currentTech = TECH_TREE.find(t => t.id === civ.techState.currentResearch);
    if (currentTech) {
      setText('current-tech-name', currentTech.name);
      setText('current-tech-track', currentTech.track);
      setText('current-tech-unlocks', currentTech.unlocks[0] ?? '');
      setText('current-tech-progress', String(civ.techState.researchProgress));
      setText('current-tech-cost', String(currentTech.cost));
    }
  }

  // Iterate the same order as when we built HTML to match indices
  let techIdx = 0;
  for (const track of tracks) {
    const trackTechs = TECH_TREE.filter(t => t.track === track);
    for (const tech of trackTechs) {
      const isCompleted = civ.techState.completed.includes(tech.id);
      const isCurrent = civ.techState.currentResearch === tech.id;
      const completedMark = isCompleted ? ' ✓' : '';
      const currentMark = isCurrent ? ' ⏳' : '';
      setText(`tech-name-${techIdx}`, tech.name);
      setText(`tech-marks-${techIdx}`, completedMark + currentMark);
      setText(`tech-unlocks-${techIdx}`, tech.unlocks[0] ?? '');
      setText(`tech-cost-${techIdx}`, String(tech.cost));
      techIdx++;
    }
  }

  container.appendChild(panel);

  // Event listeners
  panel.querySelector('#tech-close')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onClose();
  });

  panel.querySelectorAll('.tech-item').forEach(el => {
    const techId = (el as HTMLElement).dataset.techId!;
    const isAvailable = available.some(t => t.id === techId);
    if (isAvailable) {
      el.addEventListener('click', () => {
        callbacks.onStartResearch(techId);
        panel.remove();
      });
    }
  });

  return panel;
}
