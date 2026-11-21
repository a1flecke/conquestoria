import { createGameButton } from '@/ui/ui-kit';
import { markModal } from '@/ui/modal-contract';

/**
 * The target choice for a remote-capable espionage mission (#1780). It replaced a
 * `window.prompt` that listed raw ids of every foreign city in the world.
 *
 * It renders only what it is given: the controller passes the viewer-scoped list from
 * `getRemoteMissionTargetsForViewer`, so this module never reads game state.
 */
export interface EspionageTargetOption {
  civId: string;
  civName: string;
  cityId: string;
  cityName: string;
}

export interface EspionageTargetPickerConfig {
  missionLabel: string;
  /** `empire`: one row per empire. `city`: one row per city. */
  mode: 'empire' | 'city';
  targets: readonly EspionageTargetOption[];
  onChoose: (target: EspionageTargetOption) => void;
  onCancel: () => void;
}

export const ESPIONAGE_TARGET_PICKER_ID = 'espionage-target-picker';

export function createEspionageTargetPicker(
  container: HTMLElement,
  config: EspionageTargetPickerConfig,
): HTMLElement {
  container.querySelector(`#${ESPIONAGE_TARGET_PICKER_ID}`)?.remove();

  const modal = document.createElement('div');
  modal.id = ESPIONAGE_TARGET_PICKER_ID;
  modal.style.cssText = 'position:absolute;inset:0;background:rgba(12,12,24,0.96);z-index:45;padding:16px;overflow:auto;';

  const title = document.createElement('h2');
  title.textContent = `${config.missionLabel}: choose a target`;
  title.style.cssText = 'font-size:20px;color:#e8c170;margin:0 0 8px;';
  modal.appendChild(title);

  const intro = document.createElement('p');
  intro.textContent = config.mode === 'empire'
    ? 'This mission works on a whole empire. You can only aim it at empires you have met and whose cities you have found.'
    : 'This mission strikes one city. You can only aim it at cities you have found, belonging to empires you have met.';
  intro.style.cssText = 'font-size:13px;opacity:0.8;margin:0 0 16px;';
  modal.appendChild(intro);

  if (config.targets.length === 0) {
    const empty = document.createElement('p');
    empty.dataset.targetPickerEmpty = 'true';
    empty.textContent = "You haven't found any rivals to target yet. Explore and meet other empires first.";
    empty.style.cssText = 'font-size:14px;margin:0 0 16px;';
    modal.appendChild(empty);
  }

  for (const target of config.targets) {
    const label = config.mode === 'empire' ? target.civName : `${target.cityName} (${target.civName})`;
    const button = createGameButton(label, 'primary');
    button.style.cssText += 'width:100%;margin-bottom:8px;';
    button.dataset.targetCivId = target.civId;
    button.dataset.targetCityId = target.cityId;
    button.addEventListener('click', () => {
      modal.remove();
      config.onChoose(target);
    });
    modal.appendChild(button);
  }

  const cancel = createGameButton('Cancel', 'secondary');
  cancel.style.width = '100%';
  cancel.dataset.targetPickerCancel = 'true';
  cancel.addEventListener('click', () => {
    modal.remove();
    config.onCancel();
  });
  modal.appendChild(cancel);

  markModal(modal, { cancel, initialFocus: cancel });
  container.appendChild(modal);
  return modal;
}
