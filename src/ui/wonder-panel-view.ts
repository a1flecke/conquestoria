import type { LegendaryWonderStartedIntelEntry } from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import type {
  LegendaryWonderPresentationEntry,
  LegendaryWonderVisibleState,
} from '@/systems/legendary-wonder-presentation';
import { createGameButton } from '@/ui/ui-kit';

export type WonderCardMode = 'recommended' | 'compact';
export type StartWonderAction = (wonderId: string) => void;

const CARD_BASE_STYLE = [
  'min-width:0',
  'overflow-wrap:anywhere',
  'background:rgba(255,255,255,0.06)',
  'border:1px solid rgba(255,255,255,0.12)',
  'border-radius:14px',
  'padding:14px',
].join(';');

const RECOMMENDED_CARD_STYLE = [
  CARD_BASE_STYLE,
  'border-color:rgba(232,193,112,0.55)',
  'box-shadow:inset 4px 0 0 #e8c170,0 0 0 1px rgba(232,193,112,0.10)',
].join(';');

const COMPACT_CARD_STYLE = `${CARD_BASE_STYLE};background:rgba(255,255,255,0.045)`;

const CHIP_BASE_STYLE = [
  'display:inline-flex',
  'align-items:center',
  'gap:4px',
  'border-radius:999px',
  'padding:4px 9px',
  'font-size:12px',
  'font-weight:700',
].join(';');

const STATUS_LABELS: Record<LegendaryWonderVisibleState, string> = {
  ready: 'Ready to build',
  questing: 'Quest in progress',
  building: 'Under construction',
  completed: 'Completed',
  recovered: 'Race lost',
  near: 'Available soon',
  blocked: 'Blocked',
};

const STATUS_ICONS: Record<LegendaryWonderVisibleState, string> = {
  ready: '✓',
  questing: '…',
  building: '⚒',
  completed: '★',
  recovered: '↩',
  near: '◇',
  blocked: '!',
};

const STATUS_COLORS: Record<LegendaryWonderVisibleState, string> = {
  ready: 'background:rgba(122,216,143,0.18);border:1px solid rgba(122,216,143,0.52);color:#d9f8df',
  questing: 'background:rgba(215,173,88,0.18);border:1px solid rgba(215,173,88,0.52);color:#f4d188',
  building: 'background:rgba(104,166,255,0.18);border:1px solid rgba(104,166,255,0.48);color:#d7e8ff',
  completed: 'background:rgba(122,216,143,0.16);border:1px solid rgba(122,216,143,0.45);color:#d9f8df',
  recovered: 'background:rgba(215,173,88,0.12);border:1px solid rgba(215,173,88,0.36);color:#dfc891',
  near: 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.20);color:#e8eef8',
  blocked: 'background:rgba(224,114,114,0.14);border:1px solid rgba(224,114,114,0.42);color:#f3b5b5',
};

function appendText(
  parent: HTMLElement,
  tagName: keyof HTMLElementTagNameMap,
  text: string,
  style?: string,
): HTMLElement {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (style) element.style.cssText = style;
  parent.appendChild(element);
  return element;
}

function appendStatusChip(parent: HTMLElement, entry: LegendaryWonderPresentationEntry): void {
  const chip = document.createElement('span');
  chip.dataset.wonderStatusChip = entry.visibleState;
  chip.style.cssText = `${CHIP_BASE_STYLE};${STATUS_COLORS[entry.visibleState]}`;
  chip.textContent = `${STATUS_ICONS[entry.visibleState]} ${STATUS_LABELS[entry.visibleState]}`;
  parent.appendChild(chip);
}

function appendBestFitChip(parent: HTMLElement, wonderId: string): void {
  const chip = document.createElement('span');
  chip.dataset.wonderBestFitChip = wonderId;
  chip.style.cssText = [
    CHIP_BASE_STYLE,
    'background:rgba(232,193,112,0.18)',
    'border:1px solid rgba(232,193,112,0.55)',
    'color:#f4d188',
  ].join(';');
  chip.textContent = 'Best fit';
  parent.appendChild(chip);
}

function appendQuestChecklist(
  parent: HTMLElement,
  entry: LegendaryWonderPresentationEntry,
  mode: WonderCardMode,
): void {
  const wrapper = document.createElement('div');
  wrapper.dataset.wonderQuestList = entry.wonderId;
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin:8px 0 10px;';
  const lastCompleted = mode === 'compact'
    ? [...entry.questSteps].reverse().find(step => step.completed)
    : undefined;
  const summary = `Quest steps: ${entry.questCompleted}/${entry.questTotal} complete.`
    + (lastCompleted ? ` Latest: ${lastCompleted.description}` : '');
  appendText(wrapper, 'p', summary, 'margin:0;');

  const rows = mode === 'recommended'
    ? entry.questSteps
    : entry.questSteps.filter(step => !step.completed).slice(0, 1);
  for (const step of rows) {
    const completed = step.completed;
    const row = document.createElement('div');
    row.dataset.wonderQuestStep = completed ? 'completed' : 'pending';
    row.style.cssText = [
      'display:flex',
      'gap:8px',
      'align-items:flex-start',
      'font-size:13px',
      'line-height:1.4',
      `color:${completed ? '#d9f8df' : '#f4d188'}`,
    ].join(';');
    row.textContent = `${completed ? '✓ Complete' : '○ Pending'}: ${step.description}`;
    wrapper.appendChild(row);
  }
  parent.appendChild(wrapper);
}

