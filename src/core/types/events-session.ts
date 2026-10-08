// SessionEvents: the session slice of the GameEvents map (#1361). GameEvents in core/types.ts extends this interface; keys, payloads and
// emit/listen behavior are unchanged. Leaf: type-only imports of other leaves, never the barrel.
import type { HexCoord } from './hex';
import type { ResourceType } from './resources';

export interface SessionEvents {
  'turn:start': { turn: number; playerId: string };
  'turn:end': { turn: number; playerId: string };
  'ai:strategic-warning': {
    viewerId: string;
    actorId: string;
    actorName: string;
    warningKey: string;
    kind:
      | 'mobilizing'
      | 'raid'
      | 'blockade'
      | 'resource-denied'
      | 'resource-restored'
      | 'withdrawing'
      | 'recovery'
      | 'domination'
      | 'domination-eased'
      // #1090: a major civ's national intent (#1086) enters 'dominate' or 'recover' --
      // the two "noteworthy" transitions; expand/develop are deliberately never surfaced
      // (too frequent, low player value).
      | 'posture-shift';
    evidence: 'visible' | 'remembered' | 'earned-intel';
    targetLabel?: string;
    regionLabel?: string;
    resource?: ResourceType;
    target?: { kind: 'map'; coord: HexCoord; label: string };
    /** Present only for kind: 'posture-shift'. */
    posture?: 'dominate' | 'recover';
    playAudio: boolean;
  };
  'ai:strategic-warning-audio': {
    viewerId: string;
    turn: number;
  };
  'fog:revealed': { tiles: HexCoord[] };
  'road:started': { unitId: string; coord: HexCoord };
  'road:completed': { coord: HexCoord };
  'submarine:sighted': { unitId: string; civId: string };
  'notification:show': { message: string; type: 'info' | 'warning' | 'success' };
  'game:saved': { turn: number };
  'game:loaded': { turn: number };
  'game:over': { winnerId: string };
  'ui:select-unit': { unitId: string };
  'ui:select-city': { cityId: string };
  'ui:deselect': {};
}
