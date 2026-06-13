# Claude Design Prompts — MR6 Legendary Beast Sprites

Four v2 DOM sprite prompts for the MR6 beasts. Each file is self-contained and ready to paste into a fresh Claude Design conversation.

## Workflow

1. Open the beast's `.md` file
2. Upload the four reference files listed in the developer instructions
3. Copy everything below the `---` separator and paste into Claude Design
4. Claude Design returns **two outputs**: an HTML string + a companion CSS file
5. Bring both outputs back to Claude Code and say "here is the [beast name] sprite"

## Files

| Beast | Prompt file | Output TS file | Output CSS file |
|-------|-------------|----------------|-----------------|
| Sea Serpent | `beast-sea-serpent.md` | `src/renderer/sprites/v2/beast_sea_serpent.svg.ts` | `src/assets/sea-serpent-animations.css` |
| Dune Wurm | `beast-wurm.md` | `src/renderer/sprites/v2/beast_wurm.svg.ts` | `src/assets/wurm-animations.css` |
| Storm Roc | `beast-roc.md` | `src/renderer/sprites/v2/beast_roc.svg.ts` | `src/assets/roc-animations.css` |
| Swamp Hydra | `beast-hydra.md` | `src/renderer/sprites/v2/beast_hydra.svg.ts` | `src/assets/hydra-animations.css` |

## Reference files to upload

The repo is private so raw GitHub URLs won't work. Upload these four files directly to each Claude Design conversation:

- `src/renderer/sprites/v2/beast_wolf.svg.ts` — primary v2 format reference
- `src/assets/wolf-animations.css` — companion CSS pattern
- `src/assets/sprite-animations-v2.css` — full animation class library
- `src/assets/basilisk-animations.css` — second companion CSS example

## After getting output

Once you have both the HTML string and the CSS from Claude Design, return to Claude Code and say:

> "here is the sea serpent sprite: [paste HTML string] and here is the CSS: [paste CSS]"

Claude Code will save both files, add the CSS import to `src/main.ts`, and proceed to the next beast.

After all four beasts are done, Claude Code will wire them into `src/renderer/sprites/v2/index.ts` (MR6 plan Task 0e).
