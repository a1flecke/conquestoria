# Renderer memory attribution, 2026-10-11

Investigation for #1439 at `e0b32e06eaacab2ea06c72557e08f8c56edc7304`.
**The dominant remaining startup allocation is decoded audio.** A permanent audio cache also
grows across campaigns with different music families. The targeted repair separates encoded
offline fetching from decoding, bounds decoded caching, and releases obsolete playback.
It also fixes image preload churn and warm-page accounting in the diagnostic driver.

## Environment and accounting

Production Vite build, macOS arm64, Chromium 149.0.7827.55, 1280 × 720 CSS pixels, DPR 1.
Two-civilization fixture: crowded 30 × 30 map. Generated five-civilization fixture: 50 × 50 map,
seed `renderer-memory-1439-five`. Sizes are **MiB**. These are desktop Chromium measurements,
not iPad/PWA results. #1462 and #1463 are merged. The concurrent sprite-lifecycle repair is absent
from the baseline; its protected loader/controller/tests have not been edited. The delivered
branch is rebased onto its merged commit `415e0836`, with final probes on the combined source.

Each sample launches a fresh browser. The recorder saves process PIDs/roles/RSS, CDP process
information, JS heap, DOM counts, weak image/canvas/AudioBuffer references, PCM bytes, and host
`vm_stat`. Images use actual SVG catalog fingerprints. Instrumentation retains numeric metadata
and WeakRefs, not decoded assets. No production debug hooks or GC calls were added.

The original `rendererRssMb(process.pid)` took the Playwright **worker** PID and summed descendant
renderer RSS. It excluded browser/GPU/utility processes, but was neither page attribution nor
private memory. Shared pages can be counted twice; a closed page's renderer can survive.
The repaired campaign-start driver identifies the new page renderer and samples that PID before
and after mounting. Ambiguous/missing attribution returns null, including no process match.
An explicitly requested aggregate remains available separately for diagnostic accounting.
Separate `ps` calls are not atomic during startup allocation.

The first reduced-motion warm sample had closed-prime renderer PID 59276 at 784.8 MiB and measured
page renderer PID 59324 at 762.8 MiB. The legacy helper reported their sum, **1547.6 MiB**. After
closing the measured page, only 59276 remained; after closing the context, neither remained.
That is not evidence that one live page uses 1.5 GiB or that app references survive context teardown.

The 32 GiB host was compressing memory heavily. In one pilot RSS fell from ~770 to ~247 MiB while
all 149.8 MiB decoded PCM stayed live. An idle RSS drop cannot prove assets were released.

## Independent baseline matrix

All **40 samples passed**, n=5 per scenario, at six-second idle. The measured renderer is the
new blank-page PID tracked unchanged through navigation. In warm samples the other renderer is
the closed priming page. All 40 contexts remove every renderer at teardown.

| Civs | Motion | Cache | Renderer count | Aggregate RSS median [range] | Measured renderer RSS median [range] |
| --- | --- | --- | ---: | ---: | ---: |
| 2 | no-preference | cold | 1 | 870.3 [867.4–879.8] | 870.3 [867.4–879.8] |
| 2 | no-preference | warm | 2 | 1751.2 [1745.6–1758.3] | 874.5 [869.2–883.7] |
| 2 | reduce | cold | 1 | 766.4 [765.8–774.0] | 766.4 [765.8–774.0] |
| 2 | reduce | warm | 2 | 1547.6 [1529.8–1559.4] | 762.8 [748.5–779.2] |
| 5 | no-preference | cold | 1 | 765.8 [761.5–776.6] | 765.8 [761.5–776.6] |
| 5 | no-preference | warm | 2 | 1538.3 [1531.2–1566.2] | 760.8 [751.7–780.9] |
| 5 | reduce | cold | 1 | 765.8 [762.8–779.4] | 765.8 [762.8–779.4] |
| 5 | reduce | warm | 2 | 1540.6 [1539.6–1560.8] | 758.5 [750.8–782.2] |

