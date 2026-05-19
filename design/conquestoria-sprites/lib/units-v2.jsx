/* Swordsman v2 — life-like upgrade prototype.
 *
 * Same visual design as v1 SwordsmanSprite, but every animate-able surface
 * gets a class hook so the v2 CSS can drive it:
 *
 *   .cq-shadow      — pulses with body bob
 *   .cq-leg-l/r     — articulated, swing in gait
 *   .cq-arm-r       — sword arm
 *   .cq-shield      — off-hand arm + shield, braces on attack
 *   .cq-plume       — secondary motion, lags body
 *   .cq-weapon      — sword (existing hook, retained)
 *   .cq-hit-spark   — impact flash, appears only on attack hold frame
 *   .cq-step-dust   — puffs from feet on walk landing
 *
 * Phase desync: pass `phase` ∈ [0,1) to offset all loops by that fraction.
 *
 * ╔══ ARCHITECTURAL RULE ══╗ (read before adding sprites)
 * Any element that gets a CSS-animated `transform` MUST NOT carry an SVG
 * `transform="..."` attribute. SVG transform attributes and CSS transforms
 * don't compose — the CSS one replaces the SVG one, so the element snaps
 * to viewBox origin (0,0) before rotating. Always split:
 *
 *   <g transform="translate(X Y)">      <!-- OUTER: position, no class -->
 *     <g className="cq-foo">             <!-- INNER: animated, no SVG xform -->
 *       …paths…
 *     </g>
 *   </g>
 *
 * Exception: `.cq-weapon` uses `transform-box: view-box` + CSS-var pivot
 * coords (`--pivot-x` / `--pivot-y`) so it can sit unwrapped and still
 * pivot at the shoulder. All other hooks must follow the wrapper pattern.
 */

const { SPRITE: _S2, factionAccent: _fa2 } = window;
const _P2 = _S2.PALETTE;

/* v2 sprite frame — adds cq-v2 class + --phase CSS var on the wrapper.
 * Phase: if a `phase` prop is provided it wins; otherwise each instance gets
 * a random stable phase via useMemo, so a row of identical sprites desyncs
 * automatically with no caller effort.
 *
 * Animation contract:
 *   data-state        ∈ { idle, walk, attack, hurt, death, busy }
 *   data-kind         ∈ { civilian, melee, ranged, naval, hound, spy, building }
 *   data-kind-variant ∈ { pike (melee), scout (hound), war (hound) }
 *                       Omit for sprites that have no variant differentiation.
 */
function SpriteFrameV2({
  size = 128, children, hex = true, hexTint = '#000',
  state = 'idle', kind = 'civilian', variant, phase,
}) {
  const { HexBase } = window;
  const autoPhase = React.useMemo(() => Math.random(), []);
  /* Use strict undefined check: `phase={0}` is a legitimate caller intent
   * (e.g. the phase-desync demo's first column) and must not fall through
   * to autoPhase. Only an *omitted* prop triggers the auto value. */
  const p = phase === undefined ? autoPhase : phase;
  const variantAttr = variant ? { 'data-kind-variant': variant } : {};
  return (
    <div className="cq-sprite-wrap cq-v2" data-state={state} data-kind={kind}
         {...variantAttr} style={{ '--phase': p }}>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%"
           data-state={state} data-kind={kind} {...variantAttr}>
        {hex && (
          <g transform={`translate(${(size - 96) / 2} ${size - 96 * 0.866 - 6})`}>
            <HexBase size={96} tint={hexTint} />
          </g>
        )}
        <g className="cq-sprite-figure">{children}</g>
      </svg>
    </div>
  );
}

/* HumanoidV2 — the v2 replacement for the v1 Humanoid primitive.
 *
 * What's new vs v1:
 *   • Every limb is wrapped: outer translate group positions it, inner
 *     class-hooked group is what CSS animates. (See ARCHITECTURAL RULE above.)
 *   • `arms` prop controls articulation:
 *       'free'   — arms swing in gait (civilians, light infantry, spies)
 *       'locked' — arms hold position with the body (heavy armor, two-handed
 *                  weapons, archers drawing a bow)
 *   • `armLContent` / `armRContent` slot props — anything you render here is
 *     placed INSIDE the arm group, so it moves with the arm. Use for tools
 *     held in one hand (worker's shovel, spy's gadget). Children are drawn in
 *     the arm's local frame: origin (0,0) is the shoulder, hand sits at (0,8).
 *
 * Drop-in compatible with v1 Humanoid's prop names — same cloth/pants/accent/
 * skin/hair/hat surface so porting v1 sprites is a 1-line swap (Humanoid →
 * HumanoidV2) plus optional `arms` + hand-content props.
 */
