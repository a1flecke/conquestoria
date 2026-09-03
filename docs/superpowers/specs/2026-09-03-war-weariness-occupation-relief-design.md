# War-Weariness and Occupation Relief Design

**Issue:** #926 — War-weariness / recent-conquest unrest needs a bought counter-lever

## Goal

Give a conquest-focused civilization a clear, affordable, city-local counter to war
weariness and recent-conquest unrest without making war or occupation pressure
disappear. The counter must be a choice the player and AI deliberately buy, not a
passive difficulty modifier or automatic technology bonus.

## Chosen solution

Add **Military Administration** (`military-administration`), a city building unlocked
by the existing era-3 `civil-service` technology. It is a culture/civic building with
the `🛡️` production icon, zero yields, and a production cost of **45**. Its technology
entry adds the building to `unlocksBuildings` and adds the effect text “Military
Administration reduces local war and fresh-conquest unrest.” It uses the established
Courthouse presentation and production path. It has no yield penalty: its technology
prerequisite, production cost, and use of a city's production queue are the cost of
choosing stability over another investment.

Military Administration is not a new policy, stance, global modifier, or durable
city-state field. A completed building is represented only by the existing
`city.buildings` entry, which keeps old saves compatible without a schema migration.

## Unrest effect and balance ceiling

The `UNREST_RELIEF_SOURCES` table gains a Military Administration source. It reads
the already-computed positive rows and emits one named negative breakdown row,
`Military Administration`, only when it has actual war or occupation pressure to
offset. It must not change either positive-row formula.

For its host city, the source provides:

- `min(8, max(0, warRow - 4))` relief against `War weariness`, preserving a
  per-row floor of 4;
- `min(10, max(0, conquestRow - 8))` relief against `Recent conquest`, preserving a
  per-row floor of 8;
- a combined ceiling of **18** pressure removed in a city that has both maximum
  applicable target rows.

This leaves a three-war city with at least 16 war-weariness pressure (the positive
row caps at 24), and a freshly conquered city without Constitutional Law with at
least 15 recent-conquest pressure (the positive row is 25). In the common one-war +
Constitutional Law case, it leaves `4 + 8 = 12` pressure rather than collapsing 21
pressure to 3. Constitutional Law continues to halve the positive Recent conquest row
first; Military Administration then offsets at most the remaining row amount. The two
levers compose, but neither removes the strategic cost of multi-front wars or fresh
conquest.

The balance inventory in `.claude/rules/game-balance.md` records the activation,
target rows, row formula, and the `-18` combined ceiling alongside Courthouse.

## AI behavior

AI consideration remains catalog- and table-driven:

- The source metadata identifies its building and target positive-row labels. For a
  candidate research technology, AI research must derive its addressable rows only
  from relief-source building IDs in *that technology's* `unlocksBuildings` list.
  Magistracy therefore responds only to Courthouse sprawl pressure, while Civil
  Service responds only to Military Administration war/conquest pressure. The mapping
  is table-driven; it must not add either a Military Administration or Courthouse
  branch.
- The existing unrest-relief production scoring uses active target-row pressure to
  value Military Administration in an eligible city; it must not value the building
  in a peaceful, settled city merely because it exists in the catalog.
- Research planning gives `civil-service` the existing generic relief pull only when
  at least two AI cities have applicable war or recent-conquest pressure and the AI
  does not already have the building available: `6 + 1.5 × pressuredCityCount`,
  capped at 18. The pull is not an unconditional civic preference.
- AI and human eligibility use the same building catalog and relief calculation.

Military Administration introduces **no new difficulty scaling**. Its availability,
relief formula, AI input data, and AI scoring are identical across Explorer, Standard,
and Veteran. Human players' per-civilization challenge remains the only source of
their own unrest-pressure severity behavior.

## Player-facing guidance and presentation

Both `War weariness` and `Recent conquest` guidance resolvers prefer a new
`build-military-administration` recommendation whenever the city can build the
building. When it is not buildable, they retain their present truthful fallbacks:

