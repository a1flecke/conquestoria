# Audio Overhaul Spec 3 — Adaptive Music + Voice Lines

**Brainstormed:** 2026-06-03  
**Roadmap reference:** `docs/superpowers/specs/2026-05-15-audio-overhaul-roadmap.md` § Spec 3  
**Status:** Design locked — ready for implementation planning

---

## Goals

- Expand the adaptive music state machine from 2 states (`peace`, `at-war`) to 4 (`peace`, `unrest`, `at-war`, `brink-of-defeat`)
- Complete the stinger catalog with 6 remaining slots: wonder-built, tech-researched, peace-signed, civ-defeated, victory, defeat
- Add civ-specific advisor voice lines for 10 hero civs + a generic fallback, via a fully data-driven, extensible architecture
- Add a `voice` mixer bus and a 5-channel mixer UI (master / music / sfx / voice / stinger)

---

## Locked Decisions

| # | Question | Decision |
|---|---|---|
| V1 | Voice line source | Piper TTS (MIT-licensed, pre-trained voices). Output is CC-free. Synthesis runs locally via a generated manifest + shell script. |
| V2 | Voice coverage | 10 hero civs get unique voices; 19 others use a `generic` fallback. |
| A1 | Golden age state | Dropped — not implemented in game state; deferring to Spec 4 if ever needed. |
| A2 | Adaptive states | `unrest` + `brink-of-defeat` (plus existing `at-war`). |
| A3 | State priority | Linear: `brink-of-defeat > at-war > unrest > peace`. Highest severity wins. |
| S1 | Tech stinger | Fires on every `tech:completed`. Cadence (~3–5 turns per tech) is infrequent enough. |
| S2 | Game:over stinger flow | Stinger-first (Approach A): play victory/defeat stinger, then fade to silence. |
| U1 | Mixer UI | 5-channel sliders: master / music / sfx / voice / stinger. |

---

## 1. Voice Line System

### 1.1 Advisor Roster

10 hero civs get named voice packs; all other civs fall back to `generic`.

| VoicePackId | Civ | Audio Family | Personality Archetype | Piper Voice Character |
|---|---|---|---|---|
| `china` | China | east-asian | Confucian scholar — measured, uses nature metaphor | Elder male, slow deliberate cadence |
| `egypt` | Egypt | mediterranean-antiquity | Ancient priest-ruler — mystical, commanding, timeless | Deep authoritative, slightly formal |
| `rome` | Rome | mediterranean-antiquity | Senator-general — proud, declarative, martial pride | Strong mid-range male, crisp diction |
| `england` | England | northern-european | Understated diplomat — dry wit, never exclaims | Precise British-adjacent, clipped delivery |
| `france` | France | western-european | Cultural sophisticate — theatrical, effusive | Warmer, slightly expressive male |
| `viking` | Viking | norse | Warrior-chief — blunt, short lines, no metaphor | Gruff, lower register |
| `zulu` | Zulu | african | King with rhythmic cadence — ancestral references | Rich baritone, measured |
| `aztec` | Aztec | mesoamerican | Priest-warrior — invokes the sun/gods, fierce | Sharp, urgent, high energy |
| `mongolia` | Mongolia | steppe | Conqueror — curt, conquest-obsessed, tactical | Flat, fast, no sentiment |
| `gondor` | Gondor | fantasy-high | Noble steward — formal, epic register, eternal framing | Clear tenor, elevated diction |
| `generic` | (19 others) | (fallback) | Neutral advisor — informative, no personality | Neutral mid-range, plain delivery |

### 1.2 The 10 Voice Events

| VoiceEventId | EventBus trigger | Filter |
|---|---|---|
| `era-advance` | `era:advanced` | current player's era |
| `city-founded` | `city:founded` | `founderId === currentPlayer` |
| `war-declared` | `diplomacy:war-declared` | `attackerId === currentPlayer` |
| `tech-completed` | `tech:completed` | `civId === currentPlayer` |
| `wonder-built` | `wonder:legendary-completed` | `civId === currentPlayer` |
| `wonder-lost` | `wonder:legendary-lost` | `civId === currentPlayer` |
| `city-lost` | `city:captured` | `previousOwner === currentPlayer` |
| `near-defeat` | `civ:near-defeat` | `civId === currentPlayer` |
| `victory` | `game:over` | `winnerId === currentPlayer` |
| `peace-signed` | `diplomacy:peace-made` | currentPlayer is `civA` or `civB` |

