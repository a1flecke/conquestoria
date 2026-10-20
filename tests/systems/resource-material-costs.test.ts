import { describe, expect, it } from 'vitest';
import {
  aggregateMaterialRows,
  consumeMaterialRecipe,
  evaluateMaterialFunding,
  getMaterialRecipe,
  reserveMaterialRecipe,
  validateMaterialCatalog,
  validateMaterialRecipe,
  type MaterialRecipe,
} from '@/systems/resource-material-costs';
import {
  accrueNativeStock,
  createEmptyReserveLedger,
  getCommittedQuantity,
  getReserveBalance,
  reserveStock,
  type ReserveLedger,
} from '@/systems/resource-reserve-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';
import { BUILDINGS } from '@/systems/city-building-catalog';
import { TRAINABLE_UNITS } from '@/systems/city-unit-catalog';

/**
 * #1506 MR09 — the hard-material catalog and the pure recipe arithmetic.
 *
 * The §3.1 inventory is asserted row-by-row so a later catalog edit cannot silently drop or halve a
 * requirement. The knight row is the conjunctive case: 10 horses AND 10 iron, never 10 of either.
 */

const iron = resourceGoodId('iron');
const horses = resourceGoodId('horses');
const copper = resourceGoodId('copper');
const stone = resourceGoodId('stone');
const oil = resourceGoodId('oil');
const uranium = resourceGoodId('uranium');
const aluminum = resourceGoodId('aluminum');

const EXPECTED_RECIPES: Record<string, Array<[string, number]>> = {
  // Units
  axeman: [[copper, 10]],
  crossbowman: [[copper, 10]],
  swordsman: [[iron, 10]],
  ballista: [[iron, 10]],
  horseman: [[horses, 10]],
  chariot: [[horses, 10]],
  cavalry: [[horses, 10]],
  knight: [[horses, 10], [iron, 10]],
  cuirassier: [[horses, 10], [iron, 10]],
  catapult: [[stone, 10]],
  missile_submarine: [[uranium, 10]],
  // Buildings / national projects
  'bronze-workshop': [[copper, 10]],
  armory: [[copper, 10]],
  ranch: [[horses, 10]],
  'cavalry-academy': [[horses, 10]],
  'iron-foundry': [[iron, 10]],
  'war-academy': [[iron, 10]],
  steel_mill: [[iron, 10]],
  'masonry-works': [[stone, 10]],
  'siege-workshop': [[stone, 10]],
  oil_refinery: [[oil, 10]],
  nuclear_arsenal: [[uranium, 10]],
  nuclear_power_plant: [[uranium, 10]],
  manhattan_project: [[uranium, 10]],
  warhead: [[uranium, 10]],
  interstellar_launch_program: [[uranium, 10]],
  first_satellite_launch: [[aluminum, 10]],
};

function rowsOf(itemId: string): Array<[string, number]> {
  const found = getMaterialRecipe(itemId);
  if (!found.known) throw new Error(`${itemId} must be a known item`);
  return found.recipe.rows.map(row => [row.goodId, row.quantity]);
}

function seeded(counts: Readonly<Record<string, number>>): ReserveLedger {
  let ledger = createEmptyReserveLedger();
  for (const [goodId, amount] of Object.entries(counts)) {
    const result = accrueNativeStock(ledger, goodId, amount);
    if (!result.ok) throw new Error(`seed failed for ${goodId}`);
    ledger = result.ledger;
  }
  return ledger;
}

const consumer = { ownerCivId: 'alpha', cityId: 'city-a', occurrence: 1, itemId: 'knight' };

