import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Local mode binds to the loopback host, and the runbooks hand out
  // http://127.0.0.1:<port>. Without this, `next dev` rejects the static
  // chunks for that origin and the client never hydrates.
  allowedDevOrigins: ["127.0.0.1", "localhost", "[::1]"],
};

export default nextConfig;
