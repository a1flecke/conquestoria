/* Neutral pirate naval family. Runtime color never depends on a civilization palette. */
const { SpriteFrameV2: PirateSpriteFrameV2 } = window;

const PIRATE_V2 = {
  ink: '#171316', timber: '#5e3f24', timberLight: '#8a6a3a', iron: '#4d555d',
  steel: '#858e96', canvas: '#d8cfb8', soot: '#312c2e', red: '#8b2635',
  signal: '#c8453c', bone: '#e7dcc5', water: '#3a6e94', fire: '#e67e35',
};

function PirateFlagV2({ x = 64, y = 24 }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 V42" stroke={PIRATE_V2.timber} strokeWidth="2.5" />
      <path className="cq-pirate-flag" d="M2 2 L30 8 L18 19 L30 30 L2 26 Z" fill={PIRATE_V2.red} stroke={PIRATE_V2.ink} strokeWidth="1.2" />
      <circle cx="13" cy="14" r="4.2" fill={PIRATE_V2.bone} />
      <path d="M9 20 L17 12 M9 12 L17 20" stroke={PIRATE_V2.bone} strokeWidth="1.4" />
    </g>
  );
}

function CommonEffects() {
  return (
    <>
      <g className="cq-wake" fill="none" stroke={PIRATE_V2.bone} strokeWidth="1.8" opacity=".65">
        <path d="M8 105 Q35 96 55 105" /><path d="M73 105 Q96 96 122 105" />
      </g>
      <g className="cq-attack-effect" opacity="0">
        <circle cx="116" cy="71" r="8" fill={PIRATE_V2.fire} /><path d="M108 71 H127" stroke={PIRATE_V2.bone} strokeWidth="3" />
      </g>
      <g className="cq-death-effect" opacity="0">
        <path d="M33 48 L20 27 M63 41 L66 17 M95 49 L110 27" stroke={PIRATE_V2.soot} strokeWidth="7" strokeLinecap="round" />
        <path d="M22 88 L13 98 M104 88 L118 99 M61 82 L54 104" stroke={PIRATE_V2.timberLight} strokeWidth="4" />
      </g>
      <g className="cq-damage-1 cq-wound-1">
        <path d="M76 36 L70 48 L80 54 L73 66" fill="none" stroke={PIRATE_V2.ink} strokeWidth="2.5" />
        <path d="M22 89 L38 86" stroke={PIRATE_V2.bone} strokeWidth="2" opacity=".7" />
      </g>
      <g className="cq-damage-2 cq-wound-2">
        <path d="M37 80 L44 92 L53 78" fill="none" stroke={PIRATE_V2.ink} strokeWidth="4" />
        <path d="M88 77 L101 93" stroke={PIRATE_V2.steel} strokeWidth="3" />
      </g>
      <g className="cq-damage-3 cq-wound-3">
        <path d="M62 31 L56 70" stroke={PIRATE_V2.timber} strokeWidth="5" />
        <path d="M49 68 Q65 55 82 72" fill={PIRATE_V2.signal} opacity=".85" />
        <path d="M55 58 Q45 44 57 35 Q68 48 61 59 Z" fill={PIRATE_V2.fire} stroke={PIRATE_V2.signal} strokeWidth="2" />
        <path d="M18 96 L31 108 M91 101 L106 111" stroke={PIRATE_V2.timberLight} strokeWidth="4" />
      </g>
    </>
  );
}

function TimberHull({ broad = false }) {
  return (
    <>
      <path d={broad ? 'M5 80 Q64 67 123 80 L113 102 Q64 110 14 102 Z' : 'M9 82 Q64 72 119 82 L109 99 Q64 106 18 99 Z'} fill={PIRATE_V2.timber} stroke={PIRATE_V2.ink} strokeWidth="2" />
      <path d="M15 78 Q64 68 113 78 L105 89 Q64 95 23 89 Z" fill={PIRATE_V2.timberLight} stroke={PIRATE_V2.ink} />
      <path d="M14 91 Q64 100 114 90" fill="none" stroke={PIRATE_V2.red} strokeWidth="4" />
    </>
  );
}

