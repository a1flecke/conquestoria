import type { GameState, ResourceType } from '@/core/types';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { getCivAvailableResources, getInstantResourcePurchaseNotice } from '@/systems/resource-acquisition-system';
import { buildPlayerRouteListSection, type RouteControlHandler } from './trade-route-presentation';

interface MarketplaceCallbacks {
  onClose: () => void;
  onSelectUnit?: (unitId: string) => void;
  /** #1502 MR05: the owner's pause / resume / cancel-and-return controls on a route row. */
  onRouteControl?: RouteControlHandler;
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

  const ownedResources = getCivAvailableResources(state, state.currentPlayer);

  const civ = state.civilizations[state.currentPlayer];
  const viewerTechs  = new Set(civ?.techState.completed ?? []);
  const knownDefs    = RESOURCE_DEFINITIONS.filter(d => viewerTechs.has(d.tech));
  const unknownCount = RESOURCE_DEFINITIONS.length - knownDefs.length;

  // Build "Your Resources" summary — filter against knownDefs for self-documentation
  // (ownedResources already requires tech; knownDefs filter makes intent explicit)
  const luxuryOwned = knownDefs
    .filter(d => d.type === 'luxury' && ownedResources.has(d.id as ResourceType))
    .map(d => d.name);
  const strategicOwned = knownDefs
    .filter(d => d.type === 'strategic' && ownedResources.has(d.id as ResourceType))
    .map(d => d.name);
  const temporaryAccess = (marketplace.purchasedResources ?? [])
    .filter(entry => entry.civId === state.currentPlayer && entry.expiresOnTurn > state.turn)
    .map(entry => ({
      name: knownDefs.find(def => def.id === entry.resource)?.name,
      turns: entry.expiresOnTurn - state.turn,
    }))
    .filter((entry): entry is { name: string; turns: number } => entry.name !== undefined);

  const yourResourcesHtml = `
    <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:10px 12px;margin-bottom:12px;">
      <div style="font-size:13px;font-weight:bold;color:#e8c170;margin-bottom:6px;" data-text="your-resources-heading"></div>
      <div data-text="your-resources-body"></div>
    </div>
  `;

  // Instant imports are withheld while the market is rebuilt (#1498): the notice is the panel's
  // headline and is shown to every viewer regardless of sellers, tech, or trade routes. No global
  // price or fashion advertising is rendered any more.
  const importsNotice = getInstantResourcePurchaseNotice();
  const noticeBoxHtml = importsNotice
    ? `<div data-section="resource-imports-rebuilding" style="background:#4a3520;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px;color:#e8c170;"><span data-text="imports-rebuilding"></span></div>`
    : '';

  // Build resource row placeholders — knownDefs only (tech-gated).
  // NOTE: Both this builder and the setText loop below are index-coupled on knownDefs;
  // they must iterate the same array in the same order. Tests catch any desync.
  const resourceRowsHtml = knownDefs.map((def, idx) => {
    const typeColor = def.type === 'luxury' ? '#d4a' : '#8af';

    return `
      <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:bold;"><span data-text="res-name-${idx}"></span> <span style="font-size:10px;color:${typeColor};" data-text="res-type-${idx}"></span></div>
          <div style="font-size:11px;opacity:0.6;" data-text="res-owned-${idx}"></div>
          <div style="font-size:10px;opacity:0.65;" data-text="res-effect-${idx}"></div>
        </div>
      </div>
    `;
  }).join('');

  panel.innerHTML = `
    <div style="max-width:500px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="margin:0;font-size:18px;color:#e8c170;">Trade &amp; Supply</h2>
        <button type="button" id="mp-close" aria-label="Close Trade &amp; Supply" style="min-width:44px;min-height:44px;color:inherit;font:inherit;border:none;background:none;cursor:pointer;font-size:22px;">✕</button>
      </div>
      <section data-section="trade-supply-routes" style="margin-bottom:18px;">
        <div data-text="routes-heading" style="font-size:13px;font-weight:bold;color:#e8c170;margin-bottom:6px;"></div>
        <div id="mp-routes-section"></div>
      </section>
      <section data-section="trade-supply-supplies" style="margin-bottom:18px;">
        <div data-text="supplies-heading" style="font-size:13px;font-weight:bold;color:#e8c170;margin-bottom:6px;"></div>
        ${noticeBoxHtml}
        ${yourResourcesHtml}
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${resourceRowsHtml}
        </div>
        ${unknownCount > 0 ? '<div style="font-size:12px;opacity:0.5;text-align:center;margin-top:8px;" data-text="discoverable-footer"></div>' : ''}
      </section>
      <section data-section="trade-supply-policies">
        <div data-text="policies-heading" style="font-size:13px;font-weight:bold;color:#e8c170;margin-bottom:6px;"></div>
        <div data-text="policies-body" style="font-size:12px;opacity:0.7;"></div>
      </section>
    </div>
  `;