- War weariness: make peace.
- Recent conquest: wait for settlement and, when missing, the later Constitutional
  Law research note.

The UI copy describes the exact localized effect in plain language and identifies the
city as the scope. The city panel's existing pressure breakdown displays the new
negative row immediately after construction, and the overview/top-lever surface uses
the same structured recommendation data. Reuse the normal building-complete sound;
there is no new sound asset or separate audio event.

### Early-response truth table

Military Administration is both a preventative build and an emergency gold purchase,
not a promise that a production-locked city can construct its way out of revolt. The
ordinary city-panel queue action remains available while an unrest production lock is
active, but the city generates no production until it recovers. Once Military
Administration is the active non-wonder item, the normal rush-buy path remains
available during that lock whenever the owner has enough gold and its treasury is not
in high or critical strain. The displayed purchase price always comes from the shared
rush-buy quote because remaining production and any applicable production modifier can
change it. The zero-progress, no-discount regression fixture costs exactly
`ceil(45 × 2.5) = 113` gold.

| City state | Player sees | Immediate outcome |
|---|---|---|
| War/conquest pressure, production active | Build Military Administration recommendation and normal queue option | 45 production investment; the relief row appears when completed. |
| War/conquest pressure, production locked, owner can afford the displayed quote and has an eligible treasury | Build recommendation plus the normal quote-derived `Buy now: … gold` control after queuing it | Existing rush-buy completion fires; panel rerenders with the negative relief row. |
| War/conquest pressure, production locked, insufficient gold or blocked treasury | A truthful existing rush-buy disabled reason; make-peace / wait guidance remains visible | No instant escape is implied; the player can restore economic capacity, make peace, or wait. |
| No applicable target row | No Military Administration relief row and no recommendation | The building is optional catalog content, not an unrest alarm. |

## Ownership, solo, hot-seat, and saves

All calculations use the target `city.owner` and that civilization's diplomacy and
technology state. They never read `state.currentPlayer` for relief, eligibility, or
guidance. This preserves correct behavior in solo games, AI turns, and hot-seat games
where another civilization is currently active.

Because the feature only recognizes a new ordinary building ID in `city.buildings`,
existing saves load unchanged. No save-schema increment or migration is needed. A
legacy save can build the new catalog entry as soon as it meets its ordinary
prerequisites; a save that already contains a manually injected building ID remains
safe because the relief source is derived on every calculation.

## Verification contract

Implementation must add focused regression coverage for:

1. exact negative-row arithmetic for war-only, conquest-only, and combined pressure;
2. the `-18` ceiling, no over-relief, and no row when neither target positive row is
   present;
3. Constitutional Law composition, including its positive-row-first ordering;
4. the actual faction-turn escalation/de-escalation decision, not just breakdown
   display values;
5. generic catalog, icon, technology-unlock, and AI production/research participation;
6. resolver preference while the building is available, and preserved make-peace /
   wait / Constitutional Law fallbacks when it is not;
7. player-visible immediate city-panel refresh after building completion;
8. solo human, AI, and hot-seat owner parity; and
9. loading legacy-shaped saves without migration or corruption;
10. queueing and rush-buying the building during a production lock, including a
    zero-progress/no-discount 113-gold fixture, a modifier/progress-sensitive quoted
    price, and the insufficient-gold / high-strain fallbacks; and
11. identical human and AI relief arithmetic across Explorer, Standard, and Veteran.

The implementation also reruns the applicable pacing outlier gate. Military
Administration is a stability building rather than an economic yield source, so it
must follow the existing `UNREST_RELIEF_SOURCES` reference-economy exclusion rather
than distort the yield baseline.

## Non-goals

- No new stance, policy screen, modal, or durable policy state.
- No global war-weariness reduction.
- No alteration to the positive formulas for `War weariness` or `Recent conquest`.
- No special-case UI-only state mutation or AI-only effect.
- No dedicated SFX asset.
