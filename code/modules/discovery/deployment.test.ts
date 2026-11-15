import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  chmod,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

it("ships discovery configuration and a separate private-key file without printing secrets", async () => {
  const root = await mkdtemp(join(tmpdir(), "alh-deploy-fixture-"));
  try {
    const bin = join(root, "bin"),
      capture = join(root, "capture");
    await mkdir(bin);
    await mkdir(capture);
    await writeFile(
      join(bin, "ssh"),
      `#!/usr/bin/env node\nif(process.argv.includes('mktemp'))process.stdout.write('/tmp/agent-learning-hub-secret.fixture\\n');else process.stdin.resume();\n`,
      { mode: 0o700 },
    );
    await writeFile(
      join(bin, "scp"),
      `#!/usr/bin/env node\nconst fs=require('node:fs'),path=require('node:path');const input=process.argv.at(-2);fs.copyFileSync(input,path.join(process.env.CAPTURE_DIRECTORY,path.basename(input)));\n`,
      { mode: 0o700 },
    );
    const keyFile = join(root, "github-key.pem");
    await writeFile(keyFile, "private-key-fixture-only", { mode: 0o600 });
    const envFile = join(root, "application.env");
    await writeFile(
      envFile,
      [
        "BETTER_AUTH_SECRET=fixture-auth-value-at-least-thirty-two-characters",
        "BETTER_AUTH_URL=https://fixture.example.com",
        "GITHUB_CLIENT_ID=fixture-client",
        "GITHUB_CLIENT_SECRET=fixture-oauth-secret",
        "ADMIN_GITHUB_IDS=42",
        "DISCOVERY_MODEL_URL=https://example.com/model",
        "DISCOVERY_MODEL_KEY=fixture-model-secret",
        "DISCOVERY_MODEL_NAME=fixture-model",
        "DISCOVERY_MODEL_TOKEN_LIMIT_FIELD=max_completion_tokens",
        "DISCOVERY_INPUT_PRICE=1",
        "DISCOVERY_OUTPUT_PRICE=2",
        "DISCOVERY_PRICE_CURRENCY=USD",
        "DISCOVERY_EXCHANGE_RATE=7",
        "FEISHU_APP_ID=fixture-app",
        "FEISHU_APP_SECRET=fixture-feishu-secret",
        "GITHUB_APP_ID=123",
        "GITHUB_APP_INSTALLATION_ID=456",
        "GITHUB_REPOSITORY=owner/repo",
        `GITHUB_APP_PRIVATE_KEY_FILE=${keyFile}`,
        "DISCOVERY_VOLUME_NAME=fixture-discovery",
        "UNRELATED_SECRET=do-not-forward",
      ].join("\n") + "\n",
      { mode: 0o600 },
    );
    const environment = {
      ...process.env,
      PATH: bin + ":" + process.env.PATH,
      CAPTURE_DIRECTORY: capture,
      LIGHTHOUSE_ENV_FILE: envFile,
      LIGHTHOUSE_DOMAIN: "fixture.example.com",
      LIGHTHOUSE_BACKUP_ENV_FILE: "",
      LIGHTHOUSE_DRY_RUN: "0",
    };
    const result = spawnSync(
      "bash",
      [resolve("scripts/lighthouse-deploy.sh"), "configure"],
      { env: environment, encoding: "utf8", timeout: 10000 },
    );
    expect(result.status, result.stderr).toBe(0);
    const sanitized = await readFile(join(capture, "application.env"), "utf8");
    expect(sanitized).toContain("DISCOVERY_MODEL_KEY=fixture-model-secret");
    expect(sanitized).toContain(
      "DISCOVERY_MODEL_TOKEN_LIMIT_FIELD=max_completion_tokens",
    );
    expect(sanitized).toContain("FEISHU_APP_SECRET=fixture-feishu-secret");
    expect(sanitized).toContain(
      "GITHUB_APP_PRIVATE_KEY_FILE=/etc/agent-learning-hub/github-app.pem",
    );
    expect(sanitized).not.toContain(keyFile);
    expect(sanitized).not.toContain("UNRELATED_SECRET");
    expect(await readFile(join(capture, "github-key.pem"), "utf8")).toBe(
      "private-key-fixture-only",
    );
    for (const secret of [
      "fixture-auth-value",
      "fixture-model-secret",
      "fixture-feishu-secret",
      "private-key-fixture-only",
      "fixture-oauth-secret",
    ])
      expect(result.stdout + result.stderr).not.toContain(secret);
    await chmod(keyFile, 0o644);
    const unsafe = spawnSync(
      "bash",
      [resolve("scripts/lighthouse-deploy.sh"), "configure"],
      { env: environment, encoding: "utf8", timeout: 10000 },
    );
    expect(unsafe.status).not.toBe(0);
    expect(unsafe.stderr).toContain("group/other");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("keeps release dry-run executable after expanding the maintenance bundle", () => {
  const result = spawnSync(
    "bash",
    [resolve("scripts/lighthouse-deploy.sh"), "deploy"],
    {
      env: {
        ...process.env,
        LIGHTHOUSE_DRY_RUN: "1",
        LIGHTHOUSE_DOMAIN: "fixture.example.com",
        LIGHTHOUSE_IMAGE: "example/agent-learning-hub:fixture-v1",
        LIGHTHOUSE_ENV_FILE: "",
        LIGHTHOUSE_BACKUP_ENV_FILE: "",
      },
      encoding: "utf8",
      timeout: 20000,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("stage release");
});
