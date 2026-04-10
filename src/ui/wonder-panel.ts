import type { GameState } from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';

export interface WonderPanelCallbacks {
  onStartBuild: (cityId: string, wonderId: string) => void;
  onClose: () => void;
}

function getOwnedResources(state: GameState, cityId: string): Set<string> {
  const city = state.cities[cityId];
  if (!city) {
    return new Set();
  }

  return new Set(
    city.ownedTiles
      .map(coord => state.map.tiles[`${coord.q},${coord.r}`]?.resource)
      .filter((resource): resource is string => resource !== null),
  );
}

function getMissingConditions(state: GameState, cityId: string, ownerId: string, wonderId: string): string[] {
  const definition = getLegendaryWonderDefinition(wonderId);
  const city = state.cities[cityId];
  const civ = state.civilizations[ownerId];
  if (!definition || !city || !civ) {
    return ['requirements unavailable'];
  }

  const missingTechs = definition.requiredTechs.filter(tech => !civ.techState.completed.includes(tech));
  const ownedResources = getOwnedResources(state, cityId);
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

  return missingConditions;
}

function getProjectPriority(state: GameState, cityId: string, wonderId: string, phase: string): number {
  const definition = getLegendaryWonderDefinition(wonderId);
  const missingConditions = getMissingConditions(state, cityId, state.currentPlayer, wonderId);
  const phaseBonus = phase === 'ready_to_build' ? 120 : phase === 'questing' ? 70 : phase === 'building' ? 40 : 0;
  const missingPenalty = missingConditions.length * 15;
  const costPenalty = Math.floor((definition?.productionCost ?? 300) / 50);
  return phaseBonus - missingPenalty - costPenalty;
}

function appendProjectCard(
  state: GameState,
  project: NonNullable<GameState['legendaryWonderProjects']>[string],
  section: HTMLElement,
  callbacks: WonderPanelCallbacks,
  options: { recommended?: boolean } = {},
): void {
  const definition = getLegendaryWonderDefinition(project.wonderId);
  const city = state.cities[project.cityId];
  const civ = state.civilizations[project.ownerId];
  const article = document.createElement('article');
  article.dataset.projectCard = project.wonderId;
  if (options.recommended) {
    article.dataset.recommendedProject = 'true';
  }

  const header = document.createElement('h3');
  header.textContent = definition?.name ?? project.wonderId;
  article.appendChild(header);

  const phase = document.createElement('p');
  phase.textContent = `Phase: ${project.phase.replaceAll('_', ' ')}`;
  article.appendChild(phase);

  const requirements = document.createElement('p');
  requirements.textContent = definition
    ? `Requires ${definition.requiredTechs.join(', ') || 'no extra techs'} and ${definition.productionCost} production.`
    : 'Wonder requirements unavailable.';
  article.appendChild(requirements);

  const eligibility = document.createElement('p');
  const missingConditions = getMissingConditions(state, project.cityId, project.ownerId, project.wonderId);
  eligibility.textContent = missingConditions.length > 0
    ? `Missing: ${missingConditions.join(', ')}.`
    : 'Missing: none.';
  article.appendChild(eligibility);

  const progress = document.createElement('p');
  progress.textContent = project.questSteps.length > 0
    ? `Quest steps: ${project.questSteps.filter(step => step.completed).length}/${project.questSteps.length} complete.`
    : 'Quest steps complete.';
  article.appendChild(progress);

  for (const step of project.questSteps) {
    const stepLine = document.createElement('p');
    stepLine.textContent = `${step.completed ? 'Done' : 'Pending'}: ${step.description}`;
    article.appendChild(stepLine);
  }

  const reward = document.createElement('p');
  reward.textContent = `Reward: ${definition?.reward.summary ?? 'Unavailable.'}`;
  article.appendChild(reward);

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
  article.appendChild(race);

  if (project.phase === 'ready_to_build') {
    const startBuild = document.createElement('button');
    startBuild.textContent = 'Start Build';
    startBuild.addEventListener('click', () => callbacks.onStartBuild(project.cityId, project.wonderId));
    article.appendChild(startBuild);
  }

  if (city && civ && project.ownerId !== state.currentPlayer) {
    const rival = document.createElement('p');
    rival.textContent = `${civ.name} is pursuing this in ${city.name}.`;
    article.appendChild(rival);
  }

  section.appendChild(article);
}

function appendProjectSection(
  panel: HTMLElement,
  heading: string,
  dataSection: string,
  projects: Array<NonNullable<GameState['legendaryWonderProjects']>[string]>,
  state: GameState,
  callbacks: WonderPanelCallbacks,
  options: { recommended?: boolean } = {},
): void {
  if (projects.length === 0) {
    return;
  }

  const section = document.createElement('section');
  section.dataset.section = dataSection;

  const header = document.createElement('h3');
  header.textContent = heading;
  section.appendChild(header);

  for (const project of projects) {
    appendProjectCard(state, project, section, callbacks, options);
  }

  panel.appendChild(section);
}

function getVisibleRivalWonderProjects(state: GameState): Array<NonNullable<GameState['legendaryWonderProjects']>[string]> {
  const visibleProjectKeys = state.legendaryWonderIntel?.[state.currentPlayer] ?? [];
  return visibleProjectKeys
    .map(projectKey => state.legendaryWonderProjects?.[projectKey])
    .filter((project): project is NonNullable<GameState['legendaryWonderProjects']>[string] =>
      Boolean(project && project.ownerId !== state.currentPlayer && project.phase === 'building'),
    );
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
  const rivalProjects = getVisibleRivalWonderProjects(state);

  if (cityProjects.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No legendary wonders are available in this city yet.';
    panel.appendChild(empty);
  }

  const sortedCityProjects = [...cityProjects].sort((left, right) =>
    getProjectPriority(state, cityId, right.wonderId, right.phase)
    - getProjectPriority(state, cityId, left.wonderId, left.phase),
  );
  const recommendedProjects = sortedCityProjects
    .filter(project => project.phase === 'ready_to_build' || project.phase === 'questing')
    .slice(0, 3);
  const recommendedIds = new Set(recommendedProjects.map(project => project.wonderId));
  const laterProjects = sortedCityProjects
    .filter(project => !recommendedIds.has(project.wonderId));

  appendProjectSection(panel, 'Best fits right now', 'recommended-wonders', recommendedProjects, state, callbacks, {
    recommended: true,
  });
  appendProjectSection(panel, 'All ambitions in this city', 'all-city-wonders', laterProjects, state, callbacks);
  appendProjectSection(panel, 'In progress elsewhere', 'rival-wonders', rivalProjects.slice(0, 3), state, callbacks);

  const close = document.createElement('button');
  close.textContent = 'Close';
  close.addEventListener('click', () => callbacks.onClose());
  panel.appendChild(close);

  container.appendChild(panel);
  return panel;
}
