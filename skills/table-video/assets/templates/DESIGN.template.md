---
{
  "version": "alpha",
  "name": "[系列名称]",
  "description": "[视觉目的与适用场景]",
  "colors": {
    "primary": null,
    "secondary": null,
    "tertiary": null,
    "canvas": null,
    "surface": null,
    "line": null,
    "system": null,
    "success": null
  },
  "typography": {
    "h1": {
      "fontFamily": null,
      "fontSize": null,
      "fontWeight": null,
      "lineHeight": null,
      "letterSpacing": null
    },
    "h2": {
      "fontFamily": null,
      "fontSize": null,
      "fontWeight": null,
      "lineHeight": null,
      "letterSpacing": null
    },
    "body": {
      "fontFamily": null,
      "fontSize": null,
      "fontWeight": null,
      "lineHeight": null,
      "letterSpacing": null
    },
    "label": {
      "fontFamily": null,
      "fontSize": null,
      "fontWeight": null,
      "lineHeight": null,
      "letterSpacing": null
    },
    "metadata": {
      "fontFamily": null,
      "fontSize": null,
      "fontWeight": null,
      "lineHeight": null,
      "letterSpacing": null
    },
    "subtitle": {
      "fontFamily": null,
      "fontSize": null,
      "fontWeight": null,
      "lineHeight": null,
      "letterSpacing": null
    }
  },
  "rounded": {
    "small": null,
    "card": null,
    "container": null
  },
  "spacing": {
    "xs": null,
    "sm": null,
    "md": null,
    "lg": null,
    "xl": null,
    "section": null
  },
  "components": {
    "card": {
      "backgroundColor": "{colors.surface}",
      "textColor": "{colors.primary}",
      "typography": "{typography.body}",
      "rounded": "{rounded.card}",
      "padding": "{spacing.lg}"
    },
    "result-label": {
      "backgroundColor": "{colors.success}",
      "textColor": "{colors.canvas}",
      "typography": "{typography.label}",
      "rounded": "{rounded.small}",
      "padding": "{spacing.sm}"
    }
  },
  "x-video": {
    "profileVersion": "1.0",
    "status": "draft",
    "revision": "0.1.0",
    "canvas": {
      "referenceWidth": null,
      "referenceHeight": null,
      "fpsReference": null,
      "scaling": "uniform-fit",
      "safeInsets": {
        "top": null,
        "right": null,
        "bottom": null,
        "left": null
      }
    },
    "layers": {
      "mg": {
        "background": null,
        "material": null
      },
      "recording": {
        "fit": "contain",
        "chrome": "[none或组件ID]"
      },
      "generated": {
        "style": null,
        "background": null,
        "wrapper": "[none或组件ID]"
      }
    },
    "surfaces": {
      "borderWidth": null,
      "cardShadow": null,
      "containerShadow": null
    },
    "container": {
      "enabled": false,
      "titlebarHeight": null,
      "titleFontSize": null,
      "iconSize": null,
      "iconGap": null,
      "scaleTogether": true
    },
    "graphics": {
      "inputRole": null,
      "processorRole": null,
      "resultRole": null,
      "pathRole": null,
      "outlineWidth": null,
      "decorativeRotationMaxDeg": null
    },
    "motion": {
      "curves": {
        "reveal": [
          0.16,
          1,
          0.3,
          1
        ],
        "anticipation": "ease-in-out-cubic",
        "travel": [
          0.22,
          0.72,
          0.22,
          1
        ],
        "settle": [
          0.16,
          1,
          0.3,
          1
        ],
        "process": "ease-in-out-cubic",
        "camera": {
          "revealReframePullback": [
            0.3,
            0,
            0.25,
            1
          ],
          "zoomInterpolation": "logarithmic",
          "subjectFollow": "derive-from-final-subject-transform-and-screen-anchor",
          "readjust": [
            0.16,
            1,
            0.3,
            1
          ],
          "emotionalSlow": "ease-in-out-sine",
          "emotionalSlowCondition": "only with expressive need and stated reason"
        },
        "source": "B3: assets/motion/ep05-d06-task-relay/src/timeline.cjs; camera: assets/motion/ep07-entry-follow-v8/src/camera.cjs"
      },
      "curveUsage": {
        "travel": "主要辨认去向、落点的转交或重排用 travel 候选；B3 46f@60fps 只作短距手感参照，按实际路程和观看任务定窗口。",
        "process": "搜索、拖动、剥离、擦写或展开等需要读清路径或局部变化时，process 是候选；位移和尺度也可承担过程，不按几何属性排除。",
        "anticipation": "预备另按 B3 短、可读地安排（参照24f@60fps），让意图或受力可辨；不能用预备曲线替代主位移。",
        "examples": "同是位移：快速归位主要读落点，可用 travel；拖开贴纸必须读清接触、路径与露出内容，可用 process 并给足可读窗口。"
      },
      "linearUseCases": [],
      "squashStretch": {
        "enabled": false,
        "maxCompression": null,
        "maxStretch": null,
        "preserveVolume": true
      },
      "calibration": {
        "sample": "B3 source reference, not current-project tested evidence",
        "fps": 60,
        "phasesFrames": {
          "anticipation": 24,
          "travel": 46,
          "longTravelAt2_5xDistance": 69,
          "settleApprox": 32
        },
        "distancesPx": {
          "retract": 14
        },
        "anglesDeg": {
          "anticipation": -5,
          "tail": 18
        },
        "deformationRatios": {
          "compression": 0.07,
          "releaseStretch": 0.095,
          "contactCompression": 0.09,
          "singleRecovery": 0.025
        },
        "followDelaysFrames": {
          "trail": 7,
          "receiver": 7
        },
        "scope": "B3 手感参照；motion.gates 区分硬要求与诊断。改帧数按实际因果和观看任务重排，效果待实际片段验证。"
      },
      "gates": {
        "source": "本项目 DESIGN 记录硬要求与观看判据；第 1、3 项保留硬要求，第 2、4、5 项数值只是历史诊断参照，不能自动判失败。",
        "preview": {"width": 1280, "height": 720, "fps": 30},
        "freeze": {"noiseDb": -55, "minDurationSec": 0.75, "ratioMax": 0.2, "segmentMaxSec": 2, "ep05FullRatio": 0.14, "ep05BodyRatio": 0.15, "ep05LongestSec": 1.93},
        "camera": {"refWidth": 1920, "refHeight": 1080, "largeArcPx": 80, "minMeanPxPerSec": 358, "judgeBy": "诊断参照；按本段揭示、阅读和交接判据人工核实", "revealMaxSec": 1.5, "holdMaxSec": 4, "referenceNotThreshold": {"durationSec": 0.7, "t80Sec": 0.43, "meanPxPerSec": 726, "holdSec": 1.15}},
        "follow": {"timeOrigin": "actual-trigger-event", "windowSec": 0.5, "minFrames": 3, "targetFrames": "6–9", "clockFps": 60, "simultaneousBelowFrames": 3},
        "anticipation": {"mode": "diagnostic", "minFrames": 6, "maxFrames": 24, "clockFps": 60, "displacementPx": 200, "ampRefPx": 8},
        "deformRef": {"compression": 0.07, "stretch": 0.095, "contactCompression": 0.09, "singleRecovery": 0.025},
        "composition": {"mode": "diagnostic", "contentWidthMin": 0.6, "criterion": "本段实际尺寸的文字、关系与比较可辨"},
        "rigid": "允许同步，须有实际触发对应的接收反馈；不为满足数量虚构反向预备"
      }
    },
    "componentBehavior": {
      "card": null,
      "result-label": null,
      "path": null,
      "text": null,
      "transition": null
    },
    "evidence": {
      "static": null,
      "motion": null,
      "confirmation": null
    },
    "fixed": [],
    "variables": [],
    "exceptions": []
  }
}
---

