
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
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
  async headers() {
    return [
      {
        // Cache game textures and models for long term
        source: '/textures/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable', // 1 year cache
          },
        ],
      },
      {
        source: '/models/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable', // 1 year cache
          },
        ],
      },
      {
        // Cache libs for long term (WebGL, Draco, etc.)
        source: '/libs/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable', // 1 year cache
          },
        ],
      },
      {
        // Cache audio files
        source: '/audio/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable', // 1 year cache
          },
        ],
      },
    ];
  },

  // Only add this in development mode if NEXT_PUBLIC_DEV_ORIGIN is set
  webpack: (config, { isServer }) => {
    // Add a rule to handle JSON files properly
    config.module.rules.push({
      test: /\.json$/,
      use: 'json-loader',
      type: 'javascript/auto',
    });

    const pinoAliases = !isServer ? {
      'pino': 'pino/browser',
      'pino-pretty': 'pino-pretty/lib/browser',
      'sonic-boom': false,
      'thread-stream': false,
    } : {};

    config.resolve.alias = {
      ...config.resolve.alias,
      ...pinoAliases,
      'fastbench': false,
      'pino-elasticsearch': false,
      'tap': false,
      'tape': false,
      'desm': false,
      'why-is-node-running': false,
    };

    config.module.rules.push({
      test: /\.(glsl|vs|fs|vert|frag)$/,
      use: ['raw-loader'],
    });

    return config;
  },
};

export default nextConfig;
