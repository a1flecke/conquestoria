// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createMinorCivLeagueDetails } from '@/ui/minor-civ-league-details';

describe('minor-civ compact details', () => {
  it('renders known members and one unknown-members sentence without hidden identity data', () => {
    const details = createMinorCivLeagueDetails({
      name: 'Amber Compact',
      charterLabel: 'Commerce charter',
      summary: 'Trade and local prosperity',
      readinessLabel: 'Concern reported',
      knownMembers: [{ minorCivId: 'mc-known', name: 'Carthage', color: '#f9a825', connectedDetail: 'Local priority: trade buildings' }],
      hasUnknownMembers: true,
    });

    expect(details.outerHTML).toContain('About this compact');
    expect(details.textContent).toContain('Carthage');
    expect(details.textContent).toContain('Local priority: trade buildings');
    expect(details.textContent).toContain('Members may prepare their own defenses after a short warning.');
    expect(details.textContent).toContain('Other members not yet met.');
    expect(details.textContent).not.toContain('mc-known');
    expect(details.textContent).not.toContain('unknown-member');
  });
});
