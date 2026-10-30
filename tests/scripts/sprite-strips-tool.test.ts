import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
  cpSync(join(REPO, 'scripts/sprite-puppet/strip-prompts'), join(root, 'scripts/sprite-puppet/strip-prompts'), { recursive: true });
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

// A synthetic biped on a transparent canvas: red tunic body (rows 60-479), a blue back leg and a green front leg (rows 480-689),
// optionally a thin spear shaft left of the legs, a bow tip hanging below the hem, or a bar that joins the legs.
const BIPED = `
def biped(img, ox=0, shaft=True, join=False, tip=False):
    d = ImageDraw.Draw(img)
    d.rectangle((ox + 150, 60, ox + 350, 479), fill=(224, 16, 16, 255))
    if shaft:
        d.rectangle((ox + 110, 60, ox + 116, 689), fill=(150, 100, 50, 255))
    d.rectangle((ox + 180, 480, ox + 230, 689), fill=(0, 0, 255, 255))
    d.rectangle((ox + 270, 480, ox + 320, 689), fill=(0, 200, 0, 255))
    if join:
        d.rectangle((ox + 231, 480, ox + 269, 689), fill=(120, 120, 120, 255))
    if tip:
        d.rectangle((ox + 335, 440, ox + 350, 540), fill=(150, 100, 50, 255))
`;

const prelude = (root: string): string => `
import importlib.util, json, sys
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw
s = importlib.util.spec_from_file_location('strips', ${JSON.stringify(join(root, 'scripts/sprite-puppet/strips.py'))})
m = importlib.util.module_from_spec(s); sys.modules['strips'] = m; s.loader.exec_module(m)
${BIPED}
`;

/** Run Python against the sandboxed tool and parse the JSON it prints. */
const py = (root: string, body: string): any =>
  JSON.parse(execFileSync('python3', ['-I', '-c', `${prelude(root)}\n${body}`], { encoding: 'utf8' }));

