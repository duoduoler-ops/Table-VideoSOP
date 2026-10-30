// 2026-09-25 D06 整段动态：唯一时间表。T＝段内局部秒（段首 03:44.166＝00:00.000），60fps；全片帧＝F0(13450)+round(T×60)。
// 依据：已确认的静态关键帧（src/redo-20260924/states.cjs 的构图与相机）＋原配音自动词点（06_审片与QA/…/D06_原声自动词点_动态20260925.json，Windows SAPI，未人工听核）。
// 受关键词约束的揭示不早于词点起音；预备、过渡和镜头引导可提前。所有秒点渲染后按实际编码帧复核（verify.cjs）。
const D = require('./example-data.json');
const Q = D.quotes;

const F0 = 13450, FPS = 60, FRAMES = 2164, DUR = FRAMES / FPS; // 36.0667 秒
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeSine = x => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
const easeIO = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function bez(x1, y1, x2, y2) {
  return x => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, s = x;
    for (let i = 0; i < 40; i++) { s = (lo + hi) / 2; const cx = 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3; if (cx < x) lo = s; else hi = s; }
    return 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s * s * (1 - s) + s ** 3; };
}
const reveal = bez(0.16, 1, 0.3, 1), travel = bez(0.22, 0.72, 0.22, 1); // DESIGN B3：出现／到位、主体传递
// 接触后一次轻压回正（B3：约 9% 压缩后一次约 2.5% 小回正）
function squash(k) { if (k <= 0 || k >= 1) return 0; if (k < 0.3) return reveal(k / 0.3); if (k < 0.65) return lerp(1, -0.25, easeIO((k - 0.3) / 0.35)); return lerp(-0.25, 0, easeIO((k - 0.65) / 0.35)); }
const L2 = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
const qbez = (p0, p1, p2, k) => [0, 1].map(i => (1 - k) ** 2 * p0[i] + 2 * (1 - k) * k * p1[i] + k * k * p2[i]);

// ---------- 镜头段落 ----------
const SHOTS = [
  {id: 'S1', srt: '120–123', a: 0.000, b: 7.434},
  {id: 'S2', srt: '124–126', a: 7.434, b: 15.267},
  {id: 'S3', srt: '127–128', a: 15.267, b: 18.434},
  {id: 'S4', srt: '129–132', a: 18.434, b: 24.600, tag: 'G01'},
  {id: 'S5', srt: '133–137', a: 24.600, b: 34.400},
  {id: 'S6', srt: '137 后空隙', a: 34.400, b: DUR, tag: 'CH05 章卡'},
];
const S2 = 7.434, S3 = 15.267, S4 = 18.434, S5 = 24.600, S6 = 34.400;

// ---------- 自动词点（段内秒；SAPI 候选，未人工听核）：动作所依的关键词 ----------
const WORDS = {
  xuanding: 0.26, xiangmuguize: 1.38, dudao: 2.22, jingyan: 3.08, shengtu1: 4.71, tishici: 5.76, xiehao: 6.59,
  shengtu2: 7.68, ziji: 8.05, yishi: 10.22, haoyixie: 12.51, sheng: 13.87, yongliang: 14.43,
  google: 16.18, flow: 16.56, shengqian: 17.70, xingxiang: 20.52, xiugai: 23.65, bufen: 24.03,
  qita: 25.78, moxing: 26.53, tishici2: 27.26, butong: 28.06, zhendui: 29.72, googleflow2: 30.03,
  qitagongju: 31.39, du: 32.94, guanfang: 33.42, speechEnd: 34.39,
};

// ---------- 世界常量（与静态关键帧一致） ----------
const PLATE = {ox: -207, oy: -3300};
const GZ = {x: 2780, y: 2990}, OZX = 3320, DOCX = 4160, V8 = {x: 2100, y: 3450}; // V8 与 scenes.jsx 一致（动态版移到新旧两卡下方，缩短镜头行程）
const CWp = {x: 2620, y: 1700};
const COMP = {x: 2682, top: 2046}; // 撑开后的输入框左上（附件 +22,+22）
const IMG_SLIP = {lines: [Q.imgFirst + '…', Q.role1, Q.role2], teethOff: true, w: 460};
const ACT_SLIP = {header: '动作合同', headerTone: 'ink', headerSize: 27, lines: [Q.act1, Q.act2, Q.act3], kind: 'flow', w: 470};
const FLOW_LINES = [Q.vidFirst, Q.camera, Q.action, Q.sound];
const SLIP_FLOW = {header: 'Google Flow', rows: [{role: '场景', text: Q.vidInput}, {role: '身份', text: Q.lockId}, {role: '画风', text: Q.style}], flow: FLOW_LINES, kind: 'flow'};

// S1 行卡飞行（0.05–0.75）：世界坐标路径。镜头在 0–0.70 由行卡反推（行卡在画面上从 D05 位置平滑移到落点，背景滚动），保证全程看得见。
function cardFlight(T) {
  const k1 = easeSine(seg(T, 0.05, 0.75));
  const pre = reveal(seg(T, 0, 0.08)) * (1 - seg(T, 0.08, 0.30));
  const [X, Y0] = qbez([-73, -530], [180, 60], [100, 590], k1);
  return {X, Y: Y0 - 8 * pre, pre, k1};
}
function camS1(T) {
  const {X, Y} = cardFlight(Math.min(T, 0.75));
  const e = easeIO(seg(T, 0, 0.85)), z = lerp(1.40, 1.20, e);
  const sx = lerp(157.8, 480, e), sy = lerp(478.4, 648, e);
  return {cx: X - (sx - 960) / z, cy: Y - (sy - 540) / z, z};
}

