// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { getGeneralPresentation } from '@/systems/great-general-presentation';
import { showGeneralRetirementCeremony } from '@/ui/general-retirement-ceremony';
import { MODAL_ATTR, MODAL_CANCEL_ATTR, MODAL_INITIAL_FOCUS_ATTR } from '@/ui/modal-contract';

const caesar = GENERAL_DEFINITIONS.find(g => g.id === 'gen_caesar')!;

describe('General retirement ceremony (#889)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  function open(over: Partial<Parameters<typeof showGeneralRetirementCeremony>[1]> = {}) {
    const onResolve = vi.fn();
    const onOpenHallOfFame = vi.fn();
    const overlay = showGeneralRetirementCeremony(container, {
      name: caesar.name,
      presentation: getGeneralPresentation(caesar),
      careerLine: 'Julius Caesar retired after a distinguished career — 2 cities captured.',
      onOpenHallOfFame,
      onResolve,
      ...over,
    });
    return { overlay, onResolve, onOpenHallOfFame };
  }

  it('shows the crest, who retires and the system-written career line, concisely', () => {
    const { overlay } = open();
    expect(overlay.querySelector('[data-general-portrait="gen_caesar"]')).not.toBeNull();
    expect(overlay.querySelector('h2')!.textContent).toBe('Julius Caesar retires');
    expect(overlay.textContent).toContain('2 cities captured');
    expect(overlay.textContent).toContain('Hall of Fame');
    expect((overlay.textContent ?? '').length).toBeLessThan(260);
  });

  it('is a modal that opens on the safe Continue and answers Escape with Continue', () => {
    const { overlay } = open();
    expect(overlay.hasAttribute(MODAL_ATTR)).toBe(true);
    const cont = overlay.querySelector(`[${MODAL_CANCEL_ATTR}]`) as HTMLButtonElement;
    expect(cont.textContent).toBe('Continue');
    expect(cont.hasAttribute(MODAL_INITIAL_FOCUS_ATTR)).toBe(true);
    expect(overlay.getAttribute('aria-labelledby')).toBe(overlay.querySelector('h2')!.id);
  });

  it('Continue resolves exactly once and removes the card', () => {
    const { overlay, onResolve, onOpenHallOfFame } = open();
    const cont = overlay.querySelector(`[${MODAL_CANCEL_ATTR}]`) as HTMLButtonElement;
    cont.click();
    cont.click();
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onOpenHallOfFame).not.toHaveBeenCalled();
    expect(container.querySelector('#general-retirement-ceremony')).toBeNull();
  });

  it('View Hall of Fame resolves the moment and then opens the panel, each exactly once', () => {
    const order: string[] = [];
    const { overlay } = open({ onResolve: () => order.push('resolve'), onOpenHallOfFame: () => order.push('hall') });
    const hall = [...overlay.querySelectorAll('button')].find(b => /hall of fame/i.test(b.textContent ?? ''))!;
    hall.click();
    hall.click();
    expect(order).toEqual(['resolve', 'hall']);
  });

  it('offers only Continue when the Hall of Fame cannot be opened', () => {
    const { overlay } = open({ onOpenHallOfFame: undefined });
    expect([...overlay.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Continue']);
  });

  it('still reads correctly with no resolvable crest (an unresolved definition)', () => {
    const { overlay } = open({ presentation: undefined });
    expect(overlay.querySelector('[data-general-portrait]')).toBeNull();
    expect(overlay.querySelector('h2')!.textContent).toBe('Julius Caesar retires');
  });

  it('renders every game string as text, never markup', () => {
    const { overlay } = open({ name: '<b>x</b>', careerLine: '<img src=x onerror=1>' });
    expect(overlay.querySelector('b, img')).toBeNull();
    expect(overlay.textContent).toContain('<b>x</b> retires');
  });

  it('has no animation of its own and plays no audio, so reduced motion and mute need no special case', () => {
    const { overlay } = open();
    expect(overlay.outerHTML).not.toMatch(/animation|transition|@keyframes/i);
    expect(overlay.querySelector('audio, video')).toBeNull();
  });
});
