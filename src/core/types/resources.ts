// Trade/resource kind contracts. Leaf of the core type compatibility barrel (#1361).

export type LuxuryResource = 'silk' | 'wine' | 'spices' | 'gems' | 'ivory' | 'incense'
  | 'gold' | 'silver' | 'furs' | 'sheep';
export type StrategicResource = 'copper' | 'iron' | 'horses' | 'stone' | 'cattle' | 'salt'
  | 'coal' | 'oil' | 'aluminum' | 'uranium' | 'rare-earth-elements' | 'battery-minerals';
export type ResourceType = LuxuryResource | StrategicResource;

export type ImprovementType = 'farm' | 'mine' | 'lumber_camp' | 'watermill'
  | 'plantation' | 'pasture' | 'camp' | 'quarry' | 'oil_well' | 'fort' | 'resource_outpost' | 'none';
// resource_outpost is excluded: only Expeditions can establish outposts, not Workers
export type BuildableImprovementType = Exclude<ImprovementType, 'none' | 'resource_outpost'>;
export type WorkerActionType = BuildableImprovementType | 'drain_swamp' | 'build_road' | 'restore_land';