// 2026-09-26 看片修改：两卡收回成 G01 行、回到大段表，整个放到 SRT137 尾部（TC 起 0.60 秒，34.380 落格），CH05 窗口（S6 起）镜头固定、只做泳道＋章名。
const TC = 33.780;
// 收拢：“提示词文件”窗口（中心、宽高）。镜头在 0–0.60 由窗口反推，保证它全程在画面里，随后停在章卡构图。
function morphS6(x) {
  const chip = [V8.x + 160 + 300 + 35, V8.y + 150 + 5 * 56 + 23];
  const w = x < 0.25 ? lerp(1080, 600, easeIO(seg(x, 0.02, 0.25))) : lerp(600, 120, easeIO(seg(x, 0.25, 0.60)));
  const h = x < 0.25 ? lerp(440, 90, easeIO(seg(x, 0.00, 0.22))) : lerp(90, 46, easeIO(seg(x, 0.25, 0.60)));
  const k = easeSine(seg(x, 0.15, 0.60)), [cx, cy] = qbez([2810, 3200], [2760, 3700], chip, k);
  return {cx, cy, w, h};
}
// 起点接重排推近的镜头 (3000,3240,Z1.20)：窗口起点在画面 ((2810−3000)×1.2+960, (3200−3240)×1.2+540)
function camS6(x) {
  const m = morphS6(Math.min(x, 0.60)), e = easeSine(seg(x, 0.15, 0.60)), z = lerp(1.20, 1.0, easeIO(seg(x, 0, 0.60)));
  const sx = lerp((2810 - 3000) * 1.20 + 960, 495, e), sy = lerp((3200 - 3240) * 1.20 + 540, 453, e);
  return {cx: m.cx - (sx - 960) / z, cy: m.cy - (sy - 540) / z, z};
}

// ---------- 镜头：关键点 [T, cx, cy, z, 中途拉开量] ，相邻关键点之间用一条 ease-in-out-cubic ----------
const CAM = [
  [0.000, 500, -486, 1.40], [0.850, 500, 500, 1.20], [2.200, 500, 500, 1.20], [3.300, 600, 1110, 1.10], [3.500, 600, 1110, 1.10],
  [4.600, 1560, 1560, 0.90], [5.600, 1620, 1640, 0.92], [6.400, 1770, 2150, 1.30],
  [S2 + 0.300, 1770, 2150, 1.30], [S2 + 1.300, 2640, 2120, 0.74], [S2 + 1.500, 2640, 2120, 0.74], [S2 + 2.300, 3150, 2170, 1.50], [S2 + 2.800, 3150, 2170, 1.50],
  [S2 + 3.500, 3150, 2030, 1.15], [S2 + 5.600, 3150, 2030, 1.15], [S2 + 6.300, 2950, 2100, 1.80], [S2 + 7.300, 2950, 2100, 1.80],
  [S3 + 1.000, 2750, 3130, 0.90], [S3 + 2.000, 2750, 3130, 0.90], [S3 + 2.500, 3160, 3560, 1.00], [S4, 3160, 3700, 1.00],
  [S4 + 4.800, 3160, 3700, 1.00], [S4 + 5.600, 2080, 3290, 0.95], [S5, 2080, 3290, 0.95],
  [S5 + 1.200, 2500, 3440, 0.66], [S5 + 2.700, 2500, 3440, 0.66], [S5 + 3.500, 3080, 3250, 1.15], [S5 + 4.000, 3080, 3250, 1.15],
  [S5 + 5.000, 1000, 3480, 1.00], [S5 + 6.300, 1000, 3480, 1.00], [S5 + 7.200, 3700, 3230, 0.95], [S5 + 8.250, 3700, 3230, 0.95],
  [S5 + 8.750, 3000, 3240, 1.20], [TC, 3000, 3240, 1.20],
  [TC + 0.600, V8.x + 960, V8.y + 540, 1.00], [DUR, V8.x + 960, V8.y + 540, 1.00],
];
function cam(t) {
  if (t < 0.85) return camS1(t);
  if (t >= TC && t < TC + 0.60) return camS6(t - TC);
  if (t <= CAM[0][0]) return {cx: CAM[0][1], cy: CAM[0][2], z: CAM[0][3]};
  for (let i = 1; i < CAM.length; i++) if (t <= CAM[i][0]) {
    const a = CAM[i - 1], b = CAM[i], e = easeIO(seg(t, a[0], b[0]));
    return {cx: lerp(a[1], b[1], e), cy: lerp(a[2], b[2], e), z: lerp(a[3], b[3], e) - (b[4] || 0) * Math.sin(Math.PI * e)};
  }
  const k = CAM[CAM.length - 1]; return {cx: k[1], cy: k[2], z: k[3]};
}