describe('#1506 MR09 — the hard-material catalog', () => {
  it('converts every old hard requirement to the calibrated 10-unit recipe', () => {
    for (const [itemId, expected] of Object.entries(EXPECTED_RECIPES)) {
      expect(rowsOf(itemId), itemId).toEqual(expected);
    }
  });

  it('does not leave an unconverted hard requirement anywhere in the catalog', () => {
    const converted = new Set(Object.keys(EXPECTED_RECIPES));
    for (const building of Object.values(BUILDINGS)) {
      if (building.resourceRequired?.length) {
        expect(converted.has(building.id), `${building.id} still has resourceRequired`).toBe(true);
      }
    }
    for (const unit of TRAINABLE_UNITS) {
      if (unit.resourceRequired?.length) {
        expect(converted.has(unit.type), `${unit.type} still has resourceRequired`).toBe(true);
      }
    }
  });

  it('derives resourceRequired from materialCosts so the projection cannot drift', () => {
    for (const building of Object.values(BUILDINGS)) {
      const recipe = getMaterialRecipe(building.id);
      if (!recipe.known) continue;
      expect(building.resourceRequired ?? [], building.id)
        .toEqual(recipe.recipe.rows.map(row => row.goodId.replace('resource:', '')));
    }
    for (const unit of TRAINABLE_UNITS) {
      const recipe = getMaterialRecipe(unit.type);
      if (!recipe.known) continue;
      expect(unit.resourceRequired ?? [], unit.type)
        .toEqual(recipe.recipe.rows.map(row => row.goodId.replace('resource:', '')));
    }
  });

  it('treats an unknown item as a typed refusal, never a free recipe', () => {
    expect(getMaterialRecipe('not-an-item')).toEqual({ known: false, itemId: 'not-an-item' });
  });

  it('gives a known resource-free item a valid empty recipe', () => {
    const found = getMaterialRecipe('warrior');
    expect(found.known).toBe(true);
    if (!found.known) return;
    expect(found.recipe.rows).toEqual([]);
    expect(validateMaterialRecipe(found.recipe)).toEqual([]);
  });

  it('validates the whole shipped catalog', () => {
    expect(validateMaterialCatalog()).toEqual([]);
  });

  it('aggregates duplicated rows instead of paying the last one', () => {
    const aggregated = aggregateMaterialRows([
      { goodId: iron, quantity: 5 },
      { goodId: horses, quantity: 4 },
      { goodId: iron, quantity: 5 },
    ]);
    expect(aggregated).toEqual([{ goodId: iron, quantity: 10 }, { goodId: horses, quantity: 4 }]);
    expect(validateMaterialRecipe({ itemId: 'x', kind: 'unit', rows: aggregated })).toEqual([]);
  });

  it('rejects unknown goods, access goods, duplicate rows and non-positive quantities', () => {
    const base = { itemId: 'x', kind: 'unit' as const };
    expect(validateMaterialRecipe({ ...base, rows: [{ goodId: 'resource:unobtainium', quantity: 10 }] })
      .some(error => error.includes('unknown trade good'))).toBe(true);
    // Cattle settles as continuing access — a hard recipe can never consume it as stock.
    expect(validateMaterialRecipe({ ...base, rows: [{ goodId: resourceGoodId('cattle'), quantity: 10 }] })
      .some(error => error.includes('only a stored-quantity good'))).toBe(true);
    expect(validateMaterialRecipe({
      ...base,
      rows: [{ goodId: iron, quantity: 5 }, { goodId: iron, quantity: 5 }],
    }).some(error => error.includes('must be aggregated'))).toBe(true);
    for (const quantity of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2]) {
      expect(validateMaterialRecipe({ ...base, rows: [{ goodId: iron, quantity }] })
        .some(error => error.includes('positive safe integer')), String(quantity)).toBe(true);
    }
  });
});

describe('#1506 MR09 — pure funding evaluation', () => {
  const knight = getMaterialRecipe('knight');
  if (!knight.known) throw new Error('knight must be known');

  it('reports exact required/committed/available/missing rows without mutating the ledger', () => {
    const ledger = seeded({ [horses]: 10, [iron]: 4 });
    const before = JSON.stringify(ledger);
    const funding = evaluateMaterialFunding(ledger, knight.recipe);
    expect(JSON.stringify(ledger)).toBe(before);
    expect(funding.rows).toEqual([
      { goodId: horses, required: 10, committed: 0, available: 10, missing: 0 },
      { goodId: iron, required: 10, committed: 0, available: 4, missing: 6 },
    ]);
    expect(funding.missingQuantity).toBe(6);
    expect(funding.funded).toBe(false);
  });

  it('counts a commitment this item already holds as available, not as free stock', () => {
    const reserved = reserveStock(seeded({ [iron]: 10 }), {
      id: 'city-a:1:knight:iron', goodId: iron, ownerCivId: 'alpha', amount: 10,
      reason: 'active-production', consumer,
    });
    if (!reserved.ok) throw new Error('reservation must succeed');
    expect(evaluateMaterialFunding(reserved.ledger, knight.recipe).funded).toBe(false);
    expect(evaluateMaterialFunding(reserved.ledger, knight.recipe, { [iron]: 10 }).funded).toBe(false);
    expect(evaluateMaterialFunding(reserved.ledger, knight.recipe, { [iron]: 10, [horses]: 10 }).funded).toBe(true);
  });

  it('requires both full rows: horses alone or iron alone is not enough', () => {
    const onlyHorses = getMaterialRecipe('knight');
    if (!onlyHorses.known) return;
    expect(evaluateMaterialFunding(seeded({ [horses]: 10 }), onlyHorses.recipe).funded).toBe(false);
    expect(evaluateMaterialFunding(seeded({ [iron]: 10 }), onlyHorses.recipe).funded).toBe(false);
    expect(evaluateMaterialFunding(seeded({ [horses]: 10, [iron]: 10 }), onlyHorses.recipe).funded).toBe(true);
  });
});

