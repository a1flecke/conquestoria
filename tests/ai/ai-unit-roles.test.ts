import { describe, expect, it } from 'vitest';
import { getAIStrategicRoles } from '@/ai/ai-unit-roles';
import type { UnitType } from '@/core/types';
import { TRAINABLE_UNITS } from '@/systems/city-system';

describe('AI strategic unit roles', () => {
  it('classifies every trainable unit into at least one strategic role', () => {
    for (const unit of TRAINABLE_UNITS) {
      expect(getAIStrategicRoles(unit.type), unit.type).not.toHaveLength(0);
    }
  });

  it.each([
    ['warrior', ['frontline', 'capture']],
    ['archer', ['ranged', 'capture']],
    ['horseman', ['mobile', 'capture']],
    ['catapult', ['siege', 'ranged']],
    ['galley', ['naval-combat', 'escort']],
  ] satisfies Array<[UnitType, string[]]>)('classifies %s from canonical unit fields', (type, roles) => {
    expect(getAIStrategicRoles(type)).toEqual(roles);
  });

  it('never treats air units as capture units', () => {
    for (const unit of TRAINABLE_UNITS) {
      if (['observation_balloon', 'biplane', 'jet_fighter', 'attack_helicopter'].includes(unit.type)) {
        expect(getAIStrategicRoles(unit.type), unit.type).not.toContain('capture');
      }
    }
  });

  it('keeps transports out of frontline duty', () => {
    for (const type of ['transport', 'carrack', 'galleon', 'steamship', 'troop_transport'] as UnitType[]) {
      expect(getAIStrategicRoles(type), type).toContain('transport');
      expect(getAIStrategicRoles(type), type).not.toContain('frontline');
      expect(getAIStrategicRoles(type), type).not.toContain('capture');
    }
  });

  it('assigns spies to espionage rather than conventional combat', () => {
    for (const type of ['spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_hacker'] as UnitType[]) {
      expect(getAIStrategicRoles(type), type).toContain('espionage');
      expect(getAIStrategicRoles(type), type).not.toContain('frontline');
      expect(getAIStrategicRoles(type), type).not.toContain('capture');
    }
  });

  it('keeps civilian support purposes distinct', () => {
    expect(getAIStrategicRoles('settler')).toEqual(['settlement']);
    expect(getAIStrategicRoles('worker')).toEqual(['worker']);
    expect(getAIStrategicRoles('expedition')).toEqual(['resource-expedition', 'recon']);
    expect(getAIStrategicRoles('caravan')).toEqual(['trade']);
  });

  it('preserves the intended detection-unit specializations', () => {
    expect(getAIStrategicRoles('scout_hound')).toEqual(['detection', 'frontline']);
    expect(getAIStrategicRoles('shadow_warden')).toEqual(['detection', 'frontline']);
    expect(getAIStrategicRoles('war_hound')).toEqual([
      'detection',
      'frontline',
      'mobile',
      'capture',
    ]);
  });
});
