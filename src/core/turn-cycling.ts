import type { GameState, HotSeatConfig, HotSeatPlayer } from './types';

export function getHumanPlayers(config: HotSeatConfig): HotSeatPlayer[] {
  return config.players.filter(p => p.isHuman);
}

export function getAIPlayers(config: HotSeatConfig): HotSeatPlayer[] {
  return config.players.filter(p => !p.isHuman);
}

export function getNextPlayer(config: HotSeatConfig, currentSlotId: string): string {
  const humans = getHumanPlayers(config);
  const idx = humans.findIndex(p => p.slotId === currentSlotId);
  if (idx === -1 || idx === humans.length - 1) return humans[0].slotId;
  return humans[idx + 1].slotId;
}

export function isRoundComplete(config: HotSeatConfig, currentSlotId: string): boolean {
  const humans = getHumanPlayers(config);
  return humans[humans.length - 1].slotId === currentSlotId;
}

export function getActiveHumanPlayers(state: GameState): HotSeatPlayer[] {
  return (state.hotSeat?.players ?? []).filter(player => {
    if (!player.isHuman) return false;
    const civilization = state.civilizations[player.slotId];
    return civilization !== undefined && civilization.isEliminated !== true;
  });
}

export function getNextActiveHumanPlayerId(
  state: GameState,
  currentSlotId: string,
): string | null {
  const configured = state.hotSeat?.players ?? [];
  const active = getActiveHumanPlayers(state);
  if (active.length === 0) return null;
  const currentIndex = configured.findIndex(player => player.slotId === currentSlotId);
  const later = active.find(player =>
    configured.findIndex(candidate => candidate.slotId === player.slotId) > currentIndex,
  );
  return (later ?? active[0]).slotId;
}

export function isActiveHumanRoundComplete(
  state: GameState,
  currentSlotId: string,
): boolean {
  const configured = state.hotSeat?.players ?? [];
  const currentIndex = configured.findIndex(player => player.slotId === currentSlotId);
  return !getActiveHumanPlayers(state).some(player =>
    configured.findIndex(candidate => candidate.slotId === player.slotId) > currentIndex,
  );
}
