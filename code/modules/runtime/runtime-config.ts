export type DeploymentMode = "cloud" | "local";

export type RuntimeConfig = Readonly<{
  mode: DeploymentMode;
}>;

export function parseRuntimeConfig(
  environment: Readonly<Record<string, string | undefined>>,
): RuntimeConfig {
  const mode = environment.DEPLOYMENT_MODE ?? "cloud";
  if (mode === "cloud" || mode === "local") {
    return { mode };
  }

  throw new Error('DEPLOYMENT_MODE must be either "cloud" or "local".');
}
