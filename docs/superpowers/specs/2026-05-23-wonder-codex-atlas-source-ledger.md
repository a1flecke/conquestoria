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
| `unesco-stonehenge` | Standing Stones factual source | https://whc.unesco.org/en/list/373/ | Official UNESCO World Heritage source for Stonehenge, Avebury and Associated Sites. |
| `unesco-giza` | Great Pyramid factual source | https://whc.unesco.org/en/list/86/ | Official UNESCO World Heritage source for Memphis and its Necropolis – the Pyramid Fields from Giza to Dahshur. |
| `nps-grand-canyon` | Grand Canyon factual source | https://www.nps.gov/grca/learn/ | Official National Park Service education pages for Grand Canyon facts. |
| `nps-manhattan-project` | Manhattan Project factual source | https://www.nps.gov/mapr/learn/manhattan-project.htm | Official National Park Service source for the Manhattan Project and its historical significance. |
| `internet-society-history` | Internet factual source | https://www.internetsociety.org/internet/history-internet/brief-history-internet/ | Internet Society history source for origins and development of the Internet. |
| `khan-trade-networks` | Exchange and trade-network factual source | https://www.khanacademy.org/humanities/world-history-project-ap/xb41992e0ff5e0f09:unit-2-networks-of-exchange/xb41992e0ff5e0f09:2-2routes-of-exchange/a/read-archipelago-of-trade | Khan Academy educational source for exchange cities, trade routes, and knowledge-sharing networks. |
| `noaa-corals` | Coral reef factual source | https://oceanservice.noaa.gov/education/tutorial_corals/ | NOAA educational coral tutorial for reef facts. |
| `usgs-volcanoes` | Volcano factual source | https://www.usgs.gov/programs/VHP | USGS Volcano Hazards Program source for volcano safety and eruption context. |
| `nps-geology-mountains` | Mountain factual source | https://www.nps.gov/subjects/geology/mountains.htm | National Park Service geology source for mountain context. |
| `nps-caves` | Cave factual source | https://www.nps.gov/subjects/caves/index.htm | National Park Service source for caves and karst. |
| `usda-forests` | Forest factual source | https://www.fs.usda.gov/learn | U.S. Forest Service learning source for forest context. |
| `nasa-aurora` | Aurora factual source | https://science.nasa.gov/earth/sun-earth/auroras/ | NASA Science source for auroras. |
| `nps-waterfalls` | Waterfall factual source | https://www.nps.gov/subjects/geology/waterfalls.htm | National Park Service geology source for waterfalls. |
| `smithsonian-fossils` | Fossil factual source | https://naturalhistory.si.edu/education/teaching-resources/paleontology | Smithsonian paleontology learning source. |
| `nps-singing-sands` | Singing sands factual source | https://www.nps.gov/grsa/learn/nature/singing-sands.htm | National Park Service source for booming and singing dunes. |
| `noaa-maritime-heritage` | Maritime heritage factual source | https://oceanservice.noaa.gov/facts/maritime-heritage.html | NOAA source for shipwrecks, ports, and maritime heritage. |
| `noaa-bioluminescence` | Bioluminescence factual source | https://oceanservice.noaa.gov/facts/biolum.html | NOAA source for organisms that make light. |
| `usgs-water-science` | Water science factual source | https://www.usgs.gov/special-topics/water-science-school | USGS Water Science School source for water-cycle context. |
| `noaa-severe-weather` | Storm factual source | https://www.nssl.noaa.gov/education/svrwx101/ | NOAA National Severe Storms Laboratory education source. |
| `unesco-grand-canal` | Grand Canal factual source | https://whc.unesco.org/en/list/1443/ | UNESCO World Heritage source for the Grand Canal of China. |
| `energy-solar` | Solar factual source | https://www.energy.gov/eere/solar/how-does-solar-work | U.S. Department of Energy source for solar energy. |
| `loc-about` | Archive factual source | https://www.loc.gov/about/ | Library of Congress source for archive and library mission context. |
| `bgci-gardens` | Botanical garden factual source | https://www.bgci.org/about/about-botanic-gardens/ | Botanic Gardens Conservation International source for botanic garden context. |
| `nps-saugus-iron` | Foundry factual source | https://www.nps.gov/sair/learn/historyculture/index.htm | National Park Service source for Saugus Iron Works. |
| `nasa-observatories` | Observatory factual source | https://science.nasa.gov/astrophysics/programs/physics-of-the-cosmos/observatories/ | NASA source for observatory context. |
| `olympics-ancient` | Champion hall factual source | https://olympics.com/ioc/ancient-olympic-games | International Olympic Committee source for ancient games context. |
| `noaa-weather-radio` | Weather warning factual source | https://www.weather.gov/nwr/ | National Weather Service source for weather-warning networks. |

