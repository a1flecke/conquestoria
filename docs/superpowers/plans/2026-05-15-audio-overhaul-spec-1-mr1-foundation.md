# MR1 — Foundation: Test Infra, Pure Data, Placeholder OGGs

Part of [Audio Overhaul Spec 1 Plan](./2026-05-15-audio-overhaul-spec-1-index.md).

**Goal:** Pure data modules + test infrastructure + 34 silent placeholder OGGs on disk. Zero changes to `main.ts` or existing game logic. Game unchanged after merge; `yarn build && yarn test` both exit 0.

**Why this is safe to merge partial:** All changes are new files. Nothing in the production code path changes. The placeholder OGGs are referenced nowhere in the running game until MR4.

---

## Task 1: MockAudioContext helper

**Files:**
- Create: `tests/helpers/mock-audio-context.ts`

This module is the test scaffold for all Web Audio tests. It records every node creation and every operation on a `transcript` array. Tests assert *which operations occurred* and *in what order*, not Web Audio's internal correctness.

- [ ] **Step 1: Write `tests/helpers/mock-audio-context.ts`**

```ts
import { vi } from 'vitest';

export interface TranscriptEntry {
  time: number;
  op: string;
  nodeId: string;
  args: unknown[];
}

let nodeCounter = 0;

export class MockAudioParam {
  value = 0;

  constructor(
    private ctx: MockAudioContext,
    private transcript: TranscriptEntry[],
    public readonly nodeId: string,
  ) {}

  setValueAtTime(v: number, t: number): this {
    this.value = v;
    this.transcript.push({ time: this.ctx.currentTime, op: 'setValueAtTime', nodeId: this.nodeId, args: [v, t] });
    return this;
  }

  linearRampToValueAtTime(v: number, t: number): this {
    this.transcript.push({ time: this.ctx.currentTime, op: 'linearRampToValueAtTime', nodeId: this.nodeId, args: [v, t] });
    return this;
  }

  exponentialRampToValueAtTime(v: number, t: number): this {
    this.transcript.push({ time: this.ctx.currentTime, op: 'exponentialRampToValueAtTime', nodeId: this.nodeId, args: [v, t] });
    return this;
  }

  cancelScheduledValues(t: number): this {
    this.transcript.push({ time: this.ctx.currentTime, op: 'cancelScheduledValues', nodeId: this.nodeId, args: [t] });
    return this;
  }
}

export class MockGainNode {
  readonly id: string;
  readonly gain: MockAudioParam;
  readonly connectedTo: string[] = [];
  context: MockAudioContext;

  constructor(ctx: MockAudioContext, transcript: TranscriptEntry[]) {
    this.context = ctx;
    this.id = `gain-${nodeCounter++}`;
    this.gain = new MockAudioParam(ctx, transcript, this.id);
  }

  connect(dest: MockGainNode | MockBufferSourceNode | { id: string }): this {
    const destId = (dest as MockGainNode).id;
    this.connectedTo.push(destId);
    this.context.transcript.push({ time: this.context.currentTime, op: 'connect', nodeId: this.id, args: [destId] });
    return this;
  }

  disconnect(): void {
    this.context.transcript.push({ time: this.context.currentTime, op: 'disconnect', nodeId: this.id, args: [] });
  }
}

export class MockBufferSourceNode {
  readonly id: string;
  buffer: AudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  context: MockAudioContext;

  constructor(ctx: MockAudioContext, private transcript: TranscriptEntry[]) {
    this.context = ctx;
    this.id = `source-${nodeCounter++}`;
  }

  connect(dest: MockGainNode | { id: string }): this {
    const destId = (dest as MockGainNode).id;
    this.transcript.push({ time: this.context.currentTime, op: 'connect', nodeId: this.id, args: [destId] });
    return this;
  }

  start(when?: number): void {
    this.transcript.push({ time: this.context.currentTime, op: 'start', nodeId: this.id, args: [when ?? this.context.currentTime] });
  }

  stop(when?: number): void {
    this.transcript.push({ time: this.context.currentTime, op: 'stop', nodeId: this.id, args: [when ?? this.context.currentTime] });
    // Trigger onended synchronously so playOneShot Promise resolves in tests
    if (this.onended) {
      const cb = this.onended;
      this.onended = null;
      cb();
    }
  }
}

export class MockAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  currentTime = 0;
  sampleRate = 44100;
  transcript: TranscriptEntry[] = [];
  destination = { id: 'destination', context: undefined as unknown } as unknown as AudioDestinationNode;

  constructor() {
    (this.destination as unknown as { context: MockAudioContext }).context = this;
  }

  suspend = vi.fn().mockImplementation(() => {
    this.state = 'suspended';
    return Promise.resolve();
  });

  resume = vi.fn().mockImplementation(() => {
    this.state = 'running';
    return Promise.resolve();
  });

  close = vi.fn().mockImplementation(() => {
    this.state = 'closed';
    return Promise.resolve();
  });

  createGain(): MockGainNode {
    const node = new MockGainNode(this, this.transcript);
    this.transcript.push({ time: this.currentTime, op: 'createGain', nodeId: node.id, args: [] });
    return node;
  }

  createBufferSource(): MockBufferSourceNode {
    const node = new MockBufferSourceNode(this, this.transcript);
    this.transcript.push({ time: this.currentTime, op: 'createBufferSource', nodeId: node.id, args: [] });
    return node;
  }

  createBuffer(channels: number, frames: number, rate: number): AudioBuffer {
    return { numberOfChannels: channels, length: frames, sampleRate: rate, duration: frames / rate } as unknown as AudioBuffer;
  }

  decodeAudioData(_buf: ArrayBuffer): Promise<AudioBuffer> {
    return Promise.resolve(this.createBuffer(2, 44100, 44100));
  }

  opsOf(type: string): TranscriptEntry[] {
    return this.transcript.filter(e => e.op === type);
  }

  clearTranscript(): void {
    this.transcript = [];
  }

  advanceTime(ms: number): void {
    this.currentTime += ms / 1000;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
eval "$(mise activate bash)" && yarn build
```

