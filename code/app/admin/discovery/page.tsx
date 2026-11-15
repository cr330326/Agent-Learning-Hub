import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { isAdminUser } from "../../../modules/admin/admin-health";
import { getRequestUserAsync } from "../../../modules/auth/request-auth";
import { getLearningStateStore } from "../../../lib/learning-state";
import { requireDiscovery } from "../../../lib/discovery";
import { DiscoveryAdmin } from "../../components/discovery-admin";
export const dynamic = "force-dynamic";
export default async function DiscoveryAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  requireDiscovery();
  const request = new Request("http://local.admin/admin/discovery", {
    headers: { cookie: (await cookies()).toString() },
  });
  const user = await getRequestUserAsync(
    request,
    getLearningStateStore().repository,
    "cloud",
  );
  if (!isAdminUser(user)) notFound();
  return (
    <main className="page page-width">
      <h1>资讯管理</h1>
      <DiscoveryAdmin page={params.page} query={params.q?.slice(0, 200)} />
    </main>
  );
}
