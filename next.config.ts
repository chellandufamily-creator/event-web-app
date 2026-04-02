import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Prefer project root when another lockfile exists higher in the tree (e.g. user home).
  turbopack: {
    root: projectRoot,
  },
  serverExternalPackages: ["googleapis"],
};

export default nextConfig;
