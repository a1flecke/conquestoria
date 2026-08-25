# Issue 708 Grounded-Fantasy Anatomy and Motion Redesign

## Goal

Rebuild the Issue 708 native v2 art for `beast_handler`, `war_elephant`, and
`cuirassier` so each unit is immediately recognizable as a person-and-hound,
an elephant-and-howdah, or a horse-and-rider. Their animations must be driven
by the parts that move in the action, with visible weight transfer in walk and
attack states.

This replaces the previous visual-batch design where the three sprites read as
abstract emblem parts rather than grounded fantasy units.

## Scope and non-goals

Only the live aliases owned by Issue 708 change: `beast_handler`,
`war_elephant`, and `cuirassier`. Chariot and Cavalry are out of scope.

The change remains visual-only. Gameplay definitions, combat values, AI,
difficulty modes, persistence, save migration, hot-seat rules, SFX
registration, and player actions do not change. The existing DOM-overlay
selection, health, fog, damage, and reduced-motion behavior remains upstream
of these assets.

## Diagnosed defects in the current render

The current source and CSS confirm the user-visible failures that motivated
this redesign:

- The handler torso has no separate arms, the human remains planted while the
  hound walks, and the command staff is animated about its ground end. A
  circular command sigil appears during attack without a readable in-world
  meaning.
- The elephant's armored face overlaps the ear/head/trunk read as a central
  block. The standard is a sibling of the elephant rather than visibly mounted
  to the howdah. Attack moves the head and tusks but not the legs.
- The cuirassier has no articulated rider arms, reads as a sideways rider with
  dangling legs, and uses a strongly curled tail that does not read as horse
  anatomy. Attack moves only saddle/weapon effects, leaving the horse legs
  inert.

## Art direction

The direction is **grounded, readable fantasy**:

- Flat geometric SVG, earthy hand-made materials, `#1f1a14` ink outlines,
  right-facing 2.5D silhouettes, and no gradients or blur.
- Real anatomy and pose come before fantasy decoration. A child should name
  the person, hound, elephant, horse, and rider from the outer shape at 40px.
- Fantasy is limited to small, material cues: a collar/harness detail, etched
  plate, or a banner motif. There is no abstract targeting reticle, arbitrary
  floating glyph, horn, or effect that competes with the action.
- The art remains warm and lovable through alert ears, a confident forward
  stance, clear crew silhouettes, and purposeful motion—not through toy-like
  proportions or unreadable embellishment.

Every unit continues to derive faction identity from `_fa2(faction)` only.
Faction `mid` colours the conspicuous cloth, harness panel, saddle cloth, or
standard; `dark` supplies shadow/belt/edge material; `bright` is a small
heraldic highlight; and `trim` remains a restrained accent. Animal hide,
skin, wood, and metal use `_P2` materials so faction colouring is present but
does not turn animals into solid team-colour blobs.

## Required anatomy

| Unit | Mandatory readable parts | Prohibited read |
| --- | --- | --- |
| Beast Handler | A forward-facing walker with visible head, two arms, two separately posed legs, a hand-held forked staff, leash hand, and a four-legged hound leading to the right. | Armless tunic, staff planted in the ground, unexplained reticle, or a handler carried as inert decoration. |
| War Elephant | Wide elephant body; four weight-bearing legs; distinct ear, head, trunk, two tusks, eye, and plated forehead; a rectangular howdah with two small crew; standard visibly socketed to the howdah rail. | Face block between ears and trunk, a flag emerging from the animal, or a body that could read as another species. |
| Cuirassier | Four-legged horse with a tapering neck, muzzle, two ears, mane, realistic downward-flowing horse tail, saddle, and reins; forward-facing rider straddling the saddle with bent thighs/calves on both flanks, rein arm, and sabre arm. | Horn/unicorn read, dog/lion crossbreed, sideways seated rider, dangling legs, or armless rider. |

All movable parts use specific hooks rather than a generic whole-sprite
transform: `cq-handler-arm-l/r`, `cq-handler-leg-l/r`, `cq-command-staff`,
`cq-command-leash`, `cq-elephant-*`, `cq-leg-fl/fr/bl/br`, `cq-horse-*`,
`cq-rider-arm-*`, `cq-rider-leg-*`, and `cq-weapon` as appropriate. The
outer `data-kind` and `data-kind-variant` contracts stay compatible with the
existing v2 overlay and serializer.

## Motion contract

