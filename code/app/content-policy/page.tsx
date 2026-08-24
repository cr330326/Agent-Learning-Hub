import Link from "next/link";

// Header mode comes from runtime env; prerendering would bake in the
// build-time default, so this page renders per request like every other page.
export const dynamic = "force-dynamic";

export default function ContentPolicyPage() {
  return (
    <main className="page page-width prose-page">
      <p className="eyebrow">POLICY / CONTENT BOUNDARIES</p>
      <h1>资料来自哪里，正文到哪里为止</h1>
      <p className="lead">
        Agent Learning Hub 是策展和学习路线，不是第三方资料镜像。
      </p>
      <div className="prose-columns">
        <section>
          <h2>第三方资料</h2>
          <p>
            课程导览保留作者、许可证状态和上游地址。云端模式不打包、不转载、不代理
            Local Material 正文；访问按钮会把你带回上游发布位置。
          </p>
        </section>
        <section>
          <h2>自有内容</h2>
          <p>
            由本项目维护的文章可以在站内安全阅读。Markdown
            只支持明确的展示语法，不执行脚本、事件属性或任意 iframe。
          </p>
        </section>
        <section>
          <h2>本地模式</h2>
          <p>
            本地素材库只读挂载，且只有内容清单允许的相对路径可被读取。文件缺失时会明确回退到上游链接或显示不可用原因。
          </p>
        </section>
        <section>
          <h2>归属修正</h2>
          <p>
            如果作者、许可证或上游地址需要修正，请通过 Issue 或 Pull Request
            提供可核验来源。
          </p>
          <Link className="text-link" href="/contribute">
            查看贡献指南 →
          </Link>
        </section>
      </div>
    </main>
  );
}
