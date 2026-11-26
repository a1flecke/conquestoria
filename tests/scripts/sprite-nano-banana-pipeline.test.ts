import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simTimeout } from '../helpers/sim-timeout';

// Automated Nano Banana sprite production pipeline (scripts/sprite-nano-banana/).
// Runs inside an isolated temp copy of the scripts & repo wiring targets with a local mock Gemini
// HTTP server on 127.0.0.1 — zero external network calls and zero mutations to the real repo.
// Skipped where python3 with Pillow, numpy, and scipy is unavailable.

const REPO = resolve(__dirname, '../..');
const haveDeps = spawnSync('python3', ['-I', '-c', 'import PIL, numpy, scipy'], { encoding: 'utf8' }).status === 0;
const PYTHON_TOOL_TIMEOUT_MS = simTimeout(15000);

interface Sandbox {
  root: string;
  originals: string;
  pipeline: string;
}

function makeSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'sprite-nano-banana-'));
  const copyDirs = [
    'scripts/sprite-nano-banana',
    'scripts/sprite-puppet/strip-prompts',
    'scripts/sprite-puppet/strip-rigs',
  ];
  for (const rel of copyDirs) {
    cpSync(join(REPO, rel), join(root, rel), { recursive: true });
  }
  const copyFiles = [
    'scripts/sprite-puppet/strips.py',
    'scripts/sprite-puppet/strips_export.py',
    'scripts/sprite-puppet/puppet.py',
    'scripts/portrait-pixelate/portrait_pixelate.py',
    'src/renderer/sprites/png/png-sprite-catalog.ts',
    'src/renderer/sprites/sprite-catalog.ts',
    'src/testing/scenarios.ts',
    'tests/testing/scenarios.test.ts',
    'tests/e2e/issue-1627-strip-units.spec.ts',
    'docs/asset-rights-ledger.md',
  ];
  for (const rel of copyFiles) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    cpSync(join(REPO, rel), join(root, rel));
  }
  // Copy one shipped preview exemplar per family used by parity & style-ref tests.
  for (const unit of ['warrior', 'horseman', 'mechanized_infantry', 'ironclad', 'biplane']) {
    const src = join(REPO, 'design/png-sprites/previews', unit);
    if (existsSync(src)) {
      cpSync(src, join(root, 'design/png-sprites/previews', unit), { recursive: true });
    }
  }
  // A fictional, never-shipped biped spec for the end-to-end tests (real units, axeman included, ship and
  // then stop being "new"): the shipped axeman spec re-identified as `testbiped`.
  const fixtureSpec = JSON.parse(readFileSync(join(REPO, 'scripts/sprite-puppet/strip-rigs/axeman.json'), 'utf8')) as { id: string };
  fixtureSpec.id = 'testbiped';
  writeFileSync(join(root, 'scripts/sprite-puppet/strip-rigs/testbiped.json'), JSON.stringify(fixtureSpec, null, 2));
  // The sandbox has no shipped Nano Banana preview (only `testbiped` is produced here), so start its ledger row at 0.
  const ledgerPath = join(root, 'docs/asset-rights-ledger.md');
  writeFileSync(ledgerPath, readFileSync(ledgerPath, 'utf8').replace(/\| Nano Banana \(unit strips\) \| \d+ \|/, '| Nano Banana (unit strips) | 0 |'));
  const originals = join(root, 'originals');
  mkdirSync(originals, { recursive: true });
  return {
    root,
    originals,
    pipeline: join(root, 'scripts/sprite-nano-banana/pipeline.py'),
  };
}