The crowded motion-enabled fixture adds ~105 MiB over reduced motion. That difference does
not appear in the generated opening-game fixture: animation/entity content matters. Warm
aggregate totals are process-accounting artifacts; compare the measured renderer column.

Reproduction:

```sh
CONQUESTORIA_MEMORY_DIAGNOSTICS=1 CONQUESTORIA_MEMORY_LABEL=baseline-matrix CONQUESTORIA_MEMORY_SAMPLES=5 CONQUESTORIA_MEMORY_EXPERIMENTS=baseline CONQUESTORIA_PERF_BASE_URL=http://127.0.0.1:4189/conquestoria/ ./scripts/run-with-mise.sh yarn test:web-smoke:campaign-start --workers=1
```

## Repeated component isolation

Crowded two-civilization fixture, reduced motion, cold cache, independent browsers, **n=5** per
variant, interleaved baseline/suppressions. All **25 samples passed**. Every variant has identical
instrumentation. Suppression uses diagnostic-only request interception.

| Variant | Six-second renderer RSS median [range] | Post-GC RSS median | Live PCM | Private footprint, sample 0 |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 771.4 [768.8–772.8] | 746.3 | 149.8 | 409.6 |
| Block all audio | 344.9 [343.8–346.6] | 326.5 | 0 | 183.5 |
| Block `audio/sfx/**` | 701.0 [698.7–704.5] | 679.0 | 120.7 | 352.4 |
| Block era/war/accent music | 437.2 [432.0–440.2] | 414.4 | 33.1 | 244.3 |
| Serialize audio decode | 746.8 [745.1–750.5] | 723.2 | 149.8 | 392.2 |

All-audio suppression reduces settled RSS by **426.5 MiB**, and sample 0's private footprint by
**226.1 MiB**. Music accounts for the larger differential (~334 MiB RSS / 165 MiB private in sample
0). Blocking SFX saves ~70 MiB RSS / 57 MiB private. These differences overlap; do not sum them.
Serialization lowers sample 0's peak footprint from 619.7 to 552.0 MiB, but leaves PCM unchanged
and saves only ~25 MiB settled RSS. Decode concurrency alone is not the root cause.

The SFX-path suppression removes ~29.1 MiB PCM; catalog entries outside `audio/sfx/` still
decode. The full startup catalog contributes ~33.1 MiB, as the no-music control shows.

| Startup music asset | Duration | PCM |
| --- | ---: | ---: |
| `audio/era/era1-base.ogg` | 165.37 s | 60.56 |
| `audio/accent/mediterranean-antiquity.ogg` | 80.76 s | 29.58 |
| `audio/war/era1-war.ogg` | 72.43 s | 26.52 |

These three buffers use **116.66 MiB**. Startup reaches 196 decoded buffers / 149.80 MiB PCM by
three seconds. A no-playback control retains the same PCM and comparable RSS (~792 MiB with
native tracing enabled). Decoding/cache ownership dominates, rather than audible playback.

## Baseline source causes and similar lifecycle defects

1. `AudioSystem.start` → `preloadSfx` → `AudioLoader.preload` → `get` decodes every SFX catalog entry.
   Offline fetching is coupled to permanent decoded residency, including unused units and ambience.
2. `preloadForEra` decodes base, accent, and war tracks and starts all three loops. The war loop runs
   silently in peace. `MusicDirector` already selects adaptive music on demand, so the adaptive bus
   has competing owners. Eager war assignment can overwrite an unrest/defeat layer selected while
   that asynchronous load was pending; regression coverage must prove the corrected ownership.
3. `AudioLoader.cache` has no byte budget, eviction, or clear operation. A real in-page
   Rome → Rome → Japan replay increases live PCM **149.80 → 193.75 MiB**, retained after GC.
   A further Japan/China campaign adds no PCM. This matches permanent family-track caching;
   it is measured asset retention, not an inference from RSS. Era changes can retain more tracks.
4. Mixer disposal retains source/gain references and buffers. One thrown `stop` skips later stops
   because the whole loop shares one `try`. Director/SFX pending callbacks also need generation
   guards so disposal/rebinding cannot resurrect old playback. These are source-level defects;
   exact failing regressions are required before claiming their production impact is fixed.
