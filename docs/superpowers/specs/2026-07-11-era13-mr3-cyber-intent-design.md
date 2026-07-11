# Era 13 MR3: Cyber intent vertical slice

## Scope

This slice replaces Cyber Unit passive income drain only for civilizations whose first Era 13 technology is complete. Before that activation boundary, the existing Era 12 passive resolver remains unchanged. It delivers the complete persistent Harden and Exploit loop: state, validation, timing, cleanup, migration, player UI, AI, viewer-safe feedback, and save transfer.

It does not introduce Capacity/Load HUDs, postures, Surge controls, constructive plans, formations, new Era 13 roster content, wonders, or authored network motifs.

## Architecture

New focused modules own serializable plan state, closed intent definitions, lifecycle validation, deterministic effect resolution, and viewer-safe presentation. `GameState` stores only plain data: `autonomyByCiv`, city civic pressure, viewer-scoped detections, plans, and `nextNetworkPlanId`. Targets and effects are discriminated unions; definitions contain data rather than callbacks or live references.

One canonical validator returns structured success/failure information for UI and AI. Assignment, Hold, retarget, cancel, invalidation, preview, and resolution call it. It enforces one plan per source, same-type nonstacking, target ownership, range, war, source existence, and malformed-reference rejection. Invalid plans do not consume derived Load or resolve against replacement entities.

`isAutonomyActivated(state, civId)` is the sole transition predicate. The turn manager retains the passive Cyber resolver only before activation and invokes intent resolution only at/after activation; a regression proves neither path can apply twice in one round.

## Cyber contracts and timing

Harden targets a friendly city at range 1 with Load 1. It refreshes one 50-percent mitigation charge every two owner rounds; an AI Safety Institute refreshes every owner round. Regular unused charges cap at one.

Exploit targets an at-war enemy city at range 1 with Load 2. It transfers `floor(10% of base city gold)` per resolution, or 15 percent for an already-valid Surge-ready migration/state case, subject to the city-yield ceiling and a minimum positive transfer of one. A Cyber Defense Center delays the first otherwise-unmitigated resolution and halves every resolution. Harden consumes one charge to halve the remaining amount. Defenses are deterministic and never fully erase a positive exploit.

Constructive Harden activates immediately. Hostile Exploit is prepared on assignment, warns its victim at the start of that victim's next turn, and resolves at the end of that turn only while still valid. Warnings expose the effect and counter category, never the source identity or coordinates unless that viewer has an explicit detection record. The handoff sequence preserves this response turn and defers all viewer-specific presentation until identity confirmation.

## Cleanup, migration, and presentation

Canonical lifecycle cleanup handles source movement out of range, source capture/destruction, target destruction, city capture, peace, diplomacy changes, conquest, elimination, and malformed loads. Capture cancels the old owner's plan and leaves the captured Cyber Unit on Hold/recovery under its new owner.

Save schema version 3 appends to the existing version-2 migration registry. Migration initializes empty state below activation. At or after activation it stable-sorts Cyber Units and eligible cities, creates at most one valid Exploit per city, moves duplicates to Hold, allocates plan IDs from `nextNetworkPlanId`, rejects orphans with an owner-visible recovery notice, preserves viewer detections, and remains byte-stable across a second load/save/load.

The selected Cyber Unit panel gains Assign Intent with Hold, Harden, and Exploit choices, legal targets, outcome, Load, first timing, counters, and disclosure. Confirm, retarget, cancel, reopen, and repeated clicks use live IDs and immediately rerender the selected-unit and intent surfaces. Notifications aggregate recurring resolutions per civilization round while warning/capture/cancel feedback remains immediate. Audio is emitted only from authorized visible events.

## AI and tests

The shared AI scheduler uses the canonical preview and validator with earned intel only. It creates bounded deterministic candidates, obeys challenge-profile `tacticalTopK` and mistake knobs, protects sources, cancels obsolete plans, and selects Hold when no valid positive action exists. Difficulty changes decision quality only, never effect values or hidden information.

