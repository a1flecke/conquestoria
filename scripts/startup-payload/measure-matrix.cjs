// Interleaves baseline and candidate cold-start measurements: rounds x [baseline, candidate], per CPU rate.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const here = __dirname;
const results = {};
for (const rate of [1, 4]) {
  for (let round = 1; round <= 3; round++) {
    for (const variant of ['baseline', 'candidate']) {
      const out = execFileSync(process.execPath, [path.join(here, 'measure-startup.cjs'), path.join(here, `dist-${variant}`), variant, rate === 1 ? '9' : '7', String(rate)], { encoding: 'utf8', env: process.env });
      const parsed = JSON.parse(out);
      const key = `${variant}@${rate}x`;
      (results[key] ||= []).push(parsed.summary);
    }
  }
}
const med = values => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const table = {};
for (const [key, rounds] of Object.entries(results)) {
  table[key] = {};
  for (const metric of ['interactiveMs', 'scriptMs', 'taskMs', 'jsHeapMB', 'transferKB', 'jsRequests']) {
    table[key][metric] = { roundMedians: rounds.map(r => r[metric].median), median: med(rounds.map(r => r[metric].median)) };
  }
}
fs.writeFileSync(path.join(here, 'matrix.json'), JSON.stringify(table, null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(table).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([m, x]) => [m, `${x.median} [${x.roundMedians.join(',')}]`]))])), null, 1));
