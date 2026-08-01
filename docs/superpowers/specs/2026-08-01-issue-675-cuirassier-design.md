# Issue #675: Cuirassier Delivery Design

## Outcome

Add Cuirassier as the Era 6 heavy-mounted option at Rifle Tactics plus Professional
Army. It gives players a durable open-ground attacker without replacing the faster,
cheaper Cavalry pursuit choice or removing the polearm answer.

## Approved contract

| Property | Cuirassier |
| --- | --- |
| Stable type | `cuirassier` |
| Gate | Rifle Tactics and Professional Army |
| Resources | Horses and Iron |
| Cost / strength / movement / vision | 150 / 52 / 3 / 2 |
| Combat rule | +15% strength only when initiating an attack on open ground |
| Chain | Knight -> Cuirassier -> Tank |
| Role | Mounted shock unit with existing `mobile` and `capture` AI roles |

Cavalry remains unchanged at 140 cost, 44 strength, 4 movement, and its existing
weakened-target pursuit rule. Cuirassier is deliberately more expensive, slower, and
resource-hungrier; it is therefore not a strict replacement. Spearman and Pikeman
continue to receive the canonical anti-mounted counter against it.

## Architecture and data flow

The delivery is definition-driven. `UnitType`, unit definitions, trainable-unit
catalog data, upgrade metadata, tech unlock data, combat-role metadata, typed combat
modifier data, sprite catalog data, and SFX/locomotion data all describe the same
stable type. Existing generic helpers consume those facts:

`production eligibility -> AI candidate/research evaluation -> unit creation ->
combat context/modifier facts -> preview and unit information presentation`.

No UI, AI, or combat-resolution branch may special-case Cuirassier by ID. The
existing `onOpenGround` modifier condition supplies the tactical rule, including
owner-visible applied and ignored facts in combat presentation.

## Player experience and accessibility

The first player-facing sentence is: “Armored cavalry breaks open ground but is
slower than Cavalry and vulnerable to polearms.” It is under 18 words, explains the
trade-off in plain language, and does not depend on color, animation, or audio.

The production and unit-information surfaces retain the complete legal catalog. The
combat preview shows the initiating player's own modifier as text and an icon-backed
unit identity; an open-ground attack shows the applied bonus and a rough-ground attack
shows the Cuirassier fact as “not active.” It never exposes an opponent's owner-only
facts. Existing mobile target sizes and reduced-motion behavior are retained.

### Player truth table

| Situation | Player-visible result |
| --- | --- |
| Both techs and both resources are available | Cuirassier is available with its cost, requirements, and concise role text. |
| Either gate or either resource is absent | Cuirassier is not trainable; no partial prerequisite is presented as legal. |
| Cuirassier attacks open ground | Combat preview and resolution show the +15% fact. |
| Cuirassier attacks rough ground or defends | The bonus is visibly ignored; no misleading claim of a charge bonus. |
| A hot-seat player opens their city or combat preview | Only the active viewer's legal production and earned combat information is rendered. |

### Misleading UI risks

- Rifle Tactics alone and Professional Army alone must never count as Cuirassier
  availability.
- A resource-short city/civilization must never show it as trainable.
- The open-ground fact must not be shown as applied on rough terrain or defense.
- Recommendations may rank Cuirassier but must not hide other legal mounted choices.

## AI, difficulty, and play styles

Existing catalog-driven production and research paths consume the new unit through
the same eligibility and role data as human players. The AI evaluates only its own
completed technologies, resources, cities, units, and earned observations. It gains
no hidden rival knowledge and no Cuirassier-specific production or tactical branch.

Explorer, Standard, and Veteran share Cuirassier legality, definitions, modifiers,
and information boundaries. Their existing typed decision-quality/pressure settings
remain the only difficulty distinction. The content supports casual and younger
players with a simple “stronger but slower” choice, defenders through affordable
polearm counterplay, expansionists through open-ground breakthrough, and optimizers
through movement, cost, resource, and terrain trade-offs.

## Saves and upgrade compatibility

Changing Knight's obsolescence from Tank Warfare to Rifle Tactics changes the
legality of persisted Knight queues. Schema 11 will grant every pre-existing queued
Knight one matching `legacyTechGrace` entry. Each entry permits exactly one queued
Knight completion, then is consumed. It preserves saved units, queue order, and
orders; no unit conversion occurs.

The migration is deterministic and idempotent. Normalization accepts only the
explicit grandfathered types (`cavalry` and `knight`) and removes malformed or
unrelated entries. It covers schema-0, schema-10, current-schema, malformed, and
repeat-load inputs.

## Assets and sound

This mechanics delivery registers the valid temporary Cuirassier sprite and SFX
fallbacks from Knight, including animal locomotion. The fallback is documented as
temporary and is replaced only by #708 (Cavalry/Cuirassier visuals) and #714
(mounted/beast combat audio). Existing mixer, mute, coalescing, and hot-seat
recipient rules are unchanged; visual/text combat facts remain sufficient when audio
is muted.

## Verification design

Tests are written red first and prove:

- both-tech and both-resource requirements, including each negative prerequisite;
- exact open-ground initiation bonus, no rough-ground/defending bonus, and the
  anti-mounted counter;
- Cuirassier versus Cavalry non-domination through cost, movement, resources, and
  conditional tactical strengths;
- explicit Knight -> Cuirassier -> Tank links and tech-unlock/catalog completeness;
- catalog-driven AI production and research with no-resource and owned-state cases;
- Explorer, Standard, and Veteran legality parity;
- human and non-human combat callers using the common modifier/context path;
- production/combat presentation in solo play and current-viewer isolation in a
  two-human hot-seat fixture;
- schema-11 queue preservation, one-time consumption, malformed input cleanup, and
  idempotent round trips; and
- temporary sprite, locomotion, and SFX catalog coverage.

The focused mirrors and source-rule checker run first. Before a PR, inspect both
committed and local deltas, then run `yarn build` and the full durable test suite for
the current worktree/HEAD.