describe('#1506 MR09 — atomic recipe reservation and spend', () => {
  const knight = getMaterialRecipe('knight');
  if (!knight.known) throw new Error('knight must be known');

  it('reserves every row or nothing at all', () => {
    const short = seeded({ [horses]: 10, [iron]: 4 });
    const refused = reserveMaterialRecipe(short, knight.recipe, consumer);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.ledger).toBe(short);
    expect(refused.ledger.reservations).toEqual([]);
    expect(refused.missing.map(row => row.goodId)).toEqual([iron]);

    const funded = seeded({ [horses]: 10, [iron]: 10 });
    const reserved = reserveMaterialRecipe(funded, knight.recipe, consumer);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(reserved.reservations.map(reservation => reservation.goodId)).toEqual([horses, iron]);
    expect(getCommittedQuantity(reserved.ledger, horses)).toBe(10);
    expect(getCommittedQuantity(reserved.ledger, iron)).toBe(10);
    // Reservation is not a debit.
    expect(getReserveBalance(reserved.ledger, horses).native).toBe(10);
  });

  it('spends every row against its own reservation, removing the commitments', () => {
    const reserved = reserveMaterialRecipe(seeded({ [horses]: 10, [iron]: 10 }), knight.recipe, consumer);
    if (!reserved.ok) throw new Error('reservation must succeed');
    const reservationIds = Object.fromEntries(
      reserved.reservations.map(reservation => [reservation.goodId, reservation.reservationId]),
    );

    const spent = consumeMaterialRecipe(reserved.ledger, knight.recipe, { reservationIds });
    expect(spent.ok).toBe(true);
    if (!spent.ok) return;
    expect(spent.consumed).toEqual([
      { goodId: horses, imported: 0, native: 10 },
      { goodId: iron, imported: 0, native: 10 },
    ]);
    expect(getReserveBalance(spent.ledger, horses)).toEqual({ native: 0, imported: 0 });
    expect(getReserveBalance(spent.ledger, iron)).toEqual({ native: 0, imported: 0 });
    expect(spent.ledger.reservations).toEqual([]);
  });

  it('never spends the first row when a later row cannot be paid', () => {
    const reserved = reserveMaterialRecipe(seeded({ [horses]: 10, [iron]: 10 }), knight.recipe, consumer);
    if (!reserved.ok) throw new Error('reservation must succeed');
    const reservationIds = Object.fromEntries(
      reserved.reservations.map(reservation => [reservation.goodId, reservation.reservationId]),
    );

    // A recipe that also needs stone, of which nothing is stored or reserved.
    const impossible: MaterialRecipe = {
      itemId: 'fixture', kind: 'unit',
      rows: [{ goodId: horses, quantity: 10 }, { goodId: stone, quantity: 10 }],
    };
    const spent = consumeMaterialRecipe(reserved.ledger, impossible, { reservationIds });
    expect(spent.ok).toBe(false);
    if (spent.ok) return;
    expect(spent.goodId).toBe(stone);
    expect(spent.ledger).toBe(reserved.ledger);
    expect(getReserveBalance(spent.ledger, horses).native).toBe(10);
    expect(getCommittedQuantity(spent.ledger, horses)).toBe(10);
  });

  it('refuses an unreserved recipe when only another commitment holds the stock', () => {
    const reserved = reserveMaterialRecipe(seeded({ [horses]: 10, [iron]: 10 }), knight.recipe, consumer);
    if (!reserved.ok) throw new Error('reservation must succeed');
    const spent = consumeMaterialRecipe(reserved.ledger, knight.recipe);
    expect(spent.ok).toBe(false);
    if (spent.ok) return;
    expect(spent.reason).toBe('insufficient-free-stock');
    expect(spent.ledger).toBe(reserved.ledger);
  });
});
