# v2 Sprite Animation Rollout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the remaining 14 units and all 23 buildings to the v2 animation system, extend the comparison artboard, then deliver game-side CSS and a serialization script.

**Architecture:** v2 sprites wrap SVG bodies in `SpriteFrameV2` (injects `cq-v2` + auto-phase `--phase`) and add class hooks (`cq-leg-l/r`, `cq-arm-l/r`, `cq-cape`, `cq-weapon`, etc.) so `sprite-animations-v2.css` drives squash-stretch, articulated gait, weapon swings, and phase desync. Buildings get a `BuildingFrameV2` that adds only auto-phase — their v1 animations carry over unchanged. For the game, the CSS is copied to `src/assets/` and a Node serialize script renders each JSX sprite to a static SVG string ready for future DOM rendering.

**Tech Stack:** React JSX (design tool, `/tmp/design_handoff/conquestoria-sprites/project/lib/`), `sprite-animations-v2.css`, Node.js + JSDOM + Babel (serialize script in game repo).

---

## Pre-flight: architectural rule to memorize

Any element that receives a CSS-animated `transform` MUST NOT have an SVG `transform="..."` attribute on the same element. Always split:

```jsx
<g transform="translate(X Y)">  {/* OUTER: positions, no class */}
  <g className="cq-foo">        {/* INNER: animated, no SVG transform */}
    …paths…
  </g>
</g>
```

Exception: `.cq-weapon` sits unwrapped and uses CSS vars `--pivot-x`/`--pivot-y` with `transform-box: view-box`.

Every `*V2Sprite` function must have `phase` with **no default value** — omitting the default enables auto-desync.

---

## File map

| File | Action |
|---|---|
| `/tmp/design_handoff/…/lib/units-v2.jsx` | Modify — append 14 new `*V2Sprite` components |
| `/tmp/design_handoff/…/lib/buildings-v2.jsx` | Create — `BuildingFrameV2` + 23 building wrappers |
| `/tmp/design_handoff/…/lib/anim-compare.jsx` | Modify — add comparison sections for all new sprites |
| `/tmp/design_handoff/…/Conquestoria Animations v2.html` | Modify — add `<script>` tag for `buildings-v2.jsx` |
| `src/assets/sprite-animations-v2.css` | Create — copy from design tool |
| `scripts/serialize-sprites.mjs` | Create — Node script to render JSX → SVG strings |

---

## Task 1: Settler and Scout V2 sprites

**Pattern:** Worker (civilian, `arms="free"`, tool in `armRContent`)

**File:** `/tmp/design_handoff/conquestoria-sprites/project/lib/units-v2.jsx` (append before `Object.assign`)

- [ ] **Step 1: Append SettlerV2Sprite and ScoutV2Sprite to units-v2.jsx**

```jsx
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
          /* Walking staff. Shoulder at (0,0), hand at (0,8). Staff anchors at hand. */
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
          /* Spyglass at shoulder level (0,0) — "raised hand" pose per HANDOFF. */
          <g transform="translate(0 0) rotate(-10)">
            <rect x="0" y="-2" width="14" height="4" rx="1" fill={_P2.metal.bronze} stroke={_P2.ink.line} strokeWidth="0.6" />
            <rect x="12" y="-3" width="3" height="6" fill={_P2.metal.gold} />
          </g>
        )}
      />
    </SpriteFrameV2>
  );
}
```

- [ ] **Step 2: Lint — open `Conquestoria Animations v2.html` in browser (after Task 9 wires it up), run in devtools:**

```js
[...document.querySelectorAll('.cq-v2 [class*="cq-"]')].filter(el =>
  el.classList.toString().match(/\bcq-(leg|arm|shield|plume|cape|bowstring|hit-spark|step-dust)\b/) &&
  el.hasAttribute('transform')
)
// Expected: []
```

- [ ] **Step 3: Update `Object.assign` at the bottom of units-v2.jsx to export the new components**

Replace the existing `Object.assign(window, { SpriteFrameV2, HumanoidV2, SwordsmanV2Sprite, WorkerV2Sprite, ArcherV2Sprite, SpyOperativeV2Sprite });` with:

```js
Object.assign(window, {
  SpriteFrameV2, HumanoidV2,
  SwordsmanV2Sprite, WorkerV2Sprite, ArcherV2Sprite, SpyOperativeV2Sprite,
  SettlerV2Sprite, ScoutV2Sprite,
});
```

---

## Task 2: Musketeer V2 sprite

**Pattern:** Archer (`arms="locked"`, `.cq-weapon` with `--pivot-x/y`, `.cq-muzzle-flash` at muzzle)

**File:** `/tmp/design_handoff/conquestoria-sprites/project/lib/units-v2.jsx`

- [ ] **Step 1: Append MusketeerV2Sprite**

