/**
 * Shared vocabulary for the use-case split of `selection-controller.ts` (#1243).
 *
 * The one selection controller is split into:
 *   - `selection-unit-commands.ts`  — the `renderSelectedUnitInfo` callback set
 *     (unit actions: air missions, transport, espionage, outpost, worker,
 *     pillage, fortify, upgrade, …)
 *   - `selection-automation.ts`     — auto-explore / journey / context menu
 *   - `selection-visibility.ts`     — `refreshCurrentPlayerVisibility`
 *   - `selection-controller.ts`     — selection core + thin composite
 *
 * `SelectionCommonDeps` and `SelectionCoreDeps` are the shared ports. The unit
 * command set and the automation/visibility slices reach the selection core
 * through `SelectionCore`, so no slice imports a peer module.
 */
import type { RenderLoop } from '@/renderer/render-loop';
import type { EventBus } from '@/core/event-bus';
import type { HexCoord, UnitType, WorkerActionType, Civilization } from '@/core/types';
import type { GameSession, SelectionStore } from '@/app/ports';
import type { PanelHost } from '@/app/panel-host';
import type { AdvisorSystem } from '@/ui/advisor-system';
import type { CeremonyCoordinator } from '@/app/controllers/ceremony-coordinator';
import type { UnitTurnFlow } from '@/ui/unit-turn-flow';
import type { ExecuteUnitMoveResult } from '@/systems/unit-movement-system';

/** The narrow slice of `RenderLoop` the selection family needs. */
export type SelectionControllerRenderer = Pick<
  RenderLoop,
  | 'hasMovingUnit'
  | 'setSelectedUnitId'
  | 'setHighlights'
  | 'clearHighlights'
  | 'setJourneyPath'
  | 'setGameState'
  | 'animateUnitMove'
  | 'animateUnitSlide'
  | 'animateUnitAppear'
  | 'setStrategicLaunchPreview'
> & {
  readonly camera: Pick<RenderLoop['camera'], 'centerOn'>;
};

/** Ports shared by every selection slice contract. */
export interface SelectionCommonDeps {
  readonly session: GameSession;
  readonly selection: SelectionStore;
  readonly renderLoop: SelectionControllerRenderer;
  /**
   * The concrete class, not a narrowed `Pick<EventBus, 'emit'>` -- two
   * downstream calls (`applyAutoExploreOrder`, `fireResourceDiscoveredTip`)
   * are typed to require the real `EventBus`, and `EventBus` has a private
   * field, so no object literal can structurally satisfy it. Narrowing here
   * would only move the impedance mismatch into an `as EventBus` cast at
   * each call site instead of removing it.
   */
  readonly bus: EventBus;
  readonly uiLayer: HTMLElement;
  readonly host: PanelHost;
  readonly ceremonies: CeremonyCoordinator;
  /** Substitutes for `document.getElementById('info-panel')` — see file docblock. */
  readonly getInfoPanel: () => HTMLElement | null;
  readonly showNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
  readonly updateHUD: () => void;
  readonly clearUnloadState: () => void;
  readonly getUnitTurnFlow: () => UnitTurnFlow;
  readonly foundCityAction: () => void;
  readonly performWorkerAction: (action: WorkerActionType) => void;
  readonly performPreach: (unitId: string, cityId: string) => void;
  readonly restAction: () => void;
  readonly openNetworkIntentPanel: (unitId: string) => void;
  readonly openUnitStackPicker: (coord: HexCoord, unitIds: string[]) => void;
  readonly openPirateHeadquartersAssault: (factionId: string, unitId: string) => void;
  /** #887 Phase B: opens the Great General Hall of Fame (via panelActions).
   * Optional so existing deps fixtures compile unchanged; the composition root
   * always provides it, and selected-unit-info only renders the link when set. */
  readonly openHallOfFame?: () => void;
  readonly handleEstablishRoute: (caravanId: string) => void;
  readonly executeUpgrade: (unitId: string, targetType: UnitType) => boolean;
  readonly ensurePlayerWarState: (targetCivId: string) => void;
  readonly scanBeastSightings: () => void;
  readonly scanSubmarineSightings: () => void;
  readonly currentCiv: () => Civilization;
  /**
   * #544 MR2: `resetMessage`/`check` together are this codebase's existing
   * "show this advisor tip again on demand" idiom (already used by
   * `village:visited` outcomes via `ctx.resetAdvisorMessage`) -- reused here
   * rather than adding a bespoke reopen method.
   */
  readonly advisorSystem: Pick<AdvisorSystem, 'resetMessage' | 'check'>;
}

/**
 * The selection core's own operations that the unit-command / automation /
 * visibility slices call back into. Supplied by the composite so no slice
 * imports a peer.
 */
export interface SelectionCore {
  selectUnit(unitId: string, opts?: { pendingUnloadUnitName?: string; suppressSelectionSfx?: boolean }): void;
  deselectUnit(): void;
  startAutoExplore(unitId: string): void;
  cancelAutoExplore(unitId: string): void;
  cancelJourney(unitId: string): void;
  selectNextUnit(): void;
  isUnitAnimationLocked(unitId: string | null): boolean;
  animateMovedUnit(unitId: string, path: HexCoord[]): void;
  executeAnimatedUnitMove(unitId: string, move: () => ExecuteUnitMoveResult): ExecuteUnitMoveResult;
  refreshSelectedUnitAfterCombat(): void;
  openUnitContextMenu(unitId: string): void;
  refreshCurrentPlayerVisibility(): void;
}
