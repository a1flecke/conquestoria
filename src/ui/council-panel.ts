import type { CouncilCard, CouncilTalkLevel, GameState } from '@/core/types';
import { buildCouncilAgenda } from '@/systems/council-system';
import { formatCouncilMemoryEntry, getCouncilMemoryEntries } from '@/systems/council-memory';

export interface CouncilPanelCallbacks {
  onClose: () => void;
  onTalkLevelChange: (level: CouncilTalkLevel) => void;
}

function createBucket(title: string, cards: CouncilCard[]): HTMLElement {
  const section = document.createElement('section');

  const heading = document.createElement('h3');
  heading.textContent = title;
  section.appendChild(heading);

  if (cards.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Nothing urgent here.';
    section.appendChild(empty);
    return section;
  }

  for (const card of cards) {
    const article = document.createElement('article');
    article.dataset.cardType = card.cardType ?? 'standard';

    const cardTitle = document.createElement('strong');
    cardTitle.textContent = card.title;
    article.appendChild(cardTitle);

    const summary = document.createElement('p');
    summary.textContent = card.summary;
    article.appendChild(summary);

    const why = document.createElement('p');
    why.textContent = `Why: ${card.why}`;
    article.appendChild(why);

    section.appendChild(article);
  }

  return section;
}

function createMemorySection(title: string, entries: ReturnType<typeof getCouncilMemoryEntries>, state: GameState): HTMLElement {
  const section = document.createElement('section');
  const heading = document.createElement('h3');
  heading.textContent = title;
  section.appendChild(heading);

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Nothing the council feels compelled to revisit just yet.';
    section.appendChild(empty);
    return section;
  }

  for (const entry of entries) {
    const article = document.createElement('article');

    const summary = document.createElement('p');
    summary.textContent = formatCouncilMemoryEntry(entry, state, state.currentPlayer);
    article.appendChild(summary);

    const outcome = document.createElement('p');
    outcome.textContent = `Outcome: ${entry.outcome ?? 'pending'}`;
    article.appendChild(outcome);

    section.appendChild(article);
  }

  return section;
}

export function createCouncilPanel(container: HTMLElement, state: GameState, callbacks: CouncilPanelCallbacks): HTMLDivElement {
  container.querySelector('#council-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'council-panel';
  panel.style.cssText = 'position:absolute;inset:12px 12px 96px 12px;z-index:30;padding:16px;border-radius:16px;background:rgba(9,13,24,0.96);color:#f4f1e8;overflow:auto;';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', () => callbacks.onClose());
  panel.appendChild(closeButton);

  const talkLevelBar = document.createElement('div');
  for (const level of ['quiet', 'normal', 'chatty', 'chaos'] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.talkLevel = level;
    button.textContent = level;
    button.addEventListener('click', () => callbacks.onTalkLevelChange(level));
    talkLevelBar.appendChild(button);
  }
  panel.appendChild(talkLevelBar);

  const agenda = buildCouncilAgenda(state, state.currentPlayer);
  panel.appendChild(createBucket('Do Now', agenda.doNow));
  panel.appendChild(createBucket('Soon', agenda.soon));
  panel.appendChild(createBucket('To Win', agenda.toWin));
  panel.appendChild(createBucket('Council Drama', agenda.drama));

  const memoryEntries = getCouncilMemoryEntries(state, state.currentPlayer);
  panel.appendChild(createMemorySection(
    'Council Memory',
    memoryEntries.filter(entry => entry.kind !== 'advisor-disagreement'),
    state,
  ));
  panel.appendChild(createMemorySection(
    'Council Disagreements',
    memoryEntries.filter(entry => entry.kind === 'advisor-disagreement'),
    state,
  ));

  container.appendChild(panel);
  return panel;
}
