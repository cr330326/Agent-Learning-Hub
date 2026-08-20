// GATE-04 for Cloud Mode: log in, then drive notes, bookmarks, outcomes,
// export and account deletion across the real HTTP boundary.
//
// The local-mode twin (learning-state-http.mjs) can skip login entirely because
// Local Mode signs in a fixed single user. Cloud Mode cannot, and the login half
// is exactly where the mode's access rules live: anonymous callers must be
// refused, writes need a CSRF token, and deleting the account must invalidate
// the session rather than merely emptying its rows.
//
// GitHub is never contacted. The session is minted through Better Auth's own
// public API against the *same* SQLite file the server has open, with the
// provider's token and profile endpoints stubbed. That keeps the test off
// Better Auth's cookie-signing internals: the server accepts the cookie because
// it was issued by the same library with the same secret, not because this file
// re-implemented the signature.
//
// Because of that, this test is a second writer on the server's database, and
// it must share a filesystem with the server: CI, a dev machine, or two
// containers on one volume. Pointing it at a containerised server whose state
// lives on a macOS or Windows bind mount produces false failures — SQLite's WAL
// locking is not coherent across that boundary. A checkpoint mid-test names
// that situation instead of letting it surface as a phantom cascade bug.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createBetterAuthForDatabase } from "../../modules/auth/better-auth";
import { openLearningDatabase } from "../../modules/learning-state/database";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:3100";
const databaseFilename = resolve(
  process.env.STATE_DATABASE_PATH ??
    (() => {
      throw new Error(
        "STATE_DATABASE_PATH must point at the running server's database.",
      );
    })(),
);

const authEnvironment = {
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? baseUrl,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
};
for (const [key, value] of Object.entries(authEnvironment)) {
  if (!value?.trim()) {
    throw new Error(`${key} must match the running server's configuration.`);
  }
}

const GITHUB_NUMERIC_ID = 4242;
const GITHUB_LOGIN = "cloud-gate-04";
const GITHUB_DISPLAY_NAME = "Cloud Gate Four";
const EXPECTED_USER_ID = `github-${GITHUB_NUMERIC_ID}`;
const NOTE_BODY = "cloud private state survives the request boundary";
const ITEM_ID = "agent-loop-maintainer-guide";
const STAGE_ID = "stage-0";

const checks: string[] = [];

function check(label: string, condition: boolean, detail = ""): void {
  if (!condition) {
    throw new Error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
  checks.push(label);
  console.log(`PASS  ${label}`);
}

// ---- Anonymous boundary ----------------------------------------------------

async function anonymous(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, { ...init, headers: init.headers });
}

const health = await anonymous("/api/health");
const healthPayload = (await health.json()) as { mode?: string };
check(
  "runtime mode is cloud",
  healthPayload.mode === "cloud",
  `got ${healthPayload.mode}`,
);

const anonymousSession = await anonymous("/api/session");
const anonymousSessionPayload = (await anonymousSession.json()) as {
  authenticated?: boolean;
  csrfToken?: string | null;
};
check(
  "anonymous session is unauthenticated and carries no CSRF token",
  anonymousSessionPayload.authenticated === false &&
    anonymousSessionPayload.csrfToken === null,
  JSON.stringify(anonymousSessionPayload),
);

const anonymousState = await anonymous("/api/state");
check(
  "anonymous state read is refused",
  anonymousState.status === 401,
  `status ${anonymousState.status}`,
);

const anonymousWrite = await anonymous("/api/state", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    action: "bookmark",
    itemId: ITEM_ID,
    bookmarked: true,
  }),
});
check(
  "anonymous state write is refused",
  anonymousWrite.status === 401,
  `status ${anonymousWrite.status}`,
);

const anonymousExport = await anonymous("/api/data");
check(
  "anonymous export is refused",
  anonymousExport.status === 401,
  `status ${anonymousExport.status}`,
);

const anonymousDelete = await anonymous("/api/data", {
  method: "DELETE",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
});
check(
  "anonymous account deletion is refused",
  anonymousDelete.status === 401,
  `status ${anonymousDelete.status}`,
);

// ---- Login through a stubbed GitHub ----------------------------------------

