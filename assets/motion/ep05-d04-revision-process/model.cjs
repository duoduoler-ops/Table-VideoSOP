// Pure source functions extracted without changing formulas or timing.
const data=require('./source-data.json'),TL=require('./source-timeline.cjs');
const EV=TL.EV,P=data.page,DUR=data.wave.duration,B=data.bounds;
// ---------- 曲线 ----------
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeIO = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function bez(x1, y1, x2, y2) {
  return x => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, s = x;
    for (let i = 0; i < 40; i++) { s = (lo + hi) / 2; const cx = 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3; if (cx < x) lo = s; else hi = s; }
    return 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s * s * (1 - s) + s ** 3; };
}
const reveal = bez(0.16, 1, 0.3, 1), travel = bez(0.22, 0.72, 0.22, 1);
// 动态校正：画外进场的下落用较匀的曲线，保留落点速度（末段斜率约 0.25）再接轻压；B3 主传递曲线头部过陡，从画外进场时头 0.1 秒就冲完大半
const drop = bez(0.4, 0.0, 0.6, 0.94), slide = bez(0.3, 0.0, 0.25, 1);
// 接触轻压：0→1（压）→−0.25（一次小回正）→0
function squash(k) { if (k <= 0 || k >= 1) return 0; if (k < 0.3) return reveal(k / 0.3); if (k < 0.65) return lerp(1, -0.25, easeIO((k - 0.3) / 0.35)); return lerp(-0.25, 0, easeIO((k - 0.65) / 0.35)); }
const hash = i => { const s = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return s - Math.floor(s); };

// ---------- 镜头 ----------
const S3KEYS = [[9.4, 960, 791, 1.5], [10.3, 960, 791, 1.5], [13.4, 960, 805, 1.58], [EV.push2A, 960, 805, 1.58], [EV.push2B, 960, 910, 2.3], [EV.pullA, 960, 910, 2.3], [EV.pullB, 960, 540, 1.0]];
function keyCam(keys, t) {
  if (t <= keys[0][0]) return {cx: keys[0][1], cy: keys[0][2], z: keys[0][3]};
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const a = keys[i - 1], b = keys[i], e = easeIO(seg(t, a[0], b[0])); return {cx: lerp(a[1], b[1], e), cy: lerp(a[2], b[2], e), z: lerp(a[3], b[3], e)}; }
  const k = keys[keys.length - 1]; return {cx: k[1], cy: k[2], z: k[3]};
}
function cam(t) {
  if (t < EV.cut1) { // M1：从底座全貌推近，硬切时仍在推
    const e = easeIO(seg(t, EV.push1A, EV.push1Virtual)), k = 1 / easeIO((EV.cut1 - EV.push1A) / (EV.push1Virtual - EV.push1A));
    return {cx: 960, cy: 540 + 127 * k * e, z: 1 + 1.3 * k * e};
  }
  if (t < EV.cut2) { // M2：G02 窗口，接住推近后停；趴下时推近到脸
    // 接入：二次缓出，初速＝2Δ/T，与前镜切点相对缩放速度（约 13%/秒）衔接
    const q = seg(t, EV.cut1, EV.g02SettleB), a = 1 - (1 - q) * (1 - q), b = easeIO(seg(t, EV.g02PushA, EV.g02PushB));
    return {cx: lerp(960, 925, b), cy: lerp(529, 569.2, b), z: lerp(lerp(EV.g02Z0, 1.45, a), 2.8, b)};
  }
  const c = keyCam(S3KEYS, t);
  const w = seg(t, 10.3, 10.6) * (1 - seg(t, EV.stuck - 0.4, EV.stuck + 0.1));
  if (w > 0) { // 光标位置低通（指数权重，τ≈0.35 秒，回看 1 秒），换行时不甩镜
    let s = 0, ws = 0; for (let i = 0; i <= 20; i++) { const dt = i * 0.05, wt = Math.exp(-dt / 0.35); s += caretWorld(t - dt).x * wt; ws += wt; }
    c.cx += 0.08 * (s / ws - 960) * w;
  }
  return c;
}
const toScreen = (c, x, y) => [(x - c.cx) * c.z + 960, (y - c.cy) * c.z + 540];