Expected: exit 0 (the mock is never imported by production code; only tests import it)

- [ ] **Step 3: Commit**

```bash
git add tests/helpers/mock-audio-context.ts
git commit -m "test(audio): add MockAudioContext transcript helper for Web Audio unit tests"
```

---

## Task 2: CivAudioFamily module + tests

**Files:**
- Create: `src/audio/civ-audio-family.ts`
- Create: `tests/audio/civ-audio-family.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/audio/civ-audio-family.test.ts
import { describe, it, expect } from 'vitest';
import {
  CIV_TO_AUDIO_FAMILY,
  MINOR_CIV_TO_AUDIO_FAMILY,
  getFamilyForCiv,
  type AudioFamily,
} from '../../src/audio/civ-audio-family';
import { CIV_DEFINITIONS } from '../../src/systems/civ-definitions';
import { MINOR_CIV_DEFINITIONS } from '../../src/systems/minor-civ-definitions';

const ALL_FAMILIES: AudioFamily[] = [
  'east-asian', 'south-asian', 'middle-eastern', 'mediterranean-antiquity',
  'western-european', 'norse', 'african', 'mesoamerican', 'steppe',
  'fantasy-high', 'fantasy-dark', 'fantasy-mystical',
];

describe('CIV_TO_AUDIO_FAMILY', () => {
  it('every civ in CIV_DEFINITIONS has an entry', () => {
    for (const def of CIV_DEFINITIONS) {
      expect(CIV_TO_AUDIO_FAMILY[def.id], `major civ missing: ${def.id}`).toBeDefined();
    }
  });

  it('every mapped value is a valid AudioFamily literal', () => {
    for (const [id, family] of Object.entries(CIV_TO_AUDIO_FAMILY)) {
      expect(ALL_FAMILIES, `invalid family for ${id}`).toContain(family);
    }
  });
});

describe('MINOR_CIV_TO_AUDIO_FAMILY', () => {
  it('every minor civ in MINOR_CIV_DEFINITIONS has an entry', () => {
    for (const def of MINOR_CIV_DEFINITIONS) {
      expect(MINOR_CIV_TO_AUDIO_FAMILY[def.id], `minor civ missing: ${def.id}`).toBeDefined();
    }
  });

  it('every mapped value is a valid AudioFamily literal', () => {
    for (const [id, family] of Object.entries(MINOR_CIV_TO_AUDIO_FAMILY)) {
      expect(ALL_FAMILIES, `invalid family for ${id}`).toContain(family);
    }
  });
});

describe('getFamilyForCiv', () => {
  it('returns the correct family for known major civs', () => {
    expect(getFamilyForCiv('china')).toBe('east-asian');
    expect(getFamilyForCiv('rome')).toBe('mediterranean-antiquity');
    expect(getFamilyForCiv('viking')).toBe('norse');
    expect(getFamilyForCiv('isengard')).toBe('fantasy-dark');
    expect(getFamilyForCiv('mongolia')).toBe('steppe');
  });

  it('returns the correct family for known minor civs', () => {
    expect(getFamilyForCiv('sparta')).toBe('mediterranean-antiquity');
    expect(getFamilyForCiv('gondolin')).toBe('fantasy-high');
    expect(getFamilyForCiv('zanzibar')).toBe('african');
    expect(getFamilyForCiv('samarkand')).toBe('middle-eastern');
  });

  it('returns mediterranean-antiquity for unknown civ IDs (H-5 fallback)', () => {
    expect(getFamilyForCiv('unknown-civ-id')).toBe('mediterranean-antiquity');
    expect(getFamilyForCiv('')).toBe('mediterranean-antiquity');
    expect(getFamilyForCiv('future-civ-not-yet-mapped')).toBe('mediterranean-antiquity');
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
eval "$(mise activate bash)" && yarn test tests/audio/civ-audio-family.test.ts 2>&1 | tail -5
```

