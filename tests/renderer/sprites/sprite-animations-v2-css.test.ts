import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

// #652: .cq-wheel (and, it turned out, .cq-glow/.cq-fire/.cq-smoke/.cq-spark/.cq-dust/
// .cq-peek/.cq-banner-cloth/.cq-beacon/.cq-crowd-fig) were referenced by dozens of
// already-shipped sprites and even listed in this file's own reduced-motion pause
// block, but had no actual `animation` rule anywhere — silently inert since whenever
// each was first used. This test reads the real CSS file as text (jsdom does not
// reliably evaluate animation timelines from an external stylesheet, so a text-level
// check is both simpler and more direct) and asserts every ambient class named in the
// reduced-motion pause list has a real selector elsewhere in the file that sets an
// `animation:` property — so a future class can't be added to the pause list "for
// completeness" without anyone actually wiring it up.
const CSS_PATH = resolve(__dirname, '../../../src/assets/sprite-animations-v2.css');
const css = readFileSync(CSS_PATH, 'utf-8');

// The exact set the reduced-motion block pauses. Kept as a literal list (not parsed
// out of the file) so a change to the pause list itself doesn't silently narrow what
// this test checks — see the second test below for the reverse direction.
const REDUCED_MOTION_PAUSE_LIST = [
  'cq-sprite-figure', 'cq-weapon', 'cq-tool', 'cq-smoke', 'cq-dust', 'cq-work-dust',
  'cq-spark', 'cq-glow', 'cq-fire', 'cq-wheel', 'cq-water-stream', 'cq-spotlight',
  'cq-camera-led', 'cq-beacon', 'cq-crowd-fig', 'cq-trade-fig', 'cq-coin-shimmer',
  'cq-deliver', 'cq-peek', 'cq-mark', 'cq-candle', 'cq-shimmer',
  'cq-banner-cloth', 'cq-muzzle-flash', 'cq-cape',
  'cq-segment-1', 'cq-segment-2', 'cq-segment-3', 'cq-segment-4',
];

// Classes intentionally left unimplemented because nothing in the sprite catalog uses
// them yet (verified via `grep -rho 'className="cq-X' src/renderer/sprites src/renderer/wonders`
// returning zero hits at the time this test was written). Adding a real sprite that
// uses one of these should come with a matching animation rule and its removal from
// this allowlist, not a silent no-op class.
const KNOWN_UNUSED_NO_RULE_YET = new Set([
  'cq-water-stream', 'cq-spotlight', 'cq-camera-led', 'cq-mark', 'cq-candle', 'cq-shimmer',
]);

function hasRealAnimationRule(className: string): boolean {
  const pattern = new RegExp(`\\.${className}\\b[^{]*\\{[^}]*animation:`);
  // Strip the reduced-motion block itself so a mention there doesn't count as "real".
  const withoutPauseBlock = css.replace(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g, '');
  return pattern.test(withoutPauseBlock);
}

