export interface NaturalWonderAudioSource {
  id: string;
  title: string;
  creator: 'Eric Matyas';
  site: 'Soundimage.org';
  sourceUrl: string;
  license: 'Soundimage.org free use with attribution';
  creditText: string;
  localFiles: readonly string[];
}

export const NATURAL_WONDER_AUDIO_SOURCES: readonly NaturalWonderAudioSource[] = [
  {
    id: 'soundimage-underwater-rumble',
    title: 'Underwater Rumble',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2019/11/Underwater-Rumble.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Underwater Rumble" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/great-volcano-stinger.ogg'],
  },
  {
    id: 'soundimage-quiet-tension-looping',
    title: 'Quiet Tension_Looping',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2018/10/Quiet-Tension_Looping.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Quiet Tension_Looping" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/great-volcano-ambient.ogg'],
  },
  {
    id: 'soundimage-morning-dew',
    title: 'Morning Dew',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2014/02/Morning-Dew.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Morning Dew" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/ancient-forest-stinger.ogg'],
  },
  {
    id: 'soundimage-sunrise-looping',
    title: 'Sunrise_Looping',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2018/10/Sunrise_Looping.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Sunrise_Looping" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/ancient-forest-ambient.ogg'],
  },
  {
    id: 'soundimage-life-in-a-drop',
    title: 'Life in a Drop',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2014/02/Life-in-a-Drop.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Life in a Drop" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/coral-reef-stinger.ogg'],
  },
  {
    id: 'soundimage-underwater-world-looping',
    title: 'Underwater World_Looping',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2016/11/Underwater-World_Looping.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Underwater World_Looping" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/coral-reef-ambient.ogg'],
  },
  {
    id: 'soundimage-reaching-altitude',
    title: 'Reaching Altitude',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2017/04/Reaching-Altitude.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Reaching Altitude" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/sacred-mountain-stinger.ogg'],
  },
  {
    id: 'soundimage-our-mountain-v003',
    title: 'Our Mountain_v003',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2024/01/Our-Mountain_v003.wav',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Our Mountain_v003" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/sacred-mountain-ambient.ogg'],
  },
  {
    id: 'soundimage-chamber-of-jewels',
    title: 'Chamber of Jewels',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'http://soundimage.org/wp-content/uploads/2015/03/Chamber-of-Jewels.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Chamber of Jewels" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/crystal-caverns-stinger.ogg'],
  },
  {
    id: 'soundimage-crystal-caverns',
    title: 'Crystal Caverns',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'http://soundimage.org/wp-content/uploads/2016/04/Crystal-Caverns.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Crystal Caverns" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/crystal-caverns-ambient.ogg'],
  },
  {
    id: 'soundimage-updraft',
    title: 'Updraft',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2024/01/Updraft.wav',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Updraft" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/aurora-fields-stinger.ogg'],
  },
  {
    id: 'soundimage-strange-phenomenon',
    title: 'Strange Phenomenon',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2024/01/Strange-Phenomenon.wav',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Strange Phenomenon" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/aurora-fields-ambient.ogg'],
  },
] as const;

export function getNaturalWonderAudioSource(sourceId: string): NaturalWonderAudioSource | undefined {
  return NATURAL_WONDER_AUDIO_SOURCES.find(source => source.id === sourceId);
}
