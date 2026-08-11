import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { getDefaultContentRoot } from "../../modules/catalog/catalog-api";
import {
  buildRuntimeAdminHealthSnapshot,
  isAdminUser,
} from "../../modules/admin/admin-health";
import { getLearningStateStore } from "../../lib/learning-state";
import { getLocalMaterialRoot } from "../../lib/catalog";
import { getPrivacyFirstMonitor } from "../../lib/observability";
import { getRequestUserAsync } from "../../modules/auth/request-auth";
import { parseRuntimeConfig } from "../../modules/runtime/runtime-config";

export const dynamic = "force-dynamic";

function statusLabel(status: string) {
  return status === "ok" ? "正常" : status === "degraded" ? "需关注" : status;
}

export default async function AdminPage() {
  const runtime = parseRuntimeConfig(process.env);
  const store = getLearningStateStore();
  const cookieHeader = (await cookies()).toString();
  const request = new Request("http://local.admin/admin", {
    headers: { cookie: cookieHeader },
  });
  const user = await getRequestUserAsync(
    request,
    store.repository,
    runtime.mode,
  );
  if (!isAdminUser(user, process.env)) notFound();

  const snapshot = await buildRuntimeAdminHealthSnapshot({
    mode: runtime.mode,
    database: store.database,
    environment: process.env,
    contentRoot: getDefaultContentRoot(process.env),
    localMaterialRoot:
      runtime.mode === "local" ? getLocalMaterialRoot() : undefined,
    operationalMetrics: getPrivacyFirstMonitor().snapshot(),
  });

  return (
    <main className="page page-width admin-page">
      <p className="eyebrow">ADMIN / HEALTH</p>
      <h1>系统健康摘要</h1>
      <p className="admin-intro">
        这里仅展示不关联个人身份的聚合状态；健康页不会读取私人笔记正文，也不会触发素材更新。
      </p>
      <div className="admin-health-grid">
        <section className="admin-health-card">
          <p className="eyebrow">CONTENT</p>
          <h2>内容审计</h2>
          <p className="admin-health-status">
            {statusLabel(snapshot.catalog.status)}
          </p>
          <p>
            错误 {snapshot.catalog.errorCount} · 警告{" "}
            {snapshot.catalog.warningCount}
          </p>
        </section>
        <section className="admin-health-card">
          <p className="eyebrow">MATERIALS</p>
          <h2>素材状态</h2>
          <p className="admin-health-status">
            {statusLabel(snapshot.materials.status)}
          </p>
          <p>
            检查 {snapshot.materials.repositoriesChecked} 个仓库 · 跳过{" "}
            {snapshot.materials.nonGitReferencesSkipped} 组非 Git 引用
          </p>
        </section>
        <section className="admin-health-card">
          <p className="eyebrow">DATABASE</p>
          <h2>数据库</h2>
          <p className="admin-health-status">
            {statusLabel(snapshot.database.status)}
          </p>
          <p>
            schema v{snapshot.database.schemaVersion} · SQLite{" "}
            {snapshot.database.sqliteVersion} · {snapshot.database.journalMode}
          </p>
        </section>
        <section className="admin-health-card">
          <p className="eyebrow">OBSERVABILITY</p>
          <h2>匿名运营指标</h2>
          <p className="admin-health-status">
            {snapshot.observability.alerts.length > 0 ? "需关注" : "正常"}
          </p>
          <p>
            近 24 小时 {snapshot.observability.totalPageViews} 次访问 · 告警{" "}
            {snapshot.observability.alerts.length} 条
          </p>
        </section>
        <section className="admin-health-card">
          <p className="eyebrow">DEPLOYMENT</p>
          <h2>部署摘要</h2>
          <p className="admin-health-status">{snapshot.deployment.version}</p>
          <p>
            运行模式 {snapshot.mode} · Node {snapshot.deployment.nodeMajor}
          </p>
        </section>
      </div>
      <p className="admin-health-meta">
        最近生成：{new Date(snapshot.generatedAt).toLocaleString("zh-CN")}
      </p>
    </main>
  );
}
