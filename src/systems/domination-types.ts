export type DominationDisposition = 'eliminated' | 'independent' | 'vassal' | 'provisional';

export interface DominationActorFact {
  civId: string;
  disposition: DominationDisposition;
  overlordId: string | null;
}

export interface DominationProgress {
  contenderId: string;
  eligible: boolean;
  ineligibleReason: 'not-living-major' | 'vassal' | 'provisional' | 'noncompetitive' | null;
  rivalCount: number;
  securedRivalCount: number;
  eliminatedRivalIds: string[];
  directVassalIds: string[];
  unresolvedRivalIds: string[];
  independentRivalIds: string[];
  provisionalCivIds: string[];
  conditionMet: boolean;
}
