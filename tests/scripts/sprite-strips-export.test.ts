import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simTimeout } from '../helpers/sim-timeout';
import { ATTACK_STATE_MS, DEATH_STATE_MS, HURT_STATE_MS } from '@/renderer/pirate-sprite-state';
import { PNG_STRIP_FEET_LINE } from '@/renderer/sprites/png/png-sprite-layout';

// #1627: `strips.py export` repacks an approved strip preview into the files the game plays. It runs in a throwaway copy of the
// scripts on a small synthetic preview, so the real design/ and public/ trees are never touched. Every preview frame is a flat
// rectangle whose colour encodes (source row, source column), so a test can trace exactly which frame landed in which game cell.
// Skipped where python3 with Pillow and numpy is unavailable.

const REPO = resolve(__dirname, '../..');
const haveDeps = spawnSync('python3', ['-I', '-c', 'import PIL, numpy, scipy'], { encoding: 'utf8' }).status === 0;

const W = 80;
const H = 64;
const BASELINE = 56;

/** The preview's rows, in order: [state, frames, fps, loop]. Source row index = position here. */
const ROWS: Array<[string, number, number, boolean]> = [
  ['idle', 1, 4, true], ['damage', 4, 1, false],
  ['walkrig', 8, 10, true], ['walkrig@1', 8, 10, true], ['walkrig@2', 8, 10, true], ['walkrig@3', 8, 10, true], ['walkrig@4', 8, 10, true],
  ['attack', 6, 9, false], ['hit', 5, 8, false], ['defeat', 5, 5, false], ['work', 4, 6, true],
];

interface PreviewOptions {
  frames?: Record<string, number>;
  /** Source pixels to shift every frame of a row sideways. */
  shift?: Record<string, number>;
  /** Half the figure's width in source pixels (default 10). */
  halfWidth?: number;
  /** Rows to leave out of the preview. */
  omit?: string[];
  /** Leave the `tiers` group out of the manifest (one walk for every tier). */
  untiered?: boolean;
}

function sandbox(): { root: string; tool: string } {
  const root = mkdtempSync(join(tmpdir(), 'sprite-strips-export-'));
  for (const name of ['strips.py', 'strips_export.py', 'puppet.py']) {
    mkdirSync(join(root, 'scripts/sprite-puppet'), { recursive: true });
    cpSync(join(REPO, 'scripts/sprite-puppet', name), join(root, 'scripts/sprite-puppet', name));
  }
  cpSync(join(REPO, 'scripts/sprite-puppet/strip-prompts'), join(root, 'scripts/sprite-puppet/strip-prompts'), { recursive: true });
  return { root, tool: join(root, 'scripts/sprite-puppet/strips.py') };
}

function makePreview(root: string, options: PreviewOptions = {}): string {
  const dir = join(root, 'preview');
  mkdirSync(dir, { recursive: true });
  const rows = ROWS.filter(([name]) => !options.omit?.includes(name)).map(([name, frames, fps, loop]) => [name, options.frames?.[name] ?? frames, fps, loop]);
  execFileSync('python3', ['-I', '-c', `
import json
import numpy as np
from PIL import Image
W, H, COLS, BASE = ${W}, ${H}, 8, ${BASELINE}
rows = json.loads(${JSON.stringify(JSON.stringify(rows))})
shift = json.loads(${JSON.stringify(JSON.stringify(options.shift ?? {}))})
half = ${options.halfWidth ?? 10}
source_row = {name: i for i, (name, *_rest) in enumerate(json.loads(${JSON.stringify(JSON.stringify(ROWS))}))}
sheet = np.zeros((len(rows) * H, COLS * W, 4), np.uint8)
mask = np.zeros_like(sheet)
manifest_states = {}
for r, (name, frames, fps, loop) in enumerate(rows):
    manifest_states[name] = {'row': r, 'frames': frames, 'fps': fps, 'loop': loop, 'note': ''}
    for c in range(frames):
        x0 = W // 2 - half + shift.get(name, 0)
        ys, xs = slice(r * H + BASE - 40, r * H + BASE), slice(c * W + x0, c * W + x0 + 2 * half)
        sheet[ys, xs] = (source_row[name] * 20, (c * 30) % 256, 128, 255)
        # the mask is not quantised, so its alpha carries the frame's identity exactly: 10 + 2 * (source row * 8 + column)
        mask[ys, xs] = (255, 255, 255, 10 + 2 * (source_row[name] * 8 + min(c, 7)))
manifest = {'id': 'demo', 'family': 'biped', 'cellWidth': W, 'cellHeight': H, 'cols': COLS, 'rows': len(rows), 'baseline': BASE,
            'restHeight': 40, 'states': manifest_states, 'sheet': 'sheet.png', 'mask': 'mask.png', 'facing': 'right'}
if not ${options.untiered ? 'True' : 'False'}:
    manifest['tiers'] = {'walkrig': ['walkrig', 'walkrig@1', 'walkrig@2', 'walkrig@3', 'walkrig@4']}
Image.fromarray(sheet).save(${JSON.stringify(join(dir, 'sheet.png'))})
Image.fromarray(mask).save(${JSON.stringify(join(dir, 'mask.png'))})
open(${JSON.stringify(join(dir, 'manifest.json'))}, 'w').write(json.dumps(manifest))
`]);
  return dir;
}

