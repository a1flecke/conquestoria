import type { GameState } from '@/core/types';
import { generateSummary, clearEventsForPlayer } from '@/core/hotseat-events';
import { getCivDefinition } from '@/systems/civ-definitions';

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
  const civDef = getCivDefinition(civ?.civType ?? '');
  const color = civ?.color ?? civDef?.color ?? '#e8c170';

  const overlay = document.createElement('div');
  overlay.id = 'turn-handoff';
  overlay.style.cssText = `position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(10,10,30,0.98);z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;`;

  // Phase 1: Pass the device
  overlay.innerHTML = `
    <div style="text-align:center;">
      <div style="width:60px;height:60px;border-radius:50%;background:${color};margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:24px;">&#x1f464;</div>
      <h2 style="font-size:20px;margin:0 0 8px;color:#e8c170;">Pass to</h2>
      <h1 style="font-size:28px;margin:0 0 24px;color:${color};">${playerName}</h1>
      <button id="handoff-confirm" style="padding:14px 32px;border-radius:10px;background:${color};border:none;color:#1a1a2e;font-weight:bold;font-size:16px;cursor:pointer;">I'm ${playerName}</button>
    </div>
  `;

  container.appendChild(overlay);

  document.getElementById('handoff-confirm')?.addEventListener('click', () => {
    // Phase 2: Summary card
    const summary = generateSummary(state, nextCivId);

    const warList = summary.atWarWith.length > 0
      ? summary.atWarWith.map(id => state.civilizations[id]?.name ?? id).join(', ')
      : 'None';
    const allyList = summary.allies.length > 0
      ? summary.allies.map(id => state.civilizations[id]?.name ?? id).join(', ')
      : 'None';
    const eventHtml = summary.events.length > 0
      ? summary.events.map(e => `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);">&bull; ${e.message}</div>`).join('')
      : '<div style="font-size:12px;opacity:0.5;">Nothing notable happened.</div>';

    overlay.innerHTML = `
      <div style="max-width:360px;width:100%;text-align:center;">
        <h2 style="font-size:18px;color:${color};margin:0 0 4px;">${playerName}</h2>
        <div style="font-size:13px;opacity:0.6;margin-bottom:16px;">Turn ${summary.turn} &middot; Era ${summary.era}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
          <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px;"><div style="font-size:18px;">&#x1f4b0;</div><div style="font-size:14px;">${summary.gold}</div><div style="font-size:10px;opacity:0.5;">Gold</div></div>
          <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px;"><div style="font-size:18px;">&#x1f3db;&#xfe0f;</div><div style="font-size:14px;">${summary.cities}</div><div style="font-size:10px;opacity:0.5;">Cities</div></div>
          <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px;"><div style="font-size:18px;">&#x2694;&#xfe0f;</div><div style="font-size:14px;">${summary.units}</div><div style="font-size:10px;opacity:0.5;">Units</div></div>
          <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px;"><div style="font-size:18px;">&#x1f52c;</div><div style="font-size:14px;">${summary.currentResearch ?? 'None'}</div><div style="font-size:10px;opacity:0.5;">Research</div></div>
        </div>
        <div style="text-align:left;margin-bottom:12px;">
          <div style="font-size:12px;margin-bottom:4px;">&#x2694;&#xfe0f; At war: ${warList}</div>
          <div style="font-size:12px;">&#x1f91d; Allies: ${allyList}</div>
        </div>
        <div style="text-align:left;background:rgba(255,255,255,0.04);border-radius:8px;padding:10px;margin-bottom:16px;">
          <div style="font-size:13px;color:#e8c170;margin-bottom:6px;">Since your last turn:</div>
          ${eventHtml}
        </div>
        <button id="handoff-start" style="padding:14px 32px;border-radius:10px;background:${color};border:none;color:#1a1a2e;font-weight:bold;font-size:16px;cursor:pointer;">Start Turn</button>
      </div>
    `;

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
