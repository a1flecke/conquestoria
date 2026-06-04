# Spec 3 MR3 — Voice System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the fully data-driven voice line system: `voice-catalog.ts` (VOICE_CATALOG + VoiceEventId + VoicePackId), `civ-voice-family.ts` (CIV_TO_VOICE_PACK + getVoicePackForCiv), `voice-director.ts` (VoiceDirector with stop/playLine), wire EVENT_TO_VOICE + EVENTS_WITH_STINGER + voice preloading into `AudioSystem`, generate 110 placeholder OGG stubs, create synthesis scripts.

**Architecture:** Three config tables drive everything — `VOICE_CATALOG`, `CIV_TO_VOICE_PACK`, `EVENT_TO_VOICE`. `VoiceDirector` has one method (`playLine`) for all events. Adding a new civ or event requires catalog edits only — no code changes in the director or wiring layer.

**Prerequisite:** MR1 merged (voice bus exists in mixer, `SnapshotId` includes `'voice-duck'`). MR2 merged or in progress (`currentStingerPromise` on `MusicDirector`, `resolveSnapshot()` public).

**Tech Stack:** TypeScript, Vite, Web Audio API, Vitest, ffmpeg (via mise).

---

## File map

| Action | Path |
|---|---|
| Create | `src/audio/voice-catalog.ts` |
| Create | `src/audio/civ-voice-family.ts` |
| Create | `src/audio/voice-director.ts` |
| Modify | `src/audio/audio-system.ts` |
| Create | `tests/audio/voice-director.test.ts` |
| Modify | `tests/audio/audio-catalog.test.ts` (add voice integrity checks) |
| Create (110 files) | `public/audio/voice/<pack>/<event>.ogg` |
| Create | `scripts/gen-voice-manifest.ts` |
| Create | `scripts/synthesise-voice.sh` |

---

## Voice pack + event reference (memorise before coding)

**11 VoicePackIds:** `china`, `egypt`, `rome`, `england`, `france`, `viking`, `zulu`, `aztec`, `mongolia`, `gondor`, `generic`

**10 VoiceEventIds:** `era-advance`, `city-founded`, `war-declared`, `tech-completed`, `wonder-built`, `wonder-lost`, `city-lost`, `near-defeat`, `victory`, `peace-signed`

**Placeholder file path pattern:** `audio/voice/<packId>/<eventId>.ogg`

**110 files total:** 11 packs × 10 events = 110.

---

## Task 1: Create `voice-catalog.ts`

**Files:**
- Create: `src/audio/voice-catalog.ts`

- [ ] **Step 1.1: Write the file**

```typescript
// src/audio/voice-catalog.ts
import type { TrackEntry } from './audio-catalog';

// Extending VoicePackId forces TypeScript to enforce VOICE_CATALOG completeness.
// Adding a new hero civ = one entry here + one block in VOICE_CATALOG.
export type VoicePackId =
  | 'china' | 'egypt' | 'rome' | 'england' | 'france'
  | 'viking' | 'zulu' | 'aztec' | 'mongolia' | 'gondor'
  | 'generic';

// Extending VoiceEventId forces completeness.
// Adding a new event = one entry here + one line in EVENT_TO_VOICE + entries in VOICE_CATALOG.
export type VoiceEventId =
  | 'era-advance'
  | 'city-founded'
  | 'war-declared'
  | 'tech-completed'
  | 'wonder-built'
  | 'wonder-lost'
  | 'city-lost'
  | 'near-defeat'
  | 'victory'
  | 'peace-signed';

// Helper: all voice event IDs as a runtime array for testing and manifest generation
export const ALL_VOICE_EVENT_IDS: VoiceEventId[] = [
  'era-advance', 'city-founded', 'war-declared', 'tech-completed',
  'wonder-built', 'wonder-lost', 'city-lost', 'near-defeat', 'victory', 'peace-signed',
];

// Helper: all voice pack IDs
export const ALL_VOICE_PACK_IDS: VoicePackId[] = [
  'china', 'egypt', 'rome', 'england', 'france',
  'viking', 'zulu', 'aztec', 'mongolia', 'gondor', 'generic',
];

function vph(pack: VoicePackId, event: VoiceEventId): TrackEntry {
  return {
    id: `voice-${pack}-${event}`,
    file: `audio/voice/${pack}/${event}.ogg`,
    bpm: 0,
    key: 'speech',
    loop: { loopStart: 0, loopEnd: 3 }, // ~3 s; ignored for one-shot playback
  };
}

function makePackEntries(pack: VoicePackId): Record<VoiceEventId, TrackEntry> {
  const result = {} as Record<VoiceEventId, TrackEntry>;
  for (const event of ALL_VOICE_EVENT_IDS) {
    result[event] = vph(pack, event);
  }
  return result;
}

// Partial<> per pack: hero packs can define a subset.
// Missing entries silently fall back to generic — never throw.
// 'generic' MUST define all 10 events — it is the safety net.
export const VOICE_CATALOG: Record<VoicePackId, Partial<Record<VoiceEventId, TrackEntry>>> = {
  // Generic defines all 10 — safety net (full entries, no Partial needed, but typed as Partial for consistency)
  generic:  makePackEntries('generic'),
  // Hero packs — full set for Spec 3 launch; curated text set via synthesise-voice.sh
  china:    makePackEntries('china'),
  egypt:    makePackEntries('egypt'),
  rome:     makePackEntries('rome'),
  england:  makePackEntries('england'),
  france:   makePackEntries('france'),
  viking:   makePackEntries('viking'),
  zulu:     makePackEntries('zulu'),
  aztec:    makePackEntries('aztec'),
  mongolia: makePackEntries('mongolia'),
  gondor:   makePackEntries('gondor'),
};
```

