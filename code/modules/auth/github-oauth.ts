import { randomBytes } from "node:crypto";

export type GitHubOAuthConfig = Readonly<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  adminGithubIds: ReadonlySet<string>;
}>;

export type GitHubIdentity = {
  githubId: string;
  displayName: string;
};

export type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class GitHubOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubOAuthError";
  }
}

function requiredEnvironmentValue(
  environment: Readonly<Record<string, string | undefined>>,
  key: string,
): string {
  const value = environment[key]?.trim();
  if (!value)
    throw new GitHubOAuthError(`${key} is required for GitHub login.`);
  return value;
}

export function getGitHubOAuthConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GitHubOAuthConfig {
  const adminGithubIds = new Set(
    (environment.ADMIN_GITHUB_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return {
    clientId: requiredEnvironmentValue(environment, "GITHUB_CLIENT_ID"),
    clientSecret: requiredEnvironmentValue(environment, "GITHUB_CLIENT_SECRET"),
    redirectUri: requiredEnvironmentValue(environment, "GITHUB_REDIRECT_URI"),
    adminGithubIds,
  };
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function buildGitHubAuthorizeUrl(
  config: GitHubOAuthConfig,
  state: string,
): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  return url.toString();
}

export function isAdminGithubId(
  githubId: string,
  config: GitHubOAuthConfig,
): boolean {
  return config.adminGithubIds.has(githubId);
}

export async function fetchGitHubIdentity(
  code: string,
  config: GitHubOAuthConfig,
  fetcher: Fetcher = fetch,
): Promise<GitHubIdentity> {
  const tokenResponse = await fetcher(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
      }),
    },
  );
  if (!tokenResponse.ok) {
    throw new GitHubOAuthError("GitHub token exchange failed.");
  }
  const tokenPayload: unknown = await tokenResponse.json();
  const accessToken =
    tokenPayload && typeof tokenPayload === "object"
      ? (tokenPayload as { access_token?: unknown }).access_token
      : undefined;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new GitHubOAuthError("GitHub did not return an access token.");
  }

  const profileResponse = await fetcher("https://api.github.com/user", {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": "agent-learning-hub",
    },
  });
  if (!profileResponse.ok) {
    throw new GitHubOAuthError("GitHub identity lookup failed.");
  }
  const profile: unknown = await profileResponse.json();
  if (!profile || typeof profile !== "object") {
    throw new GitHubOAuthError("GitHub returned an invalid identity.");
  }
  const id = (profile as { id?: unknown }).id;
  const login = (profile as { login?: unknown }).login;
  const name = (profile as { name?: unknown }).name;
  if (
    (typeof id !== "number" && typeof id !== "string") ||
    typeof login !== "string"
  ) {
    throw new GitHubOAuthError("GitHub identity is missing a stable ID.");
  }
  const displayName =
    typeof name === "string" && name.trim().length > 0 ? name.trim() : login;
  return { githubId: String(id), displayName: displayName.slice(0, 160) };
}
