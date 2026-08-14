"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { getPageViewScope } from "../../modules/observability/privacy-monitor";

export function PageViewTelemetry() {
  const pathname = usePathname();

  useEffect(() => {
    // Unmatched paths (e.g. the 404 page) have no scope; the API rejects them
    // with 400, so don't fire a request that can only fail noisily.
    if (!pathname || !getPageViewScope(pathname)) return;
    void fetch("/api/telemetry/page-view", {
      method: "POST",
      credentials: "omit",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname }),
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
