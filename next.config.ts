import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home directory makes Next infer the wrong
  // workspace root, which breaks output file tracing on deploy.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
