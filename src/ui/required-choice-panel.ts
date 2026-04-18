export interface RequiredChoiceConfig {
  researchChoices: Array<{ techId: string; label: string; turns: number }>;
  cityChoices: Array<{ cityId: string; cityName: string; itemId: string; label: string; turns: number }>;
  onChooseResearch: (techId: string) => void;
  onChooseCityBuild: (cityId: string, itemId: string) => void;
  onOpenTech: () => void;
  onOpenCity: (cityId: string) => void;
}

function buildSectionTitle(text: string): HTMLHeadingElement {
  const heading = document.createElement('h3');
  heading.textContent = text;
  heading.style.cssText = 'font-size:16px;color:#e8c170;margin:0 0 8px;';
  return heading;
}

export function closePlanningPanels(container: ParentNode = document): void {
  container.querySelector('#tech-panel')?.remove();
  container.querySelector('#city-panel')?.remove();
}

export function createRequiredChoicePanel(
  container: HTMLElement,
  config: RequiredChoiceConfig,
): HTMLElement {
  container.querySelector('#required-choice-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'required-choice-panel';
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(12,12,24,0.96);z-index:40;padding:16px;overflow:auto;';

  const title = document.createElement('h2');
  title.textContent = 'Choose Your Next Step';
  title.style.cssText = 'font-size:20px;color:#e8c170;margin:0 0 8px;';
  panel.appendChild(title);

  const intro = document.createElement('p');
  intro.textContent = 'Your empire has useful work available. Pick a quick next step to keep momentum going.';
  intro.style.cssText = 'font-size:13px;opacity:0.8;margin:0 0 16px;';
  panel.appendChild(intro);

  const researchSection = document.createElement('section');
  researchSection.style.cssText = 'margin-bottom:16px;background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;';
  researchSection.appendChild(buildSectionTitle('Choose Research'));

  if (config.researchChoices.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'No research choice is required right now.';
    empty.style.cssText = 'font-size:12px;opacity:0.7;';
    researchSection.appendChild(empty);
  } else {
    config.researchChoices.forEach(choice => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${choice.label} · ${choice.turns} turns`;
      button.style.cssText = 'display:block;width:100%;text-align:left;margin-bottom:8px;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:inherit;';
      button.addEventListener('click', () => config.onChooseResearch(choice.techId));
      researchSection.appendChild(button);
    });
  }

  const openTechButton = document.createElement('button');
  openTechButton.type = 'button';
  openTechButton.textContent = 'Open Tech Panel';
  openTechButton.addEventListener('click', () => config.onOpenTech());
  researchSection.appendChild(openTechButton);
  panel.appendChild(researchSection);

  const citySection = document.createElement('section');
  citySection.style.cssText = 'background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;';
  citySection.appendChild(buildSectionTitle('Choose Production'));

  if (config.cityChoices.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'No city production choice is required right now.';
    empty.style.cssText = 'font-size:12px;opacity:0.7;';
    citySection.appendChild(empty);
  } else {
    config.cityChoices.forEach(choice => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';

      const buildButton = document.createElement('button');
      buildButton.type = 'button';
      buildButton.textContent = `${choice.cityName}: ${choice.label} · ${choice.turns} turns`;
      buildButton.style.cssText = 'flex:1;text-align:left;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:inherit;';
      buildButton.addEventListener('click', () => config.onChooseCityBuild(choice.cityId, choice.itemId));
      row.appendChild(buildButton);

      const openCityButton = document.createElement('button');
      openCityButton.type = 'button';
      openCityButton.textContent = 'Open City';
      openCityButton.addEventListener('click', () => config.onOpenCity(choice.cityId));
      row.appendChild(openCityButton);

      citySection.appendChild(row);
    });
  }

  panel.appendChild(citySection);
  container.appendChild(panel);
  return panel;
}
