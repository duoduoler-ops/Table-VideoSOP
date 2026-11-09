# 工具

## 工程运动检查

### 过程复用与屏幕运动审计

程序化动画的同一条证据链是：**匹配局部完整关系 → 读取并取样真实源码 → 适配本段动作与镜头 → 采样实际最终屏幕状态 → 对照编码帧与 1× 观看**。工程检查不能替代编码结果对照与 1× 观感审阅，也不能据此宣称画面通过。本节是操作方法权威，剧本和 QA 只引用已有条目，不另建制作状态表。

#### 1. 找到可用过程并接入本段

从[关系索引](../assets/motion/process-index.json)选择本段需要的关系名，再运行定位器：

```powershell
node scripts/process-locate.mjs --relation 接收,处理 --out '_work/D01/source-process.json'
```

- 默认输出命中的关系、未命中词、部件链 componentChain、驱动字段 driverFields、保留关系 preserve、独立入口 portableEntry 及实现锚点。需要完整保留／重算项与源码 SHA-256 时加 `--full`；需要调用包内真实函数取状态时再加 `--sample`（显式要求完整采样，输出可能很长，按需分段读）。父目录须已存在，输出用新文件名。
- 按结果含义选例：未定位用搜索／笼统反馈，多次返回仍不满意保留独立失败结果；具体依据驱动成功修订才取 D04。关系词命中不等于结局适用，不能只改字符串照搬相反含义。
- 打开命中函数及关联相机、场景源码，记录“来源关系 → 本段对象与实现入口”，实际改编起因、主变化、结果与交接，不只抄曲线。设计阶段用共享部件与动作初排核实必要状态，再展开正式实现；静帧编号不驱动动画，也不要求每张图全部停稳。
- 多个局部关系可组合。无同题材整段不等于无匹配；定位器无命中只说明当前索引未覆盖。相关候选确实不适用时，写明因果、对象职责、观看或素材条件哪里不符，保留可复用部分，自行设计未覆盖部分，按现有风险预演处理。
- 定位器退出 0 表示取得源码事实；退出 1 表示输入、索引、锚点或取样失败。它不安装依赖、不渲染，也不判断本段语义匹配。

#### 2. 让检查读取真正的渲染实现

默认从[共用制作起点](../assets/motion/production-core/README.md)的 `render(t)`／`audit-adapter.cjs` 接入，已有工程用薄适配器导出 `exportAudit()` 与 `frameAt(seconds)`。对象、动作和接力来自生产入口，不能另造理想轨迹。`renderInventory` 区分同次绘制核验与作者声明；仅填 `renderedObjectIds` 不再算已证明完整。

SVG 可用 [motion-observation.cjs](../scripts/motion-observation.cjs) 的 `createObservedScene({width,height,camera?})` 同次 `rect/polygon/raw` 绘制并登记，直接返回 `finish()` 的帧。只认证受支持的填充几何、轴向变换／矩形裁切及不透明矩形遮挡。认证绑定内存中的实际绘制记录与几何；手写 `observation.state/basis`、JSON 克隆或事后改几何均不能认证。polygon 拒绝自交／退化；raw、透视、滤镜和复杂遮挡保留 unknown，作者 bounds 不证明真实绘制范围。

输入格式见 [motion-audit.mjs](../scripts/motion-audit.mjs) 与 `--help`。旧适配器保留坐标统计并报可见性缺口；复杂引擎用最终生产帧做有范围的像素核验，不为检查重造场景。三态可见性与 `hotspot` 描述局部证据，不能冒充 1× 观感；例外仍绑定实际源码、锚点和理由。

简单动画确无经过节点或接力时（例如单一完整动作），可让相应数组为空，并在 `coverage.notApplicable.checkpoints`／`coverage.notApplicable.relays` 提供 `{sourceFile, anchor, reason}`。来源须在 `sourceFiles` 哈希范围内、锚点须实际存在，理由说明本段为什么没有该类关系；不得为过检虚构节点，也不能豁免主要动作或同时保留该组非空数组。未声明或无有效证据仍报覆盖不完整／输入失效。报告将声明列为 `attributed-not-applicable-requires-scope-review`，它只证明理由可追溯，适用性仍须人工核实。仅有 reveal 且生产采样确认可见对象没有平移、缩放或旋转、相机不变时，不因缺 transfer／camera 报漏测；所有可见对象及显现变化仍须被相应动作区间覆盖。实际移动、漏对象或漏显现区间仍报覆盖不足，不以改标签绕过检查；显现效果另与实际编码帧核对。

