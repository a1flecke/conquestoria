import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  UNIT_SFX, MOVEMENT_SFX, AIR_MOVEMENT_SFX, AIR_PROPULSION, allSfxEntries, getLocomotionClass, getMovementSfx, type SfxClass,
} from '../../src/audio/sfx-catalog';
import { UNIT_DEFINITIONS } from '../../src/systems/unit-definitions';
import type { UnitType } from '../../src/core/types';
import {
  findCoverageGaps,
  getUnitSfxRequirement,
  INTENTIONAL_SFX_FAMILIES,
  type SfxCatalogShape,
} from './helpers/sfx-coverage-policy';
import { readOggInfo } from './helpers/ogg-info';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const publicFile = (file: string) => path.join(PROJECT_ROOT, 'public', file);
const sha256 = (file: string) => createHash('sha256').update(fs.readFileSync(publicFile(file))).digest('hex');
const ALL_TYPES = Object.keys(UNIT_DEFINITIONS) as UnitType[];

describe('#612 structural SFX coverage (derived from live unit definitions)', () => {
  it('every live unit satisfies the coverage requirement derived from its own capabilities', () => {
    // No roster and no count: a UnitType added tomorrow is checked automatically.
    const gaps = findCoverageGaps(UNIT_SFX);
    expect(gaps.map(g => `${g.unit}: missing ${g.missing} (${g.need.join(' | ')})`)).toEqual([]);
  });

  it('is non-vacuous: removing one required entry makes the check fail', () => {
    const broken: SfxCatalogShape = structuredClone(UNIT_SFX) as SfxCatalogShape;
    delete broken.rifleman!['ranged-loose'];
    delete broken.rifleman!['ranged-impact'];
    expect(findCoverageGaps(broken).filter(g => g.unit === 'rifleman').map(g => g.missing).sort())
      .toEqual(['attack voice', 'hit voice']);

    const noDeath: SfxCatalogShape = structuredClone(UNIT_SFX) as SfxCatalogShape;
    delete noDeath.missionary!.death;
    expect(findCoverageGaps(noDeath).map(g => g.unit)).toContain('missionary');
  });

  it('a brand-new combat unit with no audio is flagged without touching any list', () => {
    const definitions = {
      ...UNIT_DEFINITIONS,
      future_railgun: { strength: 80, attackProfile: { kind: 'ranged', range: 3, targets: ['unit', 'city'] } },
    } as Parameters<typeof findCoverageGaps>[1];
    expect(findCoverageGaps(UNIT_SFX, definitions).filter(g => g.unit === 'future_railgun').map(g => g.missing).sort())
      .toEqual(['attack voice', 'death', 'hit voice']);
  });

  it('does not demand attack cues from units that never attack', () => {
    for (const type of ['missionary', 'great_general', 'recon_aircraft', 'maritime_patrol_aircraft', 'observation_balloon', 'scout', 'spy_agent', 'settler'] as UnitType[]) {
      const need = getUnitSfxRequirement(type);
      expect(need, type).toMatchObject({ kind: 'noncombat', attackVoice: [], hitVoice: [], death: true });
      const classes = Object.keys(UNIT_SFX[type] ?? {});
      expect(classes, `${type} must not carry a fabricated attack cue`).toEqual(['death']);
    }
  });

  it('maps attack kinds to the matching SfxClass family', () => {
    expect(getUnitSfxRequirement('rifleman').attackVoice).toContain('ranged-loose');   // ranged
    expect(getUnitSfxRequirement('artillery').attackVoice).toContain('siege-fire');    // bombard
    expect(getUnitSfxRequirement('artillery').hitVoice).toContain('siege-impact');
    expect(getUnitSfxRequirement('bomber').kind).toBe('siege');                        // air bombard
    expect(getUnitSfxRequirement('marine').attackVoice).toEqual(['attack-swing']);     // melee profile
    expect(getUnitSfxRequirement('warrior').hitVoice).toEqual(['attack-impact']);
  });

  it('class-by-kind is real for every covered unit, not just present', () => {
    for (const type of ALL_TYPES) {
      const need = getUnitSfxRequirement(type);
      const have = UNIT_SFX[type] ?? {};
      if (need.attackVoice.length > 0) {
        expect(need.attackVoice.some(c => have[c]), `${type} attack voice`).toBe(true);
      } else {
        for (const attackClass of ['attack-swing', 'ranged-loose', 'siege-fire'] as SfxClass[]) {
          expect(have[attackClass], `${type} is non-offensive but has ${attackClass}`).toBeUndefined();
        }
      }
    }
  });

  it('does not rely on a fixed unit total', () => {
    const source = fs.readFileSync(path.join(PROJECT_ROOT, 'tests/audio/sfx-catalog.test.ts'), 'utf8');
    expect(source).not.toMatch(/allSfxEntries\(\)\)\.toHaveLength\(/);
  });
});