describe('sprite-animations-v2.css ambient classes are not silently inert', () => {
  for (const className of REDUCED_MOTION_PAUSE_LIST) {
    if (KNOWN_UNUSED_NO_RULE_YET.has(className)) continue;
    it(`.${className} has a real animation rule (not just a reduced-motion pause entry)`, () => {
      expect(
        hasRealAnimationRule(className),
        `.${className} is listed in the reduced-motion pause block but has no real ` +
        `"animation:" rule elsewhere in sprite-animations-v2.css — it would be a no-op ` +
        `class. If this is intentional (nothing uses it yet), add it to ` +
        `KNOWN_UNUSED_NO_RULE_YET in this test instead of leaving it silently broken.`,
      ).toBe(true);
    });
  }

  it('every ambient class actually used by a real sprite has a working animation rule', () => {
    // Cross-check against live source, independent of the hardcoded list above, so a
    // future sprite that starts using e.g. .cq-mark is caught even before anyone
    // remembers to update REDUCED_MOTION_PAUSE_LIST or this allowlist. Scans files
    // directly (no shell-out) so this stays portable across CI environments.
    const repoRoot = resolve(__dirname, '../../..');
    const sourceDirs = [
      join(repoRoot, 'src/renderer/sprites'),
      join(repoRoot, 'src/renderer/wonders'),
    ];
    const classNamePattern = /className="(cq-[a-zA-Z0-9_-]*)"/g;
    const usedClassNames = new Set<string>();
    for (const dir of sourceDirs) {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.endsWith('.tsx') && !entry.endsWith('.ts')) continue;
        const content = readFileSync(join(dir, entry), 'utf-8');
        for (const match of content.matchAll(classNamePattern)) {
          usedClassNames.add(match[1].split(' ')[0].split('--')[0]);
        }
      }
    }
    // cq-sprite-figure gets its animation from state-gated selectors this file's earlier
    // sections already cover extensively; cq-shadow-detached is intentionally a static
    // opacity/scale override (see [data-kind="beast-winged"] .cq-shadow-detached), not
    // an animation — both would be false positives for "silently inert".
    const notExpectedToAnimate = new Set(['cq-sprite-figure', 'cq-shadow-detached']);
    const missing = [...usedClassNames].filter(
      name => !notExpectedToAnimate.has(name) && !hasRealAnimationRule(name),
    );
    expect(missing, `these classes are assigned by real sprites but have no working animation rule: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('#708 mounted animal animation contract', () => {
  it('defines an animated animal body plan with both required variants', () => {
    for (const selector of [
      '.cq-v2[data-kind="animal"][data-state="idle"] .cq-sprite-figure',
      '.cq-v2[data-kind="animal"][data-state="walk"] .cq-sprite-figure',
      '.cq-v2[data-kind="animal"][data-state="attack"] .cq-sprite-figure',
      '.cq-v2[data-kind="animal"][data-state="attack"] .cq-weapon',
      '.cq-v2[data-kind="animal"][data-kind-variant="mount"]',
      '.cq-v2[data-kind="animal"][data-kind-variant="elephant"]',
    ]) {
      expect(css, `missing ${selector}`).toContain(selector);
    }
    expect(css).toContain('@keyframes cq2-animal-walk-body');
    expect(css).toContain('@keyframes cq2-animal-attack-body');
  });

  it('uses all four leg hooks for a diagonal-pair animal gait', () => {
    for (const hook of ['cq-leg-fl', 'cq-leg-fr', 'cq-leg-bl', 'cq-leg-br']) {
      expect(css, `missing animal ${hook} selector`).toContain(`.cq-v2[data-kind="animal"] .${hook}`);
    }
  });

  it('gives every named #708 secondary-motion hook a real state-scoped animation', () => {
    const hookSelectors = [
      '.cq-v2[data-kind="hound"][data-kind-variant="handler"][data-state="idle"] .cq-hound-tail',
      '.cq-v2[data-kind="hound"][data-kind-variant="handler"][data-state="attack"] .cq-command-staff',
      '.cq-v2[data-kind="hound"][data-kind-variant="handler"][data-state="attack"] .cq-command-leash',
      '.cq-v2[data-kind="hound"][data-kind-variant="handler"][data-state="attack"] .cq-command-sigil',
      '.cq-v2[data-kind="animal"][data-kind-variant="elephant"][data-state="walk"] .cq-elephant-ear',
      '.cq-v2[data-kind="animal"][data-kind-variant="elephant"][data-state="walk"] .cq-elephant-trunk',
      '.cq-v2[data-kind="animal"][data-kind-variant="elephant"][data-state="walk"] .cq-howdah',
      '.cq-v2[data-kind="animal"][data-kind-variant="elephant"][data-state="walk"] .cq-rune-standard',
      '.cq-v2[data-kind="animal"][data-kind-variant="elephant"][data-state="attack"] .cq-elephant-tusks',
      '.cq-v2[data-kind="animal"][data-kind-variant="mount"][data-state="walk"] .cq-horse-mane',
      '.cq-v2[data-kind="animal"][data-kind-variant="mount"][data-state="walk"] .cq-horse-tail',
      '.cq-v2[data-kind="animal"][data-kind-variant="mount"][data-state="walk"] .cq-rider',
      '.cq-v2[data-kind="animal"][data-kind-variant="mount"][data-state="attack"] .cq-saddle',
    ];
    for (const selector of hookSelectors) {
      expect(css, `missing animated selector ${selector}`).toContain(selector);
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(css, `${selector} must declare animation`).toMatch(new RegExp(`${escaped}\\s*\\{[^}]*animation:`));
    }
  });

  it('uses four-beat overrides for elephant and mount travel instead of reusing a diagonal-pair walk', () => {
    for (const selector of [
      '.cq-v2[data-kind="hound"][data-kind-variant="handler"][data-state="walk"] .cq-leg-fl',
      '.cq-v2[data-kind="hound"][data-kind-variant="handler"][data-state="walk"] .cq-leg-fr',
      '.cq-v2[data-kind="animal"][data-kind-variant="elephant"][data-state="walk"] .cq-leg-fl',
      '.cq-v2[data-kind="animal"][data-kind-variant="elephant"][data-state="walk"] .cq-leg-fr',
      '.cq-v2[data-kind="animal"][data-kind-variant="mount"][data-state="walk"] .cq-leg-fl',
      '.cq-v2[data-kind="animal"][data-kind-variant="mount"][data-state="walk"] .cq-leg-fr',
    ]) {
      expect(css, `missing four-beat override ${selector}`).toContain(selector);
    }
  });
});
