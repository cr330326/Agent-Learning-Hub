import Link from "next/link";

export const PAGE_SIZE = 24;

export type PageWindow<T> = {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  items: T[];
};

/**
 * Clamps a `?page=` value against the result count and returns the slice plus
 * the numbers the UI needs. The catalog carries 500+ entries, so every listing
 * has to page rather than render the whole set.
 */
export function paginate<T>(
  items: readonly T[],
  rawPage: string | undefined,
  pageSize = PAGE_SIZE,
): PageWindow<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const requested = Number.parseInt(rawPage ?? "1", 10);
  const page = Math.min(
    pageCount,
    Math.max(1, Number.isFinite(requested) ? requested : 1),
  );
  const start = (page - 1) * pageSize;

  return {
    page,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(total, start + pageSize),
    items: items.slice(start, start + pageSize),
  };
}

function hrefForPage(
  basePath: string,
  params: Record<string, string | undefined>,
  page: number,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const search = query.toString();
  return search ? `${basePath}?${search}` : basePath;
}

/** A compact window of page numbers with ellipses, always including 1 and last. */
function pageNumbers(page: number, pageCount: number) {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  return [...pages]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((left, right) => left - right);
}

export function Pagination({
  basePath,
  params,
  page,
  pageCount,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const numbers = pageNumbers(page, pageCount);

  return (
    <nav className="pagination" aria-label="分页导航">
      {page > 1 ? (
        <Link
          className="pagination-step"
          href={hrefForPage(basePath, params, page - 1)}
          rel="prev"
        >
          ← 上一页
        </Link>
      ) : (
        <span className="pagination-step is-disabled">← 上一页</span>
      )}
      <ol className="pagination-pages">
        {numbers.map((value, position) => (
          <li key={value}>
            {position > 0 && value - numbers[position - 1] > 1 ? (
              <span className="pagination-gap" aria-hidden="true">
                …
              </span>
            ) : null}
            {value === page ? (
              <span className="pagination-page is-current" aria-current="page">
                {value}
              </span>
            ) : (
              <Link
                className="pagination-page"
                href={hrefForPage(basePath, params, value)}
              >
                {value}
              </Link>
            )}
          </li>
        ))}
      </ol>
      {page < pageCount ? (
        <Link
          className="pagination-step"
          href={hrefForPage(basePath, params, page + 1)}
          rel="next"
        >
          下一页 →
        </Link>
      ) : (
        <span className="pagination-step is-disabled">下一页 →</span>
      )}
    </nav>
  );
}