Expected: `Cannot find module '../../src/audio/civ-audio-family'`

- [ ] **Step 3: Write `src/audio/civ-audio-family.ts`**

```ts
export type AudioFamily =
  | 'east-asian'
  | 'south-asian'
  | 'middle-eastern'
  | 'mediterranean-antiquity'
  | 'western-european'
  | 'norse'
  | 'african'
  | 'mesoamerican'
  | 'steppe'
  | 'fantasy-high'
  | 'fantasy-dark'
  | 'fantasy-mystical';

// 29 major civs — add new civs here as civ-definitions.ts grows
export const CIV_TO_AUDIO_FAMILY: Record<string, AudioFamily> = {
  china:       'east-asian',
  japan:       'east-asian',
  india:       'south-asian',
  babylon:     'middle-eastern',
  persia:      'middle-eastern',
  ottoman:     'middle-eastern',
  rome:        'mediterranean-antiquity',
  greece:      'mediterranean-antiquity',
  egypt:       'mediterranean-antiquity',
  england:     'western-european',
  france:      'western-european',
  germany:     'western-european',
  spain:       'western-european',
  russia:      'western-european',
  viking:      'norse',
  zulu:        'african',
  wakanda:     'african',
  aztec:       'mesoamerican',
  mongolia:    'steppe',
  gondor:      'fantasy-high',
  rohan:       'fantasy-high',
  lothlorien:  'fantasy-high',
  avalon:      'fantasy-high',
  narnia:      'fantasy-high',
  shire:       'fantasy-high',
  isengard:    'fantasy-dark',
  annuvin:     'fantasy-dark',
  atlantis:    'fantasy-mystical',
  prydain:     'fantasy-mystical',
};

// 12 minor civs — keyed to cultural/historical parent (H-5)
export const MINOR_CIV_TO_AUDIO_FAMILY: Record<string, AudioFamily> = {
  sparta:     'mediterranean-antiquity',
  valyria:    'fantasy-dark',
  numantia:   'mediterranean-antiquity',
  gondolin:   'fantasy-high',
  carthage:   'mediterranean-antiquity',
  zanzibar:   'african',
  samarkand:  'middle-eastern',
  petra:      'middle-eastern',
  alexandria: 'mediterranean-antiquity',
  delphi:     'mediterranean-antiquity',
  timbuktu:   'african',
  avalon:     'fantasy-high',
};

const DEFAULT_FAMILY: AudioFamily = 'mediterranean-antiquity';

export function getFamilyForCiv(civType: string): AudioFamily {
  return CIV_TO_AUDIO_FAMILY[civType] ?? MINOR_CIV_TO_AUDIO_FAMILY[civType] ?? DEFAULT_FAMILY;
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
eval "$(mise activate bash)" && yarn test tests/audio/civ-audio-family.test.ts
```

