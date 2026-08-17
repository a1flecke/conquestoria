# Issue #442 — Espionage missions for eras 5–9: design analysis

Status: **design analysis, pre-spec**. Written fresh against `main` @ `601f5a1f` (2026-08-16), per the
issue's own instruction to re-verify rather than trust the original body or older comments.

## 0. Issue re-audit — what's stale, what's current

The issue body is **stale** on two points, corrected by its own comment thread:

- `digital-surveillance` is **era 10**, not era 5 (moved in MR10, #469). It gates `misinformation_campaign`
  and `satellite_surveillance`... actually no — verified against current code: `digital-surveillance` gates
  **zero missions**. It only affects spy-capture/detection mechanics (`ESPIONAGE_TECH_MAX_SPIES` is not it;
  it's referenced in `canTurnCapturedSpy` and `applyBuildingCI`'s building-fade check, and the threat-board
  `canDetectThreats` gate in `espionage-panel.ts`). The comment claiming it gates those two missions is
  itself wrong — `cold-war-networks` (also era 10) is what gates them, per `STAGE_5_TECHS`.
- **The mission-count plateau is narrower than the issue thread's most recent comment describes.** Two
  missions already shipped into this exact gap in MRs that landed *after* the last issue comment:
  - `flip_loyalty` — gated by `propaganda` (era 6), shipped in commit `c9260673` ("#604 MR2a").
  - `sabotage_relief` — gated by `covert-operations` (era 7), shipped in commit `9c268aa7` ("#526 MR7").

  So the **real remaining gap is eras 5, 8, and 9 — zero new missions each** — not "eras 5–9 uniformly."
  Era 6 and 7 already got one well-built, well-tested new mission apiece from unrelated recent arcs. This
  document does not touch era 6/7's mission set; re-adding there would be redundant work the issue's own
  closing instruction ("re-audit and implement only the remaining gap") tells us to skip.

## 1–5. Current state, verified against code

**Mission ladder by era** (`getAvailableMissions`, `src/systems/espionage-system.ts:375`):

| Era | Gating tech(s) | Missions unlocked | New missions here |
|---|---|---|---|
| 1 | `espionage-scouting` | `scout_area`, `monitor_troops` | — |
| 2 | `espionage-informants` | `gather_intel`, `identify_resources`, `monitor_diplomacy` | — |
| 3 | `spy-networks` or `sabotage` | `steal_tech`, `sabotage_production`, `incite_unrest` | — |
| 4 | `cryptography` or `counter-intelligence` | `assassinate_advisor`, `forge_documents`, `fund_rebels`, `arms_smuggling` | 4 |
| 5 | `black-chambers`, `diplomatic-networks` | *(none)* | **0 — the gap** |
| 6 | `propaganda` | `flip_loyalty` | 1 |
| 6 | `counter-espionage` | *(modifier only — no mission)* | — |
| 7 | `covert-operations` | `sabotage_relief` | 1 |
| 7 | `secret-police` | *(modifier only)* | — |
| 8 | `political-intelligence`, `disinformation-bureau` | *(none)* | **0 — the gap** |
| 9 | `counterintelligence`, `propaganda-campaigns` | *(none)* | **0 — the gap** |
| 10 | `cold-war-networks` | `misinformation_campaign`, `election_interference` | 2 |
| 11 | `satellite-surveillance` | `satellite_surveillance` | 1 |
| 12 | `cyber-intelligence` | `cyber_attack` | 1 |

**Era 5–9 tech effects already wired** (`espionage-modifier-definitions.ts`, all real, all tested):

| Tech | Era | Effect |
|---|---|---|
| `black-chambers` | 5 | +1 spy slot (`ESPIONAGE_TECH_MAX_SPIES`) |
| `diplomatic-networks` | 5 | +20% mission success vs. foreign capitals only |
| `propaganda` | 6 | gates `flip_loyalty` (already a full mission, not just a modifier) |
| `counter-espionage` | 6 | -25% enemy mission success (defense) |
| `covert-operations` | 7 | +2 spy slots, +15% mission success (offense); gates `sabotage_relief` |
| `secret-police` | 7 | -30% enemy success, +10% detection (defense) |
| `political-intelligence` | 8 | +3 spy slots, +10% mission success (offense) |
| `disinformation-bureau` | 8 | -25% enemy success (defense) |
| `counterintelligence` | 9 | -30% enemy success (defense) |
| `propaganda-campaigns` | 9 | *(no `ESPIONAGE_MODIFIERS` row — verified, it currently does nothing beyond being a prerequisite. This is itself a minor content-honesty gap, not part of #442's scope, flagged below as a candidate follow-up.)* |

**Spy units** (`TRAINABLE_UNITS`, `city-system.ts:1209-1213`):

`spy_scout` (era 1, `espionage-scouting`) → `spy_informant` (era 2) → `spy_agent` (era 3, `spy-networks`) →
`spy_operative` (era 4, `cryptography`) → **[8-era plateau, eras 4–11]** → `spy_hacker` (era 12, `cyber-warfare`).
Confirmed: no intermediate unit or `upgradesTo` link exists between era 4 and era 12. This matches the issue.

**AI**: `chooseAiMission` (`basic-ai.ts:1611`) is a personality-ordered preference list over `getAvailableMissions`,
generic and data-driven — no per-mission-ID branch beyond the list itself and one explicit `sabotage_relief`
exclusion (documented as "human-initiated only, future extension"). A second, simpler random-pick path exists
for spies newly stationed inside an infiltrated city (`basic-ai.ts:1306`), with its own exclusion list. AI
target selection (`chooseAiSpyTarget`) uses only relationship/war-state and `MajorCivPerception` (legitimately
known cities) — no hidden-information reads found.

**UI**: `espionage-panel.ts` renders missions grouped into 5 "stages" (a display concept distinct from the
code's tech-gating "stages" — `MISSION_STAGE` is a separate hardcoded map that already absorbed `flip_loyalty`
and `sabotage_relief` into stage 4/5 with a comment explaining the era mismatch is intentional). New missions
need one entry each in `MISSION_LABELS`, `MISSION_STAGE`, and (if they use a duration/base-success) the two
`Record<SpyMissionType, ...>` tables in `espionage-system.ts`.

**Notifications / hot-seat**: `register-espionage-presentation.ts` routes 8 of the ~16 espionage events emitted;
`mission-succeeded`/`mission-failed`/`spy-arrived`/`advisor-assassinated`/`documents-forged`/`spy-expelled`/
`spy-detected`/`spy-promoted` currently have **no notification handler anywhere** (verified — not in `main.ts`,
not in any registrar; this predates the #787 registrar extraction, which moved code verbatim). This is a
pre-existing gap across *all* current missions, not something #442 introduced. The two most recently added
missions (`flip_loyalty`, `sabotage_relief`) both got dedicated `route*` functions in `notification-routing.ts`
that fan out to victim + witnesses — **that's the current best-practice pattern**, and this document's new
missions will follow it rather than the older silent pattern. (The older gap is worth its own follow-up issue;
flagged at the end, out of scope here.)

## 6. What's actually missing vs. merely underpowered

Every era 5–9 tech's *modifier* effect is real and tested (MR12 closed that gap already). What's missing is
strictly **new verbs** — era 5, 8, and 9 have no player-facing action a spy can take that didn't already exist
at era 3–4. The "plateau" a player feels is: research 3 espionage techs across 3 eras, gain only percentage
tweaks to missions they already had. That is exactly the "flat percentage bonuses masquerading as new gameplay"
failure mode the task brief warns against — except it's not a new mistake to avoid, it's the **existing state**
this issue exists to fix.

## 7–8. Reusable mechanics vs. genuinely new state

Systems inventory relevant to candidate mechanics, verified to exist:

| System | File | Reusable for |
|---|---|---|
| Trade routes (`TradeRoute[]`, per-city-pair, `foreignCivId` marks foreign) | `trade-system.ts`, `types.ts:1547` | A **new** target type — no mission currently touches trade routes. Embargo already has a "remove/suppress a route" precedent (`scrubEmbargoedRoutes`). |
| Pending treaty proposals (`state.pendingDiplomacyRequests`) | `diplomacy-system.ts:522` | **Not usable** for AI-vs-AI interception — this queue only holds proposals *to a human* (AI-AI treaties resolve same-turn, no pending state to intercept). Ruled out as a mechanic base. |
| Bilateral relationship penalty | `modifyRelationship` | Already used 3×: `forge_documents` (2 arbitrary civs), `flip_loyalty` (spy's civ + victim, side effect), `sabotage_relief` (witnessed reputation via `crisis-interaction-definitions.ts`). A 4th bilateral-only mission would be a duplicate; a **multilateral** broadcast (one target civ's relationship with *every* civ that has a treaty with them) has no precedent and is a genuine new shape. |
| Unrest injection (`spyUnrestBonus`) | `incite_unrest`, `fund_rebels`, `election_interference` | Already used 3×. A 4th unrest mission for era 8/9 would be the "five differently named reduce-X" trap called out explicitly — **avoid**. |
| Temporary yield/production debuff | `productionDisabledTurns` (cyber_attack), `researchPenaltyTurns/Multiplier` (misinformation_campaign) | Gold-income has no debuff yet, but combining it with a new gold-theft mechanic (below) in the same design would double up on "economy" as the era 8/9 theme — avoid stacking two money mechanics. |
| `feedsFalseIntel` / turned-spy false-intel flag | capture/interrogation system | Already fully used for captured-and-turned spies; not obviously extensible to a new mission without inventing a second false-intel channel. |
| Empire-wide territory vision grant | `satellite_surveillance` → `applySatelliteSurveillance` | A narrower, remote-capable, one-time version (troop positions only, not full territory) is a legitimate era-9 precursor — same shape as `monitor_troops` (single-city radius) generalized to empire-wide, no new persisted state needed (it's a snapshot event, not an ongoing grant). |
| War weariness / war-exhaustion | *(does not exist as a system)* | Ruled out — would require inventing a whole new mechanic outside this issue's scope. |

**Conclusion: 3 new `SpyMissionType` values are justified by real, non-duplicate mechanics reusing existing
state shapes; forcing a 4th or a uniform "2 per era" would mean either duplicating an existing verb (unrest,
bilateral relationship, or economy-debuff) or inventing a disconnected new subsystem.** This directly follows
the brief's "do not assume two missions every era" instruction — the honest count here is per-era zero, two,
zero, zero, one, driven by what's real rather than a template.

## 9. Proposed mission ladder (era 5 gets 2 — it has two clean, distinct anchors already; era 8 and 9 get 1 each)

### Era 5 — `intercept_courier` (courier interception → trade route disruption)

- **Gate**: `black-chambers` (era 5). Reusing an existing gate bucket pattern (own `SABOTAGE_RELIEF_TECHS`-style
  singleton array), not folded into an existing stage.
- **Target**: a foreign city with an active trade route touching it (either endpoint). Requires placed spy
  (thematically it's a physical interception, matches the existing placed-spy missions of similar tier).
- **Effect (as implemented, refined from the original plan below)**: picks the highest-`goldPerTrip` active
  route touching the target city and **removes it outright**, reusing `trade-system.ts`'s existing
  `removeRouteById` — the exact function embargo/war-declaration already call to sever a route, extended with
  one new `reason: 'espionage'`. This turned out cleaner than the `disabledUntilTurn`-field plan below: **zero
  new persisted state**, 100% mechanic reuse, and a real analog to a courier physically not arriving (the
  route is gone, not paused) rather than a novel "disabled" status nothing else in the codebase has. Losing
  one route (of up to 6 a city can support) is bounded and recoverable — the caravan unit itself survives and
  can re-commit to a new route, same as it does today after an embargo severs its route.
  *(Original plan, superseded once the embargo precedent was found during implementation: a new optional
  `TradeRoute.disabledUntilTurn?: number` field that trade-income processing would skip over for N turns.
  Kept here per spec-fidelity's "note the deviation" guidance rather than silently editing history.)*
- **Why new**: no existing mission touches `MarketplaceState.tradeRoutes`. Distinct target type from every
  other mission (a route, not a city/civ/advisor).
- **Counterplay**: target sees an immediate, visible gold-per-turn drop and a routed notification naming the
  severed route (`espionage:courier-intercepted`, both sides notified); can send a new caravan to re-establish
  trade at any point — no cooldown beyond the normal cost of building/routing a fresh caravan;
  `counter-espionage`/`secret-police`/`disinformation-bureau` all still apply as normal defense modifiers to
  the mission's success roll itself. No eligible route (city has no active trade) means no effect — natural
  counterplay for civs that don't trade through that city.
- **AI story**: aggressive/mercantile-leaning personalities value routes with higher `goldPerTrip`; slot into
  `chooseAiMission`'s existing preferred-order arrays (no ID-branch, just another array entry). AI never reads
  route data the player couldn't also see (routes are public state, not fog-gated).

### Era 5 — `bribe_official` (bribery → direct treasury theft)

- **Gate**: `diplomatic-networks` (era 5) — its own existing "+20% success in capitals" modifier makes capitals
  the natural high-value target for a bribery mission; thematically coherent pairing, not a forced anchor.
- **Target**: any foreign civ (city required for spy placement, per the placed-spy convention).
- **Effect**: transfers a bounded amount of the target's current gold treasury to the acting civ (e.g.
  `min(targetGold * 0.15, cap)`). This is the **first** mission that moves a resource between civs rather
  than only revealing or disrupting — genuinely new verb.
- **Why new**: `gather_intel` reveals treasury; nothing currently *moves* gold between civs via espionage.
- **Counterplay**: capped both as a fraction and an absolute amount so it can't cripple a civ in one hit
  (mirrors the "never permanently cripple a city/civ from one action" balance rule); visible to victim via
  a routed notification with the exact amount lost; diplomatic relationship penalty on discovery-equivalent
  (treat capture/expulsion exactly like existing missions — no special-cased leniency).
- **AI story**: personality-weighted toward `aggressive`/`trader` traits (gold-seeking); AI only targets
  civs whose treasury it can legitimately observe having spied on before, or uses the same `chooseAiSpyTarget`
  relationship-based targeting already in place (no new hidden-info read — the mission doesn't require
  pre-knowledge of the exact amount, only eligibility).

### Era 9 — `signals_intercept` (signals interception → empire-wide troop snapshot)

- **Gate**: `counterintelligence` (era 9) — codebreaking fits its "defensive intelligence" theme applied
  offensively; a legitimate stretch but no worse a fit than `covert-operations` gating `sabotage_relief`.
- **Target**: a foreign civ (not a specific city) — **remote-capable**, added to the existing
  `missionRequiresPlacedSpy` exclusion list alongside `cyber_attack`/`misinformation_campaign`/
  `satellite_surveillance` (all "digital/remote" era 10+ missions; era 9 becomes the first non-digital
  remote mission, which needs an explicit one-line justification in-code, not just precedent-by-proximity).
- **Effect**: one-time snapshot of all the target civ's unit types/positions/health empire-wide (reuses
  `monitor_troops`'s existing `nearbyUnits` result shape, generalized from a single city's radius to the
  whole civ) — no new persisted state, it's an immediate intel event like `gather_intel`.
- **Why new**: `monitor_troops` is capped to a 4-hex radius around one city; nothing currently gives a
  point-in-time empire-wide military snapshot. Distinct from `satellite_surveillance` (era 11), which grants
  an *ongoing* territory-vision window, not a one-shot unit list.
- **Counterplay**: one-shot (not an ongoing leak, unlike satellite surveillance) — the target's dispositions
  change the next turn, so its value decays fast. Same detection/capture risk as any mission of its tier.
- **AI story**: primarily useful pre-war — aggressive personalities prioritize it against civs they're
  already hostile toward or at war with, reusing `chooseAiSpyTarget`'s existing relationship scoring.

### Era 8 — `expose_scandal` (political intelligence → multilateral reputation broadcast)

- **Gate**: `disinformation-bureau` (era 8) — thematically the mirror image of that tech's existing
  "-25% enemy success" defense: this mission is the offensive act it's presumably meant to defend against
  (a genuine two-sided fit, one tech gating both the sword and the shield is a defensible pattern already
  used implicitly elsewhere in the file, e.g. `secret-police` defends what `covert-operations`/`propaganda`
  enable offensively).
- **Target**: a foreign civ. Placed-spy (this is "uncovered secret documents," not remote signal-breaking).
- **Effect**: for every *other* major civ that currently has an active treaty with the target, apply a
  bounded relationship penalty (proposed −10, below `forge_documents`'s −25 since it's spread thinner and
  the "victim" here didn't do anything wrong, they were just exposed) between the target and each of those
  treaty partners. The acting civ's own relationship with the target is *not* directly touched by this
  mission (no free diplomatic upside beyond the strategic value of weakening their alliances) — keeps it
  from being strictly-better than `forge_documents` in every situation, preserving "not always optimal."
- **Why new**: every existing relationship-affecting mission is bilateral (exactly 2 parties). This is the
  first N-ary one. Reuses `modifyRelationship` in a loop — no new primitive, just a new *shape* of use.
- **Counterplay**: bounded per-partner penalty, capped total partner count (propose capping at 4 affected
  pairs so a maximally-connected civ doesn't get devastated in one mission — matches the "avoid indefinite
  stacking" and "no crippling from one action" rules); visible via a routed notification naming which
  relationships soured; a civ with no treaties is simply not a valid/valuable target (natural counterplay:
  isolationist civs are immune).
- **AI story**: diplomatic/trader-trait AI values this against well-connected rivals (many treaties = juicier
  target); needs a cheap "does target have ≥1 treaty" eligibility check before offering it as a `chooseAiMission`
  candidate, otherwise AI wastes turns targeting isolated civs (same shape as `fund_rebels`'s existing
  `unrestLevel === 0` eligibility guard in `resolveMissionResult`).

## 10. Spy-unit plateau — recommend **deferring to a follow-up**, not bundling

Reasoning:
- The mission-ladder work above already touches `espionage-system.ts`, `espionage-panel.ts`,
  `basic-ai.ts`, `notification-routing.ts`, `tech-definitions-eras5-7/8/9.ts`, plus full test coverage
  per mission (unlock gating, positive/negative success, AI, hot-seat, save/load where stateful). That's
  a full, reviewable, independently-mergeable slice on its own.
- A new spy unit requires the *full* end-to-end wiring checklist from `end-to-end-wiring.md` (definition,
  description, renderer icon, `TRAINABLE_UNITS` + tech `unlocksUnits`, `PRODUCTION_ICONS`, AI candidate
  classification in `ai-production.ts`/`ai-unit-roles.ts`, sprite via the v2 SVG pipeline, SFX, upgrade-chain
  `obsoletedByTech`/`upgradesTo` correctness) — a comparable amount of work to the entire mission ladder,
  for a mechanically separate problem (unit stats/promotion economy, not mission variety).
- Bundling both turns this into exactly the "oversized release" the brief warns against, and this session's
  established preference is incremental, reviewable slices over batched delivery.
- The plateau is real but *secondary* to the issue's primary ask (missions) — the issue title is "Add
  era-appropriate espionage missions," and the unit plateau is presented as an "also" in the issue body.

**Recommendation: ship the mission ladder as this arc; open a follow-up issue for 1–2 intermediate spy units
(era 7–9, per the original issue's own suggestion) once this lands**, so it gets the same full design-analysis
treatment rather than being rushed as a bolt-on.

## Non-goals / explicitly out of scope for this arc

- Era 6/7's existing `flip_loyalty`/`sabotage_relief` missions are not touched or expanded.
- `propaganda-campaigns` (era 9) having no modifier row is a pre-existing content-honesty gap, not
  introduced or worsened here — flagged as a candidate follow-up, not fixed inline (fixing it is unrelated
  to adding new missions and would blur this PR's scope).
- The pre-existing silent-notification gap for `mission_succeeded`/`mission_failed`/etc. on *all* current
  missions (not just new ones) is not fixed here — new missions get routed notifications (current best
  practice); retrofitting old missions is a separate, larger follow-up.
- No changes to barbarian/beast/crisis/combat/fortification/world-pressure systems (per the #547 overlap
  constraint) — none of the three proposed missions touch those systems.

## Save/schema impact

All three new missions need **zero new persisted state**. `intercept_courier` (as implemented) reuses
`removeRouteById` — no new field, no schema-relevant change at all. `expose_scandal` and `signals_intercept`
are broadcast/snapshot effects, not ongoing. `bribe_official` mutates plain existing `Civilization.gold`.
**No `CURRENT_SAVE_SCHEMA_VERSION` bump.** Mid-mission save/load already works generically through
`SpyMission`/`Spy` — no new fields needed there since none of these missions need custom in-flight mission
state beyond `targetCivId`/`targetCityId`.

## Phase 1 status (2026-08-16)

`intercept_courier` and `bribe_official` (era 5) are **implemented on this branch** — see
`src/systems/espionage-system.ts`, `src/core/turn-manager.ts` (route-removal glue), `src/ai/basic-ai.ts`,
`src/ui/espionage-panel.ts`, `src/ui/notification-routing.ts` +
`src/presentation/register-espionage-presentation.ts`, and `src/systems/tech-definitions-eras5-7.ts` (unlock
text). Full test coverage added across `tests/systems/espionage-system.test.ts`, `tests/ai/ai-espionage.test.ts`,
`tests/core/turn-manager.test.ts` (genuine `processTurn` end-to-end wiring proof), `tests/ui/espionage-panel.test.ts`,
`tests/presentation/register-espionage-presentation.test.ts`, and `tests/ui/notification-routing.test.ts`.
`yarn build` and `yarn test` both green (491 files / 8110 tests passing) at the time this phase closed.

`expose_scandal` (era 8) and `signals_intercept` (era 9) are **implemented on branch
`claude/era-8-9-espionage-missions`** (Phase 2, off updated `main` after Phase 1 merged as `4ada9123`).

## Phase 2 status (2026-08-17)

Implemented in `src/systems/espionage-system.ts`, `src/ai/basic-ai.ts`, `src/ui/espionage-panel.ts`,
`src/ui/notification-routing.ts` + `register-espionage-presentation.ts`, and
`tech-definitions-eras8.ts`/`tech-definitions-eras9.ts` (unlock text — also fixed a pre-existing dishonest
claim on `disinformation-bureau`, "state disinformation weakens foreign loyalty," which named a mechanic that
never existed; replaced with the real `expose_scandal` effect it now gates).

**One deviation worth flagging**: implementing `signals_intercept` surfaced a real, pre-existing "dead computed
data" bug (`end-to-end-wiring.md`: "if you compute data ... it MUST be rendered") — `resolveMissionResult`'s
per-mission result payload (`nearbyUnits`, `resources`, tech progress, etc.) for every purely-informational
mission (`monitor_troops`, `gather_intel`, `identify_resources`, `monitor_diplomacy`) is returned in the
`espionage:mission-succeeded` bus event, but that event has **no notification-registrar handler anywhere** —
so none of those missions' results were ever actually shown to the player before this MR. `signals_intercept`
would have shipped straight into the same dead end. Fixed for this new mission only (not retrofitted onto the
four pre-existing ones, which is a separate, larger follow-up): added `EspionageCivState.signalsIntelligence`
(a small persisted per-target snapshot, additive optional field, no schema bump) and a new "Signals
Intelligence" panel section that actually renders it. Flagged the four pre-existing dead-end missions as a
follow-up (see spawned task).

`expose_scandal` is the first multilateral (non-bilateral) relationship-affecting mission — implemented as
designed above (−10 per partner, capped at 4 partners, target's relationship with the *acting* civ untouched).
`signals_intercept` is remote-capable as designed, with the non-digital-remote-mission justification recorded
inline in `missionRequiresPlacedSpy`.

Full test coverage mirrors Phase 1's structure: gating, `resolveMissionResult` unit tests (including the
partner-cap and minor-civ-exclusion edge cases for `expose_scandal`), `processEspionageTurn` end-to-end
resolution tests, AI preference tests, notification-routing tests (the first 4-recipient routing test in the
file), hot-seat privacy (another civ's `signalsIntelligence` snapshot never leaks into the current player's
panel data), and UI catalog coverage. `yarn build` and `yarn test` both green (491 files / 8135 tests) at the
time this phase closed.

**Post-implementation review (2026-08-16) found and fixed one real gap**: the mission catalog UI showed only a
label, stage tag, and access tag for every mission — no plain-language effect description or duration anywhere,
for any of the 21 mission types, not just the two added here. This violated CLAUDE.md's "all UI elements must
be self-explanatory" rule and the established world-pressure-interaction precedent ("cost, effect, and risk
inline at the point of choice... a 7-year-old should understand the trade from the button alone" —
`docs/superpowers/specs/2026-07-11-world-pressure-symmetry-design.md`). Fixed by adding a
`MISSION_DESCRIPTIONS: Record<SpyMissionType, string>` table and a duration tag, covering the full existing
catalog (not just the two new missions) so descriptions don't appear inconsistently between old and new
entries — one data table, no architecture change. Covered by new tests in `tests/ui/espionage-panel.test.ts`.
