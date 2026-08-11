import { getPrivacyFirstMonitor } from "../../../../lib/observability";
import {
  getPageViewScope,
  type PrivacyFirstMonitor,
} from "../../../../modules/observability/privacy-monitor";

export const dynamic = "force-dynamic";

type PageViewMonitor = Pick<PrivacyFirstMonitor, "record">;

function firstForwardedValue(value: string | null): string | null {
  return value?.split(",", 1)[0]?.trim() || null;
}

function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const protocol = firstForwardedValue(
    request.headers.get("x-forwarded-proto"),
  );
  const host =
    firstForwardedValue(request.headers.get("x-forwarded-host")) ??
    request.headers.get("host") ??
    url.host;
  return `${protocol === "https" ? "https" : url.protocol.replace(/:$/, "")}://${host}`;
}

async function readPath(request: Request): Promise<string | null> {
  try {
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    const path = (payload as { path?: unknown }).path;
    return typeof path === "string" ? path : null;
  } catch {
    return null;
  }
}

export async function handlePageViewRequest(
  request: Request,
  monitor: PageViewMonitor,
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== requestOrigin(request)) {
    return Response.json({ error: "来源无效。" }, { status: 403 });
  }

  const path = await readPath(request);
  const scope = path === null ? null : getPageViewScope(path);
  if (!scope) {
    return Response.json({ error: "页面范围无效。" }, { status: 400 });
  }

  monitor.record({ event: "page_view", scope, outcome: "observed" });
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  return handlePageViewRequest(request, getPrivacyFirstMonitor());
}
