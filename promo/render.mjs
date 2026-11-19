import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { once } from 'node:events';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
const cut=process.env.CUT||'v2';
const v3=cut==='3';
const teaser=cut==='teaser';
const { chapters, cue, draw, duration, FPS, H, mediaFiles, W } = await import(teaser?'./teaser/film.mjs':v3?'./v3/film.mjs':'./film.mjs');
const scale=Number(process.env.FILM_SCALE||1);

const home = fileURLToPath(new URL('.', import.meta.url));
const media = join(home, 'media'), out = join(home, teaser?'out/teaser':v3?'out/v3.1':'out/v2');
const frames = join(home, 'out/v2/source-frames');
const output = join(out, 'RTS 2026 - Video - TRENDIFEST '+(teaser?'TEASER':v3?'V3.1':'V2')+(scale===2?' 4K':'')+'.mp4');
const count = Math.round(duration * FPS);
const mode = process.argv[2];
const archiveScore = join(media, 'score.mp3');

/** Pass failures and FFmpeg diagnostics through instead of leaving partial media unnoticed. */
function run(bin, args) {
  // This offline CLI runs setup and mux jobs serially; there is no request loop to block.
  const p=spawnSync(bin,args,{encoding:'utf8',maxBuffer:1024*1024});
  if(p.error || p.status!==0) throw p.error ?? Error(p.stderr.trim() || bin+' exited '+p.status);
  return p.stdout;
}

/** Reads seconds as stored by the container, not the encoder's nominal duration. */
function seconds(file) {
  const n=Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file]).trim());
  if(!(n>0)) throw Error('No measured duration for '+file);
  return n;
}

/** Turns the supplied SVG into a faithful image using Chromium's native SVG masking. */
async function prepareLogo() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM||undefined,args:['--no-sandbox']});
  try {
    const page=await browser.newPage({viewport:{width:688,height:432},deviceScaleFactor:2});
    const data=(await readFile(join(home,'../public/logo.svg'))).toString('base64');
    await page.setContent('<style>body{margin:0}</style><img width="688" height="432" src="data:image/svg+xml;base64,'+data+'">');
    await page.locator('img').evaluate(el=>el.decode());
    await page.screenshot({path:join(out,'logo.png'),omitBackground:true});
  } finally { await browser.close(); }
}

/** Extracts indexed source frames at output cadence once. This avoids stateful browser video seeks during export. */
async function prepareSources() {
  for(const [key,file] of Object.entries(mediaFiles)) {
    const path=join(media,file), dest=join(frames,key), info=await stat(path);
    const revision=JSON.stringify([info.size,info.mtimeMs,FPS]);
    const stamp=join(dest,'revision.txt');
    if((await readFile(stamp,'utf8').catch(()=>''))===revision) continue;
    // A shorter retake must not inherit trailing frames from the older clip.
    await rm(dest,{recursive:true,force:true});
    await mkdir(dest,{recursive:true});
    run('ffmpeg',['-nostdin','-v','error','-y','-i',path,'-an','-vf','fps='+FPS,'-q:v','2','-threads','2','-start_number','0',join(dest,'%05d.jpg')]);
    await writeFile(stamp,revision);
  }
}

/** Concatenates uncut voices, ducks the continuous piano, and fits its final cadence to the last card. */
function mix() {
  if(teaser){
    const score=seconds(archiveScore), factor=score/duration;
    const tempo=factor<=2?['atempo='+factor.toFixed(8)]:['atempo=2','atempo='+(factor/2).toFixed(8)];
    run('ffmpeg',['-v','error','-y','-i',archiveScore,'-filter_complex','[0:a]'+tempo.join(',')+',volume=-6dB,loudnorm=I=-14:LRA=8:TP=-1.5,aresample=48000,apad=whole_dur='+duration+',atrim=duration='+duration+'[a]','-map','[a]','-c:a','pcm_s16le',join(out,'mix.wav')]);
    return;
  }
  const args=[1,2,3,4].flatMap(i=>['-i',join(media,'s'+i+'.m4a')]);
  const score=seconds(archiveScore);
  const filter='[0:a][1:a][2:a][3:a]concat=n=4:v=0:a=1,highpass=f=70,aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[vo][key];'+
    '[4:a]atempo='+(score/duration).toFixed(8)+',aresample=48000,volume=-9dB[piano];'+
    '[piano][key]sidechaincompress=threshold=0.026:ratio=7:attack=12:release=255[duck];'+
    '[vo][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:LRA=8:TP=-1.5,aresample=48000,apad=whole_dur='+duration+',atrim=duration='+duration+'[a]';
  run('ffmpeg',['-v','error','-y',...args,'-i',archiveScore,'-filter_complex',filter,'-map','[a]','-c:a','pcm_s16le',join(out,'mix.wav')]);
}

