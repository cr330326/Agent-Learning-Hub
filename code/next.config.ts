import type { NextConfig } from "next";

// R10: every response — HTML, API and images — gets baseline anti-embedding
// and sniffing protection. `frame-ancestors 'none'` deliberately does not
// touch script/style directives, so Next.js hydration and the reader stay
// untouched; stricter CSP would need its own verified rollout. HSTS is a
// deployment concern (the HTTPS terminator's policy), not an app default.
const securityHeaders = [
  { key: "x-content-type-options", value: "nosniff" },
  { key: "x-frame-options", value: "DENY" },
  { key: "content-security-policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Local mode binds to the loopback host, and the runbooks hand out
  // http://127.0.0.1:<port>. Without this, `next dev` rejects the static
  // chunks for that origin and the client never hydrates.
  allowedDevOrigins: ["127.0.0.1", "localhost", "[::1]"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
