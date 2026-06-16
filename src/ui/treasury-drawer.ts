import type { EconomyProjection } from '@/systems/economy-system';
import type { TreasuryStrainLevel } from '@/core/types';

export interface TreasuryDrawer {
  element: HTMLElement;
  isOpen(): boolean;
  update(economy: EconomyProjection, currentGold: number): void;
  toggle(): void;
  close(): void;
}

const NET_COLORS: Record<TreasuryStrainLevel, string> = {
  none:     '#4ade80',
  low:      '#facc15',
  high:     '#facc15',
  critical: '#f87171',
};

export function createTreasuryDrawer(): TreasuryDrawer {
  let open = false;

  const el = document.createElement('div');
  el.style.cssText =
    'position:absolute;top:44px;left:0;width:66%;background:rgba(0,0,0,0.85);' +
    'border-radius:0 0 8px 0;padding:8px 12px;z-index:25;pointer-events:auto;color:#e0d6c8;';
  el.style.display = 'none';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
  const title = document.createElement('div');
  title.textContent = 'Treasury';
  title.style.cssText = 'font-weight:bold;font-size:13px;';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText =
    'background:rgba(255,255,255,0.1);color:#e0d6c8;border:none;border-radius:4px;' +
    'min-height:44px;min-width:44px;font-size:20px;cursor:pointer;';
  closeBtn.addEventListener('click', () => close());
  header.appendChild(closeBtn);
  el.appendChild(header);

  function makeRow(label: string, dataRow: string): { row: HTMLElement; value: HTMLElement } {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;margin:2px 0;';
    row.setAttribute('data-row', dataRow);
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const value = document.createElement('span');
    row.appendChild(labelEl);
    row.appendChild(value);
    el.appendChild(row);
    return { row, value };
  }

  const { value: revenueVal }  = makeRow('Revenue',   'revenue');
  const { value: buildVal }    = makeRow('Buildings', 'buildings');
  const { value: unitVal }     = makeRow('Units',     'units');
  const { row: netRow, value: netVal } = makeRow('Net/turn', 'net');
  const { value: treasuryVal } = makeRow('Treasury',  'treasury');

  function update(economy: EconomyProjection, currentGold: number): void {
    revenueVal.textContent  = `+${economy.grossGoldIncome} 💰`;
    buildVal.textContent    = `-${economy.buildingMaintenance} 💰`;
    unitVal.textContent     = `-${economy.unitMaintenance} 💰`;
    const net = economy.netGoldPerTurn;
    netVal.textContent = `${net >= 0 ? '+' : ''}${net} 💰`;
    const strain = (economy.strainLevel as TreasuryStrainLevel) ?? 'none';
    netRow.style.color = NET_COLORS[strain] ?? NET_COLORS.none;
    treasuryVal.textContent = `${currentGold} 💰`;
  }

  function show(): void {
    open = true;
    el.style.display = '';
  }

  function close(): void {
    open = false;
    el.style.display = 'none';
  }

  function toggle(): void {
    open ? close() : show();
  }

  return {
    element: el,
    isOpen:  () => open,
    update,
    toggle,
    close,
  };
}