function PirateGalleyV2Sprite({ state = 'idle', phase }) {
  const oars = [24, 38, 52, 76, 90, 104];
  return (
    <PirateSpriteFrameV2 state={state} kind="pirate-naval" phase={phase} hexTint={PIRATE_V2.water}>
      <g className="cq-galley-silhouette"><TimberHull /><path className="cq-ram-surge" d="M10 83 L-4 89 L11 93 Z" fill={PIRATE_V2.steel} stroke={PIRATE_V2.ink} /></g>
      <g className="cq-oars">{oars.map((x, i) => <line key={x} x1={x} y1={88} x2={x < 64 ? x - 13 : x + 13} y2={104 + i % 2} stroke={PIRATE_V2.timberLight} strokeWidth="3" />)}</g>
      <path d="M63 28 V78" stroke={PIRATE_V2.timber} strokeWidth="3" /><path d="M64 30 L96 43 L91 72 L64 76 Z" fill={PIRATE_V2.canvas} stroke={PIRATE_V2.ink} /><path d="M72 43 L91 49 L88 58 L68 53 Z" fill={PIRATE_V2.red} />
      <PirateFlagV2 x={63} y={23} /><CommonEffects />
    </PirateSpriteFrameV2>
  );
}

function PirateCorsairV2Sprite({ state = 'idle', phase }) {
  return (
    <PirateSpriteFrameV2 state={state} kind="pirate-naval" phase={phase} hexTint={PIRATE_V2.water}>
      <g className="cq-corsair-silhouette"><TimberHull /><path className="cq-board-surge" d="M18 74 Q8 61 16 49 M104 76 Q120 63 112 50" fill="none" stroke={PIRATE_V2.iron} strokeWidth="3" /></g>
      <g className="cq-lateen"><path d="M43 31 L87 50 L48 72 Z" fill={PIRATE_V2.canvas} stroke={PIRATE_V2.ink} /><path d="M68 19 L112 42 L77 70 Z" fill={PIRATE_V2.canvas} stroke={PIRATE_V2.ink} /><path d="M70 29 L98 43 L81 54 Z" fill={PIRATE_V2.red} /></g>
      <path d="M47 27 V78 M72 17 V77" stroke={PIRATE_V2.timber} strokeWidth="3" /><PirateFlagV2 x={72} y={15} /><CommonEffects />
    </PirateSpriteFrameV2>
  );
}

function PirateFrigateV2Sprite({ state = 'idle', phase }) {
  return (
    <PirateSpriteFrameV2 state={state} kind="pirate-naval" phase={phase} hexTint={PIRATE_V2.water}>
      <g className="cq-frigate-silhouette"><TimberHull broad /><g className="cq-broadside">{[30,45,60,75,90].map(x => <circle key={x} cx={x} cy="87" r="3" fill={PIRATE_V2.ink} stroke={PIRATE_V2.steel} />)}</g></g>
      <g className="cq-roll"><path d="M35 29 V78 M65 15 V77 M93 31 V77" stroke={PIRATE_V2.timber} strokeWidth="3" /><path d="M24 34 Q35 29 47 34 L45 68 Q35 72 27 68 Z" fill={PIRATE_V2.canvas} /><path d="M51 24 Q65 18 80 24 L77 69 Q65 73 54 69 Z" fill={PIRATE_V2.canvas} /><path d="M83 36 Q93 31 104 36 L101 68 Q93 71 86 68 Z" fill={PIRATE_V2.canvas} /></g>
      <PirateFlagV2 x={65} y={14} /><CommonEffects />
    </PirateSpriteFrameV2>
  );
}

function PirateIroncladV2Sprite({ state = 'idle', phase }) {
  return (
    <PirateSpriteFrameV2 state={state} kind="pirate-naval" phase={phase} hexTint={PIRATE_V2.water}>
      <g className="cq-ironclad-silhouette"><path d="M6 79 H122 L114 102 Q64 109 14 102 Z" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} strokeWidth="2" /><path d="M15 79 H113 L105 89 H23 Z" fill={PIRATE_V2.steel} /><path d="M14 92 Q64 100 115 91" fill="none" stroke={PIRATE_V2.red} strokeWidth="5" /></g>
      <g className="cq-heavy-recoil"><ellipse cx="42" cy="73" rx="17" ry="9" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} /><path d="M31 70 L8 62" stroke={PIRATE_V2.iron} strokeWidth="6" /></g>
      <g className="cq-stack-smoke"><rect x="65" y="39" width="14" height="39" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} /><path d="M70 35 Q62 24 72 17 Q84 27 78 39" fill={PIRATE_V2.soot} opacity=".65" /></g><g className="cq-engine-wake"><CommonEffects /></g>
    </PirateSpriteFrameV2>
  );
}

