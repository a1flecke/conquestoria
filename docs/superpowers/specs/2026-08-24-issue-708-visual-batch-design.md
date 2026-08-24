# Issue 708 Grounded-Mythic Mounted and Beast Visual Batch Design

## Goal

Replace the draft batch's placeholder-like mounted and beast art with readable, grounded-mythic native v2 sprites, and repair the body-plan animation contract that currently leaves horse legs inert.

## Scope

Only the live aliases still owned by issue 708 change: `beast_handler`, `war_elephant`, and `cuirassier`. Chariot and Cavalry are not part of this batch. Gameplay definitions, AI, difficulty, persistence, save migration, hot-seat rules, SFX registration, and player actions remain unchanged.

## Art direction

The approved direction is grounded mythic: earthy geometric forms, `#1f1a14` ink outlines, right-facing 2.5D silhouettes, and palette-derived faction identity. Magic is a small, legible accent rather than a blur or a screen-filling effect.

| Unit | Required silhouette | Fantasy cue | Readability cue |
| --- | --- | --- | --- |
| Beast Handler Company | Foot handler controlling a large war-beast | glowing rune collar and leash sigil | staff + paired handler/beast silhouette |
| War Elephant Corps | massive elephant with tusks, plated head, howdah, and crew | rune-standard and etched harness plates | trunk/tusks + tall howdah above a wide body |
| Cuirassier | armored horse, breastplate rider, high boots, and sabre | moon-steel inlay on plate and sabre | horse-and-rider silhouette with a long bright sabre |

At 40px each unit must read from its outer shape before its detail: handler/beast pair, elephant/howdah, and horse/sabre rider respectively. Faction colours use `_fa2(faction)` only; materials use `_P2` only.

## Animation contract

Add a supported `animal` body plan to `SpriteFrameV2` and `sprite-animations-v2.css`. It owns four diagonal-pair leg hooks (`cq-leg-fl`, `cq-leg-fr`, `cq-leg-bl`, `cq-leg-br`), a mounted body bob, and an attack lunge. It is distinct from `hound`: cadence, bob depth, and lunge distance are set by `data-kind-variant` rather than pretending a horse or elephant is a dog.

`beast_handler` uses the existing hound plan because its animated subject is a war-beast. `war_elephant` and `cuirassier` use `animal`, with `elephant` and `mount` variants. Their rider, harness, banner, and howdah stay inside the animated figure so they follow the animal motion. Cuirassier also uses the existing `cq-weapon` pivot and `cq-hit-spark`; the animal attack selector must animate that weapon rather than relying on melee-only rules. Handler uses an explicit command-sigil hook; elephant uses a trunk/tusk charge accent.

Every state remains meaningful with reduced motion: idle/walk/attack motion is suppressed, while the static rune, weapon, tusks, selection, health, and damage information remain visible. Hurt and death preserve the shared overlay state behavior.

## Delivery and visual proof

Replace the prior silhouette-only board with reproducible, committed review images generated from the serialized native SVGs. The Markdown board shows each final sprite at 40px, 64px, and 128px in idle, walk, attack, hurt, death, and reduced-motion states. It includes a design-system checklist and calls out the exact unit-identification cue; it does not make claims about gameplay, AI, saves, or SFX because those systems are unchanged.

## Acceptance criteria

- Tests first prove the current mounted contract is invalid: horse legs are supplied but no mounted body plan claims them.
- Tests prove `animal` supports `mount` and `elephant` variants, controls all four leg hooks, and drives an animal attack action and Cuirassier weapon action.
- Tests prove all three sprites resolve natively across every faction and contain their required visual/state hooks.
- The review board is generated from final serialized source rather than hand-drawn proxy art.
- Existing sprite overlay selection, health, fog, minor-civilization fallback, and reduced-motion behavior remain intact.
- No game-state, balance, AI, save, SFX, or UI-action files change.