### 1.3 Sample Lines (tone reference only — final text set during curation)

| VoiceEventId | China | Viking | Generic |
|---|---|---|---|
| `era-advance` | "The river has found a wider valley." | "We are stronger than yesterday." | "A new era begins." |
| `city-founded` | "Another root takes hold in the earth." | "Good. More land." | "A new city is founded." |
| `war-declared` | "Even still water will break a stone." | "Finally. Battle." | "War has been declared." |
| `tech-completed` | "Knowledge cannot be taken back." | "Useful." | "Research complete." |
| `wonder-built` | "It will outlast our names." | "They will sing of this." | "A wonder is complete." |
| `wonder-lost` | "Another built what we could not finish." | "Disgrace. Build faster next time." | "The wonder was claimed by another." |
| `city-lost` | "A branch has been cut. The tree remains." | "They took our city. We take two of theirs." | "We have lost a city." |
| `near-defeat` | "Even a single ember can start a fire." | "We are not dead yet." | "We are near defeat." |
| `victory` | "The harvest was worth the long winter." | "All falls before us. As it should." | "Victory is ours." |
| `peace-signed` | "The sword rests. For now." | "Peace. For now." | "Peace has been reached." |

Each line targets 1–3 seconds synthesised (~5–15 words).

### 1.4 Data-Driven Architecture (extensible by design)

Adding a new hero civ = one line in `CIV_TO_VOICE_PACK` + one entry block in `VOICE_CATALOG`.  
Adding a new event = one line in `VoiceEventId` union + one line in `EVENT_TO_VOICE` + entries in `VOICE_CATALOG`.  
No handler methods, no switch cases, no code changes in `VoiceDirector`.

**`src/audio/voice-catalog.ts`**

```typescript
// Extending either union forces TypeScript to enforce completeness in VOICE_CATALOG
export type VoicePackId =
  | 'china' | 'egypt' | 'rome' | 'england' | 'france'
  | 'viking' | 'zulu' | 'aztec' | 'mongolia' | 'gondor'
  | 'generic';

export type VoiceEventId =
  | 'era-advance' | 'city-founded' | 'war-declared' | 'tech-completed'
  | 'wonder-built' | 'wonder-lost' | 'city-lost' | 'near-defeat'
  | 'victory' | 'peace-signed';

// Partial<> per pack: a pack doesn't need every event.
// Missing entries are a silent no-op — never fall back to generic mid-playback.
export const VOICE_CATALOG: Record<VoicePackId, Partial<Record<VoiceEventId, TrackEntry>>> = {
  generic: { /* all 10 events defined — the safety net */ },
  china:   { /* subset or full */ },
  // …
};
```

**`src/audio/civ-voice-family.ts`**

```typescript
export const CIV_TO_VOICE_PACK: Record<string, VoicePackId> = {
  china: 'china', egypt: 'egypt', rome: 'rome', england: 'england',
  france: 'france', viking: 'viking', zulu: 'zulu', aztec: 'aztec',
  mongolia: 'mongolia', gondor: 'gondor',
  // All 19 others absent → getVoicePackForCiv() returns 'generic'
};

export function getVoicePackForCiv(civType: string): VoicePackId {
  return CIV_TO_VOICE_PACK[civType] ?? 'generic';
}
```

**`EVENT_TO_VOICE` config table in `src/audio/audio-system.ts`**

`game:over` is NOT in this table — victory/defeat voice lines are handled separately (see §1.6).

```typescript
const EVENT_TO_VOICE: Partial<Record<keyof GameEvents, VoiceEventId>> = {
  'era:advanced':               'era-advance',
  'city:founded':               'city-founded',
  'diplomacy:war-declared':     'war-declared',
  'tech:completed':             'tech-completed',
  'wonder:legendary-completed': 'wonder-built',
  'wonder:legendary-lost':      'wonder-lost',
  'city:captured':              'city-lost',   // filter: previousOwner === currentPlayer
  'civ:near-defeat':            'near-defeat',
  'diplomacy:peace-made':       'peace-signed',
};
// AudioSystem.start() iterates this table once to register all subscriptions
```

**`src/audio/voice-director.ts`**

