import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';

const LEGEND_ITEMS = [
  { icon: '🏛️', label: 'City' },
  { icon: '⚠️', label: 'Unrest' },
  { icon: '🔥', label: 'Revolt' },
  { icon: '✦', label: 'Natural Wonder' },
  { icon: '🏕️', label: 'Tribal Village' },
  { icon: '🌾', label: 'Farm' },
  { icon: '⛏️', label: 'Mine' },
];

export function createIconLegendOverlay(viewerTechs: ReadonlySet<string> = new Set()): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = 'icon-legend';
  // display:block — this function is now only called when about to show the overlay
  overlay.style.cssText = 'position:absolute;top:84px;right:12px;z-index:24;width:180px;max-height:calc(100vh - 100px);overflow-y:auto;padding:12px;border-radius:12px;background:rgba(8,12,20,0.92);border:1px solid rgba(255,255,255,0.14);box-shadow:0 10px 30px rgba(0,0,0,0.35);display:block;';

  const title = document.createElement('div');
  title.textContent = 'Map Legend';
  title.style.cssText = 'font-size:12px;font-weight:700;color:#f4f1e8;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:8px;';
  overlay.appendChild(title);

  for (const item of LEGEND_ITEMS) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;color:#d7dce6;font-size:12px;padding:3px 0;';

    const icon = document.createElement('span');
    icon.textContent = item.icon;
    icon.style.cssText = 'display:inline-flex;width:20px;justify-content:center;';
    row.appendChild(icon);

    const label = document.createElement('span');
    label.textContent = item.label;
    row.appendChild(label);

    overlay.appendChild(row);
  }

  // Dynamic resource section — only shown when viewer has at least one resource tech
  const unlockedResources = RESOURCE_DEFINITIONS.filter(r => viewerTechs.has(r.tech));
  if (unlockedResources.length > 0) {
    const resourceHeader = document.createElement('div');
    resourceHeader.style.cssText = 'font-size:12px;font-weight:700;color:#f4f1e8;letter-spacing:0.04em;text-transform:uppercase;margin-top:10px;margin-bottom:4px;';
    resourceHeader.textContent = 'Resources';
    overlay.appendChild(resourceHeader);

    const luxuries = unlockedResources.filter(r => r.type === 'luxury');
    const strategics = unlockedResources.filter(r => r.type === 'strategic');

    const groups: Array<[string, typeof unlockedResources]> = [
      ['Luxury', luxuries],
      ['Strategic', strategics],
    ];

    for (const [groupLabel, group] of groups) {
      if (group.length === 0) continue;

      const subHeader = document.createElement('div');
      subHeader.style.cssText = 'font-size:10px;color:rgba(244,241,232,0.5);text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;margin-bottom:2px;';
      subHeader.textContent = groupLabel;
      overlay.appendChild(subHeader);

      for (const r of group) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;color:#d7dce6;font-size:12px;padding:3px 0;';

        const iconSpan = document.createElement('span');
        iconSpan.textContent = r.icon;
        iconSpan.style.cssText = 'display:inline-flex;width:20px;justify-content:center;';
        row.appendChild(iconSpan);

        const labelSpan = document.createElement('span');
        labelSpan.textContent = r.name;
        row.appendChild(labelSpan);

        overlay.appendChild(row);
      }
    }
  }

  return overlay;
}
