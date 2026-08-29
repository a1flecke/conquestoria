# #901 Bilateral Diplomacy Consent Design

## Status

Proposed 2026-08-29. This design replaces unilateral bilateral-treaty signing
with a shared proposal, consent, and commitment lifecycle. It does not add
Open Borders movement, bargaining, treaty timers, or network multiplayer.

## Current-main audit

`applyDiplomaticAction` immediately signs both diplomacy states for every
human-originated bilateral treaty. `basic-ai` immediately signs AI-to-AI
treaties. `evaluateProposal` has no caller and only handles four treaty types;
it lacks Arms Control and final legality checks. The existing pending-request
model is serializable, recipient-owned, save-safe, and expires after ten turns,
but it only deduplicates an exact direction, not a reciprocal proposal.

`acceptDiplomaticRequest` already enforces recipient ownership and computes an
Arms Control cap at acceptance. Its bilateral signing logic duplicates the
direct human and AI paths. The Diplomacy panel renders only requests addressed
to `state.currentPlayer`, which is the right visibility foundation; however,
the panel must be explicitly closed at hot-seat handoff. Treaty-proposed
notifications are delivered to the target civ, but treaty-accepted has no
presentation handler.

Peace currently shares pending-request state but has special effects: it is
legal only while both parties are at war and commitment calls `makePeace` for
both sides and cancels invalid NetworkPlans. Those effects remain special, but
the consent lifecycle should be shared.

## Goal and non-goals

Every bilateral diplomatic action must require target consent. A human must not
sign for an AI or another hot-seat human, and one AI must not sign for another.
The result must be deterministic, viewer-safe, save-safe, and immediately
understandable.

