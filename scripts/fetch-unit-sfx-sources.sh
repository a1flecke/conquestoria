#!/usr/bin/env bash
set -euo pipefail

# #612: fetch the CC0 recordings that scripts/generate-unit-sfx.sh derives some cues from.
# Nothing downloaded here is committed or bundled; only the processed Ogg cues in public/audio/sfx are.
#
#   UNIT_SFX_SOURCES=<dir>   where to keep the extracted sources (default: ~/.cache/conquestoria-unit-sfx-sources)
#
# Every archive is: fetched over HTTPS from its official OpenGameArt page, verified against a pinned
# SHA-256, listed and rejected if it contains an absolute path, "..", a symlink, or anything executable,
# then extracted with junk files (.DS_Store, desktop.ini) skipped.

DEST="${UNIT_SFX_SOURCES:-$HOME/.cache/conquestoria-unit-sfx-sources}"
mkdir -p "$DEST"

# name | official page | file URL | sha256 (retrieved 2026-10-02) | licence | kind (7z, zip or file)
SOURCES=(
  "firearms|https://opengameart.org/content/the-free-firearm-sound-library|https://opengameart.org/sites/default/files/Prepared%20SFX%20Library.7z|cc1ab5a99a0a365105c7c5dd783f4b0b1fe90938114d3ceec53856bfe005f7d6|CC0 1.0|7z"
  "naval|https://opengameart.org/content/tiny-naval-battle-sounds-set|https://opengameart.org/sites/default/files/qubodup-NavalBattleSoundSet-cc0_0.7z|c2a75c2f93a558dd2a5d8420b6bc0375c2d0e41c1f59a78a925ac6052d6ef05c|CC0 1.0|7z"
  "rts|https://opengameart.org/content/sci-fi-rts-war-unit-sounds|https://opengameart.org/sites/default/files/qubodup-rts_warsounds_v2.7z|b5dcbdd8e11151c2cb8a242fb9279690b2cb372fcb44d451c6df191a42a1de85|CC0 1.0 (relicensed from CC-BY-SA 3.0 on 2024-08-28)|7z"
  "voices|https://opengameart.org/content/male-gruntyelling-sounds|https://opengameart.org/sites/default/files/yelling%20sounds.zip|e9100a4e3b9dcd146993089970dc6097dcf9935fa4683b196040012bad65d67a|CC0 1.0 (dual-licensed CC0 / OGA-BY 3.0; CC0 chosen)|zip"
  "prop|https://opengameart.org/content/airplane-prop-loop|https://opengameart.org/sites/default/files/airplane_prop_0.ogg|f835c4f5ab4233058af5bd98fa58da2415ac174a26c29cdeca791bd4e8fa45f8|CC-BY 3.0 (credit: jakobthiesen)|file"
  "jet|https://opengameart.org/content/jet-engine-takeoff|https://opengameart.org/sites/default/files/engine_takeoff.wav|c7aa06c63a4fc5a638cab2b9f292a34ca03b3f3a1016d01e3b69cfd65f328e87|CC-BY 3.0 (credit: dklon)|file"
)

unsafe() { echo "unsafe entry in $1 archive, refusing to extract" >&2; rm -f "$2"; exit 1; }

for entry in "${SOURCES[@]}"; do
  IFS='|' read -r name page url sha licence kind <<<"$entry"
  if [[ -e "$DEST/$name" ]]; then echo "ok   $name (already present)"; continue; fi
  echo "get  $name  <- $page  [$licence]"
  tmp="$DEST/$name.download"
  curl -fsSL -o "$tmp" "$url"
  got="$(shasum -a 256 "$tmp" | awk '{print $1}')"
  [[ "$got" == "$sha" ]] || { echo "SHA-256 mismatch for $name: expected $sha got $got" >&2; rm -f "$tmp"; exit 1; }

  case "$kind" in
    file)
      mkdir -p "$DEST/$name.partial"; mv "$tmp" "$DEST/$name.partial/$(basename "$url" | sed 's/%20/ /g')"
      ;;
    7z|zip)
      if [[ "$kind" == "7z" ]]; then
        command -v bsdtar >/dev/null || { echo "bsdtar (libarchive) is required to read .7z archives" >&2; exit 1; }
        listing="$(bsdtar -tvf "$tmp")"; names="$(awk '{print $NF}' <<<"$listing")"
        grep -E '^l' <<<"$listing" >/dev/null && unsafe "$name" "$tmp"
      else
        names="$(unzip -Z1 "$tmp")"
      fi
      grep -E '(^|/)\.\.(/|$)|^/' <<<"$names" >/dev/null && unsafe "$name" "$tmp"
      grep -iE '\.(exe|sh|bat|cmd|app|dll|so|dylib|py|js|jar|command|scr|msi)$' <<<"$names" >/dev/null && unsafe "$name" "$tmp"
      mkdir -p "$DEST/$name.partial"
      if [[ "$kind" == "7z" ]]; then
        bsdtar -xf "$tmp" -C "$DEST/$name.partial" --exclude '.DS_Store' --exclude '*/.DS_Store' --exclude 'desktop.ini' --exclude '*/desktop.ini'
      else
        unzip -q "$tmp" -d "$DEST/$name.partial" -x '__MACOSX/*' '*/.DS_Store'
      fi
      rm -f "$tmp"
      ;;
    *) echo "unknown kind $kind" >&2; exit 1 ;;
  esac
  mv "$DEST/$name.partial" "$DEST/$name"
  echo "ok   $name extracted to $DEST/$name"
done
