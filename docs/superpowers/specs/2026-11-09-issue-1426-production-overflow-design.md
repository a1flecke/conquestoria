# Production overflow: measured behaviour and one recommendation (#1426)

**Status:** accepted by the owner on 2026-11-09 (section 9; the 3D Printing rate is 25%, not the 50% drafted in 7.4).
Implementation is in progress in the three PRs of section 8; the last one deletes this file (`spec-fidelity.md`,
plan lifecycle).

**Audit base:** `origin/main` @ `8c8046ca8733b13b9d232831b51de1983aa67d41` (2026-11-09). Main did not move during the
investigation.

## 1. The decision in one paragraph

Recommend **"carry-forward, one turn's worth"**: when a city finishes an item, the production left over from that
turn becomes the starting progress of the city's next item — whatever is queued next or chosen next turn — but the
stored amount can never exceed one turn of that city's output. A city still finishes at most one item per turn.
**3D Printing** stops being the only way to keep overflow and instead turns the production that still cannot be kept
into **gold at half value**. Player copy: *"Extra production carries over to your next build, up to one turn's
worth."* Measured on today's main, the current rule throws away 7–11% of AI output in ordinary campaigns and
**25% in a 200-round late game** (29% in its last third); re-simulated under the candidate rule, overflow loss is
zero, total waste falls from 11–14% to 3–6% (and from 47% to 29% in the late game), and unit output moves by at
most +5%. It also closes an unbounded production bank that 3D Printing allows today (3.2), needs no AI queueing
change, and keeps every persisted field. It leaves one real, visible cost in place: a very productive city that
keeps building items far cheaper than its output still loses the excess.

The investigation also found a **separate and larger AI defect**: the AI buys its only queued item after choosing
production, leaving the queue empty, so the city's whole turn of output is lost. That alone is 21.8% of AI output in
the late-game campaign (3.3). It is not an overflow rule question and is proposed as its own follow-up.

## 2. What the game does today (verified on the audit base)

| Fact | Where |
|---|---|
| A city completes **at most one** item per turn | `processCity`, `src/systems/city-turn.ts` |
| Overflow survives a completion only with `3d-printing` **and** another item queued behind | `canCarryProductionOverflow`, `city-turn.ts:73` |
| When it survives it is **uncapped**: `productionProgress = progress − cost` | `completeCityProductionItem`, `city-turn.ts:113-125` |
| Every unit of output is accounted: `produced = applied + carried + convertedGold + convertedScience + discarded` | `ProductionDisposition`, `city-turn.ts:17-42` |
| Output withheld while the head waits for materials is counted in `discarded`, flagged `withheldByMaterials` | #1506 MR09, `city-turn.ts:318-322` |
| Idle conversion (`City.idleProduction`) credits gold or science only when the queue is empty at the start of the turn | `city-turn.ts:356-364` |
| The city panel already warns about projected surplus that will be lost, and explains the 3d-printing rule | `getProductionDecision().overflow`, `production-decision-copy.ts:42-50` |
| Enqueueing onto an empty queue **keeps** stored `productionProgress` | `enqueueCityProduction`, `planning-system.ts:79-89` |
| Changing the active item erases stored progress (the panel warns and asks for a second tap) | `planning-system.ts:128-159`, `describeHeadChangeLoss` |
| Starting a legendary wonder build carries the city's stored progress into the wonder | `legendary-wonder-system.ts:897,976` |
| The AI enqueues **one** item, and only into a city whose queue is empty | `applyAIProductionWithReport`, `src/ai/ai-production.ts:928-985` |
| The AI values 3d-printing as a MAJOR (0.5) economy effect | `ai-tech-bespoke-value.ts:100` |
| Rush-buy costs 2.5 gold per remaining production | `ECONOMY_RULES.rushBuyMultiplier`, `economy-system.ts:74` |
| `3d-printing` is an era-12 metallurgy tech (cost 1530), prerequisite of two era-13 techs | `tech-definitions-eras12.ts:89`, `tech-definitions-eras13.ts:22,24` |

**Changes since the previous recommendation comment on #1426** (written against `707a3e9f`): the rule itself is
unchanged. The disposition gained `withheldByMaterials` (#1506 MR09), so material waiting can now be separated from
overflow, and materially waiting items keep their progress instead of being dequeued. The player-facing warning from
#1428/#1430 is live and is not re-proposed here.

## 3. Measured evidence

### 3.1 Method

Everything below was produced by one temporary harness (Appendix A, not committed) that reads the existing
`city:production-disposition` events emitted by the real turn path, and by the real catalog prices through
`getProductionCostForItem`. Only AI seats are counted: the fixture's human seat takes no actions, so its output is
idle and would inflate "waste". Discards are split three ways per city-turn:

- **completion overflow** — the item completed and some of this turn's output was not needed (`appliedToBuild > 0`,
  `discarded > 0`, not withheld). This is the waste #1426 is about;
- **materials withheld** — the head is waiting for its hard recipe (`withheldByMaterials`);
- **no sink** — the turn's output found nothing queued and no idle conversion set. Where it was traced (3.3), every
  case was a queue the AI had just emptied by buying its only item.

Commands (from the worktree root):

```sh
./scripts/run-with-mise.sh yarn vitest run tests/simulation/zz-overflow-1426-measure.test.ts
python3 -I post.py .verification/overflow-1426/*.rows.json   # Appendix A
```

### 3.2 A latent exploit in the current 3d-printing rule

The carry under 3d-printing is uncapped, and one item per turn means a city that keeps a cheap item queued banks the
difference every turn. Probe (Appendix A, `bank probe`): era-12 city, 150 production, four 8-cost warriors re-queued
each turn.

| Turn | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Stored progress after the turn | 142 | 284 | 426 | 568 | 710 | 852 | 994 | **1136** |

The bank is spent on whatever comes next: a national project or, via `startLegendaryWonderBuild`, a legendary wonder.
It is reachable only by a human player today, because the AI never queues a second item (section 2), so the AI
receives nothing from a tech it values at 0.5. Both halves are a reason to change the rule even before the waste
numbers: the current 3d-printing effect is simultaneously an endgame exploit for humans and dead value for the AI.
(Real cheap items at era 12 are scouts at 5 and workers; warriors would be obsolete, which does not change the shape.)

### 3.3 Campaigns (AI seats, existing fixture, current rules)

