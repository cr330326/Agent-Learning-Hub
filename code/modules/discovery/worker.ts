import { createCurationPullRequest } from "./curation";
import { randomUUID } from "node:crypto";
import { budgetDay } from "./budget";
import {
  CollectionError,
  fetchPublic,
  type PublicFetcher,
} from "./public-fetch";
import { synchronizeSource } from "./adapters";
import { processDiscoveryVersion, TemporaryContent } from "./processing";
import { DiscoveryRepository } from "./repository";
import { LeaseLostError } from "./jobs";

export class DiscoveryWorker {
  private id = randomUUID();
  constructor(
    private repo: DiscoveryRepository,
    private fetcher: PublicFetcher = fetchPublic,
    private now = () => Date.now(),
  ) {}
  schedule() {
    for (const status of this.repo.sources()) {
      if (!status.source.enabled || status.next_sync_at > this.now()) continue;
      this.repo.jobs.enqueue({
        key: `collect:${status.source.id}:${status.next_sync_at}`,
        kind: "collect",
        payload: { sourceId: status.source.id },
        priority: 200 + status.source.priority,
      });
    }
    const day = budgetDay(this.now());
    const hour = this.repo.settingNumber("edition_hour", 9);
    const cutoff = Date.parse(
      `${day}T${String(hour).padStart(2, "0")}:00:00+08:00`,
    );
    if (this.now() >= cutoff)
      this.repo.jobs.enqueue({
        key: `edition:${day}`,
        kind: "edition",
        payload: { day },
        priority: 150,
      });
    new TemporaryContent(this.repo, undefined, this.now).cleanup();
  }
  async runOne() {
    const job = this.repo.jobs.claim();
    this.repo.jobs.workerHeartbeat(this.id, job?.id ?? null);
    if (!job) return false;
    const heartbeat = setInterval(() => {
      try {
        this.repo.jobs.heartbeat(job);
        this.repo.jobs.workerHeartbeat(this.id, job.id);
      } catch {
        clearInterval(heartbeat);
      }
    }, 20_000);
    try {
      switch (job.kind) {
        case "curation": {
          const { proposalId } = JSON.parse(job.payload) as {
            proposalId: string;
          };
          const pr = await createCurationPullRequest(this.repo, proposalId);
          this.repo.jobs.complete(job, pr);
          break;
        }
        case "collect":
          await synchronizeSource(this.repo, job, this.fetcher);
          break;
        case "process":
          await processDiscoveryVersion(this.repo, job, {
            fetcher: this.fetcher,
            now: this.now,
          });
          break;
        case "edition": {
          const { day } = JSON.parse(job.payload) as { day: string };
          this.repo.database.handle
            .transaction(() => {
              this.repo.jobs.saveCheckpoint(job, {});
              const edition = this.repo.createEdition(day);
              this.repo.jobs.complete(job, edition);
            })
            .immediate();
          break;
        }
        default:
          throw new CollectionError("unsupported-job-kind");
      }
    } catch (error) {
      if (!(error instanceof LeaseLostError)) {
        const code =
          error instanceof CollectionError ? error.code : "job-failed";
        const payload = JSON.parse(job.payload) as { sourceId?: string };
        try {
          this.repo.database.handle
            .transaction(() => {
              this.repo.jobs.fail(job, code);
              if (payload.sourceId && job.kind === "collect")
                this.repo.syncFailed(payload.sourceId, code);
            })
            .immediate();
        } catch (failure) {
          if (!(failure instanceof LeaseLostError)) throw failure;
        }
      }
    } finally {
      clearInterval(heartbeat);
      this.repo.jobs.workerHeartbeat(this.id, null);
    }
    return true;
  }
}