Animation must communicate a causal sequence, not just make isolated parts
wiggle. Motion is small enough for a map icon and originates at the feet or
the hand holding the object.

### Beast Handler

- **Idle:** handler and hound breathe/settle independently; the staff is
  steady in the hands and the leash has a slight natural slack.
- **Walk:** the handler takes an alternating two-leg walk alongside the hound;
  the hound keeps its existing readable four-leg cadence. The leash connects
  hand to collar and reacts lightly to their relative stride.
- **Attack:** handler **steps → plants → drives the staff from both hands**
  while the hound compresses then pounces. Handler and hound legs visibly
  participate. The staff pivots at the upper/lower hand grips, never at the
  ground. Remove the command sigil entirely; leash tension and the staff
  thrust are the command read.

### War Elephant

- **Idle:** quiet ear/trunk settling and a stable, clearly separate howdah.
- **Walk:** a slow four-beat heavy gait with each leg landing in sequence,
  supported by a modest body weight shift. Ear and trunk follow the head;
  howdah rocks with the body; the standard flexes from its socket in the
  howdah rail.
- **Attack:** **rear-leg push → front-leg plant → body/head drive**. All four
  legs enter the heavy charge cadence, then the head/trunk/tusks follow
  through. Crew and standard stay mechanically connected to the howdah.

### Cuirassier

- **Idle:** horse settles on its hooves; rider is balanced forward over the
  saddle, with reins and sabre clearly held.
- **Walk:** a deliberate horse walk/canter with alternating four-leg motion;
  mane and tail follow through. Rider legs stay bent around the horse and the
  torso rises/falls with the saddle rather than dangling beside it.
- **Attack:** **hind-leg push → front legs extend/plant → rider forward →
  sabre cut**. Horse legs move during the attack; the rider braces through
  thighs and reins; the sabre pivots from the sabre hand/shoulder. A small
  impact spark may appear only at the sabre's forward end.

## Accessibility and runtime contract

- `idle`, `walk`, and `attack` each tell the same story at a static frame;
  animation clarifies the action but is never required to identify the unit.
- Reduced-motion disables every new animation while preserving the final
  readable anatomy, faction surfaces, health, selection, fog, damage, and
  static weapon/tusk/staff information.
- The assets stay in the native-v2 path, use `SpriteFrameV2`, retain 128×128
  view boxes, phase desynchronization, and generated serialized modules.
- The standalone review preview must render from the committed serialized
  native output when opened via both Vite and `file://`, and must expose all
  faction palettes plus idle/walk/attack and reduced-motion states.

## Visual acceptance criteria

At 40px, 64px, and 128px, every faction palette and state meets all of the
following:

1. A reviewer can identify each unit without its label from its silhouette and
   pose: handler+hound, elephant+howdah, or horse+forward rider.
2. Both human figures have unmistakable arms; the Cuirassier's rider is
   astride the saddle and the Handler walks under their own power.
3. The elephant has a readable ear/head/trunk/tusks hierarchy and the standard
   is visibly fixed to the howdah.
4. The Cuirassier has a horse head, neck, ears, mane, tail, and four legs;
   neither the mount nor rider can read as a dog, unicorn, lion-tailed animal,
   or sideways seated figure.
5. Walking uses the correct body parts and cadence. Attacks visibly use the
   legs that generate force before the weapon, tusks, or hound follow through.
6. No unexplained targeting/X/sigil graphic appears during the Handler attack.
7. Faction-dependent cloth/harness/saddle/standard surfaces visibly vary while
   anatomy and material readability remain stable.

## Test and review evidence

Tests are written before production changes and must prove the exact prior
failure modes cannot regress:

- source tests require the new arms, legs, anatomy hooks, faction surfaces,
  and absence of `cq-command-sigil` in the Handler;
- CSS tests require walk and attack selectors for all locomotion legs, hand
  pivots for staff/sabre, and a howdah-owned standard;
- v2-index/overlay tests preserve native resolution across factions and state
  propagation, including reduced motion;
- the serialized preview test verifies both Vite and direct-file rendering,
  all faction palettes, all motion states, and no external import dependency.

The committed Markdown visual review must show source-generated 40px, 64px,
and 128px frames for idle, walk, attack, hurt, death, and reduced-motion,
alongside an explicit checklist for the seven visual criteria above. It must
not make gameplay, AI, save, SFX, or balance claims that this visual-only
change does not alter.
