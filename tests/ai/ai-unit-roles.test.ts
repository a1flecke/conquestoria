import { describe, expect, it } from 'vitest';
import { getAIStrategicRoles, hasAITradeRole } from '@/ai/ai-unit-roles';
import type { UnitType } from '@/core/types';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { isSpyUnitType } from '@/systems/espionage-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

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
    ['frigate', ['naval-combat', 'escort']],
    ['destroyer', ['naval-combat', 'escort']],
    ['artillery', ['siege', 'ranged']],
    ['infantry', ['ranged', 'capture']],
    ['bomber', ['air-combat', 'ranged']],
    ['combat_drone', ['air-combat', 'ranged']],
    ['autonomous_frigate', ['naval-combat', 'escort']],
    ['exosuit_infantry', ['ranged', 'mobile', 'capture']],
    ['propagandist', ['espionage']],
    ['drone_controller', ['detection']],
  ] satisfies Array<[UnitType, string[]]>)('classifies %s from canonical unit fields', (type, roles) => {
    expect(getAIStrategicRoles(type)).toEqual(roles);
  });

  it('never treats air units as capture units', () => {
    for (const unit of TRAINABLE_UNITS) {
      if (UNIT_DEFINITIONS[unit.type].domain === 'air') {
        expect(getAIStrategicRoles(unit.type), unit.type).not.toContain('capture');
      }
    }
  });

  it('keeps transports out of frontline duty', () => {
    for (const unit of TRAINABLE_UNITS) {
      if (UNIT_DEFINITIONS[unit.type].cargoCapacity === undefined) continue;
      expect(getAIStrategicRoles(unit.type), unit.type).toContain('transport');
      expect(getAIStrategicRoles(unit.type), unit.type).not.toContain('frontline');
      expect(getAIStrategicRoles(unit.type), unit.type).not.toContain('capture');
    }
  });

  it('assigns spies to espionage rather than conventional combat', () => {
    for (const unit of TRAINABLE_UNITS) {
      if (!isSpyUnitType(unit.type)) continue;
      expect(getAIStrategicRoles(unit.type), unit.type).toContain('espionage');
      expect(getAIStrategicRoles(unit.type), unit.type).not.toContain('frontline');
      expect(getAIStrategicRoles(unit.type), unit.type).not.toContain('capture');
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

  it('#553 MR1/4 — classifies the Naval Trader line as trade, not naval-combat (strength-0 naval units without the override would otherwise fall into naval-combat)', () => {
    for (const type of ['naval_trader', 'steamship_trader', 'cargo_freighter', 'container_ship'] satisfies UnitType[]) {
      expect(getAIStrategicRoles(type), type).toEqual(['trade']);
      expect(hasAITradeRole(type), type).toBe(true);
    }
  });

  it('hasAITradeRole: true for caravan and the naval trade line, false for combat/civilian units', () => {
    expect(hasAITradeRole('caravan')).toBe(true);
    expect(hasAITradeRole('naval_trader')).toBe(true);
    expect(hasAITradeRole('warrior')).toBe(false);
    expect(hasAITradeRole('settler')).toBe(false);
    expect(hasAITradeRole('galley')).toBe(false);
  });

  it('#553 MR2/4 — classifies the land trade line (Merchant Wagon, Freight Convoy) as trade, matching Caravan', () => {
    for (const type of ['merchant_wagon', 'freight_convoy'] satisfies UnitType[]) {
      expect(getAIStrategicRoles(type), type).toEqual(['trade']);
      expect(hasAITradeRole(type), type).toBe(true);
    }
  });

  it('#553 MR3/4 — classifies the air trade line (Air Freighter, Jet Freighter, Global Air Cargo) as trade, not recon (strength-0 air units without the override would otherwise fall into recon)', () => {
    for (const type of ['air_freighter', 'jet_freighter', 'global_air_cargo'] satisfies UnitType[]) {
      expect(getAIStrategicRoles(type), type).toEqual(['trade']);
      expect(hasAITradeRole(type), type).toBe(true);
    }
  });
});
