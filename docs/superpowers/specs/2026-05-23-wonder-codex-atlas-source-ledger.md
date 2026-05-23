# Wonder Codex Atlas Source Ledger

**Date:** 2026-05-23
**Purpose:** Source and licensing ledger for Stage 2D Wonder Codex factual copy and real-image requirements.

## Source Rules

Every Stage 2D codex entry must cite at least one factual source. Entries based on a real named place, object, event, technology, or natural phenomenon must use accurate, middle-school appropriate facts from reliable educational or institutional sources.

Every codex image must be a real image, not generated art, unless a later spec explicitly allows generated imagery for fictional-only wonders. Image sources must be public domain, U.S. government media with compatible usage guidance, or freely licensed media that allows reuse in the browser/PWA and macOS/Tauri app. Each image record must cite title, author/creator when available, source URL, license, attribution text, and local asset path.

Do not rely on uncited AI-generated prose for factual claims. Museum-label prose may be authored, but factual statements must be traceable to this ledger or the implementation source manifest.

## Required Implementation Files

Stage 2D implementation must add:

- `docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md` updates with final per-entry citations.
- `src/systems/wonder-codex/sources.ts` as a typed runtime/testable source manifest.
- local image assets under `public/images/wonders/codex/`.

## Baseline Source Inventory

These sources are approved starting points. Implementation may add more sources, but every added source must be recorded in this ledger and the typed manifest. General licensing guidance sources are not enough for an individual codex image; each image source record must cite the exact file or media page used.

| Source ID | Use | URL | Notes |
| --- | --- | --- | --- |
| `commons-licensing` | Image license policy | https://commons.wikimedia.org/wiki/Commons:Licensing/en | Official Wikimedia Commons policy for acceptable public-domain and freely licensed media. Verify each individual file page before use. |
| `commons-reusing-content` | Image reuse guidance | https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/en | Reuse guidance for Commons media, including license-specific obligations and provenance. |
| `commons-credit-line` | Image attribution guidance | https://commons.wikimedia.org/wiki/Commons:Credit_line/en | Use when creating attribution text for public domain and Creative Commons media. |
| `nasa-media-guidelines` | NASA factual/image use policy | https://www.nasa.gov/nasa-brand-center/images-and-media/ | NASA media is generally usable for educational or informational purposes when not implying endorsement; acknowledge NASA as source and avoid logo/endorsement misuse. |
| `unesco-delphi` | Oracle of Delphi factual source | https://whc.unesco.org/en/list/393/ | Official UNESCO World Heritage source for Delphi as the sanctuary where Apollo's oracle spoke and a religious center of the ancient Greek world. |
| `nps-grand-canyon` | Grand Canyon factual source | https://www.nps.gov/grca/learn/ | Official National Park Service education pages for Grand Canyon facts. |
| `nps-manhattan-project` | Manhattan Project factual source | https://www.nps.gov/mapr/learn/manhattan-project.htm | Official National Park Service source for the Manhattan Project and its historical significance. |
| `internet-society-history` | Internet factual source | https://www.internetsociety.org/internet/history-internet/brief-history-internet/ | Internet Society history source for origins and development of the Internet. |
| `noaa-corals` | Coral reef factual source | https://oceanservice.noaa.gov/education/tutorial_corals/ | NOAA educational coral tutorial for reef facts. |
| `usgs-volcanoes` | Volcano factual source | https://www.usgs.gov/volcanoes/ | USGS Volcano Hazards Program source for volcano safety and eruption context. |

## Per-Entry Ledger Requirement

During implementation, add a row for every codex entry using this shape:

| Wonder ID | Fact Source IDs | Image Source ID | Local Image Path | License | Attribution |
| --- | --- | --- | --- | --- | --- |

The final implementation PR must include one completed row per codex entry. Contract tests must fail if a final codex entry references missing fact source IDs, missing image source IDs, missing local image paths, or placeholder attribution text.
