import { getLearningStateStore } from "../../../../lib/learning-state";
import { getDiscoveryRepository } from "../../../../lib/discovery";
import { getRequestUserAsync } from "../../../../modules/auth/request-auth";
import { parseRuntimeConfig } from "../../../../modules/runtime/runtime-config";
import { handleDiscoveryAdminRequest } from "../../../../modules/discovery/admin";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const mode = parseRuntimeConfig(process.env).mode;
  const user = await getRequestUserAsync(
    request,
    getLearningStateStore().repository,
    mode,
  );
  return handleDiscoveryAdminRequest(request, {
    mode,
    user,
    repository: getDiscoveryRepository,
  });
}
export const GET = handle;
export const POST = handle;