Expected: PASS — all assertions green

- [ ] **Step 5: Confirm build still passes**

```bash
eval "$(mise activate bash)" && yarn build
```

Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add src/audio/civ-audio-family.ts tests/audio/civ-audio-family.test.ts
git commit -m "feat(audio): add CivAudioFamily — 12 cultural families covering 29 major + 12 minor civs"
```

---

## Task 3: AudioCatalog module + tests

**Files:**
- Create: `src/audio/audio-catalog.ts`
- Create: `tests/audio/audio-catalog.test.ts`

**Important:** Catalog file paths are relative without a leading slash (e.g., `'audio/era/era1-base.ogg'`). At runtime, `AudioLoader` prepends `import.meta.env.BASE_URL`. In tests, `path.join('public', entry.file)` resolves to `'public/audio/era/era1-base.ogg'` which is the correct on-disk path.

- [ ] **Step 1: Write `src/audio/audio-catalog.ts`**

Write this file first (before the test) because the test imports it.

```ts
import type { AudioFamily } from './civ-audio-family';

// Shared loop-point shape. Imported by audio-mixer.ts (C-4 dedup — one source of truth).
export interface LoopPoints {
  loopStart: number;
  loopEnd: number;
}

export type EraId = 1 | 2 | 3 | 4 | 5;

export interface TrackEntry {
  id: string;
  file: string;         // Relative path — no leading slash. AudioLoader prepends BASE_URL.
  bpm: number;          // 0 for placeholders; updated by curation MRs
  key: string;          // 'placeholder' until curation; then e.g. 'D-minor'
  loop: LoopPoints;
  idealCrossfadeOutAt?: number;
  qualityTier?: 'low' | 'med' | 'high';
}

function ph(id: string, file: string, duration = 30): TrackEntry {
  return { id, file, bpm: 0, key: 'placeholder', loop: { loopStart: 0, loopEnd: duration } };
}

export const ERA_BASE: Record<EraId, TrackEntry> = {
  1: ph('era1-base', 'audio/era/era1-base.ogg'),
  2: ph('era2-base', 'audio/era/era2-base.ogg'),
  3: ph('era3-base', 'audio/era/era3-base.ogg'),
  4: ph('era4-base', 'audio/era/era4-base.ogg'),
  5: ph('era5-base', 'audio/era/era5-base.ogg'),
};

export const WAR_LAYER: Record<EraId, TrackEntry> = {
  1: ph('era1-war', 'audio/war/era1-war.ogg'),
  2: ph('era2-war', 'audio/war/era2-war.ogg'),
  3: ph('era3-war', 'audio/war/era3-war.ogg'),
  4: ph('era4-war', 'audio/war/era4-war.ogg'),
  5: ph('era5-war', 'audio/war/era5-war.ogg'),
};

