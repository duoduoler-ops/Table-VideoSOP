# P0 状态与请求契约

这是一份本地工具的准确使用约定，不是宿主级权限系统。工具能验证格式、文件摘要、范围、引用和交互摘录存在，不能独立证明用户确实看过或听过。Agent 必须只记录真实交互，不自造同意证据。

## 文件职责

- `00_本期控制/state.json`：唯一采用、选择、进度、段落、依赖、待审和用户确认来源。
- `00_本期控制/制作大段表.md`：从 state 生成的可读视图，包含对应 revision；不可独立修改当前采用。
- `06_审片与QA/QA状态表.md`：唯一 QA 结论源，结构化区外的表格由记录生成；state 只链接它。
- 稿件、DESIGN、镜头配置、素材与真实交互摘录各在职责文件中。state 登记路径和摘要，不复制正文或另存 QA 结论。

P0 使用当前已安装 Node.js 的内置模块，无第三方依赖。命令从 Skill 根运行，`--project` 为实际本期目录；不要在 Skill 目录生成用户工程。

## 入口与只读查询

```text
node scripts/preflight.mjs --project <project-root>
node scripts/init-project.mjs --project <new-project-root>
node scripts/workflow.mjs status --project <project-root>
node scripts/workflow.mjs next --project <project-root>
node scripts/workflow.mjs validate --project <project-root> --action <action> --scope <objectId>
```

preflight 只报告环境；Node 或 FFmpeg 命令存在不等于媒体链路或感知能力通过。status／next 从实际文件计算当前有效性，不按修改时间自动采用。validate 是相应 action 的关卡检查，不会制作视频。

`--test-only` 仅用于 init-project 初始化，不传给 preflight、status、next、apply 等其他命令。后续工具从项目 state 读取 testOnly，不需要反复传开关。迁移准备使用请求 JSON 中的 `testOnly: true`。

action 为 `storyboard`、`design`、`pilot`、`animate`、`batch-animate`、`picture-lock`、`final`。`animate` 只验证局部制作，正式批量使用 `batch-animate`；不能用前者代替 S08。`publish` 在 P0 不执行；`generate-image`、`generate-video` 永不放行 Agent 代提交。

| 动作 | 关键条件 |
| --- | --- |
| storyboard | 已选画面形式、当前对象、有效采用稿件、配音与 DESIGN、该对象 segmentation 方面允许 storyboard 的确认或委托 |
| design | 当前对象、有效采用稿件、配音与 DESIGN、实际 kind=storyboard 文字剧本的有效 storyboard／design 确认或委托；范围为分段概述时，须有直接依赖于该分段对象的已确认文字剧本 |
| pilot／animate | 有效采用稿件、配音与 DESIGN、该对象 static 方面允许对应动作；animate 检查目标及其实际上游依赖的风险；每项风险分别需要适用 pilot 的实际审看与明确 dynamic／animate 确认，含 MG 时另需当前设计与运动证据 |
| batch-animate | 当前实际 static/pilot/video 目标的有效 static／batch-animate 授权、当前采用输入与真实制作依赖；保留风险及缺陷拦截；兼容已有有效总览范围授权，但不要求新建总览 |
| picture-lock | 当前 video 对象、明确 picture／picture-lock 确认、当前 visual 的 human-view 检查通过；含 MG 时另有当前 visual-design 与 motion 检查 |
| final | 当前采用 finalVideo 对象、明确 final／final 确认；visual human-view、audio human-listen、technical technical、sources inspection、subtitles human-view 适用项通过；含 MG 时另有当前 visual-design 与 motion 检查 |

所有视觉动作及 S03—S10 阶段推进均要求 `choices.allowedVisualLayers` 非空；status／next 同时报告缺项。此检查只验证状态中有选择，不能替代 Agent 核对真实用户决定。字幕只有 choices.subtitlePolicy 明确为 `none` 时允许带理由的不适用；未审听不能用技术记录放行 audio。stage 只是主要进度，仍按依赖与 action 验证实际下一步；已有有效结果不必为了阶段名重复审批。S05 对应 storyboard 关卡、S06 对应 design、S07 对应 pilot、S08 对应 batch-animate；S09 核对当前对象有效性，S10 对应 final。