interface Exported { status: number | null; out: string; public: string; generated: string }

/** Scale 1 keeps every edge crisp, so the palette stays exact and a frame can be traced by its colour. */
function runExport(root: string, tool: string, preview: string, extra: string[] = [], scale = 1): Exported {
  const spec = join(root, 'demo.json');
  writeFileSync(spec, JSON.stringify({ id: 'demo' }));
  const pub = join(root, 'out/public');
  const gen = join(root, 'out/generated');
  const r = spawnSync('python3', ['-I', tool, 'export', spec, '--preview', preview, '--public', pub, '--generated', gen, '--scale', String(scale), ...extra], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr, public: pub, generated: gen };
}

/** The generated manifest as an object (the file is `export const sprite: PngUnitSprite = {...};`). */
function readSprite(generated: string): any {
  const text = readFileSync(join(generated, 'demo.manifest.ts'), 'utf8');
  return JSON.parse(text.slice(text.indexOf('= {') + 2, text.lastIndexOf(';')));
}

/** Which source (row name, column) the exported cell at (row, col) was copied from, read back from its colour. */
function sourceOf(pub: string, sprite: any, row: number, col: number): string {
  const W2 = sprite.cellWidth, H2 = sprite.cellHeight;
  const out = execFileSync('python3', ['-I', '-c', `
import json
from PIL import Image
sheet = Image.open(${JSON.stringify(join(pub, 'sheet.png'))}).convert('RGBA')
mask = Image.open(${JSON.stringify(join(pub, 'mask.png'))}).convert('LA')
x, y = ${col} * ${W2} + ${W2} // 2, ${row} * ${H2} + round(${sprite.baseline}) - 5
r, g, b, a = sheet.getpixel((x, y))
print(json.dumps([r, a, mask.getpixel((x, y))[1]]))
`], { encoding: 'utf8' });
  const [red, sheetAlpha, maskAlpha] = JSON.parse(out) as [number, number, number];
  if (sheetAlpha === 0 && maskAlpha === 0) return 'empty';
  const id = (maskAlpha - 10) / 2; // exact: the mask is not quantised
  const srcRow = Math.floor(id / 8);
  // the sheet's colour (palette-quantised, so only roughly) must come from the same source row
  expect(Math.abs(red / 20 - srcRow), `sheet colour of cell ${row},${col}`).toBeLessThanOrEqual(1);
  expect(sheetAlpha, `sheet is opaque where the mask is, cell ${row},${col}`).toBe(255);
  return `${ROWS[srcRow]![0]}#${id % 8}`;
}

// Every test here starts python3 (several times) and does numpy/scipy image work, so it is a heavy test in the sense of
// .claude/rules/hooks-and-tooling.md ("Heavy simulation tests need an explicit, headroom-sized timeout", #608): solo, the slowest
// takes about 4.4 s on a quiet host, and the 5 s default failed the push gate (and so the PR) when the host was busy. One constant sizes
// the whole block from the solo worst case, so a test added later inherits the headroom.
const PYTHON_TOOL_TIMEOUT_MS = simTimeout(5000);

