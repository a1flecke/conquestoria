# M4d - "Grand Ambitions" Design Specification

**Date:** 2026-04-07
**Status:** Proposed
**Depends on:** M4c on `main`, M5 fix-it changes already landed on `main`
**Goal:** Deliver the first complete late-game ambition layer for Conquestoria by finishing the breakaway-faction arc, introducing legendary quest wonders, and adding Stage 5 espionage with the Artisan advisor and M4d civ roster.

---

## 1. Milestone Intent

M4d keeps the approved M4 roadmap scope but changes how it is delivered. Instead of running full breakaway, quest wonders, Stage 5 espionage, the Artisan advisor, and the new civilizations as parallel workstreams, M4d is executed as three vertical slices that each land on `main` before the next slice begins.

This milestone exists to add player-visible strategic ambition, not just more mechanics. Every slice must end in a playable, mergeable state with complete UI, AI, save/load handling, and tests for the slice's promised behavior.

---

## 2. Delivery Model

### 2.1 Vertical Slice Order

M4d is delivered in this sequence:

1. **Slice 1 - Full Breakaway**
2. **Slice 2 - Legendary Quest Wonders**
3. **Slice 3 - Digital Espionage, Artisan, and M4d Civs**

### 2.2 Merge Gate Between Slices

Each slice is its own delivery branch and must complete the full release loop before the next slice starts:

1. Implement the slice end-to-end
2. Run build and targeted/full verification
3. Commit the work
4. Push the branch
5. Open an MR
6. Review and merge to `main`
7. Start the next slice from freshly updated `main`

This is a hard milestone rule, not a suggestion. No stacked, unmerged slice branches.

### 2.3 Definition Of Done Per Slice

A slice is only complete when:

- The user-facing feature loop is fully playable
- The new state is serializable and save/load safe
- The UI explains the feature clearly enough to use it
- AI handles the feature without obvious dead behavior
- Regression and rule tests cover the new behavior
- The slice can merge independently without stubs for its promised scope

---

## 3. Slice 1 - Full Breakaway

### 3.1 Intent

M4c already delivers unrest and revolt. Slice 1 completes that ladder by allowing unresolved revolt to create an actual separatist polity that can later mature into a full civilization if left unresolved.

This slice closes an existing player-facing arc and should be the first merged M4d value drop.

### 3.2 Progression Ladder

The city instability ladder becomes:

1. **Unrest**
2. **Revolt**
3. **Breakaway State**
4. **Established Civilization**

Stages 1 and 2 already exist from M4c. M4d adds stages 3 and 4.

### 3.3 Breakaway State

If a city remains in revolt long enough to trigger secession, it becomes a **breakaway state**.

Breakaway-state rules:

- The city leaves the former owner's control
- A new faction identity is generated deterministically
- The new faction receives a color, name, city ownership, and local territory claim
- Eligible units in the city's local area transfer to the breakaway state
- The breakaway state starts hostile to the former owner and neutral to other civs
- The faction is defensive and local, not expansionist
- Diplomacy is intentionally limited during this phase

This actor should use the normal game-state civilization model wherever possible, but with constrained behavior rules rather than a wholly separate bespoke system.

### 3.4 Established Civilization After 50 Turns

If the breakaway state remains unresolved for **50 turns**, it graduates into an **established civilization**.

At that transition:

- It stops using constrained breakaway behavior
- It enters the normal AI-civ behavior model
- It can pursue broader diplomacy and long-term survival
- The player is explicitly notified that a temporary separatist crisis has hardened into a durable rival

This timer must be stored directly in state and tested deterministically.

### 3.5 Resolution Paths

The former owner has three valid responses:

1. **Military reconquest**
2. **Diplomatic reabsorption**
3. **Strategic tolerance**

Rules:

- Reconquest retakes the city but leaves major instability pressure so brute-force recapture is not a permanent loyalty fix
- Reabsorption requires a meaningful relationship and cost gate, not just a click-through reclaim
- Leaving the faction alone is valid, but risks the 50-turn promotion into a full civilization

### 3.6 AI Requirements

AI must:

- Recognize breakaway states as real strategic actors
- Prioritize recovering recently lost core cities when reasonable
- Understand that ignoring a breakaway for 50 turns has escalating strategic cost
- Avoid obvious dead behavior such as permanent passivity by the former owner or suicidal overreaction by uninvolved civs

### 3.7 UI Requirements

Slice 1 needs enough UI to make the system understandable:

- Map indication that a city has seceded
- Diplomacy visibility for the breakaway actor
- Clear turn-pressure messaging toward the 50-turn establishment threshold
- Resolution affordances for reconquest or reabsorption

---

## 4. Slice 2 - Legendary Quest Wonders

### 4.1 Intent

Slice 2 adds the first complete implementation of legendary quest wonders. It ships the full system but only a curated set of initial wonders. The rest of the legendary-wonder content expansion moves to M4e.

### 4.2 Three-Phase Commitment

Every legendary quest wonder follows this structure:

1. **Eligibility**
2. **Quest chain**
3. **Construction race**

#### Eligibility

The wonder is unavailable unless the civ and city meet explicit requirements such as:

