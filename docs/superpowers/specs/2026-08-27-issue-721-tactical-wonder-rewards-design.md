# #721 Tactical Legendary-Wonder Rewards — Design

**Date:** 2026-08-27  
**Issue:** #721  
**Base:** `f4a3196d8945b7fe8da2e4878a8795089661c083` (`origin/main`)  
**Dependency:** #720 merged in PR #903

## Goal

Add a small typed effect vocabulary for the three planned military legendary wonders. Wonder definitions state which effect they grant; the authoritative training, healing, combat, and air-defense systems apply it.

## Current-main audit and stale assumptions

- #721 still names `c6279df` and lists #720 as blocked. Both are stale: #720 is merged and introduced the reusable, serialized military-fact layer.
- Fort and Citadel remain one saved `fort` improvement whose tier is derived from owner technology. Effects must query the existing tier helper instead of creating a second Citadel structure.
- Existing legendary-wonder definitions already centralize quest and reward data. #721 extends that data contract but does not seed Terracotta Army, Crac des Chevaliers, or NORAD.
- Existing AA coverage is canonical and strongest-source based. NORAD-shaped effects must extend that resolver, never create a parallel coverage or interception system.
- Agent 2 owns strategic deterrence. The effect layer has no nuclear, launch, arsenal, treaty, or retaliation fields.

## Chosen architecture

Add a discriminated `tacticalEffects` array to legendary-wonder reward definitions. Each effect carries only its rule parameters and an explicit stacking group where needed. A resolver discovers effects completed by a civilization and exposes narrowly typed queries to canonical systems.

The initial effect kinds are:

| Effect | Consumer | Exact rule |
|---|---|---|
| `per-era-role-training-xp` | unit-training completion | First newly trained eligible land combat unit in each declared role gains +10 XP once per role per era; total cap four; no carry-over. Excludes upgrades, captures, summons, crisis actors, barbarians, and civilians. |
| `fort-occupant-healing` | canonical turn-end healing | Eligible friendly, supplied land combat occupant of a completed owned Fort/Citadel receives +5 HP through the normal healing path. It never bypasses existing healing/rest/supply gates, caps, or pillage/ownership checks. |
| `adjacent-citadel-defense` | combat context/preview | An eligible friendly defender adjacent to one or more occupied, unpillaged, owned Citadels receives +5% defense. One stacking group means it never stacks; siege specialists are excluded. |
| `aa-radius-extension` | canonical ground AA coverage | An eligible Radar-supported owned SAM source expands radius 2 to radius 3; all other AA sources retain current radius and strongest-source semantics. |
| `first-owner-turn-interception-modifier` | interception combat context | The first eligible interception per owner turn under the declaring radius-3 coverage gets +10%; later interceptions do not. Reset state is owner-turn scoped and serializable only if existing owner-turn state cannot express it. |

No effect is active merely because a wonder definition contains it. It is active only after canonical legendary-wonder completion confirms the owner has completed that wonder.

## Scope and stacking

- Definitions may declare multiple effects, but each resolver consumes only effects it recognizes.
- Effects must have explicit eligibility predicates. No consumer branches on a wonder ID.
- Additive XP and healing use their explicit amounts; defense and interception use one named non-stacking group, selecting the strongest applicable amount deterministically.
- The training cap is independently enforced by role and era. It resets on era transition by comparing current era to persisted grant era; it never carries unused roles forward.
- The interception claim is atomic at its canonical resolution source, so previews cannot consume it and multiple callers cannot grant it twice.

## Player and AI experience

Player-facing reward text will describe exact values, roles, caps, reset timing, prerequisites, exclusions, and non-stacking behavior. Existing owner-scoped wonder presentation must show the same definition text. No UI control, visual effect, or sound is added in #721, so existing 44px/reduced-motion requirements do not gain a new interactive surface.

AI uses the same completed-wonder effects and visible, owned state. This issue adds no difficulty differences, hidden-information access, or AI-only modifier. Future wonder selection can value effect metadata through the same generic definition data rather than ID checks.

## Save, privacy, and determinism

Definitions are static code. Only consumed training grants and first-interception-per-owner-turn claims require runtime state, and only if current owner-turn fields cannot safely encode them. Any new persisted state receives the next current schema version, idempotent malformed-input normalization, and no history reconstruction. State is keyed by owner and current era/turn, never by viewer; presentation is calculated only for the project owner, preserving hot-seat privacy.

## Verification and review contract

TDD begins with failing focused tests for each resolver and its negative cases. Required coverage includes human/AI training parity, era reset/cap/no duplicate grant, supply/pillage/ownership healing gates, Citadel adjacency/empty/siege/non-stacking defense and preview, AA strongest-source and source exclusions, owner-turn interception reset/multiple attempts, save normalization, solo/hot-seat owner isolation, difficulty parity, and existing wonder regressions.

Before PR, run source-rule checks on changed source files, focused mirrored tests, `git diff --check`, build, durable suite/status, and wonder regressions. The PR remains mechanics-only: no bespoke visual/audio work and no #722–#724 content definitions.