<!-- GENERATED from templates/DESIGN.template.md; edit the public source or the development workspace tools/package-skill.mjs, then regenerate. -->
> Skill 模式：总控统一管理，分段可串行或并行；中央 state 与 QA 只由总控写入。源码示例须结合已有运行环境使用；文档与工具测试不代替实际成片验收。

# 系列视觉与运动规范

填写说明在 Skill 包内的 `references/sop/09_DESIGN建立与校验.md`。这里采用结构化参数加正文说明：JSON 是 YAML 的子集，使用它作为 front matter 便于基础脚本读取。空值表示待定，模板可解析不等于规范已完成；建立规范时填明已确认外观与拟用运动规则；具体数值在相应实现前补齐，动态证据可待实际片段产生后补充。`version` 表示上游格式，系列修订号放 `x-video.revision`。

## Overview

[写明观众、内容类型、视觉关键词及具体行为。记录已确认静态、运动经验依据与制作初值；实际动态证据产生后补充，不默认另做测试。]

本文件只决定怎样呈现。稿件、时间、采用版本和允许制作范围分别认本期表与用户确认。结构化参数是具体数值的唯一来源，正文解释用途与例外，不抄第二份容易漂移的数值表。发生冲突先报告并修正规范，不由代码自行挑值。

### 呈现范围

