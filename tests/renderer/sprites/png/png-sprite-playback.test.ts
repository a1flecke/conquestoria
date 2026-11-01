import { describe, expect, it } from 'vitest';
import { fromPuppetManifest } from '@/renderer/sprites/png/png-sprite-normalise';
import {
  getPngPlaybackCssVars,
  resolvePngPlayback,
  toPngDamageTier,
} from '@/renderer/sprites/png/png-sprite-playback';
import { getPngUnitManifest, hasPngDeathClip } from '@/renderer/sprites/png/png-sprite-catalog';
import { manifest as cavalryManifest } from '@/renderer/sprites/png/generated/cavalry.manifest';
import type { PngClip, PngTierClips, PngUnitSprite } from '@/renderer/sprites/png/png-sprite-types';

const clip = (over: Partial<PngClip> = {}): PngClip => ({ row: 0, firstCol: 0, frames: 4, fps: 4, loop: true, ...over });
const tiers = (c: PngClip): PngTierClips => [c, c, c, c];

/** A strip-shaped sprite: wide cells, tiered idle, one-shots. */
function stripSprite(over: Partial<PngUnitSprite> = {}): PngUnitSprite {
  const idle: PngTierClips = [0, 1, 2, 3].map(t => clip({ row: 0, firstCol: t, frames: 1 })) as unknown as PngTierClips;
  return {
    id: 'strip', cellWidth: 240, cellHeight: 192, cols: 8, rows: 8, baseline: 176,
    clips: {
      idle,
      walk: [0, 1, 2, 3].map(t => clip({ row: 1 + t, frames: 8, fps: 10 })) as unknown as PngTierClips,
      attack: tiers(clip({ row: 5, frames: 6, fps: 9, loop: false })),
    },
    sheet: 'images/units/strip/sheet.png', mask: 'images/units/strip/mask.png', facing: 'right',
    ...over,
  };
}

describe('fromPuppetManifest', () => {
  const sprite = fromPuppetManifest(cavalryManifest);

  it("keeps a puppet unit's behaviour: square cells, looping rows, the same clip at every tier", () => {
    expect(sprite.cellWidth).toBe(192);
    expect(sprite.cellHeight).toBe(192);
    expect(sprite.baseline).toBeNull();
    for (const state of ['idle', 'walk', 'attack'] as const) {
      const entry = cavalryManifest.states[state];
      const expected = { row: entry.row, firstCol: 0, frames: entry.frames, fps: entry.fps, loop: true };
      for (const tierClip of sprite.clips[state]) expect(tierClip, state).toEqual(expected);
    }
  });

  it('has no hurt, death or work clip (the player falls back to idle with a filter)', () => {
    expect(sprite.clips.hurt).toBeUndefined();
    expect(sprite.clips.death).toBeUndefined();
    expect(sprite.clips.work).toBeUndefined();
  });
});

describe('toPngDamageTier', () => {
  it('clamps whatever the overlay is handed to 0..3', () => {
    expect(toPngDamageTier(undefined)).toBe(0);
    expect(toPngDamageTier(Number.NaN)).toBe(0);
    expect(toPngDamageTier(Number.POSITIVE_INFINITY)).toBe(0);
    expect(toPngDamageTier(-1)).toBe(0);
    expect(toPngDamageTier(2.6)).toBe(2);
    expect(toPngDamageTier(7)).toBe(3);
    expect(toPngDamageTier(3)).toBe(3);
  });
});

describe('resolvePngPlayback', () => {
  it('picks the clip for the state at the damage tier', () => {
    const sprite = stripSprite();
    expect(resolvePngPlayback(sprite, 'idle', 2).clip.firstCol).toBe(2);
    expect(resolvePngPlayback(sprite, 'walk', 3).clip.row).toBe(4);
    expect(resolvePngPlayback(sprite, 'walk', 99).clip.row).toBe(4);
  });

  it('stands a missing state in with the idle clip at the same tier, flagged', () => {
    const sprite = stripSprite();
    const hurt = resolvePngPlayback(sprite, 'hurt', 2);
    expect(hurt.clip).toEqual(sprite.clips.idle[2]);
    expect(hurt.fallback).toBe('hurt');
    expect(resolvePngPlayback(sprite, 'death', 0).fallback).toBe('death');
    expect(resolvePngPlayback(sprite, 'work', 0).fallback).toBe('work');
  });

  it('uses the sprite\'s own clip when it has one, with no fallback flag', () => {
    const own = tiers(clip({ row: 6, frames: 4, fps: 8, loop: false }));
    const sprite = stripSprite({ clips: { ...stripSprite().clips, hurt: own } });
    const hurt = resolvePngPlayback(sprite, 'hurt', 1);
    expect(hurt.clip.row).toBe(6);
    expect(hurt.fallback).toBeNull();
    expect(resolvePngPlayback(sprite, 'attack', 0).fallback).toBeNull();
  });
});

describe('getPngPlaybackCssVars', () => {
  it('a loop takes the unit phase; a one-shot starts on its first frame', () => {
    const sprite = stripSprite();
    const loop = getPngPlaybackCssVars(sprite, { clip: clip({ frames: 4, fps: 4 }), tier: 0, fallback: null }, 0.25);
    expect(loop['--delay']).toBe('-0.25s');
    expect(loop['--iter']).toBe('infinite');
    const once = getPngPlaybackCssVars(sprite, { clip: clip({ frames: 4, fps: 4, loop: false }), tier: 0, fallback: null }, 0.25);
    expect(once['--delay']).toBe('0s');
    expect(once['--iter']).toBe('1');
    expect(getPngPlaybackCssVars(sprite, { clip: clip(), tier: 0, fallback: null }, 0)['--delay']).toBe('0s'); // never "-0s"
  });

  it('writes background-position percentages from the clip', () => {
    const sprite = stripSprite();
    const single = getPngPlaybackCssVars(sprite, { clip: clip({ firstCol: 2, frames: 1 }), tier: 2, fallback: null }, 0);
    expect(single['--from']).toBe('28.5714%');
    expect(single['--to']).toBe('28.5714%');
    const full = getPngPlaybackCssVars(sprite, { clip: clip({ row: 3, firstCol: 0, frames: 8, fps: 8 }), tier: 0, fallback: null }, 0);
    expect(full['--from']).toBe('0%');
    expect(full['--to']).toBe('100%');
    expect(full['--row']).toBe('42.8571%');
    expect(full['--steps']).toBe('8');
    expect(full['--dur']).toBe('1s');
  });

  it('does not divide by zero on a one-column, one-row sheet', () => {
    const vars = getPngPlaybackCssVars(stripSprite({ cols: 1, rows: 1 }), { clip: clip({ frames: 1 }), tier: 0, fallback: null }, 0);
    expect(vars['--row']).toBe('0%');
    expect(vars['--from']).toBe('0%');
    expect(vars['--to']).toBe('0%');
  });
});

describe('hasPngDeathClip', () => {
  it('is false for every shipped puppet unit and for a unit with no PNG row', () => {
    expect(getPngUnitManifest('cavalry')).not.toBeNull();
    expect(hasPngDeathClip('cavalry')).toBe(false);
    expect(hasPngDeathClip('warrior')).toBe(false);
    expect(hasPngDeathClip('__proto__')).toBe(false);
  });
});