```powershell
node scripts/motion-audit.mjs --adapter 'project/05_制作工程/motion-audit-adapter.mjs' --out 'project/06_审片与QA/motion-audit-v01.json'
```

- 覆盖：单轴位移／尺度恒速与中段巡航只列为待核线索；普通转移／运镜的硬违例须同时满足最终屏幕包围框四角与中心的合成速度恒定、各采样点速度序列也稳定，不能因一轴或一个角点恒速就硬判。旋转变化区间无法仅凭包围框重建物质点运动，不作该硬判，并在报告列明排除区间与覆盖缺口；连续可见且可测区间不足检测窗（当前 6 个采样间隔）也报缺测，不得以速度为空宣称已测无疑点。这是数值检测所需样本量，不是镜头最短时长；仍须对照编码帧与适用的非匀速规则。
- 经过节点检查共同归零／速度跳变；交接空隙只比较与画布正面积相交的可见对象状态；持续透明、零面积或完全画外的坐标变化不能消除空等，真实显现／消失／出入画仍计入变化。旋转对象若包围范围在画外且缺旋转中心，保守标可见性未决与覆盖缺口，交接静止结果为 `null`，不得当作确定画外或已核无空等。输出主体占屏与相机范围供核实近读／拉开承诺；尺度统计本身不判断字可读或构图合格。
- 报告锁定源码与视频 SHA-256，列覆盖、容差、疑点与例外。`motionObservations` 报实际屏幕路程、最大单帧位移、峰速、走完 50%／80% 路程的时间和前四分之一窗口路程占比，并给出可见／未决帧数与 reviewFrames。objects[] 是整段轨迹，actions[] 按原动作窗口统计；多次动作优先看单次窗口，避免汇总掩盖快移。peakFrame 为全段从 0 起的生产帧号，取证仍用上述真实解码 PTS。单位为 px、px/s、秒及比例；qualityAssessment 为 not-assessed，speedThreshold 为 null，不能把统计量变成统一过快阈值。无可见性证据的运动保留为坐标观察，不据此宣称光标可辨或遮挡已核。
- 退出 **0**：声明范围已测，未触发所覆盖疑点；**2**：有已知约束违例或待核疑点；**1**：输入失效、覆盖不完整或未测成。不能把 1 当“不适用”，也不能把 0 写成“画面通过”。

有意跟拍可固定主体的屏幕位置，须结合其世界位移、来源／接收方的相对运动和取景任务判断；单对象屏幕零速不能推断整场停顿，也不能仅填“跟随”标签豁免，未核实的疑点仍保留。

#### 内部部件过程的测量范围

沿用同一 `exportAudit()`，不另建承诺表。真实部件可返回 `parentId` 及相对父容器的 `localGeometry`；内部过程在既有 `actions` 写 `kind:'process'`，`channels` 指向实际局部 x/y/width/height/rotation，或 `process` 中的 maskProgress/pathProgress/morphProgress/occlusionProgress。它们必须来自生产函数；外层卡片和相机移动不能充当内部状态变化。

`processCoverage` 逐动作区分实际内部变化与未测；`actionCoverage` 再从采样变化反查动作窗、全部跨对象接力及父部件关系，列 `uncoveredChanges`、`uncoveredRelayIds` 与待辨认关系。只挑一条 `motionGate: follow` 不覆盖其它生产接力；删掉声明也不能消掉已采样的关系。静态装饰不强迫运动，独立或因果仍按真实语义判断。参数变化不等于可见、可读或表现力通过。

#### D1 进出场、内容版本与来源关系契约