function HumanoidV2({
  cx = 64, cy = 64, scale = 1,
  cloth = _P2.cloth.tunic,
  pants = _P2.cloth.wool,
  accent = '#000',
  skin = _P2.skin.warm,
  hair = '#3a2a1a',
  hat = null,
  arms = 'free',
  armLContent = null,
  armRContent = null,
  facing = 0,
}) {
  const t = `translate(${cx} ${cy}) scale(${scale}) rotate(${facing * 4})`;
  // arms='locked' → no class hook, no shoulder articulation. The arm still
  // bobs with the body because it sits inside the cq-sprite-figure.
  const armClassL = arms === 'free' ? 'cq-arm-l' : '';
  const armClassR = arms === 'free' ? 'cq-arm-r' : '';
  return (
    <g transform={t}>
      {/* LEGS — wrapper pattern */}
      <g transform="translate(-6 4)">
        <g className="cq-leg-l">
          <ellipse cx="0" cy="18" rx="4.5" ry="2.5" fill={_P2.wood.dark} />
          <path d="M-3,0 Q-4,12 -1,18 L3,18 Q2,8 3,0 Z" fill={pants} stroke={_P2.ink.line} strokeWidth="0.8" />
        </g>
      </g>
      <g transform="translate(6 4)">
        <g className="cq-leg-r">
          <ellipse cx="0" cy="18" rx="4.5" ry="2.5" fill={_P2.wood.dark} />
          <path d="M-3,0 Q-4,12 -1,18 L3,18 Q2,8 3,0 Z" fill={pants} stroke={_P2.ink.line} strokeWidth="0.8" />
        </g>
      </g>

      {/* TORSO — rigid teardrop tunic + belt */}
      <path d="M0,-22 C14,-20 16,-2 12,8 L-12,8 C-16,-2 -14,-20 0,-22 Z" fill={cloth} stroke={_P2.ink.line} strokeWidth="1" />
      <rect x="-12" y="6" width="24" height="3" fill={accent} stroke={_P2.ink.line} strokeWidth="0.6" />

      {/* ARMS — wrapper pattern. armLContent / armRContent render INSIDE
          the cq-arm-l / cq-arm-r group so they move with the limb.
          Hand circle sits at local (0, 8); shoulder is at local (0, -9). */}
      <g transform="translate(-13 -2)">
        <g className={armClassL}>
          <ellipse cx="0" cy="0" rx="4" ry="9" fill={cloth} stroke={_P2.ink.line} strokeWidth="0.8" />
          <circle cx="0" cy="8" r="2.4" fill={skin} stroke={_P2.ink.line} strokeWidth="0.6" />
          {armLContent}
        </g>
      </g>
      <g transform="translate(13 -2)">
        <g className={armClassR}>
          <ellipse cx="0" cy="0" rx="4" ry="9" fill={cloth} stroke={_P2.ink.line} strokeWidth="0.8" />
          <circle cx="0" cy="8" r="2.4" fill={skin} stroke={_P2.ink.line} strokeWidth="0.6" />
          {armRContent}
        </g>
      </g>

      {/* NECK + HEAD */}
      <rect x="-3" y="-26" width="6" height="6" fill={skin} stroke={_P2.ink.line} strokeWidth="0.6" />
      <circle cx="0" cy="-30" r="9" fill={skin} stroke={_P2.ink.line} strokeWidth="1" />
      <path d="M-9,-32 Q-7,-40 0,-40 Q7,-40 9,-32 Q9,-30 7,-29 L-7,-29 Q-9,-30 -9,-32 Z" fill={hair} />
      <circle cx="-2.6" cy="-30" r="0.9" fill={_P2.ink.line} />
      <circle cx="2.6" cy="-30" r="0.9" fill={_P2.ink.line} />
      {hat}
    </g>
  );
}

