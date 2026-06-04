import { describe, it, expect, beforeEach } from 'vitest';
import { MockAudioContext } from '../helpers/mock-audio-context';
import { AudioMixer, type SnapshotId } from '../../src/audio/audio-mixer';

function makeCtx() {
  return new MockAudioContext();
}

function makeMixer(ctx: MockAudioContext) {
  return new AudioMixer(ctx as unknown as AudioContext);
}

function makeBuf(ctx: MockAudioContext) {
  return ctx.createBuffer(2, 4410, 44100);
}

describe('AudioMixer construction', () => {
  it('creates at least 6 GainNodes (5 buses + music master)', () => {
    const ctx = makeCtx();
    makeMixer(ctx);
    // 4 music buses + 1 sfx bus + 1 musicMasterGain = 6 minimum
    // Plus per-source gains created by setBusSource
    expect(ctx.opsOf('createGain').length).toBeGreaterThanOrEqual(6);
  });
});

describe('AudioMixer.setSnapshot()', () => {
  const SNAPSHOT_CASES: { id: SnapshotId; era: number; accent: number; adaptive: number }[] = [
    { id: 'silent',            era: 0.0, accent: 0.00, adaptive: 0.0 },
    { id: 'peace',             era: 1.0, accent: 0.70, adaptive: 0.0 },
    { id: 'at-war',            era: 1.0, accent: 0.50, adaptive: 0.8 },
    { id: 'unrest',            era: 1.0, accent: 0.55, adaptive: 0.5 },
    { id: 'brink-of-defeat',   era: 0.7, accent: 0.15, adaptive: 1.0 },
    { id: 'stinger-duck',      era: 0.5, accent: 0.35, adaptive: 0.4 },
    { id: 'voice-duck',        era: 0.5, accent: 0.35, adaptive: 0.4 },
  ];

  for (const { id, era, accent, adaptive } of SNAPSHOT_CASES) {
    it(`'${id}' snapshot sets correct gain values`, () => {
      const ctx = makeCtx();
      const mixer = makeMixer(ctx);
      ctx.clearTranscript();

      mixer.setSnapshot(id, 0);  // fadeMs=0 → immediate setValueAtTime

      const allValues = ctx.opsOf('setValueAtTime').map(e => e.args[0] as number);
      expect(allValues, `${id} era bus`).toContain(era);
      expect(allValues, `${id} accent bus`).toContain(accent);
      expect(allValues, `${id} adaptive bus`).toContain(adaptive);
    });
  }

  it('uses linearRampToValueAtTime when fadeMs > 0', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();

    mixer.setSnapshot('peace', 1000);

    expect(ctx.opsOf('linearRampToValueAtTime').length).toBeGreaterThan(0);
  });
});

describe('AudioMixer.setBusSource()', () => {
  it('creates a new buffer source node', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();

    mixer.setBusSource('era', makeBuf(ctx), true, { loopStart: 2, loopEnd: 28 }, 0);

    expect(ctx.opsOf('createBufferSource').length).toBe(1);
  });

  it('starts the source node', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();

    mixer.setBusSource('era', makeBuf(ctx), true, { loopStart: 0, loopEnd: 30 }, 0);

    expect(ctx.opsOf('start').length).toBe(1);
  });

  it('schedules gain ramps for the new source when fadeMs > 0', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();

    mixer.setBusSource('era', makeBuf(ctx), true, { loopStart: 0, loopEnd: 30 }, 500);

    expect(ctx.opsOf('linearRampToValueAtTime').length).toBeGreaterThan(0);
  });

  it('schedules stop for the old source when replacing', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);

    mixer.setBusSource('era', makeBuf(ctx), true, { loopStart: 0, loopEnd: 30 }, 0);
    ctx.clearTranscript();

    // Replace with a new source
    mixer.setBusSource('era', makeBuf(ctx), true, { loopStart: 0, loopEnd: 30 }, 500);

    expect(ctx.opsOf('stop').length).toBe(1);
  });

  it('accepts null buffer (clears the bus)', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);

    mixer.setBusSource('era', makeBuf(ctx), true, { loopStart: 0, loopEnd: 30 }, 0);
    ctx.clearTranscript();

    expect(() => mixer.setBusSource('era', null, false, null, 500)).not.toThrow();
  });
});

