import type { GameState, TradeRouteModeId } from '@/core/types';
import type { ResourceProcurementTerms, TradeGoodId } from '@/core/types/commerce';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { resourceGoodId } from '@/systems/trade-good-definitions';
import {
  getEntitledTradeDestinations,
  getEntitledTradeOrigins,
  type EntitledTradeDestination,
} from '@/systems/commerce-projection';
import { TRADE_ROUTE_DENIAL_MESSAGES } from '@/systems/trade-route-contract';
import {
  TRADE_ROUTE_MODES,
  TRADE_ROUTE_MODE_DENIAL_MESSAGES,
  getTradeRouteMode,
  getTradeRouteModeEligibility,
} from '@/systems/trade-route-modes';
import {
  getTradeRouteRecommendations,
  describeRouteModeYield,
  type TradeRouteRecommendation,
  type TradeRouteRecommendationKind,
} from '@/systems/trade-route-recommendations';
import { getEntitledRouteDanger } from '@/systems/trade-danger-adapters';
import { ROUTE_CONTROL_NOTIFICATIONS } from '@/systems/trade-route-lifecycle';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { createGameButton } from '@/ui/ui-kit';
import { markModal } from '@/ui/modal-contract';

/**
 * The trade-route chooser (#1500 MR03, extended by #1504 MR07).
 *
 * Every row comes from `commerce-projection`, so a destination the viewer has not discovered does
 * not exist here — no name, id, count, order or tooltip — and a known-but-denied destination stays
 * visible with its entitled reason.
 *
 * MR07 adds a purpose (mode) and a short recommendation surface. Recommendations only *reorder
 * attention*: the complete entitled catalog stays reachable through `All known destinations`, and the
 * selected destination always shows its operating yield, positioning/travel ETA, known danger and the
 * cancel/return consequence before Confirm.
 */
export interface RouteProcurementDraft {
  procurement: ResourceProcurementTerms;
  roundBudget: number;
  treasuryFloor: number;
}

export type EstablishRouteHandler = (
  toCityId: string,
  originCityId: string,
  mode: TradeRouteModeId,
  procurement?: RouteProcurementDraft,
) => void;

const SECTION_LABEL = 'font-size:11px;text-transform:uppercase;opacity:0.5;padding:8px 0 4px;letter-spacing:0.05em;';

const RECOMMENDATION_HEADING: Record<TradeRouteRecommendationKind, string> = {
  profitable: 'Most profitable',
  'useful-development': 'Useful development',
  'lower-known-danger': 'Lower known danger',
};

