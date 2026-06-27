import type { GameState, LegendaryWonderStartedIntelEntry } from '@/core/types';
import {
  getLegendaryWonderPresentationForCity,
  type LegendaryWonderPresentationEntry,
} from '@/systems/legendary-wonder-presentation';
import { getLegendaryWonderIntelForViewer } from '@/systems/legendary-wonder-intel';
import { createGameButton, setButtonDisabled } from '@/ui/ui-kit';
import {
  appendGuidanceStrip,
  appendProjectCard,
  appendRivalIntelCard,
  appendWonderEmptyState,
  appendWonderErrorState,
  createWonderCardGrid,
  type StartWonderAction,
  type WonderCardMode,
} from '@/ui/wonder-panel-view';

export interface WonderPanelCallbacks {
  onStartBuild: (cityId: string, wonderId: string) => void;
  onClose: () => void;
}

function appendText(parent: HTMLElement, tagName: keyof HTMLElementTagNameMap, text: string): HTMLElement {
  const element = document.createElement(tagName);
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function appendProjectSection(
  shell: HTMLElement,
  heading: string,
  dataSection: string,
  entries: LegendaryWonderPresentationEntry[],
  onStart: StartWonderAction,
  mode: WonderCardMode,
): void {
  if (entries.length === 0) return;

  const section = document.createElement('section');
  section.dataset.section = dataSection;
  section.style.cssText = 'margin-top:16px;min-width:0;';

  appendText(section, 'h3', heading);
  const grid = createWonderCardGrid(mode === 'recommended' ? 'recommended' : 'catalog');
  for (const entry of entries) {
    appendProjectCard(entry, grid, onStart, mode);
  }
  section.appendChild(grid);

  shell.appendChild(section);
}

function appendRivalIntelSection(
  shell: HTMLElement,
  entries: LegendaryWonderStartedIntelEntry[],
): void {
  if (entries.length === 0) return;

  const section = document.createElement('section');
  section.dataset.section = 'rival-wonders';
  section.style.cssText = 'margin-top:16px;min-width:0;';

  appendText(section, 'h3', 'In progress elsewhere');
  const grid = createWonderCardGrid('rival');
  for (const entry of entries) appendRivalIntelCard(entry, grid);
  section.appendChild(grid);

  shell.appendChild(section);
}

export function createWonderPanel(
  container: HTMLElement,
  state: GameState,
  cityId: string,
  callbacks: WonderPanelCallbacks,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'wonder-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'wonder-panel-title');
  panel.style.cssText = [
    'position:absolute',
    'inset:0',
    'box-sizing:border-box',
    'background:rgba(15,15,25,0.97)',
    'z-index:31',
    'overflow-y:auto',
    'overflow-x:hidden',
    'padding:clamp(12px,2vw,24px)',
    'padding-bottom:80px',
  ].join(';');
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      callbacks.onClose();
    }
  });
  const pendingStarts = new Set<string>();
  const startOnce: StartWonderAction = wonderId => {
    if (pendingStarts.has(wonderId)) return;
    pendingStarts.add(wonderId);
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-wonder-start-target]')) {
      if (button.dataset.wonderStartTarget === wonderId) setButtonDisabled(button, true);
    }
    callbacks.onStartBuild(cityId, wonderId);
  };

  const shell = document.createElement('div');
  shell.dataset.wonderLayout = 'responsive-shell';
  shell.style.cssText = 'width:100%;max-width:1120px;margin:0 auto;';
  panel.appendChild(shell);

  const header = document.createElement('div');
  header.dataset.wonderLayout = 'header';
  header.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;';
  const title = document.createElement('h2');
  title.id = 'wonder-panel-title';
  title.textContent = '🏛️ Legendary Wonders';
  title.style.margin = '0';
  header.appendChild(title);

  const topClose = createGameButton('Close', 'ghost');
  topClose.dataset.wonderPanelClose = 'top';
  topClose.addEventListener('click', () => callbacks.onClose());
  header.appendChild(topClose);
  shell.appendChild(header);

  const city = state.cities[cityId];
  const civilization = state.civilizations[state.currentPlayer];
  appendText(shell, 'p', `${civilization?.name ?? state.currentPlayer} · ${city?.name ?? cityId}`);

  const selectedCityIsOwned = city?.owner === state.currentPlayer;
  if (!civilization || !city || !selectedCityIsOwned) {
    appendWonderErrorState(
      shell,
      !city
        ? `City ${cityId} could not be found. Close this panel and select one of your cities.`
        : `City ${city.name} is not available to ${civilization?.name ?? state.currentPlayer}.`,
    );
  } else {
    const cityEntries = getLegendaryWonderPresentationForCity(state, state.currentPlayer, cityId);
    if (cityEntries.length === 0) {
      appendWonderEmptyState(
        shell,
        'No known wonder ambitions in this city',
        'Keep exploring, researching, or meeting city conditions to reveal new ambitions.',
      );
    } else {
      const recommendedEntries = cityEntries
        .filter(entry => entry.visibleState !== 'blocked' && entry.visibleState !== 'completed')
        .slice(0, 3);
      const recommendedIds = new Set(recommendedEntries.map(entry => entry.wonderId));
      const laterEntries = cityEntries.filter(entry => !recommendedIds.has(entry.wonderId));
      if (recommendedEntries.length > 0) {
        appendGuidanceStrip(shell, recommendedEntries[0], startOnce);
      }
      appendProjectSection(
        shell,
        'Best fits right now',
        'recommended-wonders',
        recommendedEntries,
        startOnce,
        'recommended',
      );
      appendProjectSection(
        shell,
        'All ambitions in this city',
        'all-city-wonders',
        laterEntries,
        startOnce,
        'compact',
      );
    }

    const rivalIntel = getLegendaryWonderIntelForViewer(state, state.currentPlayer)
      .filter((entry): entry is LegendaryWonderStartedIntelEntry => entry.kind === 'started');
    appendRivalIntelSection(shell, rivalIntel);
  }

  const bottomClose = createGameButton('Close', 'ghost');
  bottomClose.dataset.wonderPanelClose = 'bottom';
  bottomClose.addEventListener('click', () => callbacks.onClose());
  shell.appendChild(bottomClose);

  container.appendChild(panel);
  topClose.focus();
  return panel;
}