`VoiceDirector` does not own the adaptive state flags — those live on `MusicDirector`. To restore the correct snapshot after a voice line, `VoiceDirector` accepts a `getSnapshot` callback injected by `AudioSystem`. It also exposes `stop()` for handoff privacy and game-over interruption:

```typescript
export class VoiceDirector {
  private currentPack: VoicePackId = 'generic';
  private playingSource: AudioBufferSourceNode | null = null;

  constructor(
    private readonly mixer: AudioMixer,
    private readonly loader: AudioLoader,
    private readonly getSnapshot: () => SnapshotId, // injected by AudioSystem
  ) {}

  setVoicePack(civType: string): void {
    this.currentPack = getVoicePackForCiv(civType);
  }

  /** Interrupt any in-progress voice line immediately (handoff, game-over). */
  stop(): void {
    try { this.playingSource?.stop(); } catch { /* already stopped */ }
    this.playingSource = null;
    this.mixer.setSnapshot(this.getSnapshot(), VOICE_RESTORE_MS);
  }

  async playLine(eventId: VoiceEventId): Promise<void> {
    const entry = VOICE_CATALOG[this.currentPack]?.[eventId]
               ?? VOICE_CATALOG['generic'][eventId];
    if (!entry) return; // graceful no-op — missing entries never throw
    const buffer = await this.loader.get(entry.file);
    this.mixer.setSnapshot('voice-duck', VOICE_DUCK_FADE_MS);
    // playOneShot returns a Promise; also stash the source for stop()
    await this.mixer.playOneShotTracked('voice', buffer, src => { this.playingSource = src; });
    this.playingSource = null;
    this.mixer.setSnapshot(this.getSnapshot(), VOICE_RESTORE_MS);
  }
}
```

`AudioSystem` passes `() => musicDirector.resolveSnapshot()` as the callback. `MusicDirector.resolveSnapshot()` becomes `public`. `AudioMixer.playOneShotTracked()` is a variant of `playOneShot` that calls the provided callback with the `AudioBufferSourceNode` before starting it — needed so `VoiceDirector.stop()` can halt the node. Alternatively, `AudioMixer` can expose `stopBus(bus)` as a simpler API; the choice is left to the implementer as long as `stop()` works.

### 1.6 Victory Voice Line Triggering

`game:over` is not in `EVENT_TO_VOICE` because victory and defeat require different handling and must be sequenced AFTER the stinger. `AudioSystem` subscribes to `game:over` separately:

```typescript
eventBus.on('game:over', async (p) => {
  // MusicDirector plays stinger first (handleGameEnded)
  await musicDirector.handleGameEnded({ outcome: p.winnerId === state.currentPlayer ? 'victory' : 'defeat' });
  // After stinger, play the victory voice line (defeat has no voice line — stinger is sufficient)
  if (p.winnerId === state.currentPlayer) {
    await voiceDirector.playLine('victory');
  }
  // Voice restore after victory line goes to 'silent' (game over — no resume)
  mixer.setSnapshot('silent', VOICE_RESTORE_MS);
});
```

`GameEndedPayload.outcome` is computed by `AudioSystem` from `winnerId` vs `state.currentPlayer` — it is never derived from the raw event alone. This also resolves the type mismatch: the real `game:over` event has `winnerId: string`, not `outcome`.

### 1.7 Stinger + Voice Sequencing (co-fire rule)

Several events trigger BOTH a stinger (via `MusicDirector`) AND a voice line (via the `EVENT_TO_VOICE` subscription). Without coordination, the stinger's `stinger-duck` snapshot (voice gain = 0.2) makes the simultaneously-started voice line nearly inaudible.

**Rule:** for events in `EVENTS_WITH_STINGER` (below), the voice line is queued and played only after the stinger completes. For all other events, the voice line plays immediately.

```typescript
// Events that trigger a stinger — voice must wait for stinger to finish
const EVENTS_WITH_STINGER = new Set<keyof GameEvents>([
  'era:advanced',
  'city:founded',
  'diplomacy:war-declared',
  'tech:completed',
  'wonder:legendary-completed',
  'diplomacy:peace-made',
]);
```

`AudioSystem` wires these events as chained calls:

```typescript
for (const [busEvent, voiceEventId] of Object.entries(EVENT_TO_VOICE)) {
  eventBus.on(busEvent as keyof GameEvents, async (payload) => {
    if (!isCurrentPlayerEvent(payload, state.currentPlayer)) return;
    if (EVENTS_WITH_STINGER.has(busEvent as keyof GameEvents)) {
      // Wait for MusicDirector to finish its stinger, then play voice
      await musicDirector.currentStingerPromise;
    }
    void voiceDirector.playLine(voiceEventId);
  });
}
```

