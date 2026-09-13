# Issue 1065: Save/Reload Equivalence Design

## Goal

Make save loading preserve the exact city-state relationship-notification
history that was persisted, so saving and reloading cannot suppress a future
first status notification or diverge from uninterrupted play.

## Scope

This is the first, standalone MR in the requested three-MR arc. It addresses
only #1065. The movement-query work in #1068 and world-turn scalability work
in #1070 require fresh post-merge investigation and are deliberately out of
scope.

## Current behavior and root cause

`normalizeMinorCivQuestState` initializes an absent
`lastNotifiedStatusByCiv` map, rejects malformed status values, then fills an
entry for every major civilization. The notification emitter, however, uses an
absent entry as an implicit `neutral` baseline and writes an entry only when it
emits a status-transition event. The normalizer therefore invents history:
after reload, a civ that has never received a city-state status notification
appears already notified at its current status.

The effect is authoritative, serializable state rather than presentation-only
state. It breaks save/reload continuity and can prevent the player from
receiving the next qualifying relationship-status notification.

## Decision

The loader will preserve notification history rather than reconstruct it:

- Leave an absent `lastNotifiedStatusByCiv` entry absent.
- Continue defaulting a wholly absent map to `{}` for compatibility with older
  saves and null-safe readers.
- Continue removing values that are not valid
  `MinorCivRelationshipStatus` values.
- Remove entries for a missing or eliminated major civilization. Such an entry
  cannot be produced by the canonical elimination path, which already removes
  it, so it is structurally impossible persisted state rather than legitimate
  notification history.
- Do not add a schema migration or bump `saveSchemaVersion`; this is a
  correction to normalizer semantics for an existing optional history map.
- Do not refactor the notification emitter, its `neutral` fallback, movement,
  UI routing, AI behavior, or other city-state lifecycle state.

The existing runtime elimination path already removes this history for an
eliminated civilization. The save normalizer will repair an old or hand-edited
save that violates that invariant, and the eliminated-civ invariant test will
assert the same cleanup rather than exempting this map.

## Implementation shape

1. In `src/storage/save-manager.ts`, retain the `{}` default and valid-status
   filtering in `normalizeMinorCivQuestState`; drop entries whose keys do not
   name a live major civilization; remove the loop that populates absent
   major-civ keys and remove `effectiveLoadedMinorCivStatus`, which then has no
   callers.
2. In `tests/storage/save-persistence.test.ts`, replace the legacy expectation
   for a synthesized `friendly` entry with exact preservation of the empty
   map. Add table-like coverage proving empty, one-entry, and multi-entry maps
   survive normalization and the real `serializeSaveFile` → `parseSaveFile` →
   `normalizeLoadedState` round trip without added keys. Cover malformed and
   eliminated-civ keys as explicit conservative repairs. Include the
   `saveGame`/`loadGame` path because saving itself normalizes state before it
   writes to storage.
3. In `tests/systems/minor-civ-system.test.ts`, drive a relationship transition
   after a save/load where no prior notification history exists; assert exactly
   one `minor-civ:relationship-threshold` event and the recorded status. Use a
   hot-seat fixture with distinct history for two human civilizations, so the
   test proves that the non-viewing seat retains absence and receives its first
   qualifying event after reload. This verifies player-visible semantics rather
   than only stored shape.
4. In the long-horizon continuity coverage, replace the temporary F2
   two-way-ratchet assertion with `firstSimulationDivergence(...) === null` and
   delete only the #1065 tolerance exports from
   `known-campaign-gaps.ts`.
5. Correct the eliminated-civ invariant comment to describe the field as
   notification-history state, and make `tests/helpers/eliminated-civ-areas.ts`
   flag retained notification history for a dead civilization. The existing
   post-elimination save/reload invariant test then proves the canonical
   teardown and normalizer agree.

## Compatibility and determinism

Existing valid notification history remains byte-for-byte the same through
load. Older saves that lack the map still receive an empty map, but no
per-civilization history is inferred. The change adds no persisted field,
does not change save versioning, and preserves solo and hot-seat neutrality:
the normalizer has no viewer/current-player branch. With the same seed and
commands, uninterrupted and save/reloaded campaigns must end at equivalent
authoritative state.

## Verification

- Focused storage and minor-civ tests, including the event regression.
- Save-compat matrix and canonical save-state invariants.
- Long-horizon save/reload continuity, relevant minor-civ coverage, and
  AI-playability coverage required by the repository's established suite.
- Source-rule validation, TypeScript build, durable full-suite status, and
  `git diff --check` before PR creation.

## Inline review

“perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics, different player ages (7-43), different play styles, the built in difficulty modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper testing, regressions solo play, and hot seat plays, and proper implementation.”

| Dimension | Actual review result |
| --- | --- |
| Gameplay, fun, new mechanics, ages, play styles, difficulty | The loader no longer changes relationship history. It does not change thresholds, rewards, movement, or difficulty inputs, so no gameplay or accessibility-facing mechanic changes. |
| AI | `processMinorCivTurn` iterates relationship records independently of viewer and uses the same history map for AI majors. The fix preserves its existing decisions and only prevents synthetic notification baselines. |
| UI, UX, SFX | The live event remains `minor-civ:relationship-threshold`, which the existing UI mapper already routes only to the affected major civ. The new system regression proves the post-reload event is still emitted; no UI or SFX contract changes. |
| Architecture and extensibility | State repair stays in `normalizeMinorCivQuestState`; notification policy stays in the existing emitter. No parallel cache, migration, or current-player branch is introduced. |
| Data and saved games | Valid history round-trips exactly. Empty legacy maps remain empty, malformed status values and structurally impossible eliminated/missing-civ keys are removed, and no schema version changes. The review identified and added coverage for pre-save normalization in `saveGame`. |
| Testing, solo, hot seat | Unit-level map preservation, actual JSON transfer, database save/load, event emission, long-horizon continuity, and eliminated-civ invariant coverage are specified. The review identified and added a two-human-seat regression for a non-viewing seat. |
| Proper implementation | The removed helper has no other callers; the canonical elimination path already deletes this map entry. The implementation will keep those two paths consistent and run their focused and durable checks. |
