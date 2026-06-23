# Tech Era Expansion — PR4: Era 8 (Nationalist Era, 1850–1900)

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 30 era-8 techs, the machine_gunner and pre_dreadnought units, 9 era-8 regular buildings, 3 national projects (world_fair, national_archives_building, imperial_general_staff), and 3 legendary wonders (eiffel-tower, brooklyn-bridge, trans-siberian-railway). Builds on PR1–PR3.

**Status (as of PR4 merge):** All tasks A–G are complete. Tests pass (273 files, 4046 total). Build clean. Remaining art/SFX polish tracked below as Task H.

---

## Task H — Art & SFX Polish (follow-up, post-merge)

All items below were introduced as TODO(art) placeholder sprites or placeholder SFX in PR4. They are functional geometric placeholders that render correctly; the task here is to replace them with polished assets.

### H1 — Unit Sprites (use `generate-sprite-prompt` skill)

| Unit | Current | Target |
|---|---|---|
| `machine_gunner` | Geometric placeholder: tripod Maxim gun, sandbag silhouette | Full art: prone gunner, detailed Maxim gun, khaki uniform, sandbag emplacement with shell casings |
| `pre_dreadnought` | Geometric placeholder: rectangular hull, twin circles for turrets | Full art: armored pre-dreadnought battleship, detailed superstructure, twin 12-inch turret barrels, tripod mast, wake foam |

**How:** Invoke `generate-sprite-prompt` skill → generate Claude Design prompt → paste output into Claude Design → download SVG → wire into `src/renderer/sprites/units.tsx`.

### H2 — Building Sprites (use `generate-sprite-prompt` skill for each)

| Building | TODO(art) comment target |
|---|---|
| `telephone_exchange` | Victorian exchange hall, rows of switchboard operators at brass panels, overhead wiring, clock on the wall |
| `labor_hall` | Brick assembly hall, large arched windows, trade-union banner over entrance, speaker's podium, workers gathering outside |
| `opera_house` | Grand neoclassical facade, wide pediment, triple arched entrance, masks-of-comedy-tragedy relief, gaslamp sconces |
| `bacteriology_lab` | Victorian laboratory interior, microscopes on benches, petri dishes, gas burners, high-arched skylight windows |
| `stock_exchange_tower` | Steel-frame skyscraper base, ticker-tape board, trading floor arched window, financiers in top hats at street level |
| `sanatorium` | Victorian public health building, wide verandahs for fresh-air patients, ornate ironwork railings, nurses in uniform, well-tended gardens |
| `power_station` | Brick turbine hall, generator drums, overhead crane, insulators on exterior, coal-hopper conveyor, chimney with red warning band |
| `exhibition_hall` | Crystal-Palace-style iron-and-glass pavilion, pennant banners, crowds of visitors, industrial machinery on display inside |

Note: `steel_foundry` has a functional art sketch already (Bessemer converter + chimney) — review whether polish is needed before replacing.

### H3 — National Project Sprites (use `generate-sprite-prompt` skill for each)

| NP | TODO(art) comment target |
|---|---|
| `world_fair` | Ornate iron-lattice grand hall, international flags, fountain plaza, exhibition towers, fireworks burst above |
| `national_archives_building` | Imposing neoclassical stone hall, Doric columns, carved frieze, archive shelves visible through tall windows, stone eagle above portico |
| `imperial_general_staff` | Severe military headquarters, iron gate, color-of-regiment flags, war-room windows with light, parade ground in foreground |

### H4 — Wonder Bespoke Assets

The three era-8 wonders use simple geometric bespoke draw functions in `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`. Replace with polished art:

| Wonder | Current | Target |
|---|---|---|
| `eiffel-tower` | Lattice pyramid with glow apex | Full iron-lattice structure, Paris skyline suggestion, Seine tint at base |
| `brooklyn-bridge` | Gothic towers + cable lines + river | Gothic stone towers with full cable fan, East River traffic, Manhattan skyline hint |
| `trans-siberian-railway` | Perspective rails + locomotive silhouette + birch trees | Detailed steam locomotive with smoke, Siberian taiga, endless track perspective |

### H5 — SFX Locomotion Classes (placeholder wiring)

`machine_gunner` and `pre_dreadnought` were assigned provisional locomotion classes:
- `machine_gunner → 'humanoid'` — reuse infantry SFX. Later: add dedicated suppressive-fire burst sound.
- `pre_dreadnought → 'naval'` — reuse naval SFX. Later: add heavy cannon salvo sound distinct from ironclad.

These are not bugs (SFX plays correctly). Dedicated sounds would improve immersion — add them when the audio curation sprint reaches era 8 (currently at MR5 era bases; war layers next per `project_audio_curation_progress.md`).

### H6 — Wonder Codex Images

All three era-8 wonder codex entries use `'image-foundry'` as placeholder `imageSourceId`. Replace with era-appropriate historical reference images when the wonder atlas image pipeline (loc-about + image-foundry) is populated:

| Wonder | imageSourceId to update |
|---|---|
| `eiffel-tower` | `image-foundry` → loc-about Eiffel Tower |
| `brooklyn-bridge` | `image-foundry` → loc-about Brooklyn Bridge |
| `trans-siberian-railway` | `image-foundry` → loc-about Trans-Siberian Railway |

---

## Global Constraints (same as PR1–PR3)

- `cost:` NOT `productionCost:` in `TRAINABLE_UNITS`
- Unit fallback icons go in `FALLBACK_ICONS` in `src/renderer/unit-visual-resolver.ts`
- Wonder `cityRequirement` is a string literal — not an object
- Wonder quest steps require `type:` from the union
- Never `Math.random()` — seeded RNG only
- `state.currentPlayer` — never hardcode `'player'`
- `textContent` / `createTextNode()` — never `innerHTML` with game data
- All NPs: `uniquePerEmpire: true`, no `cityYieldBonus`, era ceilings per game-balance.md
