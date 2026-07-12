# Issue #555: Legendary wonder availability and scrapping

## Goal

Legendary wonders must use the game's canonical civilization-wide resource access,
make every blocker understandable before and after quest completion, and react
correctly when a required resource or a continuous resource quest condition is
lost. Players retain the choice to begin construction; the game never silently
starts a wonder.

The change also stabilizes repeated full-suite tech-panel timeouts without
weakening catalog coverage.

## Verified root causes

1. `legendary-wonder-system.ts` and `legendary-wonder-presentation.ts` each
   inspect raw resources in the host city's owned tiles. This diverges from
   `getCivAvailableResources()`, which correctly accounts for revealed,
   improved city resources, resource outposts, marketplace purchases, and
   hostile occupation.
2. Quest completion changes a project to `ready_to_build`, but build eligibility
   additionally requires technologies, resources, and city geography. The
   presentation turns that mismatch into a generic `Blocked` label.
3. Current wonder notifications only report quest completion for its original
   city. They do not report later availability changes and cannot offer two
   city-specific actions.
4. Legendary projects currently retain completed quest steps permanently.
   That is incorrect for a future resource-count quest such as “maintain three
   iron mines.”
5. An active wonder does not currently respond to losing a required resource;
   the existing rival-race loss path refunds 25% gold and preserves 25%
   production carryover, contrary to the approved 50%-gold scrapping rule.
6. `tests/ui/tech-panel.test.ts` repeatedly renders the complete ~339-tech DOM
   in five independent tests. Alone, the file finishes its expensive cases in
   about 1.0–1.3 seconds each; in the full eight-worker suite they can exceed
   the 15-second per-test deadline. This is deterministic suite-load pressure,
   not a panel correctness failure. A concurrent worktree test run worsens the
   CPU contention but is not required to reproduce it.

## Rules and player contract

### Requirement scope

- `requiredResources` are civilization-wide. A resource is available only when
  `getCivAvailableResources()` says it is available; that includes valid city
  improvements, completed outposts, and active marketplace access.
- `cityRequirement` stays city-local: river and coastal requirements must be
  met by the selected build city.
- Resources and geography are shown while a quest is in progress as well as
  after it completes. Copy identifies the next action: research the named
  technology, secure the named resource through an improvement/outpost/market,
  or use a city with the required geography.

### Availability and notifications

- Availability is a canonical state derived from quest truth, global
  uniqueness, resource access, technology, and host-city geography. Buildable
  and blocked notices are grouped by `(civId, wonderId)`, not emitted once for
  every city-local project, so a player receives one notice containing up to
  two eligible cities.
- Notify the owning human once for each meaningful transition: blocked,
  buildable, construction started, construction scrapped, rival race lost, and
  construction completed. Do not repeat a notice on steady turns.
- A buildable notice occurs at the owner’s turn start. It names at most two
  eligible cities and offers a touch-sized direct action for each. The action
  revalidates the current player, ownership, and wonder availability before
  opening that owner’s city/wonder flow; it does not start construction.
- The established delivery contract writes the recipient’s log, toasts only
  the active unsuppressed human, and queues a private hot-seat handoff event
  for another human. AI uses the same eligibility but never receives UI
  notifications.
- Standard notification SFX remains the only audio feedback and plays only
  when a toast is actually delivered, never while a private hot-seat event is
  merely queued.

### Construction loss and recovery

- Required resources remain a requirement while a wonder is being built.
- If a building project loses a required resource, or a continuous
  resource-count quest becomes false, immediately remove the wonder queue
  item, clear city and project production, grant `floor(investedProduction / 2)`
  gold to its owner, and emit the private scrapped notification.
- The project remains quest-complete after a normal `requiredResources` loss;
  reacquiring access can make it buildable again, but construction restarts at
  zero production.
- Resource-count quest steps are explicitly typed and continuously evaluated.
  If one becomes false, the project returns to questing. Restoring the required
  count re-completes the step and may make the project buildable again.
