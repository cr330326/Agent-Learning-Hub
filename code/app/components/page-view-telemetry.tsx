"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function PageViewTelemetry() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
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
