// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installPanelFocusManager } from '@/app/panel-focus-manager';
import type { PanelRegistry } from '@/app/panel-registry';
import { markModal } from '@/ui/modal-contract';

const registry = {
  council: { domId: 'council-panel', group: 'main', open: vi.fn() },
  tech: { domId: 'tech-panel', group: 'main', open: vi.fn() },
  network: { domId: 'network-panel', group: 'transient', open: vi.fn() },
} as unknown as Partial<PanelRegistry>;

function addPanel(layer: HTMLElement, id: string, withButton = true): HTMLElement {
  const panel = document.createElement('div');
  panel.id = id;
  const heading = document.createElement('h2');
  heading.textContent = `${id} heading`;
  panel.appendChild(heading);
  if (withButton) {
    const button = document.createElement('button');
    button.textContent = 'Inside';
    panel.appendChild(button);
  }
  layer.appendChild(panel);
  return panel;
}

async function flushObserver(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function press(key: string, target: EventTarget = document.body): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('panel focus manager (#1459)', () => {
  let layer: HTMLElement;
  let opener: HTMLButtonElement;
  let blocked = false;
  let dispose: () => void;

  beforeEach(() => {
    blocked = false;
    document.body.textContent = '';
    layer = document.createElement('div');
    layer.id = 'ui-layer';
    opener = document.createElement('button');
    opener.textContent = 'Council';
    document.body.append(opener, layer);
    opener.focus();
    dispose = installPanelFocusManager({
      layer,
      registry,
      isInteractionBlocked: () => blocked,
    });
  });

  afterEach(() => {
    dispose();
  });

  it('moves focus into a newly opened registered panel and labels it as a dialog', async () => {
    const panel = addPanel(layer, 'council-panel');
    await flushObserver();

    expect(panel.contains(document.activeElement)).toBe(true);
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('council-panel heading');
  });

  it('keeps focus where a panel put it itself', async () => {
    const panel = document.createElement('div');
    panel.id = 'council-panel';
    const input = document.createElement('input');
    panel.appendChild(input);
    layer.appendChild(panel);
    input.focus();
    await flushObserver();

    expect(document.activeElement).toBe(input);
  });

  it('restores focus to the opener when the panel closes', async () => {
    const panel = addPanel(layer, 'council-panel');
    await flushObserver();
    panel.remove();
    await flushObserver();

    expect(document.activeElement).toBe(opener);
  });

  it('a screen opened from a control INSIDE another managed screen returns focus to that control (#1459)', async () => {
    // Campaign setup -> "Choose civilization": the picker is a second screen stacked on the first. The control that
    // opened it lives inside a managed panel, which `lastOutsideFocus` never records.
    const setup = document.createElement('div');
    setup.id = 'campaign-setup';
    const chooser = document.createElement('button');
    chooser.textContent = 'Choose civilization';
    setup.appendChild(chooser);
    markModal(setup, { initialFocus: chooser });
    layer.appendChild(setup);
    await flushObserver();
    expect(document.activeElement).toBe(chooser);

    const picker = document.createElement('div');
    picker.id = 'civ-select';
    const card = document.createElement('button');
    card.textContent = 'Rome';
    picker.appendChild(card);
    markModal(picker, { initialFocus: card });
    layer.appendChild(picker);
    await flushObserver();
    expect(document.activeElement).toBe(card);

    picker.remove();
    await flushObserver();
    expect(document.activeElement).toBe(chooser);
  });

  it('does not steal focus the user has since moved elsewhere', async () => {
    const panel = addPanel(layer, 'council-panel');
    await flushObserver();
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();
    panel.remove();
    await flushObserver();

    expect(document.activeElement).toBe(other);
  });

  it('ignores elements that are not registered panels', async () => {
    const toast = addPanel(layer, 'some-toast');
    await flushObserver();

    expect(toast.hasAttribute('role')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('Escape closes only the topmost registered panel', async () => {
    const first = addPanel(layer, 'council-panel');
    const second = addPanel(layer, 'network-panel');
    await flushObserver();

    const event = press('Escape', second.querySelector('button')!);
    await flushObserver();

    expect(second.isConnected).toBe(false);
    expect(first.isConnected).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Escape does not also close a second panel when the panel handled it itself', async () => {
    const first = addPanel(layer, 'council-panel');
    const second = addPanel(layer, 'network-panel');
    second.addEventListener('keydown', event => {
      if (event.key === 'Escape') second.remove();
    });
    await flushObserver();

    press('Escape', second.querySelector('button')!);
    await flushObserver();

    expect(second.isConnected).toBe(false);
    expect(first.isConnected).toBe(true);
  });

  it('Escape does nothing while a blocking overlay owns the screen', async () => {
    const panel = addPanel(layer, 'council-panel');
    await flushObserver();
    blocked = true;

    const event = press('Escape');

    expect(panel.isConnected).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });

  it('Escape does nothing when no registered panel is open', () => {
    const event = press('Escape');
    expect(event.defaultPrevented).toBe(false);
  });

  it('stops observing and listening after dispose', async () => {
    dispose();
    const panel = addPanel(layer, 'council-panel');
    await flushObserver();
    press('Escape');

    expect(panel.hasAttribute('role')).toBe(false);
    expect(panel.isConnected).toBe(true);
  });
  describe('blocking decision dialogs (markModal)', () => {
    function addModal(options: { cancel?: boolean; withInitial?: boolean } = {}) {
      const modal = document.createElement('div');
      modal.id = 'confirm-modal';
      const title = document.createElement('h2');
      title.textContent = 'Really?';
      const keep = document.createElement('button');
      keep.textContent = 'Keep';
      const confirm = document.createElement('button');
      confirm.textContent = 'Confirm';
      const onKeep = vi.fn();
      keep.addEventListener('click', onKeep);
      modal.append(title, keep, confirm);
      markModal(modal, {
        cancel: options.cancel === false ? undefined : keep,
        initialFocus: options.withInitial === false ? undefined : keep,
      });
      layer.appendChild(modal);
      return { modal, keep, confirm, onKeep };
    }

    it('names the dialog, marks it modal and focuses its declared safe control', async () => {
      const { modal, keep } = addModal();
      await flushObserver();

      expect(modal.getAttribute('role')).toBe('dialog');
      expect(modal.getAttribute('aria-modal')).toBe('true');
      expect(modal.getAttribute('aria-label')).toBe('Really?');
      expect(document.activeElement).toBe(keep);
    });

    it('falls back to the first control when none is declared', async () => {
      const { keep } = addModal({ withInitial: false });
      await flushObserver();
      expect(document.activeElement).toBe(keep);
    });

    it('restores focus to the opener when it goes away', async () => {
      const { modal } = addModal();
      await flushObserver();
      modal.remove();
      await flushObserver();
      expect(document.activeElement).toBe(opener);
    });

    it('Escape activates the declared cancel control, even while interaction is blocked', async () => {
      const { onKeep, keep } = addModal();
      await flushObserver();
      blocked = true;

      const event = press('Escape', keep);

      expect(onKeep).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('Escape does nothing for a modal with no cancel control', async () => {
      const { modal, keep } = addModal({ cancel: false });
      await flushObserver();

      const event = press('Escape', keep);

      expect(modal.isConnected).toBe(true);
      expect(event.defaultPrevented).toBe(false);
    });

    it('Escape is left alone when focus is inside a different overlay', async () => {
      const { onKeep } = addModal();
      await flushObserver();
      const handoff = document.createElement('button');
      document.body.appendChild(handoff);
      handoff.focus();

      press('Escape', handoff);

      expect(onKeep).not.toHaveBeenCalled();
    });

    it('Tab wraps from the last control to the first and Shift+Tab back', async () => {
      const { keep, confirm } = addModal();
      await flushObserver();
      confirm.focus();

      const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      confirm.dispatchEvent(forward);
      expect(forward.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(keep);

      const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
      keep.dispatchEvent(backward);
      expect(backward.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(confirm);
    });

    it('lets Tab move normally between the middle controls', async () => {
      const { keep } = addModal();
      await flushObserver();
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      keep.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });
  });
});