`storyboard`／`design` 是正式文字剧本与设计动作，直接 validate 也要求有效采用的 DESIGN。DESIGN 可记录已确认静态与依据经验拟定的运动规则；没有独立动态样本不阻塞采用，但不得记作动态已验收。S03 的代表静态不等于 action=design；代表静态、按需局部试验、正式分段前的轻量语义草稿不调用这两个正式关卡。

## 设计期预演与正式制作的状态边界

设计期局部过程预演沿用已有 `risk`、`pilot`、依赖和确认机制。总控先核对当前范围的真实静态／制作授权，再对所涉对象执行 `validate --action pilot --scope <objectId>`；可在 S06 设计阶段进行，不为一个局部预演将全片推进到 S07。S07 阶段推进会核对全部分段，不能用它替代局部动作检查。

正式批量动画执行 `validate --action batch-animate --scope <objectId>`。将本批实际 static/pilot/video 目标建立 `aspect:"static", allows:["batch-animate"]` 的 review，再按真实回复 approve；原设计节点的同一次真实交互可以授权已展示范围，不新增审批。记录绑定对象、输入与证据摘要，分段概述／config 须有真实依赖连到这个可视目标。准备、pilot 或仅 animate 授权都不表示本批已放行。

对 config／分段概述调用 batch-animate 时，从已有 static／batch-animate review 选择当前实际目标；待确认、撤回或变更目标仍会阻断，不过滤成已通过。S08 核全部分段，每段至少有一个明确选定且有实际制作依赖的可视目标，逐目标执行相同关卡；局部 batch 只核本次范围。准备后批可继续，启动须等首批实际结果审看及反馈闭合，由总控更新允许范围。工具不能判断首批是否真的被观看，跨段、分批职责见[协作正文](sop/03_目录与并行协作.md#分批放行)。

旧项目的 visualOverview 槽位、visual-overview review 和 covers 保留可读兼容，有效已采用范围仍可授权；不要求迁移、补建或重审总览。旧范围授权按本体、真实证据与目标摘要核验，不回退已失效授权。仅无关段变化不撤销未变段的局部授权；当前目标或制作祖先变化须重核。新流程不写新的存储格式，锁画及 final 的全片审看、审听与实际文件证据要求不变。

已有同范围、同条件的有效过程证据按摘要复用；新配音／构图变化先重判适用范围，未引入上述新类型或未解高返工风险时，在首版完整预览核实适配，否则按设计期预演规则处理。不重复登记虚构确认。分段任务不写中央 state／QA，只回传候选与证据；总控按实际用户决定写回。

## 所有状态写入使用 apply

先读取当前 revision，写一个项目内请求 JSON，再调用：

```text
node scripts/workflow.mjs apply --project <project-root> --request <request-json-file>
```

请求外壳：

```json
{
  "operationId": "op-register-script-001",
  "expectedRevision": 0,
  "type": "register",
  "payload": {"id": "script-v1", "path": "01_稿件/确认稿.md", "kind": "script"}
}
```

这是格式示例，路径必须指向实际存在文件，revision 必须来自当前 status。相同 operationId 重试不得换请求内容；revision 冲突时重新读取、比较他人更新，再准备新操作，不用覆盖 state 解决。

| type | payload | 作用 |
| --- | --- | --- |
| choices | `{partial:{...}}` | 只更新已知选择，不重问既有答案 |
| register | `{id,path,kind,selector?,risk?,fidelity?}` | 注册实际文件为候选，计算内容与文件摘要 |
| dependency | `{from,to}` | 上游 from 影响下游 to；两者须已注册 |
| risk-proof | `{riskObjectId,pilotObjectId}` | 在真实方案→样片制作依赖下，绑定两端当前摘要及样片实际通过证据；不是反向 dependency |
| segment | `{id,objectId,narrative,anchors,route,progress?}` | 记录大段叙事、句子／时间锚点与路线；依赖另用 dependency |
| review | `{id,objectId,aspect,allows:[action],covers?:[objectId]}` | 建立绑定当前摘要的待审对象；visual-overview 必须给实际范围 covers |
| approve | `{reviewId,decision,id?,evidence}` | decision 为 approved／delegated／rejected；id 省略则使用 operationId |
| adopt | `{slot,objectId,approvalId}` | 只有允许 adopt:slot 且仍有效的对应确认可采用 |
| narration-gain-adopt | `{objectId,approvalId,evidence}` | 受限整数 PCM WAV 增益证明成立后采用新音频并继承适用视觉记录；详见增益修订 |
| qa | `{checkId,objectId,aspect,result,method,evidence,reason?,resolves?:[checkId]}` | checkId 全局唯一；仅对应实际通过复查可显式解决同对象同方面失败 |
| rebind | `{objectId,path}` | 仅同字节文件改路径；内容变化重新注册候选 |
| revoke | `{approvalId}` | 撤销确认后相关关卡重新计算 |
| stage | `{stage:"S01"}` | 在依赖满足时调整主要阶段，S01—S10 |
| finalize | `{mode:"limited",evidence}` 或 `{mode:"accepted"}` | 受限交付需真实采用文件与说明证据；正式完成须最终关卡通过 |

kind：`script`、`narration`、`design`、`storyboard`、`static`、`pilot`、`video`、`asset`、`config`、`other`。slot：`script`、`narration`、`design`、`storyboard`、`visualOverview`、`mainProject`、`finalVideo`。slot 对象类型必须相符。

segment 的 `narrative`、`anchors`、`route` 均为非空字符串；多条句子锚点用分号或换行连接，不传数组。例如 `anchors: "第1句：今天介绍工作流；第2句：输入进入处理步骤；精确时间待采用配音核对"`。没有配音时只能登记句子范围，不能编造秒数。

register／rebind 不接受 `00_本期控制/` 下的文件或权威 QA 表作为素材／确认对象，即使 kind 为 other 也不例外。稿件放 `01_稿件/`，待审镜头与设计候选放 `03_视觉设计/` 等职责目录，检查证据可放 `06_审片与QA/证据/`；控制目录用于状态、生成视图和恢复记录。

choices 的已知字段：narrationSource（existing／external-ai／self-recorded）、allowedVisualLayers（mg／screen／generated 数组）、output（至少实际 width、height）、soundPolicy、subtitlePolicy。没有确定值不编造；缺项保持待定。

画面形式的交互按[输入规则](intake.md#进入画面规划前核对路线)。`allowedVisualLayers: []` 是待选；用户要求回到选型时可通过 choices 置空，保留原文案和配音。普通恢复不清空已有选择。选项顺序或重复项不改变许可含义；不要为同一选择制造新的画面验收。制作大段表回显当前允许形式，但不提供选择证据或授权新的素材层。

## 确认、授权与真实证据

建立 review 时精确写 aspect 与 allows；静态布局可按真实授权允许 animate，具体风险预演允许 pilot，稿件采用允许 adopt:script。明确委托选择与制作可记 delegated，包括当前实际目标允许 batch-animate（兼容旧总览范围授权）；仍绑定实际对象、范围、摘要和证据，不冒充已观看。普通回复只覆盖实际展示并指向的方面，不扩到未展示动态或发布；风险样片的实际验证、picture-lock／final 仍须 approved 及对应 QA。

### S03 参考入口的记录与提示

参考流程按[参考入口与转场](style-and-motion.md#参考入口与转场)执行。沿用现有候选、review 与真实交互证据，不增加 state 字段或手工进度表：

- `reference-source`：只说明用户提供或 Agent 查找的来源选择；不能当作参考方向已选定。
- `style-reference`：用户已选定实际展示的完整画面参考及借鉴范围。登记实际展示并能打开的本地参考图，或明确引用这些本地图及其来源、适用范围的文件；后者须登记图像对象并建立“图像 → 说明文件”依赖，避免换图后旧确认仍有效。kind 为 `static`、`asset` 或 `config`，review 的 allows 为 `["pilot"]`，用实际回复确认。
- `self-drawn-exploration`：用户明确选择用本片试样探索方向。候选文件写清范围与待解决素材，kind 为 `config`，同样以 `["pilot"]` 关联后续试验；明确委托可记 delegated，不能伪装成已看图通过。

这些 aspect 只描述参考环节，不能替代正式 `static`、`dynamic` 等方面的审查，也不会单凭关联的 `pilot` 动作放行正式样片。不要把角色身份、单纯“继续”、图形局部试样或尚未解决的来源选择登记成完整参考确认。

S03 的 status／next 在缺少上述有效方向／路径决定时提示参考缺项；撤销、拒绝或过期的记录不解除提示。已有有效采用 DESIGN，或已有实际 `kind=static` 对象的有效 `static` 确认且允许 `pilot`／`animate`，可作为既有完整静态依据复用，不倒逼重选参考。S01—S02 不提前追加参考问题。

这是现有缺项与引导文本的提示，不是新增的制作动作或存储结构；工具允许进入 S03，以便在其中获取参考。它不能检查外部画面是否真正看过，不能拦住任意本地绘制，也不能替代总控遵守参考→素材核对→完整静态的顺序。

### 从分段确认进入文字剧本审查

分段概述登记为 `kind=config`，以 `aspect=segmentation`、`allows=["storyboard"]` 记录真实分段确认。`segment.objectId` 可继续指向该分段概述，不必为了进入设计而改指针、重新询问已确认的分段。

完整镜头剧本必须先实际写出，再以同源简明配音对照交用户审查，制作依据可折叠；确认只覆盖实际展示的内容，不能隐藏影响画面决定的过程，再登记其真实确认。折叠内容只有实际展示、纳入本次审阅并获明确同意，才可按真实范围计入确认。单文档各段可分别用 `kind=storyboard` 和稳定 selector 登记；用 `dependency` 从各段概述指向相应剧本范围，之后在剧本对象上建立 `aspect=storyboard`、`allows=["design"]` 的 review。依赖方向是“分段概述 → 文字剧本”，不要反向连回造成循环。

默认 Markdown 正文直接使用 `selector:"md:D01"`：标题可为 `## D01｜标题` 或 `### D01 标题`，内容持续到下一个同级或更高标题，包含其子标题。稳定 ID 必须恰好出现一次；围栏代码中的伪标题忽略，真实重复或缺失均拒绝。选区应承载本段完整观看过程，不能只放索引，也不必另抄 JSON 正文。旧 JSON Pointer 仍支持普通 JSON 或 Markdown 内唯一 table-video-json 块。

```text
register: {id:"plan-D01",path:"03_视觉设计/分段方案.json",kind:"config",selector:"/segments/D01"}
segment: {id:"D01",objectId:"plan-D01",narrative:"本段表达任务",anchors:"实际配音句子范围",route:"mg"}
review: {id:"review-plan-D01",objectId:"plan-D01",aspect:"segmentation",allows:["storyboard"]}
# 用户审查分段后，按真实回复 approve；随后写完整剧本并交审。
# 默认正文模板按稳定标题直接选择，其他段变化不牵连本段。
register: {id:"story-D01",path:"03_视觉设计/正文镜头剧本.md",kind:"storyboard",selector:"md:D01"}
dependency: {from:"plan-D01",to:"story-D01"}
review: {id:"review-story-D01",objectId:"story-D01",aspect:"storyboard",allows:["design"]}
# 用户审查完整剧本后，按真实回复 approve；validate design 可用 scope plan-D01 或 story-D01。
```

同一次完整剧本交审和同一条回复，可以支持所有已实际展示、明确覆盖的段落 selector 记录；工具记录按段不等于让用户逐段重复回答。也可以把整份剧本登记为一个 storyboard 对象，并让各段概述直接影响它，一次确认覆盖整份；此时任一部分变化会保守失效整份确认。需要局部返修不牵连其他段时，优先使用各段 selector。

交审前写定计划、判据和需要的稳定图标识。确认后的实现结果、当前缺陷与复查记入现有 QA 或接入说明并关联原方案，不回写已确认剧本；已登记的证据按下文冻结要求另存补充，不另建状态。方案实质改变时才更新剧本并重审实际影响范围。

工具拒绝在 config 等非 storyboard 对象上建立或批准 `aspect=storyboard` 的 review，也拒绝这些对象取得 `allows` 中的 design；旧的错误记录同样不能放行 design 或 S06。合法文字剧本只有登记还不够，仍须当前有效的确认；补依赖、改剧本或改上游分段后，相关旧确认会按摘要重新计算。类型、依赖和摘要只能挡住明显的范围错配，不能识别正文是否真是镜头剧本，也不能证明用户已经看过；Agent 仍须核对交审内容与回复，不能把整体分段的“是”冒充剧本确认。

具体新对象演化／镜头关系缺适用过程证据，或有未解决的高返工风险时，由 Agent 按[测试与复用](style-and-motion.md#测试与复用)写清可能失败的关系与验证条件，再在 segment.objectId 指向的登记对象上设置 risk。首次制作、缺动态范例或普通参数待调不自动成为风险，不能借 risk 恢复默认动态测试；实际复杂接触、空间关系或部件控制缺口仍须验证。保留真实制作依赖（例如分段→剧本→工程）；animate 沿与有效摘要相同的实际依赖逐项检查已声明风险，包括采用 script／narration／design 的自动依赖。同路径显式 selector 已替代全文件时，只沿该实际选区依赖检查，不把无关段的整文件风险强塞回来。无需把 risk 手动复制到每个下游对象；未关联的风险不会被工具猜出，声明遗漏仍须由总控核查。

`register.payload.risk` 是布尔值，省略时为 `false`；例如 `{ "id":"plan-B-v2", "path":"03_视觉设计/B/方案_v2.md", "kind":"config", "risk":true }`。风险原因与验证条件写进方案。制作依赖保持真实方向 `{ "from":"plan-B-v2", "to":"pilot-B-v1" }`，也可沿实际工程传递。样片有当前严格 approved 的 dynamic／animate 确认及所需实际 QA 后，执行 `risk-proof: {riskObjectId:"plan-B-v2",pilotObjectId:"pilot-B-v1"}`。它另存两端有效摘要，不加入反向依赖；方案或样片变化后旧验证不再适用，须复查再登记。每个请求使用当前 revision 和独立 operationId。

非 pilot 风险对象只认上述版本绑定的 risk-proof。旧项目的“pilot → 风险对象”边不自动转换，也不能单凭旧边或无版本关系放行。确认该边确实只是旧验证关系后，可执行 `dependency: {from:"plan-B-v2",to:"pilot-B-v1",removeLegacyValidationEdge:true,evidence:{...实际核对证据}}`，只移除指定反向边，保留其他制作依赖并加入正确方向；随后重新核对样片、登记当前确认与 QA，再执行 risk-proof。不能把真正制作依赖当旧验证边删除。各风险分别核验对应样片当前确认、visual human-view、MG 的 visual-design／motion 及已有失败；delegated、无关样片或另一风险已通过不抵消该风险。一个样片确实覆盖多项风险时逐项登记。

kind=pilot 的对象若自身带 risk，使用它自己的有效样片确认与 QA 判断，不要求再为它建立另一个 pilot。action=pilot 仍用于先制作获准的验证样片，不因尚未完成的风险验证陷入循环；局部动画走 animate，正式批量走 batch-animate。只检查实际依赖的风险，无关工作可继续。

evidence 格式：

```json
{
  "path": "06_审片与QA/证据/实际交互摘录.md",
  "quote": "从实际交互原样摘取且足以确定此次对象和决定的文字",
  "actor": "user",
  "testOnly": false
}
```

证据必须来自本次可核验真实交互或实际检查资料，文件与 quote 都存在也不能证明内容是真的。不得写一段“用户同意”再引用自己写的段落制造批准。保存必要的交互范围、版本与时间，剔除凭据和无关私人信息。需要人工审看／审听时，真实结果明确前保留未验证。

**证据登记后冻结。** 工具绑定整份证据文件 SHA-256，登记后追加其他条目也会使先前证据过期。新交互／检查另存新文件；同一份报告可一次写完全部实际条目，再依次登记各条，之后保持原字节。后续纠错另存补充记录，不覆盖或追加已登记文件。证据过期不等于已知缺陷已解决；同对象同有效摘要的失败仍阻断，等待有新证据的明确复查。

模拟测试必须初始化时加 `--test-only`；只有测试项目接受 actor 为 test 且 testOnly 为 true 的模拟证据、fidelity 为 simulated 的对象。该项目的通过不是真实用户确认，也不能转换为真实成片验收。

## 局部摘要与失效

文件 SHA-256 识别字节内容。selector 支持上述 `md:D01` 稳定 Markdown 小节，或 JSON Pointer（普通 JSON／唯一 table-video-json fence）。有效摘要还包含已声明上游依赖；视觉对象自动绑定当前采用的 script／narration／design 及 output。显式声明了同类型、同路径并带 selector 的上游依赖时，以选区摘要代替整文件内容摘要，采用对象 ID 仍绑定；独立 D02 变化不必撤销未受影响 D01。

storyboard／static／pilot／video 以及已登记的分段对象（包括 config 类型）还绑定去重并排序后的允许画面层。全局形式改变时，这些对象的旧确认与 QA 需重新核对；稿件、配音和未用作分段对象的通用 DESIGN／config 不仅因该选择改变而失效。每段的 route 只绑定其 `objectId`，并通过已声明 dependency 影响下游；改一段不会自动改另一段。route 是自由文字，工具不能从中可靠识别素材层，Agent 仍需逐段检查是否越出允许组合。既有 route 文本和文件不会被自动改写或删除。

返回相同路线且其他输入未变时，旧摘要可能重新匹配；`current` 只表示证据匹配，不能代替用户要求重选后的复用评估。用户明确撤回的旧确认通过既有 revoke 记录，不能只靠暂时改路线使其失效。`next.invalidatedObjects` 只列文件或依赖缺失／变化；路线变化导致的确认失效还须查看 approvals、QA 的 current 和 action 检查。

```text
register: {id:"D01",path:"03_视觉设计/镜头配置.json",kind:"config",selector:"/segments/D01"}
dependency: {from:"narration-v1",to:"D01"}
```

主动作、取景、揭示或交接实质改变时，先同步受影响剧本、状态图／标注与依赖，由总控登记候选并按真实决定更新采用；文件哈希工具不会替你更新设计内容。只改曲线或材质且过程不变时不重画全套，但对应产物和 QA 仍按实际变更失效。

没有稳定对象边界时不能假装精确判断，按整个注册对象保守失效；哈希变化不会自动重写文件或自动采用。配音、共享风格或时基变化须声明实际依赖并重查下游；仅改路径可使用 rebind，但内容必须完全相同。新注册素材仍是候选。

### 现成 WAV 的仅增益修订

普通 adopt 仍保守失效依赖原音频摘要的视觉记录。只有能验证为同一整数 PCM 的一致正增益时，使用 `narration-gain-adopt`；这不是用户填“等价”布尔值就能通过的通道。

1. 保留当前已采用的原 WAV 及登记摘要；新增益版另存新路径、新 narration ID，再 register。原文件已覆盖时先恢复经原摘要验证的备份；无法恢复则不继承，按普通音频修订重新核对。
2. 实际复查内容、时基和增益变化，记录原／新文件、检查范围、结果及未验证项，另存冻结证据。新 narration 按真实决定取得允许 `adopt:narration` 的当前确认／委托。
3. 请求 `narration-gain-adopt: {objectId:"vo-gain-v2",approvalId:"实际新音频授权ID",evidence:{path:"06_审片与QA/证据/增益复核_v2.md",quote:"实际复核摘录",actor:"agent"}}`；Agent 检查可以提供此复核证据，不能冒充人工审听或用户确认。
4. 工具读取两份 WAV，要求 RIFF 整数 PCM 16／24／32 bit、采样率／位宽／声道／样本数完全一致；所有声道全部样本须共享一个正增益，量化误差至多半 LSB，零样本仍为零，输出触及整数极值拒绝。削波、移位、剪切、局部编辑、压缩／浮点／扩展 WAV、全静音无法证明时均拒绝；不自动转码或以总体均方误差掩盖局部差异。
5. 只继承变更前有效、正文与其他依赖未变的视觉确认和视觉 QA，同时保留当前有效摘要下已解决的失败及其复查链；记录保留旧来源、新旧音频 SHA、增益证明与复核证据。已知未解决失败继续阻断、各方法未验证仍保持待验；已解决失败及其仍有效的复查证据完整继承，不因后续同方法或另一方法的未验证重新激活。复查证据过期、继承来源失效或出现新的真实失败仍阻断；不继承音频、技术、字幕、来源或 final 验收，不自动接受最终交付。已采用 storyboard／visualOverview 的适用视觉引用同步，旧记录保留历史。新音频仍须音频审听及最终混音检查。

继承后仍须保存两份源 WAV 和冻结复核证据；原／新音频或复核证据变化会使继承确认过期。真实时基、配音内容或其他依赖变化继续按正常失效处理；其他格式没有此自动继承路径，不能声称已证明等价。

## QA 的唯一结构化区

实际 QA 文件格式如下，实例由工具生成；不要粘贴另起第二个区块：

````text
<!-- table-video-qa:start -->
```json
{"schemaVersion":"1.0","generatedFromRevision":0,"records":[]}
```
<!-- table-video-qa:end -->
````

records 每项包括 checkId、objectId、aspect、artifactHash、effectiveHash、result、method、evidence、reason、recordedAt、superseded。当前有效性运行时计算，不额外落一个 current 作为权威状态。result 为通过／未通过／未验证／不适用；method 为 technical／human-view／human-listen／inspection。checkId 全局唯一、不可重用；同 objectId／aspect／method 的新检查替代该方法旧的非失败结果，不跨方法覆盖。状态与派生表按已有登记顺序计算，兼容旧版本错误的跨方法 superseded 标记；status 只读，不重写历史项目。表格保留登记的失败历史，不凭静态表或 resolvedBy 字段冒认当前仍失败／已解决。

已知未解决失败不能被未验证、不适用、普通通过或原失败证据过期清除；同有效摘要仍标 unresolvedFailure。真正复查通过时给 `resolves:["原失败checkId"]`，必须同对象同方面并有不同路径或不同真实摘录。解决事实依据对应复查的对象版本、证据和继承来源仍有效，不依赖它是否被后来结果 supersede；另一个方法或同方法的新待验记录不撤回已经成立的修复事实。同方法最新未验证仍表示该方法当前待验，不能把历史复查当作该方法最新整项通过。新的真实失败必须另记并阻断；原解决证据失效、相关来源撤回或对象版本不再匹配时重新核验。不同方面／范围不能解此失败。最终 visual／subtitles 仍要求当前 human-view，audio 仍要求 human-listen；inspection 通过不能代替尚未完成的实际审看／审听。

## MG 效果证据

当 `choices.allowedVisualLayers` 包含 `mg`，picture-lock／final 及风险样片放行 animate 前，另外核对下面两项。它们沿用已有 `qa` 请求。独立片段直接交[公共制作入口](../assets/motion/production-core/README.md)导出的预览与报告；进入正式项目后按下述方式登记。

登记本次制作的视频时，`register.motionRole` 用 `render` 表示实际制作的 MG、`assembly` 表示引用这些片段的总装、`footage` 表示其余素材。公共工程候选会读取同目录的渲染清单。混合路线按候选的实际用途选择；总装用现有 `dependency` 关联所用 MG 视频，这样只调整声音时仍能核实片段来源。

给新制 MG 登记 `qa` 的 `aspect:"motion", result:"通过"` 时，工具读取候选同目录的 `motion-report.json`，核对当前视频和报告引用的制作文件。自有渲染器可在 `qa` 的 `motionReport` 填项目内的报告路径。保留本段源文件、实际输入和预览目录。发现硬约束失败先修、重出报告；缺测或待核时可先登记“未验证”，实际观察后再登记相应范围。需要补查时，按当前报告逐项填写例如 `motionRecheck:[{items:["gate:2","gap:0"],start:0,end:0.8,evidence:{path,quote,actor}}]`。gate 使用项目 id，gap 和 finding 从 0 起编号；仅有全报告缺口时用 `report`。证据文件须记当前成片 SHA-256，引用的原句要写明本次检查的项号和该时段实际所见；同一处可以覆盖多个相关项。工程证据与实际观看分别记录。

| aspect | 检查什么，证据写什么 |
| --- | --- |
| visual-design | 配音之外增加的理解；实际对象起点、过程、结果与前后因果；剧本承诺的镜头是否在实际取景及实现中成立；全片构图是否按内容变化；采用效果基线的实际片段和差异。证据引用当前产物的时段、图或代码，不用“设计用心／遵守原则”等评价词代替。 |
| motion | 全片／样片实际动作和停留时间；≥2 秒近静止区间的具体观看任务及项目上限；关键动作中间过程、焦点交接及对标差异。诊断 summary 和密集帧必须实际查看后逐项处理，不把脚本成功或较低静止比例记为通过。 |

整项通过还须匹配该项实际检查范围，按[自我诊断](self-diagnosis.md#不把局部修复升格为整项通过)处理。只复核几处缺陷不能登记整个候选的 visual-design／motion 通过；未登记的本版报告可汇总局部修复证据；已登记报告保持原文，后续局部复查另存冻结的补充证据并引用原检查 ID。整项其余实质范围未覆盖时记未验证，仍未解决的已知失败记未通过。

两项的 `method` 可为 `inspection` 或实际发生的 `human-view`；只有对应问题已处理、范围确实检查后才记通过。未检查写未验证，发现失败写未通过。它们都不能替代 `visual` 的正常速度审看。无 MG 的项目不被这两项门禁阻塞。

Agent 实际完成的检查用 `evidence.actor="agent"`，仅限 QA 的 `inspection`／`technical`；真实项目无需伪装成用户或启用 testOnly。用户审看／审听用真实 user 证据。agent 不能用于 human-view／human-listen、确认、受限交付授权或迁移批准。

证据可以是一份已一次写完并冻结的实际审片记录的不同条目，并链接诊断输出；分别绑定同一候选摘要，无需为同批检查另造多份报告。登记后的新检查另存文件。示意请求仍要使用实际存在、包含该摘录的文件：

```text
qa: {checkId:"design-review-v1",objectId:"candidate-v1",aspect:"visual-design",result:"未通过",method:"inspection",reason:"实际输出只缩放局部对象，未实现镜头剧本要求的整体拉开",evidence:{path:"06_审片与QA/本版审片记录.md",quote:"实际拉开未实现",actor:"agent",testOnly:false}}
```

[程序化动画的确定性与连续性](sop/04_验收与返修.md#程序化动画的确定性与连续性)在实际工程中核对，证据沿用现有 QA 关联；已登记的证据文件不追加，新检查另存冻结补充记录。不新增 state 字段，不把哈希一致、motion-check 或表格完整当作对象跳帧一致和实际观感通过。

状态工具只核对证据存在、绑定和结果，不自动理解画面或判断审片者是否诚实。默认同意／委托不能替代上述检查，声明 camera 参数也不能成为实现证据。当前 visual、visual-design 或 motion 出现未通过时，交付视图退回待审；历史受限交付仍保留记录，不作当前质量依据。允许把失败候选交给用户定位问题，但必须标明未通过。

## 恢复与生成视图

```text
node scripts/workflow.mjs recover --project <project-root>
node scripts/workflow.mjs render-plan --project <project-root>
```

recover 检查中断事务与实际文件；render-plan 从 state 重建大段表，不反向抄手工表或从文件存在猜进度。候选制作完、交看前，先用既有 segment 操作保留本段 objectId／narrative／anchors／route 并明确更新 progress 为“候选已制作，待审”，再登记交付；不要手改生成表，也不自动升为验收完成。finalize 后其它状态写入会使交付回到 awaiting_review，因此收尾信息先写齐。status 的 delivery.recordedStatus 是历史，currentStatus 与当次 final 检查才是当前有效结论。

## 旧项目迁移

旧项目继续使用原规则，直到用户审查迁移候选并明确启用。先按实际范围准备迁移请求，再分别调用：

```text
node scripts/workflow.mjs migrate-prepare --project <legacy-root> --request <prepare-json>
node scripts/workflow.mjs migrate-commit --project <legacy-root> --request <commit-json>
node scripts/workflow.mjs migrate-cancel --project <legacy-root> --request <cancel-json>
```

prepare 请求是 `{projectId?,testOnly?}`；commit 是 `{candidateId,expectedCandidateHash,evidence}`；cancel 是 `{candidateId}`，它们不使用 apply 外壳。prepare 返回 candidateHash，它是所审候选原文的 SHA-256，commit 必须以 expectedCandidateHash 传回；候选改变就重新审查。prepare 在独立候选目录保存原控制摘要及空采用状态，不覆盖原表。P0 不自动导入旧确认或采用；启用时保留原件备份，原控制在候选准备后变化则拒绝使用旧候选，原先不存在的控制文件后来出现也算变化。启用后依据真实证据逐项注册与采用，不把文字里的“通过”推断为结构化批准。cancel 标记候选取消并保留原项目，未授权时不删除文件。

P0 的迁移是保守切换，完整旧状态的自动迁移尚未实现。用户选择保留旧模式时只提供兼容的文字建议，不混写两套当前状态。
