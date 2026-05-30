# Spec 2 MR1 — SFX Catalog + Placeholder OGGs + Preloading

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the full SFX catalog (63 entries), generate placeholder OGG stubs, write catalog integrity tests, and wire preloading into AudioSystem.

**Architecture:** New file `src/audio/sfx-catalog.ts` mirrors the `TrackEntry` shape from `audio-catalog.ts`. `UNIT_SFX` maps each combat UnitType to its per-class `TrackEntry` records; `MOVEMENT_SFX` maps each locomotion class to a move-step entry. `allSfxEntries()` flattens both for preloading and testing. `AudioSystem.start()` gets a `preloadSfx()` call alongside the existing era preload.

**Tech Stack:** TypeScript, Vite, Vitest, ffmpeg (on PATH via mise).

---

## File map

| Action | Path |
|--------|------|
| Create | `src/audio/sfx-catalog.ts` |
| Create | `tests/audio/sfx-catalog.test.ts` |
| Create (63 files) | `public/audio/sfx/*.ogg` |
| Modify | `src/audio/audio-system.ts` |

---

## Catalog structure reference

Before writing code, internalize these constants:

**63 catalog entries:**
- Foot-melee (warrior, axeman, spearman, swordsman, pikeman, musketeer): `attack-swing`, `attack-impact`, `death` → 6 × 3 = 18
- Foot-ranged (archer, crossbowman): `attack-swing`, `ranged-loose`, `ranged-impact`, `death` → 2 × 4 = 8
- Mounted (horseman, cavalry, knight): `attack-swing`, `attack-impact`, `death` → 3 × 3 = 9
- Naval (galley, trireme): `attack-swing`, `attack-impact`, `death` → 2 × 3 = 6
- Siege (catapult, ballista): `siege-fire`, `siege-impact`, `death` → 2 × 3 = 6
- Special combat (shadow_warden, scout_hound, war_hound): `attack-swing`, `attack-impact`, `death` → 3 × 3 = 9
- Non-combat death-only (settler, worker, caravan, scout): `death` → 4 × 1 = 4
- Locomotion move-step: humanoid, animal, naval → 3

**File naming:** `audio/sfx/<unittype>-<sfxclass>.ogg` for unit entries, `audio/sfx/<locomotionclass>-move-step.ogg` for movement.

**Locomotion mapping** (mirrors `UNIT_MOTION_STYLES` in `src/renderer/sprites/sprite-catalog.ts`):
- `animal`: scout_hound, war_hound, horseman, cavalry, knight
- `naval`: galley, trireme, catapult, ballista
- `humanoid`: everything else

---

## Task 1: Write the failing test

**Files:**
- Create: `tests/audio/sfx-catalog.test.ts`

- [ ] **Step 1.1: Create the test file**