function SwordsmanV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="melee" phase={phase}>
      {/* step dust — invisible until walk loop fires it */}
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3.2" ry="1.4" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3.2" ry="1.4" fill={_P2.stone.light} />
      </g>

      {/* shadow — reactive */}
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />

      {/* === BODY === */}
      <g transform="translate(64 70)">
        {/* LEGS — articulated. Outer translate positions the hip; inner
            class-hook group is what CSS rotates. */}
        <g transform="translate(-6 4)">
          <g className="cq-leg-l">
            <ellipse cx="0" cy="18" rx="4.5" ry="2.5" fill={_P2.metal.iron} />
            <path d="M-3,0 Q-4,12 -1,18 L3,18 Q2,8 3,0 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.8" />
          </g>
        </g>
        <g transform="translate(6 4)">
          <g className="cq-leg-r">
            <ellipse cx="0" cy="18" rx="4.5" ry="2.5" fill={_P2.metal.iron} />
            <path d="M-3,0 Q-4,12 -1,18 L3,18 Q2,8 3,0 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.8" />
          </g>
        </g>

        {/* TORSO — breastplate + tabard + pauldrons (rigid, no animation) */}
        <path d="M0,-22 C16,-20 18,-2 14,10 L-14,10 C-18,-2 -16,-20 0,-22 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="1" />
        <path d="M0,-22 C8,-18 9,-4 7,8 L-7,8 C-9,-4 -8,-18 0,-22 Z" fill={_P2.metal.shine} opacity="0.4" />
        <path d="M-6,-10 L6,-10 L8,14 L-8,14 Z" fill={f.mid} stroke={f.dark} strokeWidth="0.8" />
        <circle cx="0" cy="2" r="3" fill={f.trim} />
        <ellipse cx="-15" cy="-12" rx="5" ry="6" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.8" />
        <ellipse cx="15" cy="-12" rx="5" ry="6" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.8" />

        {/* HEAD + HELM */}
        <circle cx="0" cy="-30" r="9" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="1" />
        <path d="M-10,-32 Q-9,-42 0,-43 Q9,-42 10,-32 L10,-26 L-10,-26 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.8" />
        <rect x="-10" y="-29" width="20" height="3" fill={_P2.ink.line} />
        <rect x="-2" y="-29" width="4" height="3" fill={_P2.metal.shine} opacity="0.3" />

        {/* PLUME — secondary motion */}
        <g className="cq-plume">
          <path d="M0,-43 Q-5,-52 0,-58 Q5,-52 0,-43 Z" fill={f.bright} stroke={f.dark} strokeWidth="0.6" />
          <path d="M0,-43 Q-3,-50 -1,-55" fill="none" stroke={f.trim} strokeWidth="0.6" opacity="0.7" />
        </g>
      </g>

      {/* === SWORD ARM — pivots from the shoulder via --pivot-x/y vars.
              The .cq-weapon group is the exception to the wrapper rule:
              it uses `transform-box: view-box` so CSS rotation pivots
              around SVG viewBox coords without needing a translate parent. */}
      <g className="cq-weapon" style={{ '--pivot-x': '80px', '--pivot-y': '58px' }}>
        {/* upper arm — angled down-and-out from shoulder (80,58) */}
        <g transform="translate(80 58) rotate(-12)">
          <ellipse cx="3" cy="11" rx="3.8" ry="11" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.8" />
          <ellipse cx="3" cy="6" rx="2.4" ry="5" fill={_P2.metal.shine} opacity="0.45" />
        </g>
        {/* gauntlet hand near right hip */}
        <circle cx="86" cy="80" r="3.1" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="0.7" />
        <rect x="83" y="78.5" width="6" height="3.2" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.4" />

        {/* sword — origin AT the hand. Tilted up-and-right (away from body). */}
        <g transform="translate(86 80) rotate(38)">
          {/* pommel below the grip */}
          <circle cx="0" cy="6" r="2.2" fill={_P2.metal.gold} stroke={_P2.ink.line} strokeWidth="0.4" />
          {/* grip wrapped by the hand */}
          <rect x="-1.6" y="-3" width="3.2" height="9" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.4" />
          <line x1="-1.6" y1="-1" x2="1.6" y2="-1" stroke={_P2.metal.gold} strokeWidth="0.4" />
          <line x1="-1.6" y1="2"  x2="1.6" y2="2"  stroke={_P2.metal.gold} strokeWidth="0.4" />
          {/* crossguard */}
          <rect x="-6.5" y="-5" width="13" height="2.6" fill={_P2.metal.gold} stroke={_P2.ink.line} strokeWidth="0.4" />
          <circle cx="-6.5" cy="-3.7" r="1.1" fill={_P2.metal.gold} />
          <circle cx="6.5"  cy="-3.7" r="1.1" fill={_P2.metal.gold} />
          {/* blade extending up from crossguard */}
          <rect x="-1" y="-46" width="2" height="41" fill={_P2.metal.shine} stroke={_P2.ink.line} strokeWidth="0.5" />
          <rect x="-1" y="-46" width="1" height="41" fill="#ffffff" opacity="0.5" />
          <line x1="0" y1="-44" x2="0" y2="-8" stroke={_P2.ink.soft} strokeWidth="0.3" opacity="0.5" />
          <path d="M-1,-46 L1,-46 L0,-52 Z" fill={_P2.metal.shine} stroke={_P2.ink.line} strokeWidth="0.4" />

          {/* hit spark at blade tip — appears only on attack hold frame.
              Wrapper rule: outer translate positions, inner class group is
              animated. Otherwise the scale() animation would erase the
              translate and the spark would flash at the hand. */}
          <g transform="translate(0 -50)">
            <g className="cq-hit-spark">
              <path d="M0,-11 L3,-3 L12,0 L3,3 L0,11 L-3,3 L-12,0 L-3,-3 Z" fill="#fff5cc" />
              <path d="M0,-6 L2,-1 L7,0 L2,1 L0,6 L-2,1 L-7,0 L-2,-1 Z" fill="#ffffff" />
              <circle r="2" fill="#ffffff" />
            </g>
          </g>
        </g>
      </g>

      {/* === SHIELD ARM (left side) === */}
      <g transform="translate(42 60)">
        <g className="cq-shield">
          {/* arm under shield */}
          <ellipse cx="2" cy="-8" rx="3.5" ry="6" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.8" />
          {/* kite shield */}
          <path d="M-8,-12 L8,-12 L10,4 Q0,18 -10,4 Z" fill={f.mid} stroke={_P2.ink.line} strokeWidth="1" />
          <path d="M-6,-10 L6,-10 L8,2 Q0,12 -8,2 Z" fill={f.dark} opacity="0.6" />
          <circle cx="0" cy="-2" r="1.8" fill={_P2.metal.gold} stroke={_P2.ink.line} strokeWidth="0.4" />
        </g>
      </g>
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── CANARY: Worker (civilian, free arms) ─────────────────────────── */
/* Free-armed civilian carrying a shovel in the right hand. The shovel sits
 * INSIDE the cq-arm-r group via armRContent, so it swings with the arm during
 * walk \u2014 unlike v1 where the shovel was anchored to the body. */
function WorkerV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="civilian" phase={phase}>
      {/* step dust */}
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />

      <HumanoidV2
        cx={64} cy={70}
        cloth={_P2.cloth.tunic} pants={_P2.cloth.wool}
        accent={f.mid} hair="#5a3a20"
        arms="free"
        hat={<ellipse cx="0" cy="-40" rx="12" ry="3" fill={_P2.thatch.straw} stroke={_P2.ink.line} strokeWidth="0.6" />}
        armRContent={(
          /* Shovel held diagonally. Origin (0,0) of this content is the
             shoulder of the right arm; hand is at (0,8). Anchor the shovel
             handle at the hand. */
          <g transform="translate(0 8) rotate(35)">
            <rect x="-1.2" y="-2" width="2.4" height="38" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="0.5" />
            <path d="M-5,36 L5,36 L4,48 L-4,48 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.7" />
            <path d="M-5,36 L5,36 L5,38 L-5,38 Z" fill={_P2.metal.shine} opacity="0.5" />
          </g>
        )}
      />
      {/* tool belt pouch \u2014 anchored to body, not the arm */}
      <rect x="58" y="74" width="8" height="6" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.5" />
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── CANARY: Archer (combatant, locked arms, bow draw) ─────────────────────────── */
/* Arms="locked" means the figure doesn't articulate at the shoulders \u2014 the
 * archer holds his stance while the BOW does the work via cq-weapon (the
 * draw animation) and the bowstring snaps via cq-bowstring. */
