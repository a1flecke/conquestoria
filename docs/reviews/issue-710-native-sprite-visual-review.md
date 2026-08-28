# Issue 710 visual review — corrected native sprites

[Open the interactive review page](assets/issue-710/sprite-preview.html). It mounts the generated review-only native payloads with production CSS, all six faction palettes, lifecycle states, paused 0/25/50/75% phases, reduced motion, and the static SAM/Radar comparison. It also works directly from `file://`; no network, module, or sidecar payload is required.

Native lookup is active for the five user-accepted Issue 710 payloads; minor-civ and unrecognized-faction rendering still uses the catalog fallback.

## Evidence

![Paratrooper identity](assets/issue-710/paratrooper-identity-sheet.png)
![Paratrooper contact](assets/issue-710/paratrooper-contact-sheet.png)
![Naval Strike Aircraft identity](assets/issue-710/naval-strike-aircraft-identity-sheet.png)
![Naval Strike Aircraft contact](assets/issue-710/naval-strike-aircraft-contact-sheet.png)
![Maritime Patrol Aircraft identity](assets/issue-710/maritime-patrol-aircraft-identity-sheet.png)
![Maritime Patrol Aircraft contact](assets/issue-710/maritime-patrol-aircraft-contact-sheet.png)
![Supercarrier identity](assets/issue-710/supercarrier-identity-sheet.png)
![Supercarrier contact](assets/issue-710/supercarrier-contact-sheet.png)
![Great General identity](assets/issue-710/great-general-identity-sheet.png)
![Great General contact](assets/issue-710/great-general-contact-sheet.png)
![SAM Site and Radar Station comparison](assets/issue-710/sam-radar-comparison.png)
![SAM Site launch and Radar Station pulse](assets/issue-710/sam-radar-motion-sheet.png)

## Review checklist

- Paratrooper: an open canopy connects through visible suspension lines to harness and pack; both arms and legs are present, and the rifle stays in hand through every sampled phase.
- Naval Strike Aircraft: an elongated fuselage, cockpit, swept wings, tailhook, and belly torpedo read as a jet; attack releases the torpedo locally without a whole-plane thrust.
- Maritime Patrol Aircraft: long fuselage, paired nacelles and propellers, broad wing, and radar dome read as unarmed maritime surveillance; attack is only a local radar scan.
- Supercarrier: wake, hull, bow, tapered deck, deck aircraft, island, and mast make a boat at 40px; launch moves only the selected deck aircraft.
- Great General: the officer has clearly outlined arms and legs; both hands meet the unfolded map beside the standard, with no combat weapon or charge motion. Walk samples show alternating leg motion from the hips, not a sliding body.
- Faction accents change banner, trim, payload, radar, deck, and command details while ink, metal, skin, and earth retain the design-system material hierarchy.
- Reduced motion keeps the same identity layers and disables motion only.
- SAM Site remains a protected bunker-and-launcher silhouette, with an apron joining it to the ground, a mast physically planted on that apron, and a local missile launch during attack; the site itself stays fixed. Radar Station remains a lattice-tower-and-dish silhouette at 40px, 64px, and 128px, with alternating pulse arcs during attack while the tower and dish stay fixed.

## Gate status

Evidence was generated and reviewed interactively. The user approved the corrected batch on 2026-08-27; the five generated payloads are registered in `src/renderer/sprites/v2/index.ts`.
