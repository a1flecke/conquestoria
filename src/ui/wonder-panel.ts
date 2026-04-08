import type { GameState } from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';

export interface WonderPanelCallbacks {
  onStartBuild: (cityId: string, wonderId: string) => void;
  onClose: () => void;
}

export function createWonderPanel(
  container: HTMLElement,
  state: GameState,
  cityId: string,
  callbacks: WonderPanelCallbacks,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'wonder-panel';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.95);z-index:31;overflow-y:auto;padding:16px;padding-bottom:80px;';

  const title = document.createElement('h2');
  title.textContent = 'Legendary Wonders';
  panel.appendChild(title);

  const appendSection = (heading: string, body: string) => {
    const section = document.createElement('section');
    const header = document.createElement('h3');
    header.textContent = heading;
    const copy = document.createElement('p');
    copy.textContent = body;
    section.appendChild(header);
    section.appendChild(copy);
    panel.appendChild(section);
  };

  appendSection(
    'Eligibility',
    'Required techs, resources, and city conditions.',
  );
  appendSection('Quest', 'Complete every step before construction unlocks.');
  appendSection('Construction Race', 'Losing returns 25% coins and 25% carryover.');

  const cityProjects = Object.values(state.legendaryWonderProjects ?? {})
    .filter(project => project.ownerId === state.currentPlayer && project.cityId === cityId);

  if (cityProjects.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No legendary wonders are available in this city yet.';
    panel.appendChild(empty);
  }

  for (const project of cityProjects) {
    const definition = getLegendaryWonderDefinition(project.wonderId);
    const section = document.createElement('section');

    const header = document.createElement('h3');
    header.textContent = definition?.name ?? project.wonderId;
    section.appendChild(header);

    const phase = document.createElement('p');
    phase.textContent = `Phase: ${project.phase.replaceAll('_', ' ')}`;
    section.appendChild(phase);

    const requirements = document.createElement('p');
    requirements.textContent = definition
      ? `Requires ${definition.requiredTechs.join(', ') || 'no extra techs'} and ${definition.productionCost} production.`
      : 'Wonder requirements unavailable.';
    section.appendChild(requirements);

    const progress = document.createElement('p');
    progress.textContent = project.questSteps.length > 0
      ? `Quest steps: ${project.questSteps.filter(step => step.completed).length}/${project.questSteps.length} complete.`
      : 'Quest steps complete.';
    section.appendChild(progress);

    if (project.phase === 'ready_to_build') {
      const startBuild = document.createElement('button');
      startBuild.textContent = 'Start Build';
      startBuild.addEventListener('click', () => callbacks.onStartBuild(project.cityId, project.wonderId));
      section.appendChild(startBuild);
    }

    panel.appendChild(section);
  }

  const close = document.createElement('button');
  close.textContent = 'Close';
  close.addEventListener('click', () => callbacks.onClose());
  panel.appendChild(close);

  container.appendChild(panel);
  return panel;
}