Tests proceed red-green by contract: serialized state and ID scanning; validation and immutability; passive-versus-intent exclusivity; exact mitigation/timing/cleanup; human and AI/turn-manager parity; viewer privacy; migration idempotence; save/export/import/autosave/handoff; and live UI replay for assign, retarget, cancel, reopen, repeat clicks, range break, peace, capture, and hot-seat handoff.

## Inline review

| Lens | Review result and required guardrail |
|---|---|
| Balance and fun | Pass with a constraint: Harden must substantially reduce but never nullify a positive Exploit, while an unprotected zero-gold city yields nothing. The response turn, range-one placement, war gate, source vulnerability, and same-type nonstacking prevent passive income theft from becoming unavoidable or routine busywork. |
| New-mechanic clarity and ages 7–43 | The primary copy is outcome-first: “Reduce hostile network effects” rather than “Protected,” and “Prepare an exploit” rather than formula-first language. Exact percentage, charge, and delay calculations remain available in a compact detail view; Hold is visibly valid and never blocks end turn. |
| Play styles | Defensive and peaceful players receive immediate Harden value without a compulsory hostile action. Aggressive players need war, proximity, and a surviving source; builders can counter with Cyber Defense Center. This slice does not promise MR4 constructive Capacity/posture gameplay early. |
| Difficulty and computer players | Explorer, Standard, and Veteran share target rules, numbers, and intel boundaries. Their existing challenge knobs affect only bounded candidate quality, planning horizon, and deterministic suboptimal choices. AI may assign only shared-validator-approved plans from earned intel, must use Hold when appropriate, and cancels plans made obsolete by diplomacy, movement, capture, or invalid targets. |
| UI, UX, accessibility | Assign Intent exposes all three actions and legal targets with outcome, timing, counter, Load, and disclosure before confirmation. Controls meet the existing 44px touch-target and keyboard rules, disabled actions name their blocker, and confirm/retarget/cancel rerender the still-open panel. The victim warning offers an affected-city focus action without leaking a hidden source. |
| Architecture, extensibility, and data | Focused state/definition/lifecycle/resolver/viewer modules prevent `main.ts`, UI callbacks, or AI from owning mutations. Plan targets/effects remain closed discriminated unions and the explicit plan ID counter is scanned/normalized, leaving safe extension points for MR4 without prematurely adding Capacity or posture state. |
| SFX and feedback | This MR reuses only existing visible-feedback routing; it adds no authored motif or hidden preparation sound. Warning, cancellation, capture, and resolution sound requests are deduplicated, obey mute/volume, and occur only after viewer authorization and a paired visible notification. |
| Saved games and regressions | Migration 3 is strictly appended after v2, stable-sorts legacy inputs, preserves legitimate detections, rejects malformed records safely, and proves load-save-load equality. Autosave, manual save, export/import, and handoff use the same normalized state rather than a parallel serializer. |
| Testing and implementation completeness | Tests must cover every canonical mutation through human and non-human callers, full UI replay, privacy-negative assertions, no double passive/intent application, multi-attacker nonstacking, zero-gold behavior, all cleanup triggers, migration idempotence, and targeted plus full-suite/build verification. No player-visible control may ship without its live caller and immediate rendered state change. |
| Solo and hot seat | Solo suggestions remain advisory and do not auto-assign. In hot seat, attacker end → autosave/veil → identity confirmation → viewer reset → victim warning → normal input → victim turn-end resolution is mandatory; panels, selections, notifications, focus targets, and audio clear or derive only in the receiving viewer context. |

Review conclusion: the slice is balanced and independently mergeable only if the full Harden/Exploit loop, migration, cleanup, AI, and viewer-safe presentation ship together. A UI-only intent surface, an intent resolver without response timing, or a migration without canonical cleanup would be incomplete and must not be merged.

## Drift record

Current `origin/main` is `d5061e3e1916c4d6f6c3ee9ac6b4292cad2136a4`, the MR2 merge. Its schema registry ends at version 2 and its Cyber resolver is the expected Era 12 adjacency drain with deterministic block rolls. The approved MR3 design therefore applies without a contract-changing deviation; planned seams are compatible with the current turn-manager, save-manager, selected-unit, AI-scheduler, notification, and SFX structures.
