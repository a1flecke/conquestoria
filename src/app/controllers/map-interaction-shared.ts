/**
 * Shared vocabulary for the use-case split of `map-interaction-controller.ts` (#1243).
 *
 *   - `map-pending-intent.ts` — a tap that resolves a pending intent (journey, air
 *     mission + air-strike forecast, paradrop, air assault, unload, last stand)
 *   - `map-previews.ts`       — enemy-unit info, combat / city / camp assault previews
 *   - `map-engagements.ts`    — confirm-war entries, minor-civ assault, busy-worker move
 *   - `map-long-press.ts`     — long-press + territory inspection panel
 *   - `map-interaction-controller.ts` — `handleHexTap` dispatcher + composite
 *
 * Coordinate normalization (`wrapHexCoord`) stays at the input boundary in the
 * composite and the long-press slice; the slices only ever receive normalized coords.
 */
import type { RenderLoop } from '@/renderer/render-loop';
import type { AudioSystem } from '@/audio/audio-system';
import type { EventBus } from '@/core/event-bus';
import type { GameState, HexCoord, City, CivBonusEffect, CombatResult } from '@/core/types';
import type { GameSession, SelectionStore } from '@/app/ports';
import type { SelectionController } from '@/app/controllers/selection-controller';
import { classifyOwner } from '@/core/owner-kind';
import { getMinorCivPresentationForPlayer } from '@/systems/minor-civ-presentation';

/** The narrow slice of `RenderLoop` this controller needs. */
export type MapInteractionRenderer = Pick<RenderLoop, 'setGameState' | 'animateUnitAppear'> & {
  readonly camera: Pick<RenderLoop['camera'], 'centerOn'>;
};

/** The narrow slice of `AudioSystem` this controller needs. */
export type MapInteractionAudio = Pick<AudioSystem, 'startNaturalWonderMapFocusAmbient' | 'stopNaturalWonderAmbient'>;

export interface MapInteractionControllerDeps {
  readonly session: GameSession;
  readonly selection: SelectionStore;
  readonly selectionController: SelectionController;
  readonly renderLoop: MapInteractionRenderer;
  readonly audio: MapInteractionAudio;
  /** The concrete class -- see file docblock; two downstream calls require it. */
  readonly bus: EventBus;
  readonly uiLayer: HTMLElement;
  /** Substitutes for eight distinct `document.getElementById(...)` calls -- see file docblock. */
  readonly getElementById: (id: string) => HTMLElement | null;
  readonly showNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
  readonly updateHUD: () => void;
  readonly clearUnloadState: () => void;
  readonly currentCiv: () => GameState['civilizations'][string];
  readonly openPirateWaters: (focus?: { factionId?: string; historyId?: string }) => void;
  readonly openUnitStackPicker: (coord: HexCoord, unitIds: string[]) => void;
  readonly openCityPanelForCity: (city: City) => void;
  readonly openWonderAtlas: (initialWonderId?: string) => void;
  readonly executeAttack: (attackerId: string, targetKey: string) => void;
  readonly executeMinorCivConquest: (unitId: string, target: HexCoord, minorCivId: string, cityId: string) => void;
  readonly bombardCity: (attackerId: string, cityId: string) => void;
  readonly holdSiege: (attackerId: string, cityId: string) => void;
  readonly beginPlayerCityAssault: (
    attackerId: string,
    cityId: string,
    attackerBonus?: CivBonusEffect,
    precedingCombat?: CombatResult,
    embarkedAssault?: boolean,
  ) => 'pending' | 'resolved';
  readonly beginPlayerCampAssault: (attackerId: string, campId: string) => void;
  readonly finalizePendingCityCaptureChoice: (disposition: 'occupy' | 'raze', attackerBonus?: CivBonusEffect) => void;
}

/** Player-facing name of the owner of a foreign unit/city, masked by what the current viewer has earned. */
export function describeForeignOwner(deps: MapInteractionControllerDeps, ownerId: string): string {
  const { session } = deps;
    const ownerKind = classifyOwner(ownerId);
    if (ownerKind === 'barbarian') return 'Barbarian';
    if (ownerKind === 'pirate') return 'Pirates';
    if (ownerKind === 'rebel') return 'Rebels';
    if (ownerKind === 'beast') return 'Legendary Beasts';
    if (ownerKind === 'minor') {
      return getMinorCivPresentationForPlayer(session.getState(), session.getState().currentPlayer, ownerId, 'City-State').name;
    }
    return session.getState().civilizations[ownerId]?.name ?? ownerId;
}
