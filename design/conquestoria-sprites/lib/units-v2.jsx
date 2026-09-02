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
 *   data-kind         ∈ { civilian, melee, ranged, naval, hound, animal, spy, building }
 *   data-kind-variant ∈ { pike (melee), scout/war (hound), mount/elephant (animal) }
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
        cloth={f.mid} pants={_P2.cloth.wool}
        accent={f.bright} hair="#3a2a1a"
        arms="locked"
        hat={<path d="M-10,-38 Q0,-48 10,-38 L8,-32 L-8,-32 Z" fill={f.dark} stroke={_P2.ink.line} strokeWidth="0.8" />}
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

/* ─────────────────────────── #708 mounted and beast formations ─────────────────────────── */
function BeastHandlerV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="hound" variant="handler" phase={phase}>
      <ellipse className="cq-shadow" cx="66" cy="98" rx="42" ry="7" fill="#000" opacity="0.35" />
      {/* The person and hound are two readable walkers: the hand holds both staff and leash. */}
      <g transform="translate(72 79)"><g className="cq-hound-body" data-facing="right">
        <path d="M-26,-5 Q-16,-21 5,-20 Q24,-19 31,-7 L29,8 Q8,19 -19,12 Q-29,8 -26,-5 Z" fill="#7b5737" stroke={_P2.ink.line} strokeWidth="1.1" />
        <path d="M-17,-10 Q1,-17 19,-11" stroke="#b8895a" strokeWidth="2" fill="none" opacity="0.62" />
        <path d="M17,-13 Q26,-11 30,-6" stroke={f.mid} strokeWidth="3.8" fill="none" opacity="0.95" />
        <g transform="translate(17 6)"><g className="cq-leg-fl"><path d="M-3,0 L4,0 L3,16 L-5,16 Z" fill="#4a3020" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(27 4)"><g className="cq-leg-fr"><path d="M-3,0 L4,0 L3,16 L-5,16 Z" fill="#4a3020" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(-18 6)"><g className="cq-leg-bl"><path d="M-3,0 L4,0 L2,16 L-5,16 Z" fill="#4a3020" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(-7 8)"><g className="cq-leg-br"><path d="M-3,0 L4,0 L2,16 L-5,16 Z" fill="#4a3020" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(27 -8)"><g className="cq-hound-head">
          <path d="M-4,-5 Q5,-18 18,-12 L24,-4 L19,6 L5,8 L-6,2 Z" fill="#8a5a3c" stroke={_P2.ink.line} strokeWidth="0.9" />
          <g className="cq-hound-ears"><path d="M0,-9 L4,-21 L10,-9 M10,-11 L18,-19 L17,-5" fill="#5e3f24" stroke={_P2.ink.line} strokeWidth="0.7" /></g>
          <circle cx="13" cy="-4" r="1.4" fill={f.bright} /><path d="M19,1 L29,4 L20,6 Z" fill="#2a1a10" />
        </g></g>
        <g transform="translate(-23 -4)"><g className="cq-hound-tail"><path d="M0,0 Q-12,-8 -17,-20 Q-20,-26 -14,-28" stroke="#5e3f24" strokeWidth="4" fill="none" strokeLinecap="round" /></g></g>
      </g></g>
      <g className="cq-handler-body">
        <path d="M35,55 Q43,52 48,59 L48,78 L34,80 L29,66 Q29,58 35,55 Z" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="1" />
        <path d="M31,65 L47,65 L47,78 L34,79 Z" fill={f.mid} stroke={f.dark} strokeWidth="0.6" />
        <path d="M33,75 L47,75" stroke={_P2.wood.dark} strokeWidth="1.4" />
        <circle cx="38" cy="49" r="7" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="0.8" />
        <path d="M30,49 Q38,38 46,48 L45,54 L31,54 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.8" />
        <path d="M34,50 L39,45 L43,50 L42,54 L35,54 Z" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="0.45" />
      </g>
      <g className="cq-handler-leg-l" transform="translate(35 78)"><g className="cq-handler-leg-l-joint"><path d="M-3,0 L4,0 L2,16 L-5,16 Z" fill={_P2.cloth.wool} stroke={_P2.ink.line} strokeWidth="0.65" /><path d="M-6,16 L3,16 L5,19 L-7,19 Z" fill={_P2.wood.dark} /></g></g>
      <g className="cq-handler-leg-r" transform="translate(44 78)"><g className="cq-handler-leg-r-joint"><path d="M-3,0 L4,0 L5,15 L-2,15 Z" fill={_P2.cloth.wool} stroke={_P2.ink.line} strokeWidth="0.65" /><path d="M-4,15 L6,15 L7,18 L-5,18 Z" fill={_P2.wood.dark} /></g></g>
      <g className="cq-handler-arm-l"><path d="M33,61 Q40,63 48,66" stroke={f.mid} strokeWidth="5" fill="none" strokeLinecap="round" /><circle cx="49" cy="66" r="2.2" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="0.45" /></g>
      <g className="cq-handler-arm-r"><path d="M43,61 Q47,68 50,72" stroke={f.mid} strokeWidth="5" fill="none" strokeLinecap="round" /><circle cx="50" cy="72" r="2.2" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="0.45" /></g>
      <g className="cq-command-staff" transform="translate(50 66)"><path d="M0,-20 L0,27" stroke={_P2.wood.dark} strokeWidth="3" /><path d="M0,-20 L-7,-28 M0,-20 L7,-28" stroke={_P2.metal.bronze} strokeWidth="2" fill="none" /></g>
      <path className="cq-command-leash" d="M49,66 Q68,82 97,70" stroke={f.bright} strokeWidth="2" fill="none" />
    </SpriteFrameV2>
  );
}

function WarElephantV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="animal" variant="elephant" phase={phase}>
      <ellipse className="cq-shadow" cx="65" cy="100" rx="46" ry="8" fill="#000" opacity="0.35" />
      <g transform="translate(57 77)"><g className="cq-elephant-body" data-facing="right">
        <path d="M-31,-4 Q-18,-25 10,-23 Q32,-22 39,-8 Q43,7 31,18 Q2,29 -29,15 Q-37,8 -31,-4 Z" fill="#8a8b80" stroke={_P2.ink.line} strokeWidth="1.25" />
        <path d="M-24,-10 Q1,-19 27,-12 L25,-3 Q2,4 -25,-1 Z" fill={f.dark} stroke={_P2.ink.line} strokeWidth="0.8" />
        <path d="M-18,-6 Q0,-15 21,-8" stroke={f.bright} strokeWidth="1.6" fill="none" opacity="0.9" />
        <g className="cq-howdah">
          <path d="M-13,-28 L18,-28 L21,-8 L-16,-8 Z" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="1" />
          <path className="cq-howdah-rail" d="M-12,-29 L-12,-37 L18,-37 L18,-29 M-4,-37 L-4,-31 M10,-37 L10,-31" fill="none" stroke={_P2.wood.dark} strokeWidth="2" />
          <rect x="-11" y="-26" width="27" height="4" fill={f.mid} />
          <g className="cq-howdah-crew"><circle cx="-3" cy="-34" r="3" fill={_P2.skin.deep} stroke={_P2.ink.line} strokeWidth="0.5" /><path d="M-7,-30 L1,-30 L2,-21 L-8,-21 Z" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="0.45" /><circle cx="10" cy="-34" r="3" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="0.5" /><path d="M6,-30 L14,-30 L15,-21 L5,-21 Z" fill={f.mid} stroke={_P2.ink.line} strokeWidth="0.45" /></g>
          <g className="cq-howdah-standard"><path d="M17,-37 L17,-62" stroke={_P2.wood.dark} strokeWidth="2.2" /><path d="M18,-59 L35,-53 L18,-46 Z" fill={f.mid} stroke={_P2.ink.line} strokeWidth="0.6" /><circle cx="25" cy="-53" r="2" fill={f.bright} /></g>
        </g>
        <g transform="translate(-22 12)"><g className="cq-leg-fl"><path d="M-5,0 L6,0 L5,23 L-5,23 Z" fill="#68695f" stroke={_P2.ink.line} strokeWidth="0.5" /></g></g>
        <g transform="translate(-5 13)"><g className="cq-leg-fr"><path d="M-5,0 L6,0 L5,23 L-5,23 Z" fill="#68695f" stroke={_P2.ink.line} strokeWidth="0.5" /></g></g>
        <g transform="translate(18 13)"><g className="cq-leg-bl"><path d="M-5,0 L6,0 L5,23 L-5,23 Z" fill="#68695f" stroke={_P2.ink.line} strokeWidth="0.5" /></g></g>
        <g transform="translate(32 11)"><g className="cq-leg-br"><path d="M-5,0 L6,0 L5,23 L-5,23 Z" fill="#68695f" stroke={_P2.ink.line} strokeWidth="0.5" /></g></g>
        <g transform="translate(34 -3)"><g className="cq-elephant-head">
          <g className="cq-elephant-ear"><path d="M-7,-17 Q-29,-18 -29,1 Q-27,17 -8,12 Z" fill="#73746d" stroke={_P2.ink.line} strokeWidth="0.85" /></g>
          <path d="M-9,-13 Q3,-21 16,-12 Q23,-5 17,9 Q8,16 -6,11 Q-15,4 -9,-13 Z" fill="#8a8b80" stroke={_P2.ink.line} strokeWidth="1" />
          <path className="cq-elephant-forehead-plate" d="M-5,-14 Q5,-20 15,-12 L12,-3 L-3,-4 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.7" />
          <circle cx="8" cy="-6" r="1.5" fill={f.bright} /><circle cx="8" cy="-6" r="0.5" fill={_P2.ink.line} />
          <path className="cq-elephant-trunk" d="M14,0 Q30,10 24,29 Q22,35 17,33" stroke="#68695f" strokeWidth="8" fill="none" strokeLinecap="round" />
          <g className="cq-elephant-tusks"><path d="M9,7 Q24,10 27,20" stroke={_P2.cloth.linen} strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M14,5 Q31,4 34,14" stroke={_P2.cloth.linen} strokeWidth="2.4" fill="none" strokeLinecap="round" /></g>
        </g></g>
      </g></g>
    </SpriteFrameV2>
  );
}

