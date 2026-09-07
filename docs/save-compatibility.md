# Save compatibility

<!-- GENERATED FILE — do not edit by hand.
     Source: src/storage/migrations/{ordered,compatibility,repair}.ts
     Regenerate: UPDATE_SAVE_COMPAT_DOC=1 yarn vitest run tests/storage/save-migration-registries.test.ts
     Enforced by: tests/storage/save-migration-registries.test.ts -->

Current schema version: **28**

Save compatibility is three separate mechanisms (#1023). They are deliberately
not interchangeable: a normalizer silently standing in for a migration that was
never written is the failure this separation exists to prevent.

## 1. Ordered versioned migrations

**Admission criterion:** the persisted shape changed at schema N, and a save written
below N cannot be read correctly without this transformation.

Run exactly once, in ascending order, only for saves below the current version.
Never on an already-current save.

| Schema | Step | Why it needed a version bump |
|---:|---|---|
| 1 | `era-13-foundation` | Legacy saves had no stable gameId and used technology ids renamed at the era-13 boundary; every deterministic RNG stream keys off gameId. |
| 2 | `late-resources` | Late-era resource deposits did not exist when the save was written and must be placed reproducibly from its own gameId. |
| 3 | `autonomy-network` | The autonomy/network subsystem added required containers plus cyber-unit plans that readers cannot synthesize. |
| 4 | `legacy-based-aircraft` | Aircraft persisted without a valid air base must be re-homed or removed; leaving them strands units the movement system cannot resolve. |
| 5 | `dual-era-world-age` | World Age became a derived majority of per-civ personal eras, replacing the single persisted era field. |
| 6 | `autonomy-network-postures` | Posture fields were added to every autonomy civ state after the container itself shipped. |
| 7 | `circular-manufacturing-choices` | Circular Manufacturing choices had to be re-derived against actually-built projects; a stale choice grants a material the empire never earned. |
| 8 | `combat-notification-details` | Combat notifications gained structured detail; entries written before it render as half-populated log rows. |
| 9 | `coastal-hulls-off-ocean` | #751 made coastal-only hulls illegal on open ocean; a save with one has a unit no movement rule can legally move. |
| 10 | `retimed-cavalry` | Cavalry moved era; an already-queued one is grandfathered exactly once without making new early Cavalry legal. |
| 11 | `retimed-knight` | Knight moved era after the Cuirassier retime; same one-time grandfathering contract as Cavalry. |
| 12 | `legacy-main-fixups` | #787 absorbed eighteen fixups that previously ran only on the hot-seat campaign-entry path, so solo saves never received them. |
| 13 | `coastal-battery-counterfire-turns` | Per-city Coastal Battery counterfire markers were added; a malformed or absent marker corrupts counterfire timing. |
| 14 | `barbarian-camp-pressure` | The coarse per-camp pressure ledger was added and is read without a fallback by the threat-pressure system. |
| 15 | `crisis-force-container` | Crisis forces became persisted world actors; the container must exist before any crisis can be resolved on load. |
| 16 | `crisis-force-records` | The crisis-force record shape changed after the container shipped. |
| 17 | `stampede-container` | Beast Stampede state became persisted and target-scoped. |
| 18 | `rogue-elephant-host-container` | Rogue Elephant Host state became persisted and target-scoped. |
| 19 | `rogue-elephant-host-records` | The host and crisis-force record shapes changed after their containers shipped. |
| 20 | `strategic-strike-ledger` | #545 MR4 made strategicStrikesReceivedFrom a DiplomacyState field; retaliation classification reads it as an append-only history. |
| 21 | `legendary-wonder-military-facts` | Legendary-wonder military facts became persisted quest evidence rather than being recomputed from later state. |
| 22 | `legendary-wonder-tactical-effects` | Owner-scoped tactical effect state became persisted; without it a completed wonder silently grants nothing. |
| 23 | `generated-generals` | #888 made the fallback-generated officer registry authoritative for identity; without it a generated General is renamed by a later name-pool edit. |
| 24 | `research-costs-v24` | #917 retuned technology costs; in-flight research must keep its invested percentage rather than its absolute progress. |
| 25 | `federalism-fields` | Federal Autonomy added two optional Civilization fields. See the corruption-repair registry: this step is scrub-only and takes a number solely so the repair has a version boundary. |
| 26 | `city-bombardment-tallies` | City.bombardment added the per-turn cap tally. Like 25, scrub-only — the number exists to give the repair a version boundary. |
| 27 | `vassalage` | #910 made vassalage bilateral; a one-sided or dangling role silently breaks protection obligations and independence checks. |
| 28 | `minor-civ-leagues` | #496 added the regional-compact container. Additive persistent container only; formation stays a world-turn action. |

## 2. Compatibility normalization

**Admission criterion:** a safe default or an idempotent shape conversion for an
optional/additive field, where a save that predates the field is legal at every
schema version and every reader already tolerates its absence.

Run unconditionally on every load.

| Pass | Why old saves need no migration | Also schema step |
|---|---|---:|
| `autonomy-network-postures` | Posture fields are optional on every autonomy civ state and default to the centralized stance; a save without them is legal at any version. | 6 |
| `circular-manufacturing-choices` | The choice map is optional and re-derived from actually-built national projects, so an absent or stale map is always recoverable without a version step. | 7 |
| `crisis-archetypes` | A crisis archetype is derived data, re-read from the flavor definition every load; the persisted value is a cache, never the source of truth. | — |
| `religion-defaults` | #591 MR4: religions/cityFaith are absent on every save predating religion, and every reader uses `?? {}`. Purely additive. | — |
| `city-faith-conversion-progress` | #592 MR5: converts a legacy single-slot conversionProgress into the per-religion map. Idempotent — a ledger already in the new shape is returned untouched — so no version boundary is needed. | — |
| `barbarian-camp-pressure` | The pressure ledger is coarse, camp-owned, and fully re-derivable; an absent entry means "no observation yet", which is a legal state at any version. | 14 |
| `retimed-biplane-queues` | #678 retimed the Biplane. Grandfathers an already-queued legacy Biplane onto its legal fighter successor exactly once; idempotent, and it never makes a newly-illegal item legal, so no version boundary is needed. | — |

## 3. Corruption repair / defensive sanitation

**Admission criterion:** drops or repairs structurally impossible data that the game
itself never writes — a hand-edited, truncated, or externally-produced file.

Run unconditionally on every load. **A repair that actually fires on a save the game
wrote is a bug in the writer, not a reason to keep the repair.**

| Pass | What malformed input it defends against | Also schema step |
|---|---|---:|
| `missing-game-identity` | A save claiming a schema version but carrying no gameId is externally malformed — every deterministic RNG stream keys off gameId, so a missing one must be re-derived stably rather than left undefined. | 1 |
| `legacy-tech-grace` | Scrubs stale hard-resource retime-grace data down to the units that still legitimately hold it; a hand-edited grace list would otherwise keep an illegal unit buildable forever. | — |
| `generated-generals` | Drops structurally malformed generated-officer records (id/key mismatch, missing required fields) so a corrupt file cannot crash identity resolution or resurrect a garbage officer. | 23 |
| `general-career-ledger` | Drops malformed career events (not an object, missing/NaN turn, unknown type) without fabricating history for a General that has none. | — |
| `legendary-wonder-military-facts` | Drops persisted quest-evidence facts that fail structural validation, so a hand-edited file cannot satisfy a legendary-wonder quest step it never earned. | 21 |
| `legendary-wonder-tactical-effects` | Scrubs granted combat roles that are not real roles, so a corrupt file cannot hand a civ a tactical grant the wonder never confers. | 22 |
| `coastal-battery-counterfire-turns` | Removes non-integer per-city counterfire markers, which would otherwise corrupt counterfire-timing arithmetic. | 13 |
| `improvement-values` | Clamps unknown improvement ids to "none" and caps build timers at their definition maximum, so a hand-edited tile cannot complete an improvement that does not exist. | — |
| `vassalage` | Repairs one-sided, self-referential, duplicated and dangling vassalage roles; an impossible role silently breaks protection obligations and independence checks. | 27 |

## Dual registrations

A pass may be both a numbered step and an unconditional one, but only with a stated
reason — an undeclared dual registration is how a normalizer starts substituting for
a migration. Enforced by function identity, not by id.

| Pass | Schema step | Why it also runs unconditionally |
|---|---:|---|
| `autonomy-network-postures` | 6 | Schema 6 introduced the fields. It stays unconditional because a civ added mid-game (breakaway, rebellion statehood) is created without them and would otherwise never receive them. |
| `circular-manufacturing-choices` | 7 | Schema 7 first filtered the map. It stays unconditional because a project razed or captured after the save was written invalidates a choice the numbered step already accepted. |
| `barbarian-camp-pressure` | 14 | Schema 14 introduced the ledger. It stays unconditional because camps spawn continuously during play and a camp created after the save has no entry. |
| `missing-game-identity` | 1 | Schema 1 gives an unversioned save its gameId. The guarded pass here only fires for a save that claims version >= 1 yet has no gameId — a shape the game never writes. |
| `generated-generals` | 23 | Schema 23 defaults the registry for saves predating #888. The unconditional pass is the scrub half, which applies to any file regardless of version. |
| `legendary-wonder-military-facts` | 21 | Schema 21 introduced the facts list. The unconditional pass is the validation half — quest evidence is exactly the thing worth editing a save file to forge. |
| `legendary-wonder-tactical-effects` | 22 | Schema 22 introduced the effect state. The unconditional pass is the validation half, for the same forgery reason as the military facts above. |
| `coastal-battery-counterfire-turns` | 13 | Schema 13 introduced the markers. The unconditional pass is the malformed-value scrub. |
| `vassalage` | 27 | Schema 27 made vassalage bilateral. The unconditional pass is the impossible-shape repair, which must apply to any file regardless of version. |

## Unconditional pass order

The legacy tail order, preserved verbatim by #1023 — several passes read fields an
earlier pass defaults, so regrouping by registry would be a behaviour change dressed
as a refactor.

1. `missing-game-identity` (repair)
2. `autonomy-network-postures` (compatibility)
3. `circular-manufacturing-choices` (compatibility)
4. `legacy-tech-grace` (repair)
5. `crisis-archetypes` (compatibility)
6. `religion-defaults` (compatibility)
7. `generated-generals` (repair)
8. `general-career-ledger` (repair)
9. `vassalage` (repair)
10. `city-faith-conversion-progress` (compatibility)
11. `retimed-biplane-queues` (compatibility)
12. `coastal-battery-counterfire-turns` (repair)
13. `improvement-values` (repair)
14. `barbarian-camp-pressure` (compatibility)
15. `legendary-wonder-military-facts` (repair)
16. `legendary-wonder-tactical-effects` (repair)
