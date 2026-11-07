# Cyber Warfare, Espionage and Counterplay: Design Report (#419)

Audited against `main` at `e00ea098`, 2026-11-07. Scope: investigation and design only. No gameplay is changed by the PR that
carries this file. Everything below was read from source on that commit; test files are named, not re-run.

## 1. Verdict

1. Almost everything in #419 is already shipped, shipped under another name, or duplicates a shipped mechanic.
2. The real weakness is not a missing attack. It is **counterplay, information and payoff**: the victim of most hostile spy operations
   is never told, never told by whom, the attacker gets no "it worked" moment, and the AI picks its operations without regard to the situation.
3. Recommended arc, revised after a fun review (section 12): **Caught in the Act**. PR 1 gives both sides a moment (the attacker's confirmation, the
   victim's alert with its existing counter), PR 2 turns attribution into a reveal plus one response, PR 3 gives the AI grudges. PR 1 adds no new rule
   and no new state; PR 2 adds one rule and needs owner approval.
4. The strongest *new defence* I could construct (a paid "Restore Services") is **redundant with rush-buy** and is rejected (section 5). Its fun
   (the "pay up or wait it out" moment) is kept by surfacing rush-buy in the alert instead.
5. Park the rest of the brainstorm. New cyber attacks would mostly reach late-game players (eras 10-13); the fixes here reach earlier missions too.

## 2. Current implementation inventory

| Capability | Where | What it actually does |
|---|---|---|
| Passive Cyber Unit drain | `src/systems/cyber-warfare-system.ts` | Each enemy `cyber_unit` adjacent to a city of a civ it is at war with takes up to 2 gold/turn, credited to its owner, capped so income never goes below 0. Switched off for an owner whose Autonomy is activated. Cyber Defense Center blocks 65% (75% with Signals Hub) via `createSimulationRng` domain `cyber-drain`. |
| Network plan `exploit` | `network-plan-definitions.ts`, `network-effect-resolver.ts`, `network-plan-system.ts` | Cyber Unit, at-war enemy city at range 1, load 2. Transfers 10% (15% surged) of city gold at the victim's turn end. A Cyber Defense Center delays it one cycle, then halves it; a `harden` charge halves it again; minimum 1 if any. Validated by `validateNetworkPlanAssignment`, including both sides at war. |
| Network plan `harden` | same | Friendly city, range 1, load 1, one 50% mitigation charge. Deterministic, not RNG. |
| Autonomy capacity/load, surge, postures | `autonomy-capacity.ts`, `autonomy-postures.ts` | The generic cost and rate limiter for every plan. |
| Constructive plans | `network-plan-definitions.ts` | fabrication-sprint, research-mesh, logistics-routing, survey-grid, guardian-screen, swarm-strike. |
| Network viewer warning | `network-viewer-intel.ts` | Victim sees an exploit target and its counters; source identity and position only if `detections` recorded them. This is the model for attribution and it covers **only `exploit`**. |
| `cyber_attack` mission | `espionage-catalog.ts`, `espionage-missions.ts`, `espionage-turn.ts` | Era 12 (`cyber-intelligence`), remote (no placed spy), base 45%, 2-turn duration. Sets `City.productionDisabledTurns = 3` on the target city. |
| `misinformation_campaign` | same | Era 10, remote. Sets the target civ's `researchPenaltyTurns = 10`, multiplier 0.2. |
| Other hostile missions | same | `steal_tech`, `sabotage_production` (lose 15-25 progress), `incite_unrest`, `fund_rebels`, `election_interference`, `assassinate_advisor`, `forge_documents`, `arms_smuggling`, `sabotage_relief`, `flip_loyalty`, `intercept_courier`, `bribe_official`, `expose_scandal`; intel: `signals_intercept`, `satellite_surveillance`, `gather_intel` and others. |
| Defence modifiers | `espionage-modifier-definitions.ts` | Data table: Cyber Defense Center -15% mission success (a further -10% against satellite/signals), Counterintelligence -30%, Secret Police -30% plus detection, and others. |
| Counter-intelligence | `espionage-counterintel.ts`, `espionage-interrogation.ts` | Embedded counter-spies sweep, capture, expel, turn captured spies. |
| AI | `src/ai/basic-ai.ts` (`chooseAiMission`, the infiltrated-spy block), `ai-network-intents.ts`, `ai-network-planning.ts` | Fixed mission orders by personality/intent; exploit/harden scored by visible cities. |
| Notifications | `espionage-notification-audience.ts`, `register-espionage-presentation.ts` | Typed audience contract (#1201) for six events only. |

Timing (verified against `ROUND_PHASES`): espionage resolves in its own phase late in the round, after `post-civ-housekeeping`.
`cyber_attack` therefore costs the target three production steps (the following three rounds) before the counter reaches zero.
Production is locked through `isCityProductionLocked`, read by `city-production.ts` and the AI production decision.

## 3. Verified findings that change the design

1. **Most hostile successes are silent to the victim.** `espionage:mission-succeeded` has no listener (it is emitted in
   `espionage-turn.ts` only), and `ESPIONAGE_NOTIFICATION_EVENT_TYPES` lists six events: sabotage-relief, city-flipped, courier-intercepted,
   official-bribed, scandal-exposed, intel-report. `cyber_attack`, `misinformation_campaign`, `sabotage_production`, `steal_tech`,
   `incite_unrest` and `forge_documents` have no victim notification of success. The only indirect signal found is
   `strategic-assessment.ts`: "<city> cannot build ... paused for N turns", with no cause and no actor. A spy caught while infiltrating does notify its owner (`spy-caught-infiltrating`);
   I did not find a victim notice for a *successful* disruption.
2. **Hostile spy missions have no war or relationship requirement.** `getMissionStartDenial` checks spy state and a target only; `isAtWar` does
   not appear in `espionage-missions.ts`, `espionage-turn.ts` or `espionage-panel.ts`. Network `exploit` requires war; spy
   `cyber_attack` does not. (I did not exhaustively trace every UI path that might pre-filter targets; slice 1 starts by pinning this with a test.)
3. **The AI's infiltrated-spy path picks a mission uniformly at random** from everything available (`basic-ai.ts`, the "Stationed-inside" block),
   bypassing `chooseAiMission`. The "start missions for stationed spies" path uses `chooseAiMission`, whose output depends on personality and intent but not on
   target, war, or relationship.
4. **A gold counter to the production lockout already exists.** `getRushBuyQuote` prices the remaining cost of the head item at
   `ECONOMY_RULES.rushBuyMultiplier` (2.5x); `completesFromOwnProduction`'s own doc says a purchase in a locked city "still buys real progress".
   Wonders and unfunded items cannot be bought. So a lockout is already answerable at a steep, intended price.
5. **Two disruption timers are single-slot and refresh, not stack.** `productionDisabledTurns` is assigned (not added) and
   `researchPenaltyTurns` is assigned. A second success refreshes to the full duration. There is no stacking risk, but there is no cap on refresh frequency beyond the 45%/55% success roll, the spy's risk and the mission duration.
6. **The attacker gets no payoff moment either.** A grep of `src/ui`, `src/presentation` and `src/app` finds nothing that reacts to a
   successful mission, so a player who spends a spy for two turns on `cyber_attack` sees no "it worked" notice. (Grep only; the spy panel may
   still show the spy returning to idle. PR 1 starts by pinning what the attacker currently sees.)
7. **The Cyber Defense Center is described as blocking only cyber-unit drain** (`city-building-catalog.ts`) while it also carries spy-mission
   modifiers. Player-facing text under-describes the shipped behaviour (a `content-description-honesty.md` item, out of scope here).

## 4. Classification of every #419 proposal

| # | Proposal | Class | Evidence |
|---|---|---|---|
| B | Ranged cyber strike | 1 Delivered | `exploit` (range 1, gold, resolved at victim turn end). Not to be re-requested. |
| 1 | Infrastructure sabotage (production) | 1 Delivered | `cyber_attack` (3-turn lock), `sabotage_production`. Stronger than the proposal. |
| 2 | Disinformation / sow discord | 1 Delivered | `misinformation_campaign` (-20% research, 10 turns). The issue's "halve science 3 turns" is a different tuning, not a different mechanic. |
| 3 | Market manipulation | 2 Partial | `bribe_official` (capped treasury theft), `intercept_courier` (severs the best trade route). No price manipulation; that would touch `marketplace-system` for little decision value. |
| 4 | Military C2 disruption (-1 movement) | 4 Missing, rejected | A mid-turn movement penalty touches the movement contract (#1025) and punishes reaction time, not strategy. See section 5. |
| 5 | IP theft | 1 Delivered | `steal_tech` (permanent gain, stronger than a 3-turn loss). |
| 6 | Supply-chain compromise (+50% cost) | 3 Redundant | `sabotage_production`, and a cost change would route through the #984 production-cost context. |
| 7 | Deepfake / propaganda | 1 Delivered | `forge_documents` (-25 relationship between two others), `expose_scandal`. |
| 8 | Ransomware | 4 Missing, rejected | Its distinguishing feature, a pay/refuse choice, is the existing rush-buy decision; a transfer to the attacker makes the rich richer. |
| D1 | Network segmentation (Signals Hub) | 1 Delivered | Signals Hub raises the drain block to 75%. |
| D2 | Threat-intel sharing (allied CDC bonus) | 4 Park | Reads alliance state; no evidence the alliance layer needs it. |
| D3 | Incident response / Cyber Command NP | 5 Poor fit as a flat NP | A flat empire-wide percentage is the yield-style bonus `game-balance.md` caps. The *information* half is the recommendation below. |
| D4 | Zero-trust (spy missions cost 2x) | 3 Redundant | The modifier table already lowers success per building. |
| D5 | Offensive deterrence / mirror | 4 Reserve | Needs attribution; depends on the recommended slice. |
| D6 | Air-gap isolation | 4 Reserve | A real trade-off (immune to drain, loses trade gold). Needs a choice surface and a trade-route hook. |
| Q | Cyber effects visible to victim; cyber log | 2 Partial, **the gap** | Only `exploit` has a viewer warning; the notification log exists. |
| Q | AI decides attack type per target | 2 Partial, **the gap** | Section 3 findings 2-3. |
| Q | Era boundaries | 6 Owner | Already decided by the tech ladder (eras 10-13). |
| #418 | Propagandist / AI Drone Controller | 6 Out of scope | Autonomy (era 13) already has `drone_controller` and the formation plans. |

## 5. Candidate evaluation

Scored 1 (poor) to 5 (strong). "Reuse" means how much of an existing contract it rides on.

| Candidate | Depth | Counterplay | Distinct | Reuse | AI | Clarity | Risk (5 = low) | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **A. Incident Report** (attributed victim notice + situational AI) | 3 | 5 | 4 | 5 | 4 | 5 | 5 | **31** |
| B. Restore Services (pay to end a lockout) | 2 | 2 | 1 | 4 | 4 | 4 | 4 | 21 |
| C. Ransom with transfer | 3 | 3 | 3 | 2 | 2 | 4 | 2 | 19 |
| D. Air-gap isolation | 4 | 3 | 4 | 2 | 2 | 3 | 3 | 21 |
| E. Retaliation by attribution | 4 | 3 | 4 | 3 | 3 | 3 | 3 | 23 (needs A) |
| F. C2 / movement disruption | 2 | 2 | 3 | 1 | 2 | 4 | 1 | 15 |
| G. Market manipulation | 2 | 2 | 3 | 2 | 2 | 3 | 2 | 16 |

Why not B: a lockout already has a priced answer (finding 4). A Restore at the rush-buy rate is identical; cheaper undercuts the
attack and removes its point; dearer is worse than rush-buy. Its only residual use is a wonder city, which is a narrow case, not a system.
Why not C: crediting the attacker with gold makes a successful hit self-funding against the richest target (snowball), and the pay/refuse
prompt needs a forced modal for a hot-seat player who is not at the screen.
Why A wins: it is the only candidate that makes every existing counter (CDC, counter-spies, rush-buy, diplomacy) *usable*, because today the victim
often cannot know which counter applies, or whether to apply any. It also creates the information substrate E and D6 need.

**Compared with doing nothing:** the shipped attacks keep working, but a player who loses 45% of a research track sees no cause. That is a
trust defect, not a balance feature. **Compared with improving AI only:** the AI's random mission (finding 3) is cheap to fix but still leaves
victims blind; A fixes both, and the two parts are independently reviewable.

## 6. Chosen recommendation: Incident Report (prospective contract)

Principle: no new effect, no new tuning number, no new persisted state. Only information and decision quality.

1. **Eligibility.** Applies to a *succeeded* hostile operation whose effect lands on a major civ: `cyber_attack`, `misinformation_campaign`,
   `sabotage_production`, `steal_tech`, `incite_unrest`, `forge_documents` (target of the forgery). Informational and already-notified missions are unchanged.
2. **Actor, target, range.** Unchanged (the mission's own spy, civ, city).
3. **Action economy / cost.** None added.
4. **Effect and duration.** None changed. The report states the *real* effect from the mission result: city and turns locked, research % and turns, progress lost, tech stolen.
5. **Stacking and caps.** None changed (finding 5 is documented, not altered). A refresh reports as a refresh.
6. **Countermeasures.** Unchanged. The report names the counters that apply (Cyber Defense Center, embedded counter-spy, rush-buy where legal) from the same tables, so the
   text cannot drift. Wonders are named as not purchasable, from `getRushBuyQuote`'s own reason.
7. **RNG.** None new.
8. **Resolution timing.** At the moment the existing `mission_succeeded` consequence is applied, in the espionage phase. No new phase and no reordering, so the #1239 order literals are untouched. The victim reads it at the start of their next turn.
9. **Reversal / cleanup.** None; it is a notification. It persists only in the existing per-recipient `notificationLog`.
10. **Diplomacy.** Unchanged in slice 1. Whether attribution should cost the actor relationship is owner decision 2.
11. **Event and audience.** One new typed event, `espionage:operation-landed` `{ actorCivId, targetCivId, targetCityId?, missionType, effect }`, added to
    `ESPIONAGE_NOTIFICATION_EVENT_TYPES` and the exhaustive route record so the generic audience test covers it. Roles: `actor` (confirmation) and `target`. No witness role in v1.
12. **Attribution (viewer-safe).** One pure function, `getOperationAttribution(state, viewerId, event)`, returns `confirmed | suspected | unknown`
    from data that already exists: *confirmed* if the viewer holds a captured or turned spy of that actor whose `targetCityId` is the struck city;
    *suspected* if the viewer has an embedded counter-spy in the struck city at the time; otherwise *unknown* ("a hostile operator"). The actor's id is
    read only inside this function and never reaches the victim's DTO unless the tier allows. This is the same pattern as `getNetworkWarningForViewer`.
13. **UI.** The notification; a cause line wherever the effect is already shown (the city panel for `productionDisabledTurns`, which today is only
    explained for unrest; the research readout for `researchPenaltyTurns`); the strategic-assessment "cannot build" line gains its cause. Every
    string is `textContent`. I have not verified that the city panel currently renders the lock when `unrestLevel` is 0; slice 1 must check and fix.
14. **AI (second PR).** (a) Route the infiltrated-spy block through `chooseAiMission`. (b) Add a target filter to `chooseAiMission` using only the AI's own knowledge
    (a civ it is at war with, or whose relationship is below a threshold taken from the existing `ai-diplomacy` constants, or a rival in a race it can observe). (c) Defence: no new
    AI behaviour; the AI keeps its current CDC/counter-spy valuation. Difficulty never changes a mission's effect or legality.
15. **Hot-seat privacy.** The report is delivered through `notifier.deliver(recipient, …)` as other espionage routes are, so only the viewing seat's civ is told; the attacker confirmation goes to the actor only. Tested with `expectHotSeatDifferential`.
16. **Save.** No persisted field. A save resumed mid-lockout simply has no report for the strike that preceded the load; the timers already persist, and the cause line reads
    `productionDisabledTurns` itself, so it appears correctly. Classification: additive/derived, no migration, no `SAVE_VERSION` bump.
17. **Human/AI parity.** Both are recipients through the same route; the AI ignores the text.
18. **Capacity/load and espionage.** No interaction: Autonomy load is not spent; spy slots are unchanged.

## 7. Stress tests (walk-throughs)

| Scenario | Outcome with the recommendation | Risk found |
|---|---|---|
| Small defender vs a larger cyber power | Learns of each hit and its real effect, can rush-buy where legal, can prioritise a Cyber Defense Center. | Awareness does not remove the power gap; this is not a fairness fix. |
| Two mature rivals at war | Both exploit and spy strikes are visible and attributable if they hold evidence. | Attribution tiers must not reveal an actor to a rival who has no evidence (tested). |
| Neutral civ with strong espionage | Open-season today (finding 2). Slice 1 changes nothing; owner decision 2 decides whether it should. | Largest balance question; deliberately not decided here. |
| Rich civ repeating disruptions | The refresh semantics (finding 5) cap the lockout at one 3-round window per city per strike. Spy exposure and mission time are the rate limiter. | Snowball risk is unchanged and observable once reports exist. |
| Defensive infrastructure used well | CDC, counter-spy and rush-buy become discoverable because the report names them. | Description of the CDC is incomplete (finding 6). |
| Hot-seat player with little intelligence | Told "unknown hostile operator"; nothing leaks. | A shared screen shows the notification to whoever holds the device; same as every existing notice, covered by the handoff rules. |
| AI with limited information | The target filter reads only the AI's own relationships and war list. | Changes AI behaviour and the long-horizon baselines; run `ai-long`. |
| Save resumed mid-effect | Timers persist; the cause line is derived; no report for the pre-load strike. | None. |

Dominant strategies and griefing: none introduced. One existing one stays: a neutral, spy-heavy civ can disrupt any rival at no diplomatic cost.
Information leaks: the only new read of hidden data (the actor id) is confined to one function behind the existing viewer-safety harness.

## 8. Implementation roadmap

Three reviewable PRs (the five candidate phases collapse because nothing here needs a new resolution engine). Each is playable on its own.

**PR 1: Caught in the Act notices (information; no new rule).**
Likely files: `src/core/types.ts` (event), `src/systems/espionage-notification-audience.ts`, `src/systems/espionage-turn.ts` (emit from the existing consequence),
`src/systems/espionage-attribution.ts` (new, pure), `src/presentation/register-espionage-presentation.ts`, `src/ui/city-panel.ts`, the research readout, `src/systems/strategic-assessment.ts`,
`docs/action-contract-inventory.md`.
Assertions:
- the six missions notify the target exactly once on success, never on failure, never twice across repeated turns (transition-owned);
- the audience equals the contract for the new route; a mission with no victim effect (no stealable tech, no queue) emits nothing;
- text states the real turns/percent and matches the mission result;
- attribution tiers: confirmed, suspected, unknown, and an uninvolved third civ learns nothing (`expectViewerSafety`, `expectHotSeatDifferential`);
- a save from before the change loads and plays a turn unchanged; mid-lockout load shows the cause line;
- negative: no war requirement is added (characterization pin of finding 2).
Acceptance: no change to any state byte for an unattended strike; `round-phase-order` literals unchanged; build, regular tests, and `verify-impact` evidence green.

PR 1 also carries the two fun pieces from section 12: the attacker's confirmation (actor role, same event) and, in the victim's lockout alert, the
existing counter with its live price ("Rush-buy to break the lock: N gold", from `getRushBuyQuote`, or "Wonders cannot be bought" from its own reason).
Extra assertions: the attacker is told exactly once, with the real effect; the quoted price equals `getRushBuyQuote` for the same state; a wonder city
shows the refusal reason instead of a price.

**PR 2: Caught in the Act (reveal and response; needs owner decision 3).** A *confirmed* attribution becomes its own reveal notice ("Your agents traced
the attack on <city> to <civ>") the moment the evidence exists (a captured spy), not only at strike time. The victim then gets **one** response per
confirmed incident: **Go public**. It reuses `expose_scandal`'s consequence shape and bounds exactly (`EXPOSE_SCANDAL_PENALTY`, at most four of the
culprit's treaty partners, deterministic order), so no new number is invented. It is a paired query and executor (`getGoPublicDenial` /
`goPublicAboutIncident`) with typed denials (`not-confirmed`, `already-used`, `expired`, `not-owner`), listed in `docs/action-contract-inventory.md`.
Availability window: until the end of the victim's next turn, so it is a decision, not a stockpile. State: one optional per-civ incident record
(`attributedIncidents`) needed to know "confirmed, unused, not expired"; additive and absent on old saves, so no migration (proof test required).
Assertions: an unconfirmed or third-party civ cannot use it; it fires once; human and AI use the same pair; hot-seat differential.

**PR 3: AI with grudges (needs owner decision 4).** Route the infiltrated-spy block through `chooseAiMission`, and give the target filter a memory:
an AI prefers to target the civ that most recently hit it (from its own confirmed incidents) or that it is at war with, and it uses Go public when it holds
a confirmed incident. All inputs are the AI's own knowledge. Assertions: deterministic per seed; no read of foreign hidden state (fog differential);
`ai-espionage.test.ts` extended; `ai-long` and `ai-playability` evidence because behaviour changes.

Not planned: any new attack, any new defence building, any change to a lockout, drain or penalty number.

## 9. Risks and alternatives

- Notification volume is a fun risk, not a footnote: a wall of alerts in the late game is worse than silence. Coalesce per `(actor, target)` per round
  into one notice listing the effects, and keep the reveal (PR 2) as the only notice that interrupts. Reuse the existing log cap.
- Go public could become a free kill switch on a civ with many treaties. Bounded by reusing `expose_scandal`'s cap and penalty, once per confirmed
  incident, and only with real evidence (a captured spy).
- Attribution accuracy: the `suspected` tier can be wrong only in the sense of being incomplete; it must never name a wrong civ. Tested.
- Alternative: skip PR 1 and ship only the AI fix. Cheaper, but leaves the trust defect.
- Alternative: close #419 now. Defensible; the reserve ideas are low-value without attribution.

## 10. Owner decisions (maximum five)

1. Park and close the speculative brainstorm in #419 once PR 1 merges, or keep it open for air-gap isolation?
2. Should disruption spy missions require war or a hostile relationship, or stay open-season (with Go public as the diplomatic cost when caught)? (Rule change; not assumed here.)
3. Approve PR 2: the confirmed-attribution reveal and the single Go public response, reusing `expose_scandal`'s bounds?
4. Approve PR 3: AI grudges and the AI's use of Go public (moves long-horizon baselines)?
5. Attribution policy: are the unknown / suspected / confirmed tiers right, or should a hit always name its actor?

## 11. Status of the rules used

Existing approved rules relied on: `action-contracts.md` (one legality source, typed denials), `caller-discipline.md` (audience contract), `end-to-end-wiring.md` (compute-must-render and
informational-mission persistence), `ui-panels.md` viewer safety, `game-systems.md` determinism and save classification. The recommendations in sections 6-8 and 12 are proposals and need owner authorization.

## 12. Fun review (revision, 2026-11-07)

The first draft fixed the plumbing and pushed the fun into reserve. Judged for fun, lovability and excitement:

- **Right priority, wrong framing.** For a family audience, a city that silently stops building feels like a bug. Explaining it is the biggest
  lovability gain available, but on its own it is hygiene, not excitement.
- **Espionage is fun as a loop: suspicion, reveal, response.** The first draft delivered only the notice. The revised arc delivers the loop:
  PR 1 the notice (and a moment for the attacker), PR 2 the reveal and one response, PR 3 an AI that remembers.
- **Landing a hit should feel good.** Finding 6: the attacker gets no confirmation. "Their factories are dark for 3 turns" is the cheapest fun in this report.
- **Ransomware's fun was the hostage moment, not the mechanic.** Rush-buy already is "pay up or wait it out"; the alert names it with its live price,
  so the drama comes back with no new rule.
- **Suspicion is a feature.** In hot-seat, "a hostile operator" between siblings or partners becomes a who-did-it game; catching the spy pays off with the reveal.
- **Reach matters.** Cyber missions start at eras 10-13, which few family campaigns reach. The arc covers earlier missions (sabotage, tech theft,
  unrest) too, so most players feel it. New cyber-only attacks would delight few players and are not recommended.
- **The AI should be a nemesis, not noise.** Random mission picks are invisible; an AI that targets whoever hit it, and gets named when caught, has a personality.

Revised sequence: PR 1 Caught in the Act notices (no new rule), PR 2 reveal + Go public (one rule, owner decision 3), PR 3 AI grudges (owner decision 4).

### Copyable first implementation prompt (PR 1 only; do not start PR 2 or 3 without approval)

> In conquestoria, implement PR 1 of `docs/cyber-espionage-design-419.md` (#419) in a fresh worktree. Scope: notifications only, no new rule, no new
> persisted state, no change to any effect or number. (1) Characterization tests first: which successful hostile missions currently notify nobody
> (`cyber_attack`, `misinformation_campaign`, `sabotage_production`, `steal_tech`, `incite_unrest`, `forge_documents`), what the attacker sees today,
> and that hostile missions need no war. (2) Add `espionage:operation-landed` from the existing `mission_succeeded` consequence in `espionage-turn.ts`,
> registered in the #1201 audience contract with actor and target roles, coalesced per (actor, target) per round. (3) A pure viewer-safe
> `getOperationAttribution` (unknown / suspected / confirmed from captured spies and embedded counter-spies), tested with `expectViewerSafety` and
> `expectHotSeatDifferential`. (4) Copy: the attacker's confirmation with the real effect; the victim's alert with the real effect and, for a lockout, the
> live `getRushBuyQuote` price or its refusal reason; cause lines in the city panel, research readout and strategic assessment. `textContent` only.
> (5) Prove a pre-change save loads and plays unchanged; `round-phase-order` literals unchanged. Run `./scripts/dev.sh verify-impact`, build and tests;
> open one PR, do not merge.
