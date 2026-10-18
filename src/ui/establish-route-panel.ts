import type { GameState } from '@/core/types';
import {
  getEntitledTradeDestinations,
  getEntitledTradeOrigins,
} from '@/systems/commerce-projection';
import { TRADE_ROUTE_DENIAL_MESSAGES } from '@/systems/trade-route-contract';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { createGameButton } from '@/ui/ui-kit';
import { markModal } from '@/ui/modal-contract';

/**
 * The trade-route chooser (#1500 MR03).
 *
 * Every row comes from `commerce-projection`, so a destination the viewer has not discovered does
 * not exist here — no name, id, count, order or tooltip — and a known-but-denied destination stays
 * visible with its entitled reason. The trader must physically reach its origin first, so each
 * choice shows the positioning leg instead of pretending commerce starts immediately.
 */
export function openEstablishRoutePanel(
  container: HTMLElement,
  state: GameState,
  caravanUnitId: string,
  onEstablish: (toCityId: string, originCityId: string) => void,
): void {
  container.querySelector('#establish-route-panel')?.remove();

  const unit = state.units[caravanUnitId];
  if (!unit) return;

  const viewerCivId = state.currentPlayer;
  const origins = getEntitledTradeOrigins(state, viewerCivId, caravanUnitId);

  const panel = document.createElement('div');
  panel.id = 'establish-route-panel';
  panel.style.cssText = 'position:absolute;bottom:0;left:0;right:0;z-index:50;background:#171923;border-top:1px solid rgba(255,255,255,0.15);padding:16px;max-height:70vh;overflow-y:auto;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
  const title = document.createElement('h3');
  title.style.cssText = 'font-size:15px;color:#e8c170;margin:0;';
  const unitDisplayName = UNIT_DEFINITIONS[unit.type]?.name ?? unit.type;
  title.textContent = `Trade Routes (${unitDisplayName})`;
  const closeBtn = createGameButton('✕', 'ghost');
  closeBtn.addEventListener('click', () => panel.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  let selectedOriginCityId: string | null = origins[0]?.cityId ?? null;
  let selectedCityId: string | null = null;
  let confirmBtn: HTMLButtonElement;
  const destinationSection = document.createElement('div');

  function renderDestinations(): void {
    destinationSection.textContent = '';
    selectedCityId = null;
    if (confirmBtn) confirmBtn.disabled = true;

    const destinations = getEntitledTradeDestinations(state, viewerCivId, caravanUnitId, {
      originCityId: selectedOriginCityId ?? undefined,
    });
    if (destinations.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:24px;opacity:0.5;font-size:13px;';
      empty.textContent = 'No eligible destinations.';
      destinationSection.appendChild(empty);
      return;
    }

    const heading = document.createElement('div');
    heading.textContent = 'Destinations';
    heading.style.cssText = 'font-size:11px;text-transform:uppercase;opacity:0.5;padding:8px 0 4px;letter-spacing:0.05em;';
    destinationSection.appendChild(heading);

    for (const destination of destinations) {
      const row = document.createElement('div');
      row.style.cssText = [
        'display:flex', 'justify-content:space-between', 'align-items:center',
        'padding:10px 8px', 'border-bottom:1px solid rgba(255,255,255,0.08)',
        `cursor:${destination.eligible ? 'pointer' : 'default'}`,
        `opacity:${destination.eligible ? '1' : '0.5'}`, 'min-height:44px',
      ].join(';');

      const left = document.createElement('span');
      left.textContent = `${destination.cityName} (${destination.ownerName})`;
      row.appendChild(left);

      const right = document.createElement('span');
      right.style.cssText = 'font-size:12px;text-align:right;';
      if (destination.eligible) {
        right.style.color = '#6b9b4b';
        const positioning = destination.positioningTurns > 0
          ? ` · ${destination.positioningTurns} turns to origin`
          : '';
        right.textContent = `+${destination.goldPerTurn} gold/turn · ${destination.roundTripRounds}-round round trip${positioning}`;
        row.addEventListener('click', () => {
          panel.querySelectorAll('.route-row-selected').forEach(el => {
            (el as HTMLElement).style.background = '';
            el.classList.remove('route-row-selected');
          });
          selectedCityId = destination.cityId;
          row.style.background = 'rgba(107, 155, 75, 0.2)';
          row.classList.add('route-row-selected');
          confirmBtn.disabled = false;
        });
      } else {
        right.style.color = '#888';
        const reasonEl = document.createElement('div');
        reasonEl.style.cssText = 'font-size:11px;opacity:0.6;';
        // Entitled reason only: a known destination is allowed to say why it is refused.
        reasonEl.textContent = destination.denialReason ? TRADE_ROUTE_DENIAL_MESSAGES[destination.denialReason] : 'Unavailable';
        right.appendChild(reasonEl);
      }
      row.appendChild(right);
      destinationSection.appendChild(row);
    }
  }

  // --- Origin choice: the trader must reach this city before commerce begins.
  if (origins.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:24px;opacity:0.5;font-size:13px;';
    empty.textContent = 'No origin city has a free route slot.';
    panel.appendChild(empty);
  } else {
    const originHeading = document.createElement('div');
    originHeading.textContent = 'Origin';
    originHeading.style.cssText = 'font-size:11px;text-transform:uppercase;opacity:0.5;padding:8px 0 4px;letter-spacing:0.05em;';
    panel.appendChild(originHeading);

    const originRow = document.createElement('div');
    originRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    for (const origin of origins) {
      const button = createGameButton(
        origin.positioningTurns > 0 ? `${origin.cityName} (${origin.positioningTurns} turns)` : origin.cityName,
        origin.cityId === selectedOriginCityId ? 'primary' : 'secondary',
      );
      button.dataset.originCityId = origin.cityId;
      button.addEventListener('click', () => {
        selectedOriginCityId = origin.cityId;
        originRow.querySelectorAll('button').forEach(el => {
          el.setAttribute('aria-pressed', String((el as HTMLElement).dataset.originCityId === origin.cityId));
        });
        renderDestinations();
      });
      button.setAttribute('aria-pressed', String(origin.cityId === selectedOriginCityId));
      originRow.appendChild(button);
    }
    panel.appendChild(originRow);
    panel.appendChild(destinationSection);
    renderDestinations();
  }

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:16px;';
  confirmBtn = createGameButton('Confirm', 'primary', { disabled: true });
  confirmBtn.addEventListener('click', () => {
    if (!selectedCityId || !selectedOriginCityId) return;
    onEstablish(selectedCityId, selectedOriginCityId);
    panel.remove();
  });
  const cancelBtn = createGameButton('Cancel', 'secondary');
  cancelBtn.addEventListener('click', () => panel.remove());
  btnRow.appendChild(confirmBtn);
  btnRow.appendChild(cancelBtn);
  panel.appendChild(btnRow);

  markModal(panel, { cancel: cancelBtn, initialFocus: closeBtn });
  container.appendChild(panel);
}
