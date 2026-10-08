// Trade/resource kind contracts. Leaf of the core type compatibility barrel (#1361).

export type LuxuryResource = 'silk' | 'wine' | 'spices' | 'gems' | 'ivory' | 'incense'
  | 'gold' | 'silver' | 'furs' | 'sheep';
export type StrategicResource = 'copper' | 'iron' | 'horses' | 'stone' | 'cattle' | 'salt'
  | 'coal' | 'oil' | 'aluminum' | 'uranium' | 'rare-earth-elements' | 'battery-minerals';
export type ResourceType = LuxuryResource | StrategicResource;
