import type { GameState, City } from '@/core/types';
import { getCityAppeaseCost, getConcessionCost, computeUnrestPressure, CONCESSION_IMMUNITY_TURNS } from '@/systems/faction-system';
import { getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { createGameButton } from '@/ui/ui-kit';

export interface CityOverviewPanelCallbacks {
  onOpenCity: (cityId: string) => void;
  onAppeaseFaction: (cityId: string) => void;
  onConcedeToMovement: (cityId: string) => void;
  onClose: () => void;
}

type SortKey = 'name' | 'population' | 'unrest';

// New for #552: the bottom-bar "City" button opens this list first instead of
// jumping straight to one city — replaces clicking through cities one at a
// time to find which are in unrest. Reuses the exact same Appease/Concede
// code path as the single city panel (main.ts's handleAppeaseFaction /
// handleConcedeToMovement) so there is only one implementation of each
// gameplay mutation.
export function createCityOverviewPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: CityOverviewPanelCallbacks,
): HTMLDivElement {
  let sortKey: SortKey = 'unrest';
  const panel = document.createElement('div');
  panel.id = 'city-overview-panel';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;z-index:30;background:rgba(8,12,20,0.96);overflow-y:auto;padding:16px;';

  function ownedCities(): City[] {
    return Object.values(state.cities).filter(c => c.owner === state.currentPlayer);
  }

  function unrestPressureFor(city: City): number {
    const civ = state.civilizations[city.owner];
    const feasting = (civ?.feastUntilTurn ?? 0) > state.turn;
    const ownerHappiness = getCivHappinessFromResources(state, city.owner) + (feasting ? 2 : 0);
    return computeUnrestPressure(city.id, state, ownerHappiness);
  }

  function sortedCities(): City[] {
    const cities = ownedCities();
    return cities.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'population') return b.population - a.population;
      // 'unrest': revolt (2) first, then unrest (1), then stable (0); within a
      // tier, higher current pressure first so the worst cities lead the list.
      if (a.unrestLevel !== b.unrestLevel) return b.unrestLevel - a.unrestLevel;
      return unrestPressureFor(b) - unrestPressureFor(a);
    });
  }

  function render(): void {
    panel.textContent = '';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
    const title = document.createElement('h2');
    title.textContent = 'Cities';
    title.style.cssText = 'font-size:18px;color:#e8c170;margin:0;';
    header.appendChild(title);
    const closeBtn = createGameButton('✕', 'close');
    closeBtn.addEventListener('click', callbacks.onClose);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const sortRow = document.createElement('div');
    sortRow.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;';
    (['unrest', 'name', 'population'] as SortKey[]).forEach(key => {
      const label = key === 'unrest' ? 'Sort: Unrest' : key === 'name' ? 'Sort: Name' : 'Sort: Population';
      const btn = createGameButton(label, sortKey === key ? 'primary' : 'secondary');
      btn.addEventListener('click', () => { sortKey = key; render(); });
      sortRow.appendChild(btn);
    });
    panel.appendChild(sortRow);

    const cities = sortedCities();
    if (cities.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No cities founded yet!';
      empty.style.cssText = 'opacity:0.7;font-size:13px;';
      panel.appendChild(empty);
      return;
    }

    for (const city of cities) {
      panel.appendChild(renderCityRow(city));
    }
  }

  function renderCityRow(city: City): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'background:rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;margin-bottom:8px;cursor:pointer;';
    row.dataset.cityRow = city.id;

    const yields = calculateProjectedCityYields(state, city.id);
    const statusLabel = city.unrestLevel === 2 ? '⚠️ Revolt' : city.unrestLevel === 1 ? '⚠️ Unrest' : '';
    const statusColor = city.unrestLevel === 2 ? '#e88' : city.unrestLevel === 1 ? '#d9a25c' : '#9bd97b';

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
    const nameLine = document.createElement('div');
    nameLine.style.cssText = 'font-weight:bold;';
    nameLine.textContent = `${city.name} (pop ${city.population})`;
    top.appendChild(nameLine);
    if (statusLabel) {
      const status = document.createElement('div');
      status.textContent = statusLabel;
      status.style.cssText = `color:${statusColor};font-weight:bold;font-size:12px;`;
      top.appendChild(status);
    }
    row.appendChild(top);

    const yieldsLine = document.createElement('div');
    yieldsLine.style.cssText = 'display:flex;gap:12px;font-size:12px;opacity:0.85;margin-top:4px;';
    yieldsLine.textContent = `🌾+${yields.food} ⚒️+${yields.production} 💰+${yields.gold} 🔬+${yields.science}`;
    row.appendChild(yieldsLine);

    if (city.unrestLevel > 0) {
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;';

      // Mirror city-panel.ts's exact affordability/eligibility checks (lines
      // ~246-263) so a row button is never clickable when the single city
      // panel would have disabled the same action — a player must never see
      // a live-looking button that silently no-ops via a toast (#552 UX gate).
      const civGold = state.civilizations[city.owner]?.gold ?? 0;
      const isConcessionImmune = (city.concessionImmunityUntilTurn ?? 0) > state.turn;

      const appeaseCost = getCityAppeaseCost(city);
      const appeasedThisTurn = city.appeasedOnTurn === state.turn;
      const canAffordAppease = civGold >= appeaseCost;
      const appeaseDisabled = !canAffordAppease || appeasedThisTurn || isConcessionImmune;
      const appeaseLabel = appeasedThisTurn
        ? 'Already appeased this turn'
        : !canAffordAppease
          ? `Not enough gold (needs ${appeaseCost})`
          : `Appease (${appeaseCost}g)`;
      const appeaseBtn = createGameButton(appeaseLabel, 'secondary', { disabled: appeaseDisabled });
      appeaseBtn.title = `Appease: pay ${appeaseCost} gold to calm this city right now. Cheap and repeatable, but new pressure can build again next turn.`;
      if (!appeaseDisabled) {
        appeaseBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          callbacks.onAppeaseFaction(city.id);
        });
      } else {
        appeaseBtn.addEventListener('click', (event) => event.stopPropagation());
      }
      actions.appendChild(appeaseBtn);

      const concessionCost = getConcessionCost(state, city);
      const canAffordConcession = civGold >= concessionCost;
      const concedeDisabled = !canAffordConcession || isConcessionImmune;
      const concedeLabel = !canAffordConcession
        ? `Not enough gold (needs ${concessionCost})`
        : `Concede (${concessionCost}g)`;
      const concedeBtn = createGameButton(concedeLabel, 'secondary', { disabled: concedeDisabled });
      concedeBtn.title = `Concede: pay ${concessionCost} gold for a charter — clears unrest immediately and grants immunity to new unrest for ${CONCESSION_IMMUNITY_TURNS} turns. Costs more than Appease, but lasts.`;
      if (!concedeDisabled) {
        concedeBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          callbacks.onConcedeToMovement(city.id);
        });
      } else {
        concedeBtn.addEventListener('click', (event) => event.stopPropagation());
      }
      actions.appendChild(concedeBtn);

      row.appendChild(actions);
    }

    row.addEventListener('click', () => callbacks.onOpenCity(city.id));

    return row;
  }

  render();
  container.appendChild(panel);
  return panel;
}
