# #694 Integration Review Design

## Purpose

Review the SAM Site delivery across every reachable shared path and repair each
reproducible defect at its canonical owner. The review includes content balance,
AI, difficulty parity, combat presentation, city-panel UX, hot-seat privacy,
saved queues, rendering, audio feedback, and TypeScript architecture.

## Scope and boundaries

The review starts from the #694 branch delta but may repair a pre-existing shared
defect when that defect is reachable through SAM Site behavior. It does not add
Radar Station operational state, a bespoke SAM sound, or unrelated game features.
Silence is acceptable for SAM-specific audio because construction has no unique
mechanical event; the existing recipient-scoped building-complete notification is
the feedback fallback. Any actual audio leak or muted-volume bypass is in scope.

## Design rules

- `BUILDINGS.sam_site` remains the only source of its identifiers, gates, costs,
  description, and typed air-defense capability.
- Shared eligibility, queue validation, combat calculation, AI candidates, and
  viewer filtering must remain generic. No SAM ID switch may substitute for a
  typed capability or prerequisite check.
- A combat fact appears only when its numeric effect applies. Unknown providers
  must never leak through an opponent or hot-seat viewer.
- Legacy and imported production queues must not build content whose local
  prerequisites are absent. Existing valid/grandfathered queues remain intact.
- The city panel keeps every legal and explanatory catalog item reachable, states
  missing technology, building, and resource requirements plainly, and rerenders
  after a production action.

## Test contract

- Production: both technology gates and both local prerequisites; predecessor
  availability; malformed saved queue rejection.
- Combat: radius two positive, radius three negative, strongest-provider stacking,
  air-only numeric/fact behavior, and visible-versus-hidden provider facts.
- AI/difficulty: Explorer, Standard, and Veteran share legal candidates; AI uses
  only its own city state.
- UI: plain wording, full locked catalog reachability, immediate queue refresh, and
  a two-human hot-seat owner-isolation case.
- Verification: changed-source rules, mirrored focused tests, build, durable full
  suite, and committed/uncommitted diff review.

## Completion criteria

The delivery is complete when no reproduced integration defect remains, all added
behavior is covered by focused regressions, and the branch passes the required
build and durable-suite evidence. Historical commit ordering is not a runtime
property; it may be preserved or rewritten separately only if requested.