- [ ] **Step 1.2: Run build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 1.3: Commit**

```bash
git add src/audio/voice-catalog.ts
git commit -m "feat(spec3-mr3): add voice-catalog.ts with VoicePackId, VoiceEventId, VOICE_CATALOG"
```

---

## Task 2: Create `civ-voice-family.ts`

**Files:**
- Create: `src/audio/civ-voice-family.ts`

- [ ] **Step 2.1: Write the file**

```typescript
// src/audio/civ-voice-family.ts
// Mirrors the CIV_TO_AUDIO_FAMILY pattern from civ-audio-family.ts.
// Adding a starred civ = one entry here. All others → 'generic'.
import type { VoicePackId } from './voice-catalog';

export const CIV_TO_VOICE_PACK: Record<string, VoicePackId> = {
  china:    'china',
  egypt:    'egypt',
  rome:     'rome',
  england:  'england',
  france:   'france',
  viking:   'viking',
  zulu:     'zulu',
  aztec:    'aztec',
  mongolia: 'mongolia',
  gondor:   'gondor',
  // All 19 other civs are absent → getVoicePackForCiv returns 'generic'
};

export function getVoicePackForCiv(civType: string): VoicePackId {
  return CIV_TO_VOICE_PACK[civType] ?? 'generic';
}
```

- [ ] **Step 2.2: Run build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -5
```

- [ ] **Step 2.3: Commit**

```bash
git add src/audio/civ-voice-family.ts
git commit -m "feat(spec3-mr3): add civ-voice-family.ts with 10-civ voice pack mapping"
```

---

## Task 3: Create `voice-director.ts`

**Files:**
- Create: `src/audio/voice-director.ts`

- [ ] **Step 3.1: Write the file**

```typescript
// src/audio/voice-director.ts
import type { AudioMixer, SnapshotId } from './audio-mixer';
import type { AudioLoader } from './audio-loader';
import { VOICE_CATALOG, type VoiceEventId, type VoicePackId } from './voice-catalog';
import { getVoicePackForCiv } from './civ-voice-family';

const VOICE_DUCK_FADE_MS = 150;
const VOICE_RESTORE_MS = 800;

export class VoiceDirector {
  private currentPack: VoicePackId = 'generic';

  constructor(
    private readonly mixer: AudioMixer,
    private readonly loader: AudioLoader,
    /** Injected by AudioSystem — returns MusicDirector.resolveSnapshot() */
    private readonly getSnapshot: () => SnapshotId,
  ) {}

  setVoicePack(civType: string): void {
    this.currentPack = getVoicePackForCiv(civType);
  }

  /** Stop any in-progress voice line. Called on player handoff and game-over. */
  stop(): void {
    // Restore snapshot immediately so the duck does not persist
    this.mixer.setSnapshot(this.getSnapshot(), VOICE_RESTORE_MS);
    // The voice bus 'playOneShot' will resolve naturally; nothing else to stop here.
    // The getSnapshot() restore is sufficient to lift the voice-duck gain.
  }

  /** Play a voice line for the given event. No-op if the entry is missing. */
  async playLine(eventId: VoiceEventId): Promise<void> {
    const entry = VOICE_CATALOG[this.currentPack]?.[eventId]
               ?? VOICE_CATALOG['generic'][eventId];
    if (!entry) return; // graceful no-op — missing entries never throw

    const buffer = await this.loader.get(entry.file);
    this.mixer.setSnapshot('voice-duck', VOICE_DUCK_FADE_MS);
    await this.mixer.playOneShot('voice', buffer);
    this.mixer.setSnapshot(this.getSnapshot(), VOICE_RESTORE_MS);
  }
}
```

- [ ] **Step 3.2: Run build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -5
```

- [ ] **Step 3.3: Commit**

```bash
git add src/audio/voice-director.ts
git commit -m "feat(spec3-mr3): add VoiceDirector with playLine, stop, pack selection"
```

---

## Task 4: Write `voice-director.test.ts`

**Files:**
- Create: `tests/audio/voice-director.test.ts`

- [ ] **Step 4.1: Write the failing tests first**

