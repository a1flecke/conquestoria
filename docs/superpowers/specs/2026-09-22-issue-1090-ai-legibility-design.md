# #1090 — AI Decision Legibility (Design)

Base SHA: `550ed2ff992e89a51f495458bd4a2756c84373ae` (origin/main, confirmed current via
`git fetch origin main` before starting — includes #1086/#1087/#1089, all merged).

## Stage 0 — drift / duplicate-work audit

- `gh issue view 1090`: OPEN, unchanged since creation. `gh pr list --search "1090"` /
  `"legibility"`: no PR implements this issue.
- Read in full: `src/systems/viewer-intel.ts`, `viewer-event-presentation.ts`,
  `domination-presentation.ts`, `strategic-warning-system.ts` (454 lines),
  `ui/strategic-warning-presentation.ts`, `presentation/register-diplomacy-presentation.ts`,
  and the relevant slices of `diplomacy-system.ts` (`proposeTreatyAgreement`,
  `rejectDiplomaticRequest`, `proposeVassalage`).

### The critical finding: most of the "stable translation layer" the issue asks for already exists

This issue's title asks to "turn decision traces into player-facing strategic legibility" as if
starting from nothing. That framing is stale. **A working, viewer-safe, deduplicated,
canonical-reason-driven translation layer already exists and already covers most of the issue's
required surfaces:**

- **`strategic-warning-system.ts`** (`deriveStrategicWarningTransitions` /
  `applyStrategicWarningTransitions`) already derives a typed `ai:strategic-warning` event from
  canonical AI state — major-civ plan `phase` transitions (`'mobilizing'`/`'withdrawing'`),
  barbarian camp raid plans, pirate `knownBehavior`, resource denial/restoration, and domination
  threat evidence — with a `warningKey` (`viewerId:actorId:kind:targetIdentity`) dedup/cooldown
  ledger persisted in `opponentAI.pressureByCiv[viewerId].lastWarningTurnByKey` (**already
  satisfies the "repeated identical reasons deduplicated/cooldown-limited" acceptance
  criterion**), and an `evidence: 'visible' | 'remembered' | 'earned-intel'` field distinguishing
  what the viewer currently sees from what they only remember — **already satisfies "distinguish
  explicit communication from inferred intelligence" for this surface, and already gates every
  warning behind the viewer's own fog/last-seen state** (`planEvidence`, `isVisible`,
  `trustedLastSeenAt` — never a global scan).
- **`ui/strategic-warning-presentation.ts`** (`presentStrategicWarning`) already translates each
  typed warning into authored, bounded English — this **is** the "presentation concept" layer the
  issue asks to design, already built, for military mobilization and barbarian/pirate activity.
- **`domination-presentation.ts`** already demonstrates the exact "observer-safe knowledge DTO,
  never the omniscient query" pattern (`buildDominationKnowledge(state, viewerId)` →
  `DominationKnowledge`, consumed by both UI and the warning system) that
  `.claude/rules/game-systems.md`'s Domination Authority rule already mandates project-wide.

**So the acceptance criteria already substantially met, pre-existing:** stable translation layer
(exists, for these surfaces); military mobilization explanations (exists); fog/intelligence
respect (exists, for these surfaces); dedup/cooldown (exists); explicit-vs-inferred distinction
(exists, via `evidence`).

### The real gaps (confirmed by reading the code, not assumed from the issue text)

