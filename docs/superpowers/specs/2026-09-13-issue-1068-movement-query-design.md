# #1068 Detailed movement-query blocker lookup

## Goal

Remove the detailed movement BFS's repeated linear scan of cities, barbarian camps,
and the pirate-enclave anchor for every reachable neighbor. The optimization must
preserve every observable movement result: reachable tiles, ordering, terminal
behavior, and blocker reason.

This is a local query-algorithm change. It deliberately does **not** introduce an
AI-round cache, change AI decision semantics, or alter the public movement-query
call sites. Cross-unit/per-round caching belongs to the separately tracked cache
work.

## Verified current behavior

`getMovementRangeDetails(state, unitId)` runs a BFS and invokes
`getBlockingMapEntityAt(state, unit, neighbor)` for each candidate neighbor.
That helper linearly searches cities, camps, then the pirate-enclave anchors. The
reason returned by the helper is semantically significant: a pirate enclave is
not targetable by direct adjacency in the same way as a hostile city or camp.

The simpler `getMovementRange` already consumes precomputed blocker keys, but a
key set alone is insufficient for details because it cannot preserve the blocker
reason. The canonical legality predicates and priority currently live in
`unit-movement-legality.ts`; a second implementation of those rules would drift.

## Chosen design

Add one canonical legality helper that derives a `ReadonlyMap<string,
BlockingMapEntity>` for a unit and state. It will enumerate the existing sources
in the same city, camp, then pirate-enclave precedence, applying the same
legality predicates as today. The current key-set helper will derive its keys
from that map, keeping one definition of what blocks movement.

The lookup must also preserve the current first-match behavior for multiple
records on one hex: a first city entry is considered before camps, and the first
camp or enclave entry is considered only when no earlier blocking result exists.
This is normally unreachable in valid generated state, but retaining it avoids
silently changing behavior for imported or hand-edited saves with overlapping
records. A simple later `Map#set` must not overwrite an earlier canonical
answer.

`getMovementRangeDetails` will build that lookup exactly once per invocation and
perform O(1) map reads inside the BFS. It will retain the existing direct-start
and pirate-enclave condition, zone-of-control calculation, terminal behavior,
and neighbor traversal unchanged. `getBlockingMapEntityAt` remains a compatible
single-coordinate query, deriving its answer from the same canonical lookup or
shared canonical construction rather than retaining a divergent legality path.

No caller changes are required for #1068. In particular, AI tactic and basic-AI
calls continue to ask for detailed movement individually; their future round
cache is out of scope.

## Correctness and regression contract

Tests will prove that canonical lookups and single-coordinate blocker lookup
agree for hostile cities, barbarian camps, pirate enclaves, allied/neutral
entities, non-blocking tiles, and deliberate same-hex collision fixtures. They
will also preserve exact detailed-query results, including ordering and reasons,
across crowding, enemy-city, transport/cargo, airborne, and fog-relevant
coverage already used by movement tests.

Existing #843, #845, #965, and #970 movement regressions remain in the targeted
suite. No gameplay balance, difficulty-mode rules, save schema/normalization,
hot-seat viewer state, UI affordance, or SFX route changes in this slice; their
behavior is protected by semantic equivalence and the durable suite rather than
new surface code.

## Performance contract

Replace the obsolete derived metric (`blockingEntityAtCalls * cityCount`) with
measurements that assert the detailed query constructs one canonical blocker
lookup and makes no per-neighbor direct linear blocker query. The algorithmic
budget must fail if a direct linear lookup is restored inside the BFS or the
canonical lookup is rebuilt per neighbor. A controlled sabotage test will
demonstrate that failure.

The performance guard constrains algorithmic shape, not hardware timing, so it
remains stable for solo and hot-seat play as map/entity counts vary.

## Inline review scope

perform an INLINE review across these dimensions about balancing gameplay, fun,
new mechanics, different player ages (7-43), different play styles, the built
in difficulty modes, how computer players will use it, ui, ux, architecture,
extensibility, data, sfx, updating saved games, proper testing, regressions solo
play, and hot seat plays, and proper implementation.

For this refactor, that review must explicitly confirm: no movement legality or
AI decision changes; no player-facing UI/SFX/save data changes; canonical data
ownership and extensibility remain in movement legality; AI and human callers
receive identical details; and targeted, performance, build, and durable-suite
evidence covers the no-regression claim.

## Verification

Before a PR, run source-rule checks for changed production files, the mirrored
movement and performance tests plus relevant AI/transport/airborne regressions,
the algorithmic-budget sabotage proof, `yarn build`, `yarn test:durable`, and
`yarn test:durable:status`. Review both `origin/main...HEAD` and the working-tree
diff before reporting completion.
