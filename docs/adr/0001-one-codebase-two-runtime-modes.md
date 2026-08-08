# 使用同一代码库支持云端与本地模式

Agent Learning Hub 使用一套应用和一份 Content Catalog，同时支持 Cloud Mode 与 Local Mode。两种模式通过 Content Resolver seam 上的 Cloud Adapter 和 Local Adapter 改变资料解析行为，而不复制页面和业务逻辑；这样既保留云端轻量部署，也保留本地素材库阅读能力，并避免两套网站长期漂移。

## Consequences

- 所有 Learning Item 必须拥有稳定 ID 和 Upstream Source；Local Material 路径只能是可选增强。
- 云端构建必须在完全没有 `local-courses/` 的环境中通过。
- 本地和云端必须共享课程、进度和搜索语义。
