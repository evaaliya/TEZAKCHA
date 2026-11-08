import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Loads src/instrumentation.ts to validate Solana env on boot.
};
export default nextConfig;