```typescript
// tests/audio/sfx-catalog.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  UNIT_SFX,
  MOVEMENT_SFX,
  allSfxEntries,
  getLocomotionClass,
  type LocomotionClass,
} from '../../src/audio/sfx-catalog';
import type { UnitType } from '../../src/core/types';

const COMBAT_MELEE_TYPES: UnitType[] = [
  'warrior', 'axeman', 'spearman', 'swordsman', 'pikeman', 'musketeer',
  'horseman', 'cavalry', 'knight',
  'galley', 'trireme',
  'shadow_warden', 'scout_hound', 'war_hound',
];
const RANGED_TYPES: UnitType[] = ['archer', 'crossbowman'];
const SIEGE_TYPES: UnitType[] = ['catapult', 'ballista'];
const ALL_LOCOMOTION_CLASSES: LocomotionClass[] = ['humanoid', 'animal', 'naval'];

describe('sfx-catalog completeness', () => {
  it('every combat melee unit has attack-swing, attack-impact, and death', () => {
    for (const unitType of COMBAT_MELEE_TYPES) {
      const sfx = UNIT_SFX[unitType];
      expect(sfx, `UNIT_SFX missing for ${unitType}`).toBeDefined();
      expect(sfx!['attack-swing'],  `${unitType} missing attack-swing`).toBeDefined();
      expect(sfx!['attack-impact'], `${unitType} missing attack-impact`).toBeDefined();
      expect(sfx!['death'],         `${unitType} missing death`).toBeDefined();
    }
  });

  it('every ranged unit has attack-swing, ranged-loose, ranged-impact, and death', () => {
    for (const unitType of RANGED_TYPES) {
      const sfx = UNIT_SFX[unitType];
      expect(sfx, `UNIT_SFX missing for ${unitType}`).toBeDefined();
      expect(sfx!['attack-swing'],  `${unitType} missing attack-swing`).toBeDefined();
      expect(sfx!['ranged-loose'],  `${unitType} missing ranged-loose`).toBeDefined();
      expect(sfx!['ranged-impact'], `${unitType} missing ranged-impact`).toBeDefined();
      expect(sfx!['death'],         `${unitType} missing death`).toBeDefined();
    }
  });

  it('every siege unit has siege-fire, siege-impact, and death', () => {
    for (const unitType of SIEGE_TYPES) {
      const sfx = UNIT_SFX[unitType];
      expect(sfx, `UNIT_SFX missing for ${unitType}`).toBeDefined();
      expect(sfx!['siege-fire'],   `${unitType} missing siege-fire`).toBeDefined();
      expect(sfx!['siege-impact'], `${unitType} missing siege-impact`).toBeDefined();
      expect(sfx!['death'],        `${unitType} missing death`).toBeDefined();
    }
  });

  it('every locomotion class has a move-step entry in MOVEMENT_SFX', () => {
    for (const loco of ALL_LOCOMOTION_CLASSES) {
      expect(MOVEMENT_SFX[loco], `MOVEMENT_SFX missing for ${loco}`).toBeDefined();
    }
  });

  it('allSfxEntries returns exactly 63 entries', () => {
    expect(allSfxEntries()).toHaveLength(63);
  });

  it('no two entries share the same ID', () => {
    const ids = allSfxEntries().map(e => e.id);
    expect(new Set(ids).size, 'duplicate IDs found').toBe(ids.length);
  });

  it('no two entries share the same file path', () => {
    const files = allSfxEntries().map(e => e.file);
    expect(new Set(files).size, 'duplicate file paths found').toBe(files.length);
  });

  it('every entry has loopEnd > loopStart >= 0', () => {
    for (const entry of allSfxEntries()) {
      expect(entry.loop.loopStart, `${entry.id} loopStart`).toBeGreaterThanOrEqual(0);
      expect(entry.loop.loopEnd, `${entry.id} loopEnd > loopStart`).toBeGreaterThan(entry.loop.loopStart);
    }
  });
});

describe('getLocomotionClass', () => {
  it('maps animal units correctly', () => {
    const animalTypes: UnitType[] = ['scout_hound', 'war_hound', 'horseman', 'cavalry', 'knight'];
    for (const t of animalTypes) {
      expect(getLocomotionClass(t), t).toBe('animal');
    }
  });

  it('maps naval units correctly', () => {
    const navalTypes: UnitType[] = ['galley', 'trireme', 'catapult', 'ballista'];
    for (const t of navalTypes) {
      expect(getLocomotionClass(t), t).toBe('naval');
    }
  });

  it('maps humanoid units correctly', () => {
    const humanoidTypes: UnitType[] = ['warrior', 'archer', 'settler', 'caravan', 'scout'];
    for (const t of humanoidTypes) {
      expect(getLocomotionClass(t), t).toBe('humanoid');
    }
  });
});

describe('on-disk OGG integrity', () => {
  for (const entry of allSfxEntries()) {
    it(`${entry.id}: public/${entry.file} exists with OGG magic bytes`, () => {
      const diskPath = path.join('public', entry.file);
      expect(fs.existsSync(diskPath), `missing file: ${diskPath}`).toBe(true);
      const head = fs.readFileSync(diskPath).slice(0, 4);
      expect(head.toString('ascii')).toBe('OggS');
    });
  }
});
```