```typescript
// tests/audio/voice-director.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceDirector } from '../../src/audio/voice-director';
import { VOICE_CATALOG, ALL_VOICE_EVENT_IDS, ALL_VOICE_PACK_IDS } from '../../src/audio/voice-catalog';
import type { AudioMixer } from '../../src/audio/audio-mixer';
import type { AudioLoader } from '../../src/audio/audio-loader';

const fakeBuffer = {} as AudioBuffer;

function makeMixer(): AudioMixer {
  return {
    setSnapshot: vi.fn(),
    playOneShot: vi.fn().mockResolvedValue(undefined),
    setBusSource: vi.fn(),
    setMasterVolume: vi.fn(),
    setMusicVolume: vi.fn(),
    setMusicEnabled: vi.fn(),
    setSfxVolume: vi.fn(),
    setSfxEnabled: vi.fn(),
    setVoiceVolume: vi.fn(),
    setVoiceEnabled: vi.fn(),
    setStingerVolume: vi.fn(),
    setStingerEnabled: vi.fn(),
    getSfxRoutingNode: vi.fn(),
    dispose: vi.fn(),
  } as unknown as AudioMixer;
}

function makeLoader(returnBuffer = fakeBuffer): AudioLoader {
  return {
    get: vi.fn().mockResolvedValue(returnBuffer),
    preload: vi.fn().mockResolvedValue(undefined),
    isCached: vi.fn().mockReturnValue(false),
  } as unknown as AudioLoader;
}

const flushPromises = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('VoiceDirector — pack selection', () => {
  it('starred civ uses its own pack', async () => {
    const mixer = makeMixer();
    const loader = makeLoader();
    const director = new VoiceDirector(mixer, loader, () => 'peace');
    director.setVoicePack('china');
    await director.playLine('era-advance');
    // Should load from china pack
    expect(loader.get).toHaveBeenCalledWith('audio/voice/china/era-advance.ogg');
  });

  it('unknown civ falls back to generic pack', async () => {
    const mixer = makeMixer();
    const loader = makeLoader();
    const director = new VoiceDirector(mixer, loader, () => 'peace');
    director.setVoicePack('atlantis'); // not in CIV_TO_VOICE_PACK
    await director.playLine('city-founded');
    expect(loader.get).toHaveBeenCalledWith('audio/voice/generic/city-founded.ogg');
  });

  it('japan falls back to generic (not starred)', async () => {
    const mixer = makeMixer();
    const loader = makeLoader();
    const director = new VoiceDirector(mixer, loader, () => 'peace');
    director.setVoicePack('japan');
    await director.playLine('war-declared');
    expect(loader.get).toHaveBeenCalledWith('audio/voice/generic/war-declared.ogg');
  });
});

describe('VoiceDirector — playLine contract', () => {
  let mixer: AudioMixer;
  let loader: AudioLoader;
  let director: VoiceDirector;

  beforeEach(() => {
    mixer = makeMixer();
    loader = makeLoader();
    director = new VoiceDirector(mixer, loader, () => 'peace');
  });

  it('sets voice-duck snapshot before playing', async () => {
    await director.playLine('era-advance');
    const snapshotCalls = vi.mocked(mixer.setSnapshot).mock.calls.map(c => c[0]);
    expect(snapshotCalls[0]).toBe('voice-duck');
  });

  it('restores current snapshot after playing', async () => {
    await director.playLine('era-advance');
    const snapshotCalls = vi.mocked(mixer.setSnapshot).mock.calls.map(c => c[0]);
    expect(snapshotCalls.at(-1)).toBe('peace');
  });

  it('restores to at-war when getSnapshot returns at-war', async () => {
    const d = new VoiceDirector(mixer, loader, () => 'at-war');
    await d.playLine('city-founded');
    expect(vi.mocked(mixer.setSnapshot).mock.calls.at(-1)![0]).toBe('at-war');
  });

  it('calls playOneShot on voice bus', async () => {
    await director.playLine('tech-completed');
    expect(mixer.playOneShot).toHaveBeenCalledWith('voice', fakeBuffer);
  });
});

describe('VoiceDirector — graceful no-op for missing entry', () => {
  it('does not throw and does not call mixer when entry is missing', async () => {
    // Temporarily patch catalog to have a missing entry for generic
    const original = VOICE_CATALOG['generic']['era-advance'];
    delete VOICE_CATALOG['generic']['era-advance'];

    const mixer = makeMixer();
    const loader = makeLoader();
    const director = new VoiceDirector(mixer, loader, () => 'peace');

    await expect(director.playLine('era-advance')).resolves.toBeUndefined();
    expect(mixer.setSnapshot).not.toHaveBeenCalled();
    expect(loader.get).not.toHaveBeenCalled();

    // Restore catalog
    VOICE_CATALOG['generic']['era-advance'] = original!;
  });
});

describe('VoiceDirector — stop()', () => {
  it('restores snapshot immediately', () => {
    const mixer = makeMixer();
    const loader = makeLoader();
    const director = new VoiceDirector(mixer, loader, () => 'at-war');
    director.stop();
    expect(mixer.setSnapshot).toHaveBeenCalledWith('at-war', expect.any(Number));
  });

  it('does not throw when called with no active line', () => {
    const mixer = makeMixer();
    const loader = makeLoader();
    const director = new VoiceDirector(mixer, loader, () => 'peace');
    expect(() => director.stop()).not.toThrow();
  });
});
```