- When a rival completes a globally unique wonder, every active rival project
  follows the same 50%-gold, zero-carryover scrapping rule, then remains
  terminally `lost_race`; it cannot restart.

## Architecture

1. Introduce a detailed legendary-wonder eligibility helper in the system
   layer. It returns the eligible boolean plus typed blocker details and is the
   sole source for construction, AI candidates, and presentation.
2. Move resource access to `getCivAvailableResources()`; preserve the existing
   city geography helper only for the city-local condition.
3. Add typed `resource-count` quest metadata (resource, positive target count,
   and explicit `empire` or `host-city` source scope) and a canonical
   active-source counter. Marketplace access may
   satisfy a normal build requirement but does not count as a physical “mine”
   for a source-count quest.
4. Make quest synchronization preserve completed historical objectives but
   recalculate continuous resource-count objectives. Demote an unstarted
   project to `questing` when one of those steps becomes false.
5. Run the shared availability preflight before `processCity()` awards any
   production, so a project that begins a turn without its resource cannot gain
   an extra production tick. Reconcile again after later territory/marketplace
   changes to record newly buildable notices. Keep completion resolution in the
   existing post-production wonder tick.
6. Centralize scrapping in a shared legendary-wonder helper used for resource
   loss, continuous-quest loss, and rival completion. It owns queue removal,
   production reset, 50% gold conversion, phase selection, and transition
   payloads. It processes the full affected set, including all rival projects;
   it must not early-return after the first scrap.
7. Persist the last notified availability state as optional `(civId, wonderId)`
   data so a loaded game can compare real transitions without toast spam.
   Legacy projects normalize safely and get a single actionable notice on the
   next owner turn when they are already buildable.
8. Extend notification drafts/entries with a typed, bounded city-action list.
   Keep the existing single `linkedCityId` behavior for older producers and
   saved logs. Normalization caps the list at two and retains only city IDs
   owned by the notification recipient; toast and notification-log rendering
   use the action list when present.
9. Transition events are emitted by the mutator with their recipient, wonder
   label, bounded city-action payload, and refund when applicable. Notification
   routing only delivers that explicit transition payload; it must not rescan
   final state or infer an event from a rendered steady state.

## Player truth table

| Before | Trigger | Immediate state | Player-visible result |
|---|---|---|---|
| Questing, missing Iron | Player improves/outposts/buys Iron | Still questing or ready, depending on quest steps | Requirement guidance updates |
| Quest complete, requirements missing | Owner’s turn begins | Blocked | Specific blocker copy; no construction CTA |
| Quest complete, all requirements met | Owner’s turn begins | Buildable | Private notice with up to two city actions |
| Building with Iron | Iron access is lost | Queue removed, production reset, half production becomes gold | Scrapped notice with refund |
| Building with continuous “3 iron mines” quest | Valid mine count becomes two | Same scrapped state; questing | Scrapped notice and quest checklist updates |
| Building | Rival finishes the same wonder | Queue removed, production reset, half production becomes gold, `lost_race` | Race-lost notice; no restart |
| Scrapped after ordinary resource loss | Access returns | Buildable | New private availability notice; start from zero |

## Data and save compatibility

- New project transition metadata and notification city actions are optional.
- Save normalization validates and clones both shapes, ignores malformed data,
  retains legacy single-city links, and strips action targets that do not belong
  to the log recipient.
- Existing projects without transition data are initialized deterministically;
  no schema-breaking migration or distribution-specific branch is required.

## Definition safeguards

- Every required resource ID must exist.
- Each required resource’s reveal technology must exist and be in the wonder’s
  era or earlier, matching the existing required-tech era invariant.
- Resource-count metadata must name a valid resource and positive target.

## Tech-panel test stability

- Keep one focused integration test that opens the complete catalog and proves
  every authored technology remains reachable. This preserves the real UI
  contract as the tree grows. It has one documented, higher integration timeout
  budget, rather than allowing multiple large-DOM tests to compete for the
  same 15-second unit-test deadline.
