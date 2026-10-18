import type { WonderCodexFactSource, WonderCodexImageSource } from '@/systems/wonder-codex/types';

export const WONDER_CODEX_FACT_SOURCES = [
  {
    id: 'usgs-volcanoes',
    title: 'Volcano Hazards Program',
    publisher: 'U.S. Geological Survey',
    sourceUrl: 'https://www.usgs.gov/programs/VHP',
    notes: 'Used for volcanic landscape, eruption, and fertile-soil context.',
  },
  {
    id: 'nps-geology-mountains',
    title: 'Mountains',
    publisher: 'National Park Service',
    sourceUrl: 'https://www.nps.gov/subjects/geology/mountains.htm',
    notes: 'Used for mountain formation and landscape-scale context.',
  },
  {
    id: 'nps-caves',
    title: 'Caves and Karst',
    publisher: 'National Park Service',
    sourceUrl: 'https://www.nps.gov/subjects/caves/index.htm',
    notes: 'Used for cave formation and underground mineral environments.',
  },
  {
    id: 'usda-forests',
    title: 'Forest Service: Learn',
    publisher: 'U.S. Forest Service',
    sourceUrl: 'https://www.fs.usda.gov/learn',
    notes: 'Used for forest ecology and stewardship context.',
  },
  {
    id: 'noaa-corals',
    title: 'Corals Tutorial',
    publisher: 'National Ocean Service',
    sourceUrl: 'https://oceanservice.noaa.gov/education/tutorial_corals/',
    notes: 'Used for coral reef habitat and living-reef context.',
  },
  {
    id: 'nps-grand-canyon',
    title: 'Grand Canyon: Learn About the Park',
    publisher: 'National Park Service',
    sourceUrl: 'https://www.nps.gov/grca/learn/',
    notes: 'Used for Grand Canyon landscape and education context.',
  },
  {
    id: 'nasa-aurora',
    title: 'Auroras',
    publisher: 'NASA Science',
    sourceUrl: 'https://science.nasa.gov/earth/sun-earth/auroras/',
    notes: 'Used for aurora and space-weather explanation.',
  },
  {
    id: 'nps-waterfalls',
    title: 'Waterfalls',
    publisher: 'National Park Service',
    sourceUrl: 'https://www.nps.gov/subjects/geology/waterfalls.htm',
    notes: 'Used for waterfall landscape and erosion context.',
  },
  {
    id: 'smithsonian-fossils',
    title: 'Paleontology Teaching Resources',
    publisher: 'Smithsonian National Museum of Natural History',
    sourceUrl: 'https://naturalhistory.si.edu/education/teaching-resources/paleontology',
    notes: 'Used for fossils as evidence of ancient life.',
  },
  {
    id: 'nps-singing-sands',
    title: 'Singing Sands',
    publisher: 'National Park Service',
    sourceUrl: 'https://www.nps.gov/grsa/learn/nature/singing-sands.htm',
    notes: 'Used for sound-making sand dunes.',
  },
  {
    id: 'noaa-maritime-heritage',
    title: 'What Is Maritime Heritage?',
    publisher: 'National Ocean Service',
    sourceUrl: 'https://oceanservice.noaa.gov/facts/maritime-heritage.html',
    notes: 'Used for shipwreck, ruin, port, and ocean-history context.',
  },
  {
    id: 'noaa-bioluminescence',
    title: 'What Is Bioluminescence?',
    publisher: 'National Ocean Service',
    sourceUrl: 'https://oceanservice.noaa.gov/facts/biolum.html',
    notes: 'Used for glowing marine organisms.',
  },
  {
    id: 'usgs-water-science',
    title: 'Water Science School',
    publisher: 'U.S. Geological Survey',
    sourceUrl: 'https://www.usgs.gov/special-topics/water-science-school',
    notes: 'Used for lake and water-cycle context.',
  },
  {
    id: 'noaa-severe-weather',
    title: 'Severe Weather 101',
    publisher: 'National Severe Storms Laboratory',
    sourceUrl: 'https://www.nssl.noaa.gov/education/svrwx101/',
    notes: 'Used for storm and weather-safety context.',
  },
  {
    id: 'unesco-stonehenge',
    title: 'Stonehenge, Avebury and Associated Sites',
    publisher: 'UNESCO World Heritage Centre',
    sourceUrl: 'https://whc.unesco.org/en/list/373/',
    notes: 'Used for Standing Stones historical context.',
  },
  {
    id: 'unesco-giza',
    title: 'Memphis and its Necropolis – the Pyramid Fields from Giza to Dahshur',
    publisher: 'UNESCO World Heritage Centre',
    sourceUrl: 'https://whc.unesco.org/en/list/86/',
    notes: 'Used for Great Pyramid historical context.',
  },
  {
    id: 'unesco-first-qin-emperor',
    title: 'Mausoleum of the First Qin Emperor',
    publisher: 'UNESCO World Heritage Centre',
    sourceUrl: 'https://whc.unesco.org/en/list/441/',
    notes: 'Used for Terracotta Army historical context.',
  },
  {
    id: 'unesco-crac-des-chevaliers',
    title: 'Crac des Chevaliers and Qal’at Salah El-Din',
    publisher: 'UNESCO World Heritage Centre',
    sourceUrl: 'https://whc.unesco.org/en/list/1229/',
    notes: 'Used for Crac des Chevaliers historical and fortification context.',
  },
  {
    id: 'norad-agreement',
    title: 'NORAD Agreement',
    publisher: 'North American Aerospace Defense Command',
    sourceUrl: 'https://www.norad.mil/About-NORAD/NORAD-Agreement/',
    notes: 'Used for North American Aerospace Defense Command historical context.',
  },
  {
    id: 'unesco-delphi',
    title: 'Archaeological Site of Delphi',
    publisher: 'UNESCO World Heritage Centre',
    sourceUrl: 'https://whc.unesco.org/en/list/393/',
    notes: 'Used for Oracle of Delphi historical context.',
  },
  {
    id: 'unesco-grand-canal',
    title: 'The Grand Canal',
    publisher: 'UNESCO World Heritage Centre',
    sourceUrl: 'https://whc.unesco.org/en/list/1443/',
    notes: 'Used for canal infrastructure and history context.',
  },
  {
    id: 'energy-solar',
    title: 'How Does Solar Work?',
    publisher: 'U.S. Department of Energy',
    sourceUrl: 'https://www.energy.gov/eere/solar/how-does-solar-work',
    notes: 'Used for solar-light and energy framing.',
  },
  {
    id: 'loc-about',
    title: 'About the Library',
    publisher: 'Library of Congress',
    sourceUrl: 'https://www.loc.gov/about/',
    notes: 'Used for archive and memory-institution context.',
  },
  {
    id: 'bgci-gardens',
    title: 'About Botanic Gardens',
    publisher: 'Botanic Gardens Conservation International',
    sourceUrl: 'https://www.bgci.org/about/about-botanic-gardens/',
    notes: 'Used for garden conservation and learning context.',
  },
  {
    id: 'nps-saugus-iron',
    title: 'Saugus Iron Works',
    publisher: 'National Park Service',
    sourceUrl: 'https://www.nps.gov/sair/learn/historyculture/index.htm',
    notes: 'Used for foundry and early iron-industry context.',
  },
  {
    id: 'nasa-observatories',
    title: 'Observatories',
    publisher: 'NASA',
    sourceUrl: 'https://science.nasa.gov/astrophysics/programs/physics-of-the-cosmos/observatories/',
    notes: 'Used for observatory and sky-study context.',
  },
  {
    id: 'olympics-ancient',
    title: 'The Ancient Olympic Games',
    publisher: 'International Olympic Committee',
    sourceUrl: 'https://olympics.com/ioc/ancient-olympic-games',
    notes: 'Used for public competition and champion memory context.',
  },
  {
    id: 'noaa-weather-radio',
    title: 'NOAA Weather Radio',
    publisher: 'National Weather Service',
    sourceUrl: 'https://www.weather.gov/nwr/',
    notes: 'Used for storm signal and warning-network context.',
  },
  {
    id: 'nps-manhattan-project',
    title: 'Manhattan Project',
    publisher: 'National Park Service',
    sourceUrl: 'https://www.nps.gov/mapr/learn/manhattan-project.htm',
    notes: 'Used for Manhattan Project historical context.',
  },
  {
    id: 'internet-society-history',
    title: 'Brief History of the Internet',
    publisher: 'Internet Society',
    sourceUrl: 'https://www.internetsociety.org/internet/history-internet/brief-history-internet/',
    notes: 'Used for Internet origin and network context.',
  },
  {
    id: 'khan-trade-networks',
    title: 'Archipelago of Trade',
    publisher: 'Khan Academy',
    sourceUrl: 'https://www.khanacademy.org/humanities/world-history-project-ap/xb41992e0ff5e0f09:unit-2-networks-of-exchange/xb41992e0ff5e0f09:2-2routes-of-exchange/a/read-archipelago-of-trade',
    notes: 'Used for trade networks, exchange cities, and knowledge-sharing context.',
  },
] satisfies WonderCodexFactSource[];

