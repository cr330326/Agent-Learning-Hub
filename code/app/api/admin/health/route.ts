import { getDefaultContentRoot } from "../../../../modules/catalog/catalog-api";
import {
  buildRuntimeAdminHealthSnapshot,
  handleAdminHealthRequest,
} from "../../../../modules/admin/admin-health";
import { getLearningStateStore } from "../../../../lib/learning-state";
import { getLocalMaterialRoot } from "../../../../lib/catalog";
import { getPrivacyFirstMonitor } from "../../../../lib/observability";
import { getRequestUserAsync } from "../../../../modules/auth/request-auth";
import { parseRuntimeConfig } from "../../../../modules/runtime/runtime-config";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const finish = (response: Response): Response => {
    // R10: the health snapshot is admin-only aggregate data.
    response.headers.set("cache-control", "private, no-store");
    return response;
  };
  try {
    const runtime = parseRuntimeConfig(process.env);
    const store = getLearningStateStore();
    const user = await getRequestUserAsync(
      request,
      store.repository,
      runtime.mode,
    );
    return finish(
      await handleAdminHealthRequest(request, {
        user,
        environment: process.env,
        buildSnapshot: () =>
          buildRuntimeAdminHealthSnapshot({
            mode: runtime.mode,
            database: store.database,
            environment: process.env,
            contentRoot: getDefaultContentRoot(process.env),
            localMaterialRoot:
              runtime.mode === "local" ? getLocalMaterialRoot() : undefined,
            operationalMetrics: getPrivacyFirstMonitor().snapshot(),
          }),
      }),
    );
  } catch {
    return finish(
      Response.json({ error: "管理员健康摘要暂时不可用。" }, { status: 503 }),
    );
  }
}
