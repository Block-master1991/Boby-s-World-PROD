
import type {NextConfig} from 'next';

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
