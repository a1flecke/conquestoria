# Engineering passage: fixed paper rehearsal

15 November 2026. Advisory test for [Conquestoria issue #1125](https://github.com/a1flecke/conquestoria/issues/1125), read with the [engineering-connections checkpoint](2026-11-15-issue-1125-engineering-connections.md). This is a separate fictional fixture, not a continuation of the campaign. Its held 28 gold remains uncommitted. This backup does not implement gameplay or establish an implementation-ready specification.

## Purpose and limits

Test an understandable undertaking, preparations before opening, meaningful choices, a useful unsuccessful outcome, and a recognizable finish. All quantities, prices, schedules and geography are constructed assumptions. Arithmetic is checked; physical operation, market behavior, balance and enjoyment are not empirically validated.

The thresholds below are fixed for this rehearsal only. They are not proposed universal Legacy thresholds or a claim that historical Suez and Panama have been calibrated against them. In particular, an 8% world-traffic requirement must not be carried into the eventual general rule without testing the historical positive cases and other maps.

## Fixed world

Six large geographic areas exist: Western, Eastern, Southern, Northern, Interior and Islands. Western and Southern are on opposite sides of a large continental detour. Eastern and Northern have separate established connections to those areas. Geographic areas are independent of political borders.

The developed world sustains 1,000 comparable, useful bulk-cargo deliveries per eight-turn service period. This fixture deliberately uses comparable loads rather than asserting that all goods have equal importance. The prospective passage affects these existing demands:

| Connection | Demand per period | Existing complete fleet round trip | New complete fleet round trip |
| --- | ---: | ---: | ---: |
| Western–Southern | 40 loads | 8 turns | 4 turns |
| Western–Eastern | 20 loads | 8 turns | 6 turns |
| Northern–Southern | 20 loads | 8 turns | 6 turns |

The remaining 920 loads use other connections. The listed customers are established and have useful demand; no whole city's population or output is attributed to a delivery. Both new designs provide the listed journey improvements, including ordinary handling. They use different alignments; a direct cut and locks need not have equal sailing distance.

The starting civilization already owns and governs both possible passage sites. This rehearsal tests the later undertaking, not discovery or territorial acquisition. It cannot demonstrate that those earlier phases are enjoyable or that world generation supplies fair opportunities. Opening the passage is a substantial physical change to this map, not a bonus on an already adequate harbor.

## Fixed resources and design options

- Initial treasury: 160 gold. Existing empire net income: 6 per turn. Reserve floor: 30.
- Existing empire expenses, current defenses and obligations are included in that net income. No new threat is silently funded by it.
- Direct cut: 90 construction cost, opens after six turns, passage upkeep 3 per operating turn, capacity 96 loaded movements per eight-turn service period.
- Locks: 60 construction cost, opens after four turns, upkeep 4. During ordinary dry-season service periods, it can support only 48 loads.
- A surveyed reservoir costs 20, is constructed in parallel with the locks, and adds upkeep 1. The combined project opens after four turns and supports 80 loads in ordinary wet and dry periods.
- These are aggregate service-period capacities, not a claim of constant daily throughput. Fine-grained lock queues, hydrology and passage-slot scheduling are outside this paper model.
- Fifteen ships cost 60, including training/deployment. Each carries four loads. Five serve each connection. Ships for the two longer routes can wait between assignments; their idle operating costs are included in the quoted service margin.
- A fleet order takes two turns. Direct-cut branch orders on turn 4; locks/reservoir branch orders on turn 2. Both are ready at opening.
- Prepared-case carriage earns a margin of 1 per delivered load after ordinary vessel, loading and waiting costs, before passage upkeep. This is a quoted money margin, not a physical-resource-efficiency score. No tourism, mineral find, price increase or additional customer is assumed.
- The player retains ownership and operation, uses their own ships and does not grant another civilization inland access. Ordinary access at destination ports is already agreed. This tests independence in operating the undertaking, not total diplomatic isolation.

## Operational schedule abstraction

At opening, the fleets and customer cargo are ready. The illustrative delivery schedule is 20 Western–Southern loads at opening +2 turns; 20 Western–Eastern and 20 Northern–Southern at +3; and another 20 Western–Southern at +6. The first fleet's two four-turn round trips and the other fleets' six-turn trips account for those outbound arrivals. Operation continues under funded standing orders.

This is an aggregate paper schedule, not a verified navigation/queue simulation. The stated per-period capacity allows these booked movements; a future playable test must verify actual slots and handling rather than inheriting the schedule as a guarantee.

## Explicit finish for this fixture

All must hold:

1. The undertaking functions, the civilization survives, and continued ordinary operation is funded.
2. Actual useful deliveries demonstrate the listed complete-journey improvements.
3. At least 80 distinct qualifying loads have arrived within the last eight turns, with at least 20 on each listed connection. At most 40 from one connection count toward the 80.
4. Demand, capacity and standing service support continued operation; a one-off disposal of surplus is insufficient.

These fixed thresholds make this rehearsal executable on paper. The three named connections are scenario contents, not a general requirement for exactly three routes or a fixed list of eligible places. Extra traffic cannot reduce an achieved qualifying subset. Multiple stops do not multiply delivered loads.

Eight turns is the service accounting window, not a compulsory hold timer. The prepared case completes the delivery evidence six turns after opening. No extra confirmation ceremony or timer follows. A future implementation would resolve finishers at the shared checkpoint.

## Fixed adverse branch

The Eastern buyer's volume is explicitly subject to a turn-3 renewal. In the adverse branch, a rival makes a competing supply offer before that renewal. It does not cancel signed shipments or expose the rival's private accounts.

The buyer offers the player either 20 loads at a reduced carriage margin of 0.25 each, or 8 loads at the original margin of 1. The rival serves the remaining 12 in the latter case on the old route. World demand remains 1,000; no new customer is invented. The buyer's response is a fixture assumption, not an implemented AI pricing model.

Under the direct-cut design, the reduced-price branch keeps fifteen ships. The original-price branch buys twelve ships for 48: five for Western–Southern, five for Northern–Southern and two for the remaining eight Eastern loads. The schedule above applies with Eastern volume adjusted. The latter branch can fail the Legacy test while retaining useful, profitable infrastructure.

## Checked arithmetic and paper outcomes

Capital is charged on commitment. Existing empire income arrives at turn end. Passage upkeep begins after opening; six operating turns accrue before the final scheduled first-service deliveries. Receipts arrive on delivery. Construction costs include pre-opening deployment/training expenses.

| Branch | Minimum construction treasury | Opening | First delivery evidence complete | Treasury then | Passage/carriage surplus per subsequent 8-turn period | Fixture result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Prepared direct cut | 34 | Turn 6 | Turn 12 | 144 | 56 | Qualifies |
| Prepared locks + reservoir | 32 | Turn 4 | Turn 10 | 130 | 40 | Qualifies |
| Direct cut, reduced Eastern price | 34 | Turn 6 | Turn 12 | 129 | 41 | Qualifies |
| Direct cut, original price | 46 | Turn 6 | Turn 12 | 144 | 44 | Does not qualify: 68 loads; Eastern connection 8 |

For example, locks/reservoir treasury at turn 10 is 160 - 80 - 60 + 60 + 80 - 30 = 130.

## Design findings

1. The prepared locks/reservoir option finishes earlier and costs less capital than the direct cut. Higher future upkeep and less spare capacity do not provide a persuasive engineering-victory tradeoff when either option can end the game at its first qualifying service. Do not present this pair as a balanced choice.
2. The Eastern concession costs only 3 recurring margin per eight turns relative to the smaller original-price order (5 versus 8). It also needs 12 more fleet capital. For a player near an engineering victory, the choice is too obvious to carry a dramatic finale. Within an approved expansion policy it may merit an advisor recommendation or automation, not a prolonged negotiation.
3. The failed branch retains a useful enterprise, and its failure is explainable. However, the scenario funnels the finish through one particular buyer. This is a calibration limitation and a warning against hardcoding a named customer as a general requirement.
4. Affordability, physical usefulness, reserve preservation and an explainable winning moment can coexist. That does not demonstrate enjoyable pacing or adequate competition with other victory paths.
5. The prototype has no developed rival science/conquest/cultural timeline. It cannot yet establish opportunity cost or fair race pacing. Do not invent a rival's imminent win after the player commits merely to create tension.
6. A final service cycle can become passive watching if preparation already settled every relevant choice. It may be a satisfying short payoff, but extending it with arbitrary traffic quotas or compulsory attacks would be a poor repair.

## Evaluation across the agreed dimensions

| Dimension | Paper assessment |
| --- | --- |
| Gameplay | Real placement and movement consequence; proposed design and price forks are weak strategic choices in this fixture. |
| Fun | Useful intermediate assets and no repeated contract management; post-opening choices may be too automatic. |
| Excitement | Visible first crossings and a concrete finish; no evidence yet of an engaging race against other victories. |
| Playability | Show passage, connected areas and useful service first. Fleet/cash arithmetic belongs behind details. Queue and forecast clarity need a playable test. |
| Lovability | A named, visible world transformation and a worthwhile enterprise even on failure are promising; no family playtest has established emotional payoff. |
| Replayability and player variety | Operation through own ships works in the fixture. Cooperation, map variety and conquest-oriented opportunity costs remain untested; the cheaper construction option currently dominates this victory race. |

For the youngest player, the base explanation is “Open the passage and make it a busy link between faraway places.” Forecasts should say what is still missing, while detailed targets remain available. Do not infer that CJ, Lizzie or Helen have played or enjoyed this scenario.

## Inspiration and evidence limits

- [Age of Wonders 4 developer diary, July 2023](https://www.paradoxinteractive.com/games/age-of-wonders-4/news/age-of-wonders-4-dev-diary-21): developers diagnosed passive, accidental magic victories and redesigned them around exploration and contested map locations. Borrow deliberate map engagement, not a compulsory final countdown/attack.
- [Old World update 133, March 2025](https://mohawkgames.com/2025/03/26/old-world-update-133/): earlier availability of the National Ambition illustrates exposing the destination before the final step. It does not prove that every ambition ending is satisfying.
- [PC Gamer's Humankind review](https://www.pcgamer.com/humankind-review/): one reviewer found milestones motivating but repetitive. Use as a warning about escalating delivery quotas, not a universal reception verdict.

## Next bounded revision

Treat engineering-method selection as an informed recommendation where one solution is plainly better. Put the strategic choice at the commitment level: which consequential connection to pursue, what ownership/access conditions to accept, and what other civilization priorities to defer. Specify competing priorities before another playthrough. Do not rescue this fixture by conveniently worsening the cheaper design, generating another buyer or adding scripted crises. Retain these results as a failed test of the proposed three dramatic choices, not a validated victory design.