以下字段扩展审计适配器，不另建制作状态。默认动作语言和例外边界见[默认进出场与替换](../experience/视觉叙事与连续MG.md#默认进出场与替换)。工具列的是疑点，不自动判定观感失败。

- 按上述[D1边界](../experience/视觉叙事与连续MG.md#默认进出场与替换)，字幕 cue、素材内部原画面通常不登记为D1对象；确需留在适配器中时，给各 `frameAt(t).objects[]` 的同一ID逐帧提供 `d1Category`：`mg`／`overlay` 保留全部D1，`subtitle-cue`／`source-footage` 排除全部D1；`data-readout` **只排除真实数据的内容版本更新**，数值对象自身的进出场、复制及来源关系仍检查。这不是外层包装的豁免；后期包装层使用独立ID，不能继承素材层或数据层的排除。默认、未知值、缺帧或同ID混用类别一律保留全部D1检查。分类只是声明，真实性／适用性仍需核对现有素材与证据。
- `d1Classification` 分别列出 `excludedObjectIds`（全部D1排除）、`contentOnlyExcludedObjectIds`（仅内容更新排除）、`contentCheckedObjectIds`（实际检查内容身份），并记录逐对象的显隐／内容／来源检查范围和未知类别。`contentVersionCoverage` 只描述 `contentCheckedObjectIds`。全排除仅用于字幕／素材原画面；`sourceLinks` 的目标是MG／overlay／data-readout时，即便来源是素材层也仍检查。全排除的目标关系另列 `excludedSourceLinks`，不悄悄丢弃。任何类别都不豁免原轨迹、经过节点、空等、源摘要等检查。
- `frameAt(t).objects[]` 可提供 `contentVersion`（字符串／有限数字／布尔值），值来自真正渲染的文字或内容身份。节点 ID、bbox 和 opacity 都没变也会比较版本。旧适配器的 `frame.semantic[同名对象ID]` 标量按同一契约读取；没有暴露身份的对象列入 `contentVersionCoverage.uncovered`；只暴露一部分时列入 `partial`、报告覆盖缺口。跨缺口只记录最后已知／首次已知的区间与 `time:null`，不猜精确替换点；其它已明确的替换边界继续检查。只有每个编码帧均暴露身份才列 `covered`。
- 由实际生产函数返回 `localGeometry:{x,y,width,height,rotation?}`（rotation 用度），用于剔除相机和父级带来的位移；若未提供而有相机，工具以画布中心反算并明确标为推断。屏幕固定对象可提供 `screenFixed:true`。最终屏幕 bbox 仍用于原有轨迹检查。
- 实际遮罩、路径、形变或遮挡可返回 `process:{maskProgress?,pathProgress?,morphProgress?,occlusionProgress?}`，进度在 0–1 内，必须来自实际生产过程。只填机制名字、固定进度或为过检另造进度都不成立。
- 同节点替换可返回 `replacement:{kind,progress,fromVersion,toVersion}`。`kind` 是 `geometry/mask/path/morph/occlusion/source-copy` 之一，版本必须对应这次替换，进度须来自真实替换实现；工具要求机制在实际换字边界已经存在，并在其相邻编码间隔实际推进；换字之后才开始的遮罩或更早已结束的过程不能追认这次替换。有中间进度不等于视觉已通过。透明度重置、整容器移动和只有名字的声明不会免除 `content-replaced-without-process` 疑点。超出采样范围的机制应检查编码帧，不能只补声明消告警。内容变化当下两侧都不可见时按隐藏准备处理，随后入场另查；不能用任意前后时间窗中“后来会可见”误判为硬换字，也不能用瞬时 alpha reset 掩盖原来仍可见的旧内容。
- 可选 `sourceLinks:[{id,sourceObjectId,targetObjectId,time,sourceTime?,sourceAnchor?,targetAnchor?,evidence}]` 表达“同址分出／复制”。时间取真实事件表；锚点为对象框内归一化 `[x,y]`，默认中心。`evidence` 仍需 `{sourceFile,anchor,reason}` 且来源被哈希绑定。工具比较源对象实际状态、目标事件起点和目标首次可见采样，报 `source-origin-discontinuity`；它不会凭注释自动猜两物应同源。首次采样可能含一帧移动，报告同时保留起点距离，须核边界像素。

D1 只采用 `0 ≤ t < duration` 的编码帧，`duration` 的区间终点仍可供原轨迹／导数求值，但不当作片尾多出的一帧，也不因该点显隐／换字报末现事件。

`opacity-only-lifecycle` 定位从隐藏到可见或反向的透明度变化，没有几何展开／遮罩／路径等过程，包含只带十几像素位移的淡变；当前定位容差为微移 24px、形变约 1 屏幕像素、过程进度变化 0.001；极小宽高／旋转／进度噪声不能冒充可见过程。这些只是疑点定位容差，不是“超过就合格”的审美阈值。若声明动作只改 opacity，空间位移可能来自父级，仍列疑点核实。`instant-element-visibility` 定位瞬时显隐；瞬间跳坐标不算可见过程。留在画面的对象降亮／褪色不算消失；音频渐变不在画面对象契约内。

镜头之间完整停稳后设计的硬切，可以用原有 `cut` 检查点并显式加 `scope:'scene'`，覆盖该边界全部可见对象、保留可追溯依据；元素自己换字／显隐不能冒充整镜剪切。工具只能核声明与采样范围，不能证明停稳、必要性或 DESIGN 例外已获用户确认。纯透明度、内容替换与来源疑点均为 `severity:'review'`，继续按本页第 4 节核实，不自动登记感知失败。

#### 3. 核对生产引擎中的首现、末现与内容替换像素

本轮新增／返修的叙事对象按实际输出找“入场前、首个可见帧、过程、完成态、最后可见帧、离场后”；同节点换内容还要对照“旧内容末现→替换过程→新内容首现”。不能只取事件表的起终点。使用成片同一渲染引擎：复制检查同址来源，展开检查真实面积或遮罩边界，路径检查已绘长度与端点；再从最终编码文件核对对应区间。bbox、opacity、进度和对象存在性只定位，不证明像素出现方式。

[第七期 v8](../assets/motion/ep07-entry-follow-v8/README.md)保留可执行验证：归一化 `pathLength` 配圆头 dash 在该生产环境把整线提前铺满，源状态数值却正常；修为实际路径前缀后再测首现与中间态。此例针对实际引擎输出，不把某个 SVG 属性永久禁用，也不要求所有工程更换引擎。

#### 4. 对照实际文件并闭环

使用本页抽帧工具对报告时段抽取最终编码帧，核实适配器与视频确实对应，再看主导位移、接触、遮挡、实际尺度和阅读任务；源码采样是工程求值，不是编码像素跟踪。恒速、共同刹停或近读缺失已被证实时，写原 QA 为“未通过”并修受影响过程及前后接点，再跑对应检查。仅有数值疑点时先核实，不盲改合法接触、必要停顿或数据映射。

先核实当前工具确实提供连续视听输入，再承诺 1× 播放或要求上传；可打开播放器不等于助手能观看，抽帧不冒充连续播放。技术测试、助手审看与用户确认分别记录；未完成的 1× 观感、听校或语义检查各自记“未验证”，不能盖掉已经确认的失败。没有疑点也不证明表现力；修动作后回看直到下一处有依据的停顿，防止把空等推到后段。检查数据只是原 QA 的证据，不成为第二份独立维护的时序或验收结论。

## motion-check.mjs｜动态自检

样片或整段交用户前，用已有 Node.js、FFmpeg／FFprobe 对当前实际视频定位疑点；同一文件已有有效证据可复用，不要求每轮调参重跑。输出用项目 QA 下不存在的新目录，父目录须存在；不安装依赖或调用生成服务。

```text
node scripts/motion-check.mjs --input renders/D01_sample.mp4 --out _work/motion-check/D01_v01 --ranges 2.5:4.2 --audit _work/D01/motion-audit.json
```

默认约 48 帧总览，关键区间密集帧为 10fps，静止定位为 0.75 秒／-55dB；--purpose-at 2、--rework-over 3 是按 DESIGN 使用的疑点分级，不是通用质量线。怀疑短停可降低定位阈值，以同参数对照；非零微动可能掩盖停顿，必要阅读也可能被检出。

- summary.json／txt 绑定视频 SHA、工具、参数、时长及静止区间，analysis-complete 只表示定位完成。
- overview-page-*.jpg、dense-*、frames.html 和 frame-index.json 提供总览及过程帧，普通抽帧记录请求时间，不声称精确源 PTS。
- 可选 `--audit <motion-audit或motion-gates.json>` 先核视频 SHA，再用 FFprobe 真实帧 PTS 提取风险附近源帧；frame-index.json 的 exact[] 记录 sourceFrame、sourcePtsSeconds、relativeSeconds，不把生产名义帧当解码 PTS。`exactCoverage` 记录末帧 PTS 与可信显示时长；超出实际覆盖区间明确报错，不夹到末帧冒充取证。
- commands.json、freeze.log、events.jsonl 供复现；长时任务每分钟写心跳，异常保留 error.json，不把残留文件当成功。

先看总览及主风险全过程，再核接触、遮挡、主体实际尺度与阅读。抽帧不规定设计图配额，也不代替对象身份、跳帧确定性及 1× 审看。连看减速、全停和下一动作缓入；局部提前后检查到下一必要停顿，防止空等挪到尾部。已证实缺陷记未通过并修，未完成的正常速度观感、听校另记未验证，统计少或零告警不证明效果好。

### 旧 PowerShell 入口

`tools/motion-check.ps1` 保留原参数及 overview.png／strip_NN／summary 等输出，供兼容旧总览用法；它不支持 `--audit` 或精确源帧取证，不与 Node 入口等价。旧脚本可能覆盖同名输出，各版本仍用新目录。

```powershell
pwsh -NoProfile -File tools/motion-check.ps1 -Video 'renders/D01_sample.mp4' -OutDir '_work/motion-check/D01_legacy' -Ranges '2.5-4.2'
```

## 固定节点与人工复核

本次同步检查方法，尚未将 N02 的新媒体扫描器移植到公开包：该实现依赖 Python、NumPy、Pillow，当前公开入口只承诺已有 Node／FFmpeg 环境，不能把未移植的参数写成可用。Node 与旧 PowerShell 命令及输出保持兼容；它们仍提供静止定位、总览与密集抽帧，不提供自动局部跳变、动静曲线、接点差分、字幕标点或章间人声检测。需要这些自动项时，先评估并取得本项目工具／依赖授权；本次任务可先用已有工具与人工核查，缺测明确记录。

| 时点 | 当前输入、定位项目与人工责任 |
| --- | --- |
| 配音粗剪交审前 | 当前配音、章节文字锚点与章间窗口：测低能量空档作定位，执行者听完整尾字和后句起音；总控核时基与留白未被机械压缩，用户听确认。无章节可记不适用，未听校不能判通过 |
| 字幕制作或修改后 | 当前 SRT：定位句读标点，保留小数、版本号、URL、文件名内部点；执行者核文字、断句、大小写、时码和实际遮挡。句读处理按项目字幕规范，不扩大为所有标点禁用；无 SRT 记待生成并补查 |
| 分段预览交审前 | 当前整段：相邻帧跳变、动静分布与近静止只帮助定位时段；执行者核原尺寸连续帧和实际过程，总控核缺陷闭合并组织用户 1× 审看 |
| 总装接相邻段时 | 当前前后段：用解码真实末帧／首帧查接点，并回看前后动态；尺寸不同或边界不可测要写原因，不伪造零差异。总控核采用版本及接续 |

跳变报警不等于错误切镜，低能量不等于无人声，本页定位用的近静止（freezedetect）口径不能混入第 1 项感知静止。工具运行失败、缺测、定位疑点和人工缺陷分别记录在已有 QA／接入说明；输入或时基变更只复查受影响项。执行者核原像素，总控核覆盖与版本，用户判断实际看听。正例：核实标点而保留版本号内部点；反例：零报警当好看、ASR 当已听校。

细线在持续运动中的翻向错误（D04 类问题）仍可能漏检，缩略图不够，须主动核原尺寸连续帧并看实际过程。新增自动检查也只能定位疑点，不能代替人看、人听或给成片打通过。

## 运动量化门禁

任何渲染器的 MP4 都先跑 `node scripts/stillness.mjs --video <预览> --out <新目录> --reading <读字窗口> --benchmark ep08-d07-v04`，不需要适配器；下面的完整门禁用于公共起点或有适配器的工程。

交审前按[DESIGN 判据](../templates/DESIGN.template.md#运动量化门禁)运行。第 1／3 项保留硬要求，第 2／4／5 项数值为诊断参照；本期硬要求的变更取已确认 DESIGN，诊断参数调整无需另加审批。原 `--gates <overrides.json>` 平铺数值接口保持兼容，不将诊断参数自动变成失败线：

```text
node scripts/motion-gates.mjs --adapter <adapter.cjs> --video <preview.mp4> --out <qa/motion-gates.json>
```

公共工程用 [render.cjs --video](../assets/motion/production-core/README.md) 自动绑定实际输入、源码快照和成片；自有工程的检查入口见上例。适配器沿用 `schemaVersion:1`，`exportAudit()` 可接受本次渲染参数。优先复用现有动作／交接：`actions[].motionGate:'anticipation'`、`relays[].motionGate:'follow'|'rigid-feedback'`，直接使用实际动作 ID、对象与起止；构图对象来自 `coverage.mainContentIds`。旧 `motionCast` 保持兼容并明确标为 legacy 覆盖，只测已有声明，不能代表内部过程或剧本已核。镜头分窗可用 `frameAt(t,{windowId,t0,t1})`，仍调用生产求值。

完整适配器同步执行工程审计，复用动作覆盖与源码／视频摘要。输出增加 `reportVersion:2`，每项有 `judgment:'hard-gate'|'diagnostic'`。第 1 项为感知静止和构图多久没变，与 `scripts/stillness.mjs` 同一算法，只豁免登记的读字窗口和用户确认的例外。第 2 项声明固定取景时，按两侧各自的实际编码帧核对相机姿态，固定期间漂移记硬失败；声明固定只证明机位没动，画面是否在推进由第 1 项判断，想要镜头有呼吸感就不要声明固定。有依据的整场硬切只分隔切点，不豁免两侧运动。其余相机风格及第 4／5 项可测时返回 `status:'诊断'`，保留数值与疑点，不返回审美通过／失败；缺职责、对象、可见性或采样仍为“无法测量”。旧消费者须接受诊断状态，不把它当 QA 通过。

退出 0 表示硬要求已测且诊断数据完整，仍待人工判断；2 表示静止／因果硬要求失败或工程审计待核问题；1 表示输入或覆盖不完整。`visualAcceptance:'not-assessed'` 始终保留。已知缺陷和硬要求失败先修，诊断取舍依据本段观看任务与实际输出，测不到不能算通过。

部件接力可在现有 `relays[]` 或旧 `motionCast.follows[]` 添加 `trigger:{time:3.0,kind:'contact'}`（也接受 `triggerTime`）；时间取实际绘制共用的启动、接触、揭示或交接事件，单位为适配器时基秒。工具记录 triggerTime、subjectOn、attachmentOn 和从触发计算的 delaySec；不能把计划秒点当已核实际事件。未提供时兼容旧接口，从采样到的主体实际启动推定，并明确标记来源，不从镜头起点计半秒。生产动作范围、对象覆盖和输入哈希仍核查。

透视或 SVG 缺测从实际生产共用的变换、路径和事件补测，并对照原尺寸编码像素；仍无法计算则保留缺口。临时填写可见声明或 bbox 不能替代实际绘制证据。

第 1 条取实际视频，第 2–5 条按源码换算到参照画布；不能拉长已有动作压低静止统计。第 1 条每次从本次成片实际解码（`decoded-current-video`），不接受旧日志。局部内容大小与覆盖对象分别核对，全局占比不能证明每个阅读部件够大。

## 许可

本目录脚本以 MIT 许可发布，见仓库根目录的 [LICENSE-CODE](../LICENSE-CODE)。