- [ ] **Step 4.2: Run tests (expect pass)**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/voice-director.test.ts 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4.3: Commit**

```bash
git add tests/audio/voice-director.test.ts
git commit -m "test(spec3-mr3): add VoiceDirector tests — pack selection, playLine contract, graceful no-op, stop()"
```

---

## Task 5: Add voice catalog integrity tests

**Files:**
- Modify: `tests/audio/audio-catalog.test.ts`

- [ ] **Step 5.1: Add voice imports and integrity tests**

At the top of `tests/audio/audio-catalog.test.ts`, add:

```typescript
import {
  VOICE_CATALOG,
  ALL_VOICE_EVENT_IDS,
  ALL_VOICE_PACK_IDS,
  type VoicePackId,
  type VoiceEventId,
} from '../../src/audio/voice-catalog';
```

Add a new describe block at the bottom:

```typescript
describe('voice catalog integrity', () => {
  it('generic pack defines all 10 VoiceEventIds', () => {
    for (const eventId of ALL_VOICE_EVENT_IDS) {
      expect(VOICE_CATALOG['generic'][eventId], `generic missing: ${eventId}`).toBeDefined();
    }
  });

  it('all pack IDs are present in VOICE_CATALOG', () => {
    for (const packId of ALL_VOICE_PACK_IDS) {
      expect(VOICE_CATALOG[packId], `VOICE_CATALOG missing pack: ${packId}`).toBeDefined();
    }
  });

  it('no two voice entries share the same id', () => {
    const ids: string[] = [];
    for (const pack of ALL_VOICE_PACK_IDS) {
      for (const event of ALL_VOICE_EVENT_IDS) {
        const entry = VOICE_CATALOG[pack]?.[event];
        if (entry) ids.push(entry.id);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('voice on-disk OGG integrity', () => {
  for (const pack of ALL_VOICE_PACK_IDS) {
    for (const event of ALL_VOICE_EVENT_IDS) {
      const entry = VOICE_CATALOG[pack]?.[event];
      if (!entry) continue;
      it(`${entry.id}: file exists at public/${entry.file} with OGG magic bytes`, () => {
        const diskPath = path.join(PROJECT_ROOT, 'public', entry.file);
        expect(fs.existsSync(diskPath), `missing: ${diskPath}`).toBe(true);
        const head = fs.readFileSync(diskPath).slice(0, 4);
        expect(head.toString('ascii')).toBe('OggS');
      });
    }
  }
});
```

- [ ] **Step 5.2: Run — expect on-disk tests to fail (files not yet created)**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/audio-catalog.test.ts 2>&1 | grep -E "PASS|FAIL|missing" | tail -20
```

Expected: catalog structure tests PASS; on-disk tests FAIL with "missing file" for the 110 voice OGGs.

- [ ] **Step 5.3: Commit**

```bash
git add tests/audio/audio-catalog.test.ts
git commit -m "test(spec3-mr3): add voice catalog integrity and on-disk OGG tests"
```

---

## Task 6: Generate 110 placeholder voice OGGs

**Files:**
- Create (110 files): `public/audio/voice/<pack>/<event>.ogg`

- [ ] **Step 6.1: Create directories**

```bash
for pack in china egypt rome england france viking zulu aztec mongolia gondor generic; do
  mkdir -p "public/audio/voice/$pack"
done
```

- [ ] **Step 6.2: Generate all 110 placeholder OGGs (1-second silent)**

```bash
for pack in china egypt rome england france viking zulu aztec mongolia gondor generic; do
  for event in era-advance city-founded war-declared tech-completed wonder-built wonder-lost city-lost near-defeat victory peace-signed; do
    ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 1 \
      -c:a libvorbis -q:a 2 \
      "public/audio/voice/$pack/$event.ogg"
  done
done
```

- [ ] **Step 6.3: Verify count**

```bash
find public/audio/voice -name "*.ogg" | wc -l
```

Expected: `110`

- [ ] **Step 6.4: Run on-disk voice tests — all should pass now**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/audio-catalog.test.ts 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 6.5: Commit**

```bash
git add public/audio/voice/
git commit -m "feat(spec3-mr3): add 110 placeholder voice OGGs (silent stubs pending Piper synthesis)"
```

---

## Task 7: Create synthesis scripts

**Files:**
- Create: `scripts/gen-voice-manifest.ts`
- Create: `scripts/synthesise-voice.sh`

These scripts are not part of the build or test pipeline — they are developer tooling run manually during curation MRs.

- [ ] **Step 7.1: Write `gen-voice-manifest.ts`**

```typescript
// scripts/gen-voice-manifest.ts
// Run: npx tsx scripts/gen-voice-manifest.ts > voice-manifest.json
// Outputs a JSON array of synthesis jobs for scripts/synthesise-voice.sh

