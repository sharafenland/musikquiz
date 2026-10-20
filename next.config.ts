import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["postgres"],
  experimental: {
    // Der Dev-MCP-Server schreibt Browser-Logs nach .next/dev/logs – der Watcher reagiert
    // darauf mit einem Rebuild, der Browser lädt neu, loggt wieder … → Endlos-Reload.
    mcpServer: false,
  },
};

export default nextConfig;
