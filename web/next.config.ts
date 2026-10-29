import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / heavy server-only packages must not be bundled
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "pg"],
};

export default nextConfig;
