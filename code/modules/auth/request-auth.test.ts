import { describe, expect, it } from "vitest";

import { openLearningDatabase } from "../learning-state/database";
import { createLearningStateRepository } from "../learning-state/repository";
import {
  CLOUD_SESSION_COOKIE,
  createSessionToken,
  getRequestUser,
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
});
