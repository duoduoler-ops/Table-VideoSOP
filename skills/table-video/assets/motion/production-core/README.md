# 真实制作起点

先把这个目录复制到本段工程的独立源码目录。按当前镜头剧本，在 `scene.cjs` 写本段主对象、部件关系、动作窗口和取景意图。即使只有一个图形，也可用同一个制作和交审入口。此处三件组件的检验、修整和分流只是可替换的场景示例。

- `scene.cjs` 由一个 `stateAt(t)` 给出部件尺寸、被处理部件、位置与去向；`cameraAt(t)` 读取这个最终位置；生产 `render(t)` 和 `audit-adapter.cjs` 使用同一入口。
- `parts.cjs` 是可改的具体绘制：载体用 `stage.plane`，其字段／阀闸／局部用 `stage.part(parent, spec)` 保持同一父组；它同时计算部件投影与绘制登记。把这些子件重新写成无父级的独立平面，会在斜视时被自己的底板遮住。整组退出移动共同祖先。
- 改内容、布局和时间时，保留 `space.cjs / camera.cjs / timing.cjs / motion-kit.cjs` 这几个执行模块。`scene.cjs` 里的 `approach` 就是下面的动作构造，`cameraAt(t)` 直接调用它。坐标和秒点按本段改，不要退回成逐段直线插值，也不要自己另写缓动。
- 设计图只是过程中途的截图，不是关键帧。场景由事件驱动：到达、接触、配音词点。不要在几张已确认的状态之间做插值，那样做出来就是“动→停→动”。

## 运动默认件

`motion-kit.cjs` 里的函数整理自系列认可片（第五期 D03 样片 B v4、第08期 D07 v04）的实际代码，新场景默认全部使用。某一项确实不适用（比如画面要求读字时镜头不动），就在本段运动标注里写一句原因。

| 函数 | 作用 | 典型用法 |
| --- | --- | --- |
| `ease.camera` / `cameraTiming(start, end)` | 镜头曲线：起步果断、后段长收尾，峰值约为平均速度的 2.4 倍，出现在约 26% 处 | 所有推、拉、摇、移和交接镜头。**不要用 `createTiming({start, end})` 的默认值做镜头**，它等于对称的 smoothstep，看起来像匀速 |
| `ease.reveal / travel / process / leave / fall` | 按职责的缓动：出现、转交、看过程、离场、重力下落 | 每类动作用对应的一条，不要一条曲线包办全部 |
| `chain(beats)` | 按配音词点排相邻动作：词前起势，短空档自动接成重叠；同时返回 `gaps`，即超过 0.5 秒没有任何动作的空档 | 排时间表的第一步。出片前必须把 `gaps` 处理掉：用余摆、下一动作的预备或一次有目的的镜头运动去补 |
| `actionEnvelope(t, start)` | 预备压缩 → 放出拉伸 → 一次小回正 | 物体发力、被送出、起跳。刚性卡片把形变换成同节奏的位移或倾角 |
| `press / dampedStep / sway / shake` | 接触下压、受力阶跃（带一次过冲）、余摆、落地震动 | 接触、受力、挂件；震动只用于有分量的接触 |
| `respond(t, events, fn, {lag})` + `LAG` | 把多次接触引起的反应叠加起来，近处晚 3 帧、远处晚 7 帧 | 附属件、底座、接收方对原因的回应 |
| `drop(t, t0, t1, height)` | 有分量的落体：重力加速，接触压缩 9%、回弹 −2.5%，附属件晚 3 帧 | 物件落下、砸到。下落至少要能看见 0.3 秒 |

本例的用法：运送途中工件沿弧线带一点滚转；到位时工件下压，台面晚 3 帧受力；刀具下切前先抬一下；废料按重力落进料斗并弹一下；发出前先往后收一点再走；接收盘晚 3 帧受压。相邻阶段在交接处互相重叠，下一阶段在上一阶段收尾时就已经开始。

```js
const {cubicPath, createCameraMove} = require('./camera.cjs');
const {cameraTiming} = require('./motion-kit.cjs');
const approach = createCameraMove({
  positionPath: cubicPath([[-560,-110,-1120], [-490,-150,-1240], [-155,-120,-500], [-25,-30,-440]]),
  targetPath: cubicPath([[-460,0,160], [-320,-15,110], [-90,10,75], [0,40,70]]),
  start: 1.5, end: 3.0,
  timing: cameraTiming(1.5, 3.0),   // 系列镜头曲线；不要用 createTiming 的默认 smoothstep
  viewport: {width:1280,height:720}, focalLength:1050,
});
// cameraAt(seconds) 在这个观察窗口返回 approach(seconds)。
// 跟随阶段复用 followCamera(subject=stateAt(seconds).position)，交接复用 handoffCamera。
```

