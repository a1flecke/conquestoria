// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createRequiredChoicePanel } from '@/ui/required-choice-panel';

describe('required-choice-panel', () => {
  it('renders both research and production prompts with actionable buttons', () => {
    const panel = createRequiredChoicePanel(document.body, {
      researchChoices: [{ techId: 'fire', label: 'Fire', turns: 4 }],
      cityChoices: [{ cityId: 'city-1', cityName: 'Roma', itemId: 'warrior', label: 'Warrior', turns: 3 }],
      onChooseResearch: vi.fn(),
      onChooseCityBuild: vi.fn(),
      onOpenTech: vi.fn(),
      onOpenCity: vi.fn(),
    });

    expect(panel.textContent).toContain('Choose Research');
    expect(panel.textContent).toContain('Choose Production');
    expect(panel.querySelectorAll('button').length).toBeGreaterThan(1);
  });
});