const database = openLearningDatabase({ filename: databaseFilename });
let sessionCookie: string;
try {
  const auth = createBetterAuthForDatabase(database.handle, authEnvironment);
  const origin = new URL(authEnvironment.BETTER_AUTH_URL!).origin;

  const start = await auth.api.signInSocial({
    body: { provider: "github", callbackURL: `${origin}/learning` },
    headers: new Headers({ origin }),
    asResponse: true,
  });
  const authorizeUrl = start.headers.get("location");
  check(
    "login redirects to GitHub with the configured client",
    authorizeUrl?.includes("github.com/login/oauth/authorize") === true,
    String(authorizeUrl),
  );
  const state = new URL(authorizeUrl!).searchParams.get("state");
  const stateCookie = start.headers.get("set-cookie")?.split(";")[0];

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("login/oauth/access_token")) {
      return Response.json({
        access_token: "provider-token-never-persisted",
        token_type: "bearer",
        scope: "read:user",
      });
    }
    if (url.startsWith("https://api.github.com/user")) {
      return Response.json({
        id: GITHUB_NUMERIC_ID,
        login: GITHUB_LOGIN,
        name: GITHUB_DISPLAY_NAME,
      });
    }
    return realFetch(input, init);
  }) as typeof fetch;

  let callback: Response;
  try {
    callback = await auth.handler(
      new Request(
        `${origin}/api/auth/callback/github?code=gate-04&state=${state}`,
        { headers: { cookie: stateCookie! } },
      ),
    );
  } finally {
    globalThis.fetch = realFetch;
  }

  const issued = callback.headers
    .get("set-cookie")
    ?.split(", ")
    .find((cookie) => /^(?:__Secure-)?agent-learning-session=/.test(cookie))
    ?.split(";")[0];
  check(
    "GitHub callback issues a session cookie",
    Boolean(issued),
    `status ${callback.status}`,
  );
  sessionCookie = issued!;

  const persisted = database.handle
    .prepare("SELECT * FROM accounts WHERE provider_account_id = ?")
    .get(String(GITHUB_NUMERIC_ID)) as Record<string, unknown> | undefined;
  check(
    "no provider access token is persisted",
    Boolean(persisted) &&
      !JSON.stringify(persisted).includes("provider-token-never-persisted"),
    JSON.stringify(persisted),
  );
} finally {
  database.close();
}

// ---- Authenticated flow ----------------------------------------------------

const cookieJar = new Map<string, string>();
for (const pair of sessionCookie.split("; ")) {
  const separator = pair.indexOf("=");
  if (separator > 0)
    cookieJar.set(pair.slice(0, separator), pair.slice(separator + 1));
}

function absorbCookies(response: Response): void {
  const values =
    response.headers.getSetCookie?.() ??
    [response.headers.get("set-cookie")].filter(Boolean as never);
  for (const value of values) {
    const [pair] = value.split(";");
    const separator = pair.indexOf("=");
    if (separator > 0)
      cookieJar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set(
    "cookie",
    [...cookieJar.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .join("; "),
  );
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  absorbCookies(response);
  return response;
}

const session = await request("/api/session");
const sessionPayload = (await session.json()) as {
  authenticated?: boolean;
  user?: { id?: string; displayName?: string; githubId?: string };
  csrfToken?: string | null;
};
check(
  "session resolves to the GitHub identity",
  sessionPayload.authenticated === true &&
    sessionPayload.user?.id === EXPECTED_USER_ID &&
    sessionPayload.user?.displayName === GITHUB_DISPLAY_NAME,
  JSON.stringify(sessionPayload.user),
);
const csrfToken = sessionPayload.csrfToken;
check("session issues a CSRF token", Boolean(csrfToken));

const write = (body: unknown) =>
  request("/api/state", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken! },
    body: JSON.stringify(body),
  });

const missingCsrf = await request("/api/state", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    action: "bookmark",
    itemId: ITEM_ID,
    bookmarked: true,
  }),
});
check(
  "authenticated write without a CSRF token is refused",
  missingCsrf.status === 403,
  `status ${missingCsrf.status}`,
);

const wrongCsrf = await request("/api/state", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-csrf-token": "not-the-issued-token",
  },
  body: JSON.stringify({
    action: "bookmark",
    itemId: ITEM_ID,
    bookmarked: true,
  }),
});
check(
  "authenticated write with a mismatched CSRF token is refused",
  wrongCsrf.status === 403,
  `status ${wrongCsrf.status}`,
);

for (const [label, body] of [
  [
    "item progress",
    {
      action: "item-progress",
      itemId: ITEM_ID,
      status: "in_progress",
      position: 240,
    },
  ],
  [
    "note",
    { action: "note", scopeType: "item", scopeId: ITEM_ID, body: NOTE_BODY },
  ],
  ["bookmark", { action: "bookmark", itemId: ITEM_ID, bookmarked: true }],
  [
    "stage outcome",
    {
      action: "outcome",
      stageId: STAGE_ID,
      kind: "repository",
      url: "https://github.com/example/agent-loop",
    },
  ],
  ["stage confirmation", { action: "confirm-stage", stageId: STAGE_ID }],
] as const) {
  const response = await write(body);
  check(
    `${label} write succeeds`,
    response.status === 200,
    `status ${response.status}`,
  );
}

