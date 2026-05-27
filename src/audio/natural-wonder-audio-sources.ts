export interface NaturalWonderAudioSource {
  id: string;
  title: string;
  creator: 'Eric Matyas';
  site: 'Soundimage.org';
  sourceUrl: string;
  license: 'Soundimage.org free use with attribution';
}

export const NATURAL_WONDER_AUDIO_SOURCES: readonly NaturalWonderAudioSource[] = [
  {
    id: 'soundimage-underwater-rumble',
    title: 'Underwater Rumble',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2019/11/Underwater-Rumble.mp3',
    license: 'Soundimage.org free use with attribution',
  },
  {
    id: 'soundimage-quiet-tension-looping',
    title: 'Quiet Tension_Looping',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2018/10/Quiet-Tension_Looping.mp3',
    license: 'Soundimage.org free use with attribution',
  },
  {
    id: 'soundimage-morning-dew',
    title: 'Morning Dew',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2014/02/Morning-Dew.mp3',
    license: 'Soundimage.org free use with attribution',
  },
  {
    id: 'soundimage-sunrise-looping',
    title: 'Sunrise_Looping',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2018/10/Sunrise_Looping.mp3',
    license: 'Soundimage.org free use with attribution',
  },
  {
    id: 'soundimage-life-in-a-drop',
    title: 'Life in a Drop',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2014/02/Life-in-a-Drop.mp3',
    license: 'Soundimage.org free use with attribution',
  },
  {
    id: 'soundimage-underwater-world-looping',
    title: 'Underwater World_Looping',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2016/11/Underwater-World_Looping.mp3',
    license: 'Soundimage.org free use with attribution',
  },
] as const;

export function getNaturalWonderAudioSource(sourceId: string): NaturalWonderAudioSource | undefined {
  return NATURAL_WONDER_AUDIO_SOURCES.find(source => source.id === sourceId);
}
