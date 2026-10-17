import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["modules/**/*.test.ts"],
    // Several suites hash real backups or shell out to a tsx CLI; one case
    // takes over a second on an idle machine, so the 5s default turns the
    // CPU contention of a parallel run into false failures instead of
    // catching a genuine hang.
    testTimeout: 20_000,
  },
});