```jsx
/* ─────────────────────────── Musketeer (ranged, locked arms, musket) ─────────────────────────── */
/* arms="locked" — archer pattern. Musket is .cq-weapon with pivot at right shoulder.
 * .cq-muzzle-flash is the v1 hook; the v1 CSS already animates it on attack. */
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

      {/* MUSKET — .cq-weapon pivot at right shoulder (82, 55) in viewBox coords.
          Muzzle points up-right when rotate(18). Pivot matches HumanoidV2 right shoulder. */}
      <g className="cq-weapon" style={{ '--pivot-x': '82px', '--pivot-y': '55px' }}>
        <g transform="translate(82 55) rotate(18)">
          <rect x="-1" y="0" width="2" height="56" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.5" />
          <rect x="-2" y="0" width="4" height="6" fill={_P2.metal.iron} />
          <path d="M-4,52 L4,52 L3,62 L-3,62 Z" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.6" />
          <rect x="-0.5" y="0" width="1" height="2" fill={_P2.metal.shine} />
        </g>
      </g>

      {/* MUZZLE FLASH — separate wrapped group at muzzle end, uses v1 .cq-muzzle-flash hook */}
      <g transform="translate(88 33)">
        <g className="cq-muzzle-flash">
          <circle r="6" fill="#ffd966" />
          <circle r="3" fill="#fff" />
          <path d="M0,-9 L2,-3 L8,-2 L3,1 L4,7 L0,4 L-4,7 L-3,1 L-8,-2 L-2,-3 Z" fill="#ffd966" opacity="0.9" />
        </g>
      </g>

      {/* powder horn — static body attachment */}
      <ellipse cx="48" cy="76" rx="4" ry="6" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.5" />
    </SpriteFrameV2>
  );
}
```

- [ ] **Step 2: Add `MusketeerV2Sprite` to the `Object.assign` at the bottom of units-v2.jsx**

---

## Task 3: Warrior V2 sprite

**Pattern:** Swordsman (melee, custom `.cq-weapon`) but uses `HumanoidV2` with `arms="free"` + shield in `armLContent`.

**File:** `/tmp/design_handoff/conquestoria-sprites/project/lib/units-v2.jsx`

- [ ] **Step 1: Append WarriorV2Sprite**

```jsx
/* ─────────────────────────── Warrior (melee, free arms, club + round shield) ─────────────────────────── */
/* Shield goes in armLContent (swings with left arm during walk).
 * Club is .cq-weapon with pivot at right shoulder (77, 68) — HumanoidV2 cx=64
 * means right shoulder sits at approx (64+13, 70-2) = (77, 68). */
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
          /* Round shield at hand level (0, 8). Swings with left arm during walk. */
          <g transform="translate(-2 8)">
            <circle r="12" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="0.8" />
            <circle r="12" fill={f.mid} opacity="0.85" />
            <circle r="3" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.5" />
            <path d="M-9,0 L9,0 M0,-9 L0,9" stroke={f.dark} strokeWidth="1" />
          </g>
        )}
      />

      {/* CLUB/MACE — .cq-weapon exception, pivot at right shoulder (77, 68). */}
      <g className="cq-weapon" style={{ '--pivot-x': '77px', '--pivot-y': '68px' }}>
        <g transform="translate(77 68) rotate(15)">
          <rect x="-1.2" y="0" width="2.4" height="40" fill={_P2.wood.dark} stroke={_P2.ink.line} strokeWidth="0.5" />
          <path d="M-7,-6 L7,-6 L9,6 L-9,6 Z" fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.8" />
          <path d="M-7,-6 L7,-6 L7,-2 L-7,-2 Z" fill={_P2.metal.shine} opacity="0.5" />
        </g>
        {/* hit spark at weapon head */}
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
```

- [ ] **Step 2: Add `WarriorV2Sprite` to the `Object.assign`**

---

## Task 4: Pikeman V2 sprite (flagged)

**Pattern:** Swordsman custom geometry but using `HumanoidV2` with `arms="locked"`. Pike is `.cq-weapon`.

> ⚠️ **FLAG TO DESIGNER:** The attack animation uses the default overhead-slash keyframe (`cq2-attack-swing`), which is wrong for a pike thrust. A forward-thrust keyframe override is needed in `sprite-animations-v2.css` before the attack state is production-ready. Do not add the keyframe here.

**File:** `/tmp/design_handoff/conquestoria-sprites/project/lib/units-v2.jsx`

- [ ] **Step 1: Append PikemanV2Sprite**

```jsx
/* ─────────────────────────── Pikeman (melee, locked arms, pike) ─────────────────────────── */
/* FLAG: attack uses overhead-slash keyframe (wrong for a pike thrust).
 * Needs a forward-thrust keyframe override in sprite-animations-v2.css — DO NOT add it here. */
function PikemanV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
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
        arms="locked"
        hat={(
          <g>
            <path d="M-11,-33 Q-10,-44 0,-44 Q10,-44 11,-33 L11,-28 L-11,-28 Z"
              fill={_P2.metal.iron} stroke={_P2.ink.line} strokeWidth="0.8" />
            <ellipse cx="0" cy="-44" rx="6" ry="2" fill={_P2.metal.iron} />
          </g>
        )}
      />

      {/* PIKE — long shaft. Pivot at grip center (56, 56). Both hands grip the shaft.
          NOTE: will use overhead-slash on attack until forward-thrust keyframe is added. */}
      <g className="cq-weapon" style={{ '--pivot-x': '56px', '--pivot-y': '56px' }}>
        <g transform="translate(54 22) rotate(-8)">
          <rect x="-1" y="0" width="2" height="100" fill={_P2.wood.mid} stroke={_P2.ink.line} strokeWidth="0.5" />
          <path d="M-3,0 L3,0 L4,-12 L0,-18 L-4,-12 Z"
            fill={_P2.metal.steel} stroke={_P2.ink.line} strokeWidth="0.8" />
          <rect x="-3" y="-2" width="6" height="2" fill={_P2.metal.gold} />
        </g>
      </g>
    </SpriteFrameV2>
  );
}
```

