import Link from "next/link";

export default function ContributePage() {
  return (
    <main className="page page-width prose-page">
      <p className="eyebrow">CONTRIBUTE / KEEP THE MAP TRUSTWORTHY</p>
      <h1>把修正送进 Git，而不是填一个 CMS 表单。</h1>
      <p className="lead">
        内容目录、阶段任务和自有文章都通过 Git
        评审，学习状态不会被贡献流程混在一起。
      </p>
      <ol className="contribute-list">
        <li>
          <strong>提出问题</strong>
          <span>说明条目 ID、问题字段和可核验的上游来源。</span>
        </li>
        <li>
          <strong>提交修正</strong>
          <span>修改内容目录或文章，并补上对应测试/审计证据。</span>
        </li>
        <li>
          <strong>保留归属</strong>
          <span>不要删除第三方作者、许可证状态或上游地址。</span>
        </li>
      </ol>
      <div className="callout-strip">
        <p>
          这里没有在线投稿表单。请在代码托管平台创建 Issue 或 Pull Request。
        </p>
        <Link className="text-link" href="/content-policy">
          先阅读内容政策 →
        </Link>
      </div>
    </main>
  );
}
