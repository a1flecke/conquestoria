export interface ProductionPrerequisiteDefinition {
  techRequired?: string | null;
  requiredTechs?: readonly string[];
}

export interface ProductionPrerequisiteEvaluation {
  required: string[];
  satisfied: string[];
  missing: string[];
}

export function getRequiredTechIds(definition: ProductionPrerequisiteDefinition): string[] {
  const required = [
    ...(definition.techRequired ? [definition.techRequired] : []),
    ...(definition.requiredTechs ?? []),
  ];
  return [...new Set(required)];
}

export function evaluateProductionPrerequisites(
  definition: ProductionPrerequisiteDefinition,
  completedTechs: readonly string[] | ReadonlySet<string>,
): ProductionPrerequisiteEvaluation {
  const completed = completedTechs instanceof Set ? completedTechs : new Set(completedTechs);
  const required = getRequiredTechIds(definition);
  const satisfied = required.filter(techId => completed.has(techId));
  return {
    required,
    satisfied,
    missing: required.filter(techId => !completed.has(techId)),
  };
}

export function validateProductionPrerequisiteDefinitions(
  definitions: Iterable<ProductionPrerequisiteDefinition & { id: string }>,
  knownTechIds: ReadonlySet<string>,
  reachableTechIds: ReadonlySet<string> = knownTechIds,
): string[] {
  const errors: string[] = [];
  for (const definition of definitions) {
    if (definition.requiredTechs?.length === 0) {
      errors.push(`${definition.id}: requiredTechs must not be empty`);
    }
    const declared = [
      ...(definition.techRequired ? [definition.techRequired] : []),
      ...(definition.requiredTechs ?? []),
    ];
    const seen = new Set<string>();
    for (const techId of declared) {
      if (seen.has(techId)) {
        errors.push(`${definition.id}: duplicate prerequisite ${techId}`);
      } else if (!knownTechIds.has(techId)) {
        errors.push(`${definition.id}: unknown prerequisite ${techId}`);
      } else if (!reachableTechIds.has(techId)) {
        errors.push(`${definition.id}: unreachable prerequisite ${techId}`);
      }
      seen.add(techId);
    }
  }
  return errors;
}