- [ ] **Step 1.2: Run to confirm it fails with "Cannot find module"**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/sfx-catalog.test.ts 2>&1 | head -20
```

Expected: `Error: Cannot find module '../../src/audio/sfx-catalog'`

---

## Task 2: Implement `src/audio/sfx-catalog.ts`

**Files:**
- Create: `src/audio/sfx-catalog.ts`

- [ ] **Step 2.1: Create the catalog file**

```typescript
// src/audio/sfx-catalog.ts
import type { UnitType } from '@/core/types';
import type { TrackEntry } from './audio-catalog';

export type SfxClass =
  | 'attack-swing' | 'attack-impact' | 'death'
  | 'ranged-loose' | 'ranged-impact'
  | 'siege-fire' | 'siege-impact';

// Mirrors UnitMotionStyle in src/renderer/sprites/sprite-catalog.ts — keep in sync.
export type LocomotionClass = 'humanoid' | 'animal' | 'naval';

function ph(id: string, file: string): TrackEntry {
  return { id, file, bpm: 0, key: 'placeholder', loop: { loopStart: 0, loopEnd: 1.5 } };
}

// Movement SFX — one per locomotion class, triggered per hex entered during movement.
export const MOVEMENT_SFX: Record<LocomotionClass, TrackEntry> = {
  humanoid: ph('sfx-humanoid-move-step', 'audio/sfx/humanoid-move-step.ogg'),
  animal:   ph('sfx-animal-move-step',   'audio/sfx/animal-move-step.ogg'),
  naval:    ph('sfx-naval-move-step',    'audio/sfx/naval-move-step.ogg'),
};