function appendRewardRow(parent: HTMLElement, entry: LegendaryWonderPresentationEntry): void {
  const row = appendText(parent, 'p', `Reward: ${entry.rewardSummary}`, 'margin:8px 0;line-height:1.4;');
  row.dataset.wonderRewardSummary = entry.wonderId;
}

function appendRaceSummary(parent: HTMLElement, entry: LegendaryWonderPresentationEntry): void {
  let text = 'Race status: not yet in construction.';
  if (entry.visibleState === 'building') {
    text = `Race status: ${entry.investedProduction}/${entry.productionCost} production invested.`;
  } else if (entry.visibleState === 'completed') {
    text = 'Race status: won.';
  } else if (entry.visibleState === 'recovered') {
    text = `Race status: lost. ${entry.transferableProduction} carryover remains in this city.`;
  }
  const row = appendText(parent, 'p', text, 'margin:8px 0;line-height:1.4;');
  row.dataset.wonderRaceSummary = entry.wonderId;
}

function appendRequirementsOrNextStep(parent: HTMLElement, entry: LegendaryWonderPresentationEntry): void {
  if (entry.missingRequirements.length > 0) {
    appendText(parent, 'p', `Missing: ${entry.missingRequirements.join(', ')}.`, 'margin:8px 0 0;line-height:1.4;');
    for (const requirement of entry.missingRequirements) {
      const guidance = requirement === 'Coastal city'
        ? 'Use a coastal city.'
        : requirement === 'River city'
          ? 'Use a river city.'
          : `Secure ${requirement}.`;
      const kind = requirement === 'Coastal city' || requirement === 'River city' ? 'city-requirement' : 'resource';
      const item = document.createElement('p');
      item.dataset.wonderGuidance = kind;
      item.style.cssText = 'margin:8px 0;line-height:1.4;';
      item.textContent = guidance;
      parent.appendChild(item);
    }
    return;
  }
  const pending = entry.questSteps.find(step => !step.completed);
  appendText(
    parent,
    'p',
    pending ? `Next: ${pending.description}` : 'All quest steps complete.',
    'margin:8px 0;line-height:1.4;',
  );
}

function getGuidanceCopy(entry: LegendaryWonderPresentationEntry): string {
  if (entry.canStartBuild && entry.startActionLabel) {
    return `${entry.name} is ready. Starting now begins construction while preserving queued production.`;
  }
  if (entry.visibleState === 'building') return `${entry.name}: construction is already underway.`;
  if (entry.visibleState === 'completed') return `${entry.name}: reward is already active.`;
  if (entry.visibleState === 'recovered') {
    return `${entry.name}: race lost, but recovered effort remains available.`;
  }
  if (entry.missingRequirements.length > 0) {
    return `${entry.name}: Missing ${entry.missingRequirements.join(', ')}.`;
  }
  const pending = entry.questSteps.find(step => !step.completed);
  if (pending) return `${entry.name}: next step — ${pending.description}`;
  return `${entry.name}: review the card below for the next step.`;
}

export function appendGuidanceStrip(
  parent: HTMLElement,
  entry: LegendaryWonderPresentationEntry,
  onStart: StartWonderAction,
): void {
  const strip = document.createElement('section');
  strip.dataset.wonderGuidance = entry.wonderId;
  strip.style.cssText = [
    'display:grid',
    'grid-template-columns:repeat(auto-fit,minmax(min(100%, 260px),1fr))',
    'align-items:center',
    'gap:12px',
    'background:rgba(232,193,112,0.10)',
    'border:1px solid rgba(232,193,112,0.28)',
    'border-radius:14px',
    'padding:12px',
    'margin-bottom:14px',
    'min-width:0',
  ].join(';');

  const copy = document.createElement('div');
  appendText(copy, 'h3', 'Best move right now', 'margin:0 0 6px;');
  appendText(copy, 'p', getGuidanceCopy(entry), 'margin:0;line-height:1.4;');
  strip.appendChild(copy);

  if (entry.canStartBuild && entry.startActionLabel) {
    const button = createGameButton(entry.startActionLabel, 'primary');
    button.dataset.wonderGuidanceStartBuild = entry.wonderId;
    button.dataset.wonderStartTarget = entry.wonderId;
    button.addEventListener('click', () => onStart(entry.wonderId));
    strip.appendChild(button);
  }
  parent.appendChild(strip);
}

