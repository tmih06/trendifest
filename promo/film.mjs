// Times follow the narration's phrases, not a fixed BPM imposed on Ishizaka's performance.
export const W = 1920, H = 1080, FPS = 60;
export const chapters = [0, 22.101338, 42.666689, 73.642698, 91.648049];
export const duration = chapters.at(-1);
export const mediaFiles = { city:'city.mp4', phone:'phone.mp4', press:'press.mp4', water:'water.mp4', meeting:'meeting.mp4', graph:'graph.webm', board:'board.webm', evidence:'evidence.webm', watch:'watch.webm' };

// Each source take is used once. Non-media entries are procedurally drawn editorial shots.
const scenes = [
  [0, aperture], [1.22, street, 'city', .7], [5.5, oscillator], [9.45, conversation, 'phone', .45],
  [13.65, scale, 'press', .7], [17.6, ripple, 'water', .35], [chapters[1], proposal], [25.85, signalLab],
  [37.15, graph, 'graph', 2.65], [chapters[2], growth],
  [48.95, board, 'board', 2], [54.65, relay], [59.75, evidence, 'evidence', 6.45],
  [65.85, watch, 'watch', 2.18], [71.2, human, 'meeting', 1.1], [chapters[3], team],
  [87.6, end],
];
const p = {black:'#141125',deep:'#211746',purple:'#5132da',lav:'#c9b8ff',lime:'#dcf784',paper:'#f4f1e9',white:'#fffefa',grey:'#6a6480',line:'#ded8e7'};
const TAU = Math.PI*2;

/** Clamps a phase to the unit interval so arbitrary and repeated seeks are safe. */
export const unit=x=>Math.max(0,Math.min(1,x));
/** Smooth travel with zero velocity at both ends. */
export const smooth=x=>{const u=unit(x);return u*u*(3-2*u);};
/** Fast settling motion for a mask or a panel entrance. */
export const settle=x=>1-(1-unit(x))**3;
/** Interpolates dimensions and positions in design pixels. */
export const lerp=(a,b,u)=>a+(b-a)*u;
/** Wraps a repeating graphic beyond the frame without a visible discontinuity. */
const wrap=(x,m)=>((x%m)+m)%m;

/** Returns shot-local time and its one source frame without depending on prior playback. */
export function cue(t) {
  const i=Math.max(0,scenes.findLastIndex(s=>s[0]<=t));
  const [start,paint,media,offset]=scenes[i];
  const dt=Math.max(0,t-start), length=(scenes[i+1]?.[0]??duration)-start;
  return {i,paint,dt,length,u:unit(dt/length),media,at:media?offset+dt:0};
}

