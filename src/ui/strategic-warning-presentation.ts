import type { GameEvents } from '@/core/types';

export interface StrategicWarningPresentation {
  message: string;
  type: 'info' | 'warning' | 'success';
  target?: GameEvents['ai:strategic-warning']['target'];
}

export function presentStrategicWarning(
  event: GameEvents['ai:strategic-warning'],
): StrategicWarningPresentation {
  if (event.kind === 'recovery') {
    return {
      message: 'The raid was broken. Independent threats will need time to regroup.',
      type: 'success',
      ...(event.target ? { target: event.target } : {}),
    };
  }
  if (event.kind === 'resource-restored') {
    return {
      message: `Access to ${event.resource ?? 'the resource'} at the ${event.regionLabel ?? 'outpost'} has been restored.`,
      type: 'success',
      ...(event.target ? { target: event.target } : {}),
    };
  }
  if (event.kind === 'resource-denied') {
    return {
      message: `Hostile raiders have cut access to ${event.resource ?? 'a resource'} at the ${event.regionLabel ?? 'outpost'}. Drive them off to restore the resource.`,
      type: 'warning',
      ...(event.target ? { target: event.target } : {}),
    };
  }
  if (event.actorId.startsWith('pirate')) {
    const message = event.kind === 'blockade'
      ? 'Pirate activity indicates a blockade is forming. Review known pirate waters and protect coastal trade.'
      : 'Pirate activity indicates a raid is forming. Review known pirate waters and protect exposed shipping.';
    return {
      message,
      type: 'warning',
      ...(event.target ? { target: event.target } : {}),
    };
  }
  if (event.kind === 'raid' && event.resource) {
    return {
      message: `Raiders are moving toward the ${event.targetLabel ?? `${event.resource} outpost`}. Intercept them or destroy their camp.`,
      type: 'warning',
      ...(event.target ? { target: event.target } : {}),
    };
  }
  if (event.kind === 'withdrawing') {
    return {
      message: `${event.actorName} forces are withdrawing. Their immediate pressure may be easing.`,
      type: 'info',
      ...(event.target ? { target: event.target } : {}),
    };
  }
  if (event.evidence === 'remembered') {
    return {
      message: `Scouts last reported ${event.actorName} troops gathering in the ${event.regionLabel ?? 'border marches'}. Their current position is uncertain.`,
      type: 'warning',
      ...(event.target ? { target: event.target } : {}),
    };
  }
  if (event.targetLabel) {
    return {
      message: `A ${event.actorName} force is gathering against ${event.targetLabel}. Reinforce the city, disrupt the rally, or seek peace.`,
      type: 'warning',
      ...(event.target ? { target: event.target } : {}),
    };
  }
  return {
    message: `A ${event.actorName} force is gathering near our border. Reinforce nearby cities or scout their approach.`,
    type: 'warning',
    ...(event.target ? { target: event.target } : {}),
  };
}
