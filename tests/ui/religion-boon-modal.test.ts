// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createReligionBoonModal } from '@/ui/religion-boon-modal';

describe('#591 MR4 — religion boon modal', () => {
  it('shows the religion name and a description for each of the three boons', () => {
    const container = document.createElement('div');
    createReligionBoonModal(container, { religionName: 'Order of Test', onChooseBoon: () => {} });
    expect(container.textContent).toContain('Order of Test');
    expect(container.textContent).toContain('happiness');
    expect(container.textContent).toContain('gold');
    expect(container.textContent).toContain('25% faster');
  });

  it('clicking a boon button invokes onChooseBoon with the right boon', () => {
    const container = document.createElement('div');
    const onChooseBoon = vi.fn();
    createReligionBoonModal(container, { religionName: 'Order of Test', onChooseBoon });
    const button = container.querySelector<HTMLButtonElement>('[data-choose-boon="fervor"]');
    expect(button).toBeTruthy();
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onChooseBoon).toHaveBeenCalledWith('fervor');
  });

  it('removes a previously-open modal before rendering a new one (no duplicates)', () => {
    const container = document.createElement('div');
    createReligionBoonModal(container, { religionName: 'First', onChooseBoon: () => {} });
    createReligionBoonModal(container, { religionName: 'Second', onChooseBoon: () => {} });
    expect(container.querySelectorAll('#religion-boon-modal')).toHaveLength(1);
    expect(container.textContent).toContain('Second');
    expect(container.textContent).not.toContain('First');
  });
});