function PirateFastAttackCraftV2Sprite({ state = 'idle', phase }) {
  return (
    <PirateSpriteFrameV2 state={state} kind="pirate-naval" phase={phase} hexTint={PIRATE_V2.water}>
      <g className="cq-fast-craft-silhouette cq-bow-lift"><path d="M5 86 L34 70 H112 L124 82 L103 100 H24 Z" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} strokeWidth="2" /><path d="M17 85 L39 76 H110 L116 82 L98 91 H26 Z" fill={PIRATE_V2.steel} /><path d="M22 93 H105" stroke={PIRATE_V2.red} strokeWidth="4" /></g>
      <path d="M45 56 H87 L99 72 H34 Z" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} /><path d="M50 59 H62 L58 68 H43 Z M67 59 H81 L91 68 H67 Z" fill="#668fa4" />
      <g className="cq-autocannon"><ellipse cx="94" cy="68" rx="10" ry="5" fill={PIRATE_V2.iron} /><path d="M98 65 L118 57" stroke={PIRATE_V2.iron} strokeWidth="4" /></g><g className="cq-engine-wake"><CommonEffects /></g>
    </PirateSpriteFrameV2>
  );
}

function PirateMothershipV2Sprite({ state = 'idle', phase }) {
  return (
    <PirateSpriteFrameV2 state={state} kind="pirate-naval" phase={phase} hexTint={PIRATE_V2.water}>
      <g className="cq-mothership-silhouette"><path d="M3 78 H122 L125 90 L109 106 Q64 112 11 104 Z" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} strokeWidth="2" /><path d="M10 73 H114 L121 82 L18 88 Z" fill={PIRATE_V2.steel} /><path d="M12 94 Q64 103 116 93" fill="none" stroke={PIRATE_V2.red} strokeWidth="5" /></g>
      <g className="cq-boat"><path d="M21 88 Q31 80 43 87 L40 96 H24 Z" fill={PIRATE_V2.red} /><path d="M48 91 Q58 83 69 90 L66 98 H50 Z" fill={PIRATE_V2.red} /></g>
      <g className="cq-crane"><path d="M77 51 L92 34 L110 42" fill="none" stroke={PIRATE_V2.iron} strokeWidth="3" /><path d="M109 42 V57" stroke={PIRATE_V2.timber} strokeWidth="2" /></g>
      <g className="cq-radar"><path d="M39 59 V34" stroke={PIRATE_V2.iron} strokeWidth="3" /><ellipse cx="39" cy="31" rx="15" ry="5" fill="none" stroke={PIRATE_V2.steel} strokeWidth="2" /><path d="M24 31 H54" stroke={PIRATE_V2.steel} /></g>
      <g className="cq-diesel"><rect x="68" y="48" width="10" height="27" fill={PIRATE_V2.iron} /><path d="M71 44 Q65 35 73 29 Q84 38 78 48" fill={PIRATE_V2.soot} opacity=".65" /></g><CommonEffects />
    </PirateSpriteFrameV2>
  );
}

