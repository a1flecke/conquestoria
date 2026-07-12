# Playtest Bug Arc — Design & Prioritization (Issues #550–#555)

Status: approved direction (2026-07-11). Root-cause analysis posted on each issue.
This arc is planned by an analysis/planning agent; each MR is implemented by a
separate agent from its plan doc in `docs/superpowers/plans/`.

## Source Issues

| Issue | Title | Root cause (confirmed in code) |
|---|---|---|
| #550 | Sound stopped working | One-shot AudioContext gesture unlock + dual settings sources (save-embedded vs persisted) |
| #551 | Notification queue needs work | Three delivery mechanisms with emit-time `currentPlayer` attribution; `pendingEvents` never drained in solo |
| #552 | Unrest needs work | `REVOLT_UNREST_TURNS = 5`; **no building grants happiness** while notifications claim they do; resource→happiness invisible |
| #553 | Trade routes | Hidden discovery chain (tech→caravan→select→button); routes only visible in marketplace panel; single trade unit for all eras |
| #554 | Somehow I am at war | `basic-ai.ts:920` signs treaties with humans instantly via misnamed `proposeTreaty`; war declarations invisible (see #551) |
| #555 | Wonder productions blocked | Quest completion ≠ buildability; "Blocked" is a dead-end label; build requirements hidden during questing |

## MR Sequence

| MR | Plan doc | Issues | Depends on | Size |
|---|---|---|---|---|
| MR1 Audio resilience | `2026-07-11-bug-arc-mr1-audio-resilience.md` | #550 | — | S |
| MR2 Notification delivery contract | `2026-07-11-bug-arc-mr2-notification-delivery-contract.md` | #551, half of #554 | — | M |
| MR3 Diplomacy consent + war visibility | `2026-07-11-bug-arc-mr3-diplomacy-consent-war-visibility.md` | #554 | MR2 | M |
| MR4 Unrest pacing + honest happiness | `2026-07-11-bug-arc-mr4-unrest-pacing-happiness.md` | #552 | — | M |
| MR5 Wonder blocked-state actionability | `2026-07-11-bug-arc-mr5-wonder-blocked-actionability.md` | #555 | — | S |
| MR6 Trade route discoverability | `2026-07-11-bug-arc-mr6-trade-route-discoverability.md` | #553 (UX tier) | — | S |
| MR7 Era/domain trade units | `2026-07-11-bug-arc-mr7-era-trade-units.md` | #553 (content tier) | MR6 | L |

## Prioritization Rationale

1. **MR1 first**: smallest, fully independent, and "the game is silent" is the most
   immediately felt regression for every player at every age. No design risk.
2. **MR2 before MR3**: the unified per-civ delivery contract is a prerequisite —
   MR3's treaty proposals and war notices must arrive via a channel that neither
   leaks across hot-seat players nor arrives late in solo. Fixing #554's
   visibility half without MR2 would rebuild the same broken plumbing.
3. **MR3 next**: silently-signed treaties are the largest *trust* bug — the game
   changes the player's diplomatic state without consent. Highest confusion-per-
   incident in the playtest reports.
4. **MR4**: unrest is the system the playtesters actively fight every session;
   it also fixes a content-honesty violation (text promises happiness buildings
   that do not exist).
5. **MR5, MR6**: dead-end UX fixes, independent, small.
6. **MR7 last**: pure content feature with the largest wiring surface (four new
   trainable units). MR6's UX groundwork makes the new units discoverable on
   arrival.

## Cross-MR Contracts

- **One notification sink** (MR2): after MR2 merges, no listener may call
  `showNotification` for a game consequence; consequence events go through the
  per-civ delivery helper with an explicit recipient. MR3–MR7 must follow this.
- **Content honesty** (MR4, MR7): every new description string naming a mechanic
  requires a positive test asserting the mechanic (`.claude/rules/content-description-honesty.md`).
- **Trainable-unit wiring** (MR7): all six wirings per
  `.claude/rules/end-to-end-wiring.md` for each new unit.
- **Save compatibility** (all MRs): every new optional state field must tolerate
  absence in loaded saves; `migrateLegacySave` (src/main.ts) is the established
  seam for backfills. No MR may break loading a pre-arc save.
- **Inline dimension review**: each plan ends with a review across: gameplay
  balance, fun, new mechanics, ages 7–43, play styles, difficulty modes
  (explorer/standard/veteran via `OpponentChallenge`), AI usage, UI, UX,
  architecture, extensibility, data, SFX, saved-game migration, testing, solo
  regressions, hot-seat regressions, implementation correctness.

## Explicitly Out of Scope

- Player→AI treaty proposals gaining AI evaluation (accept/reject scoring) —
  today the player's own proposals also auto-sign; symmetric consent for AI
  recipients is a follow-up (noted in MR3).
- Air trade routes beyond a single late-era freighter unit (MR7 keeps air as a
  capstone, not a subsystem).
- Notification log UI redesign — MR2 fixes routing/timing only.
