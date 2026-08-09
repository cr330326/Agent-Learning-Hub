const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:3218";

const cookieJar = new Map();

function updateCookies(response) {
  const values =
    response.headers.getSetCookie?.() ??
    [response.headers.get("set-cookie")].filter(Boolean);
  for (const value of values) {
    const [pair] = value.split(";");
    const separator = pair.indexOf("=");
    if (separator > 0)
      cookieJar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader() {
  return [...cookieJar.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  const cookies = cookieHeader();
  if (cookies) headers.set("cookie", cookies);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  updateCookies(response);
  return response;
}

const session = await request("/api/session");
const sessionPayload = await session.json();
if (!sessionPayload.authenticated || sessionPayload.user?.id !== "local-user") {
  throw new Error("Local session did not resolve to the fixed user.");
}

const csrf = sessionPayload.csrfToken;
const write = (body) =>
  request("/api/state", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(body),
  });

let response = await write({
  action: "item-progress",
  itemId: "agent-loop-maintainer-guide",
  status: "in_progress",
  position: 240,
});
if (response.status !== 200)
  throw new Error(`Progress write failed: ${response.status}`);

response = await write({
  action: "note",
  scopeType: "item",
  scopeId: "agent-loop-maintainer-guide",
  body: "private state survives the request boundary",
});
if (response.status !== 200)
  throw new Error(`Note write failed: ${response.status}`);

response = await write({
  action: "bookmark",
  itemId: "agent-loop-maintainer-guide",
  bookmarked: true,
});
if (response.status !== 200)
  throw new Error(`Bookmark write failed: ${response.status}`);

response = await write({
  action: "outcome",
  stageId: "stage-0",
  kind: "repository",
  url: "https://github.com/example/agent-loop",
});
if (response.status !== 200)
  throw new Error(`Outcome write failed: ${response.status}`);

response = await write({ action: "confirm-stage", stageId: "stage-0" });
if (response.status !== 200)
  throw new Error(`Stage confirmation failed: ${response.status}`);

response = await request("/api/state");
const statePayload = await response.json();
if (
  statePayload.state?.itemProgress?.[0]?.position !== 240 ||
  statePayload.state?.notes?.[0]?.body !==
    "private state survives the request boundary" ||
  statePayload.state?.bookmarks?.length !== 1 ||
  statePayload.state?.stageOutcomes?.[0]?.confirmedAt === null
) {
  throw new Error("Learning state did not round-trip through the HTTP API.");
}

response = await request("/api/data");
const exported = await response.text();
if (!exported.includes("private state survives the request boundary")) {
  throw new Error("JSON export did not include the user's note.");
}

response = await request("/api/data?format=notes");
const notesMarkdown = await response.text();
if (!notesMarkdown.includes("private state survives the request boundary")) {
  throw new Error("Markdown export did not include the user's note.");
}

response = await request("/api/data", {
  method: "DELETE",
  headers: {
    "content-type": "application/json",
    "x-csrf-token": csrf,
  },
  body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
});
if (response.status !== 200)
  throw new Error(`Account deletion failed: ${response.status}`);

response = await request("/api/state");
const afterDelete = await response.json();
if (
  afterDelete.state?.itemProgress?.length !== 0 ||
  afterDelete.state?.notes?.length !== 0
) {
  throw new Error("Account deletion did not cascade learning state.");
}

console.log("Local learning-state HTTP E2E passed.");
