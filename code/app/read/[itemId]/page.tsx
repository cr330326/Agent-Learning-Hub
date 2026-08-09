import Link from "next/link";
import { notFound } from "next/navigation";

import { LearningStateControls } from "../../components/learning-state-controls";
import {
  getContentResolver,
  getLocalMaterialRoot,
  loadPublicCatalog,
} from "../../../lib/catalog";
import {
  readLocalDocument,
  readOwnedDocument,
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
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const catalog = await loadPublicCatalog();
  const item = catalog.items.find(({ id }) => id === itemId);
  if (!item) notFound();
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
        ? await readLocalDocument(item, { localRoot: getLocalMaterialRoot() })
        : await readOwnedDocument(item);
  } catch (error) {
    if (
      error instanceof OwnedDocumentNotFoundError ||
      error instanceof LocalFileNotFoundError ||
      error instanceof UnsupportedLocalDocumentError ||
      error instanceof UnsafeLocalPathError
    ) {
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
                : resolved.kind === "local-document"
                  ? "本地素材暂时不可用。请返回课程导览查看上游回退入口。"
                  : "目录中登记了站内文章，但正文文件暂时不可用。请返回课程导览查看最新访问入口."}
          </p>
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

  const rendered = renderMarkdownDocument(document.markdown);

  return (
    <main className="page page-width reader-page">
      <div className="reader-header">
        <div>
          <Link className="back-link" href={`/courses/${item.id}`}>
            ← 返回课程导览
          </Link>
          <p className="eyebrow">OWNED CONTENT / READER</p>
          <h1>{item.title}</h1>
          <p>{item.summary}</p>
        </div>
        {rendered.headings.length > 0 ? (
          <nav className="reader-toc" aria-label="文章目录">
            <span className="eyebrow">ON THIS PAGE</span>
            {rendered.headings.map((heading) => (
              <a href={`#${heading.id}`} key={heading.id}>
                {heading.text}
              </a>
            ))}
          </nav>
        ) : null}
      </div>
      <div
        className="reader-body"
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
      <LearningStateControls itemId={item.id} autoStart />
    </main>
  );
}
