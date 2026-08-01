# Claude Design Prompt: Conquestoria Sprites

**This file has no active prompt right now.** The last one — #759 batch 1 (v2-native animation-hook
rigging for `combat_drone`, `autonomous_frigate`, `exosuit_infantry`, `propagandist`,
`drone_controller`) — shipped 2026-08-01. All 5 are now v2-native (`isV2NativeUnit()` returns
`true`), integrated into `design/conquestoria-sprites/lib/units-v2.jsx`,
`scripts/serialize-sprites.mjs`, and `src/renderer/sprites/v2/index.ts`, and verified live via a
published Artifact against the real `sprite-animations-v2.css`.

## Durable correction (keep this, unlike the rest of this file's history)

Issue #759's original framing — "v2-native sprites have 6 hand-drawn body/armor variants per
faction" — is **wrong**, verified 2026-07-31 by reading `design/conquestoria-sprites/lib/units-v2.jsx`
directly. Every v2-native sprite, including the file's own flagship `SwordsmanV2Sprite`, uses
`faction` only to derive 4-5 fill colors on one fixed shape — the same palette-recolor pattern the
live `units.tsx` catalog already uses. **What v2-native sprites actually have that live-fallback
sprites don't is CSS-animation-hook richness**: articulated limbs (`.cq-leg-l`/`.cq-leg-r`), a
weapon/tool pivot (`.cq-weapon` with `--pivot-x`/`--pivot-y`), secondary motion (`.cq-plume`), and
state-gated effects (`.cq-hit-spark`, `.cq-muzzle-flash`, `.cq-step-dust`). Migrating a unit is a
rigging upgrade to its existing silhouette, not a redesign — keep future prompts scoped that way.

Also don't trust a fallback-tier count pasted into any past prompt as durable — it was 24 when
#759 was filed, 39 before batch 1, 34 after. Always regenerate via
`Object.keys(UNIT_SPRITE_CATALOG).filter(t => !isV2NativeUnit(t))` before scoping a new batch.

Everything else that has ever lived in this file — the original economy-sprite batch, the
terrain-tiles prompt, the naval transport sprites, the legendary beast prompt, the rail-segment
addendum, both Era 13 batches, and now #759 batch 1 — was pruned out once shipped, verified
against the actual source each time before removal. If you need the history of any of it, it's in
this file's git history; there's no reason to resurrect it here.

**When a new sprite/terrain/prompt need comes up:** use the
`.claude/skills/generate-sprite-prompt.md` skill for live-catalog (`units.tsx`/`buildings.tsx`)
sprites, or hand-write a v2-native prompt following #759 batch 1's pattern (see git history for
the exact prompt if useful as a template) for animation-hook rigging work. Append it to this file
the same way every prior prompt was — dated, scoped to the specific issue — and prune it back out
once shipped rather than leaving it to accumulate.
