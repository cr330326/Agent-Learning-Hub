"use client";

import { useEffect, useState } from "react";

/**
 * not-found.tsx is server-rendered without access to the requested URL, so
 * the attempted path is filled in after hydration. Rendering nothing on the
 * server avoids a flash of a wrong or empty value.
 */
export function NotFoundPath() {
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPath(window.location.pathname + window.location.search);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!path) return null;

  return (
    <p className="not-found-path">
      你尝试访问：<code>{path}</code>
    </p>
  );
}
