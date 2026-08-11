import type { LearningDatabase } from "../learning-state/database";

const RETENTION_DAYS = 30;
const SNAPSHOT_WINDOW_HOURS = 24;

export const operationalMetricEvents = [
  "page_view",
  "request_error",
  "login_failure",
  "health_check",
  "backup",
  "restore",
  "content_audit",
  "materials_update",
] as const;

export const operationalMetricScopes = [
  "home",
  "roadmap",
  "roadmap-stage",
  "courses",
  "course-detail",
  "reader",
  "search",
  "projects",
  "learning",
  "login",
  "content-policy",
  "contribute",
  "admin",
  "learning-state",
  "data-export",
  "github-login",
  "readiness",
  "backup",
  "restore",
  "content-audit",
  "materials-update",
] as const;

export const operationalMetricOutcomes = [
  "observed",
  "success",
  "client-error",
  "server-error",
  "failure",
] as const;

export type OperationalMetricEvent = (typeof operationalMetricEvents)[number];
export type OperationalMetricScope = (typeof operationalMetricScopes)[number];
export type OperationalMetricOutcome =
  (typeof operationalMetricOutcomes)[number];
export type PageViewScope = Extract<
  OperationalMetricScope,
  | "home"
  | "roadmap"
  | "roadmap-stage"
  | "courses"
  | "course-detail"
  | "reader"
  | "search"
  | "projects"
  | "learning"
  | "login"
  | "content-policy"
  | "contribute"
  | "admin"
>;

export type OperationalMetricInput = {
  event: OperationalMetricEvent;
  scope: OperationalMetricScope;
  outcome: OperationalMetricOutcome;
};

export type OperationalMetricAggregate = OperationalMetricInput & {
  count: number;
};

export type OperationalAlert = {
  id:
    | "health-check-failed"
    | "backup-or-restore-failed"
    | "content-audit-failed"
    | "materials-update-failed"
    | "login-failure-spike"
    | "server-error-spike";
  severity: "warning" | "critical";
  count: number;
};

export type OperationalMetricsSnapshot = {
  generatedAt: string;
  windowStartedAt: string;
  totalPageViews: number;
  pageViews: Array<{ scope: PageViewScope; count: number }>;
  operations: OperationalMetricAggregate[];
  failures: OperationalMetricAggregate[];
  alerts: OperationalAlert[];
};

export type PrivacyFirstMonitor = {
  record(input: OperationalMetricInput): void;
  snapshot(options?: { windowHours?: number }): OperationalMetricsSnapshot;
};

export type PrivacyFirstMonitorOptions = {
  now?: () => Date;
  writeLog?: (line: string) => void;
};

function hourBucket(date: Date): string {
  const bucket = new Date(date.getTime());
  bucket.setUTCMinutes(0, 0, 0);
  return bucket.toISOString();
}

function pageScope(value: string): PageViewScope | null {
  return operationalMetricScopes.includes(value as OperationalMetricScope)
    ? (value as PageViewScope)
    : null;
}

function aggregateRows(
  database: LearningDatabase,
  windowStartedAt: string,
): OperationalMetricAggregate[] {
  const rows = database.handle
    .prepare(
      `
        SELECT event, scope, outcome, SUM(count) AS count
        FROM operational_metrics
        WHERE bucket_started_at >= ?
        GROUP BY event, scope, outcome
        ORDER BY event, scope, outcome
      `,
    )
    .all(windowStartedAt) as Array<{
    event: OperationalMetricEvent;
    scope: OperationalMetricScope;
    outcome: OperationalMetricOutcome;
    count: number;
  }>;

  return rows.map((row) => ({
    event: row.event,
    scope: row.scope,
    outcome: row.outcome,
    count: Number(row.count),
  }));
}

function countMatches(
  aggregates: readonly OperationalMetricAggregate[],
  predicate: (aggregate: OperationalMetricAggregate) => boolean,
): number {
  return aggregates
    .filter(predicate)
    .reduce((total, aggregate) => total + aggregate.count, 0);
}

