/**
 * Shared vocabulary for the use-case split of the former monolithic
 * `panel-actions-controller.ts` (#1242).
 *
 * The one `PanelActionsController` used to own every panel opener plus the
 * callbacks behind it. It is now four use-case controllers
 * (`city-panel-actions`, `knowledge-panel-actions`,
 * `diplomacy-trade-panel-actions`, `world-threat-panel-actions`) that share
 * these ports. `panel-actions-controller.ts` is the thin composite that builds
 * them and re-exposes the unchanged public interface.
 *
 * `PanelActionsCommonDeps` is the slice every group needs; each group's own
 * factory takes that plus a small `PanelActionsCrossCalls` handle for the few
 * openers that legitimately cross use cases (a City overview opens the City
 * panel; a Council card opens Wonder/Diplomacy; a notification opens a City or
 * the Pirate waters). Cross-calls go through this indirection rather than one
 * group importing another, so construction order stays linear and no group
 * depends on a peer's concrete module.
 */
import type { RenderLoop } from '@/renderer/render-loop';
import type { AudioSystem } from '@/audio/audio-system';
import type { EventBus } from '@/core/event-bus';
import type { GameSession, SelectionStore } from '@/app/ports';
import type { HudController } from '@/app/controllers/hud-controller';
import type { SelectionController } from '@/app/controllers/selection-controller';
import type { DiplomacyActionsController } from '@/app/controllers/diplomacy-actions-controller';
import type { PanelRouter } from '@/app/panel-router';
import type { City, CivDefinition, Civilization, UnitType } from '@/core/types';
import type { NotificationEntry } from '@/core/notification-log';
import type { PirateFocusTarget } from '@/systems/pirate-presentation';
import type { PirateActionResult } from '@/systems/pirate-actions';

/** The narrow slice of `RenderLoop` these controllers need. */
export type PanelActionsRenderer = Pick<
  RenderLoop,
  'setSelectedPirateFactionId' | 'applyPirateHeadquartersAssaultVisual' | 'setGameState' | 'setHighlights' | 'setStrategicLaunchPreview'
> & { readonly camera: Pick<RenderLoop['camera'], 'centerOn'> };

/** The narrow slice of `AudioSystem` these controllers need. */
export type PanelActionsAudio = Pick<
  AudioSystem,
  'stopNaturalWonderAmbient' | 'startNaturalWonderCodexAmbient' | 'playNaturalWonderReplay'
  | 'stopPirateAmbience' | 'startPirateHeadquartersAmbience'
>;

/**
 * Ports shared by every use-case controller. This is exactly the original
 * `PanelActionsControllerDeps` minus nothing — the composite still receives the
 * full dep set and distributes it, so `bootstrap.ts` is unchanged.
 */
export interface PanelActionsCommonDeps {
  readonly session: GameSession;
  readonly bus: EventBus;
  readonly uiLayer: HTMLDivElement;
  readonly getElementById: (id: string) => HTMLElement | null;
  readonly selection: Pick<SelectionStore, 'setPirateSelection' | 'getPirateSelection' | 'getSelectedUnitId'>;
  readonly selectionController: Pick<SelectionController, 'selectUnit' | 'deselectUnit' | 'startAutoExplore'>;
  readonly hud: Pick<HudController, 'closeDrawer' | 'update'>;
  readonly audio: PanelActionsAudio;
  readonly renderLoop: PanelActionsRenderer;
  readonly showNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
  readonly focusNotificationTarget: (target: NotificationEntry['target']) => void;
  readonly focusPirateTarget: (target: PirateFocusTarget) => void;
  readonly applyPirateActionResult: (result: PirateActionResult, successMessage: string) => void;
  readonly currentCiv: () => Civilization;
  readonly currentCivDef: () => CivDefinition | undefined;
  readonly diplomacyActions: Pick<
    DiplomacyActionsController,
    | 'handleDiplomaticAction' | 'handleAcceptPeaceRequest' | 'handleRejectPeaceRequest'
    | 'handleAcceptTreatyProposal' | 'handleDeclineTreatyProposal' | 'handleBreakTreaty'
    | 'handleGiftGold' | 'handleSponsorFestival' | 'handleMinorCivReparations' | 'handleSendAid'
    | 'handleMinorCivWarPeace' | 'handleAppeaseFaction' | 'handleConcedeToMovement' | 'handleEstablishRoute'
    | 'handleDeclareWarGoal' | 'handleProposeSettlement' | 'handleAcceptSettlementOffer' | 'handleRejectSettlementOffer'
  >;
  /** `main.ts`-local function (phase 13's `PlayerActionController` domain) -- injected to avoid a forward reference. */
  readonly executeUpgrade: (unitId: string, targetType: UnitType) => boolean;
  /**
   * Lazy wrapper, not a direct reference -- `router` is a `let` not assigned
   * until `createPanelRouter(...)` much later in `main.ts` module evaluation.
   * Same deferred-but-eager pattern `turnFlow`'s own `router` dep already uses.
   */
  readonly router: Pick<PanelRouter, 'open'>;
}

/**
 * The few openers one use-case group legitimately calls on another. The
 * composite supplies these after building every group, so the groups never
 * import each other.
 */
export interface PanelActionsCrossCalls {
  openCityPanelForCity(city: City): void;
  openWonderPanelForCityId(cityId: string): void;
  /** `undefined` keeps the group's default focus; a faction/history id focuses it. */
  openPirateWaters(focus?: { factionId?: string; historyId?: string }): void;
  openDiplomacyPanel(focusMinorCivId?: string): void;
  openNetworkPanel(): void;
  /** Opens the lone-assault panel for `factionId`/`unitId`; used by Pirate waters. */
  openPirateHeadquartersAssault(factionId: string, unitId: string): void;
}
