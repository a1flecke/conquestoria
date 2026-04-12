import { describe, expect, it } from 'vitest';
import type { CustomCivDefinition } from '@/core/types';
import { getPlayableCivDefinitions, resolveCivDefinition } from '@/systems/civ-registry';
import {
  normalizeCustomCivDefinition,
  normalizeCustomCivDefinitions,
  validateCustomCivDefinition,
} from '@/systems/custom-civ-system';

const customCiv: CustomCivDefinition = {
  id: 'custom-sunfolk',
  name: 'Sunfolk',
  color: '#d9a441',
  leaderName: 'Aurelia',
  cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
  primaryTrait: 'scholarly',
  temperamentTraits: ['diplomatic', 'trader'],
};

describe('civ-registry', () => {
  it('resolves a custom civ from saved settings before falling back to built-in definitions', () => {
    const state: { settings: { customCivilizations: CustomCivDefinition[] } } = {
      settings: {
        customCivilizations: [customCiv],
      },
    };

    const resolved = resolveCivDefinition(state, 'custom-sunfolk');
    expect(resolved?.id).toBe('custom-sunfolk');
    expect(resolved?.name).toBe('Sunfolk');
    expect(resolved?.bonusName).toBe('Academies of State');
    expect(resolved?.bonusEffect).toEqual({ type: 'extra_tech_speed', speedMultiplier: 1.15 });
    expect(resolved?.personality.traits).toEqual(expect.arrayContaining(['diplomatic', 'trader']));
  });

  it('falls back to built-in definitions when civ is not custom', () => {
    const state: { settings: { customCivilizations: CustomCivDefinition[] } } = {
      settings: { customCivilizations: [] },
    };

    const resolved = resolveCivDefinition(state, 'rome');
    expect(resolved?.id).toBe('rome');
    expect(resolved?.name).toBe('Rome');
  });

  it('resolves built-in civs that lack leaderName and cityNames without crashing', () => {
    const state: { settings: { customCivilizations: CustomCivDefinition[] } } = {
      settings: { customCivilizations: [] },
    };

    const resolved = resolveCivDefinition(state, 'rome');
    expect(resolved).toBeTruthy();
    expect(resolved?.bonusEffect).toBeDefined();
    expect(resolved?.personality).toBeDefined();
  });

  it('returns undefined for unknown civ IDs', () => {
    const state: { settings: { customCivilizations: CustomCivDefinition[] } } = {
      settings: { customCivilizations: [] },
    };

    expect(resolveCivDefinition(state, 'nonexistent')).toBeUndefined();
  });

  it('includes custom civs in the playable civ list', () => {
    const defs = getPlayableCivDefinitions({ customCivilizations: [customCiv] });
    expect(defs.find(d => d.id === 'custom-sunfolk')).toBeTruthy();
    expect(defs.find(d => d.id === 'rome')).toBeTruthy();
  });

  it('rejects duplicate custom civ ids in one registry payload', () => {
    expect(() => normalizeCustomCivDefinitions([
      customCiv,
      { ...customCiv, name: 'Sunfolk Mirror' },
    ])).toThrow('Duplicate custom civilization ID');
  });
});

describe('custom-civ-system validation', () => {
  it('rejects custom civ IDs that collide with built-in civilizations', () => {
    expect(() => validateCustomCivDefinition({
      ...customCiv,
      id: 'rome',
    })).toThrow('collides with a built-in civilization');
  });

  it('requires custom civ IDs to start with the custom- prefix', () => {
    expect(() => validateCustomCivDefinition({
      ...customCiv,
      id: 'sunfolk',
    })).toThrow('must start with "custom-"');
  });

  it('requires at least 6 city names', () => {
    expect(() => validateCustomCivDefinition({
      ...customCiv,
      cityNames: ['A', 'B', 'C'],
    })).toThrow('city-name pool');
  });

  it('rejects duplicate city names', () => {
    expect(() => validateCustomCivDefinition({
      ...customCiv,
      cityNames: ['Solara', 'Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch'],
    })).toThrow('unique names');
  });

  it('requires a valid hex color', () => {
    expect(() => validateCustomCivDefinition({
      ...customCiv,
      color: 'red',
    })).toThrow('hex color');
  });

  it('requires 1-2 temperament traits', () => {
    expect(() => validateCustomCivDefinition({
      ...customCiv,
      temperamentTraits: [],
    })).toThrow('temperament traits');
  });

  it('rejects an unknown primary trait', () => {
    expect(() => validateCustomCivDefinition({
      ...customCiv,
      primaryTrait: 'nonexistent' as any,
    })).toThrow('Unknown primary trait');
  });
});

describe('custom-civ-system normalization', () => {
  it('normalizes a custom civ into a full CivDefinition', () => {
    const normalized = normalizeCustomCivDefinition(customCiv);
    expect(normalized.id).toBe('custom-sunfolk');
    expect(normalized.name).toBe('Sunfolk');
    expect(normalized.color).toBe('#d9a441');
    expect(normalized.leaderName).toBe('Aurelia');
    expect(normalized.cityNames).toEqual(customCiv.cityNames);
    expect(normalized.bonusName).toBe('Academies of State');
    expect(normalized.bonusEffect).toEqual({ type: 'extra_tech_speed', speedMultiplier: 1.15 });
    expect(normalized.personality.traits).toEqual(expect.arrayContaining(['diplomatic', 'trader']));
  });
});