export const ACCENT: Record<AudioFamily, TrackEntry> = {
  'east-asian':              ph('accent-east-asian',              'audio/accent/east-asian.ogg'),
  'south-asian':             ph('accent-south-asian',             'audio/accent/south-asian.ogg'),
  'middle-eastern':          ph('accent-middle-eastern',          'audio/accent/middle-eastern.ogg'),
  'mediterranean-antiquity': ph('accent-mediterranean-antiquity', 'audio/accent/mediterranean-antiquity.ogg'),
  'western-european':        ph('accent-western-european',        'audio/accent/western-european.ogg'),
  'norse':                   ph('accent-norse',                   'audio/accent/norse.ogg'),
  'african':                 ph('accent-african',                 'audio/accent/african.ogg'),
  'mesoamerican':            ph('accent-mesoamerican',            'audio/accent/mesoamerican.ogg'),
  'steppe':                  ph('accent-steppe',                  'audio/accent/steppe.ogg'),
  'fantasy-high':            ph('accent-fantasy-high',            'audio/accent/fantasy-high.ogg'),
  'fantasy-dark':            ph('accent-fantasy-dark',            'audio/accent/fantasy-dark.ogg'),
  'fantasy-mystical':        ph('accent-fantasy-mystical',        'audio/accent/fantasy-mystical.ogg'),
};

export const STINGER = {
  eraAdvance: {
    1: ph('stinger-era1-advance', 'audio/stinger/era1-advance.ogg', 5),
    2: ph('stinger-era2-advance', 'audio/stinger/era2-advance.ogg', 5),
    3: ph('stinger-era3-advance', 'audio/stinger/era3-advance.ogg', 5),
    4: ph('stinger-era4-advance', 'audio/stinger/era4-advance.ogg', 5),
    5: ph('stinger-era5-advance', 'audio/stinger/era5-advance.ogg', 5),
  } as Record<EraId, TrackEntry>,
  eraTransitionCue: {
    1: ph('stinger-era1-transition-cue', 'audio/stinger/era1-transition-cue.ogg', 2),
    2: ph('stinger-era2-transition-cue', 'audio/stinger/era2-transition-cue.ogg', 2),
    3: ph('stinger-era3-transition-cue', 'audio/stinger/era3-transition-cue.ogg', 2),
    4: ph('stinger-era4-transition-cue', 'audio/stinger/era4-transition-cue.ogg', 2),
    5: ph('stinger-era5-transition-cue', 'audio/stinger/era5-transition-cue.ogg', 2),
  } as Record<EraId, TrackEntry>,
  cityFounded: ph('stinger-city-founded', 'audio/stinger/city-founded.ogg', 3),
  warDeclared:  ph('stinger-war-declared',  'audio/stinger/war-declared.ogg',  3),
};

// Er2: clamps era > 5 to 5; no per-civ era tracking in Spec 1
export function resolveEra(era: number): EraId {
  if (era <= 1) return 1;
  if (era >= 5) return 5;
  return era as EraId;
}
```

- [ ] **Step 2: Write `tests/audio/audio-catalog.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ERA_BASE, WAR_LAYER, ACCENT, STINGER, resolveEra, type EraId } from '../../src/audio/audio-catalog';
import { CIV_TO_AUDIO_FAMILY, MINOR_CIV_TO_AUDIO_FAMILY } from '../../src/audio/civ-audio-family';

const ERAS: EraId[] = [1, 2, 3, 4, 5];

const ALL_ENTRIES = [
  ...Object.values(ERA_BASE),
  ...Object.values(WAR_LAYER),
  ...Object.values(ACCENT),
  ...Object.values(STINGER.eraAdvance),
  ...Object.values(STINGER.eraTransitionCue),
  STINGER.cityFounded,
  STINGER.warDeclared,
];

describe('resolveEra (Er2)', () => {
  it('clamps > 5 to 5', () => {
    expect(resolveEra(6)).toBe(5);
    expect(resolveEra(100)).toBe(5);
  });
  it('clamps <= 0 to 1', () => {
    expect(resolveEra(0)).toBe(1);
    expect(resolveEra(-1)).toBe(1);
  });
  it('passes through 1–5 unchanged', () => {
    for (const e of ERAS) expect(resolveEra(e)).toBe(e);
  });
});

