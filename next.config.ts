import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
      // Several wasm codecs ship emscripten/wasm-bindgen glue with a dead-at-runtime
      // `new URL('<codec>.wasm', import.meta.url)` branch — we always load via
      // locateFile / an explicit wasm URL from /wasm/ instead. Webpack still
      // parses that `new URL` as an asset reference and emits the wasm under
      // _next/static/media/ (dead duplicates: @jsquash ~1 MB, @hyzyla/pdfium ~4 MB).
      // Disabling URL-asset parsing only inside those vendor modules stops the
      // emission without touching the runtime /wasm fetch.
      config.module.rules.push({
        include: /node_modules\/(?:@jsquash\/|@hyzyla\/pdfium\/)/,
        parser: { url: false },
      });
    }
    return config;
  },
};

export default nextConfig;
