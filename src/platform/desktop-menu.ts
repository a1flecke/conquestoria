import { isTauriDistribution } from './distribution';

export async function initializeDesktopMenu(): Promise<void> {
  if (!isTauriDistribution()) {
    return;
  }

  try {
    const { Menu } = await import('@tauri-apps/api/menu');
    const menu = await Menu.default();
    await menu.setAsAppMenu();
  } catch {
    // Menu polish should not block the game from starting.
  }
}