// ---------- 稿纸版式（页内坐标，页宽 680） ----------
const PAGE = {x: 620, y: 458, w: 680, h: 550, pad: 32};
const LAY = {title: 26, h1: 96, p: [146, 210, 248, 312], h2: 366, p5: 408, lh: 26};
// M4／V06 落版几何（画面坐标＝世界坐标，Z=1）
const DOC = {x: 1338, y: 150, s: 0.62};
const TRACK = {x: 160, w: 1380, wavY: 570, wavH: 140, srtY: 722, srtH: 48};
const STUCK_IDX = '首先你需要安装ffmpeg这是底层能力'.length;
const p5h = t => lerp(52, 26, easeIO(seg(t, EV.reflowA, EV.reflowB)));
function reading(t) {
  const c = EV.read.map(([a, b], i) => (t < a ? 0 : t >= b ? P.p[i].length : ((t - a) / (b - a)) * P.p[i].length));
  const k = seg(t, EV.p5A, EV.stuck);
  const c5 = t < EV.p5A ? 0 : (1 - (1 - k) * (1 - k)) * STUCK_IDX;
  const c5n = seg(t, EV.spliceInA, EV.spliceInB) * P.stuckAfter.length;
  return {c, c5, c5n};
}
// 光标位置（近似：每行约 33 个全角宽；只用于镜头跟随）
function caretWorld(t) {
  const r = reading(t); let para = 0, idx = 0;
  if (t >= EV.caretJumpB) { para = 5; idx = t >= EV.spliceInA ? r.c5n : r.c5; }
  else if (t >= EV.caretJumpA) { para = 5; idx = 0; }
  else { for (let i = 0; i < 4; i++) { if (r.c[i] < P.p[i].length || i === 3) { para = i; idx = r.c[i]; break; } } }
  const top = para === 5 ? LAY.p5 : LAY.p[para];
  const line = Math.floor(idx / 33), col = idx - line * 33;
  return {x: PAGE.x + PAGE.pad + col * 18, y: PAGE.y + top + line * LAY.lh + 13};
}


function pageXform(t) {
  if (t < EV.land) { const k = drop(seg(t, EV.fallA, EV.land)); return {x: lerp(560, 620, k), y: lerp(-300, 458, k), rot: lerp(-5, 0, k), s: 1, sx: 1, sy: 1}; }
  const q = squash(seg(t, EV.land, EV.landSettle));
  const d = easeIO(seg(t, EV.docA, EV.docB));
  return {x: lerp(620, DOC.x, d), y: lerp(458, DOC.y, d), rot: 0, s: lerp(1, DOC.s, d), sx: 1 + 0.03 * q, sy: 1 - 0.05 * q};
}
function pageHeight(t) { return t < EV.unfoldA ? 140 : lerp(140, PAGE.h, easeIO(seg(t, EV.unfoldA, EV.unfoldB))); }
const P5_OLD = {x: PAGE.x + 24, y: PAGE.y + LAY.p5 - 4, w: 572, h: 60};
const P5_NEW = {x: PAGE.x + 24, y: PAGE.y + LAY.p5 - 4, w: 506, h: 34};


