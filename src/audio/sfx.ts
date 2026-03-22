let audioContext: AudioContext | null = null;

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
    gain.connect(ctx.destination);
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
};
