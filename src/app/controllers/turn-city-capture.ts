/**
 * City-capture choice resolution (#1243), split out of `turn-flow-controller.ts`: occupy / raze after a
 * player assault. Body verbatim.
 */
import type { CivBonusEffect } from '@/core/types';
import { finalizePlayerCityAssaultChoice } from '@/input/city-assault-flow';
import { emitMajorCityCaptureEvents } from '@/systems/city-capture-system';
import type { TurnFlowController, TurnFlowControllerDeps } from './turn-flow-shared';

export interface TurnCityCapture {
  finalizePendingCityCaptureChoice: TurnFlowController['finalizePendingCityCaptureChoice'];
}

export function createTurnCityCapture(deps: TurnFlowControllerDeps): TurnCityCapture {
  const { session, selection, bus } = deps;

  function finalizePendingCityCaptureChoice(
    disposition: 'occupy' | 'raze',
    attackerBonus?: CivBonusEffect,
  ): void {
    const captureIntent = selection.getPendingIntent();
    if (captureIntent.kind !== 'city-capture') return;

    const pending = captureIntent.choice;
    const cityBeforeResolution = session.getState().cities[pending.cityId];
    const previousOwner = cityBeforeResolution?.owner ?? '';
    const cityName = cityBeforeResolution?.name ?? pending.cityId;
    const beforeCapture = session.getState();
    const result = finalizePlayerCityAssaultChoice(session.getState(), pending, disposition, session.getState().turn, bus);

    selection.setPendingIntent({ kind: 'none' });
    deps.getElementById('city-capture-panel')?.remove();
    session.batch(() => {
      session.commit(result.state);
      deps.refreshVictoryProgressPanel();
      emitMajorCityCaptureEvents(
        beforeCapture,
        result,
        pending.cityId,
        session.getState().currentPlayer,
        previousOwner,
        bus,
      );

      if (result.outcome === 'occupied') {
        const capturingCiv = deps.currentCiv();
        if (capturingCiv && attackerBonus?.type === 'naval_raiding') {
          // #1199: the spoils are a committed transition, not a mutation of the live
          // civ object the assault already committed.
          session.update(state => ({
            ...state,
            civilizations: {
              ...state.civilizations,
              [capturingCiv.id]: {
                ...state.civilizations[capturingCiv.id],
                gold: state.civilizations[capturingCiv.id].gold + 30,
              },
            },
          }));
          deps.showNotification('Viking raid spoils! +30 gold', 'success');
        }
        deps.showNotification(`We have captured ${cityName}!`, 'success');
      } else {
        deps.showNotification(`${cityName} was razed! +${result.goldAwarded} gold`, 'success');
      }
    });
    setTimeout(() => deps.selectNextUnit(), 400);
  }

  return { finalizePendingCityCaptureChoice };
}