const SEQ = P.p.join('') + [...P.stuckBefore].slice(0, STUCK_IDX).join('');
const N = [...SEQ].length, N5 = [...P.p.join('')].length;
const X0 = 58, XK = 560, DX = (XK - X0) / N, X5 = X0 + N5 * DX, WAVE_A = 17, CY = 40;
const PUNCT = /[，。、；：？！,.\s]/;
const SEQ_A = [...SEQ], SEQ_B = [...(P.p.join('') + P.stuckAfter)];
// 示意朗读波形：每个字一个“音节包”（sin² 包络），标点处归零＝停顿；载波细密。不是录音实测。
function envAt(f, rough, seq) {
  const i = Math.floor(f), fr = f - i; if (i < 0 || i >= seq.length) return 0;
  if (PUNCT.test(seq[i])) return 0.04;
  let a = (0.5 + 0.5 * hash(i)) * Math.pow(Math.sin(Math.PI * fr), 2) * 0.85 + 0.15;
  if (rough) a = a * (0.45 + 1.1 * hash(Math.floor(f * 3) + 91)) + (hash(Math.floor(f * 2) + 17) > 0.78 ? 0.35 : 0);
  return a;
}
function wavePts(xa, xb, rough, seq = SEQ_A, seed = 0) {
  const pts = [];
  for (let x = xa; x <= xb; x += 0.8) {
    const f = (x - X0) / DX, a = envAt(f, rough, seq), lam = rough ? 3.6 * (0.7 + 0.6 * hash(Math.floor(x / 5) + 5)) : 3.6;
    pts.push([x, CY - WAVE_A * Math.min(1.35, a) * Math.sin((2 * Math.PI * (x - X0 + seed)) / lam)]);
  }
  return pts;
}
// 打结：线在原地绕成几圈（每圈只前进 7px＝卡住），圈径略不齐
function knotPts(k) {
  const pts = [], TH = 3.4 * 2 * Math.PI;
  for (let th = 0; th <= TH * k; th += 0.04) { const r = 15 * (1 + 0.22 * Math.sin(1.7 * th)); pts.push([XK + 7 * th / (2 * Math.PI) + r * (1 - Math.cos(th)), CY - r * Math.sin(th)]); }
  return pts;
}
const pd = pts => pts.length ? 'M' + pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') : '';
function stripRect(t) {
  const k = easeIO(seg(t, EV.stripA, EV.stripB)), inK = reveal(seg(t, EV.stripInA, EV.stripInB));
  return {x: lerp(440, TRACK.x, k), y: lerp(932, TRACK.wavY, k) + 130 * (1 - inK), w: lerp(1040, TRACK.w, k), h: lerp(80, TRACK.wavH, k), o: 1};
}

function state(t){const r=reading(t), lagged=reading(t-EV.waveLag);return {sourceSeconds:t,paper:{id:'draft',...pageXform(t),width:PAGE.w,height:pageHeight(t)},camera:cam(t),reading:r,caret:caretWorld(t),track:{...stripRect(t),visible:t>=EV.stripInA},longSentence:{oldReadingStopped:t>=EV.stuck&&t<EV.spliceInA,oldOpacity:1-seg(t,EV.oldOutA,EV.oldOutB),newReveal:easeIO(seg(t,EV.newInA,EV.newInB)),paragraphHeight:p5h(t),circleDraw:easeIO(seg(t,EV.circleA,EV.circleB)),circleShrink:easeIO(seg(t,EV.circleShrinkA,EV.circleShrinkB)),circleOpacity:1-seg(t,EV.circleFadeA,EV.circleFadeB)},wave:{readCount:lagged.c.reduce((a,b)=>a+b,0)+lagged.c5,knot:seg(t,EV.knotA,EV.knotB),oldRemove:seg(t,EV.spliceOutA,EV.spliceOutB),newConnect:seg(t,EV.spliceInA,EV.spliceInB),lineOpacity:1-seg(t,EV.lineFadeA,EV.lineFadeB),barsStarted:t>=EV.barsA},result:{check:reveal(seg(t,EV.checkA,EV.checkB)),waveBarCount:data.wave.values.length,subtitleBlockCount:data.cues.length,fileTagsSettled:t>=Math.max(EV.wavTagSettle,EV.srtTagSettle)+.1}};}
module.exports={clamp,lerp,seg,easeIO,reveal,travel,drop,slide,squash,hash,cam,toScreen,S3KEYS,PAGE,LAY,DOC,TRACK,STUCK_IDX,p5h,reading,caretWorld,pageXform,pageHeight,P5_OLD,P5_NEW,SEQ,N,N5,X0,XK,DX,X5,WAVE_A,CY,PUNCT,SEQ_A,SEQ_B,envAt,wavePts,knotPts,pd,stripRect,state};
