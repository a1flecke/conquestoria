---
name: generate-sprite-prompt
description: Generates a complete Claude Design prompt for new Conquestoria sprites. Use when the user asks to add/generate sprites for units, buildings, terrain tiles, improvement markers, or wonders — whether new types or replacements for emoji/fallback placeholders.
---

# Generate Sprite Prompt

This skill produces a ready-to-paste Claude Design prompt for one or more new Conquestoria visual assets. Follow every step — do not skip steps or combine them.

---

## Step 1 — Audit what needs sprites

Read these files to build the complete inventory of what's missing:

1. `src/renderer/sprites/sprite-catalog.ts` — find every `// fallback`, `// TBD`, or reused-sprite comment
2. `src/renderer/hex-renderer.ts` — find emoji values in `IMPROVEMENT_ICONS` and `TERRAIN_COLORS` (flat colors = no terrain tile)
3. `src/core/types.ts` — enumerate `TerrainType` and `UnitType`
4. `src/systems/city-system.ts` — enumerate `BUILDINGS` keys

Cross-reference with `docs/sprite-design-system.md` (the canonical inventory) to confirm which items are already done vs. missing.

For each missing item, record:
- **ID** — the string key used in code (e.g. `'caravan'`, `'bank'`, `'forest'`)
- **Type** — `unit | building | terrain | improvement | wonder`
- **Urgency** — player-visible and on main code path = high; behind tech gate or rare = medium

Report the inventory to the user before generating the prompt, and confirm which items to include. Do not proceed until the user confirms.

---

## Step 2 — Read the design system

Read `docs/sprite-design-system.md` in full. This gives you:
- Visual language rules (flat geometric, earthy, warm, ink line)
- Material palette (`MATERIAL_PALETTE` hex values — memorize them)
- Exact SVG contracts per type (viewBox, wrapper, required elements)
- Animation system (data-kind, data-state, CSS class names)
- GitHub reference URLs

Also read the existing sprite source files for the relevant type:
- Adding **units**: read `src/renderer/sprites/units.tsx` for style reference
- Adding **buildings**: read `src/renderer/sprites/buildings.tsx`
- Adding **terrain tiles**: read `src/renderer/hex-renderer.ts` (TERRAIN_COLORS baseline)
- Adding **improvement markers**: read the resource_outpost spec in `docs/claude-design-sprites-prompt.md`

---

## Step 3 — Categorize items and choose output format

Group items from Step 1 by type. Each type uses a different prompt part:

| Type | Prompt part | Output file |
|------|-------------|-------------|
| unit | Part A | `src/renderer/sprites/units.tsx` |
| building | Part A | `src/renderer/sprites/buildings.tsx` |
| improvement marker | Part A | `src/renderer/improvements/<name>-marker.ts` |
| terrain tile | Part B | `src/renderer/terrain/terrain-tiles.ts` |
| wonder (map sprite) | Part A (treat like building, 192×192) | `src/renderer/wonders/` |

If items span both Part A and Part B, tell the user to send them as **two separate conversations** in Claude Design.

---

## Step 4 — Write the prompt

Use the XML-structured format below. Every section is required. Fill in only what applies to the items being generated — omit sprite specs for types not being generated this session.

