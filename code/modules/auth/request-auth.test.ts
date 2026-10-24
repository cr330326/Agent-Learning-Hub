import { describe, expect, it } from "vitest";

import { openLearningDatabase } from "../learning-state/database";
import { createLearningStateRepository } from "../learning-state/repository";
import {
  CLOUD_SESSION_COOKIE,
  createSessionToken,
  getRequestUser,
  getRequestUserAsync,
  hashSessionToken,
} from "./request-auth";
import { handleSessionRequest } from "../../app/api/session/route";

describe("request authentication context", () => {
  it("maps every local request to the fixed local user", () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);

    const user = getRequestUser(
      new Request("http://127.0.0.1/api/session"),
      repository,
      "local",
    );

    expect(user).toMatchObject({ id: "local-user", mode: "local" });
    database.close();
  });

  it("refuses the fixed local identity for a non-loopback Host", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);

    // R01 regression: a request that reaches the server with an attacker
    // Host header must not receive the local identity (DNS rebinding / LAN).
    const rebinding = new Request("http://127.0.0.1/api/session", {
      headers: { host: "review.invalid:3419" },
    });
    expect(getRequestUser(rebinding, repository, "local")).toBeNull();

    const asyncUser = await getRequestUserAsync(rebinding, repository, "local");
    expect(asyncUser).toBeNull();

    const session = await handleSessionRequest(rebinding, repository, "local");
    expect(await session.json()).toMatchObject({ authenticated: false });
    database.close();
  });

  it("only resolves a cloud user from a valid, unexpired session", () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);
    const user = repository.createUser({
      id: "cloud-user",
      mode: "cloud",
      githubId: "42",
      displayName: "Cloud learner",
    });
    const token = createSessionToken();
    repository.createSession({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const request = new Request("http://example.test/api/session", {
      headers: { cookie: `${CLOUD_SESSION_COOKIE}=${token}` },
    });
    expect(getRequestUser(request, repository, "cloud")).toMatchObject({
      id: user.id,
    });
    expect(
      getRequestUser(
        new Request("http://example.test/api/session"),
        repository,
        "cloud",
      ),
    ).toBeNull();
    database.close();
  });

  it("issues loopback local session and CSRF cookies", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);
    const response = await handleSessionRequest(
      new Request("http://127.0.0.1/api/session"),
      repository,
      "local",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "agent-learning-local-session=local-mode",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "agent-learning-csrf=local-mode",
    );
    expect(await response.json()).toMatchObject({
      authenticated: true,
      user: { id: "local-user" },
      csrfToken: "local-mode",
    });
    database.close();
  });

  it("keeps loopback local cookies usable over HTTP in a production build", async () => {
    const environment = process.env as Record<string, string | undefined>;
    const previousNodeEnv = environment.NODE_ENV;
    environment.NODE_ENV = "production";
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });

    try {
      const response = await handleSessionRequest(
        new Request("http://127.0.0.1/api/session"),
        createLearningStateRepository(database),
        "local",
      );

      expect(response.headers.get("set-cookie")).not.toContain("Secure");
    } finally {
      database.close();
      if (previousNodeEnv === undefined) delete environment.NODE_ENV;
      else environment.NODE_ENV = previousNodeEnv;
    }
  });
});
