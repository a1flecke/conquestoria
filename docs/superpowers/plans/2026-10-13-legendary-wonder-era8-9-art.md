# Era 8–9 Legendary-Wonder Production Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (Repo policy in `CLAUDE.md`: **no subagents** — execute inline.)

**Goal:** Show production art for the seven remaining `TODO(art)` industrial wonders (`eiffel-tower`, `brooklyn-bridge`, `trans-siberian-railway`, `panama-canal`, `empire-state-building`, `hoover-dam`, `wright-flyer`) on the map and in every production/queue/wonder surface, keep the canvas drawings as the deterministic fallback, and retire Wright Flyer's placeholder building-style SVG.

**Architecture:** This is #613's pipeline re-used, not rebuilt. #613 (merged, PR #1483) already ships the loader, thumbnail helper, UI icon entry, map/city-badge drawing and e2e spec, all keyed off one switch: the id's presence in `LEGENDARY_WONDER_ART_IDS`. So #619 is (a) generate and approve seven 128×128 transparent isometric PNGs with the Sprite-AI MCP (`sprite_generate`), (b) commit them with provenance, (c) extend the id tuple and the tests that hard-code "six", (d) delete the Wright Flyer SVG sprite, (e) reconcile docs and TODOs. No new runtime code is expected; if QA shows a code change is needed, it is a finding, not a plan step.

**Tech Stack:** TypeScript, Canvas 2D, PNG via Vite `public/`, vitest, Playwright, Sprite-AI MCP.

**Issue:** https://github.com/a1flecke/conquestoria/issues/619 (no spec doc; the issue body is the spec). Process precedent: #613 (`.claude/rules/sprites.md` → "Legendary Wonder Production Art (#613)").

## Facts verified in the repo at plan time (do not re-derive)

- `src/renderer/wonders/legendary-wonder-art-catalog.ts` holds `LEGENDARY_WONDER_ART_IDS` (six ids) and `getLegendaryWonderArtPath`. Map badge (`legendary-wonder-renderer.ts:172`), city production badge (`city-render-passes.ts:468`), city-panel/wonder-panel/Codex icons (`src/ui/legendary-wonder-icon.ts`) all read it. Nothing else is edited per wonder.
- Tests that hard-code the six: `tests/renderer/wonders/legendary-wonder-art.test.ts` (the "names exactly the six" `toEqual`), `tests/e2e/issue-613-wonder-art.spec.ts` (`IDS`). Others (`legendary-wonder-thumbnail`, `…-art-loader`, `…-art-renderer`, `…-art-city-badge`) loop over the tuple, but **grep each for literal wonder ids before editing** — a test that asserts "eiffel-tower has no art" will now be wrong (the 613 tests use `eiffel-tower` as the negative example: `legendary-wonder-art.test.ts` `getLegendaryWonderArtPath('eiffel-tower')` → null).
- TODO lines in `legendary-wonder-bespoke-assets.ts` (1033 eiffel, 1079 brooklyn, 1127 trans-siberian, 1188 panama, 1225 empire-state, 1264 hoover, 1317 wright-flyer) and one in `src/renderer/sprites/wonders.tsx:322` (`WrightFlyerSprite`). #613 replaced its six with `// Fallback only: production art is public/images/wonders/art/ (legendary-wonder-art-catalog.ts, #613); this canvas drawing runs offline or if that image fails to load.` — reuse that exact line (re-point the issue number to #619 only if a test pins the text).
- `WrightFlyerSprite` is registered as `'wright-flyer'` in `BUILDING_SPRITE_CATALOG` (`src/renderer/sprites/sprite-catalog.ts:446`), consumed by `city-panel-building-icon.ts` and `sprite-loader.ts` by *building* id. `wright-flyer` is a legendary wonder, queued as `legendary:wright-flyer`, so the entry is expected to be unreachable for it — confirm with grep in Task 4 before deleting. `tests/ui/city-panel.test.ts:2814` comments "only 5 of 74 wonder ids" have a BUILDING_SPRITE_CATALOG entry; that count becomes 4.
- `docs/sprite-design-system.md`: line ~111 ("and `wright-flyer` have one"), ~290 (the "other seven TODO(art) wonders" paragraph), ~302 (wright-flyer row "placeholder … tracked: #619"), ~462 (SVG + canvas row). `.claude/rules/sprites.md:88` section title/prose says Era 5–7 / "six".
- Sprite-AI: `mcp__…__sprite_generate` costs **1 token**, balance is **19** (checked 2026-10-13). Seven first-pass generations leave 12 for regeneration. 613 used `asset_type: prop`, `camera_perspective: isometric`, `width: 128`, `height: 128`; the tool returns the PNG inline and as base64.
- Service worker runtime-caches the PNGs; no precache edit. Map badge draws the art at roughly 20–40 px (`half = radius * 0.72 * scale * 1.25`), so silhouette beats detail.