1. **Diplomacy rationale is a genuinely broken, silent gap — the issue's own flagship example.**
   Traced `applyDiplomaticAction`'s `'request_peace'`/`'non_aggression_pact'`/etc. cases →
   `proposeTreatyAgreement`. When a human proposes peace or a treaty **directly to an AI civ**
   (`target.isHuman` is false — this is the synchronous path, not the queued
   human-is-target path), `evaluatePeaceConsent`/`evaluateTreatyConsent` (`ai-treaty-consent.ts`,
   #901) compute a typed `TreatyConsent.reason: 'relations-too-strained' | 'strategic-caution' |
   'peace-not-acceptable'` — and both call sites **discard it entirely** (`if (!consent.accepted)
   return state;` / `consent.accepted ? commit... : state`) with **no event, no notification, no
   feedback of any kind.** A player who requests peace and is refused today learns nothing at
   all — not even that it was refused. `proposeVassalage` (same file) is *slightly* better: it
   already emits `diplomacy:treaty-declined` on refusal (routed to a generic "X declined your
   Vassalage" notification via the already-registered `routeTreatyDeclined` handler in
   `register-diplomacy-presentation.ts`) but **still drops the computed reason**, so the message
   is always the same generic sentence regardless of *why*.
2. **Barbarian archetype (#1089, just merged) is invisible.** `deriveBarbarianWarnings` already
   raises a raid warning from a camp's `AIStrategicPlan`, but reads only `plan.objective ===
   'raid'` and always labels the actor `'Raiders'` — it does not read `resolveBarbarianArchetype`
   or the plan's `reasonCodes` (`'opportunistic-raid'` / `'predator-hunt'` / `'nearby-opportunity'`
   / `'warlord-mobilizing'`), so a Predator's hunt and a Warlord's mobilizing assault currently
   produce byte-identical player-facing text. This is exactly the "#8 acceptance criterion" case:
   "the system can consume future non-major-archetype reason codes without bespoke UI rewrites" —
   #1089 shipped those reason codes; nothing consumes them yet.
3. **Strategic posture (#1086's national intent) is surfaced nowhere.** `expand` / `develop` /
   `dominate` / `deter` / `recover` lives only in `opponentAI.nationalIntentByCiv`, read by AI
   code, never by any presentation layer.

## Stage 2 — design

**Architectural decision: extend the existing `ai:strategic-warning` translation layer and the
existing `diplomacy:treaty-declined` event, rather than building a second, parallel
"presentation concept" system.** This is the single most important design choice, and it
directly satisfies the arc brief's explicit warning against "each UI surface interpreting raw AI
state independently" and "a second explanation system that can drift from behavior" — the second
system already half-exists by accident (two diplomacy events with different completeness) and the
fix is to finish it, not duplicate it a third time.

### 1. Diplomacy rationale — finish the existing, partially-wired event

- `GameEvents['diplomacy:treaty-declined']` gains an optional `reason?: TreatyDeclineReason`
  field (the exact type `ai-treaty-consent.ts` already exports — reused verbatim, not
  re-derived).
- `proposeTreatyAgreement`'s treaty branch (non_aggression_pact/trade_agreement/open_borders/
  alliance/arms_control_pact) emits `diplomacy:treaty-declined` with `reason: consent.reason` when
  refused — today it emits **nothing at all**.
- `proposeVassalage` attaches `reason: consent.reason` to its existing emission — today the event
  fires but the reason is dropped.
- **Peace gets its own parallel event, `diplomacy:peace-declined: { proposerCivId, targetCivId,
  reason?: TreatyDeclineReason }`**, not an overload of `diplomacy:treaty-declined` — `TreatyType`
  (the type `event.treaty` is keyed on, and `TREATY_LABELS`'s key) structurally excludes `'peace'`
  (peace is a war-state transition, not a treaty), and the codebase already treats peace as a
  parallel-but-distinct concept (`diplomacy:peace-made` exists alongside `diplomacy:treaty-
  accepted`, not folded into it). `proposeTreatyAgreement`'s peace branch emits this new event on
  refusal — today it emits **nothing**. A new `routePeaceDeclined` handler (mirroring the existing
  `routePeaceMade`'s shape) delivers it the same recipient-scoped way.
- `routeTreatyDeclined`/`routePeaceDeclined` both gain a shared `TREATY_DECLINE_REASON_TEXT:
  Record<TreatyDeclineReason, string>` lookup, appended to the existing message when a `reason` is
  present (`'peace-not-acceptable'` → *"They believe they can still prevail and refuse peace."* —
  the issue's own example, verbatim in spirit). Absent `reason` (the human-explicitly-declined-an-
  AI's-own-offer case, where there is no AI "reason" — the human made that choice) keeps today's
  plain message, byte-identical, so this is purely additive.
- **Viewer safety is structural, not a new check to invent**: `routeTreatyDeclined` already
  delivers only to `event.proposerCivId` via `notification-delivery`'s recipient-scoped `deliver`
  (never a broadcast) — this is immediate feedback to the proposer's own action, so there is no
  fog-of-war question at all (the proposer already knows they made the proposal and who the
  target is; the only new information is *why*, computed from the target's own already-visible-to-
  itself relationship/personality inputs, never from anything the proposer couldn't already infer
  existed).

### 2. Barbarian archetype clue — extend `deriveBarbarianWarnings`/`presentStrategicWarning`

- `deriveBarbarianWarnings` gains a call to `resolveBarbarianArchetype(state, campId)` (already a
  cheap, pure, stable function — no new sensing, no new hidden-info exposure, since archetype
  identity itself is not secret game *state* the way a hidden army composition is; it is a
  *behavioral pattern* the player is meant to learn to recognize, matching the issue's own framing
  "clues that distinguish raiders, warlords..."). The existing `StrategicWarning.actorName` field
  becomes archetype-aware (`'Raiders'` / `'Predators'` / `'Warlords'`) instead of the current
  hardcoded `'Raiders'` for every camp.
- `presentStrategicWarning` gains archetype-specific phrasing reusing the SAME `kind: 'raid'`
  branch structure already there (no new `kind` values needed — `predator-hunt`/`warlord-
  mobilizing` map onto the existing raid-warning shape; only the actor name and message template
  differentiate). A Warlord's `'mobilizing'`-phase plan (not yet advancing) additionally reuses
  the EXISTING `deriveMajorWarnings`-style `'mobilizing'` kind check, generalized to also read
  barbarian camp plans (today `deriveMajorWarnings` only reads `opponentAI.majorCivs`), so a
  mobilizing Warlord camp gets the same "gathering force" phrasing a mobilizing major civ already
  gets — reusing, not duplicating, the existing mobilization copy.
- This satisfies acceptance criterion #8 directly and is the smallest possible change: the
  evidence-gating, dedup, and cooldown machinery is completely untouched.

### 3. Strategic posture — a new, narrow warning kind on the same pipeline

- New `StrategicWarning.kind` value: `'posture-shift'`. Fired only for the two "noteworthy"
  transitions (`dominate` and `recover`/`deter`'s shock entry — *not* every `expand`⇄`develop`
  fluctuation, which would be spammy and low-value) — mirroring the existing `domination`/
  `domination-eased` pair's own restraint (only fires on a state *change*, not every round).
- **Viewer gate**: reuses `shouldListMajorCivForViewer` (`viewer-intel.ts`) — the viewer must
  already have contact/current evidence of the actor civ, the same bar every other existing
  warning in this file already clears via `planEvidence`/`isVisible`. A civ the player has never
  met produces no posture warning, structurally (the derive function is never even reached for an
  unmet civ, not merely told not to render one).
- **Presentation is deliberately vague, matching real earned uncertainty**: `dominate` →
  *"Intelligence suggests [civ] is pursuing open conquest."*; `recover`/shock →
  *"[civ] appears to be recovering from a recent setback."* No numeric intent, no raw enum name, no
  certainty framing beyond "intelligence suggests" / "appears to be" — matching the issue's own
  "can be intentionally incomplete or uncertain... but must not be false relative to the
  represented reason" requirement. `dominate`'s trigger condition (`doctrine.pursuit`-gated in
  #1086, itself gated on the `'aggressive'` personality trait) means this warning is never false:
  it only fires when the civ's actual internal state really is in a conquest-oriented intent.

### 4. Debug correlation

Every `StrategicWarning` already carries `warningKey` (a stable, deterministic identity) and
`actorId`; in a development build, the debug/inspector surface reads the **live** `opponentAI`
state at `actorId` (major civ plan, or `resolveBarbarianArchetype` + camp plan) to show the exact
canonical trace a given warning came from — this needs no new plumbing, since `warningKey` already
uniquely identifies "which decision produced this," and the canonical state it names is already
inspectable. A tiny `describeWarningTrace(state, warning)` dev-only helper (never imported by
production UI, guarded the same way other dev-only surfaces in this codebase are) does this
lookup and returns a plain object for a console/overlay to print — not a new persisted trace log.

### Non-goals for this MR (explicit)

- **No new "opponent overview" panel.** The issue's own suggested-surfaces list marks this
  "optional," and the arc brief explicitly warns against forcing a large new panel for a single
  bullet. Deferred; posture/archetype clues surface through the existing notification/warning
  pipeline only in this MR.
- **No natural-language generation.** Every string is authored, bounded, and keyed off a closed
  reason enum — identical in spirit to `presentStrategicWarning`'s existing switch and
  `domination-presentation.ts`'s `rowForFact`.
- **No war-declaration rationale.** The issue's "war...committed elsewhere" example would need a
  reason to be attached to `shouldDeclareWar`'s boolean, which today has none (unlike
  `TreatyConsent`) — adding one is a genuinely separate, un-scoped change to `ai-personality.ts`'s
  war-scoring contract, not a translation-layer change. Alliance refusal specifically **is**
  covered (alliance already routes through `evaluateTreatyConsent`).
- **No change to #1086/#1087/#1089's own AI decision logic.** This MR is presentation-only; it
  reads already-computed canonical state and emits already-existing-shaped events with richer
  payloads. No AI behavior changes.

## Inline critique (Stage 2 requirement)

- **Is it solving the root problem?** Yes — the player currently gets zero explanation for the
  single most common diplomatic frustration (a refused peace offer), and #1089's brand-new
  archetype work is completely invisible; both are now real, narrow, high-confidence fixes.
- **Is any proposed state unnecessary?** No new persisted `GameState` field. `reason` on
  `diplomacy:treaty-declined` is an event payload (ephemeral, bus-only), not a save field.
  `'posture-shift'`'s cooldown reuses the existing `lastWarningTurnByKey` ledger, already
  persisted for exactly this purpose.
- **Are we duplicating an existing mechanism?** The opposite — this design's entire premise is
  refusing to duplicate `strategic-warning-system.ts`. The diplomacy fix extends an event that
  already exists rather than inventing a new one.
- **Does it introduce hidden-information access?** No new state is read for the mobilization/raid
  cases (same `sensedUnits`/visibility calls already used). Posture reuses the existing
  contact-evidence gate. Diplomacy-decline reason is proposer-scoped immediate feedback, not a
  new leak (see §1 above).
- **Does it create new save/migration burden?** No — confirmed no persisted field changes above.
- **Is the behavior actually observable/testable?** Yes — every new/changed field is plain typed
  data; presentation output is a plain string a test can assert on directly.
- **Is scope small enough for a focused PR?** Yes — three additive extensions to two already-
  existing, already-tested files/patterns, no new subsystem.