- [ ] **Step 2: Add `PikemanV2Sprite` to the `Object.assign`**

---

## Task 5: Spy variants (SpyScout, SpyInformant, SpyAgent, SpyHacker, ShadowWarden)

**Pattern:** SpyOperative (cape via `.cq-cape` + `arms="free"` + gadget in `armRContent`).

**File:** `/tmp/design_handoff/conquestoria-sprites/project/lib/units-v2.jsx`

- [ ] **Step 1: Append all five spy V2 sprites**

```jsx
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
      {/* wider, darker cloak */}
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
          /* lantern hangs from hand at (0, 8) */
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
```

- [ ] **Step 2: Add all five to the `Object.assign` at the bottom of units-v2.jsx**

```js
Object.assign(window, {
  SpriteFrameV2, HumanoidV2,
  SwordsmanV2Sprite, WorkerV2Sprite, ArcherV2Sprite, SpyOperativeV2Sprite,
  SettlerV2Sprite, ScoutV2Sprite,
  MusketeerV2Sprite,
  WarriorV2Sprite,
  PikemanV2Sprite,
  SpyScoutV2Sprite, SpyInformantV2Sprite, SpyAgentV2Sprite, SpyHackerV2Sprite, ShadowWardenV2Sprite,
});
```

---

## Task 6: Quadruped sprites (ScoutHound, WarHound)

**Pattern:** No `HumanoidV2`. Legs wrapped with outer-translate + inner-group (no class hook) — they bob with the body. Auto-phase from `SpriteFrameV2` is the main benefit.

> ⚠️ **FLAG TO DESIGNER:** 4-leg articulated gait (`.cq-leg-fl/fr/bl/br`) requires new CSS. Not implemented here — legs bob with the whole body instead.

**File:** `/tmp/design_handoff/conquestoria-sprites/project/lib/units-v2.jsx`

- [ ] **Step 1: Append ScoutHoundV2Sprite and WarHoundV2Sprite**

```jsx
/* ─────────────────────────── ScoutHound (quadruped, body bob) ─────────────────────────── */
/* FLAG: articulated 4-leg gait needs .cq-leg-fl/fr/bl/br + new CSS. Not done here.
 * Legs are wrapped (outer-translate / inner-g, no class hook) — bob with cq-sprite-figure. */
function ScoutHoundV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="hound" phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="95" rx="24" ry="6" fill="#000" opacity="0.35" />
      <g transform="translate(64 72)">
        <path d="M22,-4 Q32,-12 30,-22" stroke="#7a5a3a" strokeWidth="4" fill="none" strokeLinecap="round" />
        <ellipse cx="4" cy="0" rx="22" ry="12" fill="#a07a4a" stroke={_P2.ink.line} strokeWidth="1" />
        <ellipse cx="4" cy="-3" rx="20" ry="8" fill="#b88a5a" />
        {/* legs — outer translate positions; inner <g> has no class hook */}
        <g transform="translate(-9.5 6)"><g><rect x="-2.5" y="0" width="5" height="14" fill="#7a5a3a" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(0.5 6)"><g><rect x="-2.5" y="0" width="5" height="14" fill="#7a5a3a" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(16.5 6)"><g><rect x="-2.5" y="0" width="5" height="14" fill="#7a5a3a" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(22.5 6)"><g><rect x="-2.5" y="0" width="5" height="14" fill="#7a5a3a" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
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
/* Same flag as ScoutHound — 4-leg gait needs new CSS. */
function WarHoundV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  const f = _fa2(faction);
  return (
    <SpriteFrameV2 state={state} kind="hound" phase={phase}>
      <ellipse className="cq-shadow" cx="64" cy="95" rx="26" ry="7" fill="#000" opacity="0.35" />
      <g transform="translate(64 72)">
        <path d="M22,-4 Q32,-8 28,-18" stroke="#2a1a10" strokeWidth="4" fill="none" strokeLinecap="round" />
        <ellipse cx="4" cy="0" rx="24" ry="13" fill="#3a2a1a" stroke={_P2.ink.line} strokeWidth="1" />
        <ellipse cx="4" cy="-3" rx="22" ry="9" fill="#5a3a20" />
        <rect x="-10" y="-8" width="18" height="5" fill={f.dark} stroke={_P2.ink.line} strokeWidth="0.6" />
        <polygon points="-8,-8 -6,-12 -4,-8" fill={_P2.metal.iron} />
        <polygon points="-2,-8 0,-12 2,-8" fill={_P2.metal.iron} />
        <polygon points="4,-8 6,-12 8,-8" fill={_P2.metal.iron} />
        {/* legs — wrapped, no class hook */}
        <g transform="translate(-9 6)"><g><rect x="-3" y="0" width="6" height="14" fill="#2a1a10" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(0 6)"><g><rect x="-3" y="0" width="6" height="14" fill="#2a1a10" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(16 6)"><g><rect x="-3" y="0" width="6" height="14" fill="#2a1a10" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
        <g transform="translate(23 6)"><g><rect x="-3" y="0" width="6" height="14" fill="#2a1a10" stroke={_P2.ink.line} strokeWidth="0.6" /></g></g>
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
```