function CuirassierV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="animal" variant="mount" phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="98" rx="37" ry="7" fill="#000" opacity="0.35" />
      {/* The far leg is painted first so the near horse flank naturally occludes it. */}
      <g className="cq-rider-leg-r"><path d="M62,70 Q59,75 61,81 L67,82 Q67,76 68,72 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.65" /></g>
      <g transform="translate(56 80)"><g className="cq-horse-body" data-facing="right">
        <path d="M-30,-3 Q-20,-20 4,-19 Q21,-19 28,-8 Q34,6 24,17 Q1,27 -27,13 Q-34,7 -30,-3 Z" fill="#5e3f24" stroke={_P2.ink.line} strokeWidth="1.1" />
        <path d="M-17,-10 Q1,-17 18,-10 L17,-3 Q1,3 -18,-2 Z" fill={f.dark} stroke={_P2.ink.line} strokeWidth="0.7" /><path d="M-14,-6 Q1,-12 16,-7" stroke={f.mid} strokeWidth="2" fill="none" opacity="0.9" />
        <g transform="translate(15 5)"><g className="cq-leg-fl"><path d="M-4,0 L4,0 L3,20 L-6,20 Z" fill="#3a2010" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(26 4)"><g className="cq-leg-fr"><path d="M-4,0 L4,0 L3,20 L-6,20 Z" fill="#3a2010" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(-21 5)"><g className="cq-leg-bl"><path d="M-4,0 L4,0 L2,20 L-6,20 Z" fill="#3a2010" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(-7 7)"><g className="cq-leg-br"><path d="M-4,0 L4,0 L2,20 L-6,20 Z" fill="#3a2010" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g className="cq-horse-head"><path d="M15,-10 Q20,-27 30,-32 Q39,-31 42,-22 L40,-11 L32,-7 L24,-10 Z" fill="#5a3a1a" stroke={_P2.ink.line} strokeWidth="0.9" /><path d="M31,-28 Q40,-28 45,-22 L49,-17 L40,-14 L34,-18 Z" fill="#8a5a3c" stroke={_P2.ink.line} strokeWidth="0.8" /><g className="cq-horse-ears"><path d="M29,-30 L31,-41 L36,-31 M36,-31 L42,-39 L43,-28" fill="#5e3f24" stroke={_P2.ink.line} strokeWidth="0.7" /></g><path d="M42,-20 L51,-18 L45,-14 L39,-15 Z" fill="#8a5a3c" stroke={_P2.ink.line} strokeWidth="0.65" /><circle cx="40" cy="-23" r="1.2" fill={_P2.metal.shine} /><path d="M43,-16 L49,-16" stroke="#2a1a10" strokeWidth="0.8" /></g>
        <g className="cq-horse-mane"><path d="M18,-12 Q22,-25 31,-34 Q28,-22 36,-13" stroke="#2a1a10" strokeWidth="4" fill="none" strokeLinecap="round" /></g>
        <g className="cq-horse-tail"><path d="M-27,-7 C-40,-9 -45,2 -42,15 C-40,25 -35,31 -28,34 L-24,30 C-30,25 -34,18 -34,11 C-35,2 -31,-3 -24,-4 Z" fill="#2a1a10" stroke={_P2.ink.line} strokeWidth="0.7" /><path d="M-34,4 C-39,14 -35,24 -28,30" stroke="#5e3f24" strokeWidth="1.2" fill="none" /></g>
        <g className="cq-saddle"><path d="M-12,-17 L7,-20 L16,-12 L10,-5 L-15,-7 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.8" /><path d="M-8,-16 L6,-18 L12,-13 L-10,-11 Z" fill={f.mid} stroke={f.dark} strokeWidth="0.6" /></g>
      </g></g>
      <g className="cq-rider">
        <path d="M58,54 Q67,51 72,60 L72,73 L67,76 L58,74 L54,64 Q54,57 58,54 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="1" /><path d="M57,64 L71,64 L71,72 L67,75 L59,73 Z" fill={f.mid} stroke={f.dark} strokeWidth="0.6" />
        <circle cx="63" cy="48" r="7" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="0.8" /><path d="M55,48 Q63,37 71,47 L70,54 L56,54 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.8" />
        <g className="cq-rider-leg-l"><path d="M66,72 Q74,72 80,78 L76,82 Q71,78 66,77 L59,76 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.65" /><path d="M75,79 L82,80 L83,83 L74,83 Z" fill={_P2.wood.dark} /></g>
        <g className="cq-rider-arm-rein"><path d="M68,60 Q76,64 86,60" stroke={_P2.metal.steel} strokeWidth="4.5" fill="none" strokeLinecap="round" /><path d="M72,61 Q82,60 91,58" stroke="#2a1a10" strokeWidth="1.15" fill="none" /><circle cx="86" cy="60" r="2" fill={_P2.skin.warm} /></g>
        <g className="cq-rider-arm-sabre"><path d="M62,59 Q72,58 80,54" stroke={_P2.metal.steel} strokeWidth="4.5" fill="none" strokeLinecap="round" /><circle cx="80" cy="54" r="2.2" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="0.4" /></g>
      </g>
      <path className="cq-moonsteel-inlay" d="M53,61 Q61,55 70,61" stroke={_P2.metal.shine} strokeWidth="1.6" fill="none" />
      <g className="cq-weapon" style={{ '--pivot-x': '80px', '--pivot-y': '54px' }}><g transform="translate(80 54) rotate(-34)"><rect x="-1.3" y="-34" width="2.6" height="34" fill={_P2.metal.shine} stroke={_P2.ink.line} strokeWidth="0.5" /><rect x="-7" y="-2" width="14" height="2.8" fill={_P2.metal.gold} /><circle cx="0" cy="2" r="2" fill={f.bright} /></g><g transform="translate(101 20)"><g className="cq-hit-spark"><path d="M0,-8 L2.5,-2.5 L8,0 L2.5,2.5 L0,8 L-2.5,2.5 L-8,0 L-2.5,-2.5 Z" fill="#fff5cc" /><circle r="1.5" fill="#fff" /></g></g></g>
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

