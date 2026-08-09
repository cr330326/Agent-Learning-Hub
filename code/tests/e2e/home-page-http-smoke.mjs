const expectedMode = process.env.EXPECTED_RUNTIME_MODE ?? "cloud";
const response = await fetch("http://127.0.0.1:3100");
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

if (!visibleText.includes("The new learning environment is being prepared.")) {
  throw new Error("Home page did not include the expected startup message.");
}

if (!visibleText.includes(`Current runtime: ${expectedMode}`)) {
  throw new Error(
    `Home page did not expose the expected ${expectedMode} runtime mode.`,
  );
}

console.log(`Home page smoke test passed for ${expectedMode} mode.`);
