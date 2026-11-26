/**
 * The turn-1 homeland choice panel (#1837, phase C): opens it for the viewing seat while a choice is live, applies a
 * pick through `confirmHomeland` (the one executor) and the session, and removes the panel the moment the choice is
 * over (a city founded, the turn ended, the seat changed). Depends only on `ports.ts` types and a camera slice.
 */
import type { GameSession } from '@/app/ports';
import type { RenderLoop } from '@/renderer/render-loop';
import { createHomelandPanel } from '@/ui/homeland-panel';
import { confirmHomeland, getActiveHomelandChoice } from '@/systems/start-placement-system';

export interface HomelandPanelControllerDeps {
  readonly session: GameSession;
  readonly uiLayer: HTMLElement;
  readonly getElementById: (id: string) => HTMLElement | null;
  readonly renderLoop: { readonly camera: Pick<RenderLoop['camera'], 'centerOn'> };
  readonly showNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
}

export interface HomelandPanelController {
  /** Open the panel for the viewing seat; false (and nothing shown) when it has no live choice. */
  openHomelandChoiceIfActive(): boolean;
  /** The automatic offer on turn 1: opens once per seat, and only when nothing required is blocking the screen. */
  offerHomelandChoiceOnce(): boolean;
}

const PANEL_ID = 'homeland-panel';

export function createHomelandPanelController(deps: HomelandPanelControllerDeps): HomelandPanelController {
  const { session, uiLayer } = deps;

  /** The seat the open panel was drawn for: another seat's choice is never shown to a different viewer. */
  let shownFor: string | null = null;

  function close(): void {
    deps.getElementById(PANEL_ID)?.remove();
    shownFor = null;
  }

  function render(): boolean {
    const state = session.getState();
    const civId = state.currentPlayer;
    const choice = getActiveHomelandChoice(state, civId);
    if (!choice) {
      close();
      return false;
    }
    shownFor = civId;
    createHomelandPanel(uiLayer, choice, {
      onChoose: (index) => {
        const result = confirmHomeland(session.getState(), civId, index);
        if (!result.ok) {
          deps.showNotification(result.message, 'warning');
          render();
          return;
        }
        session.commit(result.state);
        deps.renderLoop.camera.centerOn(choice.options[index].coord);
        render();
      },
      onClose: () => {},
    });
    return true;
  }

  // The choice ends with the first city, the turn, or a change of seat: the panel must not outlive it, and must never
  // be left up for a different viewer even when that viewer has a choice of their own.
  session.subscribe(state => {
    if (!deps.getElementById(PANEL_ID)) return;
    if (state.currentPlayer !== shownFor || !getActiveHomelandChoice(state, state.currentPlayer)) close();
  });

  // The automatic offer is made once per seat per session, so a player who closed the panel is not nagged by every
  // later refresh of the required-choice flow. Opening it explicitly (the registry entry) always works.
  const offered = new Set<string>();
  function offerHomelandChoiceOnce(): boolean {
    const civId = session.getState().currentPlayer;
    if (offered.has(civId)) return false;
    const opened = render();
    if (opened) offered.add(civId);
    return opened;
  }

  return { openHomelandChoiceIfActive: render, offerHomelandChoiceOnce };
}