/* ─────────────────────────── Axeman (melee, free arms, bronze axe) ─────────────────────────── */
function AxemanV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="melee" phase={phase}>
      <g transform="translate(58 91)"><ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} /></g>
      <g transform="translate(70 91)"><ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} /></g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />
      <HumanoidV2
        cx={64} cy={70}
        cloth={f.mid} pants={_P2.cloth.wool}
        accent={f.dark} hair="#3a2a1a"
        arms="free"
        hat={<rect x="-8" y="-40" width="16" height="5" rx="1" fill={_P2.metal.bronze} stroke={_P2.ink.line} strokeWidth="0.6" />}
      />
      {/* BRONZE AXE — pivot at right shoulder (77, 68) */}
      <g className="cq-weapon" style={{ '--pivot-x': '77px', '--pivot-y': '68px' }}>
        <g transform="translate(77 68) rotate(20)">
          <rect x="-1.2" y="0" width="2.4" height="34" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.5" />
          {/* axe head — wide crescent blade */}
          <path d="M-3,-8 L-3,4 Q-14,-2 -3,-8 Z" fill={_P2.metal.bronze} stroke={_P2.ink.line} strokeWidth="0.8" />
          <path d="M3,-8 L3,4 Q14,-2 3,-8 Z" fill={_P2.metal.bronze} stroke={_P2.ink.line} strokeWidth="0.8" />
          <path d="M-3,-8 L-3,4 Q-10,0 -3,-8 Z" fill={_P2.metal.shine} opacity="0.4" />
        </g>
        <g transform="translate(82 56)">
          <g className="cq-hit-spark">
            <path d="M0,-9 L2.5,-2.5 L9,0 L2.5,2.5 L0,9 L-2.5,2.5 L-9,0 L-2.5,-2.5 Z" fill="#fff5cc" />
            <circle r="2" fill="#ffffff" />
          </g>
        </g>
      </g>
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Spearman (melee, locked arms, spear) ─────────────────────────── */
function SpearmanV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="melee" phase={phase}>
      <g transform="translate(58 91)"><ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} /></g>
      <g transform="translate(70 91)"><ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} /></g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />
      <HumanoidV2
        cx={64} cy={70}
        cloth={f.mid} pants={_P2.cloth.wool}
        accent={f.dark} hair="#5a4a2a"
        arms="locked"
        hat={<path d="M-9,-33 Q-8,-42 0,-42 Q8,-42 9,-33 L9,-28 L-9,-28 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.7" />}
        armLContent={(
          <g transform="translate(-2 8)">
            <circle r="10" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="0.7" />
            <circle r="10" fill={f.mid} opacity="0.7" />
            <circle r="2.5" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.4" />
          </g>
        )}
      />
      {/* SPEAR — long shaft, pivot near grip center (58, 56) */}
      <g className="cq-weapon" style={{ '--pivot-x': '58px', '--pivot-y': '56px' }}>
        <g transform="translate(56 28) rotate(-6)">
          <rect x="-1" y="0" width="2" height="76" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="0.5" />
          <path d="M-2.5,0 L2.5,0 L1.5,-10 L0,-16 L-1.5,-10 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.7" />
        </g>
      </g>
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Horseman (light mounted, horse + rider) ─────────────────────────── */
function HorsemanV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="melee" phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="96" rx="30" ry="7" fill="#000" opacity="0.30" />
      {/* HORSE BODY */}
      <g transform="translate(62 74)">
        <path d="M20,-4 Q30,-10 26,-20" stroke="#8a6040" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <ellipse cx="4" cy="0" rx="24" ry="12" fill="#a07848" stroke={_P2.ink.line} strokeWidth="1" />
        <ellipse cx="4" cy="-3" rx="22" ry="8" fill="#c09858" />
        <g transform="translate(-12 7)"><g className="cq-leg-fl"><rect x="-3" y="0" width="6" height="16" fill="#7a5830" stroke={_P2.ink.line} strokeWidth="0.7" /></g></g>
        <g transform="translate(-2 7)"><g className="cq-leg-fr"><rect x="-3" y="0" width="6" height="16" fill="#7a5830" stroke={_P2.ink.line} strokeWidth="0.7" /></g></g>
        <g transform="translate(14 7)"><g className="cq-leg-bl"><rect x="-3" y="0" width="6" height="16" fill="#7a5830" stroke={_P2.ink.line} strokeWidth="0.7" /></g></g>
        <g transform="translate(20 7)"><g className="cq-leg-br"><rect x="-3" y="0" width="6" height="16" fill="#7a5830" stroke={_P2.ink.line} strokeWidth="0.7" /></g></g>
        {/* neck + head */}
        <ellipse cx="-20" cy="-4" rx="11" ry="9" fill="#a07848" stroke={_P2.ink.line} strokeWidth="1" />
        <path d="M-28,-3 L-34,4 L-26,5 Z" fill="#a07848" stroke={_P2.ink.line} strokeWidth="0.8" />
        <path d="M-16,-12 L-12,-18 L-9,-10 Z" fill="#7a5830" stroke={_P2.ink.line} strokeWidth="0.6" />
        <circle cx="-24" cy="-4" r="1" fill={_P2.ink.line} />
        {/* saddle + reins */}
        <rect x="-4" y="-13" width="14" height="4" rx="2" fill={f.dark} stroke={_P2.ink.line} strokeWidth="0.6" />
        <line x1="-28" y1="-2" x2="-4" y2="-11" stroke={_P2.cloth.linen} strokeWidth="0.8" />
      </g>
      {/* RIDER — simplified figure on horse */}
      <g transform="translate(58 48)">
        <rect x="-7" y="-10" width="14" height="16" rx="2" fill={f.mid} stroke={_P2.ink.line} strokeWidth="0.7" />
        <circle cx="0" cy="-16" r="7" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="0.7" />
        <path d="M-8,-20 Q-7,-28 0,-28 Q7,-28 8,-20 L8,-15 L-8,-15 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.6" />
        <ellipse cx="-9" cy="-2" rx="3.5" ry="7" fill={f.mid} stroke={_P2.ink.line} strokeWidth="0.6" />
        <ellipse cx="9" cy="-2" rx="3.5" ry="7" fill={f.mid} stroke={_P2.ink.line} strokeWidth="0.6" />
      </g>
      {/* JAVELIN */}
      <g className="cq-weapon" style={{ '--pivot-x': '67px', '--pivot-y': '45px' }}>
        <g transform="translate(67 45) rotate(-38)">
          <rect x="-1" y="-28" width="2" height="48" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="0.5" />
          <path d="M-2,-28 L2,-28 L0,-38 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.5" />
        </g>
      </g>
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Cavalry (heavy mounted, armored horse + rider) ─────────────────────────── */
function CavalryV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="melee" phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="96" rx="32" ry="7" fill="#000" opacity="0.32" />
      {/* HORSE BODY — armored barding */}
      <g transform="translate(62 74)">
        <path d="M20,-4 Q30,-8 26,-18" stroke="#3a2a1a" strokeWidth="4" fill="none" strokeLinecap="round" />
        <ellipse cx="4" cy="0" rx="24" ry="13" fill="#4a3828" stroke={_P2.ink.line} strokeWidth="1" />
        <ellipse cx="4" cy="-3" rx="22" ry="9" fill="#6a4838" />
        {/* barding plates */}
        <rect x="-6" y="-10" width="20" height="6" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.6" opacity="0.9" />
        <g transform="translate(-12 7)"><g className="cq-leg-fl"><rect x="-3" y="0" width="6" height="15" fill="#3a2a1a" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(-2 7)"><g className="cq-leg-fr"><rect x="-3" y="0" width="6" height="15" fill="#3a2a1a" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(14 7)"><g className="cq-leg-bl"><rect x="-3" y="0" width="6" height="15" fill="#3a2a1a" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(20 7)"><g className="cq-leg-br"><rect x="-3" y="0" width="6" height="15" fill="#3a2a1a" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <ellipse cx="-20" cy="-4" rx="12" ry="10" fill="#4a3828" stroke={_P2.ink.line} strokeWidth="1" />
        <path d="M-28,-3 L-35,4 L-26,5 Z" fill="#4a3828" stroke={_P2.ink.line} strokeWidth="0.8" />
        <path d="M-16,-14 L-12,-20 L-9,-12 Z" fill="#3a2a1a" stroke={_P2.ink.line} strokeWidth="0.6" />
        <circle cx="-24" cy="-4" r="1.1" fill={_P2.ink.line} />
        {/* chamfron (face armor) */}
        <rect x="-35" y="-8" width="8" height="6" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.5" />
        <rect x="-4" y="-13" width="14" height="4" rx="2" fill={f.dark} stroke={_P2.ink.line} strokeWidth="0.6" />
      </g>
      {/* HEAVY RIDER */}
      <g transform="translate(58 47)">
        <path d="M0,-22 C12,-20 14,-4 10,8 L-10,8 C-14,-4 -12,-20 0,-22 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.8" />
        <path d="M-8,-10 L8,-10 L9,8 L-9,8 Z" fill={f.mid} stroke={f.dark} strokeWidth="0.6" />
        <circle cx="0" cy="-26" r="7" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="0.7" />
        <path d="M-9,-28 Q-8,-38 0,-38 Q8,-38 9,-28 L9,-24 L-9,-24 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.7" />
        <rect x="-9" y="-25" width="18" height="3" fill={_P2.ink.line} />
        <ellipse cx="-12" cy="-8" rx="4" ry="8" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.6" />
        <ellipse cx="12" cy="-8" rx="4" ry="8" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.6" />
      </g>
      {/* SWORD — pivot at shoulder */}
      <g className="cq-weapon" style={{ '--pivot-x': '70px', '--pivot-y': '42px' }}>
        <g transform="translate(70 42) rotate(25)">
          <rect x="-1.5" y="-30" width="3" height="44" fill={_P2.metal.shine} stroke={_P2.ink.line} strokeWidth="0.6" />
          <rect x="-6" y="10" width="12" height="2.4" fill={_P2.metal.gold} stroke={_P2.ink.line} strokeWidth="0.4" />
          <path d="M-1.5,-30 L1.5,-30 L0,-36 Z" fill={_P2.metal.shine} />
        </g>
      </g>
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Knight (fully armored mounted, lance) ─────────────────────────── */
function KnightV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="melee" phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="96" rx="34" ry="7" fill="#000" opacity="0.35" />
      {/* WARHORSE — fully barded */}
      <g transform="translate(62 74)">
        <path d="M20,-4 Q30,-6 24,-16" stroke="#2a1a0a" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <ellipse cx="4" cy="0" rx="25" ry="14" fill="#2a2018" stroke={_P2.ink.line} strokeWidth="1.2" />
        <ellipse cx="4" cy="-3" rx="23" ry="10" fill="#3a2a20" />
        {/* full barding */}
        <rect x="-8" y="-12" width="22" height="8" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.8" />
        <path d="M-8,-12 L14,-12 L14,-8 L-8,-8 Z" fill={_P2.metal.shine} opacity="0.35" />
        <rect x="-8" y="-4" width="22" height="4" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.6" />
        <g transform="translate(-12 7)"><g className="cq-leg-fl"><rect x="-3.5" y="0" width="7" height="16" fill="#2a1a0a" stroke={_P2.ink.line} strokeWidth="0.7" /></g></g>
        <g transform="translate(-2 7)"><g className="cq-leg-fr"><rect x="-3.5" y="0" width="7" height="16" fill="#2a1a0a" stroke={_P2.ink.line} strokeWidth="0.7" /></g></g>
        <g transform="translate(14 7)"><g className="cq-leg-bl"><rect x="-3.5" y="0" width="7" height="16" fill="#2a1a0a" stroke={_P2.ink.line} strokeWidth="0.7" /></g></g>
        <g transform="translate(22 7)"><g className="cq-leg-br"><rect x="-3.5" y="0" width="7" height="16" fill="#2a1a0a" stroke={_P2.ink.line} strokeWidth="0.7" /></g></g>
        <ellipse cx="-21" cy="-4" rx="12" ry="10" fill="#2a2018" stroke={_P2.ink.line} strokeWidth="1" />
        <path d="M-30,-2 L-36,5 L-26,6 Z" fill="#2a2018" stroke={_P2.ink.line} strokeWidth="0.8" />
        <path d="M-16,-14 L-12,-20 L-9,-12 Z" fill="#2a1a0a" stroke={_P2.ink.line} strokeWidth="0.6" />
        {/* full chamfron */}
        <rect x="-38" y="-8" width="10" height="8" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.6" />
        <rect x="-38" y="-8" width="10" height="3" fill={_P2.metal.shine} opacity="0.35" />
        <circle cx="-22" cy="-4" r="1.2" fill={_P2.ink.line} />
        <rect x="-4" y="-14" width="14" height="5" rx="2" fill={f.dark} stroke={_P2.ink.line} strokeWidth="0.6" />
      </g>
      {/* ARMORED KNIGHT */}
      <g transform="translate(58 46)">
        <path d="M0,-22 C14,-20 16,-2 12,10 L-12,10 C-16,-2 -14,-20 0,-22 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.9" />
        <path d="M0,-22 C8,-18 9,-4 7,8 L-7,8 C-9,-4 -8,-18 0,-22 Z" fill={_P2.metal.shine} opacity="0.4" />
        <path d="M-6,-10 L6,-10 L8,10 L-8,10 Z" fill={f.mid} stroke={f.dark} strokeWidth="0.7" />
        <circle cx="0" cy="0" r="3" fill={f.trim} />
        <ellipse cx="-14" cy="-10" rx="5" ry="6" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.7" />
        <ellipse cx="14" cy="-10" rx="5" ry="6" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.7" />
        <circle cx="0" cy="-27" r="7" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="0.7" />
        {/* great helm */}
        <path d="M-9,-28 Q-8,-40 0,-40 Q8,-40 9,-28 L9,-22 L-9,-22 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.8" />
        <rect x="-9" y="-26" width="18" height="3" fill={_P2.ink.line} />
        <rect x="-2" y="-26" width="4" height="3" fill={_P2.metal.shine} opacity="0.4" />
        <g className="cq-plume">
          <path d="M0,-40 Q-5,-50 0,-56 Q5,-50 0,-40 Z" fill={f.bright} stroke={f.dark} strokeWidth="0.6" />
        </g>
      </g>
      {/* LANCE — long weapon, pivot at right shoulder */}
      <g className="cq-weapon" style={{ '--pivot-x': '72px', '--pivot-y': '42px' }}>
        <g transform="translate(72 42) rotate(-20)">
          <rect x="-1.5" y="-48" width="3" height="80" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.6" />
          <path d="M-2.5,-48 L2.5,-48 L1,-58 L0,-62 L-1,-58 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.7" />
          <rect x="-4" y="12" width="8" height="3" fill={f.mid} />
          <g transform="translate(0 -62)">
            <g className="cq-hit-spark">
              <path d="M0,-10 L3,-3 L10,0 L3,3 L0,10 L-3,3 L-10,0 L-3,-3 Z" fill="#fff5cc" />
              <circle r="2" fill="#ffffff" />
            </g>
          </g>
        </g>
      </g>
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Crossbowman (ranged, crossbow) ─────────────────────────── */
function CrossbowmanV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="ranged" phase={phase}>
      <g transform="translate(58 91)"><ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} /></g>
      <g transform="translate(70 91)"><ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} /></g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />
      <HumanoidV2
        cx={64} cy={70}
        cloth={f.dark} pants={_P2.cloth.wool}
        accent={f.mid} hair="#3a2a1a"
        arms="locked"
        hat={<path d="M-10,-36 Q0,-46 10,-36 L8,-30 L-8,-30 Z" fill="#2a3a18" stroke={_P2.ink.line} strokeWidth="0.7" />}
      />
      {/* BOLT CASE on back */}
      <g transform="translate(48 60)">
        <rect x="-3" y="-12" width="6" height="20" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="0.5" />
        <line x1="-2" y1="-14" x2="-2" y2="-8" stroke={_P2.metal.steel} strokeWidth="1.2" />
        <line x1="0" y1="-14" x2="0" y2="-8" stroke={_P2.metal.steel} strokeWidth="1.2" />
        <line x1="2" y1="-14" x2="2" y2="-8" stroke={_P2.metal.steel} strokeWidth="1.2" />
      </g>
      {/* CROSSBOW — T-shaped, pivot at grip (78, 58) */}
      <g className="cq-weapon" style={{ '--pivot-x': '78px', '--pivot-y': '58px' }}>
        {/* stock */}
        <g transform="translate(78 58) rotate(10)">
          <rect x="-1" y="-8" width="2" height="40" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.5" />
          <rect x="-1" y="-8" width="2" height="8" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.4" />
          {/* horizontal bow limbs (crossbow arms) */}
          <path d="M0,-6 Q-22,-2 -24,6" fill="none" stroke={_P2.wood.dark} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M0,-6 Q22,-2 24,6" fill="none" stroke={_P2.wood.dark} strokeWidth="2.2" strokeLinecap="round" />
          {/* string */}
          <line x1="-24" y1="6" x2="0" y2="-4" stroke={_P2.cloth.linen} strokeWidth="0.7" />
          <line x1="24" y1="6" x2="0" y2="-4" stroke={_P2.cloth.linen} strokeWidth="0.7" />
          {/* bolt loaded */}
          <line x1="-1" y1="-4" x2="-1" y2="-20" stroke={_P2.metal.steel} strokeWidth="1.4" />
          <path d="M-2,-20 L0,-20 L-1,-26 Z" fill={_P2.metal.iron} />
        </g>
        {/* muzzle flash on bolt tip */}
        <g transform="translate(75 30)">
          <g className="cq-muzzle-flash">
            <circle r="5" fill="#ffd966" /><circle r="2.5" fill="#fff" />
          </g>
        </g>
      </g>
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Catapult (siege machine, melee bombardment) ─────────────────────────── */
function CatapultV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="melee" phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="97" rx="44" ry="6" fill="#000" opacity="0.30" />
      {/* WHEELS */}
      <circle cx="34" cy="86" r="16" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="1.2" />
      <line x1="34" y1="70" x2="34" y2="102" stroke={_P2.wood.dark} strokeWidth="1.2" />
      <line x1="18" y1="86" x2="50" y2="86" stroke={_P2.wood.dark} strokeWidth="1.2" />
      <circle cx="34" cy="86" r="3.5" fill={_P2.metal.iron} />
      <circle cx="94" cy="86" r="16" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="1.2" />
      <line x1="94" y1="70" x2="94" y2="102" stroke={_P2.wood.dark} strokeWidth="1.2" />
      <line x1="78" y1="86" x2="110" y2="86" stroke={_P2.wood.dark} strokeWidth="1.2" />
      <circle cx="94" cy="86" r="3.5" fill={_P2.metal.iron} />
      {/* AXLE + FRAME */}
      <rect x="34" y="82" width="60" height="8" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="1" />
      <rect x="52" y="62" width="24" height="22" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="1" />
      <line x1="52" y1="62" x2="76" y2="84" stroke={_P2.wood.dark} strokeWidth="0.8" />
      <line x1="76" y1="62" x2="52" y2="84" stroke={_P2.wood.dark} strokeWidth="0.8" />
      {/* faction mark */}
      <circle cx="64" cy="72" r="3" fill={f.trim} stroke={f.dark} strokeWidth="0.5" />
      {/* THROWING ARM — cq-weapon pivots it */}
      <g className="cq-weapon" style={{ '--pivot-x': '64px', '--pivot-y': '74px' }}>
        <g transform="translate(64 74) rotate(-48)">
          <rect x="-2" y="-32" width="4" height="52" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.8" />
          {/* counterweight at bottom */}
          <rect x="-7" y="16" width="14" height="12" fill={_P2.stone.mid} stroke={_P2.ink.line} strokeWidth="0.8" />
          {/* sling at top */}
          <line x1="0" y1="-32" x2="-4" y2="-42" stroke={_P2.cloth.wool} strokeWidth="1" />
          <line x1="0" y1="-32" x2="4" y2="-42" stroke={_P2.cloth.wool} strokeWidth="1" />
          <circle cx="0" cy="-46" r="5" fill={_P2.stone.light} stroke={_P2.ink.line} strokeWidth="0.7" />
          {/* hit spark at boulder */}
          <g transform="translate(0 -46)">
            <g className="cq-hit-spark">
              <path d="M0,-10 L3,-3 L10,0 L3,3 L0,10 L-3,3 L-10,0 L-3,-3 Z" fill="#fff5cc" />
              <circle r="2" fill="#ffffff" />
            </g>
          </g>
        </g>
      </g>
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Ballista (ranged siege, bolt-thrower) ─────────────────────────── */
function BallistaV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="ranged" phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="97" rx="40" ry="6" fill="#000" opacity="0.30" />
      {/* WHEELS */}
      <circle cx="36" cy="88" r="14" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="1.2" />
      <line x1="36" y1="74" x2="36" y2="102" stroke={_P2.wood.dark} strokeWidth="1.2" />
      <line x1="22" y1="88" x2="50" y2="88" stroke={_P2.wood.dark} strokeWidth="1.2" />
      <circle cx="36" cy="88" r="3" fill={_P2.metal.iron} />
      <circle cx="92" cy="88" r="14" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="1.2" />
      <line x1="92" y1="74" x2="92" y2="102" stroke={_P2.wood.dark} strokeWidth="1.2" />
      <line x1="78" y1="88" x2="106" y2="88" stroke={_P2.wood.dark} strokeWidth="1.2" />
      <circle cx="92" cy="88" r="3" fill={_P2.metal.iron} />
      {/* AXLE */}
      <rect x="36" y="84" width="56" height="8" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="1" />
      {/* TRESTLE FRAME */}
      <rect x="48" y="64" width="28" height="22" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="1" />
      <line x1="48" y1="64" x2="76" y2="86" stroke={_P2.wood.dark} strokeWidth="0.8" />
      <line x1="76" y1="64" x2="48" y2="86" stroke={_P2.wood.dark} strokeWidth="0.8" />
      {/* BOW ARMS — torsion horizontal bow */}
      <g className="cq-weapon" style={{ '--pivot-x': '62px', '--pivot-y': '68px' }}>
        <path d="M62,52 Q38,56 36,72" fill="none" stroke={_P2.wood.dark} strokeWidth="3" strokeLinecap="round" />
        <path d="M62,52 Q86,56 88,72" fill="none" stroke={_P2.wood.dark} strokeWidth="3" strokeLinecap="round" />
        {/* bowstring */}
        <line x1="36" y1="72" x2="60" y2="62" stroke={_P2.cloth.linen} strokeWidth="1" />
        <line x1="88" y1="72" x2="64" y2="62" stroke={_P2.cloth.linen} strokeWidth="1" />
        {/* BOLT in channel */}
        <rect x="30" y="66" width="40" height="3" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.5" />
        <path d="M30,66 L30,69 L22,67.5 Z" fill={_P2.metal.iron} />
        {/* muzzle flash at bolt tip */}
        <g transform="translate(22 67)">
          <g className="cq-muzzle-flash">
            <circle r="6" fill="#ffd966" /><circle r="3" fill="#fff" />
          </g>
        </g>
      </g>
      {/* faction accent on frame */}
      <circle cx="62" cy="73" r="2.5" fill={f.trim} stroke={f.dark} strokeWidth="0.4" />
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Caravan (civilian trade, merchant with pack) ─────────────────────────── */
function CaravanV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="civilian" phase={phase}>
      <g transform="translate(58 91)"><ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} /></g>
      <g transform="translate(70 91)"><ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} /></g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="22" ry="5" fill="#000" opacity="0.35" />
      {/* CART / WAGON behind figure */}
      <g transform="translate(40 78)">
        <rect x="-14" y="-14" width="28" height="16" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="0.8" />
        <rect x="-12" y="-12" width="24" height="12" fill={f.mid} opacity="0.5" />
        <circle cx="-10" cy="2" r="6" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.8" />
        <line x1="-10" y1="-4" x2="-10" y2="8" stroke={_P2.wood.light} strokeWidth="1" />
        <line x1="-16" y1="2" x2="-4" y2="2" stroke={_P2.wood.light} strokeWidth="1" />
        <circle cx="10" cy="2" r="6" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.8" />
        <line x1="10" y1="-4" x2="10" y2="8" stroke={_P2.wood.light} strokeWidth="1" />
        <line x1="4" y1="2" x2="16" y2="2" stroke={_P2.wood.light} strokeWidth="1" />
      </g>
      <HumanoidV2
        cx={70} cy={70}
        cloth={_P2.cloth.tunic} pants={_P2.cloth.wool}
        accent={f.mid} hair="#5a4030"
        arms="free"
        hat={<ellipse cx="0" cy="-40" rx="14" ry="3.5" fill={_P2.thatch.straw} stroke={_P2.ink.line} strokeWidth="0.6" />}
        armRContent={(
          <g transform="translate(0 6)">
            {/* coin purse */}
            <ellipse cx="0" cy="0" rx="5" ry="6" fill={_P2.metal.gold} stroke={_P2.ink.line} strokeWidth="0.6" />
            <line x1="-3" y1="-4" x2="3" y2="-4" stroke={_P2.ink.line} strokeWidth="0.5" />
          </g>
        )}
      />
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Expedition (civilian explorer, backpack + rope) ─────────────────────────── */
function ExpeditionV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="civilian" phase={phase}>
      <g transform="translate(58 91)"><ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} /></g>
      <g transform="translate(70 91)"><ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} /></g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />
      {/* BACKPACK — behind figure, body-anchored */}
      <g transform="translate(72 52)">
        <rect x="-10" y="-12" width="20" height="22" rx="3" fill="#6a4a2a" stroke={_P2.ink.line} strokeWidth="0.8" />
        <rect x="-8" y="-10" width="16" height="18" fill="#8a6a3a" opacity="0.6" />
        {/* loops */}
        <rect x="-10" y="-10" width="4" height="16" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="0.4" />
        <rect x="6" y="-10" width="4" height="16" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="0.4" />
        {/* coiled rope on top */}
        <ellipse cx="0" cy="-16" rx="8" ry="5" fill="none" stroke={_P2.cloth.linen} strokeWidth="2" />
        <ellipse cx="0" cy="-16" rx="5" ry="3" fill="none" stroke={_P2.cloth.wool} strokeWidth="1.4" />
      </g>
      <HumanoidV2
        cx={64} cy={70}
        cloth="#5a6e4a" pants="#4a3a2a"
        accent={f.mid} hair="#3a2a1a"
        arms="free"
        hat={<path d="M-10,-36 Q0,-44 10,-36 L8,-30 L-8,-30 Z" fill="#4a3a18" stroke={_P2.ink.line} strokeWidth="0.7" />}
        armRContent={(
          <g transform="translate(0 8) rotate(-20)">
            {/* walking staff / ice axe */}
            <line x1="0" y1="-28" x2="0" y2="14" stroke={_P2.wood.mid} strokeWidth="2.2" strokeLinecap="round" />
            <path d="M-4,-26 L4,-26 L2,-30 L-2,-30 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.5" />
          </g>
        )}
      />
    </SpriteFrameV2>
  );
}

