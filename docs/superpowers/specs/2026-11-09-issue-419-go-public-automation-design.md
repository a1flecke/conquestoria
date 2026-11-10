# Go Public Automation Design

**Issue:** #419 (Shadows & Secrets)
**Decision date:** 2026-11-09
**Status:** Approved for implementation

## Context

The current Go public action is a free, always-correct button. Once an incident is confirmed and the culprit has at least one eligible major treaty partner, exposing it costs the victim nothing, cannot fail, and applies the existing `EXPOSE_SCANDAL_PENALTY` (−10) to up to four of the culprit's partners. The only way to lose the opportunity is to forget it before the response window closes at `tracedTurn + 1`.

That is a chore with an inattention trap, not a decision. The owner chose to **automate the forced response** rather than add a new alternative for now.

This spec supersedes only the Go-public action flow. It does not retune the penalty, partner cap, attribution tiers, or AI exposure timing.

## Goal

Remove the button and the response-window busywork while keeping the reveal:

- confirmed human incidents expose automatically,
- the victim still gets a clear, viewer-scoped reveal,
- the Espionage panel keeps a read-only record,
- AI behavior and the canonical executor remain unchanged.

## Non-goals

- No “Keep quiet”, private demand, reparation, or new diplomatic benefit.
- No retuning of `EXPOSE_SCANDAL_PENALTY` (−10) or `EXPOSE_SCANDAL_MAX_PARTNERS` (4).
- No new save fields or migrations.
- No retiming of AI Go public.
- No new missions, resources, or sprites/audio.
- No change to attribution (`unknown` / `suspected` / `confirmed`).

## Behavior

### Trigger

At the end of `processEspionageTurn`, for each victim:

1. Emit the existing `espionage:incident-traced` event once per newly traced incident.
2. If the victim is human, immediately call `autoExposeConfirmedIncidents(state, victimId)`, which scans the victim's ledger for every incident with `tracedTurn` set and `usedTurn` unset.
3. Process **every** eligible incident; do not stop after the first success.
4. Emit one `espionage:went-public` event for each successful exposure.
5. If the executor refuses (`no-partners`), leave the incident unresolved and continue.

Scanning the ledger rather than only the newly traced list also resolves incidents that were confirmed when they landed (evidence already present) and unused incidents in legacy saves. AI victims are not auto-exposed by this path. Their existing `applyAiGoPublic` turn-time behavior is unchanged.

### Eligibility

`goPublicAboutIncident` and `getGoPublicDenial` remain the single source of truth. Automation does not add a second legality check. It runs at evidence arrival, so the human auto path can never hit `expired` or `already-used`; the executor still re-checks and refuses safely if either somehow occurs.

### State

- `usedTurn` is set on each exposed incident exactly as today.
- Incidents with no eligible partners keep `usedTurn` unset and remain in the ledger.
- No persisted shape changes; no migration or version bump.

### Determinism

No RNG is added. Exposures follow the traced-event order, which follows the incident ledger order already used by `traceOperationIncidents`. The same state and turn must produce the same events and resulting diplomacy.

## Notifications

### `espionage:incident-traced`

Becomes a **log-only** record through `Notifier.log`:

> Your agents traced the attack on `<city>` to `<culprit>`.

It no longer tells the player to open the Espionage panel and Go public. Log-only keeps the persistent record without producing a toast that is immediately followed by the exposure toast.

### `espionage:went-public`

The reveal remains interruptive: **toast + log** for the victim, using the existing `routeWentPublic` audience contract:

- victim (actor): the exposure succeeded and how many partners were affected,
- culprit (target): their operation is exposed,
- affected partners: their relationship with the culprit has soured.

Hot-seat rules are unchanged: `Notifier.deliver` queues the reveal for a non-current human instead of showing it to the active player. The state mutation still happens immediately.

### No-partner case

No `went-public` event is emitted. The victim has the log-only trace entry, and the panel explains that no treaty partners could be swayed. No extra toast is added.

## Espionage panel

The “Caught in the Act” section becomes **read-only history**.

Each traced incident shows:

- actor name,
- mission label,
- city name,
- landed turn,
- and one resolution line:
  - `Exposed automatically on turn <usedTurn>.` when exposed,
  - `No treaty partners could be swayed.` when no exposure was possible,
  - `The moment has passed; the story is old news.` for a legacy expired record, or
  - `Automatic exposure pending.` when the incident is traced but the turn's automatic resolution has not run yet.

Removed from the panel:

- the Go-public button,
- the cost preview,
- the response-window / “last chance” copy,
- the `onGoPublic` callback and controller wiring.

The section header copy must no longer describe a player action.

## Code ownership

| Location | Change |
|---|---|
| `src/systems/espionage-counterintel.ts` | Add `autoExposeConfirmedIncidents(state, victimId)` that scans the victim's traced, unused incidents, calls `goPublicAboutIncident` for each, and returns the new state plus successful exposures. No event emission here. |
| `src/systems/espionage-turn.ts` | After emitting `incident-traced`, call the helper for human victims and emit `espionage:went-public` per success. |
| `src/ui/notification-routes/espionage-routes.ts` | Update the `incident-traced` copy; remove the “Go public” instruction. |
| `src/presentation/register-espionage-presentation.ts` | Route `incident-traced` through `ctx.notifier.log`. |
| `src/ui/espionage-panel.ts` | Read-only incident history; remove the action, preview, and window copy. |
| `src/app/controllers/espionage-panel-actions-controller.ts` | Remove `onGoPublic`, the executor call, and the denial-message import. |
| `src/systems/espionage-presentation.ts` / `espionage-counterintel.ts` | Remove `getGoPublicPreview` if no caller remains. Keep `getGoPublicDenial`, `getGoPublicExpiryTurn`, and `goPublicAboutIncident` for AI and tests. |

`applyAiGoPublic` and the AI path are untouched.

## Edge cases

- **Multiple confirmed incidents in one turn:** all are exposed; one `went-public` event each.
- **Incident already confirmed when it landed:** the ledger scan finds it even though no new `incident-traced` event fires.
- **Legacy traced incident with no `usedTurn`:** auto-exposed on the next human turn.
- **No eligible partners:** no exposure, no event, ledger record preserved; panel shows the no-partner line.
- **Already used:** executor refuses; automation continues to other incidents.
- **Eliminated victim:** skip; do not auto-expose or emit.
- **Hot-seat non-current human:** expose immediately; queue the reveal through the existing delivery contract.
- **Save/reload:** unchanged; `usedTurn` and `tracedTurn` already round-trip.
- **AI victim:** not auto-exposed by this path; `applyAiGoPublic` still runs on its turn.

## Tests

Add or update regressions proving:

1. A confirmed human incident is exposed during the same `processEspionageTurn`; `usedTurn` is set, partner relationships change by `EXPOSE_SCANDAL_PENALTY`, and one `went-public` event fires.
2. Two confirmed incidents in one turn produce two exposures and two events.
3. A confirmed incident with no eligible partners produces no exposure and no event, and the record remains.
4. An AI victim is not auto-exposed by the human path.
5. An incident confirmed at landing (no new trace event) is still auto-exposed by the ledger scan.
6. `incident-traced` is log-only and no longer contains the “Go public” instruction.
7. `went-public` still reaches the victim, culprit, and partners through the existing audience contract.
8. The panel renders the read-only resolution line (exposed, no-partners, expired, or pending) and exposes no Go-public action.
9. The removed preview/button tests are deleted rather than skipped.

## Verification

- `scripts/check-src-rule-violations.sh` for changed `src/` files.
- Mirrored focused suites for `espionage-system`, `espionage-turn` if present, panel, presentation, and routing.
- `./scripts/dev.sh build`.
- `./scripts/dev.sh verify-impact`.
- Durable full suite and status before push/merge.
- `ai-playability` only if AI production code changes; this slice should not change it.

## Rollout

One small PR. No schema change, no feature flag. If the automated reveal feels too quiet in playtests, the presentation can be promoted to a ceremony later without changing the rule.