describe('#612 intentional family reuse is explicit', () => {
  const unitsByFile = new Map<string, Set<UnitType>>();
  for (const [type, classes] of Object.entries(UNIT_SFX) as Array<[UnitType, Record<string, { file: string }>]>) {
    for (const entry of Object.values(classes)) {
      if (!unitsByFile.has(entry.file)) unitsByFile.set(entry.file, new Set());
      unitsByFile.get(entry.file)!.add(type);
    }
  }

  it('every file played by more than one unit fits inside one declared family', () => {
    const unexplained: string[] = [];
    for (const [file, units] of unitsByFile) {
      if (units.size < 2) continue;
      const covered = Object.values(INTENTIONAL_SFX_FAMILIES).some(f => [...units].every(u => f.units.includes(u)));
      if (!covered) unexplained.push(`${file} <- ${[...units].join(', ')}`);
    }
    expect(unexplained).toEqual([]);
  });

  it('declared families are not stale: every member really shares a file with another member', () => {
    for (const [name, family] of Object.entries(INTENTIONAL_SFX_FAMILIES)) {
      expect(family.note.length, name).toBeGreaterThan(10);
      for (const unit of family.units) {
        const mine = Object.values(UNIT_SFX[unit] ?? {}).map(e => e.file);
        const sharesWithMember = mine.some(file =>
          [...(unitsByFile.get(file) ?? [])].some(other => other !== unit && family.units.includes(other)));
        expect(sharesWithMember, `${name}: ${unit} shares no file with another member`).toBe(true);
      }
    }
  });
});

describe('#612 asset integrity', () => {
  const entries = allSfxEntries();

  it('no two different catalog files are byte-identical (placeholder alias detector)', () => {
    const byHash = new Map<string, string[]>();
    for (const file of new Set(entries.map(e => e.file))) {
      const hash = sha256(file);
      byHash.set(hash, [...(byHash.get(hash) ?? []), file]);
    }
    const duplicates = [...byHash.values()].filter(files => files.length > 1);
    expect(duplicates).toEqual([]);
  });

  it('air movement is a real aircraft cue, not the humanoid footstep', () => {
    expect(MOVEMENT_SFX.air.file).not.toBe(MOVEMENT_SFX.humanoid.file);
    expect(sha256(MOVEMENT_SFX.air.file)).not.toBe(sha256(MOVEMENT_SFX.humanoid.file));
    expect(sha256(MOVEMENT_SFX.air.file)).not.toBe(sha256(MOVEMENT_SFX.naval.file));
    expect(sha256(MOVEMENT_SFX.air.file)).not.toBe(sha256(MOVEMENT_SFX.animal.file));
  });

  it('every aircraft names how it flies, and each way of flying has its own cue', () => {
    const airUnits = ALL_TYPES.filter(type => getLocomotionClass(type) === 'air');
    expect(airUnits.length).toBeGreaterThan(0);
    // No aircraft may silently fall back to the generic cue: a future air unit fails here until it is classified.
    expect(airUnits.filter(type => AIR_PROPULSION[type] === undefined)).toEqual([]);
    const files = Object.values(AIR_MOVEMENT_SFX).map(entry => entry.file);
    expect(new Set(files).size).toBe(files.length);
    expect(sha256(AIR_MOVEMENT_SFX.propeller.file)).not.toBe(sha256(AIR_MOVEMENT_SFX.jet.file));
    expect(getMovementSfx('biplane')).toBe(AIR_MOVEMENT_SFX.propeller);
    expect(getMovementSfx('jet_fighter')).toBe(AIR_MOVEMENT_SFX.jet);
    expect(getMovementSfx('attack_helicopter')).toBe(AIR_MOVEMENT_SFX.rotor);
    expect(getMovementSfx('combat_drone')).toBe(AIR_MOVEMENT_SFX.drone);
    expect(getMovementSfx('observation_balloon')).toBe(MOVEMENT_SFX.air);
    // Only aircraft are affected; every other locomotion class keeps its class cue.
    expect(getMovementSfx('warrior')).toBe(MOVEMENT_SFX.humanoid);
    expect(getMovementSfx('galley')).toBe(MOVEMENT_SFX.naval);
    expect(getMovementSfx('horseman')).toBe(MOVEMENT_SFX.animal);
    expect(Object.keys(AIR_PROPULSION).every(type => getLocomotionClass(type as UnitType) === 'air')).toBe(true);
  });

  it('every catalog file is a decodable-looking Vorbis stream whose length matches the catalog, and is not silent', () => {
    const problems: string[] = [];
    for (const entry of entries) {
      const info = readOggInfo(publicFile(entry.file));
      if (!info) { problems.push(`${entry.file}: not a readable Ogg Vorbis stream`); continue; }
      if (info.durationSec < 0.08) problems.push(`${entry.file}: ${info.durationSec.toFixed(3)}s is too short`);
      if (Math.abs(info.durationSec - entry.loop.loopEnd) > 0.06 && entry.loop.loopEnd > 0) {
        problems.push(`${entry.file}: catalog loopEnd ${entry.loop.loopEnd} vs actual ${info.durationSec.toFixed(3)}`);
      }
      // A silent Vorbis stream compresses to almost nothing; real content stays well above this.
      if (info.bytesPerSecond < 2500) problems.push(`${entry.file}: ${Math.round(info.bytesPerSecond)} B/s looks silent`);
    }
    expect(problems).toEqual([]);
  });
});

