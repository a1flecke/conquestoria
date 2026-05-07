import type { GameState, HexCoord, Unit } from '@/core/types';
import { getVeterancyTier } from '@/systems/combat-reward-system';
import { hexKey } from '@/systems/hex-utils';
import { sortUnitsForStackPicker } from '@/systems/unit-occupancy';
import { canHeal, UNIT_DEFINITIONS, UNIT_DESCRIPTIONS } from '@/systems/unit-system';

export interface UnitStackPanelCallbacks {
  onSelectUnit: (unitId: string) => void;
  onOpenCity?: (cityId: string) => void;
  onClose?: () => void;
}

export interface UnitStackPanelOptions {
  selectedUnitId?: string | null;
}

function unitStatus(unit: Unit): string {
  if (unit.automation?.mode === 'auto-explore') return 'Auto-explore';
  if (unit.hasActed || unit.movementPointsLeft <= 0) return 'Spent';

  const def = UNIT_DEFINITIONS[unit.type];
  if (def.canFoundCity) return 'Ready · Can found';
  if (def.canBuildImprovements) return 'Ready · Can build';
  if (canHeal(unit)) return 'Ready · Can rest';
  return 'Ready';
}

function findFriendlyCityAtCoord(state: GameState, coord: HexCoord) {
  const key = hexKey(coord);
  return Object.values(state.cities).find(city =>
    city.owner === state.currentPlayer && hexKey(city.position) === key,
  );
}

function makeButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.style.cssText = 'width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.08);color:white;text-align:left;cursor:pointer;';
  return button;
}

export function renderUnitStackPanel(
  container: HTMLElement,
  state: GameState,
  coord: HexCoord,
  unitIds: string[],
  callbacks: UnitStackPanelCallbacks,
  options: UnitStackPanelOptions = {},
): void {
  const units = sortUnitsForStackPicker(
    unitIds.map(unitId => state.units[unitId]).filter((unit): unit is Unit => Boolean(unit)),
    options.selectedUnitId ?? null,
  );
  const city = findFriendlyCityAtCoord(state, coord);

  container.style.display = 'block';
  container.replaceChildren();

  const wrapper = document.createElement('div');
  wrapper.dataset.unitStackPanel = 'true';
  wrapper.style.cssText = 'background:rgba(0,0,0,0.88);border-radius:12px;padding:12px 16px;border-left:4px solid #e8c170;display:flex;flex-direction:column;gap:8px;';

  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';

  const title = document.createElement('strong');
  title.textContent = `${units.length} units at ${city?.name ?? `${coord.q},${coord.r}`}`;
  topRow.appendChild(title);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'x';
  closeButton.setAttribute('aria-label', 'Close unit stack');
  closeButton.style.cssText = 'cursor:pointer;font-size:18px;opacity:0.7;background:none;border:none;color:white;';
  closeButton.addEventListener('click', () => callbacks.onClose?.());
  topRow.appendChild(closeButton);
  wrapper.appendChild(topRow);

  if (city && callbacks.onOpenCity) {
    const cityButton = makeButton();
    cityButton.dataset.stackAction = 'open-city';
    cityButton.textContent = `Open ${city.name}`;
    cityButton.addEventListener('click', () => callbacks.onOpenCity?.(city.id));
    wrapper.appendChild(cityButton);
  }

  for (const unit of units) {
    const def = UNIT_DEFINITIONS[unit.type];
    const row = makeButton();
    row.dataset.unitStackItem = 'true';
    row.dataset.unitId = unit.id;
    row.dataset.selected = String(unit.id === options.selectedUnitId);
    row.setAttribute('aria-pressed', String(unit.id === options.selectedUnitId));

    const nameLine = document.createElement('div');
    nameLine.style.cssText = 'display:flex;justify-content:space-between;gap:8px;font-size:12px;font-weight:700;';

    const name = document.createElement('span');
    name.textContent = `${unit.id === options.selectedUnitId ? 'Selected · ' : ''}${def.name}`;

    const stats = document.createElement('span');
    stats.textContent = `HP ${unit.health}/100 · Moves ${unit.movementPointsLeft}/${def.movementPoints}`;

    nameLine.appendChild(name);
    nameLine.appendChild(stats);

    const statusLine = document.createElement('div');
    statusLine.style.cssText = 'font-size:10px;opacity:0.72;margin-top:3px;';
    const tier = getVeterancyTier(unit);
    statusLine.textContent = `${unitStatus(unit)} · ${tier.label} · XP ${unit.experience ?? 0} · ${UNIT_DESCRIPTIONS[unit.type] ?? ''}`;

    row.appendChild(nameLine);
    row.appendChild(statusLine);
    row.addEventListener('click', () => callbacks.onSelectUnit(unit.id));
    wrapper.appendChild(row);
  }

  container.appendChild(wrapper);
}
