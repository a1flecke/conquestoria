// Attribute emitted bytes of a built JS chunk to source modules via its sourcemap.
const fs = require('fs');
const jsPath = process.argv[2];
const js = fs.readFileSync(jsPath, 'utf8');
const map = JSON.parse(fs.readFileSync(jsPath + '.map', 'utf8'));
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const lookup = Object.fromEntries([...B64].map((c, i) => [c, i]));
function decode(seg) {
  const out = [];
  let shift = 0;
  let value = 0;
  for (const c of seg) {
    const d = lookup[c];
    value += (d & 31) << shift;
    if (d & 32) { shift += 5; } else { out.push(value & 1 ? -(value >> 1) : value >> 1); value = 0; shift = 0; }
  }
  return out;
}
const lines = js.split('\n');
const perSource = new Map();
let srcIdx = 0;
map.mappings.split(';').forEach((line, lineNo) => {
  if (!line) return;
  let col = 0;
  const segs = [];
  for (const s of line.split(',')) {
    const f = decode(s);
    col += f[0];
    if (f.length > 1) { srcIdx += f[1]; segs.push([col, srcIdx]); } else segs.push([col, -1]);
  }
  const text = lines[lineNo] ?? '';
  segs.forEach(([c, si], i) => {
    const end = i + 1 < segs.length ? segs[i + 1][0] : text.length;
    const bytes = Buffer.byteLength(text.slice(c, end), 'utf8');
    const name = si < 0 ? '(unmapped)' : map.sources[si];
    perSource.set(name, (perSource.get(name) || 0) + bytes);
  });
});
const rows = [...perSource.entries()].sort((a, b) => b[1] - a[1]);
const total = rows.reduce((s, r) => s + r[1], 0);
console.log('total attributed bytes', total, 'file bytes', Buffer.byteLength(js));
for (const [n, b] of rows.slice(0, 12)) console.log(String(b).padStart(10), n.replace(/^.*\/src\//, 'src/'));
const geo = rows.filter(([n]) => /(earth|old-world|new-world)-map-data/.test(n));
console.log('GEO DATA bytes', geo.reduce((s, r) => s + r[1], 0), geo.map(g => g[0].split('/').pop() + '=' + g[1]).join(' '));