- Move repeated full-catalog assertions to the smallest suitable boundary:
  pure progression/layout helpers or compact authored fixtures that exercise
  the relevant prerequisite, selected-path, and ETA rules without creating
  hundreds of jsdom nodes.
- Do not solve the instability by repeatedly increasing every timeout. The
  full-suite command remains safe to run concurrently with normal development
  work because the expensive DOM path is bounded to one integration test with
  an explicit, reviewed budget.
- The compact tests must preserve positive and negative assertions for the
  semantic boundaries they cover (for example, a blocked tech is not queueable,
  and a selected path highlights only its prerequisite chain).

## Review: gameplay, player experience, and implementation quality

| Dimension | Review outcome / guardrail |
|---|---|
| Balance and fun | Resource denial has a clear, meaningful cost, but 50% gold prevents a single temporary loss from ending a game. No free auto-construction. |
| Ages 7–43 | Plain-language blocker text, visual status, small bounded choices, and no hidden prerequisite make the system teachable without removing depth. |
| Play styles and difficulty | Builders can plan resources early; aggressive players can disrupt rivals; fast players receive direct shortcuts. Difficulty settings remain explicitly rule-neutral: no level changes availability, refunds, or notification timing. |
| AI | Uses the exact preflight eligibility and scrapping helpers; it cannot receive an illegal production tick, retain an illegal queue item, or receive player-facing notices. |
| UI and UX | Blocked states are actionable; one grouped notice names at most two accessible, touch-sized city actions; stale actions revalidate before opening; the panel rerenders after actions and preserves the production queue contract. |
| Architecture and extensibility | One canonical evaluator replaces duplicated local checks; typed continuous quest metadata avoids future step-ID branches. |
| Data and saves | Plain serializable optional fields plus recipient-scoped action normalization maintain legacy compatibility and prevent tampered/stale city links. |
| SFX | Existing notification SFX is reused exactly once per visible delivered notification; no new asset or audio state. |
| Solo and hot seat | Delivery is recipient-scoped, uses `currentPlayer` only for active viewing, queues private handoff events for non-active humans, and revalidates a city action at the later handoff. |
| Testing and regressions | System, AI, UI, notification, save, and definition tests cover both positive transitions and negative near-misses. |
| Test-suite stability | One real full-catalog render remains; compact/pure tests replace duplicate large-DOM work so CPU contention no longer turns valid tests into timeouts. |
| Transition correctness | Mutator-owned payloads are emitted once, so the UI never reconstructs availability from a later snapshot or reports the same transition repeatedly. |

## Acceptance criteria

1. A civ-wide outpost or valid marketplace resource can satisfy a wonder
   resource requirement; a host-city river/coastal condition cannot.
2. Requirements remain visible and actionable throughout questing and blocked
   states.
3. Eligible projects notify the correct human once per availability transition
   per wonder/civilization and offer at most two working city actions.
4. Resource, continuous-resource-quest, and rival-completion loss all scrap
   active construction, convert exactly half invested production to gold, and
   preserve no production carryover.
5. Only ordinary resource loss preserves completed quest status; a continuous
   resource-count quest is re-evaluated and can return to questing.
6. AI and human paths maintain identical game-state invariants, while only
   human recipients get notification UI.
7. Legacy saves load without error and new data round-trips safely.
8. The full test suite no longer performs five redundant complete-catalog
   tech-panel DOM renders; one integration proof and compact/pure focused tests
   retain all specified behavior under its explicit integration timeout budget.
9. A resource lost at turn start yields no additional city production before
   scrapping, and the same preflight invariant holds for AI and human cities.
10. A stale, loaded, or hot-seat-delayed city action cannot open another
    player's city or bypass current wonder eligibility.
11. Transition-event tests prove one emission per actual availability/scrapping
    transition and no emission on a steady subsequent turn.
