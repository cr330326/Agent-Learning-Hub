import Link from "next/link";

import { SectionIntro } from "../components/site-chrome";
import { getRuntimeConfig } from "../../lib/catalog";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const mode = getRuntimeConfig().mode;
  return (
    <main className="page page-width login-page">
      <SectionIntro
        eyebrow="IDENTITY / PRIVATE STATE"
        title="让学习状态跟着你走。"
        summary="路线和课程目录公开可读；登录后才会保存进度、收藏、私人笔记和阶段成果。"
      />
      <section className="login-card">
        {params.error ? (
          <p className="notice-error">登录没有完成，请重新尝试。</p>
        ) : null}
        {mode === "local" ? (
          <>
            <p className="eyebrow">LOCAL MODE</p>
            <h2>本机单用户已自动准备好</h2>
            <p>你不需要登录。状态保存在本机 SQLite，并在重启后恢复。</p>
            <Link className="button button-primary" href="/learning">
              打开我的学习 →
            </Link>
          </>
        ) : (
          <>
            <p className="eyebrow">CLOUD MODE</p>
            <h2>使用 GitHub 登录</h2>
            <p>
              只申请身份识别所需的 read:user 权限，不把 GitHub Token
              存入学习状态。
            </p>
            {/* OAuth must use a full browser navigation so the provider redirect is preserved. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="button button-primary" href="/api/auth/github">
              使用 GitHub 登录 ↗
            </a>
          </>
        )}
      </section>
    </main>
  );
}
