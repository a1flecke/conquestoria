# M4e - "The Council" Design Specification

**Date:** 2026-04-08
**Status:** Proposed
**Depends on:** M4d merged on `main`, April 8 hotfix milestone merged on `main`
**Goal:** Make Conquestoria easier to love, easier to understand, and richer once it already feels good by delivering a proactive Council guidance experience, lower-friction play, late-era M4 foundations, the rest of the M4 quest-wonder catalog, and stronger player-expression systems.

---

## 1. Milestone Intent

M4e is no longer just a generic polish bucket. It is the milestone that turns the current game into something more welcoming, more understandable, and more lovable before it becomes broader.

For the target player, value is ordered like this:

1. Reduce friction and click-work
2. Make sessions feel rewarding sooner
3. Clarify what to do next and why it matters
4. Add more late-game goals once the game already feels good
5. Add more personality and self-expression after the core experience is smoother

That means M4e must not start with “more content.” It starts by making the game easier to navigate and easier to emotionally connect with.

The defining product bet for this milestone is that **The Council** becomes a real companion system, not just a set of advisor popups. It should help the player understand what to do, why it matters, and how they are progressing, while also being playful, funny, surprising, and affectionate enough to feel memorable rather than bureaucratic.

---

## 2. Scope

### 2.1 Existing M4e Roadmap Scope

M4e already owns the following approved roadmap items:

- Remaining legendary quest-wonder expansion
- Late-era tech tree expansion needed for the remaining M4 late-game content
- Advisor lobbying, disagreements, and “I told you so” callbacks
- Auto-explore
- Custom civilization creation
- Desktop UI enhancements
- Balance pass
- UX clarity pass
- Wakanda and Avalon

### 2.2 Open Issues Explicitly Pulled Into M4e

The following open issues are explicitly part of this milestone and must not be treated as optional polish:

- `#10` Having scout/explore mode would be great
- `#21` Do not know what to do
- `#31` I don't know what grid view does
- `#33` Not sure how to win
- `#48` Solo game start
- `#56` tech tree too long
- `#59` Incorrect city names for fantasy civilization
- `#60` Other City States/Minor Civs AND Major CivsCities Flash/Reveal their presence during their turn
- `#61` My own cities are giving me quests
- `#65` multiple cities with the same name

### 2.3 Explicitly Out Of Scope

These remain outside M4e:

- `#3` music quality overhaul
- `#9` graphics overhaul
- `#64` combat rewards / veterancy expansion
- Underground and deep ocean layers
- Full M5 diplomatic structures such as federations and World Congress
- Nuclear combat

Those belong in M5 or later and should not be smuggled into M4e.

---

## 3. Delivery Model

M4e is delivered as **five independently mergeable vertical slices**. Each slice must land on `main` before the next begins.

### 3.1 Slice Order

1. **Slice 1 - The Welcoming Council**
2. **Slice 2 - Smoother Turns**
3. **Slice 3 - Late Era Foundations**
4. **Slice 4 - More Ambition**
5. **Slice 5 - Identity And Personality**

### 3.2 Merge Gate Between Slices

Every slice must complete the full release loop:

1. Implement the slice end-to-end
2. Run targeted tests, full tests, and build verification
3. Commit the slice
4. Push the branch
5. Open an MR
6. Review and merge to `main`
7. Start the next slice from freshly updated `main`

No stacked, unmerged slice branches.

### 3.3 Definition Of Done Per Slice

A slice is complete only when:

- The promised player-facing loop is fully usable
- The new UI is understandable without external explanation
- The new state is serializable and save/load safe
- AI behaves coherently with the new systems where applicable
- Hot-seat behavior is current-player-safe
- Targeted regression coverage exists for the slice’s rules and UI
- The slice can merge without stubs for its promised scope

---

## 4. Slice 1 - The Welcoming Council

### 4.1 Intent

Slice 1 is the most important value-delivery slice for the target player. It exists to make the game easier to start, easier to understand, and easier to emotionally connect with.

This slice should resolve the feeling of:

- “I do not know what to do”
- “I do not know why this matters”
- “I do not know how I am progressing”
- “I do not know what this screen or mode is for”

