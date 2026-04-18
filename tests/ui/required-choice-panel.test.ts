// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { closePlanningPanels, createRequiredChoicePanel } from '@/ui/required-choice-panel';

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

  it('can be recreated cleanly for the next required choice after one action resolves', () => {
    const first = createRequiredChoicePanel(document.body, {
      researchChoices: [{ techId: 'fire', label: 'Fire', turns: 4 }],
      cityChoices: [{ cityId: 'city-1', cityName: 'Roma', itemId: 'warrior', label: 'Warrior', turns: 3 }],
      onChooseResearch: vi.fn(),
      onChooseCityBuild: vi.fn(),
      onOpenTech: vi.fn(),
      onOpenCity: vi.fn(),
    });

    expect(first.textContent).toContain('Fire');

    const second = createRequiredChoicePanel(document.body, {
      researchChoices: [],
      cityChoices: [{ cityId: 'city-2', cityName: 'Neapolis', itemId: 'shrine', label: 'Shrine', turns: 2 }],
      onChooseResearch: vi.fn(),
      onChooseCityBuild: vi.fn(),
      onOpenTech: vi.fn(),
      onOpenCity: vi.fn(),
    });

    expect(document.querySelectorAll('#required-choice-panel')).toHaveLength(1);
    expect(second.textContent).toContain('Neapolis');
    expect(second.textContent).not.toContain('Fire');
  });

  it('removes stale city and tech panels before the chooser is shown', () => {
    const techPanel = document.createElement('div');
    techPanel.id = 'tech-panel';
    const cityPanel = document.createElement('div');
    cityPanel.id = 'city-panel';
    document.body.appendChild(techPanel);
    document.body.appendChild(cityPanel);

    closePlanningPanels(document);

    expect(document.getElementById('tech-panel')).toBeNull();
    expect(document.getElementById('city-panel')).toBeNull();
  });
});
