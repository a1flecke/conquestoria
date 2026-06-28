export interface AIDecisionTrace {
  actorId: string;
  turn: number;
  decision: 'objective' | 'tactical' | 'production' | 'research';
  selectedId: string | null;
  candidates: Array<{
    id: string;
    score: number;
    eligible: boolean;
    reasonCodes: string[];
  }>;
}

export function createAIDecisionTrace(trace: AIDecisionTrace): AIDecisionTrace {
  return {
    actorId: trace.actorId,
    turn: trace.turn,
    decision: trace.decision,
    selectedId: trace.selectedId,
    candidates: trace.candidates
      .map(candidate => ({
        ...candidate,
        reasonCodes: [...candidate.reasonCodes],
      }))
      .sort((left, right) =>
        right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, 12),
  };
}
