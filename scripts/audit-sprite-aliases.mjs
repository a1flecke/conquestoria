// Audits UNIT_SPRITE_CATALOG for units rendering via another unit's sprite function
// (id and function name resolve to different sprites) rather than their own bespoke art.
// See issue #769. Run: bash scripts/run-with-mise.sh yarn node scripts/audit-sprite-aliases.mjs
import { readFileSync } from 'node:fs';

const CATALOG_PATH = new URL('../src/renderer/sprites/sprite-catalog.ts', import.meta.url);

// Legendary beasts intentionally have real, bespoke, descriptively-named sprites whose
// function name doesn't match their unit id (e.g. beast_boar -> GiantBoarSprite). Verified
// manually when #769 was filed — do not remove an entry from this list without re-verifying
// the sprite is genuinely bespoke, not a reuse.
const KNOWN_NON_ALIAS_EXCEPTIONS = new Set([
  'beast_boar',
  'beast_wolf',
  'beast_basilisk',
  'beast_sea_serpent',
  'beast_wurm',
  'beast_roc',
  'beast_hydra',
  'beast_dragon',
]);

function expectedFunctionName(unitId) {
  const pascal = unitId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `${pascal}Sprite`;
}

const source = readFileSync(CATALOG_PATH, 'utf8');
const catalogBlockMatch = source.match(
  /export const UNIT_SPRITE_CATALOG[^{]*\{([\s\S]*?)\n\};/
);
if (!catalogBlockMatch) {
  console.error('Could not locate UNIT_SPRITE_CATALOG block — sprite-catalog.ts structure may have changed.');
  process.exit(1);
}

const entryPattern = /^\s*(\w+):\s*withMotion\('(\w+)',\s*(\w+)\)/gm;
const entries = [];

let match;
while ((match = entryPattern.exec(catalogBlockMatch[1])) !== null) {
  const [, key, motionId, functionName] = match;
  if (key !== motionId) {
    console.warn(`Mismatched catalog key/withMotion id: ${key} vs ${motionId} — investigate manually.`);
  }
  entries.push({ unit: key, function: functionName });
}

// A unit "owns" its sprite function when the function name follows the standard
// <PascalCase(id)>Sprite convention. This is order-independent (unlike "first entry using
// a function wins"), so e.g. `rifleman -> RiflemanSprite` is correctly identified as the
// owner even though `marine` (which reuses the same function) appears earlier in the file.
const functionToOwner = new Map();
for (const { unit, function: fn } of entries) {
  if (fn === expectedFunctionName(unit)) {
    functionToOwner.set(fn, unit);
  }
}

const aliases = [];
for (const { unit, function: fn } of entries) {
  if (KNOWN_NON_ALIAS_EXCEPTIONS.has(unit)) continue;
  const owner = functionToOwner.get(fn);
  if (owner && owner !== unit) {
    aliases.push({ unit, function: fn, donor: owner });
  }
}

if (aliases.length === 0) {
  console.log('No new sprite aliases found — every UNIT_SPRITE_CATALOG entry renders its own function.');
  process.exit(0);
}

console.log(`Found ${aliases.length} unit(s) reusing another unit's exact sprite function:\n`);
for (const { unit, function: fn, donor } of aliases) {
  console.log(`  ${unit.padEnd(20)} -> ${fn}  (same as ${donor})`);
}
console.log('\nCross-check this list against issue #769 before starting the next batch:');
console.log('  gh issue view 769 --json body -q .body | head -40');
console.log('If this list has grown since #769 was filed, update the issue\'s plan/batches before proceeding.');
process.exit(1);
