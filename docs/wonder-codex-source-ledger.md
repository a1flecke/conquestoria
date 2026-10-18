# Wonder Codex Atlas Source Ledger

**Date:** 2026-05-23
**Purpose:** Source and licensing ledger for Stage 2D Wonder Codex factual copy and real-image requirements.

## Source Rules

Every Stage 2D codex entry must cite at least one factual source. Entries based on a real named place, object, event, technology, or natural phenomenon must use accurate, middle-school appropriate facts from reliable educational or institutional sources.

Every codex image must be a real image, not generated art, unless a later spec explicitly allows generated imagery for fictional-only wonders. Image sources must be public domain, U.S. government media with compatible usage guidance, or freely licensed media that allows reuse in the browser/PWA and macOS/Tauri app. Each image record must cite title, author/creator when available, source URL, license, attribution text, and local asset path.

Do not rely on uncited AI-generated prose for factual claims. Museum-label prose may be authored, but factual statements must be traceable to this ledger or the implementation source manifest.

## Required Implementation Files

Stage 2D implementation must add:

- `docs/wonder-codex-source-ledger.md` updates with final per-entry citations.
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
| `unesco-first-qin-emperor` | Terracotta Army factual source | https://whc.unesco.org/en/list/441/ | Official UNESCO World Heritage source for the Mausoleum of the First Qin Emperor and its Terracotta Army. |
| `unesco-crac-des-chevaliers` | Crac des Chevaliers factual source | https://whc.unesco.org/en/list/1229/ | Official UNESCO World Heritage source for Crac des Chevaliers and Qal’at Salah El-Din. |
| `norad-agreement` | NORAD factual source | https://www.norad.mil/About-NORAD/NORAD-Agreement/ | Official NORAD source for its agreement and command history. |
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
| `image-ruins` | https://commons.wikimedia.org/wiki/File:Gulf_of_Mexico_shipwreck_bow_2019.png | `/images/wonders/codex/ruins.png` | public domain | NOAA / public domain |
| `image-lake` | https://commons.wikimedia.org/wiki/File:Crater_Lake_winter_pano2.jpg | `/images/wonders/codex/lake.jpg` | public domain | National Park Service / public domain |
| `image-delphi` | https://commons.wikimedia.org/wiki/File:IMGP3050W.jpg | `/images/wonders/codex/delphi.jpg` | CC BY-SA 4.0 | Konstantinos Kousis / CC BY-SA 4.0 |
| `image-sun-tower` | https://commons.wikimedia.org/wiki/File:Sierra_SunTower_Power_Plant.jpg | `/images/wonders/codex/sun-tower.jpg` | CC BY-SA 3.0 | Z22 / CC BY-SA 3.0 |
| `image-archive` | https://commons.wikimedia.org/wiki/File:LOC_Main_Reading_Room_Highsmith.jpg | `/images/wonders/codex/archive.jpg` | public domain | Carol M. Highsmith / public domain |
| `image-garden` | https://commons.wikimedia.org/wiki/File:Botanischer_Garten_Bonn.jpg | `/images/wonders/codex/garden.jpg` | CC BY-SA 4.0 | Carsondelake / CC BY-SA 4.0 |
| `image-foundry` | https://commons.wikimedia.org/wiki/File:Saugus_Iron_Works_National_Historic_Site.JPG | `/images/wonders/codex/foundry.jpg` | CC BY-SA 3.0 | Nlynch / CC BY-SA 3.0 |
| `image-observatory` | https://commons.wikimedia.org/wiki/File:Paranal_and_the_Pacific_at_sunset_(dsc4088,_retouched,_cropped).jpg | `/images/wonders/codex/observatory.jpg` | CC BY 4.0 | ESO and G. Hudepohl / CC BY 4.0 |
| `image-manhattan` | https://commons.wikimedia.org/wiki/File:Calutron_operators.jpg | `/images/wonders/codex/manhattan.jpg` | public domain | U.S. Department of Energy / public domain |
| `image-internet` | https://commons.wikimedia.org/wiki/File:Internet_map_1024.jpg | `/images/wonders/codex/internet.jpg` | CC BY 2.5 | The Opte Project / CC BY 2.5 |
| `image-whispering-exchange` | https://chatgpt.com/ | `/images/wonders/codex/whispering-exchange.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/whispering-exchange.provenance.json` (#609). |
| `image-grand-canal` | https://chatgpt.com/ | `/images/wonders/codex/grand-canal.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/grand-canal.provenance.json` (#609). |
| `image-singing-sands` | https://chatgpt.com/ | `/images/wonders/codex/singing-sands.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/singing-sands.provenance.json` (#609). |
| `image-eternal-storm` | https://chatgpt.com/ | `/images/wonders/codex/eternal-storm.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/eternal-storm.provenance.json` (#609). |
| `image-storm-signal-spire` | https://chatgpt.com/ | `/images/wonders/codex/storm-signal-spire.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/storm-signal-spire.provenance.json` (#609). |
| `image-floating-islands` | https://chatgpt.com/ | `/images/wonders/codex/floating-islands.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/floating-islands.provenance.json` (#609). |
| `image-bioluminescent-bay` | https://chatgpt.com/ | `/images/wonders/codex/bioluminescent-bay.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/bioluminescent-bay.provenance.json` (#609). |
| `image-great-pyramid` | https://chatgpt.com/ | `/images/wonders/codex/great-pyramid.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/great-pyramid.provenance.json` (#609). |
| `image-gate-of-the-world` | https://chatgpt.com/ | `/images/wonders/codex/gate-of-the-world.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/gate-of-the-world.provenance.json` (#609). |
| `image-tidecaller-bastion` | https://chatgpt.com/ | `/images/wonders/codex/tidecaller-bastion.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/tidecaller-bastion.provenance.json` (#609). |
| `image-crac-des-chevaliers` | https://chatgpt.com/ | `/images/wonders/codex/crac-des-chevaliers.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/crac-des-chevaliers.provenance.json` (#609). |
| `image-leviathan-drydock` | https://chatgpt.com/ | `/images/wonders/codex/leviathan-drydock.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/leviathan-drydock.provenance.json` (#609). |
| `image-navigators-compass` | https://chatgpt.com/ | `/images/wonders/codex/navigators-compass.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/navigators-compass.provenance.json` (#609). |
| `image-suez-canal` | https://chatgpt.com/ | `/images/wonders/codex/suez-canal.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/suez-canal.provenance.json` (#609). |
| `image-merchant-admiralty` | https://chatgpt.com/ | `/images/wonders/codex/merchant-admiralty.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/merchant-admiralty.provenance.json` (#609). |
| `image-tidemother-colossus` | https://chatgpt.com/ | `/images/wonders/codex/tidemother-colossus.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/tidemother-colossus.provenance.json` (#609). |
| `image-hall-of-champions` | https://chatgpt.com/ | `/images/wonders/codex/hall-of-champions.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/hall-of-champions.provenance.json` (#609). |
| `image-terracotta-army` | https://chatgpt.com/ | `/images/wonders/codex/terracotta-army.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/terracotta-army.provenance.json` (#609). |
| `image-standing-stones` | https://chatgpt.com/ | `/images/wonders/codex/standing-stones.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/standing-stones.provenance.json` (#609). |
| `image-palace-of-the-sun` | https://chatgpt.com/ | `/images/wonders/codex/palace-of-the-sun.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/palace-of-the-sun.provenance.json` (#609). |
| `image-sun-spire` | https://chatgpt.com/ | `/images/wonders/codex/sun-spire.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/sun-spire.provenance.json` (#609). |
| `image-united-nations` | https://chatgpt.com/ | `/images/wonders/codex/united-nations.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/united-nations.provenance.json` (#609). |
| `image-norad` | https://chatgpt.com/ | `/images/wonders/codex/norad.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/norad.provenance.json` (#609). |
| `image-apollo-program` | https://chatgpt.com/ | `/images/wonders/codex/apollo-program.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/apollo-program.provenance.json` (#609). |
| `image-lunar-gateway` | https://chatgpt.com/ | `/images/wonders/codex/lunar-gateway.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/lunar-gateway.provenance.json` (#609). |
| `image-open-intelligence-commons` | https://chatgpt.com/ | `/images/wonders/codex/open-intelligence-commons.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/open-intelligence-commons.provenance.json` (#609). |
| `image-world-archive` | https://chatgpt.com/ | `/images/wonders/codex/world-archive.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/world-archive.provenance.json` (#609). |
| `image-continental-congress` | https://chatgpt.com/ | `/images/wonders/codex/continental-congress.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/continental-congress.provenance.json` (#609). |
| `image-codex-eternal` | https://chatgpt.com/ | `/images/wonders/codex/codex-eternal.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/codex-eternal.provenance.json` (#609). |
| `image-sistine-vault` | https://chatgpt.com/ | `/images/wonders/codex/sistine-vault.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/sistine-vault.provenance.json` (#609). |
| `image-hoover-dam` | https://chatgpt.com/ | `/images/wonders/codex/hoover-dam.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/hoover-dam.provenance.json` (#609). |
| `image-empire-state-building` | https://chatgpt.com/ | `/images/wonders/codex/empire-state-building.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/empire-state-building.provenance.json` (#609). |
| `image-panama-canal` | https://chatgpt.com/ | `/images/wonders/codex/panama-canal.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/panama-canal.provenance.json` (#609). |
| `image-trans-siberian-railway` | https://chatgpt.com/ | `/images/wonders/codex/trans-siberian-railway.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/trans-siberian-railway.provenance.json` (#609). |
| `image-brooklyn-bridge` | https://chatgpt.com/ | `/images/wonders/codex/brooklyn-bridge.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/brooklyn-bridge.provenance.json` (#609). |
| `image-eiffel-tower` | https://chatgpt.com/ | `/images/wonders/codex/eiffel-tower.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/eiffel-tower.provenance.json` (#609). |
| `image-crystal-palace` | https://chatgpt.com/ | `/images/wonders/codex/crystal-palace.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/crystal-palace.provenance.json` (#609). |
| `image-iron-arsenal` | https://chatgpt.com/ | `/images/wonders/codex/iron-arsenal.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/iron-arsenal.provenance.json` (#609). |
| `image-wright-flyer` | https://chatgpt.com/ | `/images/wonders/codex/wright-flyer.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI). Provenance: `design/wonder-codex-images/wright-flyer.provenance.json` (#609). |

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
| `singing_sands` | `nps-singing-sands` | `image-singing-sands` | `/images/wonders/codex/singing-sands.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `sunken_ruins` | `noaa-maritime-heritage` | `image-ruins` | `/images/wonders/codex/ruins.png` | public domain | NOAA / public domain |
| `floating_islands` | `nps-geology-mountains` | `image-floating-islands` | `/images/wonders/codex/floating-islands.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `bioluminescent_bay` | `noaa-bioluminescence` | `image-bioluminescent-bay` | `/images/wonders/codex/bioluminescent-bay.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `bottomless_lake` | `usgs-water-science` | `image-lake` | `/images/wonders/codex/lake.jpg` | public domain | National Park Service / public domain |
| `eternal_storm` | `noaa-severe-weather` | `image-eternal-storm` | `/images/wonders/codex/eternal-storm.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `oracle-of-delphi` | `unesco-delphi` | `image-delphi` | `/images/wonders/codex/delphi.jpg` | CC BY-SA 4.0 | Konstantinos Kousis / CC BY-SA 4.0 |
| `grand-canal` | `unesco-grand-canal` | `image-grand-canal` | `/images/wonders/codex/grand-canal.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `sun-spire` | `energy-solar` | `image-sun-spire` | `/images/wonders/codex/sun-spire.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `world-archive` | `loc-about` | `image-world-archive` | `/images/wonders/codex/world-archive.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `moonwell-gardens` | `bgci-gardens` | `image-garden` | `/images/wonders/codex/garden.jpg` | CC BY-SA 4.0 | Carsondelake / CC BY-SA 4.0 |
| `ironroot-foundry` | `nps-saugus-iron` | `image-foundry` | `/images/wonders/codex/foundry.jpg` | CC BY-SA 3.0 | Nlynch / CC BY-SA 3.0 |
| `tidecaller-bastion` | `noaa-maritime-heritage` | `image-tidecaller-bastion` | `/images/wonders/codex/tidecaller-bastion.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `starvault-observatory` | `nasa-observatories` | `image-observatory` | `/images/wonders/codex/observatory.jpg` | CC BY 4.0 | ESO and G. Hudepohl / CC BY 4.0 |
| `whispering-exchange` | `khan-trade-networks` | `image-whispering-exchange` | `/images/wonders/codex/whispering-exchange.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `hall-of-champions` | `olympics-ancient` | `image-hall-of-champions` | `/images/wonders/codex/hall-of-champions.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `gate-of-the-world` | `noaa-maritime-heritage` | `image-gate-of-the-world` | `/images/wonders/codex/gate-of-the-world.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `leviathan-drydock` | `noaa-maritime-heritage` | `image-leviathan-drydock` | `/images/wonders/codex/leviathan-drydock.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `storm-signal-spire` | `noaa-weather-radio` | `image-storm-signal-spire` | `/images/wonders/codex/storm-signal-spire.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `manhattan-project` | `nps-manhattan-project` | `image-manhattan` | `/images/wonders/codex/manhattan.jpg` | public domain | U.S. Department of Energy / public domain |
| `internet` | `internet-society-history` | `image-internet` | `/images/wonders/codex/internet.jpg` | CC BY 2.5 | The Opte Project / CC BY 2.5 |
| `sistine-vault` | `loc-about` | `image-sistine-vault` | `/images/wonders/codex/sistine-vault.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `codex-eternal` | `loc-about` | `image-codex-eternal` | `/images/wonders/codex/codex-eternal.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `navigators-compass` | `noaa-maritime-heritage` | `image-navigators-compass` | `/images/wonders/codex/navigators-compass.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `palace-of-the-sun` | `loc-about` | `image-palace-of-the-sun` | `/images/wonders/codex/palace-of-the-sun.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `iron-arsenal` | `loc-about` | `image-iron-arsenal` | `/images/wonders/codex/iron-arsenal.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `merchant-admiralty` | `noaa-maritime-heritage` | `image-merchant-admiralty` | `/images/wonders/codex/merchant-admiralty.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `crystal-palace` | `loc-about` | `image-crystal-palace` | `/images/wonders/codex/crystal-palace.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `suez-canal` | `noaa-maritime-heritage` | `image-suez-canal` | `/images/wonders/codex/suez-canal.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `continental-congress` | `loc-about` | `image-continental-congress` | `/images/wonders/codex/continental-congress.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `eiffel-tower` | `loc-about` | `image-eiffel-tower` | `/images/wonders/codex/eiffel-tower.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `brooklyn-bridge` | `loc-about` | `image-brooklyn-bridge` | `/images/wonders/codex/brooklyn-bridge.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `trans-siberian-railway` | `loc-about` | `image-trans-siberian-railway` | `/images/wonders/codex/trans-siberian-railway.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `panama-canal` | `loc-about` | `image-panama-canal` | `/images/wonders/codex/panama-canal.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `empire-state-building` | `loc-about` | `image-empire-state-building` | `/images/wonders/codex/empire-state-building.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `hoover-dam` | `loc-about` | `image-hoover-dam` | `/images/wonders/codex/hoover-dam.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `wright-flyer` | `loc-about` | `image-wright-flyer` | `/images/wonders/codex/wright-flyer.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `united-nations` | `loc-about` | `image-united-nations` | `/images/wonders/codex/united-nations.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `open-intelligence-commons` | `internet-society-history` | `image-open-intelligence-commons` | `/images/wonders/codex/open-intelligence-commons.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `lunar-gateway` | `nasa-observatories` | `image-lunar-gateway` | `/images/wonders/codex/lunar-gateway.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `apollo-program` | `loc-about` | `image-apollo-program` | `/images/wonders/codex/apollo-program.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `standing-stones` | `unesco-stonehenge` | `image-standing-stones` | `/images/wonders/codex/standing-stones.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `great-pyramid` | `unesco-giza` | `image-great-pyramid` | `/images/wonders/codex/great-pyramid.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `terracotta-army` | `unesco-first-qin-emperor` | `image-terracotta-army` | `/images/wonders/codex/terracotta-army.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `crac-des-chevaliers` | `unesco-crac-des-chevaliers` | `image-crac-des-chevaliers` | `/images/wonders/codex/crac-des-chevaliers.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `norad` | `norad-agreement` | `image-norad` | `/images/wonders/codex/norad.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |
| `tidemother-colossus` | `noaa-maritime-heritage` | `image-tidemother-colossus` | `/images/wonders/codex/tidemother-colossus.jpg` | AI-generated image, non-commercial project | Generated by ChatGPT image generation (OpenAI) |

The final implementation PR must include one completed row per codex entry. Contract tests must fail if a final codex entry references missing fact source IDs, missing image source IDs, missing local image paths, or placeholder attribution text.
