"""Build the edit clock from note attacks in the exact piano performance used by render.mjs."""
from pathlib import Path
import json, subprocess
import numpy as np
root = Path(__file__).resolve().parents[1]
src = root / 'media/score.mp3'
length = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',src]))
audio = np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',src,'-af',f'atempo={length/91.648049:.8f}','-ar','12000','-ac','1','-f','f32le','-']),np.float32)
win = np.hanning(512); amp = np.log1p(20*abs(np.fft.rfft(np.lib.stride_tricks.sliding_window_view(audio,512)[::120]*win)))
flux = np.maximum(0,np.diff(amp,axis=0)).sum(1); hits=[]
for n in range(7,len(flux)-7):
    if flux[n] == flux[n-6:n+7].max() and flux[n]>12: hits.append(round(.01*n+.022,3))
(root/'v3/attacks.mjs').write_text('// Piano attacks in mixed-film seconds. Regenerate with score.py.\nexport default '+json.dumps(hits)+';\n')