import { VOICE_CATALOG, ALL_VOICE_PACK_IDS, ALL_VOICE_EVENT_IDS } from '../src/audio/voice-catalog';

// Text scripts per pack per event (tone reference — update before curation)
const VOICE_SCRIPTS: Record<string, Record<string, string>> = {
  china:    {
    'era-advance':  'The river has found a wider valley.',
    'city-founded': 'Another root takes hold in the earth.',
    'war-declared': 'Even still water will break a stone.',
    'tech-completed': 'Knowledge cannot be taken back.',
    'wonder-built': 'It will outlast our names.',
    'wonder-lost':  'Another built what we could not finish.',
    'city-lost':    'A branch has been cut. The tree remains.',
    'near-defeat':  'Even a single ember can start a fire.',
    'victory':      'The harvest was worth the long winter.',
    'peace-signed': 'The sword rests. For now.',
  },
  egypt: {
    'era-advance':  'The Nile rises. Our age is reborn.',
    'city-founded': 'Another monument to eternity is placed.',
    'war-declared': 'The gods demand our enemies fall.',
    'tech-completed': 'The scribes have revealed a new truth.',
    'wonder-built': 'It shall stand when empires are dust.',
    'wonder-lost':  'Others have stolen our glory.',
    'city-lost':    'A jewel of the Nile has been seized.',
    'near-defeat':  'Pharaoh does not yield. Not now.',
    'victory':      'Egypt endures. As it always has.',
    'peace-signed': 'The desert is calm again.',
  },
  rome: {
    'era-advance':  'Rome advances. None shall stand in our way.',
    'city-founded': 'Another city joins the eternal empire.',
    'war-declared': 'Rome does not tolerate insolence.',
    'tech-completed': 'Our engineers have surpassed themselves.',
    'wonder-built': 'A marvel worthy of Rome.',
    'wonder-lost':  'We will build something greater.',
    'city-lost':    'This insult will be answered.',
    'near-defeat':  'Rome has survived worse. We endure.',
    'victory':      'All roads lead here. Because we made them.',
    'peace-signed': 'A temporary arrangement.',
  },
  england: {
    'era-advance':  'Progress. At last.',
    'city-founded': 'Quite. Another settlement.',
    'war-declared': 'Regrettable. But necessary.',
    'tech-completed': 'Splendid work from our scholars.',
    'wonder-built': 'Rather impressive, I must say.',
    'wonder-lost':  'A minor setback.',
    'city-lost':    'We shall not allow that to stand.',
    'near-defeat':  'We have been in tighter spots.',
    'victory':      'Civilised, as expected.',
    'peace-signed': 'Very well. For now.',
  },
  france: {
    'era-advance':  'Magnifique! A new age for France!',
    'city-founded': 'Another jewel in our crown.',
    'war-declared': 'They have forced our hand.',
    'tech-completed': 'Our brilliance illuminates the world.',
    'wonder-built': 'C\'est incroyable! A masterpiece!',
    'wonder-lost':  'How disappointing.',
    'city-lost':    'An outrage. We will reclaim it.',
    'near-defeat':  'France is never truly defeated.',
    'victory':      'History will remember this day.',
    'peace-signed': 'Harmony is restored.',
  },
  viking: {
    'era-advance':  'We are stronger than yesterday.',
    'city-founded': 'Good. More land.',
    'war-declared': 'Finally. Battle.',
    'tech-completed': 'Useful.',
    'wonder-built': 'They will sing of this.',
    'wonder-lost':  'Disgrace. Build faster next time.',
    'city-lost':    'They took our city. We take two of theirs.',
    'near-defeat':  'We are not dead yet.',
    'victory':      'All falls before us. As it should.',
    'peace-signed': 'Peace. For now.',
  },
  zulu: {
    'era-advance':  'The ancestors watch as we rise.',
    'city-founded': 'Our people grow strong.',
    'war-declared': 'The impis are ready.',
    'tech-completed': 'Wisdom has come to us.',
    'wonder-built': 'A gift to our children\'s children.',
    'wonder-lost':  'Others move quickly. We will move faster.',
    'city-lost':    'This wound will heal with victory.',
    'near-defeat':  'The Zulu bend like the reed. We do not break.',
    'victory':      'The nation stands. The nation endures.',
    'peace-signed': 'Let the land rest.',
  },
  aztec: {
    'era-advance':  'The sun demands we rise higher.',
    'city-founded': 'Another offering to Tenochtitlan.',
    'war-declared': 'The sun demands blood.',
    'tech-completed': 'The gods have revealed their secrets.',
    'wonder-built': 'The heavens are pleased.',
    'wonder-lost':  'The sun is displeased. We must act.',
    'city-lost':    'They will pay for this affront.',
    'near-defeat':  'The fifth sun does not set today.',
    'victory':      'The sun rises on our glory.',
    'peace-signed': 'The sun rests. We are grateful.',
  },
  mongolia: {
    'era-advance':  'Further. Always further.',
    'city-founded': 'Another camp. Good.',
    'war-declared': 'Ride.',
    'tech-completed': 'Practical.',
    'wonder-built': 'It stands.',
    'wonder-lost':  'Next time.',
    'city-lost':    'Reclaim it.',
    'near-defeat':  'The steppe endures. So do we.',
    'victory':      'The horizon is ours.',
    'peace-signed': 'For now.',
  },
  gondor: {
    'era-advance':  'The White Tower stands proud. Gondor advances.',
    'city-founded': 'Another outpost for the realm of men.',
    'war-declared': 'Gondor does not yield to shadow.',
    'tech-completed': 'The scholars of Minas Tirith have done well.',
    'wonder-built': 'A monument to the eternal realm.',
    'wonder-lost':  'Others have moved against us.',
    'city-lost':    'We will hold the remaining gates.',
    'near-defeat':  'Gondor has never fallen. It shall not fall now.',
    'victory':      'The age of Men is not ended.',
    'peace-signed': 'Let the realm know peace.',
  },
  generic: {
    'era-advance':  'A new era begins.',
    'city-founded': 'A new city is founded.',
    'war-declared': 'War has been declared.',
    'tech-completed': 'Research complete.',
    'wonder-built': 'A wonder is complete.',
    'wonder-lost':  'The wonder was claimed by another.',
    'city-lost':    'We have lost a city.',
    'near-defeat':  'We are near defeat.',
    'victory':      'Victory is ours.',
    'peace-signed': 'Peace has been reached.',
  },
};

