# #80 — Message log leaks across hotseat players

**See [README.md](README.md) for shared diagnosis context.**

**Direct cause:** `src/main.ts` kept a single global `notificationLog: NotificationEntry[]`. Both players wrote and read the same array.

**Root-cause reframing (approach B):** Scoping the log per civ is necessary but not sufficient. Events fall into three classes:

1. **Private** — only the acting civ should see them (UI clicks, your tech completion, your city grew). Toast to current player, append to current player's log.
2. **Global with redaction** — every civ should get a log entry, but the message is redacted based on the viewer's discovery state (wonder completions, civ destroyed). Use the existing `*ForPlayer` helpers per viewer.
3. **Encounter / bilateral** — only civs with a stake or visibility see them (combat against your unit, war/peace between two civs, barbarian raid inside your fog). Append to affected civs' logs regardless of who is the current player.

Per-civ storage already landed in Task 1–3 on this branch. Remaining work routes the class-2 and class-3 events to the correct civs' logs.

---

## Task 4: Add `appendToCivLog` helper (GREEN)

**Files:**
- Modify: `src/main.ts` (add helper near `showNotification`)

- [ ] **Step 1: Add helper**

```ts
function appendToCivLog(civId: string, message: string, type: NotificationEntry['type'] = 'info'): void {
  if (!gameState) return;
  appendNotification(notificationLog, civId, { message, type, turn: gameState.turn });
  if (civId === gameState.currentPlayer) {
    notificationQueue.push({ message, type });
    if (!isShowingNotification) displayNextNotification();
  }
}
```

Rule for callers: use `showNotification` when the event is triggered by the current player's direct action. Use `appendToCivLog(civId, …)` when fanning out to a specific affected civ.

---

## Task 5: Route global / bilateral events per civ (GREEN)

**Files:**
- Modify: `src/main.ts` — listeners for `wonder:legendary-*`, `diplomacy:war-declared`, `diplomacy:peace-made`, `combat:resolved`
- Modify: `src/ui/minor-civ-notification-listeners.ts` — extend options with `appendToCivLog`

### Step 1 — Wonder legendary events

For each of `wonder:legendary-ready`, `-completed`, `-lost`: iterate `Object.keys(gameState.civilizations)`, call `getLegendaryWonderNotification(gameState, civId, event)` for each, and if it returns a notification call `appendToCivLog(civId, notification.message, notification.type)`.

The existing helper already redacts per viewer (returns `null` for non-builder on non-race events, so only the builder gets their own-wonder messages — that's the current contract; leave it alone). For the `-completed` event we additionally want every civ to see "A rival completed X" — add an `observer` branch to `getLegendaryWonderNotification` later as a follow-up if desired. **Scope for this task: swap the current-player-only routing for per-civ routing; do not broaden the helper contract.**

### Step 2 — War / peace bilateral

```ts
bus.on('diplomacy:war-declared', ({ attackerId, defenderId }) => {
  const attackerName = gameState.civilizations[attackerId]?.name ?? 'Unknown';
  const defenderName = gameState.civilizations[defenderId]?.name ?? 'Unknown';
  appendToCivLog(defenderId, `${attackerName} has declared war!`, 'warning');
  appendToCivLog(attackerId, `You declared war on ${defenderName}.`, 'warning');
});

bus.on('diplomacy:peace-made', ({ civA, civB }) => {
  const a = gameState.civilizations[civA]?.name ?? 'Unknown';
  const b = gameState.civilizations[civB]?.name ?? 'Unknown';
  appendToCivLog(civA, `Peace with ${b}!`, 'success');
  appendToCivLog(civB, `Peace with ${a}!`, 'success');
});
```

### Step 3 — Combat against defender

Route to `defender.owner` instead of only current player:

```ts
bus.on('combat:resolved', ({ result }) => {
  const defender = gameState.units[result.defenderId];
  if (!defender) return;
  const attacker = gameState.units[result.attackerId];
  const attackerOwner = attacker?.owner ?? 'Unknown';
  const attackerLabel = attackerOwner === 'barbarian' ? 'Barbarians'
    : (gameState.civilizations[attackerOwner]?.name ?? attackerOwner);
  const defenderType = UNIT_DEFINITIONS[defender.type]?.name ?? defender.type;
  const msg = result.defenderSurvived
    ? `${defenderType} was attacked by ${attackerLabel} (${result.defenderDamage} damage taken)`
    : `${defenderType} was destroyed by ${attackerLabel}!`;
  appendToCivLog(defender.owner, msg, 'warning');
});
```

### Step 4 — Minor-civ listeners

Extend the `MinorCivNotificationListenerOptions` interface with `appendToCivLog`. In each listener, after computing `notification` for the target major civ, call `options.appendToCivLog(majorCivId, notification.message, notification.type)` instead of only toasting when `majorCivId === currentPlayer`. `appendToCivLog` handles both the append and the optional toast.

For the already-fan-out events (`minor-civ:evolved`, `-destroyed`) keep the existing per-civ loop but swap `collectEvent`/`showNotification` to `appendToCivLog(civId, …)`. This unifies the path.

---

## Task 6: Regression tests (RED→GREEN)

**Files:**
- Create: `tests/ui/notification-routing.test.ts`

Test three scenarios with fake state + direct calls to the helpers (don't spin up full main.ts):

1. A war declaration writes an entry to BOTH attacker and defender logs.
2. A combat-resolved event writes to the defender's owner log even when current player is a third civ.
3. A wonder-legendary-completed event writes to the builder's log and (when extended) to observers' logs — lock whatever contract was chosen in Task 5.

For scenarios 1–2, extract the per-listener bodies into small pure functions (`routeWarDeclared`, `routeCombatResolved`) in a new `src/ui/notification-routing.ts` so tests don't need the bus. Wire `main.ts` listeners to those functions.

---

## Task 7: Manual smoke + commit

- [ ] 2-player hotseat: P1 declares war on P2 → switch turn → P2's log has "P1 declared war!".
- [ ] P1 attacks P2's unit → switch turn → P2's log shows the combat entry.
- [ ] P1 completes a wonder → switch turn → P2's log shows their (redacted) wonder entry.

Commit:

```
fix(hotseat): route global and bilateral events to each affected civ's log (#80)
```

---

## Self-check
- Private events still use `showNotification` (unchanged scope).
- Global/bilateral events write to every affected civ's log, not just `currentPlayer`'s.
- Redaction still flows through the existing `*ForPlayer` helpers — we did not add new leak paths.
- Tests lock both the positive route (affected civ gets the entry) and a negative (unaffected civ does not).