export function appendWonderEmptyState(parent: HTMLElement, heading: string, body: string): void {
  const empty = document.createElement('section');
  empty.dataset.wonderEmptyState = 'true';
  empty.style.cssText = COMPACT_CARD_STYLE;
  appendText(empty, 'h3', heading, 'margin:0 0 8px;');
  appendText(empty, 'p', body, 'margin:0;line-height:1.4;');
  parent.appendChild(empty);
}

export function appendWonderErrorState(parent: HTMLElement, body: string): void {
  const error = document.createElement('section');
  error.dataset.wonderErrorState = 'true';
  error.style.cssText = COMPACT_CARD_STYLE;
  appendText(error, 'h3', 'Wonder ambitions unavailable', 'margin:0 0 8px;');
  appendText(error, 'p', body, 'margin:0;line-height:1.4;');
  parent.appendChild(error);
}

export function appendRivalIntelCard(
  intel: LegendaryWonderStartedIntelEntry,
  grid: HTMLElement,
): void {
  const definition = getLegendaryWonderDefinition(intel.wonderId);
  const article = document.createElement('article');
  article.dataset.rivalIntelCard = intel.wonderId;
  article.style.cssText = COMPACT_CARD_STYLE;
  appendText(article, 'h4', definition?.name ?? intel.wonderId, 'margin:0 0 8px;');
  appendText(article, 'p', `${intel.civName} is pursuing this in ${intel.cityName}.`);
  appendText(article, 'p', `Spy report from turn ${intel.revealedTurn}.`);
  appendText(article, 'p', 'Current progress unknown without fresh infiltration.');
  grid.appendChild(article);
}

export function createWonderCardGrid(kind: 'recommended' | 'catalog' | 'rival'): HTMLElement {
  const grid = document.createElement('div');
  grid.dataset.wonderCardGrid = kind;
  const minimum = kind === 'recommended' ? '420px' : '300px';
  grid.style.cssText = [
    'display:grid',
    `grid-template-columns:repeat(auto-fit,minmax(min(100%, ${minimum}),1fr))`,
    'gap:12px',
    'align-items:start',
  ].join(';');
  return grid;
}

export function appendProjectCard(
  entry: LegendaryWonderPresentationEntry,
  grid: HTMLElement,
  onStart: StartWonderAction,
  mode: WonderCardMode,
): void {
  const article = document.createElement('article');
  article.dataset.projectCard = entry.wonderId;
  article.style.cssText = mode === 'recommended' ? RECOMMENDED_CARD_STYLE : COMPACT_CARD_STYLE;
  if (mode === 'recommended') article.dataset.recommendedProject = 'true';

  appendText(article, 'h4', `${mode === 'recommended' ? '🏛️ ' : ''}${entry.name}`, 'margin:0 0 8px;');
  const chips = document.createElement('div');
  chips.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:6px;';
  appendStatusChip(chips, entry);
  if (mode === 'recommended') appendBestFitChip(chips, entry.wonderId);
  article.appendChild(chips);

  appendRewardRow(article, entry);
  appendRequirementsOrNextStep(article, entry);
  appendQuestChecklist(article, entry, mode);
  appendText(article, 'p', `Cost: ${entry.productionCost} production.`, 'margin:8px 0;');

  if (mode === 'recommended' || ['building', 'completed', 'recovered'].includes(entry.visibleState)) {
    appendRaceSummary(article, entry);
  }
  if (entry.milestoneLabel) appendText(article, 'p', `Construction: ${entry.milestoneLabel}.`);
  if (entry.turnsRemaining !== null) appendText(article, 'p', `ETA: ${entry.turnsRemaining} turns.`);
  if (entry.raceTensionLabel) appendText(article, 'p', entry.raceTensionLabel);
  if (entry.queueContinuityLabel) appendText(article, 'p', entry.queueContinuityLabel);
  if (entry.productionResumedLabel) appendText(article, 'p', entry.productionResumedLabel);
  if (entry.visibleState === 'completed') appendText(article, 'p', 'Reward active.');
  if (entry.recoveryLabel) appendText(article, 'p', entry.recoveryLabel);

  if (entry.canStartBuild && entry.startActionLabel) {
    appendText(article, 'p', 'Starting now makes this the active production; current queue continues after this wonder.');
    const button = createGameButton(entry.startActionLabel, 'primary');
    button.dataset.wonderStartBuild = entry.wonderId;
    button.dataset.wonderStartTarget = entry.wonderId;
    button.addEventListener('click', () => onStart(entry.wonderId));
    article.appendChild(button);
  }

  grid.appendChild(article);
}
