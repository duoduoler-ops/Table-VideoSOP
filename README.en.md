![Table-Video SOP](assets/cover.png)

| Platform | Account |
| --- | --- |
| Douyin | [一只桌子](https://v.douyin.com/7jbgafVeA4U/) |
| YouTube | [一只桌子](https://www.youtube.com/@%E4%B8%80%E5%8F%AA%E6%A1%8C%E5%AD%90) |
| Xiaohongshu / RED | [一只桌桌桌子](https://xhslink.cn/o/2iZQ3Yc2j4E) |
| bilibili | [一只桌子_table](https://b23.tv/7Y34qaP) |
| X | [一只Table · @YizhiTable](https://x.com/YizhiTable) |

[简体中文](README.md) · **English**

# Table-Video SOP

**SOPs, project rules, production notes, templates, and prompts for making videos with AI.**

Turn an approved script and voiceover into a video whose visuals add meaning, whose sections can be produced in parallel, and whose source files remain editable. These materials come from my production and revision work. They suit narration-led explainers, commentary, and product demonstrations.

You decide the content, style, and accepted versions. The agent plans the work, prepares tasks, builds animation and edits, and records checks. You generate images and videos manually in your chosen tools.

> **Optional modules:** I am still learning and refining scriptwriting, voiceover, and sound design. The script review and sound production methods are references you may use, adapt, or replace; they are optional parts of the process.

This README is available in English. The detailed guides, templates, and prompts are currently in Chinese.

## Start here

1. **Open your own series folder.** For a new project, place the complete package in that folder and open it with an agent that can read and write local files. For an existing project, map the integration first; do not overwrite its rules.
2. **Check the environment.** Read the [quick start](docs/01_快速开始.md) and copy the [initialization prompt](prompts/01_初始化与环境检查.md) to identify available tools and missing requirements.
3. **Create your own DESIGN.** Use the [design prompt](prompts/02_建立DESIGN.md) for static and motion tests, then populate the [detailed template](templates/DESIGN.template.md) after approval. The agent can extract parameters; you choose the character, palette, and motion style.
4. **Approve the script, voiceover, and production plan.** Use the [planning prompt](prompts/04_制作大段表.md). Review what each visual adds, which parts need attention first, and where generated video would help.
5. **Design and produce sections.** Once the plan is approved, the agent prepares dedicated folders, briefs, and complete starter prompts. Open separate conversations for parallel work, review design frames and motion annotations, then proceed to production, assembly, and QA.

Start each new task from the series root. If your agent does not load project rules automatically, send:

```text
Read AGENTS.md at the project root and follow the guides relevant to this task.
Confirm the accepted episode inputs and permitted stage before acting on my request.
```

See the [two-section planning example](examples/01_两段演示.md), [DESIGN example](examples/03_DESIGN填写示例.md), and [complete generation prompt examples](examples/02_生图生视频提示词示例.md).

## Production process

```text
Environment check → static and motion tests → approve DESIGN
Script → [optional] script review → approve script and voiceover
Production plan + priority review items + generated-video recommendations → approve plan
Prepare section folders and starter prompts → design frames + motion annotations → visual approval
Produce sections → assemble and lock picture → [optional] sound effects / music → subtitles and final QA
Cover and publishing materials → pre-publication review → user approval to publish
```

Use a representative test clip to resolve unproven production risks. Sound planning can begin early, but final cues follow the actual accepted footage. Skipping an optional module does not remove the need to check sound and subtitles that are used.

## Image and video generation

Give each reference image a clear role, establish character identity and visual style, and specify the scene, action, camera, and sound. You generate and select the footage manually. The agent reviews the returned files and aligns action and sound cues to the actual result.

| A fixed workspace and its surroundings | Character action and collaboration |
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

## Guide map

| Task | Guides and templates | Copyable prompts |
| --- | --- | --- |
| Initialize and check tools | [Quick start](docs/01_快速开始.md), [tools and environment](docs/07_工具与环境.md) | [Initialization](prompts/01_初始化与环境检查.md) |
| Define visual and motion style | [DESIGN template](templates/DESIGN.template.md), [creation and validation](docs/09_DESIGN建立与校验.md) | [Create DESIGN](prompts/02_建立DESIGN.md) |
| Review the script — **optional** | [Script review SOP](docs/05_文案检查_可选.md) | [Review and apply selected changes](prompts/03_文案检查_可选.md) |
| Plan and coordinate sections | [Production SOP](docs/02_制作SOP.md), [folders and parallel work](docs/03_目录与并行协作.md) | [Production plan](prompts/04_制作大段表.md), [section kickoff](prompts/05_并行准备与分段开工.md) |
| Edit screen recordings | [Screen recording notes](experience/录屏剪辑.md), [task template](templates/开工任务.template.md) | [Section kickoff](prompts/05_并行准备与分段开工.md) |
| Make sound effects and music — **optional** | [Sound SOP](docs/06_音效与配乐_可选.md) | [Plan, produce, and revise sound](prompts/07_音效与配乐_可选.md) |
| Assemble, subtitle, package, and deliver | [QA and revisions](docs/04_验收与返修.md), [subtitles and covers](experience/字幕与封面.md) | [Assembly and cover](prompts/08_总装验收与封面.md) |
| Reflect on production | [Production SOP](docs/02_制作SOP.md) | [Retrospective](prompts/09_复盘.md) |

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
