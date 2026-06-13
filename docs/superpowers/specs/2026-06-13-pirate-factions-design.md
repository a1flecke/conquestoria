# Pirate Factions Design

**Issue:** [#353](https://github.com/a1flecke/conquestoria/issues/353)
**Date:** 2026-06-13
**Status:** Approved design

## Purpose

Add persistent, era-aware pirate factions that threaten naval trade and coastal economies through patrols, raids, blockades, tribute demands, coastal enclaves, mobile deep-sea flotillas, and final-era proxy contracts. Pirates must remain understandable, counterable, historically recognizable, save-compatible, and fully represented in the live UI, renderer, animation, and audio paths.

This is the full issue scope. Pirates are not a thin naval reskin of barbarians and are not a reason to build a generic hostile-faction framework.

## Design Principles

- Piracy is a recurring maritime pressure, not a one-time map cleanup problem.
- Players must see and understand a threat before suffering major consequences.
- Pirate technology follows maritime capability; pirate behavior follows success and notoriety.
- Older ships remain in service for a time, but implausibly ancient hulls retire from modern fleets.
- Every mutation has one canonical system path used by players, AI, and turn processing.
- Viewer-scoped intelligence must never reveal information the viewer has not earned.
- Production visuals and sounds are part of the feature, not optional polish.
- No temporary placeholder may remain open when the overall implementation plan finishes.

## Architecture

Use a dedicated, definition-driven pirate domain with small modules and canonical interfaces:

- `pirate-definitions.ts`: balance constants, maritime stages, fleet rosters, behavior thresholds, tribute costs, spawn limits, and presentation metadata.
- `pirate-system.ts`: thin deterministic completed-round coordinator that returns updated state and typed transition events.
- `pirate-ecology.ts`: pressure, scheduled spawn checks, habitat scoring, faction caps, covert anchorages, and regional suppression.
- `pirate-behavior.ts`: patrol, raid, blockade, escort detection, target selection, and flotilla relocation.
- `pirate-actions.ts`: tribute, contracts, enclave assaults, and idempotent faction destruction.
- `owner-kind.ts`: shared authoritative owner classification for major civilizations, minor civilizations, barbarians, rebels, beasts, and pirates. Combat, rewards, movement safety, turn cleanup, AI, UI, and rendering must use this boundary instead of ad hoc string checks.
- `pirate-presentation.ts`: viewer-scoped names, intelligence, map presentation, action availability, and disabled reasons.
- `pirate-notifications.ts` and listeners: typed, viewer-scoped notification routing and hot-seat queuing.
- `pirate-audio-director.ts`: viewer-filtered strategic pirate cues; ordinary unit combat remains in `SfxDirector`.

`turn-manager` makes one call into the pirate coordinator. It must not absorb pirate-specific decision logic.

## State Model

`GameState.pirates` is a versioned serializable plain object containing:

- `version`
- `factions: Record<PirateFactionId, PirateFactionState>`
- `history`, containing immutable destruction and contract-resolution summaries needed by notifications and the Pirate Waters history view
- `pressure`, including capped accumulated pressure and regional suppression records
- `intelByCiv`, stored at the exact granularity earned by each viewer
- `nextSpawnCheckTurn`
- migration activation and warning-delivery markers

Pirates use the existing global unit ID counter and add `nextPirateFactionId` to `IdCounters`. Save repair scans active and historical `pirate-{n}` IDs before allocating a new faction. The generic save-backed notification log adds `nextNotificationId` to the same counter object.

Pirate notifications do not create a second notification subsystem. Serializable notification types and append/read helpers move to a distribution-neutral core module, and `GameState.notificationLog` becomes the single viewer-scoped source of truth for the existing notification panel and pirate events.

Each pirate faction has a distinct `pirate-*` owner ID and contains:

- identity and generated name
- behavior tier: `patrolling | raiding | blockading`
- maritime stage: `1 | 2 | 3 | 4 | 5`
- capped notoriety
- owned ship IDs
- headquarters
- tribute protection and demand cooldowns by civilization
- optional active proxy contract
- current raid or blockade intent
- transition guards needed for replay-safe events

Headquarters are a discriminated union:

```ts
type PirateHeadquarters =
  | {
      kind: 'coastal-enclave';
      position: HexCoord;
      integrity: number;
      maxIntegrity: number;
    }
  | {
      kind: 'deep-sea-flotilla';
      flagshipUnitId: string;
      relocation: PirateRelocationState;
    };
```

Ship health remains canonical unit health. Coastal enclave integrity is canonical headquarters health. Flotilla headquarters damage derives from flagship health.

Pirate owners are not civilization records. They have no technology tree, city list, treasury, upkeep, diplomacy row, score entry, victory eligibility, or player-turn slot. Pirate victories receive no ordinary civilization treasury reward; pirate plunder and notoriety are resolved by the pirate system. Major and minor civilization combat units may attack pirate units without a war declaration. Pirates deliberately target major-civilization naval units and coastal economies, never capture cities, and never become selectable diplomacy partners.

Pirate lifecycle, raid, blockade, tribute, contract, relocation, intelligence, and destruction transitions use typed game events. Pirate attacks do not emit `diplomacy:war-declared`. Every spawned pirate unit emits the existing `unit:created` event so sprite and SFX type caches remain correct; combat and destruction events originate from the canonical mutation result rather than a scan of final state.

## Activation And Spawning

Piracy activates only after any major civilization completes `Galleys`. This guarantees that naval counterplay exists before pirates enter play.

Faction caps are shared across both headquarters types:

| Map size | Maximum factions |
|---|---:|
| Small | 3 |
| Medium | 4 |
| Large | 5 |

At most two active factions may use deep-sea flotilla headquarters.

Spawn checks occur every four completed rounds and may create at most one faction per check. Activation seeds pressure at `4`. Each scheduled check adds:

- `2` base pressure;
- `maritimeStage - 1` pressure;
- up to `2` pressure from active trade routes with at least one coastal-city endpoint;
- up to `2` pressure from major-civilization coastal cities with projected gross gold of at least `8`.

The spawn threshold is `6`. A successful spawn spends `6` pressure. Pressure is capped at `18`, so repeated no-site checks preserve urgency without unbounded save growth. Ungoverned regions affect habitat scoring rather than duplicating global pressure. If no legal headquarters site exists, pressure remains capped and the system retries at a later scheduled check; it never force-spawns.

Destroying a headquarters creates eight completed rounds of regional suppression in a wrap-aware eight-hex radius centered on the destroyed headquarters. This lowers local eligibility but does not remove piracy globally.

### Coastal Enclave Eligibility

An enclave anchor is a legal non-city land tile adjacent to navigable coastal water. The landmark may visually occupy the shoreline and nearby water, but its canonical coordinate is the land anchor and naval assault occurs from an adjacent water tile.

Unclaimed coastline is preferred. Ownership alone does not make a claimed coast invalid. A covert anchorage may appear on claimed coast only when all are true:

- no city lies within four hexes;
- the exact tile is not currently visible to the owner;
- no major-civilization combat unit lies within three hexes;
- terrain and access rules make it a legal coastal headquarters site.

The owning civilization receives delayed suspected-region intelligence, not the exact tile.

### Headquarters Selection

Coastal enclaves and mobile flotillas are parallel ecology choices, not primary and fallback modes. A seeded weighted selector chooses between eligible habitats. Both may coexist, subject to the shared cap and two-flotilla limit.

Stage 1 supports coastal enclaves only. Stage 2 unlocks deep-sea flotillas because `Navigation` is the first capability that makes an ocean headquarters and its player counterplay coherent. A flotilla anchor must be an unoccupied ocean tile at least five hexes from every city and eight hexes from another pirate headquarters. Its relocation path must remain on ocean tiles. Habitat scoring prefers unclaimed anchors, no major-civilization combat unit within four hexes, distance from cities, and distance from existing pirate headquarters. All distances use the map's wrap-aware helpers.

When both habitat pools are legal, the seeded habitat draw uses weight `3` for coastal enclaves and `2` for flotillas. A habitat with no legal candidates has zero weight, and the two-flotilla cap forces flotilla weight to zero. Site selection within the chosen habitat is seeded and weighted by the documented scoring inputs; equal scores break by stable coordinate order before the seeded draw.

## Maritime Progression And Units

Pirate maritime stage follows the highest completed maritime capability held by any major civilization:

| Stage | Trigger | New current hull |
|---|---|---|
| 1 | `Galleys` | Pirate Galley |
| 2 | `Navigation` | Corsair/Xebec |
| 3 | `Triremes` | Pirate Frigate |
| 4 | `Caravels` | Ironclad Raider |
| 5 | `Amphibious Warfare` | Rogue Flotilla, Fast Attack Craft, Pirate Mothership |

Add six dedicated, non-trainable `UnitType`s:

- `pirate_galley`
- `pirate_corsair`
- `pirate_frigate`
- `pirate_ironclad`
- `pirate_fast_attack_craft`
- `pirate_mothership`

They must be present in unit definitions, descriptions, fallback rendering, sprite catalogs, animation classification, and SFX catalogs, but absent from `TRAINABLE_UNITS` and technology unlock arrays. The repository's hostile-unit rule and coverage test must explicitly permit zero-cost `pirate_*` units owned by `pirate-*`, alongside the existing beast exception, rather than weakening validation for ordinary trainable units.

Every reinforcement fleet guarantees one current-stage hull. Remaining ships use deterministic weighted draws from the current and previous two stages. Existing ships never auto-upgrade. Stage 5 retires galleys and corsairs; modern fleets use fast attack craft, mothership support, ironclads/steel patrol craft, and aging frigates.

Fleet limits:

- Patrolling: 1-2 ships
- Raiding: 2-3 ships
- Blockading: 3-4 ships

## Behavior, Targeting, And Escalation

Notoriety increases by one for a successful coastal raid or transport kill, capped at one activity point per completed round. A surviving faction also gains one notoriety at completed-round age milestones `8, 16, 24, ...`; this survival gain is independent of the activity cap but occurs at most once in a round. This preserves historical growth when piracy goes unchecked without replacing success-driven escalation.

- Raiding begins at notoriety 2.
- Blockading begins at notoriety 5 and requires maritime stage 2 or later.
- Tiers never demote. Losses slow escalation by preventing successful activity.

Economic and movement target priority is:

1. Unescorted transports
2. Eligible coastal cities for adjacency raids and blockades, never city combat or capture
3. Other hostile naval units
4. Escorted transports, only while blockading

A transport is escorted only when a friendly combat-capable naval unit occupies the same tile or an adjacent tile. Tests must prove that proximity without naval combat capability is insufficient.

Pirates must not deliberately target, path toward, blockade, or reinforce against a civilization currently protected by tribute from that faction. Pirate units do not become friendly and do not grant passage.

Pirate unit attack profiles target units only. City-adjacent economic raids are explicit pirate actions and must not route through city-capture or city-combat code. `owner-kind.ts` defines pirates as always-hostile attack targets without treating them as major civilizations or requiring diplomacy state.

## Raids And Blockades

A faction resolves at most one economic raid per completed round. A valid economic raid requires either:

- a pirate ship ending adjacent to an eligible coastal city; or
- destruction of a transport belonging to the victim.

Maximum plunder by maritime stage is `5 / 8 / 12 / 16 / 20` gold, capped by available treasury. The design does not invent invisible ocean paths for the current abstract trade-route model.

A coastal city is blockaded only when all are true:

- the pirate faction is Tier 3;
- at least two ships from that faction are within two hexes;
- at least one of those ships is adjacent to the city;
- the city owner is not protected by tribute from that faction.

Coastal-city eligibility uses the city center's adjacency to navigable water, not the presence of an arbitrary water tile elsewhere in `ownedTiles`.

Blockade effects do not stack:

- trade routes involving that city produce no income;
- that city's gold yield is reduced by 25%;
- food and production are unaffected.

The blockade ends immediately when any required condition becomes false, including ships being driven away, faction destruction, tribute payment, or a contract redirecting the faction.

## Headquarters Combat And Movement

### Coastal Enclaves

Enclaves have integrity from 0 to 100. Because the canonical anchor is land, an enclave is exposed only when no surviving ship owned by that pirate faction is adjacent to the anchor. A major-civilization combat-capable naval unit on an adjacent water tile may then spend its action assaulting the enclave. The UI must show the deterministic damage and counterfire preview before confirmation. Raiding and Blockading enclaves counterfire once per assault through a definition-backed headquarters attack profile; Patrolling enclaves do not counterfire. Integrity reaching zero calls the canonical faction-destruction helper.

### Deep-Sea Flotillas

The headquarters is linked to a named flagship unit. Sinking the flagship calls the same canonical faction-destruction helper.

Stage 2-5 flotillas attempt relocation every four completed rounds:

- direction is planned and viewer-scoped one completed round before movement;
- relocation is blocked if the flagship was attacked after the plan was formed or a hostile combat-capable naval unit is adjacent when the pirate phase begins;
- movement follows a legal contiguous ocean path of two to four hexes and never teleports;
- the flagship and eligible nearby escorts relocate as a formation to distinct legal tiles; relocated ships spend their movement and action for that pirate phase;
- tracked viewers see intended direction one round in advance;
- untracked viewers receive no destination or direction leak.

If formation placement fails, the move is cancelled rather than splitting, stacking, or force-placing the fleet.

## Tribute

Tribute costs are predictable and definition-driven:

| Behavior | Base cost |
|---|---:|
| Patrolling | 15 |
| Raiding | 30 |
| Blockading | 50 |

Add `0 / 5 / 10 / 15 / 20` by maritime stage. Demands begin only when the targeted civilization has positive projected income. Payment cannot create debt and may remain temporarily unaffordable.

Tribute lasts 15 completed rounds for that faction only; the save uses the canonical completed-turn counter and the UI consistently says `rounds`. Payment immediately cancels unresolved raids and blockades against the payer. Already resolved losses are not reversed. Protection ends immediately if the payer attacks that faction. Tribute and hiring the same faction are mutually exclusive.

Each faction/civilization pair has at most one active demand. A demand remains actionable from the dossier while valid, but its reminder notification has an eight-round cooldown so persistent piracy does not become notification spam.

## Era 5 Proxy Contracts

Only Stage 5 deep-sea-flotilla factions may be hired. A valid rival target is a living, known major civilization other than the employer for which the employer has earned sighting information for at least one coastal city or naval unit. This prevents the action from disclosing hidden civilizations or hidden coastal geography. A contract:

- lasts eight completed rounds;
- has one employer and one selected rival target;
- costs twice the faction's current tribute price;
- gives the employer no direct control over pirate units;
- creates no formal war;
- redirects pirate targeting toward the target's naval trade and coastal economy;
- rolls one deterministic 25% exposure check per successful contract raid;
- on exposure, identifies the employer and records a `-30` relationship event for the target against the employer;
- ends if the faction, employer, or target is eliminated.

No automatic war or global diplomacy penalty is applied.

## Completed-Round Order

Pirates process once per completed game round after trade-route advancement but before final economy settlement:

1. Normalize expired tribute, contracts, stale targets, and transition guards.
2. Resolve any telegraphed flotilla relocation that remains legal. Relocated units spend their pirate-phase movement and action.
3. Reset eligible pirate units, then move and attack through canonical unit and combat helpers.
4. Record transport kills and final pirate positions from the mutations that actually occurred.
5. Derive at most one economic raid per faction and all current blockades from those final facts.
6. Apply plunder and inject blockade modifiers into the pending economy projection.
7. Advance notoriety, behavior tiers, and maritime-stage reinforcement.
8. Update pressure and suppression, then run the scheduled spawn check when due.
9. Refresh viewer-scoped intelligence and emit typed transition events from explicit before/after facts.
10. Continue ordinary economy settlement with pirate consequences included.

This order prevents raids from being evaluated against stale pre-movement positions, prevents a fleet from both relocating and taking a normal action with the same ships, and keeps blockade markers and economic effects synchronized in the same round.

All randomness derives from game identity, completed round, faction ID, and event purpose. Pirate logic must not use `Math.random()`.

## Canonical Destruction

One idempotent helper destroys a pirate faction regardless of caller. It:

- removes or resolves the headquarters;
- removes or neutralizes faction-owned units as defined;
- terminates tribute, raids, blockades, and contracts;
- awards a destroying major civilization a headquarters bounty of `10 / 25 / 45` gold by behavior tier plus `5` gold per maritime stage; non-major autonomous destroyers receive no treasury bounty;
- records rewards and regional suppression;
- updates history and intelligence;
- emits each transition exactly once.

Player combat, AI combat, enclave assault, and turn-loop combat must all use this helper.

## Pirate Waters UI

After first pirate contact, a durable `Pirate Waters` affordance opens the authoritative management surface. Desktop uses a side panel and mobile uses a bottom sheet.

The panel lists every faction the viewer has discovered. Selecting a faction opens its dossier without hiding the list. It is reachable from:

- map selection;
- the Pirate Waters affordance;
- pirate notification `Review` actions.

### Intelligence Levels

- `Rumored`: approximate region and warning only, earned from a delayed covert-spawn report or a grouped regional piracy event.
- `Sighted`: earned when any pirate ship or headquarters becomes visible; only the observed entity, its last-seen position, and round are stored.
- `Observed`: earned when the headquarters is currently visible; headquarters type, current behavior, integrity or flagship health, and currently visible ships may be shown.
- `Tracked`: earned when the headquarters or flagship remains visible while a relocation plan or raid target is formed; the stored direction or target expires with that plan and is never inferred from live hidden state.

Unknown exact location, fleet composition, health, behavior, and tier remain hidden. Player-facing terms are `Patrolling`, `Raiding`, and `Blockading`, not unexplained tier numbers.

### Dossier

The dossier shows only earned information and may expose:

- faction name and behavior;
- maritime stage;
- headquarters type, status, and last-seen turn;
- known fleet composition;
- raid target, blockade effects, or relocation countdown;
- tribute protection and duration;
- available actions and exact disabled reasons.

Actions are:

- `Focus headquarters`
- `Pay tribute`
- `Hire flotilla`, Stage 5 deep-sea flotillas only
- `Focus known raid target`, only when target intelligence has actually been earned
- contextual headquarters-destruction guidance

Every action revalidates current state through canonical helpers. Paid actions require confirmation and are replay-safe. Failure leaves state unchanged, explains the reason, and refreshes the open panel immediately.

## Notifications And Hot Seat

Toasts are concise and informational; economic actions do not live inside transient toasts.

Pirate notifications persist as typed, save-backed, viewer-scoped entries containing stable IDs and semantic references such as faction ID and event kind, never stale callbacks. Opening an entry resolves current state and action availability again. Destroyed-faction entries resolve against immutable pirate history, so a notification never becomes a dead button merely because the active faction record was removed.

These records live in the generic `GameState.notificationLog` alongside existing notifications. The current in-memory notification list is replaced, not shadowed. Hot-seat `pendingEvents` remains the delivery queue; the persistent log is the viewer-scoped history surface.

Routine events are grouped once per faction per completed round. Tribute demands, active blockades, headquarters destruction, and contract exposure remain individually visible. Hot-seat events are queued only for their intended viewers and must not leak outgoing-player intelligence or audio.

Notification controls use semantic buttons with accessible labels and visible focus states. `Review` opens Pirate Waters on the referenced active faction or historical record. The close control is a real button. The Warchief and Treasurer may surface first-sighting, blockade, and unaffordable-demand advice through existing advisor plumbing, with per-viewer cooldowns and no hidden-location details.

## Player Truth Table

| Before | Action | State change | Immediate visible result | Must remain reachable |
|---|---|---|---|---|
| Faction demands tribute | Confirm `Pay tribute` | Treasury decreases; protection starts; pending raid/blockade cancels | Cost, protection duration, map hostility, blockade marker, and actions refresh | Faction dossier and history |
| Tribute button is stale | Click `Pay tribute` | None | Inline failure reason and refreshed cost/status | All other dossier actions |
| Valid Stage 5 flotilla | Confirm `Hire flotilla` | Contract begins; targeting redirects | Contract target, duration, risk, and unavailable tribute state refresh | Contract history and faction list |
| Known headquarters | Click `Focus headquarters` | Camera only | Camera centers on exact visible or last-seen position with correct label | Dossier remains reopenable |
| Rumored enclave | Click region focus | Camera only | Camera centers on approximate region without revealing a tile | Rumor entry and dossier |
| Blockaded city | Open faction dossier | None | Responsible faction, conditions, and exact city-local losses appear | City panel and all factions |
| Enclave defenders cleared | Assault enclave | Unit action spent; integrity changes | Integrity, damage art, combat feedback, and button availability refresh | Combat preview and dossier |

## Misleading UI Risks

- `Tracked` must not appear from a sighting alone; direction or target intelligence must actually be earned.
- `Blockading` must not appear unless every blockade condition is currently true.
- `Protected` must not imply friendly units, safe passage, or protection from other pirate factions.
- `Hire flotilla` must remain hidden outside Stage 5 deep-sea flotillas and disabled when no known valid rival exists.
- `Focus headquarters` must distinguish current visibility from last-seen or suspected information.
- Fleet composition must never include ships observed only by another hot-seat player.

Negative UI tests must prove every boundary above.

## V2 Sprite And Renderer Contract

### Coverage

Production v2 assets are required for:

- all six pirate unit types;
- five coastal-enclave stage foundations;
- four deep-sea-flotilla stage compositions for Stages 2-5;
- three reusable enclave behavior overlays: hidden, fortified, stronghold;
- shared wake, smoke, fire, cannon, debris, flag, blockade, and relocation layers.

Add `landmark` as a first-class `SpriteEntity` kind with a dedicated `PIRATE_HEADQUARTERS_SPRITE_CATALOG`. Enclaves must not masquerade as city buildings or improvements.

Pirates use one neutral outlaw visual family: weathered timber, oxidized metal, patched canvas, soot, signal red, bone-white markings, and the shared ink/material language. Civilization palettes do not recolor pirates.

### State Channels

Sprite state uses independent attributes:

- `data-state="idle | walk | attack | hurt | death"`
- `data-mode="patrol | raid | blockade | relocating"`
- `data-damage="0 | 1 | 2 | 3"`
- `data-tier="1 | 2 | 3"`
- `data-stage="1 | 2 | 3 | 4 | 5"`

A sprite-state controller consumes typed movement, combat, blockade, relocation, and destruction events. One-shot states expire deterministically and return to the persistent mode.

### Damage

Use shared thresholds:

- 0: 76-100
- 1: 51-75
- 2: 26-50
- 3: 1-25

Every unit and headquarters sprite contains explicit `.cq-damage-1`, `.cq-damage-2`, and `.cq-damage-3` structural groups. Torn sails, broken oars, breached hulls, collapsed docks, missing armor, disabled radar, listing, and debris must communicate damage. Smoke alone is insufficient.

### Animation

Every unit supports idle, movement, attack, hurt, and death. Required class-specific motion includes:

- galley oars and ram/boarding surge;
- corsair sail flex and boarding surge;
- frigate broadside recoil and rolling smoke;
- ironclad engine wake, exhaust, and heavy recoil;
- fast attack craft bow lift, engine wake, and short weapon burst;
- mothership slow roll, crane/boat motion, diesel exhaust, and sinking;
- enclave flags, surf, cranes, defensive fire, and collapse.

Blockade animation is restrained and cannot flash continuously. Deterministic phase offsets prevent synchronized loops.

Moving units remain in the DOM overlay using interpolated world positions. Reduced-motion mode keeps static v2 sprites, headquarters, damage, targeting, and blockade information visible while disabling looping and one-shot motion.

Canvas fallbacks remain defensive resilience only. Tests must prove every supported pirate unit and headquarters resolves to its production v2 asset in normal operation.

## SFX Contract

Unit combat and movement remain under `SfxDirector`. Viewer-targeted strategic pirate events use `PirateAudioDirector`.

Required production families:

- Galley: oars, hull creak, ram/boarding impact
- Corsair: sail snap, light cannon, timber impact
- Frigate: broadside, heavy wood impact, mast collapse
- Ironclad: engine, heavy gun, metal strike
- Fast attack craft: fast engine, short autocannon burst
- Mothership: diesel engine, horn, heavy sinking
- Enclave: surf/dock ambience, defensive cannon, structural collapse
- Strategic: sighting, raid, blockade, tribute, contract accepted, exposure

Rules:

- only visible or viewer-targeted events play;
- routine off-screen movement is silent;
- enclave surf and dock ambience plays only while a currently visible enclave is focused or its dossier is open, and stops on focus change, panel close, handoff, or disposal;
- movement sound is rate-limited per visible movement sequence, not repeated per hex;
- fire precedes impact with a short deterministic delay;
- faction destruction suppresses duplicate unit and strategic destruction cues;
- strong stingers use the stinger channel; movement and combat use SFX;
- mute, volume, hot-seat handoff, and disposal behavior remain authoritative.

Existing naval files may be reused only after listening review confirms they fit. New OGGs are required where no suitable production sound exists.

New sounds must have a reproducible, repository-owned source path and follow the existing audio policy: CC0 or CC-BY only, typed source metadata, and matching `AUDIO-CREDITS.md` entries. Prefer a checked-in generation script that layers repository-owned recordings and synthesized noise/tones into OGG output; otherwise record the source URL, creator, license, exact credit text, local files, and edit recipe in a pirate audio source manifest. No unlicensed downloaded sound, CC-BY-SA/NC source, or opaque temporary clip may enter the production catalog.

Automated tests validate routing, duration, catalog coverage, file integrity, and duplication, but they cannot establish whether a cannon, engine, or ambience feels right. Placeholder closure therefore includes a human listening acceptance checklist for every reused and new pirate clip before the production catalog is considered complete.

## Save Migration And Repair

Pirate migration belongs in `save-manager` normalization, not `main.ts`.

- New games initialize complete pirate state.
- Legacy saves normalize to empty pirate state and an empty generic notification log without placing entities or consuming IDs.
- ID repair recomputes `nextPirateFactionId` and `nextNotificationId` from active state, pirate history, and persisted notifications without regressing existing unit/city counters.
- After piracy activation, the next completed round emits one warning and begins pressure accumulation.
- Warning delivery and spawn eligibility are separate markers, preventing reload duplication.
- Malformed intel is removed or reduced to the safest valid level.
- Missing flagships resolve faction destruction exactly once.
- Invalid targets and expired contracts are cleared without selecting hidden replacements.
- Save, autosave, import/export, and hot-seat round trips preserve pirate state, generic notifications, and viewer intel.

## AI Parity

AI uses the same eligibility and mutation helpers as players. It may escort valuable transports, break blockades, pay affordable tribute under severe threat, hunt known headquarters, and hire eligible Stage 5 flotillas when economically and diplomatically useful.

AI receives no hidden headquarters coordinates beyond earned intelligence. Human and non-human destruction paths require parity tests.

Pirate owners must be excluded from civilization turn order, economy, diplomacy, victory, known-civilization lists, upkeep, player unit cycling, and major-civilization combat rewards. They must be recognized as hostile owners by attack targeting, movement safety, map presentation, unit labels, combat audio, and cleanup. Tests must exercise each side of this boundary so a `pirate-*` string can never fall through as a major civilization.

## Performance Limits

- Preserve the `3 / 4 / 5` faction caps and two-flotilla limit.
- Run full habitat scoring only on scheduled checks or relevant control changes.
- Search bounded naval neighborhoods and prefiltered candidates for behavior.
- Suppress distant visual effects by level of detail.
- Set fixed per-entity budgets for smoke, fire, wake, and debris.
- Derive Pirate Waters presentation on demand without scanning every tile per render.

## Verification Contract

Tests must cover:

- activation after `Galleys`, including the negative pre-activation case;
- exact pressure arithmetic, caps, Stage 1 enclave-only behavior, flotilla limit, covert anchorage conjunction, shoreline land anchors, suppression, and no-site retry;
- owner-kind classification and exclusion from civilization-only systems;
- every maritime stage, roster draw, behavior tier, and escalation threshold;
- escort conjunction and the non-combat naval near-miss;
- raid cap, blockade conjunction, immediate blockade removal, tribute cancellation, and contract exposure;
- human, AI, combat, enclave-assault, and turn-loop destruction parity;
- fog, last-seen intel, suspected regions, tracked direction, hot-seat privacy, and focus non-disclosure;
- legacy migration, ID-counter repair, malformed-state repair, generic notification round trips, and reload idempotence;
- dossier reachability, exact disabled reasons, confirmation replay safety, and immediate refresh;
- every unit, headquarters stage, overlay, damage tier, animation state, reduced-motion state, and catalog entry;
- SFX visibility, ordering, rate limits, deduplication, mute, handoff, and disposal;
- era-by-era combat sampling so equivalent encounters resolve in expected exchange counts;
- an end-to-end discovery to raid to tribute/blockade to destruction scenario.

Every conjunctive rule requires tests for each missing condition and the fully valid case.

## Implementation Sequence

1. After the implementation plan is written and committed, post it to GitHub issue #353 before any implementation code change. The comment must summarize scope, approved gameplay decisions, architecture, asset requirements, migration, implementation slices, and verification.
2. Implement state, definitions, ownership, migration, deterministic ecology, and their tests.
3. Implement all pirate units, targeting, behavior, raids, headquarters combat, destruction, and their tests.
4. Implement tribute, blockades, contracts, AI, economy integration, and their tests.
5. Implement Pirate Waters UI, typed persistent notifications, intel, hot-seat behavior, and interaction tests.
6. Implement all production v2 ship and headquarters assets, animation state propagation, damage groups, static reduced-motion rendering, Canvas resilience, and visual tests.
7. Implement and source all production pirate SFX, strategic audio routing, cooldowns, deduplication, listening review, and audio tests.
8. Run cross-system regressions, combat balance sampling, performance checks, end-to-end visual QA, and full repository verification.
9. Close the placeholder inventory and run the final completion gate.

No slice may expose an action or entity without a working UI, renderer, fallback resilience, and tests.

## Placeholder And Fallback Closure Gate

The implementation plan must maintain a named inventory of every temporary:

- sprite or visual layer;
- animation;
- damage indication;
- SFX file or reused sound awaiting listening approval;
- fallback icon;
- UI copy string;
- provisional balance constant;
- compatibility branch or temporary feature flag.

Every inventory item must name its production replacement task and verification. The final plan task must:

- scan changed files for `TODO`, `TBD`, `placeholder`, temporary pirate assets, and unresolved compatibility comments;
- verify every pirate entity resolves to production v2 art and correct SFX in normal operation;
- verify all balance constants are intentional and documented;
- remove temporary flags and dead compatibility paths;
- leave the inventory with zero open items.

Defensive runtime fallbacks may remain for resilience, but normal-path tests must prove supported pirate entities never use them. The feature and overall plan are incomplete while any inventory item remains open.

## Completion Definition

The work is complete only when:

- the approved implementation plan was posted to issue #353 before implementation began;
- all gameplay, UI, AI, save, renderer, animation, and audio contracts above are wired through live paths;
- every production asset is present and validated at map scale;
- the placeholder inventory has zero open items;
- targeted, full test, build, rule checks, diff review, and visual QA pass;
- no supported pirate entity normally reaches a placeholder or fallback.
