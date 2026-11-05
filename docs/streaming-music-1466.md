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
self-checked once on `prepare()`: an overlapping mid-file window must decode to the same samples as window 0, **and
every decode must return the frame count the plan promised (within one resampler frame)**. The frame-count half
matters: Safari's engine decodes each standalone window one short block (128 native frames) shorter than the
window's granule span, so its windows cannot tile the loop. Before that check existed the sample comparison passed,
the track was accepted, and the final window of a loop that ends at the file end could not supply its core —
playback stopped instead of falling back (reproduced in real WKWebView: `era2-war.ogg`, window 14, "decoded window is
shorter than its core"). Loops that do not start at 0, or whose end exceeds the file, are refused (buffer path).

### Cross-engine behaviour (measured)

| Engine | Version | Windows decode to the planned frame count? | Result |
|---|---|---|---|
| Chromium (Playwright `chrome-headless-shell`) | 149.0.7827.55 | Yes (−1…0 frames) | streams |
| Firefox (Playwright) | 151.0 | Yes (0…+1 frames) | streams |
| WebKit (Playwright, macOS) | 26.5 | No: −128 to −140 frames per window | falls back |
| WKWebView (real system WebKit, Tauri's macOS engine) | Safari 26.6.2 | No: −128 to −139 frames per window | falls back |

`tests/e2e/issue-1466-decoder-compatibility.spec.ts` asserts the contract rather than the engine names: a track may
only be accepted when every window decodes to the planned length and equals the whole-file decode, and every refused
track must still arrive from `AudioLoader.getLoop` as a decoded buffer. Run it on all three Playwright engines with
`./scripts/dev.sh web-smoke-cross-engine` (Chromium, WebKit and Firefox). Chromium's `src/audio` unit tests and
`tests/e2e/issue-1466-streamed-music.spec.ts` remain the Chromium-only precision proof.

On Windows/Linux Chromium the decoder is the same bundled one, and Chrome on iOS is WKWebView, so the table is
expected to hold there — but neither was run. The fallback keeps audio correct everywhere; on WebKit it gives up the
PCM saving, so a future slice could accept a track when every window has more unused tail than the decoder's
measured shortfall. That relaxation needs its own listening and iOS evidence and is not implemented.

## Evidence

All numbers are from this repository's own tooling on one host (Apple Silicon macOS, Chromium 149, Playwright).
Not Safari, not WKWebView, not iPad.

**Exactness (real Chromium, real assets).** Windowed decode equals the whole-file decode to float rounding
(`maxAbs` 6e-8, 0, 4e-9 for a 44.1 kHz file, a 48 kHz file and an accent whose loop ends before the file).
The same windows, scheduled back to back and rendered in an `OfflineAudioContext` over ten-plus joins and two loop
wraps, equal the whole-buffer loop to < 1e-5 (a 3-frame scheduling error fails it at ~1.0). A live-clock smoke test
checks the real player keeps sounding without failure; it deliberately does not compare against a second real-time
capture, which was flaky on a loaded CI runner. (`tests/e2e/issue-1466-streamed-music.spec.ts`.) The player's own
clock/lookahead behaviour is covered by fake-clock unit tests, not by that render.

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
- Real Safari (desktop) was not scripted: `safaridriver` is not enabled on this host and Safari's "Allow JavaScript
  from Apple Events" is off, so the real-browser evidence is a WKWebView harness (below), not Safari's UI.
- iPad/iOS Safari: **NOT VERIFIED.** No device or simulator audio path was available; Chrome/Safari on iOS use the
  same WebKit decoder that fell back above, but that is an inference, not a measurement.
- Windows/Linux Chromium: not run. Firefox on macOS streams (see the cross-engine table).
- Very slow devices where a window decode can exceed the lookahead: the player skips what has passed and stays on
  the clock grid (tested with a fake clock), at the cost of a short gap.
- Renderer RSS growth across five campaign starts is still unattributed; it is not decoded PCM.

## Cross-engine and lifecycle coverage in tests

| Claim | Evidence |
|---|---|
| Windowed decode equals the whole-file decode on Chromium | `tests/e2e/issue-1466-streamed-music.spec.ts` (all windows of three assets, maxAbs < 1e-6) |
| Windows tile the loop and render identically to the buffer loop | same spec, `OfflineAudioContext` render over ten-plus joins and two wraps (maxAbs < 1e-5) |
| A decoder whose windows are not exact is refused and the buffer is served | `tests/audio/streamed-loop.test.ts` (trimmed-window and disagreeing-sample cases) and the cross-engine spec |
| Unsupported plan, malformed bytes, failed request, superseded load | cross-engine spec (`refused plans… all yield a safe source`) and `tests/audio/audio-loader.test.ts` |
| Player clock: lookahead, late decode, stop during decode, dispose, retry/failure | `tests/audio/streamed-loop.test.ts` (fake clock) |
| Bus integration: crossfade, mute/volume, stinger duck/restore, stale discard | `tests/audio/audio-mixer.test.ts`, `tests/audio/music-director.test.ts`, `tests/audio/audio-system.integration.test.ts` |
| WKWebView/Tauri engine falls back | WKWebView harness run against the dev server on this host (Safari 26.6.2 / macOS 26 arm64): `prepare()` false for all three assets; without the frame-count check `era2-war.ogg` window 14 threw |

## Reproduce

```sh
./scripts/dev.sh web-smoke-cross-engine   # Chromium + WebKit + Firefox decoder/fallback contract
```

```sh
./scripts/dev.sh build   # then serve baseline (origin/main build) on :4189 and this build on :4190
CONQUESTORIA_MEMORY_DIAGNOSTICS=1 CONQUESTORIA_MEMORY_LABEL=streaming-1466 CONQUESTORIA_MEMORY_SAMPLES=5 CONQUESTORIA_MEMORY_CIVS=2 CONQUESTORIA_MEMORY_MOTIONS=reduce CONQUESTORIA_MEMORY_CACHES=cold CONQUESTORIA_MEMORY_COMPARE_URL=http://127.0.0.1:4190/conquestoria/ CONQUESTORIA_PERF_BASE_URL=http://127.0.0.1:4189/conquestoria/ ./scripts/run-with-mise.sh yarn test:web-smoke:campaign-start --workers=1
```

Note the driver's labels are inverted for this use: `control-*` files are the COMPARE_URL (:4190) build and
`candidate-*` files the BASE_URL (:4189) build. Check `options.baseUrl` and `buildAssets` in each JSON.
