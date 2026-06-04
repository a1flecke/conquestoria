#!/usr/bin/env npx tsx
/**
 * scripts/gen-voice-manifest.ts
 *
 * Generates voice-manifest.json for use by scripts/synthesise-voice.sh.
 * Run: npx tsx scripts/gen-voice-manifest.ts > voice-manifest.json
 *
 * The manifest is a JSON array of synthesis jobs. Each job describes:
 *   packId    — voice pack (e.g. 'china')
 *   eventId   — voice event (e.g. 'era-advance')
 *   text      — the line to synthesise
 *   piperModel — the Piper TTS model to use
 *   outputPath — where to write the OGG file
 *
 * After editing text scripts below, re-run this script and commit the updated
 * voice-manifest.json alongside any voice OGG changes.
 */

import { VOICE_CATALOG, ALL_VOICE_PACK_IDS, ALL_VOICE_EVENT_IDS, type VoicePackId, type VoiceEventId } from '../src/audio/voice-catalog';

// --- Text scripts per pack per event ---
// Tone notes:
//   china:    Confucian scholar, nature metaphor, deliberate
//   egypt:    Ancient priest-ruler, mystical, timeless
//   rome:     Senator-general, proud, declarative
//   england:  Understated diplomat, dry wit, clipped
//   france:   Cultural sophisticate, theatrical
//   viking:   Warrior-chief, blunt, short
//   zulu:     King with rhythm, ancestral
//   aztec:    Priest-warrior, invokes sun/gods, fierce
//   mongolia: Conqueror, curt, tactical
//   gondor:   Noble steward, formal, epic register
//   generic:  Neutral advisor, informative

