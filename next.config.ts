import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@node-rs/argon2"],
  poweredByHeader: false,
  // Separate build output lets e2e tests run alongside the dev server.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  outputFileTracingRoot: import.meta.dirname,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