- [ ] **Step 2: Add `ScoutHoundV2Sprite, WarHoundV2Sprite` to the `Object.assign`**

---

## Task 7: Naval sprites (Galley, Trireme)

**Pattern:** Copy v1 body into `SpriteFrameV2` with `kind="naval"`. Omit step-dust. Auto-phase is the sole addition. The v1 `.cq-sail` animation (from `sprite-animations.css`) carries over since both CSS files are loaded.

**File:** `/tmp/design_handoff/conquestoria-sprites/project/lib/units-v2.jsx`

- [ ] **Step 1: Append GalleyV2Sprite and TriremeV2Sprite**

```jsx
/* ─────────────────────────── Galley (naval — auto-phase only) ─────────────────────────── */
/* Step-dust omitted (N/A for ships). .cq-sail from v1 CSS carries over. */
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
```

- [ ] **Step 2: Add `GalleyV2Sprite, TriremeV2Sprite` to the `Object.assign`**

Final `Object.assign` for units-v2.jsx:

```js
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
```

---

## Task 8: Create buildings-v2.jsx

**Pattern:** `BuildingFrameV2` (auto-phase wrapper, parallel to `SpriteFrameV2`) + one `*V2Sprite` wrapper per building. Buildings get ONLY auto-phase — all existing v1 animation hooks carry over unchanged.

**File:** Create `/tmp/design_handoff/conquestoria-sprites/project/lib/buildings-v2.jsx`

- [ ] **Step 1: Write the full file**

```jsx
/* buildings-v2.jsx — v2 wrappers for all 23 building sprites.
 *
 * BuildingFrameV2 is the building equivalent of SpriteFrameV2: it adds
 * cq-v2 class + auto-phase --phase to the wrapper div. That's the ONLY
 * addition — v1 building animations (smoke, fire, glow, banners) are
 * intentional and not overridden by the v2 CSS when data-kind="building".
 *
 * Do NOT add new building class hooks without flagging to designer.
 */

function BuildingFrameV2({ state = 'idle', children }) {
  const autoPhase = React.useMemo(() => Math.random(), []);
  return (
    <div className="cq-sprite-wrap cq-v2" data-state={state} data-kind="building"
         style={{ '--phase': autoPhase }}>
      {children}
    </div>
  );
}

/* Each building wrapper: pass-through to v1 sprite, adding only auto-phase.
 * The inner v1 SpriteFrame still renders the SVG; BuildingFrameV2 wraps the
 * outer div so CSS variables and the cq-v2 class are set correctly. */

function GranaryV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><GranarySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function HerbalistV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><HerbalistSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function AqueductV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><AqueductSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function WorkshopV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><WorkshopSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ForgeV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><ForgeSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function LumbermillV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><LumbermillSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function QuarryV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><QuarrySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function LibraryV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><LibrarySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ArchiveV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><ArchiveSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ObservatoryV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><ObservatorySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function MarketplaceV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><MarketplaceSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function HarborV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><HarborSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function BarracksV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><BarracksSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function WallsV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><WallsSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function StableV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><StableSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function TempleV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><TempleSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function MonumentV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><MonumentSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function AmphitheaterV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><AmphitheaterSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ShrineV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><ShrineSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ForumV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><ForumSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function SafehouseV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><SafehouseSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function IntelAgencyV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><IntelAgencySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function SecurityBureauV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><SecurityBureauSprite faction={faction} state={state} /></BuildingFrameV2>;
}

Object.assign(window, {
  BuildingFrameV2,
  GranaryV2Sprite, HerbalistV2Sprite, AqueductV2Sprite,
  WorkshopV2Sprite, ForgeV2Sprite, LumbermillV2Sprite, QuarryV2Sprite,
  LibraryV2Sprite, ArchiveV2Sprite, ObservatoryV2Sprite,
  MarketplaceV2Sprite, HarborV2Sprite,
  BarracksV2Sprite, WallsV2Sprite, StableV2Sprite,
  TempleV2Sprite, MonumentV2Sprite, AmphitheaterV2Sprite, ShrineV2Sprite, ForumV2Sprite,
  SafehouseV2Sprite, IntelAgencyV2Sprite, SecurityBureauV2Sprite,
});
```

- [ ] **Step 2: Verify BuildingFrameV2 nesting doesn't create double-wrapper**