`MusicDirector` exposes `currentStingerPromise: Promise<void>` — a public property that resolves when the current stinger (if any) finishes. It is replaced each time `playStingerWithDuck()` runs and resolves to `undefined` immediately when no stinger is active. This keeps sequencing in `AudioSystem` without coupling the two directors.

### 1.8 Voice Preloading Strategy (PWA / performance)

110 voice clips × 35 KB = ~3.8 MB. Loading all at game start wastes decode time and memory. Strategy:

- **On `AudioSystem.start()`**: preload only the current player's voice pack (10 clips ≈ 350 KB) via `loader.prefetch(voicePackFiles)`. The generic pack is NOT pre-loaded — it lazy-loads on first use (Service Worker caches after first fetch).
- **On `currentPlayer:changed-after-handoff`**: call `loader.prefetch()` for the new player's pack. The outgoing player's clips remain in the Service Worker cache but are evicted from the in-memory AudioBuffer cache on the next LRU pass.
- **Cache budget**: voice clips are small per-file; they're covered by Spec 1's SW 25 MB total cap. No new cache eviction logic needed.

`AudioLoader` already supports `prefetch(files: string[]): Promise<void>` (decodes into the in-memory buffer cache). If it doesn't yet, add it in MR3 as part of the voice system work.

### 1.5 Synthesis Workflow

`scripts/gen-voice-manifest.ts` scans `VOICE_CATALOG` and outputs `voice-manifest.json`:

```json
[
  { "packId": "china", "eventId": "era-advance",
    "text": "The river has found a wider valley.",
    "piperModel": "en_US-lessac-medium",
    "outputPath": "public/audio/voice/china/era-advance.ogg" }
]
```

`scripts/synthesise-voice.sh` iterates the manifest and calls:
```bash
piper --model <model> --output_file <path>.wav <<< "<text>"
ffmpeg -i <path>.wav -c:a libvorbis -q:a 2 <path>.ogg
```

Same curation-PR workflow as music: I generate the manifest + scripts, user runs locally, commits OGGs with attribution in `AUDIO-CREDITS.md`.

---

## 2. Adaptive State Machine Expansion

### 2.1 New Snapshot Gain Values

`voice` is added as a full `MusicBusId` so snapshot transitions control ducking declaratively. **Routing:** unlike `era`/`accent`/`adaptive`/`stinger` which route through `musicMasterGain`, the `voice` bus routes directly to `destination` (like `sfxBus`). This means "mute music" (`setMusicEnabled(false)`) does not silence advisor lines. The `voice` bus has its own master gain node (`voiceMasterGain`) controlled by `setVoiceEnabled` / `setVoiceVolume`, inserted between the voice `snapshotGain` and `destination`.

| Snapshot | era | accent | adaptive | stinger | voice |
|---|---|---|---|---|---|
| `silent` | 0.0 | 0.00 | 0.0 | 0.0 | 0.0 |
| `peace` | 1.0 | 0.70 | 0.0 | 1.0 | 1.0 |
| `at-war` | 1.0 | 0.50 | 0.8 | 1.0 | 1.0 |
| `unrest` | 1.0 | 0.55 | 0.5 | 1.0 | 1.0 |
| `brink-of-defeat` | 0.7 | 0.15 | 1.0 | 1.0 | 1.0 |
| `stinger-duck` | 0.5 | 0.35 | 0.4 | 1.0 | 0.2 |
| `voice-duck` *(new)* | 0.5 | 0.35 | 0.4 | 0.6 | 1.0 |

**Priority:** if `setSnapshot('stinger-duck')` fires while `voice-duck` is in progress, stinger wins — it overwrites the in-flight voice ramp. Stinger always wins simultaneous fires.

### 2.2 New Adaptive Layer Catalog Entries

The Adaptive bus source changes with the resolved snapshot. Two new per-era layer sets added to `audio-catalog.ts`:

