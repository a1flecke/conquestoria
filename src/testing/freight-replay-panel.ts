import type { GameSession } from '@/app/ports';
import type { EventBus } from '@/core/event-bus';
import { autoSave, listSaves, loadGame } from '@/storage/save-manager';
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

export async function resumeFreightReplay(scenarioName: string, baseline: ScenarioState): Promise<ScenarioState> {
  // Both maps share a seed. Give each map a stable autosave group so the latest
  // save for a different map or campaign cannot hide its progress.
  const prefix = 'dev-freight-replay-';
  const playthroughId = `${prefix}${scenarioName}`;
  const autosaves = (await listSaves({ includeAutoSave: true })).filter(save => save.kind === 'autosave');
  const ownSave = autosaves.find(save => save.gameId === playthroughId);
  const resumed = ownSave && await loadGame(ownSave.id);
  if (resumed) return resumed;

  // Preserve progress from before these replays had dedicated autosave groups.
  for (const save of autosaves) {
    if (save.gameTitle !== baseline.gameTitle || save.gameId?.startsWith(prefix)) continue;
    const candidate = await loadGame(save.id);
    if (candidate && matchesLegacyFreightReplay(candidate, baseline)) return { ...candidate, playthroughId };
  }
  return { ...baseline, playthroughId };
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
    const modal = document.createElement('div');
    panel = modal;
    modal.id = 'freight-investment-dialog';
    modal.style.cssText = 'position:absolute;inset:0;z-index:45;display:grid;place-items:center;background:#080d16c9;padding:12px;overflow:auto;';
    const card = document.createElement('section');
    card.style.cssText = 'width:min(100%, 520px);box-sizing:border-box;max-height:100%;overflow:auto;padding:18px;background:#172130;color:#f5f1e8;border:1px solid #a28a55;border-radius:12px;';
    const title = document.createElement('h2');
    title.textContent = 'Freight investment';
    title.style.margin = '0';
    const budget = document.createElement('p');
    const route = document.createElement('p');
    const harbor = document.createElement('p');
    const stock = document.createElement('p');
    const status = document.createElement('p');
    status.setAttribute('role', 'status');

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
    const reviewPassage = createGameButton('Review passage', 'secondary');
    const reviewHarbor = createGameButton('Review Harbor', 'secondary');
    const defer = createGameButton('Defer', 'secondary');
    const confirm = createGameButton('Confirm', 'primary');
    const back = createGameButton('Back', 'secondary');
    let reviewed: CapitalOffer | undefined;
    function paint(): void {
      const model = comparison();
      if (!model) {
        modal.remove();
        return;
      }
      budget.textContent = `${model.freeGold} gold available · ${model.protectedGold} gold protected. The Expedition is already paid for.`;
      const estimate = model.currentRounds === undefined
        ? 'No known working route estimate.'
        : `Estimated coal round trip: ${model.currentRounds} rounds${model.openRounds === undefined ? '' : ` now, ${model.openRounds} rounds with the passage`}.`;
      if (!model.passageKnown) {
        route.textContent = 'No surveyed passage.';
      } else {
        const passage = model.passageOpened ? 'Passage opened.' : `Westport Strait passage · ${FREIGHT_REPLAY.passageCost} gold.`;
        route.textContent = `${passage} ${estimate}`;
      }
      const yields = BUILDINGS.harbor.yields;
      harbor.textContent = model.harborBuilt ? `Harbor completed in ${model.northName}.`
        : `Harbor in ${model.northName}${model.harborCost === undefined ? '' : ` · ${model.harborCost} gold`} · +${yields.gold} gold and +${yields.food} food per round when completed.`;
      const fuel = model.factoryFueled === undefined ? '' : model.factoryFueled
        ? ' Factory fueled this round.' : ' Factory is waiting for fuel.';
      stock.textContent = `${model.westName} has ${model.coal} imported coal in reserve.${fuel}`;
      setButtonDisabled(reviewPassage, !model.passage);
      setButtonDisabled(reviewHarbor, !model.harbor);
      confirm.hidden = !reviewed;
      back.hidden = !reviewed;
      reviewPassage.hidden = Boolean(reviewed);
      reviewHarbor.hidden = Boolean(reviewed);
      defer.textContent = model.passageOpened || model.harborBuilt ? 'Close' : 'Defer';
    }

    function review(offer: CapitalOffer | undefined): void {
      if (!offer) return;
      reviewed = offer;
      status.textContent = `Spend ${offer.cost} gold on the ${offer.choice}?`;
      confirm.textContent = `Confirm ${offer.choice}`;
      paint();
      back.focus();
    }

    reviewPassage.addEventListener('click', () => review(comparison()?.passage));
    reviewHarbor.addEventListener('click', () => review(comparison()?.harbor));
    defer.addEventListener('click', () => modal.remove());
    back.addEventListener('click', () => {
      reviewed = undefined;
      status.textContent = '';
      paint();
      defer.focus();
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
    actions.append(reviewPassage, reviewHarbor, confirm, back, defer);
    card.append(title, budget, route, harbor, stock, status, actions);
    modal.append(card);
    markModal(modal, { cancel: defer, initialFocus: defer });
    paint();
    layer.append(modal);
  });
}