### 4.2 Included Scope

Slice 1 ships:

- Solo new-game setup flow (`#48`)
- Tech-tree redesign (`#56`)
- The Council guidance view
- “What should I do next?” guidance
- “Why does that matter?” explanation
- Win-progress framing and domination progress explanation
- Grid-view explanation (`#31`)
- General actionable guidance for `#21` and `#33`
- Quest-origin sanity and clarity for `#61`

### 4.3 The Council Experience

The Council is a real companion layer, not a passive archive of advisor messages.

Slice 1 uses the **existing eight-advisor roster** as the voices of the Council. It does **not** wait for Slice 5’s deeper advisor-memory and lobbying systems before becoming useful. The Council must already be fully valuable in Slice 1 through structured recommendations, progress framing, explanation, and proactive tone.

The deeper advisor-personality mechanics land later:

- **Slice 1:** structured guidance, proactive interruptions, tunable talk level, clear recommendations, and lovable presentation
- **Slice 5:** persistent memory, lobbying, advisor disagreements with recall of prior recommendations, and “I told you so” callbacks

It should be:

- Proactive
- Playful
- Lovable
- Digestible
- Actionable
- Tunable

The Council must answer two core questions at all times:

1. **What should I do next?**
2. **Why does that matter for winning?**

### 4.4 Council Tone

The Council should feel alive and affectionate rather than dry and managerial.

It must include:

- Humor
- Light surprise
- Distinct advisor personalities
- Occasional banter and callback lines

It must avoid:

- Wall-of-text lecturing
- Overly serious bureaucratic tone
- Constant interruptions with low-value noise
- Advice that is cute but strategically useless

### 4.5 Council Structure

The Council view should surface a small number of top priorities first, then allow deeper reading.

Recommended buckets:

- **Do Now**
  Immediate turn-scale recommendations
- **Soon**
  Medium-term setup and empire-shaping steps
- **To Win**
  High-level domination path and progress framing
- **Council Drama**
  Disagreements, lobbying, callbacks, humor, and personality

The Council must be “deep at rest, shallow at first glance”:

- top-level summary should be digestible in seconds
- detail should be available when opened
- interruptions should be short and mode-aware

### 4.6 Proactivity And Tuning

The Council should be highly proactive by default, but player-tunable.

Required settings:

- `quiet`
- `normal`
- `chatty`
- `chaos`

Behavior expectations:

- `quiet`: mostly pull-based, only major warnings and milestone moments
- `normal`: steady, useful guidance with occasional flavor
- `chatty`: frequent advice and more personality
- `chaos`: energetic, surprising, and highly conversational, but still bounded enough to remain usable

### 4.7 New-Game Setup

Slice 1 must replace the weak solo start flow with an explicit setup flow that asks for the choices the player expects to make before the game begins.

At minimum:

- map size
- opponent count
- civilization selection
- campaign title if the current flow still requires it

The setup must feel intentional and friendly, not like a hidden developer menu.

### 4.8 Tech Tree Redesign

The current tech tree is too long and too hard to parse.

Slice 1 should redesign it so that:

- dependencies read like a tree rather than a long strip
- current and next-relevant layers are emphasized
- the player can understand what unlocks what
- the panel remains usable on both desktop and mobile

The redesign must not trade readability for spectacle.

### 4.9 Quest-Origin Clarity

Issue `#61` indicates confusion about where quests come from and why they appear.

Slice 1 must make quest origin legible:

- the player should understand which actor is issuing the quest
- own-city and city-state quest affordances must not blur together
- if a quest is invalid, impossible, or misattributed, the system should not present it

---

## 5. Slice 2 - Smoother Turns

### 5.1 Intent

Slice 2 reduces repetitive work and lowers per-turn friction after the player already understands the game better.

### 5.2 Included Scope

Slice 2 ships:

- Balance smoothing pass
- Auto-explore (`#10`)
- Desktop keyboard shortcuts
- Right-click menus
- Hover tooltips
- Remaining visibility/render polish from `#60`

### 5.3 Balance Smoothing Goal

The balance pass in M4e is not primarily about competitive numerical perfection. It is about making the game feel smoother and less annoying.

