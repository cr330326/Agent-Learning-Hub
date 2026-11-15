import { setTimeout } from "node:timers/promises";
import { openDiscoveryDatabase } from "../modules/discovery/database";
import { DiscoveryRepository } from "../modules/discovery/repository";
import { DiscoveryWorker } from "../modules/discovery/worker";
import { aggregationSources } from "../modules/discovery/aggregation-sources";

if (process.env.DEPLOYMENT_MODE !== "cloud")
  throw new Error("资讯 worker 需要云端模式。");
const database = openDiscoveryDatabase();
const repository = new DiscoveryRepository(database);
if (process.env.DISCOVERY_AGGREGATION_PRESETS === "1") {
  for (const source of aggregationSources) {
    if (!repository.source(source.id))
      repository.saveSource(source, "aggregation-bootstrap");
  }
}
const worker = new DiscoveryWorker(repository);
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
try {
  do {
    worker.schedule();
    const worked = await worker.runOne();
    if (process.argv.includes("--once")) break;
    if (!worked) await setTimeout(1000);
  } while (!stopping);
} finally {
  database.close();
}