```typescript
export const UNREST_LAYER: Record<EraId, TrackEntry> = {
  1: ph('era1-unrest', 'audio/adaptive/era1-unrest.ogg'),
  2: ph('era2-unrest', 'audio/adaptive/era2-unrest.ogg'),
  3: ph('era3-unrest', 'audio/adaptive/era3-unrest.ogg'),
  4: ph('era4-unrest', 'audio/adaptive/era4-unrest.ogg'),
  5: ph('era5-unrest', 'audio/adaptive/era5-unrest.ogg'),
}; // tone: dissonant, restless, low-intensity

export const DEFEAT_LAYER: Record<EraId, TrackEntry> = {
  1: ph('era1-defeat', 'audio/adaptive/era1-defeat.ogg'),
  2: ph('era2-defeat', 'audio/adaptive/era2-defeat.ogg'),
  3: ph('era3-defeat', 'audio/adaptive/era3-defeat.ogg'),
  4: ph('era4-defeat', 'audio/adaptive/era4-defeat.ogg'),
  5: ph('era5-defeat', 'audio/adaptive/era5-defeat.ogg'),
}; // tone: desperate, sparse, dire
```

`MusicDirector` switches the Adaptive bus source (`mixer.setBusSource('adaptive', ...)`) whenever the resolved snapshot changes to or from a state that uses the Adaptive bus. Source selection:

| Resolved snapshot | Adaptive bus source |
|---|---|
| `peace` | `null` (gain 0.0 anyway) |
| `unrest` | `UNREST_LAYER[currentEra]` |
| `at-war` | `WAR_LAYER[currentEra]` |
| `brink-of-defeat` | `DEFEAT_LAYER[currentEra]` |

### 2.3 State Tracking in `MusicDirector`

Three boolean flags replace the single `intendedSnapshot` variable:

```typescript
private atWar = false;
private inUnrest = false;
private nearDefeat = false;
private unrestCityCount = 0;
private currentCivId = '';

private resolveSnapshot(): SnapshotId {
  if (this.nearDefeat) return 'brink-of-defeat';
  if (this.atWar)      return 'at-war';
  if (this.inUnrest)   return 'unrest';
  return 'peace';
}
```

`playStingerWithDuck()` restores via `resolveSnapshot()` instead of a stored variable.

### 2.4 New Event Handlers

| Event | Handler logic |
|---|---|
| `faction:unrest-started { owner }` | if `owner === currentCivId`: `unrestCityCount++`, `inUnrest = true`, apply snapshot |
| `faction:revolt-started { owner }` | **same as unrest-started** — revolt is an escalation; also increments `unrestCityCount` so the counter stays accurate if a city goes directly to revolt without a prior unrest-started event |
| `faction:unrest-resolved { owner }` | if `owner === currentCivId`: `unrestCityCount = Math.max(0, unrestCityCount - 1)`, `inUnrest = (unrestCityCount > 0)`, apply snapshot. Handles resolution from both unrest and revolt states. |
| `civ:near-defeat { civId }` | if `civId === currentCivId`: `nearDefeat = true`, apply snapshot |
| `civ:recovered-from-near-defeat { civId }` | if `civId === currentCivId`: `nearDefeat = false`, apply snapshot |
| `diplomacy:war-declared` | (existing) sets `atWar = true` |
| `diplomacy:peace-made` | (existing) checks `remainingWars`, sets `atWar = false` when 0 |

### 2.5 Hot-Seat Cross-Turn Drift Fix

`faction:unrest-started` fires when unrest begins, not every turn it persists. After a player handoff, the incoming player's persistent unrest state would be invisible to the director's counter.

**Fix:** extend `'currentPlayer:changed-after-handoff'` payload in `types.ts`:

```typescript
// Before (Spec 1):
'currentPlayer:changed-after-handoff': { civId: string }

// After (Spec 3):
'currentPlayer:changed-after-handoff': {
  civId: string;
  atWar: boolean;
  unrestCityCount: number;
  nearDefeat: boolean;
}
```

The handoff emitter (turn manager / handoff modal) computes these from game state. `handlePlayerChanged` resets all three flags from this payload — no state-getter injection, per Spec 1 R2.

### 2.6 New Events Required in `types.ts`

```typescript
'civ:near-defeat':               { civId: string }
'civ:recovered-from-near-defeat': { civId: string }
'civ:eliminated':                { civId: string; eliminatedBy: string }
```

`civ:near-defeat` — emitted by city-capture logic when `civilizations[previousOwner].cities.length <= 1` after capture.