/* ─────────────────────────── Transport (naval, cargo ship) ─────────────────────────── */
function TransportV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="naval" hexTint={_P2.ground.water} phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="98" rx="50" ry="7" fill="#000" opacity="0.25" />
      {/* WIDE FLAT HULL */}
      <path d="M8,88 Q64,78 120,88 Q112,104 64,106 Q16,104 8,88 Z" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="1.2" />
      <path d="M14,82 Q64,72 114,82 Q106,92 64,94 Q22,92 14,82 Z" fill={_P2.wood.light} />
      {/* cargo boxes on deck */}
      <rect x="30" y="78" width="20" height="10" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="0.6" />
      <rect x="38" y="76" width="12" height="4" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="0.4" />
      <rect x="76" y="78" width="20" height="10" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.6" />
      <line x1="30" y1="83" x2="50" y2="83" stroke={_P2.ink.soft} strokeWidth="0.5" />
      <line x1="76" y1="83" x2="96" y2="83" stroke={_P2.ink.soft} strokeWidth="0.5" />
      {/* MAST */}
      <line x1="64" y1="78" x2="64" y2="24" stroke={_P2.wood.dark} strokeWidth="2.2" />
      {/* SAIL */}
      <g className="cq-sail">
        <path d="M64,28 L92,42 L92,68 L64,74 Z" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="0.8" />
        <path d="M64,28 L44,42 L44,68 L64,74 Z" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="0.8" />
        <rect x="64" y="38" width="28" height="8" fill={f.mid} opacity="0.75" />
        <rect x="44" y="38" width="20" height="8" fill={f.mid} opacity="0.75" />
      </g>
      {/* stern oar */}
      <line x1="8" y1="88" x2="-4" y2="96" stroke={_P2.wood.dark} strokeWidth="2" />
    </SpriteFrameV2>
  );
}

/* === MR 4: late-era naval v2 wrappers === */

function CarrackV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <SpriteFrameV2 state={state} kind="naval" phase={phase}><CarrackSprite faction={faction} state={state} /></SpriteFrameV2>;
}
function GalleonV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <SpriteFrameV2 state={state} kind="naval" phase={phase}><GalleonSprite faction={faction} state={state} /></SpriteFrameV2>;
}
function SteamshipV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <SpriteFrameV2 state={state} kind="naval" phase={phase}><SteamshipSprite faction={faction} state={state} /></SpriteFrameV2>;
}
function TroopTransportV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <SpriteFrameV2 state={state} kind="naval" phase={phase}><TroopTransportSprite faction={faction} state={state} /></SpriteFrameV2>;
}

/* #759 batch 1 — rigging upgrade for 5 live-fallback units to the v2 class-hook
 * dialect. Silhouettes reused verbatim from src/renderer/sprites/units.tsx
 * (CombatDroneSprite:1744, AutonomousFrigateSprite:1790, ExosuitInfantrySprite:1838,
 * PropagandistSprite:1904, DroneControllerSprite:1935); only wrapper/hook structure
 * added. Combat units (CombatDrone, AutonomousFrigate, ExosuitInfantry) deliberately
 * skip the standard .cq-weapon swing for their mounted/held weapon in favor of a body
 * recoil (cq2-attack-body) + .cq-muzzle-flash — a swing looked physically wrong for a
 * rigidly-mounted turret/rifle (see scraps in the original design session). */

/* reusable spark shape */
const HitSpark = () => (
  <g className="cq-hit-spark">
    <path d="M0,-9 L3,-3 L12,0 L3,3 L0,9 L-3,3 L-12,0 L-3,-3 Z" fill="#fff5cc" />
    <path d="M0,-6 L2,-1 L7,0 L2,1 L0,6 L-2,1 L-7,0 L-2,-1 Z" fill="#ffffff" />
    <circle r="2" fill="#ffffff" />
  </g>
);

/* ═══════════════ SPRITE 1 — CombatDroneV2Sprite (civilian air) ═══════════════ */
function CombatDroneV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  // ducted fan drawn as a FLATTENED disc (near-horizontal rotor plane) so all
  // four read as coplanar while hovering.
  const fan = (x, y, r = 8) => {
    const b = r - 3, ry = r * 0.5, byr = b * 0.5;
    return (
      <g transform={`translate(${x} ${y})`}>
        <ellipse rx={r} ry={ry} fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="1" />
        <ellipse rx={b} ry={byr} fill="#181830" stroke={_P2.metal.steel} strokeWidth="0.7" />
        <line x1={-b} y1="0" x2={b} y2="0" stroke={_P2.metal.steel} strokeWidth="0.9" strokeLinecap="round" opacity="0.85" />
        <line x1={-b * 0.55} y1={-byr * 0.8} x2={b * 0.55} y2={byr * 0.8} stroke={_P2.metal.steel} strokeWidth="0.7" strokeLinecap="round" opacity="0.6" />
        <line x1={-b * 0.55} y1={byr * 0.8} x2={b * 0.55} y2={-byr * 0.8} stroke={_P2.metal.steel} strokeWidth="0.7" strokeLinecap="round" opacity="0.6" />
        <circle r="1.2" fill={_P2.metal.steel} />
      </g>
    );
  };
  return (
    <SpriteFrameV2 state={state} kind="civilian" phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="108" rx="30" ry="4" fill="#000" opacity="0.22" />
      <g className="cq-plume">
        <line x1="42" y1="52" x2="24" y2="40" stroke={_P2.metal.steel} strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="24" cy="40" r="1.5" fill={f.bright} />
      </g>
      <line x1="52" y1="54" x2="32" y2="44" stroke={_P2.metal.iron} strokeWidth="3.4" strokeLinecap="round" />
      <line x1="76" y1="54" x2="96" y2="44" stroke={_P2.metal.iron} strokeWidth="3.4" strokeLinecap="round" />
      <line x1="52" y1="66" x2="36" y2="78" stroke={_P2.metal.iron} strokeWidth="3.4" strokeLinecap="round" />
      <line x1="76" y1="66" x2="92" y2="78" stroke={_P2.metal.iron} strokeWidth="3.4" strokeLinecap="round" />
      {fan(30, 42)}{fan(98, 42)}{fan(36, 80)}{fan(92, 80)}
      <path d="M44,50 L74,48 L86,59 L74,70 L44,70 L38,60 Z" fill={f.mid} stroke={_P2.ink.line} strokeWidth="1.2" />
      <path d="M44,50 L74,48 L80,53 L44,55 Z" fill={_P2.metal.shine} opacity="0.16" />
      <line x1="48" y1="54" x2="72" y2="53" stroke={_P2.metal.steel} strokeWidth="0.7" opacity="0.75" />
      <line x1="46" y1="65" x2="74" y2="65" stroke={_P2.metal.steel} strokeWidth="0.7" opacity="0.75" />
      <rect x="44" y="58" width="30" height="2.2" fill={f.trim} opacity="0.9" />
      <circle cx="82" cy="59" r="8.4" fill="#0a0a20" stroke={_P2.ink.line} strokeWidth="1" />
      <circle className="cq-glow" cx="82" cy="59" r="4.6" fill="#00aaff" />
      <circle cx="80" cy="57" r="1.4" fill="#b8d4e8" />
      <g className="cq-weapon" style={{ '--pivot-x': '60px', '--pivot-y': '72px' }}>
        <g transform="translate(60 72)">
          <rect x="-9" y="0" width="18" height="9" rx="3" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.8" />
          <rect x="-9" y="0" width="18" height="2.4" fill={_P2.metal.steel} />
          <circle className="cq-glow" cx="7" cy="5" r="1.5" fill={f.bright} />
          <g transform="translate(13 4.5) scale(0.6)"><HitSpark /></g>
        </g>
      </g>
    </SpriteFrameV2>
  );
}

