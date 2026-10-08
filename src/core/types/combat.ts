// Combat fact and exchange/reward summary contracts (#1361). Leaf: imports nothing; used by GameEvents and notification-log.

export interface CombatModifierFact {
  key: string;
  label: string;
  sourceVisibility: 'owner' | 'public';
  operation: 'flat' | 'multiplier';
  value: number;
  outcome: 'applied' | 'ignored' | 'capped' | 'superseded';
  ignoredReason?: 'role' | 'condition' | 'unit-class' | 'domain' | 'inactive-source';
}

export type CombatExchangeKind = 'none' | 'turret-fire' | 'evasion' | 'shock' | 'siege-anti-personnel';

export interface CombatExchangeSummary {
  kind: Exclude<CombatExchangeKind, 'none'>;
  label: string;
}

export interface CombatRewardNotification {
  recipientUnitId: string;
  recipientCivId: string;
  defeatedUnitId: string;
  experienceAwarded: number;
  healthRestored: number;
  goldAwarded: number;
  surprise: {
    type: 'battlefield_insight' | 'salvaged_supplies';
    label: string;
    experienceAwarded: number;
    goldAwarded: number;
  } | null;
  message: string;
}
