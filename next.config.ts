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
};

export default nextConfig;