const VOICE_SCRIPTS: Record<string, Record<string, string>> = {
  china: {
    'era-advance':    'The river has found a wider valley.',
    'city-founded':   'Another root takes hold in the earth.',
    'war-declared':   'Even still water will break a stone.',
    'tech-completed': 'Knowledge cannot be taken back.',
    'wonder-built':   'It will outlast our names.',
    'wonder-lost':    'Another built what we could not finish.',
    'city-lost':      'A branch has been cut. The tree remains.',
    'near-defeat':    'Even a single ember can start a fire.',
    'victory':        'The harvest was worth the long winter.',
    'peace-signed':   'The sword rests. For now.',
  },
  egypt: {
    'era-advance':    'The Nile rises. Our age is reborn.',
    'city-founded':   'Another monument to eternity is placed.',
    'war-declared':   'The gods demand our enemies fall.',
    'tech-completed': 'The scribes have revealed a new truth.',
    'wonder-built':   'It shall stand when empires are dust.',
    'wonder-lost':    'Others have stolen our glory.',
    'city-lost':      'A jewel of the Nile has been seized.',
    'near-defeat':    'Pharaoh does not yield. Not now.',
    'victory':        'Egypt endures. As it always has.',
    'peace-signed':   'The desert is calm again.',
  },
  rome: {
    'era-advance':    'Rome advances. None shall stand in our way.',
    'city-founded':   'Another city joins the eternal empire.',
    'war-declared':   'Rome does not tolerate insolence.',
    'tech-completed': 'Our engineers have surpassed themselves.',
    'wonder-built':   'A marvel worthy of Rome.',
    'wonder-lost':    'We will build something greater.',
    'city-lost':      'This insult will be answered.',
    'near-defeat':    'Rome has survived worse. We endure.',
    'victory':        'All roads lead here. Because we made them.',
    'peace-signed':   'A temporary arrangement.',
  },
  england: {
    'era-advance':    'Progress. At last.',
    'city-founded':   'Quite. Another settlement.',
    'war-declared':   'Regrettable. But necessary.',
    'tech-completed': 'Splendid work from our scholars.',
    'wonder-built':   'Rather impressive, I must say.',
    'wonder-lost':    'A minor setback.',
    'city-lost':      'We shall not allow that to stand.',
    'near-defeat':    'We have been in tighter spots.',
    'victory':        'Civilised, as expected.',
    'peace-signed':   'Very well. For now.',
  },
  france: {
    'era-advance':    'Magnifique! A new age for France!',
    'city-founded':   'Another jewel in our crown.',
    'war-declared':   'They have forced our hand.',
    'tech-completed': 'Our brilliance illuminates the world.',
    'wonder-built':   "C'est incroyable! A masterpiece!",
    'wonder-lost':    'How disappointing.',
    'city-lost':      'An outrage. We will reclaim it.',
    'near-defeat':    'France is never truly defeated.',
    'victory':        'History will remember this day.',
    'peace-signed':   'Harmony is restored.',
  },
  viking: {
    'era-advance':    'We are stronger than yesterday.',
    'city-founded':   'Good. More land.',
    'war-declared':   'Finally. Battle.',
    'tech-completed': 'Useful.',
    'wonder-built':   'They will sing of this.',
    'wonder-lost':    'Disgrace. Build faster next time.',
    'city-lost':      'They took our city. We take two of theirs.',
    'near-defeat':    'We are not dead yet.',
    'victory':        'All falls before us. As it should.',
    'peace-signed':   'Peace. For now.',
  },
  zulu: {
    'era-advance':    'The ancestors watch as we rise.',
    'city-founded':   'Our people grow strong.',
    'war-declared':   'The impis are ready.',
    'tech-completed': 'Wisdom has come to us.',
    'wonder-built':   "A gift to our children's children.",
    'wonder-lost':    'Others move quickly. We will move faster.',
    'city-lost':      'This wound will heal with victory.',
    'near-defeat':    'The Zulu bend like the reed. We do not break.',
    'victory':        'The nation stands. The nation endures.',
    'peace-signed':   'Let the land rest.',
  },
  aztec: {
    'era-advance':    'The sun demands we rise higher.',
    'city-founded':   'Another offering to Tenochtitlan.',
    'war-declared':   'The sun demands blood.',
    'tech-completed': 'The gods have revealed their secrets.',
    'wonder-built':   'The heavens are pleased.',
    'wonder-lost':    'The sun is displeased. We must act.',
    'city-lost':      'They will pay for this affront.',
    'near-defeat':    'The fifth sun does not set today.',
    'victory':        'The sun rises on our glory.',
    'peace-signed':   'The sun rests. We are grateful.',
  },
  mongolia: {
    'era-advance':    'Further. Always further.',
    'city-founded':   'Another camp. Good.',
    'war-declared':   'Ride.',
    'tech-completed': 'Practical.',
    'wonder-built':   'It stands.',
    'wonder-lost':    'Next time.',
    'city-lost':      'Reclaim it.',
    'near-defeat':    'The steppe endures. So do we.',
    'victory':        'The horizon is ours.',
    'peace-signed':   'For now.',
  },
  gondor: {
    'era-advance':    'The White Tower stands proud. Gondor advances.',
    'city-founded':   'Another outpost for the realm of men.',
    'war-declared':   'Gondor does not yield to shadow.',
    'tech-completed': 'The scholars of Minas Tirith have done well.',
    'wonder-built':   'A monument to the eternal realm.',
    'wonder-lost':    'Others have moved against us.',
    'city-lost':      'We will hold the remaining gates.',
    'near-defeat':    'Gondor has never fallen. It shall not fall now.',
    'victory':        'The age of Men is not ended.',
    'peace-signed':   'Let the realm know peace.',
  },
  generic: {
    'era-advance':    'A new era begins.',
    'city-founded':   'A new city is founded.',
    'war-declared':   'War has been declared.',
    'tech-completed': 'Research complete.',
    'wonder-built':   'A wonder is complete.',
    'wonder-lost':    'The wonder was claimed by another.',
    'city-lost':      'We have lost a city.',
    'near-defeat':    'We are near defeat.',
    'victory':        'Victory is ours.',
    'peace-signed':   'Peace has been reached.',
  },
};

// Piper model selection per pack — update during curation MRs for best voice quality
const PIPER_MODELS: Record<string, string> = {
  china:    'en_US-lessac-medium',
  egypt:    'en_US-ryan-medium',
  rome:     'en_US-ryan-high',
  england:  'en_GB-alba-medium',
  france:   'en_US-lessac-medium',
  viking:   'en_US-ryan-medium',
  zulu:     'en_US-ryan-medium',
  aztec:    'en_US-lessac-medium',
  mongolia: 'en_US-ryan-medium',
  gondor:   'en_US-ryan-high',
  generic:  'en_US-lessac-medium',
};

interface ManifestEntry {
  packId: string;
  eventId: string;
  text: string;
  piperModel: string;
  outputPath: string;
}

const manifest: ManifestEntry[] = [];

for (const packId of ALL_VOICE_PACK_IDS) {
  for (const eventId of ALL_VOICE_EVENT_IDS) {
    const entry = VOICE_CATALOG[packId]?.[eventId];
    if (!entry) continue;
    manifest.push({
      packId,
      eventId,
      text: VOICE_SCRIPTS[packId]?.[eventId] ?? VOICE_SCRIPTS['generic'][eventId],
      piperModel: PIPER_MODELS[packId] ?? PIPER_MODELS['generic'],
      outputPath: `public/${entry.file}`,
    });
  }
}

process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