`civ:recovered-from-near-defeat` — emitted from **two** places:
  1. `city:captured` handler when `civilizations[newOwner].cities.length > 1` and the civ was previously in near-defeat (recaptured a city).
  2. `city:founded` handler when `civilizations[founderId].cities.length > 1` and the civ was previously in near-defeat (founded a city while having only 1 remaining). Both paths must check a "was near-defeat" flag in game state or derive it from the prior city count. A `boolean nearDefeat` flag on `Civilization` in `types.ts` is the simplest approach — set to `true` when `cities.length <= 1`, cleared and the event emitted when it goes back above 1.

`civ:eliminated` — emitted when `civilizations[previousOwner].cities.length === 0` after capture.

---

## 3. Stinger Catalog Additions

Six new entries in the `STINGER` object in `audio-catalog.ts`. All are single generic clips (per-era variants are a Spec 4 candidate):

```typescript
export const STINGER = {
  // ... existing entries (eraAdvance, eraTransitionCue, cityFounded, warDeclared) ...

  wonderBuilt:    ph('stinger-wonder-built',    'audio/stinger/wonder-built.ogg',    4.0),
  techResearched: ph('stinger-tech-researched', 'audio/stinger/tech-researched.ogg', 2.5),
  peaceSigned:    ph('stinger-peace-signed',    'audio/stinger/peace-signed.ogg',    3.5),
  civDefeated:    ph('stinger-civ-defeated',    'audio/stinger/civ-defeated.ogg',    3.5),
  victory:        ph('stinger-victory',         'audio/stinger/victory.ogg',         9.0),
  defeat:         ph('stinger-defeat',          'audio/stinger/defeat.ogg',          7.0),
};
```

