import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A unit changes hands through `withNewOwner` (src/systems/unit-trained-movement-bonus.ts) and nowhere else.
 * The helper gives the unit the new owner's trained movement bonus; a raw `unit.owner = x` or
 * `{ ...unit, owner: x }` keeps the old owner's. That omission shipped as a bug for capture, secession,
 * reabsorption, gifts and upgrades (fix commits b6a4d0421, 4c2d69444) before the helper became the one path.
 */
const HELPER_FILE = 'src/systems/unit-trained-movement-bonus.ts';

// `<expr>.units[<id>].owner = …` / `unit.owner = …`, and a spread of a unit-named value that sets `owner:`.
const RAW_OWNER_ASSIGNMENT = /\b(?:units\[[^\]]+\]!?|unit|u|captured\w*|gifted\w*)\.owner\s*=(?!=)/;
const RAW_OWNER_SPREAD = /\.\.\.\w*(?:[uU]nit|mate|attacker|defender|cargo)\w*,\s*owner\b/;

function walkTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) return walkTs(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('a unit changes hands only through withNewOwner', () => {
  it('no src file writes a unit owner directly', () => {
    const root = resolve(__dirname, '../..');
    const offenders: string[] = [];
    for (const file of walkTs(resolve(root, 'src'))) {
      const rel = file.slice(root.length + 1);
      if (rel === HELPER_FILE) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (RAW_OWNER_ASSIGNMENT.test(line) || RAW_OWNER_SPREAD.test(line)) offenders.push(`${rel}:${index + 1}  ${line.trim()}`);
      });
    }
    expect(
      offenders,
      'Hand a unit to a new owner with withNewOwner(state, unit, newOwnerId[, newType]) from src/systems/unit-trained-movement-bonus.ts; it also applies the new owner\'s movement bonus.',
    ).toEqual([]);
  });
});
