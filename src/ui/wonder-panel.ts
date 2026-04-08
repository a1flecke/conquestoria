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
    const city = state.cities[project.cityId];
    const civ = state.civilizations[project.ownerId];
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

    const eligibility = document.createElement('p');
    if (definition && city && civ) {
      const missingTechs = definition.requiredTechs.filter(tech => !civ.techState.completed.includes(tech));
      const ownedResources = new Set(
        city.ownedTiles
          .map(coord => state.map.tiles[`${coord.q},${coord.r}`]?.resource)
          .filter((resource): resource is string => resource !== null),
      );
      const missingResources = definition.requiredResources.filter(resource => !ownedResources.has(resource));
      const missingConditions = [
        ...missingTechs.map(tech => `tech ${tech}`),
        ...missingResources.map(resource => `resource ${resource}`),
      ];

      if (definition.cityRequirement === 'river'
        && !city.ownedTiles.some(coord => state.map.tiles[`${coord.q},${coord.r}`]?.hasRiver)) {
        missingConditions.push('river city');
      }

      if (definition.cityRequirement === 'coastal'
        && !city.ownedTiles.some(coord => {
          const tile = state.map.tiles[`${coord.q},${coord.r}`];
          return tile?.terrain === 'coast' || tile?.terrain === 'ocean';
        })) {
        missingConditions.push('coastal city');
      }

      eligibility.textContent = missingConditions.length > 0
        ? `Missing: ${missingConditions.join(', ')}.`
        : 'Missing: none.';
    } else {
      eligibility.textContent = 'Missing: requirements unavailable.';
    }
    section.appendChild(eligibility);

    const progress = document.createElement('p');
    progress.textContent = project.questSteps.length > 0
      ? `Quest steps: ${project.questSteps.filter(step => step.completed).length}/${project.questSteps.length} complete.`
      : 'Quest steps complete.';
    section.appendChild(progress);

    for (const step of project.questSteps) {
      const stepLine = document.createElement('p');
      stepLine.textContent = `${step.completed ? 'Done' : 'Pending'}: ${step.description}`;
      section.appendChild(stepLine);
    }

    const reward = document.createElement('p');
    reward.textContent = `Reward: ${definition?.reward.summary ?? 'Unavailable.'}`;
    section.appendChild(reward);

    const race = document.createElement('p');
    if (project.phase === 'building') {
      race.textContent = `Race status: ${project.investedProduction}/${definition?.productionCost ?? 0} production invested.`;
    } else if (project.phase === 'completed') {
      race.textContent = 'Race status: won.';
    } else if (project.phase === 'lost_race') {
      race.textContent = `Race status: lost. ${project.transferableProduction} carryover remains in this city.`;
    } else {
      race.textContent = 'Race status: not yet in construction.';
    }
    section.appendChild(race);

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
