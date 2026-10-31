# Conversation B: the set

A fresh ChatGPT conversation with the approved master (`a.png`) attached. `strips.py prompt <spec>` fills the `{{...}}` fields
and inserts the family's image list. Save the images as PNGs named in the order of the spec (`b.png`, `c.png`, ...).

What this keeps from the prompt ChatGPT itself rewrote for the Spearman (the version that worked): the attached master is the
authority, the work is staged one image at a time inside one conversation, every image uses one scale with no per-frame
resizing, wide actions get wide cells, and the model checks each image before moving on. What it drops: exact canvas sizes
and pixel heights (it ignores them and `strips.py` normalises anyway), and every looping motion (it cannot draw a cycle; the
game builds the loops in code from the master and the damage tiers).

## Prompt

The attached image is the master design of ONE unit for a family-friendly historical strategy game: {{name}}. It is the
authoritative reference. Draw the images listed below, one image per message, in order, in this conversation, without
asking me for approval in between. Every image shows exactly the unit in the attached master: {{identity}}. Do not redesign
anything. If an image starts to drift from the master, redraw that image before moving on.

RULES FOR EVERY IMAGE:
- Same style as the master: hand-painted 2D game art, bold dark outline, flat cel shading, same palette and lighting.
- Strict side view facing RIGHT, same scale in every frame of every image. Do not resize a frame to fill its space: a unit
  that crouches or falls should look smaller because of its pose, not because it was zoomed.
- Frames are separate figures arranged in the grid given for each image, reading left to right, top row first. Leave clear
  empty space of at least a fifth of a figure's width between neighbouring figures. No figure touches another or the edge.
- Nothing is detached from the figure: no flying arrows or projectiles, sparks, dust, debris, smoke puffs or motion lines
  floating in the air. Anything the unit holds stays in contact with it.
