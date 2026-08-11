import { existsSync } from "node:fs";

import { openLearningDatabase } from "../learning-state/database";
import {
  createPrivacyFirstMonitor,
  type OperationalMetricInput,
} from "./privacy-monitor";

export type OperatorMonitorOptions = {
  databaseFilename?: string;
  now?: () => Date;
  writeLog?: (line: string) => void;
};

export function recordOperatorMetric(
  input: OperationalMetricInput,
  options: OperatorMonitorOptions = {},
): { persisted: boolean } {
  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const writeLog =
    options.writeLog ??
    ((line: string) => {
      process.stderr.write(`${line}\n`);
    });
  try {
    writeLog(
      JSON.stringify({
        type: "agent-learning-hub.operational-metric",
        event: input.event,
        scope: input.scope,
        outcome: input.outcome,
        occurredAt,
      }),
    );
  } catch {
    // A log collector failure must not change the maintenance command result.
  }

  if (!options.databaseFilename || !existsSync(options.databaseFilename)) {
    return { persisted: false };
  }

  let database: ReturnType<typeof openLearningDatabase> | null = null;
  try {
    database = openLearningDatabase({ filename: options.databaseFilename });
    createPrivacyFirstMonitor(database, {
      now: () => new Date(occurredAt),
      writeLog: () => undefined,
    }).record(input);
    return { persisted: true };
  } catch {
    return { persisted: false };
  } finally {
    database?.close();
  }
}
