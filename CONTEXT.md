# Agent Learning Hub

Agent Learning Hub 将公开的 Agent 工程学习路线、经过策展的资料和个人学习状态组织成一套可执行的学习体验。

## Language

**Application Root**:
新应用的唯一现役工程目录，即 `code/`；其中包含应用代码、公开内容、Docker 配置、维护脚本和可再生成报告。
_Avoid_: Root-level app, second web app

**Learning Hub**:
由每日资讯发现、学习路线、策展资料和个人学习状态组成的完整学习环境。
_Avoid_: Link collection, resource dump

**Learning Track**:
对学习资料进行主题分类的维度；当前包括 Learning、AICoding、Agentic 和 Application。
_Avoid_: Stage, category tree

**Learning Stage**:
九阶段路线中的一个有序学习里程碑，包含目标、任务、资料和验收产物。
_Avoid_: Track, chapter

**Stage Task**:
由维护者定义、属于一个 Learning Stage 的可执行实践任务，并附带明确的验收条件。
_Avoid_: Personal to-do, automatic completion

**Project Outcome**:
由维护者预先定义的公开成果描述，例如代码仓库、演示或学习总结；它可以用于验收一个 Learning Stage，也可以保留尚未可靠关联阶段的项目阶梯条目。它不等同于学习者实际提交的 Stage Outcome。
_Avoid_: Stage Outcome, completion checkbox

**Learning Item**:
被课程清单收录、可以纳入路线或搜索的一项学习资料。
_Avoid_: File, repository, link

**Course（课程）**:
围绕一个学习主题组织的完整学习资料，包含由作者或维护者明确排列的课节，供学习者连续阅读。
_Avoid_: Learning Stage, isolated chapter, repository dump

**Course Chapter（课节）**:
课程中的一个有序阅读单元；“上一节 / 下一节”表示同一课程阅读顺序中的相邻单元。
_Avoid_: Learning Stage, Stage Task, next search result

**Curated Content**:
由维护者整理并作为本项目公开内容发布的路线、导览、文章和任务。
_Avoid_: Local Material, upstream content

**Upstream Source**:
第三方学习资料的权威原始发布位置。
_Avoid_: Mirror, local copy

**Collection Source（采集信源）**
网站接收资讯的指定输入来源，具有可配置的自动发布或人工确认方式。采集信源可以汇集多个原始出处的内容。
_Avoid_: Upstream Source, Learning Track

**Discovery Item（资讯条目）**
围绕一份原始内容组织的资讯，包含出处、摘要和发布状态，可关联多个采集信源，供阅读、收藏和推荐收录。
_Avoid_: Learning Item, source record

**Daily Edition（精选日报）**
每天形成的一份固定资讯精选，面向集中阅读与按日期回看。
_Avoid_: Rolling feed, Learning Stage

**Curation Proposal（学习收录建议）**
系统为具有长期学习价值的资讯提出的公共目录收录建议，包含推荐理由和适用阶段，由维护者审阅决定。
_Avoid_: Bookmark, published Learning Item

**Local Material**:
保存在本机素材库中的第三方资料副本，可以在本地模式下阅读。
_Avoid_: Curated Content, owned content

**Local Material Library**:
由本机维护的第三方仓库和文档集合，不属于云端发布内容。
_Avoid_: Course catalog, cloud content

**Content Catalog**:
决定哪些学习资料被收录，并记录其轨道、阶段、来源、归属和访问方式的权威清单；运行时目录为 `code/content/`。
_Avoid_: Directory scan, local-courses tree

**Resolved Content**:
一个 Learning Item 在当前运行模式下最终可用的访问结果，例如站内正文、本地文档或上游网页。
_Avoid_: Raw path, source URL

**Cloud Mode**:
不依赖 Local Material Library、通过资讯发现、自有内容和 Upstream Source 提供学习体验的运行模式。
_Avoid_: Hosted local mode

**Local Mode**:
可以使用 Local Material Library，并在缺失时回退到 Upstream Source 的单用户运行模式。
_Avoid_: Offline mirror

**Learning State**:
属于单个用户的进度、阅读位置、收藏、笔记和阶段成果集合。
_Avoid_: Course content, analytics

**Operational Metric**:
不关联用户身份的聚合运行事件，例如页面访问、健康检查或失败计数；它不保存用户 ID、IP、Cookie、查询参数、笔记正文或秘密。
_Avoid_: Learning State, activity log, raw request log

**Stage Outcome**:
用户为证明完成一个 Learning Stage 而记录的代码仓库、演示链接或学习总结。
_Avoid_: Completion checkbox, automatic score

**Freshness Status**:
描述 Local Material 与 Upstream Source 之间是否同步、落后、分叉或存在本地修改的状态。
_Avoid_: Automatic update, Catalog Drift

**Catalog Drift**:
Content Catalog 声明的本地路径与 Local Material Library 实际内容之间的偏离，包括路径失效、素材被删除和未被收录的新素材。它与 Freshness Status 是两件事：一个比磁盘，一个比上游。
_Avoid_: Freshness Status, git status

**Deployment Helper**:
`code/scripts/docker-deploy.sh` 提供的 Docker Compose 入口，用于构建、启动、配置检查、健康验证和运行已发布镜像。
_Avoid_: Production release approval, automatic rollback