function ArcherV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="ranged" phase={phase}>
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />

      <HumanoidV2
        cx={64} cy={70}
        cloth="#5a6e3a" pants={_P2.cloth.wool}
        accent={f.mid} hair="#3a2a1a"
        arms="locked"
        hat={<path d="M-10,-38 Q0,-48 10,-38 L8,-32 L-8,-32 Z" fill="#3a4a20" stroke={_P2.ink.line} strokeWidth="0.8" />}
      />

      {/* QUIVER (left back) \u2014 static body-attached */}
      <g transform="translate(48 56)">
        <rect x="-3" y="-10" width="6" height="20" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="0.6" />
        <rect x="-2" y="-14" width="1.5" height="6" fill={_P2.cloth.linen} />
        <rect x="0"  y="-14" width="1.5" height="6" fill={f.mid} />
        <rect x="2"  y="-14" width="1.5" height="6" fill={_P2.cloth.linen} />
      </g>

      {/* BOW \u2014 held in front. .cq-weapon group has --pivot-x/y set so the
          v1 walk-trail / v2 bow-draw transforms pivot around the bow's grip,
          where the hand should be. The bow stays unwrapped per the rule
          (.cq-weapon is the exception, view-box pivot). */}
      <g className="cq-weapon" style={{ '--pivot-x': '78px', '--pivot-y': '56px' }}>
        {/* bow limbs */}
        <path d="M78,34 Q90,56 78,78" fill="none" stroke={_P2.wood.dark} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M78,36 Q88,56 78,76" fill="none" stroke={_P2.wood.mid} strokeWidth="1" strokeLinecap="round" />
        {/* bowstring \u2014 wrapped so cq-bowstring animation doesn't lose position */}
        <g transform="translate(78 56)">
          <g className="cq-bowstring">
            <line x1="0" y1="-22" x2="0" y2="22" stroke={_P2.cloth.linen} strokeWidth="0.7" />
            {/* nock point + arrow stub */}
            <line x1="0" y1="0" x2="-10" y2="0" stroke={_P2.cloth.linen} strokeWidth="0.9" />
            <polygon points="-12,-1 -10,0 -12,1 -16,0" fill={_P2.metal.iron} />
          </g>
        </g>
        {/* grip wrap on the bow */}
        <rect x="76.5" y="53" width="3" height="6" fill={_P2.cloth.dye} stroke={_P2.ink.line} strokeWidth="0.4" />
      </g>
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── CANARY: Spy Operative (cloak, gadget, free arms) ─────────────────────────── */
/* Tests: cape sway via .cq-cape, articulated arms holding a gadget. The cloak
 * is wrapped in the cq-cape hook with its pivot at the shoulders so it sways
 * naturally during walk/idle. */
