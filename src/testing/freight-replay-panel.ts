import './freight-replay-panel.css';
import type { GameSession } from '@/app/ports';
import type { EventBus } from '@/core/event-bus';
import { autoSave, listSaves, loadGame, normalizeLoadedState } from '@/storage/save-manager';
import { BUILDINGS } from '@/systems/city-building-catalog';
import { markModal } from '@/ui/modal-contract';
import { createGameButton, setButtonDisabled } from '@/ui/ui-kit';
import { applyCapitalOffer, getCapitalComparison, type CapitalOffer } from './freight-replay-capital';
import { FREIGHT_REPLAY } from './scenario-steps/freight-replay';
import type { ScenarioState } from './scenario-types';

function matchesLegacyFreightReplay(candidate: ScenarioState, baseline: ScenarioState): boolean {
  return candidate.gameId === baseline.gameId
    && candidate.cities[FREIGHT_REPLAY.west]?.id === FREIGHT_REPLAY.west
    && candidate.map.tiles['3,6']?.terrain === baseline.map.tiles['3,6']?.terrain;
}

function restoreFreightReplay(saved: ScenarioState, playthroughId: string): ScenarioState {
  const replay = { ...saved, playthroughId };
  // Early fixtures kept generated city-state cities after removing their owners.
  const entries = Object.entries(replay.cities);
  const cities = entries.filter(([, city]) => !city.owner.startsWith('mc-') || replay.minorCivs[city.owner]);
  if (cities.length === entries.length) return replay;
  return normalizeLoadedState({ ...replay, cities: Object.fromEntries(cities) });
}

export async function resumeFreightReplay(scenarioName: string, baseline: ScenarioState): Promise<ScenarioState> {
  // Both maps share a seed. Give each map a stable autosave group so the latest
  // save for a different map or campaign cannot hide its progress.
  const prefix = 'dev-freight-replay-';
  const playthroughId = `${prefix}${scenarioName}`;
  const autosaves = (await listSaves({ includeAutoSave: true })).filter(save => save.kind === 'autosave');
  const ownSave = autosaves.find(save => save.gameId === playthroughId);
  const resumed = ownSave && await loadGame(ownSave.id);
  if (resumed) return restoreFreightReplay(resumed, playthroughId);

  // Preserve progress from before these replays had dedicated autosave groups.
  for (const save of autosaves) {
    if (save.gameTitle !== baseline.gameTitle || save.gameId?.startsWith(prefix)) continue;
    const candidate = await loadGame(save.id);
    if (candidate && matchesLegacyFreightReplay(candidate, baseline)) return restoreFreightReplay(candidate, playthroughId);
  }
  return { ...baseline, playthroughId };
}

function textElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = '',
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function decorativeIcon(symbol: string, className: string): HTMLElement {
  const icon = textElement('span', className, symbol);
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function createInvestmentCard(name: string, icon: string, action: HTMLButtonElement) {
  const kind = name.toLowerCase();
  const card = textElement('section', `freight-choice freight-choice--${kind}`);
  const header = textElement('header', 'freight-choice-heading');
  const title = textElement('h3', 'freight-choice-title', name);
  title.id = `freight-choice-${kind}`;
  title.tabIndex = -1;
  card.setAttribute('aria-labelledby', title.id);
  const place = textElement('p', 'freight-muted');
  const heading = document.createElement('div');
  heading.append(title, place);
  const cost = textElement('p', 'freight-choice-cost');
  header.append(decorativeIcon(icon, 'freight-choice-icon'), heading, cost);
  const details = textElement('div', 'freight-choice-details');
  card.append(header, details, action);
  return { card, title, place, cost, details };
}

function createTripRow(label: string, style: 'current' | 'forecast') {
  const row = textElement('div', `freight-trip-row freight-trip-row--${style}`);
  const value = textElement('strong', 'freight-trip-value');
  const bar = textElement('span', 'freight-trip-fill');
  const track = textElement('div', 'freight-trip-track');
  track.setAttribute('aria-hidden', 'true');
  track.append(bar);
  row.append(textElement('span', 'freight-muted', label), value, track);
  return {
    row,
    update(rounds: number | undefined, longest: number): void {
      row.hidden = rounds === undefined;
      if (rounds === undefined) {
        value.textContent = '';
        return;
      }
      value.textContent = `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
      bar.style.width = `${rounds / longest * 100}%`;
    },
  };
}

function createHarborYield(icon: string, unit: string) {
  const tile = textElement('div', 'freight-yield');
  const value = textElement('strong', 'freight-yield-value');
  const description = document.createElement('span');
  description.append(value, ` ${unit}`);
  tile.append(decorativeIcon(icon, 'freight-yield-icon'), description);
  return { tile, value };
}

export function mountFreightReplayPanel(
  layer: HTMLElement,
  toolbar: HTMLElement,
  session: GameSession,
  bus: EventBus,
): void {
  const initial = session.getState();
  const viewer = initial.currentPlayer;
  const open = createGameButton('Freight investment', 'secondary');
  open.id = 'btn-freight-investment';
  open.style.touchAction = 'manipulation';
  open.setAttribute('aria-haspopup', 'dialog');
  toolbar.prepend(open);

  let panel: HTMLElement | undefined;
  const comparison = () => getCapitalComparison(session.getState(), viewer);
  const unsubscribe = session.subscribe(state => {
    if (state.playthroughId !== initial.playthroughId) {
      panel?.remove();
      open.remove();
      unsubscribe();
    } else if (!comparison()) {
      panel?.remove();
      open.hidden = true;
    } else {
      open.hidden = false;
    }
  });

  open.addEventListener('click', () => {
    if (panel?.isConnected || !comparison()) return;
    const modal = textElement('div', 'freight-investment-overlay');
    panel = modal;
    modal.id = 'freight-investment-dialog';
    const card = textElement('section', 'freight-investment-card');
    const header = textElement('header', 'freight-investment-heading');
    const title = textElement('h2', 'freight-investment-title', 'Freight investment');
    const budget = textElement('strong', 'freight-budget');
    const reserves = textElement('p', 'freight-muted freight-budget-detail');
    header.append(title, budget, reserves);

    const reviewPassage = createGameButton('Review passage', 'secondary');
    const reviewHarbor = createGameButton('Review Harbor', 'secondary');
    const passage = createInvestmentCard('Passage', '⛵', reviewPassage);
    const harbor = createInvestmentCard('Harbor', '⚓', reviewHarbor);
    const options = textElement('div', 'freight-investment-options');
    options.append(passage.card, harbor.card);

    const tripTitle = textElement('p', 'freight-muted', 'Estimated coal round trip');
    const trip = textElement('div', 'freight-trip');
    const currentTrip = createTripRow('Current', 'current');
    const forecastTrip = createTripRow('With passage', 'forecast');
    trip.append(tripTitle, currentTrip.row, forecastTrip.row);
    const passageStatus = textElement('p', 'freight-project-status');
    const passageFunds = textElement('p', 'freight-project-status');
    passage.details.append(passageStatus, trip, passageFunds);

    const harborStatus = textElement('p', 'freight-completed');
    const harborBenefits = textElement('div', 'freight-harbor-benefits');
    const yields = textElement('div', 'freight-yields');
    const goldYield = createHarborYield('💰', 'net gold');
    const foodYield = createHarborYield('🌾', 'food');
    yields.append(goldYield.tile, foodYield.tile);
    harborBenefits.append(textElement('p', 'freight-muted', 'Per round after completion'), yields);
    harbor.details.append(harborBenefits);

    const reviewDetails = textElement('dl', 'freight-review-details');
    const onPurchase = document.createElement('dd');
    const payoff = document.createElement('dd');
    const fundsLeft = document.createElement('dd');
    reviewDetails.append(
      textElement('dt', '', 'On purchase'), onPurchase,
      textElement('dt', '', 'Payoff'), payoff,
      textElement('dt', '', 'After purchase'), fundsLeft,
    );

    const stock = textElement('div', 'freight-factory');
    const stockTitle = textElement('strong', 'freight-factory-title');
    const coal = textElement('span', 'freight-muted');
    const lastRound = textElement('span', 'freight-muted');
    const nextFuel = textElement('span', 'freight-muted', 'Coal ready for next fuel allocation');
    stock.append(decorativeIcon('🏭', 'freight-factory-icon'), stockTitle, coal, lastRound, nextFuel);
    const status = textElement('p', 'freight-investment-status');
    status.setAttribute('role', 'status');

    const footer = textElement('footer', 'freight-investment-footer');
    const actions = textElement('div', 'freight-investment-actions');
    const defer = createGameButton('Defer', 'ghost');
    const confirm = createGameButton('Confirm', 'primary');
    const back = createGameButton('Back', 'secondary');
    let reviewed: CapitalOffer | undefined;
    function paint(): void {
      const model = comparison();
      if (!model) {
        modal.remove();
        return;
      }
      budget.textContent = `${model.freeGold} spendable gold`;
      reserves.textContent = `${model.treasuryGold} gold in treasury · ${model.protectedGold} gold kept in reserve`;

      passage.place.textContent = model.passageKnown ? 'Westport Strait' : '';
      passage.cost.textContent = model.passageKnown && !model.passageOpened ? `${FREIGHT_REPLAY.passageCost} gold` : '';
      passageStatus.textContent = model.passageOpened ? 'Passage opened' : '';
      if (model.currentRounds === undefined) {
        const missing = model.passageKnown ? 'No known route estimate' : 'No surveyed passage';
        passageStatus.textContent = [passageStatus.textContent, missing].filter(Boolean).join(' · ');
      }
      trip.hidden = model.currentRounds === undefined;
      const longest = Math.max(model.currentRounds ?? 0, model.openRounds ?? 0, 1);
      currentTrip.update(model.currentRounds, longest);
      forecastTrip.update(model.openRounds, longest);
      passageFunds.textContent = model.passageGoldShortfall > 0
        ? `Need ${model.passageGoldShortfall} more spendable gold.` : '';

      harbor.place.textContent = model.northName;
      harbor.cost.textContent = model.harborBuilt || model.harborCost === undefined ? '' : `${model.harborCost} gold`;
      harborStatus.textContent = `Harbor completed in ${model.northName}`;
      harborStatus.hidden = !model.harborBuilt || Boolean(reviewed);
      const harborYields = BUILDINGS.harbor.yields;
      const netGold = harborYields.gold - model.harborUpkeep;
      goldYield.value.textContent = `${netGold > 0 ? '+' : ''}${netGold}`;
      foodYield.value.textContent = `+${harborYields.food}`;

      stockTitle.textContent = model.factoryFueled === undefined ? model.westName : `${model.westName} Factory`;
      coal.textContent = `${model.coal} imported coal in reserve`;
      lastRound.hidden = model.factoryFueled === undefined;
      lastRound.textContent = model.factoryFueled ? 'Fuel used last round' : 'No coal last round';
      nextFuel.hidden = model.factoryFueled === undefined || !model.factoryCoalReady;
      setButtonDisabled(reviewPassage, !model.passage);
      setButtonDisabled(reviewHarbor, !model.harbor);
      confirm.hidden = !reviewed;
      back.hidden = !reviewed;
      reviewPassage.hidden = Boolean(reviewed);
      reviewHarbor.hidden = Boolean(reviewed);
      passage.card.hidden = reviewed?.choice === 'Harbor';
      harbor.card.hidden = model.harborBuilt || reviewed?.choice === 'passage';
      stock.hidden = Boolean(reviewed);
      defer.hidden = Boolean(reviewed);
      defer.textContent = model.passageOpened || model.harborBuilt ? 'Close' : 'Defer';

      reviewDetails.remove();
      if (reviewed?.choice === 'passage') {
        const shortcut = model.coalSupplierName
          ? `between ${model.westName} and ${model.coalSupplierName}`
          : 'through the Strait';
        onPurchase.textContent = `Opens Westport Strait immediately. The coal trader can use the shortcut ${shortcut}.`;
        const factoryTiming = model.factoryFueled === undefined ? '' : ' The Factory can use it the following round.';
        payoff.textContent = `Coal enters your reserves when the trader unloads at ${model.westName}.${factoryTiming}`;
        passage.details.append(reviewDetails);
      } else if (reviewed?.choice === 'Harbor') {
        onPurchase.textContent = `Completes the queued Harbor in ${model.northName} immediately.`;
        payoff.textContent = 'Food and net gold start accruing next round.';
        harbor.details.append(reviewDetails);
      }
      if (reviewed) fundsLeft.textContent = `${model.freeGold - reviewed.cost} spendable gold left`;
    }

    function review(offer: CapitalOffer | undefined): void {
      if (!offer) return;
      reviewed = offer;
      status.textContent = '';
      confirm.textContent = `Confirm ${offer.choice}`;
      paint();
      (offer.choice === 'passage' ? passage.title : harbor.title).focus();
    }

    reviewPassage.addEventListener('click', () => review(comparison()?.passage));
    reviewHarbor.addEventListener('click', () => review(comparison()?.harbor));
    defer.addEventListener('click', () => modal.remove());
    back.addEventListener('click', () => {
      const previousButton = reviewed?.choice === 'passage' ? reviewPassage : reviewHarbor;
      reviewed = undefined;
      status.textContent = '';
      paint();
      previousButton.focus();
    });
    confirm.addEventListener('click', () => {
      if (!reviewed) return;
      const result = applyCapitalOffer(session.getState(), viewer, reviewed, bus);
      reviewed = undefined;
      status.textContent = result.ok ? 'Saving investment…' : result.message;
      if (result.ok) {
        session.commit(result.state);
        void autoSave(result.state).then(
          () => { if (modal.isConnected) status.textContent = 'Investment confirmed.'; },
          () => { if (modal.isConnected) status.textContent = 'Investment applied. Save failed.'; },
        );
      }
      paint();
      defer.focus();
    });
    actions.append(back, confirm, defer);
    footer.append(status, actions);
    card.append(header, options, harborStatus, stock, footer);
    modal.append(card);
    markModal(modal, { cancel: defer, initialFocus: defer });
    paint();
    layer.append(modal);
  });
}