本例进入检验台时沿 XYZ 弧线进入部件近读，让限值、刀具与被修整边缘同屏。修整期间镜头稳住，便于看清过程；画面里仍有刀具沿实际边缘推进、余料分离下落，不能让余料紧贴着补齐原轮廓。发出组件时从近读的实际投影接起，绑定其最终位置并逐渐拉开保留接收槽；接触前接入整体关系。纵深变化由观看任务承担，不添加周期起伏。需要正面比较的内容应换自己的观察安排。

同一载体的字段直接沿用这条调用，不另算屏幕坐标：

```js
const board = {id:'current', geometry:{center:[0,0,40], width:440, height:260}};
stage.plane({...board, html:'', style:{background:'#fff'}});
stage.part(board, {id:'current.price', box:{x:160,y:80,width:100,height:60}, html:'45'});
```

## 使用已有运行环境

需要已有 React / Remotion / `@remotion/bundler` / `@remotion/renderer` 与浏览器，工具不会安装或下载。下列路径填当前机器真实位置，输出目录必须是新的版本：

```powershell
node .\render.cjs --runtime="<已有 node_modules>" --browser="<已有 Chromium 程序>" --skill-root="<table-video 包目录>" --out="<本段工程\preview-v01>" --video
```

`--video` 从此次冻结的源码渲染 `preview.mp4`，随即用同一源码、输入、删层选择与实际视频生成 `motion-report.json`；`render-manifest.json` 记录对应版本。复制到项目后用 `--skill-root` 指向实际 Skill 包；在包内直接调用可以省略。默认静帧取首尾及剧本检查点，可用 `--frames=0,12,24` 指定实际帧号；只导静帧时省略 `--video`。每次用新输出目录，长渲染每 30 秒写日志。

`--input=<本段工程内的 JSON>` 可覆盖示例的 `parts / limit / repairCapacity / labels / windows / config`；`--audio=<采用音频>` 复制已有文件，起点从本段 0 时刻计算。改题时将实际主对象 ID 写在 `scene.coverage.mainContentIds`，时间线的 `actions / relays / checkpoints` 指向真实部件及事件。绘制登记会收集所有编码帧里出现的对象，包括中途入场的部件。固定取景窗口使用 `timeline.motionCast.cameraWindows` 的 `role: 'fixed'`；有意硬切在 `checkpoints` 声明切点、受影响的整个场景和依据。

正式交审使用同目录的视频和报告。有具体运动疑点或出入场边界时，打开 `review-frames/frames.html` 可按对象和秒点看成片解码的前后帧，点图看原尺寸；没有目标时跳过抽帧。缺少 FFmpeg／FFprobe 等取证条件时，报告保留失败原因。退出码 0 表示已测硬要求满足且诊断待复核；1 表示输入或覆盖不完整；2 表示硬要求失败或有具体工程疑点。已知错误先修，覆盖不到的属性通过该版像素或实际连续审看补查。三种结果都不代表已正常速度看过成片。

本入口冻结独立源码目录中的脚本、样式、JSON 和图形／字体资源，以及同目录下相应的子模块。源码使用实体目录；依赖目录、隐藏目录、本次及以往的渲染输出排除在快照之外。已有独立引擎可保留原渲染器，按其生产入口向检查工具提供该版画面及真实状态。

例如 `repairCapacity: 0` 会保留超长件并送入返修；将超长值从 b 移到 a 会实际改变刀具对准的行与被修整的条。只改 `labels` 不改变处理和结果。新增关系应改状态与绘制，不靠改标签冒充新内容。

## 证据边界

透视矩阵与屏幕坐标可检查路径、部件进度和观察范围，**不能证明对象像素可见**。本入口的可见性保留 `unknown`；`--omit=kit.part.b` 可另渲染指定帧做真实删层差分，证据仅适用于那些帧。任意 ID 缺失、动作覆盖与接力缺项应继续报告。真实关键帧和完整 1× 播放分别检查，编码成功/数值通过不写为效果通过。

平面组排序适合不交叉的卡片与分层 MG，不提供深度缓冲；近平面穿越会停止绘制该平面并保留未知，不当作“看不见已通过”。若物体交穿、自遮挡或需要侧面网格，换对应的真实渲染实现，不用 bbox 填假可见结论。

新代码采用仓库 MIT 许可。几何约定和跟随机制参考本项目已有空间候选与 ep07 过程；不包含历史视频、声音、图形资产，不继承来源片的认可状态。示例内容与坐标为本次原创开发验证。
