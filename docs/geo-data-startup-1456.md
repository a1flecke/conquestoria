# Geographic map data: startup cost and deferral (#1456)

The Earth, Old World and New World tile/river tables were three static imports in `src/core/game-state.ts` and
`src/systems/map-generator.ts`. The issue said their production cost had not been measured. This is that
measurement, the decision it supports, and what changed. The loader's contract is in
`.claude/rules/game-systems.md` ("Geographic map data is loaded on demand").

## 1. What was shipping (baseline `576465c7`)

`yarn build` emitted **one** 6,112,289-byte entry chunk (`index-*.js`) with no data chunk, i.e. the
geography was on the first-navigation critical path for every player, including those who never pick a
geographic map. Attributing emitted bytes to source modules through the chunk's sourcemap:

| Module | Emitted bytes in the entry chunk |
|---|---:|
| `old-world-map-data.ts` | 416,674 |
| `earth-map-data.ts` | 414,167 |
| `new-world-map-data.ts` | 412,388 |
| **Geography total** | **1,243,229 (20% of the chunk)** |
| next largest: `renderer/sprites/buildings.tsx` | 189,422 |

The three data modules were the three largest modules in the bundle. Compressed they are tiny (about 26 KB gzip
each as JSON) because the tables are highly repetitive, so the cost was **parse/evaluate time and memory**, not
transfer.

## 2. Go / no-go

Upper-bound experiment: build with the three modules stubbed to empty tables (not shipped) and compare. The
stubbed build was faster on every startup metric (section 4), so the cost is real and attributable. **Go**, with
the constraints that map generation stays deterministic, saves are unchanged, offline play keeps working, and a
geographic start must not get slower.

## 3. What changed

- Bulk tiles and rivers are now `src/systems/geo-data/{earth,old-world,new-world}-map.json` (≈490 KB each,
  byte-for-byte the same data: the SHA-256 of each of the nine exported tables, tiles, rivers and start positions
  for all three maps, matched before and after the split).
- `src/systems/geo-map-data.ts` fetches the chosen map on demand, single-flight per script, with typed
  not-loaded / malformed errors. The synchronous constructors read only loaded data and never substitute another map.
- Start anchors moved to small `*-start-positions.ts` modules and stay eager (placement and the advisor read them).
- The setup screens show a busy state while a load runs and a plain error with a working retry if it fails
  (`setup-start-flight.ts`); both report the selected map so the controller **prefetches it while the player is
  still choosing**.
- The service worker precaches the three hashed JSON files (`scripts/version-sw-cache.mjs`); the build fails if one is
  missing.

**Why `fetch` of JSON and not a dynamic `import()` chunk.** The first implementation was `import()`. A probe in the
Chromium that Playwright ships (149.0.7827.55) showed a failed dynamic import is remembered for the life of the page:
after an aborted request, `fetch(url)` returned 200 but `import(url)` kept failing, and only a different URL worked.
"Press Start again" could therefore never succeed. A failed `fetch` leaves nothing behind, and JSON is also cheaper
to parse than a 900 KB JavaScript literal is to evaluate.

## 4. Results

Method: production build served as static files under `/conquestoria/` with gzip level 6 and no cache; headless
Chromium 149, fresh context per run (cold: empty HTTP cache, service worker blocked); the metric is the time on the
page's clock until the start screen's "New Game" button is visible, plus CDP `Performance.getMetrics`. Baseline and
candidate were run **interleaved** in rounds (3 rounds of 9 runs at 1x CPU, 3 rounds of 7 at 4x CPU throttle).
Host: Apple M4 laptop, other agents active (the host alternates between fast and slow states, see "noise").
The harness is `scripts/startup-payload/` (copy each build into a `dist-baseline` / `dist-candidate` directory next to
the scripts, then `yarn node scripts/startup-payload/measure-matrix.cjs`; `attribute-bytes.cjs <chunk.js>` does the
sourcemap attribution; `geo-flow.cjs <dist> <label> start|offline` measures a geographic start and the offline proof).
The baseline is the build of `576465c7`.

Startup (medians of the three round medians):

| Metric | Baseline | Candidate | Change |
|---|---:|---:|---:|
| Raw entry JS | 6,112,289 B | 4,874,825 B | −1.24 MB (−20%) |
| Gzip transfer at the start screen | 908 KB | 829 KB | −79 KB (−8.7%) |
| JS heap at the start screen | 8.9 MB | 6.4 MB | −2.5 MB (−28%) |
| Script duration, 1x CPU | 47 ms | 35 ms | −26% |
| Script duration, 4x CPU | 189 ms | 142 ms | −25% |
| Time to start screen, 4x CPU | 344 ms | 286 ms | −58 ms (−17%) |
| Time to start screen, 1x CPU | 211 ms | 88 ms | see noise |

An earlier independent matrix on the same machine (first implementation, same startup path) gave time-to-start-screen
241 → 211 ms at 1x (−12%) and 426 → 357 ms at 4x (−16%), and script duration 61 → 46 ms (−25%) and 241 → 186 ms (−23%).

**Noise.** The 1x time-to-start-screen differed a lot between the two matrices (a 211 ms baseline in one, 241 ms in
the other, and the candidate 88 ms vs 211 ms) because the host switches between fast and slow states between
rounds; within a round the runs agree to a few ms. The stable quantities are the bytes, the heap and the script
duration ratios. Treat "−12% to −58% at 1x, −16% to −17% at 4x" as the honest range rather than one number.

**Geographic start (the default map is Earth), Start pressed → HUD "Turn 1":**

| | Baseline | Data loaded at Start, no prefetch | Final (prefetch while choosing) |
|---|---:|---:|---:|
| 1x CPU | 57 ms | 134 ms | 57 ms |
| 4x CPU | 229 ms | 555 ms | 229 ms |

The "no prefetch" column is an earlier build that fetched at the moment of Start; it would have cost +62 ms (1x) and +255 ms (4x) on the default map, which is why the
setup prefetches. With prefetch, Start is at parity with the baseline even when pressed immediately (final build, medians of 7 and 5 runs). These runs use a
local server, so they exclude real network latency; the transfer is about 26 KB gzip per map.

**Offline (production build, service worker).** After a normal online visit and reload, with the network disabled,
reload → New Game → Solo → Start (Earth) begins a campaign with no load error, and the cache holds all three map
files although none was ever fetched online. Negative control: the same build with the three precache lines removed
from `sw.js` fails the offline Earth start (the HUD never appears). So the precache is what provides offline play.

## 5. Not measured, and limits

- Real network latency and real mobile or iPad hardware: not measured (#1455 is out of scope). The 4x CPU throttle is an
  approximation, not a device.
- The Tauri native webview: the Tauri frontend build passes, but native behaviour of the JSON fetch was not run.
- The default map is Earth, so a player who keeps it still downloads one map's data (≈26 KB gzip) when the setup opens.
  The saving is for the start screen and for players who choose another map; `old-world`/`new-world` are fetched only
  if selected.
- A save never needs the data (the map is stored in the save), so loading a game does not fetch it.