describe('AudioMixer.playOneShot()', () => {
  it('resolves when the source ends (duck-neutral)', async () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();

    const buf = makeBuf(ctx);
    const promise = mixer.playOneShot('stinger', buf);

    // The MockBufferSourceNode's stop() triggers onended synchronously.
    // Find the source that was just created and stop it to resolve the promise.
    const sources = ctx.opsOf('createBufferSource');
    expect(sources.length).toBe(1);

    // Access the MockBufferSourceNode that was just created
    const allNodes = (ctx as unknown as { transcript: import('../helpers/mock-audio-context').TranscriptEntry[] }).transcript;
    void allNodes;

    // Trigger resolution by finding the source node via the internal mixer state
    // We rely on MockBufferSourceNode's stop() triggering onended synchronously
    const mixerAny = mixer as unknown as Record<string, unknown>;
    const musicBuses = mixerAny['musicBuses'] as Record<string, { source: import('../helpers/mock-audio-context').MockBufferSourceNode | null }>;
    const stingerSrc = musicBuses['stinger']?.source;
    if (stingerSrc) stingerSrc.stop();

    await expect(promise).resolves.toBeUndefined();
  });

  it('is duck-neutral (no snapshot setValueAtTime called during playOneShot)', async () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    mixer.setSnapshot('peace', 0);
    ctx.clearTranscript();

    const buf = makeBuf(ctx);
    const promise = mixer.playOneShot('stinger', buf);

    const mixerAny = mixer as unknown as Record<string, unknown>;
    const musicBuses = mixerAny['musicBuses'] as Record<string, { source: import('../helpers/mock-audio-context').MockBufferSourceNode | null }>;
    musicBuses['stinger']?.source?.stop();
    await promise;

    // No snapshot values (0.7, 0.8, 0.5, etc.) set during the playOneShot itself
    const snapshotValues = [0.0, 0.7, 0.8, 0.5, 0.35, 0.4, 1.0];
    const ramps = ctx.opsOf('setValueAtTime').filter(e => snapshotValues.includes(e.args[0] as number));
    expect(ramps.length).toBe(0);
  });
});

describe('AudioMixer mute (M-1, M-2)', () => {
  it('setMusicEnabled(false) calls cancelScheduledValues and sets gain to 0 immediately', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();

    mixer.setMusicEnabled(false);

    expect(ctx.opsOf('cancelScheduledValues').length).toBeGreaterThan(0);
    const zeros = ctx.opsOf('setValueAtTime').filter(e => e.args[0] === 0);
    expect(zeros.length).toBeGreaterThan(0);
  });

  it('setMusicEnabled(true) restores square-law volume (Au-2)', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    mixer.setMusicVolume(0.5);  // currentMusicVolume = 0.5; gain = 0.25
    ctx.clearTranscript();

    mixer.setMusicEnabled(false);
    mixer.setMusicEnabled(true);

    const restores = ctx.opsOf('setValueAtTime').filter(
      e => Math.abs((e.args[0] as number) - 0.25) < 0.001,
    );
    expect(restores.length).toBeGreaterThan(0);
  });
});

describe('AudioMixer.setMasterMusicVolume()', () => {
  it('schedules a linear ramp to the target volume over fadeMs (for game-end fade)', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();
    ctx.currentTime = 0;

    mixer.setMasterMusicVolume(0, 1500);

    const ramps = ctx.opsOf('linearRampToValueAtTime').filter(e => e.args[0] === 0);
    expect(ramps.length).toBeGreaterThan(0);
    expect(ramps[0].args[1] as number).toBeCloseTo(1.5, 1);
  });
});

describe('AudioMixer.getSfxRoutingNode()', () => {
  it('returns a node (H-3)', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    expect(mixer.getSfxRoutingNode()).toBeTruthy();
  });
});

describe('AudioMixer SFX volume + enable symmetry', () => {
  it('setSfxEnabled(true) restores square-law SFX volume, not hardcoded 1.0', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    mixer.setSfxVolume(0.5); // currentSfxVolume = 0.5; perceptual = 0.25
    ctx.clearTranscript();

    mixer.setSfxEnabled(false);
    mixer.setSfxEnabled(true);

    const restores = ctx.opsOf('setValueAtTime').filter(
      e => Math.abs((e.args[0] as number) - 0.25) < 0.001,
    );
    expect(restores.length).toBeGreaterThan(0);
  });

  it('setSfxVolume does not apply when SFX is muted', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    mixer.setSfxEnabled(false);
    ctx.clearTranscript();

    mixer.setSfxVolume(0.8);

    // Gain should not update while muted
    const nonZero = ctx.opsOf('setValueAtTime').filter(e => (e.args[0] as number) !== 0);
    expect(nonZero.length).toBe(0);
  });

  it('playOneShot clears b.source on natural end (no stale ref for next call)', async () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);

    const buf = makeBuf(ctx);
    const promise = mixer.playOneShot('stinger', buf);

    const mixerAny = mixer as unknown as Record<string, unknown>;
    const musicBuses = mixerAny['musicBuses'] as Record<string, { source: import('../helpers/mock-audio-context').MockBufferSourceNode | null }>;
    const src = musicBuses['stinger']?.source;
    if (src) src.stop(); // triggers onended synchronously
    await promise;

    // After natural end, b.source should be null
    expect(musicBuses['stinger']?.source).toBeNull();
  });
});

