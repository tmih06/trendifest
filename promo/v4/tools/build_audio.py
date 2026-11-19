"""Build the V4 music edit, the narration track and the synthesized SFX kit.

Run from promo/: python3 v4/tools/build_audio.py
Inputs (promo/media): vivaldi.wav (Musopen / Modena Chamber Orchestra, Vivaldi
"Summer" RV 315 III. Presto, public domain mark), s1..s4.m4a (supplied voice-over).
Outputs (promo/v4/audio): music.wav, voice.wav, sfx/*.wav. All 48 kHz stereo.

The constants below are the film's audio clock; spec.js mirrors them (VO, SPLICE,
FINAL). Change them together.
"""
import os, subprocess, numpy as np, wave
SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
FILM = os.path.dirname(HERE)
MEDIA = os.path.join(FILM, '..', 'media')
OUT = os.path.join(FILM, 'audio')
os.makedirs(os.path.join(OUT, 'sfx'), exist_ok=True)

# Narration files play back to back, in order, from VO_START seconds.
VO = ['s1.m4a', 's2.m4a', 's3.m4a', 's4.m4a']
VO_START = 1.5
# Music clock: film t maps to recording t + A before SPLICE and t + B after.
# A puts the first orchestral attack (1.34 s in the recording) at film 0.30 s.
# B puts the final chord (172.86 s) on the spoken TRENDIFEST at film 89.47 s.
# SPLICE was chosen by chroma + onset-flux similarity (tools/splice search, 1.2 s windows).
A, B, SPLICE = 1.04, 83.39, 78.70
DUR = 96.1

def decode(p):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()

def save(p, x):
    x = np.clip(x, -1, 1)
    with wave.open(p, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())

N = int(DUR * SR)
# ---- music: two segments joined with a 40 ms equal-power crossfade ----
v = decode(os.path.join(MEDIA, 'vivaldi.wav'))
music = np.zeros((N, 2), np.float32)
xf = int(.04 * SR); s = int(SPLICE * SR)
seg1 = v[int(A * SR): int(A * SR) + s + xf]
seg2 = v[int((SPLICE + B) * SR) - xf:]
music[:len(seg1)] = seg1[:N]
ramp = np.sin(np.linspace(0, np.pi / 2, xf))[:, None]
music[s:s + xf] = seg1[s:s + xf] * ramp[::-1] + seg2[:xf] * ramp
tail = seg2[xf:xf + N - s - xf]
music[s + xf:s + xf + len(tail)] = tail
save(os.path.join(OUT, 'music.wav'), music)

# ---- voice: contiguous, in the supplied order ----
voice = np.zeros((N, 2), np.float32); t = VO_START; starts = []
for f in VO:
    x = decode(os.path.join(MEDIA, f)); i = int(round(t * SR))
    voice[i:i + len(x)] += x[:N - i]; starts.append(round(t, 3)); t += len(x) / SR
save(os.path.join(OUT, 'voice.wav'), voice)
print('voice starts', starts, 'ends', round(t, 3))

# ---- SFX: synthesized, deterministic. Tuned low to G (the music's key) so hits sit under the orchestra ----
rng = np.random.default_rng(7)
def st(m, w=.6):
    """Mono to a slightly decorrelated stereo pair."""
    d = int(.0007 * SR); r = np.r_[np.zeros(d), m[:-d]]
    return np.stack([m, (1 - w) * m + w * r], 1).astype(np.float32)
def env(n, a, d, curve=4):
    t = np.arange(n) / SR; e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-curve * np.maximum(0, t - a) / max(d, 1e-4)); return e