// Unit SFX — keyed by UnitType, then by SfxClass. Non-combat units have death only.
export const UNIT_SFX: Partial<Record<UnitType, Partial<Record<SfxClass, TrackEntry>>>> = {

  // === Foot Melee (attack-swing, attack-impact, death) ===
  warrior: {
    'attack-swing':  ph('sfx-warrior-attack-swing',  'audio/sfx/warrior-attack-swing.ogg'),
    'attack-impact': ph('sfx-warrior-attack-impact', 'audio/sfx/warrior-attack-impact.ogg'),
    death:           ph('sfx-warrior-death',          'audio/sfx/warrior-death.ogg'),
  },
  axeman: {
    'attack-swing':  ph('sfx-axeman-attack-swing',  'audio/sfx/axeman-attack-swing.ogg'),
    'attack-impact': ph('sfx-axeman-attack-impact', 'audio/sfx/axeman-attack-impact.ogg'),
    death:           ph('sfx-axeman-death',          'audio/sfx/axeman-death.ogg'),
  },
  spearman: {
    'attack-swing':  ph('sfx-spearman-attack-swing',  'audio/sfx/spearman-attack-swing.ogg'),
    'attack-impact': ph('sfx-spearman-attack-impact', 'audio/sfx/spearman-attack-impact.ogg'),
    death:           ph('sfx-spearman-death',          'audio/sfx/spearman-death.ogg'),
  },
  swordsman: {
    'attack-swing':  ph('sfx-swordsman-attack-swing',  'audio/sfx/swordsman-attack-swing.ogg'),
    'attack-impact': ph('sfx-swordsman-attack-impact', 'audio/sfx/swordsman-attack-impact.ogg'),
    death:           ph('sfx-swordsman-death',          'audio/sfx/swordsman-death.ogg'),
  },
  pikeman: {
    'attack-swing':  ph('sfx-pikeman-attack-swing',  'audio/sfx/pikeman-attack-swing.ogg'),
    'attack-impact': ph('sfx-pikeman-attack-impact', 'audio/sfx/pikeman-attack-impact.ogg'),
    death:           ph('sfx-pikeman-death',          'audio/sfx/pikeman-death.ogg'),
  },
  musketeer: {
    'attack-swing':  ph('sfx-musketeer-attack-swing',  'audio/sfx/musketeer-attack-swing.ogg'),
    'attack-impact': ph('sfx-musketeer-attack-impact', 'audio/sfx/musketeer-attack-impact.ogg'),
    death:           ph('sfx-musketeer-death',          'audio/sfx/musketeer-death.ogg'),
  },

  // === Foot Ranged (attack-swing, ranged-loose, ranged-impact, death) ===
  archer: {
    'attack-swing':  ph('sfx-archer-attack-swing',  'audio/sfx/archer-attack-swing.ogg'),
    'ranged-loose':  ph('sfx-archer-ranged-loose',  'audio/sfx/archer-ranged-loose.ogg'),
    'ranged-impact': ph('sfx-archer-ranged-impact', 'audio/sfx/archer-ranged-impact.ogg'),
    death:           ph('sfx-archer-death',          'audio/sfx/archer-death.ogg'),
  },
  crossbowman: {
    'attack-swing':  ph('sfx-crossbowman-attack-swing',  'audio/sfx/crossbowman-attack-swing.ogg'),
    'ranged-loose':  ph('sfx-crossbowman-ranged-loose',  'audio/sfx/crossbowman-ranged-loose.ogg'),
    'ranged-impact': ph('sfx-crossbowman-ranged-impact', 'audio/sfx/crossbowman-ranged-impact.ogg'),
    death:           ph('sfx-crossbowman-death',          'audio/sfx/crossbowman-death.ogg'),
  },

  // === Mounted (attack-swing, attack-impact, death) ===
  horseman: {
    'attack-swing':  ph('sfx-horseman-attack-swing',  'audio/sfx/horseman-attack-swing.ogg'),
    'attack-impact': ph('sfx-horseman-attack-impact', 'audio/sfx/horseman-attack-impact.ogg'),
    death:           ph('sfx-horseman-death',          'audio/sfx/horseman-death.ogg'),
  },
  cavalry: {
    'attack-swing':  ph('sfx-cavalry-attack-swing',  'audio/sfx/cavalry-attack-swing.ogg'),
    'attack-impact': ph('sfx-cavalry-attack-impact', 'audio/sfx/cavalry-attack-impact.ogg'),
    death:           ph('sfx-cavalry-death',          'audio/sfx/cavalry-death.ogg'),
  },
  knight: {
    'attack-swing':  ph('sfx-knight-attack-swing',  'audio/sfx/knight-attack-swing.ogg'),
    'attack-impact': ph('sfx-knight-attack-impact', 'audio/sfx/knight-attack-impact.ogg'),
    death:           ph('sfx-knight-death',          'audio/sfx/knight-death.ogg'),
  },

  // === Naval (attack-swing, attack-impact, death) ===
  galley: {
    'attack-swing':  ph('sfx-galley-attack-swing',  'audio/sfx/galley-attack-swing.ogg'),
    'attack-impact': ph('sfx-galley-attack-impact', 'audio/sfx/galley-attack-impact.ogg'),
    death:           ph('sfx-galley-death',          'audio/sfx/galley-death.ogg'),
  },
  trireme: {
    'attack-swing':  ph('sfx-trireme-attack-swing',  'audio/sfx/trireme-attack-swing.ogg'),
    'attack-impact': ph('sfx-trireme-attack-impact', 'audio/sfx/trireme-attack-impact.ogg'),
    death:           ph('sfx-trireme-death',          'audio/sfx/trireme-death.ogg'),
  },

  // === Siege (siege-fire, siege-impact, death) ===
  catapult: {
    'siege-fire':   ph('sfx-catapult-siege-fire',   'audio/sfx/catapult-siege-fire.ogg'),
    'siege-impact': ph('sfx-catapult-siege-impact', 'audio/sfx/catapult-siege-impact.ogg'),
    death:          ph('sfx-catapult-death',         'audio/sfx/catapult-death.ogg'),
  },
  ballista: {
    'siege-fire':   ph('sfx-ballista-siege-fire',   'audio/sfx/ballista-siege-fire.ogg'),
    'siege-impact': ph('sfx-ballista-siege-impact', 'audio/sfx/ballista-siege-impact.ogg'),
    death:          ph('sfx-ballista-death',         'audio/sfx/ballista-death.ogg'),
  },

  // === Special Combat (attack-swing, attack-impact, death) ===
  shadow_warden: {
    'attack-swing':  ph('sfx-shadow_warden-attack-swing',  'audio/sfx/shadow_warden-attack-swing.ogg'),
    'attack-impact': ph('sfx-shadow_warden-attack-impact', 'audio/sfx/shadow_warden-attack-impact.ogg'),
    death:           ph('sfx-shadow_warden-death',          'audio/sfx/shadow_warden-death.ogg'),
  },
  scout_hound: {
    'attack-swing':  ph('sfx-scout_hound-attack-swing',  'audio/sfx/scout_hound-attack-swing.ogg'),
    'attack-impact': ph('sfx-scout_hound-attack-impact', 'audio/sfx/scout_hound-attack-impact.ogg'),
    death:           ph('sfx-scout_hound-death',          'audio/sfx/scout_hound-death.ogg'),
  },
  war_hound: {
    'attack-swing':  ph('sfx-war_hound-attack-swing',  'audio/sfx/war_hound-attack-swing.ogg'),
    'attack-impact': ph('sfx-war_hound-attack-impact', 'audio/sfx/war_hound-attack-impact.ogg'),
    death:           ph('sfx-war_hound-death',          'audio/sfx/war_hound-death.ogg'),
  },

  // === Non-Combat (death only) ===
  settler: { death: ph('sfx-settler-death', 'audio/sfx/settler-death.ogg') },
  worker:  { death: ph('sfx-worker-death',  'audio/sfx/worker-death.ogg') },
  caravan: { death: ph('sfx-caravan-death', 'audio/sfx/caravan-death.ogg') },
  scout:   { death: ph('sfx-scout-death',   'audio/sfx/scout-death.ogg') },
};