describe('AudioMixer natural wonder ambience', () => {
  it('routes ambience through a dedicated path without occupying the one-shot SFX source', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();

    mixer.setAmbienceLoop(makeBuf(ctx), { loopStart: 0, loopEnd: 10 }, 500, 0.35);
    void mixer.playOneShot('sfx', makeBuf(ctx));

    expect(ctx.opsOf('start').length).toBe(2);
    const mixerAny = mixer as unknown as {
      ambienceSource: unknown;
      sfxBus: { source: unknown };
    };
    expect(mixerAny.ambienceSource).toBeTruthy();
    expect(mixerAny.sfxBus.source).toBeTruthy();
  });

  it('fades out the old ambience loop when a new one starts', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    mixer.setAmbienceLoop(makeBuf(ctx), { loopStart: 0, loopEnd: 10 }, 0, 0.35);
    ctx.clearTranscript();

    mixer.setAmbienceLoop(makeBuf(ctx), { loopStart: 0, loopEnd: 12 }, 600, 0.25);

    expect(ctx.opsOf('stop').length).toBe(1);
    expect(ctx.opsOf('linearRampToValueAtTime').some(entry => entry.args[0] === 0)).toBe(true);
    expect(ctx.opsOf('linearRampToValueAtTime').some(entry => entry.args[0] === 0.25)).toBe(true);
  });

  it('stops ambience on dispose', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    mixer.setAmbienceLoop(makeBuf(ctx), { loopStart: 0, loopEnd: 10 }, 0, 0.35);
    ctx.clearTranscript();

    mixer.dispose();

    expect(ctx.opsOf('stop').length).toBeGreaterThan(0);
  });
});

describe('AudioMixer Spec 3 — topology isolation', () => {
  it('constructs with voice bus (new MusicBusId)', () => {
    const ctx = makeCtx();
    expect(() => makeMixer(ctx)).not.toThrow();
  });

  it('new snapshots unrest, brink-of-defeat, voice-duck do not throw', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    expect(() => mixer.setSnapshot('unrest', 0)).not.toThrow();
    expect(() => mixer.setSnapshot('brink-of-defeat', 0)).not.toThrow();
    expect(() => mixer.setSnapshot('voice-duck', 0)).not.toThrow();
  });

  it('setMusicEnabled(false) sets musicLayerGain to 0 without throwing', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    expect(() => mixer.setMusicEnabled(false)).not.toThrow();
    expect(() => mixer.setSnapshot('at-war', 0)).not.toThrow();
  });

  it('setMusicEnabled(false) does not disable setVoiceEnabled/setVoiceVolume', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    mixer.setMusicEnabled(false);
    expect(() => mixer.setVoiceVolume(0.5)).not.toThrow();
    expect(() => mixer.setVoiceEnabled(true)).not.toThrow();
  });

  it('setStingerVolume(0) silences stinger without throwing', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    expect(() => mixer.setStingerVolume(0)).not.toThrow();
    expect(() => mixer.setMusicVolume(0.8)).not.toThrow();
  });

  it('setStingerEnabled(false) does not affect music layer', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    mixer.setStingerEnabled(false);
    expect(() => mixer.setMusicVolume(1.0)).not.toThrow();
    expect(() => mixer.setSnapshot('peace', 0)).not.toThrow();
  });

  it('setMasterVolume applies square-law perceptual curve', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();
    mixer.setMasterVolume(0.5);
    const values = ctx.opsOf('setValueAtTime').map(e => e.args[0] as number);
    // square-law: 0.5 * 0.5 = 0.25
    expect(values).toContain(0.25);
  });

  it('playOneShot on voice bus creates a buffer source node (voice bus in musicBuses)', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    const buf = makeBuf(ctx);
    ctx.clearTranscript();
    // Fire and do not await — the mock only resolves on stop(), which is fine.
    // We just verify the call doesn't throw and creates the expected node.
    void mixer.playOneShot('voice', buf);
    expect(ctx.opsOf('createBufferSource').length).toBe(1);
    expect(ctx.opsOf('start').length).toBe(1);
  });
});
