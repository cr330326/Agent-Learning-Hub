import { assertLocalAuthBinding } from "../auth/local-auth";

export type DeploymentMode = "cloud" | "local";

export type RuntimeConfig = Readonly<{
  mode: DeploymentMode;
}>;

export function parseRuntimeConfig(
  environment: Readonly<Record<string, string | undefined>>,
): RuntimeConfig {
  const mode = environment.DEPLOYMENT_MODE ?? "cloud";
  if (mode === "cloud" || mode === "local") {
    if (mode === "local") {
      assertLocalAuthBinding(
        environment.LOCAL_BIND_HOST ?? environment.HOST,
      );
    }
    return { mode };
  }

  throw new Error('DEPLOYMENT_MODE must be either "cloud" or "local".');
}
