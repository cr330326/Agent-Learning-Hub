import { getLearningStateStore } from "../../../lib/learning-state";
import { loadPublicCatalog } from "../../../lib/catalog";
import {
  parseRuntimeConfig,
  type DeploymentMode,
} from "../../../modules/runtime/runtime-config";

export const dynamic = "force-dynamic";

export type HealthCheckDependencies = {
  mode: DeploymentMode;
  checkCatalog: () => Promise<void>;
  checkDatabase: () => void;
};

export async function handleHealthRequest(
  dependencies: HealthCheckDependencies,
): Promise<Response> {
  try {
    await dependencies.checkCatalog();
    dependencies.checkDatabase();
    return Response.json({
      status: "ok",
      mode: dependencies.mode,
      checks: { catalog: "ok", database: "ok" },
    });
  } catch {
    return Response.json(
      { status: "unavailable", mode: dependencies.mode },
      { status: 503 },
    );
  }
}

export async function GET(): Promise<Response> {
  const mode = parseRuntimeConfig(process.env).mode;
  return handleHealthRequest({
    mode,
    checkCatalog: async () => {
      await loadPublicCatalog();
    },
    checkDatabase: () => {
      const result = getLearningStateStore().database.handle.pragma(
        "quick_check",
      ) as Array<{ quick_check?: string }>;
      if (
        !Array.isArray(result) ||
        result.length === 0 ||
        result.some((row) => row.quick_check !== "ok")
      ) {
        throw new Error("SQLite quick_check failed.");
      }
    },
  });
}
