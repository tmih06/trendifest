/** V3: a field recording becomes a drawn signal, a graph, then a verifiable source. */
import attacks from './attacks.mjs';
import {W,H,FPS,chapters,duration,mediaFiles,unit,smooth,settle,lerp,box,text,rect,line,circle,mark,glyph} from '../film.mjs';
export {W,H,FPS,chapters,duration,mediaFiles};
const ink='#0a201f', ivory='#fff5dd', amber='#ffad51', jade='#7ce5cb', red='#ef7757', blue='#b7b8fc', tau=2*Math.PI;
export const bpm=129.88*94.2/duration;
/** Snap authored phrase boundaries to nearby performed attacks, rather than quantizing rubato. */
const note=s=>attacks.reduce((a,b)=>Math.abs(b-s)<Math.abs(a-s)?b:a);
const cuts=[
 [0,'opening'],[1.34,'street','city',1.5],[5.5,'sound'],[8.8,'comment','phone',.7],[12.65,'press','press',1.15],[16.48,'late'],[18.8,'water','water',.38],
 [22.14,'disturbance'],[24.7,'lab'],[36.55,'graph','graph',.85],[42.66,'growth'],[49.16,'board','board',1.65],[53.7,'relay'],[58.16,'evidence','evidence',6.08],[64.2,'watch','watch',2.9],[70.7,'human','meeting',1.05],
 [73.65,'credits'],[86.32,'seal'],[87.35,'end']
].map(([t,...rest])=>[t?note(t):0,...rest]);
export const endCard=cuts.at(-1)[0];
// A file, not a scene name, identifies a take. Fail at startup instead of shipping a repeated clip.
const takes=cuts.filter(([, , key])=>key).map(([, , key])=>mediaFiles[key]);
if(new Set(takes).size!==takes.length)throw Error('A footage file may appear in only one shot');
/** The source clock advances at exactly one second per film second until the next cut. */
export function cue(t){const i=Math.max(0,cuts.findLastIndex(s=>s[0]<=t)),[start,id,media,offset]=cuts[i],dt=t-start,len=(cuts[i+1]?.[0]??duration)-start;return {i,id,start,dt,len,u:unit(dt/len),media,at:media?offset+dt:0};}
/** Set a small, unambiguous running caption, never render editorial annotations as app controls. */
function cap(c,s,x,y,col=ivory,size=28){text(c,s,x,y,size,col,{weight:650,mono:true});}
/** A photographic camera crop in frame fractions; focus is clamped to available picture area. */
function lens(c,img,x,y,w,h,z,fx=.5,fy=.5){if(!img)return;const iw=img.videoWidth||img.width,ih=img.videoHeight||img.height,k=Math.max(w/iw,h/ih)*z,sw=w/k,sh=h/k;c.drawImage(img,Math.max(0,Math.min(iw-sw,fx*iw-sw/2)),Math.max(0,Math.min(ih-sh,fy*ih-sh/2)),sw,sh,x,y,w,h);}
/** Scrim keeps the image full-bleed but protects only the text end of the exposure. */
function shade(c,axis='y',strength=.88){const g=c.createLinearGradient(0,0,axis==='x'?W:0,axis==='y'?H:0);g.addColorStop(0,axis==='x'?`rgba(4,15,16,${strength})`:'#04101100');g.addColorStop(.45,axis==='x'?'#04101165':'#04101109');g.addColorStop(1,axis==='x'?'#04101100':`rgba(4,15,16,${strength})`);box(c,0,0,W,H,g);}
/** A narrow letterpress reveal; text remains readable after it clears the baseline. */
function headline(c,s,x,y,size,color,phase,max=1760){c.save();rect(c,x-10,y-size*1.34,max+20,size*1.65);text(c,s,x,y+(1-settle(phase/.34))*size*1.52,size,color,{weight:780,max});c.restore();}
/** Keep the native stock motion intact: one framing, one exposure treatment, one continuous source interval. */
const photo={street:['TP. HỒ CHÍ MINH','Mọi trào lưu','đều có điểm đầu.'],comment:['THẢO LUẬN','Một câu','bình luận.'],press:['VIỆT NAM  /  THÁNG 10.2025','79,0 triệu','danh tính mạng xã hội'],water:['CÂU HỎI','Nhìn thấy sóng','từ khi nào?'],human:['R&D ĐỀ XUẤT  /  CẢNH MINH HỌA','Con người','xác thực.']};
function photograph(c,s,img){const {id,dt,u}=s,[tag,a,b]=photo[id];
 lens(c,img,0,0,W,H,1);shade(c,'y');
 const x=91+35*u;cap(c,tag,x,645,amber);headline(c,a,x,817,142,ivory,dt,1570);
 if(b)headline(c,b,x,956,id==='press'?89:137,id==='press'?ivory:amber,dt-.15,1690);
 if(id==='press')cap(c,'Nguồn: DataReportal · Digital 2026: Vietnam',95,1023,ivory,24);
}
/** An engraved wave: adjacent paths are time-shifted slices of one traveling disturbance, not noise. */
function wave(c,t,x,y,w,h,colors=[jade,ivory],count=42){for(let i=0;i<count;i++){let j=i/(count-1);c.beginPath();for(let n=0;n<=66;n++){let a=n/66;const e=.16+.84*Math.pow(Math.sin(Math.PI*a),.8),v=Math.sin(a*8.7-t*2.25+j*5.4)+.27*Math.sin(a*15.3+t*1.32+j*8.4);let xx=x+a*w,yy=y+h*((j-.5)*.67+e*v*.30);if(n)c.lineTo(xx,yy);else c.moveTo(xx,yy);}c.strokeStyle=colors[i%6===0?1:0];c.lineWidth=i%6===0?4.1:2.8;c.stroke();}}
/** Cross-sections of the same disturbance rotate from water ripples to a spatial instrument. */
function iris(c,t,x,y,size){c.save();c.translate(x,y);c.rotate(-.26+t*.085);for(let i=0;i<48;i++){const a=i/48*tau+t*1.12;c.beginPath();c.ellipse(Math.cos(a)*size*.16,Math.sin(a)*size*.12,size*(.58+.18*Math.cos(a)),size*(.35+.13*Math.sin(a)),a*.82,0,tau);c.strokeStyle=i%6?jade:amber;c.lineWidth=i%6?2.8:5;c.stroke();}c.restore();}
/** Keep token identity through measurement; score actual unit directions against three anchors. */
const colors=[jade,amber,blue],dirs=[-.45,1.86,3.82];
const seeds=Array.from({length:30},(_,i)=>{const a=dirs[i%3]+.55*Math.sin(i*16.9), len=1.1+.8*(1+Math.sin(i*2.2)),x=len*Math.cos(a),y=len*Math.sin(a);let scores=dirs.map(d=>(x*Math.cos(d)+y*Math.sin(d))/len);return {i,x,y,nx:x/len,ny:y/len,g:scores.indexOf(Math.max(...scores)),val:Math.max(...scores),kind:(i+Math.floor(i/3))%3};});
function lab(c,s){const {dt:t}=s;box(c,0,0,W,H,ink);const n=smooth((t-2.15)/2),k=smooth((t-6.0)/2.25),tr=unit((t-9.15)/2.65),spin=.26*t;
 // A rotating measuring globe behind the vectors supplies their coordinate frame.
 c.save();c.translate(1100+78*Math.sin(t*.7),506);c.rotate(-.21);for(let i=0;i<36;i++){const a=i*Math.PI/36+spin*3.1;c.beginPath();c.ellipse(0,0,Math.max(1,Math.abs(Math.sin(a))*624),388,.46*Math.sin(a+t*.58),0,tau);c.strokeStyle=i%4?'#469b88':'#96baa8';c.lineWidth=i%4?3.8:5;c.stroke();}c.restore();
 const centers=[[805,330],[1450,393],[1080,752]];
 const pts=seeds.map((d,i)=>{let born=settle((t-i*.038)/.61),a=Math.floor(i/3)*tau/10+.78*t+d.g,bb=centers[d.g];return {...d,x:lerp(lerp(lerp(-120,1080+d.x*203+48*Math.sin(a),born),1080+352*d.nx+37*Math.sin(t),n),bb[0]+142*Math.cos(a),k),y:lerp(lerp(lerp(670,515+d.y*144+45*Math.cos(a),born),512+291*d.ny+27*Math.cos(t),n),bb[1]+122*Math.sin(a),k),born};});
 for(const d of pts){const b=centers[d.g];line(c,lerp(1080,b[0],k),lerp(512,b[1],k),d.x,d.y,colors[d.g]+'aa',3);}
 for(const d of pts){const r=(17+8*(1-n)+7*k)*d.born;circle(c,d.x,d.y,r+4,ink);circle(c,d.x,d.y,r,colors[d.g],3);glyph(c,d.kind,d.x,d.y,r,colors[d.g]);}
 if(tr){const route=[pts[0],{x:805,y:330},pts[9],{x:805,y:330},pts[24]],m=tr*4;for(let i=0;i<Math.min(4,Math.ceil(m));i++){let a=route[i],b=route[i+1],f=unit(m-i),x=lerp(a.x,b.x,f),y=lerp(a.y,b.y,f);line(c,a.x,a.y,x,y,ivory,7);if(i===Math.ceil(m)-1)circle(c,x,y,15,ivory);}}
 const times=[0,2.15,4.6,6.85,9.15],j=times.findLastIndex(v=>v<=t);const names=['Tín hiệu','Chuẩn hóa','So khớp','Gom cụm','Truy vết'];const notes=['Âm thanh / Ảnh / Chữ','û = v / ‖v‖','cos θ = û · ĉ','Cùng chủ đề','Theo dấu liên hệ'];cap(c,'R&D  /  ĐỒ THỊ MINH HỌA',88,90,amber);headline(c,names[j],84,956,142,ivory,t-times[j],790);cap(c,notes[j],92,1022,jade,31);if(j===2){const d=seeds[Math.floor(t*4)%30];cap(c,d.val.toFixed(3)+'  →  '+['A','B','C'][d.g],1470,968,colors[d.g],38);}}
