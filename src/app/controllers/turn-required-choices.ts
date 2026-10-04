/**
 * Required-choice surfaces (#1243), split out of `turn-flow-controller.ts`: the idle-city / research
 * chooser and the religion-boon gate that block ending a turn. Bodies verbatim.
 */
import { closePlanningPanels, createRequiredChoicePanel } from '@/ui/required-choice-panel';
import { createReligionBoonModal } from '@/ui/religion-boon-modal';
import { chooseBoon } from '@/systems/religion-system';
import { getIdleCityIds, getRecommendedIdleCityChoice, needsResearchChoice, enqueueResearch, enqueueCityProduction, ENQUEUE_DENIAL_MESSAGES } from '@/systems/planning-system';
import { calculateCivResearchOutput } from '@/systems/research-output-system';
import { getAvailableTechs, getEffectiveTechCost } from '@/systems/tech-system';
import { estimateTurnsToComplete } from '@/systems/pacing-model';
import type { TurnFlowController, TurnFlowControllerDeps } from './turn-flow-shared';

export interface TurnRequiredChoices {
  closeRequiredChoicePanel: TurnFlowController['closeRequiredChoicePanel'];
  showReligionBoonIfNeeded: TurnFlowController['showReligionBoonIfNeeded'];
  refreshRequiredChoicesAfterAction: TurnFlowController['refreshRequiredChoicesAfterAction'];
  showRequiredChoicesIfNeeded: TurnFlowController['showRequiredChoicesIfNeeded'];
}

export function createTurnRequiredChoices(deps: TurnFlowControllerDeps): TurnRequiredChoices {
  const { session, uiLayer, router } = deps;

  function closeRequiredChoicePanel(): void {
    deps.getElementById('required-choice-panel')?.remove();
    deps.setBlockingOverlay(null);
  }

  // #591 MR4: a founded-but-boonless religion has NO effects until the owner chooses --
  // re-prompted every time the owner attempts to end their turn, same blocking pattern as
  // showRequiredChoicesIfNeeded (the only other "must decide before proceeding" surface
  // in this file), so a human owner can never leave their own religion pending forever.
  function showReligionBoonIfNeeded(): boolean {
    const civId = session.getState().currentPlayer;
    const civ = session.getState().civilizations[civId];
    if (!civ?.isHuman) return false;
    const ownReligion = Object.values(session.getState().religions ?? {}).find(r => r.ownerCivId === civId);
    if (!ownReligion || ownReligion.boon !== undefined) {
      deps.getElementById('religion-boon-modal')?.remove();
      return false;
    }
    if (deps.getElementById('religion-boon-modal')) return true;

    closePlanningPanels(document);
    deps.setBlockingOverlay('religion-boon');
    createReligionBoonModal(uiLayer, {
      religionName: ownReligion.name,
      onChooseBoon: (boon) => {
        session.commit(chooseBoon(session.getState(), ownReligion.id, boon));
        deps.getElementById('religion-boon-modal')?.remove();
        deps.setBlockingOverlay(null);
        deps.showNotification(`${ownReligion.name} now grants ${boon}.`, 'success');
      },
    });
    return true;
  }

  function refreshRequiredChoicesAfterAction(): void {
    deps.getElementById('required-choice-panel')?.remove();
    closePlanningPanels(document);
    // #1199: the action's mutation was already committed, so the session
    // subscription published it; re-pushing renderer/HUD here was redundant.
    // #787 phase 12 (#794): release 'required-choice' before
    // showRequiredChoicesIfNeeded() may push it again for the next
    // outstanding choice. With 2+ idle cities (or an idle city plus missing
    // research), a player resolving them one at a time re-enters this
    // function once per choice -- under the old single-slot overlay each
    // re-push was a harmless overwrite of the same id, but the
    // reference-counted overlay nests them, and only the *last* choice's
    // resolution ever pops (via closeRequiredChoicePanel below). Without
    // this explicit release, resolving N required choices in one sitting
    // leaves N-1 phantom pushes on the stack, permanently blocking
    // interaction for the rest of the game.
    deps.setBlockingOverlay(null);
    showRequiredChoicesIfNeeded();
  }

  function showRequiredChoicesIfNeeded(): boolean {
    const civId = session.getState().currentPlayer;
    const idleCityIds = getIdleCityIds(session.getState(), civId);
    const missingResearch = needsResearchChoice(session.getState(), civId);
    const existing = deps.getElementById('required-choice-panel');

    if (!idleCityIds.length && !missingResearch) {
      closeRequiredChoicePanel();
      return false;
    }

    if (existing) {
      return true;
    }

    closePlanningPanels(document);

    const civ = deps.currentCiv();
    const sciencePerTurn = Math.max(1, calculateCivResearchOutput(session.getState(), civId).finalScience);
    const researchChoices = missingResearch
      ? getAvailableTechs(civ.techState).slice(0, 3).map(tech => ({
        techId: tech.id,
        label: tech.name,
        turns: estimateTurnsToComplete({ cost: getEffectiveTechCost(tech, civ.techState.completed), outputPerTurn: sciencePerTurn }),
      }))
      : [];

    const cityChoices = idleCityIds
      .map(cityId => {
        const city = session.getState().cities[cityId];
        const choice = getRecommendedIdleCityChoice(session.getState(), civId, cityId);
        if (!city || !choice) {
          return null;
        }
        return {
          cityId,
          cityName: city.name,
          itemId: choice.itemId,
          label: choice.label,
          turns: choice.turns,
        };
      })
      .filter((choice): choice is NonNullable<typeof choice> => choice !== null);

    deps.setBlockingOverlay('required-choice');
    createRequiredChoicePanel(uiLayer, {
      researchChoices,
      cityChoices,
      onChooseResearch: (techId) => {
        const civ = deps.currentCiv();
        session.commit({
          ...session.getState(),
          civilizations: {
            ...session.getState().civilizations,
            [session.getState().currentPlayer]: { ...civ, techState: enqueueResearch(civ.techState, techId) },
          },
        });
        deps.showNotification(`Researching ${techId}...`, 'info');
        refreshRequiredChoicesAfterAction();
      },
      onChooseCityBuild: (cityId, itemId) => {
        const city = session.getState().cities[cityId];
        if (!city) return;
        const result = enqueueCityProduction(session.getState(), cityId, itemId);
        if (!result.ok) {
          deps.showNotification(`${city.name}: ${ENQUEUE_DENIAL_MESSAGES[result.reason]}`, 'warning');
          refreshRequiredChoicesAfterAction();
          return;
        }
        session.commit(result.state);
        deps.showNotification(`${city.name}: queued ${itemId}`, 'info');
        refreshRequiredChoicesAfterAction();
      },
      onOpenTech: () => {
        closeRequiredChoicePanel();
        router.open('tech');
      },
      onOpenCity: (cityId) => {
        const city = session.getState().cities[cityId];
        if (!city) return;
        closeRequiredChoicePanel();
        deps.openCityPanelForCity(city);
      },
    });
    return true;
  }

  return { closeRequiredChoicePanel, showReligionBoonIfNeeded, refreshRequiredChoicesAfterAction, showRequiredChoicesIfNeeded };
}
