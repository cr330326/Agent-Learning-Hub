import Link from "next/link";

import { NotFoundPath } from "./components/not-found-path";

const RECOVERY_LINKS = [
  { href: "/roadmap", label: "九阶段路线", note: "回到主线" },
  { href: "/courses", label: "课程目录", note: "515 项资料" },
  { href: "/projects", label: "项目阶梯", note: "动手练习" },
  { href: "/learning", label: "我的学习", note: "继续上次进度" },
] as const;

export default function NotFound() {
  return (
    <main className="page not-found-page">
      <section className="hero-grid page-width">
        <div className="hero-copy">
          <p className="eyebrow">404 / OFF THE MAP</p>
          <h1>
            这一页不在 <em>路线图</em> 里。
          </h1>
          <p className="hero-lede">
            地址可能拼错了，或者内容已经移动、改名。公开目录里的每一页，都能从这几站重新找到；也可以直接按关键词或条目
            ID 检索。
          </p>
          <NotFoundPath />
          <form className="not-found-search" action="/search" role="search">
            <label>
              <span>关键词或条目 ID</span>
              <input
                name="q"
                type="search"
                placeholder="例如 legacy-course-001 或 agent loop"
              />
            </label>
            <button className="button button-primary" type="submit">
              搜索全站
            </button>
          </form>
        </div>
        <aside className="hero-note not-found-card" aria-label="找回路线的入口">
          <div className="note-kicker">BACK ON TRACK</div>
          <div className="note-number">404</div>
          <p>这个地址不在公开目录里。从下面任一站继续。</p>
          <div className="note-rule" />
          <nav className="not-found-links">
            {RECOVERY_LINKS.map(({ href, label, note }) => (
              <Link href={href} key={href}>
                <span>{label}</span>
                <span className="not-found-link-note">{note}</span>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </nav>
        </aside>
      </section>
    </main>
  );
}