const snapshot = await request("/api/state");
const snapshotPayload = (await snapshot.json()) as {
  state?: {
    itemProgress?: { position?: number }[];
    notes?: { body?: string }[];
    bookmarks?: unknown[];
    stageOutcomes?: { confirmedAt?: string | null }[];
  };
};
check(
  "learning state round-trips through the HTTP API",
  snapshotPayload.state?.itemProgress?.[0]?.position === 240 &&
    snapshotPayload.state?.notes?.[0]?.body === NOTE_BODY &&
    snapshotPayload.state?.bookmarks?.length === 1 &&
    snapshotPayload.state?.stageOutcomes?.[0]?.confirmedAt !== null,
  JSON.stringify(snapshotPayload.state),
);

// Coherence checkpoint. This test is a second writer on the server's SQLite
// file, which is only safe when both processes sit on the same filesystem —
// CI, a dev machine, or two containers sharing a volume. It is NOT safe when
// the server runs in a container and the database lives on a macOS/Windows
// bind mount: SQLite coordinates WAL access through a memory-mapped -shm file,
// and that mapping is not coherent across the VM boundary. The symptom is
// bizarre rather than obvious — writes land, then partially un-land, and the
// deletion assertions below fail while the application is behaving correctly.
// Catch it here, where the cause can still be named.
{
  const probe = openLearningDatabase({ filename: databaseFilename });
  try {
    const visible = probe.handle
      .prepare("SELECT COUNT(*) AS total FROM notes WHERE user_id = ?")
      .get(EXPECTED_USER_ID) as { total: number };
    check(
      "the database file agrees with the server about the note just written",
      visible.total === 1,
      visible.total === 1
        ? ""
        : "the server and this test disagree about the file's contents — run both on one filesystem (see the note above this check), not across a container bind mount",
    );
  } finally {
    probe.close();
  }
}

const jsonExport = await request("/api/data");
const jsonExportBody = await jsonExport.text();
check(
  "JSON export carries the note and no session secrets",
  jsonExportBody.includes(NOTE_BODY) &&
    !jsonExportBody.includes("tokenHash") &&
    !jsonExportBody.includes("token_hash"),
  `status ${jsonExport.status}`,
);

const notesExport = await request("/api/data?format=notes");
const notesExportBody = await notesExport.text();
check(
  "Markdown export carries the note",
  notesExportBody.includes(NOTE_BODY),
  `status ${notesExport.status}`,
);

// ---- Account deletion ------------------------------------------------------

const wrongConfirmation = await request("/api/data", {
  method: "DELETE",
  headers: { "content-type": "application/json", "x-csrf-token": csrfToken! },
  body: JSON.stringify({ confirmation: "delete" }),
});
check(
  "account deletion refuses an unconfirmed request",
  wrongConfirmation.status === 400,
  `status ${wrongConfirmation.status}`,
);

const deletion = await request("/api/data", {
  method: "DELETE",
  headers: { "content-type": "application/json", "x-csrf-token": csrfToken! },
  body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
});
check(
  "account deletion succeeds",
  deletion.status === 200,
  `status ${deletion.status}`,
);

const afterDelete = await request("/api/state");
check(
  "the deleted account's session no longer authenticates",
  afterDelete.status === 401,
  `status ${afterDelete.status}`,
);

// The session cookie is cleared by the response, so re-read the file directly:
// deletion must cascade the rows, not just drop the cookie.
const verifier = openLearningDatabase({ filename: databaseFilename });
try {
  const counts = [
    "notes",
    "bookmarks",
    "stage_outcomes",
    "item_progress",
    "sessions",
  ].map((table) => {
    const row = verifier.handle
      .prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE user_id = ?`)
      .get(EXPECTED_USER_ID) as { total: number };
    return [table, row.total] as const;
  });
  check(
    "account deletion cascades every private table",
    counts.every(([, total]) => total === 0),
    JSON.stringify(Object.fromEntries(counts)),
  );

  const user = verifier.handle
    .prepare("SELECT COUNT(*) AS total FROM users WHERE id = ?")
    .get(EXPECTED_USER_ID) as { total: number };
  check("the user row itself is gone", user.total === 0, JSON.stringify(user));
} finally {
  verifier.close();
}

// The public catalog must be untouched by any of the above: it lives in Git,
// never in SQLite, and a deleted account may not take content with it.
const catalog = await anonymous("/api/health");
const catalogPayload = (await catalog.json()) as {
  checks?: { catalog?: string };
};
check(
  "the public catalog is unaffected by account deletion",
  catalogPayload.checks?.catalog === "ok",
  JSON.stringify(catalogPayload),
);

// Guard the boundary the export itself promises: the file on disk must never
// have contained the raw session token.
const rawDatabase = readFileSync(databaseFilename);
check(
  "the raw session token is never stored in the database file",
  !rawDatabase.includes(sessionCookie.split("=")[1]!.split(".")[0]!),
);

console.log(
  `\nCloud auth + learning-state HTTP E2E passed (${checks.length} checks).`,
);
