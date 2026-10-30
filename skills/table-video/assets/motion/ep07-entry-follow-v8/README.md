# 真实入场、主体跟随与到达前拉全景：v07 → v08

本例保存第 7 期 13.2 秒试验的完整 SVG 场景与相机。用户看过 v08 后反馈“这次做的算是合格了”；确认只覆盖该试验实际文件和本次修正，不是其它片段、风格或速度的通用通过。助手未完成该视频的 1× 连续审看和审听。原声、成片、字幕、私人图片、字体及依赖不打包。

## 何时借用

需要从现有对象拆出副本、展开接收区，或镜头须跟随交付并拉开比较时，先读场景中的完整关系。不要只取 easing、时长或最后一张构图。没有这些关系时不强套复制、折纸或备份动作。

| 旧实现的实际问题 | 本例的修法与源码入口 | 新内容要重新确定 |
| --- | --- | --- |
| 卡片、折面和连线在空位直接出现，或只有整组透明度 | `frameAt`：第二排从第一排原位置复制；折面从零面积展开；接收区先展开；新图形从画外进入 | 来源、第一可见帧、遮挡、接收与退场；原本已在场者无需重复入场 |
| 参数在变，生产渲染器却已把整条线画满 | `linePrefix`：按累计长度截取实际路径；零进度不输出路径 | 真实路径形状、端点和渲染后端；支持命令限大写 M/L/H/V/C |
| 镜头和主物件各走一条缓慢曲线，观看目标飘移 | `carrierAt` → `cameraAt` → `followCarrier`：先求物件最终位置，再用屏幕锚点反求相机 | 本次配音窗口、屏幕距离、字大小和落点；不能只缩短所有镜头 |
| v07 按当时旧剧本保持末段固定取景；本轮用户授权加入跟随转全景 | `cameraAt`：副本尚在到达时开始拉全景，交给原件／副本与新旧步骤比较 | 到达前可用交接窗口、原件与目标同时可见范围、最终阅读停顿 |

旧问题不是“没写缓动”就能解释：真实入场、共享对象来源、相机与主体关系，以及渲染后的像素证据曾没有接起来。v06 曾有主体跟随，但耗时 1.62 秒；v07 改成独立 cosine 曲线，返修时丢失了有效关联。v08 恢复关联并重算动作窗口。该例保留必要辨认和收束，不以常驻运镜消灭所有停顿。

## 源码与时基

- [完整场景](src/scene.cjs)：`frameAt(seconds)` 返回 SVG 和同源对象／相机状态；`linePrefix` 真实绘制路径前缀，仅支持大写 M/L/H/V/C，允许带符号小数及科学计数。Q/A/Z、小写命令或未知字符直接报错，不能静默忽略后画成错误路径。迁移其它 SVG 命令须明确转换或扩展实现并验证。
- [相机](src/camera.cjs)：`followCarrier`、`mixCam`、`cameraAt` 与 `CAMERA_EVENTS`。生产调用传入实际主体位置；fallback 仅用于独立取样，迁移对象轨迹时须同步更新或移除。
- [图形部件](src/mg-primitives.cjs)：代码绘制图标，无外部图片。
- [定位与审计适配器](src/state.cjs)：`state(seconds)` 供定位器直接取样；`exportAudit({videoFile})` 从同一场景的真实对象边界叠加最终相机，输出 `motion-audit.mjs` 接受的屏幕状态。缺席和完全在画外的 ID 保留为透明；不另写理想轨迹。
- [来源](provenance.json)记录原文件摘要与改动；[清单](manifest.json)记录边界。所有秒点均是本例局部秒，60 fps，F0 = 0，帧 0–791；13.2 秒只用于结束接点。

本例两次主体跟随为 3.34–4.08、6.32–7.10 秒；最后 10.76–11.20 秒收近，11.20–12.00 秒跟随，12.00–12.56 秒拉全景，与副本到达 12.12 秒重叠，12.56–13.20 秒保留全景比较。这些是实例事件，不能升级成通用时长或动作配额。

