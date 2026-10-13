/**
 * One focus contract for every registered panel (#1459).
 *
 * Panels are plain elements that each factory appends to (and removes from) the
 * UI layer, so none of them could be trusted to move keyboard focus into
 * itself, give it back afterwards, or close on Escape. Doing that per factory
 * would be 20 copies of the same code that drift. This observer applies the
 * contract once, to exactly the DOM ids in the panel registry:
 *
 * - **Entry:** when a registered panel appears and focus is not already inside
 *   it, focus the panel (programmatically focusable, `role="dialog"`, named from
 *   its heading) so Tab continues from there instead of from the map.
 * - **Restore:** when it disappears and nothing else has taken focus, return
 *   focus to the control that was focused before it opened.
 * - **Escape:** closes the topmost registered panel. A panel that already
 *   handled Escape itself is not followed by a second close, and nothing
 *   happens while a blocking overlay (hot-seat handoff, ceremony) owns input.
 *
 * Blocking decision dialogs (end-turn warning, delete confirmation, required
 * choices) are not registry panels. They opt in with `markModal`
 * (src/ui/modal-contract.ts) and additionally get `aria-modal`, a Tab trap,
 * focus on their declared safe control, and Escape that activates their declared
 * cancel control. A modal with no cancel control (a required choice) ignores
 * Escape, so a decision the player must make is never dismissed by accident. They
 * keep working while the host reports interaction blocked, since they are what
 * set that flag; a control inside any other overlay (hot-seat handoff) is left
 * to that overlay.
 */
import type { PanelRegistry } from '@/app/panel-registry';
import { MODAL_ATTR, MODAL_CANCEL_ATTR, MODAL_INITIAL_FOCUS_ATTR } from '@/ui/modal-contract';

export interface PanelFocusManagerDeps {
  readonly layer: HTMLElement;
  readonly registry: Partial<PanelRegistry>;
  readonly isInteractionBlocked: () => boolean;
}

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function headingText(panel: HTMLElement): string | null {
  const heading = panel.querySelector('h1, h2, h3');
  const text = heading?.textContent?.trim();
  return text ? text : null;
}

export function installPanelFocusManager(deps: PanelFocusManagerDeps): () => void {
  const { layer, registry, isInteractionBlocked } = deps;
  const doc = layer.ownerDocument;

  const panelIds = (): Set<string> => new Set(
    Object.values(registry).flatMap(descriptor => (descriptor ? [descriptor.domId] : [])),
  );
  const isModal = (node: Node): node is HTMLElement =>
    node instanceof HTMLElement && node.parentElement === layer && node.hasAttribute(MODAL_ATTR);
  const isRegisteredPanel = (node: Node): node is HTMLElement =>
    node instanceof HTMLElement && node.parentElement === layer && panelIds().has(node.id);
  const isManaged = (node: Node): node is HTMLElement => isRegisteredPanel(node) || isModal(node);
  const managedPanels = (): HTMLElement[] =>
    [...layer.children].filter((child): child is HTMLElement => isManaged(child));

  let lastOutsideFocus: HTMLElement | null = doc.activeElement instanceof HTMLElement
    && doc.activeElement !== doc.body && !layer.contains(doc.activeElement)
    ? doc.activeElement
    : null;
  const openers = new Map<string, HTMLElement | null>();

  const onFocusIn = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLElement && !managedPanels().some(panel => panel.contains(target))) {
      lastOutsideFocus = target;
    }
  };

  const enter = (panel: HTMLElement): void => {
    openers.set(panel.id, lastOutsideFocus);
    if (!panel.hasAttribute('role')) panel.setAttribute('role', 'dialog');
    if (isModal(panel)) panel.setAttribute('aria-modal', 'true');
    if (!panel.hasAttribute('aria-label') && !panel.hasAttribute('aria-labelledby')) {
      const name = headingText(panel);
      if (name) panel.setAttribute('aria-label', name);
    }
    if (panel.contains(doc.activeElement)) return;
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
    const preferred = isModal(panel)
      ? panel.querySelector<HTMLElement>(`[${MODAL_INITIAL_FOCUS_ATTR}]`)
        ?? panel.querySelector<HTMLElement>(FOCUSABLE)
      : null;
    (preferred ?? panel).focus({ preventScroll: true });
  };

  const leave = (id: string): void => {
    const opener = openers.get(id) ?? null;
    openers.delete(id);
    const active = doc.activeElement;
    const focusLost = active === null || active === doc.body;
    if (focusLost && opener?.isConnected) opener.focus({ preventScroll: true });
  };

  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (isManaged(node) && node.isConnected) enter(node);
      });
      record.removedNodes.forEach(node => {
        if (node instanceof HTMLElement && openers.has(node.id) && ![...layer.children].some(child => child.id === node.id)) {
          leave(node.id);
        }
      });
    }
  });
  observer.observe(layer, { childList: true });

  const ownsKeys = (panel: HTMLElement, event: KeyboardEvent): boolean => {
    const target = event.target;
    return target === doc.body || target === doc.documentElement || target === doc
      || (target instanceof Node && panel.contains(target));
  };

  let escapeTarget: HTMLElement | null = null;
  const onKeyCapture = (raw: Event): void => {
    const event = raw as KeyboardEvent;
    escapeTarget = null;
    const topmost = managedPanels().at(-1) ?? null;
    if (!topmost) return;
    const modal = topmost.hasAttribute(MODAL_ATTR);
    if (!modal && isInteractionBlocked()) return;
    if (modal && !ownsKeys(topmost, event)) return;

    if (event.key === 'Tab' && modal) {
      const focusable = [...topmost.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = doc.activeElement;
      if (!topmost.contains(active) || active === topmost) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key === 'Escape') escapeTarget = topmost;
  };
  const onKey = (raw: Event): void => {
    const event = raw as KeyboardEvent;
    const target = escapeTarget;
    escapeTarget = null;
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (!target?.isConnected) return;
    if (target.hasAttribute(MODAL_ATTR)) {
      const cancel = target.querySelector<HTMLElement>(`[${MODAL_CANCEL_ATTR}]`);
      if (!cancel || (cancel instanceof HTMLButtonElement && cancel.disabled)) return;
      event.preventDefault();
      cancel.click();
      return;
    }
    event.preventDefault();
    target.remove();
  };

  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('keydown', onKeyCapture, true);
  doc.addEventListener('keydown', onKey);

  return () => {
    observer.disconnect();
    doc.removeEventListener('focusin', onFocusIn);
    doc.removeEventListener('keydown', onKeyCapture, true);
    doc.removeEventListener('keydown', onKey);
    openers.clear();
  };
}
