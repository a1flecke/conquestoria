# Combat Modifier Facts Design

**Issue:** #669 — Expose named roster modifiers in combat preview and history

## Goal

Explain why a combat strength changed without changing combat balance or revealing
information that the current viewer has not earned.

## Scope

The combat calculation emits stable, serializable modifier facts at evaluation time.
The combat preview and recipient-specific combat history consume the same evaluated
facts. This delivery does not add or rebalance a combat modifier, change difficulty
formulas, or add modifier-specific sound effects.

## Data contract

Introduce a plain-object `CombatModifierFact` with:

- a stable string `key` identifying the canonical rule;
- structured label parameters rather than preformatted UI strings;
- a signed numeric contribution and whether it is flat or multiplicative;
- an outcome of `applied`, `ignored`, `capped`, or `superseded`;
- a source scope that can be projected for an authorized or unauthorized viewer.

`CombatModifierFact` is calculation-facing. Its projection is a separate plain object
containing only a safe label, the permitted value and operation, the outcome, and a
short explanation key. The projection never retains a rival technology, national
project, unit, route, or provider identity unless that identity is already authorized
for its recipient.

Facts are created by the canonical modifier/combat evaluation helpers and captured in
the calculation result before combat state mutates. UI code only formats them. It must
not scan final state, duplicate modifier predicates, or infer a source from a unit ID.

`capped` and `superseded` are supported outcome values, but may be emitted only by a
real canonical cap or strongest-source rule. This issue must not invent either outcome
solely to populate presentation rows.

## Viewer scope and history

Raw calculation facts are not automatically safe for every event listener. A
viewer-scoped projection must reveal a source only when the viewer is entitled to know
it. Otherwise it retains the permitted visible total with an intentionally redacted,
plain-language source label.

The preview uses that projection for the current viewer. Combat history persists the
same recipient-specific projection in a typed optional `combatDetails` field on its
existing `NotificationEntry`; reopening history must read that snapshot rather than
reconstruct facts from later state. Notification text remains concise; an explicit
details control expands the stored projection.

The projection is computed before presentation, respects existing combat visibility,
and is never rendered or played after a hot-seat handoff for an unauthorized human.

## Player experience

The default preview starts with a plain-language explanation of no more than 18 words,
for example: “Your pikeman is strong against cavalry.” It shows the decisive applied
fact only, uses icon plus text, and does not rely on color, sound, or animation. Exact
values, conditions, ignored rows, superseded layers, and source detail are available
through an explicit expandable calculation.

This keeps the decision understandable for younger and casual players while preserving
the legal explanation needed by experienced players. It does not hide legal actions or
claim a bonus can be used when its condition is unmet.

## Gameplay, AI, difficulty, and audio

Facts are observational. The existing formula, evaluation order, seeded randomness,
and modifier values remain unchanged. Explorer, Standard, and Veteran produce the
same facts for the same state. Difficulty-specific decision quality or pressure does
not alter this contract.

Human, AI, turn-manager, pirate, minor-civilization, and other combat callers continue
to use the shared combat context and resolver. AI may consume canonical calculation
results from its owned or earned observations, but must not consume a richer
viewer-presentation projection or gain hidden rival sources through it.

No new SFX is introduced. Existing combat SFX remains gated by the existing visible
viewer path and modifier facts receive the same visual/text explanation in preview and
history.

## Persistence

Add the next save schema version only after rebasing because recipient-scoped
`NotificationEntry.combatDetails` is persisted. Normalize the optional record
idempotently: accept valid projections, discard malformed detail without discarding its
parent notification, and preserve legacy notifications without fabricated detail.
Cover schema 0, the immediately preceding schema, current saves, malformed records,
and a mid-combat round-trip.

## Verification

Tests begin red and cover:

- an applied counter and an exact preview/result snapshot match;
- an ignored conditional modifier and two out-of-role negatives;
- capped and superseded facts only where a real rule produces them;
- redaction of unauthorized source identity while preserving the allowed total;
- human and non-human emitter parity through the shared resolver;
- Explorer, Standard, and Veteran parity for equal state;
- solo presentation, hot-seat handoff isolation, and immediate preview/history refresh;
- deterministic balance fixtures for predecessor, successor, intended counter, and
  same-era generalist;
- save migration and normalization for persisted recipient history detail.

## Out of scope

Ground-based anti-air strongest-source stacking, new roster units, modifier rebalancing,
and new bespoke audio or visual assets belong to their respective child issues. This
slice only establishes truthful, reusable explanation facts for current combat rules.
