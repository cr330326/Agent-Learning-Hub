import {
  createPrivacyFirstMonitor,
  type OperationalMetricInput,
} from "../modules/observability/privacy-monitor";

import { getLearningStateStore } from "./learning-state";

let privacyFirstMonitor: ReturnType<typeof createPrivacyFirstMonitor> | null =
  null;

export function getPrivacyFirstMonitor() {
  if (!privacyFirstMonitor) {
    privacyFirstMonitor = createPrivacyFirstMonitor(
      getLearningStateStore().database,
    );
  }
  return privacyFirstMonitor;
}

export function recordOperationalMetric(input: OperationalMetricInput): void {
  try {
    getPrivacyFirstMonitor().record(input);
  } catch {
    // Observability must never turn a recoverable application response into a failure.
  }
}
