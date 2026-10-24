import type { ContentCatalog } from "../catalog/content-schema";

// R06: private state used to accept any directory ID, so fabricated IDs could
// accumulate rows in the shared SQLite forever. Writes are now checked against
// the hand-maintained catalog. Retired entries (with a redirect) stay valid
// targets: they exist precisely so historical state keeps resolving.
export type StateCatalogGate = {
  hasItem(itemId: string): boolean;
  hasStage(stageId: string): boolean;
  hasStageTask(taskId: string): boolean;
};

export function createStateCatalogGate(
  catalog: ContentCatalog,
): StateCatalogGate {
  const itemIds = new Set(catalog.items.map((item) => item.id));
  const stageIds = new Set(catalog.stages.map((stage) => stage.id));
  const taskIds = new Set(catalog.stageTasks.map((task) => task.id));
  return {
    hasItem: (itemId) => itemIds.has(itemId),
    hasStage: (stageId) => stageIds.has(stageId),
    hasStageTask: (taskId) => taskIds.has(taskId),
  };
}
