import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
      // @jsquash's emscripten/wasm-bindgen glue contains a dead-at-runtime
      // `new URL('<codec>.wasm', import.meta.url)` branch — we always load via
      // locateFile from /wasm/ instead. Webpack still parses that `new URL` as
      // an asset reference and emits the wasm under _next/static/media/ (~1 MB
      // of unused duplicates). Disabling URL-asset parsing only inside @jsquash
      // modules stops the emission without touching the runtime /wasm fetch.
      config.module.rules.push({
        include: /node_modules\/@jsquash\//,
        parser: { url: false },
      });
    }
    return config;
  },
};

export default nextConfig;