Open `Conquestoria Animations v2.html` after Task 9 adds the script tag. Inspect a building card in devtools:
```
Expected DOM: <div class="cq-sprite-wrap cq-v2" data-kind="building" style="--phase: 0.xxx">
                <div class="cq-sprite-wrap" data-animate="idle">  ← inner v1 wrapper
                  <svg …>…</svg>
```
The outer `BuildingFrameV2` div holds `cq-v2` + `--phase`; the inner v1 `SpriteFrame` div is unchanged. CSS selectors on `.cq-v2[data-kind="building"]` target the outer div only — no conflict.

---

## Task 9: Extend anim-compare.jsx + update HTML

**Files:**
- Modify `/tmp/design_handoff/conquestoria-sprites/project/lib/anim-compare.jsx`
- Modify `/tmp/design_handoff/conquestoria-sprites/project/Conquestoria Animations v2.html`

### 9a: Add destructured imports to anim-compare.jsx

- [ ] **Step 1: Update the imports block at the top of anim-compare.jsx**

Replace the existing destructure block:
```js
const { SPRITE: _SP, PALETTE_NAMES: _PN,
  SwordsmanSprite, SwordsmanV2Sprite,
  WorkerSprite, WorkerV2Sprite,
  ArcherSprite, ArcherV2Sprite,
  SpyOperativeSprite, SpyOperativeV2Sprite,
} = window;
```

With:
```js
const { SPRITE: _SP, PALETTE_NAMES: _PN,
  SwordsmanSprite, SwordsmanV2Sprite,
  WorkerSprite, WorkerV2Sprite,
  ArcherSprite, ArcherV2Sprite,
  SpyOperativeSprite, SpyOperativeV2Sprite,
  SettlerSprite, SettlerV2Sprite,
  ScoutSprite, ScoutV2Sprite,
  MusketeerSprite, MusketeerV2Sprite,
  WarriorSprite, WarriorV2Sprite,
  PikemanSprite, PikemanV2Sprite,
  SpyScoutSprite, SpyScoutV2Sprite,
  SpyInformantSprite, SpyInformantV2Sprite,
  SpyAgentSprite, SpyAgentV2Sprite,
  SpyHackerSprite, SpyHackerV2Sprite,
  ShadowWardenSprite, ShadowWardenV2Sprite,
  ScoutHoundSprite, ScoutHoundV2Sprite,
  WarHoundSprite, WarHoundV2Sprite,
  GalleySprite, GalleyV2Sprite,
  TriremeSprite, TriremeV2Sprite,
} = window;
```

### 9b: Add new comparison sections inside `AnimCompareApp`

- [ ] **Step 2: Inside `AnimCompareApp`'s `<_DC>` block, append new `<_DCS>` sections after the canaries section**

```jsx
<_DCS id="civilian-units" title="Civilian units — Settler · Scout">
  <_DCA id="settler" label="Settler · civilian · arms='free' + staff" width={520} height={320}>
    <ComparePair faction={faction}
      Variants={[SettlerSprite, SettlerV2Sprite]}
      initialState="walk" states={CIVILIAN_STATES} label="Settler" />
  </_DCA>
  <_DCA id="scout" label="Scout · civilian · arms='free' + spyglass at shoulder" width={520} height={320}>
    <ComparePair faction={faction}
      Variants={[ScoutSprite, ScoutV2Sprite]}
      initialState="walk" states={CIVILIAN_STATES} label="Scout" />
  </_DCA>
</_DCS>

<_DCS id="ranged-units" title="Ranged units — Musketeer">
  <_DCA id="musketeer" label="Musketeer · ranged · arms='locked' + musket + muzzle flash" width={520} height={320}>
    <ComparePair faction={faction}
      Variants={[MusketeerSprite, MusketeerV2Sprite]}
      initialState="attack" label="Musketeer" />
  </_DCA>
</_DCS>

<_DCS id="melee-units" title="Melee units — Warrior · Pikeman">
  <_DCA id="warrior" label="Warrior · melee · arms='free' + club + shield in armLContent" width={520} height={320}>
    <ComparePair faction={faction}
      Variants={[WarriorSprite, WarriorV2Sprite]}
      initialState="attack" label="Warrior" />
  </_DCA>
  <_DCA id="pikeman" label="Pikeman · melee · arms='locked' + pike (⚠ attack keyframe flagged)" width={520} height={320}>
    <ComparePair faction={faction}
      Variants={[PikemanSprite, PikemanV2Sprite]}
      initialState="idle" label="Pikeman" />
  </_DCA>
</_DCS>

<_DCS id="spy-units" title="Spy units — all 5 + ShadowWarden">
  <_DCA id="spy-scout" label="SpyScout · cape + monocular" width={520} height={320}>
    <ComparePair faction={faction}
      Variants={[SpyScoutSprite, SpyScoutV2Sprite]}
      initialState="walk" states={CIVILIAN_STATES} label="SpyScout" />
  </_DCA>
  <_DCA id="spy-informant" label="SpyInformant · cape + newspaper" width={520} height={320}>
    <ComparePair faction={faction}
      Variants={[SpyInformantSprite, SpyInformantV2Sprite]}
      initialState="walk" states={CIVILIAN_STATES} label="SpyInformant" />
  </_DCA>
  <_DCA id="spy-agent" label="SpyAgent · cape + radio" width={520} height={320}>
    <ComparePair faction={faction}
      Variants={[SpyAgentSprite, SpyAgentV2Sprite]}
      initialState="walk" states={CIVILIAN_STATES} label="SpyAgent" />
  </_DCA>
  <_DCA id="spy-hacker" label="SpyHacker · cape + terminal" width={520} height={320}>
    <ComparePair faction={faction}
      Variants={[SpyHackerSprite, SpyHackerV2Sprite]}
      initialState="walk" states={CIVILIAN_STATES} label="SpyHacker" />
  </_DCA>
  <_DCA id="shadow-warden" label="ShadowWarden · wide cape + lantern + arms='free'" width={520} height={320}>
    <ComparePair faction={faction}
      Variants={[ShadowWardenSprite, ShadowWardenV2Sprite]}
      initialState="walk" states={CIVILIAN_STATES} label="ShadowWarden" />
  </_DCA>
</_DCS>

<_DCS id="hound-units" title="Quadrupeds — ScoutHound · WarHound (⚠ 4-leg gait flagged)">
  <_DCA id="scout-hound" label="ScoutHound · hound · body bob (4-leg gait CSS pending)" width={520} height={320}>
    <ComparePair faction={faction}
      Variants={[ScoutHoundSprite, ScoutHoundV2Sprite]}
      initialState="idle" states={['idle','walk']} label="ScoutHound" />
  </_DCA>
  <_DCA id="war-hound" label="WarHound · hound · body bob" width={520} height={320}>
    <ComparePair faction={faction}
      Variants={[WarHoundSprite, WarHoundV2Sprite]}
      initialState="idle" states={['idle','walk']} label="WarHound" />
  </_DCA>
</_DCS>

<_DCS id="naval-units" title="Naval — Galley · Trireme (auto-phase only)">
  <_DCA id="galley" label="Galley · naval · auto-phase + v1 sail animation" width={520} height={320}>
    <ComparePair faction={faction}
      Variants={[GalleySprite, GalleyV2Sprite]}
      initialState="idle" states={['idle']} label="Galley" />
  </_DCA>
  <_DCA id="trireme" label="Trireme · naval · auto-phase + v1 sail animation" width={520} height={320}>
    <ComparePair faction={faction}
      Variants={[TriremeSprite, TriremeV2Sprite]}
      initialState="idle" states={['idle']} label="Trireme" />
  </_DCA>
</_DCS>
```

