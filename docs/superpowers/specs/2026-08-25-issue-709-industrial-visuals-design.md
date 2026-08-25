# Issue 709 Industrial Vehicles Visual Batch Design

**Issue:** #709 — `combat(547.45): Visual batch: industrial vehicles and anti-armor`

## Goal

Replace the remaining temporary sprite aliases for Armored Car, Mechanized Infantry, and
Main Battle Tank with readable native-v2 art. At map scale, a player can distinguish the
light wheeled scout, mobile infantry formation, and heavy tracked breakthrough tank without
needing a label.

## Scope and drift resolution

The current `origin/main` catalog confirms this visual-only delivery owns exactly:

- `armored_car`, currently an exact `TankSprite` alias;
- `mechanized_infantry`, currently an exact `InfantrySprite` alias; and
- `main_battle_tank`, currently an exact `TankSprite` alias.

`anti_tank_gun` is explicitly out of scope. Issue #769 / PR #784 supplied the bespoke
`AntiTankGunSprite`; issue #709 must preserve it rather than duplicate or replace it.

No gameplay definitions, costs, combat calculations, AI, difficulty, tech gates, save shape,
SFX, production panels, or hot-seat rules change. Existing DOM-overlay ownership of selection,
health, fog, disabled state, scale, and reduced motion remains unchanged.

## Visual direction

Use the repository's flat geometric, ink-outlined, right-facing 2.5D SVG language. Historical
anchors make each battlefield role immediately understandable; faction identity comes only
from the supplied palette surfaces, never hardcoded civilisation colours. Metal, earth, skin,
and cloth use existing material tokens so a faction accent never turns an entire vehicle into a
solid team-colour block. The tone is warm and adventurous rather than grim: a jaunty scout
pennant and periscope, a protective carrier panel with a confident infantry pose, and an MBT
with a broad heroic stance add character without gore, toy-like distortion, floating magic, or
clutter at 40px.

| Unit | Role-visible silhouette | Mandatory readable details | Must not read as |
| --- | --- | --- | --- |
| Armored Car | Small fast early-industrial wheeled scout | Four wheels, compact sloped armored hull, small turret, short cannon, faction pennant | A tracked Tank, an anti-tank gun, or a civilian car |
| Mechanized Infantry | Mobile line holder with armored transport | Helmeted rifle soldier, two-handed rifle, armored personnel carrier behind the soldier, carrier wheel/track read, faction panel | Ordinary Infantry alone, a tank crew, or a static machine-gun emplacement |
| Main Battle Tank | Broad late-modern heavy breakthrough vehicle | Wide tracks, low heavy hull, distinct turret, long cannon, restrained faction pennant | The existing Tank, Armored Car, Mobile AA, or Anti-Tank Gun |

The visual vocabulary supports the existing player-facing roles without adding a new mechanic:
Armored Car remains fast recon/pursuit, Mechanized Infantry remains a mobile line holder, and
MBT remains the heavy combined-arms breakthrough unit. The existing production icons and text
remain authoritative for exact tactical rules.

## Body plans, hooks, and parity

All three native assets use the existing `data-kind="melee"` body plan, with an explicit
`data-kind-variant` so their vehicle-specific CSS overrides the generic sword-swing behavior.
The generic body plan keeps standard state propagation and reduced-motion coverage; variants
provide physically credible recoil rather than treating a cannon as a hand weapon.

| Unit | Variant | Required hooks | Motion ownership |
| --- | --- | --- | --- |
| Armored Car | `armored-car` | `cq-armored-car-body`, four `cq-wheel` groups, `cq-armored-car-turret`, `cq-armored-car-cannon`, `cq-weapon` | The body settles, wheels rotate, and turret/cannon recoil about the turret pivot. |
| Mechanized Infantry | `mechanized-infantry` | `cq-mech-soldier`, `cq-arm-l`, `cq-arm-r`, `cq-leg-l`, `cq-leg-r`, `cq-mech-carrier`, at least two `cq-wheel` groups, `cq-weapon` | The soldier walks under their own power; hands retain the rifle while the carrier responds subtly behind them. |
| Main Battle Tank | `main-battle-tank` | `cq-mbt-body`, `cq-mbt-tracks`, `cq-mbt-turret`, `cq-mbt-cannon`, `cq-weapon` | The heavy hull/track response stays restrained; turret/cannon recoil pivots at the turret and never detaches. |

The dedicated `units.tsx` fallback sprite for each unit must expose the same role-defining
silhouette and semantic hooks as its native counterpart. This is not duplicate artwork review
for its own sake: minor-civ and unexpected-faction rendering must still communicate wheels,
carrier-plus-soldier, or heavy tracks/turret. Tests compare required hook presence and the
specified non-donor markers on both paths.

## Staged visual gate

The predecessor #708 required several late correction rounds because animation integration
preceded a sufficiently concrete review of anatomy, attachment, and layer order. #709 uses a
hard visual gate:

1. Add focused failing tests that state the three exact donor replacements and each unit's
   semantic hooks.
2. Author the three native-v2 sprites in the generator source and serialize them, but do not
   register them in the live native lookup yet.
3. Generate deterministic 40px, 64px, and 128px identity sheets from the committed serialized
   Imperials output, plus paused `walk` and `attack` contact sheets sampled at 0%, 25%, 50%, and
   75% of each animation cycle. The capture surface uses the same serialized payload and CSS as
   the preview, pauses animation at the chosen negative-delay phase, and records layer order and
   attachment rather than inferring them from source text.
