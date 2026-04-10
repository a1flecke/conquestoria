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
- Council-safe naming and disambiguation for player-facing guidance surfaces

### 4.3 The Council Experience

The Council is a real companion layer, not a passive archive of advisor messages.

Slice 1 uses the **existing eight-advisor roster** as the voices of the Council. It does **not** wait for Slice 5’s deeper advisor-memory and lobbying systems before becoming useful. The Council must already be fully valuable in Slice 1 through structured recommendations, progress framing, explanation, and proactive tone.

The deeper advisor-personality mechanics land later:

- **Slice 1:** structured guidance, proactive interruptions, tunable talk level, clear recommendations, and lovable presentation
- **Slice 5:** persistent memory, lobbying, advisor disagreements with recall of prior recommendations, and “I told you so” callbacks

Slice 1 may include light presentational banter and reactive flavor, but it must not depend on persistent memory or recall-based callbacks to feel complete.

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
- Occasional banter and reactive lines

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
  Humor, interjections, and personality in Slice 1; true disagreements, lobbying, and memory-based callbacks in Slice 5

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

### 4.10 Council-Safe Naming Before Full Naming Integrity

Slice 1 must not wait for Slice 5’s full naming-system cleanup before becoming trustworthy.

Until the full naming-integrity work lands later in the milestone:

- the Council must disambiguate duplicate city names in its own output
- the Council must qualify ambiguous names with owner/civ context or other clear descriptors
- the Council must avoid presenting suspicious or lore-breaking names as if they are obviously correct
- Council, progress, and guidance surfaces must prefer clarity over raw underlying city-name strings

This is a presentation-layer safety rule for Slice 1. The full naming-data and naming-policy fix still belongs to Slice 5.

### 4.11 Council Privacy Model

The Council must never act as an information leak.

This is a hard milestone rule:

- The Council may only speak from information the current player is legitimately allowed to know
- It must not reveal unmet civilizations
- It must not reveal undiscovered cities
- It must not reveal hidden city-state names before discovery
- It must not reveal espionage, map, or strategic information the player has not actually earned

Allowed guidance examples:

- `A foreign civilization has been encountered` if the civ is legitimately met but city details remain unknown
- `A nearby foreign city may be worth watching` only if that city has actually been discovered
- `Your western frontier looks vulnerable` if that conclusion can be drawn from player-visible state

Forbidden guidance examples:

- naming Rome before Rome is discovered
- naming a city-state before its city tile is discovered
- recommending action against a civ the player has not met
- citing exact spy activity, city names, yields, or diplomatic facts the player has not learned

When the Council needs to guide the player through uncertainty, it must do so honestly:

- use generic labels such as `foreign city`, `unknown civilization`, or `city-state`
- speak in uncertainty terms when appropriate
- prefer omission over leaking hidden specifics

The Council should feel clever, not psychic.

---

## 5. Slice 2 - Smoother Turns

### 5.1 Intent

Slice 2 reduces repetitive work and lowers per-turn friction after the player already understands the game better.

### 5.2 Included Scope

Slice 2 ships:

- Initial balance smoothing pass
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
- final milestone-wide balance and UX consolidation pass

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

### 8.7 Final Balance And UX Consolidation

Because Slices 3-5 add major new progression, wonder, civ, and customization content after the initial smoothing work in Slice 2, M4e needs an explicit closing tuning gate.

Slice 5 must therefore include a milestone-wide consolidation pass that rechecks:

- Council usefulness after all five slices exist
- late-era pacing after the tech expansion
- wonder clarity and overload risk after the full catalog lands
- Wakanda, Avalon, and custom-civ trait balance
- desktop/mobile usability after the full M4e surface area exists

This is not optional cleanup. It is the final quality gate that makes the earlier Slice 2 smoothing work remain true after the rest of the milestone content lands.

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
6. **Council is not omniscient**
   The Council must obey the same information boundaries as the current player and current hot-seat viewer.
7. **Playable slices only**
   No “future slice required to make this usable” UI promises.
8. **Trustworthy naming in guidance surfaces**
   Before Slice 5 fixes the naming system completely, Council and progress views must still present unambiguous city references.

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

It also requires explicit privacy regression coverage for the Council:

- unmet-civ recommendations do not reveal civ identity
- undiscovered-city recommendations do not reveal city names
- undiscovered city-state recommendations use generic labels
- hot-seat Council output is formatted from `state.currentPlayer`, not another player’s knowledge
- advisor memory and callbacks never “remember” facts the current player was not allowed to know

It also requires explicit guidance-trust coverage:

- Council output stays unambiguous when duplicate city names exist
- Council output does not rely on raw underlying city names when that would create player confusion
- post-slice balance checks are rerun after late-era tech, wonder, and civ content land

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
5. Council and progress surfaces remain trustworthy and unambiguous even before the full naming-system cleanup lands.
6. Auto-explore and desktop affordances reduce click-work without creating obvious trust problems.
7. Late-era tech progression cleanly supports the remaining M4 wonder catalog.
8. The remaining legendary quest wonders are playable and understandable.
9. Advisor memory/disagreements/callbacks feel alive without becoming exhausting.
10. Wakanda, Avalon, and medium-depth custom civ creation are playable and coherent.
11. Naming integrity is fixed across fantasy, major, and minor civilization city naming.
12. A final post-content balance and UX consolidation pass is complete after all M4e slices land.
13. All explicitly assigned M4e issues are resolved.
14. Every slice lands as a complete, mergeable, playable value drop.
15. The Council never leaks hidden cities, unmet civilizations, undiscovered city-states, or any other player-invisible information.

---

## Appendix A - Approved M4 Legendary Wonder Roster

This appendix is the authoritative roster for the full M4 legendary quest-wonder catalog.

Code that mirrors this list must stay in the same order and use the same IDs and display names. If this appendix changes, the roster module and exact-equality tests must be updated in the same branch.

1. `oracle-of-delphi` — Oracle of Delphi
2. `grand-canal` — Grand Canal
3. `sun-spire` — Sun Spire
4. `world-archive` — World Archive
5. `moonwell-gardens` — Moonwell Gardens
6. `ironroot-foundry` — Ironroot Foundry
7. `tidecaller-bastion` — Tidecaller Bastion
8. `starvault-observatory` — Starvault Observatory
9. `whispering-exchange` — Whispering Exchange
10. `hall-of-champions` — Hall of Champions
11. `gate-of-the-world` — Gate of the World
12. `leviathan-drydock` — Leviathan Drydock
13. `storm-signal-spire` — Storm-Signal Spire
14. `manhattan-project` — Manhattan Project
15. `internet` — Internet