- Transparent background (or, if impossible, one flat solid magenta #FF00FF with nothing magenta on the unit).
- Paint {{team_area}} saturated pure red (#E01010), exactly as in the master; it is the only red anywhere. Wounds, stains,
  rust and fire are dark maroon, brown, grey, orange-yellow or black, never bright red. No blood and no gore.
- No text, labels, numbers, borders, grid lines, ground or shadows.
- Do not draw a walk, run, gallop, rolling or flying cycle. The game animates movement itself.

THE IMAGES:
{{images}}

After each image, answer with one short line: same unit as the master; same scale; correct number of frames; no figures
touching; nothing detached; red only on {{team_area}}. If any is false, redraw that image first.

## Family: biped

### images
1. DAMAGE (4 frames, a grid of 2 by 2): the master's standing pose four times, the unit progressively hurt. Keep the legs and
   feet EXACTLY where they are in the master in all four frames (the game builds the walk from each of these drawings); any
   slump shows only in the head, shoulders and arms. Keep any planted spear or other prop a hand's width clear of the
   boots. (1) healthy, identical to the master; (2) light: dirt on clothes and legs,
   one clear slash across the garment, a scuffed hem; (3) serious: torn garment and sleeve, {{damage_gear}}, a few dark-maroon
   stains, messy hair; (4) critical: bandages on chest and forearm, a bruised face, {{damage_gear_critical}}, a tired slumped
   head and shoulders. Each frame must look clearly worse than the one before at a glance.
2. ATTACK ({{attack_frames}} frames, a grid of 3 per row): {{attack}} The first and last frames are the ready stance.
3. HIT REACTION (5 frames, a grid of 3 then 2): (1) standing ready; (2) impact: head snaps back, torso leans back about 15
   degrees; (3) stagger: one foot slides back, knees flex; (4) catching his balance; (5) recovered, standing as in frame 1.
4. DEFEAT (5 frames, a grid of 3 then 2), non-graphic: (1) standing; (2) struck, leaning back; (3) knees buckling; (4)
   kneeling, head bowed, {{defeat_prop}}; (5) lying on his side at rest, eyes closed, his gear still touching him (nothing
   lying apart from him).

## Family: mounted

### images
1. DAMAGE (4 frames, a grid of 2 by 2): the master's standing pose four times, rider and animal progressively hurt. Keep the
   animal's four legs EXACTLY where they are in the master in all four frames (the game builds the walk from each of these
   drawings). (1) healthy, identical to the master; (2) light: mud on the animal's legs and belly, a slash across the rider's
   garment, a scuffed saddle cloth; (3) serious: torn saddle cloth and garment, {{damage_gear}}, a few dark-maroon stains,
   the animal's head lowered a little; (4) critical: bandages on the rider, a torn and dirty saddle cloth,
   {{damage_gear_critical}}, the animal's head and neck drooping, the rider slumped in the saddle.
2. ATTACK ({{attack_frames}} frames, a grid of 3 per row): {{attack}} The animal stays on its four legs with at most a small
   lean; the first and last frames are the ready stance.
3. HIT REACTION (4 frames, a grid of 2 by 2): (1) ready; (2) impact: the rider rocks back and the animal throws its head up;
   (3) the animal steps back with its hind legs bending; (4) recovered, as frame 1.
4. DEFEAT (4 frames, a grid of 2 by 2), non-graphic: (1) standing; (2) the animal rears a little and the rider sways; (3) the
   animal kneels on its front legs, the rider slipping off; (4) the animal lying down at rest, the rider sitting against it
   with head bowed (touching it, not apart from it).

## Family: vehicle

### images
1. DAMAGE (4 frames, a grid of 2 by 2): the master four times, progressively damaged, in exactly the master's position and
   outline (wheels or tracks exactly where they are). (1) intact, identical to the master; (2) light: scorch marks, dents,
   mud; (3) serious: holes in the armour, {{damage_gear}}, a hatch hanging open, dark soot streaks; (4) critical: large
   holes, {{damage_gear_critical}}, blackened plates, a thin wisp of grey smoke rising from it and touching it.
2. WRECK (3 frames in exactly ONE horizontal row, left to right: not a grid, not a column, a single wide image): (1) a hit:
   a bright yellow-orange burst touching the hull and the hull jolted, otherwise intact like the master; (2) burning: orange
   flames and black smoke rising from the hull, touching it, the plates scorched and {{team_area}} darkened and soot-streaked;
   (3) the burnt-out wreck, blackened and sagging, no flames and no smoke. Bright red is only on {{team_area}} in frame 1.
{{extra_images}}

## Family: naval

### images
1. DAMAGE (4 frames, a grid of 2 by 2): the master four times, progressively damaged, in exactly the master's position and
   outline, every hull cut off at the same straight waterline with nothing drawn below it. (1) intact, identical to the
   master; (2) light: scorch marks and a few dents on the hull and a torn flag; (3) serious: holes in the hull side and
   deck, {{damage_gear}}, dark soot streaks, a little grey smoke; (4) critical: large holes, {{damage_gear_critical}},
   blackened plates, a thin wisp of grey smoke rising from it and touching it. No water, waves or spray in any frame.
2. SINKING (3 frames in exactly ONE horizontal row, left to right: not a grid, not a column, a single wide image): every
   hull is cut off at the same straight horizontal line (the waterline) with nothing drawn below it and no water drawn: (1) a
   hit: a bright yellow-orange burst touching the hull and the ship jolted, otherwise intact like the master; (2) going down:
   listing a few degrees with the bow low, burning, black smoke rising from it and touching it, {{team_area}} scorched dark;
   (3) nearly under: only the top of the hull above the line, the upper deck, the funnel and the masts above it, charred,
   leaning, no flames. Bright red is only on {{team_area}} in frame 1.
{{extra_images}}

## Family: aircraft

### images
1. DAMAGE (4 frames, a grid of 2 by 2): the master four times, progressively damaged, in exactly the master's position and
   outline, level flight with the propeller stopped and edge-on in all four. (1) intact, identical to the master; (2) light:
   bullet holes and scorch marks, a torn patch of fabric; (3) serious: torn fabric and panels, an oil streak, {{damage_gear}},
   dark soot streaks; (4) critical: a smoking engine with a short grey smoke trail touching the aircraft,
   {{damage_gear_critical}}. No ground, clouds or sky in any frame.
2. GOING DOWN (3 frames in exactly ONE horizontal row, left to right: not a grid, not a column, a single wide image): (1) a
   hit: a bright yellow-orange burst touching the aircraft, otherwise intact like the master; (2) going down: the nose tipping
   about 25 degrees down, orange flames and black smoke trailing from the engine and touching it, {{team_area}} scorched
   dark; (3) a steep dive, the nose about 60 degrees down, charred, black smoke trailing from it and touching it. Bright
   red is only on {{team_area}} in frame 1. No ground, clouds or sky.
{{extra_images}}
