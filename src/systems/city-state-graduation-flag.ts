/**
 * #497: a save that predates city-state graduation, and any game that has not opted in, resolves to 'off'.
 * Like superweapons, deliberately NOT "undefined inherits the live default": switching graduation on in a
 * running campaign has to be a choice, because it changes who the other civilizations are.
 *
 * Typed structurally (not against `GameState`) so this leaf stays out of the core-types compatibility barrel's
 * importer count (#1361); `GameSettings.cityStateGraduation` is the field it reads.
 */
interface CityStateGraduationSettings {
  cityStateGraduation?: 'off' | 'on';
}

export function resolveCityStateGraduationFlag(settings: CityStateGraduationSettings | undefined): 'off' | 'on' {
  return settings?.cityStateGraduation ?? 'off';
}

export function isCityStateGraduationEnabled(state: { settings?: CityStateGraduationSettings }): boolean {
  return resolveCityStateGraduationFlag(state.settings) === 'on';
}
