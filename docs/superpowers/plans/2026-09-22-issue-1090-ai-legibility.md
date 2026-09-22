# #1090 — AI Decision Legibility (Implementation Plan)

See design doc: `docs/superpowers/specs/2026-09-22-issue-1090-ai-legibility-design.md`.

## Files touched

- `src/core/types.ts` — `GameEvents['diplomacy:treaty-declined']` gains `reason?:
  TreatyDeclineReason`; new `GameEvents['diplomacy:peace-declined']: { proposerCivId, targetCivId,
  reason?: TreatyDeclineReason }`; `GameEvents['ai:strategic-warning']['kind']` gains
  `'posture-shift'` and an optional `posture?: 'dominate' | 'recover'` discriminant field.
- `src/systems/diplomacy-system.ts` — `proposeTreatyAgreement`'s peace branch emits
  `diplomacy:peace-declined` on refusal (currently emits nothing); its treaty branch emits
  `diplomacy:treaty-declined` with `reason` on refusal (currently emits nothing);
  `proposeVassalage` attaches `reason` to its existing emission.
- `src/ui/notification-routing.ts` — `TREATY_DECLINE_REASON_TEXT` lookup; `routeTreatyDeclined`
  appends reason text when present; new `routePeaceDeclined` (mirrors `routePeaceMade`'s shape).
- `src/presentation/register-diplomacy-presentation.ts` — registers `diplomacy:peace-declined` →
  `routePeaceDeclined`.
- `src/systems/strategic-warning-system.ts` — `deriveBarbarianWarnings` reads
  `resolveBarbarianArchetype` and sets an archetype-aware `actorName`; a mobilizing barbarian camp
  plan (`phase === 'mobilizing'`) is folded into the existing `'mobilizing'` kind alongside major
  civs (today `deriveMajorWarnings` only scans `opponentAI.majorCivs`); new
  `derivePostureWarnings` function for the `dominate`/`recover` transitions, gated by
  `shouldListMajorCivForViewer`.
- `src/ui/strategic-warning-presentation.ts` — `presentStrategicWarning` gains archetype-aware
  raid/mobilizing phrasing (reads `event.actorName`, already differentiated at the derive layer —
  no new field needed there) and a `'posture-shift'` branch.
- `src/systems/ai-decision-debug.ts` (**new**, dev-only) — `describeWarningTrace(state, warning)`,
  the debug-correlation helper. Never imported by production UI entry points.
- No `src/core/types.ts` persisted-field change beyond the two event-payload additions above
  (events are bus-only, never serialized) — zero save migration.

## TDD order

1. **Diplomacy: peace decline reason reaches the proposer.** RED: a test in
   `tests/systems/diplomacy-system.test.ts` — a human civ requests peace from an AI civ whose
   `evaluatePeaceConsent` will refuse (construct a fixture matching `'peace-not-acceptable'`'s
   condition); assert a `diplomacy:peace-declined` event fires with the correct `proposerCivId`/
   `reason`, and that **no such event fires today** is the RED state (currently nothing emits at
   all). Implement → green.
2. **Diplomacy: treaty decline reason reaches the proposer.** RED: same pattern for
   `non_aggression_pact`/`alliance` refusal via `evaluateTreatyConsent`, asserting
   `diplomacy:treaty-declined` now carries `reason`. Implement → green.
3. **Diplomacy: vassalage decline reason.** RED: `proposeVassalage`'s existing emission gains
   `reason` — assert the field is now populated (was previously always `undefined`). Implement →
   green.
4. **Notification text: reason-specific vs. generic.** RED: `routeTreatyDeclined`/
   `routePeaceDeclined` unit tests — with `reason` present, the delivered message differs
   per-reason; with `reason` absent, the message matches today's exact existing string
   byte-for-byte (proves the change is additive, never regressing the human-declines-AI's-offer
   case). Implement → green.
5. **Barbarian archetype in raid warnings.** RED: a test in
   `tests/systems/strategic-warning-system.test.ts` — two otherwise-identical camps whose ids
   resolve to different archetypes (found via the same small deterministic search helper pattern
   #1089's own tests use) produce warnings with different `actorName`. Implement → green.
6. **Barbarian mobilizing (Warlord) folded into the existing 'mobilizing' kind.** RED: a Warlord
   camp plan with `phase: 'mobilizing'` produces a `kind: 'mobilizing'` warning (today
   `deriveMajorWarnings` never looks at barbarian camps at all, so this warning does not fire).
   Implement → green.
7. **Strategic posture warning, gated by contact.** RED (two cases): (a) a major civ in `dominate`
   intent that the viewer has met produces a `'posture-shift'` warning; (b) the identical civ in
   the identical intent that the viewer has **never met** produces **no** warning at all — proving
   the contact gate is structural, not cosmetic. Implement → green.
8. **Dedup/cooldown reuse, not reinvention.** RED: the new `'posture-shift'` warning respects the
   same `warningKey`/`lastWarningTurnByKey` mechanism — repeated identical posture across turns
   does not re-fire; a genuine posture change does. Implement (should fall out of reusing the
   existing pipeline with no new code) → green, pinning the reuse rather than a parallel
   mechanism.
9. **Differential privacy tests (the issue's own explicit acceptance criterion).** For each of the
   three new/changed surfaces, a paired test: the authoritative world differs (hidden army
   composition, an unmet civ's intent, a hidden target) but the viewer's earned knowledge does
   not ⇒ the player-facing explanation is byte-identical. A paired positive-control test: the
   viewer legitimately gains the missing knowledge ⇒ the explanation becomes more specific.
10. **Debug correlation.** RED: `describeWarningTrace(state, warning)` returns a plain object
    naming the exact canonical source (the `AIStrategicPlan` or `NationalIntentState` the warning
    was derived from), keyed off `warning.warningKey`/`actorId` — assert it resolves correctly for
    each of the three surfaces, and returns `null`/undefined gracefully for a stale warning whose
    source no longer exists (e.g. the camp was destroyed since).
11. **No production import of the debug helper.** A structural test (or `check-src-rule-
    violations.sh` extension) confirming `ai-decision-debug.ts` has no importer under
    `src/ui/`/`src/presentation/` production registrars — dev-tooling only, never shipped to the
    player-facing bundle's hot path.

## Verification commands

```
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn vitest run tests/systems/diplomacy-system.test.ts tests/systems/strategic-warning-system.test.ts tests/ui/strategic-warning-presentation.test.ts tests/ui/notification-routing.test.ts
scripts/check-src-rule-violations.sh <every changed src/ file>
bash scripts/run-with-mise.sh yarn test
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
```

**Long-horizon is NOT required for this MR** unless something unexpected during implementation
turns out to change AI decision/simulation semantics. Per the arc brief's own explicit
instruction: "If implementation is truly presentation/projection-only and does NOT change AI
decisions or simulation state, do not automatically spend an hour rerunning the full AI-long
matrix." Every change in this plan reads already-computed canonical state and emits/derives
presentation data; nothing here feeds back into a `GameState` mutation an AI or turn-processing
system consumes on a later turn. Confirm this holds during implementation (grep the diff for any
write to `GameState` outside event payloads) before skipping it — if it turns out something here
does mutate simulation-relevant state, run it.

## MR boundaries

- In scope: diplomacy decline rationale (peace/treaty/vassalage), barbarian archetype
  differentiation in existing raid/mobilizing warnings, a new narrow `posture-shift` warning for
  `dominate`/`recover`, debug-correlation helper.
- Out of scope, explicitly: new opponent-overview panel, war-declaration rationale, any AI
  decision-logic change, natural-language generation, `expand`/`develop` posture chatter (too
  frequent/low-value to surface).
