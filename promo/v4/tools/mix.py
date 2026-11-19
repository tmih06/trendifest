"""Mix the V4 soundtrack: narration on top, the Vivaldi bed ducked under it, and the film's own SFX cues.

Usage (from promo/v4): python3 tools/mix.py [--out out/mix.wav] [--lufs -14]
Needs the film served for info.mjs (this script serves it itself) and the outputs of build_audio.py.

Why not the skill's mix.py: that mixer has no voice track. This one keeps its cue placement rules (the MAP
table and alignment on onset / peak / end) and adds:
  * a voice-keyed duck: the bed falls by DUCK_DB while the narrator speaks (30 ms attack, 400 ms release),
  * a slow leveller on the bed (+/-6 dB toward BED_TARGET over 3 s windows), because the Presto's quiet
    solo episode (film 39-72 s) would otherwise vanish under the voice,
  * SFX kept under the voice: SFX_DB overall, and a further SFX_DUCK_DB on the same speech key, so a hit
    under a word stays a texture while hits in the gaps keep their full weight,
then two-pass EBU R128 loudness normalisation to the target with a -1 dBTP ceiling.
"""
import os, sys, json, glob, subprocess, argparse, wave, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); FILM = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, 'kf'))
from filmserver import serve
ap = argparse.ArgumentParser(); ap.add_argument('--out', default=os.path.join(FILM, 'out', 'mix.wav')); ap.add_argument('--lufs', type=float, default=-14)
a = ap.parse_args()
SR = 48000
BED_DB, DUCK_DB, SFX_DB, SFX_DUCK_DB, BED_TARGET = -3.0, -15.0, -7.0, -8.0, -21.0

url, srv = serve(FILM)
info = json.loads(subprocess.run(['node', os.path.join(HERE, 'kf', 'info.mjs')], env={**os.environ, 'FILM_URL': url}, capture_output=True, text=True, check=True).stdout)
srv.shutdown()
dur = info['dur']; N = int(round(dur * SR))

def decode(p):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()
def fit(x):
    y = np.zeros((N, 2), np.float32); y[:min(N, len(x))] = x[:N]; return y
def block_rms(x, win):
    m = (x ** 2).mean(1); c = np.cumsum(np.r_[0, m]); h = win // 2
    idx = np.arange(len(m)); lo = np.clip(idx - h, 0, len(m)); hi = np.clip(idx + h, 0, len(m))
    return np.sqrt((c[hi] - c[lo]) / np.maximum(1, hi - lo))

voice = fit(decode(os.path.join(FILM, 'audio', 'voice.wav')))
music = fit(decode(os.path.join(FILM, 'audio', 'music.wav')))

# bed leveller: gain toward BED_TARGET, limited to +/-6 dB, computed at 100 Hz then interpolated
step = SR // 100
r = block_rms(music, 3 * SR)[::step]
lvl = 20 * np.log10(r + 1e-6); g = np.clip(BED_TARGET - lvl, -6, 6); g[lvl < -50] = 0
g = np.interp(np.arange(N), np.arange(len(g)) * step, g)
music *= (10 ** ((g + BED_DB) / 20))[:, None].astype(np.float32)

# voice-keyed duck at 100 Hz resolution: speech above -40 dBFS pulls the bed down by DUCK_DB; a one-pole
# follower gives a 30 ms attack and a 400 ms release so the bed breathes back up between phrases
vr = block_rms(voice, int(.05 * SR))[::step]; speaking = (20 * np.log10(vr + 1e-6) > -40).astype(np.float64)
ka, kr = np.exp(-1 / (.03 * 100)), np.exp(-1 / (.4 * 100)); e = 0.0; dc = np.empty_like(speaking)
for i, v in enumerate(speaking):
    k = ka if v > e else kr; e = k * e + (1 - k) * v; dc[i] = e
key = np.interp(np.arange(N), np.arange(len(dc)) * step, dc)
music *= (10 ** (DUCK_DB * key / 20))[:, None].astype(np.float32)

