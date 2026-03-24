import type { HotSeatConfig, HotSeatPlayer } from './types';

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
