# Crisis and loss stingers (#616)

Six original Conquestoria cues live in `public/audio/stinger/crisis/`. Their source is
the deterministic oscillator, resonance, and seeded-noise arrangements in
`scripts/generate-crisis-stingers.py`. The generator uses Python 3 and FFmpeg with
libvorbis (FFmpeg 8.0.1 for the shipped files). There are no recordings, downloads, third-party assets, or third-party
attributions. Run `python3 scripts/generate-crisis-stingers.py` from the repository.

The generator renders mono 44.1 kHz PCM, softens peaks, sets gain from the measured
source loudness and true peak, strips source metadata, and encodes Ogg Vorbis.
It measures the encoded files and rejects any cue outside −14 ±1 LUFS or above
−1 dBTP. The generated files carry only the encoder identification.

| Cue | Sound design | Seconds | LUFS | dBTP | Shipped SHA-256 |
| --- | --- | ---: | ---: | ---: | --- |
| Outbreak onset | Uneven hollow taps with a low tremor | 1.18 | −13.99 | −1.43 | `68e87adb0f635614514e216498aecf693f03d09f8bbda3c4c09e6a38867dffa0` |
| Outbreak resolution | Soft notes open into a restrained chord | 1.34 | −13.95 | −4.19 | `b5d7388d6f0cfa301e18da7d4d06017964d8ffa1f4d9cd08af2184a88417a68e` |
| Catastrophe onset | One falling impact with scattered debris | 1.12 | −14.05 | −2.18 | `fac565d82d7f6d7c543a46b0d0c3cde0dde4a20ad1692468089b71d58afbddce` |
| Catastrophe resolution | Measured knocks settle into a low foundation | 1.42 | −13.94 | −2.49 | `072f2c801d35d7dfa8fd991ade17e159aa2e270462a96effa3a7f8cb6915c089` |
| Hunt onset | Two low footfalls followed by a descending growl | 1.28 | −14.00 | −4.29 | `e30653d74364dc13abc4bd06b54f4328d7f32cacfc0745b830781dc0d917cb1f` |
| Hunt resolution | Grounded strike and a short rising answer | 1.19 | −13.99 | −3.16 | `8f746e24bf9709844ded94a79caf097ed5f0c6cb687cb6566e1550dc51545b88` |
| City lost | Low strike followed by a falling resonance | 1.08 | −13.99 | −1.55 | `9856fa0e74cdbc6b27b3075edce7f754749b94e77902738e6cd2537550342acd` |
| Wonder lost | Three descending bronze tones | 1.38 | −13.96 | −4.58 | `a2131c017c039bb00dca6796116922ec942b4bd9a8e976866ce2371cae5bc5cd` |
| Near defeat | Three pulses ending on an unresolved interval | 1.26 | −13.96 | −7.39 | `dd2672e9ab16a2e91ac4d1911258d3354a638b7b8bcf3a950a508d751c4afc7b` |

The three loss cues live in `public/audio/stinger/loss/` and use the same
generator and validation. Wonder loss replaces its owner's toast chime.
City capture cues the previous owner, and near defeat cues the affected
civilization after the adaptive music state updates. All three use the same
viewer checks, handoff handling, and per-turn coalescing as the crisis cues.

The notification route uses the event's crisis flavor definition for onset and
resolution. A Hunt onset uses the named `menacing` announcement and the active
crisis's flavor. Only qualifying positive outcomes select resolution stingers.
The toast plays the cue instead of the ordinary chime. Famine uses its existing
toast cues. The crisis bus listeners update the current viewer's music layer.

The first audible cue of each kind for a viewer and turn can play. Toast display
paces the cues, and the audio system ignores repeats of a cue within the turn.
Queued toasts are checked against the current viewer and presentation gate. An
in-flight decode also rechecks those conditions, and the handoff stops the
stinger bus. A failed load uses the existing silent buffer.

The measurements above establish file format and level. No in-game listening
review was performed. Recognizability and balance during play remain unmeasured.