// Piper model selection per pack (medium quality, en_US base)
// Replace with higher quality models during curation
const PIPER_MODELS: Record<string, string> = {
  china:    'en_US-lessac-medium',
  egypt:    'en_US-ryan-medium',
  rome:     'en_US-ryan-high',
  england:  'en_GB-alba-medium',
  france:   'en_US-lessac-medium',
  viking:   'en_US-ryan-medium',
  zulu:     'en_US-ryan-medium',
  aztec:    'en_US-lessac-medium',
  mongolia: 'en_US-ryan-medium',
  gondor:   'en_US-ryan-high',
  generic:  'en_US-lessac-medium',
};

const manifest: Array<{
  packId: string;
  eventId: string;
  text: string;
  piperModel: string;
  outputPath: string;
}> = [];

for (const packId of ALL_VOICE_PACK_IDS) {
  for (const eventId of ALL_VOICE_EVENT_IDS) {
    const entry = VOICE_CATALOG[packId]?.[eventId];
    if (!entry) continue;
    manifest.push({
      packId,
      eventId,
      text: VOICE_SCRIPTS[packId]?.[eventId] ?? VOICE_SCRIPTS['generic'][eventId],
      piperModel: PIPER_MODELS[packId] ?? PIPER_MODELS['generic'],
      outputPath: `public/${entry.file}`,
    });
  }
}

process.stdout.write(JSON.stringify(manifest, null, 2));
```

- [ ] **Step 7.2: Write `synthesise-voice.sh`**

```bash
#!/usr/bin/env bash
# scripts/synthesise-voice.sh
# Usage: bash scripts/synthesise-voice.sh
# Requires: piper on PATH (install via: pip install piper-tts)
#           ffmpeg on PATH (via mise)
#           voice-manifest.json in repo root (generate: npx tsx scripts/gen-voice-manifest.ts > voice-manifest.json)
set -euo pipefail

MANIFEST="${1:-voice-manifest.json}"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Error: $MANIFEST not found. Run: npx tsx scripts/gen-voice-manifest.ts > voice-manifest.json"
  exit 1
fi

if ! command -v piper &>/dev/null; then
  echo "Error: piper not found. Install: pip install piper-tts"
  exit 1
fi

total=$(python3 -c "import json; print(len(json.load(open('$MANIFEST'))))")
current=0

python3 - <<'PYEOF'
import json, subprocess, os, sys

with open(sys.argv[1] if len(sys.argv) > 1 else 'voice-manifest.json') as f:
    manifest = json.load(f)

