# Issue 710 Air Defense and Orphaned Visuals Design

**Issue:** #710 — `combat(547.46): Visual batch: air combat and air defense`

## Goal

Replace the remaining SAM Site fallback and the five orphaned unit fallbacks with
readable, role-distinct visual assets. At map scale, a player can distinguish each
unit or building without a label; animation reinforces identity but never carries
information by itself.

## Scope and drift resolution

The current `origin/main` audit establishes the six owned replacements:

| Target | Current donor | Ownership decision |
| --- | --- | --- |
| `sam_site` | `RadarStationSprite` | Original #710 scope; still unresolved. |
| `paratrooper` | `InfantrySprite` | #543 is closed and has no active art delivery. |
| `naval_strike_aircraft` | `JetFighterSprite` | #582 is closed and has no active art delivery. |
| `maritime_patrol_aircraft` | `ReconAircraftSprite` | #582 is closed and has no active art delivery. |
| `supercarrier` | `CarrierSprite` | #582 is closed and has no active art delivery. |
| `great_general` | `WarriorSprite` | #544 is closed and has no active art delivery. |

Issues #711 and #713 retain their explicitly active, separate ownership of the
other seven audited aliases. This MR must not alter Trebuchet, Rocket Artillery,
Battleship, Missile Cruiser, Beast Stampede Herd, Rogue Handler, or Rogue Elephant.

This is visual-only work. It changes no gameplay definitions, combat formulas, AI,
difficulty, research gates, saves, SFX, production rules, UI action behavior, or
hot-seat information boundaries. Existing overlay handling remains responsible for
fog, selection, health, disabled state, camera scale, and reduced motion.

## Visual direction

Use the repository's flat, geometric, ink-outlined right-facing SVG language.
Faction identity comes only from the supplied palette; material surfaces use the
existing metal, cloth, skin, earth, and ink tokens. Each asset stays warm and
adventurous rather than grim, toy-like, or overloaded at 40px.

| Target | Role-visible silhouette and required cues | Must not read as |
| --- | --- | --- |
| SAM Site | Low protected bunker, angled missile launcher, tracking dish, and small radar panel | The tall Radar Station tower or an Anti-Air Battery |
| Paratrooper | Land infantry landing in a braced step, helmet, large squared parachute pack, rolled canopy, and rifle | Ordinary Infantry, a civilian, or an aircraft |
| Naval Strike Aircraft | Carrier-capable prop aircraft with folded-wing cue, low attack profile, and belly torpedo or dive bomb | A Jet Fighter or strategic Bomber |
| Maritime Patrol Aircraft | High-wing twin-engine patrol plane with a search-radar blister and observation windows, no weapon silhouette | Recon Aircraft or a fighter |
| Supercarrier | Long, broad deck with a clearly larger island, angled deck markings, and a few tiny parked-aircraft shapes | The smaller Carrier or a land airfield |
| Great General | Non-combat command figure with map case, raised signal flag, and field glasses | A Warrior, melee attacker, or magical hero |

## Asset architecture and motion

`SamSiteSprite` is a dedicated building fallback registered through
`BUILDING_SPRITE_CATALOG`; buildings have no native-v2 unit path. The other five
targets use the complete #709 unit pipeline:

`design/conquestoria-sprites/lib/units-v2.jsx` → `scripts/serialize-sprites.mjs`
→ generated `src/renderer/sprites/v2/*.svg.ts` → `v2/index.ts` → DOM overlay.

Each unit also receives a dedicated palette-driven `units.tsx` fallback and replaces
only its own `UNIT_SPRITE_CATALOG` donor mapping. Generated payloads are never
hand-edited. Every fallback carries the same essential role cues as its native asset
so minor-civ and unexpected-faction rendering remains legible.

Use the existing body-plan kind only where it matches the role; assign explicit
`data-kind-variant` values and semantic hooks for all moving components. Motion is
local: Paratrooper limbs and rifle, aircraft propellers and small control surfaces,
Supercarrier hull/deck response, and Great General arm/flag. SAM Site remains static:
it must not add a pulsing coverage ring, sweep, or other effect that can imply
operational range or disclose viewer-hidden state. A rifle, flag, antenna, propeller,
or launcher must be nested under the group that visibly owns it; CSS must animate a
nested joint rather than a positioned placement wrapper.

The motion contract is deliberately characterful but restrained. The Paratrooper
settles from a landing step before moving; the Naval Strike Aircraft's propeller spins
while its torpedo stays attached to the fuselage; the Patrol Aircraft has a gentle
propeller/antenna read, not an attack recoil; the Supercarrier has slight deck and
sea movement without independently drifting its parked aircraft; and the General's
flag flexes from its pole while map and field glasses stay hand-held. At every paused
phase, each asset must look like a plausible complete object rather than a collection
of effects. No asset may depend on colour, animation, or audio alone to communicate
role.

## Lessons applied from #708 and #709

- Author anatomy, containment, and source order explicitly before animating.
  Every attachment has a parent-child relationship visible in the SVG, not a
  coincidental screen overlap.
- Pivot at the physical joint: hands hold rifles/maps/batons, aircraft props rotate
  at their hub, standards flex from their mast socket, and launchers recoil from
  their mount. Never animate an outer `translate(...)` placement group.
- Use animation to add delight after silhouette clarity, never to conceal a weak
  static pose. Keep the first readable beat simple: a landing specialist, a torpedo
  aircraft, a searching patrol plane, a larger deck, a commander, and a protected
  missile emplacement.
- Test the specific old donor and the nearest confusing family, rather than merely
  asserting non-empty SVG output.
- Keep a hard visual gate: write red tests, serialize unregistered candidates,
  capture committed identity and phase sheets, conduct review, then register native
  assets and state-specific CSS. Do not let live integration precede evidence.
- The review must use the committed serialized payload and production CSS, work under
  both Vite and `file://`, expose all six factions and lifecycle states, and include
  reduced motion. Static frames prove anatomy; live controls prove timing.

## Review and acceptance

Create one #710 preview and review record. It must include 40px, 64px, and 128px
identity sheets plus paused walk/attack phase sheets at 0%, 25%, 50%, and 75% for
the five native units; it must also include the SAM Site next to its former Radar
Station donor at the same sizes. Review passes only when every target is distinct
from its donor and nearest confusing family, faction surfaces preserve material
hierarchy, attachments remain intact at every sampled phase, and reduced motion
retains the whole readable composition. The review explicitly rejects detached
payloads, floating flags, independently sliding deck aircraft, a patrol-plane attack
pose, a General weapon read, and any animated SAM coverage implication.

Tests are written before production changes and prove catalog non-aliasing, native
resolution across all six factions, fallback parity for unknown faction keys, required
semantic hooks, variant-only CSS motion, reduced-motion suppression, generated-payload
synchronization, and direct-file preview behavior. Existing overlay tests continue to
cover selection, fog, health, and state propagation without inventing gameplay tests
for visual-only work.

## Delivery

The implementation plan will preserve the #709 staged commits: red contract, authored
fallback/native silhouettes, serialized review-only payload, motion, captured review
evidence, and only then live native registration. Before delivery, run source-rule
checks for changed `src/` files, focused renderer tests, serializer, `git diff --check`,
build, and durable verification. The matching plan must be updated with the final PR
number and status in the same PR.
