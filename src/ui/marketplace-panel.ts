import type { GameState, MarketplaceState, ResourceType } from '@/core/types';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';

interface MarketplaceCallbacks {
  onClose: () => void;
}

export function createMarketplacePanel(
  container: HTMLElement,
  state: GameState,
  callbacks: MarketplaceCallbacks,
): void {
  const existing = document.getElementById('marketplace-panel');
  if (existing) { existing.remove(); return; }

  const marketplace = state.marketplace;
  if (!marketplace) return;

  const panel = document.createElement('div');
  panel.id = 'marketplace-panel';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(10,10,30,0.95);z-index:50;overflow-y:auto;padding:16px;';

  const playerResources = countPlayerResources(state);

  // Build structural HTML with only safe hardcoded strings; dynamic data goes in data-text placeholders
  const fashionBannerHtml = marketplace.fashionable
    ? `<div style="background:#4a3520;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#e8c170;">✨ <span data-text="fashion-resource"></span> is fashionable! (<span data-text="fashion-turns"></span> turns left) — prices doubled</div>`
    : '';

  // Build resource row placeholders
  const resourceRowsHtml = RESOURCE_DEFINITIONS.map((def, idx) => {
    const price = marketplace.prices[def.id] ?? def.basePrice;
    const history = marketplace.priceHistory[def.id] ?? [def.basePrice];
    const trend = history.length >= 2 ? history[history.length - 1] - history[history.length - 2] : 0;
    const trendIcon = trend > 0 ? '📈' : trend < 0 ? '📉' : '➡️';
    const isFashionable = marketplace.fashionable === def.id;
    const typeColor = def.type === 'luxury' ? '#d4a' : '#8af';
    const sparkline = renderSparkline(history);

    return `
      <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:10px;${isFashionable ? 'border:1px solid #e8c170;' : ''}">
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:bold;"><span data-text="res-name-${idx}"></span> <span style="font-size:10px;color:${typeColor};" data-text="res-type-${idx}"></span></div>
          <div style="font-size:11px;opacity:0.6;">You own: <span data-text="res-owned-${idx}"></span></div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:14px;color:#e8c170;">💰 <span data-text="res-price-${idx}"></span> ${trendIcon}</div>
          <div style="font-size:10px;opacity:0.5;">${sparkline}</div>
        </div>
      </div>
    `;
  }).join('');

  // Build trade routes HTML
  const tradeRoutesHtml = buildTradeRoutesHtml(marketplace, state);

  panel.innerHTML = `
    <div style="max-width:500px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="margin:0;font-size:18px;color:#e8c170;">Marketplace</h2>
        <span id="mp-close" style="cursor:pointer;font-size:22px;opacity:0.6;">✕</span>
      </div>
      ${fashionBannerHtml}
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${resourceRowsHtml}
      </div>
      ${tradeRoutesHtml}
    </div>
  `;

  // Inject all dynamic text via textContent (XSS-safe)
  const setText = (sel: string, text: string) => {
    const el = panel.querySelector(`[data-text="${sel}"]`);
    if (el) el.textContent = text;
  };

  if (marketplace.fashionable) {
    setText('fashion-resource', marketplace.fashionable);
    setText('fashion-turns', String(marketplace.fashionTurnsLeft));
  }

  RESOURCE_DEFINITIONS.forEach((def, idx) => {
    const price = marketplace.prices[def.id] ?? def.basePrice;
    const owned = playerResources[def.id] ?? 0;
    setText(`res-name-${idx}`, def.name);
    setText(`res-type-${idx}`, def.type);
    setText(`res-owned-${idx}`, String(owned));
    setText(`res-price-${idx}`, String(price));
  });

  // Inject trade route city names
  const playerRoutes = marketplace.tradeRoutes.filter(r => {
    const city = state.cities[r.fromCityId];
    return city?.owner === state.currentPlayer;
  });
  playerRoutes.forEach((r, idx) => {
    const from = state.cities[r.fromCityId]?.name ?? 'Unknown';
    const to = state.cities[r.toCityId]?.name ?? 'Unknown';
    setText(`route-from-${idx}`, from);
    setText(`route-to-${idx}`, to);
    setText(`route-gold-${idx}`, String(r.goldPerTurn));
  });
  if (playerRoutes.length > 0) {
    const totalGold = playerRoutes.reduce((sum, r) => sum + r.goldPerTurn, 0);
    setText('routes-total-gold', String(totalGold));
    setText('routes-count', String(playerRoutes.length));
  }

  container.appendChild(panel);
  document.getElementById('mp-close')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onClose();
  });
}

function countPlayerResources(state: GameState): Record<string, number> {
  const counts: Record<string, number> = {};
  const playerCities = state.civilizations[state.currentPlayer]?.cities ?? [];
  for (const cityId of playerCities) {
    const city = state.cities[cityId];
    if (!city) continue;
    for (const coord of city.ownedTiles) {
      const tile = state.map.tiles[`${coord.q},${coord.r}`];
      if (tile?.resource) {
        counts[tile.resource] = (counts[tile.resource] ?? 0) + 1;
      }
    }
  }
  return counts;
}

function renderSparkline(history: number[]): string {
  if (history.length < 2) return '';
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const bars = '▁▂▃▄▅▆▇█';
  return history.slice(-8).map(v => {
    const idx = Math.floor(((v - min) / range) * (bars.length - 1));
    return bars[idx];
  }).join('');
}

function buildTradeRoutesHtml(marketplace: MarketplaceState, state: GameState): string {
  const playerRoutes = marketplace.tradeRoutes.filter(r => {
    const city = state.cities[r.fromCityId];
    return city?.owner === state.currentPlayer;
  });

  if (playerRoutes.length === 0) {
    return '<div style="margin-top:16px;font-size:12px;opacity:0.5;text-align:center;">No active trade routes. Build a Market building to establish routes.</div>';
  }

  const routeRowsHtml = playerRoutes.map((r, idx) => {
    return `<div style="font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);"><span data-text="route-from-${idx}"></span> → <span data-text="route-to-${idx}"></span>: +<span data-text="route-gold-${idx}"></span> 💰/turn</div>`;
  }).join('');

  return `
    <div style="margin-top:16px;">
      <div style="font-size:14px;color:#e8c170;margin-bottom:8px;">Trade Routes (<span data-text="routes-count"></span>)</div>
      ${routeRowsHtml}
      <div style="font-size:12px;margin-top:8px;color:#6b9b4b;">Total: +<span data-text="routes-total-gold"></span> 💰/turn</div>
    </div>
  `;
}
