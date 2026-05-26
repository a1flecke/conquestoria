import type { GameState, LegendaryWonderStartedIntelEntry } from '@/core/types';
import {
  getLegendaryWonderPresentationForCity,
  type LegendaryWonderPresentationEntry,
  type LegendaryWonderVisibleState,
} from '@/systems/legendary-wonder-presentation';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { getLegendaryWonderIntelForViewer } from '@/systems/legendary-wonder-intel';
import { createGameButton } from '@/ui/ui-kit';

export interface WonderPanelCallbacks {
  onStartBuild: (cityId: string, wonderId: string) => void;
  onClose: () => void;
}

function getVisibleStateLabel(state: LegendaryWonderVisibleState): string {
  switch (state) {
    case 'ready':
      return 'Ready to build';
    case 'questing':
      return 'Quest in progress';
    case 'building':
      return 'Under construction';
    case 'completed':
      return 'Completed';
    case 'recovered':
      return 'Race lost';
    case 'near':
      return 'Available soon';
    case 'blocked':
      return 'Blocked';
  }
}

function appendText(parent: HTMLElement, tagName: keyof HTMLElementTagNameMap, text: string): HTMLElement {
  const element = document.createElement(tagName);
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function appendProjectCard(
  entry: LegendaryWonderPresentationEntry,
  section: HTMLElement,
  callbacks: WonderPanelCallbacks,
  cityId: string,
  options: { recommended?: boolean } = {},
): void {
  const article = document.createElement('article');
  article.dataset.projectCard = entry.wonderId;
  article.style.cssText = 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:12px;margin-bottom:10px;';
  if (options.recommended) {
    article.dataset.recommendedProject = 'true';
  }

  appendText(article, 'h3', entry.name);
  appendText(article, 'p', getVisibleStateLabel(entry.visibleState));
  appendText(article, 'p', `Requires ${entry.productionCost} production.`);
  appendText(article, 'p', entry.missingRequirements.length > 0
    ? `Missing: ${entry.missingRequirements.join(', ')}.`
    : 'Missing: none.');
  appendText(article, 'p', `Quest steps: ${entry.questCompleted}/${entry.questTotal} complete.`);

  for (const step of entry.questSteps) {
    appendText(article, 'p', `${step.completed ? 'Done' : 'Pending'}: ${step.description}`);
  }

  appendText(article, 'p', `Reward: ${entry.rewardSummary}`);
  if (entry.milestoneLabel) appendText(article, 'p', `Construction: ${entry.milestoneLabel}.`);
  if (entry.turnsRemaining !== null) appendText(article, 'p', `${entry.turnsRemaining} turns remaining.`);
  if (entry.raceTensionLabel) appendText(article, 'p', entry.raceTensionLabel);
  if (entry.productionResumedLabel) appendText(article, 'p', entry.productionResumedLabel);
  if (entry.visibleState === 'completed') appendText(article, 'p', 'Reward active.');
  if (entry.recoveryLabel) appendText(article, 'p', entry.recoveryLabel);

  if (entry.visibleState === 'building') {
    appendText(article, 'p', `Race status: ${entry.investedProduction}/${entry.productionCost} production invested.`);
  } else if (entry.visibleState === 'completed') {
    appendText(article, 'p', 'Race status: won.');
  } else if (entry.visibleState === 'recovered') {
    appendText(article, 'p', `Race status: lost. ${entry.transferableProduction} carryover remains in this city.`);
  } else {
    appendText(article, 'p', 'Race status: not yet in construction.');
  }

  if (entry.canStartBuild && entry.startActionLabel) {
    appendText(article, 'p', 'Starting now makes this the active production; current queue continues after this wonder.');
    const startBuild = createGameButton(entry.startActionLabel, 'primary');
    startBuild.addEventListener('click', () => callbacks.onStartBuild(cityId, entry.wonderId));
    article.appendChild(startBuild);
  }

  section.appendChild(article);
}

function appendRivalIntelCard(
  intel: LegendaryWonderStartedIntelEntry,
  section: HTMLElement,
): void {
  const definition = getLegendaryWonderDefinition(intel.wonderId);
  const article = document.createElement('article');
  article.dataset.rivalIntelCard = intel.wonderId;
  article.style.cssText = 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:12px;margin-bottom:10px;';

  appendText(article, 'h3', definition?.name ?? intel.wonderId);
  appendText(article, 'p', `${intel.civName} is pursuing this in ${intel.cityName}.`);
  appendText(article, 'p', `Spy report from turn ${intel.revealedTurn}.`);
  appendText(article, 'p', 'Current progress unknown without fresh infiltration.');

  section.appendChild(article);
}

function appendProjectSection(
  panel: HTMLElement,
  heading: string,
  dataSection: string,
  entries: LegendaryWonderPresentationEntry[],
  callbacks: WonderPanelCallbacks,
  cityId: string,
  options: { recommended?: boolean } = {},
): void {
  if (entries.length === 0) {
    return;
  }

  const section = document.createElement('section');
  section.dataset.section = dataSection;
  section.style.cssText = 'margin-top:16px;';

  appendText(section, 'h3', heading);

  for (const entry of entries) {
    appendProjectCard(entry, section, callbacks, cityId, options);
  }

  panel.appendChild(section);
}

function appendRivalIntelSection(
  panel: HTMLElement,
  heading: string,
  dataSection: string,
  entries: LegendaryWonderStartedIntelEntry[],
): void {
  if (entries.length === 0) {
    return;
  }

  const section = document.createElement('section');
  section.dataset.section = dataSection;
  section.style.cssText = 'margin-top:16px;';

  appendText(section, 'h3', heading);

  for (const entry of entries) {
    appendRivalIntelCard(entry, section);
  }

  panel.appendChild(section);
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

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;';
  const title = document.createElement('h2');
  title.textContent = 'Legendary Wonders';
  title.style.margin = '0';
  header.appendChild(title);

  const topClose = createGameButton('Close', 'ghost');
  topClose.dataset.wonderPanelClose = 'top';
  topClose.addEventListener('click', () => callbacks.onClose());
  header.appendChild(topClose);
  panel.appendChild(header);

  const city = state.cities[cityId];
  const civilization = state.civilizations[state.currentPlayer];
  if (city || civilization) {
    appendText(panel, 'p', `${civilization?.name ?? state.currentPlayer} - ${city?.name ?? cityId}`);
  }

  const appendIntroSection = (heading: string, body: string) => {
    const section = document.createElement('section');
    section.style.cssText = 'margin-bottom:10px;';
    appendText(section, 'h3', heading);
    appendText(section, 'p', body);
    panel.appendChild(section);
  };

  appendIntroSection(
    'Eligibility',
    'Required techs, resources, and city conditions must still be true when construction starts.',
  );
  appendIntroSection('Quest', 'Complete every step before construction unlocks.');
  appendIntroSection('Construction Race', 'Losing returns 25% coins and 25% carryover.');

  const cityEntries = getLegendaryWonderPresentationForCity(state, state.currentPlayer, cityId);
  const rivalIntel = getLegendaryWonderIntelForViewer(state, state.currentPlayer)
    .filter((entry): entry is LegendaryWonderStartedIntelEntry => entry.kind === 'started');

  if (cityEntries.length === 0) {
    appendText(panel, 'p', 'No legendary wonders are available in this city yet.');
  }

  const recommendedEntries = cityEntries
    .filter(entry => entry.visibleState !== 'blocked' && entry.visibleState !== 'completed')
    .slice(0, 3);
  const recommendedIds = new Set(recommendedEntries.map(entry => entry.wonderId));
  const laterEntries = cityEntries.filter(entry => !recommendedIds.has(entry.wonderId));

  appendProjectSection(panel, 'Best fits right now', 'recommended-wonders', recommendedEntries, callbacks, cityId, {
    recommended: true,
  });
  appendProjectSection(panel, 'All ambitions in this city', 'all-city-wonders', laterEntries, callbacks, cityId);
  appendRivalIntelSection(panel, 'In progress elsewhere', 'rival-wonders', rivalIntel.slice(0, 3));

  const bottomClose = createGameButton('Close', 'ghost');
  bottomClose.addEventListener('click', () => callbacks.onClose());
  panel.appendChild(bottomClose);

  container.appendChild(panel);
  return panel;
}
