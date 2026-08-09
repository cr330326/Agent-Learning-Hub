import { describe, expect, it } from "vitest";

import {
  LOCAL_USER_ID,
  LOCAL_SESSION_COOKIE,
  assertLocalAuthBinding,
  ensureLocalUser,
} from "./local-auth";
import { openLearningDatabase } from "../learning-state/database";
import { createLearningStateRepository } from "../learning-state/repository";

describe("local single-user auth", () => {
  it("creates the same fixed identity on every request", () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);

    const first = ensureLocalUser(repository);
    const second = ensureLocalUser(repository);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ id: LOCAL_USER_ID, mode: "local" });
    database.close();
  });

  it("accepts loopback binding and rejects network-facing免登录 binding", () => {
    expect(() => assertLocalAuthBinding(undefined)).not.toThrow();
    expect(() => assertLocalAuthBinding("127.0.0.1")).not.toThrow();
    expect(() => assertLocalAuthBinding("localhost")).not.toThrow();
    expect(() => assertLocalAuthBinding("0.0.0.0")).toThrow(/loopback/i);
    expect(() => assertLocalAuthBinding("192.168.1.20")).toThrow(/loopback/i);
    expect(LOCAL_SESSION_COOKIE).toBe("agent-learning-local-session");
  });
});