  // Inject all dynamic text via textContent (XSS-safe)
  const setText = (sel: string, text: string) => {
    const el = panel.querySelector(`[data-text="${sel}"]`);
    if (el) el.textContent = text;
  };

  // #1504 MR07: the three named sections. Routes is the live route roster; Supplies explains what
  // cannot be bought yet rather than offering unfinished controls; Policies names the controls that
  // arrive with supply (MR12/MR16) without advertising an action that does not exist.
  setText('routes-heading', 'Routes');
  setText('supplies-heading', 'Supplies');
  setText('policies-heading', 'Policies');
  setText(
    'policies-body',
    'Reserve targets, spending limits and partner export permissions arrive with supply routes. Nothing here changes your empire yet.',
  );

  if (importsNotice) setText('imports-rebuilding', importsNotice);

  // Both this loop and the row builder above iterate knownDefs — must stay in sync
  knownDefs.forEach((def, idx) => {
    const isOwned = ownedResources.has(def.id as ResourceType);
    setText(`res-name-${idx}`, def.name);
    setText(`res-type-${idx}`, def.type.charAt(0).toUpperCase() + def.type.slice(1));
    setText(`res-owned-${idx}`, isOwned ? '✓ Owned' : '✗ Not in inventory');

    // Effect badge — set via textContent, never innerHTML
    let effectText: string;
    if (!def.effect) {
      effectText = '(unlocks advanced units & buildings)';
    } else {
      switch (def.effect.type) {
        case 'happiness':   effectText = '★ +1 happiness'; break;
        case 'gold':        effectText = '$ +1 gold/turn'; break;
        case 'production':  effectText = '⚙ +1 production/turn'; break;
        case 'food':        effectText = '🌾 +1 food/turn'; break;
        case 'science':     effectText = '🔬 +1 science/turn'; break;
        default:            effectText = '';
      }
    }
    setText(`res-effect-${idx}`, effectText);
  });

  // Populate Your Resources section
  setText('your-resources-heading', 'Your Resources');
  if (luxuryOwned.length === 0 && strategicOwned.length === 0) {
    const emptyEl = panel.querySelector('[data-text="your-resources-body"]');
    if (emptyEl) emptyEl.textContent = 'None';
  } else {
    const bodyEl = panel.querySelector('[data-text="your-resources-body"]');
    if (bodyEl) {
      const luxLine = document.createElement('div');
      luxLine.style.cssText = 'font-size:12px;opacity:0.8;';
      luxLine.textContent = `Luxury (${luxuryOwned.length}): ${luxuryOwned.length > 0 ? luxuryOwned.join(', ') : '—'}`;
      const strLine = document.createElement('div');
      strLine.style.cssText = 'font-size:12px;opacity:0.8;';
      strLine.textContent = `Strategic (${strategicOwned.length}): ${strategicOwned.length > 0 ? strategicOwned.join(', ') : '—'}`;
      bodyEl.appendChild(luxLine);
      bodyEl.appendChild(strLine);
      if (temporaryAccess.length > 0) {
        const temporaryLine = document.createElement('div');
        temporaryLine.style.cssText = 'font-size:12px;color:#e8c170;margin-top:4px;';
        temporaryLine.textContent = `Temporary access: ${temporaryAccess.map(entry => `${entry.name} (${entry.turns} turns left)`).join(', ')}`;
        bodyEl.appendChild(temporaryLine);
      }
    }
  }

  // Discoverable-count footer
  if (unknownCount > 0) {
    setText('discoverable-footer', `🔬 ${unknownCount} more resources will become visible as you research new technologies`);
  }

  // Build route list via DOM (XSS-safe, uses new TradeRoute shape)
  const routesSection = panel.querySelector('#mp-routes-section');
  if (routesSection) {
    routesSection.appendChild(buildPlayerRouteListSection(state, state.currentPlayer, callbacks.onSelectUnit, callbacks.onRouteControl));
  }

  container.appendChild(panel);
  document.getElementById('mp-close')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onClose();
  });
}