## Image Source Inventory

| Image Source ID | URL | Local Path | License | Attribution |
| --- | --- | --- | --- | --- |
| `image-volcano` | https://commons.wikimedia.org/wiki/File:Kilauea_Volcano,_Hawaii_(ASTER).jpg | `/images/wonders/codex/volcano.jpg` | public domain | USGS / public domain |
| `image-mountain` | https://commons.wikimedia.org/wiki/File:Mount_Everest_as_seen_from_Drukair2_PLW_edit.jpg | `/images/wonders/codex/mountain.jpg` | CC BY-SA 2.0 | Wikimedia Commons / CC BY-SA 2.0 |
| `image-cave` | https://commons.wikimedia.org/wiki/File:LurayCaverns.jpg | `/images/wonders/codex/cave.jpg` | public domain | Jan Kronsell / public domain |
| `image-forest` | https://commons.wikimedia.org/wiki/File:Hoh_Rainforest.jpg | `/images/wonders/codex/forest.jpg` | CC BY-SA 4.0 | Wikimedia Commons / CC BY-SA 4.0 |
| `image-coral` | https://commons.wikimedia.org/wiki/File:Coral_Reef.jpg | `/images/wonders/codex/coral.jpg` | public domain | NOAA / public domain |
| `image-grand-canyon` | https://commons.wikimedia.org/wiki/File:Grand_Canyon_view_from_Pima_Point_2010.jpg | `/images/wonders/codex/grand-canyon.jpg` | CC BY-SA 3.0 | Chensiyuan / CC BY-SA 3.0 |
| `image-aurora` | https://commons.wikimedia.org/wiki/File:Aurora_Borealis_over_Eielson_Air_Force_Base,_Alaska.jpg | `/images/wonders/codex/aurora.jpg` | CC BY-SA 4.0 | Wikimedia Commons / CC BY-SA 4.0 |
| `image-waterfall` | https://commons.wikimedia.org/wiki/File:The_frozen_waterfalls_of_Korouoma.jpg | `/images/wonders/codex/waterfall.jpg` | CC BY-SA 4.0 | Yair Haklai / CC BY-SA 4.0 |
| `image-fossil` | https://commons.wikimedia.org/wiki/File:Tyrannosaurus_Rex_Holotype.jpg | `/images/wonders/codex/fossil.jpg` | CC BY-SA 4.0 | Wikimedia Commons / CC BY-SA 4.0 |
| `image-desert` | https://commons.wikimedia.org/wiki/File:Great_Sand_Dunes_National_Park_and_Preserve.jpg | `/images/wonders/codex/desert.jpg` | public domain | NASA / public domain |
| `image-ruins` | https://commons.wikimedia.org/wiki/File:Gulf_of_Mexico_shipwreck_bow_2019.png | `/images/wonders/codex/ruins.png` | public domain | NOAA / public domain |
| `image-lake` | https://commons.wikimedia.org/wiki/File:Crater_Lake_winter_pano2.jpg | `/images/wonders/codex/lake.jpg` | public domain | National Park Service / public domain |
| `image-storm` | https://commons.wikimedia.org/wiki/File:Isolated_supercell_-_NOAA.jpg | `/images/wonders/codex/storm.jpg` | public domain | NOAA / public domain |
| `image-delphi` | https://commons.wikimedia.org/wiki/File:IMGP3050W.jpg | `/images/wonders/codex/delphi.jpg` | CC BY-SA 4.0 | Konstantinos Kousis / CC BY-SA 4.0 |
| `image-canal` | https://commons.wikimedia.org/wiki/File:The_Beijing-Hangzhou_Grand_Canal_in_Chongfu_Town_2014-06.jpg | `/images/wonders/codex/canal.jpg` | CC BY-SA 4.0 | User MaomaodeRijiben / CC BY-SA 4.0 |
| `image-sun-tower` | https://commons.wikimedia.org/wiki/File:Sierra_SunTower_Power_Plant.jpg | `/images/wonders/codex/sun-tower.jpg` | CC BY-SA 3.0 | Z22 / CC BY-SA 3.0 |
| `image-archive` | https://commons.wikimedia.org/wiki/File:LOC_Main_Reading_Room_Highsmith.jpg | `/images/wonders/codex/archive.jpg` | public domain | Carol M. Highsmith / public domain |
| `image-garden` | https://commons.wikimedia.org/wiki/File:Botanischer_Garten_Bonn.jpg | `/images/wonders/codex/garden.jpg` | CC BY-SA 4.0 | Carsondelake / CC BY-SA 4.0 |
| `image-foundry` | https://commons.wikimedia.org/wiki/File:Saugus_Iron_Works_National_Historic_Site.JPG | `/images/wonders/codex/foundry.jpg` | CC BY-SA 3.0 | Nlynch / CC BY-SA 3.0 |
| `image-observatory` | https://commons.wikimedia.org/wiki/File:Paranal_and_the_Pacific_at_sunset_(dsc4088,_retouched,_cropped).jpg | `/images/wonders/codex/observatory.jpg` | CC BY 4.0 | ESO and G. Hudepohl / CC BY 4.0 |
| `image-exchange` | https://commons.wikimedia.org/wiki/File:No_Known_Restrictions_Trading_Floor,_New_York_Stock_Exchange_(Highsmith_LOC)_(6718386525).jpg | `/images/wonders/codex/exchange.jpg` | public domain | Carol M. Highsmith / public domain |
| `image-olympia-stadium` | https://commons.wikimedia.org/wiki/File:Ancient_Olympia_Stadium_in_Greece_(51224128585).jpg | `/images/wonders/codex/olympia-stadium.jpg` | CC BY 2.0 | dronepicr / CC BY 2.0 |
| `image-drydock` | https://commons.wikimedia.org/wiki/File:Drydock,_Puget_Sound_Naval_Shipyard,_Bremerton,_showing_battleships_WISCONSIN_(left),_NEBRASKA_(right),_and_U_S_revenue_cutter_(CURTIS_771).jpeg | `/images/wonders/codex/drydock.jpeg` | public domain | Asahel Curtis / public domain |
| `image-manhattan` | https://commons.wikimedia.org/wiki/File:Calutron_operators.jpg | `/images/wonders/codex/manhattan.jpg` | public domain | U.S. Department of Energy / public domain |
| `image-internet` | https://commons.wikimedia.org/wiki/File:Internet_map_1024.jpg | `/images/wonders/codex/internet.jpg` | CC BY 2.5 | The Opte Project / CC BY 2.5 |

