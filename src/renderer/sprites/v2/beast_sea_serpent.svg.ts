// Conquestoria — Sea Serpent legendary beast (v2 DOM sprite).
// Single HTML+SVG string, rendered as a DOM overlay on the hex map.
// Pairs with src/assets/sea-serpent-animations.css (data-kind="beast-serpent", data-unit-type="beast_sea_serpent").
// Four undulating segments: three coils rising out of a dark waterline + a reared
// head with a tall crest fin. cq-segment-1 = tail coil, -2 = mid coil,
// -3 = high neck-coil, -4 = neck + head + crest fin (most-delayed sway, "sniffs the air").
// data-damage reveals: 1 = slashes on mid coil, 2 = torn crest fin, 3 = cracked neck scale.
export const svg: Record<string, string> = {
  beast: `<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="beast-serpent" data-unit-type="beast_sea_serpent" data-damage="0" style="--phase:0">
  <svg viewBox="0 0 128 128" width="100%" height="100%" data-state="idle" data-kind="beast-serpent">
    <g transform="translate(16 38.864000000000004)">
      <g>
        <ellipse cx="48" cy="45.568" rx="35.88" ry="14.72" fill="#000" opacity="0.18"/>
        <polygon points="87.837,64.568 48,87.568 8.163,64.568 8.163,18.568 48,-4.432 87.837,18.568" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="1.2" stroke-dasharray="2 3"/>
      </g>
    </g>

    <g class="cq-sprite-figure">
      <ellipse cx="66" cy="100" rx="40" ry="5" fill="#000" opacity="0.28"/>

      <!-- ===== SEGMENT 1 — TAIL COIL (leftmost, thickest; weaves, phase 0) ===== -->
      <g class="cq-segment-1">
        <path d="M6,102 C5,76 12,56 24,56 C36,56 43,76 42,102 Z" fill="#2e6e8c" stroke="#1f1a14" stroke-width="1"/>
        <!-- underbelly (darker front face) -->
        <path d="M9,100 C10,84 16,74 24,74 C32,74 38,84 39,100 Z" fill="#1c4a61" opacity="0.55"/>
        <!-- upper-left highlight -->
        <path d="M12,72 C15,62 20,58 25,59" fill="none" stroke="#5ec0d8" stroke-width="3" stroke-linecap="round" opacity="0.4"/>
        <!-- scale texture -->
        <g fill="none" stroke="#1c4a61" stroke-width="0.5" stroke-linecap="round">
          <path d="M14,72 q4,-3 8,0"/><path d="M24,70 q4,-3 8,0"/>
          <path d="M11,80 q4,-3 8,0"/><path d="M21,79 q4,-3 8,0"/><path d="M30,80 q4,-3 7,0"/>
          <path d="M10,88 q4,-3 8,0"/><path d="M20,88 q4,-3 8,0"/><path d="M29,88 q4,-3 7,0"/>
        </g>
      </g>

      <!-- ===== SEGMENT 2 — MID COIL (weaves, phase -0.3s) ===== -->
      <g class="cq-segment-2">
        <path d="M37,102 C36,72 45,48 55,48 C65,48 72,72 71,102 Z" fill="#2e6e8c" stroke="#1f1a14" stroke-width="1"/>
        <path d="M41,100 C42,80 49,66 55,66 C61,66 67,80 67,100 Z" fill="#1c4a61" opacity="0.55"/>
        <path d="M44,66 C47,55 51,50 56,51" fill="none" stroke="#5ec0d8" stroke-width="3" stroke-linecap="round" opacity="0.4"/>
        <g fill="none" stroke="#1c4a61" stroke-width="0.5" stroke-linecap="round">
          <path d="M45,64 q4,-3 8,0"/><path d="M55,62 q4,-3 8,0"/>
          <path d="M42,73 q4,-3 8,0"/><path d="M52,71 q4,-3 8,0"/><path d="M61,73 q4,-3 7,0"/>
          <path d="M41,82 q4,-3 8,0"/><path d="M51,81 q4,-3 8,0"/><path d="M60,82 q4,-3 7,0"/>
        </g>
        <!-- DMG 1 — three diagonal slashes across the mid coil -->
        <g class="cq-wound cq-wound-1">
          <path d="M46,72 L57,63" fill="none" stroke="#c43b2e" stroke-width="2.6" stroke-linecap="round"/>
          <path d="M48,78 L59,69" fill="none" stroke="#c43b2e" stroke-width="2.6" stroke-linecap="round"/>
          <path d="M50,84 L61,75" fill="none" stroke="#c43b2e" stroke-width="2.6" stroke-linecap="round"/>
          <circle cx="57" cy="63" r="1.2" fill="#c43b2e"/><circle cx="50" cy="85" r="1.2" fill="#c43b2e"/>
        </g>
      </g>

      <!-- ===== SEGMENT 3 — HIGH NECK-COIL (rightmost coil, highest; weaves, phase -0.6s) ===== -->
      <g class="cq-segment-3">
        <path d="M62,102 C61,66 70,38 80,38 C90,38 96,66 95,102 Z" fill="#2e6e8c" stroke="#1f1a14" stroke-width="1"/>
        <path d="M66,100 C67,72 74,56 80,56 C86,56 92,72 91,100 Z" fill="#1c4a61" opacity="0.55"/>
        <path d="M69,58 C72,46 76,40 81,41" fill="none" stroke="#5ec0d8" stroke-width="3" stroke-linecap="round" opacity="0.4"/>
        <g fill="none" stroke="#1c4a61" stroke-width="0.5" stroke-linecap="round">
          <path d="M70,56 q4,-3 8,0"/><path d="M79,54 q4,-3 8,0"/>
          <path d="M67,66 q4,-3 8,0"/><path d="M77,64 q4,-3 8,0"/><path d="M86,66 q4,-3 7,0"/>
          <path d="M66,76 q4,-3 8,0"/><path d="M76,75 q4,-3 8,0"/><path d="M85,76 q4,-3 7,0"/>
          <path d="M67,86 q4,-3 8,0"/><path d="M77,86 q4,-3 8,0"/><path d="M86,86 q4,-3 7,0"/>
        </g>
      </g>

      <!-- ===== SEGMENT 4 — NECK + HEAD + CREST FIN (reared; weaves, phase -0.9s, "sniffs the air") ===== -->
      <!-- The neck plunges low and broad into coil 3 (shared fill, no seam) and sweeps up into the head. -->
      <g class="cq-segment-4">
        <!-- neck — continuous rise out of the high coil up to the head -->
        <path d="M64,90 C62,60 70,40 86,32 C97,27 105,30 105,39 C95,43 84,54 86,92 Z" fill="#2e6e8c" stroke="#1f1a14" stroke-width="1"/>
        <!-- underbelly (darker front face of the neck) -->
        <path d="M70,90 C69,62 76,44 88,37 C97,33 101,36 100,41 C92,45 86,56 80,90 Z" fill="#1c4a61" opacity="0.5"/>
        <!-- scale texture climbing the neck -->
        <g fill="none" stroke="#1c4a61" stroke-width="0.5" stroke-linecap="round">
          <path d="M69,74 q4,-2.8 7.5,1"/><path d="M70,64 q4,-2.8 7.5,1"/><path d="M74,54 q3.8,-2.8 7.2,1"/><path d="M80,45 q3.6,-2.8 7,0.8"/>
        </g>

        <!-- CREST FIN — tall cyan dorsal sail along the back of the neck, behind the head -->
        <path d="M66,72 L68,50 L75,60 L79,34 L86,50 L90,24 L99,42 C95,48 82,60 70,72 Z" fill="#5ec0d8" stroke="#1c4a61" stroke-width="1" stroke-linejoin="round"/>
        <g fill="none" stroke="#1c4a61" stroke-width="0.6" opacity="0.8">
          <path d="M69,70 L68,51"/><path d="M76,66 L79,36"/><path d="M86,57 L90,26"/><path d="M94,50 L99,43"/>
        </g>

        <!-- DMG 2 — torn section of the crest fin -->
        <g class="cq-wound cq-wound-2">
          <path d="M86,48 L90,26 L92,38 L88,23 L84,36 Z" fill="#1c4a61" opacity="0.9"/>
          <path d="M84,38 L90,28 M87,44 L92,36" fill="none" stroke="#1f1a14" stroke-width="0.9" stroke-linecap="round"/>
          <circle cx="87" cy="46" r="1.3" fill="#c43b2e"/><circle cx="91" cy="42" r="1.3" fill="#c43b2e"/><circle cx="83" cy="48" r="1.3" fill="#c43b2e"/>
        </g>

        <!-- DMG 3 — cracked scale patch at the neck base (segment 3/4 junction) -->
        <g class="cq-wound cq-wound-3">
          <polygon points="70,72 78,68 85,73 82,82 73,83 67,77" fill="#8a3a3a" stroke="#1f1a14" stroke-width="1" stroke-linejoin="round"/>
          <path d="M75,70 L77,77 L72,81 M81,71 L78,77 L84,80" fill="none" stroke="#1f1a14" stroke-width="0.8" stroke-linecap="round"/>
          <circle cx="77" cy="83" r="1.3" fill="#c43b2e"/><circle cx="70" cy="78" r="1.1" fill="#c43b2e"/>
        </g>

        <!-- HEAD CLUSTER — reared atop the neck, facing right -->
        <g class="cq-serpent-head">
          <ellipse cx="104" cy="36" rx="12" ry="9" fill="#2e6e8c" stroke="#1f1a14" stroke-width="1"/>
          <!-- snout / upper jaw -->
          <path d="M113,30 L127,26 L127,33 L116,37 Z" fill="#2e6e8c" stroke="#1f1a14" stroke-width="1" stroke-linejoin="round"/>
          <!-- mouth line + lower jaw -->
          <path d="M115,37 Q121,37 127,33" fill="none" stroke="#1f1a14" stroke-width="0.8" stroke-linecap="round"/>
          <!-- nostril -->
          <circle cx="124" cy="28.5" r="0.9" fill="#1f1a14"/>
          <!-- brow ridge -->
          <path d="M98,30 Q104,27 110,30" fill="none" stroke="#1c4a61" stroke-width="1.2" stroke-linecap="round"/>
          <!-- back-of-skull spike -->
          <path d="M95,33 L90,27 L98,31 Z" fill="#5ec0d8" stroke="#1c4a61" stroke-width="0.8" stroke-linejoin="round"/>
          <!-- amber slit eye -->
          <ellipse cx="106" cy="33.5" rx="3.3" ry="2.4" fill="#ffd34d" stroke="#1f1a14" stroke-width="0.6"/>
          <ellipse cx="106" cy="33.5" rx="0.8" ry="1.9" fill="#1f1a14"/>
        </g>
      </g>

      <!-- ===== WATERLINE — static dark strip that half-submerges the coils ===== -->
      <g>
        <path d="M2,90 Q18,87 34,90 Q50,93 66,90 Q82,87 98,90 Q114,93 126,90 L126,112 L2,112 Z" fill="#1c4a61"/>
        <path d="M2,90 Q18,87 34,90 Q50,93 66,90 Q82,87 98,90 Q114,93 126,90" fill="none" stroke="#5ec0d8" stroke-width="1.4" opacity="0.85"/>
        <path d="M16,90 q4,-3 8,0" fill="none" stroke="#5ec0d8" stroke-width="1" opacity="0.7"/>
        <path d="M48,91 q4,-3 8,0" fill="none" stroke="#5ec0d8" stroke-width="1" opacity="0.7"/>
        <path d="M84,90 q4,-3 8,0" fill="none" stroke="#5ec0d8" stroke-width="1" opacity="0.7"/>
        <circle cx="30" cy="95" r="1.4" fill="#5ec0d8" opacity="0.6"/><circle cx="64" cy="97" r="1.6" fill="#5ec0d8" opacity="0.55"/><circle cx="100" cy="95" r="1.3" fill="#5ec0d8" opacity="0.6"/>
      </g>
    </g>
  </svg>
</div>`,
};
