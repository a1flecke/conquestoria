import type { City, ResourceYield } from '@/core/types';
import { BUILDINGS } from '@/systems/city-system';

type DistrictCategory = 'food' | 'production' | 'science' | 'economy' | 'military' | 'culture' | 'espionage';

const DISTRICT_ORDER: DistrictCategory[] = [
  'food',
  'production',
  'science',
  'economy',
  'military',
  'culture',
  'espionage',
];

const DISTRICT_META: Record<DistrictCategory, { name: string; icon: string; accent: string }> = {
  food:      { name: 'Food Quarter',    icon: '🌾', accent: '#64c864' },
  production:{ name: 'Industry',        icon: '⚒️', accent: '#d98c4a' },
  science:   { name: 'Academy',         icon: '🔭', accent: '#4a90d9' },
  economy:   { name: 'Commerce',        icon: '🏪', accent: '#e8c170' },
  military:  { name: 'Garrison',        icon: '⚔️', accent: '#d94a4a' },
  culture:   { name: 'Culture Quarter', icon: '🎭', accent: '#b464d9' },
  espionage: { name: 'Shadow Network',  icon: '🕵️', accent: '#7a8899' },
};

const BUILDING_ICONS: Record<string, string> = {
  granary: '🌾', herbalist: '🌿', aqueduct: '💧',
  workshop: '⚒️', forge: '🔥', lumbermill: '🪵', 'quarry-building': '🪨',
  library: '📚', archive: '📜', observatory: '🔭',
  marketplace: '🏪', harbor: '⚓', dock: '🚢',
  barracks: '⚔️', walls: '🧱', stable: '🐴',
  temple: '🕍', monument: '🗿', amphitheater: '🎭', shrine: '⛩️', forum: '🏛️',
  safehouse: '🕵️', 'intelligence-agency': '🏢', 'security-bureau': '🛡️',
};

function allZero(y: ResourceYield): boolean {
  return y.food === 0 && y.production === 0 && y.gold === 0 && y.science === 0;
}

function formatDistrictYields(yields: ResourceYield): string {
  const parts: string[] = [];
  if (yields.food > 0) parts.push(`+${yields.food} food`);
  if (yields.production > 0) parts.push(`+${yields.production} production`);
  if (yields.gold > 0) parts.push(`+${yields.gold} gold`);
  if (yields.science > 0) parts.push(`+${yields.science} science`);
  return parts.join(' · ');
}

function sumYields(buildings: string[]): ResourceYield {
  const total: ResourceYield = { food: 0, production: 0, gold: 0, science: 0 };
  for (const id of buildings) {
    const def = BUILDINGS[id];
    if (!def) continue;
    total.food += def.yields.food;
    total.production += def.yields.production;
    total.gold += def.yields.gold;
    total.science += def.yields.science;
  }
  return total;
}

export function createCityDistrictsTab(city: City): HTMLElement {
  const root = document.createElement('div');
  root.id = 'city-districts-tab';
  root.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:14px 16px 16px;';

  // Group buildings by category (preserving insertion order within each group)
  const grouped = new Map<DistrictCategory, string[]>();
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (!def || !def.category) continue;
    const cat = def.category as DistrictCategory;
    if (!DISTRICT_META[cat]) continue;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(id);
  }

  if (grouped.size === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color:rgba(255,255,255,0.3);font-size:12px;text-align:center;padding:32px 16px;font-style:italic;';
    empty.textContent = 'No districts yet — build your first building to found one.';
    root.appendChild(empty);
    return root;
  }

  for (const cat of DISTRICT_ORDER) {
    const buildingIds = grouped.get(cat);
    if (!buildingIds) continue;

    const meta = DISTRICT_META[cat];
    const totalYields = sumYields(buildingIds);

    const card = document.createElement('div');
    card.dataset.district = cat;
    card.style.cssText = `background:rgba(255,255,255,0.04);border-radius:8px;overflow:hidden;border:1px solid ${meta.accent}4d;`;

    // District header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;';

    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:18px;width:28px;text-align:center;';
    icon.textContent = meta.icon;

    const name = document.createElement('span');
    name.style.cssText = `font-size:13px;font-weight:bold;flex:1;color:${meta.accent};`;
    name.textContent = meta.name;

    const total = document.createElement('span');
    total.dataset.districtTotal = '';
    total.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.45);';
    total.textContent = allZero(totalYields) ? '' : formatDistrictYields(totalYields) + '/turn';

    header.appendChild(icon);
    header.appendChild(name);
    header.appendChild(total);
    card.appendChild(header);

    // Building rows
    const rows = document.createElement('div');
    rows.style.cssText = 'padding:0 12px 10px;display:flex;flex-direction:column;gap:4px;';

    for (const id of buildingIds) {
      const def = BUILDINGS[id];
      if (!def) continue;

      const row = document.createElement('div');
      row.dataset.buildingRow = id;
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;background:rgba(255,255,255,0.04);border-radius:5px;font-size:11px;';

      const buildingIcon = document.createElement('span');
      buildingIcon.style.cssText = 'font-size:14px;';
      buildingIcon.textContent = BUILDING_ICONS[id] ?? '🏗️';

      const buildingName = document.createElement('span');
      buildingName.style.cssText = 'flex:1;color:rgba(255,255,255,0.85);';
      buildingName.textContent = def.name;

      const yieldEl = document.createElement('span');
      yieldEl.dataset.buildingYield = '';
      yieldEl.style.cssText = 'color:rgba(255,255,255,0.45);font-size:10px;';
      yieldEl.textContent = allZero(def.yields) ? def.description : formatDistrictYields(def.yields);

      row.appendChild(buildingIcon);
      row.appendChild(buildingName);
      row.appendChild(yieldEl);
      rows.appendChild(row);
    }

    card.appendChild(rows);
    root.appendChild(card);
  }

  return root;
}
