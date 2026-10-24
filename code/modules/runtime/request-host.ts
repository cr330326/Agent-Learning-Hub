// Local Mode hands out the fixed no-login identity to every request it sees,
// so the set of hosts allowed to reach it has to be a hard allowlist, not a
// binding-time hint. This module is deliberately dependency-free so that both
// the Next.js middleware (edge bundle) and request-auth (server bundle) can
// share the exact same boundary.
const TRUSTED_LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);

export function isTrustedLocalHost(
  hostHeader: string | null | undefined,
): boolean {
  if (!hostHeader) return false;
  const value = hostHeader.trim().toLowerCase();
  if (value.length === 0) return false;

  let hostname = value;
  if (hostname.startsWith("[")) {
    // Bracketed IPv6, optionally with a port: "[::1]:3001".
    const closing = hostname.indexOf("]");
    if (closing < 0) return false;
    hostname = hostname.slice(1, closing);
  } else {
    const firstColon = hostname.indexOf(":");
    const lastColon = hostname.lastIndexOf(":");
    // Exactly one colon means host:port. Bare IPv6 ("::1") keeps its colons.
    if (firstColon >= 0 && firstColon === lastColon) {
      hostname = hostname.slice(0, firstColon);
    }
  }
  return TRUSTED_LOCAL_HOSTNAMES.has(hostname);
}