function runPy(code: string, env: Record<string, string> = {}): string {
  return execFileSync('python3', ['-I', '-c', code], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

describe.skipIf(!haveDeps)('Nano Banana sprite production pipeline', { timeout: PYTHON_TOOL_TIMEOUT_MS }, () => {
  it('generates clean single-image prompts with zero unfilled placeholders for every committed strip spec', () => {
    const { root } = makeSandbox();
    const out = runPy(`
import json, sys
from pathlib import Path
root = Path(${JSON.stringify(root)})
sys.path.insert(0, str(root / 'scripts/sprite-nano-banana'))
import prompts
rigs = sorted((root / 'scripts/sprite-puppet/strip-rigs').glob('*.json'))
checked = []
for p in rigs:
    spec = json.loads(p.read_text())
    jobs = prompts.list_sheet_jobs(spec)
    assert jobs[0].is_master and jobs[0].file_key == 'a', f'{p.name}: master not first'
    assert jobs[1].state == 'damage', f'{p.name}: damage not second'
    m = prompts.build_master_prompt(
        spec,
        template_dir=root / 'scripts/sprite-puppet/strip-prompts',
        style_ref_id='warrior',
        theme_note='Bronze Age heroic theme',
    )
    assert '{{' not in m and '}}' not in m, f'{p.name}: unfilled master placeholder'
    assert '#FF00FF' in m and 'STYLE REFERENCE' in m and 'Bronze Age heroic theme' in m
    for job in jobs[1:]:
        s = prompts.build_sheet_prompt(spec, job, template_dir=root / 'scripts/sprite-puppet/strip-prompts')
        assert '{{' not in s and '}}' not in s, f'{p.name}/{job.file_key}: unfilled sheet placeholder'
        assert s.startswith('Draw ONE image:'), f'{p.name}/{job.file_key}: missing single-image header'
        assert '#FF00FF' in s
        if job.state in ('wreck', 'sinking', 'down'):
            assert 'SOLID, OPAQUE' in s
        if job.state == 'damage' and spec['family'] in ('biped', 'mounted'):
            assert 'CRITICAL FOR WALK RIGGING' in s
    checked.append(spec['id'])
print(json.dumps({'count': len(checked), 'ids': checked}))
`);
    const parsed = JSON.parse(out) as { count: number; ids: string[] };
    expect(parsed.count).toBeGreaterThanOrEqual(22);
    expect(parsed.ids).toContain('warrior');
    expect(parsed.ids).toContain('swordsman');
    expect(parsed.ids).toContain('mechanized_infantry');
  });

  it('reconstructs a valid style-reference PNG with pure red team colour on flat magenta from a recent shipped sprite', () => {
    const { root } = makeSandbox();
    const out = runPy(`
import io, json, sys
from pathlib import Path
import numpy as np
from PIL import Image
root = Path(${JSON.stringify(root)})
sys.path.insert(0, str(root / 'scripts/sprite-nano-banana'))
import style_ref, qc
ref = style_ref.build_style_reference('biped', root, exclude_unit='testbiped')
assert ref is not None
png_bytes, exemplar_id = ref
assert exemplar_id == 'warrior'
img = Image.open(io.BytesIO(png_bytes)).convert('RGBA')
strips = qc.load_strips(root)
bg = strips.background_kind(np.asarray(img))
tmp = root / 'ref.png'
tmp.write_bytes(png_bytes)
figs = strips.load_figures(tmp, 1)
spec = json.loads((root / 'scripts/sprite-puppet/strip-rigs/warrior.json').read_text())
tint = strips.tint_fraction(tmp, figs, spec['tint'])
print(json.dumps({'exemplar': exemplar_id, 'bg': bg, 'figs': len(figs), 'tint': round(tint, 4)}))
`);
    const parsed = JSON.parse(out) as { exemplar: string; bg: string; figs: number; tint: number };
    expect(parsed.exemplar).toBe('warrior');
    expect(parsed.bg).toBe('magenta');
    expect(parsed.figs).toBe(1);
    expect(parsed.tint).toBeGreaterThan(0.02);
  });

  it('produces a full biped unit end-to-end via Nano Banana API with QC auto-retry, preview build, sign-off export, and idempotent game wiring', () => {
    const { root, originals } = makeSandbox();
    const out = runPy(`
import base64, io, json, sys, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(${JSON.stringify(root)})
originals = Path(${JSON.stringify(originals)})
sys.path.insert(0, str(root / 'scripts/sprite-nano-banana'))

import pipeline, review_server

# Scaffold a brand-new unit spec (testbiped, biped) to verify scaffold + produce + approve end-to-end.
spec_path = pipeline.scaffold_spec('testbiped', 'biped', theme='Iron Age northern raiders', force=True, repo_root=root)

def draw_biped(d, cx, top, h, *, merged_legs=False):
    # Head, red tunic (team colour #E01010), dark grey boots separated by a clear magenta gap.
    u = h / 400.0
    head_r = int(28 * u)
    d.ellipse((cx - head_r, top, cx + head_r, top + 2 * head_r), fill=(215, 175, 135))
    torso_top = top + int(56 * u)
    hem_y = top + int(250 * u)
    d.rectangle((cx - int(48 * u), torso_top, cx + int(48 * u), hem_y), fill=(224, 16, 16))
    foot_y = top + h
    if merged_legs:
        d.rectangle((cx - int(42 * u), hem_y, cx + int(42 * u), foot_y), fill=(65, 55, 50))
    else:
        d.rectangle((cx - int(40 * u), hem_y, cx - int(12 * u), foot_y), fill=(65, 55, 50))
        d.rectangle((cx + int(12 * u), hem_y, cx + int(40 * u), foot_y), fill=(65, 55, 50))

def make_png(w, h, bg, drawer):
    im = Image.new('RGB', (w, h), bg)
    drawer(ImageDraw.Draw(im))
    buf = io.BytesIO()
    im.save(buf, format='PNG')
    return buf.getvalue()

def sheet_master(bad=False):
    return make_png(600, 800, (255, 255, 255) if bad else (255, 0, 255),
                    lambda d: draw_biped(d, 300, 180, 440, merged_legs=bad))

def sheet_grid(cols_rows, count, *, w=1200, h=900):
    def _draw(d):
        idx = 0
        rows = len(cols_rows)
        cell_h = h // rows
        for r, n_cols in enumerate(cols_rows):
            cell_w = w // n_cols
            for c in range(n_cols):
                if idx >= count:
                    return
                cx = c * cell_w + cell_w // 2
                top = r * cell_h + 40
                draw_biped(d, cx, top, cell_h - 80)
                idx += 1
    return make_png(w, h, (255, 0, 255), _draw)

calls = []
counts_by_role = {'master': 0, 'damage': 0, 'attack': 0, 'hit': 0, 'defeat': 0}

class MockGeminiHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return
    def do_POST(self):
        assert self.path == '/v1/interactions', self.path
        assert self.headers.get('x-goog-api-key') == 'test-key-123'
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])).decode('utf-8'))
        assert body['model'] == 'gemini-nano-banana-2.1'
        assert body['store'] is False
        inputs = body['input']
        prompt = inputs[-1]['text']
        inline_count = sum(1 for p in inputs if p.get('type') == 'image')
        rf = body['response_format']
        assert rf['type'] == 'image' and 'mime_type' not in rf
        aspect = rf['aspect_ratio']
        calls.append({'path': self.path, 'inline_count': inline_count, 'aspect': aspect, 'prompt': prompt})

        if 'master design of this unit' in prompt:
            counts_by_role['master'] += 1
            # First master attempt fails QC (white background + merged legs); second succeeds!
            png = sheet_master(bad=(counts_by_role['master'] == 1))
        elif 'the DAMAGE sprite sheet' in prompt:
            counts_by_role['damage'] += 1
            png = sheet_grid([2, 2], 4, w=1024, h=1024)
        elif 'the ATTACK sprite sheet' in prompt:
            counts_by_role['attack'] += 1
            # First attack attempt returns only 5 figures instead of 6 -> auto-retry fixes it!
            png = sheet_grid([3, 3], 5 if counts_by_role['attack'] == 1 else 6, w=1350, h=900)
        elif 'the HIT sprite sheet' in prompt:
            counts_by_role['hit'] += 1
            png = sheet_grid([3, 2], 5, w=1350, h=900)
        elif 'the DEFEAT sprite sheet' in prompt:
            counts_by_role['defeat'] += 1
            png = sheet_grid([3, 2], 5, w=1350, h=900)
        else:
            raise AssertionError('Unexpected prompt: ' + prompt[:120])

        resp = {
            'id': f'int_{len(calls)}',
            'status': 'completed',
            'steps': [{
                'type': 'model_output',
                'content': [
                    {'type': 'text', 'text': 'Generated cleanly.'},
                    {'type': 'image', 'mime_type': 'image/png', 'data': base64.b64encode(png).decode('ascii')},
                ],
            }],
        }
        payload = json.dumps(resp).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

srv = HTTPServer(('127.0.0.1', 0), MockGeminiHandler)
port = srv.server_address[1]
t = threading.Thread(target=srv.serve_forever, daemon=True)
t.start()
try:
    res = pipeline.produce_unit(
        spec_path,
        model='nano-banana-2.1',
        max_retries=2,
        originals_override=str(originals),
        repo_root=root,
        api_key='test-key-123',
        base_url=f'http://127.0.0.1:{port}/v1',
    )
finally:
    srv.shutdown()
    srv.server_close()

# Verify retries happened and rejected takes were archived.
assert counts_by_role['master'] == 2, counts_by_role
assert counts_by_role['attack'] == 2, counts_by_role
assert 'REQUIRED CORRECTIONS FROM PREVIOUS ATTEMPT' in calls[1]['prompt']
assert any(p.name.startswith('a-v1-') for p in (originals / 'testbiped').iterdir())
assert any(p.name.startswith('c-v1-count') for p in (originals / 'testbiped').iterdir())
# Every call attached a reference: style-ref on master, master a.png on b..e.
assert all(c['inline_count'] == 1 for c in calls)
assert res['preflight']['ok'] is True, res['preflight']

# Now exercise the Sign-Off Studio HTTP server (GET / + /api/state + CSRF guard + POST /api/approve).
import urllib.request, urllib.error

preview_dir = root / 'design/png-sprites/previews/testbiped'
spec = json.loads(spec_path.read_text())
studio, url, token, outcome = review_server.start_review_server(
    get_state=lambda: {
        'unitId': 'testbiped', 'unitName': 'Axeman', 'family': 'biped', 'model': 'gemini-nano-banana-2.1',
        'originalsDir': str(originals / 'testbiped'),
        'manifest': json.loads((preview_dir / 'manifest.json').read_text()),
        'preflight': res['preflight'], 'parity': None, 'hasRigReview': True, 'sheets': [],
    },
    preview_dir=preview_dir,
    originals_dir=originals / 'testbiped',
    rig_review_path=root / '.verification/strips/testbiped/rig-review.png',
    parity_preview_dir=root / 'design/png-sprites/previews/warrior',
    on_regenerate=lambda f, n, c: {'message': 'ok'},
    on_approve=lambda wire: pipeline.approve_unit(spec_path, wire=wire, originals_override=str(originals), repo_root=root),
    open_browser=False,
)
st_thread = threading.Thread(target=studio.serve_forever, daemon=True)
st_thread.start()
try:
    html = urllib.request.urlopen(url).read().decode('utf-8')
    assert 'Sign Off' in html
    state_json = json.loads(urllib.request.urlopen(url + 'api/state').read().decode('utf-8'))
    assert state_json['unitId'] == 'testbiped' and state_json['preflight']['ok'] is True

    # Missing CSRF token must be rejected with 403.
    bad_req = urllib.request.Request(url + 'api/approve', data=b'{"wire":true}', method='POST',
                                     headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(bad_req)
        raise AssertionError('expected 403 without token')
    except urllib.error.HTTPError as e:
        assert e.code == 403

    # Valid CSRF token approves, exports, wires, and shuts down.
    ok_req = urllib.request.Request(url + 'api/approve', data=b'{"wire":true}', method='POST',
                                    headers={'Content-Type': 'application/json', 'X-Studio-Token': token})
    app_resp = json.loads(urllib.request.urlopen(ok_req).read().decode('utf-8'))
    assert app_resp['ok'] is True
finally:
    st_thread.join(timeout=5)
    studio.server_close()

# Re-running approve must be 100% idempotent (zero duplicate edits).
second = pipeline.approve_unit(spec_path, wire=True, originals_override=str(originals), repo_root=root)

print('SUMMARY_JSON:' + json.dumps({
    'decision': outcome.decision,
    'firstTouched': outcome.details['wiring']['touchedFiles'],
    'secondTouched': second['wiring']['touchedFiles'],
    'ledgerCount': second['wiring']['nanoBananaLedgerCount'],
    'calls': len(calls),
}))
`);

    const summaryLine = out.split('\n').find(l => l.startsWith('SUMMARY_JSON:'));
    expect(summaryLine, out).toBeDefined();
    const summary = JSON.parse(summaryLine!.slice('SUMMARY_JSON:'.length)) as {
      decision: string;
      firstTouched: string[];
      secondTouched: string[];
      ledgerCount: number;
      calls: number;
    };
    expect(summary.decision).toBe('shipped');
    expect(summary.calls).toBe(7); // 5 sheets + 1 master retry + 1 attack retry
    expect(summary.firstTouched).toEqual([
      'src/renderer/sprites/png/png-sprite-catalog.ts',
      'src/testing/scenarios.ts',
      'tests/testing/scenarios.test.ts',
      'tests/e2e/issue-1627-strip-units.spec.ts',
      'docs/asset-rights-ledger.md',
    ]);
    expect(summary.secondTouched).toEqual([]);
    expect(summary.ledgerCount).toBe(1);

    // Check shipped assets, manifest, provenance, and wired files in the sandbox.
    expect(existsSync(join(root, 'public/images/units/testbiped/sheet.png'))).toBe(true);
    expect(existsSync(join(root, 'public/images/units/testbiped/mask.png'))).toBe(true);
    expect(existsSync(join(root, 'src/renderer/sprites/png/generated/testbiped.manifest.ts'))).toBe(true);

    const prov = JSON.parse(readFileSync(join(root, 'design/png-sprites/previews/testbiped/provenance.json'), 'utf8')) as {
      status: string;
      generator: string;
      originals: Array<{ sha256: string }>;
      sheet_prompts: Record<string, string>;
      signed_off_on?: string;
    };
    expect(prov.status).toContain('shipped');
    expect(prov.generator).toMatch(/^Nano Banana /);
    expect(prov.originals).toHaveLength(5);
    for (const o of prov.originals) expect(o.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(prov.sheet_prompts).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(prov.signed_off_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const catalog = readFileSync(join(root, 'src/renderer/sprites/png/png-sprite-catalog.ts'), 'utf8');
    expect(catalog).toContain("import { sprite as testbiped } from './generated/testbiped.manifest';");
    expect(catalog).toMatch(/STRIP_UNITS.*testbiped/);

    const scenarios = readFileSync(join(root, 'src/testing/scenarios.ts'), 'utf8');
    expect(scenarios).toContain("id: 'showcase-testbiped'");
    expect(scenarios).toContain("id: 'showcase-testbiped-hurt', health: 30");

    const scenTest = readFileSync(join(root, 'tests/testing/scenarios.test.ts'), 'utf8');
    expect(scenTest).toContain("state.units['showcase-testbiped']");

    const e2e = readFileSync(join(root, 'tests/e2e/issue-1627-strip-units.spec.ts'), 'utf8');
    expect(e2e.match(/'testbiped'/g)?.length).toBe(2);

    const ledger = readFileSync(join(root, 'docs/asset-rights-ledger.md'), 'utf8');
    expect(ledger).toContain('| Nano Banana (unit strips) | 1 |');
  });

  it('scaffolds valid specs for all five unit families and prints status cleanly', () => {
    const { root } = makeSandbox();
    const out = runPy(`
import json, sys
from pathlib import Path
root = Path(${JSON.stringify(root)})
sys.path.insert(0, str(root / 'scripts/sprite-nano-banana'))
import pipeline, prompts
families = ['biped', 'mounted', 'vehicle', 'naval', 'aircraft']
for fam in families:
    sp = pipeline.scaffold_spec(f'demo_{fam}', fam, theme='Industrial Steam Era', repo_root=root)
    spec = json.loads(sp.read_text())
    jobs = prompts.list_sheet_jobs(spec)
    m = prompts.build_master_prompt(spec, template_dir=root / 'scripts/sprite-puppet/strip-prompts')
    assert '{{' not in m and 'Industrial Steam Era' in m
    for j in jobs[1:]:
        s = prompts.build_sheet_prompt(spec, j, template_dir=root / 'scripts/sprite-puppet/strip-prompts')
        assert '{{' not in s
assert pipeline.status_command(root) == 0
print('ALL_FAMILIES_OK')
`);
    expect(out).toContain('ALL_FAMILIES_OK');
    expect(out).toMatch(/Shipped strip units \(\d+\):/);
  });

  it('supports isolated CLI execution (python3 -I pipeline.py status & produce --dry-run)', () => {
    const { pipeline } = makeSandbox();
    const statusRes = spawnSync('python3', ['-I', pipeline, 'status', '--json'], { encoding: 'utf8' });
    expect(statusRes.status, statusRes.stdout + statusRes.stderr).toBe(0);
    const statusJson = JSON.parse(statusRes.stdout) as { ok: boolean; shippedCount: number; remainingCount: number };
    expect(statusJson.ok).toBe(true);
    expect(statusJson.shippedCount).toBeGreaterThanOrEqual(23); // a floor, so shipping another unit never breaks this
    expect(statusJson.remainingCount).toBeGreaterThan(50);

    const dryRes = spawnSync('python3', ['-I', pipeline, 'produce', 'warrior', '--dry-run', '--theme', 'Stone Age tribal'], {
      encoding: 'utf8',
    });
    expect(dryRes.status, dryRes.stdout + dryRes.stderr).toBe(0);
    expect(dryRes.stdout).toContain('DRY RUN [a.png | idle | aspect 3:4 | size 1K');
    expect(dryRes.stdout).toContain('DRY RUN [b.png | damage | aspect 1:1 | size 1K');
    expect(dryRes.stdout).toContain('DRY RUN [c.png | attack | aspect 3:2 | size 2K');
    expect(dryRes.stdout).toContain('Stone Age tribal');
    expect(dryRes.stdout).toContain('Draw ONE image: the ATTACK sprite sheet');

    // Structured exit codes: missing auth -> 3, unknown spec -> 2.
    const noKeyEnv = { ...process.env };
    delete noKeyEnv.GEMINI_API_KEY;
    delete noKeyEnv.GOOGLE_API_KEY;
    const authRes = spawnSync('python3', ['-I', pipeline, 'produce', 'warrior', '--stage', 'master', '--backend', 'rest', '--json'], {
      encoding: 'utf8',
      env: noKeyEnv,
    });
    expect(authRes.status, authRes.stdout + authRes.stderr).toBe(3);
    expect(JSON.parse(authRes.stdout)).toMatchObject({ ok: false, exitCode: 3 });

    const missingRes = spawnSync('python3', ['-I', pipeline, 'produce', 'does_not_exist_unit', '--json'], { encoding: 'utf8' });
    expect(missingRes.status, missingRes.stdout + missingRes.stderr).toBe(2);
    expect(JSON.parse(missingRes.stdout)).toMatchObject({ ok: false, exitCode: 2 });
  });

  it('the shell wrapper runs only the agent-safe subcommands and validates the unit id', () => {
    const wrapper = join(REPO, 'scripts/sprite-nano-banana.sh');
    const status = spawnSync('sh', [wrapper, 'status', '--json'], { encoding: 'utf8' });
    expect(status.status, status.stdout + status.stderr).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({ ok: true });

    const interactive = spawnSync('sh', [wrapper, 'run', 'testbiped'], { encoding: 'utf8' });
    expect(interactive.status).toBe(2);
    expect(interactive.stderr).toContain('interactive');

    const unknown = spawnSync('sh', [wrapper, 'rm', 'testbiped'], { encoding: 'utf8' });
    expect(unknown.status).toBe(2);

    const traversal = spawnSync('sh', [wrapper, 'produce', '../evil'], { encoding: 'utf8' });
    expect(traversal.status).toBe(2);
    expect(traversal.stderr).toContain('unit id');

    const noUnit = spawnSync('sh', [wrapper, 'produce'], { encoding: 'utf8' });
    expect(noUnit.status).toBe(2);
  });

  it('supports two-stage agent workflow (--stage master then --stage set) with --image-size auto, compact --json, review cards/GIF, and gemini-api CLI fallback', () => {
    const { root, originals } = makeSandbox();
    const out = runPy(`
import base64, io, json, os, stat, subprocess, sys, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(${JSON.stringify(root)})
originals = Path(${JSON.stringify(originals)})
pipeline_py = str(root / 'scripts/sprite-nano-banana/pipeline.py')

def draw_biped(d, cx, top, h):
    u = h / 400.0
    r = int(28 * u)
    d.ellipse((cx - r, top, cx + r, top + 2 * r), fill=(215, 175, 135))
    d.rectangle((cx - int(48 * u), top + int(56 * u), cx + int(48 * u), top + int(250 * u)), fill=(224, 16, 16))
    d.rectangle((cx - int(40 * u), top + int(250 * u), cx - int(12 * u), top + h), fill=(65, 55, 50))
    d.rectangle((cx + int(12 * u), top + int(250 * u), cx + int(40 * u), top + h), fill=(65, 55, 50))

def make_png(w, h, drawer):
    im = Image.new('RGB', (w, h), (255, 0, 255))
    drawer(ImageDraw.Draw(im))
    buf = io.BytesIO()
    im.save(buf, format='PNG')
    return buf.getvalue()

def sheet_grid(cols_rows, count, w, h):
    def _draw(d):
        idx = 0
        cell_h = h // len(cols_rows)
        for r, n_cols in enumerate(cols_rows):
            cell_w = w // n_cols
            for c in range(n_cols):
                if idx >= count:
                    return
                draw_biped(d, c * cell_w + cell_w // 2, r * cell_h + 40, cell_h - 80)
                idx += 1
    return make_png(w, h, _draw)

sizes_seen = []

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])).decode('utf-8'))
        rf = body['response_format']
        prompt = body['input'][-1]['text']
        sizes_seen.append((rf.get('aspect_ratio'), rf.get('image_size')))
        if 'master design of this unit' in prompt:
            png = make_png(600, 800, lambda d: draw_biped(d, 300, 180, 440))
        elif 'the DAMAGE sprite sheet' in prompt:
            png = sheet_grid([2, 2], 4, 1024, 1024)
        elif 'the ATTACK sprite sheet' in prompt:
            png = sheet_grid([3, 3], 6, 1350, 900)
        else:
            png = sheet_grid([3, 2], 5, 1350, 900)
        resp = {
            'id': 'int_ok', 'status': 'completed',
            'steps': [{'type': 'model_output', 'content': [{'type': 'image', 'mime_type': 'image/png', 'data': base64.b64encode(png).decode('ascii')}]}],
        }
        payload = json.dumps(resp).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

srv = HTTPServer(('127.0.0.1', 0), Handler)
port = srv.server_address[1]
t = threading.Thread(target=srv.serve_forever, daemon=True)
t.start()
env = {**os.environ, 'GEMINI_API_KEY': 'k', 'GEMINI_API_BASE_URL': f'http://127.0.0.1:{port}/v1'}
try:
    # Stage 1: master only -> 1 call at 1K, compact JSON stdout, versioned review-master-v1.png written.
    r1 = subprocess.run([sys.executable, '-I', pipeline_py, 'produce', 'testbiped', '--stage', 'master', '--originals', str(originals), '--json'],
                        capture_output=True, text=True, env=env, check=True)
    j1 = json.loads(r1.stdout)
    assert j1['ok'] is True and j1['stage'] == 'master' and j1['reviewIteration'] == 1
    assert 'sheet_prompts' not in j1
    m1 = Path(j1['reviewImages']['master'])
    assert m1.is_file() and m1.name == 'testbiped-review-master-v1.png'
    assert len(sizes_seen) == 1 and sizes_seen[0] == ('3:4', '1K'), sizes_seen

    # Master iteration: regenerate a -> emits distinct -v2 filename so artifact viewers never cache v1.
    r1b = subprocess.run([sys.executable, '-I', pipeline_py, 'regenerate', 'testbiped', 'a', '--note', 'grip shield handle', '--originals', str(originals), '--json'],
                         capture_output=True, text=True, env=env, check=True)
    j1b = json.loads(r1b.stdout)
    assert j1b['ok'] is True and j1b['stage'] == 'master' and j1b['reviewIteration'] == 2
    m2 = Path(j1b['reviewImages']['master'])
    assert m2.is_file() and m2.name == 'testbiped-review-master-v2.png' and m1.is_file()

    # Stage 2: set -> reuses a.png, b at 1K, c/d/e at 2K, creates versioned review-sheet-v1.png + review-anim-v1.gif.
    r2 = subprocess.run([sys.executable, '-I', pipeline_py, 'produce', 'testbiped', '--stage', 'set', '--originals', str(originals), '--json'],
                        capture_output=True, text=True, env=env, check=True)
    j2 = json.loads(r2.stdout)
    assert j2['ok'] is True and j2['stage'] == 'set' and j2['reviewIteration'] == 1 and j2['preflight']['ok'] is True
    s1 = Path(j2['reviewImages']['sheet'])
    gif_path = Path(j2['reviewImages']['animGif'])
    assert s1.is_file() and s1.name == 'testbiped-review-sheet-v1.png'
    assert gif_path.is_file() and gif_path.name == 'testbiped-review-anim-v1.gif'
    with Image.open(gif_path) as gim:
        assert getattr(gim, 'n_frames', 1) > 5, 'expected animated review GIF'

    # Set iteration: regenerate c -> emits distinct -v2 sheet & GIF filenames while preserving -v1.
    r2b = subprocess.run([sys.executable, '-I', pipeline_py, 'regenerate', 'testbiped', 'c', '--note', 'wider axe swing', '--originals', str(originals), '--json'],
                         capture_output=True, text=True, env=env, check=True)
    j2b = json.loads(r2b.stdout)
    assert j2b['ok'] is True and j2b['reviewIteration'] == 2
    s2 = Path(j2b['reviewImages']['sheet'])
    g2 = Path(j2b['reviewImages']['animGif'])
    assert s2.is_file() and s2.name == 'testbiped-review-sheet-v2.png' and s1.is_file()
    assert g2.is_file() and g2.name == 'testbiped-review-anim-v2.gif' and gif_path.is_file()
    assert sizes_seen == [('3:4', '1K'), ('3:4', '1K'), ('1:1', '1K'), ('3:2', '2K'), ('3:2', '2K'), ('3:2', '2K'), ('3:2', '2K')], sizes_seen
finally:
    srv.shutdown()
    srv.server_close()

# Test gemini-api CLI fallback backend (no GEMINI_API_KEY in env, fake gemini-api on PATH).
fake_bin = root / 'fake-bin'
fake_bin.mkdir()
fake_cli = fake_bin / 'gemini-api'
master_png_b64 = base64.b64encode(make_png(600, 800, lambda d: draw_biped(d, 300, 180, 440))).decode('ascii')
fake_cli.write_text(f"""#!{sys.executable}
import base64, json, sys
from pathlib import Path
args = sys.argv[1:]
assert args[0] == 'image' and '--no-interactive' in args and '--stdin' in args
out_idx = args.index('--out')
out_path = Path(args[out_idx + 1])
out_path.write_bytes(base64.b64decode({master_png_b64!r}))
print(json.dumps({{'kind': 'image', 'path': str(out_path), 'mime_type': 'image/png', 'status': 'completed'}}))
""")
fake_cli.chmod(fake_cli.stat().st_mode | stat.S_IXUSR)

cli_env = {k: v for k, v in os.environ.items() if k not in ('GEMINI_API_KEY', 'GOOGLE_API_KEY')}
cli_env['PATH'] = str(fake_bin) + os.pathsep + cli_env.get('PATH', '')
cli_orig = root / 'cli-originals'
r3 = subprocess.run([sys.executable, '-I', pipeline_py, 'produce', 'testbiped', '--stage', 'master', '--originals', str(cli_orig), '--json'],
                    capture_output=True, text=True, env=cli_env, check=True)
j3 = json.loads(r3.stdout)
assert j3['ok'] is True and j3['backend'] == 'cli'
assert Path(j3['reviewImages']['master']).is_file()
print('AGENT_FLOW_OK')
`);
    expect(out).toContain('AGENT_FLOW_OK');
  });

  it('supports dual-backend execution: (a) AI Studio primary, (b) automatic failover to Vertex AI on quota/billing exhaustion, and (c) forced --backend vertex', () => {
    const { root, originals } = makeSandbox();
    const out = runPy(`
import base64, io, json, os, subprocess, sys, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(${JSON.stringify(root)})
originals = Path(${JSON.stringify(originals)})
pipeline_py = str(root / 'scripts/sprite-nano-banana/pipeline.py')

def make_master_png():
    im = Image.new('RGB', (600, 800), (255, 0, 255))
    d = ImageDraw.Draw(im)
    d.ellipse((270, 180, 330, 240), fill=(215, 175, 135))
    d.rectangle((248, 240, 352, 455), fill=(224, 16, 16))
    d.rectangle((256, 455, 286, 620), fill=(65, 55, 50))
    d.rectangle((314, 455, 344, 620), fill=(65, 55, 50))
    buf = io.BytesIO()
    im.save(buf, format='PNG')
    return buf.getvalue()

master_b64 = base64.b64encode(make_master_png()).decode('ascii')
mode = {'aistudio_status': 200}
hits = {'aistudio': 0, 'vertex': 0, 'vertex_paths': []}

class DualMockHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return
    def do_POST(self):
        raw = self.rfile.read(int(self.headers['Content-Length'])).decode('utf-8')
        _ = json.loads(raw)
        if self.path == '/ai/interactions':
            hits['aistudio'] += 1
            if mode['aistudio_status'] == 429:
                err = json.dumps({'error': {'code': 429, 'status': 'RESOURCE_EXHAUSTED', 'message': 'Rate limit exceeded (limit: 0 on Free Tier)'}}).encode('utf-8')
                self.send_response(429)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(err)))
                self.end_headers()
                self.wfile.write(err)
                return
            resp = {
                'id': 'int_ai', 'status': 'completed',
                'steps': [{'type': 'model_output', 'content': [{'type': 'image', 'mime_type': 'image/png', 'data': master_b64}]}],
            }
            payload = json.dumps(resp).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        if '/publishers/google/models/' in self.path and self.path.endswith(':generateContent'):
            assert self.headers.get('Authorization') == 'Bearer vertex-test-token'
            assert self.headers.get('x-goog-user-project') == 'conquestoria-image-gen'
            hits['vertex'] += 1
            hits['vertex_paths'].append(self.path)
            resp = {
                'candidates': [{
                    'finishReason': 'STOP',
                    'content': {'role': 'model', 'parts': [{'inlineData': {'mimeType': 'image/png', 'data': master_b64}}]},
                }],
            }
            payload = json.dumps(resp).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        self.send_response(404)
        self.end_headers()

srv = HTTPServer(('127.0.0.1', 0), DualMockHandler)
port = srv.server_address[1]
t = threading.Thread(target=srv.serve_forever, daemon=True)
t.start()

base_env = {
    **os.environ,
    'GEMINI_API_KEY': 'ai-key',
    'GEMINI_API_BASE_URL': f'http://127.0.0.1:{port}/ai',
    'VERTEX_API_BASE_URL': f'http://127.0.0.1:{port}/vertex/v1',
    'VERTEX_ACCESS_TOKEN': 'vertex-test-token',
    'GOOGLE_CLOUD_PROJECT': 'conquestoria-image-gen',
    'GOOGLE_CLOUD_LOCATION': 'global',
    'NANO_BANANA_BACKEND': 'auto',
}
try:
    # (a) AI Studio primary success path
    r_ai = subprocess.run([sys.executable, '-I', pipeline_py, 'produce', 'testbiped', '--stage', 'master', '--originals', str(originals / 'case-a'), '--json'],
                          capture_output=True, text=True, env=base_env, check=True)
    j_ai = json.loads(r_ai.stdout)
    assert j_ai['ok'] is True and j_ai['backend'] == 'aistudio' and j_ai['model'] == 'gemini-nano-banana-2.1'
    assert 'failoverReason' not in j_ai
    assert hits['aistudio'] == 1 and hits['vertex'] == 0

    # (b) Automatic failover to Vertex AI on AI Studio 429 / RESOURCE_EXHAUSTED
    mode['aistudio_status'] = 429
    r_fo = subprocess.run([sys.executable, '-I', pipeline_py, 'produce', 'testbiped', '--stage', 'master', '--originals', str(originals / 'case-b'), '--json'],
                          capture_output=True, text=True, env=base_env, check=True)
    j_fo = json.loads(r_fo.stdout)
    assert j_fo['ok'] is True and j_fo['backend'] == 'vertex' and j_fo['model'] == 'gemini-nano-banana-2.1'
    assert 'failoverReason' in j_fo and '429' in j_fo['failoverReason']
    assert 'falling back to Vertex AI' in Path(j_fo['logPath']).read_text()
    assert hits['aistudio'] == 2 and hits['vertex'] == 1
    assert hits['vertex_paths'][-1] == '/vertex/v1/projects/conquestoria-image-gen/locations/global/publishers/google/models/gemini-nano-banana-2.1:generateContent'

    # (c) Forced --backend vertex skips AI Studio completely even when GEMINI_API_KEY is present
    mode['aistudio_status'] = 200
    r_vx = subprocess.run([sys.executable, '-I', pipeline_py, 'produce', 'testbiped', '--stage', 'master', '--backend', 'vertex', '--vertex-model', 'nano-banana-pro', '--originals', str(originals / 'case-c'), '--json'],
                          capture_output=True, text=True, env=base_env, check=True)
    j_vx = json.loads(r_vx.stdout)
    assert j_vx['ok'] is True and j_vx['backend'] == 'vertex' and j_vx['model'] == 'gemini-3-pro-image'
    assert hits['aistudio'] == 2 and hits['vertex'] == 2
    assert hits['vertex_paths'][-1].endswith('/models/gemini-3-pro-image:generateContent')
finally:
    srv.shutdown()
    srv.server_close()

print('DUAL_BACKEND_OK')
`);
    expect(out).toContain('DUAL_BACKEND_OK');
  });
});
