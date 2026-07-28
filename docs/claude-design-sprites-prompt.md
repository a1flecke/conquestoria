# Claude Design Prompt: Conquestoria Sprites

**This file has no active prompt right now.** The last one — Era 13 content-launch sprite
replacements (issue #652) — is fully shipped as of 2026-07-27: all 20 units/buildings have
bespoke, non-placeholder sprites, integrated across two batches (A: 5 units + 8 buildings,
2026-07-26; B: the remaining 7 buildings including all 3 national projects, 2026-07-27).
`sprite-catalog.ts` has no remaining Era 13 alias comments. See
`docs/sprite-design-system.md`'s Buildings section for the current status note.

Everything that has ever lived in this file — the original economy-sprite batch, the
terrain-tiles prompt, the naval transport sprites, the legendary beast prompt, the rail-segment
addendum, and now both Era 13 batches — was pruned out once shipped, verified against the actual
source each time before removal. If you need the history of any of it, it's in this file's git
history; there's no reason to resurrect it here.

**When a new sprite/terrain/prompt need comes up:** use the
`.claude/skills/generate-sprite-prompt.md` skill to generate it, append it to this file the same
way every prior prompt was — dated, scoped to the specific issue — and prune it back out once
shipped (matching this same cleanup) rather than leaving it to accumulate. Re-running an
already-shipped prompt against Claude Design wastes a conversation regenerating work that
exists — that happened three separate times this session (terrain, naval transport, and almost
Era 13 batch A again) before this file started getting pruned after each batch landed.