4. Conduct one explicit human review of all identity and contact sheets. It passes only when the
   silhouette, material separation, faction surface, banner placement, pivots, attachment, and
   layer order meet this specification for every target; a defect returns to source authoring.
5. Only after that review passes, register the generated modules in the native lookup, add
   state-specific CSS motion, and publish a file-safe interactive preview.

This gate is intentionally a visual review checkpoint rather than a new runtime feature. It
makes defects inexpensive to find while preserving one production asset pipeline.

## Native-v2 architecture

There is one authored source of truth:

`design/conquestoria-sprites/lib/units-v2.jsx` → `scripts/serialize-sprites.mjs` →
`src/renderer/sprites/v2/<unit>.svg.ts` → `src/renderer/sprites/v2/index.ts` → DOM overlay.

Generated `*.svg.ts` files are serializer output and are never hand-edited. The serializer must
add the three units to its source list, generate six faction payloads, and update the dedicated
review preview payload from those same serialized results. `v2/index.ts` imports each generated
payload and registers it in `UNIT_SPRITES`; `isV2NativeUnit` consequently becomes true for each
target without any special-case renderer path.

The live catalog changes from the donor functions to dedicated catalog functions in
`src/renderer/sprites/units.tsx`, each wrapped with its existing `withMotion` call. This keeps
minor-civ and unexpected-faction fallback behavior structural. Each dedicated fallback sprite
uses `SpriteFrame`, a palette-derived `Banner`, standard material tokens, and semantic class
hooks compatible with the CSS state machine.

## Motion and reduced motion

Static anatomy is sufficient to identify every unit; motion only reinforces role:

- Armored Car: gentle suspension/body movement and wheel motion; turret/cannon recoil originates
  at the turret during attack, with a visible periscope/pennant that remains attached.
- Mechanized Infantry: an alternating human stride, small carrier response, and rifle recoil from
  the hands/weapon rather than a disconnected effect. At 40px, the soldier and carrier remain
  two clean readable masses rather than a detailed crowd.
- Main Battle Tank: track/body response, turret movement, and cannon recoil from the turret;
  the long cannon stays visibly attached through attack and hurt states. Its broad stance and
  restrained heraldic panel make it feel like a heroic formation anchor, not anonymous hardware.

Every movable part uses a unit-specific class hook. The existing reduced-motion selector makes
the full silhouette static while retaining faction palette, selection, health, fog, damage, and
state visibility. No visual state may rely solely on colour or animation.

## Review evidence

The delivery includes an issue-specific review Markdown file, identity and phase-sampled contact
sheet PNGs, a capture script, and a file-safe HTML preview. The preview uses only committed
serialized payloads and local CSS; it has no module import, network dependency, or generated
sidecar requirement. It exposes all six factions, `idle`, `walk`, `attack`, `hurt`, and `death`,
plus reduced motion. The review records both paused phase evidence and the distinct interactive
timing check.

The visual review must affirm at 40px, 64px, and 128px:

1. Each target is identifiable without a label and distinct from its former donor.
2. Armored Car has an unambiguous wheeled scout profile.
3. Mechanized Infantry visibly combines a rifle infantry member with an armored transport, not a
   generic infantry silhouette.
4. MBT reads as heavier and more modern than Tank through hull, tracks, turret, and cannon.
5. Weapons, wheels/tracks, soldier limbs, turret, and faction banners stay visibly attached and
   preserve sensible layer order at every captured walk/attack phase.
6. Palette variation affects only intended faction surfaces and does not harm material readability.
7. Reduced motion preserves a complete static, selected/disabled/fog-compatible presentation.

## Test strategy

Tests are written before the production behavior they specify. Focused coverage proves:

- Each target differs from its exact previous donor and from the nearby easily-confused family.
- All six factions resolve to native-v2 output carrying the expected `data-kind` and semantic
  hooks; catalog fallback still renders each target for non-native faction keys.
- The catalog functions render non-empty SVG for multiple palettes and retain a `Banner`.
- CSS has each target's required motion hooks and variant-specific recoil rules for walk and
  attack; generic melee weapon motion never overrides a cannon or rifle pivot. Reduced motion
  disables the new motion without deleting static anatomy.
- The serializer source list, generated modules, native imports/lookup, and review-preview payload
  stay synchronized.
- The review preview works as Vite content and as direct `file://` content, exposes every review
  state and faction, references committed identity and phase-sampled contact sheets, and supports
  a paused phase inspection path.
- Existing sprite-overlay and render-loop tests retain selection, health, fog, camera scale, and
  disabled-state behavior for all three native units.

This is a visual-only change, so no mechanics, AI, save, production, player-action, queue, or
hot-seat mutation test is added. Existing shared visual behavior is covered through the native
lookup and overlay tests rather than manufactured interaction tests.

## Acceptance and delivery

Run source-rule checks for each changed `src/` file, all mirrored sprite/overlay tests, the
serializer, `git diff --check`, and the production build. Before PR delivery, inspect the
committed and uncommitted diffs against `origin/main`, then run the durable full test suite and
its status command. The pull request updates the matching implementation plan phase with its PR
number and completion status.