describe('catalog completeness', () => {
  it('every era has ERA_BASE, WAR_LAYER, STINGER.eraAdvance, STINGER.eraTransitionCue (UX-2)', () => {
    for (const e of ERAS) {
      expect(ERA_BASE[e], `ERA_BASE[${e}]`).toBeDefined();
      expect(WAR_LAYER[e], `WAR_LAYER[${e}]`).toBeDefined();
      expect(STINGER.eraAdvance[e], `STINGER.eraAdvance[${e}]`).toBeDefined();
      expect(STINGER.eraTransitionCue[e], `STINGER.eraTransitionCue[${e}]`).toBeDefined();
    }
  });

  it('STINGER.cityFounded and STINGER.warDeclared exist', () => {
    expect(STINGER.cityFounded).toBeDefined();
    expect(STINGER.warDeclared).toBeDefined();
  });

  it('every AudioFamily used by any civ has an ACCENT entry', () => {
    const usedFamilies = new Set([
      ...Object.values(CIV_TO_AUDIO_FAMILY),
      ...Object.values(MINOR_CIV_TO_AUDIO_FAMILY),
    ]);
    for (const family of usedFamilies) {
      expect(ACCENT[family], `ACCENT missing for family: ${family}`).toBeDefined();
    }
  });

  it('every TrackEntry has loop.loopStart >= 0 and loop.loopEnd > loopStart', () => {
    for (const entry of ALL_ENTRIES) {
      expect(entry.loop.loopStart, `${entry.id} loopStart`).toBeGreaterThanOrEqual(0);
      expect(entry.loop.loopEnd, `${entry.id} loopEnd > loopStart`).toBeGreaterThan(entry.loop.loopStart);
    }
  });

  it('no two entries share the same file path', () => {
    const paths = ALL_ENTRIES.map(e => e.file);
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });
});

describe('on-disk OGG integrity', () => {
  // These tests pass after Task 4 (placeholder OGG generation).
  // They will FAIL if run before the ffmpeg step — that is expected and intentional.
  for (const entry of ALL_ENTRIES) {
    it(`${entry.id}: file exists at public/${entry.file} with OGG magic bytes`, () => {
      const diskPath = path.join('public', entry.file);
      expect(fs.existsSync(diskPath), `missing file: ${diskPath}`).toBe(true);
      const head = fs.readFileSync(diskPath).slice(0, 4);
      expect(head.toString('ascii')).toBe('OggS');
    });
  }
});
```

- [ ] **Step 3: Run catalog-completeness tests (on-disk group will fail until Task 4)**

```bash
eval "$(mise activate bash)" && yarn test tests/audio/audio-catalog.test.ts 2>&1 | grep -E "(PASS|FAIL|✓|×|on-disk)" | head -20
```

Expected: `resolveEra` and `catalog completeness` groups PASS; `on-disk OGG integrity` group FAIL (files don't exist yet — correct and expected)

- [ ] **Step 4: Commit catalog source and test**

```bash
git add src/audio/audio-catalog.ts tests/audio/audio-catalog.test.ts
git commit -m "feat(audio): add AudioCatalog data module with 34 placeholder file paths and resolveEra() clamp"
```

---

## Task 4: Generate 34 silent placeholder OGGs + AUDIO-CREDITS.md

**Files:**
- Create: `public/audio/era/era{1-5}-base.ogg`
- Create: `public/audio/war/era{1-5}-war.ogg`
- Create: `public/audio/accent/{12-families}.ogg`
- Create: `public/audio/stinger/era{1-5}-advance.ogg`
- Create: `public/audio/stinger/era{1-5}-transition-cue.ogg`
- Create: `public/audio/stinger/city-founded.ogg`
- Create: `public/audio/stinger/war-declared.ogg`
- Create: `AUDIO-CREDITS.md`

**Prerequisite:** ffmpeg must be installed locally. Install with `brew install ffmpeg` (macOS) or equivalent. This step runs locally, not in CI.

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p public/audio/era public/audio/war public/audio/accent public/audio/stinger
```

