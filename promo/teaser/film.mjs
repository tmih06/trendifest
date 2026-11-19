/** TRENDIFEST teaser: one signal, one source, one proof. Pure at every seek. */
import {W,H,FPS,box,text,rect,line,circle,mark} from '../film.mjs';
export {W,H,FPS};
export const duration=48;
export const chapters=[0,duration];
export const mediaFiles={city:'city.mp4',phone:'phone.mp4',press:'press.mp4',water:'water.mp4',graph:'graph.webm',evidence:'evidence.webm'};
const ink='#081b1b', dark='#0d2928', jade='#87ead0', amber='#ffb45c', ivory='#fff4dc', violet='#b8b4ff', TAU=Math.PI*2;
const scenes=[
 [0,'mark'],[2.15,'city','city',.12],[6.1,'wave'],[9.2,'phone','phone',.2],[13.1,'press','press',.3],
 [17.0,'ripple','water',.4],[21.2,'nodes'],[26.9,'graph','graph',.6],[32.9,'trace'],[36.0,'evidence','evidence',6.25],[42.0,'proof'],[45.5,'end']
];
const used=scenes.filter(s=>s[2]).map(s=>s[2]);
if(new Set(used).size!==used.length)throw Error('Teaser footage may only appear once');
/** Resolves a shot without playback state; source frames always advance from its initial offset. */
export function cue(t){const i=Math.max(0,scenes.findLastIndex(s=>s[0]<=t)),[start,id,media,offset]=scenes[i],len=(scenes[i+1]?.[0]??duration)-start;return {i,id,dt:t-start,len,u:Math.max(0,Math.min(1,(t-start)/len)),media,at:media?offset+t-start:0};}
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const lerp=(a,b,x)=>a+(b-a)*x;
/** Fits a still frame to a region while preserving its aspect ratio. */
function lens(c,img,x,y,w,h,zoom=1,fx=.5,fy=.5){if(!img)return;const iw=img.width,ih=img.height,k=Math.max(w/iw,h/ih)*zoom,sw=w/k,sh=h/k;c.drawImage(img,Math.max(0,Math.min(iw-sw,fx*iw-sw/2)),Math.max(0,Math.min(ih-sh,fy*ih-sh/2)),sw,sh,x,y,w,h);}
/** Applies a directional black-green scrim only where typography needs contrast. */
function scrim(c,alpha=.72){const g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,`rgba(4,17,17,${alpha})`);g.addColorStop(.46,'rgba(4,17,17,.08)');g.addColorStop(1,`rgba(4,17,17,${alpha})`);box(c,0,0,W,H,g);}
/** Moves a phrase through a fixed mask; the entrance never fades or flickers. */
function title(c,s,x,y,size,col,phase,max=1700){c.save();rect(c,x-10,y-size*1.25,max+20,size*1.56);text(c,s,x,y+size*1.35*(1-smooth(phase/.34)),size,col,{weight:800,max});c.restore();}
/** Etches a measured line field from a deterministic phase, producing no repeated bitmap frames. */
function field(c,t,x,y,w,h,color=jade,count=38){for(let i=0;i<count;i++){const q=i/(count-1);c.beginPath();for(let n=0;n<=70;n++){const a=n/70,yy=y+h*(q-.5)+Math.sin(a*8.5+t*2.3+q*5.1)*h*.12*Math.sin(Math.PI*a);if(n)c.lineTo(x+a*w,yy);else c.moveTo(x+a*w,yy);}c.strokeStyle=i%7===0?amber:color;c.lineWidth=i%7===0?4:2.5;c.stroke();}}
/** Draws an orbital coordinate field for the signal transformation. */
function orbit(c,t,cx,cy,r){for(let i=0;i<30;i++){const a=i*Math.PI/30+t*.9;c.beginPath();c.ellipse(cx,cy,Math.max(2,Math.abs(Math.cos(a))*r),r*.55,.42*Math.sin(a),0,TAU);c.strokeStyle=i%6===0?amber:'#3a8074';c.lineWidth=i%6===0?4:2.5;c.stroke();}}
/** Full-screen source exposure. Each stock take has a single clock and a single framing. */
function stock(c,s,img,tag,headline,sub,focus){box(c,0,0,W,H,ink);lens(c,img,0,0,W,H,1.02+.06*s.u,focus,.52);scrim(c,.82);text(c,tag,86,126,26,amber,{weight:650,mono:true});title(c,headline,82,820,144,ivory,s.dt,1680);if(sub)title(c,sub,84,972,83,jade,s.dt-.1,1650);}
/** The supplied mark opens through a narrow architectural aperture. */
function markShot(c,s,logo){box(c,0,0,W,H,dark);const q=smooth(s.dt/.62),w=lerp(240,1200,q),h=lerp(120,560,q);box(c,960-w/2,540-h/2,w,h,ivory,18);mark(c,logo,960,540,Math.min(570,w*.7));text(c,'TRENDIFEST',86,1000,27,jade,{weight:650,mono:true});text(c,'A02',1834,1000,27,jade,{weight:650,mono:true,align:'right'});}
/** The first concept turns a tiny audio fragment into a moving, legible signal. */
function waveShot(c,s){box(c,0,0,W,H,ink);field(c,s.dt,-160,510,2200,700);title(c,'3 GIÂY',83,365,264,amber,s.dt,900);text(c,'UM…  MỘT TÍN HIỆU',89,970,36,ivory,{weight:650,mono:true});}
/** Three anchors emerge from a shared field; no measured claim is attached to them. */
function nodeShot(c,s){box(c,0,0,W,H,ink);orbit(c,s.dt,1220,514,520);const q=smooth(s.dt/3.7), anchors=[[825,366,jade],[1510,390,amber],[1130,760,violet]];for(let i=0;i<24;i++){const a=i*.75+s.dt*.8,g=i%3,[x,y,col]=anchors[g],r=14+7*Math.sin(i);const px=1010+Math.cos(a)*190,py=540+Math.sin(a)*140;line(c,lerp(1030,x,q),lerp(540,y,q),lerp(px,x,q),lerp(py,y,q),col+'aa',2);circle(c,lerp(1010,px,q),lerp(540,py,q),r,col,3);}text(c,'R&D  /  SIGNÁL → VECTƠ → KLUSTER',82,112,27,amber,{weight:650,mono:true});title(c,'TỪ TÍN HIỆU',82,934,112,ivory,s.dt,910);title(c,'ĐẾN MỐI LIÊN HỆ',82,1035,84,jade,s.dt-.13,1160);}
/** A single continuous chart draws the future from one origin, then collapses into the app. */
function traceShot(c,s){box(c,0,0,W,H,ivory);const ox=210,oy=830,w=1450,h=460,p=smooth(s.dt/3.6);text(c,'R&D  /  ĐƯỜNG MINH HỌA',83,104,27,'#236155',{weight:650,mono:true});title(c,'MỌI ĐƯỜNG',82,274,124,ink,s.dt,960);const curves=[x=>.15*x+.85*x*x,x=>.54*x+.1*x*x,x=>.34*(1-Math.exp(-3*x))],cols=['#c65a2b','#087764','#54428d'];for(let i=0;i<5;i++)line(c,ox,oy-i*115,1800,oy-i*115,'#c4d4c7',2);for(let i=0;i<3;i++){c.beginPath();c.moveTo(ox,oy);for(let j=1;j<=Math.max(1,Math.ceil(100*p));j++){const x=p*j/Math.ceil(100*p);c.lineTo(ox+x*w,oy-h*curves[i](x));}c.strokeStyle=cols[i];c.lineWidth=8;c.stroke();circle(c,ox+w*p,oy-h*curves[i](p),11,cols[i]);}circle(c,ox,oy,16,ink);text(c,'0h',ox-15,914,27,ink,{weight:650,mono:true});text(c,'24h',ox+w-28,914,27,ink,{weight:650,mono:true});title(c,'GROWTH',1250,1010,84,'#087764',s.dt-.1,500);}
/** A source camera exposes the real graph; the lower rail identifies it as actual footage. */
function app(c,s,img,name,verb,focus){box(c,0,0,W,H,ink);const top=120,bottom=895;c.save();rect(c,0,top,W,bottom-top);lens(c,img,0,top,W,bottom-top,1.03+.05*s.u,focus,.5);c.restore();field(c,s.dt,760,954,1300,280,ivory,21);text(c,'TRENDIFEST  /  BẢN CHẠY THỰC TẾ',82,78,26,jade,{weight:650,mono:true});text(c,verb,1834,78,32,ivory,{weight:700,align:'right'});title(c,name,82,1024,94,ivory,s.dt,900);}
/** The proof card is deliberately calmer: the source is readable and the claim is not invented. */
function proofShot(c,s,img){box(c,0,0,W,H,ivory);box(c,0,0,W,120,dark);text(c,'TRENDIFEST  /  BẰNG CHỨNG NGUỒN',82,78,27,jade,{weight:650,mono:true});if(img)lens(c,img,160,167,1600,720,1.01,.84,.52);else{box(c,160,167,1600,720,'#dbe7d9');field(c,s.dt,245,300,1430,430,'#408c75',24);circle(c,1510,506,74,amber);line(c,1510,506,1675,390,ink,5);}box(c,120,924,1680,4,'#297663');text(c,'THE SOURCE IS THE STORY.',123,1013,56,ink,{weight:780});}
/** End with the mark and contact, after the proof rather than before it. */
function endShot(c,logo){box(c,0,0,W,H,ivory);mark(c,logo,960,383,640);text(c,'FOLLOW THE SIGNAL.',960,695,68,ink,{weight:800,align:'center'});text(c,'hanhnguyen17122006@gmail.com',960,812,39,ink,{weight:550,align:'center'});text(c,'RND TO STARTUP 2026  /  A02',82,1005,26,'#236155',{weight:650,mono:true});}
/** The teaser has no duplicate source media and all frames derive only from t. */
export function draw(c,t,{source,logo}={}){const s=cue(t);c.save();if(s.id==='mark')markShot(c,s,logo);else if(s.id==='wave')waveShot(c,s);else if(s.id==='nodes')nodeShot(c,s);else if(s.id==='trace')traceShot(c,s);else if(s.id==='graph')app(c,s,source,'THE MAP','TRACE A TREND',.49);else if(s.id==='evidence')proofShot(c,s,source);else if(s.id==='city')stock(c,s,source,'TP. HỒ CHÍ MINH','THE SIGNAL STARTS SMALL.','',.58);else if(s.id==='phone')stock(c,s,source,'A SCROLL.','THEN IT MOVES.','',.48);else if(s.id==='press')stock(c,s,source,'NOISE BECOMES CONTEXT.','WHEN YOU ARE LATE,','THE STORY IS ALREADY OLD.',.66);else if(s.id==='water')stock(c,s,source,'THE QUESTION:','HOW EARLY','CAN YOU SEE IT?',.51);else if(s.id==='proof')proofShot(c,s,source);else if(s.id==='end')endShot(c,logo);else field(c,s.dt,-160,430,2200,600);c.restore();}
