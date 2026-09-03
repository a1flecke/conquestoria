import type { HallOfFameEntry } from '@/systems/great-general-hall-of-fame';
import { createGameButton } from '@/ui/ui-kit';

export interface HallOfFamePanelCallbacks {
  onClose: () => void;
}

const STATUS_WORD: Record<HallOfFameEntry['status'], string> = {
  active: 'Active',
  retired: 'Retired',
  fallen: 'Fallen',
};

function line(text: string, css: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = css;
  return el;
}

function renderCard(entry: HallOfFameEntry): HTMLDetailsElement {
  const card = document.createElement('details');
  card.dataset.hallOfFameEntry = entry.generalDefinitionId;
  card.open = entry.status === 'active';
  card.style.cssText = 'margin-bottom:12px;background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;';

  const summary = document.createElement('summary');
  summary.style.cssText = 'cursor:pointer;font-size:14px;color:#e8c170;list-style:none;';
  const eraText = entry.era === null ? '' : ` · Era ${entry.era}`;
  const tail = entry.statLine ? ` — ${entry.statLine}` : ' — no notable actions yet';
  summary.textContent = `${entry.portraitIcon ? entry.portraitIcon + ' ' : ''}${entry.name}${eraText} · ${STATUS_WORD[entry.status]}${tail}`;
  card.appendChild(summary);

  if (entry.descriptor) card.appendChild(line(entry.descriptor, 'font-size:11px;opacity:0.75;margin-top:6px;'));
  if (entry.specialtyLine) card.appendChild(line(entry.specialtyLine, 'font-size:11px;color:#f0c674;margin-top:3px;'));

  const timeline = document.createElement('div');
  timeline.style.cssText = 'font-size:12px;margin-top:8px;opacity:0.9;';
  timeline.appendChild(line(entry.bookendStart, 'margin-top:2px;'));
  for (const moment of entry.moments) {
    timeline.appendChild(line(`Turn ${moment.turn} — ${moment.text}`, 'margin-top:2px;'));
  }
  if (entry.bookendEnd) {
    timeline.appendChild(line(entry.bookendEnd, 'margin-top:2px;'));
  } else if (entry.moments.length === 0) {
    timeline.appendChild(line('Still serving — no notable actions recorded yet.', 'margin-top:2px;opacity:0.7;'));
  }
  card.appendChild(timeline);

  const s = entry.stats;
  card.appendChild(line(
    `Battles turned ${s.battlesInfluenced} · Cities captured ${s.citiesCaptured} · Cities defended ${s.uniqueCitiesDefended} · `
    + `Units saved ${s.unitsSaved} · Rally/Seize/Last Stand ${s.rallyUses}/${s.seizeUses}/${s.lastStandUses} · ${s.careerTurns} turns in command`,
    'font-size:11px;opacity:0.8;margin-top:8px;',
  ));

  if (entry.profile) {
    const bio = document.createElement('details');
    bio.style.cssText = 'margin-top:8px;font-size:11px;opacity:0.85;';
    const bioSummary = document.createElement('summary');
    bioSummary.style.cssText = 'cursor:pointer;opacity:0.8;';
    bioSummary.textContent = entry.profile.kind === 'historical' ? `Who was ${entry.name}?` : `About ${entry.name}`;
    bio.appendChild(bioSummary);
    bio.appendChild(line(entry.profile.summary, 'margin-top:4px;'));
    for (const fact of entry.profile.facts) bio.appendChild(line(`• ${fact}`, 'margin-top:3px;'));
    if (entry.profile.context) bio.appendChild(line(entry.profile.context, 'margin-top:4px;opacity:0.7;'));
    if (entry.profile.loreWork) bio.appendChild(line(`From: ${entry.profile.loreWork}`, 'margin-top:4px;opacity:0.6;font-style:italic;'));
    card.appendChild(bio);
  }

  return card;
}

export function createHallOfFamePanel(
  container: HTMLElement,
  entries: HallOfFameEntry[],
  callbacks: HallOfFamePanelCallbacks,
): HTMLElement {
  container.querySelector('#hall-of-fame-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'hall-of-fame-panel';
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(12,12,24,0.96);z-index:40;padding:16px;overflow:auto;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';
  const title = document.createElement('h2');
  title.textContent = 'Hall of Fame';
  title.style.cssText = 'font-size:20px;color:#e8c170;margin:0;';
  header.appendChild(title);
  const closeButton = createGameButton('✕', 'close');
  closeButton.dataset.action = 'close';
  closeButton.setAttribute('aria-label', 'Close panel');
  closeButton.addEventListener('click', () => { panel.remove(); callbacks.onClose(); });
  header.appendChild(closeButton);
  panel.appendChild(header);

  panel.appendChild(line('Every Great General who has served your civilization.', 'font-size:13px;opacity:0.8;margin:0 0 16px;'));

  if (entries.length === 0) {
    panel.appendChild(line(
      'No Great Generals have served yet. Earn one by leading your armies to hard-won victories.',
      'text-align:center;opacity:0.75;margin-top:32px;font-size:14px;',
    ));
  } else {
    for (const entry of entries) panel.appendChild(renderCard(entry));
  }

  container.appendChild(panel);
  return panel;
}
