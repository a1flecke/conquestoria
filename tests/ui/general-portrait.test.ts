// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { getGeneralPresentation, type GeneralPresentation } from '@/systems/great-general-presentation';
import { createGeneralPortrait } from '@/ui/general-portrait';
import { createGeneralCandidatePanel } from '@/ui/general-candidate-panel';
import { createHallOfFamePanel } from '@/ui/hall-of-fame-panel';
import { createRallyPanel } from '@/ui/general-command-panel';
import { getHallOfFameForViewer } from '@/systems/great-general-hall-of-fame';
import type { GameState } from '@/core/types';

const caesar = GENERAL_DEFINITIONS.find(g => g.id === 'gen_caesar')!;
const alexander = GENERAL_DEFINITIONS.find(g => g.id === 'gen_alexander')!;

function crestSignature(root: Element): string {
  return [...root.querySelectorAll('svg path')].map(p => `${p.getAttribute('d')}|${p.getAttribute('fill')}`).join(';');
}

describe('General crest portrait (#889)', () => {
  it('draws an inline SVG crest named for the General, never via innerHTML', () => {
    const crest = createGeneralPortrait(getGeneralPresentation(caesar), { size: 40, name: caesar.name });
    expect(crest.getAttribute('role')).toBe('img');
    expect(crest.getAttribute('aria-label')).toBe('Julius Caesar, crest');
    expect(crest.dataset.portraitState).toBe('crest');
    expect(crest.querySelector('svg')).not.toBeNull();
    expect(crest.querySelector('img, script, foreignObject')).toBeNull();
  });

  it('is deterministic and different Generals draw differently', () => {
    const a1 = createGeneralPortrait(getGeneralPresentation(caesar), { size: 40, name: caesar.name });
    const a2 = createGeneralPortrait(getGeneralPresentation(caesar), { size: 40, name: caesar.name });
    const b = createGeneralPortrait(getGeneralPresentation(alexander), { size: 40, name: alexander.name });
    expect(crestSignature(a1)).toBe(crestSignature(a2));
    expect(crestSignature(a1)).not.toBe(crestSignature(b));
  });

  it('keeps hostile text out of markup: a name with HTML lives only in the label attribute', () => {
    const name = '<img src=x onerror=alert(1)>';
    const crest = createGeneralPortrait(getGeneralPresentation(caesar), { size: 40, name });
    expect(crest.querySelector('img')).toBeNull();
    expect(crest.getAttribute('aria-label')).toBe(`${name}, crest`);
  });

  it('a malformed colour degrades to a neutral grey instead of reaching an attribute', () => {
    const bad: GeneralPresentation = { ...getGeneralPresentation(caesar), primary: 'red;stroke:url(javascript:1)', secondary: '#12345' };
    const crest = createGeneralPortrait(bad, { size: 40, name: 'x' });
    const fills = [...crest.querySelectorAll('path')].map(p => p.getAttribute('fill'));
    expect(fills.every(f => f === 'none' || /^#[0-9a-f]{6}$/i.test(f ?? ''))).toBe(true);
    expect(crest.innerHTML).not.toContain('javascript');
  });

  it('falls back to the legacy emoji, still named, when the crest cannot be drawn', () => {
    const broken = { ...getGeneralPresentation(caesar), motif: 'no-such-motif' } as unknown as GeneralPresentation;
    const crest = createGeneralPortrait(broken, { size: 40, name: caesar.name });
    expect(crest.dataset.portraitState).toBe('fallback');
    expect(crest.textContent).toBe(caesar.portraitIcon);
    expect(crest.querySelector('svg')).toBeNull();
    expect(crest.getAttribute('aria-label')).toBe('Julius Caesar, crest');
  });

  it('shows one pip per era tier so a later officer is visibly later', () => {
    const early = createGeneralPortrait({ ...getGeneralPresentation(caesar), eraTier: 1 }, { size: 40, name: 'x' });
    const late = createGeneralPortrait({ ...getGeneralPresentation(caesar), eraTier: 4 }, { size: 40, name: 'x' });
    expect(early.querySelectorAll('circle')).toHaveLength(1);
    expect(late.querySelectorAll('circle')).toHaveLength(4);
  });

  it('never animates: no SMIL or CSS animation, so there is nothing for reduced motion to gate', () => {
    const crest = createGeneralPortrait(getGeneralPresentation(caesar), { size: 40, name: 'x' });
    expect(crest.querySelector('animate, animateTransform, set')).toBeNull();
    expect(crest.outerHTML).not.toMatch(/animation|@keyframes/i);
  });
});

describe('one identity across every surface (#889)', () => {
  const expected = crestSignature(createGeneralPortrait(getGeneralPresentation(caesar), { size: 40, name: caesar.name }));

  it('candidate chooser, Hall of Fame card, Hall of Fame view-model and command panel draw the same crest', () => {
    const container = document.createElement('div');

    createGeneralCandidatePanel(container, [caesar], () => {});
    expect(crestSignature(container.querySelector('button[data-choice="gen_caesar"] [data-general-portrait]')!)).toBe(expected);

    const state = {
      generatedGenerals: {},
      civilizations: { player: { id: 'player', generalHistory: [
        { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 4, careerEvents: [{ type: 'spawned', turn: 4 }] },
      ] } as never },
    } as unknown as GameState;
    const [entry] = getHallOfFameForViewer(state, 'player');
    expect(entry!.presentation).toEqual(getGeneralPresentation(caesar));
    createHallOfFamePanel(container, [entry!], { onClose: () => {} });
    expect(crestSignature(container.querySelector('[data-hall-of-fame-entry] summary [data-general-portrait]')!)).toBe(expected);

    createRallyPanel(
      container,
      { eligibility: { eligible: true, chargesRemaining: 2, isFinalCharge: false, cooldownTurnsRemaining: 0 }, targets: [] },
      () => {}, () => {},
      { name: caesar.name, presentation: getGeneralPresentation(caesar) },
    );
    expect(crestSignature(container.querySelector('#rally-panel [data-general-portrait]')!)).toBe(expected);
  });
});
