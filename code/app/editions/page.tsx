import Link from "next/link";
import { requireDiscovery } from "../../lib/discovery";
import { SectionIntro } from "../components/site-chrome";
export const dynamic = "force-dynamic";
export default function EditionsPage() {
  const repo = requireDiscovery();
  const editions = repo.editions();
  return (
    <main className="page page-width">
      <SectionIntro
        eyebrow=""
        title="每日精选"
        summary="按日期回看 AI 开发工程精选。日报保存当期顺序和摘要版本。"
      />
      {editions.length ? (
        <ul className="edition-list">
          {editions.map((edition) => (
            <li key={edition.day}>
              <Link href={`/editions/${edition.day}`}>
                {edition.day} 精选日报
              </Link>
              <span>{repo.edition(edition.day)!.entries.length} 条</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <h2>等待首份日报</h2>
          <p>默认北京时间每天 09:00 出刊。</p>
        </div>
      )}
    </main>
  );
}