This issue does not implement Open Borders movement/access, treaty bargaining,
new economic payments, treaty duration redesign, or broad relationship-system
changes. Vassalage is a special `TreatyType`, but has no live player acceptance
path or unilateral auto-sign caller today; its league, tribute, protection, and
independence consequences require a dedicated lifecycle tracked in
[#910](https://github.com/a1flecke/conquestoria/issues/910). #901 must not
create a second vassalage path while correcting live treaty consent.

## Architecture

Introduce one domain-level lifecycle with three responsibilities:

1. `proposeDiplomaticAgreement` validates contact, pair-level duplicate state,
   and proposer-side availability. It returns a typed outcome: `accepted`,
   `declined`, `pending`, or `unavailable`.
2. `evaluateAgreementConsent` is target-owned. Human targets return `pending`;
   AI targets use canonical deterministic treaty evaluation with only
   relationship, personality, final legality, and already-known strategic
   capability inputs. Peace uses an explicit target-side evaluator: it accepts
   only while both sides remain at war and when the target's own visible
   strength estimate is unfavorable or its relationship has recovered. It must
   not inspect the proposer's hidden units, cities, or arsenal.
3. `commitDiplomaticAgreement` revalidates the agreement immediately before it
   mutates state. It is the only helper allowed to make a bilateral agreement
   effective. Treaty commits sign each side once, apply the existing treaty
   relationship bonus once, remove pair/type pending proposals, and emit one
   accepted event. Peace commits make peace bilaterally, clear pair peace
   requests, and preserve the existing invalid-NetworkPlan cleanup.

`applyDiplomaticAction` becomes a compatibility dispatcher for hostile,
unilateral actions and the shared proposal lifecycle; it must never directly
sign a bilateral treaty. AI turn processing also calls the shared lifecycle
instead of mutating treaty arrays. UI/controllers request an action and render
the returned outcome; they never determine consent or perform bilateral state
mutation. Accepted and declined outcomes have recipient-scoped presentation
events so state mutation is not coupled to a controller toast.

## Consent matrix

| Proposer | Target | Resolution |
|---|---|---|
| Human | AI | Evaluate immediately; commit or decline immediately. |
| AI | Human | Queue recipient-owned request; the human explicitly accepts or declines. |
| Human | Human | Queue recipient-owned request; no treaty exists until recipient accepts. |
| AI | AI | Target AI evaluates immediately; commit only when accepted. |
| Any | Any, peace | Use the same lifecycle; target consent is required, then peace-specific commit semantics run. |

No AI request is queued merely to imitate consent. No human can accept a
proposal addressed to another player. A reciprocal same-type proposal is one
pair-level pending proposal, not a second mirrored record. An active treaty or
an existing pair/type proposal prevents another proposal.

## Legality and AI evaluation

Legality is enforced both at proposal time and at commitment time. Commitment
revalidation makes stale proposals safe when war begins, a treaty is signed by
another path, contact/prerequisites change, a save is reloaded, or an Arms
Control prerequisite disappears.

The evaluator remains deterministic. It uses the target's relationship to the
proposer and personality, and rejects unavailable, duplicate, or
war-incompatible agreements before treaty-specific preference. It covers:

- Non-Aggression Pact: not at war, not duplicate, moderate relationship and
  diplomacy focus.
- Trade Agreement: not at war, positive relationship, and no duplicate.
- Open Borders: not at war, stronger relationship and diplomatic caution; this
  does not grant movement access in #901.
- Alliance: highest relationship/trust bar and no active hostility.
- Arms Control Pact: existing #545 project/superweapons/capability gates,
  non-duplicate status, relationship and diplomacy focus, using only
  known—not hidden—strategic capability.
- Peace: existing war-only legality and consent; the target AI accepts only
  when its own visible military estimate is unfavorable or relations have
  recovered; its effect stays separate inside the shared commit dispatcher.

Explorer, Standard, and Veteran use identical proposal legality, visibility,
and consent thresholds in this issue. The existing project convention permits
difficulty to alter AI decision quality/eagerness, not rules or information.
Adding a new threshold knob without a proven gameplay need would make rejection
less legible and is out of scope.

## Player experience and privacy

| Viewer/action | Immediate visible result |
|---|---|
| Human proposes to AI | “Rome accepted/declined your Trade Agreement.” Declines use a short qualitative reason such as “Relations are too strained.” |
| Human proposes to human | “Trade Agreement proposed to Rome.” No acceptance prediction or target-private detail. |
| Human recipient opens Diplomacy | Incoming request describes its effect, remaining response time, and Accept/Decline. Arms Control previews the cap calculated from current arsenals. |
| Recipient accepts or declines | Panel rerenders; both involved players receive the outcome in their own notification logs. |
| Hot-seat handoff | Diplomacy panel closes, proposal details do not survive the veil, and no proposal/response sound plays for the next player before their turn. |

Use plain labels, effect text, expiry text, and recognizable accept/decline
actions; never show numeric AI scores. This supports both a child learning the
system and an expert player who needs a fast, predictable decision. Accepted
and declined events deliver to each involved human's own notification log.
The existing generic notification sound is acceptable only through
recipient-scoped delivery; tests must prove it never plays while a different
hot-seat player is active. No dedicated treaty SFX is added.

## Data and persistence

Keep `PendingDiplomaticRequest` persisted as the minimal request record. No AI
score, hidden intelligence, or cap is persisted in a proposal. The Arms Control
cap is recomputed by the canonical #545 helper only at commitment. Legacy saves
with no `pendingDiplomacyRequests` still normalize to `[]`. Expired, malformed,
eliminated-party, already-signed, or no-longer-legal requests are removed
safely rather than signed. A stale acceptance returns a non-success outcome and
delivers an explanation without exposing target-private evaluation details.

## Comparable-game review

Humankind lets the recipient accept, refuse, or seek compensation for treaty
proposals. Its explicit consent is the appropriate baseline; counter-offers
are deliberately outside this focused implementation.

Endless Legend surfaces an acceptance gauge, which makes the system readable
but also invites optimization against a visible score. Conquestoria should use
qualitative reasons instead of a gauge. Civilization VI demonstrates the
opposite pitfall: general explanations help, but outcomes that feel arbitrary
or repetitive undermine trust. The design therefore uses deterministic rules,
short reasons, and no repetitive modal interruptions.

Sources: [Humankind diplomacy overview](https://community.amplitude-studios.com/amplitude-studios/humankind/blogs/764),
[Endless Legend diplomacy guide](https://steamcommunity.com/sharedfiles/filedetails/?id=523798721),
and [TIME’s Civilization VI review](https://time.com/4542016/civilization-6-review/).

## Risks and mitigations

- **Duplicate signing:** only the shared commit helper signs; test exactly one
  entry per side.
- **Hot-seat leaks:** recipient-scoped request lookup, explicit panel close at
  handoff, recipient-scoped notification delivery, no early SFX.
- **Stale state:** revalidate on acceptance and remove pair/type requests on a
  successful commit; remove invalid pending requests without signing them.
- **Undefined peace behavior:** use the target's own visible strength estimate
  and relationship in the explicit peace evaluator.
- **Incomplete vassalage expansion:** #901 has a regression guard only;
  dedicated consent/UI work is tracked by #910.
- **Arms Control regression:** compute the cap at commitment and retain current
  production-cap, superweapons, and project-gate coverage.
- **AI cheating:** evaluator receives only target-owned relationship/personality
  data plus current known-capability predicates.
- **Player confusion:** outcome text names the counterpart, agreement, and a
  qualitative failure reason; the UI refreshes after every decision.

## Test design

System tests cover each live treaty type for accepted, declined, duplicate,
reciprocal, stale, war-invalidated, and exactly-once commit cases. They also
cover peace through the shared lifecycle, including target-AI acceptance and
rejection based on visible-strength/relationship inputs, while proving its
NetworkPlan cleanup and at-war requirements remain intact. A regression proves
#901 does not create a vassalage signing path.

AI tests prove target-side evaluation for human-to-AI and AI-to-AI, stable
results for an identical seed/state, all difficulty tiers sharing legality and
information boundaries, and no hidden strategic-arsenal read. #545 tests prove
the Arms Control cap is calculated at actual acceptance and production
enforcement remains intact.

Controller and UI tests replay proposal, accept, decline, open-panel rerender,
expiry text, and precise notification text. Hot-seat tests prove only the
recipient sees a request, a proposer cannot self-accept, the Diplomacy panel
closes across handoff, and no private notification/audio leaks. Save tests
prove a human-to-human pending proposal survives a round trip,
accepts/declines after reload, and legacy saves still normalize. Focused solo
tests preserve AI-to-human and human-to-AI flows.