| 内容层 | 应用哪些规则 | 不继承哪些规则 |
| --- | --- | --- |
| MG／图形 | [颜色角色、字体、图形语法、背景、运动] | [写明] |
| 真实录屏 | [原比例、阅读窗口、允许包装] | [不能为装饰改动真实产品证据] |
| 生成场景内部 | [单独画风、材质、身份、空间] | [例如不套用 MG 的背景或组件] |
| 外部包装／字幕 | [边框、容器、字幕安全区] | [不可改变片内动作与真实内容] |

## Colors

为每个 token 写“表达什么、用于哪里、不得抢什么层级”。区分画布、表面、主文字、次要文字、行动焦点、系统主体、状态与连接线。状态不能只用颜色区分。新增颜色先说明语义与验证，不能随镜头随机添加。参考色和已采用色分开。

## Typography

使用 front matter 中的六级字体参数，说明主标题、分区标题、正文、标签、元数据与字幕各自用途。字号注明是基准画布坐标，不与截图原生 CSS px 混写。记录实际使用字体、许可与回退；字体缺失后，重新检查换行和布局。

一幕主要焦点、短标签的对齐、中文长句是否使用等宽字体、文字分组与入场方式均写清。标题栏文字或元数据不能承担必须看清的关键事实。

上屏文字只写给观众。版本号、“待复核”“不代表已完成”等制作说明写在接入说明或 QA，不进画面；界面重绘或示意确需提示时，全期统一一个小角标。字号是否够用，以观众实际观看设备（常见是手机）上的成片取景判断；组件可按基准字号绘制再用景别放大，但主要内容不能缩在画面一角、四周大片空白却没有构图作用。

## Layout

采用 `spacing` 的间距阶梯，说明组内、卡片内、卡片间和章节间用途。基准画布与输出画幅分开：等比缩放时文字和线宽随组缩放；横转竖等改变比例时重新布局，不能拉伸。安全区以 `x-video.canvas.safeInsets` 为准。

分别说明输入态、结果态、并排对照、录屏阅读与字幕的空间预算。窗口外部大小按本段构图变化，标题栏、文字、图标等内部比例成组变化。

写明窗口框何时使用：建议只承载界面、截图、录屏和生成视频，正文纯 MG 讲解直接放在画布上。镜头运动作用于整个画面：窗口框是画面里的物体，推、拉、横移时框与内容一起变化，推近时框边可以移出画面；只有表现“在软件里放大或滚动”的界面操作时，才只移动框内内容，并同时出现光标、缩放或滚动控件等对应动作。

## Elevation & Depth

