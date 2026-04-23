export interface CityCapturePanelOptions {
  cityName: string;
  occupiedPopulation: number;
  razeGold: number;
  onOccupy: () => void;
  onRaze: () => void;
}

export function createCityCapturePanel(
  container: HTMLElement,
  options: CityCapturePanelOptions,
): HTMLElement {
  document.getElementById('city-capture-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'city-capture-panel';
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(10,10,20,0.92);z-index:70;display:flex;align-items:center;justify-content:center;padding:24px;';

  const card = document.createElement('div');
  card.style.cssText = 'max-width:420px;width:100%;background:rgba(34,24,20,0.98);border:1px solid rgba(232,193,112,0.35);border-radius:18px;padding:20px;color:#f5e7c9;box-shadow:0 24px 60px rgba(0,0,0,0.35);';

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0 0 8px;font-size:22px;color:#e8c170;';
  title.textContent = options.cityName;
  card.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'font-size:13px;opacity:0.8;margin-bottom:16px;';
  subtitle.textContent = 'Choose the fate of the conquered city.';
  card.appendChild(subtitle);

  const occupy = document.createElement('div');
  occupy.style.cssText = 'background:rgba(255,255,255,0.06);border-radius:12px;padding:12px;margin-bottom:10px;';
  occupy.textContent = `Occupy: Population ${options.occupiedPopulation}, 10 turns to integrate`;
  card.appendChild(occupy);

  const raze = document.createElement('div');
  raze.style.cssText = 'background:rgba(255,255,255,0.06);border-radius:12px;padding:12px;margin-bottom:18px;';
  raze.textContent = `Raze: Gain ${options.razeGold} gold immediately`;
  card.appendChild(raze);

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:10px;';

  const occupyButton = document.createElement('button');
  occupyButton.type = 'button';
  occupyButton.dataset.action = 'occupy';
  occupyButton.style.cssText = 'flex:1;padding:12px 14px;border:none;border-radius:10px;background:#7d9d4e;color:#111;font-weight:700;cursor:pointer;';
  occupyButton.textContent = 'Occupy';
  occupyButton.addEventListener('click', options.onOccupy);

  const razeButton = document.createElement('button');
  razeButton.type = 'button';
  razeButton.dataset.action = 'raze';
  razeButton.style.cssText = 'flex:1;padding:12px 14px;border:none;border-radius:10px;background:#b24a36;color:#fff;font-weight:700;cursor:pointer;';
  razeButton.textContent = 'Raze';
  razeButton.addEventListener('click', options.onRaze);

  buttonRow.appendChild(occupyButton);
  buttonRow.appendChild(razeButton);
  card.appendChild(buttonRow);
  panel.appendChild(card);
  container.appendChild(panel);

  return panel;
}