def bp(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X[(f < lo) | (f > hi)] = 0; return np.fft.irfft(X, len(x))
def sweep_noise(dur, f0, f1, q=.35, peak=.5):
    """Noise through a moving band: an air whoosh whose band follows the pass."""
    n = int(dur * SR); x = rng.normal(0, 1, n); out = np.zeros(n); hop = 512
    for i in range(0, n, hop):
        u = i / n; fc = f0 * (f1 / f0) ** u; seg = x[max(0, i - 1024): i + hop + 1024]
        y = bp(seg, fc * (1 - q), fc * (1 + q)); o = i - max(0, i - 1024); out[i:i + hop] = y[o:o + hop][:len(out[i:i + hop])]
    t = np.arange(n) / n; e = np.exp(-((t - peak) / .2) ** 2)
    return out * e
def boom(dur, f0, f1, k=5, click=.4):
    n = int(dur * SR); t = np.arange(n) / SR; f = f1 + (f0 - f1) * np.exp(-t * 18)
    ph = 2 * np.pi * np.cumsum(f) / SR; b = np.sin(ph) * np.exp(-t * k)
    c = bp(rng.normal(0, 1, n), 800, 6000) * np.exp(-t * 90) * click
    return b + c
def norm(x, db=-1): return x / (np.abs(x).max() + 1e-9) * 10 ** (db / 20)
kit = {}
kit['whoosh_1'] = st(norm(sweep_noise(.7, 400, 3200, peak=.55)))
kit['whoosh_2'] = st(norm(sweep_noise(.65, 2600, 500, peak=.5)))
wb = sweep_noise(1.3, 180, 1800, q=.5, peak=.6) + .6 * np.sin(2 * np.pi * np.cumsum(np.linspace(40, 90, int(1.3 * SR))) / SR) * np.exp(-((np.arange(int(1.3 * SR)) / SR - .78) / .22) ** 2)
kit['whoosh_big'] = st(norm(wb))
kit['impact'] = st(norm(boom(1.2, 160, 49, 5) + .3 * bp(rng.normal(0, 1, int(1.2 * SR)), 2000, 9000) * env(int(1.2 * SR), .001, .05, 3)))
ib = boom(2.6, 120, 49, 2.2, .6) + .5 * boom(2.6, 240, 98, 4, 0) + .25 * bp(rng.normal(0, 1, int(2.6 * SR)), 300, 3000) * env(int(2.6 * SR), .002, .5, 3)
kit['impact_big'] = st(norm(ib))
kit['hit'] = st(norm(boom(.5, 220, 98, 12, 1.2) + .6 * bp(rng.normal(0, 1, int(.5 * SR)), 1500, 8000) * env(int(.5 * SR), .001, .04, 4)))
kit['slash'] = st(norm(sweep_noise(.5, 6000, 1800, q=.25, peak=.25)))
for i in (1, 2):
    n = int(.12 * SR); k = bp(rng.normal(0, 1, n), 1800 + 600 * i, 7000) * env(n, .0005, .012, 4) + .4 * np.sin(2 * np.pi * (380 + 60 * i) * np.arange(n) / SR) * env(n, .0005, .02, 4)
    kit[f'key_{i}'] = st(norm(k), .2)
n = int(.25 * SR); tt = np.arange(n) / SR
kit['pop'] = st(norm(np.sin(2 * np.pi * (520 + 900 * np.exp(-tt * 40)) * tt) * env(n, .002, .05, 4)), .2)
n = int(.2 * SR); tt = np.arange(n) / SR
kit['tick'] = st(norm(np.sin(2 * np.pi * 2350 * tt) * env(n, .0005, .02, 5) + .3 * bp(rng.normal(0, 1, n), 4000, 12000) * env(n, .0003, .006, 4)), .2)
n = int(2.4 * SR); tt = np.arange(n) / SR; r = bp(rng.normal(0, 1, n), 2000, 12000) * (tt / tt[-1]) ** 3
r += .5 * np.sin(2 * np.pi * np.cumsum(196 * 2 ** (2 * tt / tt[-1])) / SR) * (tt / tt[-1]) ** 2
kit['riser'] = st(norm(r)); kit['suck'] = kit['riser']
n = int(.5 * SR); g = rng.normal(0, 1, n) * (rng.random(n // 400 + 1).repeat(400)[:n] > .5) * env(n, .001, .2, 2)
kit['glitch'] = st(norm(bp(g, 600, 9000)))
n = int(4.5 * SR); tt = np.arange(n) / SR
lh = boom(4.5, 110, 49, 1.1, .5) + .35 * np.sin(2 * np.pi * 98 * tt) * np.exp(-tt * 1.2) + .12 * bp(rng.normal(0, 1, n), 3000, 12000) * np.exp(-tt * 1.6)
kit['logo_hit'] = st(norm(lh))
n = int(.9 * SR); tt = np.arange(n) / SR
sp = sum(np.sin(2 * np.pi * f * tt + i) * np.exp(-tt * (5 + i)) for i, f in enumerate([1568, 2349, 3136, 3951]))
kit['sparkle'] = st(norm(sp * env(n, .003, .3, 2)))
n = int(.35 * SR); tt = np.arange(n) / SR
kit['click'] = st(norm(bp(rng.normal(0, 1, n), 1500, 9000) * env(n, .0004, .01, 4) + .8 * np.sin(2 * np.pi * 150 * tt) * np.exp(-tt * 30)), .2)
for k, x in kit.items(): save(os.path.join(OUT, 'sfx', k + '.wav'), x)
print('sfx', len(kit), 'files')
