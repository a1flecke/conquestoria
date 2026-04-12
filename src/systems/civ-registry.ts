import type { CivDefinition, CustomCivDefinition } from '@/core/types';
import { getCivDefinition, CIV_DEFINITIONS } from '@/systems/civ-definitions';
import { normalizeCustomCivDefinitions } from '@/systems/custom-civ-system';

function getCustomCivDefinitions(customCivilizations: CustomCivDefinition[] | undefined): CivDefinition[] {
  return normalizeCustomCivDefinitions(customCivilizations ?? []);
}

export function resolveCivDefinition(
  stateLike: { settings: { customCivilizations?: CustomCivDefinition[] } },
  civId: string,
): CivDefinition | undefined {
  const custom = getCustomCivDefinitions(stateLike.settings.customCivilizations)
    .find(definition => definition.id === civId);
  return custom ?? getCivDefinition(civId);
}

export function getPlayableCivDefinitions(
  settingsLike: { customCivilizations?: CustomCivDefinition[] },
): CivDefinition[] {
  return [...CIV_DEFINITIONS, ...getCustomCivDefinitions(settingsLike.customCivilizations)];
}
