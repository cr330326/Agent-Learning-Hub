const expectedMode = process.env.EXPECTED_RUNTIME_MODE ?? "cloud";
const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:3100";
const response = await fetch(`${baseUrl}/api/health`);
const payload = await response.json();

if (
  response.status !== 200 ||
  payload.status !== "ok" ||
  payload.mode !== expectedMode ||
  payload.checks?.catalog !== "ok" ||
  payload.checks?.database !== "ok"
) {
  throw new Error(
    `Health check failed for ${expectedMode} mode: ${response.status} ${JSON.stringify(payload)}`,
  );
}

console.log(`Health HTTP smoke test passed for ${expectedMode} mode.`);

const adminResponse = await fetch(`${baseUrl}/api/admin/health`);
const expectedAdminStatus = expectedMode === "cloud" ? 401 : 403;
if (adminResponse.status !== expectedAdminStatus) {
  throw new Error(
    `Admin health access boundary failed: expected ${expectedAdminStatus}, got ${adminResponse.status}.`,
  );
}

console.log(`Admin health access boundary passed for ${expectedMode} mode.`);
