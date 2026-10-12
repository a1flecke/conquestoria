#!/usr/bin/env bash
# #1460: the Yarn version parity check (scripts/check-yarn-version-parity.mjs) must
# (1) pass on the real tree, and (2) not be vacuous. The package manager contract
# (package.json), the mise runtime (mise.toml) and the checked-in yarnPath artifact
# (.yarnrc.yml + .yarn/releases/*) must all name the same Yarn release. A fixture
# proves each way they can disagree fails: packageManager vs yarnPath, a trailing
# mise version, a missing configured release, a renamed/stale artifact, and an
# unrecognizable version declaration.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TOOL="$ROOT/scripts/check-yarn-version-parity.mjs"

run_node() {
  if command -v node >/dev/null 2>&1; then node "$@"; else "$ROOT/scripts/run-with-mise.sh" node "$@"; fi
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail() { echo "$1" >&2; [ -f "$tmp/out" ] && cat "$tmp/out" >&2; exit 1; }

# 1. the real repository satisfies its own version-parity contract
run_node "$TOOL" --root "$ROOT" >"$tmp/out" 2>&1 || fail "the real yarn configuration is not aligned"

# --- fixtures -----------------------------------------------------------------------------------------------
# make_repo <dir> <packageManager-yarn-version> <mise-yarn-version> [<artifact-name> <artifact-content-version>]
# An artifact name of "-" (or an omitted fifth argument default) means no yarnPath is configured, which is the
# Corepack-only shape. The artifact content carries the same version marker the real Yarn release embeds.
make_repo() {
  d="$1"; pkg="$2"; mise="$3"; artifact="${4:-}"; content="${5:-$pkg}"
  mkdir -p "$d/.yarn/releases"
  printf '{\n  "name": "fixture",\n  "packageManager": "yarn@%s"\n}\n' "$pkg" > "$d/package.json"
  printf '[tools]\nnode = "26.4.0"\nyarn = "%s"\n' "$mise" > "$d/mise.toml"
  if [ -n "$artifact" ]; then
    printf 'yarnPath: .yarn/releases/%s\n' "$artifact" > "$d/.yarnrc.yml"
    printf '#!/usr/bin/env node\nconst v=process.env.YARN_IS_TEST_ENV?"0.0.0":"%s";\n' "$content" > "$d/.yarn/releases/$artifact"
  fi
}

expect_ok() { # expect_ok <dir> <label>
  if ! run_node "$TOOL" --root "$1" >"$tmp/out" 2>&1; then
    fail "parity rejected a valid configuration: $2"
  fi
}

expect_fail() { # expect_fail <dir> <needle> <label>
  if run_node "$TOOL" --root "$1" >"$tmp/out" 2>&1; then
    fail "parity passed but should reject: $3"
  fi
  grep -qi "$2" "$tmp/out" || fail "parity rejected '$3' for the wrong reason (wanted: $2)"
}

# Fully aligned across packageManager, mise and the checked-in artifact.
d="$tmp/aligned"; make_repo "$d" 4.17.0 4.17.0 yarn-4.17.0.cjs
expect_ok "$d" 'packageManager, mise and yarnPath artifact all agree'

# Aligned declarations with no checked-in artifact (Corepack-only) is also valid.
d="$tmp/corepack"; make_repo "$d" 4.17.0 4.17.0
expect_ok "$d" 'aligned declarations without a yarnPath artifact'

# The historical #1460 drift: packageManager declares a newer Yarn than the artifact.
d="$tmp/artifact-drift"; make_repo "$d" 4.17.0 4.17.0 yarn-4.13.0.cjs 4.13.0
expect_fail "$d" 'package.json declares' 'yarnPath artifact trailing packageManager'

# The mise runtime disagrees with the package manager contract.
d="$tmp/mise-drift"; make_repo "$d" 4.17.0 4.13.0 yarn-4.17.0.cjs
expect_fail "$d" 'disagree' 'mise yarn version trailing packageManager'

# A configured yarnPath whose release file is absent on disk.
d="$tmp/missing"; make_repo "$d" 4.17.0 4.17.0 yarn-4.17.0.cjs
rm "$d/.yarn/releases/yarn-4.17.0.cjs"
expect_fail "$d" 'does not exist' 'yarnPath pointing at a missing release'

# A renamed artifact whose content is actually an older Yarn.
d="$tmp/stale-content"; make_repo "$d" 4.17.0 4.17.0 yarn-4.17.0.cjs 4.13.0
expect_fail "$d" 'contains yarn' 'artifact name disagreeing with its content'

# An invalid packageManager declaration.
d="$tmp/invalid-declaration"; make_repo "$d" latest 4.17.0 yarn-4.17.0.cjs
expect_fail "$d" 'not a yarn@' 'non-semver packageManager declaration'

# An invalid mise yarn declaration.
d="$tmp/invalid-mise"; make_repo "$d" 4.17.0 latest yarn-4.17.0.cjs
expect_fail "$d" 'mise.toml' 'non-semver mise yarn version'

# A yarnPath artifact with no recognizable version marker.
d="$tmp/unrecognized"; make_repo "$d" 4.17.0 4.17.0 yarn-4.17.0.cjs
printf 'not a yarn cli\n' > "$d/.yarn/releases/yarn-4.17.0.cjs"
expect_fail "$d" 'could not read' 'artifact without a readable yarn version'

echo ok
