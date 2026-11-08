/**
 * #939: a Siegemaster's Breach on a hostile city. Optional on `City` (absent = not breached; every reader tolerates
 * that, so no save migration). Swept at the end of the round it expires in (`expireCityBreaches`), so presence means
 * "active": the assault-strength and counter-fire readers never need the turn. Kept in its own leaf because the core
 * type barrel is shrink-only (#1361).
 */
export interface CityBreachState {
  /** The civ whose siege the walls are open to; the effect applies to that civ's units only. */
  byCivId: string;
  /** The issuing General's stable id, so the career/presentation can attribute it. */
  generalDefinitionId: string;
  /** The last turn it is active; it is removed at the end of the round whose turn reaches it. */
  expiresTurn: number;
}