function SpyOperativeV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="spy" hexTint="#241a36" phase={phase}>
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />

      {/* CLOAK \u2014 .cq-cape sways from shoulders. Wrapper rule: outer translate
          positions it across the body, inner cq-cape gets the sway. */}
      <g transform="translate(64 40)">
        <g className="cq-cape">
          <path d="M-20,0 Q0,-4 20,0 L28,58 Q0,64 -28,58 Z" fill="#16161c" stroke={_P2.ink.line} strokeWidth="1" />
          <path d="M-12,2 L-4,58 M12,2 L4,58" stroke={_P2.ink.line} strokeWidth="0.5" opacity="0.55" />
        </g>
      </g>

      <HumanoidV2
        cx={64} cy={70}
        cloth="transparent" pants="transparent" accent="transparent"
        skin={_P2.skin.warm} hair="#1a1410"
        arms="free"
        hat={<path d="M-11,-40 Q0,-44 11,-40 L11,-30 L-11,-30 Z" fill="#0a0a10" />}
        armRContent={(
          /* small handheld device \u2014 phone-sized rectangle */
          <g transform="translate(0 8)">
            <rect x="-2" y="-8" width="4" height="11" rx="0.6" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.4" />
            <rect x="-1.4" y="-7" width="2.8" height="7" fill={f.bright} opacity="0.85" />
            <circle cx="0" cy="2" r="0.6" fill={_P2.ink.line} />
          </g>
        )}
      />

      {/* faction pin on lapel \u2014 small static accent */}
      <circle cx="58" cy="50" r="2" fill={f.bright} stroke={f.dark} strokeWidth="0.4" />
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Settler (civilian, walking staff) ─────────────────────────── */
function SettlerV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="civilian" phase={phase}>
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />

      {/* ox-cart wheel — body-anchored static art */}
      <g transform="translate(36 80)">
        <circle r="10" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="1" />
        <line x1="-10" y1="0" x2="10" y2="0" stroke={_P2.wood.dark} strokeWidth="1" />
        <line x1="0" y1="-10" x2="0" y2="10" stroke={_P2.wood.dark} strokeWidth="1" />
        <circle r="2" fill={_P2.metal.iron} />
      </g>

      {/* bundle on back — body-anchored static art */}
      <g transform="translate(78 56)">
        <rect x="-10" y="-10" width="20" height="18" rx="3" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="1" />
        <path d="M-10,-6 L10,-6 M-10,-2 L10,-2 M-10,2 L10,2" stroke={_P2.ink.soft} strokeWidth="0.6" />
      </g>

      <HumanoidV2
        cx={64} cy={70}
        cloth={_P2.cloth.linen} pants={_P2.cloth.wool}
        accent={f.mid} hair={_P2.ink.soft}
        arms="free"
        armRContent={(
          <g transform="translate(0 8) rotate(-10)">
            <line x1="0" y1="-32" x2="0" y2="16" stroke={_P2.wood.mid} strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}
      />
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Scout (civilian, spyglass at brow) ─────────────────────────── */
function ScoutV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="civilian" phase={phase}>
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />

      <HumanoidV2
        cx={64} cy={70}
        cloth="#6b7a4a" pants={_P2.cloth.wool}
        accent={f.mid} hair="#3a2a1a"
        arms="free"
        hat={<path d="M-10,-38 Q0,-46 10,-38 L10,-34 L-10,-34 Z" fill={f.dark} stroke={_P2.ink.line} strokeWidth="0.8" />}
        armRContent={(
          <g transform="translate(0 0) rotate(-10)">
            <rect x="0" y="-2" width="14" height="4" rx="1" fill={_P2.metal.bronze} stroke={_P2.ink.line} strokeWidth="0.6" />
            <rect x="12" y="-3" width="3" height="6" fill={_P2.metal.gold} />
          </g>
        )}
      />
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Musketeer (ranged, locked arms, musket) ─────────────────────────── */
function MusketeerV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="ranged" phase={phase}>
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />

      <HumanoidV2
        cx={64} cy={70}
        cloth={f.dark} pants="#3a3022"
        accent={f.bright} hair="#2a1a10"
        arms="locked"
        hat={(
          <g>
            <path d="M-16,-36 L16,-36 L0,-46 Z" fill="#1a1410" stroke={_P2.ink.line} strokeWidth="0.8" />
            <ellipse cx="0" cy="-34" rx="14" ry="3" fill="#1a1410" />
            <rect x="-12" y="-37" width="24" height="2" fill={f.trim} />
          </g>
        )}
      />

      {/* MUSKET — .cq-weapon pivot at right shoulder (82, 55) */}
      <g className="cq-weapon" style={{ '--pivot-x': '82px', '--pivot-y': '55px' }}>
        <g transform="translate(82 55) rotate(18)">
          <rect x="-1" y="0" width="2" height="56" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.5" />
          <rect x="-2" y="0" width="4" height="6" fill={_P2.metal.iron} />
          <path d="M-4,52 L4,52 L3,62 L-3,62 Z" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.6" />
          <rect x="-0.5" y="0" width="1" height="2" fill={_P2.metal.shine} />
        </g>
      </g>

      {/* MUZZLE FLASH — separate wrapped group, uses v1 .cq-muzzle-flash hook */}
      <g transform="translate(88 33)">
        <g className="cq-muzzle-flash">
          <circle r="6" fill="#ffd966" />
          <circle r="3" fill="#fff" />
          <path d="M0,-9 L2,-3 L8,-2 L3,1 L4,7 L0,4 L-4,7 L-3,1 L-8,-2 L-2,-3 Z" fill="#ffd966" opacity="0.9" />
        </g>
      </g>

      {/* powder horn */}
      <ellipse cx="48" cy="76" rx="4" ry="6" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.5" />
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Warrior (melee, free arms, club + round shield) ─────────────────────────── */
function WarriorV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="melee" phase={phase}>
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />

      <HumanoidV2
        cx={64} cy={70}
        cloth={f.mid} pants={_P2.cloth.wool}
        accent={f.dark} hair="#3a2a1a"
        arms="free"
        armLContent={(
          <g transform="translate(-2 8)">
            <circle r="12" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="0.8" />
            <circle r="12" fill={f.mid} opacity="0.85" />
            <circle r="3" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.5" />
            <path d="M-9,0 L9,0 M0,-9 L0,9" stroke={f.dark} strokeWidth="1" />
          </g>
        )}
      />

      {/* CLUB/MACE — pivot at right shoulder (77, 68) */}
      <g className="cq-weapon" style={{ '--pivot-x': '77px', '--pivot-y': '68px' }}>
        <g transform="translate(77 68) rotate(15)">
          <rect x="-1.2" y="0" width="2.4" height="40" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.5" />
          <path d="M-7,-6 L7,-6 L9,6 L-9,6 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.8" />
          <path d="M-7,-6 L7,-6 L7,-2 L-7,-2 Z" fill={_P2.metal.shine} opacity="0.5" />
        </g>
        <g transform="translate(82 56)">
          <g className="cq-hit-spark">
            <path d="M0,-10 L3,-3 L10,0 L3,3 L0,10 L-3,3 L-10,0 L-3,-3 Z" fill="#fff5cc" />
            <path d="M0,-6 L2,-1 L6,0 L2,1 L0,6 L-2,1 L-6,0 L-2,-1 Z" fill="#ffffff" />
            <circle r="2" fill="#ffffff" />
          </g>
        </g>
      </g>
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Pikeman (melee, locked arms, pike) ─────────────────────────── */
function PikemanV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="melee" variant="pike" phase={phase}>
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />

      <HumanoidV2
        cx={64} cy={70}
        cloth={f.mid} pants={_P2.cloth.wool}
        accent={f.dark} hair="#3a2a1a"
        arms="locked"
        hat={(
          <g>
            <path d="M-11,-33 Q-10,-44 0,-44 Q10,-44 11,-33 L11,-28 L-11,-28 Z"
              fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.8" />
            <ellipse cx="0" cy="-44" rx="6" ry="2" fill={_P2.metal.iron} />
          </g>
        )}
      />

      {/* PIKE — long shaft. Pivot at grip center (56, 56). */}
      <g className="cq-weapon" style={{ '--pivot-x': '56px', '--pivot-y': '56px' }}>
        <g className="cq-weapon-inner" transform="translate(54 22) rotate(-8)">
          <rect x="-1" y="0" width="2" height="100" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="0.5" />
          <path d="M-3,0 L3,0 L4,-12 L0,-18 L-4,-12 Z"
            fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.8" />
          <rect x="-3" y="-2" width="6" height="2" fill={_P2.metal.gold} />
        </g>
      </g>
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── SpyScout (cape + monocular) ─────────────────────────── */
function SpyScoutV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="spy" hexTint="#241a36" phase={phase}>
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />
      <g transform="translate(64 40)">
        <g className="cq-cape">
          <path d="M-20,0 Q0,-4 20,0 L28,58 Q0,64 -28,58 Z" fill="#2a2a32" stroke={_P2.ink.line} strokeWidth="1" />
          <path d="M-12,2 L-4,58 M12,2 L4,58" stroke={_P2.ink.line} strokeWidth="0.5" opacity="0.55" />
        </g>
      </g>
      <HumanoidV2
        cx={64} cy={70}
        cloth="transparent" pants="transparent" accent="transparent"
        skin={_P2.skin.warm} hair="#1a1410"
        arms="free"
        hat={<path d="M-12,-36 Q0,-46 12,-36 L10,-32 L-10,-32 Z" fill="#1a1410" />}
        armRContent={(
          <g transform="translate(0 4)">
            <circle r="5" fill={_P2.metal.shine} stroke={_P2.ink.line} strokeWidth="0.6" />
            <circle r="3" fill={_P2.ground.water} />
          </g>
        )}
      />
      <circle cx="58" cy="50" r="2" fill={f.bright} stroke={f.dark} strokeWidth="0.4" />
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── SpyInformant (cape + newspaper) ─────────────────────────── */
function SpyInformantV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="spy" hexTint="#241a36" phase={phase}>
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />
      <g transform="translate(64 40)">
        <g className="cq-cape">
          <path d="M-20,0 Q0,-4 20,0 L28,58 Q0,64 -28,58 Z" fill="#2a2a32" stroke={_P2.ink.line} strokeWidth="1" />
        </g>
      </g>
      <HumanoidV2
        cx={64} cy={70}
        cloth="transparent" pants="transparent" accent="transparent"
        skin={_P2.skin.warm} hair="#1a1410"
        arms="free"
        hat={<ellipse cx="0" cy="-38" rx="14" ry="4" fill="#1a1410" />}
        armRContent={(
          <g transform="translate(0 8)">
            <rect x="-4" y="-6" width="8" height="12" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="0.6" />
            <line x1="-3" y1="-2" x2="3" y2="-2" stroke={_P2.ink.line} strokeWidth="0.5" />
            <line x1="-3" y1="1" x2="3" y2="1" stroke={_P2.ink.line} strokeWidth="0.5" />
            <line x1="-3" y1="4" x2="3" y2="4" stroke={_P2.ink.line} strokeWidth="0.5" />
          </g>
        )}
      />
      <circle cx="58" cy="50" r="2" fill={f.bright} stroke={f.dark} strokeWidth="0.4" />
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── SpyAgent (cape + mini radio) ─────────────────────────── */
function SpyAgentV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="spy" hexTint="#241a36" phase={phase}>
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />
      <g transform="translate(64 40)">
        <g className="cq-cape">
          <path d="M-20,0 Q0,-4 20,0 L28,58 Q0,64 -28,58 Z" fill="#1c1c24" stroke={_P2.ink.line} strokeWidth="1" />
        </g>
      </g>
      <HumanoidV2
        cx={64} cy={70}
        cloth="transparent" pants="transparent" accent="transparent"
        skin={_P2.skin.warm} hair="#1a1410"
        arms="free"
        hat={<path d="M-13,-36 L13,-36 L11,-40 L-11,-40 Z M-15,-36 L15,-36 L15,-34 L-15,-34 Z" fill="#0a0a10" />}
        armRContent={(
          <g transform="translate(0 8)">
            <rect x="-4" y="-3" width="10" height="6" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.6" />
            <circle cx="6" cy="0" r="1.4" fill={f.bright} />
          </g>
        )}
      />
      <circle cx="58" cy="50" r="2" fill={f.bright} stroke={f.dark} strokeWidth="0.4" />
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── SpyHacker (cape + terminal) ─────────────────────────── */
function SpyHackerV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="spy" hexTint="#241a36" phase={phase}>
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />
      <g transform="translate(64 40)">
        <g className="cq-cape">
          <path d="M-20,0 Q0,-4 20,0 L28,58 Q0,64 -28,58 Z" fill="#0e1820" stroke={_P2.ink.line} strokeWidth="1" />
        </g>
      </g>
      <HumanoidV2
        cx={64} cy={70}
        cloth="transparent" pants="transparent" accent="transparent"
        skin={_P2.skin.warm} hair="#1a1410"
        arms="free"
        hat={<path d="M-12,-40 Q0,-46 12,-40 L12,-28 L-12,-28 Z" fill="#0a0a10" />}
        armRContent={(
          <g transform="translate(0 8)">
            <rect x="-7" y="-5" width="14" height="10" rx="1" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.6" />
            <rect x="-5" y="-3" width="10" height="6" fill={f.bright} opacity="0.8" />
          </g>
        )}
      />
      <circle cx="58" cy="50" r="2" fill={f.bright} stroke={f.dark} strokeWidth="0.4" />
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── ShadowWarden (free arms + wide cape + lantern) ─────────────────────────── */
function ShadowWardenV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="spy" hexTint="#3a2858" phase={phase}>
      <g transform="translate(58 91)">
        <ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <g transform="translate(70 91)">
        <ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} />
      </g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />
      <g transform="translate(64 40)">
        <g className="cq-cape">
          <path d="M-20,0 Q0,-4 20,0 L32,60 Q0,68 -32,60 Z" fill="#231833" stroke={_P2.ink.line} strokeWidth="1" />
          <path d="M-12,2 Q-4,30 -4,58 M12,2 Q4,30 4,58" stroke={_P2.ink.line} strokeWidth="0.5" opacity="0.55" />
        </g>
      </g>
      <HumanoidV2
        cx={64} cy={70}
        cloth="transparent" pants="transparent" accent="transparent"
        skin={_P2.skin.cool} hair="#1a1020"
        arms="free"
        hat={<path d="M-12,-38 Q0,-50 12,-38 L8,-30 L-8,-30 Z" fill="#1a1020" stroke={_P2.ink.line} strokeWidth="0.8" />}
        armRContent={(
          <g transform="translate(0 8)">
            <line x1="0" y1="-6" x2="0" y2="0" stroke={_P2.metal.iron} strokeWidth="0.8" />
            <rect x="-3" y="0" width="6" height="8" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.6" />
            <circle cx="0" cy="4" r="2.5" fill={f.bright} opacity="0.9" />
          </g>
        )}
      />
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── ScoutHound (quadruped, body bob) ─────────────────────────── */
function ScoutHoundV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="hound" variant="scout" phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="95" rx="24" ry="6" fill="#000" opacity="0.35" />
      <g transform="translate(64 72)">
        <path d="M22,-4 Q32,-12 30,-22" stroke="#7a5a3a" strokeWidth="4" fill="none" strokeLinecap="round" />
        <ellipse cx="4" cy="0" rx="22" ry="12" fill="#a07a4a" stroke={_P2.ink.line} strokeWidth="1" />
        <ellipse cx="4" cy="-3" rx="20" ry="8" fill="#b88a5a" />
        <g transform="translate(-9.5 6)"><g className="cq-leg-fl"><rect x="-2.5" y="0" width="5" height="14" fill="#7a5a3a" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(0.5 6)"><g className="cq-leg-fr"><rect x="-2.5" y="0" width="5" height="14" fill="#7a5a3a" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(16.5 6)"><g className="cq-leg-bl"><rect x="-2.5" y="0" width="5" height="14" fill="#7a5a3a" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(22.5 6)"><g className="cq-leg-br"><rect x="-2.5" y="0" width="5" height="14" fill="#7a5a3a" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <ellipse cx="-18" cy="-4" rx="11" ry="9" fill="#a07a4a" stroke={_P2.ink.line} strokeWidth="1" />
        <path d="M-26,-3 L-32,2 L-26,4 Z" fill="#a07a4a" stroke={_P2.ink.line} strokeWidth="0.8" />
        <path d="M-14,-12 L-10,-18 L-8,-10 Z" fill="#7a5a3a" stroke={_P2.ink.line} strokeWidth="0.6" />
        <circle cx="-22" cy="-4" r="0.9" fill={_P2.ink.line} />
        <circle cx="-30" cy="2" r="1.2" fill={_P2.ink.line} />
        <rect x="-12" y="-6" width="14" height="3" fill={f.mid} stroke={_P2.ink.line} strokeWidth="0.5" />
        <circle cx="-5" cy="-4.5" r="1.3" fill={f.trim} />
      </g>
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── WarHound (quadruped, heavier, armored collar) ─────────────────────────── */
function WarHoundV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="hound" variant="war" phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="95" rx="26" ry="7" fill="#000" opacity="0.35" />
      <g transform="translate(64 72)">
        <path d="M22,-4 Q32,-8 28,-18" stroke="#2a1a10" strokeWidth="4" fill="none" strokeLinecap="round" />
        <ellipse cx="4" cy="0" rx="24" ry="13" fill="#3a2a1a" stroke={_P2.ink.line} strokeWidth="1" />
        <ellipse cx="4" cy="-3" rx="22" ry="9" fill="#5a3a20" />
        <rect x="-10" y="-8" width="18" height="5" fill={f.dark} stroke={_P2.ink.line} strokeWidth="0.6" />
        <polygon points="-8,-8 -6,-12 -4,-8" fill={_P2.metal.iron} />
        <polygon points="-2,-8 0,-12 2,-8" fill={_P2.metal.iron} />
        <polygon points="4,-8 6,-12 8,-8" fill={_P2.metal.iron} />
        <g transform="translate(-9 6)"><g className="cq-leg-fl"><rect x="-3" y="0" width="6" height="14" fill="#2a1a10" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(0 6)"><g className="cq-leg-fr"><rect x="-3" y="0" width="6" height="14" fill="#2a1a10" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(16 6)"><g className="cq-leg-bl"><rect x="-3" y="0" width="6" height="14" fill="#2a1a10" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(23 6)"><g className="cq-leg-br"><rect x="-3" y="0" width="6" height="14" fill="#2a1a10" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <ellipse cx="-18" cy="-4" rx="12" ry="10" fill="#3a2a1a" stroke={_P2.ink.line} strokeWidth="1" />
        <path d="M-28,-3 L-34,4 L-26,5 Z" fill="#3a2a1a" stroke={_P2.ink.line} strokeWidth="0.8" />
        <path d="M-14,-14 L-10,-20 L-7,-12 Z" fill="#2a1a10" stroke={_P2.ink.line} strokeWidth="0.6" />
        <polygon points="-30,4 -28,8 -26,4" fill={_P2.cloth.linen} />
        <circle cx="-22" cy="-5" r="1.4" fill={f.bright} />
        <circle cx="-32" cy="2" r="1.2" fill={_P2.ink.line} />
      </g>
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Galley (naval — auto-phase only) ─────────────────────────── */
function GalleyV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="naval" hexTint={_P2.ground.water} phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="96" rx="42" ry="6" fill="#000" opacity="0.28" />
      <path d="M16,80 Q64,72 112,80 Q104,98 64,100 Q24,98 16,80 Z" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="1.2" />
      <path d="M22,82 Q64,76 106,82 Q100,90 64,92 Q28,90 22,82 Z" fill={_P2.wood.light} />
      <circle cx="36" cy="80" r="4" fill={f.mid} stroke={_P2.ink.line} strokeWidth="0.5" />
      <circle cx="50" cy="78" r="4" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="0.5" />
      <circle cx="64" cy="77" r="4" fill={f.mid} stroke={_P2.ink.line} strokeWidth="0.5" />
      <circle cx="78" cy="78" r="4" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="0.5" />
      <circle cx="92" cy="80" r="4" fill={f.mid} stroke={_P2.ink.line} strokeWidth="0.5" />
      <line x1="28" y1="86" x2="14" y2="96" stroke={_P2.wood.dark} strokeWidth="2" />
      <line x1="46" y1="86" x2="36" y2="98" stroke={_P2.wood.dark} strokeWidth="2" />
      <line x1="82" y1="86" x2="92" y2="98" stroke={_P2.wood.dark} strokeWidth="2" />
      <line x1="100" y1="86" x2="114" y2="96" stroke={_P2.wood.dark} strokeWidth="2" />
      <line x1="64" y1="78" x2="64" y2="20" stroke={_P2.wood.dark} strokeWidth="2" />
      <g className="cq-sail">
        <path d="M64,24 L96,40 L96,66 L64,72 Z" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="1" />
        <path d="M64,24 L42,40 L42,66 L64,72 Z" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="1" />
        <rect x="64" y="34" width="32" height="8" fill={f.mid} opacity="0.8" />
        <rect x="42" y="34" width="22" height="8" fill={f.mid} opacity="0.8" />
      </g>
      <path d="M16,84 L4,90 L16,90 Z" fill={_P2.metal.bronze} stroke={_P2.ink.line} strokeWidth="0.6" />
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Trireme (naval — auto-phase only) ─────────────────────────── */
function TriremeV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="naval" hexTint={_P2.ground.water} phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="98" rx="48" ry="7" fill="#000" opacity="0.28" />
      <path d="M10,86 Q64,76 118,86 Q108,104 64,106 Q20,104 10,86 Z" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="1.2" />
      <path d="M16,80 Q64,70 112,80 Q102,90 64,92 Q26,90 16,80 Z" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="1" />
      <path d="M22,76 Q64,68 106,76 L100,82 L28,82 Z" fill={_P2.wood.light} />
      {[0,1,2].map(row => (
        <g key={row} transform={`translate(0 ${82 + row*4})`}>
          <line x1="28" y1="0" x2="14" y2={6 + row*2} stroke={_P2.wood.dark} strokeWidth="1.6" />
          <line x1="46" y1="0" x2="36" y2={8 + row*2} stroke={_P2.wood.dark} strokeWidth="1.6" />
          <line x1="82" y1="0" x2="92" y2={8 + row*2} stroke={_P2.wood.dark} strokeWidth="1.6" />
          <line x1="100" y1="0" x2="114" y2={6 + row*2} stroke={_P2.wood.dark} strokeWidth="1.6" />
        </g>
      ))}
      <g transform="translate(28 82)"><g className="cq-muzzle-flash"><circle r="4" fill="#ffd966" /><circle r="2" fill="#fff" /></g></g>
      <g transform="translate(100 82)"><g className="cq-muzzle-flash"><circle r="4" fill="#ffd966" /><circle r="2" fill="#fff" /></g></g>
      <rect x="92" y="62" width="18" height="14" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.8" />
      <rect x="94" y="64" width="3" height="4" fill={_P2.ink.line} />
      <rect x="100" y="64" width="3" height="4" fill={_P2.ink.line} />
      <line x1="58" y1="76" x2="58" y2="14" stroke={_P2.wood.dark} strokeWidth="2.4" />
      <g className="cq-sail">
        <path d="M58,18 L98,38 L98,68 L58,72 Z" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="1" />
        <path d="M58,18 L34,38 L34,68 L58,72 Z" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="1" />
        <rect x="58" y="30" width="40" height="10" fill={f.mid} opacity="0.85" />
        <rect x="34" y="30" width="24" height="10" fill={f.mid} opacity="0.85" />
        <circle cx="78" cy="50" r="6" fill={f.trim} stroke={f.dark} strokeWidth="0.8" />
      </g>
      <path d="M10,88 L-4,94 L10,96 Z" fill={_P2.metal.bronze} stroke={_P2.ink.line} strokeWidth="0.6" />
      <path d="M10,90 L-2,94 L10,94 Z" fill={_P2.metal.gold} opacity="0.7" />
    </SpriteFrameV2>
  );
}

Object.assign(window, {
  SpriteFrameV2, HumanoidV2,
  SwordsmanV2Sprite, WorkerV2Sprite, ArcherV2Sprite, SpyOperativeV2Sprite,
  SettlerV2Sprite, ScoutV2Sprite,
  MusketeerV2Sprite,
  WarriorV2Sprite, PikemanV2Sprite,
  SpyScoutV2Sprite, SpyInformantV2Sprite, SpyAgentV2Sprite, SpyHackerV2Sprite, ShadowWardenV2Sprite,
  ScoutHoundV2Sprite, WarHoundV2Sprite,
  GalleyV2Sprite, TriremeV2Sprite,
});
