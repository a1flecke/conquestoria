/**
 * #988: declare a purpose for an ongoing war. Only ever lists cities the
 * viewer has actually discovered (`hasDiscoveredCity`) -- same viewer-safety
 * rule as `settlement-offer-panel.ts`.
 */
import type { GameState } from '@/core/types';
import type { WarGoalKind } from '@/core/types/diplomacy';
import { hasDiscoveredCity } from '@/systems/discovery-system';
import { createGameButton } from '@/ui/ui-kit';

export function openWarGoalPanel(
  container: HTMLElement,
  state: GameState,
  opponentCivId: string,
  onDeclare: (kind: WarGoalKind, targetCityId?: string) => void,
): void {
  container.querySelector('#war-goal-panel')?.remove();

  const opponent = state.civilizations[opponentCivId];
  if (!opponent) return;

  const panel = document.createElement('div');
  panel.id = 'war-goal-panel';
  panel.style.cssText = 'position:absolute;bottom:0;left:0;right:0;z-index:50;background:#171923;border-top:1px solid rgba(255,255,255,0.15);padding:16px;max-height:70vh;overflow-y:auto;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
  const title = document.createElement('h3');
  title.style.cssText = 'font-size:15px;color:#e8c170;margin:0;';
  title.textContent = `Declare War Goal against ${opponent.name}`;
  const closeBtn = createGameButton('✕', 'ghost');
  closeBtn.addEventListener('click', () => panel.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const discoveredCities = Object.values(state.cities)
    .filter(city => city.owner === opponentCivId && hasDiscoveredCity(state, state.currentPlayer, city.id));

  function addCityGoalSection(kind: 'conquer_city' | 'liberate_city', label: string): void {
    if (discoveredCities.length === 0) return;
    const sectionHeader = document.createElement('div');
    sectionHeader.textContent = label;
    sectionHeader.style.cssText = 'font-size:11px;text-transform:uppercase;opacity:0.5;padding:8px 0 4px;letter-spacing:0.05em;';
    panel.appendChild(sectionHeader);
    for (const city of discoveredCities) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 4px;min-height:44px;';
      const name = document.createElement('span');
      name.style.cssText = 'font-size:13px;';
      name.textContent = city.name;
      const btn = createGameButton('Declare', 'secondary');
      btn.addEventListener('click', () => {
        onDeclare(kind, city.id);
        panel.remove();
      });
      row.appendChild(name);
      row.appendChild(btn);
      panel.appendChild(row);
    }
  }

  addCityGoalSection('conquer_city', 'Conquer a City');
  addCityGoalSection('liberate_city', 'Liberate a City (returned to independence, not necessarily to you)');

  if (discoveredCities.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:12px;opacity:0.6;padding:8px 4px;';
    empty.textContent = 'You have not discovered any of their cities yet.';
    panel.appendChild(empty);
  }

  if (!opponent.diplomacy.vassalage.overlord) {
    const vassalageSection = document.createElement('div');
    vassalageSection.style.cssText = 'font-size:11px;text-transform:uppercase;opacity:0.5;padding:8px 0 4px;letter-spacing:0.05em;';
    vassalageSection.textContent = 'Force Vassalage';
    panel.appendChild(vassalageSection);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 4px;min-height:44px;';
    const label = document.createElement('span');
    label.style.cssText = 'font-size:13px;';
    label.textContent = `Force ${opponent.name} to submit as your vassal`;
    const btn = createGameButton('Declare', 'secondary');
    btn.addEventListener('click', () => {
      onDeclare('force_vassalage');
      panel.remove();
    });
    row.appendChild(label);
    row.appendChild(btn);
    panel.appendChild(row);
  }

  container.appendChild(panel);
}
