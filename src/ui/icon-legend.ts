const LEGEND_ITEMS = [
  { icon: '🏛️', label: 'City' },
  { icon: '⚠️', label: 'Unrest' },
  { icon: '🔥', label: 'Revolt' },
  { icon: '✦', label: 'Natural Wonder' },
  { icon: '🏕️', label: 'Tribal Village' },
  { icon: '🌾', label: 'Farm' },
  { icon: '⛏️', label: 'Mine' },
];

export function createIconLegendOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = 'icon-legend';
  overlay.style.cssText = 'position:absolute;top:84px;right:12px;z-index:24;width:180px;padding:12px;border-radius:12px;background:rgba(8,12,20,0.92);border:1px solid rgba(255,255,255,0.14);box-shadow:0 10px 30px rgba(0,0,0,0.35);display:none;';

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

  return overlay;
}

export function toggleIconLegend(): void {
  const overlay = document.getElementById('icon-legend');
  if (!overlay) return;
  overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
}