/* ═══════════════ SPRITE 2 — AutonomousFrigateV2Sprite (naval) ═══════════════ */
function AutonomousFrigateV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="naval" hexTint={_P2.ground.water} phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="100" rx="48" ry="6" fill="#000" opacity="0.30" />
      <path d="M104,91 Q118,89 125,95" fill="none" stroke="#fff" strokeWidth="1.4" opacity="0.5" strokeLinecap="round" />
      <path d="M100,96 Q115,96 122,101" fill="none" stroke="#fff" strokeWidth="1" opacity="0.32" strokeLinecap="round" />
      <path d="M22,92 Q9,92 2,98" fill="none" stroke="#fff" strokeWidth="1" opacity="0.3" strokeLinecap="round" />
      <path d="M14,82 L92,79 L120,90 L98,98 L20,98 Z" fill={f.mid} stroke={_P2.ink.line} strokeWidth="1.2" />
      <path d="M14,82 L34,90 L20,98 Z" fill={f.dark} opacity="0.55" stroke={_P2.ink.line} strokeWidth="0.5" />
      <path d="M92,79 L120,90 L98,98 L84,90 Z" fill={f.dark} opacity="0.42" stroke={_P2.ink.line} strokeWidth="0.5" />
      <line x1="34" y1="90" x2="84" y2="90" stroke={_P2.metal.steel} strokeWidth="0.7" opacity="0.7" />
      <line x1="50" y1="81" x2="58" y2="90" stroke={_P2.metal.steel} strokeWidth="0.6" opacity="0.6" />
      <line x1="74" y1="80" x2="82" y2="90" stroke={_P2.metal.steel} strokeWidth="0.6" opacity="0.6" />
      <line x1="22" y1="96" x2="98" y2="96" stroke={f.bright} strokeWidth="1.4" opacity="0.4" />
      <path d="M46,79 L78,77 L82,68 L58,64 L44,72 Z" fill={f.mid} stroke={_P2.ink.line} strokeWidth="1" />
      <path d="M58,64 L82,68 L78,77 L64,74 Z" fill={f.dark} opacity="0.45" />
      <line x1="50" y1="72" x2="74" y2="70" stroke={_P2.metal.steel} strokeWidth="0.6" opacity="0.7" />
      {/* SENSOR MAST (rigid) + phased-array panel as secondary motion (.cq-plume) */}
      <line x1="72" y1="66" x2="72" y2="37" stroke={_P2.metal.steel} strokeWidth="2.2" />
      <g className="cq-plume"><g transform="translate(72 37)">
        <rect x="-6" y="-8" width="12" height="12" rx="1" fill="#112244" stroke={_P2.ink.line} strokeWidth="0.8" />
        <line x1="-4" y1="-5" x2="4" y2="-5" stroke="#00aaff" strokeWidth="0.7" opacity="0.9" />
        <line x1="-4" y1="-2" x2="4" y2="-2" stroke="#00aaff" strokeWidth="0.7" opacity="0.65" />
        <line className="cq-glow" x1="-4" y1="1" x2="4" y2="1" stroke="#00aaff" strokeWidth="0.7" />
      </g></g>
      {/* REMOTE TURRET — static, barrel aimed forward to the bow. Fires via
          .cq-muzzle-flash + hull recoil (cq2-attack-body), NOT a .cq-weapon swing
          (which pitched the barrel down through the deck). */}
      <g transform="translate(52 64)">
        <ellipse cx="0" cy="4" rx="8" ry="2.6" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.7" />
        <path d="M-6.5,4 Q-7,-3 0,-4 Q7,-3 6.5,4 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.9" />
        <path d="M-6.5,4 Q-7,-3 0,-4 Q0,-1 0,4 Z" fill={f.dark} opacity="0.35" />
        <rect x="5" y="-1.6" width="18" height="3.4" rx="1" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.7" />
        <rect x="21" y="-2.2" width="3" height="4.6" rx="0.6" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.5" />
        <circle className="cq-glow" cx="-1" cy="-1" r="1.3" fill={f.bright} />
      </g>
      <g transform="translate(77 64)"><g className="cq-muzzle-flash">
        <circle r="4" fill="#ffd966" />
        <circle r="2" fill="#fff" />
      </g></g>
    </SpriteFrameV2>
  );
}

/* ═══════════════ SPRITE 3 — ExosuitInfantryV2Sprite (melee) ═══════════════ */
function ExosuitInfantryV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="melee" phase={phase}>
      <g transform="translate(56 100)"><ellipse className="cq-step-dust" rx="3.2" ry="1.4" fill={_P2.stone.light} /></g>
      <g transform="translate(72 100)"><ellipse className="cq-step-dust cq-step-dust--b" rx="3.2" ry="1.4" fill={_P2.stone.light} /></g>
      <ellipse className="cq-shadow" cx="64" cy="102" rx="20" ry="5" fill="#000" opacity="0.35" />
      {/* power-unit backpack (static) + antenna secondary motion */}
      <g transform="translate(55 50)">
        <rect x="-7" y="-8" width="14" height="18" rx="2" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.8" />
        <rect x="-7" y="-8" width="14" height="3" fill={_P2.metal.steel} />
        <circle className="cq-glow" cx="0" cy="4" r="1.6" fill="#00ff44" />
      </g>
      <g className="cq-plume"><g transform="translate(50 42)">
        <line x1="0" y1="0" x2="-4" y2="-12" stroke={_P2.metal.steel} strokeWidth="1" strokeLinecap="round" />
        <circle cx="-4" cy="-12" r="1.3" fill={f.bright} />
      </g></g>
      {/* LEGS — greave assemblies wrapped per the rule (heavy mechanical gait) */}
      <g transform="translate(56 78)"><g className="cq-leg-l">
        <rect x="-3" y="0" width="6" height="8" fill={_P2.cloth.wool} stroke={_P2.ink.line} strokeWidth="0.6" />
        <rect x="-5" y="4" width="10" height="4" rx="1" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.6" />
        <circle cx="0" cy="6" r="1.7" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.5" />
        <rect x="-4" y="6" width="8" height="16" rx="2" fill={f.mid} stroke={_P2.ink.line} strokeWidth="0.8" />
        <ellipse cx="0" cy="22" rx="4.5" ry="2.2" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.5" />
      </g></g>
      <g transform="translate(72 78)"><g className="cq-leg-r">
        <rect x="-3" y="0" width="6" height="8" fill={_P2.cloth.wool} stroke={_P2.ink.line} strokeWidth="0.6" />
        <rect x="-5" y="4" width="10" height="4" rx="1" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.6" />
        <circle cx="0" cy="6" r="1.7" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.5" />
        <rect x="-4" y="6" width="8" height="16" rx="2" fill={f.mid} stroke={_P2.ink.line} strokeWidth="0.8" />
        <ellipse cx="0" cy="22" rx="4.5" ry="2.2" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.5" />
      </g></g>
      {/* wool undersuit + TORSO PLATE (dominant) */}
      <path d="M50,54 Q64,50 78,54 L79,74 Q64,79 49,74 Z" fill={_P2.cloth.wool} />
      <path d="M50,52 Q64,48 78,52 L80,74 Q64,80 48,74 Z" fill={f.mid} stroke={_P2.ink.line} strokeWidth="1.2" />
      <path d="M50,52 Q64,48 78,52 L79,60 Q64,56 49,60 Z" fill={_P2.metal.shine} opacity="0.18" />
      <line x1="64" y1="50" x2="64" y2="78" stroke={_P2.metal.steel} strokeWidth="0.8" opacity="0.7" />
      <line x1="50" y1="62" x2="78" y2="62" stroke={_P2.metal.steel} strokeWidth="0.8" opacity="0.7" />
      <path d="M56,68 L72,68 L70,74 L58,74 Z" fill={f.dark} opacity="0.5" />
      {/* shoulder pauldrons + arm struts (static) */}
      <g>
        <ellipse cx="47" cy="56" rx="7" ry="6" fill={f.mid} stroke={_P2.ink.line} strokeWidth="1" />
        <ellipse cx="47" cy="55" rx="5" ry="3.4" fill={_P2.metal.shine} opacity="0.2" />
        <rect x="44" y="60" width="3" height="18" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.5" />
        <circle cx="45.5" cy="68" r="1.7" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.5" />
      </g>
      <g>
        <ellipse cx="81" cy="56" rx="7" ry="6" fill={f.mid} stroke={_P2.ink.line} strokeWidth="1" />
        <ellipse cx="81" cy="55" rx="5" ry="3.4" fill={_P2.metal.shine} opacity="0.2" />
        <rect x="81" y="60" width="3" height="16" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.5" />
        <circle cx="82.5" cy="67" r="1.7" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.5" />
      </g>
      {/* HEAD + enclosed visor helmet (head-local coords, verbatim) */}
      <g transform="translate(64 70) scale(1.05)">
        <rect x="-3" y="-26" width="6" height="6" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="0.6" />
        <circle cx="0" cy="-30" r="9" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="1" />
        <path d="M-10,-31 Q-11,-42 0,-43 Q11,-42 10,-31 L9,-26 L-9,-26 Z" fill={f.dark} stroke={_P2.ink.line} strokeWidth="0.9" />
        <path d="M-8,-34 Q0,-38 8,-34 L7,-29 L-7,-29 Z" fill="#0a0a20" stroke={_P2.ink.line} strokeWidth="0.6" />
        <line className="cq-glow" x1="-6" y1="-31.5" x2="6" y2="-31.5" stroke={f.bright} strokeWidth="0.9" />
      </g>
      {/* WEAPON — braced rifle held FORWARD, static. Fires via .cq-muzzle-flash
          + body recoil (cq2-attack-body): rifle + forearm + hand recoil with the
          whole figure as one unit — no .cq-weapon swing (which pivoted the gun
          around the elbow and threw it off the hand). */}
      {/* forearm: shoulder -> grip, behind the rifle */}
      <line x1="82" y1="69" x2="70" y2="83" stroke={_P2.ink.line} strokeWidth="6" strokeLinecap="round" />
      <line x1="82" y1="69" x2="70" y2="83" stroke={f.mid} strokeWidth="4.2" strokeLinecap="round" />
      <g transform="translate(84 74) rotate(-10)">
        <rect x="-22" y="-3" width="34" height="7" rx="1.5" fill="#181830" stroke={_P2.ink.line} strokeWidth="0.8" />
        <rect x="-22" y="-3" width="34" height="2" fill={_P2.metal.steel} opacity="0.6" />
        <rect x="10" y="-1.5" width="11" height="3" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.5" />
        <rect x="-16" y="4" width="5" height="8" rx="1" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.5" />
      </g>
      {/* hand wrapping the grip, over the rifle */}
      <circle cx="70" cy="83.5" r="3" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="0.6" />
      {/* muzzle flash at the barrel tip, forward */}
      <g transform="translate(105 70)"><g className="cq-muzzle-flash">
        <circle r="3.6" fill="#ffd966" />
        <circle r="1.8" fill="#fff" />
      </g></g>
    </SpriteFrameV2>
  );
}

/* ═══════════════ SPRITE 4 — PropagandistV2Sprite (civilian, non-combat) ═══════════════ */
function PropagandistV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="civilian" phase={phase}>
      <g transform="translate(58 91)"><ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} /></g>
      <g transform="translate(70 91)"><ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} /></g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />
      <HumanoidV2
        cx={64} cy={70} cloth={_P2.cloth.wool} pants="#3a3628" accent={f.mid}
        skin={_P2.skin.warm} hair="#2a1a10" arms="free"
        armRContent={(
          /* held speaker/projector + broadcast arcs — swings with the arm, glows via .cq-glow */
          <g transform="translate(7 6) rotate(-10)">
            <g className="cq-glow" transform="translate(9 0)">
              <path d="M2,-8 Q10,-2 2,8" fill="none" stroke={f.bright} strokeWidth="1.2" opacity="0.75" />
              <path d="M6,-13 Q18,-2 6,13" fill="none" stroke={f.bright} strokeWidth="1" opacity="0.4" />
            </g>
            <rect x="-8" y="-10" width="16" height="21" rx="2" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="1" />
            <rect x="-8" y="-10" width="16" height="3" fill={_P2.metal.steel} />
            <rect x="-6" y="-8" width="4" height="2" fill={f.trim} />
            <circle cx="0" cy="2" r="6.2" fill="#0a0a20" stroke={_P2.ink.line} strokeWidth="0.9" />
            <circle className="cq-glow" cx="0" cy="2" r="6.2" fill="none" stroke={f.bright} strokeWidth="1.4" />
            <circle cx="0" cy="2" r="2.2" fill={_P2.metal.iron} stroke={_P2.metal.steel} strokeWidth="0.5" />
          </g>
        )}
      />
      {/* open collar / zip — modern jacket read (static over torso) */}
      <path d="M58,50 L64,60 L70,50" fill="none" stroke={f.dark} strokeWidth="1.1" />
      <line x1="64" y1="52" x2="64" y2="70" stroke={f.dark} strokeWidth="0.7" opacity="0.7" />
    </SpriteFrameV2>
  );
}

