![Table-Video SOP](assets/cover.png)

[Douyin · 一只桌子](https://v.douyin.com/7jbgafVeA4U/) · [YouTube · 一只桌子](https://www.youtube.com/@%E4%B8%80%E5%8F%AA%E6%A1%8C%E5%AD%90) · [Xiaohongshu · 一只桌桌桌子](https://xhslink.cn/o/2iZQ3Yc2j4E) · [bilibili · 一只桌子_table](https://b23.tv/7Y34qaP) · [X · 一只Table](https://x.com/YizhiTable)

[简体中文](README.md) · **English**

# Table-Video SOP

**SOPs, project rules, production notes, templates, and prompts for making videos with AI.**

Turn an approved script and voiceover into a video whose visuals add meaning, whose sections can be produced in parallel, and whose source files remain editable. These materials come from my production and revision work. They suit narration-led explainers, commentary, and product demonstrations.

You decide the content, style, and accepted versions. The agent plans the work, prepares tasks, builds animation and edits, and records checks. You generate images and videos manually in your chosen tools.

> **Optional modules:** I am still learning and refining scriptwriting, voiceover, and sound design. The script review and sound production methods are references you may use, adapt, or replace; they are optional parts of the process.

This README includes English instructions and copyable prompts. The linked guides and templates are currently in Chinese.

## Follow along: from setup to delivery

Put the complete package in your own series folder and open that folder with an agent that can read and write local files. For an existing project, place the package in a separate reference folder and map the integration first, preserving existing files. **Use the first conversation as the coordinator** for episode planning, accepted versions, and assembly. Later section conversations handle their assigned work only.

Copy the prompts below and replace the bracketed fields. Use “none” or “undecided” where appropriate. Send one step at a time, review its result, then send the relevant approval. Start every new conversation from the series root. If rules are not loaded automatically, add: “Read AGENTS.md at the root before handling this task.”

### 1. Initialize the project and check the tools

**Purpose:** Establish the episode's working folders and identify available tools, versions, and missing requirements. Remotion + FFmpeg is the default route; you may specify another.

```text
Read AGENTS.md, docs/01_快速开始.md, docs/03_目录与并行协作.md, and docs/07_工具与环境.md.
Task: [new series / integrate an existing project]; series: [name]; episode topic: [topic].
Platform and aspect ratio: [details]; production route: [Remotion + FFmpeg / other]; collaboration:
[parallel / sequential].
Existing script, voiceover, references, and assets: [actual paths / none].
Check actual paths, tools, versions, and permissions without installing anything.
For a new project, create the necessary episode folders and episode notes from the directory
template. For an existing project, list the integration mapping and conflicts, then wait for my
approval to integrate.
Mark missing information as pending. For missing dependencies, give the installation plan, impact,
verification method, and commands. Do not mark DESIGN as approved.
Deliver the episode notes path, environment findings, and next step.
```

**Check:** The episode folder is easy to locate, and tool availability has been tested. If installation is needed, approve the specific plan before execution and verification of preview, rendering, and decoding. [Environment guide](docs/07_工具与环境.md)

### 2. Approve static and motion style, then create DESIGN.md

**Purpose:** Turn visual and motion preferences into usable specifications. Reuse an approved, applicable `DESIGN.md`; test only the missing parts.

Start with static candidates:

```text
Read AGENTS.md, templates/DESIGN.template.md, and docs/09_DESIGN建立与校验.md.
Content and audience: [details]; aspect ratio and viewing context: [details].
Visual preferences and dislikes: [details]; references: [paths and each image's role, such as style
or composition].
Character reference: [path / no character].
Create a small set of meaningfully different design frames close to the final appearance. Compare
palette, type, layout, graphics, and character treatment; do not substitute placeholder wireframes.
Save them in 00_系列测试/静态/ with editable sources and parameters. Explain the choices for my review;
these are candidates, not approved designs.
If AI image generation is needed, prepare complete prompts and reference roles for me to generate
manually.
```

After choosing a static direction, request motion tests:

```text
Accepted static candidate and scope: [exact path, version, and accepted aspects].
Read AGENTS.md, experience/视觉叙事与连续MG.md, and experience/镜头推进与转场.md.
Motion preference: [restrained / lively / specific reference].
Keep the approved appearance. Test applicable shape changes, object interaction, follow-through, and
settling. Choose camera movement for the content and emotion, without a technique quota.
Deliver playable previews, source files, and parameters in 00_系列测试/动态/. Explain the differences and
wait for my motion selection.
```

Once both are approved, create the specification:

```text
Approved static samples: [paths, versions, scope]; approved motion samples: [paths, versions,
scope].
Create the root DESIGN.md using templates/DESIGN.template.md and docs/09_DESIGN建立与校验.md.
Extract palette, typography, layout, component, and motion parameters from the accepted samples.
Separate fixed rules, variables, and exceptions, and link the supporting samples.
Mark untested or unapproved aspects as pending. Preserve a rollback copy of an existing file and
leave unrelated content intact.
```

**Check:** `DESIGN.md` links to accepted samples and specifies usable parameters. Static approval has not been treated as motion approval. [Detailed template](templates/DESIGN.template.md) · [Filled example](examples/03_DESIGN填写示例.md)

### 3. Prepare the approved script and voiceover

**Purpose:** Establish the content and the actual timing used for production. Put the script in the episode's `01_稿件/` folder and the voiceover in `02_配音/`.

**Script review — optional:** Use this if you want suggestions. Skip it if your script is already approved.

```text
I choose the optional script review. Read AGENTS.md, docs/05_文案检查_可选.md, and prompts/03_文案检查_可选.md.
Script: [path]; audience: [details]; facts, views, and personal voice to preserve: [details].
Keep the original unchanged. Run the full SOP review, including viewer drop-off risks, the five
improvement areas, and the five root problems; apply the length-specific checks where relevant.
Deliver one review document in the episode's 01_稿件/ folder with source locations, priorities,
issues, and suggested changes. Do not rewrite the whole script.
```

To apply selected changes, send: “Accept suggestions `[IDs]` and preserve `[content]`. Change only those items, save a new candidate, and wait for my approval.” After approving the script and preparing your voiceover, send this to the coordinator:

```text
Episode: [path]; approved script: [exact path and version]; accepted voiceover: [exact path and
version].
Existing subtitles and terminology list: [paths / none]; delivery platform, aspect ratio, and
specifications: [details].
Read AGENTS.md. Check the complete spoken content, sequence, pauses, and consistency with the
script; verify that the audio file is usable.
Proofread existing subtitles, or generate derived subtitles if the tools are available and
authorized. Check terminology and actual audio timing; do not treat subtitle intervals as word-onset
timestamps.
Record accepted inputs in the episode notes, or maintain them in the production plan if it already
exists.
List conflicts or missing inputs. Without voiceover, limit work to semantic planning: do not invent
final timecodes or start animation that depends on them.
```

**Check:** Accepted files and content boundaries are explicit, and the voiceover matches the script. Having an audio file alone does not establish a verified time base. [Script review method](docs/05_文案检查_可选.md)

### 4. Plan the production sections and approve the routes

**Purpose:** Decide what each section adds visually, how to produce it, and where rework is most likely.

```text
Read AGENTS.md, docs/02_制作SOP.md, docs/04_验收与返修.md, and templates/制作大段表.template.md.
Episode: [path]; accepted inputs: [reference the checked episode notes, or list exact script,
voiceover, and subtitle paths and versions].
DESIGN: [approved scope]; existing assets and real evidence: [paths / none]; additional
requirements: [details].
Divide sections by narrative task, visual relationship, production route, or risk—not fixed
durations or one shot per sentence.
For each section, specify what the voiceover already supplies, what the visual adds, necessary
on-screen text, key states, and transitions. Verify final timing against the actual voiceover.
Save the production plan in 00_本期控制/. Attach short tables for priority review items and
generated-video recommendations, including issues, impact, checks, dependencies, and alternatives.
Highlight the review priorities and recommendation reasons in chat. Recommendations are not accepted
automatically; wait for my approval of sections, routes, and responsibilities.
```

After reviewing the plan and issues, confirm with the coordinator:

```text
I approve the sections, routes, and responsibilities in production plan [exact version].
Accepted generated-video recommendations: [section IDs / none]; collaboration: [parallel /
sequential].
Prepare the required folders and task briefs according to docs/03_目录与并行协作.md. Add only missing items
and preserve existing work.
For parallel work, generate 00_本期控制/分段开工指令.md with each section's real absolute paths, accepted
inputs, permitted stage, write boundaries, and handoff-note location.
Check that inputs exist, write scopes do not overlap, and transitions have owners. Design and asset
preparation are permitted now; visual approval is still pending.
```

**Check:** Each section has an owner, inputs, design deliverables, and dependencies. Parallel starter prompts are fully filled in and ready to copy. [Two-section planning example](examples/01_两段演示.md)

### 5. Open section conversations for design and asset preparation

**Purpose:** Let sections progress independently while retaining one visual specification and one coordinator.

Open new conversations from **the same series root**. Copy each section's complete command from `分段开工指令.md` into its own conversation. For sequential work, handle sections in the current task. Deliver clean design frames and separate motion annotations according to the task brief, and record them in the assigned handoff notes. The coordinator maintains shared control files.

**For sections that need generated images or video**, send this in the relevant section conversation:

```text
Read AGENTS.md, DESIGN.md, experience/手动生图生视频.md, and this section's task brief.
Section: [ID / task brief path]; accepted generation candidate: [content].
Generation tool and available input modes: [details; check official documentation if uncertain].
References and roles: [paths, identity / style / composition]; exact text and sound requirements:
[details].
Use the voiceover range to prepare complete image and video prompts ready to paste into the tool,
plus reference upload order, parameters, action and sound requirements, and acceptance checks.
Time action plans from the shot's local 00:00.000. Without actual voiceover, do not invent final
durations.
Save prompts and the reference list in this section's assigned folder. I will generate manually; do
not submit or retry generation for me.
```

After generating, return the files to the same section conversation:

```text
Returned candidates for this section: [file paths]. Check identity, meaning, text, style, action,
camera movement, and sound against the task brief.
List usable ranges and specific issues. Distinguish generation failures from issues that can be
fixed in post, and preserve usable material.
If regeneration is needed, give me complete revised prompts. Review the files first; do not register
candidates as accepted without my decision.
```

**Check:** Design frames show the actual appearance. Motion annotations explain how attention shifts, when states change, and how movement settles. Motion-graphics and screen-recording routes also deliver designs and check evidence through their briefs; generated video is not required for every section. [Generation examples](examples/02_生图生视频提示词示例.md) · [Screen-recording notes](experience/录屏剪辑.md)

### 6. Approve the whole video's visual plan, then produce sections

**Purpose:** Review style, meaning, and continuity across sections before full production.

First, return to the coordinator:

```text
Episode: [path]; section designs, motion annotations, and asset candidates: [exact handoff-note
paths and versions].
Use AGENTS.md and the current production plan to compile a whole-video visual overview. Do not
accept undecided candidates on my behalf.
Check that visuals add information beyond the voiceover, camera choices fit the narration, scene,
and emotion, and reading windows and transitions work.
List concrete decisions for my review. Separate motion that has not been shown or tested; static
frames do not validate movement.
```

After choosing, tell the coordinator: “Approve visual overview `[version and scope]` and accept assets `[exact paths and versions]`. Update the production plan and affected briefs; allow sections `[IDs]` to enter production.” Then continue in each section conversation:

```text
The coordinator has recorded this section's visual approval: [plan version and approved scope].
Check the updated brief and continue the permitted production work.
If unresolved risks would make rework costly, first validate the actual difficulty with a
representative test clip. Continue directly where approval and conditions are unchanged.
Use the registered project environment. Write only in this section's assigned folders; do not
install separate dependencies or change shared components.
Align action and sound markers to the actual accepted footage. Recalibrate after speed, trim, or
duration changes.
Deliver editable source, parameters, a preview, and handoff notes identifying asset versions,
start/end states, timing, sound strategy, checks, and unresolved issues.
```

**Check:** Section deliverables can be located and edited. Candidates and accepted versions are distinct. The coordinator schedules heavy rendering. [Section responsibilities and boundaries](docs/03_目录与并行协作.md)

### 7. Assemble and approve the full picture

**Purpose:** Integrate selected sections into one formal project and check continuity between them.

```text
Read AGENTS.md, docs/04_验收与返修.md, and the episode production plan.
Episode: [path]; section deliverables I accept: [exact handoff notes and versions].
Check source, parameters, assets, start/end states, time base, source-audio strategy, and
verification evidence. Integrate them into the registered main project or assembly entry point.
Use only my selected versions. Render a full review copy and check meaning, readability, section
joins, transitions, occlusion, empty frames, and aspect ratio.
Update accepted versions in the production plan and actual findings in the QA sheet. Mark checks you
cannot perform as unverified.
Deliver the review file and outstanding decisions, then wait for my picture-lock approval.
```

After watching and accepting the picture, send: “Approve picture lock for `[review version and scope]`; proceed to sound, subtitles, and final QA.” Picture lock identifies the accepted visual version. Later picture changes require rechecking affected sound and subtitles. [QA and revisions](docs/04_验收与返修.md)

### 8. Finish sound and subtitles, verify, and deliver

**Sound effects and music — optional:** Send the following prompt if you choose this module; otherwise go straight to final assembly. Sound planning may start earlier, but final cue timing follows the actual accepted footage.

```text
I choose sound production. Read AGENTS.md, docs/06_音效与配乐_可选.md, and prompts/07_音效与配乐_可选.md.
Episode and locked picture: [path, version]; accepted voiceover: [path]; existing sound plan: [path
/ none].
Scope: [sound effects / music / both]; source-audio strategy: [keep / mute / mix, with scope].
Available assets and sources: [paths / none]; music direction: [details / no music].
Plan sound and quiet windows around actual actions, state changes, and emotion. Do not mechanically
add sound to every movement.
Give one-shot effects precise local timestamps and sustained sounds start/end ranges. Preserve
separate tracks, volume envelopes, sources, and mix parameters; avoid duplicate source audio.
List gaps before incurring charges or using assets with unclear permission. Distinguish technical
checks from actual listening and mark checks you cannot perform as unverified.
```

Once sound choices are settled, ask the coordinator to complete subtitles, assembly, and QA:

```text
Approved picture: [exact version and scope].
Accepted sound: [approved effect/music paths and versions, or existing voiceover and specified
source audio only].
Subtitle and delivery specifications: [details or episode notes reference].
Follow docs/04_验收与返修.md and experience/字幕与封面.md to create subtitles, assemble the final output, and
verify it.
Check script, voiceover, subtitles, and actual picture timing; check duplicate audio, clarity,
occlusion, specifications, full decoding, sources, and privacy.
Watch and listen to the complete final file at 1× speed. Mark anything you cannot do as unverified;
measurements or extracted frames do not replace those checks.
Deliver the final video, applicable clean master, subtitles, editable project and parameters,
reproduction instructions, and QA status. List remaining issues; do not publish automatically.
```

**Check:** The final video and reproducible source files are available, with completed and unperformed checks clearly separated. Skipping optional sound production still requires checking the voiceover, source audio, and subtitles that are used. [Sound method](docs/06_音效与配乐_可选.md)

### 9. Prepare the cover and publishing materials

**Purpose:** Make the title, cover, and description accurately reflect the finished video. Use this step when preparing to publish.

```text
Follow experience/字幕与封面.md to prepare the cover and publishing materials.
Final video and topic: [path / topic]; publishing platform and use: [details].
Style reference: [path and role]; composition reference: [path and role]; character reference: [path
/ none].
Title information to retain: [details].
Check the current platform's required aspect ratios and official specifications. Propose an
accurate, readable direction first and wait for my choice.
```

After selecting a direction, send:

```text
Accepted cover direction: [specific option]. Prepare complete image prompts, reference upload roles,
exact title text, and post-production notes for me to generate manually.
Review returned candidates and perform authorized post-production. Prepare the title, description,
required credits, and actual public links.
Check the complete publishing package for factual accuracy, privacy, sources, and consistency of
claims. List pending decisions; do not publish automatically.
```

**Check:** Publishing materials are complete and match the video. Upload them yourself, or explicitly authorize an agent with the destination, materials, and permitted actions. [Cover and publication checks](experience/字幕与封面.md)

<details>
<summary>Reflect after delivery — optional</summary>

```text
Follow prompts/09_复盘.md to produce a concise retrospective from the episode plan, handoff notes, QA,
and change records.
Scope: [episode path / revised section].
Record only real rework, repeated omissions, and solutions supported by evidence, with triggers,
limits, and evidence.
Separate general methods, series preferences, and episode-specific cases. Keep unverified ideas as
candidates.
Propose specific files and concise changes first; do not modify rules or publish automatically.
```

</details>

## Image and video generation

Give each reference image a clear role, establish character identity and visual style, and specify the scene, action, camera, and sound. You generate and select the footage manually. The agent reviews the returned files and aligns action and sound cues to the actual result.

| Example 1 | Example 2 |
| :---: | :---: |
| ![Heidan entering a fixed office in a watercolor scene](assets/screenshots/generated-office.jpg) | ![Characters collaborating around an architectural model](assets/screenshots/generated-collaboration.jpg) |

[Generation notes](experience/手动生图生视频.md) · [Prompt preparation and footage review](prompts/06_生图生视频.md)

## Motion graphics and camera movement

Use the voiceover, scene, and emotion to decide what the audience should notice, then choose object motion and camera movement. Comparisons, transfers, repeated handoffs, and spatial reveals call for concrete staging decisions; necessary reading windows remain stable. Motion annotations specify triggers, destinations, contact, state changes, and settling.

| Close view: focus on the current question | Pullback: reveal the full relationship |
| :---: | :---: |
| ![A close view of the conversation record](assets/screenshots/mg-detail.jpg) | ![A wider view of the complete work-boundary diagram](assets/screenshots/mg-overview.jpg) |

| Object transfer: a task crosses the boundary | Viewpoint change: move into a workspace |
| :---: | :---: |
| ![Task materials moving between a project and a subagent](assets/screenshots/mg-handoff.jpg) | ![The view moving into independent workspaces](assets/screenshots/mg-worktree.jpg) |

[Visual storytelling and continuous motion graphics](experience/视觉叙事与连续MG.md) · [Camera movement and transitions](experience/镜头推进与转场.md) · [Action and sound markers](templates/动作与声音标记.template.md)

These are frames from my actual Episode 04 video, included as visual references. They are not results of an independent reproduction of this package, and still images cannot show the full motion. [Frame sources](assets/README.md)

## Responsibilities and scope

`AGENTS.md` routes tasks. SOPs define the production sequence. `DESIGN.md` defines appearance and motion. The production plan records accepted episode versions and progress. The QA sheet records actual checks. Parallel tasks write only to their assigned folders; the coordinator maintains shared state and the final assembly.

The package contains guides, templates, prompts, written examples, and README images. It does not include a demo, production project, generation service, or character asset pack. Remotion and FFmpeg are the default routes described; other tools can be used with the same input, approval, and QA requirements. Installation, login, additional charges, and publishing require authorization within the task's scope.

Fill in bracketed fields in templates and prompts. The coordinator supplies actual paths before assigning section tasks. You do not need my private knowledge base, accounts, or old projects. Do not commit your finished videos, account details, or private files to this documentation repository.

## Validation and license status

The main task routes have been checked and revised using Windows and Codex tasks that did not inherit the original conversation. The latest camera-selection rules have received scenario-based logic and cross-reference checks only; new independent trigger tests and footage validation have not been performed. Fresh-machine setup, a complete audiovisual production, and independent reproduction of visual quality remain unverified.

This is a private working edition, not a public release. A formal license has not yet been selected. [Sources and licensing](docs/08_来源与许可.md)

## Get in touch

Questions and suggestions from real production work are welcome.

| Channel | Contact |
| --- | --- |
| Email | [duoduoler@gmail.com](mailto:duoduoler@gmail.com) |
| X | [一只Table · @YizhiTable](https://x.com/YizhiTable) |
