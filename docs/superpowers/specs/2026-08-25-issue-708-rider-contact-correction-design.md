# Issue 708 Rider Contact and Handler Leg Correction

## Goal

Correct the three visual defects found in the first live review of the Issue 708 sprite rebuild, within draft PR #878:

1. The Beast Handler's legs must remain connected to the tunic while walking and attacking.
2. The Cuirassier must read as seated on the saddle with only the near rider leg visible in this side-on view.
3. The Cuirassier must have a recognisable, downward-flowing horse tail rather than a looped animal tail.

## Design

### Beast Handler leg attachment

Each handler leg retains its authored outer SVG placement (`translate(35 78)` or `translate(44 78)`). A nested joint group owns the walk and attack rotation. CSS must animate only that nested joint, never the translated outer group. This preserves the hip-to-tunic connection at every animation phase while keeping the current alternating gait.

### Cuirassier saddle and occlusion

The far rider leg remains a semantic `cq-rider-leg-r` group so anatomy hooks stay complete, but it is drawn before the horse body and stays entirely within the horse flank silhouette. The horse therefore occludes it naturally in the side view. The near `cq-rider-leg-l` is drawn after the horse and forms the only visible leg: hip inside the lowered seat, knee over the near flank, calf and boot aligned with the saddle/stirrup area. The rider torso/seat joins the saddle vertically; no leg may hang below the horse as though the person is sitting beside it.

### Horse tail

Replace the looped stroke with an outlined, tapered tail mass rooted at the hindquarter and falling downward with slight backward sweep. Add a short hair-strand accent only if it remains readable at 40 px. The tail must not form a closed loop, lion tuft, or horn-like silhouette.

## Non-goals

This is a renderer-art correction only. It does not change unit definitions, aliases, gameplay balance, AI, difficulty, save data, SFX, production, fog, solo play, or hot-seat state.

## Acceptance criteria

- During Handler walk and attack, both legs remain attached directly below the tunic at every sampled phase.
- At 40, 64, and 128 px, the Cuirassier has one visible rider leg; the far leg is fully occluded by the horse.
- The rider's pelvis overlaps the saddle and the visible leg follows the near horse flank.
- The tail begins at the hindquarter, hangs downward, and does not form a closed loop.
- Existing anatomy hooks, faction palette behaviour, reduced motion, overlay selection/health, and combat state propagation remain intact.
- New regressions prove the nested Handler joint, far-leg source ordering/occlusion contract, seated near-leg geometry, and non-looping tail source.

## Verification

Run the focused v2-index, animation-CSS, preview, overlay, and combat-state renderer tests; inspect the refreshed Vite preview and regenerated Markdown sheets; then run production build and durable verification before publishing the updated draft MR.
