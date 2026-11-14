"""Render the original #616 crisis and loss cues from oscillators and filtered noise.

Run with Python 3 and FFmpeg (libvorbis). No recordings or network inputs.
"""
import array
import json
import math
from pathlib import Path
import random
import re
import subprocess
import sys
import tempfile
import wave


RATE = 44100
DEST = Path(__file__).resolve().parents[1] / "public/audio/stinger/crisis"
LOSS_DEST = DEST.with_name("loss")
TAU = math.tau


class Cue:
    def __init__(self, duration, seed):
        self.samples = [0.0] * round(duration * RATE)
        self.rng = random.Random(seed)

    def voice(self, start, duration, level, attack, fall, sound):
        at = round(start * RATE)
        for i in range(min(round(duration * RATE), len(self.samples) - at)):
            t = i / RATE
            fade = min(1.0, t / attack, (duration - t) / min(0.05, duration / 3))
            self.samples[at + i] += level * fade * math.exp(-t / fall) * sound(t)

    def modal(self, start, pitch, level, duration, attack, fall, modes):
        def sound(t):
            return sum(weight * math.exp(-t / decay) * math.sin(TAU * pitch * ratio * t)
                       for ratio, weight, decay in modes)
        self.voice(start, duration, level, attack, fall, sound)

    def noise(self, start, duration, level, attack, fall, low, high):
        slow = fast = 0.0
        slow_mix = 1 - math.exp(-TAU * low / RATE)
        fast_mix = 1 - math.exp(-TAU * high / RATE)

        def sound(_):
            nonlocal slow, fast
            draw = self.rng.uniform(-1, 1)
            slow += slow_mix * (draw - slow)
            fast += fast_mix * (draw - fast)
            return fast - slow
        self.voice(start, duration, level, attack, fall, sound)


def arrange():
    outbreak = Cue(1.18, 6161)
    for start, pitch, level in [(0.012, 173, 0.65), (0.19, 151, 0.83), (0.51, 158, 0.66)]:
        outbreak.modal(start, pitch, level, 0.49, 0.018, 0.24,
                       [(1, 0.6, 0.4), (1.47, 0.35, 0.18), (2.81, 0.22, 0.07)])
        outbreak.noise(start, 0.26, 0.68, 0.023, 0.105, 180, 1300)
    outbreak.voice(0.05, 1.1, 0.19, 0.12, 0.75,
                   lambda t: math.sin(TAU * (113 * t - 5 * t * t)) * (0.6 + 0.4 * math.sin(TAU * 7 * t)))

    containment = Cue(1.34, 6162)
    for start, pitch, level in [(0.01, 293.66, 0.60), (0.19, 349.23, 0.55), (0.41, 440, 0.52)]:
        containment.modal(start, pitch, level, 0.85, 0.042, 0.46,
                          [(1, 0.95, 0.54), (2, 0.32, 0.21), (3.02, 0.14, 0.14)])
    containment.noise(0.015, 0.84, 0.21, 0.12, 0.38, 450, 2300)

    impact = Cue(1.12, 6163)
    impact.voice(0.01, 0.99, 0.85, 0.026, 0.44,
                 lambda t: math.sin(TAU * (46 * t + 19 * (1 - math.exp(-8 * t)))))
    impact.noise(0.005, 0.95, 1.85, 0.015, 0.32, 110, 2800)
    for start, pitch in [(0.07, 253), (0.16, 311), (0.23, 227), (0.34, 193)]:
        impact.modal(start, pitch, 0.37, 0.30, 0.01, 0.12,
                     [(1, 0.7, 0.24), (2.37, 0.4, 0.08), (4.03, 0.22, 0.06)])
    impact.noise(0.27, 0.81, 0.60, 0.07, 0.35, 90, 780)

    rebuilding = Cue(1.42, 6164)
    for start, pitch in [(0.01, 220), (0.27, 329.63), (0.56, 277.18)]:
        rebuilding.modal(start, pitch, 0.69, 0.73, 0.014, 0.35,
                         [(1, 0.67, 0.5), (2.01, 0.39, 0.27), (3.97, 0.27, 0.12)])
        rebuilding.noise(start, 0.23, 0.33, 0.012, 0.07, 320, 3100)
    rebuilding.modal(0.53, 110, 0.40, 0.86, 0.035, 0.54, [(1, 1, 0.8), (3, 0.2, 0.27)])

    stalk = Cue(1.28, 6165)
    for start, pitch in [(0.006, 102), (0.22, 82)]:
        stalk.modal(start, pitch, 0.84, 0.43, 0.02, 0.20,
                    [(1, 0.92, 0.54), (1.68, 0.54, 0.21), (3.4, 0.27, 0.08)])
        stalk.noise(start, 0.34, 0.54, 0.012, 0.13, 110, 1700)
    stalk.voice(0.38, 0.86, 0.65, 0.08, 0.59,
                lambda t: math.sin(TAU * (122 * t - 26 * t * t) + 1.8 * math.sin(TAU * 32 * t)))
    stalk.noise(0.45, 0.77, 0.81, 0.085, 0.40, 210, 1280)

    quarry = Cue(1.19, 6166)
    quarry.modal(0.008, 113, 0.8, 0.42, 0.013, 0.19,
                 [(1, 0.9, 0.39), (1.82, 0.43, 0.19)])
    quarry.noise(0.008, 0.36, 0.72, 0.016, 0.12, 170, 3100)
    for start, pitch in [(0.14, 261.63), (0.33, 392), (0.46, 523.25)]:
        quarry.modal(start, pitch, 0.61, 0.72, 0.019, 0.36,
                     [(1, 0.79, 0.48), (2.0, 0.42, 0.25), (2.99, 0.32, 0.14)])
    return {
        "outbreak-onset": outbreak,
        "outbreak-resolved": containment,
        "catastrophe-onset": impact,
        "catastrophe-resolved": rebuilding,
        "hunt-onset": stalk,
        "hunt-resolved": quarry,
    }