Tone targets:
- `wonderBuilt` — grand, awe, sustained chord bloom
- `techResearched` — bright, discovery, short ascending figure
- `peaceSigned` — relief, resolution, tension release
- `civDefeated` — triumphant, martial, punchy
- `victory` — grand extended fanfare (the game's emotional peak)
- `defeat` — somber, spare, finality (no sting — just weight)

### 3.1 New Wiring in `MusicDirector`

| EventBus event | Filter | Action |
|---|---|---|
| `wonder:legendary-completed` | `civId === currentCivId` | `playStingerWithDuck(STINGER.wonderBuilt.file)` |
| `tech:completed` | `civId === currentCivId` | `playStingerWithDuck(STINGER.techResearched.file)` |
| `diplomacy:peace-made` | currentPlayer is `civA` or `civB` | `playStingerWithDuck(STINGER.peaceSigned.file)` + clear `atWar` if 0 wars remain |
| `civ:eliminated` | `eliminatedBy === currentCivId` | `playStingerWithDuck(STINGER.civDefeated.file)` |
| `game:over` | — | see § 3.2 |

### 3.2 `game:over` Flow (Approach A — stinger-first)

`handleGameEnded` is revised:

```typescript
// GameEndedPayload is an AudioSystem-internal type; outcome is computed by AudioSystem
// from the raw game:over event's winnerId vs state.currentPlayer (see §1.6).
handleGameEnded(p: GameEndedPayload): Promise<void> {
  const stingerFile = p.outcome === 'victory' ? STINGER.victory.file : STINGER.defeat.file;
  this.mixer.setSnapshot('stinger-duck', STINGER_DUCK_FADE_MS);
  // Store promise so AudioSystem can chain the victory voice line after it (§1.7)
  this.currentStingerPromise = this.loader.get(stingerFile)
    .then(buffer => this.mixer.playOneShot('stinger', buffer))
    .then(() => { this.mixer.setSnapshot('silent', GAME_END_FADE_MS); });
    // Deliberately does NOT call resolveSnapshot() after stinger —
    // the game is over; the music loop must not resume.
  return this.currentStingerPromise;
}
```

`handleGameEnded` returns its `Promise<void>` so `AudioSystem` can await it before playing the victory voice line (§1.6).

---

## 4. Mixer UI — Per-Channel Sliders

Five sliders + per-channel enable toggles. All sliders use the existing square-law curve (`gain = v * v`).

### 4.1 Mixer Topology Revision

The current `musicMasterGain` routes ALL music buses to `destination`. Adding independent stinger and voice volume controls requires splitting the topology. New graph:

```
era bus ─────────────┐
accent bus ──────────┤→ musicLayerGain → masterGain → destination
adaptive bus ────────┘
stinger bus → stingerMasterGain ──────→ masterGain → destination
voice bus → voiceMasterGain ──────────────────────→ destination
sfx bus ─────────────────────────────────────────→ destination
```

- `musicLayerGain` replaces the portion of `musicMasterGain` that routed era/accent/adaptive. Controlled by `setMusicVolume()`.
- `stingerMasterGain` is a new node sitting between the stinger bus and `masterGain`. Controlled by `setStingerVolume()`.
- `masterGain` is the true master, covering music + stinger. Controlled by `setMasterVolume()`.
- `voiceMasterGain` routes directly to `destination` (bypasses master — "mute all music" still lets advisor speak). Controlled by `setVoiceVolume()`.
- `sfxBus` continues routing directly to `destination` unchanged.

The existing `setMusicEnabled(false)` sets `musicLayerGain` to 0 — does NOT affect stinger or voice. New `setStingerEnabled()` and `setVoiceEnabled()` methods added to `AudioMixer`.

**Breaking change from Spec 1:** `setMasterMusicVolume()` becomes `setMasterVolume()` (covers music + stinger but not voice or SFX). Rename the method and update callers in `audio-system.ts` and the existing settings panel.

### 4.2 Slider Table

| Slider | `AudioMixer` method | Gain node | Persisted key |
|---|---|---|---|
| Master | `setMasterVolume(v)` | `masterGain` | `settings.masterVolume` |
| Music | `setMusicVolume(v)` | `musicLayerGain` | `settings.musicVolume` |
| SFX | `setSfxVolume(v)` | `sfxBus.snapshotGain` | `settings.sfxVolume` |
| Voice | `setVoiceVolume(v)` | `voiceMasterGain` | `settings.voiceVolume` |
| Stinger | `setStingerVolume(v)` | `stingerMasterGain` | `settings.stingerVolume` |

Each slider has a paired enable toggle (checkbox) mapping to `setMusicEnabled`, `setSfxEnabled`, `setVoiceEnabled`, `setStingerEnabled`.

### 4.3 Hot-Seat Voice Privacy

On `currentPlayer:changed-after-handoff`, `AudioSystem` calls `voiceDirector.stop()` before updating the voice pack. This prevents the outgoing player's in-progress voice line from leaking through the handoff screen.

### 4.4 UI Location

Same panel as existing music/sfx toggles. Locate the existing toggle/slider DOM in `src/ui/` (pause menu or settings panel), extend the section with three new rows (voice, stinger, master reordering). Use `createGameButton()` pattern for any new button in the panel per `.claude/skills/button-styling.md`.

---

## 5. Asset Budget

| Category | Count | Est. size | Notes |
|---|---|---|---|
| UNREST_LAYER tracks | 5 | ~1 MB | Per-era, placeholder → curation |
| DEFEAT_LAYER tracks | 5 | ~1 MB | Per-era, placeholder → curation |
| New stinger clips | 6 | ~0.5 MB | Generic, placeholder → curation |
| Voice lines (10 civs × 10 events + generic × 10) | ~110 | ~3–4 MB | Piper-synthesised OGGs, ~30–40 KB each |
| **Total Spec 3 additions** | — | **~5.5–6.5 MB** | Within roadmap 25 MB total cap |

---

## 6. Out of Scope (Spec 3)

- Per-era voice variants (one voice tone per era per pack)
- Voice line localization to non-English
- Golden age adaptive state (no game mechanic exists)
- Per-era victory/defeat stingers
- Bar-locked musical transitions
- Tiered war music (barbarian vs. minor vs. major) — Spec 4 W-Tier
- Ambient looping audio (forest, ocean, city) — Spec 4 candidate
- Ac2 per-(family × era) accent matrix — Spec 4 candidate

---

## 7. Testing Targets

All tests live in `tests/audio/` mirroring `src/audio/`. Use the mock `AudioContext` pattern established in Spec 1.

### 7.1 `MusicDirector` — priority chain

- All 4 flag combinations that resolve to `brink-of-defeat`: nearDefeat alone, nearDefeat+atWar, nearDefeat+inUnrest, nearDefeat+atWar+inUnrest
- `atWar=true, nearDefeat=false` → `at-war`
- `inUnrest=true, atWar=false` → `unrest`
- All flags false → `peace`

### 7.2 `MusicDirector` — unrest counter

- Two cities enter unrest: `unrestCityCount = 2`, `inUnrest = true`
- One resolves: `unrestCityCount = 1`, `inUnrest = true` (still unrest)
- Both resolve: `unrestCityCount = 0`, `inUnrest = false`
- `faction:revolt-started` increments the same counter
- Events from a DIFFERENT civ (owner ≠ currentCivId) do NOT change the counter

### 7.3 `MusicDirector` — hot-seat reset

- `handlePlayerChanged({ civId: 'rome', atWar: false, unrestCityCount: 0, nearDefeat: false })` resets all flags; `resolveSnapshot()` → `peace`
- `handlePlayerChanged({ ..., atWar: true, unrestCityCount: 2, nearDefeat: false })` → `at-war`
- `handlePlayerChanged({ ..., nearDefeat: true })` → `brink-of-defeat` regardless of other flags

### 7.4 `VoiceDirector` — pack selection and graceful no-op

- Starred civ (e.g. `china`) → uses `china` pack
- Unknown civ → uses `generic` pack
- `VOICE_CATALOG['generic']` has all 10 `VoiceEventId` entries (catalog integrity assertion)
- `playLine('some-event')` with no entry in current pack and no entry in generic → resolves without throwing and without calling `mixer.setSnapshot`
- `stop()` cancels an in-progress line and restores snapshot

### 7.5 `VoiceDirector` — stinger sequencing

- `currentStingerPromise` on `MusicDirector` resolves before voice playback begins for co-fire events
- Events not in `EVENTS_WITH_STINGER` play voice line immediately (no await)

### 7.6 Catalog integrity

- Every entry in `UNREST_LAYER`, `DEFEAT_LAYER`, and the 6 new `STINGER` entries has a matching placeholder OGG file under `public/audio/adaptive/` and `public/audio/stinger/` respectively
- Every entry in `VOICE_CATALOG` (all packs, all events) has a matching placeholder OGG under `public/audio/voice/<pack>/<event>.ogg`
- `generic` pack: all 10 `VoiceEventId` keys present
- Extend the existing catalog-integrity test file from Spec 1

### 7.7 `game:over` stinger-first contract

- On `game:over` with `winnerId === currentPlayer`: verify `setSnapshot('silent')` is NOT called before stinger completes
- Verify stinger Promise resolves before `setSnapshot('silent', GAME_END_FADE_MS)` is called
- Verify victory voice line plays after stinger (and not before)
- Verify no music snapshot restore (`resolveSnapshot()`) is called after game-over stinger

### 7.8 Mixer topology

- `setMusicEnabled(false)` sets `musicLayerGain` to 0; stinger bus gain unaffected; voice bus gain unaffected
- `setMasterVolume(0.5)` scales `masterGain`; voice bus and SFX bus are unaffected
- `setStingerVolume(0)` silences stinger bus; music and voice unaffected

---

## 8. Implementation Decomposition (for writing-plans)

Suggested MR breakdown:

| MR | Scope | Key files touched | Gate |
|---|---|---|---|
| MR1 | Mixer topology + new snapshots | `audio-mixer.ts` (new gain graph), `audio-catalog.ts` (UNREST/DEFEAT placeholders + 6 stingers), `types.ts` (3 new events + extended handoff payload) | All subsequent MRs depend on this |
| MR2 | State machine + stinger wiring | `music-director.ts` (flag-based resolver, revolt handler, new stinger wiring, handleGameEnded), `turn-manager.ts` or city-capture logic (emit new events), tests §7.1–7.3 + §7.6 stingers | Depends on MR1 |
| MR3 | Voice system | `voice-catalog.ts`, `civ-voice-family.ts`, `voice-director.ts`, `audio-system.ts` (EVENT_TO_VOICE, EVENTS_WITH_STINGER, game:over wiring, prefetch), `audio-loader.ts` (prefetch method if missing), placeholder OGGs, tests §7.4–7.7 | Depends on MR1 |
| MR4 | Mixer UI | Settings panel in `src/ui/` (locate existing toggles, add 3 new rows), `audio-system.ts` (settings persistence), tests §7.8 | Depends on MR1 |
| MR5+ | Curation | `public/audio/adaptive/`, `public/audio/stinger/`, `public/audio/voice/` — real assets replace placeholders; `AUDIO-CREDITS.md` updates | Parallel-safe after MR1 |