# SFX from the film's cue list, same rules as the skill's mixer
kit = os.path.join(FILM, 'audio', 'sfx'); cache = {}
def sound(name):
    if name not in cache:
        xs = []
        for f in sorted(glob.glob(os.path.join(kit, name + '*.wav'))):
            stem = os.path.splitext(os.path.basename(f))[0]
            if stem == name or (stem.startswith(name + '_') and stem[len(name) + 1:].isdigit()):
                x = decode(f); xs.append(x / (np.abs(x).max() or 1) * 10 ** (-1 / 20))
        cache[name] = xs
    return cache[name]
def pick(names):
    for n in names.split('|'):
        if sound(n): return n
MAP = {
    'key': [('key', 'onset', 0, -19)], 'tick': [('tick', 'onset', 0, -15)], 'pop': [('pop', 'onset', 0, -15)],
    'whoosh': [('whoosh', 'peak', .12, -12)], 'whoosh_big': [('whoosh_big|whoosh', 'peak', .14, -6)],
    'impact': [('impact', 'onset', 0, -3)], 'impact_big': [('impact_big|impact', 'onset', 0, -3)], 'hit': [('hit|impact', 'onset', 0, -4)],
    'slash': [('slash|whoosh', 'peak', .05, -5)], 'sparkle': [('sparkle|tick', 'onset', 0, -17)], 'glitch': [('glitch', 'onset', 0, -14)],
    'riser': [('riser', 'end', 0, -10)], 'suck': [('suck|riser', 'end', 0, -10)], 'click': [('click', 'onset', 0, -2)],
    'logo_hit': [('logo_hit|impact_big', 'onset', 0, -2)], 'ding': [('sparkle', 'onset', 0, -14)],
}
sfx = np.zeros((N, 2), np.float32); count = {}; missing = set()
onset = lambda x: int(np.argmax(np.abs(x).max(1) > .2 * np.abs(x).max()))
peak = lambda x: int(np.argmax(np.abs(x).max(1)))
def place(x, start, gain):
    s = int(round(start * SR)); lo, hi = max(0, s), min(N, s + len(x))
    if hi > lo: sfx[lo:hi] += x[lo - s:hi - s] * gain
for c in info['cues']:
    name, t, gain = c['name'], c['t'], c.get('gain', 1); i = count.get(name, 0); count[name] = i + 1
    for names, align, off, db in MAP.get(name, [(name, 'onset', 0, -8)]):
        k = pick(names)
        if not k: missing.add(names); continue
        xs = sound(k); x = xs[i % len(xs)]
        start = (c.get('end', t) - len(x) / SR) if align == 'end' else (t + off - peak(x) / SR) if align == 'peak' else (t + off - onset(x) / SR)
        place(x, start, gain * 10 ** ((db + SFX_DB) / 20))
sfx *= (10 ** (SFX_DUCK_DB * key / 20))[:, None].astype(np.float32)
mix = voice + music + sfx
# report how far the bed and the effects sit under the narrator while speech is present (400 ms windows)
w = int(.4 * SR); gaps = []
for s in range(0, N - w, w):
    vr = np.sqrt((voice[s:s + w] ** 2).mean()); br = np.sqrt(((music + sfx)[s:s + w] ** 2).mean())
    if 20 * np.log10(vr + 1e-9) > -35: gaps.append(20 * np.log10((vr + 1e-9) / (br + 1e-9)))
print(f"voice over bed+sfx while speaking: median {np.median(gaps):.1f} dB, worst 10% {np.percentile(gaps, 10):.1f} dB")
tmp = a.out + '.raw.wav'; os.makedirs(os.path.dirname(a.out), exist_ok=True)
with wave.open(tmp, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix * .5, -1, 1) * 32767).astype('<i2').tobytes())
r = subprocess.run(['ffmpeg', '-v', 'info', '-i', tmp, '-af', f'loudnorm=I={a.lufs}:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
js = json.loads(r[r.rindex('{'):r.rindex('}') + 1])
af = f"loudnorm=I={a.lufs}:TP=-1:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true"
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', af, '-ar', str(SR), '-t', f'{dur:.4f}', a.out], check=True)
os.remove(tmp)
print(f"{a.out}: {sum(count.values())} cues, {dur:.2f} s, target {a.lufs} LUFS")
if missing: print('no file for:', ', '.join(sorted(missing)))