export function openEstablishRoutePanel(
  container: HTMLElement,
  state: GameState,
  caravanUnitId: string,
  onEstablish: EstablishRouteHandler,
): void {
  container.querySelector('#establish-route-panel')?.remove();

  const unit = state.units[caravanUnitId];
  if (!unit) return;

  const viewerCivId = state.currentPlayer;
  const origins = getEntitledTradeOrigins(state, viewerCivId, caravanUnitId);

  const panel = document.createElement('div');
  panel.id = 'establish-route-panel';
  panel.style.cssText = 'position:absolute;bottom:0;left:0;right:0;z-index:50;background:#171923;border-top:1px solid rgba(255,255,255,0.15);padding:16px;max-height:70vh;overflow-y:auto;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
  const title = document.createElement('h3');
  title.style.cssText = 'font-size:15px;color:#e8c170;margin:0;';
  const unitDisplayName = UNIT_DEFINITIONS[unit.type]?.name ?? unit.type;
  title.textContent = `Trade Routes (${unitDisplayName})`;
  const closeBtn = createGameButton('✕', 'ghost');
  closeBtn.addEventListener('click', () => panel.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  let selectedOriginCityId: string | null = origins[0]?.cityId ?? null;
  let selectedCityId: string | null = null;
  let selectedMode: TradeRouteModeId = 'commerce';
  const viewerTechs = new Set(state.civilizations[viewerCivId]?.techState.completed ?? []);
  const storedGoods = RESOURCE_DEFINITIONS
    .filter(def => (def.economicRoles?.length ?? 0) > 0 && viewerTechs.has(def.tech))
    .map(def => ({ id: resourceGoodId(def.id) as TradeGoodId, name: def.name, icon: def.icon }));
  let procurementGoodId: TradeGoodId | null = storedGoods[0]?.id ?? null;
  let procurementTarget = 10;
  let procurementMaxPrice = 20;
  let procurementBudget = 100;
  let procurementFloor = 50;

  const modeSection = document.createElement('div');
  const recommendationSection = document.createElement('div');
  const destinationSection = document.createElement('div');
  const detailSection = document.createElement('div');
  detailSection.style.cssText = 'margin-top:10px;padding:10px 12px;border-radius:8px;background:rgba(255,255,255,0.05);font-size:12px;';
  detailSection.dataset.routeSummary = 'selected';

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:16px;';
  const confirmBtn = createGameButton('Confirm', 'primary', { disabled: true });
  const cancelBtn = createGameButton('Cancel', 'secondary');

  /** The destination rows the chooser is allowed to show for the viewer. */
  function entitledDestinations(): EntitledTradeDestination[] {
    return getEntitledTradeDestinations(state, viewerCivId, caravanUnitId, {
      originCityId: selectedOriginCityId ?? undefined,
      mode: selectedMode,
    }).filter(destination => destination.cityId !== selectedOriginCityId);
  }

  /**
   * Whether a destination may run the selected purpose. The catalog is the one authority; the row's
   * reason comes from it, never from a UI-local rule.
   */
  function modeDenialFor(destination: EntitledTradeDestination): string | null {
    const decision = getTradeRouteModeEligibility({
      state,
      ownerCivId: viewerCivId,
      destinationCityId: destination.cityId,
    }, selectedMode);
    return decision.ok ? null : TRADE_ROUTE_MODE_DENIAL_MESSAGES[decision.reason];
  }

  function selectDestination(cityId: string): void {
    selectedCityId = cityId;
    panel.querySelectorAll('.route-row-selected').forEach(el => {
      (el as HTMLElement).style.background = '';
      el.classList.remove('route-row-selected');
    });
    panel.querySelectorAll<HTMLElement>(`[data-destination-city="${cityId}"]`).forEach(row => {
      row.style.background = 'rgba(107, 155, 75, 0.2)';
      row.classList.add('route-row-selected');
    });
    confirmBtn.disabled = false;
    renderDetail();
  }

  function renderDetail(): void {
    detailSection.textContent = '';
    if (!selectedCityId) {
      detailSection.style.display = 'none';
      return;
    }
    detailSection.style.display = '';
    const destination = entitledDestinations().find(row => row.cityId === selectedCityId);
    if (!destination) return;

    const mode = getTradeRouteMode(selectedMode);
    const lines = [
      `Purpose: ${mode?.label ?? selectedMode} — ${describeRouteModeYield(destination, selectedMode)}`,
      `Round trip: ${destination.roundTripRounds} rounds · positioning ${destination.positioningTurns > 0 ? `${destination.positioningTurns} turns to origin` : 'already at origin'}`,
      `Cancelling later: ${ROUTE_CONTROL_NOTIFICATIONS['cancel-and-return']}`,
    ];
    for (const line of lines) {
      const row = document.createElement('div');
      row.style.cssText = 'padding:1px 0;';
      row.appendChild(document.createTextNode(line));
      detailSection.appendChild(row);
    }
    const dangerLine = document.createElement('div');
    dangerLine.dataset.knownDanger = 'true';
    dangerLine.style.cssText = 'padding:1px 0;color:#d98d4a;';
    dangerLine.textContent = knownDangerLabel(destination);
    detailSection.appendChild(dangerLine);

    // #1509 MR12: a foreign route can carry a standing import order. The price is locked only at
    // loading, within this maximum; the budget/floor are shared across every route.
    const destinationCity = state.cities[destination.cityId];
    if (destinationCity && destinationCity.owner !== viewerCivId && storedGoods.length > 0) {
      const box = document.createElement('div');
      box.dataset.procurementSection = 'true';
      box.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);display:flex;flex-direction:column;gap:6px;';
      const heading = document.createElement('div');
      heading.style.cssText = 'font-size:11px;text-transform:uppercase;opacity:0.6;';
      heading.textContent = 'Import order (optional)';
      box.appendChild(heading);

      const goodLabel = document.createElement('label');
      goodLabel.style.cssText = 'display:flex;align-items:center;gap:8px;';
      goodLabel.appendChild(document.createTextNode('Good'));
      const goodSelect = document.createElement('select');
      goodSelect.dataset.procurementGood = 'true';
      goodSelect.style.cssText = 'min-height:44px;background:#222;color:inherit;border:1px solid #555;border-radius:4px;padding:4px;';
      for (const good of storedGoods) {
        const option = document.createElement('option');
        option.value = good.id;
        option.textContent = `${good.icon} ${good.name}`;
        option.selected = good.id === procurementGoodId;
        goodSelect.appendChild(option);
      }
      goodSelect.addEventListener('change', () => { procurementGoodId = goodSelect.value; });
      goodLabel.appendChild(goodSelect);
      box.appendChild(goodLabel);

      const numberRow = (
        labelText: string,
        value: number,
        dataAttr: string,
        min: number,
        onChange: (value: number) => void,
      ): HTMLLabelElement => {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
        label.appendChild(document.createTextNode(labelText));
        const input = document.createElement('input');
        input.type = 'number';
        input.min = String(min);
        input.step = '1';
        input.value = String(value);
        input.setAttribute(`data-${dataAttr}`, 'true');
        input.style.cssText = 'width:84px;min-height:44px;background:#222;color:inherit;border:1px solid #555;border-radius:4px;padding:4px;';
        input.addEventListener('input', () => onChange(Math.max(min, Number.parseInt(input.value, 10) || min)));
        label.appendChild(input);
        return label;
      };
      box.appendChild(numberRow('Target quantity', procurementTarget, 'procurement-target', 1, value => { procurementTarget = value; }));
      box.appendChild(numberRow('Max unit price', procurementMaxPrice, 'procurement-max-price', 1, value => { procurementMaxPrice = value; }));
      box.appendChild(numberRow('Round budget', procurementBudget, 'procurement-budget', 0, value => { procurementBudget = value; }));
      box.appendChild(numberRow('Treasury floor', procurementFloor, 'procurement-floor', 0, value => { procurementFloor = value; }));
      const note = document.createElement('div');
      note.style.cssText = 'font-size:11px;opacity:0.6;';
      note.textContent = 'Loaded at the supplier; usable only after the return home. The price is locked at loading within this maximum.';
      box.appendChild(note);
      detailSection.appendChild(box);
    }
  }

  /** Entitled danger only: a blockade of a city the viewer does not own is never named here. */
  function knownDangerLabel(destination: EntitledTradeDestination): string {
    const danger = getEntitledRouteDanger(state, viewerCivId, {
      id: `preview-${destination.cityId}`,
      fromCityId: selectedOriginCityId ?? destination.cityId,
      toCityId: destination.cityId,
      goldPerTrip: 0,
      turnsPerTrip: destination.roundTripRounds || 1,
    });
    return danger ? `Known danger: ${danger.label}` : 'Known danger: none reported';
  }

  function destinationRow(
    destination: EntitledTradeDestination,
    selectable: boolean,
    /** Replaces the default yield line, e.g. with a recommendation's own reason. */
    rightText?: string,
  ): HTMLElement {
    const row = document.createElement('div');
    row.dataset.destinationCity = destination.cityId;
    row.style.cssText = [
      'display:flex', 'justify-content:space-between', 'align-items:center',
      'padding:10px 8px', 'border-bottom:1px solid rgba(255,255,255,0.08)',
      `cursor:${selectable ? 'pointer' : 'default'}`,
      `opacity:${selectable ? '1' : '0.5'}`, 'min-height:44px', 'gap:8px',
    ].join(';');

    const left = document.createElement('span');
    left.textContent = `${destination.cityName} (${destination.ownerName})`;
    row.appendChild(left);

    const right = document.createElement('span');
    right.style.cssText = 'font-size:12px;text-align:right;';
    const denial = modeDenialFor(destination);
    if (selectable && !denial) {
      right.style.color = '#6b9b4b';
      const positioning = destination.positioningTurns > 0 ? ` · ${destination.positioningTurns} turns to origin` : '';
      right.textContent = rightText
        ?? `${describeRouteModeYield(destination, selectedMode)} · ${destination.roundTripRounds}-round round trip${positioning}`;
      row.addEventListener('click', () => selectDestination(destination.cityId));
    } else {
      right.style.color = '#888';
      const reason = document.createElement('div');
      reason.style.cssText = 'font-size:11px;opacity:0.6;';
      // Entitled reason only: a known destination may say why it is refused.
      reason.textContent = denial
        ?? (destination.denialReason ? TRADE_ROUTE_DENIAL_MESSAGES[destination.denialReason] : 'Unavailable');
      right.appendChild(reason);
    }
    row.appendChild(right);
    return row;
  }

  function renderDestinations(): void {
    destinationSection.textContent = '';
    recommendationSection.textContent = '';
    selectedCityId = null;
    confirmBtn.disabled = true;
    renderDetail();

    const destinations = entitledDestinations();
    if (destinations.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:24px;opacity:0.5;font-size:13px;';
      empty.textContent = 'No eligible destinations.';
      destinationSection.appendChild(empty);
      return;
    }

    // --- Recommendations: short sets that reorder attention, never hide the catalog.
    const recommendations = getTradeRouteRecommendations(state, viewerCivId, caravanUnitId, {
      originCityId: selectedOriginCityId ?? undefined,
      mode: selectedMode,
    });
    const recommendedIds = new Set<string>();
    for (const kind of ['profitable', 'useful-development', 'lower-known-danger'] as const) {
      const entries: TradeRouteRecommendation[] = recommendations[kind];
      if (entries.length === 0) continue;
      const heading = document.createElement('div');
      heading.style.cssText = SECTION_LABEL;
      heading.textContent = RECOMMENDATION_HEADING[kind];
      heading.dataset.recommendation = kind;
      recommendationSection.appendChild(heading);
      for (const entry of entries) {
        recommendedIds.add(entry.destination.cityId);
        const row = destinationRow(entry.destination, true, entry.reason);
        recommendationSection.appendChild(row);
      }
    }

    // --- `All known destinations`: the complete entitled catalog, always present below the
    // recommendations, so a recommendation can never be the only way to reach a destination.
    const heading = document.createElement('div');
    heading.style.cssText = SECTION_LABEL;
    heading.textContent = `All known destinations (${destinations.length})`;
    heading.dataset.allDestinations = 'true';
    destinationSection.appendChild(heading);
    for (const destination of destinations) {
      const row = destinationRow(destination, destination.eligible);
      if (recommendedIds.has(destination.cityId)) row.dataset.recommended = 'true';
      destinationSection.appendChild(row);
    }
  }

  function renderModes(): void {
    modeSection.textContent = '';
    const heading = document.createElement('div');
    heading.style.cssText = SECTION_LABEL;
    heading.textContent = 'Purpose';
    modeSection.appendChild(heading);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    const destinations = entitledDestinations();
    for (const mode of TRADE_ROUTE_MODES) {
      // A purpose is offered when at least one entitled destination can run it.
      const available = destinations.some(destination => getTradeRouteModeEligibility({
        state,
        ownerCivId: viewerCivId,
        destinationCityId: destination.cityId,
      }, mode.id).ok);
      const button = createGameButton(mode.label, mode.id === selectedMode ? 'primary' : 'secondary');
      button.dataset.routeMode = mode.id;
      button.setAttribute('aria-pressed', String(mode.id === selectedMode));
      button.disabled = !available;
      button.title = available ? mode.description : 'No entitled destination supports this purpose yet.';
      button.addEventListener('click', () => {
        selectedMode = mode.id;
        renderModes();
        renderDestinations();
      });
      row.appendChild(button);
    }
    modeSection.appendChild(row);

    const description = document.createElement('div');
    description.style.cssText = 'font-size:11px;opacity:0.6;padding-top:6px;';
    description.textContent = getTradeRouteMode(selectedMode)?.description ?? '';
    modeSection.appendChild(description);
  }

  // --- Origin choice: the trader must reach this city before commerce begins.
  if (origins.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:24px;opacity:0.5;font-size:13px;';
    empty.textContent = 'No origin city has a free route slot.';
    panel.appendChild(empty);
  } else {
    const originHeading = document.createElement('div');
    originHeading.textContent = 'Origin';
    originHeading.style.cssText = SECTION_LABEL;
    panel.appendChild(originHeading);

    const originRow = document.createElement('div');
    originRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    for (const origin of origins) {
      const button = createGameButton(
        origin.positioningTurns > 0 ? `${origin.cityName} (${origin.positioningTurns} turns)` : origin.cityName,
        origin.cityId === selectedOriginCityId ? 'primary' : 'secondary',
      );
      button.dataset.originCityId = origin.cityId;
      button.addEventListener('click', () => {
        selectedOriginCityId = origin.cityId;
        originRow.querySelectorAll('button').forEach(el => {
          el.setAttribute('aria-pressed', String((el as HTMLElement).dataset.originCityId === origin.cityId));
        });
        renderModes();
        renderDestinations();
      });
      button.setAttribute('aria-pressed', String(origin.cityId === selectedOriginCityId));
      originRow.appendChild(button);
    }
    panel.appendChild(originRow);
    panel.appendChild(modeSection);
    panel.appendChild(recommendationSection);
    panel.appendChild(destinationSection);
    panel.appendChild(detailSection);
    renderModes();
    renderDestinations();
  }

  confirmBtn.addEventListener('click', () => {
    if (!selectedCityId || !selectedOriginCityId) return;
    const destination = state.cities[selectedCityId];
    const draft: RouteProcurementDraft | undefined = destination
      && destination.owner !== viewerCivId
      && procurementGoodId
      && procurementTarget > 0
      ? {
        procurement: {
          orders: [{
            goodId: procurementGoodId,
            targetQuantity: procurementTarget,
            maxUnitPrice: procurementMaxPrice,
          }],
        },
        roundBudget: procurementBudget,
        treasuryFloor: procurementFloor,
      }
      : undefined;
    onEstablish(selectedCityId, selectedOriginCityId, selectedMode, draft);
    panel.remove();
  });
  cancelBtn.addEventListener('click', () => panel.remove());
  btnRow.appendChild(confirmBtn);
  btnRow.appendChild(cancelBtn);
  panel.appendChild(btnRow);

  markModal(panel, { cancel: cancelBtn, initialFocus: closeBtn });
  container.appendChild(panel);
}