function HeadquartersEffects() {
  return (
    <>
      <g className="cq-surf" fill="none" stroke={PIRATE_V2.bone} strokeWidth="1.8" opacity=".62">
        <path d="M4 105 Q26 96 47 105" /><path d="M53 110 Q77 99 101 109" /><path d="M104 103 Q117 97 126 103" />
      </g>
      <g className="cq-flag" transform="translate(67 16)"><PirateFlagV2 x={0} y={0} /></g>
      <g className="cq-crane" fill="none" stroke={PIRATE_V2.iron} strokeWidth="2.8">
        <path d="M90 67 V35 L112 43" /><path d="M111 43 V61" /><path d="M107 61 H115" />
      </g>
      <g className="cq-tier-hidden"><path d="M18 74 Q64 51 111 74" fill="none" stroke={PIRATE_V2.canvas} strokeWidth="8" opacity=".22" /></g>
      <g className="cq-tier-fortified" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} strokeWidth="1.5">
        <path d="M14 83 L24 71 L34 83 Z" /><path d="M94 83 L104 71 L114 83 Z" />
      </g>
      <g className="cq-tier-stronghold" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} strokeWidth="1.5">
        <circle cx="24" cy="79" r="7" /><path d="M20 76 L5 67" strokeWidth="5" />
        <circle cx="104" cy="79" r="7" /><path d="M108 76 L123 67" strokeWidth="5" />
      </g>
      <g className="cq-defensive-fire" opacity="0">
        <path d="M7 67 L0 59 M121 67 L128 58" stroke={PIRATE_V2.bone} strokeWidth="4" />
        <circle cx="5" cy="65" r="6" fill={PIRATE_V2.fire} /><circle cx="123" cy="65" r="6" fill={PIRATE_V2.fire} />
      </g>
      <g className="cq-blockade-ring" fill="none" stroke={PIRATE_V2.signal} strokeWidth="3" strokeDasharray="6 5">
        <ellipse cx="64" cy="87" rx="57" ry="27" />
      </g>
      <g className="cq-relocation-heading" fill={PIRATE_V2.bone} stroke={PIRATE_V2.ink} strokeWidth="1.5">
        <path d="M103 22 H124 L116 14 M124 22 L116 30" fill="none" stroke={PIRATE_V2.bone} strokeWidth="4" />
      </g>
      <g className="cq-damage-1"><path d="M39 75 L46 84 L42 94" fill="none" stroke={PIRATE_V2.ink} strokeWidth="3" /></g>
      <g className="cq-damage-2"><path d="M82 71 L76 83 L85 92 L78 101" fill="none" stroke={PIRATE_V2.ink} strokeWidth="4" /><path d="M91 94 L105 105" stroke={PIRATE_V2.timberLight} strokeWidth="4" /></g>
      <g className="cq-damage-3"><path d="M58 61 Q48 45 60 35 Q72 48 65 63 Z" fill={PIRATE_V2.fire} stroke={PIRATE_V2.signal} strokeWidth="2" /><path d="M52 52 Q44 39 53 29" fill="none" stroke={PIRATE_V2.soot} strokeWidth="6" /></g>
      <g className="cq-collapse" opacity="0"><path d="M23 58 L44 91 M48 44 L72 99 M82 49 L105 96" stroke={PIRATE_V2.ink} strokeWidth="7" /><path d="M19 99 L34 111 M91 102 L110 113" stroke={PIRATE_V2.timberLight} strokeWidth="5" /></g>
    </>
  );
}

