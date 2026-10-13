/**
 * The attributes a blocking decision dialog uses to opt in to the shared focus
 * contract (#1459). `installPanelFocusManager` (src/app/panel-focus-manager.ts)
 * reads them; the dialog factory only declares what is true of it:
 *
 * - `data-modal`: this element is a modal decision. It gets `role="dialog"`,
 *   `aria-modal`, a name from its heading, focus on entry, a Tab trap and focus
 *   restoration when it goes away.
 * - `data-modal-cancel` on a control: Escape activates that control. A modal
 *   without one (a required choice) cannot be dismissed with Escape.
 * - `data-modal-initial-focus` on a control: where focus lands. Default to the
 *   safe choice so a stray Enter never confirms a destructive action.
 */
export const MODAL_ATTR = 'data-modal';
export const MODAL_CANCEL_ATTR = 'data-modal-cancel';
export const MODAL_INITIAL_FOCUS_ATTR = 'data-modal-initial-focus';

export interface ModalMarking {
  readonly cancel?: HTMLElement;
  readonly initialFocus?: HTMLElement;
}

export function markModal(root: HTMLElement, marking: ModalMarking = {}): void {
  root.setAttribute(MODAL_ATTR, 'true');
  marking.cancel?.setAttribute(MODAL_CANCEL_ATTR, 'true');
  marking.initialFocus?.setAttribute(MODAL_INITIAL_FOCUS_ATTR, 'true');
}
