# 要求、部件变化与可追踪指示

这是一份可编辑的因果过程示意，不是已验收成片或通用视觉预设。1280×720、30fps、8.4 秒只属于本例。原第五期源码保持原字节，本入口复用其“依据先于对应部件修改”的关系，并用同一次生产绘制生成 SVG 和观察记录。

`process.cjs` 按明确字段 ID 和格式要求计算实际修改内容；`scene.cjs` 用 `motion-observation.cjs` 记录实际绘制、裁切、层级和鼠标热点。`audit-adapter.cjs` 直接调用这个入口。文字的实际像素、可读性与整体 1× 观感仍需观看；未知遮挡不会被写成可见通过。

```js
const scene = require('./scene.cjs');
const state = scene.stateAt(3.7, {mode: 'good'});
const svg = scene.renderDocument(state); // 同一状态用于静帧、视频和网页
const frame = scene.frameAt(3.7, {mode: 'good'}); // 实际绘制记录
```

模式共用同一内容、布局、总时长和结果位置：

- `good`：要求完整出现，定位对应日期字段，原处改变分隔符，复制实际值到预览，鼠标离开画布后才隐藏。
- `premature`：准确定位和修改抢在要求出现前；结果相同也不能证明因果成立。
- `wrong-target`：按同一要求却改了数量，日期原样送出；辅助动作不构成正确修改。
- `flash`：内容正确，但指示对象前段高速、层级错误、画内硬消失。该模式是失败回归。

需要鼠标时使用默认 `pointer:true`；不需要操作指示时可以 `pointer:false`，它不改变内容修改的依据。`content` 可以替换标题、三个字段和指向已有字段的 `date-separators` 要求；这是具体日期格式示意，不宣称能自动解释任意自然语言修改。其它内容应改实际状态转换，而非只换标签。

浏览器正反对照位于 [process-patterns.html](../../../examples/process-patterns.html)，直接加载这些生产脚本，无第二套玩具动画。渲染可使用已有 SVG 栅格化环境和 FFmpeg；不安装依赖，不将产物写回本目录。工程审计必须传入实际编码文件，不能用虚构视频路径声称完成验收。