function EnclaveFoundation({ stage }) {
  if (stage === 1) return (
    <g className="cq-hidden-cove"><path d="M5 99 Q12 43 47 37 Q64 25 84 37 Q116 45 123 99 Z" fill={PIRATE_V2.soot} stroke={PIRATE_V2.ink} strokeWidth="3" /><path d="M27 92 Q34 59 64 56 Q94 59 101 92 Z" fill={PIRATE_V2.ink} /><path d="M38 91 H88 L82 101 H44 Z" fill={PIRATE_V2.timber} /><path d="M48 82 L62 68 L76 82 Z" fill={PIRATE_V2.canvas} stroke={PIRATE_V2.ink} /></g>
  );
  if (stage === 2) return (
    <g className="cq-timber-jetty"><path d="M5 101 Q17 48 47 40 Q65 30 89 43 Q115 52 123 101 Z" fill={PIRATE_V2.soot} stroke={PIRATE_V2.ink} strokeWidth="3" /><path d="M14 94 H113 L108 104 H20 Z" fill={PIRATE_V2.timber} /><path d="M29 70 H58 V94 H29 Z M68 60 H96 V94 H68 Z" fill={PIRATE_V2.timberLight} stroke={PIRATE_V2.ink} /><path d="M26 70 L43 57 L61 70 M65 60 L82 47 L100 60" fill={PIRATE_V2.canvas} stroke={PIRATE_V2.ink} strokeWidth="2" /></g>
  );
  if (stage === 3) return (
    <g className="cq-gun-cove"><path d="M4 102 Q14 47 42 39 Q64 25 89 40 Q116 49 124 102 Z" fill={PIRATE_V2.soot} stroke={PIRATE_V2.ink} strokeWidth="3" /><path d="M12 75 H116 V103 H12 Z" fill={PIRATE_V2.timberLight} stroke={PIRATE_V2.ink} strokeWidth="3" /><path d="M19 75 V60 H38 V75 M48 75 V55 H78 V75 M89 75 V60 H109 V75" fill={PIRATE_V2.canvas} stroke={PIRATE_V2.ink} strokeWidth="2" /><path d="M17 88 H111" stroke={PIRATE_V2.red} strokeWidth="5" /></g>
  );
  if (stage === 4) return (
    <g className="cq-raider-yard"><path d="M5 102 Q15 51 41 43 Q65 31 91 43 Q116 54 123 102 Z" fill={PIRATE_V2.soot} stroke={PIRATE_V2.ink} strokeWidth="3" /><path d="M10 78 H118 V104 H10 Z" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} strokeWidth="3" /><path d="M19 78 V58 H47 V78 M55 78 V49 H84 V78 M92 78 V61 H111 V78" fill={PIRATE_V2.steel} stroke={PIRATE_V2.ink} strokeWidth="2" /><path d="M27 58 V39 H38 V58" fill={PIRATE_V2.iron} /><path d="M12 92 H116" stroke={PIRATE_V2.red} strokeWidth="5" /></g>
  );
  return (
    <g className="cq-mercenary-compound"><path d="M5 102 Q16 47 45 40 Q66 28 91 41 Q116 52 123 102 Z" fill={PIRATE_V2.soot} stroke={PIRATE_V2.ink} strokeWidth="3" /><path d="M9 75 H119 V104 H9 Z" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} strokeWidth="3" /><path d="M18 75 V52 H52 V75 M60 75 V43 H92 V75 M99 75 V57 H113 V75" fill={PIRATE_V2.steel} stroke={PIRATE_V2.ink} strokeWidth="2" /><path d="M76 43 V25 M65 26 Q76 14 87 26 Q76 39 65 26 Z" fill="none" stroke={PIRATE_V2.bone} strokeWidth="2" /><circle cx="35" cy="64" r="10" fill="none" stroke={PIRATE_V2.red} strokeWidth="3" /><path d="M12 91 H116" stroke={PIRATE_V2.red} strokeWidth="5" /></g>
  );
}

function FlotillaFoundation({ stage }) {
  if (stage === 2) return (
    <g className="cq-xebec-tenders"><path d="M5 91 Q25 82 48 91 L43 102 Q25 108 10 101 Z M48 82 Q72 70 98 82 L91 98 Q69 105 51 96 Z M91 92 Q110 84 126 92 L120 103 Q105 108 94 101 Z" fill={PIRATE_V2.timber} stroke={PIRATE_V2.ink} strokeWidth="2" /><path d="M28 56 V91 M70 42 V84 M108 60 V94" stroke={PIRATE_V2.timberLight} strokeWidth="3" /><path d="M29 57 L47 68 L31 82 Z M71 44 L96 58 L73 77 Z M109 61 L124 71 L111 85 Z" fill={PIRATE_V2.canvas} stroke={PIRATE_V2.ink} /></g>
  );
  if (stage === 3) return (
    <g className="cq-frigate-depot"><path d="M7 92 Q25 83 43 92 L38 103 Q23 108 10 102 Z M37 78 Q68 64 101 78 L94 101 Q66 111 42 100 Z M94 93 Q111 85 126 93 L121 103 Q108 108 97 102 Z" fill={PIRATE_V2.timber} stroke={PIRATE_V2.ink} strokeWidth="2" /><path d="M25 62 V92 M66 30 V80 M109 63 V94" stroke={PIRATE_V2.timberLight} strokeWidth="3" /><path d="M67 32 L94 45 L90 68 L69 74 Z" fill={PIRATE_V2.canvas} stroke={PIRATE_V2.ink} /><g fill={PIRATE_V2.ink}>{[52,64,76,88].map(x => <circle key={x} cx={x} cy="86" r="2.5" />)}</g></g>
  );
  if (stage === 4) return (
    <g className="cq-steam-raiders"><path d="M6 84 H83 L77 102 Q43 110 13 102 Z M75 89 H126 L120 103 Q98 109 80 101 Z" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} strokeWidth="2" /><path d="M15 84 H73 V94 H18 Z M83 89 H120 V98 H84 Z" fill={PIRATE_V2.steel} /><ellipse cx="39" cy="78" rx="15" ry="8" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} /><path d="M28 76 L7 68" stroke={PIRATE_V2.iron} strokeWidth="6" /><rect x="57" y="48" width="12" height="36" fill={PIRATE_V2.iron} /><path d="M61 45 Q52 34 63 27 Q75 38 68 49" fill={PIRATE_V2.soot} /></g>
  );
  return (
    <g className="cq-modern-flotilla"><path d="M4 78 H105 L122 89 L108 105 Q60 113 10 103 Z" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} strokeWidth="2.5" /><path d="M13 74 H99 L112 84 L19 93 Z" fill={PIRATE_V2.steel} /><path d="M17 97 Q63 104 112 94" fill="none" stroke={PIRATE_V2.red} strokeWidth="5" /><path d="M24 70 H55 V52 H78 V75" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} /><path d="M42 51 V30 M30 31 H54" stroke={PIRATE_V2.steel} strokeWidth="3" /><ellipse cx="42" cy="29" rx="13" ry="5" fill="none" stroke={PIRATE_V2.bone} strokeWidth="2" /><path d="M88 88 L111 78 L126 87 L113 98 Z" fill={PIRATE_V2.iron} stroke={PIRATE_V2.ink} /><path d="M93 87 L116 80" stroke={PIRATE_V2.steel} strokeWidth="3" /></g>
  );
}