## Known risks carried over from #613 (design the prompts against them)

#613's accepted gaps were all "the brief listed N things and the generator drew fewer": no galleys, no transept, one boat, near-monochrome blue. For #619: put the **one identifying silhouette first** in the prompt and cap secondary details at two; avoid long ship queues, skylines and "river traffic" (they come out as one blob at 30 px); give each wonder a distinct dominant hue so seven new badges are not mutually confusable (iron-grey/Paris-haze, red-brown-stone, steppe-gold/green, jungle-green/water, art-deco cream/gold, concrete-grey/canyon-orange, sand/sky-blue). Historical accuracy is a real review item for this batch (the wonders are real, photographed structures): Eiffel is a four-legged tapering lattice with a first-platform arch; Brooklyn Bridge has two **pointed-arch** granite towers with diagonal and radial cables; Empire State has stepped setbacks and a mast; Hoover is a curved **arch-gravity** dam with intake towers; Wright Flyer is a **canard** biplane with the pilot lying prone on the lower wing, on a monorail.

## Global Constraints

- Square isometric landmark, transparent background, no text/logos, readable at tile scale (issue + `.claude/skills/generate-sprite-prompt.md`).
- Assets: local files in `public/images/wonders/art/<id>.png`, exactly 128×128 RGBA, transparent corner pixels, ≤ 24 KB each; **no remote runtime URLs**; URLs only via `resolveAppAssetUrl`, never hard-coded.
- Every asset has `design/wonder-art/<id>.provenance.json` (tool, prompt, generation id, date, settings, licence note) in the shape of the existing six.
- No `Math.random()`, no save change, no `SAVE_VERSION` bump, faction-neutral art, no per-player logic.
- Procedural canvas draw functions and `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS` stay; only the TODO comment lines go.
- Commands only via `./scripts/dev.sh <task>` or `./scripts/run-with-mise.sh yarn <cmd>`. Work happens in this worktree; run `./scripts/setup-git-hooks.sh` and `mise trust <worktree>/mise.toml` before the first push.

## Review Focus

1. A wonder that is **not** in the art tuple keeps its exact current drawing and shared emoji (the other 60+ wonders; no regression from extending the tuple). *(Task 3)*
2. Image fetch fails (offline, 404, wrong base path) → each of the seven draws its canvas fallback, no throw, no blank hole. *(Task 5)*
3. `under-construction` still shows the ghost arc, not finished art, for the new seven. *(existing renderer tests iterate the tuple; Task 3 verifies they now cover 13)*
4. Deleting `WrightFlyerSprite` leaves no import, catalog entry, dead export, docs row or test pointing at it; no UI surface falls to a broken icon (queue/chooser/Codex for `legendary:wright-flyer` show the art, and the emoji if art fails). *(Task 4)*
5. Seven new badges are distinguishable from each other and from the six existing at 32 px on grass, desert, ocean and dark terrain. *(Task 2 approval gate, Task 5 QA)*
6. An asset with an opaque corner, wrong size, > 24 KB, or a missing/`UNCONFIRMED` provenance record fails CI. *(Task 3, existing parametrised test)*
7. Historical subject accuracy (see Known risks) — an image that is the wrong building is rejected at the approval gate even if it looks attractive. *(Task 2)*

