# Issue 704 — Beast Stampede Response Status

**Parent:** #547, delivery 40 of 63

## Reconciled implementation scope

The original #547 Task 40 plan predates the presentation-registrar and dedicated
audio-director architecture. This delivery therefore uses the current composition
root instead of adding the obsolete `src/ui/stampede-presentation.ts` path.

- Lifecycle transitions are derived from the direct before/after Stampede mutation
  boundary and emitted once by the turn manager.
- The presentation registrar delivers only to the target civilization through the
  existing hot-seat-safe notification delivery contract.
- AI dispatch candidates require a currently visible herd and fully visible committed
  route. They prioritize an unscreened city approach over a route stopped at a visible
  fort or fortified screen, then enter the existing prepared-plan and tactical-execution
  pipeline as a `repel` plan; they do not use hidden route records or a separate combat
  resolver.
- A warning emitted after accumulated, phase-less pressure is still a one-time lifecycle
  transition. Screen cost is derived only from units visible to the threatened AI.
- Existing target-scoped city-panel containment status, route visibility filtering,
  unit SFX fallback, and notification queueing remain the player-facing and
  accessibility paths for this mechanics delivery. Bespoke Stampede audio remains
  owned by #719.

## Verification record

- `scripts/check-src-rule-violations.sh` covers every changed source module.
- Focused Stampede, turn-manager, AI, presentation, city-panel, and notification-delivery
  coverage verifies lifecycle facts, route visibility, screened-versus-approaching AI
  priority, recipient isolation, and hot-seat queueing.
- Production build verifies TypeScript and the shared web bundle. The final durable suite
  is run against this exact worktree after this status record is complete.