/* ═══════════════ SPRITE 5 — DroneControllerV2Sprite (spy, non-combat) ═══════════════ */
function DroneControllerV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="spy" hexTint="#241a36" phase={phase}>
      <g transform="translate(58 91)"><ellipse className="cq-step-dust" rx="3" ry="1.3" fill={_P2.stone.light} /></g>
      <g transform="translate(70 91)"><ellipse className="cq-step-dust cq-step-dust--b" rx="3" ry="1.3" fill={_P2.stone.light} /></g>
      <ellipse className="cq-shadow" cx="64" cy="92" rx="18" ry="5" fill="#000" opacity="0.35" />
      <HumanoidV2
        cx={64} cy={70} scale={0.95} cloth={_P2.cloth.wool} pants="#3a3628" accent={f.mid}
        skin={_P2.skin.warm} hair="#2a1a10" arms="locked"
        hat={<path d="M-9,-37 Q0,-42 9,-37 L10,-34 L-10,-34 Z" fill={f.dark} stroke={_P2.ink.line} strokeWidth="0.7" />}
      />
      {/* control rig — held steady in both locked hands, screen glows via .cq-glow */}
      <g transform="translate(64 71)">
        <rect x="-13" y="-5" width="26" height="14" rx="2" fill="#0a0a20" stroke={_P2.ink.line} strokeWidth="1" />
        <rect x="-11" y="-3" width="22" height="10" rx="1" fill="#112244" />
        <rect className="cq-glow" x="-11" y="-3" width="22" height="10" rx="1" fill={f.bright} opacity="0.22" />
        <line x1="-8" y1="0" x2="8" y2="0" stroke="#00aaff" strokeWidth="0.8" opacity="0.9" />
        <line x1="-8" y1="3.2" x2="3" y2="3.2" stroke="#00aaff" strokeWidth="0.8" opacity="0.65" />
        <line x1="11" y1="-5" x2="21" y2="-21" stroke={_P2.metal.steel} strokeWidth="1.2" strokeLinecap="round" />
        <circle className="cq-glow" cx="21" cy="-21" r="1.6" fill={f.bright} />
      </g>
      {/* MICRO-DRONE companion — secondary motion via .cq-plume (idle hover-sway) */}
      <g className="cq-plume"><g transform="translate(93 33) scale(0.82)">
        <line x1="-6" y1="0" x2="-11" y2="-3" stroke={_P2.metal.iron} strokeWidth="2" strokeLinecap="round" />
        <line x1="6" y1="0" x2="11" y2="-3" stroke={_P2.metal.iron} strokeWidth="2" strokeLinecap="round" />
        <circle cx="-12" cy="-3" r="3.4" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.7" />
        <circle cx="-12" cy="-3" r="1.9" fill="#181830" />
        <circle cx="12" cy="-3" r="3.4" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.7" />
        <circle cx="12" cy="-3" r="1.9" fill="#181830" />
        <path d="M-6,-3 L4,-3 L8,1 L4,5 L-6,5 L-9,1 Z" fill={f.mid} stroke={_P2.ink.line} strokeWidth="0.8" />
        <circle cx="5" cy="1" r="3" fill="#0a0a20" stroke={_P2.ink.line} strokeWidth="0.6" />
        <circle className="cq-glow" cx="5" cy="1" r="1.6" fill="#00aaff" />
      </g></g>
    </SpriteFrameV2>
  );
}

/* #709 — industrial visual batch. Vehicle weapon groups are deliberately nested
   beneath a turret and explicitly cancel the generic melee swing in CSS: the #708
   review showed that a broad parent transform can detach an otherwise rigid prop. */
function ArmoredCarV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return <SpriteFrameV2 state={state} kind="melee" variant="armored-car" phase={phase}>
    <ellipse className="cq-shadow" cx="64" cy="103" rx="42" ry="6" fill="#000" opacity=".35" />
    <g className="cq-sprite-figure"><g className="cq-armored-car-body">
      <path d="M18,86 L31,70 L83,70 L104,84 L101,96 L23,96 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="1.3" />
      <path d="M36,72 L51,57 L76,57 L88,72 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="1.1" /><path d="M43,69 L53,59 L65,59 L62,69 Z" fill={f.mid} opacity=".78" />
      <g className="cq-armored-car-turret"><ellipse cx="70" cy="61" rx="13" ry="7" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="1" /><g className="cq-weapon cq-armored-car-cannon"><rect x="68" y="58" width="35" height="5" rx="1.5" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth=".8" /><g transform="translate(105 60)"><g className="cq-muzzle-flash"><circle r="3.5" fill="#ffd966" /><circle r="1.6" fill="#fff" /></g></g></g><path d="M70,55V45" stroke={_P2.metal.iron} strokeWidth="1.4" /><path d="M71,45 L80,48 L71,51 Z" fill={f.bright} stroke={_P2.ink.line} strokeWidth=".5" /></g>
    </g>{[36,82].map(x => <g key={x} transform={`translate(${x} 96)`}><circle r="12" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="1.2" /><g className="cq-wheel"><circle r="8" fill="none" stroke={_P2.metal.steel} strokeWidth="2" /><path d="M-8,0H8M0,-8V8" stroke={_P2.metal.steel} strokeWidth="1" /></g><circle r="3" fill={_P2.metal.iron} /></g>)}</g>
  </SpriteFrameV2>;
}

function MechanizedInfantryV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return <SpriteFrameV2 state={state} kind="melee" variant="mechanized-infantry" phase={phase}>
    <ellipse className="cq-shadow" cx="69" cy="104" rx="53" ry="7" fill="#000" opacity=".35" />
    <g className="cq-sprite-figure"><g className="cq-mech-carrier"><path d="M15,87 L31,68 L96,68 L116,82 L113,101 L19,101 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="1.3" /><path d="M34,72 L50,56 L87,56 L102,72 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="1" /><rect x="43" y="80" width="54" height="7" rx="2" fill={f.mid} opacity=".72" /><ellipse cx="70" cy="61" rx="13" ry="6" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth=".8" />{[31,54,84,105].map(x => <g key={x} transform={`translate(${x} 101)`}><circle r="10" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="1" /><g className="cq-wheel"><circle r="6" fill="none" stroke={_P2.metal.steel} strokeWidth="1.7" /><path d="M-6,0H6M0,-6V6" stroke={_P2.metal.steel} strokeWidth=".8" /></g></g>)}</g>
      <g className="cq-mech-soldier cq-mech-rider"><path d="M62,56 Q70,49 78,56 L80,68 L61,68 Z" fill={f.dark} stroke={_P2.ink.line} strokeWidth=".8" /><circle cx="70" cy="47" r="7" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth=".7" /><path d="M62,47 Q63,37 70,37 Q77,37 78,47 L77,51 L63,51 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth=".7" /><g className="cq-arm-l"><path d="M64,58 Q72,66 79,68" fill="none" stroke={f.dark} strokeWidth="4" strokeLinecap="round" /></g><g className="cq-arm-r"><path d="M77,57 Q83,62 88,66" fill="none" stroke={f.dark} strokeWidth="4" strokeLinecap="round" /></g><g className="cq-weapon"><g transform="translate(79 68) rotate(-12)"><rect x="-8" y="-2.5" width="30" height="5" rx="1" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth=".6" /><rect x="19" y="-1.5" width="18" height="3" fill={_P2.metal.steel} /><g transform="translate(39 0)"><g className="cq-muzzle-flash"><circle r="3.2" fill="#ffd966" /><circle r="1.4" fill="#fff" /></g></g></g></g></g></g>
  </SpriteFrameV2>;
}

function MainBattleTankV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return <SpriteFrameV2 state={state} kind="melee" variant="main-battle-tank" phase={phase}>
    <ellipse className="cq-shadow" cx="64" cy="104" rx="51" ry="7" fill="#000" opacity=".35" />
    <g className="cq-sprite-figure"><g className="cq-mbt-body"><path d="M12,87 L30,74 L96,75 L115,87 L110,101 L17,101 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="1.4" /><path d="M29,80 L98,80 L105,91 L23,91 Z" fill={f.mid} opacity=".56" /><g className="cq-mbt-tracks"><path d="M18,91 Q23,83 40,84 L99,84 Q110,85 112,96 Q107,106 96,106 L31,106 Q18,104 18,91 Z" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="1.2" />{[34,51,69,87,102].map(x => <circle key={x} cx={x} cy="96" r="6" fill={_P2.metal.iron} stroke={_P2.metal.steel} strokeWidth="1" />)}</g><g className="cq-mbt-turret"><path d="M46,77 Q48,60 69,57 Q88,58 94,76 L87,83 L52,83 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="1.2" /><ellipse cx="68" cy="63" rx="8" ry="5" fill={f.dark} stroke={_P2.ink.line} strokeWidth=".7" /><g className="cq-weapon cq-mbt-cannon"><rect x="73" y="67" width="42" height="6" rx="2" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth=".9" /><rect x="108" y="68" width="10" height="4" fill={_P2.metal.steel} /><g transform="translate(120 70)"><g className="cq-muzzle-flash"><circle r="4" fill="#ffd966" /><circle r="1.8" fill="#fff" /></g></g></g></g></g></g>
  </SpriteFrameV2>;
}

/* #710 — air-defense and command visual correction.
 *
 * These are intentionally review-only until the captured contact sheets are accepted.
 * Each class marks a visibly separate part, not a speculative semantic label: this keeps
 * motion local and lets the visual contract prove the silhouette at every state. */
function ParatrooperV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return <SpriteFrameV2 state={state} kind="ranged" variant="paratrooper" phase={phase}>
    <ellipse className="cq-shadow" cx="64" cy="103" rx="20" ry="5" fill="#000" opacity=".3" />
    {/* The canopy is a complete open arc; its lines terminate at a real chest harness. */}
    <g className="cq-parachute-canopy">
      <path d="M25,38 Q64,8 103,38 L96,44 Q64,33 32,44 Z" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="1.2" />
      <path d="M32,39 Q43,20 53,37 M53,37 Q64,17 75,37 M75,37 Q85,20 96,39" fill="none" stroke={f.mid} strokeWidth="2.3" />
    </g>
    <g className="cq-parachute-lines" fill="none" stroke={_P2.ink.soft} strokeWidth="1">
      <line x1="32" y1="43" x2="52" y2="63" /><line x1="45" y1="40" x2="57" y2="63" />
      <line x1="58" y1="38" x2="61" y2="63" /><line x1="70" y1="38" x2="67" y2="63" />
      <line x1="83" y1="40" x2="72" y2="63" /><line x1="96" y1="43" x2="77" y2="63" />
    </g>
    <g className="cq-paratrooper-body">
      <g className="cq-paratrooper-pack"><rect x="44" y="59" width="17" height="24" rx="3" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="1" /><path d="M47,65h11M47,72h11" stroke={f.mid} strokeWidth="1.6" /></g>
      <g className="cq-paratrooper-harness"><path d="M54,62 L64,77 L75,62 M54,62 L75,62" fill="none" stroke={_P2.metal.iron} strokeWidth="2.2" /><circle cx="64" cy="77" r="2" fill={f.bright} stroke={_P2.ink.line} strokeWidth=".6" /></g>
      <path d="M64,58 Q76,60 76,78 L71,87 L56,87 L51,78 Q51,60 64,58 Z" fill={_P2.cloth.wool} stroke={_P2.ink.line} strokeWidth="1" />
      <g className="cq-leg-l"><path d="M57,84 L63,84 L61,103 L53,103 Z" fill={_P2.cloth.wool} stroke={_P2.ink.line} strokeWidth=".8" /><ellipse cx="56" cy="103" rx="5" ry="2.5" fill={_P2.wood.dark} /></g>
      <g className="cq-leg-r"><path d="M65,84 L71,84 L76,101 L68,103 Z" fill={_P2.cloth.wool} stroke={_P2.ink.line} strokeWidth=".8" /><ellipse cx="72" cy="103" rx="5" ry="2.5" fill={_P2.wood.dark} /></g>
      <g className="cq-arm-l"><path d="M55,66 Q45,74 49,84" fill="none" stroke={_P2.cloth.wool} strokeWidth="6" strokeLinecap="round" /><circle cx="49" cy="84" r="2.6" fill={_P2.skin.warm} /></g>
      <g className="cq-arm-r"><path d="M73,66 Q83,71 81,81" fill="none" stroke={_P2.cloth.wool} strokeWidth="6" strokeLinecap="round" /><circle cx="81" cy="81" r="2.6" fill={_P2.skin.warm} /></g>
      <circle cx="64" cy="52" r="9" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="1" /><path d="M54,52 Q55,41 64,41 Q73,41 74,52 L71,55 L57,55 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth=".8" />
      <g className="cq-paratrooper-rifle"><path d="M75,79 L103,71" stroke={_P2.wood.dark} strokeWidth="4" strokeLinecap="round" /><path d="M96,70 L109,67" stroke={_P2.metal.steel} strokeWidth="2.4" strokeLinecap="round" /><path d="M83,76 L80,87" stroke={_P2.wood.dark} strokeWidth="3" strokeLinecap="round" /></g>
    </g>
    <g transform="translate(35 30) scale(.46)"><rect x="-.6" y="-12" width="1.4" height="18" fill={_P2.wood.dark} /><path d="M0,-12 L14,-9 L8,-5 L14,-1 L0,-2 Z" fill={f.mid} stroke={f.dark} strokeWidth=".6" /><circle cx="5" cy="-7" r="1.6" fill={f.trim} /></g>
  </SpriteFrameV2>;
}

