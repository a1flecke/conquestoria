/**
 * The schema version a save written by the current build carries.
 *
 * Extracted to its own zero-dependency leaf module (#1004) so that
 * `createNewGame` can stamp a fresh game with it without importing the whole
 * `save-migrations` graph (which pulls in most of `src/systems`). A brand-new
 * game is, by definition, already at the current schema — leaving
 * `saveSchemaVersion` undefined made `readSchemaVersion()` fall back to 0 and
 * run the entire historical migration chain over it on the first save.
 *
 * Bump this in the same change that adds `SAVE_MIGRATIONS[<this value>]`.
 */
export const CURRENT_SAVE_SCHEMA_VERSION = 28;