/** Print three trajectories from an identical origin. The hatching is clipped to history already revealed. */
function chart(c,s){const {dt,u}=s;box(c,0,0,W,H,ivory);const x0=137,y0=869,w=1480,h=545,progress=unit((dt-.16)/(s.len-.29));
 cap(c,'R&D   /   KHÔNG PHẢI DỮ LIỆU ĐO',86,87,ink);headline(c,'Một điểm đầu.',83,258,129,ink,dt);const f=[x=>.12*x+.85*x*x,x=>.57*x+.028*x*Math.sin(x*8),x=>.35*(1-Math.exp(-3*x))];
 // The reference signal is printed in the chart header while the three illustrated tracks write below it.
 c.save();rect(c,920,0,1000,289);wave(c,dt*1.42,840,156,1180,560,['#347d70','#9a461c'],45);c.restore();
 // Drafting lines enter with the time cursor rather than drawing the future traces in advance.
 for(let i=0;i<5;i++)line(c,x0,y0-i*h/4,1785,y0-i*h/4,'#b9c8b9',2);const cols=['#ad4b25','#00755f','#54428d'];
 for(let band=2;band>=0;band--){const n=Math.ceil(progress*90),xx=x0+w*progress;c.beginPath();c.moveTo(x0,y0);for(let j=1;j<=n;j++){const x=progress*j/n;c.lineTo(x0+x*w,y0-f[band](x)*h);}c.lineTo(xx,y0);c.closePath();c.save();c.clip();box(c,x0,240,1600,640,cols[band]+'16');wave(c,dt+band*.7,x0-250,737,2130,690,[cols[band],cols[band]],26);c.restore();}
 for(let i=0;i<3;i++){c.beginPath();c.moveTo(x0,y0);for(let j=1;j<=Math.ceil(progress*100);j++){let x=progress*j/Math.ceil(progress*100);c.lineTo(x0+w*x,y0-h*f[i](x));}c.strokeStyle=cols[i];c.lineWidth=8;c.stroke();circle(c,x0+w*progress,y0-h*f[i](progress),12,cols[i]);if(progress>.55)text(c,['Tăng nhanh','Tăng đều','Chững lại'][i],x0+w*progress+22,y0-h*f[i](progress)+[0,9,30][i],30,cols[i],{max:238});}
 circle(c,x0,y0,16,ink);for(let j of [0,6,12,24])cap(c,j+'h',x0+w*j/24-14,938,ink,30);cap(c,'THỜI GIAN QUAN SÁT  →',x0,1015,ink);
}
/** Camera lands on source pixels. Scale, position, and framing vary with the specific interaction. */
const uiShots={graph:['Bản đồ xu hướng','Chọn một chủ đề',[[1.03,.50,.49],[1.42,.57,.49],[1.46,.77,.50]]],board:['Bảng chủ đề','So sánh thứ hạng',[[1.04,.51,.48],[1.49,.43,.41],[1.56,.63,.52]]],evidence:['Bằng chứng','Đọc nguồn gốc',[[1.38,.78,.48],[2.22,.855,.52],[2.15,.858,.68]]],watch:['Theo dõi','Lưu một chủ đề',[[1.33,.76,.58],[1.52,.57,.58],[1.58,.55,.45]]]};
function demo(c,s,img){const [name,verb,views]=uiShots[s.id],p=s.u<.32?0:s.u<.70?1:2,l=s.dt-s.len*[0,.32,.70][p], [z,fx,fy]=views[p];box(c,0,0,W,H,ink);
 const y=128,bottom=894; c.save();rect(c,0,y,W,bottom-y);lens(c,img,0,y,W,bottom-y,z+.10*l,fx+.022*l,fy+.015*l);c.restore();
 // Margin is an editorial scope trace, separated from the actual application by the film aperture.
 c.save();rect(c,0,bottom,W,H-bottom);wave(c,s.dt*1.68,802,993,1430,409,[jade,amber],33);c.restore();cap(c,'TRENDIFEST    /    BẢN CHẠY THỰC TẾ',85,78,jade,30);text(c,verb,1833,78,38,ivory,{align:'right'});headline(c,name,83,1025,101,ivory,s.dt,775);}
