import type { CouncilCard, CouncilTalkLevel, GameState } from '@/core/types';
import { buildCouncilAgenda } from '@/systems/council-system';
import { formatCouncilMemoryEntry, getCouncilMemoryEntries } from '@/systems/council-memory';

export interface CouncilPanelCallbacks {
  onClose: () => void;
  onTalkLevelChange: (level: CouncilTalkLevel) => void;
}

const BUCKET_COLORS: Record<string, string> = {
  'Do Now': '#d94a4a',
  'Soon': '#e8c170',
  'To Win': '#6b9b4b',
  'Council Drama': '#9b6bd9',
};

const TALK_LEVELS: CouncilTalkLevel[] = ['quiet', 'normal', 'chatty', 'chaos'];

function createBucket(title: string, cards: CouncilCard[], accent: string): HTMLElement {
  const section = document.createElement('section');
  section.style.cssText = `margin-top:14px;padding:10px 12px;background:rgba(255,255,255,0.03);border-left:4px solid ${accent};border-radius:8px;`;

  const heading = document.createElement('h3');
  heading.textContent = title;
  heading.style.cssText = `margin:0 0 8px;font-size:14px;color:${accent};`;
  section.appendChild(heading);

  if (cards.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Nothing urgent here.';
    empty.style.cssText = 'margin:0;font-size:12px;opacity:0.5;';
    section.appendChild(empty);
    return section;
  }

  for (const card of cards) {
    const article = document.createElement('article');
    article.dataset.cardType = card.cardType ?? 'standard';
    article.style.cssText = 'background:rgba(255,255,255,0.05);border-radius:6px;padding:10px;margin:6px 0;';

    const cardTitle = document.createElement('strong');
    cardTitle.textContent = card.title;
    cardTitle.style.cssText = 'display:block;font-size:13px;margin-bottom:4px;';
    article.appendChild(cardTitle);

    const summary = document.createElement('p');
    summary.textContent = card.summary;
    summary.style.cssText = 'margin:0 0 4px;font-size:12px;';
    article.appendChild(summary);

    const why = document.createElement('p');
    why.textContent = `Why: ${card.why}`;
    why.style.cssText = 'margin:0;font-size:11px;opacity:0.65;';
    article.appendChild(why);

    section.appendChild(article);
  }

  return section;
}

function createMemorySection(
  title: string,
  entries: ReturnType<typeof getCouncilMemoryEntries>,
  state: GameState,
): HTMLElement {
  const section = document.createElement('section');
  section.style.cssText = 'margin-top:14px;padding:10px 12px;background:rgba(0,0,0,0.2);border-radius:8px;opacity:0.85;';

  const heading = document.createElement('h3');
  heading.textContent = title;
  heading.style.cssText = 'margin:0 0 8px;font-size:13px;color:#aaa;';
  section.appendChild(heading);

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Nothing the council feels compelled to revisit just yet.';
    empty.style.cssText = 'margin:0;font-size:11px;opacity:0.5;';
    section.appendChild(empty);
    return section;
  }

  for (const entry of entries) {
    const article = document.createElement('article');
    article.style.cssText = 'background:rgba(255,255,255,0.03);border-radius:6px;padding:8px;margin:4px 0;';

    const summary = document.createElement('p');
    summary.textContent = formatCouncilMemoryEntry(entry, state, state.currentPlayer);
    summary.style.cssText = 'margin:0 0 2px;font-size:12px;';
    article.appendChild(summary);

    const outcome = document.createElement('p');
    outcome.textContent = `Outcome: ${entry.outcome ?? 'pending'}`;
    outcome.style.cssText = 'margin:0;font-size:11px;opacity:0.6;';
    article.appendChild(outcome);

    section.appendChild(article);
  }

  return section;
}

export function createCouncilPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: CouncilPanelCallbacks,
): HTMLDivElement {
  container.querySelector('#council-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'council-panel';
  panel.style.cssText = 'position:absolute;inset:12px 12px 96px 12px;z-index:30;padding:16px 18px;border-radius:14px;background:rgba(15,15,25,0.96);color:#f4f1e8;overflow:auto;font-family:system-ui,sans-serif;';

  // --- Header ---
  const header = document.createElement('header');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';

  const title = document.createElement('h2');
  title.textContent = 'Council';
  title.style.cssText = 'margin:0;font-size:18px;color:#e8c170;';
  header.appendChild(title);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '✕';
  closeButton.setAttribute('aria-label', 'Close council');
  closeButton.style.cssText = 'background:transparent;border:none;color:#f4f1e8;font-size:18px;cursor:pointer;opacity:0.65;';
  closeButton.addEventListener('click', () => callbacks.onClose());
  header.appendChild(closeButton);

  panel.appendChild(header);

  // --- Talk-level pills ---
  const talkLevelBar = document.createElement('div');
  talkLevelBar.style.cssText = 'display:flex;gap:6px;margin-bottom:12px;';
  const activeLevel = state.settings.councilTalkLevel;

  const buttons: HTMLButtonElement[] = [];
  for (const level of TALK_LEVELS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.talkLevel = level;
    button.textContent = level;
    const isActive = level === activeLevel;
    button.setAttribute('aria-pressed', String(isActive));
    button.style.cssText = `padding:6px 14px;border-radius:999px;border:none;cursor:pointer;font-size:12px;font-weight:bold;text-transform:capitalize;background:${isActive ? '#e8c170' : 'rgba(255,255,255,0.08)'};color:${isActive ? '#1a1a2e' : '#f4f1e8'};`;
    button.addEventListener('click', () => {
      // Immediate visual feedback (don't wait for state-driven re-render)
      for (const b of buttons) {
        const active = b === button;
        b.setAttribute('aria-pressed', String(active));
        b.style.background = active ? '#e8c170' : 'rgba(255,255,255,0.08)';
        b.style.color = active ? '#1a1a2e' : '#f4f1e8';
      }
      callbacks.onTalkLevelChange(level);
    });
    talkLevelBar.appendChild(button);
    buttons.push(button);
  }
  panel.appendChild(talkLevelBar);

  // --- Agenda buckets ---
  const agenda = buildCouncilAgenda(state, state.currentPlayer);
  panel.appendChild(createBucket('Do Now', agenda.doNow, BUCKET_COLORS['Do Now']));
  panel.appendChild(createBucket('Soon', agenda.soon, BUCKET_COLORS['Soon']));
  panel.appendChild(createBucket('To Win', agenda.toWin, BUCKET_COLORS['To Win']));
  panel.appendChild(createBucket('Council Drama', agenda.drama, BUCKET_COLORS['Council Drama']));

  // --- Memory ---
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
