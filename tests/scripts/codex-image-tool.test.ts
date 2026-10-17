import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #609: the local codex-image pipeline. It runs in a throwaway copy of the two scripts (the tool derives the repo root from its
// own path), so the real public/ and design/ trees are never touched. Skipped where python3 + Pillow are unavailable.

const REPO = resolve(__dirname, '../..');
const havePillow = spawnSync('python3', ['-I', '-c', 'import PIL'], { encoding: 'utf8' }).status === 0;

function sandbox(): { root: string; sources: string; tool: string } {
  const root = mkdtempSync(join(tmpdir(), 'codex-image-'));
  for (const rel of ['scripts/codex-image/codex_image.py', 'scripts/portrait-pixelate/portrait_pixelate.py']) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    cpSync(join(REPO, rel), join(root, rel));
  }
  const sources = join(root, 'originals');
  mkdirSync(sources);
  return { root, sources, tool: join(root, 'scripts/codex-image/codex_image.py') };
}

function makeImage(file: string, kind: 'png' | 'jpeg' | 'gif', size: [number, number] = [1280, 720]): void {
  const code = `
from PIL import Image, ImageDraw
im = Image.new('RGB', ${JSON.stringify(size)}, (30, 40, 70))
d = ImageDraw.Draw(im)
d.rectangle((${size[0] * 0.35}, ${size[1] * 0.2}, ${size[0] * 0.65}, ${size[1] * 0.9}), fill=(200, 160, 60))
fmt = {'png': 'PNG', 'jpeg': 'JPEG', 'gif': 'GIF'}['${kind}']
im.save(${JSON.stringify(file)}, fmt)
`;
  execFileSync('python3', ['-I', '-c', code]);
}

