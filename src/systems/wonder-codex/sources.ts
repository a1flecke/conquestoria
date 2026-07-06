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
  image('image-desert', 'Great Sand Dunes', 'NASA / public domain', 'https://commons.wikimedia.org/wiki/File:Great_Sand_Dunes_National_Park_and_Preserve.jpg', '/images/wonders/codex/desert.jpg'),
  image('image-ruins', 'Gulf of Mexico shipwreck bow', 'NOAA / public domain', 'https://commons.wikimedia.org/wiki/File:Gulf_of_Mexico_shipwreck_bow_2019.png', '/images/wonders/codex/ruins.png'),
  image('image-lake', 'Crater Lake', 'National Park Service / public domain', 'https://commons.wikimedia.org/wiki/File:Crater_Lake_winter_pano2.jpg', '/images/wonders/codex/lake.jpg'),
  image('image-storm', 'Thunderstorm', 'NOAA / public domain', 'https://commons.wikimedia.org/wiki/File:Isolated_supercell_-_NOAA.jpg', '/images/wonders/codex/storm.jpg'),
  image('image-delphi', 'Tholos at Delphi', 'Konstantinos Kousis / CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:IMGP3050W.jpg', '/images/wonders/codex/delphi.jpg'),
  image('image-canal', 'Beijing-Hangzhou Grand Canal in Chongfu Town', 'User MaomaodeRijiben / CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:The_Beijing-Hangzhou_Grand_Canal_in_Chongfu_Town_2014-06.jpg', '/images/wonders/codex/canal.jpg'),
  image('image-sun-tower', 'Sierra SunTower Power Plant', 'Z22 / CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Sierra_SunTower_Power_Plant.jpg', '/images/wonders/codex/sun-tower.jpg'),
  image('image-archive', 'Library of Congress Main Reading Room', 'Carol M. Highsmith / public domain', 'https://commons.wikimedia.org/wiki/File:LOC_Main_Reading_Room_Highsmith.jpg', '/images/wonders/codex/archive.jpg'),
  image('image-garden', 'Botanical Garden Bonn', 'Carsondelake / CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Botanischer_Garten_Bonn.jpg', '/images/wonders/codex/garden.jpg'),
  image('image-foundry', 'Saugus Iron Works', 'Nlynch / CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Saugus_Iron_Works_National_Historic_Site.JPG', '/images/wonders/codex/foundry.jpg'),
  image('image-observatory', 'Paranal Observatory at sunset', 'ESO and G. Hudepohl / CC BY 4.0', 'https://commons.wikimedia.org/wiki/File:Paranal_and_the_Pacific_at_sunset_(dsc4088,_retouched,_cropped).jpg', '/images/wonders/codex/observatory.jpg'),
  image('image-exchange', 'Trading Floor, New York Stock Exchange', 'Carol M. Highsmith / public domain', 'https://commons.wikimedia.org/wiki/File:No_Known_Restrictions_Trading_Floor,_New_York_Stock_Exchange_(Highsmith_LOC)_(6718386525).jpg', '/images/wonders/codex/exchange.jpg'),
  image('image-olympia-stadium', 'Ancient Olympia Stadium', 'dronepicr / CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Ancient_Olympia_Stadium_in_Greece_(51224128585).jpg', '/images/wonders/codex/olympia-stadium.jpg'),
  image('image-drydock', 'Puget Sound Naval Shipyard Drydock', 'Asahel Curtis / public domain', 'https://commons.wikimedia.org/wiki/File:Drydock,_Puget_Sound_Naval_Shipyard,_Bremerton,_showing_battleships_WISCONSIN_(left),_NEBRASKA_(right),_and_U_S_revenue_cutter_(CURTIS_771).jpeg', '/images/wonders/codex/drydock.jpeg'),
  image('image-manhattan', 'Calutron operators', 'U.S. Department of Energy / public domain', 'https://commons.wikimedia.org/wiki/File:Calutron_operators.jpg', '/images/wonders/codex/manhattan.jpg'),
  image('image-internet', 'Internet map', 'The Opte Project / CC BY 2.5', 'https://commons.wikimedia.org/wiki/File:Internet_map_1024.jpg', '/images/wonders/codex/internet.jpg'),
] satisfies WonderCodexImageSource[];

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