| Campaign | Rounds | Produced | Built | Idle → science | Overflow lost | Materials withheld | No sink (queue emptied by a purchase, see below) | Max city output |
|---|---|---|---|---|---|---|---|---|
| `continuity-baseline` (small, 2 AI, standard) | 60 | 2594 | 1350 (52%) | 876 (34%) | **248 (9.6%)** | 0 | 120 | 29 |
| `overflow-1426-builder-medium` (medium, 3 AI: expansionist/diplomatic/trader) | 100 | 13985 | 7361 (53%) | 4947 (35%) | **1464 (10.5%)** | 0 | 213 | 32 |
| `measure-late` (small, Era-9 start, aggressive/trader) | 60 | 3465 | 3075 (89%) | 0 | **248 (7.2%)** | 0 | 142 | 31 |
| `lh-1107-search-0` (`lh-late-era-medium`'s configuration, medium, 3 AI, Era-9 start; 200 of its 250 rounds) | 200 | 127818 | 58425 (46%) | 9345 (7%) | **32204 (25.2%)** | 0 | **27844 (21.8%)**¹ | 176 |

¹ 886 of these are completions whose cost was already covered by stored progress, so the whole turn was surplus;
the other 26,958 are the purchase-emptied queues described below.

What the numbers say:

- **Overflow is a steady 7–11% of AI output while cities stay under ~35 output**, in every third of those campaigns,
  not only late (e.g. builder-medium: 12.4% / 8.2% / 11.4% by thirds). Once
  cities grow past that, it climbs steeply: in the `lh-late-era-medium` configuration it is 4.7% / 16.2% / **28.8%**
  by thirds, with the largest city at 176 production, and the last third discards **52.6%** of all AI output once
  the purchase defect below is added. The historical "~70% in rounds 186–200" figure in #1426 is therefore the right
  order of magnitude for today's late game, not an outlier.
- **It is not unit spam.** Overflow on a repeat of the city's previous item is 2 of 44, 12 of 198, 6 of 30 and 66 of
  641 completion events. The completions it follows are workers, early buildings (library, granary-class, barracks,
  herbalist, stable, caravanserai) and settlers.
- **About half the overflow events are "the city made twice what it needed"** (22/44, 97/198, 15/30), which is what a
  carry cap must survive without rounding most of it away.
- **"No sink" is a separate AI defect, not overflow.** In the two campaigns where completions outside city
  production were captured (`continuity-baseline`, `lh-1107-search-0`), **every** no-sink city-turn (29 of 29 and
  376 of 376; 120 and 26,958 production) followed a same-round AI purchase: `applyAIGoldSpending`
  (`ai-treasury.ts:111`) runs after `applyAIProduction` in the AI turn (`basic-ai.ts:1172-1179`), buys the only
  queued item, and nothing refills the queue, so the world phase processes the city with an empty queue and no
  conversion and the whole turn's output is lost. #1415 guarded only *redundant* purchases. This is the same class as
  #1415/#1418 (the AI wasting output through its own decision), it is **not** fixed by any overflow rule, and it is
  proposed as its own follow-up (section 9). A human who buys their only queued item and ends the turn loses that
  turn's output the same way.
- **Materials withheld nothing** in these campaigns; the waiting-for-materials output is real but rare and is not
  overflow. **Idle conversion is the largest non-build sink by far** (a third of output in the two standard-start
  campaigns): cities with nothing worth building. That is #1094's problem, not this one, and no overflow rule touches
  it.
- `carriedOver` is **zero** in every campaign: no AI civ ever benefits from the current rule.

### 3.4 Where cheap items sit against mature output (catalog, reference economy)

`productionMaximal` is the single-city completionist reference (`pacing-reference-economy.ts`), `repAvg` the
representative per-city average. "≤ out" counts available items whose canonical cost is at most one turn of the
maximal city's output.

| Era | Max output | Rep. avg | Settler | Cheapest military | Median military | Military ≤ out | Strongest | Median building | Buildings ≤ out |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 7 | 3 | 24 | warrior 8 | 8 | 0/1 | warrior 8 | 10 | 0/4 |
| 4 | 27 | 14 | 48 | archer 30 | 47 | 0/6 | knight 68 | 48 | 5/28 |
| 7 | 43 | 34 | 72 | swordsman 43 | 94 | 1/12 | cuirassier 128 | 50 | 13/42 |
| 8 | 65 | 68 | 61 | horseman 45 | 119 | 1/9 | cuirassier 122 | 63 | 26/47 |
| 10 | 118 | 89 | 73 | war elephant 76 | 154 | 1/11 | battleship 194 | 99 | 42/65 |
| 12 | 155 | 106 | 86 | war elephant 76 | 178 | 4/17 | main battle tank 197 | 122 | 61/88 |
| 13 | 162 | 119 | 92 | war elephant 76 | 178 | 6/17 | main battle tank 197 | 131 | 70/96 |

From era 8 on, half to three quarters of the buildings a city can build cost one turn or less of a mature city's
output, while only 1–6 military units do. So the waste is mostly a **building-catch-up** phenomenon, and any rule that
lets more than one item finish per turn would mostly accelerate cheap buildings and the handful of cheap units —
exactly the place spam would come from.

### 3.5 Counterfactual re-simulation of the recommended rule

The candidate rule (7.1) was applied to `src/systems/city-turn.ts` as an uncommitted patch (Appendix A), every
campaign was re-simulated from the same seeds, and the patch was reverted (`git diff --quiet src` confirmed clean).
These are full re-simulations, so trajectories diverge (production, growth and choices change), not arithmetic on
the old stream. "Forfeited" is stored progress above the one-turn cap (7.1).

| Campaign | Overflow lost | Purchase-emptied | Forfeited (new) | **Total waste** | Completions | Units completed |
|---|---|---|---|---|---|---|
| `continuity-baseline` | 9.6% → 0 | 4.6% → 4.5% | 0 → 1.0% | **14.2% → 5.5%** | 47 → 52 | 20 → 25 |
| `overflow-1426-builder-medium` | 10.5% → 0 | 1.5% → 1.9% | 0 → 1.6% | **12.0% → 3.4%** | 218 → 216 | 73 → 77 |
| `measure-late` | 7.2% → 0 | 4.1% → 4.0% | 0 → 2.0% | **11.3% → 6.0%** | 38 → 36 | 27 → 26 |
| `lh-1107-search-0` | 25.2% → 0 | 21.8% → 15.2% | 0 → 13.5% | **47.0% → 28.7%** | 669 → 761 | 233 → 244 |

Reading it:

- Overflow loss goes to zero by construction; total waste falls by half to three quarters in ordinary campaigns.
- **No unit spam.** Unit completions move by −1 to +11 per campaign: +5% in the 200-round late game, and +25% only
  in the small 60-round campaign where the base is 20 units. Completions as a whole move −5% to +14%, the increase
  concentrated in the late game, which is the intended effect.
- **The one-turn cap does bind, and only in the extreme case**: 13.5% of output is forfeited in the 176-output late
  game, where AI cities keep building workers and expeditions far cheaper than their output. That is the remaining,
  deliberate cost of the one-item-per-turn contract (6.2), and it is where 3D Printing's new effect pays (7.4). It
  also says the AI's late-game choice of item is worth a look once the purchase defect is fixed.
- The 3d-printing bank (3.2) under the rule: stored progress `142, 150, 150, …` — capped at one turn's output.

### 3.6 Limitations

- AI-only. Human play queues several items and will see a different mix; the fixture's human seat is idle.
- Fixed seeds, one challenge tier (standard). The rule is difficulty-invariant, so this matters less than coverage of
  play styles; the `trader`/`aggressive`/`expansionist`/`diplomatic` personalities are the variety available.
- The historical 94–120-output, ~70%-waste window cited in #1426 came from rounds 186–200 of the full 250-round
  `lh-late-era-medium` run before #1418. The re-measurement above uses the same configuration on today's main
  but stops at round 200 to stay inside a reasonable local run; rounds 200–250 were not measured.
- Turns-to-next-useful-improvement were not measured directly: the disposition does not record the item's cost.
  Section 3.4 is the static answer (how many available items cost under one turn).
- First-order arithmetic in earlier comments ("cap binds or not") is superseded by the re-simulation in 3.5.

## 4. How other games handle it

Facts are separated from opinion. None of these establishes what Conquestoria should do.

| Game | What happens to surplus | Source and its quality |
|---|---|---|
| Civilization IV (Warlords 2.08; reported same in BtS 3.03) | Carries to the next item, **capped at the larger of the item's base cost and the city's hammers per turn**; anything above the cap becomes gold. | CivFanatics strategy article, worked examples ([Hammer Overflow](https://civfanatics.com/civ4/strategy/empire-management/hammer-overflow/)); community testing, not official docs. |
| Civilization IV, AdvCiv mod | Keeps one unit per turn on purpose; the mod author argues multiple units per turn would be undesirable (city defenders); unit overflow turns into gold. | Mod author in [CivFanatics thread](https://forums.civfanatics.com/threads/multiple-units-per-turn-unit-overflow-gold-wonder-fail-gold.683156/). Opinion of a designer, mod-specific. |
| Civilization V | Disputed. One forum post reports a cap of "current income or the last item's cost, whichever is greater"; a Civ V thread reports it carries the turn after. | [CivFanatics overflow thread](https://forums.civfanatics.com/threads/overflow.377387/page-2); weak, contradictory. |
| Civilization VI | Overflow from base production goes into the next item; policy-card bonuses on overflow were restricted in Gathering Storm because players exploited "build to nearly done, then finish under a bonus". | [Civ VI wiki: Production](https://civilization.fandom.com/wiki/Production_(Civ6)) (community wiki, seen via search excerpts). |
| Humankind | Industry beyond the cost carries into the next queued item or is stocked for the next turn. | [Humankind wiki: FIMS](https://humankind.fandom.com/wiki/FIMS) (community wiki). |
| Old World | A single player reports overflow capped at one turn of the city's production, the rest going to the empire stockpile. | [Reddit r/OldWorldGame](https://www.reddit.com/r/OldWorldGame/comments/1jcnqwl/how_exactly_is_production_overflow_handled/) (one unverified comment, seen via a search excerpt). |
| Endless Space 2 | Leftover industry carries roughly one turn; players say it is poorly explained and propose conversion or decay instead. | [Amplitude forum thread](https://community.amplitude-studios.com/amplitude-studios/endless-space-2/forums/66-game-design/threads/29899-industry-overflow?page=1) (player opinion; no developer reply). |
| Freeciv21 | Surplus shields carry; some rulesets give extra build slots so several **units** finish in one turn; only one building per turn. | [Longturn docs: turn change](https://longturn.readthedocs.io/en/stable/Playing/turn-change.html) (official project docs). |

**Pattern (fact):** carry is the genre norm, usually bounded by about one item or one turn; conversion to gold
appears as the "above the cap" outlet (Civ IV) or a proposal (ES2). **Recurring lesson (opinion, consistent across
communities):** unbounded carry combined with lump sources or multipliers gets exploited, and invisible loss gets
noticed and argued about. Civilization VII, Old World official documentation and Age of Wonders: Planetfall turned up
no usable source; nothing is claimed about them.

## 5. Options compared

"Recovered" is the measured share of output the option would stop discarding in the campaigns of 3.3.

| | A. Today + warning | B1. Carry to a queued item (3d-printing for all) | **B2. Carry-forward, ≤ one turn (recommended)** | B3. Carry capped at the finished item's cost | C. Convert surplus at 50% | D. Up to N completions per turn | E. Era cost floors |
|---|---|---|---|---|---|---|---|
| Player experience | Warned, still loses it | Loses it unless queued ahead | Extra goes to the next build | As B2, but a big city loses most of a cheap item's surplus | Small trickle of gold/science | Big cities finish piles of cheap items | Cheap items stop being cheap |
| Meaningful choices | Queue something bigger | Queue management | Queue bigger / set idle focus (still matters, see 6) | Same as B2 | Weak: no decision | Queue length, micromanagement | Fewer cheap options |
| Small vs mature city | Mature loses more | Same | Bounded by own output: scales fairly | Mature capped hardest | Same | Mature gains most | Rebalances both |
| Tall vs wide | Penalises tall | Same | Neutral | Penalises tall | Neutral | Strongly favours tall | Hits wide catch-up |
| Military spam | none | small | small: still one item/turn | small | none | **high** (cheap units) | lowers |
| Wonder/NP racing | none | **unbounded bank** (3.2) | ≤ one turn's head start | ≤ one item's cost | none | none | rebalances every race |
| AI/human parity | parity | **broken**: AI never queues ahead | parity, no AI change needed | parity | parity | needs AI queue work | parity |
| Materials | unchanged | unchanged | carried progress waits with the item | same | unchanged | needs per-item material checks | unchanged |
| Rush-buy | unchanged | next item cheaper if queued | next item cheaper (≤ one turn) | same | unchanged | buys rarely needed | repriced |
| Idle conversion | unchanged | unchanged | unchanged (stored progress waits) | unchanged | a second conversion path | unchanged | unchanged |
| Save compatibility | none | none | none: `productionProgress` already persisted; non-zero with empty queue becomes legal (already loadable) | none | none | none | cost migration analysis |
| Implementation | done | one predicate | one function + accounting field | one function | small | queue loop, events, UI timeline, AI | every pacing gate |
| Recovered (measured) | 0 | ~0 for AI | **all overflow; total waste 11–47% → 3–29% (3.5)** | lower (3.3: half of events are ≥2× need) | 50% of overflow, as gold | depends on queue depth | n/a |
| One sentence | "Extra production is lost." | "Extra goes to the next queued item." | "Extra production carries over to your next build, up to one turn's worth." | "...up to the cost of what you finished." | "Extra production becomes a little gold." | "Big cities can finish more than one item a turn." | — |

Hybrid considered and rejected: B2 **plus** D for buildings only. It would make catch-up of newly founded or captured
cities faster (3.4 shows that is where cheap items are), but it breaks the one-item-per-turn contract, needs a
completion loop and timeline UI, and its main beneficiary is already served by B2 + rush-buy.

## 6. The fun questions

1. **What should a player feel when a carefully developed city becomes very productive?** That it is powerful *and*
   that its power has a direction: big things finish fast, and what they make is never silently thrown away in
   ordinary play. B2 gives that; the warning alone (A) gives "my good city is broken".
2. **Is losing surplus a strategic cost or an invisible punishment?** Today it is mostly a punishment: 3.3 shows the
   loss falls on ordinary build orders (a worker, a library), not on a choice the player made. Under B2 the only
   remaining loss is when a city repeatedly builds things far cheaper than its output; that *is* a choice, the panel
   already names it, and the answer (queue something bigger, or set idle focus) is a real decision.
3. **Is exploiting overflow mastery or micromanagement?** Today with 3d-printing it is an exploit (3.2); without it,
   "order the queue so cheap items never finish with surplus" is micromanagement with no strategic content. B2
   removes both.
4. **Should a wealthy city build cheap infrastructure quickly?** Yes, and it already can: one item per turn is fast
   when items cost less than a turn. The reward is the tempo, not finishing five buildings in one turn.
5. **When does more throughput make armies, wonders or expansion too easy?** When it stops being bounded by turns.
   B2's ceiling is one turn: a wonder can start at most one turn ahead, no unit can finish more often than once a
   turn, and settlers stay one per city per turn. D and the current uncapped 3d-printing carry are where it breaks.
6. **Two campaigns:** a *builder* (several mid cities, building catch-up) recovers its ~10% and finishes its next
   building a turn sooner after most completions — felt as smoother progress, no new decision load. A *militarist*
   running one huge production city on cheap units still gets one unit per turn and still loses most of the excess,
   so B2 does not turn it into a unit factory; the panel keeps telling it to build something bigger.
7. **Can a 10-year-old understand it from one sentence?** "Extra production carries over to your next build, up to
   one turn's worth." Yes; the "up to one turn's worth" clause only matters for very big cities.
8. **Does the rule make the next turn more compelling?** Yes: completing an item now visibly starts the next one
   ("+38 already toward your Bank"), which is a small one-more-turn hook. A and C do not change the next turn.

## 7. Recommendation

### 7.1 Exact semantics (B2)

When the active item completes in `processCity`:

```
stored = productionProgress + productionYield      // as today
leftover = stored - itemCost                        // as today
productionProgress := min(leftover, productionYield)  // NEW: for every civ, queue or no queue
forfeited := leftover - productionProgress          // NEW accounting: stored progress the cap removed
```

- Applies to every civilization, human and AI, at every difficulty. No technology needed.
- The kept amount becomes the progress of whatever is at the head next: the next queued item, or the item the
  player (or AI) queues later. While the queue is empty it just waits; idle conversion is unaffected (it uses only
  that turn's yield, as now).
- **Still one completion per turn.** The rule changes only what survives the completion.
- The cap is the city's production **this turn**, so it is one turn's worth by construction, in every era, with no
  tuning constant.
- Existing rules are kept: changing the active item still erases stored progress with the existing warning; a
  materially waiting item keeps its progress; a wonder start inherits stored progress (now at most one turn).
- Conservation: `produced = applied + carried + convertedGold + convertedScience + discarded` is unchanged for this
  turn's output. `forfeited` is a new, separately reported number for stored progress the cap removes, so the panel
  and the campaign accounting can still show the one remaining waste instead of hiding it.

### 7.2 Before / after (real catalog numbers)

| Situation | Today | B2 |
|---|---|---|
| Mid-game city, 29 output, finishes a 16-cost library, granary next | 13 lost | 13 starts the granary |
| Era-12 city, 155 output, finishes an 86-cost settler | 69 lost | 69 starts the next item |
| Same city, nothing queued after the settler | 69 lost | 69 waits for whatever is queued next turn |
| Era-12 city, 150 output, re-queues 5-cost scouts every turn | 145 lost per turn (no 3d-printing) / bank grows 145 per turn without limit (3d-printing) | one scout per turn, stored stays ≤ 150, ~145 forfeited per turn (shown); with 3D Printing ~72 gold per turn |
| Player bank into a wonder (3d-printing) | 1136 after 8 turns (3.2) | at most one turn of output |

### 7.3 Why not the strongest alternative (B3, cap at the finished item's cost)

B3 is the Civ IV-looking option, but in Conquestoria the measured overflow is concentrated on cheap completions:
about half of the overflow events produced at least twice what the item needed, so capping at the item's cost would
keep much of the waste exactly where 3.4 shows it lives (cheap buildings in productive cities). The exploit Civ IV's
cap guards against is a *lump* on top of a turn's yield, and Conquestoria has lumps: forest clearing
(`worker-action-system.ts:249`, `city-lifecycle.ts:105`), production trade deliveries (`trade-route-delivery.ts:99`),
a city-state ally bonus (`minor-civ-system.ts:586`) and a natural-wonder grant (`wonder-system.ts:124`). B2's cap is on
what is *kept* (≤ this turn's yield), not on what was added, so a lump can still finish the current item, as today,
but can never leave more than one turn of output behind. Today's 3d-printing carry has no such bound and banks lumps
too. B3 would buy safety B2 already provides, at the cost of most of the recovery.

(Unchanged by any option, and noted only for completeness: a lump that lands while the queue is empty already sits in
stored progress and can be carried into a wonder start. That is existing behaviour outside overflow.)

### 7.4 3D Printing stays a real technology

New effect: **production that cannot carry over is turned into gold at half its value.** Text:
*"Leftover production that does not carry over becomes gold at half its value."*

- Meaningful: it pays exactly in the late-game case the universal rule leaves (a mature city building items cheaper
  than its output: 61 of the 88 buildings available at era 12 cost one turn or less). In steady state such a city
  forfeits its output minus the item's cost each turn, so a 155-output city finishing 100-cost buildings forfeits 55
  and earns about 27 gold a turn from it.
- Not mandatory: gold at half value converted back through rush-buy (2.5 gold per production) returns 20% of the
  production, so it cannot become a production engine, and it gives nothing to a city building big items.
- AI: same rule, no new AI behaviour; its bespoke value row is re-worded ("forfeited production becomes gold") and
  kept at its current weight, which is no longer dead value. It remains an era-12 prerequisite of two era-13 techs;
  its placement does not change.
- Honest copy (`content-description-honesty.md`): the effect exists in one function, has a positive test, and the
  audit row moves from `era-only` to effect-valued.
- Accounting: the gold comes from *forfeited stored progress*, not this turn's output, so it is reported beside
  `forfeited` and must **not** be added to `convertedGold` (that would make `convertedGold` exceed the turn's yield and
  break the conservation equation).

Owner alternative if a production-flavoured effect is preferred: *"cities can finish a second building in the same
turn"* (D, buildings only, max two). Stronger and more visible, but it breaks the one-item contract and is a much
larger change (5).

### 7.5 What the AI must do differently

Nothing structural. The AI already enqueues into an empty queue, and an empty-queue enqueue keeps stored progress,
so B2 benefits the AI on the first day — the property B1 and today's 3d-printing lack. Two small consumers must read
the stored progress so they stay truthful: the AI's candidate ETA, today `ceil(cost / productionPerTurn)` with no
progress term (`ai-production.ts:670,740,788`), and, already correct because it reads `projectActiveProduction`, the
rush-buy redundancy guard.

### 7.6 Biggest balance failure mode

Late-game tempo: with ~10% more of their output reaching builds, AI and human cities finish their next item about a
turn sooner after most completions. That nudges building catch-up and national-project timing earlier, and it moves
the pacing reference only if a test feeds overflow into it (the reference economy measures yields, not completions,
so research pacing is unaffected). Watch: national-project race timing and the long-horizon `production-idle`
finding (cities may exhaust content slightly sooner, which idle conversion already absorbs).

Second failure mode, measured in 3.5: in a very late game the one-turn cap still forfeits 13.5% of output, because
huge cities keep finishing items far cheaper than a turn. If that share stays above ~10% after the AI purchase defect
is fixed, the next lever is AI item choice in big cities, and only then a limited second completion (buildings only,
option D); neither is recommended now.

### 7.7 Save and compatibility

No migration, no `SAVE_VERSION` bump. `City.productionProgress` is already persisted and already loads with an empty
queue (`enqueueCityProduction` keeps it). Every reader already tolerates any value. A save mid-bank from today's
3d-printing rule loads with its large stored progress, which is honoured once and then capped at the next
completion; that is benign and needs no repair. The change is a behaviour change in `processCity`: the #1239
round-order literals and the save-migration-equivalence goldens do not move, while state digests and campaign
artifacts that include production outcomes do, and are regenerated in the rule PR with a justification per moved
number (an intentional behaviour change, `UPDATE_1239_REFERENCE=1`).

### 7.8 Still uncertain until playtested

- Whether players notice the carried amount without a line in the panel ("38 carried from last turn").
- Whether the "loses stored production" warning on head changes feels harsher now that more items start with stored
  progress (a later option is to let carried production survive a head change; not recommended now).
- The 3D Printing gold rate (50%) is a provisional number, **not approved**: the only envelope proposed is
  25–50%, below idle conversion's 1:1 so that building something stays better than idling.

## 8. Implementation sequence (approved 2026-11-09)

Re-sequenced from the draft so that no PR ships a dishonest surface: the rule change makes today's 3D Printing text
and the panel's overflow copy false, so they move with the rule.

1. **PR 1 — rule and every surface that states it.** B2 in `completeCityProductionItem` / `processCity`, `forfeited`
   accounting, 3D Printing's forfeited-production gold (25%), `getProductionDecision().overflow`,
   `production-decision-copy.ts`, the 3D Printing tech text, `ai-tech-bespoke-value.ts` rationale and the strategic
   audit row; the pinned tests updated, plus conservation, bank-bound and save-continuity regressions.
2. **PR 2 — AI.** Refill (or convert) a queue an AI purchase empties in the same AI turn (3.3), and AI candidate
   ETAs that count stored progress (7.5).
3. **PR 3 — validation.** Disposition before/after on the four campaigns, `pacing-audit` and reference-economy
   gates, national-project timing, an `ai-long` run on `lh-late-era-medium`; deletes this spec.

Every step keeps the canonical production-cost context, the conservation equation, determinism, human/AI parity,
hot-seat safety (no new cross-civ read), save compatibility and one preview/executor contract, and touches neither
tech pacing nor the Legacy-victory work (#1125).

## 9. Owner decisions (2026-11-09)

1. **Accepted:** B2, carry-forward up to one turn's worth, for every civ.
2. **Accepted:** 3D Printing turns forfeited production into gold.
3. **Rate: 25%** (`floor(forfeited × 0.25)`), at the bottom of the proposed envelope. Wherever this document says
   "half value" or 50%, read 25%: the 155-output example in 7.4 earns about 13 gold a turn, the scout example in 7.2
   about 36, and the rush-buy round trip returns 10% of the production.
4. **Accepted:** changing the active item still erases stored progress.
5. **Accepted:** the sequence in section 8.
6. **The AI purchase defect is fixed inside this arc** (PR 2), not as a separate issue.

## Appendix A. Measurement harness

Reproduction on any main that still has the current rule. Nothing here is committed: copy the harness to
`tests/simulation/zz-overflow-1426-measure.test.ts`. The ordinary suite would collect it, so delete it afterwards.

1. **Today's rule:** `./scripts/run-with-mise.sh yarn vitest run tests/simulation/zz-overflow-1426-measure.test.ts`
   (about 12 minutes on a 10-core host; the `lh-1107-search-0` case is ~7 of them). Writes
   `.verification/overflow-1426/{era-table,bank-probe,<seed>.json,<seed>.rows.json,<seed>.queues.json}`.
2. **Candidate rule:** `python3 -I experiment.py src/systems/city-turn.ts`, then
   `OVERFLOW_OUT=.verification/overflow-1426-exp ./scripts/run-with-mise.sh yarn vitest run tests/simulation/zz-overflow-1426-measure.test.ts -t "campaign|bank probe"`,
   then **`git checkout src/systems/city-turn.ts`** and confirm `git diff --quiet src`.
3. **Tables:** `python3 -I post.py .verification/overflow-1426/*.rows.json` and
   `python3 -I compare.py .verification/overflow-1426 .verification/overflow-1426-exp units.json`
   (`units.json` is the list of `UNIT_DEFINITIONS` keys, used only to count unit completions).

Fixture cross-check: per round and civ, the harness's `produced` equals the fixture's own
`CampaignCivSample.production.produced` for every AI round of both captured campaigns (0 mismatches), so the spy
neither double-counts nor misses dispositions. The `lh-1107-search-0` case was run three times on the same commit with the current rule; the
repeat runs reproduced the same no-sink city-turn count (386, of which 376 without a completion).

<details><summary>Harness (<code>zz-overflow-1426-measure.test.ts</code>)</summary>

```ts
// #1426 measurement harness. TEMPORARY, NOT COMMITTED: its source is reproduced in
// docs/superpowers/specs/2026-11-09-issue-1426-production-overflow-design.md (Appendix A). It changes no rule; it reads the existing
// `city:production-disposition` accounting and the real catalog costs.
import { describe, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { EventBus } from '@/core/event-bus';
import { runAICampaign, type AICampaignOptions } from './ai-playability-fixture';
import { buildReferenceEconomyCity, getReferenceEconomyOutput, getRepresentativeEmpireOutput } from '../systems/helpers/pacing-reference-economy';
import { getTrainableUnitsForCiv, getAvailableBuildings } from '@/systems/city-availability';
import { createProductionCostContext, getProductionCostForItem } from '@/systems/city-production-cost';
import { civilizationEraFromNumber } from '@/systems/era-types';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';

const OUT = process.env.OVERFLOW_OUT ?? '.verification/overflow-1426';

interface Disp { round: number; civId: string; cityId: string; produced: number; appliedToBuild: number; carriedOver: number;
  convertedGold: number; convertedScience: number; discarded: number; suppressedByLock: number; withheldByMaterials?: boolean;
  completions: string[] }

function measureCampaign(options: AICampaignOptions) {
  const rows: Disp[] = [];
  const drops: Array<Record<string, unknown>> = [];
  const queues: Array<{ round: number; civId: string; empty: string[]; converting: string[] }> = [];
  let round = 0;
  let open: Disp | null = null;
  const original = EventBus.prototype.emit;
  const spy = vi.spyOn(EventBus.prototype, 'emit').mockImplementation(function (this: EventBus, name: never, payload: never) {
    const p = payload as Record<string, unknown>;
    if (name === 'city:production-disposition') {
      open = { round, ...(p as never), completions: [] } as Disp;
      rows.push(open);
    } else if ((name === 'city:building-complete' || name === 'city:unit-trained') && open && open.cityId === p.cityId) {
      open.completions.push(String(p.buildingId ?? p.unitType));
    } else if ((name === 'city:building-complete' || name === 'city:unit-trained') && !open) {
      drops.push({ round, kind: 'completion-outside-city-production', cityId: p.cityId, item: String(p.buildingId ?? p.unitType) });
    } else if (name === 'city:production-item-dropped') {
      drops.push({ round, ...p });
    } else if (!String(name).startsWith('city:')) {
      open = null; // completions after a non-city event belong to another phase (e.g. a rush-buy)
    }
    return original.call(this, name, payload);
  });
  try {
    runAICampaign({ ...options, observe: sample => {
      for (const civ of sample.civs) queues.push({ round, civId: civ.civId, empty: civ.emptyQueueCityIds ?? [], converting: civ.convertingCityIds ?? [], fixtureProduced: civ.production?.produced ?? -1, fixtureDiscarded: civ.production?.discarded ?? -1 } as never);
      round += 1; open = null;
    } });
  } finally { spy.mockRestore(); }
  return { rows, drops, queues };
}

function summarize(label: string, rows: Disp[]) {
  const ai = rows; // the fixture's human seat is driven by the same AI; all seats are AI-controlled
  const sum = (f: (d: Disp) => number, set = ai) => set.reduce((s, d) => s + f(d), 0);
  const overflow = ai.filter(d => !d.withheldByMaterials && d.appliedToBuild > 0 && d.discarded > 0);
  const withheld = ai.filter(d => d.withheldByMaterials);
  const unsunk = ai.filter(d => !d.withheldByMaterials && d.appliedToBuild === 0 && d.discarded > 0);
  const produced = sum(d => d.produced);
  const overflowDiscard = sum(d => d.discarded, overflow);
  // First-order counterfactuals on the measured stream (no re-simulation).
  const capLow = sum(d => Math.min(d.discarded, d.appliedToBuild), overflow); // cap >= applied, so a lower bound
  const halfConvert = overflowDiscard * 0.5;
  const ratio = overflow.map(d => d.produced / Math.max(1, d.appliedToBuild)).sort((a, b) => a - b);
  const pct = (q: number) => ratio.length ? Number(ratio[Math.floor(q * (ratio.length - 1))].toFixed(2)) : 0;
  const completions = ai.flatMap(d => d.completions);
  const unitCompletions = completions.filter(id => id in UNIT_DEFINITIONS);
  const byCiv: Record<string, Record<string, number>> = {};
  for (const civId of [...new Set(ai.map(d => d.civId))].sort()) {
    const set = ai.filter(d => d.civId === civId);
    const ov = set.filter(d => overflow.includes(d));
    byCiv[civId] = {
      produced: sum(d => d.produced, set), applied: sum(d => d.appliedToBuild, set), carried: sum(d => d.carriedOver, set),
      converted: sum(d => d.convertedGold + d.convertedScience, set), discarded: sum(d => d.discarded, set),
      overflowDiscarded: sum(d => d.discarded, ov), materialsWithheld: sum(d => d.discarded, set.filter(d => d.withheldByMaterials)),
      suppressedByLock: sum(d => d.suppressedByLock, set), completions: set.reduce((s, d) => s + d.completions.length, 0),
      cityRounds: set.length,
    };
  }
  const lastRounds = ai.filter(d => d.round >= Math.max(...ai.map(r => r.round)) - 9);
  const lastOverflow = lastRounds.filter(d => overflow.includes(d));
  return {
    label, cityRounds: ai.length, produced,
    applied: sum(d => d.appliedToBuild), carried: sum(d => d.carriedOver),
    convertedGold: sum(d => d.convertedGold), convertedScience: sum(d => d.convertedScience),
    discarded: sum(d => d.discarded), suppressedByLock: sum(d => d.suppressedByLock),
    discardBreakdown: { completionOverflow: overflowDiscard, materialsWithheld: sum(d => d.discarded, withheld), noSinkEmptyQueue: sum(d => d.discarded, unsunk) },
    overflowShareOfProduced: Number((overflowDiscard / Math.max(1, produced)).toFixed(4)),
    overflowEvents: overflow.length,
    producedOverAppliedOnOverflow: { p50: pct(0.5), p90: pct(0.9), max: pct(1) },
    counterfactualRecovered: { cappedCarryLowerBound: capLow, cappedCarryUpperBound: overflowDiscard, halfConversion: halfConvert },
    completions: completions.length, unitCompletions: unitCompletions.length,
    topCompleted: Object.entries(completions.reduce<Record<string, number>>((m, id) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {}))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8),
    last10Rounds: { produced: sum(d => d.produced, lastRounds), overflowDiscarded: sum(d => d.discarded, lastOverflow) },
    byCiv,
  };
}

function eraTable() {
  const rows = [];
  for (let era = 1; era <= 13; era++) {
    const { city, map, completedTechs } = buildReferenceEconomyCity(era, 'maximal');
    const ctx = createProductionCostContext({ era: civilizationEraFromNumber(era), completedTechs, city });
    const units = getTrainableUnitsForCiv(completedTechs).filter(u => u.type !== 'settler')
      .map(u => ({ id: u.type, cost: getProductionCostForItem(u.type, ctx) })).filter(u => u.cost > 0).sort((a, b) => a.cost - b.cost);
    const combat = units.filter(u => (UNIT_DEFINITIONS[u.id as keyof typeof UNIT_DEFINITIONS]?.strength ?? 0) > 0
      && !(UNIT_CLASS_BY_TYPE[u.id as keyof typeof UNIT_CLASS_BY_TYPE] ?? []).some(c => c === 'recon' || c === 'civilian' || c === 'spy'));
    const empty = { ...city, buildings: [] };
    const buildings = getAvailableBuildings(empty, completedTechs, map, undefined, civilizationEraFromNumber(era))
      .filter(b => !b.nationalProject).map(b => ({ id: b.id, cost: getProductionCostForItem(b.id, ctx) })).filter(b => b.cost > 0)
      .sort((a, b) => a.cost - b.cost);
    const newest = buildings.filter(b => !city.buildings.includes(b.id));
    const strongestCombat = [...combat].sort((a, b) =>
      (UNIT_DEFINITIONS[b.id as keyof typeof UNIT_DEFINITIONS].strength - UNIT_DEFINITIONS[a.id as keyof typeof UNIT_DEFINITIONS].strength) || a.cost - b.cost)[0];
    const median = (xs: number[]) => xs.length ? xs[Math.floor((xs.length - 1) / 2)] : 0;
    rows.push({
      era,
      productionBounded: getReferenceEconomyOutput(era, 'bounded').production,
      productionMaximal: getReferenceEconomyOutput(era, 'maximal').production,
      productionRepresentativeAvg: getRepresentativeEmpireOutput(era).averagePerCity.production,
      settlerCost: getProductionCostForItem('settler', ctx),
      cheapestUnit: units[0], cheapestCombatUnit: combat[0], strongestCombatUnit: strongestCombat,
      cheapestBuilding: buildings[0], medianUnbuiltBuildingCost: median(newest.map(b => b.cost)),
      unbuiltBuildings: newest.length,
      availableBuildings: buildings.length, medianAvailableBuildingCost: median(buildings.map(b => b.cost)),
      buildingsAtOrBelowMaximal: buildings.filter(b => b.cost <= getReferenceEconomyOutput(era, 'maximal').production).length,
      availableCombatUnits: combat.length, medianCombatUnitCost: median(combat.map(u => u.cost)),
      combatUnitsAtOrBelowMaximal: combat.filter(u => u.cost <= getReferenceEconomyOutput(era, 'maximal').production).length,
    });
  }
  return rows;
}

describe('#1426 overflow measurement', () => {
  it('writes the era table', () => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/era-table.json`, JSON.stringify(eraTable(), null, 2));
  }, 600_000);

  const campaigns: AICampaignOptions[] = [
    { seed: 'continuity-baseline', challenge: 'standard', turns: 60, mapSize: 'small', humanCount: 1, aiCount: 2, personalitySet: ['expansionist', 'diplomatic'] },
    { seed: 'overflow-1426-builder-medium', challenge: 'standard', turns: 100, mapSize: 'medium', humanCount: 1, aiCount: 3, personalitySet: ['expansionist', 'diplomatic', 'trader'] },
    { seed: 'measure-late', challenge: 'standard', turns: 60, mapSize: 'small', humanCount: 1, aiCount: 2, personalitySet: ['aggressive', 'trader'], lateEra: true, lateEraForceAssertions: false },
    // lh-late-era-medium's configuration (campaign-scenarios.ts), cut to 200 of its 250 rounds.
    { seed: 'lh-1107-search-0', challenge: 'standard', turns: 200, mapSize: 'medium', humanCount: 1, aiCount: 3, personalitySet: ['aggressive', 'trader', 'diplomatic'], lateEra: true, lateEraForceAssertions: false, stopOnGameOver: true },
  ];
  for (const options of campaigns) {
    it(`campaign ${options.seed}`, () => {
      mkdirSync(OUT, { recursive: true });
      const { rows, drops, queues } = measureCampaign(options);
      writeFileSync(`${OUT}/${options.seed}.queues.json`, JSON.stringify({ drops, queues }));
      writeFileSync(`${OUT}/${options.seed}.json`, JSON.stringify(summarize(options.seed, rows), null, 2));
      writeFileSync(`${OUT}/${options.seed}.rows.json`, JSON.stringify(rows));
    }, 3_600_000);
  }
});

import { processCity, foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';

describe('#1426 3d-printing bank probe', () => {
  it('records stored progress when a high-output city keeps a cheap unit queued', () => {
    const map = generateMap(30, 30, 'overflow-1426-bank');
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    let city = { ...foundCity('p1', tile.coord, map, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 } as never), productionQueue: [] as string[], productionProgress: 0 };
    const ctx = createProductionCostContext({ completedTechs: ['3d-printing'], era: civilizationEraFromNumber(12) });
    const trace: Array<{ turn: number; progressAfter: number; completed: string | null; carried: number; discarded: number }> = [];
    for (let turn = 1; turn <= 8; turn++) {
      city = { ...city, productionQueue: ['warrior', 'warrior', 'warrior', 'warrior'] };
      const result = processCity(city as never, map, 0, 150, ctx);
      trace.push({ turn, progressAfter: result.city.productionProgress, completed: result.completedUnit, carried: result.production.carriedOver, discarded: result.production.discarded });
      city = { ...result.city } as never;
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/bank-probe.json`, JSON.stringify({ warriorCost: getProductionCostForItem('warrior', ctx), trace }, null, 2));
  });
});
```
</details>

<details><summary>Experiment patch (<code>experiment.py</code>, applied in place and reverted)</summary>

```python
# Applies the #1426 counterfactual rule to src/systems/city-turn.ts IN PLACE (measurement only; reverted with git checkout).
import sys
p=sys.argv[1]; s=open(p).read()
reps=[
("""  const hasOverflow = canCarryProductionOverflow(options.completedTechs, newQueue.length);
  const overflow = hasOverflow && options.cost !== undefined
    ? Math.max(0, city.productionProgress - options.cost)
    : 0;""",
"""  // #1426 EXPERIMENT: every civ keeps leftover progress after a completion, queued or not, capped at one turn's output.
  const overflow = options.cost !== undefined
    ? Math.min(Math.max(0, city.productionProgress - options.cost), (options as { carryCap?: number }).carryCap ?? Infinity)
    : 0;"""),
("{ cost: currentItemCost, completedTechs },", "{ cost: currentItemCost, completedTechs, carryCap: productionYield } as never,"),
("""      overflowDiscarded = excessThisTurn - carriedOver;""",
"""      overflowDiscarded = excessThisTurn - carriedOver;
      forfeitedStored = Math.max(0, newProgress - currentItemCost - completion.city.productionProgress - overflowDiscarded);"""),
("  let overflowDiscarded = 0;\n", "  let overflowDiscarded = 0;\n  let forfeitedStored = 0;\n"),
("    withheldByMaterials,\n  };", "    withheldByMaterials,\n    forfeitedStored,\n  } as ProductionDisposition;"),
]
for a,b in reps:
    assert s.count(a)==1,(a[:60],s.count(a)); s=s.replace(a,b)
open(p,'w').write(s)
print('patched')
```
</details>

<details><summary>Post-processing (<code>post.py</code>, <code>compare.py</code>)</summary>

```python
import json, sys, collections
for path in sys.argv[1:]:
    rows=[r for r in json.load(open(path)) if r['civId'].startswith('ai-')]
    S=lambda f,rs=rows: sum(f(r) for r in rs)
    ov=[r for r in rows if not r.get('withheldByMaterials') and r['appliedToBuild']>0 and r['discarded']>0]
    wh=[r for r in rows if r.get('withheldByMaterials')]
    un=[r for r in rows if not r.get('withheldByMaterials') and r['appliedToBuild']==0 and r['discarded']>0]
    prod=S(lambda r:r['produced'])
    print('==',path.split('/')[-1], 'cityRounds',len(rows),'rounds',max(r['round'] for r in rows)+1)
    print(' produced',prod,'applied',S(lambda r:r['appliedToBuild']),'carried',S(lambda r:r['carriedOver']),
      'convG',S(lambda r:r['convertedGold']),'convS',S(lambda r:r['convertedScience']),'discarded',S(lambda r:r['discarded']),'lock',S(lambda r:r['suppressedByLock']))
    o=S(lambda r:r['discarded'],ov)
    print(' forfeitedStored',S(lambda r:r.get('forfeitedStored',0)),'completionsWithCarry',sum(1 for r in rows if r['carriedOver']>0))
    print(' overflow',o,f"{o/prod:.1%}",'events',len(ov),'withheldMaterials',S(lambda r:r['discarded'],wh),'(rounds',len(wh),')','noSink',S(lambda r:r['discarded'],un))
    print(' capLow(min(disc,applied))',S(lambda r:min(r['discarded'],r['appliedToBuild']),ov),'half',o/2)
    comps=[c for r in rows for c in r['completions']]
    print(' completions',len(comps), collections.Counter(comps).most_common(6))
    # repeat-item overflow: overflow events whose completion repeats this city's previous completion
    last={}; rep=0; repd=0
    for r in sorted(rows,key=lambda r:(r['round'])):
        for c in r['completions']:
            if r in ov and last.get(r['cityId'])==c: rep+=1; repd+=r['discarded']
            last[r['cityId']]=c
    print(' overflow on a repeat of the same item:',rep,'events',repd,'production')
    # ratio produced/cost proxy
    big=[r for r in ov if r['discarded']>=r['appliedToBuild']]
    print(' overflow events where surplus>=applied (output>=2x need):',len(big),S(lambda r:r['discarded'],big))
    # by thirds of the campaign
    n=max(r['round'] for r in rows)+1
    for a,b in [(0,n//3),(n//3,2*n//3),(2*n//3,n)]:
        seg=[r for r in rows if a<=r['round']<b]; p=S(lambda r:r['produced'],seg); d=S(lambda r:r['discarded'],[r for r in seg if r in ov])
        mx=max((r['produced'] for r in seg),default=0)
        print(f'  rounds {a}-{b-1}: produced {p} overflow {d} ({d/max(1,p):.1%}) maxCityOutput {mx}')
    for civ in sorted({r['civId'] for r in rows}):
        cs=[r for r in rows if r['civId']==civ]; p=S(lambda r:r['produced'],cs); d=S(lambda r:r['discarded'],[r for r in cs if r in ov])
        print('  ',civ,'produced',p,'applied',S(lambda r:r['appliedToBuild'],cs),'overflow',d,f'{d/max(1,p):.1%}','completions',sum(len(r['completions']) for r in cs),'cities',len({r['cityId'] for r in cs}))
```

```python
import json, sys
base, exp = sys.argv[1], sys.argv[2]
def load(d, seed):
    return [r for r in json.load(open(f'{d}/{seed}.rows.json')) if r['civId'].startswith('ai-')]
def stats(rows):
    S=lambda f,rs=rows: sum(f(r) for r in rs)
    ov=[r for r in rows if not r.get('withheldByMaterials') and r['appliedToBuild']>0 and r['discarded']>0]
    n=max(r['round'] for r in rows)+1
    late=[r for r in rows if r['round']>=2*n//3]
    P=S(lambda r:r['produced']); PL=S(lambda r:r['produced'],late)
    return dict(produced=P, applied=S(lambda r:r['appliedToBuild']), carried=S(lambda r:r['carriedOver']),
        idle=S(lambda r:r['convertedGold']+r['convertedScience']), discarded=S(lambda r:r['discarded']),
        overflow=S(lambda r:r['discarded'],ov), forfeited=S(lambda r:r.get('forfeitedStored',0)),
        completions=sum(len(r['completions']) for r in rows),
        units=sum(1 for r in rows for c in r['completions'] if c in UNITS),
        lateProduced=PL, lateCompletions=sum(len(r['completions']) for r in late),
        lateWaste=S(lambda r:r['discarded']+r.get('forfeitedStored',0),late))
UNITS=set(json.load(open(sys.argv[3])))
for seed in ['continuity-baseline','overflow-1426-builder-medium','measure-late','lh-1107-search-0']:
    b=stats(load(base,seed)); e=stats(load(exp,seed))
    print('==',seed)
    for k in b: print(f'  {k:16} {b[k]:>8} -> {e[k]:>8}')
```
</details>

