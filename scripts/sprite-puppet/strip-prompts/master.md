# Conversation A: the master

A fresh ChatGPT conversation with no attachment. `strips.py prompt <spec>` fills the `{{...}}` fields from the spec's `prompt`
block and the family section below; the text under "Prompt" is what gets pasted. Regenerate in the same conversation until the
owner likes the design, then save the image as a PNG named `a.png`.

Why it reads this way: the game animates this one drawing by cutting it apart, so the pose rules matter more than the
picture. Sizes are never given in pixels (ChatGPT refuses contradictory pixel rules and draws at its own zoom anyway).

## Prompt

I am making art for ONE unit in a family-friendly historical strategy game. Draw ONE image: the master design of this unit.
Every later image of this unit will be drawn from it, and the game will animate this drawing by cutting it into parts, so it
must follow the pose rules exactly.

THE UNIT: {{name}}. {{look}}

STYLE: clean hand-painted 2D game art, bold dark outline, flat cel shading with soft highlights, earthy saturated palette,
friendly readable proportions that still read when the unit is 48 pixels tall. No photorealism, no 3D-render look, no pixel art.

VIEW: strict side view, facing RIGHT. The whole unit is inside the image with empty space of about a tenth of the image on
every side. No ground, floor, shadow, scenery, text, labels, border or effects.

BACKGROUND: transparent. If you cannot make it transparent, use one flat solid magenta (#FF00FF) with no gradient, glow or
noise, and put nothing magenta or pink on the unit.

TEAM COLOUR: {{team_area}} is saturated pure red (#E01010). That is the ONLY red or red-orange anywhere in the image.
Everything else ({{not_red}}) is brown, tan, grey, black, white, bronze or dull dark maroon. The game recolours that red to
each player's colour, so any other red would change colour too.

POSE FOR ANIMATION (the most important part):
{{pose}}

Draw the image now. Then answer with one short line per check, and redraw if any fails: side view facing right; whole unit
inside the image; red only on {{team_area}}; {{check}}.

## Family: biped

### pose
- Standing at rest, weight on both feet, both feet flat on the ground with a gap of about one boot length between them,
  knees straight, body upright.
- The garment ends above the knee, so both legs show below the hem as two separate shapes that do not touch.
- Nothing hangs in front of or behind the legs below the hem: shield, cloak, quiver, scabbard, pouches and sash all stay above
  the hem.
- {{weapon_pose}}

### check
two separate legs below the hem with nothing else touching them

### not_red
skin, hair, leather, wood, metal, stains

## Family: mounted

### pose
- The animal stands square on one ground line: all four legs straight and vertical, every hoof flat, and a clear gap between
  each pair of neighbouring legs. Seen from the side the four legs read as four separate posts; no leg overlaps another.
- The tail hangs free and does not touch the hind legs. The head is up, the neck arched.
- {{coat}}
- The rider sits upright. His feet, weapon, saddle cloth and any fringe all stay above the animal's knees.
- {{weapon_pose}}

### check
four separate legs with gaps between them, coat not red-brown

### not_red
the animal's coat, mane and hooves, skin, leather, wood, metal

## Family: vehicle

### pose
- It stands level on flat ground, resting on one straight line.
- {{running_gear}}
- The gun barrel points straight to the right, horizontal, and overlaps nothing.
- Hatches closed, nobody outside it, no smoke, no exhaust, no muzzle flash, no dust.

### check
{{running_gear_check}}, barrel horizontal

### not_red
rust, paint, markings, lights, metal

## Family: aircraft

### pose
- Flat side view in level flight, wings level. No ground, no shadow, no clouds, no smoke, no speed lines.
- The propeller is stopped and seen edge-on as one thin vertical blade (the game draws the spinning blur).
- {{gear}}

### check
level flight, propeller stopped and edge-on

### not_red
metal, canvas, wood, and any markings (no red roundels or stripes)