const run = (tool: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync('python3', ['-I', tool, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

const spec = (over: Record<string, unknown> = {}) => ({
  id: 'demo-wonder', sourceFile: 'demo.png', wonderIds: ['demo-wonder'], alt: 'A gold tower against a night sky',
  crop: { x: 0, y: 0, w: 1 }, size: [960, 540], quality: 82,
  grade: { contrast: 1.05, saturation: 1.0, warmth: 0.2, vignette: 0.15 },
  provenance: { generator: 'ChatGPT image generation (OpenAI)', generatorUrl: 'https://chatgpt.com/', plan: 'paid plan (owner statement)', generatedOn: '2026-10-17', prompt: 'a gold tower', notes: 'test' },
  ...over,
});

describe.skipIf(!havePillow)('codex-image pipeline (#609)', () => {
  it('scans a plain image clean and builds a small, metadata-free 16:9 JPEG with a provenance record', () => {
    const { root, sources, tool } = sandbox();
    makeImage(join(sources, 'demo.png'), 'png');
    const specPath = join(root, 'demo.json');
    writeFileSync(specPath, JSON.stringify(spec()));
    const result = run(tool, ['build', specPath], { CODEX_SOURCES_DIR: sources });
    expect(result.status, result.stderr + result.stdout).toBe(0);

    const out = join(root, 'public/images/wonders/codex/demo-wonder.jpg');
    const bytes = readFileSync(out);
    expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect(bytes.length).toBeLessThan(220 * 1024);
    // No EXIF / XMP / ICC / vendor segments survive: scan the JPEG marker stream for APPn segments other than the JFIF header.
    const segments: number[] = [];
    for (let i = 2; i < bytes.length - 4;) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1]!;
      if (marker === 0xda) break;
      segments.push(marker);
      i += 2 + bytes.readUInt16BE(i + 2);
    }
    expect(segments.filter(m => m >= 0xe1 && m <= 0xef), 'APPn metadata segments').toEqual([]);

    const prov = JSON.parse(readFileSync(join(root, 'design/wonder-codex-images/demo-wonder.provenance.json'), 'utf8'));
    expect(prov.original.notRedistributed).toBe(true);
    expect(prov.original.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(prov.original.scan.join(' ')).toContain('no data after the image stream');
    expect(prov.output.bytes).toBe(bytes.length);
    expect(prov.imageSourceId).toBe('image-demo-wonder');
    expect(result.stdout).toContain("generatedImage('image-demo-wonder'");
    expect(existsSync(join(sources, 'demo.png')), 'the original stays outside the tree').toBe(true);
  });

  it('refuses data appended after the image, a non-image, an animated GIF and a wrong extension', () => {
    const { sources, tool } = sandbox();
    makeImage(join(sources, 'appended.png'), 'png');
    appendFileSync(join(sources, 'appended.png'), '<script>alert(1)</script>');
    expect(run(tool, ['scan', join(sources, 'appended.png')]).status).toBe(1);

    writeFileSync(join(sources, 'page.png'), '<html><script>alert(1)</script></html>');
    expect(run(tool, ['scan', join(sources, 'page.png')]).status).toBe(1);

    makeImage(join(sources, 'anim.png'), 'gif');
    expect(run(tool, ['scan', join(sources, 'anim.png')]).status, 'a GIF renamed .png').toBe(1);

    makeImage(join(sources, 'ok.png'), 'png');
    expect(run(tool, ['scan', join(sources, 'ok.png')]).status).toBe(0);
  });

  it('refuses to build from an unsafe original and writes nothing', () => {
    const { root, sources, tool } = sandbox();
    makeImage(join(sources, 'demo.png'), 'png');
    appendFileSync(join(sources, 'demo.png'), 'PAYLOAD');
    const specPath = join(root, 'demo.json');
    writeFileSync(specPath, JSON.stringify(spec()));
    const result = run(tool, ['build', specPath], { CODEX_SOURCES_DIR: sources });
    expect(result.status).not.toBe(0);
    expect(existsSync(join(root, 'public/images/wonders/codex/demo-wonder.jpg'))).toBe(false);
  });

  it('refuses an over-size output instead of shipping it, and an unfittable crop', () => {
    const { root, sources, tool } = sandbox();
    makeImage(join(sources, 'demo.png'), 'png', [1600, 900]);
    writeFileSync(join(root, 'big.json'), JSON.stringify(spec({ quality: 100, size: [4000, 2250] })));
    const big = run(tool, ['build', join(root, 'big.json')], { CODEX_SOURCES_DIR: sources });
    expect(big.status).not.toBe(0);
    expect(existsSync(join(root, 'public/images/wonders/codex/demo-wonder.jpg'))).toBe(false);

    makeImage(join(sources, 'tall.png'), 'png', [900, 1600]);
    writeFileSync(join(root, 'tall.json'), JSON.stringify(spec({ sourceFile: 'tall.png', crop: { x: 0, y: 0.99, w: 1 } })));
    const tall = run(tool, ['preview', join(root, 'tall.json')], { CODEX_SOURCES_DIR: sources });
    expect(tall.status).toBe(0); // a portrait source can still give a 16:9 window; the window stays inside the image
  });

  it('preview writes a contact sheet showing the desktop and phone crops, and needs the sources directory', () => {
    const { root, sources, tool } = sandbox();
    makeImage(join(sources, 'demo.png'), 'png');
    const specPath = join(root, 'demo.json');
    writeFileSync(specPath, JSON.stringify(spec()));
    const missing = run(tool, ['preview', specPath], { CODEX_SOURCES_DIR: '' });
    expect(missing.status).not.toBe(0);
    const ok = run(tool, ['preview', specPath], { CODEX_SOURCES_DIR: sources });
    expect(ok.status, ok.stderr).toBe(0);
    expect(existsSync(join(sources, 'demo-wonder.preview.png'))).toBe(true);
    expect(existsSync(join(root, 'public/images/wonders/codex/demo-wonder.jpg')), 'preview must not ship anything').toBe(false);
  });
});
