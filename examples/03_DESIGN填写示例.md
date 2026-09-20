---
{
  "version": "alpha",
  "name": "文件归类：DESIGN 填写示例",
  "description": "展示视觉参数、组件行为与正文的填写方式；示意参数尚未通过视觉确认",
  "colors": {
    "primary": "#EAF0F5",
    "secondary": "#ACBFCD",
    "tertiary": "#E8B777",
    "canvas": "#14232F",
    "surface": "#263B4A",
    "line": "#506B7C",
    "system": "#80C3DE",
    "success": "#99D6B5"
  },
  "typography": {
    "h1": {
      "fontFamily": "Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif",
      "fontSize": "72px",
      "fontWeight": 700,
      "lineHeight": 1.3,
      "letterSpacing": "0px"
    },
    "h2": {
      "fontFamily": "Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif",
      "fontSize": "50px",
      "fontWeight": 600,
      "lineHeight": 1.3,
      "letterSpacing": "0px"
    },
    "body": {
      "fontFamily": "Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif",
      "fontSize": "42px",
      "fontWeight": 400,
      "lineHeight": 1.3,
      "letterSpacing": "0px"
    },
    "label": {
      "fontFamily": "Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif",
      "fontSize": "38px",
      "fontWeight": 600,
      "lineHeight": 1.3,
      "letterSpacing": "0px"
    },
    "metadata": {
      "fontFamily": "Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif",
      "fontSize": "34px",
      "fontWeight": 400,
      "lineHeight": 1.3,
      "letterSpacing": "0px"
    },
    "subtitle": {
      "fontFamily": "Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif",
      "fontSize": "44px",
      "fontWeight": 500,
      "lineHeight": 1.3,
      "letterSpacing": "0px"
    }
  },
  "rounded": {
    "small": "12px",
    "card": "18px",
    "container": "24px"
  },
  "spacing": {
    "xs": "8px",
    "sm": "16px",
    "md": "24px",
    "lg": "32px",
    "xl": "48px",
    "section": "80px"
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
      "referenceWidth": 1920,
      "referenceHeight": 1080,
      "fpsReference": 30,
      "scaling": "uniform-fit",
      "safeInsets": {
        "top": 64,
        "right": 120,
        "bottom": 64,
        "left": 120
      }
    },
    "layers": {
      "mg": {
        "background": "{colors.canvas}",
        "material": "flat"
      },
      "recording": {
        "fit": "contain",
        "chrome": "none"
      },
      "generated": {
        "style": "not used",
        "background": "not used",
        "wrapper": "none"
      }
    },
    "surfaces": {
      "borderWidth": "3px",
      "cardShadow": "none",
      "containerShadow": "none"
    },
    "container": {
      "enabled": false,
      "titlebarHeight": 0,
      "titleFontSize": 0,
      "iconSize": 0,
      "iconGap": 0,
      "scaleTogether": true
    },
    "graphics": {
      "inputRole": "文件卡；类别由形状和标签区分",
      "processorRole": "用途容器",
      "resultRole": "已选文件与中央采用清单",
      "pathRole": "连接线只表示实际传递关系",
      "outlineWidth": "3px",
      "decorativeRotationMaxDeg": 0
    },
    "motion": {
      "curves": {
        "reveal": [
          0.22,
          0.72,
          0.22,
          1
        ],
        "anticipation": [
          0.42,
          0,
          0.58,
          1
        ],
        "travel": [
          0.42,
          0,
          0.58,
          1
        ],
        "settle": [
          0.22,
          0.72,
          0.22,
          1
        ]
      },
      "linearUseCases": [
        "需保持匀速的时间指示；按实际场景采用"
      ],
      "squashStretch": {
        "enabled": false,
        "maxCompression": 0,
        "maxStretch": 0,
        "preserveVolume": true
      },
      "calibration": {
        "sample": null,
        "fps": null,
        "phasesFrames": {},
        "distancesPx": {},
        "anglesDeg": {},
        "followDelaysFrames": {},
        "scope": "待实际动态样本与用户确认后填写"
      }
    },
    "componentBehavior": {
      "card": "移动、分类与提交时保留身份；处理前后能对应同一文件",
      "result-label": "选中或处理实际完成后出现，不由旁白先提到结果就提前出现",
      "path": "随传递过程表达方向，不先跑完轨迹再移动对象",
      "text": "标签随对象成组变化；必要阅读窗口保持稳定",
      "transition": "由关系推进选择横移、跟随、拉远揭示或直接切换；起止落点写入本段方案"
    },
    "evidence": {
      "static": null,
      "motion": null,
      "confirmation": null
    },
    "fixed": [
      "确认后固定颜色语义、字体层级与类别标识",
      "本例不使用角色"
    ],
    "variables": [
      "具体布局与镜头路线",
      "依据真实配音确定的时长",
      "符合规则的对象数量与内容"
    ],
    "exceptions": []
  }
}
---

# DESIGN 参数与正文填写示例

这是文字填写示例，配色、字号与曲线用于说明参数写法，未通过视觉审阅。校准样本和确认证据保留空值；不要把本例登记为已采用规范。空白模板见 [DESIGN 模板](../templates/DESIGN.template.md)，填写过程见[建立与校验](../docs/09_DESIGN建立与校验.md)。

## Overview

候选方向：用平面图形讲清文件分类与统一采用。观众依次看到混杂文件、用途容器、分段工作区和中央清单；对象变化表达关系，短标签帮助辨认。

