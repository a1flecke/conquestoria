import type { City, GameState } from '@/core/types';
import {
  resolveFromCity,
  canEstablishRoute,
  getTradeUnitTripBonus,
  calculateTradeRouteGold,
} from '@/systems/trade-system';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { createGameButton } from '@/ui/ui-kit';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export function openEstablishRoutePanel(
  container: HTMLElement,
  state: GameState,
  caravanUnitId: string,
  onEstablish: (toCityId: string) => void,
): void {
  container.querySelector('#establish-route-panel')?.remove();

  const unit = state.units[caravanUnitId];
  if (!unit) return;

  const fromCity = resolveFromCity(state, unit);
  if (!fromCity) return;

  const panel = document.createElement('div');
  panel.id = 'establish-route-panel';
  panel.style.cssText = 'position:absolute;bottom:0;left:0;right:0;z-index:50;background:#171923;border-top:1px solid rgba(255,255,255,0.15);padding:16px;max-height:70vh;overflow-y:auto;';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
  const title = document.createElement('h3');
  title.style.cssText = 'font-size:15px;color:#e8c170;margin:0;';
  const unitDisplayName = UNIT_DEFINITIONS[unit.type]?.name ?? unit.type;
  title.textContent = `Trade Routes from ${fromCity.name} (${unitDisplayName})`;
  const closeBtn = createGameButton('✕', 'ghost');
  closeBtn.addEventListener('click', () => panel.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Build city lists
  const allCities = Object.values(state.cities).filter(c => c.id !== fromCity.id);
  const domestic = allCities.filter(c => c.owner === unit.owner);
  const foreign  = allCities.filter(c => c.owner !== unit.owner);

  let selectedCityId: string | null = null;
  let confirmBtn: HTMLButtonElement;

  function buildCityRow(city: City): HTMLElement {
    const check = canEstablishRoute(state, unit!, city.id);

    const hexDist = state.map.wrapsHorizontally
      ? wrappedHexDistance(fromCity!.position, city.position, state.map.width)
      : hexDistance(fromCity!.position, city.position);
    const effectiveGold = Math.max(1, Math.round(calculateTradeRouteGold(hexDist, 0)));
    const tripBonus = check.ok ? getTradeUnitTripBonus(state, fromCity!.id, city.id, unit!.owner, unit!.type) : 0;
    const trips = 8 + tripBonus;

    const row = document.createElement('div');
    row.style.cssText = [
      'display:flex',
      'justify-content:space-between',
      'align-items:center',
      'padding:10px 8px',
      'border-bottom:1px solid rgba(255,255,255,0.08)',
      `cursor:${check.ok ? 'pointer' : 'default'}`,
      `opacity:${check.ok ? '1' : '0.5'}`,
      'min-height:44px',
    ].join(';');

    const left = document.createElement('span');
    left.textContent = `${fromCity!.name} → ${city.name}`;
    row.appendChild(left);

    const right = document.createElement('span');
    right.style.cssText = 'font-size:12px;text-align:right;';

    if (check.ok) {
      right.style.color = '#6b9b4b';
      right.textContent = `+${effectiveGold} gold/turn · ${trips} trips`;
      row.addEventListener('click', () => {
        // Deselect previously selected row
        panel.querySelectorAll('.route-row-selected').forEach(el => {
          (el as HTMLElement).style.background = '';
          el.classList.remove('route-row-selected');
        });
        selectedCityId = city.id;
        row.style.background = 'rgba(107, 155, 75, 0.2)';
        row.classList.add('route-row-selected');
        if (confirmBtn) {
          confirmBtn.disabled = false;
        }
      });
    } else {
      right.style.color = '#888';
      const goldEl = document.createElement('div');
      goldEl.textContent = `${effectiveGold} gold/turn if available`;
      const reasonEl = document.createElement('div');
      reasonEl.style.cssText = 'font-size:11px;opacity:0.6;';
      reasonEl.textContent = check.reason ?? 'Unavailable';
      right.appendChild(goldEl);
      right.appendChild(reasonEl);
    }
    row.appendChild(right);
    return row;
  }

  function appendSection(label: string, cities: City[]): void {
    if (cities.length === 0) return;
    const sectionHeader = document.createElement('div');
    sectionHeader.textContent = label;
    sectionHeader.style.cssText = 'font-size:11px;text-transform:uppercase;opacity:0.5;padding:8px 0 4px;letter-spacing:0.05em;';
    panel.appendChild(sectionHeader);
    for (const city of cities) {
      panel.appendChild(buildCityRow(city));
    }
  }

  if (allCities.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:24px;opacity:0.5;font-size:13px;';
    empty.textContent = 'No eligible destinations.';
    panel.appendChild(empty);
  } else {
    appendSection('Domestic Routes', domestic);
    appendSection('Foreign Routes', foreign);
  }

  // Button row
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:16px;';
  confirmBtn = createGameButton('Confirm', 'primary', { disabled: true });
  confirmBtn.addEventListener('click', () => {
    if (!selectedCityId) return;
    onEstablish(selectedCityId);
    panel.remove();
  });
  const cancelBtn = createGameButton('Cancel', 'secondary');
  cancelBtn.addEventListener('click', () => panel.remove());
  btnRow.appendChild(confirmBtn);
  btnRow.appendChild(cancelBtn);
  panel.appendChild(btnRow);

  container.appendChild(panel);
}
