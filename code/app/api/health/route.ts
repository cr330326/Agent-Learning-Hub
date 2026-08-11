import { getLearningStateStore } from "../../../lib/learning-state";
import { recordOperationalMetric } from "../../../lib/observability";
import { loadPublicCatalog } from "../../../lib/catalog";
import {
  parseRuntimeConfig,
  type DeploymentMode,
} from "../../../modules/runtime/runtime-config";
import type { PrivacyFirstMonitor } from "../../../modules/observability/privacy-monitor";

export const dynamic = "force-dynamic";

export type HealthCheckDependencies = {
  mode: DeploymentMode;
  checkCatalog: () => Promise<void>;
  checkDatabase: () => void;
  monitor?: Pick<PrivacyFirstMonitor, "record">;
};

export async function handleHealthRequest(
  dependencies: HealthCheckDependencies,
): Promise<Response> {
  try {
    await dependencies.checkCatalog();
    dependencies.checkDatabase();
    (dependencies.monitor?.record ?? recordOperationalMetric)({
      event: "health_check",
      scope: "readiness",
      outcome: "success",
    });
    return Response.json({
      status: "ok",
      mode: dependencies.mode,
      checks: { catalog: "ok", database: "ok" },
    });
  } catch {
    (dependencies.monitor?.record ?? recordOperationalMetric)({
      event: "health_check",
      scope: "readiness",
      outcome: "failure",
    });
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