export const WONDER_CODEX_IMAGE_SOURCES = [
  image('image-volcano', 'Kilauea Volcano', 'USGS / public domain', 'https://commons.wikimedia.org/wiki/File:Kilauea_Volcano,_Hawaii_(ASTER).jpg', '/images/wonders/codex/volcano.jpg'),
  image('image-mountain', 'Mount Everest', 'Wikimedia Commons / CC BY-SA 2.0', 'https://commons.wikimedia.org/wiki/File:Mount_Everest_as_seen_from_Drukair2_PLW_edit.jpg', '/images/wonders/codex/mountain.jpg'),
  image('image-cave', 'Luray Caverns', 'Jan Kronsell / public domain', 'https://commons.wikimedia.org/wiki/File:LurayCaverns.jpg', '/images/wonders/codex/cave.jpg'),
  image('image-forest', 'Hoh Rainforest', 'Wikimedia Commons / CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Hoh_Rainforest.jpg', '/images/wonders/codex/forest.jpg'),
  image('image-coral', 'Coral reef', 'NOAA / public domain', 'https://commons.wikimedia.org/wiki/File:Coral_Reef.jpg', '/images/wonders/codex/coral.jpg'),
  image('image-grand-canyon', 'Grand Canyon from Pima Point', 'Chensiyuan / CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Grand_Canyon_view_from_Pima_Point_2010.jpg', '/images/wonders/codex/grand-canyon.jpg'),
  image('image-aurora', 'Aurora', 'Wikimedia Commons / CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Aurora_Borealis_over_Eielson_Air_Force_Base,_Alaska.jpg', '/images/wonders/codex/aurora.jpg'),
  image('image-waterfall', 'Frozen waterfall', 'Yair Haklai / CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:The_frozen_waterfalls_of_Korouoma.jpg', '/images/wonders/codex/waterfall.jpg'),
  image('image-fossil', 'Dinosaur fossil skeleton', 'Wikimedia Commons / CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Tyrannosaurus_Rex_Holotype.jpg', '/images/wonders/codex/fossil.jpg'),
  image('image-ruins', 'Gulf of Mexico shipwreck bow', 'NOAA / public domain', 'https://commons.wikimedia.org/wiki/File:Gulf_of_Mexico_shipwreck_bow_2019.png', '/images/wonders/codex/ruins.png'),
  image('image-lake', 'Crater Lake', 'National Park Service / public domain', 'https://commons.wikimedia.org/wiki/File:Crater_Lake_winter_pano2.jpg', '/images/wonders/codex/lake.jpg'),
  image('image-delphi', 'Tholos at Delphi', 'Konstantinos Kousis / CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:IMGP3050W.jpg', '/images/wonders/codex/delphi.jpg'),
  image('image-sun-tower', 'Sierra SunTower Power Plant', 'Z22 / CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Sierra_SunTower_Power_Plant.jpg', '/images/wonders/codex/sun-tower.jpg'),
  image('image-archive', 'Library of Congress Main Reading Room', 'Carol M. Highsmith / public domain', 'https://commons.wikimedia.org/wiki/File:LOC_Main_Reading_Room_Highsmith.jpg', '/images/wonders/codex/archive.jpg'),
  image('image-garden', 'Botanical Garden Bonn', 'Carsondelake / CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Botanischer_Garten_Bonn.jpg', '/images/wonders/codex/garden.jpg'),
  image('image-foundry', 'Saugus Iron Works', 'Nlynch / CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Saugus_Iron_Works_National_Historic_Site.JPG', '/images/wonders/codex/foundry.jpg'),
  image('image-observatory', 'Paranal Observatory at sunset', 'ESO and G. Hudepohl / CC BY 4.0', 'https://commons.wikimedia.org/wiki/File:Paranal_and_the_Pacific_at_sunset_(dsc4088,_retouched,_cropped).jpg', '/images/wonders/codex/observatory.jpg'),
  image('image-manhattan', 'Calutron operators', 'U.S. Department of Energy / public domain', 'https://commons.wikimedia.org/wiki/File:Calutron_operators.jpg', '/images/wonders/codex/manhattan.jpg'),
  image('image-internet', 'Internet map', 'The Opte Project / CC BY 2.5', 'https://commons.wikimedia.org/wiki/File:Internet_map_1024.jpg', '/images/wonders/codex/internet.jpg'),
  // #609: generated illustrations replace shared stand-in photographs, one per wonder. Made with scripts/codex-image/codex_image.py;
  // the originals are never committed and each has a provenance record in design/wonder-codex-images/.
  generatedImage('image-whispering-exchange', 'The interior of a grand domed merchant exchange hall at golden sunset, with merchants gathered in whispering clusters on a marble floor around a central dais with a blank slate board, hanging brass instruments and lanterns', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/whispering-exchange.jpg'),
  generatedImage('image-grand-canal', 'A broad stone-faced imperial canal at golden sunset with a timber-gated lock raising loaded wooden barges, an arched stone bridge, willow trees, tiled-roof towns and rice paddies along the banks', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/grand-canal.jpg'),
  generatedImage('image-singing-sands', 'A sea of tall golden rippled sand dunes at sunset with a great curved dune ridge, a thin sand slide and a veil of blown sand, and a tiny line of camels crossing a lower dune', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/singing-sands.jpg'),
  generatedImage('image-eternal-storm', 'A colossal rotating supercell storm over an open dark ocean at dusk, with branching purple lightning, curtains of rain, amber light under its edge and a tiny lighthouse on a rocky sea stack', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/eternal-storm.jpg'),
  generatedImage('image-storm-signal-spire', 'A tall stone storm-warning tower on a coastal headland with a glowing amber beacon, signal horns, a weather station and plain coloured pennants, above a harbour town as a dark lightning storm rolls in across a golden sunset sky', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/storm-signal-spire.jpg'),
  generatedImage('image-floating-islands', 'A fantasy archipelago of rocky floating islands with green tops, small waterfalls, hanging roots and vine bridges, the central island carrying a stone tower, above a golden sea of clouds at sunset', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/floating-islands.jpg'),
  generatedImage('image-bioluminescent-bay', 'A calm tropical bay at night glowing electric blue where two small rowing boats stir the water, with palm-lined shores, a few village lanterns, a crescent moon and a starry Milky Way sky', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/bioluminescent-bay.jpg'),
  generatedImage('image-great-pyramid', 'A newly built smooth limestone pyramid with a gleaming gold cap and a long construction ramp where tiny workers haul stone blocks on sledges, with two smaller pyramids and a river valley at golden sunset', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/great-pyramid.jpg'),
  generatedImage('image-gate-of-the-world', 'A monumental stone harbour gateway with two tall towers joined by a great arch over a sea channel, tall-masted ships sailing out through it toward the setting sun, with busy stone quays and a terraced warm-stone city on both shores', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/gate-of-the-world.jpg'),
  generatedImage('image-tidecaller-bastion', 'A weathered stone sea-fortress on a rocky headland with a tall beacon lighthouse, a curving breakwater sheltering a harbour of small boats and a tall ship, at golden sunset with a storm front on the horizon', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/tidecaller-bastion.jpg'),
  generatedImage('image-crac-des-chevaliers', 'A medieval hilltop fortress of pale limestone with two rings of walls, round towers and a great central keep, a switchback ramp road climbing to its gatehouse at golden sunset above a hazy valley', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/crac-des-chevaliers.jpg'),
  generatedImage('image-leviathan-drydock', 'A vast stone-lined shipyard dock with the enormous half-built wooden hull of a giant sailing ship propped by timber shores and scaffolds, cranes, timber stacks, a glowing smithy and a smaller ship launching into the sea at golden sunset', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/leviathan-drydock.jpg'),
  generatedImage('image-navigators-compass', 'A huge bronze-and-brass mariner\'s compass on a stone pedestal on a clifftop terrace, with an armillary sphere and a telescope, above a sunset sea where small sailing ships cross a golden path', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/navigators-compass.jpg'),
  generatedImage('image-suez-canal', 'A straight stone-edged ship canal cut through a flat desert at golden sunset, a steam-and-sail merchant ship gliding down the channel, a stone signal station and a small camel caravan on the near bank', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/suez-canal.jpg'),
  generatedImage('image-merchant-admiralty', 'A grand symmetrical stone-and-brick admiralty hall with a columned portico and a clock-and-bell tower topped by a golden ship weathervane, on a busy harbour quay with moored tall ships, cargo crates and a lighthouse at golden sunset', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/merchant-admiralty.jpg'),
  generatedImage('image-tidemother-colossus', 'A colossal weathered-bronze statue of a robed sea goddess standing astride a harbour mouth, one arm raised holding a flaming torch bowl and the other holding a long oar, with a small ship passing beneath her at golden sunset', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/tidemother-colossus.jpg'),
  generatedImage('image-hall-of-champions', 'A long Greek-style colonnaded hall of honour beside a sandy running track at sunset, with a laurel wreath on its pediment and bronze statues of a runner, wrestlers and a discus thrower on stone plinths', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/hall-of-champions.jpg'),
  generatedImage('image-terracotta-army', 'Long ranks of life-size clay warrior statues, kneeling archers and a clay horse-drawn chariot standing in earthen excavation trenches under a timber roof, lit by golden sunset light', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/terracotta-army.jpg'),
  generatedImage('image-standing-stones', 'A ring of tall weathered standing stones, some capped by lintels, on a grassy hilltop at sunrise, with the low sun between two taller stones and long shadows across the grass', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/standing-stones.jpg'),
  generatedImage('image-palace-of-the-sun', 'A vast symmetrical pale-stone royal palace with blue-slate roofs and a central pavilion crowned by a gilded sun-disc, seen across a long reflecting canal and clipped hedge gardens with fountains at golden sunset', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/palace-of-the-sun.jpg'),
  generatedImage('image-sun-spire', 'A tall slender stone tower with a gold needle tip and a gleaming mirror disc, rising from a circular plaza marked with sundial spokes, ringed by tiled-roof houses and gardens above rolling hills and a lake at sunset', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/sun-spire.jpg'),
  generatedImage('image-united-nations', 'A tall glass-and-stone slab tower beside a long domed assembly hall with a row of empty flagpoles, on a riverside lawn at golden sunset with a bridge and city skyline beyond', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/united-nations.jpg'),
  generatedImage('image-norad', 'A concrete radar command site with a white radar dome and two lattice dish towers on a snowy mountain ridge at sunset, a winding road below and jet contrails in the sky', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/norad.jpg'),
  generatedImage('image-apollo-program', 'A tall black-and-white banded moon rocket beside a red steel gantry tower on its launch pad at dawn, reflected in a still marsh lagoon beneath a crescent Moon', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/apollo-program.jpg'),
  generatedImage('image-lunar-gateway', 'A slim chain of pale cylindrical modules with golden solar panels in orbit above the cratered Moon, a crewed capsule and a four-legged landing craft docked at its ends, a second capsule approaching and Earth in the starry sky', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/lunar-gateway.jpg'),
  generatedImage('image-open-intelligence-commons', 'A wide modern civic hall of pale stone and glass with a glowing glass atrium, seen across a public plaza with thin teal lines of light in the paving at sunset', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/open-intelligence-commons.jpg'),
  generatedImage('image-world-archive', 'A broad columned stone archive hall with a copper-green roof and square tower, seen across a paved forecourt with a round fountain at golden sunset', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/world-archive.jpg'),
  generatedImage('image-continental-congress', 'An empty 18th-century assembly hall with curved rows of wooden benches and green desks around a central podium, a plain cloth banner on the far wall, and golden evening light through tall windows', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/continental-congress.jpg'),
  generatedImage('image-codex-eternal', 'A grand round library hall with tall bookshelves, a skylight pouring golden light onto a great round table holding a huge open book, an armillary sphere, a telescope and glass flasks', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/codex-eternal.jpg'),
  generatedImage('image-sistine-vault', 'The long nave of an invented stone chapel, its barrel-vaulted ceiling covered in a swirling blue and gold fresco, with golden light falling through tall arched windows onto a polished floor', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/sistine-vault.jpg'),
  generatedImage('image-hoover-dam', 'A vast curved concrete arch dam with two Art Deco intake towers between red-brown desert canyon cliffs at sunset, with a turquoise river below', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/hoover-dam.jpg'),
  generatedImage('image-empire-state-building', 'A tall stepped Art Deco skyscraper rising above the low Manhattan skyline at sunset, seen across a harbour with tugboats and a ferry', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/empire-state-building.jpg'),
  generatedImage('image-panama-canal', 'A steamship waiting in a stone-walled Panama Canal lock between steel gates, in a jungle-covered cut at sunset', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/panama-canal.jpg'),
  generatedImage('image-trans-siberian-railway', 'A steam train crossing a high stone-pier iron bridge over a river in the autumn Siberian forest at sunset', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/trans-siberian-railway.jpg'),
  generatedImage('image-brooklyn-bridge', 'The Brooklyn Bridge spanning the East River at sunset, with sailing ships, a steam ferry and the low skyline of lower Manhattan', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/brooklyn-bridge.jpg'),
  generatedImage('image-eiffel-tower', 'The Eiffel Tower rising above the lawns of the Champ de Mars at golden hour', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/eiffel-tower.jpg'),
  generatedImage('image-crystal-palace', 'The Crystal Palace, a vast Victorian iron-and-glass exhibition hall glowing at sunset behind formal gardens and a fountain pool', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/crystal-palace.jpg'),
  generatedImage('image-iron-arsenal', 'A walled early-modern arsenal beside a harbour canal at sunset, with glowing furnace halls, tall chimneys, a half-built warship and moored galleys', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/iron-arsenal.jpg'),
  generatedImage('image-wright-flyer', 'The 1903 Wright Flyer biplane on a windswept sand dune at Kitty Hawk at sunrise', 'ChatGPT image generation (OpenAI)', 'https://chatgpt.com/', '/images/wonders/codex/wright-flyer.jpg'),
] satisfies WonderCodexImageSource[];

/** An AI-generated codex illustration. The credit line reads "Generated by <generator> - AI-generated image, non-commercial project". */
function generatedImage(
  id: string,
  title: string,
  generator: string,
  generatorUrl: string,
  localPath: string,
): WonderCodexImageSource {
  const attribution = `Generated by ${generator}`;
  return {
    id,
    title,
    sourceUrl: generatorUrl,
    creator: attribution,
    license: 'AI-generated image, non-commercial project',
    attribution,
    localPath,
  };
}

function image(
  id: string,
  title: string,
  attribution: string,
  sourceUrl: string,
  localPath: string,
): WonderCodexImageSource {
  return {
    id,
    title,
    sourceUrl,
    creator: attribution.split('/')[0].trim(),
    license: attribution.split('/')[1]?.trim() ?? 'See source',
    attribution,
    localPath,
  };
}

export function getWonderCodexFactSources(): WonderCodexFactSource[] {
  return WONDER_CODEX_FACT_SOURCES.map(source => ({ ...source }));
}

export function getWonderCodexImageSources(): WonderCodexImageSource[] {
  return WONDER_CODEX_IMAGE_SOURCES.map(source => ({ ...source }));
}

export function getFactSource(sourceId: string): WonderCodexFactSource | undefined {
  return WONDER_CODEX_FACT_SOURCES.find(source => source.id === sourceId);
}

export function getImageSource(sourceId: string): WonderCodexImageSource | undefined {
  return WONDER_CODEX_IMAGE_SOURCES.find(source => source.id === sourceId);
}