function NavalStrikeAircraftV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return <SpriteFrameV2 state={state} kind="civilian" variant="naval-strike-aircraft" phase={phase}>
    <ellipse className="cq-shadow" cx="64" cy="105" rx="42" ry="4" fill="#000" opacity=".28" />
    {/* Separate fuselage, swept wings, cockpit, tail and payload prevent the old arrow read. */}
    <g className="cq-strike-fuselage"><path d="M21,64 Q33,55 80,56 L101,59 Q111,60 114,64 Q111,68 101,69 L80,72 Q33,73 21,64 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="1.2" /><path d="M27,63 Q58,59 101,62" fill="none" stroke={_P2.metal.shine} strokeWidth="1.4" opacity=".75" /></g>
    <g className="cq-strike-wing"><path d="M57,62 L47,42 L58,43 L83,60 L89,55 L86,64 L89,73 L83,68 L58,85 L47,86 L57,66 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="1" /><path d="M50,47 L77,61 M50,81 L77,67" stroke={f.mid} strokeWidth="2.2" /></g>
    <g className="cq-strike-cockpit"><path d="M77,58 Q92,57 101,63 Q92,68 77,67 Z" fill={f.bright} stroke={_P2.ink.line} strokeWidth=".8" opacity=".8" /></g>
    <g className="cq-strike-tail"><path d="M31,64 L17,52 L23,49 L41,59 L41,69 L23,79 L17,76 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth=".9" /></g>
    <g className="cq-strike-tailhook"><path d="M30,70 Q20,78 26,86 Q31,89 34,84" fill="none" stroke={_P2.metal.steel} strokeWidth="2" strokeLinecap="round" /></g>
    <g className="cq-naval-strike-torpedo"><path d="M56,79 L91,79 L99,83 L91,87 L56,87 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth=".7" /><path d="M62,80h24" stroke={_P2.metal.shine} strokeWidth="1" /><path d="M97,81 L104,83 L97,85 Z" fill={f.bright} /></g>
    <g transform="translate(38 34) scale(.44)"><rect x="-.6" y="-12" width="1.4" height="18" fill={_P2.wood.dark} /><path d="M0,-12 L14,-9 L8,-5 L14,-1 L0,-2 Z" fill={f.mid} stroke={f.dark} strokeWidth=".6" /></g>
  </SpriteFrameV2>;
}

function MaritimePatrolAircraftV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return <SpriteFrameV2 state={state} kind="civilian" variant="maritime-patrol-aircraft" phase={phase}>
    <ellipse className="cq-shadow" cx="64" cy="105" rx="47" ry="4" fill="#000" opacity=".28" />
    {/* A patrol plane is unarmed: twin engines, props, high wing and a radar dome are its role cues. */}
    <g className="cq-patrol-fuselage"><path d="M17,64 Q32,54 98,57 L106,59 Q113,60 115,64 Q113,68 106,69 L98,71 Q32,74 17,64 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="1.2" /><path d="M24,63 Q60,59 104,62" fill="none" stroke={_P2.metal.shine} strokeWidth="1.3" opacity=".7" /></g>
    <g className="cq-patrol-wing"><path d="M51,61 L42,39 L56,41 L82,59 L92,55 L88,64 L92,73 L82,69 L56,87 L42,89 L51,67 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="1" /><path d="M46,46 L77,61 M46,82 L77,67" stroke={f.mid} strokeWidth="2" /></g>
    <g className="cq-patrol-nacelle-l"><ellipse cx="55" cy="50" rx="12" ry="5" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth=".8" /><circle cx="44" cy="50" r="4" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth=".6" /></g>
    <g className="cq-patrol-nacelle-r"><ellipse cx="55" cy="78" rx="12" ry="5" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth=".8" /><circle cx="44" cy="78" r="4" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth=".6" /></g>
    <g className="cq-patrol-prop-l"><path d="M42,39v22M31,50h22" stroke={_P2.ink.soft} strokeWidth="1.6" strokeLinecap="round" /></g><g className="cq-patrol-prop-r"><path d="M42,67v22M31,78h22" stroke={_P2.ink.soft} strokeWidth="1.6" strokeLinecap="round" /></g>
    <g className="cq-patrol-radar-dome"><path d="M72,72 Q82,63 92,72 Z" fill={f.bright} stroke={_P2.ink.line} strokeWidth=".8" /><path d="M76,73 Q82,81 88,73" fill="none" stroke={_P2.metal.steel} strokeWidth="1.2" /></g>
    <g transform="translate(27 39) scale(.42)"><rect x="-.6" y="-12" width="1.4" height="18" fill={_P2.wood.dark} /><path d="M0,-12 L14,-9 L8,-5 L14,-1 L0,-2 Z" fill={f.mid} stroke={f.dark} strokeWidth=".6" /></g>
  </SpriteFrameV2>;
}

function SupercarrierV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return <SpriteFrameV2 state={state} kind="naval" variant="supercarrier" hexTint={_P2.ground.water} phase={phase}>
    <ellipse className="cq-shadow" cx="64" cy="106" rx="57" ry="7" fill="#000" opacity=".3" />
    {/* Hull, bow, angled deck, island, mast and planes each get their own visual read. */}
    <g className="cq-supercarrier-wake"><path d="M12,101 Q64,115 116,101 M18,107 Q64,119 110,107" fill="none" stroke={_P2.ground.water} strokeWidth="2.4" opacity=".8" /></g>
    <g className="cq-supercarrier-hull"><path d="M10,84 L21,73 L106,73 L121,84 L111,102 Q64,111 18,102 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="1.3" /><path d="M18,91 Q64,101 113,91" fill="none" stroke={_P2.metal.steel} strokeWidth="2" /></g>
    <g className="cq-supercarrier-bow"><path d="M106,73 L121,84 L111,102 L98,91 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth=".8" /></g>
    <g className="cq-supercarrier-deck"><path d="M15,72 L35,55 L110,60 L116,75 L98,87 L28,84 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="1.2" /><path d="M28,75 L87,70 L99,73" fill="none" stroke={f.bright} strokeWidth="1.8" strokeDasharray="5 3" /></g>
    <g className="cq-supercarrier-aircraft" fill={f.mid} stroke={_P2.ink.line} strokeWidth=".5"><path d="M38,64 L47,67 L38,70 L41,67 Z" /><path d="M57,68 L66,70 L57,73 L60,70 Z" /><g className="cq-supercarrier-launch-aircraft"><path d="M76,62 L85,65 L76,68 L79,65 Z" /></g></g>
    <g className="cq-supercarrier-island"><path d="M82,60 L87,39 L103,43 L106,70 L91,72 Z" fill={_P2.stone.mid} stroke={_P2.ink.line} strokeWidth="1" /><path d="M89,50h10M88,57h11" stroke={f.bright} strokeWidth="1.4" /></g>
    <g className="cq-supercarrier-mast"><line x1="94" y1="41" x2="94" y2="22" stroke={_P2.metal.iron} strokeWidth="2" /><path d="M95,24 L110,29 L95,34 Z" fill={f.mid} stroke={_P2.ink.line} strokeWidth=".6" /></g>
  </SpriteFrameV2>;
}

/* #711 — purpose-built siege and capital-ship silhouettes.  Their hooks name
 * physical subassemblies rather than abstract effects so animation reads as
 * mechanism: wheel, beam, rack, turret, radar, and VLS lid. */
function TrebuchetV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return <SpriteFrameV2 state={state} kind="ranged" variant="trebuchet" phase={phase}>
    <ellipse className="cq-shadow" cx="64" cy="104" rx="42" ry="7" fill="#000" opacity=".28" />
    <g transform="translate(12 35)">
      <g className="cq-trebuchet-carriage"><path d="M7,54 L21,38 H91 L105,54 L96,66 H16 Z" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="1.4" /><path d="M18,52 H96" stroke={_P2.wood.light} strokeWidth="3" /><path d="M31,40 H82" stroke={f.mid} strokeWidth="2.2" /></g>
      {[22, 47, 76, 94].map((cx) => <g key={cx} transform={`translate(${cx} 62)`}><g className="cq-trebuchet-wheel"><circle r="9" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="1.2" /><circle r="3" fill={_P2.metal.iron} /><path d="M0,-7V7M-7,0H7" stroke={_P2.wood.light} strokeWidth="1.2" /></g></g>)}
      <g transform="translate(43 39)"><g className="cq-trebuchet-a-frame"><path d="M-17,15 L0,-30 L19,15 Z" fill={_P2.wood.light} stroke={_P2.ink.line} strokeWidth="1.3" /><path d="M-11,13 L0,-19 L12,13" fill="none" stroke={_P2.wood.dark} strokeWidth="2.3" /><circle cy="-30" r="4" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth=".8" /></g></g>
      <g transform="translate(43 9)"><g className="cq-trebuchet-counterweight"><path d="M-15,-4 H-2 V18 H-17 Z" fill={_P2.stone.mid} stroke={_P2.ink.line} strokeWidth="1" /><path d="M-14,1 H-4M-14,7 H-4" stroke={_P2.stone.light} strokeWidth="1.5" /></g></g>
      <g transform="translate(43 9)"><g className="cq-trebuchet-beam"><path d="M-8,1 L42,-17 L45,-11 L-6,8 Z" fill={_P2.wood.light} stroke={_P2.ink.line} strokeWidth="1.1" /><circle r="4" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth=".8" /><g className="cq-trebuchet-sling"><path d="M42,-14 Q49,-7 48,4 M46,-11 Q54,-6 54,0" fill="none" stroke={_P2.wood.dark} strokeWidth="1.4" /><path d="M47,4 Q50,7 54,3" fill="none" stroke={_P2.cloth.linen} strokeWidth="1.1" /></g></g></g>
      <g transform="translate(93 -8)"><g className="cq-trebuchet-stone"><circle r="3.4" fill={_P2.stone.mid} stroke={_P2.ink.line} strokeWidth=".8" /><path d="M-1.4,-1.6 L1.2,-2.1" stroke={_P2.stone.light} strokeWidth=".8" strokeLinecap="round" /></g></g>
      <g transform="translate(91 27) scale(.48)"><rect x="-.6" y="-12" width="1.4" height="18" fill={_P2.wood.dark} /><path d="M0,-12 L14,-9 L8,-5 L14,-1 L0,-2 Z" fill={f.mid} stroke={f.dark} strokeWidth=".6" /></g>
    </g>
  </SpriteFrameV2>;
}