// ---------- 每一帧的对象状态 ----------
function pAt(T) {
  const c = cam(T), p = {cam: c};
  const s = T - S2, u = T - S3, v = T - S4, w = T - S5, x = T - S6, xc = T - TC;

  // ===== S1：D05 末帧 → 行卡脱出 → 规则 → 经验 → 写出提示词 =====
  if (T < 1.0) p.plate = {...PLATE, detached: true, cursor: false};
  // AGENTS.md：条目亮起、其余压暗
  p.agents = {dimK: seg(T, 1.35, 1.60), trigK: reveal(seg(T, WORDS.xiangmuguize + 0.02, 1.55)), fileK: reveal(seg(T, 1.60, 1.75))};
  // 经验页：3.20 碰标题亮框、标题高亮；S5 第 6 节高亮
  const sec6K = reveal(seg(w, WORDS.zhendui - S5 + 0.00, WORDS.zhendui - S5 + 0.18)) * (1 - seg(w, 6.3, 6.8));
  p.heidan = {litK: reveal(seg(T, 3.20, 3.35)) * (1 - seg(T, 3.40, 3.80)), titleK: reveal(seg(T, 3.20, 3.35)) * (1 - seg(T, 4.60, 5.00)), sec6K};

  // G01 行卡
  if (T < 4.25) {
    let X, Y, rot, sc, wid, lift, o = 1;
    if (T < 0.75) {
      const cf = cardFlight(T), pre = cf.pre; X = cf.X; Y = cf.Y;
      rot = T < 0.40 ? lerp(-1.2, 2, easeIO(seg(T, 0.05, 0.40))) : lerp(2, 0, easeIO(seg(T, 0.40, 0.75)));
      sc = lerp(1.03, 1.0, easeIO(seg(T, 0.05, 0.75))); wid = lerp(1760, 860, easeIO(seg(T, 0.05, 0.70))); lift = lerp(1 + 0.3 * pre, 0.25, easeIO(seg(T, 0.08, 0.75)));
    } else if (T < 2.30) {
      const st = seg(T, 0.75, 0.93), bump = -6 * Math.sin(Math.PI * st) * (1 - st);
      const jolt = -6 * Math.sin(Math.PI * seg(T, 2.10, 2.22));
      X = 100; Y = 590 + bump + jolt; rot = 0; sc = 1; lift = 0.25 + 0.35 * seg(T, 2.10, 2.30);
      wid = lerp(860, 520, easeIO(seg(T, 2.10 + 7 / 60, 2.40 + 7 / 60)));
    } else if (T < 3.40) {
      const k = travel(seg(T, 2.30, 3.20));
      [X, Y] = qbez([100, 590], [330, 1000], [708, 1104], k); rot = lerp(0, -2, k); sc = 1; lift = 0.6;
      wid = lerp(860, 520, easeIO(seg(T, 2.10 + 7 / 60, 2.40 + 7 / 60)));
      const st = seg(T, 3.20, 3.36); Y += -5 * Math.sin(Math.PI * st) * (1 - st);
    } else {
      const k = travel(seg(T, 3.40, 4.10));
      [X, Y] = qbez([708, 1104], [960, 1150], [1224, 1102], k); rot = lerp(-2, 0, k); sc = 1; lift = lerp(0.6, 0.2, k); wid = 520;
      o = 1 - seg(T, 4.10, 4.25);
    }
    p.g01 = {x: X, y: Y, w: wid, rot, s: sc, cs: 1, lift, o}; // 勾选框与 D05 一样只随行平移、不缩放
  }
  // 光标：D05 按住行卡的那只手；行卡飞走后原地淡出
  if (T < 0.35) p.cursor = {x: PLATE.ox + 334, y: PLATE.oy + 2806, k: 1, o: 1 - seg(T, 0.10, 0.30)};
  // 路由线：钩住（1.80–2.10）→ 带行卡去经验页（晚 7 帧画出）→ 去提示词文件
  p.routes = [];
  if (T >= 1.80 && T < S2 + 1.0) {
    p.routes.push({d: 'M191 527 C 191 552 191 566 191 588', p: travel(seg(T, 1.80, 2.10))});
    p.dots = [{x: 191, y: 527, r: 8 * reveal(seg(T, 1.78, 1.86))}];
    if (T >= 2.30) p.routes.push({d: 'M191 527 C 180 760 480 900 650 1122', p: travel(seg(T, 2.30 + 7 / 60, 3.20 + 7 / 60))});
    if (T >= 3.40) p.routes.push({d: 'M660 1146 C 860 1146 1000 1120 1172 1120', p: travel(seg(T, 3.40 + 7 / 60, 4.10 + 7 / 60))});
  }

  // 提示词文件：展开 → 逐段写出 → 三段职责 → S3 起视频段职责 → S5 Flow 专属标灰
  const unfoldW = lerp(564, 1000, easeIO(seg(T, 4.10, 4.40))), unfoldH = lerp(84, 3600, easeIO(seg(T, 4.30, 4.75)));
  const prompt = {
    o: T < 4.10 ? 0 : 1, nameK: seg(T, 4.40, 4.60), unfold: T < 4.75 ? {w: unfoldW, h: unfoldH} : null,
    reveal: T < 4.60 ? 0.012 : lerp(0.012, 1, seg(T, 4.60, 6.90)), caret: T >= 4.10 && T < 6.95,
    focus: ['roleHead', 'role1', 'role2', 'role3a', 'role3b'], dimK: seg(T, 5.95, 6.30) * (1 - seg(s, 0.30, 0.80)),
    roleK: seg(T, 6.00, 6.35),
    roleChips: [reveal(seg(T, 6.00, 6.15)), reveal(seg(T, 6.16, 6.31)), reveal(seg(T, 6.32, 6.47))],
    vidRoleK: [reveal(seg(u, 0.40, 0.55)), reveal(seg(u, 0.47, 0.62)), reveal(seg(u, 0.54, 0.69))],
    flowCount: 16 * seg(w, 0.80, 1.40),
    idK: reveal(seg(v, 5.40, 5.60)) * (1 - seg(w, 0.20, 0.50)),
  };
  if (T >= TC) prompt.o = 1 - seg(xc, 0.00, 0.12);
  p.prompt = prompt;
  if (T >= TC + 0.15) { p.wp = false; p.hideDocs = true; }

  // 参考图卡：S1 贴到文件右侧 → S2 飞进 ChatGPT 输入框
  if (T >= 6.20 && s < 2.05) {
    const inA = reveal(seg(T, 6.20, 6.55)), inB = reveal(seg(T, 6.30, 6.65));
    const ka = travel(seg(s, 0.70, 1.90)), kb = travel(seg(s, 0.75, 2.00));
    const la = reveal(seg(s, 0.50, 0.70)) * (1 - ka), lb = reveal(seg(s, 0.55, 0.75)) * (1 - kb);
    const [ax, ay] = qbez([2226, 1880], [2500, 1760], [2704, 2068], ka), [bx, by] = qbez([2226, 2112], [2520, 2020], [2842, 2068], kb);
    p.refs = [
      {kind: 'id', x: ax + 160 * (1 - inA), y: ay - 10 * la, w: lerp(240, 120, ka), h: lerp(176, 120, ka), label: '身份', rot: lerp(2, 0, ka) + 3 * Math.sin(Math.PI * ka), lift: 22 * la + 10 * Math.sin(Math.PI * ka), style: {opacity: inA * (1 - seg(s, 1.88, 2.02))}},
      {kind: 'file', x: bx + 160 * (1 - inB), y: by - 10 * lb, w: 240, h: lerp(140, 120, kb), name: '画风_STYLE_2.png', label: '画风', rot: lerp(-2, 0, kb) - 3 * Math.sin(Math.PI * kb), lift: 18 * lb + 10 * Math.sin(Math.PI * kb), style: {opacity: inB * (1 - seg(s, 1.95, 2.08))}},
    ];
  }

  // ===== S2：ChatGPT =====
  if (s > 0.25 && u < 1.2) {
    p.demoTag = reveal(seg(s, 0.30, 0.50)) * (1 - seg(u, 0.40, 0.60));
    const sent = seg(s, 2.78, 2.95);
    p.chat = {dx: 700 * (1 - reveal(seg(s, 0.30, 1.10))), attachK: easeIO(seg(s, 1.85, 2.10)) * (1 - sent), textK: seg(s, 1.95, 2.10) * (1 - sent), send: s >= 1.95 && s < 2.80,
      press: Math.sin(Math.PI * seg(s, 2.70, 2.82)), sentK: reveal(seg(s, 2.80, 3.10)), genVis: seg(s, 2.95, 3.20), genP: seg(s, 3.20, 5.60),
      doneK: reveal(seg(s, 5.60, 5.75)), dlPress: Math.sin(Math.PI * seg(s, 5.95, 6.07)), hideImg: seg(u, 0.10, 0.40)};
    p.fileLabel = {o: reveal(seg(s, 6.10, 6.40)) * (1 - seg(u, 0.10, 0.30))};
    // 生图提示词副本：从代码块浮起，飞进输入框变成输入文字
    if (s > 0.55 && s < 2.10) {
      const k = travel(seg(s, 0.80, 1.95));
      const [sx, sy] = qbez([1500, 1780], [2300, 2360], [2748, 2238], k);
      p.slips = [{x: sx, y: sy, ...IMG_SLIP, rot: 3 * Math.sin(Math.PI * k), lift: 18 * Math.sin(Math.PI * k) + 6, s: lerp(1, 0.55, k), opacity: seg(s, 0.60, 0.75) * (1 - seg(s, 1.90, 2.05)), style: {transformOrigin: '0 0'}}];
    }
    // 用户的光标：点发送 → 点下载
    const kk = c.z;
    if (s >= 2.20 && s < 3.20) {
      const m = easeIO(seg(s, 2.30, 2.65));
      p.cursor = {x: lerp(3380, 3592, m), y: lerp(2330, 2268, m), k: kk, press: Math.sin(Math.PI * seg(s, 2.70, 2.82)), o: seg(s, 2.20, 2.30) * (1 - seg(s, 3.00, 3.20))};
    } else if (s >= 5.55 && s < 6.60) {
      const m = easeIO(seg(s, 5.65, 5.93));
      p.cursor = {x: lerp(3040, 3130, m), y: lerp(2150, 1984, m), k: kk, press: Math.sin(Math.PI * seg(s, 5.95, 6.07)), o: seg(s, 5.55, 5.65) * (1 - seg(s, 6.40, 6.60))};
    }
  }

  // ===== S3：Flow =====
  if (u > -0.5 && w < 1.3) {
    const exit = travel(seg(w, 0.40, 1.20));
    p.flow = {x: GZ.x + 900 * exit, y: GZ.y + 300 * exit, opacity: 1 - seg(w, 0.60, 1.20), progress: seg(u, 1.40, 2.10), tray: u >= 1.30 ? 'firstFrame' : null};
  }
  if (u >= 0.10 && u < 1.32) {
    const k = travel(seg(u, 0.20, 1.30));
    const [ix, iy] = qbez([2682, 1946], [3050, 2500], [3160, 3014], k);
    p.imgs = [{img: 'firstFrame', x: ix, y: iy, w: lerp(480, 352, k), h: lerp(270, 198, k), rot: 3 * Math.sin(Math.PI * k), lift: 18 * Math.sin(Math.PI * k)}];
  }
  if (u >= 0.40 && w < 0) {
    const k = travel(seg(u, 0.50, 1.40)), dock = squash(seg(u, 1.40, 1.62));
    const sx = lerp(2000, 2290, k), sy = lerp(3440, 3120, k);
    p.slips = [...(p.slips || []), {x: sx, y: sy, ...ACT_SLIP, rot: -1 * Math.sin(Math.PI * k), lift: 12 * Math.sin(Math.PI * k), squash: dock, opacity: seg(u, 0.40, 0.55) * (1 - seg(v, 4.80, 5.20))}];
  }
  // 出片：小片 → 放大到满画面 → 播放 G01 → 缩回提示词旁 → 收回出片口
  if (u >= 2.10 && w < 0.42) {
    let fx, fy, fw, o = 1;
    if (u < 2.40) { const k = reveal(seg(u, 2.10, 2.40)); fx = lerp(3010, 2840, k); fy = lerp(3440, 3478, k); fw = lerp(340, 640, k); o = seg(u, 2.10, 2.20); }
    else if (T < S4 + 4.80) { const k = easeIO(seg(u, 2.40, 3.167)); fx = lerp(2840, 2392, k); fy = lerp(3478, 3257, k); fw = lerp(640, 1536, k); }
    else if (T < S5) { const k = travel(seg(v, 4.80, 5.60)); fx = lerp(2392, 2232, k); fy = lerp(3257, 3120, k); fw = lerp(1536, 500, k); }
    else { const k = easeIO(seg(w, 0.00, 0.40)); fx = lerp(2232, 3110, k); fy = lerp(3120, 3440, k); fw = lerp(500, 120, k); o = 1 - seg(w, 0.25, 0.40); }
    p.film = {img: 'G01_f000_首帧', x: fx, y: fy, w: fw, play: true, opacity: o};
  }
  // S4 出：“身份”那段框出，小片与框之间一条短连线
  if (v >= 5.45 && w < 0.4) p.routes.push({d: 'M2228 3262 C 2200 3240 2190 3230 2162 3228', p: travel(seg(v, 5.45, 5.65)) * (1 - seg(w, 0.20, 0.40))});

  // ===== S5：换模型 → 读官方文档 → 改写 =====
  if (w >= 0.8 && T < TC + 0.15) p.brackets = [{x: 2200, y1: 3029, y2: 3935, p: easeIO(seg(w, 1.00, 1.50)) * (1 - easeIO(seg(xc, 0.00, 0.12)))}]; // 收拢开始时随文件一起收回
  if (w >= 1.45 && w < 2.85) p.chips = [{x: 2214, y: 2950, children: 'Google Flow', size: 36, style: {opacity: reveal(seg(w, 1.50, 1.65)) * (1 - seg(w, 2.50, 2.80)), transform: `translateY(${-8 * (1 - reveal(seg(w, 1.50, 1.65)))}px)`}}];
  if (w >= 1.45) {
    const k = travel(seg(w, 1.50, 2.30)), fade = T >= TC ? 1 - seg(xc, 0, 0.2) : 1;
    p.other = {x: OZX + 700 * (1 - k), opacity: seg(w, 1.50, 1.70) * fade};
  }
  if (w >= 6.55) {
    const k = travel(seg(w, 6.60, 7.30)), fade = T >= TC ? 1 - seg(xc, 0, 0.2) : 1;
    p.doc = {x: DOCX + 700 * (1 - k), y: 2960, opacity: seg(w, 6.60, 6.80) * fade, readP: seg(w, 7.60, 8.20), readO: 1 - seg(w, 8.20, 8.35), pickK: reveal(seg(w, 8.35, 8.45))};
  }
  if (w >= 5.20 && w < 6.9) p.routes.push({d: 'M1004 3480 C 1080 3480 1110 3480 1172 3480', p: travel(seg(w, 5.20, 5.70))});
  if (w >= 8.35 && T < TC) p.routes.push({d: `M${DOCX + 10} 3347 C ${DOCX - 140} 2860 3420 2860 3240 3030`, p: travel(seg(w, 8.35, 8.60)) * (1 - seg(w, 8.93, 9.13))});
  // 提示词卡：复制 → 撞口受阻 → 一份退回留底，一份按官方文档重排后插进接口（2026-09-26：重排 0.80→0.55 秒，给尾部收拢让时间）
  if (w >= 2.40 && T < TC + 0.30) {
    const k = travel(seg(w, 2.70, 3.50)), bounce = easeIO(seg(w, 3.50, 3.90));
    let bx = lerp(2150, 2820, k) - 40 * bounce, brot = -3 * bounce, bl = 14 * Math.sin(Math.PI * k) + 4;
    const hs = lerp(24, 30, easeIO(seg(w, 8.93, 9.18)));
    const shrink = T >= TC ? easeIO(seg(xc, 0.00, 0.28)) : 0, so = T >= TC ? 1 - seg(xc, 0.05, 0.25) : 1; // 收拢：两卡缩进收拢中的文件窗口
    const toM = (px, py) => [lerp(px, 2580, shrink), lerp(py, 3110, shrink)];
    if (w < 8.38) {
      const [xx, yy] = toM(bx, 3060);
      p.slips = [{x: xx, y: yy, ...SLIP_FLOW, rot: brot, lift: bl, opacity: seg(w, 2.40, 2.55)}];
    } else {
      const ko = travel(seg(w, 8.38, 8.75)), kn = travel(seg(w, 8.38, 8.93)), dock = squash(seg(w, 8.93, 9.13));
      const [ox, oy] = toM(lerp(2780, 2300, ko), 3060), [nx, ny] = toM(lerp(2780, 2848, kn), 3060);
      p.slips = [
        {x: ox, y: oy, ...SLIP_FLOW, headerSize: hs, rot: lerp(-3, 0, ko), lift: 4, s: 1 - 0.55 * shrink, opacity: so},
        {x: nx, y: ny, ...SLIP_FLOW, headerSize: hs, headerB: '其他模型', headerK: seg(w, 8.70, 8.85), rewrite: easeIO(seg(w, 8.38, 8.93)), teethK: easeIO(seg(w, 8.52, 8.93)),
          rot: lerp(-3, 0, kn), lift: 10 * (1 - seg(w, 8.93, 9.08)), lit: w < 8.98, squash: dock, s: 1 - 0.55 * shrink, opacity: so},
      ];
    }
  }

  // ===== SRT137 尾部（TC–TC+0.60）：两卡收回成 G01 行、回到大段表 =====
  if (T >= TC && T < S6) {
    // 一个“提示词文件”窗口在新旧两卡处收拢（两卡缩进窗口），窗口收成 G01 行，飞落进大段表 D06 行（0.60＝34.380 接触），变成行上的“G01”标记
    const {cx, cy, w: mw, h: mh} = morphS6(xc);
    if (xc < 0.61) p.morph = {x: cx - mw / 2, y: cy - mh / 2, w: mw, h: mh, k: reveal(seg(xc, 0.08, 0.28)), o: seg(xc, 0.00, 0.08) * (1 - seg(xc, 0.55, 0.61))};
    p.lanes = {ext: 0, tableO: seg(xc, 0.10, 0.35), rowsO: seg(xc, 0.08, 0.30), g01: xc >= 0.58}; // 表（框与 12 行）在镜头下移时淡入
  }
  // ===== S6：CH05“分段制作”（镜头固定；主动作只有 12 行抽成 12 条泳道，加章名落下、小黑蛋滑入，停稳约 0.5 秒） =====
  if (T >= S6) {
    p.lanes = {ext: seg(x, 0.05, 0.75), tableO: 1 - seg(x, 0.09, 0.45), rowsO: 1, g01: true};
    p.title = {drop: travel(seg(x, 0.50, 0.95)), squash: squash(seg(x, 0.95, 1.15)), sub: reveal(seg(x, 0.95, 1.10))};
    p.cat = travel(seg(x, 0.68, 1.15));
  }
  return p;
}