describe.skipIf(!haveDeps)('strips.py export (#1627)', { timeout: PYTHON_TOOL_TIMEOUT_MS }, () => {
  it('packs the standing poses by tier, one walk row per tier, then the one-shots, and maps the tiers like the viewer does', () => {
    const { root, tool } = sandbox();
    const result = runExport(root, tool, makePreview(root));
    expect(result.status, result.out).toBe(0);
    const sprite = readSprite(result.generated);
    expect(sprite.rows).toBe(8); // poses, four walk rows, attack, hurt, death
    expect([sprite.cellWidth, sprite.cellHeight, sprite.baseline]).toEqual([W, H, BASELINE]);
    // the idle row: tier 0 is the master, tiers 1..3 are the damage drawings' columns 1..3
    expect(sourceOf(result.public, sprite, 0, 0)).toBe('idle#0');
    expect([1, 2, 3].map(t => sourceOf(result.public, sprite, 0, t))).toEqual(['damage#1', 'damage#2', 'damage#3']);
    expect(sprite.clips.idle.map((c: any) => [c.row, c.firstCol, c.frames])).toEqual([[0, 0, 1], [0, 1, 1], [0, 2, 1], [0, 3, 1]]);
    // walk tier t is the tier group's entry t + 1 (the master's own walk is not played)
    const walkSources = [0, 1, 2, 3].map(t => sourceOf(result.public, sprite, sprite.clips.walk[t].row, 0));
    expect(walkSources).toEqual(['walkrig@1#0', 'walkrig@2#0', 'walkrig@3#0', 'walkrig@4#0']);
    // one-shots: from fire/attack, hit and the death row, played once at every tier
    for (const [kind, from] of [['attack', 'attack#0'], ['hurt', 'hit#0'], ['death', 'defeat#0']] as const) {
      const clips = sprite.clips[kind];
      expect(clips, kind).toHaveLength(4);
      expect(clips.every((c: any) => c.loop === false && c.row === clips[0].row), kind).toBe(true);
      expect(sourceOf(result.public, sprite, clips[0].row, 0), kind).toBe(from);
    }
    expect(sprite.clips.attack[0]).toMatchObject({ frames: 6, fps: 9, firstCol: 0 });
  }, 60000);

  it('uses a single walk row at every tier when the preview has no tiers', () => {
    const { root, tool } = sandbox();
    const result = runExport(root, tool, makePreview(root, { untiered: true, omit: ['walkrig@1', 'walkrig@2', 'walkrig@3', 'walkrig@4'] }));
    expect(result.status, result.out).toBe(0);
    const sprite = readSprite(result.generated);
    expect(sprite.rows).toBe(5);
    expect(new Set(sprite.clips.walk.map((c: any) => c.row)).size).toBe(1);
    expect(sourceOf(result.public, sprite, sprite.clips.walk[0].row, 0)).toBe('walkrig#0');
  }, 60000);

  it('drops the rows the game never plays', () => {
    const { root, tool } = sandbox();
    const result = runExport(root, tool, makePreview(root));
    const sprite = readSprite(result.generated);
    const seen = new Set<string>();
    for (let row = 0; row < sprite.rows; row++) for (let col = 0; col < sprite.cols; col++) seen.add(sourceOf(result.public, sprite, row, col).split('#')[0]!);
    expect(seen.has('work')).toBe(false); // the work row
    expect(seen.has('walkrig')).toBe(false); // the master walk
  }, 120000);

  it('scales every cell and the ground line by --scale', () => {
    const { root, tool } = sandbox();
    const result = runExport(root, tool, makePreview(root), [], 0.5);
    expect(result.status, result.out).toBe(0);
    const sprite = readSprite(result.generated);
    expect([sprite.cellWidth, sprite.cellHeight, sprite.baseline]).toEqual([W / 2, H / 2, BASELINE / 2]);
    const size = execFileSync('python3', ['-I', '-c', `
from PIL import Image
print(*Image.open(${JSON.stringify(join(result.public, 'sheet.png'))}).size)
`], { encoding: 'utf8' }).trim();
    expect(size).toBe(`${sprite.cols * sprite.cellWidth} ${sprite.rows * sprite.cellHeight}`);
  }, 60000);

  it('writes a palette sheet and an alpha-only mask, and reports what it cost', () => {
    const { root, tool } = sandbox();
    const result = runExport(root, tool, makePreview(root));
    expect(result.status, result.out).toBe(0);
    const modes = execFileSync('python3', ['-I', '-c', `
from PIL import Image
print(Image.open(${JSON.stringify(join(result.public, 'sheet.png'))}).mode, Image.open(${JSON.stringify(join(result.public, 'mask.png'))}).mode)
`], { encoding: 'utf8' }).trim();
    expect(modes).toBe('P LA');
    expect(result.out).toMatch(/KB on disk \(budget 640\), [\d.]+ MiB decoded \(budget 24\)/);
  }, 60000);

  it('refuses a one-shot longer than the game holds it, naming the row, and writes nothing', () => {
    const { root, tool } = sandbox();
    // 13 frames at 9 fps is 1.44 s: inside the 1.5 s attack hold
    const fits = runExport(root, tool, makePreview(root, { frames: { attack: 13 } }));
    expect(fits.status, fits.out).toBe(0);
    // 14 frames at 9 fps is 1.56 s, and 8 frames at 8 fps is 1.0 s against the 0.7 s hurt hold
    const attack = runExport(root, tool, makePreview(root, { frames: { attack: 14 } }));
    expect(attack.status, attack.out).toBe(1);
    expect(attack.out).toMatch(/attack \(attack\) lasts 1\.56s .*holds it for 1\.5s/);
    const hurt = runExport(root, tool, makePreview(root, { frames: { hit: 8 } }));
    expect(hurt.status, hurt.out).toBe(1);
    expect(hurt.out).toMatch(/hit \(hurt\) lasts 1\.00s .*holds it for 0\.7s/);
  }, 180000);

  it('refuses a rest-pose row anchored away from the idle pose', () => {
    const { root, tool } = sandbox();
    const result = runExport(root, tool, makePreview(root, { shift: { 'walkrig@2': 30 } })); // 30 px off, still inside the cell
    expect(result.status, result.out).toBe(1);
    expect(result.out).toMatch(/walkrig@2 frame 0 is centred \+30px from the idle pose/);
    expect(existsSync(join(result.public, 'sheet.png'))).toBe(false);
  }, 60000);

  it('names the idle pose when it is the one off-centre', () => {
    const { root, tool } = sandbox();
    const result = runExport(root, tool, makePreview(root, { shift: { idle: 30 } }));
    expect(result.status, result.out).toBe(1);
    expect(result.out).toMatch(/the idle pose is centred \+30px from the middle of its cell/);
  }, 60000);

  it('refuses a rest pose that reaches outside the unit box', () => {
    const { root, tool } = sandbox();
    const result = runExport(root, tool, makePreview(root, { halfWidth: 40 })); // a figure as wide as the cell, wider than the 64 px unit box
    expect(result.status, result.out).toBe(1);
    expect(result.out).toMatch(/reaches outside the unit box/);
  }, 60000);

  it('refuses a sheet over either budget, and names which', () => {
    const { root, tool } = sandbox();
    const preview = makePreview(root);
    const disk = runExport(root, tool, preview, ['--max-kb', '1']);
    expect(disk.status, disk.out).toBe(1);
    expect(disk.out).toMatch(/KB on disk; the budget is 1 KB/);
    const memory = runExport(root, tool, preview, ['--max-mib', '0.01']);
    expect(memory.status, memory.out).toBe(1);
    expect(memory.out).toMatch(/decoded sheets would take [\d.]+ MiB; the budget is 0 MiB/);
  }, 120000);

  it('refuses a preview that lacks a role the game plays', () => {
    const { root, tool } = sandbox();
    const result = runExport(root, tool, makePreview(root, { omit: ['hit'] }));
    expect(result.status, result.out).toBe(1);
    expect(result.out).toMatch(/no hurt row: the preview has none of hit/);
  }, 60000);

  it('keeps the numbers it mirrors from the game in step with the game', () => {
    const { root } = sandbox();
    const printed = execFileSync('python3', ['-I', '-c', `
import importlib.util, json
spec = importlib.util.spec_from_file_location('strips_export', ${JSON.stringify(join(root, 'scripts/sprite-puppet/strips_export.py'))})
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
print(json.dumps({'holds': mod.HOLD_SECONDS, 'feet': mod.FEET_LINE}))
`], { encoding: 'utf8' });
    const mirrored = JSON.parse(printed) as { holds: Record<string, number>; feet: number };
    expect(mirrored.holds).toEqual({ attack: ATTACK_STATE_MS / 1000, hurt: HURT_STATE_MS / 1000, death: DEATH_STATE_MS / 1000 });
    expect(mirrored.feet).toBe(PNG_STRIP_FEET_LINE);
  }, 30000);
});
