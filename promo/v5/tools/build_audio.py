"""Build the V5 music edit, the narration track and a soft synthesized UI sound kit.

Run from promo/v5: python3 tools/build_audio.py
Inputs (promo/media): v5/clair.wav (Debussy, Suite bergamasque III "Clair de lune", Laurens Goedhart, piano,
2011; Wikimedia Commons, public domain; decoded from media/v5/clair-de-lune-goedhart.ogg), s1..s4.m4a
(supplied voice-over).
Outputs (promo/v5/audio): music.wav, voice.wav, sfx/*.wav. All 48 kHz stereo.

Music clock (seconds). Three pieces of one recording, joined only where the pianist breathes, so no splice
cuts through a sounding chord, and no time-stretch anywhere:
  A  recording 0.00-23.95  -> film 0.00-23.95, the opening theme under the hook. Its phrase ends in a
     near-silent breath at 23.4-23.8 s (-48 dBFS); A fades over its last 0.6 s.
  B  recording 96.50-160.70 -> film 24.30-88.50, "Un poco mosso": the flowing arpeggios begin at 96.50 after
     four seconds of near silence (-50 dBFS), so the product reveal (film 24.3) starts a new paragraph. B ends
     in the breath at 160.2-160.8 s, fading over 0.6 s, as the narration's last word ends (film 88.8).
  C  recording 294.30-end  -> film 87.89-, the decaying coda (-40 to -46 dBFS) leads into the piece's final
     chord, which lands at recording 295.88 = film 89.47 under the end card. Starting C in that decay rather than
     on the chord fills what was a 0.9 s dead silence (below -60 dBFS) between B's end and the chord.
The constants are the film's audio clock; spec.js does not depend on them except FINAL (the end card hit).
"""
import os, subprocess, numpy as np, wave
SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
FILM = os.path.dirname(HERE)
MEDIA = os.path.join(FILM, '..', 'media')
OUT = os.path.join(FILM, 'audio')
os.makedirs(os.path.join(OUT, 'sfx'), exist_ok=True)

VO = ['s1.m4a', 's2.m4a', 's3.m4a', 's4.m4a']
VO_START = 1.5           # the four narration files play back to back, in order, from here
DUR = 96.0
# (recording start, recording end, film start, fade-in s, fade-out s)
PIECES = [(0.00, 23.95, 0.00, 0.0, .6), (96.50, 160.70, 24.30, .02, .6), (294.30, 304.0, 87.89, .4, 0.0)]

def decode(p):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()

def save(p, x):
    x = np.clip(x, -1, 1)
    with wave.open(p, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())

N = int(DUR * SR)
src = decode(os.path.join(MEDIA, 'v5', 'clair.wav'))
music = np.zeros((N, 2), np.float32)
for r0, r1, f0, fi, fo in PIECES:
    seg = src[int(r0 * SR):int(r1 * SR)].copy()
    n = len(seg)
    g = np.ones(n, np.float32)
    if fi: k = int(fi * SR); g[:k] *= np.sin(np.linspace(0, np.pi / 2, k)) ** 2
    if fo: k = int(fo * SR); g[-k:] *= np.cos(np.linspace(0, np.pi / 2, k)) ** 2
    s = int(f0 * SR); e = min(N, s + n)
    music[s:e] += (seg * g[:, None])[:e - s]
# the last piece runs past DUR: a 1.5 s fade so the file never ends on a cut-off ring
k = int(1.5 * SR); music[-k:] *= (np.cos(np.linspace(0, np.pi / 2, k)) ** 2)[:, None]
save(os.path.join(OUT, 'music.wav'), music)

voice = np.zeros((N, 2), np.float32); t = VO_START; starts = []
for f in VO:
    x = decode(os.path.join(MEDIA, f)); i = int(round(t * SR))
    voice[i:i + len(x)] += x[:N - i]; starts.append(round(t, 3)); t += len(x) / SR
save(os.path.join(OUT, 'voice.wav'), voice)
print('voice starts', starts, 'ends', round(t, 3))

# ---- soft UI kit: air, glass and felt rather than impacts. Deterministic (fixed seed). ----
rng = np.random.default_rng(11)
def st(m, w=.5):
    d = int(.0006 * SR); r = np.r_[np.zeros(d), m[:-d]]
    return np.stack([m, (1 - w) * m + w * r], 1).astype(np.float32)
def bp(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X[(f < lo) | (f > hi)] = 0; return np.fft.irfft(X, len(x))
def norm(x, db=-1): return x / (np.abs(x).max() + 1e-9) * 10 ** (db / 20)
def air(dur, f0, f1, peak=.55, width=.24):
    """A slow band of noise moving from f0 to f1 Hz: the sound of a large card gliding past."""
    n = int(dur * SR); x = rng.normal(0, 1, n); out = np.zeros(n); hop = 1024
    for i in range(0, n, hop):
        u = i / n; fc = f0 * (f1 / f0) ** u; seg = x[max(0, i - 2048): i + hop + 2048]
        y = bp(seg, fc * .6, fc * 1.4); o = i - max(0, i - 2048); out[i:i + hop] = y[o:o + hop][:len(out[i:i + hop])]
    t = np.arange(n) / n
    return out * np.exp(-((t - peak) / width) ** 2)
kit = {}
kit['glide'] = st(norm(air(1.1, 300, 1400)))
kit['glide_down'] = st(norm(air(1.0, 1500, 350)))
n = int(.18 * SR); tt = np.arange(n) / SR
kit['tap'] = st(norm(bp(rng.normal(0, 1, n), 2500, 9000) * np.exp(-tt * 260) + .7 * np.sin(2 * np.pi * 1180 * tt) * np.exp(-tt * 70)), .2)
n = int(.6 * SR); tt = np.arange(n) / SR
kit['bloom'] = st(norm(sum(a * np.sin(2 * np.pi * f * tt) * np.exp(-tt * k) for a, f, k in [(1, 880, 6), (.5, 1320, 8), (.3, 1760, 11)]) * np.minimum(1, tt / .004)))
n = int(.12 * SR); tt = np.arange(n) / SR
kit['click'] = st(norm(bp(rng.normal(0, 1, n), 1800, 7000) * np.exp(-tt * 400) + .6 * np.sin(2 * np.pi * 420 * tt) * np.exp(-tt * 90)), .2)
n = int(3.5 * SR); tt = np.arange(n) / SR
kit['chime'] = st(norm(sum(a * np.sin(2 * np.pi * f * tt + i) * np.exp(-tt * k) for i, (a, f, k) in enumerate([(1, 659.3, 1.2), (.6, 987.8, 1.6), (.4, 1318.5, 2.1), (.25, 1975.5, 2.8)])) * np.minimum(1, tt / .006)))
n = int(1.6 * SR); tt = np.arange(n) / SR
kit['swell'] = st(norm(bp(rng.normal(0, 1, n), 200, 2400) * (tt / tt[-1]) ** 2 * np.exp(-((tt - 1.35) / .3) ** 2 * 0)))
for k, x in kit.items(): save(os.path.join(OUT, 'sfx', k + '.wav'), x)
print('sfx', len(kit), 'files')