## 取用与检查

从 SOP 或 Skill 包根运行定位器，结果含具体源码锚点、摘要和实际状态：

```text
node scripts/process-locate.mjs --relation 入场,跟随,拉全景 --sample
node assets/motion/ep07-entry-follow-v8/verify.cjs
```

第二条不依赖第三方包，检查完整 792 帧确定性、ID、原位复制、折面真实面积、路径前缀几何、实际相机绑定、接点与末段构图边界。它只复核本例，不给新内容打分，也不能确认像素入场或 1× 观感。

已有 sharp 时，使用与本次生产渲染相同的运行时，检查实际 SVG 路径的像素及反例；不安装依赖：

```text
node assets/motion/ep07-entry-follow-v8/verify.cjs --runtime <已有node_modules> --out <项目内新报告.json>
node assets/motion/ep07-entry-follow-v8/render-frame.cjs --seconds 11.6 --out <项目内新文件.svg>
node assets/motion/ep07-entry-follow-v8/render-frame.cjs --seconds 11.6 --runtime <已有node_modules> --out <项目内新文件.png>
```

像素检查隔离场景真实路径组，量测首帧／中间／完成状态和终端区域；并用完整线冒充中间态、旧 normalized `pathLength` + round dash 作为反例。同一渲染器必须拒绝完整线反例；旧 normalized dash 是否复现会单独报告，因为不同 SVG 后端可能有不同支持。当前生产后端 sharp 0.35.5／librsvg 2.63.2 已复现并拒绝旧反例。缺 `--runtime` 时像素项明确是 `not-run`，不得写成通过。

`--out` 与帧输出均拒绝覆盖，父目录须存在。验证退出 0 仅表示本次请求的检查成功；退出 1 表示失败或依赖缺失。SVG/PNG 是便于迁移的过程证据，不能冒充完整播放。原视频本轮没有重新渲染；新项目仍须按实际输出核对过程、配音、阅读与 1× 观感。

代码以仓库 MIT 许可使用，说明文字按仓库 CC BY 4.0；原片用户确认不自动授权任何包外媒体。

## 接入现有运动审计

`exportAudit` 直接带出源码中的 ACTIONS、CHECKPOINTS、RELAYS 和 `camera.cjs` 的 CAMERA_EVENTS；源 `process` 仅将原声明的宽／高变化映射为审计器的几何 `reveal`，不会豁免空间位移。阅读停顿引用源代码原理由，仍需实际阅读复核，不自动放行。图形边界不是着色区域；曲线揭示、折面、裁切、遮挡和文本不由边界审计证明。

复制本例到项目后，在它旁边放 `motion-audit-adapter.cjs`，将视频路径换成本次实际候选：

```javascript
const example=require('./ep07-entry-follow-v8/src/state.cjs');
module.exports.exportAudit=()=>example.exportAudit({videoFile:'./实际候选.mp4'});
```

然后从 SOP 或 Skill 包根运行现有工具，输出用新文件名：

```text
node scripts/motion-audit.mjs --adapter <项目/motion-audit-adapter.cjs> --out <项目/新审计.json>
```

包内没有视频，直接对包内 `state.cjs` 运行交付审计会因缺少 `videoFile` 失败，这是有意保留的来源绑定。源码探索可调用 `auditMotion(example.exportAudit(), {requireVideo:false})`，其结果不含视频锁，不能当交付检查。退出 0 只表示声明范围未定位到疑点；2 表示有待修／待核疑点；1 表示输入失效或覆盖未测成。已获用户认可的例子也可能有数值疑点，应保留并核实，不能修改适配器把它们清成通过。

本例当前会报告 `copy-pass @ 11.6s` 的单对象屏幕归零：跟随镜头将副本固定在屏幕锚点，它仍在世界空间向备份端运动。保留这个检查结果，对照原件、目标及背景的相对运动；单对象的屏幕停留不能直接等同整场停顿。相机抵消、真实静止和遮挡仍须结合实际输出区分，不能据本例添加通用“跟随免检”。
