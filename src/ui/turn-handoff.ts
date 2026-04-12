import type { GameState } from '@/core/types';
import { generateSummary, clearEventsForPlayer } from '@/core/hotseat-events';
import { resolveCivDefinition } from '@/systems/civ-registry';

interface HandoffCallbacks {
  onReady: () => void;
}

export function showTurnHandoff(
  container: HTMLElement,
  state: GameState,
  nextCivId: string,
  playerName: string,
  callbacks: HandoffCallbacks,
): void {
  const existing = document.getElementById('turn-handoff');
  if (existing) existing.remove();

  const civ = state.civilizations[nextCivId];
  const civDef = resolveCivDefinition(state, civ?.civType ?? '');
  const color = civ?.color ?? civDef?.color ?? '#e8c170';

  const overlay = document.createElement('div');
  overlay.id = 'turn-handoff';
  overlay.style.cssText = `position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(10,10,30,0.98);z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;`;

  // Phase 1: Pass the device — use data-text placeholders, never interpolate playerName into HTML
  overlay.innerHTML = `
    <div style="text-align:center;">
      <div style="width:60px;height:60px;border-radius:50%;background:${color};margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:24px;">&#x1f464;</div>
      <h2 style="font-size:20px;margin:0 0 8px;color:#e8c170;">Pass to</h2>
      <h1 style="font-size:28px;margin:0 0 24px;color:${color};" data-text="player-name-phase1"></h1>
      <button id="handoff-confirm" style="padding:14px 32px;border-radius:10px;background:${color};border:none;color:#1a1a2e;font-weight:bold;font-size:16px;cursor:pointer;"><span data-text="handoff-btn-label"></span></button>
    </div>
  `;

  // Inject dynamic text via textContent (safe — playerName is user-entered, XSS risk)
  const setTextIn = (el: HTMLElement, sel: string, text: string) => {
    const target = el.querySelector(`[data-text="${sel}"]`);
    if (target) target.textContent = text;
  };

  setTextIn(overlay, 'player-name-phase1', playerName);
  setTextIn(overlay, 'handoff-btn-label', `I'm ${playerName}`);

  container.appendChild(overlay);

  document.getElementById('handoff-confirm')?.addEventListener('click', () => {
    // Phase 2: Summary card
    const summary = generateSummary(state, nextCivId);

    const warNames = summary.atWarWith.map(id => state.civilizations[id]?.name ?? id);
    const allyNames = summary.allies.map(id => state.civilizations[id]?.name ?? id);
    const hasEvents = summary.events.length > 0;

    let eventRowsHtml = '';
    if (hasEvents) {
      eventRowsHtml = summary.events.map((e, idx) => `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);">&bull; <span data-text="event-msg-${idx}"></span></div>`).join('');
    } else {
      eventRowsHtml = '<div style="font-size:12px;opacity:0.5;">Nothing notable happened.</div>';
    }

    overlay.innerHTML = `
      <div style="max-width:360px;width:100%;text-align:center;">
        <h2 style="font-size:18px;color:${color};margin:0 0 4px;" data-text="summary-player-name"></h2>
        <div style="font-size:13px;opacity:0.6;margin-bottom:16px;">Turn <span data-text="summary-turn"></span> &middot; Era <span data-text="summary-era"></span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
          <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px;"><div style="font-size:18px;">&#x1f4b0;</div><div style="font-size:14px;" data-text="summary-gold"></div><div style="font-size:10px;opacity:0.5;">Gold</div></div>
          <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px;"><div style="font-size:18px;">&#x1f3db;&#xfe0f;</div><div style="font-size:14px;" data-text="summary-cities"></div><div style="font-size:10px;opacity:0.5;">Cities</div></div>
          <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px;"><div style="font-size:18px;">&#x2694;&#xfe0f;</div><div style="font-size:14px;" data-text="summary-units"></div><div style="font-size:10px;opacity:0.5;">Units</div></div>
          <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px;"><div style="font-size:18px;">&#x1f52c;</div><div style="font-size:14px;" data-text="summary-research"></div><div style="font-size:10px;opacity:0.5;">Research</div></div>
        </div>
        <div style="text-align:left;margin-bottom:12px;">
          <div style="font-size:12px;margin-bottom:4px;">&#x2694;&#xfe0f; At war: <span data-text="summary-war-list"></span></div>
          <div style="font-size:12px;">&#x1f91d; Allies: <span data-text="summary-ally-list"></span></div>
        </div>
        <div style="text-align:left;background:rgba(255,255,255,0.04);border-radius:8px;padding:10px;margin-bottom:16px;">
          <div style="font-size:13px;color:#e8c170;margin-bottom:6px;">Since your last turn:</div>
          ${eventRowsHtml}
        </div>
        <button id="handoff-start" style="padding:14px 32px;border-radius:10px;background:${color};border:none;color:#1a1a2e;font-weight:bold;font-size:16px;cursor:pointer;">Start Turn</button>
      </div>
    `;

    // Inject all dynamic text via textContent (XSS-safe)
    const setText = (sel: string, text: string) => {
      const el = overlay.querySelector(`[data-text="${sel}"]`);
      if (el) el.textContent = text;
    };

    setText('summary-player-name', playerName);
    setText('summary-turn', String(summary.turn));
    setText('summary-era', String(summary.era));
    setText('summary-gold', String(summary.gold));
    setText('summary-cities', String(summary.cities));
    setText('summary-units', String(summary.units));
    setText('summary-research', summary.currentResearch ?? 'None');
    setText('summary-war-list', warNames.length > 0 ? warNames.join(', ') : 'None');
    setText('summary-ally-list', allyNames.length > 0 ? allyNames.join(', ') : 'None');

    if (hasEvents) {
      summary.events.forEach((e, idx) => {
        setText(`event-msg-${idx}`, e.message);
      });
    }

    // Clear pending events for this player
    if (state.pendingEvents) {
      clearEventsForPlayer(state.pendingEvents, nextCivId);
    }

    document.getElementById('handoff-start')?.addEventListener('click', () => {
      overlay.remove();
      callbacks.onReady();
    });
  });
}
