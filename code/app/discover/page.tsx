import { requireDiscovery } from "../../lib/discovery";
import { SectionIntro } from "../components/site-chrome";
import {
  DiscoveryList,
  type DiscoveryFilters,
} from "../components/discovery-list";
export const dynamic = "force-dynamic";
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<DiscoveryFilters>;
}) {
  requireDiscovery();
  return (
    <main className="page page-width">
      <SectionIntro
        eyebrow=""
        title="发现 AI 开发实践"
        summary="关注方法、代码、评测与可复现案例，从每日动态中找到值得深入学习的内容。"
      />
      <DiscoveryList params={await searchParams} />
    </main>
  );
}