function PirateHeadquartersV2Sprite({ kind, stage, state = 'idle', phase }) {
  return (
    <PirateSpriteFrameV2 state={state} kind="pirate-headquarters" phase={phase} hexTint={PIRATE_V2.water}>
      <g className={`cq-headquarters-foundation cq-${kind}`} data-stage-foundation={stage}>
        {kind === 'enclave' ? <EnclaveFoundation stage={stage} /> : <FlotillaFoundation stage={stage} />}
      </g>
      <HeadquartersEffects />
    </PirateSpriteFrameV2>
  );
}

const PirateEnclaveStage1V2Sprite = props => <PirateHeadquartersV2Sprite {...props} kind="enclave" stage={1} />;
const PirateEnclaveStage2V2Sprite = props => <PirateHeadquartersV2Sprite {...props} kind="enclave" stage={2} />;
const PirateEnclaveStage3V2Sprite = props => <PirateHeadquartersV2Sprite {...props} kind="enclave" stage={3} />;
const PirateEnclaveStage4V2Sprite = props => <PirateHeadquartersV2Sprite {...props} kind="enclave" stage={4} />;
const PirateEnclaveStage5V2Sprite = props => <PirateHeadquartersV2Sprite {...props} kind="enclave" stage={5} />;
const PirateFlotillaStage2V2Sprite = props => <PirateHeadquartersV2Sprite {...props} kind="flotilla" stage={2} />;
const PirateFlotillaStage3V2Sprite = props => <PirateHeadquartersV2Sprite {...props} kind="flotilla" stage={3} />;
const PirateFlotillaStage4V2Sprite = props => <PirateHeadquartersV2Sprite {...props} kind="flotilla" stage={4} />;
const PirateFlotillaStage5V2Sprite = props => <PirateHeadquartersV2Sprite {...props} kind="flotilla" stage={5} />;

Object.assign(window, {
  PirateGalleyV2Sprite,
  PirateCorsairV2Sprite,
  PirateFrigateV2Sprite,
  PirateIroncladV2Sprite,
  PirateFastAttackCraftV2Sprite,
  PirateMothershipV2Sprite,
  PirateEnclaveStage1V2Sprite,
  PirateEnclaveStage2V2Sprite,
  PirateEnclaveStage3V2Sprite,
  PirateEnclaveStage4V2Sprite,
  PirateEnclaveStage5V2Sprite,
  PirateFlotillaStage2V2Sprite,
  PirateFlotillaStage3V2Sprite,
  PirateFlotillaStage4V2Sprite,
  PirateFlotillaStage5V2Sprite,
});