5. Seven immutable SVG preload families run every campaign. Six starts created **312 terrain
   images / 24 wonder images**, rather than reusing 52 / 4. Old images disappear after GC:
   confirmed allocation churn, not permanent image leakage. Terrain `onerror` also fails to revoke
   its Blob URL. Marker loaders share missing cached/inflight checks. Audit scope is the loaders
   called by the live controller, without editing that protected controller.

The first lifecycle run passed the baseline replay but its artificial no-playback variant failed
when replacement stopped sources whose `start` had been suppressed. The driver now starts and
immediately stops real sources, preserving valid teardown semantics. Both cold and warm
no-playback lifecycle replays subsequently passed. No unrelated process was stopped.

## Ranked remaining candidates

| Candidate | Size evidence | Confidence / retention |
| --- | --- | --- |
| Audio plus decode overhead | 150 MiB PCM; ~426 MiB RSS / 226 MiB private suppression differential | High causal attribution and family-cache growth; native differential n=1 |
| Animated presentation | Earlier uninstrumented n=5: motion 865 vs reduced 769 MiB cold RSS | Medium; independent matrix confirms crowded-fixture effect; concurrent sprite work owns its repair |
| Map SVG and sprite storage | Terrain ~5.15 MiB natural RGBA, wonders ~0.40, other SVG ~0.86, demanded sprite pixels ~3.09 | High logical dimensions, low native ownership attribution; repeat churn proven |
| Canvas/compositor | One canvas ~3.52 MiB RGBA; native trace tile memory ~4.73 MiB | Medium; multiple surfaces/ownership differ; canvas hide n=1 saves ~36 MiB RSS |
| JS/state/DOM | Post-GC JS ~11.8 MiB; ~664 DOM nodes, 584 overlay children, 14 entities | High counters, low owner attribution; no evidence of hundreds of MiB in game-state JS |
| Shared mappings/native allocator | `vmmap` footprint ~410 vs `ps` RSS ~772 MiB; stable trace array-buffer allocations ~153 MiB | Accounting differs; owner-level remainder unresolved, not all an app leak |

Directional n=1 controls at six seconds: terrain suppression saves ~19 MiB RSS, wonder ~4 MiB,
overlay hiding ~6 MiB. These are not precise additive costs. Successful-load snapshots show zero
outstanding instrumented Blob URLs; terrain failure leakage is a source finding.

`vmmap` cannot inspect Chromium's PartitionAlloc malloc zone here. Huge virtual reservations
(~1.4 TiB) are not resident allocations. Native sampling yielded only V8 data. Memory-infra traces
expose array-buffer allocations near measured PCM, native allocator, Skia, and compositor data.
Dumps/UI snapshots are asynchronous: use stable-idle evidence, not atomic transition attribution.
Parent/child allocator rows and ownership aliases must not be summed.

## Implemented repair and verification

The requester approved these targeted production fixes and the diagnostic driver repair:

- Prefetch encoded SFX with four workers, without decoding the entire catalog. Decode on demand.
- Give the director sole ownership of adaptive playback. Prefetch war bytes for offline use;
  decode/play war, unrest, or defeat only when selected. Initialize saved authoritative state.
- Limit reusable decoded buffers to an 8 MiB LRU. Active long tracks have explicit ownership;
  reuse unchanged loops, clear ownership on disposal/game end, and invalidate obsolete loads.
- Track every active/fading mixer source and release each independently, even when stop throws.
  Disconnect ended sources/gains and clear their buffers; reject old stinger/SFX completions.
- Reuse immutable images across all 15 terrain/wonder/marker loaders, coalesce concurrent loads,
  retry failures, revoke Blob URLs on asynchronous and synchronous errors, and preserve readiness.
- Attribute the original campaign-start diagnostic to its measured renderer, and close manually
  launched browser/context resources even when a sample fails.