// Locomotion class lookup — mirrors UNIT_MOTION_STYLES in src/renderer/sprites/sprite-catalog.ts.
// Keep in sync if unit types are added.
export function getLocomotionClass(unitType: UnitType): LocomotionClass {
  const animal: UnitType[] = ['scout_hound', 'war_hound', 'horseman', 'cavalry', 'knight'];
  const naval: UnitType[] = ['galley', 'trireme', 'catapult', 'ballista'];
  if (animal.includes(unitType)) return 'animal';
  if (naval.includes(unitType)) return 'naval';
  return 'humanoid';
}

// Flat list of all catalog entries — used for preloading and catalog integrity tests.
export function allSfxEntries(): TrackEntry[] {
  const entries: TrackEntry[] = [];
  for (const sfxMap of Object.values(UNIT_SFX)) {
    if (!sfxMap) continue;
    for (const entry of Object.values(sfxMap)) {
      if (entry) entries.push(entry);
    }
  }
  return [...entries, ...Object.values(MOVEMENT_SFX)];
}
```

- [ ] **Step 2.2: Run catalog structure tests only (exclude disk tests)**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/sfx-catalog.test.ts -t "sfx-catalog completeness|getLocomotionClass" 2>&1 | tail -20
```

Expected: all 8 completeness + 3 locomotion tests PASS. Disk tests will fail — that is expected (files not created yet).

---

## Task 3: Generate 63 placeholder OGG files

**Files:**
- Create: `public/audio/sfx/*.ogg` (63 files)

- [ ] **Step 3.1: Generate a 1.5-second silent OGG placeholder and copy to all paths**