写清阴影、边框、光照、遮挡和层级的作用。用 `x-video.surfaces` 记录准确表达式与单位。设计阶段按[空间镜头](../../references/experience/镜头推进与转场.md#空间镜头)在已有标注写一行空间适配，既检查信息层级也检查物理纵深；采用时写对象分层、遮挡、光影与运动关系。二维缩放不能当作存在真实三维视角的证明。

## Shapes

规定圆角、线宽、端点、装饰倾斜与图形轮廓。分别定义输入、处理主体、动作方向与结果的视觉角色；颜色与形状共同承担含义。装饰倾斜上限不限制有叙事依据的旋转或镜头滚转。

## Components

仅填写实际采用的组件，不为视频凑网页导航、表单和悬停状态。每个组件至少包含 token 引用、内部比例、内容上限、状态、进出动作、焦点与例外。

| 组件 | 静态接口 | 状态与运动 | 验证重点 |
| --- | --- | --- | --- |
| 卡片 | 背景、字阶、圆角、间距、边框 | 按任务承载处理、比较或传递；入场和停稳服务过程 | 内容变化与承接关系；不默认每卡独立起停 |
| 结果标签 | 采用状态色与标签样式 | 只在结果实际完成后出现 | 不抢主动作、不提前宣布成功 |
| 路径与节点 | 基础线和行动线的语义 | 绘制、对象传递、节点反馈的先后 | 不让轨迹先跑完而对象还未行动 |
| 容器／窗口（可选） | 栏高、字号、图标、圆角联动；外框可变 | 输入内容与包装分离 | 不裁切证据、不让细栏承载关键信息 |
| 章节卡／转场 | 视线落点、前后状态与安全区 | 主体承接、速度、停稳与退出 | 不露底；不把镜内落稳套到跨镜切点 |

## Do's and Don'ts

[逐条写可观察的采用与避免方式，附范围或理由。不要将个人配色、所有弹簧、所有静止或所有运镜一概禁用。]

每个动作有作用；阅读需要时保持稳定；证据与比喻分开；角色、图形、真实截图共存时说明主焦点。禁止项只覆盖真正会破坏当前设计的行为，不用“高级、流畅”作唯一验收描述。

适用对象、排除边界及默认动作语言按[进出场与替换](../../references/experience/视觉叙事与连续MG.md#默认进出场与替换)：卡片、文字等进出与内容替换须有可见过程；纯淡变和无过程突现突失默认不允许。例外仅在本期 DESIGN 逐条列出并由用户确认。

## Motion（视频扩展）

**先设计主动作与观看过程，再细化曲线。** 共同安排主对象变化、观察位置与尺度、焦点交接和必要停顿；辅助物持续运动或技术无缺陷不等于主画面在推进。阅读、比较和情绪留白可以停稳；比较可辨不等于全场固定。接力须在实际画面可感知，不以非零微动或持续运镜填空。关键变化的图证据与阅读窗口按Skill 包内的 `assets/templates/镜头剧本.template.md`；完整过程预演、确定性与实际审看片按 `references/sop/04_验收与返修.md`。本规范维护视觉和运动语言。交审通过线认 `x-video.motion.gates`（第五期默认，项目可覆盖）；B3 手感校准仍是参照，不是这条通过线。

动作时序独立于设计图序号：主体、镜头与辅助物按各自职责求值，经过态不默认共同归零；同一形变可共用动作进度，不用一个状态间进度统领所有物件。主动作时长不等于整句配音时长：共同排下一动作启动、注意力接管、前一动作收势及必要阅读，不把接力留到动作完成后另排；不靠慢移或长减速尾段填满配音。读字时稳定被读对象与相关取景，其他有明确交接作用且不抢阅读的动作可继续。取景差异按实际主体尺度、可见内容和观察任务核实，不由相机参数差值证明。

主体运动按需要安排意图／预备、主动作、接触或状态改变、跟随和停稳，不要求每个对象走完独立闭环。对象没有接触或附属件时不强行补齐；镜头可由视线引导、空间揭示或情绪驱动，不必虚构受力。

写清镜头变化的风格与适用边界，不把阅读对象稳定扩大为全画面冻结或整段固定机位。静态风格统一指配色、材质、字体与组件语言，不要求同一构图覆盖整段。具体选择在设计图前按Skill 包内的 `references/experience/镜头推进与转场.md` 完成；用关键状态先挑战主变化、真实近读和整体揭示，不等完整动画写完后再抽终态作为设计依据。单段景别、轨迹与参数不自动变成系列默认，也不设每段图数或相机运动配额。

曲线写入 `x-video.motion.curves`，用途按相邻 `curveUsage` 判断：读去向与落点、读路径与局部变化、引导视线或稳定阅读。同是位置／尺度变化也可有不同任务；前段过快的曲线可能把搜索、拖动和变形压成闪现。时长按实际路程、可辨过程与阅读安排，不以两个词之间的空隙为上限。跨镜匹配承接两侧屏幕速度，不机械各自缓入缓出。

**普通视觉位移、缩放、相机运动和内容过渡采用可感知的非匀速。** 不做全程恒速，也不以起终点的一点缓动包住中段恒速巡航。真实进度、计数、时间轴等按实际数据关系允许线性，具体用途写入 `x-video.motion.linearUseCases`；“机械感”“扫描感”不能单独豁免普通视觉运动。数学上非线性不自动合格：核对实现实际调用的曲线，以及主体与相机合成后的屏幕速度、主动作和停顿的节奏；不同职责也不能未经判断全部套用同一条曲线。

### 职责曲线与校准

上方 `motion.curves` 与 `motion.calibration` 提供有来源的制作初值，不按几何属性强制套用。职责及选择边界只在[默认动作设计基线](../../references/style-and-motion.md#默认动作设计基线)维护：转交看去向和落点，操作看路径与部件后果；揭示相机用 ep07 候选，主体跟随按最终变换反算，阅读稳定取景。预备与接触反馈按实际关系安排，B3 的 24f／46f@60fps 不变为本片固定时长。

**不准用一条曲线包办所有动作（含镜头）；曲线合规不等于利落；空值不等于禁用，进入动画前必须有值，并写明来源。** 只对实际采用的动作填执行值；未采用项目注明不适用，不能以空值偷换“禁止预备／跟随”。具体源码见[B3 完整过程](../motion/ep05-d06-task-relay/src/timeline.cjs)与[ep07 相机](../motion/ep07-entry-follow-v8/src/camera.cjs)，制作前结合对象、路程、真实配音和阅读预算选择，不把例中镜头旧曲线继承成普通默认。

B3 的 fps、预备／传递／长距／停稳帧数、后撤、倾斜、压缩／拉伸／一次回正、尾标与跟随延迟，统一维护在上方 `motion.calibration`，不另存一份执行数值。**B3 校准是手感参照；`motion.gates` 区分硬要求、诊断参照和本段观看判据。改帧数时核真实因果与重量，不机械保持比例。** 换 fps 先按秒换算，当前项目尚未验证的动态证据保持待验，不能把来源参照登记成本片实测。

Skill 没有默认独立动态测试；静态确认后写 DESIGN 时使用这些默认候选并注明来源，在实际片段核验。测试与实际片段产生后，将采用范围、参数来源和当前证据写在既有 DESIGN；不另设逐动作审批。

### 动画原则检查

| 原则 | 应当回答的问题 |
| --- | --- |
| 挤压与拉伸 | 是否有受力或速度依据、是否近似保体积并恢复 |
| 预备 | 是否能读出意图，而非机械反向挪一下 |
| 演出布局 | 主焦点是否唯一，运动与阅读是否互相遮挡 |
| 关键姿势与连续动作 | 主状态、接力点与必要停顿是否先明确，再补中间过程；是否误把每个节点都做成起停 |
| 跟随与重叠 | 有关联部件时，启动与停稳先后是否成立 |
| 缓入缓出 | 速度变化是否符合重量、距离与约束 |
| 弧线 | 运动路径服务自然动作还是机械约束 |
| 次要动作 | 是否补充含义而不争主焦点，是否与跟随区别清楚 |
| 时间 | 是否给结果与必要阅读留出空间 |
| 夸张 | 是否集中于关键节点并符合风格 |
| 立体造型 | 透视、体积、阴影和离地高度是否连续 |
| 吸引力 | 是否来自目的、推进和节奏，而非持续加效果 |

只检查适用项，不逐镜填十二份回执。具体动作毫秒／帧标记在本期运动标注维护。

## Exceptions & Evidence（视频扩展）

固定项、变量和已确认单段例外写入 `x-video` 相应字段。例外包含版本、范围和确认依据，不自动升级为系列规则。静态确认不扩展为运动确认，参数 lint 通过不代表观众看懂。

采用前核对：必需 token 完整、引用可解析、正文与参数一致、组件实际使用已定义值、正确区分呈现层。沿用镜头剧本与 QA 中的对应条目，将主变化、近读和交接承诺定位到实际实现与帧／时段；静态图检查字号／构图／安全区，动态样本检查因果／接触／遮挡／跟随／阅读和边界。配置写了曲线而实现未使用、实际取景没有兑现承诺时，先修已知失败；实际未看的观感项仍写未验证。

## 运动量化门禁

分段交审前执行者按本段剧本在已有标注写明揭示、阅读、比较与接力的可辨条件，总控核实际观看任务和缺陷闭合。第 1 项静止、第 3 项因果响应保留硬要求；第 2 项速度、第 4 项预备与重量、第 5 项占幅属于诊断参照。取数与返回格式见[工具说明](../../references/motion-check-method.md#运动量化门禁)，工具不能替本项目决定观看判据。

静止采用 motion.gates.freeze：累计占比超过上限或单段达到上限且无有效例外即未通过；例外只免对应单段，不抵扣累计占比，不拉长动作刷统计。部件响应从实际启动、接触、揭示或交接事件起算，标明触发、主体与附属件的实际开始；只改透明度不算，刚性同步仍需接收反馈。没有相关部件按真实结构说明不适用，不凭空造件。

速度、预备和构图数值只帮助定位疑点，项目判据用实际过程和原尺寸阅读验证。正例：慢揭示看清关系、短促下落表达重量、远景留白后近读证据；反例：为达到速度、预备帧数或占幅线破坏阅读和重量。测不到时从实际绘制共用的变换、路径和触发数据补测并对照编码像素；仍测不到记录缺口，不能算通过。执行者核原尺寸及字幕遮挡，总控核覆盖，用户 1× 看推进与节奏；已知缺陷先修，未看听方面保留未验证。

## 空间镜头基线

空间镜头的比例由项目自己的视觉基线决定，改变整体风格要先说明并看实际过程样片。设计者在已有标注写空间适配、观看收益、阅读或比较代价与素材条件；总控核跨段安排。正例：用层级帮助解释依赖；反例：因有现成组件就全片套空间。已确认且条件未变的范围不重复审批。

## 运动参数采用记录

初始规则按经验和本片内容拟定；实际片段或按需小样产生后补检查证据。不要求先有参数对比、独立样片或选档确认。执行数值只存已有 motion 字段或实际配置，以下记录依据与状态，不维护第二份数值。

| 动作与适用范围 | 参数字段或配置（含单位） | 设定依据 | 实际片段与检查状态 | 用户确认范围 |
| --- | --- | --- | --- | --- |
| [本片适用项] | [填写] | [运动经验／内容与配音／已有确认片段] | [未制作时写待验证，产生后填真实文件与结果] | [无动态确认时如实说明] |

## 效果基线与观看要求

继承用户明确指定的效果要求；效果基线与风格参考分开，不复制范例外观或把作者个例变成所有项目默认。

| 依据 | 本项目采用内容 | 适用范围与核验 |
| --- | --- | --- |
| 实际效果范例 | [版本／路径、片段区间、确认依据；实际观看／抽帧分别记录] | [借鉴的主动作／观看推进／节奏、本段实现方式；以实际预览尺度 1× 对照并连看相邻段] |
| 外观与可变取景 | [配色／材质等固定项] | [每段构图、观察范围、主次与焦点由内容决定] |
| 长停用途与项目上限 | [≥2 秒复核用途；用户指定的上限及理由；无明确上限不虚构已确认值] | [写出读什么／看什么及例外证据，不用“供理解”概括] |
| 样片适用边界 | [实际验证的对象、距离、关系、镜头] | [未覆盖的新关系单独验证，不外推全片] |

例：用户要求不静止超过三秒时，超过三秒默认返修；确有阅读／收束目的须给具体观看任务并核对是否符合用户要求。不是给每个对象加漂浮来降低统计。
