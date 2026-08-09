import { toNextJsHandler } from "better-auth/next-js";

import { getBetterAuth } from "../../../../modules/auth/better-auth";
import { parseRuntimeConfig } from "../../../../modules/runtime/runtime-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request): Promise<Response> {
  if (parseRuntimeConfig(process.env).mode !== "cloud") {
    return Response.json(
      { error: "云端身份接口仅在 cloud 模式可用。" },
      { status: 404 },
    );
  }
  try {
    const handlers = toNextJsHandler(getBetterAuth());
    const handler = handlers[request.method as keyof typeof handlers];
    if (!handler) return new Response("Method Not Allowed", { status: 405 });
    return handler(request);
  } catch {
    return Response.json({ error: "身份服务暂时不可用。" }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
