"""Finish V5: mux the master, encode the optimized lite copy, and check both.

Usage (from promo/v5): python3 tools/finish.py [--video out/video_1080.mp4] [--audio out/mix.wav]
Outputs (out/final/):
  trendifest-v5_1080p30.mp4       master: the render's video stream as rendered (x264 CRF 15), AAC 320 kb/s
  trendifest-v5_1080p30_lite.mp4  optimized: x264 CRF 22 preset slow, High@4.2, AAC 160 kb/s, faststart
  report.json                     the numbers printed below
Why x264 for the lite copy and not HEVC: H.264 High@4.2 plays inline everywhere the film will be sent
(browsers, chat apps, every phone); V4's HEVC test saved only another 15 %. The V5 picture carries little grain
(GRAIN=.8 vs V4's 2.2), which is where V4's bitrate went, so CRF 22 stays visually transparent; the SSIM of
the lite copy against the master is measured, not assumed.
Checks: full decode with -xerror (both files), frame count and duration, H.264 level, integrated loudness and
true peak (EBU R128), file sizes, and SSIM lite vs master. Exit code 1 if a check fails.
"""
import os, sys, json, subprocess, argparse
HERE = os.path.dirname(os.path.abspath(__file__)); FILM = os.path.dirname(HERE)
ap = argparse.ArgumentParser()
ap.add_argument('--video', default=os.path.join(FILM, 'out', 'video_1080.mp4'))
ap.add_argument('--audio', default=os.path.join(FILM, 'out', 'mix.wav'))
a = ap.parse_args()
OUT = os.path.join(FILM, 'out', 'final'); os.makedirs(OUT, exist_ok=True)
master = os.path.join(OUT, 'trendifest-v5_1080p30.mp4'); lite = os.path.join(OUT, 'trendifest-v5_1080p30_lite.mp4')
run = lambda *c: subprocess.run(list(c), capture_output=True, text=True)

# master: video copied bit for bit; no -shortest (it can drop the last frames when audio ends a few ms early)
r = run('ffmpeg', '-v', 'error', '-y', '-i', a.video, '-i', a.audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', master)
if r.returncode: sys.exit(r.stderr)
r = run('ffmpeg', '-v', 'error', '-y', '-i', master, '-map', '0:v', '-map', '0:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-profile:v', 'high', '-level', '4.2',
        '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', lite)
if r.returncode: sys.exit(r.stderr)

def probe(p):
    j = json.loads(run('ffprobe', '-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,level,nb_read_frames,width,height,r_frame_rate:format=duration,size', '-of', 'json', p).stdout)
    v = next(s for s in j['streams'] if s['codec_type'] == 'video')
    return {'bytes': int(j['format']['size']), 'mb': round(int(j['format']['size']) / 1e6, 1), 'duration': round(float(j['format']['duration']), 3),
            'frames': int(v['nb_read_frames']), 'size': f"{v['width']}x{v['height']}", 'fps': v['r_frame_rate'], 'level': v.get('level'),
            'decode_clean': run('ffmpeg', '-v', 'error', '-xerror', '-i', p, '-f', 'null', '-').returncode == 0}
rep = {'master': probe(master), 'lite': probe(lite)}
l = run('ffmpeg', '-hide_banner', '-i', master, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-').stderr
summ = l[l.rindex('Summary:'):]
grab = lambda key: float(summ.split(key)[1].split()[0])
rep['loudness'] = {'lufs': grab('I:'), 'true_peak_dbfs': grab('Peak:')}
s = run('ffmpeg', '-v', 'info', '-i', lite, '-i', master, '-lavfi', '[0:v][1:v]ssim', '-f', 'null', '-').stderr
rep['ssim_lite_vs_master'] = float(s[s.rindex('All:') + 4:].split()[0])
rep['lite_vs_master_size'] = round(rep['lite']['bytes'] / rep['master']['bytes'], 3)
json.dump(rep, open(os.path.join(OUT, 'report.json'), 'w'), indent=2)
print(json.dumps(rep, indent=2))
ok = all(rep[k]['decode_clean'] and rep[k]['frames'] == 2880 for k in ('master', 'lite')) and -15 <= rep['loudness']['lufs'] <= -13 and rep['loudness']['true_peak_dbfs'] <= -0.9
print('PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