for i, job in enumerate(manifest):
    wav_path = job['outputPath'].replace('.ogg', '.wav')
    ogg_path = job['outputPath']
    os.makedirs(os.path.dirname(ogg_path), exist_ok=True)

    print(f"[{i+1}/{len(manifest)}] {job['packId']}/{job['eventId']}: {job['text'][:50]}")

    # Synthesise to WAV
    result = subprocess.run(
        ['piper', '--model', job['piperModel'], '--output_file', wav_path],
        input=job['text'],
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        print(f"  ERROR (piper): {result.stderr.strip()}", file=sys.stderr)
        continue

    # Convert to OGG
    result = subprocess.run(
        ['ffmpeg', '-y', '-i', wav_path, '-c:a', 'libvorbis', '-q:a', '4', ogg_path],
        capture_output=True,
    )
    if result.returncode != 0:
        print(f"  ERROR (ffmpeg): {result.stderr.decode().strip()}", file=sys.stderr)
        continue

    os.remove(wav_path)
    print(f"  OK -> {ogg_path}")

print("Done.")
PYEOF
```

- [ ] **Step 7.3: Make synthesise script executable**

```bash
chmod +x scripts/synthesise-voice.sh
```

- [ ] **Step 7.4: Build (scripts are not imported by the app — just verify no import errors)**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -5
```

- [ ] **Step 7.5: Commit**

```bash
git add scripts/gen-voice-manifest.ts scripts/synthesise-voice.sh
git commit -m "feat(spec3-mr3): add gen-voice-manifest.ts and synthesise-voice.sh for Piper TTS curation workflow"
```

---

## Task 8: Wire `VoiceDirector` into `AudioSystem`

**Files:**
- Modify: `src/audio/audio-system.ts`

- [ ] **Step 8.1: Import VoiceDirector and dependencies**

Add to imports in `audio-system.ts`:

```typescript
import { VoiceDirector } from './voice-director';
import { getVoicePackForCiv } from './civ-voice-family';
import type { VoiceEventId } from './voice-catalog';
```

- [ ] **Step 8.2: Add VoiceDirector instance**

In the `AudioSystem` class body, add:

```typescript
  private voiceDirector: VoiceDirector;
```

In the constructor, after `this.director = new MusicDirector(...)`:

```typescript
    this.voiceDirector = new VoiceDirector(
      this.mixer,
      this.loader,
      () => this.director.resolveSnapshot(),
    );
```

- [ ] **Step 8.3: Add EVENTS_WITH_STINGER constant**

Before the `AudioSystem` class, add:

```typescript
// Events that trigger both a stinger (via MusicDirector) and a voice line.
// For these, the voice line is deferred until the stinger completes.
const EVENTS_WITH_STINGER = new Set([
  'era:advanced',
  'city:founded',
  'diplomacy:war-declared',
  'tech:completed',
  'wonder:legendary-completed',
  'diplomacy:peace-made',
] as const);

// Maps EventBus event names to VoiceEventIds.
// game:over is handled separately (victory voice after stinger).
const EVENT_TO_VOICE: Partial<Record<string, VoiceEventId>> = {
  'era:advanced':               'era-advance',
  'city:founded':               'city-founded',
  'diplomacy:war-declared':     'war-declared',
  'tech:completed':             'tech-completed',
  'wonder:legendary-completed': 'wonder-built',
  'wonder:legendary-lost':      'wonder-lost',
  'city:captured':              'city-lost',
  'civ:near-defeat':            'near-defeat',
  'diplomacy:peace-made':       'peace-signed',
};
```

- [ ] **Step 8.4: Wire voice subscriptions in `wireEvents()`**

`EventBus.on()` is strongly typed — it won't accept a dynamic string key. Use explicit subscriptions. At the end of `wireEvents()`, add one `bus.on()` call per event. Note the stinger-wait pattern: for events in `EVENTS_WITH_STINGER`, await `this.director.currentStingerPromise` before firing the voice line.

```typescript
      // Voice line subscriptions — one per EVENT_TO_VOICE entry
      // era:advanced — no current-player filter needed (era events are global)
      bus.on('era:advanced', async () => {
        await this.director.currentStingerPromise; // era stinger plays first
        void this.voiceDirector.playLine('era-advance');
      }),

      bus.on('city:founded', async p => {
        if (p.founderId !== this.currentPlayerId) return;
        await this.director.currentStingerPromise; // city-founded stinger plays first
        void this.voiceDirector.playLine('city-founded');
      }),

      bus.on('diplomacy:war-declared', async p => {
        if (p.attackerId !== this.currentPlayerId) return;
        await this.director.currentStingerPromise; // war stinger plays first
        void this.voiceDirector.playLine('war-declared');
      }),

      bus.on('tech:completed', async p => {
        if (p.civId !== this.currentPlayerId) return;
        await this.director.currentStingerPromise; // tech stinger plays first
        void this.voiceDirector.playLine('tech-completed');
      }),

      bus.on('wonder:legendary-completed', async p => {
        if (p.civId !== this.currentPlayerId) return;
        await this.director.currentStingerPromise; // wonder stinger plays first
        void this.voiceDirector.playLine('wonder-built');
      }),

      bus.on('wonder:legendary-lost', p => {
        if (p.civId !== this.currentPlayerId) return;
        void this.voiceDirector.playLine('wonder-lost'); // no stinger for wonder-lost
      }),

      bus.on('city:captured', p => {
        if (p.previousOwner !== this.currentPlayerId) return;
        void this.voiceDirector.playLine('city-lost'); // no stinger for city-lost
      }),

      bus.on('civ:near-defeat', p => {
        if (p.civId !== this.currentPlayerId) return;
        void this.voiceDirector.playLine('near-defeat'); // no stinger for near-defeat
      }),

      bus.on('diplomacy:peace-made', async p => {
        const involved = p.civA === this.currentPlayerId || p.civB === this.currentPlayerId;
        if (!involved) return;
        await this.director.currentStingerPromise; // peace stinger plays first
        void this.voiceDirector.playLine('peace-signed');
      }),
      // Note: 'victory' is handled in the game:over subscription (Step 8.8)
```

- [ ] **Step 8.5: Add `isCurrentPlayerEvent` helper**

Add a private method to `AudioSystem`:

```typescript
  private isCurrentPlayerEvent(eventName: string, payload: Record<string, unknown>): boolean {
    // Each event type's filter condition — mirrors §1.2 of the spec
    switch (eventName) {
      case 'era:advanced':               return true; // era events are global
      case 'city:founded':               return payload['founderId'] === this.currentPlayerId;
      case 'diplomacy:war-declared':     return payload['attackerId'] === this.currentPlayerId;
      case 'tech:completed':             return payload['civId'] === this.currentPlayerId;
      case 'wonder:legendary-completed': return payload['civId'] === this.currentPlayerId;
      case 'wonder:legendary-lost':      return payload['civId'] === this.currentPlayerId;
      case 'city:captured':             return payload['previousOwner'] === this.currentPlayerId;
      case 'civ:near-defeat':           return payload['civId'] === this.currentPlayerId;
      case 'diplomacy:peace-made':      return payload['civA'] === this.currentPlayerId || payload['civB'] === this.currentPlayerId;
      default:                          return false;
    }
  }
```

- [ ] **Step 8.6: Wire voice preloading in `start()`**

In `AudioSystem.start()`, after `void this.preloadSfx()`, add:

```typescript
    void this.preloadVoicePack(this.currentCivType);
```

Add the private method:

```typescript
  private async preloadVoicePack(civType: string): Promise<void> {
    const packId = getVoicePackForCiv(civType);
    // Import VOICE_CATALOG locally to avoid circular imports
    const { VOICE_CATALOG, ALL_VOICE_EVENT_IDS } = await import('./voice-catalog');
    const entries = ALL_VOICE_EVENT_IDS
      .map(e => VOICE_CATALOG[packId]?.[e]?.file)
      .filter((f): f is string => !!f);
    await this.loader.preload(entries);
  }
```

- [ ] **Step 8.7: Wire voice pack update and stop on handoff**

In the `currentPlayer:changed-after-handoff` subscription, after `this.director.handlePlayerChanged(...)`:

```typescript
          this.voiceDirector.stop();  // privacy: cut any in-progress line from outgoing player
          this.voiceDirector.setVoicePack(this.currentCivType);
          void this.preloadVoicePack(this.currentCivType);
```

- [ ] **Step 8.8: Wire victory voice line in `game:over` subscription**

Update the `game:over` handler:

```typescript
      bus.on('game:over', p => {
        const outcome = p.winnerId === this.currentPlayerId ? 'victory' : 'defeat';
        this.naturalWonderDirector.stopAmbient('game-ended');
        this.voiceDirector.stop(); // cut any in-progress voice line
        const stingerPromise = this.director.handleGameEnded({ outcome });
        if (outcome === 'victory') {
          // Chain victory voice line after the stinger completes, then re-silence
          void stingerPromise.then(() => this.voiceDirector.playLine('victory'));
        }
      }),
```

- [ ] **Step 8.9: Build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```

Expected: 0 errors. Fix any type errors around the dynamic EventBus `.on()` call — the `bus.on` type signature may need a cast for the dynamic event name loop.

- [ ] **Step 8.10: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 8.11: Commit**

```bash
git add src/audio/audio-system.ts
git commit -m "feat(spec3-mr3): wire VoiceDirector into AudioSystem with EVENT_TO_VOICE, EVENTS_WITH_STINGER, preloading, handoff privacy"
```

---

## Task 9: Final MR3 verification

- [ ] **Step 9.1: Full test suite + build**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -5
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -5
```

Expected: both clean.

- [ ] **Step 9.2: Verify 110 voice OGGs exist**

```bash
find public/audio/voice -name "*.ogg" | wc -l
```

Expected: `110`

- [ ] **Step 9.3: Verify EVENT_TO_VOICE coverage**

```bash
grep -n "EVENT_TO_VOICE\|EVENTS_WITH_STINGER" src/audio/audio-system.ts
```

Expected: both constants defined and referenced.