describe.skipIf(!haveDeps)('strips.py rig calibration and per-tier walks (#364 prototype)', () => {
  it('calibrate finds the hem on a synthetic biped', () => {
    const { root } = sandbox();
    const cut = py(root, `
img = Image.new('RGBA', (500, 760), (0, 0, 0, 0)); biped(img)
print(json.dumps(m.calibrate(np.array(img), {})))
`);
    expect(Math.abs(cut.cut_y - 480)).toBeLessThanOrEqual(3);
    expect(cut.overlap_top).toBeLessThan(cut.cut_y);
    expect(cut.hip_y).toBeGreaterThan(cut.cut_y);
    expect(cut.knee_y).toBeGreaterThan(cut.hip_y);
    expect(cut.knee_y).toBeLessThan(689);
  });

  it('calibrate cuts below a bow tip', () => {
    const { root } = sandbox();
    const cut = py(root, `
img = Image.new('RGBA', (500, 760), (0, 0, 0, 0)); biped(img, shaft=False, tip=True)
print(json.dumps(m.calibrate(np.array(img), {'shafts': 0})))
`);
    // the tip hangs to row 540; the cut may sit where only a speck of it is left (under min_piece), never higher
    expect(cut.cut_y).toBeGreaterThanOrEqual(530);
    expect(cut.cut_y).toBeLessThan(600);
  });

  it('calibrate returns hand-picked keys unchanged', () => {
    const { root } = sandbox();
    const keys = { cut_y: 123, overlap_top: 100, hip_y: 130, knee_y: 200 };
    const cut = py(root, `
img = Image.new('RGBA', (500, 760), (0, 0, 0, 0)); biped(img)
print(json.dumps(m.calibrate(np.array(img), ${JSON.stringify(keys)})))
`);
    expect(cut).toEqual(keys);
  });

  it('the calibrate command fails clearly when the legs touch', () => {
    const { root, sources, tool } = sandbox();
    draw(`${BIPED}
img = Image.new('RGBA', (500, 760), (0, 0, 0, 0)); biped(img, shaft=False, join=True)
img.save(${JSON.stringify(join(sources, 'a.png'))})
`);
    const spec = writeSpec(root, [
      { state: 'idle', file: 'a', cells: 1, fps: 4 },
      { state: 'walkrig', cells: 8, fps: 10, rig: { source: 'a', shafts: 0 } },
    ]);
    const r = run(tool, ['calibrate', spec, '--sources', sources]);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toMatch(/expected 2 legs below the hem/);
    expect(r.stdout).toMatch(/redraw the master/);
  });

  it('the walk alternates legs: the forward-most foot differs between the two strides', () => {
    const { root } = sandbox();
    const lead = py(root, `
img = Image.new('RGBA', (500, 760), (0, 0, 0, 0)); biped(img)
out = []
for rgba, mask in m.walk_frames(np.array(img), {}, 8):
    ys, xs = np.where(mask)
    low = ys > ys.max() - 0.2 * (ys.max() - ys.min())
    x = xs[low].max()
    y = ys[low][xs[low] == x][0]
    r, g, b = rgba[y, x, :3]
    out.append('blue' if b > g else 'green')
print(json.dumps(out))
`);
    expect(lead[2]).not.toBe(lead[6]);
    expect(new Set(lead)).toEqual(new Set(['blue', 'green']));
  });

  it('a tier that will not calibrate walks like the master, with a warning, and the tiers are listed', () => {
    const { root, sources, tool } = sandbox();
    draw(`${BIPED}
img = Image.new('RGBA', (500, 760), (0, 0, 0, 0)); biped(img, shaft=False)
img.save(${JSON.stringify(join(sources, 'a.png'))})
img = Image.new('RGBA', (1000, 760), (0, 0, 0, 0)); biped(img, 0, shaft=False); biped(img, 500, shaft=False, join=True)
img.save(${JSON.stringify(join(sources, 'd.png'))})
`);
    const spec = writeSpec(root, [
      { state: 'idle', file: 'a', cells: 1, fps: 4 },
      { state: 'damage', file: 'd', cells: 2, fps: 1, loop: false },
      { state: 'walkrig', cells: 8, fps: 10, anchor: 'torso', rig: { sources: ['a', 'd#1'], shafts: 0 } },
    ]);
    const out = join(root, 'out');
    const r = run(tool, ['build', spec, '--sources', sources, '--out', out]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/warn\s+rig_cut\s+d#1/);
    const same = py(root, `
man = json.loads(Path(${JSON.stringify(join(out, 'manifest.json'))}).read_text())
sheet = np.array(Image.open(${JSON.stringify(join(out, 'sheet.png'))}))
H = man['cellHeight']
a, b = man['states']['walkrig']['row'], man['states']['walkrig@1']['row']
print(json.dumps({'tiers': man['tiers'], 'same': bool(np.array_equal(sheet[a * H:(a + 1) * H], sheet[b * H:(b + 1) * H]))}))
`);
    expect(same.tiers).toEqual({ walkrig: ['walkrig', 'walkrig@1'] });
    expect(same.same).toBe(true);
  });
});

const BIPED_PROMPT = {
  name: 'Archer', look: 'A lean young archer with a leather hood.', team_area: 'his tunic', identity: 'the same hood, tunic and bow',
  weapon_pose: 'He holds the bow upright in his left hand.', attack_frames: 6, attack: '(1) ready; (2) draw; (3) release.',
  damage_gear: 'a cracked bow', damage_gear_critical: 'a split bow limb', defeat_prop: 'leaning on the bow',
};

function writePromptSpec(root: string, over: Record<string, unknown>, prompt: Record<string, unknown> = BIPED_PROMPT): string {
  const path = join(root, 'demo.json');
  writeFileSync(path, JSON.stringify({ id: 'demo', family: 'biped', frame: {}, tint: TINT, states: [], prompt, ...over }));
  return path;
}

describe.skipIf(!haveDeps)('strips.py prompt (#364 prototype)', () => {
  it('fills every placeholder of both prompts from the family and the spec', () => {
    const { root, tool } = sandbox();
    const r = run(tool, ['prompt', writePromptSpec(root, {})]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const a = readFileSync(join(root, '.verification/strips/demo/prompt-a.txt'), 'utf8');
    const b = readFileSync(join(root, '.verification/strips/demo/prompt-b.txt'), 'utf8');
    for (const text of [a, b]) expect(text).not.toMatch(/\{\{|\}\}/);
    expect(a).toContain('two separate shapes');
    expect(a).toContain('A lean young archer with a leather hood.');
    expect(a).toContain('paint his tunic saturated pure red');
    expect(b).toContain('Paint his tunic saturated pure red');
    expect(b).toContain('DAMAGE (4 frames');
    expect(b).toContain('a split bow limb');
    expect(b).toContain('ATTACK (6 frames');
  });

  it('names a missing spec key', () => {
    const { root, tool } = sandbox();
    const { team_area: _omit, ...rest } = BIPED_PROMPT;
    const r = run(tool, ['prompt', writePromptSpec(root, {}, rest)]);
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('prompt.team_area');
  });

  it('rejects an unknown family and lists the real ones', () => {
    const { root, tool } = sandbox();
    const r = run(tool, ['prompt', writePromptSpec(root, { family: 'boat' })]);
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toMatch(/unknown family "boat".*biped.*mounted/);
  });

  it('uses the family pose: a mounted spec asks for four separate legs, not two', () => {
    const { root, tool } = sandbox();
    const mounted = { ...BIPED_PROMPT, coat: 'The horse is dapple-grey.' };
    const r = run(tool, ['prompt', writePromptSpec(root, { family: 'mounted' }, mounted)]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const a = readFileSync(join(root, '.verification/strips/demo/prompt-a.txt'), 'utf8');
    expect(a).toContain('four legs read as four separate posts');
    expect(a).not.toContain('two separate shapes');
  });
});
