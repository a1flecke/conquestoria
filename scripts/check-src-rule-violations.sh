#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <file> [file...]" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RNG_BASELINE_FILE="$REPO_ROOT/.claude/rng-legacy-baseline.txt"
# Files that never need to route through createSimulationRng: map generation
# (seeded once from the campaign seed string, before gameId exists), the
# canonical LCG primitive it and createSimulationRng both build on, and
# createSimulationRng's own module (#1021), and the canonical string-hash leaf
# (deterministic-hash.ts, #1234) that every historical hash variant now lives
# in. Everywhere else, a NEW
# hand-rolled LCG constant or truncated-id charCodeAt is flagged unless it is
# in RNG_BASELINE_FILE -- see that file's header for what baselining does and
# does not mean.
RNG_EXEMPT_FILES="src/systems/map-generator.ts src/systems/river-system.ts src/systems/seeded-lcg.ts src/systems/simulation-rng.ts src/systems/deterministic-hash.ts"

is_rng_exempt_file() {
  local f="$1" exempt
  for exempt in $RNG_EXEMPT_FILES; do
    [ "$f" = "$exempt" ] && return 0
  done
  return 1
}

is_rng_baselined() {
  local key="$1:$2" line
  [ -f "$RNG_BASELINE_FILE" ] || return 1
  while IFS= read -r line; do
    line="${line%%#*}"
    line="${line%"${line##*[![:space:]]}"}"
    [ "$line" = "$key" ] && return 0
  done < "$RNG_BASELINE_FILE"
  return 1
}

# #1199: turn-flow-controller.ts may carry exactly the two documented
# `presentation-deferred` pushes (renderer before `await replayAIMoves`, HUD after),
# pinned by content. Any other count or order is a violation. A "push" is a call
# statement terminated by `;`; the `updateHUD: () => deps.hud.update(),` dep wiring
# ends in `,` and is not one.
pinned_presentation_deferred_ok() {
  local f="$1" rcount hcount rline hline
  rcount="$(grep -E 'renderLoop\.setGameState\([^;]*;[[:space:]]*$' "$f" | grep -vcE '^[[:space:]]*(//|\*)' || true)"
  hcount="$(grep -E '(hud\.update|updateHUD)\([^;]*;[[:space:]]*$' "$f" | grep -vcE '^[[:space:]]*(//|\*)' || true)"
  [ "$rcount" -eq 1 ] && [ "$hcount" -eq 1 ] || return 1
  rline="$(grep -nE 'renderLoop\.setGameState\([^;]*;[[:space:]]*$' "$f" | grep -vE '^[0-9]+:[[:space:]]*(//|\*)' | head -1 | cut -d: -f1)"
  hline="$(grep -nE '(hud\.update|updateHUD)\([^;]*;[[:space:]]*$' "$f" | grep -vE '^[0-9]+:[[:space:]]*(//|\*)' | head -1 | cut -d: -f1)"
  [ -n "$rline" ] && [ -n "$hline" ] && [ "$rline" -lt "$hline" ] || return 1
  sed -n "$((rline + 1)),$((hline - 1))p" "$f" | grep -qE 'await[[:space:]]+replayAIMoves\('
}

status=0

append_violation() {
  local file="$1"
  local message="$2"
  printf 'check-src-rule-violations: %s\n%s\n' "$file" "$message" >&2
  status=2
}

append_match_block() {
  local label="$1"
  local lines="$2"
  printf -v violations '%s- %s:\n%s\n' "$violations" "$label" "$lines"
}

for file_path in "$@"; do
  case "$file_path" in
    src/*.ts|src/**/*.ts) ;;
    *) continue ;;
  esac

  [ -f "$file_path" ] || continue
  violations=""

  case "$file_path" in
    src/ai/*|src/systems/faction-system.ts)
      : # allowed: capital heuristics
      ;;
    *)
      if grep -nE '\.cities\[0\]' "$file_path" >/dev/null; then
        lines="$(grep -nE '\.cities\[0\]' "$file_path" | head -5)"
        append_match_block "cities[0] used in a UI/recommendation path — cycle all cities (see .claude/rules/ui-panels.md)" "$lines"
      fi
      ;;
  esac

  # --- canonical city ownership (#1019): decision code must not use roster
  # length as a proxy for "does this owner have cities". Use
  # getOwnedCityCount(state, ownerId) instead. Capital/ordering, roster
  # maintenance, turn processing (turn-manager and the round phases it runs, #1240), serialization, and the canonical ownership
  # module are exempt.
  case "$file_path" in
    src/systems/capital-system.ts|src/systems/city-capture-system.ts|src/systems/city-founding-system.ts|src/systems/civilization-elimination-system.ts|src/core/turn-manager.ts|src/core/round-phases/*|src/core/round-phases/**/*|src/systems/city-ownership.ts|src/storage/*|src/storage/**/*|src/testing/*|src/testing/**/*)
      : # sanctioned roster-maintenance/ordering/serialization uses
      ;;
    *)
      if grep -nE '\.cities\.length' "$file_path" >/dev/null; then
        lines="$(grep -nE '\.cities\.length' "$file_path" | head -5)"
        append_match_block "Roster-length ownership decision — use getOwnedCityCount(state, ownerId) instead of civ.cities.length (see src/systems/city-ownership.ts)" "$lines"
      fi
      ;;
  esac

  # --- canonical unit ownership (#1020): decision code must not use roster
  # length as a proxy for "how many units does this owner have". Use
  # getOwnedUnitCount(state, ownerId) / getOwnedUnits(state, ownerId) instead.
  # Roster maintenance, elimination, turn processing, serialization, testing
  # fixtures, and the canonical ownership module are exempt. `snapshot.units`
  # is a persisted perception DTO (espionage signals/troop intel), not a civ
  # roster, so its `.length` is excluded explicitly rather than exempting the
  # whole file.
  case "$file_path" in
    src/core/turn-manager.ts|src/core/round-phases/*|src/core/round-phases/**/*|src/systems/civilization-elimination-system.ts|src/systems/unit-ownership.ts|src/storage/*|src/storage/**/*|src/testing/*|src/testing/**/*)
      : # sanctioned roster-maintenance/ordering/serialization uses
      ;;
    *)
      unit_roster_lines="$(grep -nE '\.units\.length' "$file_path" | grep -vE 'snapshot\.units\.length' | head -5 || true)"
      if [ -n "$unit_roster_lines" ]; then
        append_match_block "Roster-length ownership decision — use getOwnedUnitCount(state, ownerId) instead of civ.units.length (see src/systems/unit-ownership.ts)" "$unit_roster_lines"
      fi
      ;;
  esac

  if grep -nE 'state\.(cities|units|civilizations)\[[^]]+\]\s*=' "$file_path" >/dev/null; then
    lines="$(grep -nE 'state\.(cities|units|civilizations)\[[^]]+\]\s*=' "$file_path" | head -5)"
    append_match_block "Direct state mutation detected. Turn-processing systems must return a new GameState (see .claude/rules/game-systems.md#immutable-turn-processing)" "$lines"
  fi

  if grep -nE 'Math\.random\(' "$file_path" | grep -v '//' >/dev/null; then
    lines="$(grep -nE 'Math\.random\(' "$file_path" | grep -v '//' | head -5)"
    append_match_block "Math.random() is banned in src/ — use seeded RNG (see .claude/rules/game-systems.md#deterministic-rng)" "$lines"
  fi

  # --- hand-rolled simulation RNG (#1021): new LCG constants and truncated-id
  # charCodeAt() calls under src/systems, src/ai, src/core must use
  # createSimulationRng() instead. Pre-existing occurrences are tracked in
  # RNG_BASELINE_FILE by exact path:line and are not re-flagged here; #982
  # shrinks that file as it converts each one. Comment-only lines (matched
  # the same way the Math.random() rule above excludes them) don't count.
  case "$file_path" in
    src/systems/*|src/ai/*|src/core/*)
      if ! is_rng_exempt_file "$file_path"; then
        rng_pattern='([*]\s*(16807|48271|1664525|104729|92821|99991|73937|65599|7919|31337)\b)|(\.charCodeAt\([0-9]+\))'
        rng_lines=""
        rng_count=0
        while IFS=: read -r lineno content; do
          is_rng_baselined "$file_path" "$lineno" && continue
          rng_count=$((rng_count + 1))
          [ "$rng_count" -le 5 ] && rng_lines="${rng_lines}${lineno}:${content}
"
        done < <(grep -nE "$rng_pattern" "$file_path" | grep -v '//' || true)
        if [ -n "$rng_lines" ]; then
          append_match_block "Hand-rolled simulation RNG constant or truncated-id charCodeAt() detected — use createSimulationRng() from src/systems/simulation-rng.ts instead (see .claude/rules/game-systems.md#deterministic-simulation-rng)" "$rng_lines"
        fi
      fi
      ;;
    *) ;;
  esac

  case "$file_path" in
    src/systems/tech-system.ts|src/storage/save-migrations.ts|src/storage/research-cost-migration-v*.ts|src/storage/migrations/steps/*.ts)
      # Explicit state authority / schema migration exception. #1023 split the
      # 1130-line save-migrations.ts into src/storage/migrations/steps/*, so the
      # migration exemption has to follow the step modules there — a versioned
      # migration retiming persisted research is exactly the documented case.
      :
      ;;
    *)
      if grep -nE 'researchProgress[[:space:]]*(\+?=)|researchProgress[[:space:]]*:[[:space:]]*([^,]*researchProgress[[:space:]]*[+\-]|0[,}]?)' "$file_path" | grep -v '//' >/dev/null; then
        lines="$(grep -nE 'researchProgress[[:space:]]*(\+?=)|researchProgress[[:space:]]*:[[:space:]]*([^,]*researchProgress[[:space:]]*[+\-]|0[,}]?)' "$file_path" | grep -v '//' | head -5)"
        append_match_block "Direct researchProgress mutation detected — use applyResearchBonus()/processResearch() in tech-system.ts (except versioned save migrations)" "$lines"
      fi
      ;;
  esac

  if grep -nE "=== ['\"]player['\"]|owner === ['\"]player['\"]" "$file_path" >/dev/null; then
    lines="$(grep -nE "=== ['\"]player['\"]|owner === ['\"]player['\"]" "$file_path" | head -5)"
    append_match_block "Hardcoded 'player' ownership check — use state.currentPlayer (see .claude/rules/ui-panels.md#hot-seat-multiplayer)" "$lines"
  fi

  # --- catalog/runtime dependency boundary (#985/#1008/#1009): the city
  # production modules own static catalogs and may consume the spy catalog leaf,
  # but importing the espionage runtime (the barrel or any of its #1009 domain
  # modules) closes a catalog-initialization cycle once espionage records
  # Domination intelligence. Keep the classifier in spy-unit-types.ts so either
  # system can depend on it safely.
  case "$file_path" in
    src/systems/city-*.ts)
      spy_runtime_lines="$(grep -nE "^[[:space:]]*import[[:space:]].*from[[:space:]]+['\"][^'\"]*espionage-" "$file_path" | head -5 || true)"
      if [ -n "$spy_runtime_lines" ]; then
        append_match_block "city production modules must import the spy classifier from spy-unit-types.ts, not an espionage runtime module (espionage-*) — that dependency closes a catalog-initialization cycle (see .claude/rules/game-systems.md#catalog-runtime-dependency-boundary)" "$spy_runtime_lines"
      fi
      ;;
  esac

  # --- movement executor bypass (#1025): the low-level position movers
  # (moveUnitWithZoneOfControl / moveUnit) must not be called outside the
  # canonical movement system. New movement executors go through
  # resolveUnitMoveIntent() + executeValidatedUnitMove() (see
  # .claude/rules/movement-actions.md). A genuinely special world-actor path
  # marks the call line 'movement-contract-exempt: <reason>'.
  case "$file_path" in
    src/systems/unit-low-level-move.ts|src/systems/unit-movement-system.ts)
      : # sanctioned: unit-low-level-move.ts defines the primitives; unit-movement-system.ts is the canonical executor
      ;;
    *)
      mv_lines="$(grep -nE 'moveUnitWithZoneOfControl\(|(^|[^.A-Za-z_])moveUnit\(' "$file_path" \
        | grep -vE 'movement-contract-exempt|^[0-9]+:[[:space:]]*(//|\*)|export function' | head -5 || true)"
      if [ -n "$mv_lines" ]; then
        append_match_block "Low-level unit mover called outside the movement system — route through resolveUnitMoveIntent()/executeValidatedUnitMove(), or mark the line 'movement-contract-exempt: <reason>' (see .claude/rules/movement-actions.md)" "$mv_lines"
      fi
      ;;
  esac

  # --- silent session writes (#1015): GameSession has no silent write. The removed
  # setStateWithoutRefresh must not return, and the restricted unpublished.adopt()
  # (a closed set of named reasons, see UnpublishedReason in src/app/ports.ts) may
  # only be called from the controllers that own one of those reasons.
  sw_lines="$(grep -nE 'setStateWithoutRefresh' "$file_path" \
    | grep -vE '^[0-9]+:[[:space:]]*(//|\*|/\*)' | head -5 || true)"
  if [ -n "$sw_lines" ]; then
    append_match_block "setStateWithoutRefresh was removed from GameSession (#1015) — publish with session.commit()/update()/batch(); a genuinely silent transition uses unpublished.adopt(state, reason) from a pinned owner (see .claude/rules/session-publication.md)" "$sw_lines"
  fi
  case "$file_path" in
    src/app/game-session.ts|src/app/controllers/campaign-entry-controller.ts|src/app/controllers/turn-flow-controller.ts|src/app/cross-cutting-helpers.ts)
      : # sanctioned owners of a named UnpublishedReason
      ;;
    *)
      adopt_lines="$(grep -nE 'unpublished\.adopt\(' "$file_path" \
        | grep -vE '^[0-9]+:[[:space:]]*(//|\*|/\*)' | head -5 || true)"
      if [ -n "$adopt_lines" ]; then
        append_match_block "unpublished.adopt() called outside a sanctioned owner (#1015) — use session.commit()/update()/batch(); adding an owner is a design decision pinned in tests/app/architecture-boundaries.test.ts (see .claude/rules/session-publication.md)" "$adopt_lines"
      fi
      ;;
  esac

  # --- controller publication (#1015/#1199): a controller must never hand-push the
  # renderer or HUD. Publication is GameSession's job (bootstrap subscribes the
  # renderer, then the HUD, once). The single pinned exception is
  # turn-flow-controller.ts's `presentation-deferred` solo end-turn pair, allowed only
  # when it is exactly one `renderLoop.setGameState(...)` before `await replayAIMoves`
  # and one `updateHUD()`/`hud.update()` after. The
  # `updateHUD: () => deps.hud.update(),` dep wiring is not a push.
  case "$file_path" in
    src/app/controllers/*)
      pub_lines="$(grep -nE '(renderLoop\.setGameState|hud\.update|updateHUD)\([^;]*;[[:space:]]*$' "$file_path" \
        | grep -vE '^[0-9]+:[[:space:]]*(//|\*)' || true)"
      if [ -n "$pub_lines" ]; then
        if [ "$file_path" = "src/app/controllers/turn-flow-controller.ts" ] && pinned_presentation_deferred_ok "$file_path"; then
          : # the one pinned `presentation-deferred` pair
        else
          append_match_block "Controller pushes renderer/HUD state by hand — publish through GameSession (session.commit/update/batch); only turn-flow-controller.ts's presentation-deferred solo end-turn pair (renderer before 'await replayAIMoves', HUD after) is pinned (see .claude/rules/session-publication.md)" "$pub_lines"
        fi
      fi
      ;;
  esac

  # --- single-entry-point consequences (#1014): some transitions carry consequences that
  # must happen exactly once, in one place. Calling the inner step directly skips them.
  #  * A strategic strike goes through executeStrategicLaunch() (reputation, witnesses,
  #    retaliation tracking); only strategic-launch-execution-system.ts may call
  #    resolveStrategicStrike().
  #  * A beast slay is applied by applyCombatOutcomeToState() for whichever executor made
  #    the kill; only beast-system.ts (defines it) and combat-reward-system.ts may call
  #    recordBeastSlain().
  case "$file_path" in
    src/systems/strategic-strike-system.ts|src/systems/strategic-launch-execution-system.ts)
      : # sanctioned: defines the primitive / is its single wrapper
      ;;
    *)
      ss_lines="$(grep -nE 'resolveStrategicStrike\(' "$file_path" \
        | grep -vE '^[0-9]+:[[:space:]]*(//|\*|/\*)' | head -5 || true)"
      if [ -n "$ss_lines" ]; then
        append_match_block "resolveStrategicStrike() called outside strategic-launch-execution-system.ts — a strike must go through executeStrategicLaunch(), which applies the reputation, witness and retaliation-tracking consequences (see .claude/rules/caller-discipline.md)" "$ss_lines"
      fi
      ;;
  esac
  case "$file_path" in
    src/systems/beast-system.ts|src/systems/combat-reward-system.ts)
      : # sanctioned: defines the slay / applies it for every combat executor
      ;;
    *)
      bs_lines="$(grep -nE 'recordBeastSlain\(' "$file_path" \
        | grep -vE '^[0-9]+:[[:space:]]*(//|\*|/\*)' | head -5 || true)"
      if [ -n "$bs_lines" ]; then
        append_match_block "recordBeastSlain() called outside combat-reward-system.ts — the slay is a consequence of the kill and is applied by applyCombatOutcomeToState() for every executor; read its beastsSlain result instead (see .claude/rules/caller-discipline.md)" "$bs_lines"
      fi
      ;;
  esac

  # --- unit removal is ONE transition (#1198): a unit leaves GameState through removeUnits()
  # (src/systems/unit-removal-system.ts), which owns the whole cascade (owner roster, minor roster,
  # transport manifests, carrier air wing, spy record, trade route). Hand-rolling the delete, the
  # rest-destructure or the filter-rebuild of `units` forgets some of it. Sanctioned: the module
  # itself, and save normalizers/migrations (src/storage), which repair persisted data.
  case "$file_path" in
    src/systems/unit-removal-system.ts|src/storage/*)
      : # sanctioned
      ;;
    *)
      ur_lines="$(grep -nE 'delete[[:space:]]+[A-Za-z_.!()]*[uU]nits\[|\]:[[:space:]]*_[A-Za-z]*,[[:space:]]*\.\.\.[A-Za-z]+[[:space:]]*\}[[:space:]]*=[[:space:]]*[A-Za-z_.()]*[uU]nits[[:space:]]*;?[[:space:]]*$|fromEntries\(Object\.entries\([A-Za-z_.()]*[uU]nits\)\.(filter|flatMap)' "$file_path" \
        | grep -vE '^[0-9]+:[[:space:]]*(//|\*|/\*)' | head -5 || true)"
      if [ -n "$ur_lines" ]; then
        append_match_block "Hand-rolled unit removal outside unit-removal-system.ts — call removeUnits() (or removeUnitsFromSlice() on working copies); it owns the roster, minor-roster, cargo-manifest, air-wing, spy-record and trade-route cascade (see .claude/rules/caller-discipline.md, #1198)" "$ur_lines"
      fi
      ;;
  esac

  if grep -nE 'innerHTML\s*=\s*`[^`]*\$\{' "$file_path" >/dev/null; then
    lines="$(grep -nE 'innerHTML\s*=\s*`[^`]*\$\{' "$file_path" | head -5)"
    append_match_block "innerHTML with interpolated game data — use textContent or data-text placeholders (see .claude/rules/ui-panels.md#unit-info-panels)" "$lines"
  fi

  if grep -nE ':\s*(0|null|\[\])\s*,\s*//\s*calculated' "$file_path" >/dev/null; then
    lines="$(grep -nE ':\s*(0|null|\[\])\s*,\s*//\s*calculated' "$file_path" | head -5)"
    append_match_block "Placeholder return field with 'calculated elsewhere' comment — populate it or remove the field (see .claude/rules/game-systems.md#no-dead-return-fields)" "$lines"
  fi

  # --- single-side war/peace mutation (#995): declareWar() / makePeace() write
  # ONE side of a war. Major↔major war state must stay bilateral by
  # construction — use declareMajorWar() / makeMajorPeace(). diplomacy-war.ts
  # defines them; the minor-civ war paths update both sides themselves and are
  # the only sanctioned external callers. (declareMajorWar/makeMajorPeace do not
  # match this pattern.)
  case "$file_path" in
    src/systems/diplomacy-war.ts|src/systems/minor-civ-actions.ts|src/systems/minor-civ-coalition-system.ts)
      : # sanctioned
      ;;
    *)
      war_lines="$(grep -nE '(^|[^A-Za-z])(declareWar|makePeace)\(' "$file_path" | grep -v '//' | head -5 || true)"
      if [ -n "$war_lines" ]; then
        append_match_block "Single-side declareWar()/makePeace() outside diplomacy-war — use declareMajorWar()/makeMajorPeace() so major-war state stays bilateral (see .claude/rules/game-systems.md#bilateral-diplomacy)" "$war_lines"
      fi
      ;;
  esac

  # --- single-side treaty mutation (#1003): signTreaty() writes ONE side's
  # diplomacy.treaties array. A complete treaty requires both sides signed
  # (see commitTreatyAgreement / the vassal-acceptance path in
  # diplomacy-treaties.ts, the sole bilateral treaty mutation paths). The #846
  # scenario builder (diplomacy-step.ts) is also sanctioned — it deliberately
  # bypasses commitTreatyAgreement's precondition guards to seed deterministic
  # fixture state, same as buildScenario does elsewhere.
  case "$file_path" in
    src/systems/diplomacy-treaties.ts|src/testing/scenario-steps/diplomacy-step.ts)
      : # sanctioned
      ;;
    *)
      treaty_lines="$(grep -nE '(^|[^A-Za-z])signTreaty\(' "$file_path" | grep -v '//' | head -5 || true)"
      if [ -n "$treaty_lines" ]; then
        append_match_block "Single-side signTreaty() outside diplomacy-treaties — a treaty needs both sides signed so it stays bilateral (see .claude/rules/game-systems.md#bilateral-diplomacy)" "$treaty_lines"
      fi
      ;;
  esac

  # --- domination authority boundary (#985): presentation and AI must consume
  # observer-safe DTOs/doctrine, never the omniscient sovereignty/victory query.
  # The victory adapter itself also must not revive roster-based liveness.
  case "$file_path" in
    src/ui/*|src/ai/*)
      domination_lines="$(grep -nE "from ['\"][^'\"]*(domination-sovereignty|victory-system)['\"]" "$file_path" | head -5 || true)"
      if [ -n "$domination_lines" ]; then
        append_match_block "Authoritative domination queries are not available to UI or AI — consume observer-safe presentation/knowledge DTOs instead (see .claude/rules/game-systems.md#domination-authority)" "$domination_lines"
      fi
      ;;
    src/systems/victory-system.ts)
      roster_lines="$(grep -nE 'civilizations(\[[^]]+\]|\.[A-Za-z0-9_]+)\.(cities|units)' "$file_path" | head -5 || true)"
      if [ -n "$roster_lines" ]; then
        append_match_block "Victory may not use civilization roster lengths for liveness — consume canonical domination sovereignty facts instead (see .claude/rules/game-systems.md#domination-authority)" "$roster_lines"
      fi
      ;;
  esac

  if [ -n "$violations" ]; then
    append_violation "$file_path" "$violations"
  fi
done

exit "$status"
