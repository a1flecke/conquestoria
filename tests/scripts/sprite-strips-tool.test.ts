import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    const { root, sources } = sandbox();
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
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual([50, 100, 150, 200]);
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

  it('a prop beside the foot does not ride along with the swinging leg (unless band_full asks for the old span)', () => {
    const { root } = sandbox();
    // a yellow bow tip hangs beside the front leg down to row 540; the front foot has a toe reaching out under it
    const counts = py(root, `
img = Image.new('RGBA', (500, 760), (0, 0, 0, 0)); biped(img, shaft=False)
d = ImageDraw.Draw(img)
d.rectangle((335, 440, 350, 540), fill=(250, 250, 0, 255))
d.rectangle((320, 660, 380, 689), fill=(0, 200, 0, 255))
def yellow(flag):
    out = []
    for rgba, mask in m.walk_frames(np.array(img), {'shafts': 0, 'band_full': flag}, 8):
        out.append(int(((rgba[..., 0] > 0.9) & (rgba[..., 1] > 0.9) & (rgba[..., 2] < 0.2) & (rgba[..., 3] > 0.5)).sum()))
    return out
print(json.dumps({'thigh': yellow(False), 'whole': yellow(True)}))
`);
    const note = JSON.stringify(counts);
    const spread = Math.max(...counts.thigh) - Math.min(...counts.thigh);
    // the tip is drawn once, by the body, in every frame (a few edge pixels change as the bobbing body is resampled)
    expect(spread, note).toBeLessThan(0.03 * counts.thigh[0]);
    // the older whole-leg span copies the rows beside the hem onto the leg, so more yellow shows
    expect(Math.max(...counts.whole), note).toBeGreaterThan(1.05 * Math.max(...counts.thigh));
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

// A synthetic mounted figure: a red body (rows 60-479) over four posts (rows 480-689): hind-far blue, hind-near green,
// fore-far yellow, fore-near purple. `posts` keeps only the first n of them.
const QUAD = `
POSTS = [((0, 0, 255, 255), 130), ((0, 200, 0, 255), 210), ((230, 230, 0, 255), 390), ((160, 0, 200, 255), 470)]
def quad(img, posts=4):
    d = ImageDraw.Draw(img)
    d.rectangle((100, 60, 520, 479), fill=(224, 16, 16, 255))
    for colour, x in POSTS[:posts]:
        d.rectangle((x, 480, x + 30, 689), fill=colour)
`;

describe.skipIf(!haveDeps)('strips.py four-leg rig (#364 prototype)', () => {
  const quadPy = (root: string, body: string): any =>
    JSON.parse(execFileSync('python3', ['-I', '-c', `${prelude(root)}\n${QUAD}\n${body}`], { encoding: 'utf8' }));

  it('four legs, one gait: two hooves down in every frame, each leg leads at its own phase', () => {
    const { root } = sandbox();
    const out = quadPy(root, `
img = Image.new('RGBA', (640, 760), (0, 0, 0, 0)); quad(img)
rows = []
for rgba, mask in m.walk_frames(np.array(img), {'kind': 'mounted', 'shafts': 0}, 8):
    a = rgba[..., 3] > 0.5
    ground = np.where(a.any(1))[0].max()
    body = np.where(a & (rgba[..., 0] > 0.8) & (rgba[..., 1] < 0.2) & (rgba[..., 2] < 0.2))[1].mean()
    legs = []
    for colour, _ in POSTS:
        c = np.array(colour[:3]) / 255.0
        near = a & (np.abs(rgba[..., :3] - c).sum(-1) < 0.25)
        ys, xs = np.where(near)
        legs.append({'x': float(xs.mean() - body), 'down': bool(ys.max() >= ground - 2)})
    rows.append(legs)
print(json.dumps(rows))
`);
    for (const frame of out) expect(frame.filter((l: { down: boolean }) => l.down).length).toBeGreaterThanOrEqual(2);
    const lead = [0, 1, 2, 3].map((k) => out.map((f: { x: number }[]) => f[k].x).indexOf(Math.max(...out.map((f: { x: number }[]) => f[k].x))));
    // hind-far 0.0, hind-near 0.5, fore-far 0.75, fore-near 0.25 of the cycle
    expect(lead).toEqual([0, 4, 6, 2]);
  }, 30000);

  it('a tail hanging clear of the ground is not a leg and stays with the body', () => {
    const { root } = sandbox();
    const out = quadPy(root, `
img = Image.new('RGBA', (640, 760), (0, 0, 0, 0)); quad(img)
ImageDraw.Draw(img).rectangle((105, 480, 125, 600), fill=(90, 90, 90, 255))  # a grey tail, ends 90 px above the soles
cut = m.calibrate(np.array(img), {'kind': 'mounted'})
tail = []
for rgba, mask in m.walk_frames(np.array(img), {'kind': 'mounted'}, 8):
    grey = (np.abs(rgba[..., 0] - 90 / 255) < 0.05) & (np.abs(rgba[..., 2] - 90 / 255) < 0.05) & (rgba[..., 3] > 0.5)
    tail.append(int(grey.sum()))
print(json.dumps({'cut': cut['cut_y'], 'tail': tail}))
`);
    expect(out.cut).toBeLessThan(600);
    // the tail is drawn once, by the body, in every frame (a few edge pixels change as the bobbing body is resampled)
    expect(Math.max(...out.tail) - Math.min(...out.tail)).toBeLessThan(0.05 * out.tail[0]);
    expect(out.tail[0]).toBeGreaterThan(1000);
  }, 30000);

  it('three posts fail: calibrate exits 1 naming the expected four legs', () => {
    const { root, sources, tool } = sandbox();
    draw(`${QUAD}
img = Image.new('RGBA', (640, 760), (0, 0, 0, 0)); quad(img, 3)
img.save(${JSON.stringify(join(sources, 'a.png'))})
`);
    const spec = writeSpec(root, [
      { state: 'idle', file: 'a', cells: 1, fps: 4 },
      { state: 'walkrig', cells: 8, fps: 10, rig: { kind: 'mounted', source: 'a' } },
    ]);
    const r = run(tool, ['calibrate', spec, '--sources', sources]);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toMatch(/expected 4 legs/);
  });
});

// A synthetic vehicle: a grey hull (x 100-540, y 180-380) with a light-grey band painted along its outline (the track), a gun
// barrel out to the right (x 540-620, y 250-270) and a dark wheel disc (centre 220,380, radius 50) with one blue spoke marker.
const VEHICLE = `
HULL = (100, 180, 540, 380)
def vehicle(img, band=True):
    d = ImageDraw.Draw(img)
    d.rectangle(HULL, fill=(90, 90, 100, 255))
    if band:
        d.rectangle(HULL, outline=(160, 160, 170, 255), width=14)
    d.rectangle((540, 250, 620, 270), fill=(90, 90, 100, 255))
    d.ellipse((170, 330, 270, 430), fill=(50, 50, 55, 255))
    d.rectangle((244, 374, 256, 386), fill=(0, 200, 255, 255))  # the spoke marker, 30 px right of the wheel centre
BOX = (100, 180, 620, 430)
WHEEL = [round((220 - 100) / 520, 4), round((380 - 180) / 250, 4), round(50 / 520, 4)]
`;

describe.skipIf(!haveDeps)('strips.py vehicle rig (#364 prototype)', () => {
  const vehiclePy = (root: string, body: string): any =>
    JSON.parse(execFileSync('python3', ['-I', '-c', `${prelude(root)}\n${VEHICLE}\n${body}`], { encoding: 'utf8' }));

  it('wheels spin: the spoke marker advances 45 degrees per frame', () => {
    const { root } = sandbox();
    const angles = vehiclePy(root, `
img = Image.new('RGBA', (700, 480), (0, 0, 0, 0)); vehicle(img, band=False)
out = []
for rgba, mask, fx, lift in m.walk_frames(np.array(img), {'kind': 'vehicle', 'action': 'move', 'bob': 0, 'wheels': [WHEEL]}, 8):
    blue = (rgba[..., 2] > 0.9) & (rgba[..., 1] > 0.7) & (rgba[..., 0] < 0.2) & (rgba[..., 3] > 0.5)
    ys, xs = np.where(blue)
    cx, cy = 220 - BOX[0], 380 - BOX[1]
    out.append(float(np.degrees(np.arctan2(ys.mean() - cy, xs.mean() - cx))))
print(json.dumps(out))
`);
    for (let i = 0; i < 8; i++) {
      const step = (((angles[(i + 1) % 8] - angles[i]) % 360) + 360) % 360;
      expect(Math.abs(step - 45), JSON.stringify(angles)).toBeLessThan(8);
    }
  }, 30000);

  it('tread scrolls: a quarter of a link per frame in the band, nothing moves outside it', () => {
    const { root } = sandbox();
    const out = vehiclePy(root, `
img = Image.new('RGBA', (700, 480), (0, 0, 0, 0)); vehicle(img)
rig = {'kind': 'vehicle', 'action': 'move', 'bob': 0, 'tread': {'depth': 0.05, 'links': 16}}
frames = [rgba for rgba, mask, fx, lift in m.walk_frames(np.array(img), rig, 8)]
a = frames[0][..., 3] > 0.5
inside = m.ndi.distance_transform_edt(np.pad(a, 1))[1:-1, 1:-1]
track = np.array(img)[BOX[1]:BOX[3] + 1, BOX[0]:BOX[2] + 1, 0] == 160  # the pixels the drawing paints as track
band = a & track & (inside > 3) & (inside < 9)
core = a & (inside > 30)
lum = [f[..., 0][band] for f in frames]
corr = lambda x, y: float(np.corrcoef(x, y)[0, 1])
still = max(float(np.abs(f[..., :3][core] - frames[0][..., :3][core]).max()) for f in frames)
print(json.dumps({'quarter': corr(lum[0], lum[1]), 'half': corr(lum[0], lum[2]), 'full': corr(lum[0], lum[4]), 'still': still}))
`);
    expect(out.full, JSON.stringify(out)).toBeGreaterThan(0.95);
    expect(out.half, JSON.stringify(out)).toBeLessThan(-0.7);
    expect(Math.abs(out.quarter), JSON.stringify(out)).toBeLessThan(0.4);
    expect(out.still, JSON.stringify(out)).toBeLessThan(0.01);
  }, 30000);

  it('build emits move, fire and hit rows and keeps the recoil and the bounce when it packs them', () => {
    const { root, sources, tool } = sandbox();
    draw(`${VEHICLE}
img = Image.new('RGBA', (700, 480), (0, 0, 0, 0)); vehicle(img)
ImageDraw.Draw(img).rectangle((300, 215, 420, 245), fill=(224, 16, 16, 255))  # the team-colour band
img.save(${JSON.stringify(join(sources, 'a.png'))})
`);
    const veh = (action: string) => ({ kind: 'vehicle', action, source: 'a', bob: 0.03, wheels: [JSON.parse('[0.2308, 0.8, 0.0962]')] });
    const spec = writeSpec(root, [
      { state: 'idle', file: 'a', cells: 1, fps: 4 },
      { state: 'move', cells: 8, fps: 12, rig: veh('move') },
      { state: 'fire', cells: 8, fps: 8, loop: false, rig: veh('fire') },
      { state: 'hit', cells: 4, fps: 8, loop: false, rig: veh('hit') },
    ]);
    const out = join(root, 'out');
    const r = run(tool, ['build', spec, '--sources', sources, '--out', out]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const found = py(root, `
man = json.loads(Path(${JSON.stringify(join(out, 'manifest.json'))}).read_text())
sheet = np.array(Image.open(${JSON.stringify(join(out, 'sheet.png'))}))
W, H = man['cellWidth'], man['cellHeight']
def edges(row, n):
    xs, bottoms = [], []
    for c in range(n):
        a = sheet[row * H:(row + 1) * H, c * W:(c + 1) * W, 3] > 128
        xs.append(int(np.where(a.any(0))[0].min())); bottoms.append(int(np.where(a.any(1))[0].max()))
    return xs, bottoms
fire = edges(man['states']['fire']['row'], 8)
move = edges(man['states']['move']['row'], 8)
print(json.dumps({'rows': sorted(man['states']), 'fireLeft': fire[0], 'moveBottom': move[1]}))
`);
    expect(found.rows).toEqual(['fire', 'hit', 'idle', 'move']);
    expect(Math.max(...found.fireLeft) - Math.min(...found.fireLeft)).toBeGreaterThanOrEqual(3); // the hull kicks back
    expect(Math.max(...found.moveBottom) - Math.min(...found.moveBottom)).toBeGreaterThanOrEqual(2); // and bounces
  }, 60000);

  it('fire flashes once, in frames 2 to 4, and never in the team-colour range', () => {
    const { root } = sandbox();
    const out = vehiclePy(root, `
img = Image.new('RGBA', (700, 480), (0, 0, 0, 0)); vehicle(img, band=False)
flash, team = [], []
for rgba, mask, fx, lift in m.walk_frames(np.array(img), {'kind': 'vehicle', 'action': 'fire', 'bob': 0}, 8):
    h, s, v = m.puppet.rgb_to_hsv_arrays(rgba[..., :3])
    solid = rgba[..., 3] > 0.5
    flash.append(int((solid & (h > 0.10) & (h < 0.17) & (s > 0.4) & (v > 0.6)).sum()))
    team.append(int((solid & ((h < 0.045) | (h > 0.955)) & (s > 0.45) & (v > 0.18)).sum()))
print(json.dumps({'flash': flash, 'team': team}))
`);
    const note = JSON.stringify(out);
    expect(out.flash.slice(2, 5).some((n: number) => n > 20), note).toBe(true);
    for (const i of [0, 1, 5, 6, 7]) expect(out.flash[i], note).toBe(0);
    expect(Math.max(...out.team), note).toBe(0);
  }, 30000);
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

  it('every committed unit spec produces both prompts with nothing left unfilled', () => {
    const { root, tool } = sandbox();
    const rigs = join(root, 'scripts/sprite-puppet/strip-rigs');
    cpSync(join(REPO, 'scripts/sprite-puppet/strip-rigs'), rigs, { recursive: true });
    const specs = readdirSync(rigs).filter((f) => f.endsWith('.json'));
    expect(specs).toContain('spearman.json');
    expect(specs).toContain('archer.json');
    for (const file of specs) {
      const id = file.replace(/\.json$/, '');
      const r = run(tool, ['prompt', join(rigs, file)]);
      expect(r.status, `${file}: ${r.stdout}${r.stderr}`).toBe(0);
      for (const which of ['a', 'b']) {
        expect(readFileSync(join(root, `.verification/strips/${id}/prompt-${which}.txt`), 'utf8'), `${file} prompt ${which}`).not.toMatch(/\{\{|\}\}/);
      }
    }
  });

  it('names a missing spec key', () => {
    const { root, tool } = sandbox();
    const rest: Record<string, unknown> = { ...BIPED_PROMPT };
    delete rest.team_area;
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
