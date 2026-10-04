/**
 * Transport and pirate-assault commands: load / unload, cargo board, pirate headquarters assault (#1243), split out of `selection-unit-commands.ts`.
 * Callbacks are moved verbatim; each reaches selection through the `SelectionCore` handle.
 */
import type { Unit } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { SFX } from '@/audio/sfx';
import { getUnitCargoSize, getTransportCargoUsed, getTransportCapacity, canLoadUnitOntoTransport, getTransportCargo, getUnloadDestinations, loadUnitOntoTransport, unloadUnitFromTransport } from '@/systems/transport-system';
import { findAvailablePirateHeadquartersAssault } from '@/input/pirate-headquarters-assault';
import { getPirateWatersPresentation } from '@/systems/pirate-presentation';
import type { SelectionCommonDeps, SelectionCore, SelectedUnitCommands, SelectionCommandArgs } from './selection-shared';

export function createTransportCommands(
  deps: SelectionCommonDeps,
  core: SelectionCore,
  args: SelectionCommandArgs,
): Pick<SelectedUnitCommands, 'getTransportOptions' | 'getCargoBoardInfo' | 'onSelectCargoToUnload' | 'onCancelUnload' | 'getPirateAssaultAction' | 'onOpenPirateAssault' | 'onLoadTransport' | 'onUnloadTransport' | 'pendingUnloadUnitName'> {
  const { session, selection, renderLoop } = deps;
  const { pendingUnloadUnitName } = args;

  return {
    getTransportOptions: uid => {
      const selectedUnit = session.getState().units[uid];
      const needs = selectedUnit ? getUnitCargoSize(selectedUnit) : 1;
      return Object.values(session.getState().units)
        .filter(candidate => {
          const def = UNIT_DEFINITIONS[candidate.type];
          return (def?.domain ?? 'land') === 'naval' && def?.cargoCapacity !== undefined
            && candidate.owner === session.getState().currentPlayer;
        })
        .map(candidate => {
          const used  = getTransportCargoUsed(session.getState(), candidate.id);
          const cap   = getTransportCapacity(candidate);
          const free  = cap - used;
          const fits  = needs <= free;
          const suffix = !fits
            ? ` — needs ${needs} slots, ${free} remaining`
            : free - needs === 0
              ? ' — last slot'
              : ` — ${free} of ${cap} slots free`;
          return {
            transportId: candidate.id,
            label: `Load onto ${UNIT_DEFINITIONS[candidate.type]?.name ?? 'Transport'}${suffix}`,
            disabled: !fits,
            tooltip: !fits
              ? `${UNIT_DEFINITIONS[selectedUnit?.type ?? 'warrior']?.name ?? 'This unit'} requires ${needs} cargo slots. A Galleon or larger transport is needed.`
              : undefined,
          };
        })
        .filter(o => canLoadUnitOntoTransport(session.getState(), uid, o.transportId).ok || o.disabled);
    },
    getCargoBoardInfo: transportId => getTransportCargo(session.getState(), transportId).map(cargoUnit => ({
      cargoUnitId: cargoUnit.id,
      label: UNIT_DEFINITIONS[cargoUnit.type]?.name ?? cargoUnit.type,
      slotCost: getUnitCargoSize(cargoUnit),
      canUnload: !cargoUnit.hasActed && cargoUnit.movementPointsLeft > 0,
    })),
    onSelectCargoToUnload: (transportId, cargoUnitId) => {
      const range = getUnloadDestinations(session.getState(), transportId, cargoUnitId);
      selection.setPendingIntent({ kind: 'unload', transportId, cargoUnitId, range });
      renderLoop.setHighlights(range.map(coord => ({ coord, type: 'move' as const })));
      const cargoUnit = session.getState().units[cargoUnitId];
      const unitName = UNIT_DEFINITIONS[cargoUnit?.type ?? 'warrior']?.name ?? 'Unit';
      core.selectUnit(transportId, { pendingUnloadUnitName: unitName });
    },
    onCancelUnload: () => {
      deps.clearUnloadState();
      renderLoop.clearHighlights();
      const currentlySelected = selection.getSelectedUnitId();
      if (currentlySelected) core.selectUnit(currentlySelected);
    },
    pendingUnloadUnitName,
    getPirateAssaultAction: uid => {
      const pending = findAvailablePirateHeadquartersAssault(session.getState(), session.getState().currentPlayer, uid);
      if (!pending) return null;
      const faction = getPirateWatersPresentation(session.getState(), session.getState().currentPlayer).factions
        .find(entry => entry.factionId === pending.factionId);
      return { factionId: pending.factionId, label: `Assault ${faction?.name ?? 'pirate'} enclave` };
    },
    onOpenPirateAssault: (factionId, uid) => deps.openPirateHeadquartersAssault(factionId, uid),
    onLoadTransport: (uid, transportId) => {
      const prevPos = session.getState().units[uid]?.position;
      const result = loadUnitOntoTransport(session.getState(), uid, transportId);
      if (!result.ok) {
        deps.showNotification(result.message, 'warning');
        SFX.error();
        return;
      }
      session.commit(result.state);
      // Boarding animation: slide cargo unit to transport hex before it disappears
      const transportUnit = session.getState().units[transportId];
      if (prevPos && transportUnit) {
        renderLoop.animateUnitSlide(
          { ...result.state.units[uid] ?? { id: uid } as Unit, position: prevPos },
          transportUnit.position,
        );
      }
      core.selectUnit(transportId);
      const tName = UNIT_DEFINITIONS[session.getState().units[transportId]?.type ?? 'transport']?.name ?? 'Transport';
      deps.showNotification(`Unit loaded onto ${tName}.`, 'info');
      SFX.transportLoad();
    },
    onUnloadTransport: (transportId, cargoUnitId, destination) => {
      const result = unloadUnitFromTransport(session.getState(), transportId, cargoUnitId, destination);
      if (!result.ok) {
        deps.showNotification(result.message, 'warning');
        SFX.error();
        return;
      }
      const tName = UNIT_DEFINITIONS[session.getState().units[transportId]?.type ?? 'transport']?.name ?? 'Transport';
      const cName = UNIT_DEFINITIONS[session.getState().units[cargoUnitId]?.type ?? 'warrior']?.name ?? 'Unit';
      deps.clearUnloadState();
      session.commit(result.state);
      renderLoop.animateUnitAppear(destination);
      // Stay on the transport so the player can unload remaining cargo
      core.selectUnit(transportId);
      deps.showNotification(`${cName} disembarked from ${tName}.`, 'info');
      SFX.transportUnload();
    },
  };
}