function alertsFor(
  aggregates: readonly OperationalMetricAggregate[],
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  const healthFailures = countMatches(
    aggregates,
    (aggregate) =>
      aggregate.event === "health_check" && aggregate.outcome === "failure",
  );
  if (healthFailures > 0) {
    alerts.push({
      id: "health-check-failed",
      severity: "critical",
      count: healthFailures,
    });
  }

  const backupFailures = countMatches(
    aggregates,
    (aggregate) =>
      (aggregate.event === "backup" || aggregate.event === "restore") &&
      aggregate.outcome === "failure",
  );
  if (backupFailures > 0) {
    alerts.push({
      id: "backup-or-restore-failed",
      severity: "critical",
      count: backupFailures,
    });
  }

  const contentAuditFailures = countMatches(
    aggregates,
    (aggregate) =>
      aggregate.event === "content_audit" && aggregate.outcome === "failure",
  );
  if (contentAuditFailures > 0) {
    alerts.push({
      id: "content-audit-failed",
      severity: "warning",
      count: contentAuditFailures,
    });
  }

  const materialsUpdateFailures = countMatches(
    aggregates,
    (aggregate) =>
      aggregate.event === "materials_update" && aggregate.outcome === "failure",
  );
  if (materialsUpdateFailures > 0) {
    alerts.push({
      id: "materials-update-failed",
      severity: "warning",
      count: materialsUpdateFailures,
    });
  }

  const loginFailures = countMatches(
    aggregates,
    (aggregate) =>
      aggregate.event === "login_failure" && aggregate.outcome === "failure",
  );
  if (loginFailures >= 5) {
    alerts.push({
      id: "login-failure-spike",
      severity: "warning",
      count: loginFailures,
    });
  }

  const serverErrors = countMatches(
    aggregates,
    (aggregate) =>
      aggregate.event === "request_error" &&
      aggregate.outcome === "server-error",
  );
  if (serverErrors >= 5) {
    alerts.push({
      id: "server-error-spike",
      severity: "warning",
      count: serverErrors,
    });
  }

  return alerts;
}

export function getPageViewScope(pathname: string): PageViewScope | null {
  const staticScopes: Record<string, PageViewScope> = {
    "/": "home",
    "/roadmap": "roadmap",
    "/courses": "courses",
    "/search": "search",
    "/projects": "projects",
    "/learning": "learning",
    "/login": "login",
    "/content-policy": "content-policy",
    "/contribute": "contribute",
    "/admin": "admin",
  };
  if (pathname in staticScopes) return staticScopes[pathname];

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return null;
  if (segments[0] === "roadmap") return "roadmap-stage";
  if (segments[0] === "courses") return "course-detail";
  if (segments[0] === "read") return "reader";
  return null;
}

export function createPrivacyFirstMonitor(
  database: LearningDatabase,
  options: PrivacyFirstMonitorOptions = {},
): PrivacyFirstMonitor {
  const now = options.now ?? (() => new Date());
  const writeLog =
    options.writeLog ??
    ((line: string) => {
      console.info(line);
    });

  return {
    record(input) {
      const occurredAt = now().toISOString();
      const bucketStartedAt = hourBucket(new Date(occurredAt));
      const { event, scope, outcome } = input;
      database.handle
        .prepare(
          `
            INSERT INTO operational_metrics (
              bucket_started_at,
              event,
              scope,
              outcome,
              count,
              last_occurred_at
            ) VALUES (?, ?, ?, ?, 1, ?)
            ON CONFLICT(bucket_started_at, event, scope, outcome) DO UPDATE SET
              count = operational_metrics.count + 1,
              last_occurred_at = excluded.last_occurred_at
          `,
        )
        .run(bucketStartedAt, event, scope, outcome, occurredAt);

      const cutoff = new Date(occurredAt);
      cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
      database.handle
        .prepare("DELETE FROM operational_metrics WHERE bucket_started_at < ?")
        .run(hourBucket(cutoff));

      writeLog(
        JSON.stringify({
          type: "agent-learning-hub.operational-metric",
          event,
          scope,
          outcome,
          occurredAt,
        }),
      );
    },
    snapshot(snapshotOptions = {}) {
      const generatedAt = now().toISOString();
      const windowHours = snapshotOptions.windowHours ?? SNAPSHOT_WINDOW_HOURS;
      const windowStartedAt = new Date(generatedAt);
      windowStartedAt.setUTCHours(windowStartedAt.getUTCHours() - windowHours);
      const aggregates = aggregateRows(database, windowStartedAt.toISOString());
      const pageViews = aggregates
        .filter(
          (aggregate) =>
            aggregate.event === "page_view" &&
            aggregate.outcome === "observed" &&
            pageScope(aggregate.scope) !== null,
        )
        .map((aggregate) => ({
          scope: pageScope(aggregate.scope)!,
          count: aggregate.count,
        }));
      const failures = aggregates.filter(
        (aggregate) =>
          aggregate.outcome === "failure" ||
          aggregate.outcome === "server-error",
      );
      const operations = aggregates.filter(
        (aggregate) =>
          aggregate.event === "backup" ||
          aggregate.event === "restore" ||
          aggregate.event === "content_audit" ||
          aggregate.event === "materials_update",
      );

      return {
        generatedAt,
        windowStartedAt: windowStartedAt.toISOString(),
        totalPageViews: pageViews.reduce(
          (total, aggregate) => total + aggregate.count,
          0,
        ),
        pageViews,
        operations,
        failures,
        alerts: alertsFor(aggregates),
      };
    },
  };
}
