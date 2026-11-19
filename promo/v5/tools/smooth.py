"""smooth.py <video> [<video> ...]: measures what makes a cut feel shaky or dizzy, per file.

For each frame pair (at 480x270 grey): the global translation by phase correlation (camera shake / whip
shows as large shifts and large changes in shift = jerk), the mean luma change (flashes and hard cuts show as
spikes), and the share of pixels that changed. Prints percentiles so two cuts can be compared.
Approach note: phase correlation measures the dominant whole-frame motion, which is what reads as camera
movement; local motion (a card sliding) barely moves it.
"""
import sys, subprocess, numpy as np, cv2
W, H = 480, 270
for src in sys.argv[1:]:
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], stdout=subprocess.PIPE)
    prev = None; sh = []; dl = []; win = np.float32(cv2.createHanningWindow((W, H), cv2.CV_32F))
    while True:
        b = p.stdout.read(W * H)
        if len(b) < W * H: break
        g = np.frombuffer(b, np.uint8).reshape(H, W).astype(np.float32)
        if prev is not None:
            (dx, dy), _ = cv2.phaseCorrelate(prev, g, win)
            sh.append(np.hypot(dx, dy) * 4)          # in 1920-px units
            dl.append(abs(g.mean() - prev.mean()))
        prev = g
    sh = np.array(sh); dl = np.array(dl); jerk = np.abs(np.diff(sh))
    pc = lambda a, q: float(np.percentile(a, q))
    print(src.split('/')[-1])
    print(f'  camera shift px/frame  p50 {pc(sh,50):5.1f}  p95 {pc(sh,95):6.1f}  max {sh.max():6.1f}  frames >40 px: {int((sh>40).sum())}')
    print(f'  shift jerk px/frame^2  p95 {pc(jerk,95):6.1f}  max {jerk.max():6.1f}  frames >30: {int((jerk>30).sum())}')
    print(f'  luma jump /255         p99 {pc(dl,99):5.2f}  max {dl.max():5.2f}  frames >8 (flash/hard cut): {int((dl>8).sum())}')
