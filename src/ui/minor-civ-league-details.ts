import type { MinorCivLeaguePresentation } from '@/systems/minor-civ-league-presentation';

function readinessDetail(readinessLabel: string): string {
  if (readinessLabel === 'Concern reported') {
    return 'A member reports regional tension. Members may prepare their own defenses after a short warning.';
  }
  if (readinessLabel === 'Preparing local defenses') {
    return 'Members may favor local defenses. Each pays its own costs.';
  }
  if (readinessLabel === 'Tensions easing') {
    return 'Tensions are easing. Members choose their normal local investments.';
  }
  return 'Members favor their charter’s local investments when their own needs allow.';
}

/** Builds a disclosure exclusively from the viewer-safe compact DTO. */
export function createMinorCivLeagueDetails(
  presentation: MinorCivLeaguePresentation,
): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'minor-civ-compact-details';
  details.style.cssText = 'margin-top:6px;font-size:11px;line-height:1.4;opacity:0.82;';

  const summary = document.createElement('summary');
  summary.textContent = 'About this compact';
  summary.style.cursor = 'pointer';
  details.append(summary);

  const description = document.createElement('p');
  description.textContent = `${presentation.name} · ${presentation.charterLabel} · ${presentation.summary}`;
  description.style.margin = '5px 0 0';
  details.append(description);

  const readiness = document.createElement('p');
  readiness.textContent = `${presentation.readinessLabel}. ${readinessDetail(presentation.readinessLabel)}`;
  readiness.style.margin = '3px 0 0';
  details.append(readiness);

  const members = document.createElement('ul');
  members.style.cssText = 'margin:4px 0;padding-left:18px;';
  for (const member of presentation.knownMembers) {
    const item = document.createElement('li');
    item.textContent = member.name;
    item.style.color = member.color;
    if (member.connectedDetail) {
      const detail = document.createElement('span');
      detail.textContent = member.connectedDetail;
      detail.style.cssText = 'display:block;margin:1px 0 0 4px;opacity:0.86;';
      item.append(detail);
    }
    members.append(item);
  }
  details.append(members);

  if (presentation.hasUnknownMembers) {
    const unknown = document.createElement('p');
    unknown.textContent = 'Other members not yet met.';
    unknown.style.margin = '3px 0 0';
    details.append(unknown);
  }

  const independence = document.createElement('p');
  independence.textContent = 'Each city-state makes its own peace and war decisions.';
  independence.style.margin = '3px 0 0';
  details.append(independence);
  return details;
}
