import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isTauriDistribution: vi.fn(),
  defaultMenu: vi.fn(),
  setAsAppMenu: vi.fn(),
}));

vi.mock('@/platform/distribution', () => ({
  isTauriDistribution: mocks.isTauriDistribution,
}));

vi.mock('@tauri-apps/api/menu', () => ({
  Menu: {
    default: mocks.defaultMenu,
  },
}));

import { initializeDesktopMenu } from '@/platform/desktop-menu';

describe('initializeDesktopMenu', () => {
  beforeEach(() => {
    mocks.isTauriDistribution.mockReset();
    mocks.defaultMenu.mockReset();
    mocks.setAsAppMenu.mockReset();
    mocks.defaultMenu.mockResolvedValue({ setAsAppMenu: mocks.setAsAppMenu });
  });

  it('does nothing in the web distribution', async () => {
    mocks.isTauriDistribution.mockReturnValue(false);

    await initializeDesktopMenu();

    expect(mocks.defaultMenu).not.toHaveBeenCalled();
  });

  it('installs the default native app menu in the Tauri distribution', async () => {
    mocks.isTauriDistribution.mockReturnValue(true);

    await initializeDesktopMenu();

    expect(mocks.defaultMenu).toHaveBeenCalled();
    expect(mocks.setAsAppMenu).toHaveBeenCalled();
  });

  it('does not block startup when menu creation fails', async () => {
    mocks.isTauriDistribution.mockReturnValue(true);
    mocks.defaultMenu.mockRejectedValue(new Error('menu unavailable'));

    await expect(initializeDesktopMenu()).resolves.toBeUndefined();
  });
});
