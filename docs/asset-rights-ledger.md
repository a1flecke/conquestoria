# Asset Rights Ledger

What the project knows, and does not know, about the right to use each family of third-party and AI-generated asset. This is a
**documentation record, not legal advice**. It exists so that the gaps are written down in one place instead of living in chat
history and issue comments.

Reviewed 2026-10-16 by the owner-directed rights review for #889. Terms were read at the addresses below on that date; nothing was
purchased and no vendor was contacted.

## Release posture (owner decision, 2026-10-16)

**Conquestoria is a non-commercial hobby game.** On that basis the owner accepted the current state of the records below.

- Ownership of AI output is, per the terms read, with the user (Sprite-AI) or the user may "use, reproduce, and distribute" it
  (SpriteCook), or the output has no copyright owner (DeepAI). None of that is a problem for a non-commercial game.
- The paid-plan commercial licences (Sprite-AI) and the commercial-use statements (DeepAI, OpenAI) only matter **if the game is ever
  sold, monetised, or released as a commercial product**. They were not verified here.
- **This posture is a hold on commercial release, not a clearance for it.** Before any commercial release, work through the
  checklist at the end of this file.

## Ledger

Counts are checked against the provenance records by `tests/systems/asset-rights-ledger.test.ts`; update this table when a family
changes.

| Family | Count | Where recorded | Determination |
|---|---|---|---|
| Sprite-AI (units + wonder art) | 20 | `design/png-sprites/sources/*.provenance.json`, `design/wonder-art/*.provenance.json` | Missing documentation |
| SpriteCook (units) | 3 | `design/png-sprites/sources/*.provenance.json` | Sufficient evidence recorded |
| DeepAI (General portraits) | 25 | `design/general-portraits/*.provenance.json` | Permission unresolved |
| ChatGPT image generation (General portrait) | 1 | `design/general-portraits/gen_oreius.provenance.json` | Missing documentation |
| Public-domain artwork (General portraits) | 8 | `design/general-portraits/*.provenance.json` | Sufficient evidence recorded |
| Kenney CC0 and credited audio | not counted here | `AUDIO-CREDITS.md`, `src/audio/*-audio-sources.ts` | Sufficient where reviewed; not re-audited here |
| Wonder codex photographs and video | not counted here | `docs/wonder-codex-source-ledger.md` (test-enforced) | Sufficient where reviewed; not re-audited here |
| Roster character names from copyrighted works | n/a | `src/systems/great-general-definitions.ts`, `great-general-profiles.ts` | Permission unresolved |

Determinations used: *sufficient evidence recorded*, *missing documentation*, *permission unresolved*, *replacement required*,
*owner-approved restriction or release hold*. Nothing is currently *replacement required*.

## Family notes

### Sprite-AI (20 assets: 7 unit sprites, 13 wonder illustrations)

- Terms: https://www.sprite-ai.art/terms (read 2026-10-16). "You retain ownership of the sprites you generate." Paid plans include a
  commercial licence; the terms do not say what free-tier output receives. The licence is tied to generating on a paid plan and
  survives cancellation, so a later upgrade is **not** assumed to cover earlier output. No licence from the user to Sprite-AI is
  described. The operator is identified only as "Sprite AI" with no entity or address.
- Recorded: generation id, prompt, settings, date, owner approval. The wonder records note that the owner said their plan allows use;
  the unit records say the terms text was not reviewed.
- **Missing:** which plan tier each asset was generated under, and a snapshot of the terms at the time.
- Non-commercial use: ownership is retained either way.

### SpriteCook (3 unit sprites)

- Terms: https://spritecook.ai/terms (read 2026-10-16). Users "may use, reproduce, and distribute outputs you generate", subject to
  the terms and applicable law. The terms do not assign ownership and do not distinguish commercial from non-commercial use or tie
  rights to a plan. Outputs may be similar to others'. Users grant SpriteCook a licence to process and store their content. The
  operator is a Dutch sole proprietorship.
- Recorded: asset id, model, prompt, settings, date, owner confirmation.
- A saved copy of the terms would strengthen the record; not required for non-commercial use.

### DeepAI (25 General portraits)

- Terms: the written terms returned 404 at https://deepai.org/terms and https://deepai.org/terms-of-service on 2026-10-16 (and on
  2026-10-15). The product FAQ (https://deepai.org/machine-learning-model/3d-character-generator) says commercial use is permitted
  and that generated images are public domain with no owner. **Consequence: the project cannot claim exclusivity over these
  portraits; anyone may copy them.**
- Recorded: prompt (naming no existing character or person), date, original and output SHA-256, scan result.
- **Unresolved:** the written terms have never been read.

### ChatGPT image generation (1 General portrait: Oreius)

- Generated by the owner on a paid ChatGPT plan (owner's statement). OpenAI's current terms were **not** reviewed. The provenance
  record notes the generator may embed provenance metadata (for example C2PA); the portrait tool re-encodes from decoded pixels and
  ships none of it.
- **Missing:** the plan record and a terms snapshot; the owner keeps the account record.

### Public-domain portraits (8 General portraits)

- Wikimedia Commons file pages are recorded per image with licence "Public domain" (never share-alike). Verified at intake, not
  re-verified since. Many were painted long after the subject lived: they are illustrations, not verified likenesses.

### Roster character names

- Some General names and descriptions come from copyrighted works (for example Tolkien's characters, Oreius from the Narnia film,
  Okoye from Marvel). Images for them are generated from type descriptions that name no character, but **the names and brief
  descriptions are used**. For a non-commercial family game the risk appears low; it is nevertheless a separate, unresolved
  question from the art. See `.claude/rules/great-general-content.md` for how lore entries are written.

## Before any commercial release

A checklist, not a clearance. Do all of it, in order:

1. Re-read the **current** terms for every AI generator above (Sprite-AI, SpriteCook, DeepAI, OpenAI) and save a dated copy.
2. For each Sprite-AI asset, establish the plan under which it was generated. If it was free-tier, decide: regenerate under a paid
   plan, replace, or obtain written confirmation from the vendor. Do not assume a later subscription covers earlier output.
3. Decide how to treat DeepAI output, which carries no exclusivity: keep, or replace the portraits that matter most.
4. Review the roster names taken from copyrighted works and decide whether to keep, rename or replace them.
5. Re-audit audio credits and the wonder codex source ledger.
6. Update this ledger and the per-asset provenance records, and record the owner's release decision.
