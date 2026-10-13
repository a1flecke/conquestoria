# Streaming long music (#1466)

Long looping music (era base, civ accent, adaptive war/unrest layers) used to be decoded whole into an
`AudioBuffer` (about 145 MiB of live PCM for three tracks). It is now played from small decoded windows, so the
live PCM for music is a few seconds, not minutes. Short SFX are unchanged.

## How it works

| Piece | File | Job |
|---|---|---|
| Ogg/Vorbis packet parser | `src/audio/ogg-vorbis.ts` | Reads packets, block sizes (from the setup header's mode table) and per-packet output lengths; re-pages any packet range into a valid standalone Ogg with a pre-roll packet so the decoder's overlap-add state is exact. |
| Window planner | `src/audio/stream-plan.ts` | Cuts the loop into ~6 s cores, each with a 0.5 s decoded lead-in, aligned to the resampler's input period so the browser's 44.1→48 kHz resample grid matches the whole-file decode. Returns `null` when it cannot be exact. |
| Runtime | `src/audio/streamed-loop.ts` | `StreamedLoopTrack` (open/verify/prepare) and `StreamedLoopPlayer` (decodes ahead with a 4 s lookahead, schedules cores end to end with `AudioBufferSourceNode.start(when, offset, duration)` on the audio clock, releases nodes as they end). |
| Integration | `audio-loader.ts` `getLoop`, `audio-mixer.ts` `setBusSource`, `audio-system.ts`, `music-director.ts` | A streamed loop is a bus source like any buffer: same gain ramps, crossfades, mute/volume, stinger duck/restore, request-generation guards (a stale prepared stream is `discard()`ed). |

`getLoop` falls back to the previous whole-buffer path for any file that cannot be streamed exactly, any parse or
decode failure, any failed self-check, an HTTP error, or when `decodeAudioData` is missing. Each track is
self-checked once on `prepare()`: an overlapping mid-file window must decode to the same samples as window 0.
Loops that do not start at 0, or whose end exceeds the file, are refused (buffer path).

## Evidence

All numbers are from this repository's own tooling on one host (Apple Silicon macOS, Chromium 149, Playwright).
Not Safari, not WKWebView, not iPad.

**Exactness (real Chromium, real assets).** Windowed decode equals the whole-file decode to float rounding
(`maxAbs` 6e-8, 0, 4e-9 for a 44.1 kHz file, a 48 kHz file and an accent whose loop ends before the file).
Streamed output captured over nine window joins and two loop wraps equals the whole-buffer loop to < 1e-5.
(`tests/e2e/issue-1466-streamed-music.spec.ts`.)

**Memory (interleaved, n = 5, production builds of `origin/main` d8a3d531 vs this branch, crowded 30×30 fixture, 2
civs, reduced motion, cold cache, active-page PID):**

| | Baseline (whole-buffer) | Streaming |
|---|---:|---:|
| Live PCM, post-GC | 144.68 MiB (all 5) | 11.3 MiB |
| Renderer RSS, post-GC, median [range] | 1161 [1159–1163] MiB | 372 [370–377] MiB |
| Renderer RSS, idle-6 s | 1553–1557 MiB | 395–405 MiB |

The RSS gap (~790 MiB) is far larger than the 133 MiB PCM gap. The extra is native decoder/resampler working
memory that whole-file decodes of 165 s tracks transiently demand and that stays resident; it was measured, not
explained at owner level. RSS is not private footprint, and absolute RSS on this host varies between sessions
(an earlier recorded baseline on this fixture was ~760 MiB), so trust the interleaved difference, not either column.
JS heap was 17–28 MiB in both.

**Lifecycle and offline (streaming build, cold and warm contexts, 193 SFX fetched offline).** Five consecutive
campaign starts (Rome, Rome, Japan, Japan, China) kept post-GC live PCM at 6–14 MiB with no page errors; renderer
RSS rose from 377 to 445 MiB over the sequence. That growth is not attributed here; PCM does not accumulate.

**CPU.** A 6 s window decodes in a median 19 ms (max 40 ms) for 44.1 kHz and 5 ms for 48 kHz sources, off the main
thread inside `decodeAudioData`. A pump tick every 500 ms checks the lookahead; between windows the player is idle.

## Not verified

- Listening: nothing here was heard by a person. Sample-equality to the buffer path is the proxy. **NOT VERIFIED
  by ear.**
- Safari, WKWebView (Tauri on macOS), iPad/iOS: **NOT VERIFIED.** `decodeAudioData` resampling behaviour may differ;
  the per-track self-check falls back to the buffer path if a window disagrees, but that was not exercised there.
- Windows/Linux Chromium and Firefox: not run.
- Very slow devices where a window decode can exceed the lookahead: the player skips what has passed and stays on
  the clock grid (tested with a fake clock), at the cost of a short gap.

## Reproduce

```sh
./scripts/dev.sh build   # then serve baseline (origin/main build) on :4189 and this build on :4190
CONQUESTORIA_MEMORY_DIAGNOSTICS=1 CONQUESTORIA_MEMORY_LABEL=streaming-1466 CONQUESTORIA_MEMORY_SAMPLES=5 CONQUESTORIA_MEMORY_CIVS=2 CONQUESTORIA_MEMORY_MOTIONS=reduce CONQUESTORIA_MEMORY_CACHES=cold CONQUESTORIA_MEMORY_COMPARE_URL=http://127.0.0.1:4190/conquestoria/ CONQUESTORIA_PERF_BASE_URL=http://127.0.0.1:4189/conquestoria/ ./scripts/run-with-mise.sh yarn test:web-smoke:campaign-start --workers=1
```

Note the driver's labels are inverted for this use: `control-*` files are the COMPARE_URL (:4190) build and
`candidate-*` files the BASE_URL (:4189) build. Check `options.baseUrl` and `buildAssets` in each JSON.
