import { describe, expect, it, vi } from 'vitest';
import type { AudioLoader } from '@/audio/audio-loader';
import type { AudioMixer } from '@/audio/audio-mixer';
import { routeSfxComponents, SFX } from '@/audio/sfx';

describe('legacy SFX presentation routing', () => {
  it('exposes dedicated cues for air operations', () => {
    expect(SFX.airRebase).toBeTypeOf('function');
    expect(SFX.airScramble).toBeTypeOf('function');
    expect(SFX.airRecon).toBeTypeOf('function');
    expect(SFX.airBaseLoss).toBeTypeOf('function');
  });

  it('blocks OGG-backed cues before load and rechecks suppression after decode', async () => {
    let suppressed = true;
    let resolveBuffer!: (buffer: AudioBuffer) => void;
    const loader = {
      get: vi.fn(() => new Promise<AudioBuffer>(resolve => {
        resolveBuffer = resolve;
      })),
    } as unknown as AudioLoader;
    const mixer = {
      playOneShot: vi.fn(),
    } as unknown as AudioMixer;
    routeSfxComponents(mixer, loader, () => suppressed);

    SFX.transportLoad();
    expect(loader.get).not.toHaveBeenCalled();

    suppressed = false;
    SFX.transportLoad();
    expect(loader.get).toHaveBeenCalledOnce();
    suppressed = true;
    resolveBuffer({} as AudioBuffer);
    await Promise.resolve();
    await Promise.resolve();

    expect(mixer.playOneShot).not.toHaveBeenCalled();
  });
});