### 9c: Update HTML to load buildings-v2.jsx

- [ ] **Step 3: In `Conquestoria Animations v2.html`, add `buildings-v2.jsx` script tag after `buildings.jsx`**

```html
  <script type="text/babel" src="lib/buildings.jsx"></script>
  <script type="text/babel" src="lib/buildings-v2.jsx"></script>  ← add this line
```

- [ ] **Step 4: Final browser lint — open the HTML, run in devtools**

```js
// Should return [] — any results are bugs (element with class hook also has SVG transform)
[...document.querySelectorAll('.cq-v2 [class*="cq-"]')].filter(el =>
  el.classList.toString().match(/\bcq-(leg|arm|shield|plume|cape|bowstring|hit-spark|step-dust)\b/) &&
  el.hasAttribute('transform')
)

// All values should be numeric strings in (0, 1), none "0"
[...document.querySelectorAll('.cq-v2')].map(el => el.style.getPropertyValue('--phase'))
```

---

## Task 10: Game-side CSS and serialization script

**Files:**
- Create `src/assets/sprite-animations-v2.css` in the game repo
- Create `scripts/serialize-sprites.mjs` in the game repo

### 10a: Copy CSS to game assets

- [ ] **Step 1: Copy `/tmp/design_handoff/conquestoria-sprites/project/lib/sprite-animations-v2.css` to `src/assets/sprite-animations-v2.css`**

```bash
cp /tmp/design_handoff/conquestoria-sprites/project/lib/sprite-animations-v2.css \
   src/assets/sprite-animations-v2.css
```

- [ ] **Step 2: Verify the file exists and is non-empty**

```bash
wc -l src/assets/sprite-animations-v2.css
# Expected: ~230 lines
```

### 10b: Write the serialization script

The script renders each v2 sprite JSX component to a static SVG string using JSDOM + Babel + React's `renderToStaticMarkup`. Output files go to `src/renderer/sprites/v2/` as `export const svg = '…';` modules. These SVG strings contain all v2 class hooks and are ready for DOM insertion (not canvas rasterization — CSS animations require live DOM elements).

- [ ] **Step 3: Create `scripts/serialize-sprites.mjs`**