// ---------- 运动记录用的事件表（计划；T 为段内秒） ----------
const EVENTS = [
  ['S1', '接棒', '第 0 帧＝D05 末帧：生视频段落推荐表，G01 行被拎起（D05 源码版式重建），镜头 Z1.40', 0, null],
  ['S1', '主动作', 'G01 行卡再抬起一点后从表里脱出，沿弧线飞到 AGENTS.md 入口下方（0.75 接触页面）；行宽 1760→860，倾斜 −1.2°→+2°→0°', 0.05, 0.75],
  ['S1', '跟随', '表里原位留空；D05 的光标原地淡出', 0.10, 0.30],
  ['S1', '镜头', '由行卡反推：行卡在画面上从 D05 位置平滑移到落点，(500,−486,Z1.40)→(500,500,Z1.20)；表从上方退出、规则页从下方进入（峰值约 49 像素／帧）', 0, 0.85],
  ['S1', '主动作', '“项目规则”：真实条目触发条件高亮，其余条目压暗；1.60 文件链接“制作经验”点亮', 1.40, 1.75],
  ['S1', '主动作', '路由线从“制作经验”伸出，2.10 钩住行卡；行卡晚 7 帧收成窄行', 1.80, 2.52],
  ['S1', '主动作', '“读到我生视频的经验”：路由线带窄行下到经验页，3.20 碰到标题（经验页亮框、标题高亮）', 2.30, 3.20],
  ['S1', '镜头', '跟随下移，Z1.20→1.10', 2.20, 3.30],
  ['S1', '主动作', '窄行沿线右移到提示词文件位置，4.10–4.75 展开成 G01 提示词文件苹果框（先横后纵）', 3.40, 4.75],
  ['S1', '主动作', '文件自上而下逐段写出（光标在末行）', 4.60, 6.90],
  ['S1', '镜头', '右移并拉开到 0.90，再推近到三段职责 Z1.30', 3.50, 6.40],
  ['S1', '主动作', '三段职责高亮、其余压暗；“身份／画风／场景”标签依次贴出；参考图卡从右侧滑到行旁', 5.95, 6.65],
  ['S1', '停稳', '三段职责可读（约 1.3 秒）', 6.47, 7.73],
  ['S2', '过渡', 'ChatGPT 重绘界面从右滑入，右上“界面演示”；镜头右移并拉开 Z1.30→0.74', S2 + 0.30, S2 + 1.30],
  ['S2', '主动作', '身份图卡、画风文件卡、生图提示词副本飞进输入框（长距离约 1.2 秒）', S2 + 0.50, S2 + 2.05],
  ['S2', '镜头', '推近输入区 Z0.74→1.50', S2 + 1.50, S2 + 2.30],
  ['S2', '主动作', '输入框撑开，两张附件（带“身份”“画风”标签）入位，提示词填入', S2 + 1.85, S2 + 2.10],
  ['S2', '停稳', '输入区可读', S2 + 2.10, S2 + 2.70],
  ['S2', '次要', '光标移到发送键并点按', S2 + 2.20, S2 + 2.82],
  ['S2', '主动作', '用户消息升起；首帧自上而下由模糊变清晰（生成进度，线性）', S2 + 2.80, S2 + 5.60],
  ['S2', '镜头', '拉开到 Z1.15 看整段对话，再跟随生成结果推近到 Z1.80', S2 + 2.80, S2 + 6.30],
  ['S2', '次要', '光标点下载；真实回图文件名“G01_首帧_v01.png”出现', S2 + 5.55, S2 + 6.40],
  ['S3', '过渡', '镜头下移到“Google Flow”生成区，Z1.80→0.90', S2 + 7.30, S3 + 1.00],
  ['S3', '主动作', '首帧卡从对话里飞出落进图槽', S3 + 0.20, S3 + 1.30],
  ['S3', '主动作', '动作合同卡从文件浮出，插进左缘接口（四齿对上）', S3 + 0.40, S3 + 1.40],
  ['S3', '主动作', '进度条走满（线性）；出片口推出小片', S3 + 1.40, S3 + 2.40],
  ['S3', '主动作', 'G01 源 00:00.000 在全片 04:02.000 开始播放（静音、1×）；小片 640→1536 宽，镜头推近', S3 + 2.30, S4],
  ['S4', '插片', 'G01 实片：风掀纸（源 0.83–1.60）→ 短爪接触纸（源 f48＝2.000，全片 04:04.000）→ 压平 → 转向镜头 → 稳定', S4, S4 + 4.80],
  ['S4', '主动作', '苹果框缩回提示词文件旁；镜头拉开 Z0.95', S4 + 4.80, S4 + 5.60],
  ['S4', '主动作', '“修改”之后：“黑蛋身份锁定”那段橙框框出（“身份”标签已在），小片与框之间短连线', S4 + 5.40, S4 + 5.65],
  ['S5', '过渡', 'G01 小片收回出片口，Flow 区向右下退场；镜头拉开 Z0.66', S5, S5 + 1.20],
  ['S5', '主动作', 'Flow 专属各项自上而下标灰；括号画出；“Google Flow”标签落定', S5 + 0.80, S5 + 1.65],
  ['S5', '主动作', '“其他”之后：空白“其他模型”生成区从右滑入', S5 + 1.50, S5 + 2.30],
  ['S5', '主动作', '复制出的提示词卡右移去插接口；“不同”时撞口（四小齿对两宽齿），受阻回弹', S5 + 2.40, S5 + 3.90],
  ['S5', '镜头', '跟随卡片 Z0.66→1.15；再左移到经验页第 6 节 Z1.00', S5 + 2.70, S5 + 5.00],
  ['S5', '主动作', '“针对”之后：第 6 节“Google Flow 提示词的固定结构”高亮；橙线连到文件里的 Flow 写法', S5 + 5.12, S5 + 5.70],
  ['S5', '停稳', '经验页对照可读', S5 + 5.70, S5 + 6.30],
  ['S5', '镜头', '右移回“其他模型”一侧 Z0.95', S5 + 6.30, S5 + 7.20],
  ['S5', '主动作', '“其他工具”之后：“官方文档”卡从右侧滑到生成区旁', S5 + 6.60, S5 + 7.30],
  ['S5', '主动作', 'Agent 读文档：读取条自上而下扫过（线性）；“读”之后挑出一条写法要求，橙线连到受阻的卡', S5 + 7.60, S5 + 8.60],
  ['S5', '主动作', '原卡复制一份退回左侧留底；右边一份重排：三行职责不动，Flow 写法换成新写法，齿形变两宽齿，标题换“其他模型”', S5 + 8.38, S5 + 8.93],
  ['S5', '镜头', '推近看重排 Z1.20（新旧两卡同在画面内）；不再拉回，直接接尾部收拢', S5 + 8.25, S5 + 8.75],
  ['S5', '主动作', '新卡插进接口（两宽齿对上），轻压回正', S5 + 8.93, S5 + 9.13],
  ['S5', '停稳', '新旧两卡并排（重排全程并排可见；插入后约 0.05 秒接收拢）', S5 + 9.13, TC],
  ['S5', '过渡', '（SRT137 尾部，“官方文档”期间）新旧两卡缩进一个“提示词文件”苹果框；文件收成 G01 行，飞落进大段表 D06 行（34.380 接触），变成行上的“G01”标记；表框与 12 行淡入', TC, TC + 0.60],
  ['S5', '镜头', '由收拢中的文件反推，跟随它下移到章卡构图：(3000,3240,Z1.20)→(3060,3990,Z1.00)', TC, TC + 0.60],
  ['S6', '镜头', '固定（Z1.00），CH05 在末句后空隙内完成（对标 CH04）', S6, DUR],
  ['S6', '主动作', '12 行下移、变薄、向右拉长成 12 条泳道（自上而下各晚 1 帧）；表框淡出', S6 + 0.05, S6 + 0.75],
  ['S6', '次要', '章名卡“分段制作”从上方落下（27 帧，0.95 接触），一次轻压回正（12 帧）；副标题淡入', S6 + 0.50, S6 + 1.15],
  ['S6', '次要', '小黑蛋从右侧滑入（刚体平移＋倾斜回正）', S6 + 0.68, S6 + 1.15],
  ['S6', '停稳', '章名停稳约 0.52 秒，与 D07 首句同时交出 12 条泳道', S6 + 1.15, DUR],
];