本例只填写 MG 呈现层。真实录屏保留原比例，生成场景尚未使用，不从 MG 的背景与配色推导它们的风格。稿件、正式时间、采用版本与允许阶段仍由本期表和用户确认决定。

## Colors

`canvas` 是画布，`surface` 是容器与卡片底色，`line` 表示边界。`primary` 用于必要文字，`secondary` 用于辅助说明。`system` 标识处理主体，`tertiary` 引导当前动作焦点，`success` 只标记已完成或已采用状态。

图片、音频与文稿用不同形状和短标签识别，不将状态色同时当作文件类别。一个画面内，强调色只服务当前需要注意的对象。

## Typography

六级字体参数见 front matter：h1 用于章节标题，h2 用于分区，body 用于必要解释，label 命名对象，metadata 补充非关键信息，subtitle 用于字幕。字号按基准画布解释，输出等比缩放时随场景缩放。

字体栈是候选配置，不表示本包附带字体或目标电脑已安装。正式使用时记录实际解析到的字体及许可，检查替换后的中文换行。标题和解释左对齐，短标签按容器布局对齐，不靠扩大字间距填满一行。

## Layout

画布、安全区和间距以结构化参数为准。主要对象位于字幕区上方；必要说明与动作焦点避免重叠。卡片内边距使用 `spacing.lg`，组内关系优先紧凑，组间关系用更大的间距分开。

分类过程展示文件与容器的对应；并行到总装的关系可以先看一个工作区，再拉远揭示另一个工作区与中央清单。具体位置属于本段布局，不把某一镜的坐标写成系列默认。改变画幅时重新布局，不拉伸。

## Elevation & Depth

本例采用边框与遮挡区分平面层次，阴影配置为 none。移动对象处于容器内容层上方；进入容器后按其遮挡边界归位。需要视差或三维空间时另补空间设计，不将二维缩放描述成绕到对象背面。

## Shapes

卡片使用 `rounded.card`，用途容器使用 `rounded.container`，状态标签使用 `rounded.small`。线宽见 `x-video`。装饰倾斜上限只约束无叙事作用的倾斜，不禁止有表达目的的旋转或镜头滚转。

文件移动后仍能通过形状、标签及数量认出来源；不通过淡出旧文件、淡入不相关文件来冒充处理过程。

## Components

| 组件 | 静态接口与状态 | 动作及检查 |
| --- | --- | --- |
| 文件卡 | 引用 card 的底色、字体、圆角和间距；保留类别标识 | 同一对象移动、归类或被选中；检查身份是否连续、标签是否可读 |
| 用途容器 | 底色、边框、标题与内容区分层 | 对象实际进入后更新内容；检查遮挡和落点 |
| 结果标签 | 引用 result-label；只表达完成或采用 | 状态改变后出现；不能仅因旁白提到结果而提前宣布成功 |
| 关系路径 | 仅连接真实的源、目标与采用项 | 路径、对象移动、接收反馈顺序一致；无关系不加装饰连线 |
| 字幕 | 引用 subtitle；与主对象错开 | 随实际配音分句；结果阅读时避免字幕和主体同时争夺焦点 |

不使用窗口外框，因此 `container.enabled` 为 false，对应内部尺寸为零。以后采用时再由确认样本补全，不让零值进入实际组件。

## Do's and Don'ts

- 分类前后保留文件身份，旧候选仍在专属区；只有选中的版本进入中央清单。
- 必须让观众看懂分类范围与采用关系，不能用进度条或大字结论替代过程。
- 必要文字正在阅读时稳定相关画面；不要将局部阅读窗口扩大为整段固定镜头。
- 不以装饰数量、持续运动或效果叠加替代信息推进。

## Motion（视频扩展）

四类曲线是待测试的候选：reveal 用于出现，anticipation 用于有明确意图的预备，travel 用于主动作，settle 用于停稳。没有预备、接触或附属件的动作不强补阶段。跨镜运动匹配需承接切点两侧的方向和速度，不机械地两边各缓入缓出。

本例暂不采用形变，因此 squashStretch.enabled 为 false；这不禁止其他项目经测试后采用。曲线参数只定义速度变化的候选方式，不决定本期动作时长或镜头选择。

镜头先按[镜头推进方法](../experience/镜头推进与转场.md#段落吸引力与镜头推进)判断。例如：传递时可以跟随对象，展开关系时可以拉远揭示，同时读对照值时稳定比较窗口。写清看向谁、落在哪里、揭示什么，以及跟随主体还是移动镜头；不把某种镜头设为所有场景默认。

### 校准怎样填写

实际动态样本完成后，填写 `calibration.sample`、实测 fps，以及样本对应的阶段帧数、距离、角度和跟随延迟；在 scope 说明验证范围。没有发生的动作可省略对应数值，未验证项继续留空。

这些数值来自实际样本，不填演示用的假时间。正式镜头再依据采用配音写毫秒与帧标记；换 fps 时先换算时长，不照抄帧数。

## Exceptions & Evidence（视频扩展）

`evidence.static` 和 `evidence.motion` 分别填写真实文件路径；`confirmation` 记录用户确认的范围和依据。只确认静态时，不登记运动已确认。

正式采用前检查参数引用与单位、组件实际用值、文字可读性、对象因果、接触遮挡、阅读窗口及前后衔接。某段的例外写明范围和确认依据，不自动升级为系列默认。
