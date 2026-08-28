import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { itemRedirectHref } from "../../../modules/catalog/item-redirect";
import { authorLabel, licenseLabel } from "../../components/content-card";
import { LearningStateControls } from "../../components/learning-state-controls";
import {
  getContentResolver,
  getLocalMaterialRoot,
  loadPublicCatalog,
} from "../../../lib/catalog";
import {
  readLocalDocument,
  listLocalChapters,
  resolveDocumentRelativePath,
  LocalChapterNotAllowlistedError,
  readOwnedDocument,
  readLocalDocumentSource,
  OwnedDocumentNotFoundError,
  UnsupportedLocalDocumentError,
} from "../../../modules/reader/document-source";
import {
  LocalFileNotFoundError,
  UnsafeLocalPathError,
} from "../../../modules/content-resolver/local-file-access";
import { renderMarkdownDocument } from "../../../modules/reader/markdown";

export const dynamic = "force-dynamic";

export default async function ReaderPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ chapter?: string }>;
}) {
  const { itemId } = await params;
  const { chapter: requestedChapter } = await searchParams;
  const catalog = await loadPublicCatalog();
  const item = catalog.items.find(({ id }) => id === itemId);
  if (!item) notFound();
  const retiredHref = itemRedirectHref(item);
  if (retiredHref) redirect(retiredHref);
  const resolved = await getContentResolver().resolve(item);

  if (resolved.kind !== "internal-mdx" && resolved.kind !== "local-document") {
    return (
      <main className="page page-width reader-fallback">
        <p className="eyebrow">READER / SAFE FALLBACK</p>
        <h1>{item.title}</h1>
        <p>这个条目当前没有站内正文。访问入口已经解析为：{resolved.label}。</p>
        {resolved.kind === "unavailable" ? (
          <p className="notice-error">{resolved.reason}</p>
        ) : (
          <a
            className="button button-primary"
            href={resolved.href}
            target="_blank"
            rel="noreferrer"
          >
            {resolved.label} ↗
          </a>
        )}
        <Link className="back-link" href={`/courses/${item.id}`}>
          ← 返回课程导览
        </Link>
      </main>
    );
  }

  let document;
  try {
    document =
      resolved.kind === "local-document"
        ? await readLocalDocument(item, {
            localRoot: getLocalMaterialRoot(),
            relativePath: requestedChapter,
          })
        : await readOwnedDocument(item);
  } catch (error) {
    if (
      error instanceof OwnedDocumentNotFoundError ||
      error instanceof LocalFileNotFoundError ||
      error instanceof UnsupportedLocalDocumentError ||
      error instanceof UnsafeLocalPathError ||
      error instanceof LocalChapterNotAllowlistedError
    ) {
      const sourceView =
        error instanceof UnsupportedLocalDocumentError
          ? await readLocalDocumentSource(item, {
              localRoot: getLocalMaterialRoot(),
              relativePath: requestedChapter,
            }).catch(() => null)
          : null;
      return (
        <main className="page page-width reader-fallback">
          <p className="eyebrow">
            {resolved.kind === "local-document"
              ? "READER / LOCAL CONTENT MISSING"
              : "READER / CONTENT MISSING"}
          </p>
          <h1>{item.title}</h1>
          <p>
            {error instanceof UnsupportedLocalDocumentError
              ? "这个本地文件格式暂不支持安全的站内渲染。"
              : error instanceof UnsafeLocalPathError
                ? "本地素材路径没有通过安全校验。"
                : error instanceof LocalChapterNotAllowlistedError
                  ? "这个章节不在课程清单允许的本地路径中。"
                  : resolved.kind === "local-document"
                    ? "本地素材暂时不可用。请返回课程导览查看上游回退入口。"
                    : "目录中登记了站内文章，但正文文件暂时不可用。请返回课程导览查看最新访问入口."}
          </p>
          {sourceView ? (
            <section
              className="reader-source-view"
              aria-labelledby="reader-source-view-title"
            >
              <p className="eyebrow" id="reader-source-view-title">
                PURE SOURCE VIEW
              </p>
              <p>
                该本地文件不适合安全渲染，以下仅显示原始文本，不执行其中的脚本或标记。
              </p>
              <pre>
                <code>{sourceView.markdown}</code>
              </pre>
            </section>
          ) : null}
          {item.sourceUrl ? (
            <a
              className="button button-primary"
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              打开上游 ↗
            </a>
          ) : null}
          <Link className="button button-primary" href={`/courses/${item.id}`}>
            返回课程导览
          </Link>
        </main>
      );
    }
    throw error;
  }

  const isLocal = resolved.kind === "local-document";
  const localChapters = isLocal
    ? await listLocalChapters(item, { localRoot: getLocalMaterialRoot() })
    : [];

  // Links and images inside a document are relative to that document, and
  // /api/local-image only serves paths the course entry declares. Resolve
  // against the document, then check the same allowlist: undeclared targets
  // lose their href instead of rendering as guaranteed 404s and broken images.
  const allowlistedPaths = new Set(
    [
      item.localPath,
      ...item.references.map((reference) => reference.localPath),
    ].filter((path): path is string => path !== null),
  );
  const readableChapters = new Set(
    localChapters.map(({ relativePath }) => relativePath),
  );
  const resolveAgainstDocument = (source: string) =>
    isLocal ? resolveDocumentRelativePath(document.sourcePath, source) : null;

  const rendered = renderMarkdownDocument(document.markdown, {
    resolveImageSrc: (source) => {
      const target = resolveAgainstDocument(source);
      return target !== null && allowlistedPaths.has(target)
        ? `/api/local-image?itemId=${encodeURIComponent(item.id)}&path=${encodeURIComponent(target)}`
        : null;
    },
    resolveDocumentHref: (source) => {
      const target = resolveAgainstDocument(source);
      return target !== null && readableChapters.has(target)
        ? `/read/${item.id}?chapter=${encodeURIComponent(target)}`
        : null;
    },
  });

  // READ-001 requires previous/next chapter navigation, not just a chapter list.
  const chapterIndex = localChapters.findIndex(
    ({ relativePath }) => relativePath === document.sourcePath,
  );
  const previousChapter =
    chapterIndex > 0 ? localChapters[chapterIndex - 1] : null;
  const nextChapter =
    chapterIndex >= 0 && chapterIndex < localChapters.length - 1
      ? localChapters[chapterIndex + 1]
      : null;

  return (
    <main className="page page-width reader-page">
      <Link className="back-link" href={`/courses/${item.id}`}>
        ← 返回课程导览
      </Link>
      <div className="reader-header">
        <div>
          <p className="eyebrow">
            {resolved.kind === "local-document"
              ? "LOCAL MATERIAL / READER"
              : "OWNED CONTENT / READER"}
          </p>
          <h1>{item.title}</h1>
          <p>{item.summary}</p>
          {resolved.kind === "local-document" ? (
            <p className="reader-attribution">
              第三方素材，仅在本地模式只读渲染。作者：{authorLabel(item.author)}
              ；许可证：{licenseLabel(item.license, item.licenseStatus)}。
              {item.sourceUrl ? (
                <>
                  {" "}
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                    查看上游 ↗
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
      {rendered.headings.length > 0 ? (
        <nav className="reader-toc" aria-label="文章目录">
          <span className="eyebrow">ON THIS PAGE</span>
          {rendered.headings.map((heading) => (
            <a
              href={`#${heading.id}`}
              key={heading.id}
              data-level={heading.level}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      ) : null}
      {localChapters.length > 0 ? (
        <nav className="reader-chapters" aria-label="本地章节导航">
          <span className="eyebrow">LOCAL CHAPTERS</span>
          {localChapters.map((localChapter) => (
            <Link
              href={`/read/${item.id}?chapter=${encodeURIComponent(localChapter.relativePath)}`}
              key={localChapter.relativePath}
              aria-current={
                document.sourcePath === localChapter.relativePath
                  ? "page"
                  : undefined
              }
            >
              {localChapter.label}
            </Link>
          ))}
        </nav>
      ) : null}
      <div
        className="reader-body"
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
      {previousChapter || nextChapter ? (
        <nav className="reader-pager" aria-label="上下章导航">
          {previousChapter ? (
            <Link
              className="reader-pager-link"
              href={`/read/${item.id}?chapter=${encodeURIComponent(previousChapter.relativePath)}`}
              rel="prev"
            >
              <span>← 上一章</span>
              <strong>{previousChapter.label}</strong>
            </Link>
          ) : (
            <span />
          )}
          {nextChapter ? (
            <Link
              className="reader-pager-link is-next"
              href={`/read/${item.id}?chapter=${encodeURIComponent(nextChapter.relativePath)}`}
              rel="next"
            >
              <span>下一章 →</span>
              <strong>{nextChapter.label}</strong>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
      <LearningStateControls itemId={item.id} autoStart />
    </main>
  );
}