## File Structure

- Create 7× `public/images/wonders/art/<id>.png` and 7× `design/wonder-art/<id>.provenance.json`.
- Modify `src/renderer/wonders/legendary-wonder-art-catalog.ts` (ids + header comment), `legendary-wonder-bespoke-assets.ts` (7 comment lines), `src/renderer/sprites/wonders.tsx` (delete `WrightFlyerSprite` + its TODO + now-unused imports), `src/renderer/sprites/sprite-catalog.ts` (import + entry).
- Modify tests: `tests/renderer/wonders/legendary-wonder-art.test.ts`, `tests/e2e/issue-613-wonder-art.spec.ts` (keep filename; widen scope), any other test found by grep. New small test only if Task 4's grep shows no existing guard that the sprite is gone.
- Docs: `docs/sprite-design-system.md`, `.claude/rules/sprites.md`; this plan is deleted and its `docs/docs-lifecycle-manifest.json` row moved to `deleted` in the completing PR.

---

### Task 1: Pre-flight (terms, tokens, prompts)

**Files:** none (decisions recorded in the Task 2 provenance files).

- [ ] **Step 1:** Re-run `sprite_get_balance`; require ≥ 12. If lower, stop and ask the owner before generating.
- [ ] **Step 2: Licence.** The #613 note says the owner confirmed in chat on 2026-10-13 and "Re-check the current terms before generating more sources." Fetch Sprite-AI's current terms page (WebFetch), summarise the commercial-use/attribution clause to the owner in one or two lines, and ask for confirmation that the same permission covers these seven. **Do not generate until the owner answers.** Record their answer, the date, and whether the terms text was actually read, in each provenance `licence_note` (same honest wording as the existing six).
- [ ] **Step 3:** Invoke `.claude/skills/generate-sprite-prompt.md` and write seven final prompts. Template (copy the six existing `prompt` fields for house style): "`<identifying silhouette>`, `<≤2 secondary details>` for a strategy game, isometric, `<dominant palette>`, strong readable silhouette, no text, transparent background."

  Drafts (refine with the skill, keep the order: silhouette first):
  - `eiffel-tower`: tapering wrought-iron lattice tower on four arched legs with a first-level platform and needle spire; warm iron-brown against soft Paris-grey; small low rooftop hint at the base.
  - `brooklyn-bridge`: two granite towers with pointed Gothic arches joined by a roadway, fan and diagonal suspension cables; river below with one small steam ferry; stone-tan and steel-grey.
  - `trans-siberian-railway`: steam locomotive with smoke on a curving rail line running into a steppe horizon; a few birch trees; steppe gold and green with a hint of snowy peaks.
  - `panama-canal`: a stepped concrete lock chamber with open gates and one ship inside, jungle banks either side; water blue and jungle green.
  - `empire-state-building`: cream limestone art-deco tower with stepped setbacks and a slender mooring mast, a few low city blocks at the base; cream, steel-blue, warm dawn gold.
  - `hoover-dam`: curved concrete arch dam with two intake towers and white water spilling below, canyon walls and a blue reservoir behind; concrete grey, canyon orange, dusk blue.
  - `wright-flyer`: canvas-and-wood biplane with the elevator out front on a wooden launch rail over dunes, a pilot lying on the lower wing, two figures watching; sand and pale sky.
- [ ] **Step 4:** No commit (nothing changed).

### Task 2: Generate, review and approve the seven PNGs

**Files:**
- Create: `public/images/wonders/art/<id>.png` ×7
- Create: `design/wonder-art/<id>.provenance.json` ×7

**Interfaces:** Produces files only. Consumed by Task 3's tuple and tests.