```js
#!/usr/bin/env node
/**
 * serialize-sprites.mjs — render v2 JSX sprites to static SVG strings.
 *
 * Usage: node scripts/serialize-sprites.mjs
 *
 * Output: src/renderer/sprites/v2/<name>.svg.ts
 *   export const svg = '<svg …>…</svg>';
 *
 * NOTE: These SVG strings contain cq-v2 class hooks for CSS animation.
 * To animate them in the game, insert as live DOM SVG elements (not canvas
 * rasterization) and include src/assets/sprite-animations-v2.css. Set:
 *   wrapper.classList.add('cq-v2');
 *   wrapper.style.setProperty('--phase', String(Math.random()));
 *   svg.dataset.state = 'idle' | 'walk' | 'attack' | 'hurt' | 'death';
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Dependencies (must be installed: jsdom, @babel/core, @babel/preset-react, react, react-dom/server)
// Run: yarn add -D jsdom @babel/core @babel/preset-react react react-dom
const { JSDOM } = require('jsdom');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const DESIGN_ROOT = resolve(__dirname, '../../../design_handoff/conquestoria-sprites/project/lib');
const OUT_DIR = resolve(__dirname, '../src/renderer/sprites/v2');

mkdirSync(OUT_DIR, { recursive: true });

// Build a minimal browser-like global environment so the JSX files can use window.*
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.React = React;

function loadJsx(file) {
  const src = readFileSync(resolve(DESIGN_ROOT, file), 'utf8');
  const { code } = babel.transformSync(src, {
    presets: [['@babel/preset-react', { runtime: 'classic' }]],
    filename: file,
  });
  // eslint-disable-next-line no-new-func
  new Function('React', 'window', code)(React, global.window);
}

// Load in dependency order — sprite-system must come before units-v2
const jsxFiles = [
  '../../../design_handoff/conquestoria-sprites/project/lib/sprite-system.jsx',
  '../../../design_handoff/conquestoria-sprites/project/lib/units.jsx',
  '../../../design_handoff/conquestoria-sprites/project/lib/buildings.jsx',
  '../../../design_handoff/conquestoria-sprites/project/lib/units-v2.jsx',
  '../../../design_handoff/conquestoria-sprites/project/lib/buildings-v2.jsx',
];

// sprite-system.jsx and others use window.SPRITE — seed that before loading
global.window.SPRITE = { PALETTE: {} }; // will be filled by sprite-system.jsx itself

for (const f of jsxFiles) {
  const src = readFileSync(resolve(__dirname, f), 'utf8');
  const { code } = babel.transformSync(src, {
    presets: [['@babel/preset-react', { runtime: 'classic' }]],
    filename: f,
  });
  // eslint-disable-next-line no-new-func
  new Function('React', 'window', code)(React, global.window);
}

const FACTIONS = ['imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate'];

const UNIT_SPRITES = [
  ['settler',       'SettlerV2Sprite'],
  ['worker',        'WorkerV2Sprite'],
  ['scout',         'ScoutV2Sprite'],
  ['scout_hound',   'ScoutHoundV2Sprite'],
  ['war_hound',     'WarHoundV2Sprite'],
  ['shadow_warden', 'ShadowWardenV2Sprite'],
  ['warrior',       'WarriorV2Sprite'],
  ['swordsman',     'SwordsmanV2Sprite'],
  ['pikeman',       'PikemanV2Sprite'],
  ['archer',        'ArcherV2Sprite'],
  ['musketeer',     'MusketeerV2Sprite'],
  ['galley',        'GalleyV2Sprite'],
  ['trireme',       'TriremeV2Sprite'],
  ['spy_scout',     'SpyScoutV2Sprite'],
  ['spy_informant', 'SpyInformantV2Sprite'],
  ['spy_agent',     'SpyAgentV2Sprite'],
  ['spy_operative', 'SpyOperativeV2Sprite'],
  ['spy_hacker',    'SpyHackerV2Sprite'],
];

const BUILDING_SPRITES = [
  ['granary',             'GranaryV2Sprite'],
  ['herbalist',           'HerbalistV2Sprite'],
  ['aqueduct',            'AqueductV2Sprite'],
  ['workshop',            'WorkshopV2Sprite'],
  ['forge',               'ForgeV2Sprite'],
  ['lumbermill',          'LumbermillV2Sprite'],
  ['quarry-building',     'QuarryV2Sprite'],
  ['library',             'LibraryV2Sprite'],
  ['archive',             'ArchiveV2Sprite'],
  ['observatory',         'ObservatoryV2Sprite'],
  ['marketplace',         'MarketplaceV2Sprite'],
  ['harbor',              'HarborV2Sprite'],
  ['barracks',            'BarracksV2Sprite'],
  ['walls',               'WallsV2Sprite'],
  ['stable',              'StableV2Sprite'],
  ['temple',              'TempleV2Sprite'],
  ['monument',            'MonumentV2Sprite'],
  ['amphitheater',        'AmphitheaterV2Sprite'],
  ['shrine',              'ShrineV2Sprite'],
  ['forum',               'ForumV2Sprite'],
  ['safehouse',           'SafehouseV2Sprite'],
  ['intelligence-agency', 'IntelAgencyV2Sprite'],
  ['security-bureau',     'SecurityBureauV2Sprite'],
];

let written = 0;

for (const [id, ComponentName] of UNIT_SPRITES) {
  const Component = global.window[ComponentName];
  if (!Component) { console.warn(`SKIP ${ComponentName} — not found on window`); continue; }

  // Render once per faction for idle state (state driven at runtime via data-state)
  const byFaction = {};
  for (const faction of FACTIONS) {
    byFaction[faction] = renderToStaticMarkup(
      React.createElement(Component, { faction, state: 'idle', phase: 0 }),
    );
  }

  const outPath = resolve(OUT_DIR, `${id}.svg.ts`);
  const lines = [
    `// Auto-generated by scripts/serialize-sprites.mjs — do not edit.`,
    `// Animate at runtime: set data-state on the inner SVG, cq-v2 on the wrapper div, --phase CSS var.`,
    `export const svg: Record<string, string> = {`,
    ...FACTIONS.map(f => `  ${f}: ${JSON.stringify(byFaction[f])},`),
    `};`,
  ];
  writeFileSync(outPath, lines.join('\n') + '\n');
  written++;
}

