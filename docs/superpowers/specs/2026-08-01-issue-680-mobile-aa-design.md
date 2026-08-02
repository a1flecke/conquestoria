# Mobile AA Field Protection Design

**Issue:** #680 — Add Mobile AA field protection and escort AI

## Goal

Add Mobile AA as a simple, mobile answer to enemy aircraft: a player positions it next
to a valuable formation to grant air-only protection. It is a support specialist, not
a stronger infantry unit or a second, stacking city-defense system.

## Contract

- Mobile AA unlocks at Air Superiority, costs 175 production, has strength 32,
  movement 2, and a range-1 unit attack.
- It grants friendly defenders within hex distance 1 a flat +8 defense only when
  attacked by an air unit. Direct combat remains intentionally weak.
- Mobile AA, Anti-Air Battery, and later same-group providers use the existing
  strongest-provider rule: only the strongest applicable `ground-air-defense` provider
  applies; ties resolve stably by provider ID. Providers never add together.
- The canonical resolver remains the sole gameplay authority. Combat preview,
  resolution, overlay, AI evaluation, and both release targets consume its typed,
  viewer-safe output.
- No new persisted state or save-schema migration is introduced. A Mobile AA is an
  ordinary serialized unit and all coverage is derived from the current unit/city map.

## Architecture and data

`UnitDefinition` and `Building` gain the same optional typed air-defense-provider
capability metadata. Mobile AA declares `{ radius: 1, defenseModifier: 8,
stackingGroup: 'ground-air-defense' }`; Anti-Air Battery declares the equivalent
building capability. The owning catalog supplies provider kind, stable ID, and label.
The air-defense system enumerates providers from these definitions rather than branching
on Mobile AA IDs. It returns the same normalized provider shape for combat and
presentation.

The renderer obtains providers from a viewer-filtered enumeration helper, not by asking
for coverage only at city coordinates. Consequently a Mobile AA operating entirely in
the field appears in the overlay even if no city lies in its radius. Visibility remains
strict: owners see their providers; other viewers see only providers on currently
visible tiles, never hidden units, bases, or stale live locations.

Mobile AA is added consistently to the stable unit type, unit definition and
description, trainable catalog, Air Superiority unlock, role catalog, production icon,
sprite catalog, locomotion/SFX catalog, and every generic completeness path. A temporary
vehicle-compatible art/SFX fallback is acceptable only when registered explicitly and
described accurately.

## Balance and player experience

The 175/32/2/range-1 envelope deliberately trades direct power for formation safety.
It gives defensive, builder, and combined-arms players a legible response to air
pressure while letting aggressive players counter it by engaging the lightly defended
provider on the ground. The plain-language unit text is: "Protects adjacent allies:
+8 defense against air attacks." The advanced combat preview shows the provider,
modifier, and any superseded source without requiring players to learn stacking jargon.

Production and unit information surfaces must show its cost, unlock, range, weakness,
and protection effect. They must continue to expose the complete legal catalog. On a
queue action, the open panel refreshes its active item, order, and ETA immediately.
The existing coverage toggle renders a labelled radius around every provider the active
viewer is allowed to know. This works at touch target size and does not assume an older
player understands an icon alone.

When the protection becomes relevant in a resolved combat, standard mixer-routed SFX
may play once through the existing combat presentation path; no sound may be scheduled
from rendering. The equivalent visible combat fact/warning always appears, including
when sound is muted, so the mechanic is understandable without audio.

## AI, difficulty, and information boundary

Mobile AA receives a typed strategic role and a dedicated tactical escort ranking.
It chooses an eligible friendly formation from its own assigned/nearby units only when
a currently visible hostile strike-capable aircraft is within the definition's
operational range of that formation. The AI deliberately treats that as a conservative
observed threat without reading whether the aircraft is based, its base location, or its
remaining private action state. It ranks targets by threat relevance, protected
formation value, legal distance, and stable ID tie-break; it moves to a legal destination
that keeps the formation within radius 1. If no such target exists, ordinary plan
movement remains the fallback.