- [ ] **Step 1:** For each id call `sprite_generate` with `asset_type: "prop"`, `camera_perspective: "isometric"`, `width: 128`, `height: 128` and the Task 1 prompt. Do the calls one at a time (inline, no parallel agents). Save the returned base64 to a scratchpad file first, decode with `base64 -d`; do not write generated bytes straight into `public/`.
- [ ] **Step 2: Mechanical check** per file: exactly 128×128, RGBA (colour type 6), corner alpha 0, ≤ 24 KB. If a file exceeds 24 KB, try lossless re-optimisation (`oxipng`/`pngquant` only if already available via `mise`; do not install unverified tools) before regenerating.
- [ ] **Step 3: Visual approval gate.** View each PNG (Read) at full size, then reduced to 32 px (`sips -z 32 32` into the scratchpad) and judge: correct landmark (Known risks list), silhouette distinct from the other 12, edges clean, no text/logo artefacts, acceptable on both a dark and a light backdrop. Show the owner a contact sheet of the seven (build with `sips`/the visualize widget; do not commit it) and get an explicit per-image approve/regenerate. Budget: up to 12 regenerations total; if a wonder fails twice, stop and ask whether to accept, hand-author SVG→PNG, or change the brief. Record each rejected generation id? No — only the accepted one goes in provenance.
- [ ] **Step 4:** Move approved files into `public/images/wonders/art/`. Write each provenance JSON with exactly the keys of `design/wonder-art/suez-canal.provenance.json` (`id`, `file`, `generator`, `settings`, `sprite_ai_generation_id` = the accepted generation's id, `generated_on`, `tokens_used` = tokens spent on **that wonder** including regenerations, `prompt` = the final accepted prompt, `licence_note`).
- [ ] **Step 5: Commit** `art(wonders): Era 8-9 wonder PNGs and provenance (#619)` — assets only; the tuple is not extended yet, so no test changes behaviour.

### Task 3: Make the seven live (catalog + contract tests)

**Files:**
- Modify: `src/renderer/wonders/legendary-wonder-art-catalog.ts`
- Modify: `tests/renderer/wonders/legendary-wonder-art.test.ts`
- Modify: any test the grep finds

**Interfaces:** Consumes the Task 2 files. Produces `LEGENDARY_WONDER_ART_IDS` with 13 ids (appended in the issue's order); `LegendaryWonderArtId` widens automatically. Signatures unchanged.

- [ ] **Step 1: Failing test.** In `legendary-wonder-art.test.ts` change the "names exactly the six" test to the 13-id sorted list and rename it ("names exactly the thirteen Era 5–9 wonders…"); replace the negative example `'eiffel-tower'` in the "returns a path only for catalogued ids" test with a wonder that stays art-less (pick one by grep, e.g. `grand-canal` or `great-pyramid` — a real id that exists in the landmark catalog and is not in the tuple). Also add `expect(getLegendaryWonderArtPath('hoover-dam')).toBe('images/wonders/art/hoover-dam.png')` style positives for two of the new ids.
- [ ] **Step 2:** `./scripts/dev.sh test tests/renderer/wonders/legendary-wonder-art.test.ts` → FAIL (tuple still six).
- [ ] **Step 3:** Append the seven ids to the tuple; update the header comment ("Era 5–7" → "Era 5–9", mention #619).
- [ ] **Step 4:** Run the contract test → PASS (it is parametrised, so it checks each new file's size/dimensions/transparency/provenance for free).
- [ ] **Step 5:** `grep -rn "eiffel-tower\|brooklyn-bridge\|trans-siberian\|panama-canal\|empire-state\|hoover-dam\|wright-flyer" tests/renderer tests/ui tests/app tests/e2e` and fix any assertion that assumed "no art". Run `./scripts/dev.sh test tests/renderer/wonders tests/ui/legendary-wonder-thumbnail.test.ts tests/ui/city-panel.test.ts tests/ui/wonder-panel.test.ts tests/ui/wonder-codex-page.test.ts`.
- [ ] **Step 6: Commit** `feat(wonders): enable production art for the Era 8-9 legendary wonders (#619)`.

### Task 4: Retire the Wright Flyer placeholder SVG and the TODOs

**Files:**
- Modify: `src/renderer/sprites/wonders.tsx` (delete `WrightFlyerSprite`, its `/* === WRIGHT FLYER === */` banner and TODO; drop any import only it used)
- Modify: `src/renderer/sprites/sprite-catalog.ts` (import + `'wright-flyer'` entry; update the "S6 legendary wonder sprites" comment if it lists it)
- Modify: `src/renderer/wonders/legendary-wonder-bespoke-assets.ts` (seven comment lines)
- Modify: `tests/ui/city-panel.test.ts:2814` comment ("5 of 74" → 4) if the count is asserted anywhere

**Interfaces:** Removes export `WrightFlyerSprite` and key `'wright-flyer'` of `BUILDING_SPRITE_CATALOG`. Nothing else may reference either.

- [ ] **Step 1: Prove it is dead.** `grep -rn "WrightFlyerSprite\|BUILDING_SPRITE_CATALOG\[" src tests`; confirm no caller passes a wonder id. Write a failing guard test in `tests/renderer/sprites/sprite-catalog.test.ts`: `expect(Object.keys(BUILDING_SPRITE_CATALOG)).not.toContain('wright-flyer')` — the catalog-level proof that the placeholder is gone and cannot silently return.
- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3:** Delete the sprite, the catalog entry and the unused imports. Replace the seven TODO comment lines in `legendary-wonder-bespoke-assets.ts` with the #613 fallback-only comment (grep `TODO(art)` there afterwards: **zero** hits expected).
- [ ] **Step 4:** `./scripts/dev.sh typecheck` (or `build`) must show no unused/missing symbol; guard test PASS; `./scripts/dev.sh test tests/renderer/sprites tests/ui/city-panel-building-icon.test.ts tests/ui/city-panel.test.ts`.
- [ ] **Step 5:** `grep -rn "TODO(art)" src` — only unit and building sprites remain (not in scope; do not touch).
- [ ] **Step 6: Commit** `refactor(sprites): retire the Wright Flyer placeholder SVG and Era 8-9 wonder TODO(art) markers (#619)`.

### Task 5: Success + fallback coverage, then visual QA

**Files:**
- Modify: `tests/e2e/issue-613-wonder-art.spec.ts` (`IDS` → the 13 ids; update the header comment to "#613/#619"; keep the filename so the issue-613 CI shard allocation is unchanged)

- [ ] **Step 1:** Widen `IDS` to 13. Keep every existing assertion (art loads, transparent corners untouched, fallback when `page.route` aborts the PNGs, identical-hash idle, no console errors). If the spec parametrises background colours, keep light/dark/ocean/desert.
- [ ] **Step 2:** Run it (`./scripts/run-with-mise.sh yarn playwright test tests/e2e/issue-613-wonder-art.spec.ts`, or the `web-smoke`/e2e dev.sh task the repo exposes — check `./scripts/dev.sh` usage first). Expect PASS on first run because the code paths are generic; a failure here is a real finding, so diagnose root cause before touching test or code.
- [ ] **Step 3: Manual QA** with the built-in browser (`preview_start`, then **`preview_stop` immediately after** — audio plays through real speakers): complete all 13 wonders in a scenario (`?scenario=` loader, #846) and check map at normal and 375×812 zoom, light and dark terrain, production chooser, queue, "Producing", wonder panel cards, Codex hero, and the city production badge; then go offline after one load and reload (service-worker cache) and confirm art persists; then block `/images/wonders/art/*` and confirm every wonder shows its canvas drawing and emoji. Record findings in the PR body. Contrast problems → regenerate (tokens permitting) and update provenance; scale/smoothing tweaks are `legendary-wonder-renderer.ts:175` and need their own failing test first.
- [ ] **Step 4: Commit** `test(e2e): Era 8-9 wonder art success and fallback paths (#619)` (plus any QA-driven asset swap in its own commit).

### Task 6: Docs, lifecycle, verification, PR

**Files:**
- Modify: `docs/sprite-design-system.md`, `.claude/rules/sprites.md`, `docs/docs-lifecycle-manifest.json`; delete this plan file.

- [ ] **Step 1: `docs/sprite-design-system.md`:** retitle the production-art paragraph to "Era 5–9 … thirteen wonders" and list all ids; delete the "other seven TODO(art) wonders" paragraph; fix ~111 ("and `wright-flyer` have one" → the remaining four sprite wonders) and the table at ~296–302 (remove the wright-flyer placeholder row or mark it "production art (#619); canvas fallback only"); fix ~462 (SVG + canvas → PNG + canvas fallback); add this batch's **known gaps against briefs** (whatever Task 2/5 accepted — write them honestly, as #613 did) and the final token count.
- [ ] **Step 2: `.claude/rules/sprites.md`:** section title → "(#613, #619)", "six" → generic wording, step 3 of the recipe: tests now enumerate ids (point to the one list to edit), and note the Wright Flyer precedent: **when a wonder gets production art, delete any legacy `BUILDING_SPRITE_CATALOG` placeholder for it** (guard test in `sprite-catalog.test.ts`).
- [ ] **Step 3: Lifecycle.** Delete this plan and move its manifest entry to `deleted` as `delivered-stale`; `./scripts/dev.sh docs-lifecycle` PASS.
- [ ] **Step 4:** `./scripts/dev.sh verify-impact` and run every listed item. Minimum: `./scripts/check-src-rule-violations.sh src/renderer/wonders src/renderer/sprites/wonders.tsx src/renderer/sprites/sprite-catalog.ts`, `./scripts/run-wonder-regressions.sh`, mirrored renderer/UI tests, `./scripts/dev.sh build`, then full tests (`./scripts/dev.sh test-all` or `yarn test:durable` + `test:durable:status`) — all exit 0. A new test file needs CI-shard allocation (see 5ace792b); editing existing files does not.
- [ ] **Step 5:** `./scripts/sync-main.sh`, `./scripts/push-branch.sh` (timeout 1 800 000 ms), PR body via `./scripts/pr-body.sh` (`Closes #619` is correct for the completing PR; list the seven generation ids, tokens spent/left, known art gaps, the lost motion glints on the seven, and the QA results). Then ccd_pr `get_status` / `bind_pr`.

---

## Self-review

- **Spec coverage:** seven normal-path assets + coherent thumbnails (T2, T3 — thumbnails are the same art via the existing icon entry); Wright Flyer no longer on either placeholder (T3 art in normal path, T4 SVG deleted, canvas draw demoted to fallback); procedural fallbacks tested (T5 route-abort case); visual QA map zoom/mobile/panels/light-dark (T5); provenance/licence/optimised (T1–T3); TODOs and docs reconciled (T4, T6); validation commands (T6).
- **Interpretation to confirm with the owner:** "Wright Flyer no longer uses either placeholder implementation" is read as *normal path uses production art; the building-style SVG is deleted; the canvas drawing remains only as the offline fallback* (same as every #613 wonder, and required by the "fallbacks remain tested" criterion). If the owner wants the canvas drawing replaced too, that is a separate redraw task.
- **Placeholders:** none. Two honest external dependencies: owner confirmation of Sprite-AI terms (T1 Step 2) and owner approval of each image (T2 Step 3).
- **Type consistency:** only existing names are used (`LEGENDARY_WONDER_ART_IDS`, `getLegendaryWonderArtPath`, `BUILDING_SPRITE_CATALOG`, `WrightFlyerSprite`); no new symbols.
- **Risks:** generator drawing fewer elements than briefed (mitigated by silhouette-first prompts, 12 spare tokens); a test elsewhere asserting a now-art wonder has none (T3 Step 5 grep); `BUILDING_SPRITE_CATALOG['wright-flyer']` unexpectedly reachable (T4 Step 1 proves it before deleting); line numbers drift (re-grep before editing).
