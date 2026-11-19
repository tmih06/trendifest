# post.py <dsf> <frame0> <frame1> <out.mp4> [fps]   (one render worker; render.py runs several and joins them)
# Runs render.mjs, averages each frame's sub-samples (motion blur), adds bloom and grain, and encodes.
# ENC overrides the encoder arguments (default: H.264 CRF 12.4, preset slower; Level 5.2 at 4K so Macs can play it).
import sys, struct, subprocess, os, numpy as np, cv2
dsf, f0, f1, out = float(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
fps = sys.argv[5] if len(sys.argv) > 5 else '60'
W, H = int(1920 * dsf), int(1080 * dsf)
here = os.path.dirname(os.path.abspath(__file__))
level = '5.2' if H > 1440 else '4.2'
enc = os.environ.get('ENC') or f'-c:v libx264 -crf 12.4 -preset slower -level {level} -rc-lookahead 40 -threads 8'
node = subprocess.Popen(['node', os.path.join(here, 'render.mjs'), str(dsf), str(f0), str(f1)], stdout=subprocess.PIPE, bufsize=1 << 24)
ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', fps, '-i', '-',
                       *enc.split(), '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', out], stdin=subprocess.PIPE)
def rd(n):
    b = node.stdout.read(n)
    return b if b is not None and len(b) == n else None
# film grain: half-resolution noise tiles, upsampled per frame (deterministic, so re-renders match).
# GRAIN=0 turns it off: web copies at a few Mbps look cleaner without grain, which costs many bits.
GRAIN = float(os.environ.get('GRAIN', '2.2'))
# V5: BLOOM scales the glow (V4 and the skill used .75); the smooth V5 look renders with BLOOM=.3
BLOOM = float(os.environ.get('BLOOM', '.75'))
grain = [np.random.default_rng(i).normal(0, 1, (H // 2, W // 2)).astype(np.float32) for i in range(8)]
s = dsf / 2
done = 0
while True:
    h = rd(8)
    if h is None: break
    k, n = struct.unpack('<II', h)
    # V5: keep the decoded samples and drop outliers before averaging. One V5 render had a single sub-sample
    # captured mid-composite (a grey wash and a ghost graph at 44.1 s, luma 57 vs 20 around it; stills at the
    # same instants were clean). A sample whose mean luma sits more than 6 levels from the median of the
    # frame's samples is such a glitch: a real move or fade changes far less within one 180-degree shutter.
    imgs = []
    for _ in range(n):
        L = struct.unpack('<I', rd(4))[0]
        imgs.append(cv2.imdecode(np.frombuffer(rd(L), np.uint8), cv2.IMREAD_COLOR).astype(np.float32))
    if len(imgs) >= 3:
        m = np.array([float(cv2.resize(x, (96, 54), interpolation=cv2.INTER_AREA).mean()) for x in imgs])
        keep = [x for x, v in zip(imgs, m) if abs(v - np.median(m)) <= 6]
        if len(keep) < len(imgs): print(f'frame {k}: dropped {len(imgs) - len(keep)} glitched sample(s)', flush=True)
        imgs = keep or imgs
    img = sum(imgs) / len(imgs)
    # bloom: bright pass at quarter resolution, two radii
    small = cv2.resize(img, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    br = np.clip(small - 175, 0, None)
    bl = .6 * cv2.GaussianBlur(br, (0, 0), 5 * s) + .4 * cv2.GaussianBlur(br, (0, 0), 20 * s)
    img += cv2.resize(bl, (W, H), interpolation=cv2.INTER_LINEAR) * BLOOM
    if GRAIN: img += cv2.resize(grain[k % 8], (W, H), interpolation=cv2.INTER_LINEAR)[..., None] * GRAIN
    ff.stdin.write(np.clip(img + .5, 0, 255).astype(np.uint8).tobytes())
    done += 1
ff.stdin.close(); ff.wait(); node.wait()
print(f'{out}: {done} frames (expected {f1 - f0})', flush=True)
sys.exit(0 if done == f1 - f0 else 1)
