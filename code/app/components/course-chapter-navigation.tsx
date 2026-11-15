import Link from "next/link";
import type { LocalChapter } from "../../modules/reader/document-source";

export function CourseChapterNavigation({
  itemId,
  chapters,
  currentPath,
}: {
  itemId: string;
  chapters: LocalChapter[];
  currentPath: string;
}) {
  if (!chapters.length) return null;
  const current = chapters.findIndex(
    (chapter) => chapter.relativePath === currentPath,
  );
  const links = chapters.map((chapter) => (
    <Link
      href={`/read/${itemId}?chapter=${encodeURIComponent(chapter.relativePath)}`}
      key={chapter.relativePath}
      aria-current={chapter.relativePath === currentPath ? "page" : undefined}
    >
      {chapter.label}
    </Link>
  ));
  return (
    <nav className="reader-chapters" aria-label="本地章节导航">
      {chapters.length > 12 ? (
        <details className="reader-course-outline" key={currentPath}>
          <summary>
            <span>
              课程目录 · 第 {current + 1} / {chapters.length} 节
            </span>
            <strong>{chapters[current]?.label ?? "选择课节"}</strong>
          </summary>
          <div className="reader-course-outline-links">{links}</div>
        </details>
      ) : (
        <>
          <span className="eyebrow">课程章节</span>
          {links}
        </>
      )}
    </nav>
  );
}
