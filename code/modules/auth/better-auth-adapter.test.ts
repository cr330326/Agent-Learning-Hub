import { describe, expect, it } from "vitest";

import { hashSessionToken } from "./request-auth";
import { openLearningDatabase } from "../learning-state/database";
import {
  buildAdapterWhereSql,
  createLearningStateBetterAuthAdapter,
} from "./better-auth-adapter";

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

  it("rolls back the whole transaction when a later write fails", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const adapter = createLearningStateBetterAuthAdapter(database.handle);

    // Mirrors createOAuthUser: the user row is written first, then a database
    // constraint fails while the account row is written.
    await expect(
      adapter.transaction(async (tx) => {
        await tx.create({
          model: "user",
          data: { id: "github-7", name: "Rollback", email: "7@github.invalid" },
        });
        await tx.create({
          model: "account",
          data: {
            id: "account-7",
            userId: "github-7",
            providerId: "github",
            accountId: "7",
          },
        });
        await tx.create({
          model: "account",
          data: {
            id: "account-7",
            userId: "github-7",
            providerId: "github",
            accountId: "8",
          },
        });
      }),
    ).rejects.toThrow();

    const users = database.handle
      .prepare("SELECT COUNT(*) AS count FROM users")
      .get() as { count: number };
    const accounts = database.handle
      .prepare("SELECT COUNT(*) AS count FROM accounts")
      .get() as { count: number };
    expect(users.count).toBe(0);
    expect(accounts.count).toBe(0);
    database.close();
  });

  it("commits every write when the transaction succeeds", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const adapter = createLearningStateBetterAuthAdapter(database.handle);

    const result = await adapter.transaction(async (tx) => {
      await tx.create({
        model: "user",
        data: { id: "github-9", name: "Committed", email: "9@github.invalid" },
      });
      await tx.create({
        model: "account",
        data: {
          id: "account-9",
          userId: "github-9",
          providerId: "github",
          accountId: "9",
        },
      });
      return "ok";
    });
    expect(result).toBe("ok");

    const users = database.handle
      .prepare("SELECT COUNT(*) AS count FROM users")
      .get() as { count: number };
    const accounts = database.handle
      .prepare("SELECT COUNT(*) AS count FROM accounts")
      .get() as { count: number };
    expect(users.count).toBe(1);
    expect(accounts.count).toBe(1);
    database.close();
  });

  it("does not roll back a concurrent transaction that commits", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const adapter = createLearningStateBetterAuthAdapter(database.handle);

    const failing = adapter.transaction(async (tx) => {
      await tx.create({
        model: "user",
        data: { id: "github-1", name: "Fails", email: "1@github.invalid" },
      });
      throw new Error("provider rejected this login");
    });
    const concurrent = adapter.transaction(async (tx) => {
      await tx.create({
        model: "user",
        data: { id: "github-2", name: "Survives", email: "2@github.invalid" },
      });
      return "committed";
    });

    const [failingResult, concurrentResult] = await Promise.allSettled([
      failing,
      concurrent,
    ]);
    expect(failingResult.status).toBe("rejected");
    expect(concurrentResult).toEqual({
      status: "fulfilled",
      value: "committed",
    });

    const survivors = database.handle
      .prepare("SELECT id FROM users ORDER BY id")
      .all() as Array<{ id: string }>;
    expect(survivors.map((row) => row.id)).toEqual(["github-2"]);
    database.close();
  });

  it("runs a write that arrives while a transaction is open after it settles", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const adapter = createLearningStateBetterAuthAdapter(database.handle);

    let releaseBlockingTransaction: () => void = () => {};
    const blocked = new Promise<void>((resolve) => {
      releaseBlockingTransaction = resolve;
    });
    const failing = adapter.transaction(async (tx) => {
      await tx.create({
        model: "user",
        data: { id: "github-1", name: "Fails", email: "1@github.invalid" },
      });
      await blocked;
      throw new Error("provider rejected this login");
    });
    // Let the transaction insert its user and hold the connection open.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const outside = adapter.create({
      model: "user",
      data: { id: "github-2", name: "Outside", email: "2@github.invalid" },
    });
    releaseBlockingTransaction();
    await expect(failing).rejects.toThrow();
    await outside;

    const survivors = database.handle
      .prepare("SELECT id FROM users ORDER BY id")
      .all() as Array<{ id: string }>;
    expect(survivors.map((row) => row.id)).toEqual(["github-2"]);
    database.close();
  });

  it("rolls back only the nested savepoint when an inner transaction fails", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const adapter = createLearningStateBetterAuthAdapter(database.handle);

    await adapter.transaction(async (outer) => {
      await outer.create({
        model: "user",
        data: { id: "github-1", name: "Outer", email: "1@github.invalid" },
      });
      await expect(
        adapter.transaction(async (inner) => {
          await inner.create({
            model: "user",
            data: { id: "github-2", name: "Inner", email: "2@github.invalid" },
          });
          throw new Error("inner failure");
        }),
      ).rejects.toThrow("inner failure");

      const outerUser = await outer.findOne({
        model: "user",
        where: [{ field: "id", value: "github-1" }],
      });
      expect(outerUser).not.toBeNull();
    });

    const survivors = database.handle
      .prepare("SELECT id FROM users ORDER BY id")
      .all() as Array<{ id: string }>;
    expect(survivors.map((row) => row.id)).toEqual(["github-1"]);
    database.close();
  });

  it("translates where clauses into parameterized SQL without field-name interpolation", () => {
    const tokenLookup = buildAdapterWhereSql("session", [
      { field: "token", value: "raw-cookie-token" },
    ]);
    expect(tokenLookup).not.toBeNull();
    expect(tokenLookup?.clause).toBe("(token_hash = ?)");
    expect(tokenLookup?.params).toEqual([hashSessionToken("raw-cookie-token")]);

    const accountLookup = buildAdapterWhereSql("account", [
      { field: "providerId", value: "github" },
      { field: "accountId", value: "42" },
    ]);
    expect(accountLookup?.clause).toBe(
      "(provider = ?) AND (provider_account_id = ?)",
    );
    expect(accountLookup?.params).toEqual(["github", "42"]);

    const derivedEmail = buildAdapterWhereSql("user", [
      { field: "email", value: "42@github.invalid" },
    ]);
    expect(derivedEmail?.clause).toBe(
      "((COALESCE(github_id, id) || '@github.invalid') = ?)",
    );

    const patternLookup = buildAdapterWhereSql("session", [
      { field: "userId", operator: "starts_with", value: "github-1%" },
    ]);
    expect(patternLookup?.clause).toBe("(user_id LIKE ? ESCAPE '\\')");
    expect(patternLookup?.params).toEqual(["github-1\\%%"]);

    // Fields outside the whitelist must never reach SQL.
    expect(
      buildAdapterWhereSql("session", [
        { field: "userAgent; DROP TABLE", value: "x" },
      ]),
    ).toBeNull();
  });

  it("finds sessions by token through an index instead of a table scan", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const adapter = createLearningStateBetterAuthAdapter(database.handle);
    const createdAt = new Date("2026-08-09T00:00:00.000Z");

    await adapter.create({
      model: "user",
      data: { id: "github-42", name: "Octocat", email: "42@github.invalid" },
    });
    const tokenCount = 2_000;
    const targetToken = "session-token-1999";
    for (let index = 0; index < tokenCount; index += 1) {
      await adapter.create({
        model: "session",
        data: {
          id: `session-${index}`,
          userId: "github-42",
          token: index === 1999 ? targetToken : `filler-token-${index}`,
          expiresAt: new Date("2026-09-09T00:00:00.000Z"),
          createdAt,
        },
      });
    }

    const found = await adapter.findOne({
      model: "session",
      where: [{ field: "token", value: targetToken }],
    });
    expect(found).toMatchObject({ id: "session-1999", token: targetToken });

    const missing = await adapter.findOne({
      model: "session",
      where: [{ field: "token", value: "not-a-stored-token" }],
    });
    expect(missing).toBeNull();

    // The token lookup is the R05 hot path: it must search through the unique
    // token_hash index, not read every row into JS.
    const plan = database.handle
      .prepare(
        `EXPLAIN QUERY PLAN SELECT id, user_id, token_hash, expires_at, created_at
         FROM sessions WHERE (token_hash = ?)`,
      )
      .all(hashSessionToken(targetToken)) as Array<{ detail: string }>;
    expect(plan.some((row) => row.detail.includes("USING INDEX"))).toBe(true);
    expect(plan.some((row) => row.detail.toUpperCase().includes("SCAN"))).toBe(
      false,
    );
    database.close();
  });
});
