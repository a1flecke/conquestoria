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
  const sorted = trace.candidates
    .map(candidate => ({
      ...candidate,
      reasonCodes: [...candidate.reasonCodes],
    }))
    .sort((left, right) =>
      right.score - left.score || left.id.localeCompare(right.id));
  let candidates = sorted.slice(0, 12);
  const selected = trace.selectedId
    ? sorted.find(candidate => candidate.id === trace.selectedId)
    : undefined;
  if (selected && !candidates.some(candidate => candidate.id === selected.id)) {
    candidates = [...candidates.slice(0, 11), selected]
      .sort((left, right) =>
        right.score - left.score || left.id.localeCompare(right.id));
  }
  return {
    actorId: trace.actorId,
    turn: trace.turn,
    decision: trace.decision,
    selectedId: trace.selectedId,
    candidates,
  };
}