const people=[['Trần Thị Hạnh Nguyên','Nhóm trưởng · Chiến lược'],['Ngô Quốc Hoàng Trung','Nghiên cứu và phân tích dữ liệu'],['Lê Minh Trí','Mô hình học máy và dự báo'],['Phạm Thanh Minh','Hạ tầng và phát triển phần mềm']];
/** A continuous printed roster replaces stock returns: the reader follows names down the page. */
function credits(c,s){const shift=520*s.u;
 box(c,0,0,W,H,ivory);c.save();rect(c,0,211,W,754);
 for(let i=0;i<4;i++){const y=384+i*256-shift;line(c,89,y-122,1812,y-122,'#9aa99c',3);
 cap(c,'0'+(i+1),91,y-5,'#35695b',44);text(c,people[i][0],219,y,112,ink,{max:1450});text(c,people[i][1],223,y+75,46,'#346857',{weight:550});}c.restore();
 cap(c,'ĐỘI NGŨ   /   TRƯỜNG ĐẠI HỌC BÁCH KHOA – ĐẠI HỌC ĐÀ NẴNG',90,119,ink,29);
 box(c,90,996,1715,6,'#bfcbc0');box(c,90,996,1715*s.u,6,'#217b67');}
/** Each drawn interlude has its own shape and type hierarchy instead of reusing a split-screen template. */
function graphic(c,s,logo){const {dt:t,id,u}=s;if(id==='opening'){box(c,0,0,W,H,ivory);mark(c,logo,960,510,770-130*smooth(u));cap(c,'RND TO STARTUP 2026   /   A02',85,1000,ink);return;}
 if(id==='late'){box(c,0,0,W,H,ink);wave(c,t,740,490,1500,790);headline(c,'Trễ một nhịp.',80,652,179,ivory,t,1250);return;}
 if(id==='end'){box(c,0,0,W,H,ivory);mark(c,logo,960,368,650);text(c,'Dẫn đầu xu hướng bằng dữ liệu có căn cứ.',960,661,74,ink,{align:'center',max:1680});text(c,'hanhnguyen17122006@gmail.com',960,820,53,ink,{align:'center',weight:550});cap(c,'RND TO STARTUP 2026    /    A02',76,1004,ink,29);return;}
 box(c,0,0,W,H,ink);if(id==='sound'){wave(c,t,-135,581,2200,950,[jade,ivory],56);headline(c,'3 giây',87,356,260,amber,t,800);cap(c,'MỘT ĐOẠN ÂM THANH',98,977,ivory,35);}
 else if(id==='relay'){// Two separate carriers meet in the middle; the highlighted packet crosses the seam.
 wave(c,t,-300,505,1290,635,[jade,ivory],35);wave(c,t-.8,965,510,1210,515,[amber,ivory],31);
 const x=210+1480*u;circle(c,x,510+90*Math.sin(t*2),34,ivory);box(c,70,78,740,77,ink);cap(c,'R&D  /  CHUYỂN DỊCH LIÊN NỀN TẢNG',88,126,amber);headline(c,'TikTok',89,400,160,ivory,t,760);headline(c,'→ Threads',781,943,177,ivory,t-.36,1080);}
 else if(id==='seal'){wave(c,t,-200,534,2260,850,[ivory,jade]);circle(c,960,540,80+1000*u*u,ivory);}
 else{iris(c,t,1320-160*u,547,800);headline(c,'Bắt lấy',82,487,183,ivory,t,805);headline(c,'gợn đầu.',82,701,183,amber,t-.12,820);cap(c,'TRENDIFEST   /   NGHIÊN CỨU & PHÁT TRIỂN',90,990,jade);}}
/** The live preview and both raster resolutions use this same stateless frame specification. */
export function draw(c,t,{source,logo}={}){const s=cue(t);c.save();if(s.id==='lab')lab(c,s);else if(s.id==='growth')chart(c,s);else if(uiShots[s.id])demo(c,s,source);else if(s.id==='credits')credits(c,s);else if(s.media)photograph(c,s,source);else graphic(c,s,logo);c.restore();}
