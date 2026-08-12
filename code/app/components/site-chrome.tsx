import Link from "next/link";

import type { Stage, Track } from "../../modules/catalog/content-schema";
import type { DeploymentMode } from "../../modules/runtime/runtime-config";

const trackColors: Record<Track["id"], string> = {
  learning: "#a23e29",
  aicoding: "#2d7c6e",
  agentic: "#7767a8",
  application: "#8a5d10",
};

// Local mode signs the single local learner in automatically, so labelling the
// last entry "登录" contradicted the page it opens ("你不需要登录").
function navigationLinks(mode: DeploymentMode) {
  return [
    { href: "/roadmap", label: "九阶段路线" },
    { href: "/courses", label: "课程目录" },
    { href: "/search", label: "搜索" },
    { href: "/projects", label: "项目阶梯" },
    { href: "/learning", label: "我的学习" },
    { href: "/login", label: mode === "local" ? "账户" : "登录" },
  ];
}

export function SiteHeader({ mode }: { mode: DeploymentMode }) {
  const links = navigationLinks(mode);
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            AL
          </span>
          <span>
            <strong>Agent Learning Hub</strong>
            <small>实践路线图 / FIELD NOTES</small>
          </span>
        </Link>
        <nav className="primary-nav" aria-label="主导航">
          {links.map(({ href, label }) => (
            <Link href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
        <span className={`mode-badge mode-${mode}`}>
          <i aria-hidden="true" />
          {mode === "local" ? "本地模式" : "云端模式"}
        </span>
      </div>
      {/* Below the primary-nav breakpoint this scrolling rail is the only
          navigation, so it must stay in the markup rather than be hidden. */}
      <nav className="compact-nav" aria-label="主导航（窄屏）">
        {links.map(({ href, label }) => (
          <Link href={href} key={href}>
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <strong>Agent Learning Hub</strong>
        <span>把“想学 Agent”变成下一步能执行的动作。</span>
      </div>
      <nav aria-label="页脚导航">
        <Link href="/content-policy">内容政策</Link>
        <Link href="/contribute">贡献指南</Link>
      </nav>
    </footer>
  );
}

export function StageRoute({ stages }: { stages: Stage[] }) {
  return (
    <div className="route-map-scroll">
      <ol className="route-map" aria-label="九阶段学习路线">
        {stages
          .slice()
          .sort((left, right) => left.order - right.order)
          .map((stage) => (
            <li key={stage.id} className="route-stop">
              <Link href={`/roadmap/${stage.id}`}>
                <span className="route-dot" aria-hidden="true">
                  {stage.order}
                </span>
                <span className="route-label">
                  <small>STAGE {String(stage.order).padStart(2, "0")}</small>
                  <strong>{stage.title}</strong>
                </span>
              </Link>
            </li>
          ))}
      </ol>
    </div>
  );
}

export function TrackTag({ track }: { track: Track }) {
  return (
    <span
      className="track-tag"
      style={{ "--track-color": trackColors[track.id] } as React.CSSProperties}
    >
      <i aria-hidden="true" />
      {track.title}
    </span>
  );
}

export function SectionIntro({
  eyebrow,
  title,
  summary,
}: {
  eyebrow: string;
  title: string;
  summary: string;
}) {
  return (
    <div className="section-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="section-summary">{summary}</p>
    </div>
  );
}