```bash
mkdir -p public/audio/sfx

# Generate minimal silent OGG (1.5 s, mono, 44100 Hz)
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1.5 -c:a libvorbis -q:a 2 /tmp/sfx-placeholder.ogg -y

# Copy to all catalog paths
for f in \
  warrior-attack-swing warrior-attack-impact warrior-death \
  axeman-attack-swing axeman-attack-impact axeman-death \
  spearman-attack-swing spearman-attack-impact spearman-death \
  swordsman-attack-swing swordsman-attack-impact swordsman-death \
  pikeman-attack-swing pikeman-attack-impact pikeman-death \
  musketeer-attack-swing musketeer-attack-impact musketeer-death \
  archer-attack-swing archer-ranged-loose archer-ranged-impact archer-death \
  crossbowman-attack-swing crossbowman-ranged-loose crossbowman-ranged-impact crossbowman-death \
  horseman-attack-swing horseman-attack-impact horseman-death \
  cavalry-attack-swing cavalry-attack-impact cavalry-death \
  knight-attack-swing knight-attack-impact knight-death \
  galley-attack-swing galley-attack-impact galley-death \
  trireme-attack-swing trireme-attack-impact trireme-death \
  catapult-siege-fire catapult-siege-impact catapult-death \
  ballista-siege-fire ballista-siege-impact ballista-death \
  shadow_warden-attack-swing shadow_warden-attack-impact shadow_warden-death \
  scout_hound-attack-swing scout_hound-attack-impact scout_hound-death \
  war_hound-attack-swing war_hound-attack-impact war_hound-death \
  settler-death worker-death caravan-death scout-death \
  humanoid-move-step animal-move-step naval-move-step; do
  cp /tmp/sfx-placeholder.ogg "public/audio/sfx/${f}.ogg"
done

echo "Created $(ls public/audio/sfx/ | wc -l) files"
```

Expected output: `Created 63 files`

- [ ] **Step 3.2: Verify OGG magic bytes on a sample**

```bash
xxd public/audio/sfx/warrior-death.ogg | head -1
```

Expected: first 4 bytes are `4f 67 67 53` (= `OggS` in hex)

- [ ] **Step 3.3: Run full test suite for sfx-catalog**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/sfx-catalog.test.ts 2>&1 | tail -20
```

Expected: all tests PASS (including all 63 disk-integrity tests)

---

## Task 4: Wire `preloadSfx()` into AudioSystem

**Files:**
- Modify: `src/audio/audio-system.ts`

- [ ] **Step 4.1: Add import**

In `src/audio/audio-system.ts`, add to the existing import block:

```typescript
import { allSfxEntries } from './sfx-catalog';
```

- [ ] **Step 4.2: Add `preloadSfx()` call in `start()`**

In the `start()` method, directly after the existing `void this.preloadForEra(...)` call:

```typescript
    void this.preloadSfx();
```

- [ ] **Step 4.3: Add private method**

After the existing `private async preloadForEra(...)` method, add:

```typescript
  private preloadSfx(): Promise<void> {
    return this.loader.preload(allSfxEntries().map(e => e.file));
  }
```

- [ ] **Step 4.4: Verify TypeScript compiles**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```

Expected: exit 0, no TypeScript errors.

---

## Task 5: Final verification and commit

- [ ] **Step 5.1: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
```

Expected: all tests pass, including the 63 disk-integrity tests in `sfx-catalog.test.ts`.

- [ ] **Step 5.2: Verify build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 5.3: Commit**

```bash
git add src/audio/sfx-catalog.ts tests/audio/sfx-catalog.test.ts public/audio/sfx/ src/audio/audio-system.ts docs/superpowers/plans/
git commit -m "feat(audio): SFX catalog with 63 placeholder entries + preloading (Spec 2 MR1)"
```

---

## Self-review checklist

- All 27 UnitType values covered: 23 in UNIT_SFX (4 combat groups + non-combat), 4 spy types deferred to later MR
- Locomotion mapping matches UNIT_MOTION_STYLES in sprite-catalog.ts
- No duplicate IDs: IDs follow `sfx-<unittype>-<sfxclass>` pattern, all unique
- No duplicate file paths: file naming `audio/sfx/<unittype>-<sfxclass>.ogg` is unique by construction
- `allSfxEntries()` returns exactly 63 — tested by the `toHaveLength(63)` assertion
- `preloadSfx()` is fire-and-forget (`void`) — SFX failures are non-fatal (loader returns silent buffer on error)
- No player-visible change — SFX bus is live but plays nothing until MR2 wires the director
- Spy types (spy_scout, spy_informant, spy_agent, spy_operative, spy_hacker) deferred: will get `death` entries in a follow-up MR or curation pass