```
<role>
You are a senior SVG sprite artist and TypeScript developer specializing in hand-crafted game graphics. You write clean, geometric SVG — no photorealism, no gradient meshes, no blur filters. Your work integrates directly into a production codebase.
</role>

<context>
**Project**: Conquestoria — HTML5 Canvas + DOM strategy game, medieval/ancient theme (Eras 1–4), mobile-first, played by families including young children. All map graphics are inline SVG rendered to Canvas via cached HTMLImageElement.

**Audience**: Sprites appear on a hex tile map at 40–120 px. Bold, readable silhouettes. Children should recognize what each building/unit is at a glance.

**Repository**: https://github.com/a1flecke/conquestoria
</context>

<reference_files>
[Include only the files relevant to this batch. For units/buildings/improvements always include the first 4. For terrain also include hex-renderer and types.]

1. Sprite system helpers (SpriteFrame, BuildingFrame, Humanoid, Banner, Shadow, HexBase, BuildingPlinth, full MATERIAL_PALETTE):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/sprite-system.tsx

2. Existing unit sprites (read every function — internalize style and proportions):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/units.tsx

3. Existing building sprites (read every function — especially DockSprite, ForgeSprite, RanchSprite):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/buildings.tsx

4. CSS animation system (all keyframes and class hooks):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/sprite-animations-v2.css

[For terrain tiles only:]
5. Terrain colors + hex renderer context:
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/hex-renderer.ts

6. TerrainType enum:
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/core/types.ts
</reference_files>

<design_system>
[Paste the "Visual Language", "Material Palette", "Faction Color Rules", and the relevant sprite contracts from docs/sprite-design-system.md. Do not abbreviate the palette — all hex values must be present.]
</design_system>

<sprites>
[One `## SPRITE N — FooSprite (Type)` section per item. See the spec format below.]
</sprites>

<output_format>
[Specify: one TypeScript export function per sprite, the exact catalog registration line, and any new file to create. State whether to output one at a time or all at once.]
</output_format>

<style_checklist>
[Copy the relevant checklist from docs/claude-design-sprites-prompt.md. Both the unit/building checklist and the terrain checklist exist there.]
</style_checklist>
```

---

## Step 4a — Per-sprite spec format

For **each unit or building**, write a spec block with:

```markdown
## SPRITE N — FooSprite (Unit | Building)

**Insert into**: `src/renderer/sprites/units.tsx` | `buildings.tsx`, after `ExistingNearbySprite`
**Catalog entry**: `foo: withMotion('foo', FooSprite),`   OR   `foo: FooSprite,`
**data-kind**: civilian | melee | ranged | naval | hound | spy   [units only]
**category**: food | production | science | gold | culture | military | espionage   [buildings only]
**label**: "Display Name"   [buildings only]
**sub**: "Category Label"   [buildings only]

### Concept
[2–4 sentences: what this unit/building looks like, the visual narrative, the era/culture it represents.]

### Key requirements
- [6–10 specific visual requirements. Each must be actionable and reference palette constants.]
- Animated element if any: [describe which CSS class or <animate> to use and why]
- Tone: [2–3 adjectives describing the mood/feeling]
```

For **terrain tiles** (all 13 types at once or a subset):

```markdown
## TERRAIN — [TerrainType] — base color `#XXXXXX`
*[One sentence describing the terrain feel.]*

**Element vocabulary**: [list 3–5 natural elements with color values]

- **v0**: [sparse variant — describe distinguishing features]
- **v1**: [medium variant]
- **v2**: [dense/textured variant]
- **v3**: [unique sub-feature variant — e.g. twin peaks, lava river]
```

For **improvement markers**:

```markdown
## IMPROVEMENT — FooImprovementSVG

**Create file**: `src/renderer/improvements/foo-marker.ts`
**Replaces**: `'🔧'` emoji in `IMPROVEMENT_ICONS.foo`

### Concept
[What this improvement looks like as a ~32px icon.]

### Key requirements
- viewBox="0 0 48 48"
- [5–7 specific visual requirements with color values]
- No palette prop, no animation, no JSX
```

---

## Step 5 — Final checks before handing off

Before outputting the prompt, verify:

- [ ] GitHub raw URLs point to `main` branch (not a worktree branch)
- [ ] Material palette hex values match `docs/sprite-design-system.md` exactly
- [ ] Each sprite spec names the exact file to insert into and the exact catalog line
- [ ] The output format section tells Claude to output one sprite at a time (unless the user says otherwise)
- [ ] The style checklist is present and complete
- [ ] If Part B (terrain), the prompt includes the standard hex clipPath polygon and the `getTerrainTile` variation formula
- [ ] Developer instructions are written ABOVE the copyable prompt, not inside it

Output the complete prompt as a Markdown code block so the user can copy it cleanly. Then write it to `docs/claude-design-sprites-prompt.md` (append a new dated section at the bottom, or replace if this is a full refresh).