The AI derives every threat input from `MajorCivPerception`. It cannot read an unseen
air base, a hidden aircraft's live coordinate/type, an opponent production queue, or
the global roster. A trusted remembered sighting may create bounded production caution,
but it cannot identify a tactical escort target or attack target. Explorer, Standard,
and Veteran share unit statistics, gates, legality, resolver results, and perception;
existing challenge profiles may only affect which near-best legal escort choice is
selected. Camps receive no special hidden-air knowledge or Mobile-AA exception.

## Player truth table

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Air Superiority is incomplete | Open production | Mobile AA is unavailable with its gate named. |
| Air Superiority is complete | Open production | Mobile AA is reachable with cost, role, range, and +8 effect. |
| A friendly defender is adjacent to Mobile AA | Preview an air attack | Preview shows Mobile AA +8 and resulting defense. |
| A stronger same-group provider applies | Preview an air attack | Only the stronger modifier applies; Mobile AA is visibly superseded where known. |
| Mobile AA is remote from cities | Toggle AA overlay | Its radius appears for its owner and any viewer that can currently see it. |
| Sound is muted | Resolve protected air combat | The visible protection fact/warning still appears; no repeated SFX is attempted. |
| Hot-seat player changes | Open overlay or preview | The new active viewer sees only their own or currently visible provider details. |

## Misleading UI and save risks

- The overlay must not omit field providers, imply all AA stacks, or disclose hidden
  providers. A radius is factual coverage, not a promise that an unknown enemy aircraft
  is present.
- A production recommendation cannot hide other legal choices.
- Combat facts must say "against air attacks"; they must not imply an all-purpose +8.
- Existing saves may lack the new unit because it did not yet exist; that is valid. Saves
  containing Mobile AA must load as ordinary units, and malformed legacy state must not
  create a phantom provider.

## Verification requirements

Write failing focused tests before implementation. Required coverage includes:

1. Catalog completeness, Air Superiority gate, exact stats, description, icon, sprite,
   SFX/locomotion fallback, and AI production/research eligibility.
2. Radius-1 coverage (including horizontal wrap), no coverage beyond radius, +8 only
   versus air, weak direct combat, strongest-only stacking, deterministic tie-break,
   and immediate loss of coverage after movement or destruction.
3. Human and AI paths through the same resolver, including an AI escorting a valuable
   formation threatened by a currently visible aircraft; no escort for a remembered,
   expired, untrusted, or absent threat; and a negative proof that hidden
   aircraft/base/queue state does not affect the decision.
4. Explorer, Standard, and Veteran parity for legal information and candidate actions,
   plus deterministic bounded quality differences only where existing profiles apply.
5. Rendered production, unit inspection, combat-preview, overlay, and muted-audio
   warning behavior. Include the remote-field overlay regression and the provider
   visibility negative.
6. Save export/import and load normalization for old saves and saves containing Mobile
   AA; solo play; two-human hot seat switching; and no cross-player overlay, preview,
   notification, or audio leak.

## Inline review resolutions

| Dimension | Resolution |
| --- | --- |
| Balance and fun | Mobile, localized +8 protection creates a clear combined-arms choice without replacing frontline combat. |
| Ages 7–43 and play styles | Plain role text and always-visible facts support casual play; positioning, scouting, and counterplay reward deeper play. |
| Difficulty and computer players | Same definitions, legal actions, and earned intelligence at every difficulty; only existing legal-choice quality varies. |
| UI/UX | Full catalog, immediate queue refresh, viewer-safe overlay, combat preview, accessible wording, and muted-audio visual feedback are required. |
| Architecture/extensibility | Typed provider metadata and shared enumeration prevent Mobile-AA-specific resolver branches and support future AA providers. |
| Data/saves/SFX | Derived coverage requires no migration; serialize/load tests and registered temporary fallback assets preserve compatibility. |
| Regressions | Resolver parity, human/AI paths, hidden-intel negatives, all difficulties, solo, and hot-seat isolation are mandatory. |