- Required techs
- Required resources
- Required city characteristics or map context

#### Quest Chain

The wonder unlocks through a multi-step quest, usually 2-3 objectives, tied to normal gameplay such as:

- Exploration
- Trade
- Combat
- Infrastructure or empire development

#### Construction Race

After the quest is complete, the wonder becomes constructible in a city and enters a normal race against rivals that qualify.

### 4.3 Initial M4d Wonder Count

M4d should ship **4** legendary quest wonders, selected to exercise different quest patterns and late-game goals.

The rest of the legendary quest wonder catalog moves to **M4e**, which becomes the content-expansion milestone for additional quest wonders and related polish.

### 4.4 Losing The Race

If a civ loses the construction race for a legendary quest wonder:

- **25%** of invested construction is converted to coins immediately
- **25%** becomes transferable production that can be applied to a new construction choice in the same city
- The remaining **50%** is lost

This rule applies to quest wonders specifically and replaces the earlier broader consolation language.

### 4.5 UI Requirements

The player must be able to understand:

- Why a wonder is or is not eligible
- Which quest steps remain
- Which city can build it once unlocked
- Whether the race is at risk
- What compensation is received if the race is lost

This should be explained through city and wonder UI, not hidden behind trial and error.

### 4.6 AI Requirements

AI should:

- Pursue only wonders it can realistically qualify for
- Prefer wonders aligned with its strategic personality
- Understand when to abandon a losing race
- Benefit from the same consolation rules as the player

---

## 5. Slice 3 - Digital Espionage, Artisan, And M4d Civs

### 5.1 Intent

Slice 3 completes the M4d roadmap by layering late-game covert power, wonder-focused advisory guidance, and thematic civilization content onto the systems stabilized in Slices 1 and 2.

### 5.2 Stage 5 Espionage

Stage 5 espionage should feel meaningfully different from prior stages.

Required qualities:

- Some operations can be executed remotely rather than through standard placed-spy flow
- Late-game counter-intelligence pressure matters and punishes undefended empires
- Missions create large strategic swings and must be clearly legible in UI
- Remote power is expensive, gated, and not spam-friendly

The goal is escalation, not mission bloat.

### 5.3 Artisan Advisor

The Artisan is the player-facing guide for late-game ambition.

The advisor must:

- Suggest viable legendary quest wonders
- Warn when a wonder race is threatened
- React to wonder completion or loss
- Comment on cultural legacy and empire ambition in a way that complements, rather than duplicates, existing advisors

The Artisan exists to make the wonder system legible and emotionally resonant, not just decorative.

### 5.4 M4d Civilization Package

M4d ships:

- **Lothlorien**
- **Narnia**
- **Atlantis**

Their bonuses should reinforce M4d themes rather than act as disconnected stat modifiers. At least one should align strongly with wonders/culture, at least one with geography or long-horizon empire planning, and at least one with late-game strategic asymmetry.

### 5.5 AI Requirements

AI must:

- Use Stage 5 espionage selectively and coherently
- React to remote operations and stronger late-game spy pressure
- Incorporate Artisan-supported wonder competition without deadlocking city production
- Play the new civ bonuses competently enough to showcase their identity

---

## 6. Milestone Boundary With M4e

M4e keeps its existing identity as the follow-on strategic polish milestone, but its wonder responsibility is clarified:

- **M4d**: quest-wonder system plus 4 flagship legendary quest wonders
- **M4e**: additional legendary quest wonders, broader advisor depth, desktop UI enhancements, auto-explore, custom civs, and balance/polish

This prevents M4d from turning into a large content dump while still ensuring the quest-wonder framework ships in a complete form first.

---

## 7. Architecture Notes

- Follow the existing event-driven design
- Keep all new state serializable plain objects
- Respect hot-seat rules by using `state.currentPlayer`
- Keep bilateral diplomacy updates symmetric
- Use seeded deterministic timing and identity generation for breakaway-state creation and maturation
- Avoid introducing special-case systems when constrained behavior on top of existing civ/diplomacy structures will suffice

---

## 8. Testing Expectations

Each slice needs targeted regression coverage before merge.

Minimum expectations:

- **Slice 1**: revolt-to-breakaway transition, 50-turn promotion to full civ, reconquest instability, reabsorption gating
- **Slice 2**: eligibility checks, quest-step progression, construction unlock, race loss compensation
- **Slice 3**: Stage 5 mission gating/effects, Artisan trigger behavior, new-civ bonus coverage

Any conjunctive rule must get negative tests proving that partial satisfaction is insufficient.

---

## 9. Out Of Scope For M4d

- Full legendary quest wonder catalog beyond the initial 4
- M4e advisor lobbying/disagreements depth
- Desktop-specific UI enhancement package
- Auto-explore
- Custom civilization creation
- Broad late-game balance sweep beyond what is needed to ship each M4d slice safely

---

## 10. Success Criteria

M4d is successful if:

- Players can experience a full rebellion-to-secession-to-rival arc
- Legendary quest wonders create real long-horizon goals instead of just bigger build queues
- Late-game espionage feels distinct, dangerous, and understandable
- Each slice lands independently on `main` with visible player value before the next begins