For the target player, this means prioritizing:

1. Less repetitive micromanagement
2. Better pacing and more rewarding sessions
3. Clearer decision-making
4. Fewer punishing gotchas

Every balance change should be justified in terms of reducing friction or improving feel, not abstract symmetry.

### 5.4 Auto-Explore

Auto-explore should work on:

- scouts
- relevant military units where safe/appropriate

It must:

- respect fog and wrapped maps
- avoid obviously suicidal movement when a safer explored path exists
- be cancelable and visible in unit state
- feel helpful, not random

### 5.5 Desktop Controls

Desktop enhancements should include:

- keyboard shortcuts for common actions
- right-click context menus where they reduce clicks
- hover tooltips that explain interactive elements and yields

They should respect the existing mobile-first architecture instead of forking the UI into a separate desktop product.

### 5.6 Residual Visibility/Render Polish

Issue `#60` belongs here and must be fully resolved:

- no flashing or revealing the presence of hidden cities/civs during turn transitions
- no player-visible presentation that contradicts the privacy/discovery model fixed in the hotfix pass

---

## 6. Slice 3 - Late Era Foundations

### 6.1 Intent

Slice 3 provides the missing late-era tech scaffolding that M4d intentionally deferred to M4e.

This slice exists so that the remaining late-game content can be added without hacks, placeholder techs, or broken progression.

### 6.2 Included Scope

Slice 3 ships:

- the remaining late-era tech expansion required by M4 content
- dependency wiring for the rest of the legendary wonder catalog
- readable late-era progression inside the redesigned tech tree

### 6.3 Requirements

The late-era expansion must be:

- complete enough to support the remaining M4 systems and wonders
- integrated into the redesigned tree, not bolted on
- understandable to the player in terms of unlock payoff

It must not become an uncontrolled expansion into full M5 era progression.

---

## 7. Slice 4 - More Ambition

### 7.1 Intent

Slice 4 adds the remaining legendary quest wonders once the late-era scaffolding is ready.

This should feel like a meaningful expansion of aspirational goals, not a content dump.

### 7.2 Included Scope

Slice 4 ships:

- the rest of the M4 legendary quest wonder catalog
- supporting quest patterns as needed
- wonder race UX and payoff clarity built on the M4d framework

### 7.3 Requirements

The expanded wonder set must:

- remain readable and discoverable
- avoid flooding the player with too many simultaneous wonder choices
- preserve the three-phase commitment model from M4d
- maintain race clarity, reward clarity, and loss-compensation clarity

This slice should deepen ambition, not increase confusion.

---

## 8. Slice 5 - Identity And Personality

### 8.1 Intent

Slice 5 closes M4e by deepening advisor personality and letting the player shape stronger identity.

### 8.2 Included Scope

Slice 5 ships:

- advisor memory
- lobbying
- disagreements
- “I told you so” callbacks
- Wakanda
- Avalon
- medium-depth custom civ creator
- city naming correctness and uniqueness fixes (`#59`, `#65`)

### 8.3 Advisor Memory And Personality

The Council must remember prior recommendations and outcomes well enough to support:

- callbacks
- light resentment or smugness when ignored
- reinforcement when advice worked
- disagreements between advisors over high-stakes choices

This should happen a small number of times per era for major decisions, not on every trivial move.

This slice deepens a Council that is already fully useful from Slice 1. It must add personality depth, not basic usability.

### 8.4 Custom Civ Creator Depth

The custom civ creator should be **medium-depth**, not trivial and not infinite.

It must support:

- civ name
- color
- city-name pool
- leader presentation
- curated balanced bonus packages
- a constrained trait budget allowing 2-3 traits

It should avoid a huge combinatorial design surface that would be hard to balance in M4e.

### 8.5 Wakanda And Avalon

Wakanda and Avalon should land here because this slice is about identity and expression:

- Wakanda reinforces hidden-tech / strategic sophistication themes
- Avalon reinforces quest/wonder/chivalric themes

They should feel mechanically distinct and aligned with the mature M4 systems already in place.

### 8.6 Naming Integrity

Issues `#59` and `#65` must be resolved with a real naming policy:

- city names should not collide nonsensically across major civs, fantasy civs, and minor civs
- fantasy civs need civ-appropriate naming pools
- the system should prefer globally unique names unless there is a deliberate lore reason not to

This should be solved as a naming/data-model rule, not just a patch for one reported example.

---

## 9. UI And UX Standards For The Whole Milestone

M4e must preserve these standards across all slices:

1. **Helpful before clever**
   Humor and charm are additive, not a substitute for clarity.
2. **Digestible hierarchy**
   The first screenful of any panel should orient the player.
3. **Desktop and mobile both matter**
   M4e adds desktop affordances without breaking the mobile-first foundation.
4. **No hidden magic**
   If the game recommends something, it should explain why.
5. **No privacy regressions**
   Discovery, contact, and city-state privacy rules from the hotfix milestone remain authoritative.
6. **Playable slices only**
   No “future slice required to make this usable” UI promises.

---

## 10. Testing And Quality Requirements

Every slice must ship with:

- targeted rule tests
- targeted UI tests
- hot-seat/current-player safety coverage where relevant
- save/load regression coverage for new persistent state
- full suite pass
- build pass

M4e also requires stronger acceptance-style coverage than earlier milestones in two areas:

1. **Guidance quality**
   The Council and related UX systems need tests that prove the player sees actionable information, not just that strings exist.
2. **No-friction regressions**
   Auto-explore, setup flow, tech-tree redesign, and desktop affordances need tests that reflect actual user flows rather than only helper-level behavior.

The milestone plan must explicitly call out file ownership, UI test realism, regression risk areas, and vertical-slice release gates.

---

## 11. Issue Mapping

| Issue | M4e Slice | Reason |
|------|-----------|--------|
| `#48` Solo game start | Slice 1 | Start-of-session friction and setup clarity |
| `#56` Tech tree too long | Slice 1 | Core readability and navigation problem |
| `#21` Do not know what to do | Slice 1 | Core guidance failure |
| `#31` I don't know what grid view does | Slice 1 | Explanation/education failure |
| `#33` Not sure how to win | Slice 1 | Missing progress and victory framing |
| `#61` My own cities are giving me quests | Slice 1 | Quest-origin clarity and correctness |
| `#10` Scout/explore mode | Slice 2 | Reduce click-work |
| `#60` Turn-transition flashing/reveal polish | Slice 2 | Residual visibility/render polish |
| Remaining late-era tech expansion | Slice 3 | Required M4 scaffold |
| Remaining quest wonders | Slice 4 | Content expansion after tech scaffold |
| `#59` Incorrect fantasy city names | Slice 5 | Naming integrity and civ identity |
| `#65` Multiple cities with same name | Slice 5 | Naming uniqueness and data integrity |

---

## 12. Milestone Boundary With M5

M4e should make the current game better to play and more expressive, but it should stop before it becomes a general “everything else” milestone.

M5 still owns:

- underground and deep ocean layers
- 120+ wonders beyond the M4 set
- 4-player hot seat
- music overhaul
- graphics overhaul
- combat reward/veterancy expansion
- nuclear combat
- larger diplomatic endgame structures

M4e is about **guidance, flow, clarity, ambition, and identity** inside the current game’s scale.

---

## 13. Success Criteria

M4e is complete only when all of the following are true:

1. A new player can start a solo campaign through a clear setup flow.
2. The Council gives actionable, understandable, and tunable guidance.
3. The player can understand both what to do next and why it matters for winning.
4. Grid view, tech-tree progression, and domination progress are legible without outside explanation.
5. Auto-explore and desktop affordances reduce click-work without creating obvious trust problems.
6. Late-era tech progression cleanly supports the remaining M4 wonder catalog.
7. The remaining legendary quest wonders are playable and understandable.
8. Advisor memory/disagreements/callbacks feel alive without becoming exhausting.
9. Wakanda, Avalon, and medium-depth custom civ creation are playable and coherent.
10. Naming integrity is fixed across fantasy, major, and minor civilization city naming.
11. All explicitly assigned M4e issues are resolved.
12. Every slice lands as a complete, mergeable, playable value drop.
