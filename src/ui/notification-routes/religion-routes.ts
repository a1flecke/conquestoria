// src/ui/notification-routes/religion-routes.ts
// #1250: faith founding, conversion, loyalty warnings and defection — discovery-gated (a civ is told only
// about a founder or owner it has met).
import type { GameEvents, GameState } from '@/core/types';
import { hasMetCivilization } from '@/systems/discovery-system';
import type { NotificationSink } from './notification-sink';

// #591 MR4: unlike the wonder-completion pattern (notifies everyone, anonymizes the
// name), religion founding is notified ONLY to civs who have already met the founder —
// the issue's spec calls this out explicitly as "discovery-gated", stricter than the
// wonder precedent. The founder themself always sees it (hasMetCivilization treats
// self-vs-self as met).
export function routeReligionFounded(
  state: GameState,
  event: GameEvents['religion:founded'],
  sink: NotificationSink,
): void {
  const city = state.cities[event.cityId];
  for (const civId of Object.keys(state.civilizations)) {
    if (!hasMetCivilization(state, civId, event.civId)) continue;
    const message = civId === event.civId
      ? `${event.name} has been founded in ${city?.name ?? 'your empire'}!`
      : `${state.civilizations[event.civId]?.name ?? 'A rival civilization'} has founded ${event.name}.`;
    sink(civId, message, 'success', undefined, undefined, 'religion-founded');
  }
}

// #591 MR4: the issue's spec explicitly calls for a notification on conversion too
// ("fire religion:city-converted (+ notification where discovery allows)"), not just
// founding. Two distinct recipients, since city ownership and religion ownership are
// independent: the CITY's owner always sees it (it's their own city's internal
// affairs, regardless of who founded the faith it now follows); the NEW religion's
// owner is told they gained a follower, but only if they're a different civ AND have
// met the city's owner (discovery-gated, same convention as routeReligionFounded).
// Deliberately no "you lost a follower" notification to the old religion's owner --
// not called for by the spec, and would double the notification volume for a mechanic
// that already ticks somewhat frequently via passive spread.
export function routeReligionCityConverted(
  state: GameState,
  event: GameEvents['religion:city-converted'],
  sink: NotificationSink,
): void {
  const city = state.cities[event.cityId];
  if (!city) return;
  const toReligion = state.religions?.[event.toReligionId];
  if (!toReligion) return;

  sink(city.owner, `${city.name} now follows ${toReligion.name}.`, 'info', undefined, undefined, 'city-converted');

  if (toReligion.ownerCivId !== city.owner && hasMetCivilization(state, toReligion.ownerCivId, city.owner)) {
    sink(toReligion.ownerCivId, `${city.name} has converted to ${toReligion.name}!`, 'success', undefined, undefined, 'city-converted');
  }
}

const LOYALTY_WARNING_TEXT: Record<'start' | 'midpoint' | 'final', string> = {
  start: 'is starting to slip toward',
  midpoint: 'is now halfway to defecting to',
  final: 'will defect to',
};

// #593 MR6: notifies the PRESSURING civ (the faith owner) -- the target city's owner is
// always a minor civ or non-human AI (isLoyaltyTrackEligible excludes human owners), so
// notifying them would only ever silently log, never toast.
export function routeLoyaltyWarning(
  state: GameState,
  event: GameEvents['religion:loyalty-warning'],
  sink: NotificationSink,
): void {
  const city = state.cities[event.cityId];
  if (!city) return;
  const verb = LOYALTY_WARNING_TEXT[event.stage];
  const suffix = event.stage === 'final' ? ' next turn' : ` in ~${event.turnsRemaining} turns`;
  sink(event.pressuringCivId, `${city.name} ${verb} your faith${suffix}!`, event.stage === 'final' ? 'warning' : 'info', undefined, undefined, 'loyalty-warning');
}

// #593 MR6: mirrors routeReligionCityConverted's two-recipient shape -- the new owner
// gets a success toast, the former owner (if it still exists as a real civ) gets a
// warning. A minor-civ former owner isn't in state.civilizations, so it's silently
// skipped (there's no player to notify).
export function routeCityDefected(
  state: GameState,
  event: GameEvents['religion:city-defected'],
  sink: NotificationSink,
): void {
  const city = state.cities[event.cityId];
  if (!city) return;
  sink(event.toCivId, `${city.name} has defected to your faith!`, 'success', undefined, undefined, 'city-defected');
  if (state.civilizations[event.fromCivId]) {
    sink(event.fromCivId, `${city.name} has defected to a rival faith and left your empire.`, 'warning', undefined, undefined, 'city-defected');
  }
}
