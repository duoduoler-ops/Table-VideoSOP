<!-- GENERATED from templates/QA状态表.template.md; edit package-skill.mjs transforms or upstream, then sync. -->
> Skill 模式：总控统一管理，分段可串行或并行；中央 state 与 QA 只由总控写入。源码示例须结合已有运行环境使用；文档与工具测试不代替实际成片验收。

# QA 状态表

正式项目由初始化工具创建。本文件说明唯一结构化记录格式；检查通过 workflow apply 的 qa 请求写入，不手工维护另一张状态表。用户确认仍在 state；这里只链接其证据。

<!-- table-video-qa:start -->
```json
{"schemaVersion":"1.0","generatedFromRevision":0,"records":[]}
```
<!-- table-video-qa:end -->

检查项包括 checkId、objectId、aspect、artifactHash、effectiveHash、实际方法、结果、证据和执行时间。result 只允许通过、未通过、未验证、不适用；未通过／未验证／不适用必须说明原因。仅技术检查不能冒充实际观看或审听。

## 生成视图

由结构化记录生成；空记录意味着尚无检查。没有独立可编辑的通过状态。

MG 的效果证据按[状态契约](../../references/state-contract.md#mg-效果证据)记录 visual-design 与 motion；证明当前产物的设计、镜头实现、时间分配及对标检查。它们不替代 visual 的实际审看，也不由技术成功自动生成通过。
