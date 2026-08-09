const expectedMode = process.env.EXPECTED_RUNTIME_MODE ?? "cloud";
const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:3100";
const response = await fetch(baseUrl);
const page = await response.text();
const visibleText = page
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

if (response.status !== 200) {
  throw new Error(
    `Expected home page status 200, received ${response.status}.`,
  );
}

if (
  !visibleText.includes("agent loop") ||
  !visibleText.includes("真正能运行的系统")
) {
  throw new Error(
    "Home page did not include the expected learning-hub headline.",
  );
}

const expectedModeLabel = expectedMode === "local" ? "本地模式" : "云端模式";
if (!visibleText.includes(expectedModeLabel)) {
  throw new Error(
    `Home page did not expose the expected ${expectedModeLabel} runtime mode.`,
  );
}

console.log(`Home page smoke test passed for ${expectedMode} mode.`);