function RocketArtilleryV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return <SpriteFrameV2 state={state} kind="ranged" variant="rocket-artillery" phase={phase}>
    <ellipse className="cq-shadow" cx="64" cy="104" rx="44" ry="7" fill="#000" opacity=".28" />
    <g transform="translate(11 37)">
      <g className="cq-rocket-artillery-chassis"><path d="M7,50 L19,37 H100 L111,50 L103,65 H14 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="1.4" /><path d="M17,51 H104" stroke={_P2.metal.shine} strokeWidth="2" /><path d="M25,42 H93" stroke={f.mid} strokeWidth="2.5" /></g>
      {[17, 33, 49, 74, 90, 105].map((cx) => <g key={cx} transform={`translate(${cx} 63)`}><g className="cq-rocket-artillery-wheel"><circle r="7.2" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="1" /><circle r="2.3" fill={_P2.metal.steel} /><path d="M0,-5V5M-5,0H5" stroke={_P2.metal.shine} strokeWidth="1" /></g></g>)}
      <g transform="translate(62 39)"><g className="cq-rocket-artillery-rack"><path d="M-34,2 L-25,-21 H29 L38,2 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="1.2" /><path d="M-28,-3 H33" stroke={_P2.metal.iron} strokeWidth="2" /><g className="cq-rocket-artillery-tubes" fill={_P2.ink.soft} stroke={_P2.ink.line} strokeWidth=".7">{[-20,-8,4,16].map((x) => <rect key={x} x={x} y="-17" width="8" height="18" rx="1" />)}</g><path d="M-25,-20 H29" stroke={f.bright} strokeWidth="1.2" opacity=".85" /></g></g>
      <g transform="translate(80 20)"><g className="cq-rocket-artillery-rocket cq-rocket-artillery-rocket--a"><path d="M0,5 L11,0 L15,3 L11,7 L1,9 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth=".7" /><path d="M11,0 L15,3 L11,7 Z" fill={f.bright} stroke={_P2.ink.line} strokeWidth=".45" /><path className="cq-rocket-artillery-exhaust" d="M-5,6 L1,4 L1,9 Z" fill={_P2.metal.gold} stroke={_P2.ink.line} strokeWidth=".45" /></g></g>
      <g transform="translate(68 20)"><g className="cq-rocket-artillery-rocket cq-rocket-artillery-rocket--b"><path d="M0,5 L11,0 L15,3 L11,7 L1,9 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth=".7" /><path d="M11,0 L15,3 L11,7 Z" fill={f.bright} stroke={_P2.ink.line} strokeWidth=".45" /><path className="cq-rocket-artillery-exhaust" d="M-5,6 L1,4 L1,9 Z" fill={_P2.metal.gold} stroke={_P2.ink.line} strokeWidth=".45" /></g></g>
      <g transform="translate(22 58)"><g className="cq-rocket-artillery-stabilizer"><path d="M0,0 L-10,13 M1,0 L13,13" stroke={_P2.metal.steel} strokeWidth="3" strokeLinecap="round" /><path d="M-13,13 H-7 M10,13 H16" stroke={_P2.ink.line} strokeWidth="2" /></g></g>
      <g transform="translate(84 53)"><g className="cq-rocket-artillery-crate"><rect width="16" height="12" fill={_P2.wood.light} stroke={_P2.ink.line} strokeWidth=".8" /><path d="M2,2 L14,10M14,2 L2,10" stroke={f.mid} strokeWidth="1.1" /></g></g>
    </g>
  </SpriteFrameV2>;
}

function BattleshipV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  const turret = (name, x, y, direction = 1) => <g key={name} transform={`translate(${x} ${y})`}><g className={`cq-battleship-turret-${name}`}><ellipse rx="11" ry="6" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth=".9" /><path d={`M0,-1 L${direction * 22},-4`} stroke={_P2.metal.iron} strokeWidth="4" strokeLinecap="round" /><path d={`M0,2 L${direction * 19},5`} stroke={_P2.metal.iron} strokeWidth="3" strokeLinecap="round" /><g className="cq-muzzle-flash" transform={`translate(${direction * 22} -4)`}><path d="M0,-5 L6,0 L0,5 L-4,0 Z" fill={_P2.metal.gold} stroke={_P2.ink.line} strokeWidth=".5" /></g></g></g>;
  return <SpriteFrameV2 state={state} kind="naval" variant="battleship" hexTint={_P2.ground.water} phase={phase}>
    <ellipse className="cq-shadow" cx="64" cy="105" rx="53" ry="7" fill="#000" opacity=".28" />
    <g className="cq-battleship-wake"><path d="M10,100 Q64,115 118,100 M19,107 Q64,120 109,107" fill="none" stroke={_P2.ground.water} strokeWidth="2.6" opacity=".85" /></g>
    <g className="cq-battleship-hull"><path d="M9,85 L27,67 H104 L120,84 L108,102 Q64,111 20,102 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="1.4" /><path d="M18,91 Q64,101 112,91" fill="none" stroke={_P2.metal.steel} strokeWidth="2.2" /><path d="M27,67 H104 L111,77 H18 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="1" /></g>
    {turret('fore', 91, 73)}{turret('mid', 63, 70)}{turret('aft', 34, 75, -1)}
    <g transform="translate(52 63)"><g className="cq-battleship-bridge"><path d="M-10,5 L-6,-16 H12 L16,5 Z" fill={_P2.stone.mid} stroke={_P2.ink.line} strokeWidth="1" /><path d="M-5,-7 H10" stroke={f.bright} strokeWidth="1.8" /><path d="M2,-16 V-29" stroke={_P2.metal.iron} strokeWidth="2" /></g></g>
    <g transform="translate(54 33)"><g className="cq-battleship-rangefinder"><path d="M-10,0 H10" stroke={_P2.metal.steel} strokeWidth="3" /><circle cx="-10" r="2.5" fill={f.bright} /><circle cx="10" r="2.5" fill={f.bright} /></g></g>
  </SpriteFrameV2>;
}

function MissileCruiserV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return <SpriteFrameV2 state={state} kind="naval" variant="missile-cruiser" hexTint={_P2.ground.water} phase={phase}>
    <ellipse className="cq-shadow" cx="64" cy="105" rx="51" ry="7" fill="#000" opacity=".28" />
    <g className="cq-missile-cruiser-wake"><path d="M11,100 Q64,116 117,100 M22,107 Q64,120 106,107" fill="none" stroke={_P2.ground.water} strokeWidth="2.5" opacity=".85" /></g>
    <g className="cq-missile-cruiser-hull"><path d="M10,86 L31,68 H102 L118,85 L107,102 Q64,110 21,102 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="1.35" /><path d="M19,91 Q64,100 111,91" fill="none" stroke={_P2.metal.steel} strokeWidth="2.1" /><path d="M28,69 H102 L108,78 H19 Z" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth=".9" /></g>
    <g transform="translate(36 72)"><g className="cq-missile-cruiser-vls"><rect x="-13" y="-8" width="26" height="16" rx="1" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth=".9" />{[-8,0,8].map((x) => <g key={x} transform={`translate(${x} -3)`}><g className="cq-missile-cruiser-vls-lid"><path d="M-3,-3 H3 V3 H-3 Z" fill={_P2.ink.soft} stroke={_P2.metal.shine} strokeWidth=".5" /></g><g className="cq-missile-cruiser-launch"><path d="M0,-5 V-17" stroke={f.bright} strokeWidth="1.8" /><path d="M-3,-15 L0,-21 L3,-15 Z" fill={_P2.metal.gold} /></g></g>)}</g></g>
    <g transform="translate(68 63)"><g className="cq-missile-cruiser-bridge"><path d="M-10,7 L-5,-18 H14 L18,7 Z" fill={_P2.stone.mid} stroke={_P2.ink.line} strokeWidth="1" /><path d="M-4,-8 H12" stroke={f.bright} strokeWidth="1.8" /><path d="M4,-18 V-31" stroke={_P2.metal.iron} strokeWidth="2" /></g></g>
    <g transform="translate(73 31)"><g className="cq-missile-cruiser-radar-forward"><ellipse rx="10" ry="2.5" fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth=".7" /><path d="M0,2V11" stroke={_P2.metal.iron} strokeWidth="1.5" /></g></g>
    <g transform="translate(57 40)"><g className="cq-missile-cruiser-radar-aft"><path d="M-8,0 H8 M0,-7 V7" stroke={_P2.metal.steel} strokeWidth="1.8" /><circle r="2" fill={f.bright} /></g></g>
  </SpriteFrameV2>;
}

function GreatGeneralV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return <SpriteFrameV2 state={state} kind="civilian" variant="great-general" phase={phase}>
    <ellipse className="cq-shadow" cx="64" cy="103" rx="20" ry="5" fill="#000" opacity=".3" />
    {/* This is a complete standing figure—both arms visibly hold the unfolded map. */}
    <g className="cq-general-standard"><line x1="37" y1="27" x2="37" y2="93" stroke={_P2.wood.dark} strokeWidth="2.4" /><path d="M38,29 H61 L53,37 L61,45 H38 Z" fill={f.mid} stroke={_P2.ink.line} strokeWidth=".7" /><circle cx="37" cy="25" r="3" fill={_P2.metal.gold} stroke={_P2.ink.line} strokeWidth=".5" /></g>
    <g className="cq-general-body">
      <g className="cq-general-leg-l"><path d="M56,82 L63,82 L61,103 L53,103 Z" fill={_P2.cloth.wool} stroke={_P2.ink.line} strokeWidth=".8" /><ellipse cx="56" cy="103" rx="5" ry="2.5" fill={_P2.wood.dark} /></g>
      <g className="cq-general-leg-r"><path d="M65,82 L72,82 L77,101 L68,103 Z" fill={_P2.cloth.wool} stroke={_P2.ink.line} strokeWidth=".8" /><ellipse cx="73" cy="103" rx="5" ry="2.5" fill={_P2.wood.dark} /></g>
      <path d="M64,56 Q77,58 77,80 L72,88 L55,88 L50,80 Q50,58 64,56 Z" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="1" /><path d="M53,74h22" stroke={f.mid} strokeWidth="2.4" /><circle cx="64" cy="51" r="9" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth="1" /><path d="M55,51 Q56,39 64,39 Q73,39 74,51 L71,54 L57,54 Z" fill={_P2.ink.soft} />
      <g className="cq-general-arm-l"><path d="M54,65 Q46,69 48,76 Q52,82 57,79" fill="none" stroke={_P2.ink.line} strokeWidth="8" strokeLinecap="round" /><path d="M54,65 Q46,69 48,76 Q52,82 57,79" fill="none" stroke={_P2.cloth.linen} strokeWidth="5.5" strokeLinecap="round" /><circle cx="57" cy="79" r="2.7" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth=".5" /></g>
      <g className="cq-general-arm-r"><path d="M74,65 Q82,69 80,76 Q76,82 71,79" fill="none" stroke={_P2.ink.line} strokeWidth="8" strokeLinecap="round" /><path d="M74,65 Q82,69 80,76 Q76,82 71,79" fill="none" stroke={_P2.cloth.linen} strokeWidth="5.5" strokeLinecap="round" /><circle cx="71" cy="79" r="2.7" fill={_P2.skin.warm} stroke={_P2.ink.line} strokeWidth=".5" /></g>
      <g className="cq-general-map"><path d="M52,76 L64,72 L76,76 L76,87 L64,83 L52,87 Z" fill={_P2.cloth.linen} stroke={_P2.ink.line} strokeWidth="1" /><path d="M60,74v10M68,74v10" stroke={f.mid} strokeWidth="1.1" /></g>
    </g>
  </SpriteFrameV2>;
}

Object.assign(window, {
  SpriteFrameV2, HumanoidV2,
  SwordsmanV2Sprite, WorkerV2Sprite, ArcherV2Sprite, SpyOperativeV2Sprite,
  SettlerV2Sprite, ScoutV2Sprite,
  MusketeerV2Sprite,
  WarriorV2Sprite, PikemanV2Sprite,
  SpyScoutV2Sprite, SpyInformantV2Sprite, SpyAgentV2Sprite, SpyHackerV2Sprite, ShadowWardenV2Sprite,
  ScoutHoundV2Sprite, WarHoundV2Sprite, BeastHandlerV2Sprite, WarElephantV2Sprite,
  GalleyV2Sprite, TriremeV2Sprite,
  AxemanV2Sprite, SpearmanV2Sprite,
  HorsemanV2Sprite, CavalryV2Sprite, KnightV2Sprite, CuirassierV2Sprite,
  CrossbowmanV2Sprite,
  CatapultV2Sprite, BallistaV2Sprite,
  CaravanV2Sprite, ExpeditionV2Sprite, TransportV2Sprite,
  CarrackV2Sprite, GalleonV2Sprite, SteamshipV2Sprite, TroopTransportV2Sprite,
  // #759 batch 1
  CombatDroneV2Sprite, AutonomousFrigateV2Sprite, ExosuitInfantryV2Sprite,
  PropagandistV2Sprite, DroneControllerV2Sprite,
  ArmoredCarV2Sprite, MechanizedInfantryV2Sprite, MainBattleTankV2Sprite,
  // #710 review-only exports; v2/index registration waits for captured visual approval.
  ParatrooperV2Sprite, NavalStrikeAircraftV2Sprite, MaritimePatrolAircraftV2Sprite,
  SupercarrierV2Sprite, GreatGeneralV2Sprite,
  // #711 siege and capital-ship visual batch.
  TrebuchetV2Sprite, RocketArtilleryV2Sprite, BattleshipV2Sprite, MissileCruiserV2Sprite,
});