## Stage 3 Video Sources

| Video source ID | Wonder | Source URL | Creator | License | Local asset | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `video-great-volcano-tonga-eruption` | `great_volcano` | https://commons.wikimedia.org/wiki/File:Tonga_Volcano_Eruption_2022-01-15_0320Z_to_0610Z_Himawari-8_visible.webm | Japan Meteorological Agency / Digital Typhoon | CC BY 4.0 compatible public data terms | `/videos/wonders/great-volcano-tonga-eruption.mp4` | Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Japan Meteorological Agency / Digital Typhoon - CC BY 4.0 compatible public data terms. |
| `video-starvault-paranal-observatory` | `starvault-observatory` | https://commons.wikimedia.org/wiki/File:Morning_observations_time-lapse_at_Paranal.webm | ESO/J. Colosimo | CC BY 4.0 | `/videos/wonders/starvault-paranal-observatory.mp4` | Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: ESO/J. Colosimo - CC BY 4.0. |
| `video-sacred-mountain-everest-flyover` | `sacred_mountain` | https://commons.wikimedia.org/wiki/File:EVEREST.webm | Sgascoin | CC BY-SA 4.0 | `/videos/wonders/sacred-mountain-everest-flyover.mp4` | Stage 3B. Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Sgascoin - CC BY-SA 4.0. |
| `video-coral-reef-art-park` | `coral_reef` | https://commons.wikimedia.org/wiki/File:Coral_Reef_Art.webm | VOA Africa | public domain VOA material | `/videos/wonders/coral-reef-art-park.mp4` | Stage 3B. Trimmed to 4 seconds from the cleaner underwater segment, cropped to remove a lower-right broadcast mark, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: VOA Africa - public domain VOA material. |
| `video-grand-canyon-cira-night-fires` | `grand_canyon` | https://commons.wikimedia.org/wiki/File:Grand_Canyon_Wildfires_at_Night_(CIRA_2025-07-14_-_nolabels).webm | CSU/CIRA and NOAA/NESDIS | public domain NOAA material | `/videos/wonders/grand-canyon-cira-night-fires.mp4` | Stage 3B. Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: CSU/CIRA and NOAA/NESDIS - public domain NOAA material. |
| `video-oracle-of-delphi-melies` | `oracle-of-delphi` | https://commons.wikimedia.org/wiki/File:L%27Oracle_de_Delphes_(1903).webm | Georges Melies | public domain | `/videos/wonders/oracle-of-delphi-melies.mp4` | Stage 3B. Trimmed to 4 seconds from a temple/oracle moment, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Georges Melies - public domain. |
| `video-grand-canal-gongchen-hangzhou` | `grand-canal` | https://commons.wikimedia.org/wiki/File:Grand_Canal_Gongchen_Hangzhou.webm | Charlie fong | CC BY-SA 4.0 | `/videos/wonders/grand-canal-gongchen-hangzhou.mp4` | Stage 3B. Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Charlie fong - CC BY-SA 4.0. |
| `video-moonwell-gardens-flower-bloom` | `moonwell-gardens` | https://commons.wikimedia.org/wiki/File:Time-lapse_of_a_flower_blooming.webm | Ajith Samuel | CC BY 3.0 | `/videos/wonders/moonwell-gardens-flower-bloom.mp4` | Stage 3B. Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Ajith Samuel - CC BY 3.0. |
| `video-ancient-forest-headwaters-redwoods` | `ancient_forest` | https://commons.wikimedia.org/wiki/File:-TravelTuesday_with_My_Public_Lands_(23825649569).webm | mypubliclands | CC BY 2.0 and U.S. Bureau of Land Management public-domain metadata | `/videos/wonders/ancient-forest-headwaters-redwoods.mp4` | Stage 3C. Source terms verified before local preparation despite Commons review-needed planning note. Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: mypubliclands - CC BY 2.0 / U.S. Bureau of Land Management public-domain metadata. |
| `video-bioluminescent-bay-vieques-kayak` | `bioluminescent_bay` | https://commons.wikimedia.org/wiki/File:Kayaking_in_the_Bioluminescent_Bay_Vieques.webm | Z22 | CC BY-SA 3.0 | `/videos/wonders/bioluminescent-bay-vieques-kayak.mp4` | Stage 3C. Trimmed to 4 seconds from a later visible kayak-and-glow moment, scaled to 640px width, mildly adjusted with curves for small-surface readability, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Z22 - CC BY-SA 3.0. |
| `video-singing-sands-mojave-sunset` | `singing_sands` | https://commons.wikimedia.org/wiki/File:Mojave_Desert_Sunset_(40480403760).webm | Kyle Sullivan / BLM California | public domain U.S. Bureau of Land Management material | `/videos/wonders/singing-sands-mojave-sunset.mp4` | Stage 3C. Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Kyle Sullivan / BLM California - public domain U.S. Bureau of Land Management material. |
| `video-world-archive-printing-press` | `world-archive` | https://commons.wikimedia.org/wiki/File:Demonstration_of_printing_press.webm | Krassotkin | CC0 1.0 | `/videos/wonders/world-archive-printing-press.mp4` | Stage 3C. Trimmed to 4 seconds from the large source, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Krassotkin - CC0 1.0. |
| `video-ironroot-foundry-steel-forging` | `ironroot-foundry` | https://commons.wikimedia.org/wiki/File:Smithy-_steel_forging_(2).webm | Sounds of Changes | CC BY 3.0 | `/videos/wonders/ironroot-foundry-steel-forging.mp4` | Stage 3C. Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Source credits Museum of Municipal Engineering and named recordists. Attribution: Sounds of Changes - CC BY 3.0. |
| `video-sun-spire-solar-glint` | `sun-spire` | https://commons.wikimedia.org/wiki/File:Solar_panel_sun_glint_sparkles_across_Minnesota_(from_7_July_2018)_(CIRA_2018-07-11).webm | GOES imagery: CSU/CIRA and NOAA | public domain NOAA material | `/videos/wonders/sun-spire-solar-glint.mp4` | Stage 3C. Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: GOES imagery: CSU/CIRA and NOAA - public domain NOAA material. |

