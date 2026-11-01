#!/usr/bin/env node
// #1454: owner-liveness for the long-horizon known-gap register.
//
// Every KNOWN_CAMPAIGN_GAPS entry names the GitHub issue that owns the stall. A closed owner means nobody is
// accountable for the accepted finding, which the offline ratchet cannot see. Two modes, both reading only the
// `issue: '#N'` literals in tests/simulation/long-horizon/known-campaign-gaps.ts:
//
//   verify   Ask GitHub (`gh`) for each owner's state; exit 1 if any is not OPEN, exit 3 if GitHub could not be
//            reached (the offline snapshot check in tests/scripts/known-campaign-gap-registry.test.ts still runs).
//            Read-only. run-ai-long-horizon.sh calls this before a 1-3 hour run so a closed owner fails in seconds.
//   refresh  Same query, then rewrite tests/simulation/long-horizon/known-gap-owners.json (the committed snapshot the
//            offline test reads). Run it after changing an `issue:` reference.
//
// The ordinary suite never calls GitHub: it only compares the register with the snapshot.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTER = resolve(ROOT, 'tests/simulation/long-horizon/known-campaign-gaps.ts');
const SNAPSHOT = resolve(ROOT, 'tests/simulation/long-horizon/known-gap-owners.json');

export function registeredOwners(source) {
  const ids = new Set();
  for (const match of source.matchAll(/^\s*issue:\s*'(#[1-9]\d*)'/gm)) ids.add(match[1]);
  return [...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

function ownerState(id) {
  const out = execFileSync('gh', ['issue', 'view', id.slice(1), '--json', 'state', '--jq', '.state'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (out !== 'OPEN' && out !== 'CLOSED') throw new Error(`unexpected state '${out}' for ${id}`);
  return out.toLowerCase();
}

function main(mode) {
  if (mode !== 'verify' && mode !== 'refresh') {
    console.error('usage: known-gap-owners.mjs verify|refresh');
    return 2;
  }
  const owners = registeredOwners(readFileSync(REGISTER, 'utf8'));
  if (owners.length === 0) {
    // #1479: an EMPTY register is the intended state after a clean matrix — no finding is accepted, so there is no
    // owner to check. It is not a sign the register "moved": the parser reads the same file the ratchet reads, and
    // the ratchet fails the run for any finding the register does not cover.
    console.log('known-gap-owners: the register accepts no gaps, so there is no owner to verify.');
    if (mode === 'refresh') {
      const snapshot = {
        _comment: 'Recorded GitHub state of every known-gap owner. Regenerate with ./scripts/dev.sh known-gap-owners-refresh; never edit by hand.',
        checkedAt: new Date().toISOString().slice(0, 10),
        owners: {},
      };
      writeFileSync(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);
      console.log(`known-gap-owners: wrote ${SNAPSHOT}`);
    }
    return 0;
  }
  const states = {};
  try {
    for (const id of owners) states[id] = ownerState(id);
  } catch (error) {
    console.error(`known-gap-owners: could not query GitHub (${String(error.message).split('\n')[0]}); owners left UNVERIFIED.`);
    return 3;
  }
  const closed = owners.filter(id => states[id] === 'closed');
  for (const id of owners) console.log(`${id}\t${states[id]}`);
  if (mode === 'refresh') {
    const snapshot = {
      _comment: 'Recorded GitHub state of every known-gap owner. Regenerate with ./scripts/dev.sh known-gap-owners-refresh; never edit by hand.',
      checkedAt: new Date().toISOString().slice(0, 10),
      owners: Object.fromEntries(owners.map(id => [id, states[id]])),
    };
    writeFileSync(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`known-gap-owners: wrote ${SNAPSHOT}`);
  }
  if (closed.length > 0) {
    console.error(`known-gap-owners: CLOSED owner(s) ${closed.join(', ')}: reassign the register entry to an open issue.`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv[2]));
}
