import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @mullion/schemas ships TypeScript source with NodeNext-style ".js"
  // import specifiers — transpiling it lets the bundler apply TS extension
  // substitution instead of literally resolving the .js paths.
  transpilePackages: ["@mullion/schemas"],
};

export default nextConfig;