/** Loads only the required source frame; callers may seek to arbitrary output frames in any order. */
async function sourceReader() {
  const paths={};
  for(const key of Object.keys(mediaFiles)) paths[key]=(await readdir(join(frames,key))).filter(s=>s.endsWith('.jpg')).sort();
  return async (t)=>{
    const {media:key,at}=cue(t);if(!key)return undefined;
    const f=paths[key][Math.min(Math.max(0,Math.round(at*FPS)),paths[key].length-1)];
    if(!f)throw Error('Missing source frames: '+key);
    return loadImage(join(frames,key,f));
  };
}

/** Returns an isolated painter at the final 1080p scale for a segment worker or still preview. */
async function painter() {
  GlobalFonts.registerFromPath(join(media,'Archivo.ttf'),'Archivo');
  GlobalFonts.registerFromPath(join(media,'JetBrainsMono.ttf'),'JetBrains Mono');
  const logo=await loadImage(join(out,'logo.png'));
  const sourceAt=await sourceReader();
  const canvas=createCanvas(Math.round(W*scale),Math.round(H*scale)),ctx=canvas.getContext('2d');
  ctx.scale(scale,scale);
  return async (n,fmt='jpeg')=>{
    const t=n/FPS;
    draw(ctx,t,{logo,source:await sourceAt(t)});
    return fmt==='png'?canvas.encodeSync('png'):canvas.encodeSync('jpeg',94);
  };
}

/** Encodes a disjoint range of frame indices as one identically configured H.264 segment. */
async function segment(from,to,f) {
  const paint=await painter();
  const enc=spawn('ffmpeg',['-nostdin','-v','error','-y','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','pipe:0',
    '-an','-vf','scale=out_color_matrix=bt709:out_range=tv,format=yuv420p','-c:v','libx264','-preset','veryfast','-crf','17','-profile:v','high','-level:v',scale===2?'5.2':'4.2','-threads','2',
    '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-video_track_timescale','30000',f],{stdio:['pipe','inherit','inherit']});
  const finish=once(enc,'exit');
  // EPIPE is reported by the worker's exit code, including the encoder's original diagnostic.
  enc.stdin.on('error',()=>{});
  for(let i=from;i<to;i++) {
    if(enc.exitCode!==null) throw Error('Encoder exited early for '+f);
    if(!enc.stdin.write(await paint(i))) await Promise.race([once(enc.stdin,'drain'),finish.then(()=>{throw Error('Encoder stopped for '+f);})]);
    if(i!==from && (i-from)%240===0)console.log(basename(f)+': '+(i-from)+' / '+(to-from));
  }
  enc.stdin.end();
  const [status]=await finish;if(status!==0)throw Error('Encoder failed for '+f);
}

/** Fan out frame ranges without multiplying Chromium instances; each worker owns its canvas. */
async function worker(from,to,f) {
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'segment',String(from),String(to),f],{stdio:'inherit'});
  const [code]=await once(child,'exit');if(code!==0)throw Error('Render worker failed: '+f);
}

if(mode==='segment') {
  await segment(Number(process.argv[3]),Number(process.argv[4]),process.argv[5]);
} else {
  await Promise.all([mkdir(frames,{recursive:true}),mkdir(out,{recursive:true})]);
  await Promise.all([prepareLogo(),prepareSources()]);
  if(mode==='stills') {
    const paint=await painter();
    for(const t of process.argv.slice(3).map(Number)) {
      if(!Number.isFinite(t) || t<0 || t>=duration) throw Error('Invalid time: '+t);
      await writeFile(join(out,'still-'+t+'.png'),await paint(Math.floor(t*FPS),'png'));
    }
  } else {
    mix();
    const ends=chapters.map(t=>Math.round(t*FPS));
    const work=ends.slice(1).map((end,i)=>[ends[i],end,join(out,'part-'+i+'.mp4')]);
    if(ends.at(-1)!==count) throw Error('Film frame count disagrees with chapter cuts');
    await Promise.all(work.map(args=>worker(...args)));
    const concat=join(out,'concat.txt');
    // Explicit frame-derived segment durations prevent MP4 millisecond roundoff at each splice.
    await writeFile(concat,work.map(([from,to,path])=>"file '"+basename(path)+"'\nduration "+((to-from)/FPS).toFixed(10)).join('\n')+'\n');
    run('ffmpeg',['-v','error','-y','-f','concat','-safe','0','-i',concat,'-i',join(out,'mix.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-movflags','+faststart',
      '-metadata','title=TRENDIFEST — Từ tín hiệu đến bằng chứng',output]);
    console.log(output);
  }
}
