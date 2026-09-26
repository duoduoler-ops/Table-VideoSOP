# 工具

## motion-check.ps1｜动态自检

多数 Agent 不能以正常速度观看或收听自己渲染的视频，只能看静帧。这个脚本把一段成片变成少量可看的证据，帮助在交给用户前先发现明显问题。它只调用本机 FFmpeg／FFprobe，不调用模型，也不删除任何文件。

输出到 `-OutDir`：

- `overview.png`：整段约 48 格总览，带时间码。
- `summary.txt`／`summary.json`：连续静止区间（默认 ≥0.75 秒、-55dB 视为静止），≥2 秒的区间标出待确认用途。
- `strip_NN_<起>-<止>.png`：`-Ranges` 指定时段的密集帧（默认 10fps），用来确认变形、接触、焦点交接等过程是否真的可见。
- `_filters/`：生成图片用的滤镜文本，便于复现。

```powershell
pwsh -NoProfile -File tools/motion-check.ps1 -Video 'renders/D01_sample.mp4' -OutDir '_work/motion-check/D01_v01' -Ranges '2.5-4.2'
```

- 何时跑：样片或整段渲染后、交用户前各一次；中间调参不必跑。先看文字统计，只对标出区间和关键动作看图。
- 同名输出会被覆盖，每个版本用新的输出目录。时间码字体使用 Windows 自带 Arial，找不到时省略时间码。
- 边界：只定位，不判通过。静止少不等于合格，必要阅读也会形成静止；作者系列中曾有静止约 25%、最长 1.4 秒的版本，仍因动态不足、表述不准被否。结论仍靠与对标片连看和用户 1× 观看。

## 许可

本目录脚本以 MIT 许可发布，见仓库根目录的 [LICENSE-CODE](../LICENSE-CODE)。