- [ ] **Step 2: Generate all 34 silent placeholder OGGs**

Each file is a valid stereo silent OGG (~5–10 KB). The `OggS` magic-byte check in the catalog test will pass against these files.

```bash
# Era base loops (30s — enough for seamless looping in tests)
for i in 1 2 3 4 5; do
  ffmpeg -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -t 30 -c:a libvorbis -q:a 0 "public/audio/era/era${i}-base.ogg" -y -loglevel error
done

# War tension layers (30s)
for i in 1 2 3 4 5; do
  ffmpeg -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -t 30 -c:a libvorbis -q:a 0 "public/audio/war/era${i}-war.ogg" -y -loglevel error
done

# Civ accent loops (30s)
for family in east-asian south-asian middle-eastern mediterranean-antiquity \
              western-european norse african mesoamerican steppe \
              fantasy-high fantasy-dark fantasy-mystical; do
  ffmpeg -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -t 30 -c:a libvorbis -q:a 0 "public/audio/accent/${family}.ogg" -y -loglevel error
done

# Era-advance stingers (5s)
for i in 1 2 3 4 5; do
  ffmpeg -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -t 5 -c:a libvorbis -q:a 0 "public/audio/stinger/era${i}-advance.ogg" -y -loglevel error
done

# Era-transition cues (2s — softer, shorter; see UX-2)
for i in 1 2 3 4 5; do
  ffmpeg -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -t 2 -c:a libvorbis -q:a 0 "public/audio/stinger/era${i}-transition-cue.ogg" -y -loglevel error
done

# Generic stingers (3s)
ffmpeg -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -t 3 -c:a libvorbis -q:a 0 public/audio/stinger/city-founded.ogg -y -loglevel error
ffmpeg -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -t 3 -c:a libvorbis -q:a 0 public/audio/stinger/war-declared.ogg -y -loglevel error
```

- [ ] **Step 3: Verify file count**

```bash
find public/audio -name "*.ogg" | wc -l
```

Expected output: `      34` (exact count depends on whitespace formatting)

- [ ] **Step 4: Run the full catalog test — all groups should now pass**

```bash
eval "$(mise activate bash)" && yarn test tests/audio/audio-catalog.test.ts
```

Expected: PASS — all 34 on-disk tests green

- [ ] **Step 5: Create `AUDIO-CREDITS.md`**

```bash
cat > AUDIO-CREDITS.md << 'EOF'
# Audio Credits

All audio in Conquestoria is licensed under CC0 (public domain dedication) or CC-BY 4.0 (attribution required).

## Music

*(Placeholder OGGs are silent — no attribution required. Entries added here as curation MRs replace placeholders with real audio.)*

## Sound Effects

*(Existing synthesised SFX via Web Audio oscillators require no attribution.)*
EOF
```

- [ ] **Step 6: Run full build + test to confirm MR1 is green**

```bash
eval "$(mise activate bash)" && yarn build && yarn test
```

Expected: both exit 0. If `audio-catalog.test.ts` on-disk tests fail, re-run the ffmpeg step.

- [ ] **Step 7: Commit**

```bash
git add public/audio/ AUDIO-CREDITS.md
git commit -m "feat(audio): add 34 silent placeholder OGGs and AUDIO-CREDITS.md (Spec 1 placeholder strategy)"
```

---

## MR1 merge checklist

Before opening the MR:
- [ ] `yarn build` exits 0
- [ ] `yarn test` exits 0 (34 on-disk OGG integrity tests pass)
- [ ] `git diff main...HEAD --name-only` shows only new files in `tests/`, `src/audio/`, `public/audio/`, and `AUDIO-CREDITS.md` — no existing files modified