// SFX 计划（只标秒点，不选音效、不混音）：[T, 结束T|null, 声源／含义, 对应动作]
const SFX = [
  [0.050, 0.450, '纸条脱出的轻扫', 'G01 行卡离开表格'],
  [0.750, null, '纸卡落页', 'G01 行落到规则页'],
  [1.400, null, '高亮轻点', '规则条目命中'],
  [2.100, null, '钩住', '路由线接住行卡'],
  [3.200, null, '轻碰', '碰到经验页标题'],
  [4.100, 4.750, '展开轻扫', '行卡展开成文件'],
  [4.600, 6.900, '写字轻响（间断）', '逐段写出'],
  [6.000, null, '标签落位', '“身份”'], [6.160, null, '标签落位', '“画风”'], [6.320, null, '标签落位', '“场景”'],
  [S2 + 0.500, S2 + 0.800, '拾起轻扫', '参考与提示词拿起'],
  [S2 + 1.900, null, '入位轻点', '身份图入输入框'], [S2 + 2.000, null, '入位轻点', '画风文件入输入框'],
  [S2 + 2.750, null, '发送键', '发送'],
  [S2 + 6.000, null, '下载轻点', '保存首帧'],
  [S3 + 1.300, null, '首帧入槽', '图槽'], [S3 + 1.400, null, '接口扣合', '动作合同插入'],
  [S3 + 2.100, null, '出片', '出片口推出小片'],
  [S4 + 0.233, S4 + 1.200, '风与纸颤（插片内事件；原生声已静音，总装时决定）', 'G01 风掀纸'],
  [S4 + 1.400, null, '软爪压纸', 'G01 源 f48 接触'],
  [S4 + 5.400, null, '框出轻点', '身份那段'],
  [S5 + 1.500, null, '标签落定', '“Google Flow”'],
  [S5 + 2.300, null, '生成区到位', '“其他模型”'],
  [S5 + 3.500, null, '撞口（短促、闷）', '接口对不上'],
  [S5 + 5.120, null, '高亮轻点', '经验页第 6 节'],
  [S5 + 8.350, null, '挑出轻点', '读出写法要求'],
  [S5 + 8.930, null, '插入扣合', '新写法对上接口'],
  [TC, TC + 0.250, '收拢轻扫', '两卡收进文件、文件收成行'],
  [TC + 0.600, null, '落格', 'G01 行落进 D06 行'],
  [S6 + 0.950, null, '章名落定', 'CH05'],
];

const fr = t => Math.round(t * FPS);
const fmt = t => { const m = Math.floor(t / 60), r = t - m * 60; return `${String(m).padStart(2, '0')}:${r.toFixed(3).padStart(6, '0')}`; };
const glob = t => fmt(224.166 + t);
const shotOf = t => SHOTS.find(sh => t >= sh.a && t < sh.b) || SHOTS[SHOTS.length - 1];
module.exports = {F0, FPS, FRAMES, DUR, SHOTS, WORDS, CAM, cam, pAt, TC, EVENTS, SFX, fr, fmt, glob, shotOf, clamp, lerp, easeIO, seg, V8, PLATE};
