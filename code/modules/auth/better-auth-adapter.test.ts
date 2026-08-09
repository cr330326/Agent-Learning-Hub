import { describe, expect, it } from "vitest";

import { hashSessionToken } from "./request-auth";
import { openLearningDatabase } from "../learning-state/database";
import { createLearningStateBetterAuthAdapter } from "./better-auth-adapter";

describe("Better Auth learning-state adapter", () => {
  it("stores only the minimum identity fields and hashes session tokens", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const adapter = createLearningStateBetterAuthAdapter(database.handle);
    const createdAt = new Date("2026-08-09T00:00:00.000Z");

    await adapter.create({
      model: "user",
      data: {
        id: "github-42",
        name: "Octocat",
        email: "42@github.invalid",
        emailVerified: false,
        image: null,
        createdAt,
        updatedAt: createdAt,
      },
    });
    await adapter.create({
      model: "account",
      data: {
        id: "account-42",
        userId: "github-42",
        providerId: "github",
        accountId: "42",
        accessToken: "must-not-persist",
        refreshToken: "must-not-persist",
        createdAt,
        updatedAt: createdAt,
      },
    });

    const sessionToken = "session-secret-that-is-only-in-the-cookie";
    await adapter.create({
      model: "session",
      data: {
        id: "session-42",
        userId: "github-42",
        token: sessionToken,
        expiresAt: new Date("2026-09-09T00:00:00.000Z"),
        ipAddress: "127.0.0.1",
        userAgent: "test",
        createdAt,
        updatedAt: createdAt,
      },
    });

    const accountRow = database.handle
      .prepare("SELECT * FROM accounts WHERE id = ?")
      .get("account-42") as Record<string, unknown>;
    const sessionRow = database.handle
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get("session-42") as Record<string, unknown>;

    expect(accountRow).not.toHaveProperty("access_token");
    expect(accountRow).not.toHaveProperty("refresh_token");
    expect(sessionRow.token_hash).toBe(hashSessionToken(sessionToken));
    expect(JSON.stringify(sessionRow)).not.toContain(sessionToken);

    const found = await adapter.findOne({
      model: "session",
      where: [{ field: "token", value: sessionToken }],
      join: { user: true },
    });
    expect(found).toMatchObject({
      id: "session-42",
      userId: "github-42",
      token: sessionToken,
      user: { id: "github-42", name: "Octocat" },
    });

    const account = await adapter.findOne({
      model: "account",
      where: [
        { field: "providerId", value: "github" },
        { field: "accountId", value: "42" },
      ],
      join: { user: true },
    });
    expect(account).toMatchObject({
      providerId: "github",
      accountId: "42",
      user: { id: "github-42" },
    });

    database.close();
  });
});