Preserve loop points, crossfades, viewer gating, mute, and web/Tauri behavior. Currently playing
long music still requires PCM in this engine; this fix cannot promise the entire no-audio saving.
Streaming is a separate architecture option with custom-loop timing tradeoffs. The requested
future-agent issue is [#1466](https://github.com/a1flecke/conquestoria/issues/1466), including evidence,
code paths, loop boundaries, offline/distribution constraints, and acceptance criteria.

Exact failing regressions were added to existing audio/renderer files before the corresponding
repairs. Targeted audio/renderer verification passed 698 tests (one skipped); a later added
integration regression covers a late era preload attempting to overwrite the director's crisis
layer. The combined audio/renderer run after rebase passed 699 tests (one skipped).
Both synchronous image failure regressions failed before cleanup hardening and passed
afterwards. Removing the SFX generation check reproduced both dispose/rebind failures, then
restoring it passed. No new default test files or CI-shard allocation changes were needed.
The final audit also reproduced an older-era transition decoding late and playing two obsolete
stingers after a newer era. Era advancement now invalidates that pending chain, using the same
generation guard as player changes and disposal.

The first full durable run passed 778 files / 14,069 tests, plus hooks. The final publication uses
a separate HEAD-bound `verify-pr` / `verify-pr-status` proof; the earlier result is not reused as
final completion evidence. Source-rule checks, typecheck, the rebased production build and all
492 wonder regressions pass. Production comparison and final lifecycle/offline probes follow.

## Production repair comparison

All **80 interleaved control/candidate samples passed**, n=5 per build/scenario. Control is the
frozen baseline build; candidate is the first repair build (`index-Cp3zQ4jS.js`). Both are preserved
under `.verification/renderer-memory/{baseline-dist,candidate-dist}/`. Subsequent source changes
add peace/game-end release and synchronous SVG-error cleanup; final-build probes cover those
changes separately. Every sample identifies the active PID unambiguously, and every closed
context removes all renderers.

Six-second **active page renderer** RSS, MiB median [range]:

| Civs | Motion | Cache | Control | Candidate |
| --- | --- | --- | ---: | ---: |
| 2 | no-preference | cold | 872.5 [871.7–873.7] | 768.9 [765.7–772.9] |
| 2 | no-preference | warm | 883.2 [869.5–885.2] | 751.5 [749.1–753.1] |
| 2 | reduce | cold | 769.3 [767.1–771.9] | 676.1 [675.9–678.3] |
| 2 | reduce | warm | 761.5 [747.4–778.8] | 647.4 [644.8–648.5] |
| 5 | no-preference | cold | 766.7 [764.0–771.4] | 673.1 [667.1–707.0] |
| 5 | no-preference | warm | 758.8 [436.7–775.3] | 645.2 [266.3–648.4] |
| 5 | reduce | cold | 765.6 [760.8–770.2] | 674.9 [673.1–725.7] |
| 5 | reduce | warm | 754.4 [751.1–770.6] | 644.6 [643.1–648.1] |

Candidate live PCM is **90.14 MiB in all 40 samples**, vs 149.80 in every control, including
post-GC: a **59.66 MiB / 39.8%** reduction. RSS medians improve by 90.7–131.7 MiB across the eight
scenarios. Strong host pressure explains the low warm outliers; PCM ownership is stable even
when RSS is compressed. These RSS results are not a private-footprint measurement. The two
audible long music tracks remain decoded; #1466 addresses that remaining architectural cost.

```sh
CONQUESTORIA_MEMORY_DIAGNOSTICS=1 CONQUESTORIA_MEMORY_LABEL=fix-comparison CONQUESTORIA_MEMORY_SAMPLES=5 CONQUESTORIA_MEMORY_COMPARE_URL=http://127.0.0.1:4190/conquestoria/ CONQUESTORIA_PERF_BASE_URL=http://127.0.0.1:4189/conquestoria/ ./scripts/run-with-mise.sh yarn test:web-smoke:campaign-start --workers=1
```

## Final combined-source lifecycle and offline probes

Production bundle `index-DCZNfj_s.js`, after rebase onto `415e0836`: cold and warm actual in-page
campaign sequences both pass, without page errors. Each starts the crowded fixture and then
Rome → Rome → Japan → Japan → China. Post-GC PCM is 90.14 MiB for the initial/Rome campaigns,
then 104.51 for every Japan/China campaign. The obsolete 29.58 MiB Mediterranean buffer is
collected after switching families; this is active-track replacement, not continued accumulation.

All six starts retain **52 created terrain images and four wonder images**. The original baseline
created 312 / 24. No instrumented Blob URLs remain outstanding after successful loading.
Both contexts remove every renderer on close.

Both first-campaign cold and warm probes disable networking after startup, fetch all **193**
deduplicated SFX assets (2,024,976 encoded bytes), and decode/start/stop a real 34,202-frame SFX.
They do not pre-warm additional online files to make the test pass. The service worker controls
the page, preserving offline encoded availability without full-catalog decoded residency.

Six-second active renderer RSS is 675.3 MiB cold / 646.0 warm (n=1 each, diagnostic follow-up).
The cold renderer's native physical footprint is 330.7 MiB, peak 511.6 MiB; baseline audio
attribution sample 0 was 409.6 / 619.7. These n=1 native observations are directional and were
not interleaved; PartitionAlloc inspection remains unavailable. Do not treat the entire native
remainder as resolved or generalize these desktop results to iPad.

```sh
CONQUESTORIA_MEMORY_DIAGNOSTICS=1 CONQUESTORIA_MEMORY_LABEL=merged-lifecycle-offline CONQUESTORIA_MEMORY_SAMPLES=1 CONQUESTORIA_MEMORY_CIVS=2 CONQUESTORIA_MEMORY_MOTIONS=reduce CONQUESTORIA_MEMORY_CACHES=cold,warm CONQUESTORIA_MEMORY_LIFECYCLE=1 CONQUESTORIA_MEMORY_OFFLINE=1 CONQUESTORIA_MEMORY_NATIVE=1 CONQUESTORIA_PERF_BASE_URL=http://127.0.0.1:4189/conquestoria/ ./scripts/run-with-mise.sh yarn test:web-smoke:campaign-start --workers=1
```

## Evidence status

Passed: 25 audio-attribution samples, same-family and cross-family baseline replays, no-playback
startup control, diagnostic typecheck. The 40-sample independent baseline matrix passed.
Still missing: formal instrumentation-overhead control, DPR comparison, heap-retainer snapshots,
and device testing. Candidate comparison and final combined-source probes passed. Publication
verification is recorded separately by the worktree-local HEAD-bound runner status and the PR.
No merge or issue closure has been performed.

Raw JSON/partials, PID-attributed vmmap summaries, native profiles and traces are preserved in the
isolated worktree's ignored `.verification/renderer-memory/{audio-attribution,lifecycle-trace,
lifecycle-families,baseline-matrix,fix-comparison,final-lifecycle-offline,merged-lifecycle-offline}/`.
Original diagnostic attachments are under
`.verification/campaign-start-original-results/`. Recorder source:
`tests/e2e/helpers/renderer-memory-perf.ts`, reached only through the existing opt-in diagnostic.

Reproduction (production preview at port 4189):

```sh
CONQUESTORIA_MEMORY_DIAGNOSTICS=1 CONQUESTORIA_MEMORY_LABEL=audio-attribution CONQUESTORIA_MEMORY_SAMPLES=5 CONQUESTORIA_MEMORY_CIVS=2 CONQUESTORIA_MEMORY_MOTIONS=reduce CONQUESTORIA_MEMORY_CACHES=cold CONQUESTORIA_MEMORY_EXPERIMENTS=baseline,no-audio,no-sfx,no-music,serial-audio CONQUESTORIA_MEMORY_NATIVE=1 CONQUESTORIA_PERF_BASE_URL=http://127.0.0.1:4189/conquestoria/ ./scripts/run-with-mise.sh yarn test:web-smoke:campaign-start --workers=1
```

This supersedes the prior incomplete report; its earlier two menu-selector failures remain in
conversation history and the prior #1439 issue comment.
