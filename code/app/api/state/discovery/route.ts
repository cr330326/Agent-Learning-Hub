import { z } from "zod";
import { getLearningStateStore } from "../../../../lib/learning-state";
import { getDiscoveryRepository } from "../../../../lib/discovery";
import {
  getRequestUserAsync,
  CSRF_COOKIE,
  readCookie,
} from "../../../../modules/auth/request-auth";
import { stateWriteRateLimiter } from "../../../../modules/auth/rate-limit";
import { parseRuntimeConfig } from "../../../../modules/runtime/runtime-config";
import { readJsonBodyWithLimit } from "../../../../modules/learning-state/request-limits";
import {
  listDiscoveryState,
  saveDiscoveryState,
} from "../../../../modules/learning-state/discovery-state";

export const dynamic = "force-dynamic";
const inputSchema = z
  .object({
    targetType: z.literal("news"),
    itemId: z.string().regex(/^news-[a-f0-9]{32}$/),
    status: z.enum(["not_started", "in_progress", "completed"]).optional(),
    bookmarked: z.boolean().optional(),
    note: z.string().max(20000).optional(),
  })
  .strict();
async function handle(request: Request) {
  const respond = (value: unknown, status = 200) =>
    Response.json(value, {
      status,
      headers: { "cache-control": "private, no-store" },
    });
  if (parseRuntimeConfig(process.env).mode !== "cloud")
    return respond({ error: "此功能需要云端模式。" }, 404);
  const store = getLearningStateStore();
  const user = await getRequestUserAsync(request, store.repository, "cloud");
  if (!user) return respond({ error: "登录后可保存资讯记录。" }, 401);
  const repo = getDiscoveryRepository();
  if (request.method === "GET") {
    const state = listDiscoveryState(store.database, user.id).map((entry) => {
      const item = repo.publicItem(entry.itemId);
      return {
        ...entry,
        title: item?.title ?? "来源条目待恢复",
        withdrawn: item?.withdrawn ?? true,
      };
    });
    return respond({ state });
  }
  const csrf = request.headers.get("x-csrf-token");
  if (!csrf || csrf !== readCookie(request, CSRF_COOKIE))
    return respond({ error: "请求校验失败。" }, 403);
  if (!stateWriteRateLimiter.consume(`discovery-state:${user.id}`).allowed)
    return respond({ error: "操作频繁，请稍后重试。" }, 429);
  try {
    const input = inputSchema.parse(await readJsonBodyWithLimit(request));
    if (!repo.publicItem(input.itemId))
      return respond({ error: "资讯目标不存在。" }, 404);
    return respond({
      state: saveDiscoveryState(store.database, user.id, input),
    });
  } catch {
    return respond({ error: "保存失败，请检查内容长度与状态。" }, 400);
  }
}
export const GET = handle;
export const POST = handle;
