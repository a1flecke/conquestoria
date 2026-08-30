# Issue 711 Remote Sprite Review Design

## Goal

Make the Issue 711 sprite review readable to a reviewer who cannot run a local
preview by adding a GitHub-rendered Markdown review page and committed animated
GIF evidence to the Issue 711 branch.

## Decision

Use four looping GIFs, one each for Trebuchet, Rocket Artillery, Battleship,
and Missile Cruiser. Each GIF is a labelled five-panel reel that renders the
production V2 SVG payload and production animation stylesheet in `idle`,
`walk`, `attack`, `hurt`, and `death` states. The Markdown page also embeds the
existing 40px/64px/128px identity sheet for each unit so movement is judged
alongside map-scale silhouette readability.

GIF is the delivery format because GitHub renders it directly in a pull request
conversation and file view; a local HTML preview or video would not meet the
remote-review requirement.

## Asset Generation

Extend the existing Issue 711 Playwright capture script. For every unit it
will mount five copies of the serialized V2 payload, assign each copy one
animation state, capture a bounded series of production-CSS frames, and encode
the frames as a looping GIF. The script fails when the attack-specific mechanism
does not expose a named CSS animation, preserving the existing review contract.

The committed GIFs live beside the existing PNG review assets under
`docs/reviews/assets/issue-711/`. Temporary frame files are created outside the
repository and removed by the capture script.

## Remote Review Page

Create `docs/reviews/issue-711-remote-sprite-review.md`. For each unit, it
contains:

1. A concise statement of the intended silhouette and attack mechanism.
2. Its map-scale identity PNG.
3. Its looping five-state GIF, embedded with a repository-relative Markdown
   path.

The page names the state ordering, states that the GIFs use the production V2
payload and CSS, and requires explicit visual approval before the Issue 711
branch is treated as accepted. It does not introduce gameplay behavior or an
in-game UI surface.

## Verification

- Run the capture script and require all four GIFs to be generated.
- Confirm each GIF has a valid GIF header and nonzero file size.
- Confirm the Markdown page references every identity PNG and GIF with
  repository-relative paths.
- Review the generated Markdown in the draft pull request; no merge or
  non-draft transition is part of this work.
