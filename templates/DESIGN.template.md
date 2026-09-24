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
        "reveal": null,
        "anticipation": null,
        "travel": null,
        "settle": null,
        "process": null
      },
      "linearUseCases": [],
      "squashStretch": {
        "enabled": false,
        "maxCompression": null,
        "maxStretch": null,
        "preserveVolume": true
      },
      "calibration": {
        "sample": null,
        "fps": null,
        "phasesFrames": {},
        "distancesPx": {},
        "anglesDeg": {},
        "followDelaysFrames": {},
        "scope": null
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

# 系列视觉与运动规范

填写说明在系列根目录的 `docs/09_DESIGN建立与校验.md`。这里采用结构化参数加正文说明：JSON 是 YAML 的子集，使用它作为 front matter 便于基础脚本读取。空值表示待定，模板可解析不等于规范已完成；正式采用前须填完任务适用项。`version` 表示上游格式，系列修订号放 `x-video.revision`。

## Overview

[写明观众、内容类型、视觉关键词及对应的具体行为。记录静态与动态样本、确认范围与待定项。]

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

写清阴影、边框、光照、遮挡和层级的作用。用 `x-video.surfaces` 记录准确表达式与单位。需要景深或视差时写对象分层与运动关系；二维缩放不能当作存在真实三维视角的证明。

## Shapes

规定圆角、线宽、端点、装饰倾斜与图形轮廓。分别定义输入、处理主体、动作方向与结果的视觉角色；颜色与形状共同承担含义。装饰倾斜上限不限制有叙事依据的旋转或镜头滚转。

## Components

仅填写实际采用的组件，不为视频凑网页导航、表单和悬停状态。每个组件至少包含 token 引用、内部比例、内容上限、状态、进出动作、焦点与例外。

| 组件 | 静态接口 | 状态与运动 | 验证重点 |
| --- | --- | --- | --- |
| 卡片 | 背景、字阶、圆角、间距、边框 | 成组进入→内部信息→停稳；不逐字乱跳 | 行长、图标与标签关系 |
| 结果标签 | 采用状态色与标签样式 | 只在结果实际完成后出现 | 不抢主动作、不提前宣布成功 |
| 路径与节点 | 基础线和行动线的语义 | 绘制、对象传递、节点反馈的先后 | 不让轨迹先跑完而对象还未行动 |
| 容器／窗口（可选） | 栏高、字号、图标、圆角联动；外框可变 | 输入内容与包装分离 | 不裁切证据、不让细栏承载关键信息 |
| 章节卡／转场 | 视线落点、前后状态与安全区 | 主体承接、速度、停稳与退出 | 不露底；不把镜内落稳套到跨镜切点 |

## Do's and Don'ts

[逐条写可观察的采用与避免方式，附范围或理由。不要将个人配色、所有弹簧、所有静止或所有运镜一概禁用。]

每个动作有作用；阅读需要时保持稳定；证据与比喻分开；角色、图形、真实截图共存时说明主焦点。禁止项只覆盖真正会破坏当前设计的行为，不用“高级、流畅”作唯一验收描述。

## Motion（视频扩展）

主体运动按意图／预备、主动作、接触或状态改变、跟随、停稳组织。对象没有接触或附属件时不强行补齐；镜头可由视线引导、空间揭示或情绪驱动，不必虚构受力。

写清镜头变化的风格与适用边界，不把阅读时段的稳定扩大为整段固定机位。具体选择在设计图前按系列根目录的 `experience/镜头推进与转场.md` 完成；单段景别、轨迹与参数不自动变成系列默认。

曲线分别写入 `x-video.motion.curves`：出现、预备、传递、落位，以及 `process`（变形、生长、逐步失真等需要被看清的过程）。出现类曲线前段变化极快，用在变形上会让过程一闪而过；需要看清的过程按可读时长安排，不以两个词之间的空隙为上限。一个动作保持连贯的曲线逻辑；匀速只在其表达目的成立时使用。跨镜匹配要承接切点两侧屏幕速度，不机械两边各缓入缓出。

### 校准样本

`calibration` 记录实际样片、fps、阶段帧数、位移、角度、形变和跟随延迟，以及验证了什么。未知数值保持待测试；样片时间只是手感参考，本期动作仍由真实配音决定。换 fps 先换算时间再到帧，保留先后关系。

### 动画原则检查

| 原则 | 应当回答的问题 |
| --- | --- |
| 挤压与拉伸 | 是否有受力或速度依据、是否近似保体积并恢复 |
| 预备 | 是否能读出意图，而非机械反向挪一下 |
| 演出布局 | 主焦点是否唯一，运动与阅读是否互相遮挡 |
| 关键姿势与连续动作 | 起点、变化和结果是否先明确，再补中间过程 |
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

采用前核对：必需 token 完整、引用可解析、正文与参数一致、组件实际使用已定义值、正确区分呈现层；静态图检查字号／构图／安全区，动态样本检查因果／接触／遮挡／跟随／阅读和边界。实际未看的项目仍写未验证。
