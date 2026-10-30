import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #364 prototype: the image-strip intake tool (scripts/sprite-puppet/strips.py). It runs in a throwaway copy of the two scripts
// (the tool derives the repo root from its own path), on synthetic images, so the real design/ tree is never touched.
// Skipped where python3 with Pillow, numpy and scipy is unavailable.

const REPO = resolve(__dirname, '../..');
const haveDeps = spawnSync('python3', ['-I', '-c', 'import PIL, numpy, scipy'], { encoding: 'utf8' }).status === 0;

function sandbox(): { root: string; sources: string; tool: string } {
  const root = mkdtempSync(join(tmpdir(), 'sprite-strips-'));
  for (const rel of ['scripts/sprite-puppet/strips.py', 'scripts/sprite-puppet/puppet.py']) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    cpSync(join(REPO, rel), join(root, rel));
  }
  const sources = join(root, 'originals');
  mkdirSync(sources);
  return { root, sources, tool: join(root, 'scripts/sprite-puppet/strips.py') };
}

/** Run a small Python program that draws synthetic images with Pillow. */
const draw = (code: string): void => {
  execFileSync('python3', ['-I', '-c', `from PIL import Image, ImageDraw\n${code}`]);
};

const run = (tool: string, args: string[]) => spawnSync('python3', ['-I', tool, ...args], { encoding: 'utf8' });

const TINT = { hue_ranges: [[0, 0.045], [0.955, 1]], min_sat: 0.45, min_val: 0.18 };

function writeSpec(root: string, states: Record<string, unknown>[]): string {
  const path = join(root, 'demo.json');
  writeFileSync(path, JSON.stringify({ id: 'demo', frame: { height: 192, baseline: 176, restHeight: 150 }, tint: TINT, states }));
  return path;
}

/** `n` dark-grey figures (60x120) on a flat magenta field, spaced along one row. */
const magentaRow = (file: string, n: number, extra = ''): string => `
im = Image.new('RGB', (${n} * 200 + 100, 300), (255, 0, 255))
d = ImageDraw.Draw(im)
for i in range(${n}):
    d.rectangle((100 + i * 200, 90, 160 + i * 200, 210), fill=(70, 70, 80))
${extra}
im.save(${JSON.stringify(file)})
`;

describe.skipIf(!haveDeps)('strips.py (#364 prototype)', () => {
  it('probe reports a white background as code "background"', () => {
    const { root, sources, tool } = sandbox();
    draw(`
im = Image.new('RGB', (1200, 400), (255, 255, 255))
d = ImageDraw.Draw(im)
for i in range(3):
    d.rectangle((100 + i * 350, 100, 200 + i * 350, 300), fill=(40, 40, 60))
im.save(${JSON.stringify(join(sources, 'a.png'))})
`);
    const spec = writeSpec(root, [{ state: 'idle', file: 'a', cells: 3, fps: 4 }]);
    const r = run(tool, ['probe', spec, '--sources', sources]);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toMatch(/error\s+background\b/);
  });

  it('probe counts figures', () => {
    const { root, sources, tool } = sandbox();
    draw(magentaRow(join(sources, 'a.png'), 5));
    const spec = writeSpec(root, [{ state: 'idle', file: 'a', cells: 6, fps: 4 }]);
    const r = run(tool, ['probe', spec, '--sources', sources]);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toMatch(/error\s+count\b.*expected 6, found 5/);
  });

  it('probe reports a leftover piece', () => {
    const { root, sources, tool } = sandbox();
    draw(magentaRow(join(sources, 'a.png'), 6, 'd.rectangle((20, 20, 100, 70), fill=(70, 70, 80))'));
    const spec = writeSpec(root, [{ state: 'idle', file: 'a', cells: 6, fps: 4 }]);
    const r = run(tool, ['probe', spec, '--sources', sources]);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toMatch(/error\s+leftover\b/);
  });

  it('probe passes a clean strip and exits 0', () => {
    const { root, sources, tool } = sandbox();
    draw(magentaRow(join(sources, 'a.png'), 4));
    const spec = writeSpec(root, [{ state: 'idle', file: 'a', cells: 4, fps: 4 }]);
    const r = run(tool, ['probe', spec, '--sources', sources]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(/\berror\b/);
  });

  it('reads an uneven 2x2 grid in reading order', () => {
    const { root, sources, tool } = sandbox();
    // greys 50, 100, 150, 200 are tiers 1..4; the bottom-left one sits 40 px lower than the bottom-right one
    draw(`
im = Image.new('RGB', (900, 700), (255, 0, 255))
d = ImageDraw.Draw(im)
d.rectangle((100, 60, 200, 260), fill=(50, 50, 50))
d.rectangle((500, 60, 600, 260), fill=(100, 100, 100))
d.rectangle((100, 440, 200, 640), fill=(150, 150, 150))
d.rectangle((500, 400, 600, 600), fill=(200, 200, 200))
im.save(${JSON.stringify(join(sources, 'd.png'))})
`);
    const spec = writeSpec(root, [{ state: 'damage', file: 'd', cells: 4, grid: [2, 2], fps: 1 }]);
    const out = join(root, 'tier.txt');
    const code = `
import importlib.util, json, sys
from pathlib import Path
s = importlib.util.spec_from_file_location('strips', ${JSON.stringify(join(root, 'scripts/sprite-puppet/strips.py'))})
m = importlib.util.module_from_spec(s); sys.modules['strips'] = m; s.loader.exec_module(m)
spec = json.loads(Path(${JSON.stringify(spec)}).read_text())
vals = []
for i in range(4):
    a = m.load_source_figure(spec, Path(${JSON.stringify(sources)}), 'd#%d' % i)
    vals.append(int(a[a.shape[0] // 2, a.shape[1] // 2, 0]))
Path(${JSON.stringify(out)}).write_text(json.dumps(vals))
`;
    execFileSync('python3', ['-I', '-c', code]);
    expect(JSON.parse(require('node:fs').readFileSync(out, 'utf8'))).toEqual([50, 100, 150, 200]);
  });

  it('flags a red leak in one image only', () => {
    const { root, sources, tool } = sandbox();
    // master: a grey figure with a small red patch (about 3% of it); attack: figures a quarter red
    draw(`
im = Image.new('RGB', (400, 300), (255, 0, 255))
d = ImageDraw.Draw(im)
d.rectangle((150, 90, 250, 210), fill=(70, 70, 80))
d.rectangle((150, 100, 250, 104), fill=(224, 16, 16))
im.save(${JSON.stringify(join(sources, 'a.png'))})
im = Image.new('RGB', (700, 300), (255, 0, 255))
d = ImageDraw.Draw(im)
for i in range(3):
    x = 60 + i * 200
    d.rectangle((x, 90, x + 100, 210), fill=(70, 70, 80))
    d.rectangle((x, 90, x + 100, 120), fill=(224, 16, 16))
im.save(${JSON.stringify(join(sources, 'c.png'))})
`);
    const spec = writeSpec(root, [
      { state: 'idle', file: 'a', cells: 1, fps: 4 },
      { state: 'attack', file: 'c', cells: 3, fps: 9 },
    ]);
    const r = run(tool, ['probe', spec, '--sources', sources]);
    expect(r.stdout).toMatch(/warn\s+tint_leak\s+c\b/);
    expect(r.stdout).not.toMatch(/tint_leak\s+a\b/);
  });
});
