import type { AudioMixer } from './audio-mixer';
import type { AudioLoader } from './audio-loader';
import { TRANSPORT_SFX } from './sfx-catalog';

let audioContext: AudioContext | null = null;
let sfxDestination: AudioNode | null = null;
let _mixer: AudioMixer | null = null;
let _loader: AudioLoader | null = null;

export function routeSfxThrough(node: AudioNode): void {
  sfxDestination = node;
  audioContext = node.context as AudioContext;
}

/**
 * Wire OGG-backed load/unload sounds. Call from AudioSystem.start() after
 * the mixer and loader are initialised so real files play instead of oscillator fallbacks.
 */
export function routeSfxComponents(mixer: AudioMixer, loader: AudioLoader): void {
  _mixer = mixer;
  _loader = loader;
}

function getContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function playTone(frequency: number, duration: number, volume: number, type: OscillatorType = 'sine'): void {
  try {
    const ctx = getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(sfxDestination ?? ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio context may not be available
  }
}

export const SFX = {
  tap: () => playTone(800, 0.05, 0.15),
  select: () => playTone(600, 0.08, 0.2, 'triangle'),
  endTurn: () => {
    playTone(523, 0.1, 0.15);
    setTimeout(() => playTone(659, 0.1, 0.15), 100);
    setTimeout(() => playTone(784, 0.15, 0.15), 200);
  },
  foundCity: () => {
    playTone(523, 0.15, 0.2);
    setTimeout(() => playTone(659, 0.15, 0.2), 150);
    setTimeout(() => playTone(784, 0.2, 0.25), 300);
    setTimeout(() => playTone(1047, 0.3, 0.2), 450);
  },
  combat: () => {
    playTone(200, 0.1, 0.3, 'sawtooth');
    setTimeout(() => playTone(150, 0.15, 0.25, 'sawtooth'), 100);
  },
  research: () => {
    playTone(880, 0.1, 0.15);
    setTimeout(() => playTone(1100, 0.1, 0.15), 80);
    setTimeout(() => playTone(1320, 0.2, 0.2), 160);
  },
  notification: () => playTone(700, 0.1, 0.1, 'triangle'),
  error: () => playTone(200, 0.2, 0.15, 'square'),
  transportLoad: () => {
    if (_loader && _mixer) {
      void _loader.get(TRANSPORT_SFX.load.file)
        .then(buf => _mixer!.playOneShot('sfx', buf));
    } else {
      playTone(330, 0.08, 0.12, 'triangle');
      setTimeout(() => playTone(440, 0.1, 0.12, 'triangle'), 80);
    }
  },
  transportUnload: () => {
    if (_loader && _mixer) {
      void _loader.get(TRANSPORT_SFX.unload.file)
        .then(buf => _mixer!.playOneShot('sfx', buf));
    } else {
      playTone(440, 0.08, 0.12, 'triangle');
      setTimeout(() => playTone(330, 0.1, 0.12, 'triangle'), 80);
    }
  },

  seaHorn: () => {
    try {
      const ctx = getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(55, now);
      osc.frequency.linearRampToValueAtTime(45, now + 1.2);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.2);
      gain.gain.setValueAtTime(0.5, now + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      osc.connect(gain);
      gain.connect(sfxDestination ?? ctx.destination);
      osc.start(now);
      osc.stop(now + 1.5);
    } catch { /* audio unavailable */ }
  },

  piratePlunder: () => {
    try {
      const ctx = getContext();
      const now = ctx.currentTime;
      // White noise burst (impact)
      const bufferSize = Math.floor(ctx.sampleRate * 0.08);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let noiseSeed = 42;
      for (let i = 0; i < bufferSize; i++) {
        noiseSeed = (noiseSeed * 1664525 + 1013904223) & 0xffffffff;
        data[i] = (noiseSeed / 0x80000000) - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.7, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      noise.connect(noiseGain);
      noiseGain.connect(sfxDestination ?? ctx.destination);
      noise.start(now);

      // Rising sine sweep
      const sweep = ctx.createOscillator();
      const sweepGain = ctx.createGain();
      sweep.type = 'sine';
      sweep.frequency.setValueAtTime(200, now + 0.08);
      sweep.frequency.linearRampToValueAtTime(800, now + 0.4);
      sweepGain.gain.setValueAtTime(0.3, now + 0.08);
      sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      sweep.connect(sweepGain);
      sweepGain.connect(sfxDestination ?? ctx.destination);
      sweep.start(now + 0.08);
      sweep.stop(now + 0.5);
    } catch { /* audio unavailable */ }
  },

  pirateDestroyed: () => {
    try {
      const ctx = getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.5);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gain);
      gain.connect(sfxDestination ?? ctx.destination);
      osc.start(now);
      osc.stop(now + 0.6);
    } catch { /* audio unavailable */ }
  },

  barbarianResurgence: () => {
    try {
      const ctx = getContext();
      const now = ctx.currentTime;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, now);
      filter.connect(sfxDestination ?? ctx.destination);

      for (const [freq, detune] of [[80, 0], [120, 3]] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.setValueAtTime(detune, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.6, now + 0.3);
        gain.gain.setValueAtTime(0.6, now + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
        osc.connect(gain);
        gain.connect(filter);
        osc.start(now);
        osc.stop(now + 1.3);
      }
    } catch { /* audio unavailable */ }
  },
};