/** Draws dimensioned surfaces in the common 1920 × 1080 design space. */
export function box(c,x,y,w,h,col,r=0) {
  if(w<=0||h<=0)return;
  c.fillStyle=col;
  if(!r)c.fillRect(x,y,w,h);
  else {c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
}

/** Fits a single line without breaking Vietnamese diacritics or changing the supplied copy. */
export function text(c,s,x,y,size,col=p.black,{weight=800,max=1760,align='left',mono=false,outline=false}={}) {
  if(max<=0)return;
  c.font=`${weight} ${size}px ${mono?'JetBrains Mono':'Archivo'}`;
  c.textAlign=align;c.textBaseline='alphabetic';
  if(outline){c.strokeStyle=col;c.lineWidth=2.5;c.strokeText(s,x,y,max);}
  else {c.fillStyle=col;c.fillText(s,x,y,max);}
}

/** Restrained annotation, with enough contrast to distinguish real and conceptual footage. */
function label(c,s,x,y,col=p.purple,align='left') {
  text(c,s,x,y,24,col,{mono:true,weight:650,align});
}

/** Clips a sliced panel using shared coordinates so type and moving footage stay sharp. */
export function rect(c,x,y,w,h,r=0) {
  c.beginPath(); if(r)c.roundRect(x,y,w,h,r);else c.rect(x,y,w,h);c.clip();
}

/** Creates a readable type entrance using motion through a fixed mask rather than opacity. */
function rise(c,s,x,y,size,col,t,max=1760) {
  c.save();rect(c,x-8,y-size*1.04,max+16,size*1.31);
  text(c,s,x,y+size*1.2*(1-settle(t/.56)),size,col,{max});c.restore();
}

/** Strokes a linear vector and leaves the next drawing primitive independent of it. */
export function line(c,x,y,xx,yy,col,w=2) {
  c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.strokeStyle=col;c.lineWidth=w;c.stroke();
}

/** Draws a disc or a ring; callers own its animation and compositing. */
export function circle(c,x,y,r,col,w=0) {
  if(r<=0)return;
  c.beginPath();c.arc(x,y,r,0,TAU);
  if(w){c.strokeStyle=col;c.lineWidth=w;c.stroke();}else{c.fillStyle=col;c.fill();}
}

/** Draws a translated/raster-free polygon from absolute points. */
function poly(c,points,col) {
  c.beginPath();c.moveTo(...points[0]);for(let i=1;i<points.length;i++)c.lineTo(...points[i]);
  c.closePath();c.fillStyle=col;c.fill();
}

/** Crops a normalized region of the clip and fits it without distorting interface typography. */
function crop(c,img,x,y,w,h,{sx=0,sy=0,sw=1,sh=1,ax=.5,ay=.5}={}) {
  if(!img)return;
  const iw=img.videoWidth||img.width,ih=img.videoHeight||img.height;
  if(!iw||!ih)return;
  const k=Math.max(w/(sw*iw),h/(sh*ih)), pw=w/k,ph=h/k;
  c.drawImage(img,sx*iw+(sw*iw-pw)*ax,sy*ih+(sh*ih-ph)*ay,pw,ph,x,y,w,h);
}

/** Frames authentic app capture; the shell is editorial and contains no mock functionality. */
function screen(c,img,x,y,w,h,region) {
  box(c,x+14,y+21,w,h,'#130f2644',17);
  c.save();rect(c,x,y,w,h,15);box(c,x,y,w,h,p.white);crop(c,img,x,y,w,h,region);c.restore();
}

/** The official mark is drawn unmodified, on a light ground so its original ink is legible. */
export function mark(c,img,cx,cy,w) {
  if(img)c.drawImage(img,cx-w/2,cy-w*108/344,w,w*108/172);
}

/** Carries the mark through a single opening aperture rather than reusing the final card. */
function aperture(c,{dt,u},_,logo) {
  box(c,0,0,W,H,p.purple);
  const open=settle(dt/.5), close=smooth((u-.65)/.35),w=690*open+2050*close;
  box(c,960-w/2,540-150*open-440*close,w,300*open+880*close,p.paper,24*(1-close));
  c.save();rect(c,960-w/2,0,w,H);mark(c,logo,960,540,370+34*close);c.restore();
  label(c,'RND TO STARTUP 2026',72,82,p.lime);label(c,'A02',1848,82,p.lime,'right');
}

/** Runs the city take once, adding a diagonally hinged editorial mask counter to the traffic. */
function street(c,{dt,u},img) {
  box(c,0,0,W,H,p.black);
  crop(c,img,0,0,W,H,{sx:.027*u,sy:.028*u,sw:1-.06*u,sh:1-.06*u,ax:.3,ay:.62});
  const q=settle(dt/.62), e=smooth((u-.75)/.25), x=-610+q*610+e*260;
  poly(c,[[0,0],[x+930,0],[x+750,H],[0,H]],'#201448d9');
  line(c,x+930,0,x+750,H,p.lime,6);
  label(c,'TP. HỒ CHÍ MINH  /  CẢNH MINH HỌA',72,111,p.lime);
  rise(c,'MỘT TRÀO LƯU',72,484,114,p.white,dt,730);
  rise(c,'BẮT ĐẦU',72,639,159,p.white,dt-.26,733);
  rise(c,'Ở ĐÂU?',74,802,182,p.lime,dt-.54,700);
  line(c,75,927,75+q*(500+u*145),927,p.lav,3);
}

/** Synthesizes an illustrative sound envelope; the bars are not product data. */
function oscillator(c,{dt,u}) {
  box(c,0,0,W,H,p.black);
  label(c,'01   /   MỘT ĐOẠN ÂM THANH',72,86,p.lav);
  const x0=72,y=584,step=22;
  for(let i=0;i<81;i++) {
    const x=x0+i*step, pulse=Math.sin(i*.13-dt*4.9), env=.25+.75*Math.pow(Math.sin(i*.061-dt*1.6),2);
    const h=22+env*(80+360*Math.abs(pulse));
    box(c,x,y-h/2,14,h,i%5===0?p.lav:i<25?p.purple:p.lime,6);
  }
  line(c,72,y,1848,y,p.white,2);
  const play=140+u*1600;line(c,play,286,play,871,p.white,4);circle(c,play,y,12,p.white);
  rise(c,'3 GIÂY',70,317,208,p.white,dt,800);
  text(c,'CÓ THỂ LÀ ĐIỂM KHỞI ĐẦU.',76,970,53,p.lav,{max:1500});
}

/** Lets oversize message fragments pass each other on separate tracks, unlike the waveform. */
function conversation(c,{dt,u},img) {
  box(c,0,0,W,H,p.lav);
  const cut=lerp(1160,850,smooth(u));
  crop(c,img,cut-60,0,W-cut+60,H,{ax:.48,sy:.035*u,sh:1-.07*u});
  c.save();c.beginPath();c.moveTo(0,0);c.lineTo(cut+136,0);c.lineTo(cut-60,H);c.lineTo(0,H);c.clip();
  box(c,0,0,W,H,p.lav);c.translate(630,550);c.rotate(-.11);
  const cards=[['MỘT CÂU',p.purple,p.white],['BÌNH LUẬN',p.black,p.lime],['TRONG MỘT NGÁCH',p.paper,p.black]];
  cards.forEach(([s,bg,fg],i)=>{
    const x=-795+(i===1?-1:1)*(dt-2)*65;
    box(c,x,-363+246*i,2230,208,bg,35);
    text(c,s,x+240,-218+246*i,i===2?76:115,fg,{max:830});
    circle(c,x+2050,-260+246*i,24,fg,5);
  });c.restore();
  box(c,0,0,cut+108,103,p.lav);label(c,'02   /   MỘT CUỘC THẢO LUẬN',72,66,p.black);
  box(c,72,1000,lerp(130,500,u),5,p.purple);
}

/** Gives the externally sourced count its own typographic register, not an app statistic. */
function scale(c,{dt,u},img) {
  box(c,0,0,W,H,p.black);
  crop(c,img,710,0,1210,H,{ax:.78,sy:u*.03,sh:1-.06*u});
  box(c,710,0,1210,H,'#17112670');
  const split=1170-180*smooth(u);
  poly(c,[[0,0],[split+160,0],[split-160,H],[0,H]],p.lime);
  label(c,'TOÀN CẢNH  /  VIỆT NAM',72,101,p.black);
  rise(c,'79,0',60,650,403,p.black,dt,1065);
  rise(c,'TRIỆU',78,862,181,p.purple,dt-.25,695);
  text(c,'DANH TÍNH NGƯỜI DÙNG',1843,442,54,p.white,{align:'right',max:765});
  text(c,'MẠNG XÃ HỘI',1843,515,70,p.white,{align:'right',max:765});
  label(c,'DATAREPORTAL  /  10.2025',1843,592,p.lime,'right');
}

/** Enlarges a single disturbance into traveling contours, then narrows attention to the question. */
function ripple(c,{dt,u},img) {
  box(c,0,0,W,H,p.purple);
  crop(c,img,0,0,W,H,{sx:.03*u,sw:1-.06*u});
  box(c,0,0,W,H,'#21174655');
  const cx=1310-110*u,cy=550;
  c.save();c.translate(cx,cy);c.scale(1,.75);
  for(let i=13;i>=0;i--) {
    const r=wrap(i*102+dt*210,1428);
    circle(c,0,0,r,i%3===0?p.lime:p.lav,i%3===0?11:5);
  }
  circle(c,0,0,27,p.white);c.restore();
  const width=1030-65*Math.sin(u*Math.PI);
  poly(c,[[0,0],[width,0],[width-250,H],[0,H]],p.purple);
  label(c,'CÂU HỎI CỦA TRENDIFEST',72,102,p.lime);
  rise(c,'NHÌN THẤY',69,480,130,p.white,dt,900);
  rise(c,'TỪ KHI NÀO?',69,652,145,p.lime,dt-.35,975);
}

/** Lays out the four research stages as stops on an unfolding schematic, with no simulated results. */
function proposal(c,{dt,u}) {
  box(c,0,0,W,H,p.paper);
  label(c,'KIẾN TRÚC R&D  /  GIẢI PHÁP ĐỀ XUẤT',72,95,p.purple);
  rise(c,'TỪ TÍN HIỆU ĐẾN SỰ KIỆN',70,290,119,p.black,dt);
  const stops=['THU THẬP','AI ĐA PHƯƠNG THỨC','DỰ BÁO','CHUYÊN VIÊN'];
  const x0=146, yy=688, move=1470*settle(dt/3.55);
  line(c,146,yy,1740,yy,'#c8bbfa',12);line(c,146,yy,x0+move,yy,p.purple,12);
  stops.forEach((s,i)=>{
    const x=x0+i*490,q=settle((dt-i*.37)/.65);
    circle(c,x,yy,44*q,p.purple);circle(c,x,yy,12*q,p.lime);
    label(c,'0'+(i+1),x,yy-93+45*(1-q),p.purple,'center');
    text(c,s,x,yy+102+45*(1-q),35,p.black,{align:i===0?'left':'center',max:420});
  });
  const sweep=wrap(dt*295,394);
  for(let i=-1;i<7;i++) {
    const x=200+i*394+sweep;
    poly(c,[[x-190,925],[x,925],[x+82,1003],[x-108,1003]],i%2?p.lav:p.purple);
  }
  circle(c,x0+move,yy,14+6*Math.sin(u*TAU),p.black);
}

/** Stable illustrative feature vectors, unrelated to live accounts or measured topic histories. */
const groups=[{x:985,y:377,ink:'#dbf879',angle:.26},{x:1575,y:427,ink:'#baa5ff',angle:2.28},{x:1260,y:792,ink:'#75e4db',angle:4.43}];
const signals=Array.from({length:27},(_,i)=>{
  const angle=groups[i%3].angle+.47*Math.sin(i*2.71), magnitude=1.9+.7*Math.cos(i*1.92);
  const x=magnitude*Math.cos(angle), y=magnitude*Math.sin(angle), norm=Math.hypot(x,y);
  // Unit-vector dot product is cosine similarity; choose the nearest illustrative anchor by score.
  const scores=groups.map(g=>(x*Math.cos(g.angle)+y*Math.sin(g.angle))/norm);
  const g=scores.indexOf(Math.max(...scores));
  return {i,g,kind:(i+Math.floor(i/3))%3,x,y,nx:x/norm,ny:y/norm,score:scores[g],angle:Math.floor(i/3)*TAU/9};
});

/** Draws a simple pictogram for sound, picture, or text inside a persistent signal token. */
export function glyph(c,kind,x,y,r,col) {
  c.save();c.translate(x,y);c.scale(r/30,r/30);
  if(kind===0){[8,15,22,11].forEach((h,k)=>box(c,-17+k*10,-h/2,5,h,col,2));}
  else if(kind===1){poly(c,[[-16,11],[-5,-7],[2,2],[8,-6],[17,11]],col);circle(c,-10,-12,3,col);}
  else{[25,31,19].forEach((w,k)=>box(c,-14,-11+k*9,w,4,col,1));}
  c.restore();
}

/** One continuous shot: emit → normalize → score → cluster → follow the same signals along edges. */
function signalLab(c,{dt:t}) {
  box(c,0,0,W,H,p.black);
  const phase=t<2.25?0:t<4.75?1:t<6.7?2:t<8.65?3:4;
  const headlines=[['TÍN HIỆU','XUẤT HIỆN'],['CHUẨN HÓA','VECTƠ'],['ĐO ĐỘ','TƯƠNG ĐỒNG'],['GOM NHÓM','NỘI DUNG'],['TRUY VẾT','XU HƯỚNG']];
  const notes=['Âm thanh · Hình ảnh · Văn bản','Giữ hướng, đưa độ dài về 1.','So sánh hướng của hai vectơ.','Cùng chủ đề, khác định dạng.','Theo dấu các tín hiệu có liên hệ.'];
  const starts=[0,2.25,4.75,6.7,8.65];
  label(c,'ĐỒ THỊ SỰ KIỆN   /   MÔ PHỎNG R&D',72,96,p.lime);
  const n=smooth((t-2.05)/2.25), k=smooth((t-5.7)/2.15),trace=unit((t-8.3)/2.7);
  const cx=1280,cy=550, orbit=257;
  // The field breathes with the camera; icons stay identifiable throughout every transformation.
  c.save();rect(c,690,135,1195,838,26);
  box(c,690,135,1195,838,p.deep);
  const grid=87, d=wrap(t*19,grid);
  for(let x=690-grid+d;x<1900;x+=grid)line(c,x,135,x,980,'#352556',1.5);
  for(let y=135-grid+d;y<975;y+=grid)line(c,690,y,1890,y,'#352556',1.5);
  c.save();c.globalAlpha=n*(1-k);circle(c,cx,cy,orbit,'#ab95de',3);line(c,cx-442,cy,cx+442,cy,'#76589c',2);line(c,cx,cy-320,cx,cy+320,'#76589c',2);c.restore();
  const nodes=signals.map(s=>{
    const born=settle((t-.038*s.i)/.66),a=s.angle+t*.39+s.g*.12;
    const axis=smooth((t-1.0)/1.45);
    const rawX=lerp(880+(s.i*183)%835+28*Math.sin(t+s.i),cx+153*s.x,axis);
    const rawY=lerp(258+(s.i*87)%566+23*Math.sin(t*1.6+s.i),cy-153*s.y,axis);
    const r=95+9*(s.i%4),g=groups[s.g];
    const x=lerp(lerp(lerp(724,rawX,born),cx+orbit*s.nx,n),g.x+r*Math.cos(a),k);
    const y=lerp(lerp(lerp(737,rawY,born),cy-orbit*s.ny,n),g.y+r*.87*Math.sin(a),k);
    return {...s,x,y,born};
  });
  if(n>0&&k<1){c.save();c.globalAlpha=.55*n*(1-k);for(const s of nodes)line(c,cx,cy,s.x,s.y,groups[s.g].ink,2);c.restore();}
  if(k>0) for(const s of nodes){const g=groups[s.g];const pct=smooth(k*1.55-.014*s.i);line(c,g.x,g.y,lerp(g.x,s.x,pct),lerp(g.y,s.y,pct),g.ink,3);}
  for(const g of groups)if(k>0){circle(c,g.x,g.y,21*k,g.ink);circle(c,g.x,g.y,8*k,p.black);}
  for(const node of nodes){const r=node.born*lerp(23,17,n*(1-k));if(!r)continue;circle(c,node.x,node.y,r,p.deep);circle(c,node.x,node.y,r,groups[node.g].ink,2.6);glyph(c,node.kind,node.x,node.y,r,groups[node.g].ink);}
  if(trace>0){
    // Only trace within a topic: connecting dissimilar centroids would suggest a relationship that wasn't scored.
    const path=[nodes[0],groups[0],nodes[6],groups[0],nodes[15],groups[0],nodes[24]];
    const progress=trace*(path.length-1);for(let j=0;j<progress;j++){
      const a=path[j],b=path[j+1],f=unit(progress-j),x=lerp(a.x,b.x,f),y=lerp(a.y,b.y,f);
      line(c,a.x,a.y,x,y,p.white,6);if(j+1>=progress){circle(c,x,y,13,p.white);circle(c,x,y,22+7*Math.sin(t*7),p.lime,2);}
    }
  }
  c.restore();
  label(c,'0'+(phase+1)+'  /  05',73,270,p.lav);
  const local=t-starts[phase];
  rise(c,headlines[phase][0],69,468,96,p.white,local,585);
  rise(c,headlines[phase][1],69,592,104,p.lime,local-.07,585);
  text(c,notes[phase],73,696,32,p.lav,{max:576,weight:550});
  if(phase===1 || phase===2){box(c,72,750,574,86,'#37244f',10);label(c,phase===1?'û = v / ‖v‖':'cos(θ) = û · ĉ',94,804,p.white);}
  else if(phase>=3){label(c,'03 NHÓM   /   DỮ LIỆU MINH HỌA',73,803,p.lav);}
  if(phase===2){const s=signals[Math.min(signals.length-1,Math.floor(local*8))];
    label(c,'v'+String(s.i+1).padStart(2,'0')+'  →  '+['A','B','C'][s.g]+'   '+s.score.toFixed(3),94,892,p.lime);}
}

/** Moves from a view of many real topics to the actual focused graph without a second graph shot. */
function graph(c,{dt,u},img) {
  box(c,0,0,W,H,p.deep);
  const travel=smooth(u), x=lerp(680,565,travel), y=lerp(215,100,travel);
  poly(c,[[0,0],[x+138,0],[x-210,H],[0,H]],p.purple);
  screen(c,img,x,y,lerp(1175,1290,travel),lerp(662,795,travel));
  label(c,'BẢN CHẠY THỰC TẾ',72,103,p.lime);
  rise(c,'ĐỒ THỊ',69,524,148,p.white,dt,467);
  rise(c,'XU HƯỚNG',73,643,101,p.lime,dt-.18,475);
  label(c,'DỮ LIỆU ĐÃ THU THẬP',1848,1000,p.lav,'right');
}

/** All three illustrative indices are zero at x=0, but their subsequent shapes and slopes differ. */
function growth(c,{dt,u}) {
  box(c,0,0,W,H,p.deep);
  const ox=170, oy=861, width=1486, height=495;
  const curves=[
    {s:'Tăng nhanh',col:p.lime,f:x=>.16*x+.82*x*x+.026*x*Math.sin(14*x)},
    {s:'Tăng đều',col:p.lav,f:x=>.52*x+.08*x*x+.045*x*Math.sin(10*x)},
    {s:'Chững lại',col:'#75e4db',f:x=>.29*(1-Math.exp(-4*x))+.038*x*Math.sin(12*x)},
  ];
  label(c,'R&D  /  ĐƯỜNG MINH HỌA, KHÔNG PHẢI DỮ LIỆU ĐO',72,89,p.lime);
  rise(c,'THEO DÕI TĂNG TRƯỞNG',70,255,112,p.white,dt,1770);
  const extent=settle(dt/.76);label(c,'MỨC TĂNG TƯƠNG ĐỐI',ox,338,p.lav);
  for(let i=0;i<5;i++){const y=oy-height*i/4;line(c,ox,y,ox+(width+70)*extent,y,'#503968',2);}
  line(c,ox,oy+6,ox,oy-height*extent,p.lav,3);
  [0,6,12,24].forEach(h=>{const x=ox+width*h/24;line(c,x,oy,x,oy+15,p.lav,3);label(c,h+'h',x,oy+65,p.lav,'center');});
  // Every series shares one moving sample time, not three shifted or pre-drawn trajectories.
  const progress=unit((dt-.24)/5.82), xHead=ox+width*progress;
  if(progress>0)line(c,xHead,oy-height-8,xHead,oy,'#796094',2);
  curves.forEach(({s,col,f},i)=>{
    c.beginPath();c.moveTo(ox,oy);
    const steps=Math.ceil(150*progress);
    for(let j=1;j<=steps;j++){const x=progress*j/steps;c.lineTo(ox+width*x,oy-height*f(x));}
    c.strokeStyle=col;c.lineWidth=9;c.lineJoin='round';c.lineCap='round';c.stroke();
    const y=oy-height*f(progress);
    // A translucent area follows the same revealed samples; it never hints at the future curve.
    c.lineTo(xHead,oy);c.closePath();c.fillStyle=col+'20';c.fill();
    circle(c,xHead,y,10,col);
    if(progress>.26){const a=smooth((progress-.26)/.13);c.save();c.globalAlpha=a;
      const off=[-23,5,41][i];text(c,s,xHead+20,y+off,27,col,{weight:650,max:225});c.restore();}
  });
  circle(c,ox,oy,15,p.white);circle(c,ox,oy,23+6*Math.sin(5*dt),p.white,2);
  label(c,'GỐC CHUNG',ox,988,p.white);label(c,'THỜI GIAN QUAN SÁT →',1846,988,p.lav,'right');
}

/** Travels down the authentic ranked board while a side marker points into the reading area. */
function board(c,{dt,u},img) {
  box(c,0,0,W,H,p.paper);
  const z=smooth(u),w=lerp(1230,1350,z), h=lerp(714,790,z),x=lerp(597,508,z),y=lerp(263,175,z);
  poly(c,[[0,257],[410,183],[690,1080],[0,1080]],p.lime);
  screen(c,img,x,y,w,h,{sy:.038,sh:.9,sx:.14,sw:.86,ay:lerp(.1,.82,z)});
  label(c,'BẢN CHẠY THỰC TẾ   /   BẢNG CHỦ ĐỀ',72,95,p.purple);
  rise(c,'XẾP',69,477,155,p.black,dt,530);
  rise(c,'HẠNG',68,632,154,p.purple,dt-.19,412);
  line(c,74,735,x-22,735,p.purple,6);circle(c,x-22,735,11,p.purple);
  label(c,'SO SÁNH CHỦ ĐỀ',72,810,p.black);
}

/** A directional relay explains the cross-platform R&D proposal without implying collection access. */
function relay(c,{dt,u}) {
  box(c,0,0,W,H,p.purple);
  const skew=150+u*290;
  poly(c,[[920+skew,0],[W,0],[W,H],[920-skew,H]],p.black);
  label(c,'KHÁI NIỆM R&D  /  CHƯA TRIỂN KHAI',72,91,p.lime);
  text(c,'TIKTOK',75,458,164,p.white,{max:795});text(c,'THREADS',1845,812,169,p.lav,{max:950,align:'right'});
  line(c,178,531,1725,531,p.lav,5);
  for(let i=0;i<7;i++) {
    const x=190+wrap(i*255+dt*415,1500), y=531-26*Math.sin(i+dt*2);
    poly(c,[[x-60,y-40],[x+30,y-40],[x+80,y],[x+30,y+40],[x-60,y+40],[x-10,y]],i%2?p.white:p.lime);
  }
  label(c,'CHUYỂN DỊCH TÍN HIỆU LIÊN NỀN TẢNG',72,993,p.white);
}

/** Peels out the actual source inspector, enlarging only its pixels so links remain readable. */
function evidence(c,{dt,u},img) {
  box(c,0,0,W,H,p.lime);
  const y=lerp(256,104,settle(dt/.88)), x=lerp(1260,795,smooth(u));
  poly(c,[[x-150,0],[W,0],[W,H],[x+290,H]],p.lav);
  screen(c,img,x,y,lerp(638,974,smooth(u)),856,{sx:.686,sw:.314,sy:.077,sh:.83,ax:.52,ay:lerp(.14,.72,u)});
  label(c,'BẢN CHẠY THỰC TẾ',72,95,p.black);
  rise(c,'MỞ NGUỒN',70,460,130,p.black,dt,720);
  rise(c,'GỐC.',66,654,240,p.purple,dt-.2,690);
  label(c,'KIỂM TRA BẰNG CHỨNG',74,767,p.black);
}

/** Uses an unfolding, wide layout for the real watch-save action, not another inspector zoom. */
function watch(c,{dt,u},img) {
  box(c,0,0,W,H,p.deep);
  const q=settle(dt/.66), w=1240+370*smooth(u),x=(W-w)/2,y=304-100*smooth(u);
  poly(c,[[0,y+145],[W,y-30],[W,H],[0,H]],p.lav);
  c.save();rect(c,0,y+8,W,760*q);
  screen(c,img,x,y,w,724,{sx:.15,sw:.85,sy:.05,sh:.8,ay:lerp(.05,.7,u)});c.restore();
  label(c,'BẢN CHẠY THỰC TẾ',72,88,p.lime);
  rise(c,'LƯU THEO DÕI',70,230,130,p.white,dt,1560);
  label(c,'THEO DÕI CHỦ ĐỀ TRONG ỨNG DỤNG',1846,1014,p.black,'right');
}

/** Connects the voice-over's report handoff to the proposed human review, not to a fake export. */
function human(c,{dt,u},img) {
  box(c,0,0,W,H,p.black);
  crop(c,img,0,0,W,H,{ax:.52,sx:.03*u,sw:1-.08*u});
  box(c,0,0,W,H,'#17112655');
  const left=lerp(-210,190,smooth(u)),right=lerp(1190,670,smooth(u));
  poly(c,[[left,0],[left+350,0],[left+860,H],[left+510,H]],p.purple);
  poly(c,[[right+550,0],[right+900,0],[right+390,H],[right+40,H]],p.lime);
  box(c,0,705,W,375,p.black);
  label(c,'QUY TRÌNH R&D ĐỀ XUẤT  /  CẢNH MINH HỌA',72,779,p.lav);
  rise(c,'CHUYÊN VIÊN XÁC THỰC',70,966,128,p.white,dt);
}

const people=[['Trần Thị','Hạnh Nguyên','Nhóm trưởng · Chiến lược'],['Ngô Quốc','Hoàng Trung','Nghiên cứu và phân tích dữ liệu'],['Lê','Minh Trí','Mô hình học máy và dự báo'],['Phạm','Thanh Minh','Hạ tầng và phát triển phần mềm']];

/** Moves all four verified names through one continuous credits sequence, then assembles the roster. */
function team(c,{dt},_,logo) {
  const reveal=smooth((dt-10.9)/.7), t=Math.min(3.999,dt/2.76), i=Math.floor(t), f=t-i;
  box(c,0,0,W,H,p.paper);
  const x=1265+800*reveal+170*Math.cos(dt*.79),y=580+65*Math.sin(dt*.72);
  circle(c,x,y,640,p.lav);circle(c,x,y,498,p.purple);circle(c,x,y,345,p.lime);
  label(c,'ĐỘI NGŨ TRENDIFEST',72,93,p.purple);
  label(c,'TRƯỜNG ĐẠI HỌC BÁCH KHOA – ĐẠI HỌC ĐÀ NẴNG',72,1010,p.black);
  if(reveal<1) {
    c.save();rect(c,0,152,W,744*(1-reveal));
    const bg=[p.paper,p.lav,p.lime,p.paper][i];
    const moving=lerp(0,-170,Math.max(0,(f-.68)/.32)**2);
    box(c,58,215+moving,893,591,bg,16);
    const [prefix,name,role]=people[i];
    label(c,'0'+(i+1)+'  /  04',94,329+moving,p.purple);
    rise(c,prefix,90,483+moving,92,p.black,f*2.76,815);
    rise(c,name,89,636+moving,151,p.purple,f*2.76-.12,823);
    text(c,role,95,737+moving,39,p.black,{max:810,weight:600});
    text(c,'0'+(i+1),x-40,y+119,385,p.black,{max:585,align:'center'});c.restore();
  }
  if(reveal>0) {
    const h=680*reveal;
    c.save();rect(c,0,880-h,W,h);
    box(c,0,200,W,680,p.deep);
    people.forEach(([first,last,role],n)=>{
      const y=325+143*n,x=78+48*n;
      line(c,x,y+51,1320,y+51,p.lav,1);
      text(c,first+' '+last,x,y,59,p.white,{max:880});label(c,role,1320,y,p.lime,'right');
    });
    box(c,1455,378,325,265,p.paper,14);mark(c,logo,1617,510,274);c.restore();
  }
}

/** Finishes with the supplied mark and a static reading window for contact details. */
function end(c,{dt},_,logo) {
  box(c,0,0,W,H,p.deep);
  const q=settle(dt/.85),x=lerp(1960,124,q);
  box(c,x,160,1672,738,p.paper,34);
  c.save();rect(c,x,160,1672,738,34);
  mark(c,logo,x+368,517,484);
  line(c,x+684,316,x+684,726,p.purple,2);
  label(c,'RND TO STARTUP 2026   /   A02',x+750,380,p.purple);
  text(c,'TỪ TÍN HIỆU ĐẾN',x+748,515,77,p.black,{max:865});
  text(c,'BẰNG CHỨNG.',x+748,615,108,p.purple,{max:860});
  label(c,'hanhnguyen17122006@gmail.com',x+750,714,p.black);
  c.restore();
}

/** Draws one independent frame; the renderer may seek mid-shot or out of order. */
export function draw(c,t,{source,logo}={}) {
  const s=cue(t);
  c.save();s.paint(c,s,source,logo);c.restore();
  // Carry a packet from the architecture into the lab, and a turning page into the
  // evidence inspector. Each cover crosses the cut at full coverage, then moves off.
  for(const [at,ink,vertical] of [[25.85,p.lime,false],[59.75,p.lav,true]]) {
    const phase=t-at; if(phase<-.22 || phase>.30)continue;
    const length=vertical?H:W;
    const front=phase<0?length*smooth((phase+.22)/.22):length;
    const back=phase<0?0:length*smooth(phase/.30);
    if(vertical)box(c,0,back,W,front-back,ink);else box(c,back,0,front-back,H,ink);
  }
}
