# Issues #1301/#1309 Input Reliability Design

## Problem

The primary action bar currently listens to both `touchend` and `click`, then suppresses every
activation for 300 ms with a timer-backed boolean. That tries to deduplicate a synthetic click after
a touch, but it also makes correctness depend on timer-task ordering. When the main thread is busy,
the reset timer can remain queued while a later, legitimate click task runs. The button receives focus
and Playwright reports a successful click, but the callback silently returns. That is the shared cause
of the Council and Diplomacy reopen flakes in #1301 and #1309, and it affects every primary action.

Two adjacent reliability gaps amplify the same failure class:

- `endTurn()` has no canonical in-flight owner, so the action bar, keyboard, warning confirmation,
  and recorder can overlap the same asynchronous turn mutation.
- map E2E helpers click screen coordinates without checking the live hit target. A queued notification
  can deliberately cover the coordinate and consume the click, which is the #1227 lookalike.
- `TouchHandler` measures a gesture with processing-time `Date.now()` and routes `touchcancel` through
  the tap-producing `touchend` path. Main-thread delay can therefore change gesture classification,
  and an OS/browser cancellation can become a game action.

## Goals

- Every deliberate primary action activation is handled exactly once without a timer race.
- Turn advancement is single-flight at the mutation owner, regardless of entry point.
- The visible End Turn control truthfully reports the pending operation and cannot be reactivated.
- Touch cancellation never produces a tap, and tap duration uses event time rather than handler time.
- Browser tests retry user intent only while the semantic result is absent, and coordinate helpers
  dismiss a blocking notification through the live UI before re-resolving the coordinate.
- Durable agent guidance prevents these bug patterns from being reintroduced.

## Non-goals

- Changing panel toggle semantics or the notification queue's production behavior.
- Hiding real product errors with unconditional Playwright retries.
- Serializing every UI callback globally; only async turn mutation needs a canonical lock.
- Adding a second input abstraction or pointer-event polyfill.

## Interaction Contract

### Primary action buttons

Native HTML button `click` is the only activation event. Browsers already synthesize it for touch,
mouse, keyboard, and assistive technology. Buttons use `touch-action: manipulation` for prompt touch
activation. There is no wall-clock cooldown and no paired `touchend` handler.

| State | User activation | Result |
| --- | --- | --- |
| Panel action idle | click/tap/keyboard activate | callback runs once |
| Panel action reopened later | activation after close | callback runs once, independent of timers |
| End Turn idle | activation | one canonical `endTurn()` flight begins |
| End Turn pending | any activation path | existing promise is returned; no second mutation begins |
| End Turn pending in action bar | rendered state | button disabled, `aria-busy="true"`, label `Ending…` |
| End Turn settled | rendered state | enabled, busy attribute removed, label restored |

The turn controller owns single-flight behavior because it is the shared boundary reached by the
action bar, keyboard, end-turn warning, recorder, and any future caller. UI disabling is feedback,
not the correctness mechanism.

### Touch lifecycle

| Event sequence | Result |
| --- | --- |
| `touchstart` then short `touchend` at the same point | one tap |
| `touchstart` then `touchcancel` | no tap and no long press |
| event timestamps show a short tap but handlers run late | still a tap |
| movement crosses the pan threshold | no tap |
| second touch begins | pinch mode; long press cleared |

Gesture duration is `touchend.timeStamp - touchstart.timeStamp`. Cancellation clears timers and
gesture state without consulting `changedTouches` for an action.

### Semantic browser actions

An action helper repeats only while its stated postcondition is absent. Opening a primary panel is
therefore "click the named button while the panel is absent, then require the panel to be visible",
not "retry only when `.click()` throws". This makes a swallowed DOM event observable.

Coordinate clicks resolve the visible hex immediately before each attempt and inspect
`document.elementFromPoint`. If a notification toast is the blocker, the helper clicks that toast,
waits for that exact node to be detached, re-resolves the hex (the toast may recenter the camera), and
then clicks the canvas. Any other interceptor fails with a diagnostic instead of being hidden.

## Ordering And Ownership

1. A caller invokes `endTurn()`.
2. The turn controller stores the one in-flight promise before another browser task can enter.
3. All concurrent callers receive that same promise.
4. The existing validation, mutation, replay, publication, notification, and autosave order runs once.
5. A `finally` release clears the stored promise after success or handled failure.
6. The action-bar button restores its visible idle state after the returned promise settles.

No new queue is introduced. Existing notification and handoff ordering remain unchanged.

## Verification Contract

- Unit regression: two valid click events both reach a panel callback even when timer tasks have not
  run; a touch event followed by its click still produces only the native click callback.
- UI regression: a pending End Turn promise disables the button, exposes `aria-busy`, changes its
  label, ignores another DOM activation, and restores state on settlement.
- Controller regression: two concurrent `endTurn()` calls return the same promise and advance one
  round only; a later call can start after settlement.
- Touch regressions: delayed handler processing does not change an event-time short tap, and
  `touchcancel` never calls `onHexTap`.
- E2E: Council and Diplomacy use one shared semantic panel opener; recorder end-turn retries are tied
  to warning/required-choice/new-turn state; the shared hex helper diagnoses or dismisses live hit
  blockers and is used by the affected map specs.
- Guardrail: a focused input-reliability rule records the native-event, canonical-single-flight,
  semantic-postcondition, coordinate-hit-target, and touch-cancel requirements.