for (const [id, ComponentName] of BUILDING_SPRITES) {
  const Component = global.window[ComponentName];
  if (!Component) { console.warn(`SKIP ${ComponentName} — not found on window`); continue; }

  const byFaction = {};
  for (const faction of FACTIONS) {
    byFaction[faction] = renderToStaticMarkup(
      React.createElement(Component, { faction, state: 'idle' }),
    );
  }

  const outPath = resolve(OUT_DIR, `${id}.svg.ts`);
  const lines = [
    `// Auto-generated by scripts/serialize-sprites.mjs — do not edit.`,
    `export const svg: Record<string, string> = {`,
    ...FACTIONS.map(f => `  ${f}: ${JSON.stringify(byFaction[f])},`),
    `};`,
  ];
  writeFileSync(outPath, lines.join('\n') + '\n');
  written++;
}

console.log(`✓ Wrote ${written} sprite files to src/renderer/sprites/v2/`);
```

- [ ] **Step 4: Install script dependencies (dev-only)**

```bash
bash scripts/run-with-mise.sh yarn add -D jsdom @babel/core @babel/preset-react react react-dom
```

- [ ] **Step 5: Run the serialize script and verify output**

```bash
node scripts/serialize-sprites.mjs
# Expected output: ✓ Wrote 41 sprite files to src/renderer/sprites/v2/
ls src/renderer/sprites/v2/ | head -5
# Expected: archer.svg.ts, aqueduct.svg.ts, barracks.svg.ts, ...
```

---

## Task 11: Commit

- [ ] **Step 1: Run full test suite to ensure no regressions**

```bash
bash scripts/run-with-mise.sh yarn test
# Expected: all tests pass
bash scripts/run-with-mise.sh yarn build
# Expected: exits 0 (TypeScript type-check passes)
```

- [ ] **Step 2: Commit**

```bash
git add \
  src/assets/sprite-animations-v2.css \
  scripts/serialize-sprites.mjs \
  src/renderer/sprites/v2/ \
  docs/superpowers/plans/2026-05-17-v2-sprite-rollout/
git commit -m "feat: v2 sprite animation rollout — 18 units + 23 buildings ported

Ports all remaining unit sprites and all buildings to the v2 animation
system defined in the HANDOFF. Design tool files (units-v2.jsx,
buildings-v2.jsx, anim-compare.jsx) add class hooks for CSS-driven
squash-stretch, gait articulation, cape sway, and phase desync.

Game-side deliverables:
- src/assets/sprite-animations-v2.css (copy from design tool)
- scripts/serialize-sprites.mjs (renders JSX → SVG strings for DOM use)
- src/renderer/sprites/v2/*.svg.ts (auto-generated, do not edit)

Flagged to designer: PikemanV2 needs a forward-thrust attack keyframe;
quadrupeds need .cq-leg-fl/fr/bl/br CSS for 4-leg gait.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Known flags for designer follow-up

| Unit | Issue |
|---|---|
| PikemanV2 | Attack state uses overhead-slash keyframe (wrong). Needs a `cq2-attack-pike-thrust` keyframe + selector in `sprite-animations-v2.css`. |
| ScoutHoundV2, WarHoundV2 | 4-leg gait needs `.cq-leg-fl/fr/bl/br` class hooks + new CSS keyframes. Currently just body bob. |

---

## Self-review

**Spec coverage:**
- ✅ Settler, Scout (Worker pattern)
- ✅ Musketeer (Archer pattern)
- ✅ Warrior (melee + free arms + shield in armLContent)
- ✅ Pikeman (flagged attack keyframe)
- ✅ SpyScout, SpyInformant, SpyAgent, SpyHacker (SpyOperative pattern)
- ✅ ShadowWarden (wide cape + lantern)
- ✅ ScoutHound, WarHound (quadrupeds, body bob, gait flagged)
- ✅ Galley, Trireme (auto-phase only)
- ✅ buildings-v2.jsx with all 23 buildings
- ✅ anim-compare.jsx extended
- ✅ HTML updated
- ✅ sprite-animations-v2.css copied to game
- ✅ serialize-sprites.mjs created
- ⚠️ Game DOM rendering integration (CSS animations require live DOM SVG elements, not canvas rasterization) — out of scope per HANDOFF "serialize for the game" framing; the SVG files + CSS are ready when the renderer adds a DOM overlay layer

**Placeholder scan:** No TBDs or "similar to above" references — every task has complete code.

**Type consistency:** `phase` has no default in every `*V2Sprite` function signature.
