/**
 * Unit-command callbacks (#1243), split out of `selection-controller.ts`.
 *
 * This is the `renderSelectedUnitInfo` callback set `selectUnit` wires: the
 * unit's own actions (air missions, transport load/unload, espionage
 * disguise/infiltration/embed, outpost establishment, worker actions,
 * pillage, fortify, upgrade, rally/seize, strategic launch) plus the panel's
 * cross-links (stack picker, pirate assault, network intent, hall of fame).
 *
 * The callbacks are extracted verbatim — this is a behaviour-preserving move.
 * They reach selection through the `SelectionCore` handle, so this module never
 * imports the selection core.
 *
 * #1243: the callbacks are grouped into `selection-commands-{general,air,transport,espionage,unit-actions}.ts`.
 * Each returns a `Pick` of the callback bag, so a callback missing from the spread below is a compile error.
 */
import { renderSelectedUnitInfo } from '@/ui/selected-unit-info';
import type { buildSelectedUnitHighlights } from '@/input/selected-unit-highlights';
import { createGeneralCommands } from './selection-commands-general';
import { createAirCommands } from './selection-commands-air';
import { createTransportCommands } from './selection-commands-transport';
import { createEspionageCommands } from './selection-commands-espionage';
import { createUnitActionCommands } from './selection-commands-unit-actions';
import type { SelectionCommonDeps, SelectionCore } from './selection-shared';

export interface RenderSelectedUnitInfoArgs {
  panel: HTMLElement;
  unitId: string;
  pendingUnloadUnitName?: string;
  highlightResult: ReturnType<typeof buildSelectedUnitHighlights>;
  pendingIntent: ReturnType<SelectionCommonDeps['selection']['getPendingIntent']>;
}

/** Renders the info panel for `unit`, wiring the unit-command callbacks. */
export function renderUnitInfoWithCommands(
  deps: SelectionCommonDeps,
  core: SelectionCore,
  args: RenderSelectedUnitInfoArgs,
): void {
  const { session } = deps;
  const { panel, unitId, pendingUnloadUnitName, highlightResult, pendingIntent } = args;

  const commandArgs = { unitId, pendingUnloadUnitName };
  renderSelectedUnitInfo(panel, session.getState(), unitId, {
    ...createGeneralCommands(deps, core, commandArgs),
    ...createAirCommands(deps, core, commandArgs),
    ...createTransportCommands(deps, core, commandArgs),
    ...createEspionageCommands(deps, core, commandArgs),
    ...createUnitActionCommands(deps, core, commandArgs),
  }, {
    waterRecovery: highlightResult.waterRecovery,
    hasZoneOfControlWarning: highlightResult.zocLimitedRange.length > 0,
    airMissionPending: pendingIntent.kind === 'air-mission' && pendingIntent.unitId === unitId ? pendingIntent.mission : undefined,
    paradropPending: pendingIntent.kind === 'paradrop' && pendingIntent.unitId === unitId,
    airAssaultPending: pendingIntent.kind === 'air-assault' && pendingIntent.unitId === unitId,
  });
}