def arrange_loss_cues():
    city = Cue(1.08, 6167)
    city.modal(0.01, 116, 1.05, 0.67, 0.022, 0.26,
               [(1, 0.85, 0.5), (1.58, 0.36, 0.18), (2.44, 0.21, 0.09)])
    city.noise(0.015, 0.30, 0.78, 0.02, 0.11, 170, 1900)
    city.modal(0.32, 87, 0.65, 0.72, 0.046, 0.36,
               [(1, 1, 0.6), (2.14, 0.35, 0.22)])

    wonder = Cue(1.38, 6168)
    bronze_modes = [(1, 0.82, 0.68), (2.74, 0.30, 0.23), (4.08, 0.13, 0.14)]
    for start, pitch, level in [(0.008, 392, 0.69), (0.21, 349.23, 0.58), (0.46, 261.63, 0.62)]:
        wonder.modal(start, pitch, level, 0.91, 0.027, 0.43, bronze_modes)
    wonder.modal(0.48, 130.81, 0.28, 0.87, 0.08, 0.51, [(1, 1, 0.6), (2, 0.25, 0.28)])

    brink = Cue(1.26, 6169)
    for start, length in [(0.01, 0.33), (0.39, 0.29), (0.73, 0.50)]:
        brink.voice(start, length, 0.86, 0.036, 0.4,
                    lambda t: math.sin(TAU * (146 * t - 8 * t * t)
                                       + 0.9 * math.sin(TAU * 293 * t)))
        brink.noise(start, length, 0.33, 0.046, 0.2, 235, 1600)
    brink.modal(0.72, 155.56, 0.24, 0.52, 0.08, 0.33, [(1, 1, 0.6), (2, 0.24, 0.2)])
    return {"city-lost": city, "wonder-lost": wonder, "near-defeat": brink}


def measure(path):
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(path), "-af",
         "loudnorm=I=-14:TP=-1:LRA=7:print_format=json", "-f", "null", "-"],
        check=True, capture_output=True, text=True,
    )
    data = json.loads(re.findall(r"\{[^{}]+\}", result.stderr)[-1])
    return float(data["input_i"]), float(data["input_tp"])


def render(name, cue, pcm, dest):
    # Rounded saturation softens the earliest impacts without hard clipping.
    samples = array.array("h", (round(25000 * math.tanh(1.7 * sample)) for sample in cue.samples))
    if sys.byteorder != "little":
        samples.byteswap()
    with wave.open(str(pcm), "wb") as output:
        output.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        output.writeframes(samples)
    loudness, peak = measure(pcm)
    gain = min(-14 - loudness, -1.5 - peak)
    path = dest / f"{name}.ogg"
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(pcm),
         "-af", f"volume={gain:.3f}dB", "-map_metadata", "-1", "-ac", "1",
         "-ar", str(RATE), "-c:a", "libvorbis", "-q:a", "5", "-fflags", "+bitexact", str(path)],
        check=True,
    )
    loudness, peak = measure(path)
    print(f"{name:24} {len(samples) / RATE:.2f}s  {loudness:6.2f} LUFS  {peak:6.2f} dBTP")
    if abs(loudness + 14) > 1 or peak > -1:
        raise RuntimeError(f"{name} falls outside the loudness or true-peak limit")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as temp:
        for dest, cues in ((DEST, arrange()), (LOSS_DEST, arrange_loss_cues())):
            dest.mkdir(parents=True, exist_ok=True)
            for name, cue in cues.items():
                render(name, cue, Path(temp) / "source.wav", dest)