## Per-Entry Ledger Requirement

During implementation, add a row for every codex entry using this shape:

| Wonder ID | Fact Source IDs | Image Source ID | Local Image Path | License | Attribution |
| --- | --- | --- | --- | --- | --- |
| `great_volcano` | `usgs-volcanoes` | `image-volcano` | `/images/wonders/codex/volcano.jpg` | public domain | USGS / public domain |
| `sacred_mountain` | `nps-geology-mountains` | `image-mountain` | `/images/wonders/codex/mountain.jpg` | CC BY-SA 2.0 | Wikimedia Commons / CC BY-SA 2.0 |
| `crystal_caverns` | `nps-caves` | `image-cave` | `/images/wonders/codex/cave.jpg` | public domain | Jan Kronsell / public domain |
| `ancient_forest` | `usda-forests` | `image-forest` | `/images/wonders/codex/forest.jpg` | CC BY-SA 4.0 | Wikimedia Commons / CC BY-SA 4.0 |
| `coral_reef` | `noaa-corals` | `image-coral` | `/images/wonders/codex/coral.jpg` | public domain | NOAA / public domain |
| `grand_canyon` | `nps-grand-canyon` | `image-grand-canyon` | `/images/wonders/codex/grand-canyon.jpg` | CC BY-SA 3.0 | Chensiyuan / CC BY-SA 3.0 |
| `aurora_fields` | `nasa-aurora` | `image-aurora` | `/images/wonders/codex/aurora.jpg` | CC BY-SA 4.0 | Wikimedia Commons / CC BY-SA 4.0 |
| `frozen_falls` | `nps-waterfalls` | `image-waterfall` | `/images/wonders/codex/waterfall.jpg` | CC BY-SA 4.0 | Yair Haklai / CC BY-SA 4.0 |
| `dragon_bones` | `smithsonian-fossils` | `image-fossil` | `/images/wonders/codex/fossil.jpg` | CC BY-SA 4.0 | Wikimedia Commons / CC BY-SA 4.0 |
| `singing_sands` | `nps-singing-sands` | `image-desert` | `/images/wonders/codex/desert.jpg` | public domain | NASA / public domain |
| `sunken_ruins` | `noaa-maritime-heritage` | `image-ruins` | `/images/wonders/codex/ruins.png` | public domain | NOAA / public domain |
| `floating_islands` | `nps-geology-mountains` | `image-mountain` | `/images/wonders/codex/mountain.jpg` | CC BY-SA 2.0 | Wikimedia Commons / CC BY-SA 2.0 |
| `bioluminescent_bay` | `noaa-bioluminescence` | `image-coral` | `/images/wonders/codex/coral.jpg` | public domain | NOAA / public domain |
| `bottomless_lake` | `usgs-water-science` | `image-lake` | `/images/wonders/codex/lake.jpg` | public domain | National Park Service / public domain |
| `eternal_storm` | `noaa-severe-weather` | `image-storm` | `/images/wonders/codex/storm.jpg` | public domain | NOAA / public domain |
| `oracle-of-delphi` | `unesco-delphi` | `image-delphi` | `/images/wonders/codex/delphi.jpg` | CC BY-SA 4.0 | Konstantinos Kousis / CC BY-SA 4.0 |
| `grand-canal` | `unesco-grand-canal` | `image-canal` | `/images/wonders/codex/canal.jpg` | CC BY-SA 4.0 | User MaomaodeRijiben / CC BY-SA 4.0 |
| `sun-spire` | `energy-solar` | `image-sun-tower` | `/images/wonders/codex/sun-tower.jpg` | CC BY-SA 3.0 | Z22 / CC BY-SA 3.0 |
| `world-archive` | `loc-about` | `image-archive` | `/images/wonders/codex/archive.jpg` | public domain | Carol M. Highsmith / public domain |
| `moonwell-gardens` | `bgci-gardens` | `image-garden` | `/images/wonders/codex/garden.jpg` | CC BY-SA 4.0 | Carsondelake / CC BY-SA 4.0 |
| `ironroot-foundry` | `nps-saugus-iron` | `image-foundry` | `/images/wonders/codex/foundry.jpg` | CC BY-SA 3.0 | Nlynch / CC BY-SA 3.0 |
| `tidecaller-bastion` | `noaa-maritime-heritage` | `image-ruins` | `/images/wonders/codex/ruins.png` | public domain | NOAA / public domain |
| `starvault-observatory` | `nasa-observatories` | `image-observatory` | `/images/wonders/codex/observatory.jpg` | CC BY 4.0 | ESO and G. Hudepohl / CC BY 4.0 |
| `whispering-exchange` | `khan-trade-networks` | `image-exchange` | `/images/wonders/codex/exchange.jpg` | public domain | Carol M. Highsmith / public domain |
| `hall-of-champions` | `olympics-ancient` | `image-olympia-stadium` | `/images/wonders/codex/olympia-stadium.jpg` | CC BY 2.0 | dronepicr / CC BY 2.0 |
| `gate-of-the-world` | `noaa-maritime-heritage` | `image-ruins` | `/images/wonders/codex/ruins.png` | public domain | NOAA / public domain |
| `leviathan-drydock` | `noaa-maritime-heritage` | `image-drydock` | `/images/wonders/codex/drydock.jpeg` | public domain | Asahel Curtis / public domain |
| `storm-signal-spire` | `noaa-weather-radio` | `image-storm` | `/images/wonders/codex/storm.jpg` | public domain | NOAA / public domain |
| `manhattan-project` | `nps-manhattan-project` | `image-manhattan` | `/images/wonders/codex/manhattan.jpg` | public domain | U.S. Department of Energy / public domain |
| `internet` | `internet-society-history` | `image-internet` | `/images/wonders/codex/internet.jpg` | CC BY 2.5 | The Opte Project / CC BY 2.5 |
| `sistine-vault` | `loc-about` | `image-archive` | `/images/wonders/codex/archive.jpg` | public domain | Carol M. Highsmith / public domain |
| `codex-eternal` | `loc-about` | `image-archive` | `/images/wonders/codex/archive.jpg` | public domain | Carol M. Highsmith / public domain |
| `navigators-compass` | `noaa-maritime-heritage` | `image-drydock` | `/images/wonders/codex/drydock.jpeg` | public domain | Asahel Curtis / public domain |
| `palace-of-the-sun` | `loc-about` | `image-sun-tower` | `/images/wonders/codex/sun-tower.jpg` | CC BY-SA 3.0 | Z22 / CC BY-SA 3.0 |
| `iron-arsenal` | `loc-about` | `image-foundry` | `/images/wonders/codex/foundry.jpg` | CC BY-SA 3.0 | Nlynch / CC BY-SA 3.0 |
| `merchant-admiralty` | `noaa-maritime-heritage` | `image-drydock` | `/images/wonders/codex/drydock.jpeg` | public domain | Asahel Curtis / public domain |
| `crystal-palace` | `loc-about` | `image-foundry` | `/images/wonders/codex/foundry.jpg` | CC BY-SA 3.0 | Nlynch / CC BY-SA 3.0 |
| `suez-canal` | `noaa-maritime-heritage` | `image-drydock` | `/images/wonders/codex/drydock.jpeg` | public domain | Asahel Curtis / public domain |
| `continental-congress` | `loc-about` | `image-archive` | `/images/wonders/codex/archive.jpg` | public domain | Carol M. Highsmith / public domain |
| `eiffel-tower` | `loc-about` | `image-foundry` | `/images/wonders/codex/foundry.jpg` | CC BY-SA 3.0 | Nlynch / CC BY-SA 3.0 |
| `brooklyn-bridge` | `loc-about` | `image-foundry` | `/images/wonders/codex/foundry.jpg` | CC BY-SA 3.0 | Nlynch / CC BY-SA 3.0 |
| `trans-siberian-railway` | `loc-about` | `image-foundry` | `/images/wonders/codex/foundry.jpg` | CC BY-SA 3.0 | Nlynch / CC BY-SA 3.0 |
| `panama-canal` | `loc-about` | `image-foundry` | `/images/wonders/codex/foundry.jpg` | CC BY-SA 3.0 | Nlynch / CC BY-SA 3.0 |
| `empire-state-building` | `loc-about` | `image-foundry` | `/images/wonders/codex/foundry.jpg` | CC BY-SA 3.0 | Nlynch / CC BY-SA 3.0 |
| `hoover-dam` | `loc-about` | `image-foundry` | `/images/wonders/codex/foundry.jpg` | CC BY-SA 3.0 | Nlynch / CC BY-SA 3.0 |
| `wright-flyer` | `loc-about` | `image-foundry` | `/images/wonders/codex/foundry.jpg` | CC BY-SA 3.0 | Nlynch / CC BY-SA 3.0 |
| `united-nations` | `loc-about` | `image-archive` | `/images/wonders/codex/archive.jpg` | public domain | Carol M. Highsmith / public domain |
| `apollo-program` | `loc-about` | `image-archive` | `/images/wonders/codex/archive.jpg` | public domain | Carol M. Highsmith / public domain |
| `standing-stones` | `unesco-stonehenge` | `image-olympia-stadium` | `/images/wonders/codex/olympia-stadium.jpg` | CC BY 2.0 | dronepicr / CC BY 2.0 |
| `great-pyramid` | `unesco-giza` | `image-desert` | `/images/wonders/codex/desert.jpg` | public domain | NASA / public domain |
| `tidemother-colossus` | `noaa-maritime-heritage` | `image-drydock` | `/images/wonders/codex/drydock.jpeg` | public domain | Asahel Curtis / public domain |

The final implementation PR must include one completed row per codex entry. Contract tests must fail if a final codex entry references missing fact source IDs, missing image source IDs, missing local image paths, or placeholder attribution text.
