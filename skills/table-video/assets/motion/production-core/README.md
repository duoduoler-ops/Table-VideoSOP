# 真实制作起点

先把这个目录复制到本段工程。默认入口是 `scene.cjs`：按新内容重做对象关系与布局，并将 `windows` 换成采用配音的动作窗口。示例是**三件组件按实际长度检验、只修能修的超长件、按结果进入装配或返修**；它没有正式配音，不是每类内容都要套用的剧本。

- `scene.cjs` 由一个 `stateAt(t)` 给出部件尺寸、被处理部件、位置与去向；`cameraAt(t)` 读取这个最终位置；生产 `render(t)` 和 `audit-adapter.cjs` 使用同一入口。
- `parts.cjs` 是可改的具体绘制：载体用 `stage.plane`，其字段／阀闸／局部用 `stage.part(parent, spec)` 保持同一父组；它同时计算部件投影与绘制登记。把这些子件重新写成无父级的独立平面，会在斜视时被自己的底板遮住。整组退出移动共同祖先。
- 改内容、布局和时间时保留 `space.cjs / camera.cjs / timing.cjs` 执行模块；`scene.cjs` 的 `approach` 就是下面的动作构造，`cameraAt(t)` 直接调用它。坐标和秒点按本段改，不把它退回逐段直线插值。

```js
const {cubicPath, createCameraMove} = require('./camera.cjs');
const {createTiming} = require('./timing.cjs');
const approach = createCameraMove({
  positionPath: cubicPath([[-560,-110,-1120], [-490,-150,-1240], [-155,-120,-500], [-25,-30,-440]]),
  targetPath: cubicPath([[-460,0,160], [-320,-15,110], [-90,10,75], [0,40,70]]),
  start: 1.5, end: 3.0,
  timing: createTiming({start:1.5, end:3.0}),
  viewport: {width:1280,height:720}, focalLength:1050,
});
// cameraAt(seconds) 在这个观察窗口返回 approach(seconds)。
// 跟随阶段复用 followCamera(subject=stateAt(seconds).position)，交接复用 handoffCamera。
```

本例进入检验台时沿 XYZ 弧线进入部件近读，让限值、刀具与被修整边缘同屏；修整时停稳，刀具随实际边缘推进，余料及时分离，不能紧贴补齐原轮廓。发出组件时从近读的实际投影接起，绑定其最终位置并逐渐拉开保留接收槽；接触前接入整体关系。纵深变化由观看任务承担，不添加周期起伏。需要正面比较的内容应换自己的观察安排。

同一载体的字段直接沿用这条调用，不另算屏幕坐标：

```js
const board = {id:'current', geometry:{center:[0,0,40], width:440, height:260}};
stage.plane({...board, html:'', style:{background:'#fff'}});
stage.part(board, {id:'current.price', box:{x:160,y:80,width:100,height:60}, html:'45'});
```

## 使用已有运行环境

需要已有 React / Remotion / `@remotion/bundler` / `@remotion/renderer` 与浏览器，工具不会安装或下载。下列路径填当前机器真实位置，输出目录必须是新的版本：

```powershell
node .\render.cjs --runtime="<已有 node_modules>" --browser="<已有 Chromium 程序>" --out="<本段工程\preview-v01>" --frames=0,90,150,210,285,312,360 --video
```

`--input=<JSON>` 可覆盖 `parts / limit / repairCapacity / labels / windows / config`；`--audio=<采用音频>` 只读取并复制现有文件，音频从局部 0 开始，先由本段对齐后提供。改时长或帧率时同步 `--frames`。首版保留视频、关键帧、当时源码、输入与哈希、渲染日志；同名输出不会覆盖。长渲染每 30 秒记录一次心跳。

例如 `repairCapacity: 0` 会保留超长件并送入返修；将超长值从 b 移到 a 会实际改变刀具对准的行与被修整的条。只改 `labels` 不改变处理和结果。新增关系应改状态与绘制，不靠改标签冒充新内容。

## 证据边界

透视矩阵与屏幕坐标可检查路径、部件进度和观察范围，**不能证明对象像素可见**。本入口的可见性保留 `unknown`；`--omit=kit.part.b` 可另渲染指定帧做真实删层差分，证据仅适用于那些帧。任意 ID 缺失、动作覆盖与接力缺项应继续报告。真实关键帧和完整 1× 播放分别检查，编码成功/数值通过不写为效果通过。

平面组排序适合不交叉的卡片与分层 MG，不提供深度缓冲；近平面穿越会停止绘制该平面并保留未知，不当作“看不见已通过”。若物体交穿、自遮挡或需要侧面网格，换对应的真实渲染实现，不用 bbox 填假可见结论。

新代码采用仓库 MIT 许可。几何约定和跟随机制参考本项目已有空间候选与 ep07 过程；不包含历史视频、声音、图形资产，不继承来源片的认可状态。示例内容与坐标为本次原创开发验证。
