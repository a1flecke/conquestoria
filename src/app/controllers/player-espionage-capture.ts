/**
 * Espionage capture choice dialog (#1243), split out of `player-action-controller.ts`:
 * expel / execute / interrogate a captured spy. Body verbatim.
 */
import { createUnit } from '@/systems/unit-lifecycle';
import { modifyRelationship, recordSpyCaught } from '@/systems/diplomacy-state';
import { getSpyCaptureRelationshipPenalty, expelSpy, executeSpy, startInterrogation } from '@/systems/espionage-system';
import { getCapitalCity } from '@/systems/capital-system';
import type { PlayerActionController, PlayerActionControllerDeps } from './player-action-shared';

export interface PlayerEspionageCapture {
  showEspionageCaptureChoice: PlayerActionController['showEspionageCaptureChoice'];
}

export function createPlayerEspionageCapture(deps: PlayerActionControllerDeps): PlayerEspionageCapture {
  function showEspionageCaptureChoice(spyId: string, spyOwner: string): void {
    const captorEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
    const spy = deps.session.getState().espionage?.[spyOwner]?.spies[spyId];
    if (!captorEsp || !spy) return;
    const spyOwnerName = deps.session.getState().civilizations[spyOwner]?.name ?? spyOwner;

    // D1: always reveal true identity to captor regardless of disguise
    const captureMessage = `You have captured ${spy.name}, a ${spy.unitType} belonging to ${spyOwnerName}.`;

    // infiltrated spies are inside the city (distance 0); otherwise use boundary penalty
    const distanceToCity = spy.infiltrationCityId ? 0 : 1;
    const relPenalty = getSpyCaptureRelationshipPenalty(distanceToCity);

    deps.notifier.choice(captureMessage, [
      {
        label: `Expel (${relPenalty} relations)`,
        onClick: () => {
          // Three writes, one publication (#1015).
          deps.session.batch(() => {
            const updatedOwnerEsp = expelSpy(deps.session.getState().espionage![spyOwner], spyId, 15);
            const capital = getCapitalCity(deps.session.getState(), spyOwner);
            if (capital) {
              const newUnit = createUnit(spy.unitType, spyOwner, capital.position, deps.session.getState().idCounters);
              deps.session.commit({
                ...deps.session.getState(),
                units: { ...deps.session.getState().units, [newUnit.id]: newUnit },
                civilizations: {
                  ...deps.session.getState().civilizations,
                  [spyOwner]: {
                    ...deps.session.getState().civilizations[spyOwner],
                    units: [...deps.session.getState().civilizations[spyOwner].units, newUnit.id],
                  },
                },
              });
              const { [spyId]: _old, ...rest } = updatedOwnerEsp.spies;
              deps.session.commit({
                ...deps.session.getState(),
                espionage: {
                  ...deps.session.getState().espionage,
                  [spyOwner]: {
                    ...updatedOwnerEsp,
                    spies: { ...rest, [newUnit.id]: { ...updatedOwnerEsp.spies[spyId]!, id: newUnit.id } },
                  },
                },
              });
            } else {
              deps.session.commit({ ...deps.session.getState(), espionage: { ...deps.session.getState().espionage, [spyOwner]: updatedOwnerEsp } });
            }
            // Bilateral: captor's view of spy owner AND spy owner's view of captor
            const captorId = deps.session.getState().currentPlayer;
            const expelTurn = deps.session.getState().turn;
            deps.session.commit({
              ...deps.session.getState(),
              civilizations: {
                ...deps.session.getState().civilizations,
                [captorId]: {
                  ...deps.session.getState().civilizations[captorId],
                  diplomacy: recordSpyCaught(modifyRelationship(
                    deps.session.getState().civilizations[captorId].diplomacy, spyOwner, relPenalty,
                  ), spyOwner, expelTurn),
                },
                [spyOwner]: {
                  ...deps.session.getState().civilizations[spyOwner],
                  diplomacy: recordSpyCaught(modifyRelationship(
                    deps.session.getState().civilizations[spyOwner].diplomacy, captorId, relPenalty,
                  ), captorId, expelTurn),
                },
              },
            });
            deps.showNotification(`${spy.name} expelled. Will return to their capital after 15 turns.`, 'info');
          });
        },
      },
      {
        label: 'Execute',
        danger: true,
        onClick: () => {
          // Second in-panel confirmation -- no window.confirm on mobile
          deps.notifier.choice(
            `Execute ${spy.name}? This cannot be undone and will severely damage relations with ${spyOwnerName}.`,
            [
              {
                label: 'Cancel',
                onClick: () => showEspionageCaptureChoice(spyId, spyOwner),
              },
              {
                label: 'Confirm Execute',
                danger: true,
                onClick: () => {
                  const captorId = deps.session.getState().currentPlayer;
                  const executeTurn = deps.session.getState().turn;
                  deps.session.commit({
                    ...deps.session.getState(),
                    espionage: {
                      ...deps.session.getState().espionage,
                      [spyOwner]: executeSpy(deps.session.getState().espionage![spyOwner], spyId),
                    },
                    // Bilateral: captor's view AND spy owner's view
                    civilizations: {
                      ...deps.session.getState().civilizations,
                      [captorId]: {
                        ...deps.session.getState().civilizations[captorId],
                        diplomacy: recordSpyCaught(modifyRelationship(
                          deps.session.getState().civilizations[captorId].diplomacy, spyOwner, relPenalty * 2,
                        ), spyOwner, executeTurn),
                      },
                      [spyOwner]: {
                        ...deps.session.getState().civilizations[spyOwner],
                        diplomacy: recordSpyCaught(modifyRelationship(
                          deps.session.getState().civilizations[spyOwner].diplomacy, captorId, relPenalty * 2,
                        ), captorId, executeTurn),
                      },
                    },
                  });
                  deps.bus.emit('espionage:spy-executed', {
                    executingCivId: captorId, spyOwner, spyId, spyName: spy.name,
                  });
                  deps.showNotification(`${spy.name} has been executed.`, 'warning');
                },
              },
            ],
          );
        },
      },
      {
        label: 'Interrogate (4 turns)',
        onClick: () => {
          const ownerEsp = deps.session.getState().espionage![spyOwner];
          deps.session.commit({
            ...deps.session.getState(),
            espionage: {
              ...deps.session.getState().espionage,
              [deps.session.getState().currentPlayer]: startInterrogation(captorEsp, spyId, spyOwner),
              // Set spy status to 'interrogated' on the spy owner's record
              [spyOwner]: {
                ...ownerEsp,
                spies: {
                  ...ownerEsp.spies,
                  [spyId]: { ...ownerEsp.spies[spyId]!, status: 'interrogated' as const },
                },
              },
            },
          });
          deps.showNotification(`${spy.name} is being interrogated. Check the Intel panel for results.`, 'info');
        },
      },
    ]);
  }

  return { showEspionageCaptureChoice };
}