describe('#612 provenance manifest', () => {
  const script = fs.readFileSync(path.join(PROJECT_ROOT, 'scripts/generate-unit-sfx.sh'), 'utf8');
  const generated = [...script.matchAll(/^finish ([a-z0-9-]+) /gm)].map(m => m[1]!);
  const manifest = fs.readFileSync(path.join(PROJECT_ROOT, 'docs/audio/unit-sfx-manifest.md'), 'utf8');
  const rows = new Map([...manifest.matchAll(/^\| `([a-z0-9-]+)\.ogg` \| [^|]+ \| (\d+) \| [\d.]+ \| [^|]+ \| [^|]+ \| `([0-9a-f]{64})` \|$/gm)]
    .map(m => [m[1]!, { bytes: Number(m[2]), sha: m[3]! }]));

  it('lists exactly the cues the generator produces', () => {
    expect(generated.length).toBeGreaterThan(0);
    expect([...rows.keys()].sort()).toEqual([...generated].sort());
  });

  it('records the true size and sha256 of every committed generated file (re-run the validator after regenerating)', () => {
    for (const name of generated) {
      const file = `audio/sfx/${name}.ogg`;
      expect(sha256(file), name).toBe(rows.get(name)!.sha);
      expect(fs.statSync(publicFile(file)).size, name).toBe(rows.get(name)!.bytes);
    }
  });

  it('every generated cue is actually referenced by the catalog (no orphan files)', () => {
    const referenced = new Set(allSfxEntries().map(e => e.file));
    for (const name of generated) expect(referenced.has(`audio/sfx/${name}.ogg`), `${name}.ogg is generated but unused`).toBe(true);
  });

  it('names the same pinned source archives in the fetch script and the manifest, and only CC0 or CC-BY sources', () => {
    const fetchScript = fs.readFileSync(path.join(PROJECT_ROOT, 'scripts/fetch-unit-sfx-sources.sh'), 'utf8');
    const pinned = [...fetchScript.matchAll(/\|([0-9a-f]{64})\|(CC0[^"]*)"/g)];
    expect(pinned.length).toBeGreaterThanOrEqual(1);
    for (const [, sha, licence] of pinned) {
      expect(manifest, `manifest lacks archive ${sha}`).toContain(sha!);
      expect(licence).toMatch(/^(CC0 1\.0|CC-BY 3\.0 \(credit: )/);
    }
    expect(fetchScript).not.toMatch(/CC-BY-NC|Sampling\+/);
  });
});
