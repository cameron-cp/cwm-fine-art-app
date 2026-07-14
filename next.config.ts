import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack + tracing to this project — there's a stray package.json in
  // $HOME that would otherwise be inferred as the workspace root and break
  // route resolution and PostCSS resolution of `tailwindcss`.
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingRoot: path.resolve(__dirname),
  // Belt-and-suspenders noindex for the public collector surface (the room page
  // also sets robots metadata). A viewing room is private per-recipient content
  // and must never be indexed even if a token leaks into a crawler.
  async headers() {
    return [
      {
        source: "/room/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
