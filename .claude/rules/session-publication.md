---
paths:
  - "src/app/**"
  - "src/main.ts"
  - "src/presentation/**"
---

# Session Publication (#1015)

`GameSession` (`src/app/ports.ts`) owns the one game state. **Publishing** — telling the
renderer, HUD and any open panel that the state changed — is the session's job, not the
caller's. Before #1015 a handler had to remember to write the state silently *and then*
push it to the renderer and HUD by hand; 68 call sites did, inconsistently (even inside one
controller some used `commit()` and some used the silent write), and the ones that forgot
left the player looking at stale data.

## The API

| Member | Meaning |
|---|---|
| `commit(next)` / `update(fn)` | Replace the state and publish, synchronously, to every subscriber. The default for every write. |
| `batch(fn)` | Several writes, **one** publication of the final state when the outermost batch returns (or throws). State is visible to `getState()` immediately. Wrap the whole synchronous body and `return` through it; do not `await` inside. |
| `subscribe(listener)` | Registered once in `bootstrap.ts`: the renderer, then the HUD. A controller never re-implements this. |
| `unpublished.adopt(next, reason)` | The only silent write. **Not on `GameSession`** — it lives on the wider `GameSessionHandle` that only `main.ts`/`bootstrap.ts` hold and hand to named owners. |

`setStateWithoutRefresh` no longer exists.

## The four legitimate silent reasons (`UnpublishedReason`)

| Reason | Owner | Why publishing would be wrong |
|---|---|---|
| `pre-world-entry` | `campaign-entry-controller.ts` | State is installed before the renderer/HUD/panels exist for it; `startGame()` publishes. |
| `viewer-not-yet-revealed` | `campaign-entry-controller.ts`, `turn-flow-controller.ts` | Hot-seat handoff. The next player's fog, yields and units must not flash through the renderer/HUD while the previous viewer still sees the screen. `enterViewerTurn` publishes on reveal. |
| `presentation-deferred` | `turn-flow-controller.ts` | The solo end-turn round is adopted before the AI moves are captured for replay; the caller publishes afterwards (renderer before replay, HUD after). A finished game replays nothing but must still publish. |
| `derived-bookkeeping` | `cross-cutting-helpers.ts` (`scanBeastSightings`) | Runs inside every visibility refresh (which can itself execute during a publication) and writes only sighting bookkeeping no renderer/HUD/panel projects. |

The set of reasons and the exact `(file, reason)` inventory are pinned in
`tests/app/architecture-boundaries.test.ts` ("#1015"). Adding a reason or an owner is a
design decision made *there*, with the PR saying why publishing is wrong — not a call-site
convenience. `scripts/check-src-rule-violations.sh` and `.claude/hooks/check-src-edit.sh`
block `setStateWithoutRefresh` anywhere and `unpublished.adopt(` outside the owners.

## Rules

- **Default to `commit`.** "It probably has no visible effect" is not a reason: that
  reasoning (an audit of one renderer glyph) is what the old beast-hoard silent write
  rested on, and it rots the moment the renderer changes. The pause-menu Superweapons
  toggle was a real instance — the HUD's strategic-arsenal button is gated on that flag and
  stayed stale (regression: `game-session-controller.test.ts`).
- **A multi-step handler wraps in `batch`**, it does not write silently and refresh at the
  end. The refresh at the end is the thing that gets forgotten on an early `return`.
- **Never pair a write with `renderLoop.setGameState(...); hud.update()` in a controller.**
  Pinned by the architecture test and `scripts/check-src-rule-violations.sh`. The sole
  exception is `turn-flow-controller.ts`'s `presentation-deferred` solo end-turn pair
  (renderer before `await replayAIMoves`, HUD after), pinned by content. The
  `updateHUD: () => deps.hud.update(),` dep wiring is not a push. In a controller test,
  subscribe the mock renderer/HUD to the session exactly as `bootstrap.ts` does, so a
  handler that forgets to publish fails.
- **Publication stays synchronous.** Do not add microtask coalescing: it would change
  observable ordering in `endTurn` and in the hot-seat handoff.
- **Mutating a `GameState` object in place is not a write.** Subscribers are never told.
  The transaction boundary is now pure (#1199): movement
  (`executeUnitMove`/`executeValidatedUnitMove`) and visibility
  (`updateVisibility`/`updateAndRefreshVisibility`/`applyReconReveals`) return a new
  `GameState` that the caller must `commit`/thread — no in-place mutation remains.
