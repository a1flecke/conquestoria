# Issue 711 Native Sprite Visual Review

This review is completed from the generated, file-safe #711 preview page and its committed capture sheets. It verifies the actual serialized V2 payloads, production animation CSS, all six faction identifiers, 40px map readability, and reduced-motion rendering.

## Evidence

- `assets/issue-711/trebuchet-identity-sheet.png`
- `assets/issue-711/trebuchet-contact-sheet.png`
- `assets/issue-711/rocket-artillery-identity-sheet.png`
- `assets/issue-711/rocket-artillery-contact-sheet.png`
- `assets/issue-711/battleship-identity-sheet.png`
- `assets/issue-711/battleship-contact-sheet.png`
- `assets/issue-711/missile-cruiser-identity-sheet.png`
- `assets/issue-711/missile-cruiser-contact-sheet.png`

## Acceptance record

- [x] Trebuchet reads as an A-frame, counterweight, beam, and empty sling rather than a torsion catapult.
- [x] Rocket Artillery reads as a short-tube saturation launcher rather than a long-barrel gun.
- [x] Battleship reads as a three-turret capital ship rather than a pre-dreadnought recolor.
- [x] Missile Cruiser reads as closed VLS cells and paired radar arrays rather than another gun battleship.
- [x] Wheel and naval movement remain physically connected; no unit uses humanoid gait or attack lunge.
- [x] Attack feedback is local to beam/counterweight, rack/tubes, turrets, or VLS lids; no projectile persists as map art.
- [x] Faction paint stays a small identifier over grounded wood, stone, steel, and water materials.
- [x] Reduced motion preserves the complete static silhouette and fogged/unexplored units remain absent from the overlay.

Captured against the production CSS and generated six-faction V2 payloads on 2026-08-30. The first review exposed an idle VLS-launch glyph; its default visibility is now zero, and the corrected contact sheet confirms it appears only in the attack window. A second review removed the Trebuchet's persistently loaded stone, leaving the sling visibly empty at rest and through recovery.
