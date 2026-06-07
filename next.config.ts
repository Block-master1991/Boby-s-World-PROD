
import withBundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';
import { GLOBAL_HEADERS } from './src/lib/config/headers';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  serverExternalPackages: ['firebase-admin', 'pino'],
  headers() {
    return GLOBAL_HEADERS;
  },

  // Performance optimizations for webpack
  webpack: (config, { isServer, dev }) => {
    // Add a rule to handle JSON files properly
    config.module.rules.push({
      test: /\.json$/,
      use: 'json-loader',
      type: 'javascript/auto',
    });

    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'pino': 'pino/browser',
        'pino-pretty': 'pino-pretty/lib/browser',
        'sonic-boom': false,
        'thread-stream': false,
        'fastbench': false,
        'pino-elasticsearch': false,
        'tap': false,
        'tape': false,
        'desm': false,
        'why-is-node-running': false,
      };
    }

    config.module.rules.push({
      test: /\.(glsl|vs|fs|vert|frag)$/,
      use: ['raw-loader'],
    });

    // --- Web Worker support for Next.js + Webpack 5 ---
    // Fix: Webpack 5 wraps chunks in `(self, ...)` by default, but Web Workers
    // may not have `self` as the global object during initialisation in some
    // Next.js dev-server configurations.  Setting `globalObject` to `self`
    // ensures the generated worker chunk can resolve its runtime.
    if (!isServer) {
      config.output = {
        ...config.output,
        globalObject: 'self',
      };
    }

    // Add performance hints - Increased for game bundles with Three.js
    if (!isServer) {
        config.performance = {
          hints: dev ? false : 'warning',
          maxEntrypointSize: 1024000, // 1MB - games with Three.js need more
          maxAssetSize: 1024000, // 1MB
        };
    }

    return config;
  },
};

export default process.env['ANALYZE'] === 'true' ? withBundleAnalyzer({
  enabled: true,
  openAnalyzer: false,
})(nextConfig) : nextConfig;
