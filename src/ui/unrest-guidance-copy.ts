import type { UnrestRecommendation } from '@/systems/unrest-guidance';

// #919 MR3 — the UI layer owns every player-visible string for an unrest
// recommendation. Plain-language, jargon-free, and it names the screen to go to,
// written for the 7-year-old end of the audience as much as the 43-year-old. The
// systems layer (unrest-guidance.ts) stays string-free so this copy can evolve
// without touching eligibility logic.
export function unrestRecommendationCopy(rec: UnrestRecommendation): { icon: string; text: string } {
  const params = rec.params ?? {};
  switch (rec.kind) {
    case 'build-courthouse':
      return { icon: '⚖️', text: 'Build a Courthouse here (City screen) — it calms a city that is big or far from your capital.' };
    case 'build-military-administration':
      return { icon: '🛡️', text: 'Build Military Administration here (City screen) to reduce unrest from war and from a city you just captured.' };
    case 'research-magistracy':
      return { icon: '🔬', text: 'Research Magistracy first (Tech screen), then you can build a Courthouse here.' };
    case 'research-military-logistics':
      return { icon: '🔬', text: 'Research Military Logistics first (Tech screen), then roads can help your far cities stay connected.' };
    case 'research-regional-capital':
      return { icon: '🔬', text: 'Research Political Philosophy first (Tech screen), then you can establish a Regional Capital.' };
    case 'build-regional-capital':
      return { icon: '🏛️', text: 'Establish a Regional Capital here to reduce distance pressure in nearby cities.' };
    case 'connect-city-road-network':
      return { icon: '🛤️', text: 'Connect this city to your capital with roads through your land to make it easier to govern.' };
    case 'research-bureaucracy':
      return { icon: '🔬', text: 'Research Separation of Powers (Tech screen) to grow your bureaucracy — it eases unrest from having many cities.' };
    case 'research-railway-administration':
      return { icon: '🔬', text: 'Research Railway Expansion (Tech screen) — it upgrades your existing road connection into a faster-governed rail link.' };
    case 'research-federalism':
      return { icon: '🔬', text: 'Research Decolonization (Tech screen), then you can enable Federal Autonomy from the top bar.' };
    case 'enable-federalism':
      return { icon: '🏛️', text: 'Federal Autonomy (top bar) could ease this pressure empire-wide, but it reduces your central gold income while active.' };
    case 'garrison-unit':
      return { icon: '⚔️', text: 'Move one of your soldiers into this city to keep order.' };
    case 'train-garrison-unit':
      return { icon: '⚔️', text: 'Train a soldier here and keep it in the city to hold order.' };
    case 'make-peace': {
      const n = Array.isArray(params.warCivIds) ? (params.warCivIds as unknown[]).length : 0;
      return { icon: '🕊️', text: `Make peace — you're at war with ${n} ${n === 1 ? 'empire' : 'empires'} (Diplomacy screen).` };
    }
    case 'await-conquest-settle': {
      const t = typeof params.turnsLeft === 'number' ? params.turnsLeft : 0;
      return { icon: '⏳', text: `Newly taken city — it settles down on its own in ${t} turn${t === 1 ? '' : 's'}. A soldier inside helps.` };
    }
    case 'research-constitutional-law':
      return { icon: '🔬', text: 'Later, Constitutional Law (Tech screen) will halve the unrest a fresh conquest brings.' };
    case 'fix-economy':
      return { icon: '💰', text: "Your treasury is in the red — cut unit upkeep or raise gold so buildings aren't shut off." };
    case 'counter-espionage':
      return { icon: '🕵️', text: 'An enemy spy stirred up this city — the unrest it caused fades a little each turn. Station your own spies to catch theirs.' };
    case 'stabilise-contagion-source':
      return { icon: '🔥', text: 'A nearby city of yours is in revolt and the anger is spreading — calm that city first.' };
    case 'build-faith-building':
      return rec.availability === 'blocked'
        ? { icon: '🛕', text: 'A foreign religion is unsettling this city — you need Philosophy before you can build a Temple to counter it.' }
        : { icon: '🛕', text: 'Build a Temple here (City screen) to blunt the foreign religion pulling at this city.' };
    case 'acquire-luxury':
      return { icon: '💎', text: 'Get a luxury resource — trade for one or settle near one; each new kind makes every city happier.' };
    case 'build-happiness-building':
      return { icon: '🎭', text: 'Build a happiness building here (Temple or Amphitheater — City screen) to lower unrest.' };
    case 'appease-or-concede':
      return { icon: '🪙', text: 'Use Appease (quick, cheap) or Concede (costs more, lasts longer) below for now.' };
  }
}
